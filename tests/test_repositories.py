import asyncio
import copy
import io
import json
import shutil
import stat
import time
import uuid
import zipfile

import httpx
import pytest
from fastapi.testclient import TestClient

from server.domain import Problem
from server.engine import Engine
from server.graph import CompanyGraph
from server.repos.codegraph import CodeGraph, extract
from server.repos.examples import EXAMPLES
from server.repos.github import GitHub, repository_name
from server.repos.patches import apply_edits, regression_file, test_count as count_tests, test_passed as passed, unified_patch
from server.repos.service import RepositoryService
from server.repos.snapshot import detect_project, digest, editable, unpack_archive
from server.repos.store import Store
from server.repos.provider import normalize_proposal


def archive(files):
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as z:
        for path, content in files.items():
            z.writestr(path, content)
    return out.getvalue()


@pytest.mark.parametrize("path", ["../outside.py", "/absolute.py", "project/../../escape", "project/./file.py", "project\\file.py", "C:/file.py"])
def test_archive_paths_cannot_escape(path):
    with pytest.raises(Problem):
        unpack_archive(archive({path: "anything"}))


def test_archive_links_are_rejected():
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as z:
        info = zipfile.ZipInfo("project/link")
        info.create_system = 3
        info.external_attr = (stat.S_IFLNK | 0o777) << 16
        z.writestr(info, "/etc/passwd")
    with pytest.raises(Problem, match="links"):
        unpack_archive(out.getvalue())


def test_archive_filters_credentials_and_preserves_text():
    files, skipped = unpack_archive(archive({"repo/main.py": "print(1)\n", "repo/.env": "secret", "repo/.npmrc": "token", "repo/token.txt": "ghp_" + "x" * 36, "repo/image.png": b"\x00\xff"}))
    assert files == {"main.py": "print(1)\n"}
    assert set(skipped) == {".env", ".npmrc", "token.txt", "image.png"}


@pytest.mark.parametrize("url", ["http://github.com/a/b", "https://github.com.evil/a/b", "https://github.com/a/b?x=1", "https://user:pass@github.com/a/b", "https://github.com/a/b/tree/main", "../../repo", "a/..", "https://127.0.0.1/a/b", "https://github.com:invalid/a/b", "https://[github.com/a/b"])
def test_repository_url_is_fixed_to_github(url):
    with pytest.raises(Problem):
        repository_name(url)


def test_repository_name_normalizes_https():
    assert repository_name("https://github.com/owner/repository.git/") == "owner/repository"


def test_monorepo_configuration():
    config = detect_project({"apps/api/package.json": '{"scripts":{"test":"node --test"},"devDependencies":{"x":"1"}}', "apps/api/package-lock.json": "{}"}, "apps/api")
    assert config["setup_command"] == "npm ci --ignore-scripts"
    assert config["test_command"] == "npm test"


@pytest.mark.parametrize("manifest", ["[]", "null", '{"scripts":null}'])
def test_malformed_package_shape_reports_a_validation_error(manifest):
    with pytest.raises(Problem) as error:
        detect_project({"package.json": manifest})
    assert error.value.code == "invalid_manifest"


@pytest.mark.asyncio
async def test_github_and_zip_imports_share_bounded_concurrency():
    from server.security import Access, RequestLimits, ResourceBoundary
    release = asyncio.Event()
    entered = []
    responses = []
    async def app(scope, receive, send):
        entered.append(scope["path"])
        await release.wait()
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"{}"})
    boundary = ResourceBoundary(app, Access(), RequestLimits())
    async def call(path):
        async def receive(): return {"type": "http.request", "body": b"{}", "more_body": False}
        async def send(message):
            if message["type"] == "http.response.start": responses.append(message["status"])
        scope = {"type": "http", "method": "POST", "path": path, "headers": [], "client": ("127.0.0.1", 1)}
        await boundary(scope, receive, send)
    first = asyncio.create_task(call("/api/code/projects/import"))
    second = asyncio.create_task(call("/api/code/projects/upload"))
    for _ in range(20):
        if len(entered) == 2: break
        await asyncio.sleep(0)
    assert len(entered) == 2
    await call("/api/code/projects/import")
    assert responses == [429]
    release.set()
    await asyncio.gather(first, second)
    await call("/api/code/projects/import")
    assert responses == [429, 200, 200, 200]


