import asyncio
from concurrent.futures import ThreadPoolExecutor

import httpx
import pytest
from fastapi.testclient import TestClient

from server.agent import Runner, make_mcp
from server.api import create_app
from server.domain import Problem
from server.engine import Engine
from server.security import Access, RequestLimits, ResourceBoundary, UsageBudget

HEADERS = {"X-Rehearsal-Request": "1"}
TOKEN = "test-operator-token-with-at-least-32-characters"


@pytest.fixture
def secured(tmp_path, monkeypatch):
    monkeypatch.setenv("REHEARSAL_OPERATOR_TOKEN", TOKEN)
    monkeypatch.setenv("REHEARSAL_PROVIDER", "backboard")
    monkeypatch.setenv("BACKBOARD_API_KEY", "test-server-provider-key")
    requests = []

    def handler(request):
        requests.append(request)
        return httpx.Response(200, json=[])

    engine = Engine(tmp_path)
    app = create_app(engine, lambda e, m: Runner(e, m, httpx.MockTransport(handler)))
    with TestClient(app) as client:
        client.post("/api/session", json={"person": "nia"}, headers=HEADERS)
        yield client, app, requests


def unlock(client):
    return client.post("/api/operator/login", json={"token": TOKEN}, headers=HEADERS)


def test_demo_identity_cannot_use_or_replace_server_key(secured):
    client, app, requests = secured
    assert client.post("/api/runs", json={"mode": "live"}, headers=HEADERS).status_code == 403
    assert client.post("/api/connections/backboard", json={"api_key": "test-other-key", "model": "test"}, headers=HEADERS).status_code == 403
    assert requests == []
    assert app.state.runner.backboard.key == "test-server-provider-key"
    assert app.state.engine.journal.all("run") == []


def test_live_approval_requires_operator_even_with_demo_owner(secured):
    client, app, requests = secured
    core = app.state.engine
    run = core.create_run("live")
    for repair in ("rollback", "bypass", "cache"):
        core.tool(run["id"], "rehearse_repair", {"repair": repair})
    core.tool(run["id"], "recommend_repair", {"repair": "cache", "reason": "Tested."})
    run = core.get_run(run["id"])
    result = client.post(f"/api/runs/{run['id']}/approve", json={"digest": run["proposal"]["digest"]}, headers=HEADERS)
    assert result.status_code == 403
    assert core.service.read()["mutation_count"] == 0 and requests == []


def test_operator_cookie_and_logout(secured):
    client, app, requests = secured
    response = unlock(client)
    assert response.status_code == 200
    assert "HttpOnly" in response.headers["set-cookie"]
    assert "SameSite=strict" in response.headers["set-cookie"]
    assert TOKEN not in response.text + response.headers["set-cookie"]
    connected = client.post("/api/connections/backboard", json={"api_key": "test-new-provider-secret", "model": "test"}, headers=HEADERS)
    assert connected.status_code == 200 and len(requests) == 1
    assert "test-new-provider-secret" not in connected.text + client.get("/api/workspace").text
    assert client.get("/api/workspace").json()["access"]["operator"]
    client.post("/api/operator/logout", json={}, headers=HEADERS)
    assert not client.get("/api/workspace").json()["access"]["operator"]
    assert client.post("/api/runs", json={"mode": "live"}, headers=HEADERS).status_code == 403


def test_validation_never_echoes_secrets_and_responses_are_not_cached(secured):
    client, app, requests = secured
    for payload in [
        {"api_key": "SECRET", "model": "test"},
        {"api_key": "SECRET" * 100, "model": "test"},
        {"api_key": "test-private-secret", "model": "test", "extra": "ANOTHER-SECRET"},
    ]:
        result = client.post("/api/connections/backboard", json=payload, headers=HEADERS)
        assert result.status_code == 422
        assert "SECRET" not in result.text and "test-private-secret" not in result.text
        assert result.headers["cache-control"] == "no-store"
    malformed = client.post("/api/operator/login", content='{"token":"SECRET",BROKEN', headers={**HEADERS, "Content-Type": "application/json"})
    assert malformed.status_code == 422 and "SECRET" not in malformed.text
    assert requests == []


def test_login_rate_limit_cannot_be_bypassed_with_forwarded_header(secured):
    client, app, requests = secured
    for i in range(5):
        result = client.post("/api/operator/login", json={"token": "wrong-token-with-at-least-32-characters"},
                             headers={**HEADERS, "X-Forwarded-For": f"192.0.2.{i}"})
        assert result.status_code == 403
    limited = unlock(client)
    assert limited.status_code == 429 and int(limited.headers["retry-after"]) > 0
    assert not app.state.access.sessions and requests == []


def test_unicode_operator_input_is_rejected_without_server_error(secured):
    client, _, _ = secured
    response = client.post("/api/operator/login", json={"token": "🔒" * 32}, headers=HEADERS)
    assert response.status_code == 403


def test_oversize_request_is_rejected_before_validation(secured):
    client, app, requests = secured
    result = client.post("/api/connections/backboard", content=(b"x" * 9000 for _ in range(3)), headers=HEADERS)
    assert result.status_code == 413
    assert requests == []


