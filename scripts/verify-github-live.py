"""Opt-in cloud/GitHub check using disposable example repositories and a LOCAL API.

Seeds a local test identity from `gh` authorization. This verifies the repository,
runner, and publication integration; it does not substitute for an OAuth UI test.
Use --publish RUN_ID only after inspecting the saved patch and test evidence.
"""
import argparse
import asyncio
import json
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server.repos.examples import EXAMPLES
from server.repos.store import Store


async def main(args):
    if urlparse(args.url).hostname not in {"127.0.0.1", "localhost"}:
        raise SystemExit("Use a separate local verification API.")
    token = subprocess.run(["gh", "auth", "token"], check=True, text=True, capture_output=True).stdout.strip()
    identity = json.loads(subprocess.run(["gh", "api", "/user"], check=True, text=True, capture_output=True).stdout)
    store = Store(Path(args.state) / "repositories")
    uid = "github_" + str(identity["id"])
    user = {"id": uid, "user_id": uid, "github_id": identity["id"], "login": identity["login"], "github_token": store.encrypt(token)}
    store.put("user", user)
    session = store.session(uid)
    output = Path("artifacts/repositories")
    output.mkdir(parents=True, exist_ok=True)
    allowed = {identity["login"] + "/rehearsal-python-example": "python-pricing", identity["login"] + "/rehearsal-node-example": "node-pagination"}
    try:
        async with httpx.AsyncClient(base_url=args.url, cookies={"rehearsal_account": session}, headers={"X-Rehearsal-Request": "1"}, timeout=60) as http:
            if args.publish:
                run = store.get("run", args.publish, uid)
                project = store.get("project", run["project_id"], uid)
                if project.get("repository") not in allowed:
                    raise SystemExit("This script publishes only to your named Rehearsal example repositories.")
                selected = next(c for c in run["candidates"] if c["id"] == run["recommended"])
                body = {"candidate_id": selected["id"], "digest": selected["review_digest"]}
                response = await http.post(f"/api/code/runs/{run['id']}/publish", json=body)
                response.raise_for_status()
                pr = response.json()
                again = await http.post(f"/api/code/runs/{run['id']}/publish", json=body)
                again.raise_for_status()
                assert again.json() == pr, "Publication retry was not idempotent"
                print(json.dumps(pr, indent=2))
                return
            readiness = (await http.get("/api/code/session")).json()
            assert readiness["sandbox"]["provider"] == "vercel" and readiness["sandbox"]["available"]
            for repository, example_id in allowed.items():
                response = await http.post("/api/code/projects/import", json={"repository": repository})
                response.raise_for_status()
                project = response.json()
                response = await http.post(f"/api/code/projects/{project['id']}/runs", json={"incident": EXAMPLES[example_id]["incident"], "setup_command": project["setup_command"], "test_command": project["test_command"], "allow_regression": True})
                response.raise_for_status()
                run, last = response.json(), None
                deadline = time.monotonic() + 1250
                while time.monotonic() < deadline:
                    result = await http.get(f"/api/code/runs/{run['id']}")
                    result.raise_for_status()
                    run = result.json()
                    if run["stage"] != last:
                        print(repository, run["stage"], flush=True)
                        last = run["stage"]
                    if run["status"] not in {"running", "queued"}:
                        break
                    await asyncio.sleep(2)
                (output / (example_id + "-cloud.json")).write_text(json.dumps(run, indent=2))
                assert run["status"] == "review", run.get("message")
                selected = next(c for c in run["candidates"] if c["id"] == run["recommended"])
                assert run["baseline"]["exit_code"] == 1
                assert selected["trial"]["exit_code"] == selected["verification"]["exit_code"] == 0
                assert selected["trial"]["provider"] == selected["verification"]["provider"] == "vercel"
                assert selected["trial"]["test_count"] == selected["verification"]["test_count"] == run["baseline"]["test_count"]
                (output / (example_id + "-cloud.patch")).write_text(selected["patch"])
                print(json.dumps({"repository": repository, "run": run["id"], "sha": project["sha"], "tests": run["baseline"]["test_count"], "status": run["status"], "patch": selected["patch"]}), flush=True)
    finally:
        store.logout(session)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://127.0.0.1:8788")
    parser.add_argument("--state", default=".state-code-cloud-check")
    parser.add_argument("--live", action="store_true", required=True)
    parser.add_argument("--publish", metavar="RUN_ID")
    asyncio.run(main(parser.parse_args()))
