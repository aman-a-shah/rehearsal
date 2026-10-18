import asyncio
import copy
import secrets
import time
import uuid

from ..domain import Problem
from .codegraph import CodeGraph, extract
from .examples import EXAMPLES
from .github import GitHub
from .patches import apply_edits, assertion_failure, regression_file, review_digest, test_count, test_passed, unified_patch
from .provider import RepairProvider
from .sandbox import SandboxRunner
from .snapshot import detect_project, digest, public_project
from .store import Store


class RepositoryService:
    def __init__(self, directory, connector, *, runner=None, provider=None, github=None):
        self.store = Store(directory)
        self.connector = connector
        self.runner = runner or SandboxRunner()
        self.provider = provider or RepairProvider(self.store)
        self.github = github or GitHub()
        self.worker = None
        self.active = {}
        self.publish_locks = {}
        self.wake = asyncio.Event()

    async def start(self):
        # Single API worker per durable volume. Never silently replay paid work after a crash.
        for run in self.store.all("run"):
            if run["status"] == "running":
                run.update(status="interrupted", message="The server restarted during this rehearsal. Start a fresh run; no changes were published.")
                self.store.put("run", run)
        self.worker = asyncio.create_task(self.work())

    async def close(self):
        if self.worker:
            self.worker.cancel()
            try:
                await self.worker
            except asyncio.CancelledError:
                pass

    async def work(self):
        while True:
            run = await asyncio.to_thread(self.store.claim_run)
            if run:
                self.active[run["id"]] = asyncio.create_task(self.execute(run))
                try:
                    await self.active[run["id"]]
                except asyncio.CancelledError:
                    if asyncio.current_task().cancelling():
                        raise
                finally:
                    self.active.pop(run["id"], None)
            else:
                self.wake.clear()
                try:
                    await asyncio.wait_for(self.wake.wait(), timeout=2)
                except TimeoutError:
                    pass

    def event(self, run, stage, message):
        run["stage"] = stage
        run["events"].append({"stage": stage, "message": message, "at": time.time()})
        self.store.put("run", run)

    async def save_project(self, user, imported, directory=""):
        if len(self.store.all("project", user["id"])) >= 8 or len(self.store.all("project")) >= 200:
            raise Problem("project_limit", "The repository limit has been reached. Delete an unused repository before importing another.", 429)
        config = detect_project(imported["files"], directory)
        project = {**imported, **config, "id": uuid.uuid4().hex, "user_id": user["id"], "created_at": time.time(),
                   "digest": digest(imported["files"]), "file_count": len(imported["files"])}
        data = await asyncio.to_thread(extract, project["files"])
        project["graph"] = data
        project["test_count"] = sum(n["kind"] == "test" for n in data["nodes"])
        graph = CodeGraph(self.connector, project)
        try:
            await asyncio.to_thread(graph.build, data)
            self.store.put("project", project)
        except BaseException:
            try:
                await asyncio.to_thread(graph.delete)
            except Exception:
                pass
            raise
        return public_project(project)

    async def example(self, user, name):
        if name not in EXAMPLES:
            raise Problem("example_missing", "That example is not available.", 404)
        example = copy.deepcopy(EXAMPLES[name])
        return await self.save_project(user, {**example, "source": "example", "sha": None, "skipped": [], "private": False})

    def launch(self, user, peer, project_id, inputs):
        project = self.store.get("project", project_id, user["id"])
        if not self.runner.configuration()["available"]:
            raise Problem("runner_unavailable", "The sandbox runner is not connected. Configure it before starting a repair.", 503)
        if not self.provider.available():
            raise Problem("provider_unavailable", "The repair model is not connected. Configure Backboard on the server.", 503)
        run = {"id": uuid.uuid4().hex, "user_id": user["id"], "project_id": project_id, "status": "queued", "stage": "queued",
               "incident": inputs["incident"], "runtime": project["runtime"], "directory": project["directory"],
               "test_command": inputs["test_command"], "setup_command": inputs["setup_command"], "allow_regression": inputs["allow_regression"],
               "created_at": time.time(), "events": [], "candidates": [], "usage": [], "snapshot": project["digest"], "sha": project.get("sha"), "recommended": None}
        self.store.enqueue(run, user, peer)
        self.wake.set()
        return self.public_run(run)

    async def trial(self, run, files):
        self.store.reserve("sandbox", "global", 72)
        result = await self.runner.run(files, run)
        result["test_count"] = test_count(result)
        return result

    async def execute(self, run):
        if self.store.get("run", run["id"])["status"] == "cancelled":
            return
        try:
            async with asyncio.timeout(1200):
                project = self.store.get("project", run["project_id"], run["user_id"])
                files = project["files"]
                if digest(files) != run["snapshot"]:
                    raise Problem("snapshot_changed", "The repository snapshot changed. Import it again.", 409)
                graph = CodeGraph(self.connector, project)
                await asyncio.to_thread(graph.validate)
                self.event(run, "baseline", "Running the configured checks on the original commit in a fresh sandbox.")
                baseline = await self.trial(run, files)
                run["baseline"] = baseline
                self.store.put("run", run)
                if baseline["stage"] != "test":
                    raise Problem("baseline_setup", "The original project could not finish setup or testing. Check the command and logs before requesting a repair.", 422)
                self.event(run, "graph", "Traversing imports, dependent tests, and code ownership in FalkorDB.")
                context = await asyncio.to_thread(graph.context, run["incident"], baseline["output"])
                run["context"] = {k: v for k, v in context.items() if k != "source"}
                regression = {}
                if test_passed(baseline):
                    if not run["allow_regression"]:
                        raise Problem("not_reproduced", "The original checks passed. Provide a failing test command or allow a new regression test.", 422)
                    self.event(run, "reproduction", "Existing checks passed. Writing a regression test for the reported behavior.")
                    proposed, usage = await self.provider.generate(run, context, baseline, regression=True)
                    run["usage"].append(usage)
                    regression = regression_file(files, proposed, run["runtime"], run["directory"])
                    run["regression"] = {"files": regression, "reason": str(proposed.get("reason", ""))[:2000]}
                    reproduced = await self.trial(run, {**files, **regression})
                    run["reproduction"] = reproduced
                    self.store.put("run", run)
                    if not assertion_failure(reproduced):
                        raise Problem("not_reproduced", "The new regression test did not reproduce an assertion failure with this test command. Review its logs or provide a failing test.", 422)
                    baseline = reproduced
                    context["source"].update(regression)
                if not assertion_failure(baseline):
                    raise Problem("not_reproduced", "The command failed without a recognizable test assertion. Fix setup or supply a test that reproduces the incident.", 422)
                if not test_count(baseline):
                    raise Problem("test_report", "The test command must report its test count. Supported reports include unittest, pytest, node:test, Jest, and Vitest.", 422)
                self.event(run, "generating", "The failure is reproduced. Generating source repairs from the graph-selected context.")
                proposal, usage = await self.provider.generate(run, context, baseline)
                run["usage"].append(usage)
                run["diagnosis"] = str(proposal.get("diagnosis", ""))[:4000]
                candidates = proposal.get("candidates")
                if not isinstance(candidates, list) or not 1 <= len(candidates) <= 2:
                    raise Problem("candidate_format", "The model did not return one or two bounded repair candidates.", 422)
                for index, raw in enumerate(candidates):
                    candidate = {"id": str(index + 1), "title": str(raw.get("title", "Proposed repair"))[:140],
                                 "reason": str(raw.get("reason", ""))[:4000], "passed": False, "status": "testing"}
                    run["candidates"].append(candidate)
                    try:
                        changes = apply_edits(files, raw.get("edits"), context["editable"])
                    except Problem as error:
                        candidate.update(status="rejected", message=error.message)
                        self.store.put("run", run)
                        continue
                    candidate["changes"] = {**changes, **regression}
                    candidate["patch"] = unified_patch(files, candidate["changes"])
                    self.event(run, "testing", f"Testing candidate {index + 1}: {candidate['title']}")
                    candidate["trial"] = await self.trial(run, {**files, **candidate["changes"]})
                    passed = test_passed(candidate["trial"], test_count(baseline))
                    candidate.update(passed=passed, status="passed" if passed else "failed")
                    if candidate["trial"].get("exit_code") == 0 and not passed:
                        candidate["message"] = "The command returned success but reported fewer tests than the original run. This candidate is ineligible."
                    self.store.put("run", run)
                eligible = [c for c in run["candidates"] if c["passed"]]
                # Prefer the smallest passing change; human review remains mandatory.
                eligible.sort(key=lambda c: (len(c["changes"]), sum(1 for l in c["patch"].splitlines() if l.startswith(("+", "-")))))
                for candidate in eligible:
                    self.event(run, "verifying", f"Repeating candidate {candidate['id']} in another fresh sandbox to check repeatability.")
                    candidate["verification"] = await self.trial(run, {**files, **candidate["changes"]})
                    candidate["passed"] = test_passed(candidate["verification"], test_count(baseline))
                    candidate["status"] = "verified" if candidate["passed"] else "unstable"
                    if candidate["passed"]:
                        candidate["review_digest"] = review_digest(project, run, candidate)
                        run["recommended"] = candidate["id"]
                        break
                run["status"] = "review" if run["recommended"] else "blocked"
                run["message"] = "A patch passed the configured checks twice. Review the diff and evidence before publishing." if run["recommended"] else "No candidate passed verification. Nothing was changed in your repository."
                await asyncio.to_thread(graph.record, run, run["candidates"])
                self.event(run, "complete", run["message"])
        except asyncio.CancelledError:
            run.update(status="cancelled", message="Rehearsal stopped. No patch was published.")
            self.event(run, "cancelled", run["message"])
            raise
        except Problem as error:
            run.update(status="blocked", message=error.message, code=error.code, recommended=None)
            self.event(run, "blocked", error.message)
        except TimeoutError:
            run.update(status="interrupted", message="The rehearsal reached its 20-minute time limit. No patch was published.", recommended=None)
            self.event(run, "interrupted", run["message"])
        except Exception:
            run.update(status="error", message="The rehearsal was interrupted by a server error. No patch was published.", recommended=None)
            self.event(run, "error", run["message"])
        finally:
            run["finished_at"] = time.time()
            self.store.put("run", run)

    @staticmethod
    def public_run(run):
        return {k: v for k, v in run.items() if k != "user_id"}

    def cancel(self, user, id):
        run = self.store.get("run", id, user["id"])
        if task := self.active.get(id):
            task.cancel()
        elif run["status"] in {"queued", "running"}:
            run.update(status="cancelled", message="Cancelled before execution.")
            self.store.put("run", run)
        return self.public_run(self.store.get("run", id, user["id"]))

    def reviewed(self, user, run_id, candidate_id, supplied):
        run = self.store.get("run", run_id, user["id"])
        project = self.store.get("project", run["project_id"], user["id"])
        candidate = next((c for c in run["candidates"] if c["id"] == candidate_id), None)
        if not candidate or run["status"] != "review" or candidate["status"] != "verified" or not candidate.get("passed"):
            raise Problem("unverified_patch", "Only a patch that passed repeat verification can be published.", 409)
        expected = review_digest(project, run, candidate)
        if not secrets.compare_digest(expected, supplied):
            raise Problem("review_changed", "The evidence changed. Reload and review the patch again.", 409)
        return project, run, candidate

    async def publish(self, user, run_id, candidate_id, supplied):
        lock = self.publish_locks.setdefault(run_id, asyncio.Lock())
        async with lock:
            project, run, candidate = self.reviewed(user, run_id, candidate_id, supplied)
            if not user.get("github_token") or project.get("source") != "github":
                raise Problem("github_required", "Sign in with GitHub and import a repository to open a pull request. You can download this patch instead.", 403)
            if candidate.get("pull_request"):
                return candidate["pull_request"]
            await asyncio.to_thread(CodeGraph(self.connector, project).validate)
            self.store.reserve("publish", user["id"], 10)
            result = await self.github.publish(project, run, candidate, self.store.decrypt(user["github_token"]))
            candidate["pull_request"] = result
            candidate["approved_by"] = user["login"]
            candidate["approved_at"] = time.time()
            self.store.put("run", run)
            return result