def test_runtime_config_modules_are_editable_but_build_and_test_config_are_not():
    assert editable("timeout_config.py")
    assert editable("src/thread_lock.py")
    assert not editable("vite.config.ts")
    assert not editable("jest.config.js")
    assert not editable("tests/test_config.py")


def test_exact_edits_cannot_change_tests_or_unconnected_code():
    files = {"app.py": "return 1\n", "unrelated.py": "return 1\n", "tests/test_app.py": "assert 1\n"}
    for path in ("unrelated.py", "tests/test_app.py", "../app.py"):
        with pytest.raises(Problem):
            apply_edits(files, [{"path": path, "search": "1", "replace": "2"}], ["app.py"])
    assert files["app.py"] == "return 1\n"
    assert apply_edits(files, [{"path": "app.py", "search": "1", "replace": "2"}], ["app.py"]) == {"app.py": "return 2\n"}


def test_ambiguous_edits_and_regression_overwrite_rejected():
    with pytest.raises(Problem):
        apply_edits({"a.py": "x+x"}, [{"path": "a.py", "search": "x", "replace": "y"}], ["a.py"])
    with pytest.raises(Problem):
        regression_file({"tests/test_a.py": "original"}, {"path": "tests/test_a.py", "content": "replacement"}, "python", "")


def test_patch_preserves_missing_final_newlines():
    patch = unified_patch({"a.py": "a=1"}, {"a.py": "a=2"})
    assert patch.count("\\ No newline at end of file") == 2
    assert "diff --git a/a.py b/a.py" in patch


@pytest.mark.parametrize("output,count", [("Ran 7 tests in 0.1s\nOK", 7), ("# tests 5\n# pass 4", 5), ("ℹ tests 3\nℹ pass 3", 3), ("===== 1 failed, 6 passed in 0.1s =====", 7), ("Tests: 1 failed, 8 passed, 9 total", 9), (" Tests 2 passed (2)", 2), ("", None)])
def test_test_reports(output, count):
    assert count_tests({"output": output}) == count


def test_zero_exit_without_test_evidence_is_ineligible():
    assert not passed({"stage": "test", "exit_code": 0, "output": ""})
    assert not passed({"stage": "test", "exit_code": 0, "output": "Ran 1 test"}, minimum=6)


def test_full_file_model_response_still_uses_scope_and_exact_edit_validation():
    proposal = {"candidates": [{"path": "app.py", "content": "x=2", "description": "Fix the value"}]}
    result = normalize_proposal(proposal, {"app.py": "x=1"})
    assert apply_edits({"app.py": "x=1"}, result["candidates"][0]["edits"], ["app.py"]) == {"app.py": "x=2"}
    with pytest.raises(Problem):
        apply_edits({"app.py": "x=1"}, result["candidates"][0]["edits"], [])


def test_store_sessions_quota_restart_and_tenant_isolation(tmp_path):
    store = Store(tmp_path)
    store.put("user", {"id": "alice", "user_id": "alice", "login": "alice"})
    token = store.session("alice")
    assert store.user(token)["id"] == "alice"
    with pytest.raises(Problem):
        store.user("invented")
    store.put("project", {"id": "p1", "user_id": "alice", "files": {"secret.py": "private"}})
    with pytest.raises(Problem) as error:
        store.get("project", "p1", "bob")
    assert error.value.status == 404
    store.reserve("run", "alice", 1)
    restarted = Store(tmp_path)
    with pytest.raises(Problem) as error:
        restarted.reserve("run", "alice", 1)
    assert error.value.status == 429
    encrypted = store.encrypt("github-secret")
    assert "github-secret" not in encrypted
    assert restarted.decrypt(encrypted) == "github-secret"
    state = store.oauth_start({"verifier": "private"})
    assert restarted.oauth_consume(state) == {"verifier": "private"}
    with pytest.raises(Problem):
        restarted.oauth_consume(state)
    store.logout(token)
    with pytest.raises(Problem):
        restarted.user(token)