def test_public_visitors_can_simulate_but_cannot_mutate_or_use_mcp(tmp_path, monkeypatch):
    monkeypatch.setenv("REHEARSAL_PUBLIC", "1")
    monkeypatch.setenv("REHEARSAL_OPERATOR_TOKEN", TOKEN)
    app = create_app(Engine(tmp_path))
    with TestClient(app, base_url="https://testserver") as client:
        selected = client.post("/api/session", json={"person": "nia"}, headers=HEADERS)
        assert "Secure" in selected.headers["set-cookie"]
        for path, body in [("/runs", {"mode": "guided"}), ("/runs", {"mode": "live"}), ("/reset", {}), ("/policy/propose", {"max_age": 600})]:
            assert client.post("/api" + path, json=body, headers=HEADERS).status_code == 403
        assert client.get("/mcp/").status_code == 403
        result = client.post("/api/simulations", json={"cache_max_age": 900, "cache_age": 720, "requires_provenance": True}, headers=HEADERS)
        assert result.status_code == 200 and result.json()["eligible"] == ["cache"]
        assert app.state.engine.journal.all("run") == []
        login = unlock(client)
        assert login.status_code == 200 and "Secure" in login.headers["set-cookie"]
        assert client.post("/api/reset", json={}, headers=HEADERS).status_code == 200


def test_provider_quota_is_atomic_and_survives_reset_and_restart(tmp_path, monkeypatch):
    monkeypatch.setenv("REHEARSAL_PROVIDER_REQUESTS_PER_DAY", "3")
    engine = Engine(tmp_path)
    budgets = [UsageBudget(engine.journal.path.with_name("usage.sqlite")) for _ in range(2)]

    def reserve(i):
        try:
            budgets[i % 2].consume("provider_request")
            return True
        except Problem as error:
            assert error.code == "usage_limit"
            return False

    with ThreadPoolExecutor(max_workers=8) as pool:
        assert sum(pool.map(reserve, range(8))) == 3
    engine.journal.clear()
    restarted = UsageBudget(engine.journal.path.with_name("usage.sqlite"))
    with pytest.raises(Problem, match="allowance"):
        restarted.consume("provider_request")
    assert restarted.status()["provider_requests_remaining"] == 0


def test_live_quotas_use_rolling_hour_and_day(tmp_path, monkeypatch):
    monkeypatch.setenv("REHEARSAL_LIVE_RUNS_PER_HOUR", "2")
    monkeypatch.setenv("REHEARSAL_LIVE_RUNS_PER_DAY", "3")
    now = [1800000000.0]
    monkeypatch.setattr("server.security.time.time", lambda: now[0])
    quota = UsageBudget(tmp_path / "usage.sqlite")
    quota.consume("live_run")
    quota.consume("live_run")
    with pytest.raises(Problem):
        quota.consume("live_run")
    now[0] += 3601
    quota.consume("live_run")
    with pytest.raises(Problem):
        quota.consume("live_run")
    now[0] += 86401
    quota.consume("live_run")


@pytest.mark.asyncio
async def test_simulation_capacity_is_held_until_response_finishes():
    from starlette.responses import JSONResponse
    finish = asyncio.Event()
    admitted = asyncio.Event()
    count = 0

    async def slow_app(scope, receive, send):
        nonlocal count
        count += 1
        if count == 2:
            admitted.set()
        await finish.wait()
        await JSONResponse({"done": True})(scope, receive, send)

    limits = RequestLimits()
    app = ResourceBoundary(slow_app, Access(), limits)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url="http://testserver") as client:
        first = asyncio.create_task(client.post("/api/simulations", json={}))
        second = asyncio.create_task(client.post("/api/simulations", json={}))
        try:
            await asyncio.wait_for(admitted.wait(), 2)
            rejected = await client.post("/api/simulations", json={})
            assert rejected.status_code == 429 and rejected.json()["code"] == "capacity_limit"
        finally:
            finish.set()
            results = await asyncio.gather(first, second)
        assert all(result.status_code == 200 for result in results)
        assert not limits.active


@pytest.mark.asyncio
async def test_guided_approval_never_writes_paid_memory(tmp_path, monkeypatch):
    monkeypatch.setenv("BACKBOARD_API_KEY", "test-configured-provider-key")
    engine = Engine(tmp_path)
    engine.start()
    requests = []
    runner = Runner(engine, make_mcp(engine), httpx.MockTransport(lambda r: requests.append(r)))
    try:
        run = await runner.launch("guided")
        await asyncio.gather(*list(runner.tasks))
        run = engine.get_run(run["id"])
        receipt = await asyncio.to_thread(engine.approve, run["id"], "nia", run["proposal"]["digest"])
        runner.remember(receipt)
        await asyncio.sleep(0)
        assert not runner.tasks and requests == []
        assert "memory_sync" not in engine.get_run(run["id"])
    finally:
        await runner.close()
        engine.graph.close()


@pytest.mark.asyncio
async def test_provider_request_budget_stops_before_network(tmp_path, monkeypatch):
    monkeypatch.setenv("REHEARSAL_PROVIDER_REQUESTS_PER_DAY", "1")
    runner = Runner(Engine(tmp_path), None)
    seen = []
    def handler(request):
        seen.append(request)
        return httpx.Response(200, json={})
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        await runner.backboard.request(http, "GET", "/assistants")
        with pytest.raises(Problem, match="allowance"):
            await runner.backboard.request(http, "POST", "/threads/messages")
    assert len(seen) == 1
