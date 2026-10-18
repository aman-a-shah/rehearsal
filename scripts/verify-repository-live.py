"""Opt-in paid integration check against a running LOCAL repository API."""
import argparse
import asyncio
import io
import json
import zipfile
from pathlib import Path
from urllib.parse import urlparse

import httpx


async def finish(http, project, incident, name):
    response = await http.post(f"/api/code/projects/{project['id']}/runs", json={"incident": incident, "setup_command": project["setup_command"], "test_command": project["test_command"], "allow_regression": True})
    response.raise_for_status()
    run = response.json()
    previous = None
    for _ in range(240):
        run = (await http.get(f"/api/code/runs/{run['id']}")).json()
        if run["stage"] != previous:
            print(name, run["stage"], flush=True)
            previous = run["stage"]
        if run["status"] not in {"running", "queued"}:
            break
        await asyncio.sleep(2)
    Path("artifacts/repositories").mkdir(parents=True, exist_ok=True)
    Path(f"artifacts/repositories/{name}.json").write_text(json.dumps(run, indent=2))
    assert run["status"] == "review", run.get("message")
    candidate = next(c for c in run["candidates"] if c["id"] == run["recommended"])
    assert candidate["trial"]["exit_code"] == candidate["verification"]["exit_code"] == 0
    return run


async def main(url, only_regression=False):
    if urlparse(url).hostname not in {"127.0.0.1", "localhost"}:
        raise SystemExit("Use a local verification server.")
    headers = {"X-Rehearsal-Request": "1"}
    if not only_regression:
        async with httpx.AsyncClient(base_url=url, headers=headers, timeout=60) as http:
            (await http.post("/api/code/auth/guest", json={})).raise_for_status()
            public = await http.post("/api/code/projects/import", json={"repository": "https://github.com/pallets/itsdangerous"})
            public.raise_for_status()
            imported = public.json()
            assert len(imported["sha"]) == 40 and imported["graph"]["edges"]
            print("Public GitHub import:", imported["repository"], imported["sha"], imported["file_count"], "files", flush=True)
            project = (await http.post("/api/code/examples/node-pagination", json={})).json()
            run = await finish(http, project, project["incident"], "node-live")
            assert run["baseline"]["exit_code"] == 1
            print("Node repair verified twice.", flush=True)
    files = {
        "timeout_config.py": "def timeout_seconds(value=None):\n    seconds = int(value or 30)\n    if seconds < 0:\n        raise ValueError('Timeout cannot be negative')\n    return seconds\n",
        "tests/test_timeout.py": "import unittest\nfrom timeout_config import timeout_seconds\n\nclass TimeoutTests(unittest.TestCase):\n    def test_default(self):\n        self.assertEqual(timeout_seconds(), 30)\n    def test_string(self):\n        self.assertEqual(timeout_seconds('12'), 12)\n    def test_empty_string(self):\n        self.assertEqual(timeout_seconds(''), 30)\n    def test_negative(self):\n        with self.assertRaises(ValueError):\n            timeout_seconds(-1)\n",
    }
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w") as zipped:
        for path, content in files.items():
            zipped.writestr("timeouts/" + path, content)
    async with httpx.AsyncClient(base_url=url, headers=headers, timeout=60) as http:
        (await http.post("/api/code/auth/guest", json={})).raise_for_status()
        uploaded = await http.post("/api/code/projects/upload?name=Timeout%20service", content=archive.getvalue(), headers={"Content-Type": "application/zip"})
        uploaded.raise_for_status()
        project = uploaded.json()
        run = await finish(http, project, "timeout_config.py incorrectly treats integer zero as a missing timeout. Passing 0 should return 0 to disable the timeout; None and the empty string should still use the 30-second default. Preserve rejection of negative values and parsing of numeric strings. Existing tests miss integer zero.", "regression-live")
        assert run["baseline"]["exit_code"] == 0
        assert run["reproduction"]["exit_code"] != 0
        assert run["regression"]["files"]
        print("ZIP import, generated failing regression, repaired tests, and independent repeat verified.", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://127.0.0.1:8786")
    parser.add_argument("--live", action="store_true", required=True, help="Allow paid model calls for two real repair runs.")
    parser.add_argument("--only-regression", action="store_true")
    args = parser.parse_args()
    asyncio.run(main(args.url, args.only_regression))