def test_quotas_roll_back_when_enqueue_is_rejected(tmp_path):
    store = Store(tmp_path)
    user = {"id": "u", "github_id": 1}
    base = {"user_id": "u", "status": "queued"}
    store.enqueue({**base, "id": "1"}, user, "peer")
    with pytest.raises(Problem):
        store.enqueue({**base, "id": "2"}, user, "peer")
    with store.connect() as db:
        assert db.execute("SELECT count(*) FROM repo_usage WHERE kind='run' AND identity='global'").fetchone()[0] == 1


def test_allowance_survives_restart_and_reports_when_guest_can_run(tmp_path):
    store = Store(tmp_path)
    user = {"id": "guest"}
    assert store.allowance(user, "peer") == {"remaining": 1, "available_after": None}
    store.enqueue({"id": "run", "user_id": "guest", "status": "queued"}, user, "peer")
    allowance = Store(tmp_path).allowance(user, "peer")
    assert allowance["remaining"] == 0
    assert time.time() + 86300 < allowance["available_after"] < time.time() + 86500


@pytest.mark.asyncio
async def test_sandbox_identity_rejects_redirects_and_scope_changes_and_caches_only_live_tokens(monkeypatch):
    import base64
    from server.repos.sandbox_identity import SandboxIdentity
    monkeypatch.setenv("REHEARSAL_APP_ORIGIN", "https://rehearsal.example")
    monkeypatch.setenv("REHEARSAL_SANDBOX_BROKER_SECRET", "s" * 64)
    monkeypatch.setenv("VERCEL_PROJECT_ID", "project")
    monkeypatch.setenv("VERCEL_TEAM_ID", "team")
    state = {"calls": 0, "project": "project", "exp": time.time() + 7200, "redirect": False}
    async def handle(request):
        assert request.url == "https://rehearsal.example/internal/sandbox-identity"
        assert request.headers["authorization"] == "Bearer " + "s" * 64
        state["calls"] += 1
        if state["redirect"]:
            return httpx.Response(302, headers={"location": "https://other.example"})
        payload = base64.urlsafe_b64encode(json.dumps({"exp": state["exp"]}).encode()).decode().rstrip("=")
        return httpx.Response(200, json={"token": "header." + payload + ".signature", "project_id": state["project"], "team_id": "team"})
    transport = httpx.MockTransport(handle)
    identity = SandboxIdentity(transport)
    assert (await identity()).project_id == "project"
    assert (await identity()).team_id == "team"
    assert state["calls"] == 1
    state["project"] = "other"
    with pytest.raises(ValueError, match="another project"):
        await SandboxIdentity(transport)()
    state.update(project="project", exp=time.time() - 1)
    with pytest.raises(ValueError, match="expired"):
        await SandboxIdentity(transport)()
    state["redirect"] = True
    with pytest.raises(httpx.HTTPStatusError):
        await SandboxIdentity(transport)()


@pytest.mark.asyncio
async def test_github_import_pins_commit_and_does_not_leak_auth_on_redirect():
    seen = []
    sha = "a" * 40
    async def handle(request):
        seen.append(request)
        if request.url.path == "/repos/owner/repo":
            return httpx.Response(200, json={"default_branch": "main", "size": 1, "private": False})
        if request.url.path == "/repos/owner/repo/commits/main":
            return httpx.Response(200, json={"sha": sha})
        if request.url.host == "api.github.com" and request.url.path.endswith("/zipball/" + sha):
            return httpx.Response(302, headers={"location": "https://codeload.github.com/owner/repo/zip/" + sha})
        if request.url.host == "codeload.github.com":
            assert "authorization" not in request.headers
            return httpx.Response(200, content=archive({"repo/main.py": "print(1)"}))
        raise AssertionError(request.url)
    result = await GitHub(httpx.MockTransport(handle)).import_repository("owner/repo", token="secret")
    assert result["sha"] == sha
    assert result["files"] == {"main.py": "print(1)"}
    assert seen[-1].url.path.endswith(sha)


@pytest.mark.asyncio
async def test_github_import_rejects_arbitrary_redirect():
    async def handle(request):
        if request.url.path == "/repos/owner/repo":
            return httpx.Response(200, json={"default_branch": "main"})
        if "/commits/" in request.url.path:
            return httpx.Response(200, json={"sha": "a" * 40})
        return httpx.Response(302, headers={"location": "http://169.254.169.254/latest/meta-data"})
    with pytest.raises(Problem) as error:
        await GitHub(httpx.MockTransport(handle)).import_repository("owner/repo")
    assert error.value.code == "archive_redirect"


@pytest.mark.asyncio
async def test_publication_stale_head_prevents_any_write():
    requests = []
    async def handle(request):
        requests.append(request.method)
        return httpx.Response(200, json={"sha": "b" * 40})
    project = {"repository": "owner/repo", "branch": "main", "sha": "a" * 40}
    with pytest.raises(Problem) as error:
        await GitHub(httpx.MockTransport(handle)).publish(project, {}, {}, "token")
    assert error.value.code == "stale_head"
    assert requests == ["GET"]


@pytest.fixture
def connector(tmp_path):
    graph = CompanyGraph(tmp_path / "graph")
    yield graph
    graph.close()


def test_graph_is_real_and_isolated_per_snapshot(connector):
    files = EXAMPLES["python-pricing"]["files"]
    project = {"id": uuid.uuid4().hex, "digest": digest(files), "files": files}
    graph = CodeGraph(connector, project)
    graph.build(extract(files))
    context = graph.context("pricing.py rounds too early", "tests/test_pricing.py AssertionError")
    assert "pricing.py" in context["editable"]
    assert "tests/test_checkout.py" in context["affected_tests"]
    assert {o["name"] for o in context["owners"]} == {"@payments", "@checkout"}
    assert any("IMPORTS*0..8" in q["query"] for q in context["queries"])
    other = CodeGraph(connector, {**project, "id": uuid.uuid4().hex})
    with pytest.raises(Problem):
        other.validate()
    graph.delete()


def test_graph_mutations_are_durable_before_shutdown(tmp_path, connector):
    files = EXAMPLES["python-pricing"]["files"]
    project = {"id": uuid.uuid4().hex, "digest": digest(files), "files": files}
    graph = CodeGraph(connector, project)
    for stage in ("import", "record", "delete"):
        if stage == "import":
            graph.build(extract(files))
        elif stage == "record":
            graph.record({"id": "run", "incident": "rounding", "status": "review"},
                         [{"id": "1", "title": "Round subtotal", "passed": True, "changes": {"pricing.py": "replacement"}}])
        else:
            graph.delete()
        # Recover only the on-disk snapshot, without closing/saving the original
        # engine. This catches data that exists in memory but would be lost.
        directory = tmp_path / ("recovered-" + stage)
        directory.mkdir()
        shutil.copyfile(connector.directory / "company.rdb", directory / "company.rdb")
        recovered = CompanyGraph(directory)
        try:
            restored = CodeGraph(recovered, project)
            if stage == "delete":
                with pytest.raises(Problem):
                    restored.validate()
            else:
                restored.validate()
                assert restored.query("MATCH (a:RepoFile)-[:IMPORTS]->(b:RepoFile) RETURN count(b)")[0][0] > 0
                if stage == "record":
                    assert restored.query("MATCH (:RepairRun)-[:TESTED]->(c:RepairCandidate)-[:CHANGES]->(f:RepoFile) RETURN c.passed,f.path") == [[True, "pricing.py"]]
        finally:
            recovered.close()


class FakeRunner:
    def __init__(self, outcomes):
        self.outcomes, self.snapshots = list(outcomes), []
    def configuration(self):
        return {"available": True, "provider": "test", "description": "test runner"}
    async def run(self, files, config):
        self.snapshots.append(copy.deepcopy(files))
        return self.outcomes.pop(0)


def result(ok, count=6):
    return {"stage": "test", "exit_code": 0 if ok else 1, "output": f"Ran {count} tests\n" + ("OK" if ok else "FAILED\nAssertionError"), "timed_out": False, "duration_ms": 1, "provider": "test"}


class FakeProvider:
    def __init__(self, bad=False):
        self.bad = bad
    def available(self):
        return True
    async def generate(self, run, context, baseline, regression=False):
        if regression:
            return {"path": "tests/test_regression.py", "content": "assert False\n", "reason": "Regression"}, {}
        edit = {"path": "tests/test_pricing.py" if self.bad else "pricing.py", "search": "return discounted_unit * quantity", "replace": "return (price * quantity * (1 - rate)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)"}
        return {"diagnosis": "Early rounding.", "candidates": [{"title": "Round the subtotal", "reason": "Preserve precision.", "edits": [edit]}]}, {}


@pytest.mark.asyncio
async def test_service_runs_baseline_patch_and_fresh_repeat_without_mutating_source(tmp_path, connector):
    runner = FakeRunner([result(False), result(True), result(True)])
    service = RepositoryService(tmp_path / "data", connector, runner=runner, provider=FakeProvider())
    user = {"id": "u", "github_id": 1}
    project = await service.example(user, "python-pricing")
    run = service.launch(user, "ip", project["id"], {"incident": "pricing.py rounds too early", "test_command": project["test_command"], "setup_command": "", "allow_regression": True})
    await service.execute(service.store.get("run", run["id"]))
    saved = service.store.get("run", run["id"])
    assert saved["status"] == "review", saved
    assert len(runner.snapshots) == 3
    assert runner.snapshots[0]["pricing.py"] != runner.snapshots[1]["pricing.py"]
    assert runner.snapshots[1] == runner.snapshots[2]
    assert service.store.get("project", project["id"])["files"] == runner.snapshots[0]
    candidate = saved["candidates"][0]
    with pytest.raises(Problem):
        service.reviewed(user, run["id"], "1", "x" * 64)
    assert service.reviewed(user, run["id"], "1", candidate["review_digest"])[2]["status"] == "verified"


@pytest.mark.asyncio
@pytest.mark.parametrize("outcomes,regression,expected", [([result(False), result(True), result(False)], True, "blocked"), ([result(False), result(True, 1)], True, "blocked"), ([result(True)], False, "blocked"), ([result(True), result(True)], True, "blocked")])
async def test_service_abstains_on_flakes_test_count_drop_and_unreproduced_bug(tmp_path, connector, outcomes, regression, expected):
    service = RepositoryService(tmp_path / "data", connector, runner=FakeRunner(outcomes), provider=FakeProvider())
    user = {"id": "u", "github_id": 1}
    project = await service.example(user, "python-pricing")
    run = service.launch(user, "ip", project["id"], {"incident": "pricing.py rounds too early", "test_command": project["test_command"], "setup_command": "", "allow_regression": regression})
    await service.execute(service.store.get("run", run["id"]))
    saved = service.store.get("run", run["id"])
    assert saved["status"] == expected, saved
    assert saved["recommended"] is None


def test_http_tenants_cannot_read_or_cancel_each_others_runs(tmp_path):
    from server.api import create_app
    app = create_app(Engine(tmp_path))
    headers = {"X-Rehearsal-Request": "1"}
    with TestClient(app) as alice:
        assert alice.post("/api/code/auth/guest", json={}, headers=headers).status_code == 200
        project = alice.post("/api/code/examples/python-pricing", json={}, headers=headers).json()
        alice_cookie = alice.cookies.get("rehearsal_account")
        alice.cookies.clear()
        assert alice.post("/api/code/auth/guest", json={}, headers=headers).status_code == 200
        assert alice.get("/api/code/projects").json() == []
        assert alice.get(f"/api/code/projects/{project['id']}").status_code == 404
        assert alice.get(f"/api/code/projects/{project['id']}/file?path=pricing.py").status_code == 404
        assert alice.delete(f"/api/code/projects/{project['id']}", headers=headers).status_code == 404
        alice.cookies.clear()
        alice.cookies.set("rehearsal_account", alice_cookie)
        assert alice.get(f"/api/code/projects/{project['id']}").status_code == 200
        assert "files" not in alice.get(f"/api/code/projects/{project['id']}").json()


def test_oauth_requires_matching_browser_cookie(tmp_path, monkeypatch):
    monkeypatch.setenv("GITHUB_CLIENT_ID", "client")
    monkeypatch.setenv("GITHUB_CLIENT_SECRET", "client-secret")
    from server.api import create_app
    app = create_app(Engine(tmp_path))
    with TestClient(app) as client:
        response = client.get("/api/code/auth/github", follow_redirects=False)
        assert response.status_code == 303
        assert "code_challenge=" in response.headers["location"]
        assert "client-secret" not in response.headers["location"]
        assert client.get("/api/code/auth/github/callback?code=x&state=wrong").status_code == 400


def test_oauth_complete_encrypts_token_rotates_session_and_migrates_guest(tmp_path, monkeypatch):
    from urllib.parse import parse_qs, urlparse
    monkeypatch.setenv("GITHUB_CLIENT_ID", "client")
    monkeypatch.setenv("GITHUB_CLIENT_SECRET", "client-secret")
    token = "test-github-token-never-in-response"
    async def handle(request):
        if request.url.host == "github.com":
            body = json.loads(request.content)
            assert body["code_verifier"] and body["redirect_uri"].endswith("/api/code/auth/github/callback")
            return httpx.Response(200, json={"access_token": token})
        assert request.headers["authorization"] == "Bearer " + token
        return httpx.Response(200, json={"id": 42, "login": "owner"})
    from server.api import create_app
    app = create_app(Engine(tmp_path))
    app.state.repositories.github = GitHub(httpx.MockTransport(handle))
    with TestClient(app) as client:
        client.post("/api/code/auth/guest", json={}, headers={"X-Rehearsal-Request": "1"})
        old = client.cookies.get("rehearsal_account")
        project = client.post("/api/code/examples/python-pricing", json={}, headers={"X-Rehearsal-Request": "1"}).json()
        login = client.get("/api/code/auth/github", follow_redirects=False)
        state = parse_qs(urlparse(login.headers["location"]).query)["state"][0]
        response = client.get("/api/code/auth/github/callback", params={"code": "code", "state": state}, follow_redirects=False)
        assert response.status_code == 303
        assert token not in response.text + str(response.headers)
        assert client.cookies.get("rehearsal_account") != old
        assert client.get("/api/code/session").json()["user"]["login"] == "owner"
        assert client.get(f"/api/code/projects/{project['id']}").status_code == 200
        stored = app.state.repositories.store.get("user", "github_42")
        assert token not in stored["github_token"]
        assert client.get("/api/code/auth/github/callback", params={"code": "code", "state": state}).status_code == 400


@pytest.mark.asyncio
async def test_vercel_adapter_uses_bounded_logs_and_removes_network_before_tests(monkeypatch):
    from types import SimpleNamespace
    from vercel import sandbox
    from server.repos.sandbox import SandboxRunner
    monkeypatch.setenv("REHEARSAL_SANDBOX", "vercel")
    monkeypatch.setenv("VERCEL_OIDC_TOKEN", "test-oidc")
    operations = []
    class Batch:
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        def write_text(self, path, content): operations.append(("file", path))
    class Files:
        async def mkdir(self, path, *, recursive): assert recursive
        def batch(self): return Batch()
    class Box:
        fs = Files()
        async def __aenter__(self): return self
        async def __aexit__(self, *args): operations.append(("destroy", True))
        async def run_process(self, command, args, *, cwd, stdout, stderr, kill_after):
            # Exercise the real SDK's stream contract even in the transport fake.
            from vercel.sandbox._internal.process_output import ProcessOutputRouter
            ProcessOutputRouter(stdout=stdout, stderr=stderr, capture_output=False)
            operations.append(("command", args[-1]))
            stdout.write("x" * 100000)
            stdout.write("\nRan 6 tests\nOK")
            assert len(stdout.tail) <= 24000
            return SimpleNamespace(returncode=0)
        async def update_network_policy(self, policy): operations.append(("network", policy.mode))
    def create(**kwargs):
        assert kwargs["execution_time_limit"] == 360
        assert kwargs["persistent"] is False
        assert kwargs["network_policy"].mode == "custom"
        assert set(kwargs["network_policy"].allow) == {"registry.npmjs.org", "pypi.org", "files.pythonhosted.org"}
        assert not any("KEY" in k or "TOKEN" in k for k in kwargs["env"])
        return Box()
    monkeypatch.setattr(sandbox, "create_sandbox", create)
    execution = await SandboxRunner().run({"app.py": "print(1)"}, {"directory": "", "setup_command": "setup", "test_command": "tests"})
    assert execution["exit_code"] == 0
    assert operations.index(("network", "deny-all")) < operations.index(("command", "tests"))
    assert operations[-1] == ("destroy", True)


@pytest.mark.asyncio
async def test_draft_pr_only_changes_reviewed_files_and_is_idempotent():
    state = {"published": False, "writes": []}
    sha = "a" * 40
    async def handle(request):
        path = request.url.path
        if request.method == "POST":
            body = json.loads(request.content)
            state["writes"].append((path, body))
            if path.endswith("/git/trees"):
                assert body["tree"] == [{"path": "app.py", "mode": "100644", "type": "blob", "content": "fixed"}]
                return httpx.Response(201, json={"sha": "tree"})
            if path.endswith("/git/commits"):
                assert body["parents"] == [sha]
                return httpx.Response(201, json={"sha": "commit"})
            if path.endswith("/git/refs"):
                assert body["ref"].startswith("refs/heads/rehearsal/")
                return httpx.Response(201, json={})
            if path.endswith("/pulls"):
                assert body["draft"] is True and body["base"] == "main"
                state["published"] = True
                return httpx.Response(201, json={"html_url": "https://github.com/owner/repo/pull/1", "number": 1})
        if "/commits/main" in path:
            return httpx.Response(200, json={"sha": sha, "commit": {"tree": {"sha": "base-tree"}}})
        if path == "/repos/owner/repo":
            return httpx.Response(200, json={"permissions": {"push": True}})
        if path.endswith("/pulls"):
            return httpx.Response(200, json=[{"html_url": "https://github.com/owner/repo/pull/1", "number": 1}] if state["published"] else [])
        if "/git/matching-refs/" in path:
            return httpx.Response(200, json=[])
        raise AssertionError((request.method, path))
    github = GitHub(httpx.MockTransport(handle))
    project = {"repository": "owner/repo", "branch": "main", "sha": sha}
    run = {"id": "run", "test_command": "pytest"}
    candidate = {"id": "1", "title": "Fix", "reason": "Reason", "changes": {"app.py": "fixed"}}
    first = await github.publish(project, run, candidate, "token")
    second = await github.publish(project, run, candidate, "token")
    assert first == second
    assert len(state["writes"]) == 4
