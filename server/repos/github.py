"""Fixed GitHub endpoints. Credentials remain on the API server, outside test VMs."""

import re
from urllib.parse import quote, urlparse

import httpx

from ..domain import Problem
from .snapshot import MAX_ARCHIVE, unpack_archive


def repository_name(value):
    value = value.strip().rstrip("/")
    if value.startswith("https://"):
        try:
            url = urlparse(value)
            if url.hostname != "github.com" or url.username or url.password or url.port or url.query or url.fragment:
                raise ValueError("Unsupported repository origin")
        except ValueError as error:
            raise Problem("repository_url", "Enter a github.com repository URL or owner/repository.", 422) from error
        value = url.path.strip("/")
    if value.endswith(".git"):
        value = value[:-4]
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9-]{0,38}/[A-Za-z0-9_.-]{1,100}", value) or value.split("/")[-1] in {".", ".."}:
        raise Problem("repository_url", "Use a repository URL such as https://github.com/owner/project. Choose its branch separately.", 422)
    return value


class GitHub:
    def __init__(self, transport=None):
        self.transport = transport

    def headers(self, token=""):
        return {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28",
                "User-Agent": "Rehearsal", **({"Authorization": "Bearer " + token} if token else {})}

    async def request(self, method, path, token="", **kwargs):
        try:
            async with httpx.AsyncClient(timeout=30, transport=self.transport, follow_redirects=False) as http:
                response = await http.request(method, "https://api.github.com" + path, headers=self.headers(token), **kwargs)
        except httpx.HTTPError as error:
            raise Problem("github_unavailable", "GitHub could not be reached. Try again shortly.", 503) from error
        if response.status_code >= 400:
            message = {401: "Reconnect GitHub; the authorization has expired.", 403: "GitHub denied this request. Check repository permissions or API limits.",
                       404: "The repository or branch was not found. Private repositories require GitHub authorization.",
                       422: "GitHub could not create this change. Check whether the branch or pull request already exists.",
                       429: "GitHub's API limit was reached. Try again later."}.get(response.status_code, "GitHub could not complete this request.")
            raise Problem("github_error", message, 401 if response.status_code == 401 else 502)
        try:
            return response.json()
        except ValueError as error:
            raise Problem("github_response", "GitHub returned an unreadable response.", 502) from error

    async def import_repository(self, name, ref="", token=""):
        name = repository_name(name)
        info = await self.request("GET", f"/repos/{name}", token)
        if info.get("size", 0) > 80000:
            raise Problem("repository_limit", "This repository is too large for the hosted rehearsal. Upload a smaller project directory as a ZIP.", 413)
        branch = ref.strip() or info["default_branch"]
        if len(branch) > 200 or any(ord(c) < 32 for c in branch):
            raise Problem("invalid_ref", "Choose a valid branch name or commit SHA.", 422)
        commit = await self.request("GET", f"/repos/{name}/commits/{quote(branch, safe='')}", token)
        sha = commit["sha"]
        if not re.fullmatch(r"[0-9a-f]{40}", sha):
            raise Problem("github_commit", "GitHub did not resolve an immutable commit.", 502)
        url = f"https://api.github.com/repos/{name}/zipball/{sha}"
        try:
            async with httpx.AsyncClient(timeout=60, transport=self.transport, follow_redirects=False) as http:
                for _ in range(3):
                    parsed = urlparse(url)
                    if parsed.scheme != "https" or parsed.hostname not in {"api.github.com", "codeload.github.com"} or parsed.port or parsed.username or parsed.password:
                        raise Problem("archive_redirect", "GitHub returned an unsupported archive location.", 502)
                    async with http.stream("GET", url, headers=self.headers(token) if parsed.hostname == "api.github.com" else {"User-Agent": "Rehearsal"}) as response:
                        if response.status_code in {301, 302, 303, 307, 308}:
                            url = response.headers.get("location", "")
                            continue
                        if response.status_code != 200:
                            raise Problem("archive_download", "Could not download this repository snapshot.", 502)
                        data = bytearray()
                        async for chunk in response.aiter_bytes(65536):
                            data.extend(chunk)
                            if len(data) > MAX_ARCHIVE:
                                raise Problem("archive_limit", "This repository exceeds the 12 MB archive limit.", 413)
                        files, skipped = unpack_archive(bytes(data))
                        return {"name": name, "repository": name, "branch": branch, "sha": sha,
                                "private": bool(info.get("private")), "can_push": bool(info.get("permissions", {}).get("push")),
                                "url": f"https://github.com/{name}", "files": files, "skipped": skipped, "source": "github"}
        except httpx.HTTPError as error:
            raise Problem("archive_download", "The repository download was interrupted. Try again.", 502) from error
        raise Problem("archive_redirect", "The repository download redirected too many times.", 502)

    async def repositories(self, token):
        rows = await self.request("GET", "/user/repos?sort=pushed&per_page=100&affiliation=owner,collaborator,organization_member", token)
        return [{"name": r["full_name"], "private": r["private"], "branch": r["default_branch"], "can_push": bool(r.get("permissions", {}).get("push"))} for r in rows]

    async def publish(self, project, run, candidate, token):
        name = project["repository"]
        branch = project["branch"]
        if re.fullmatch(r"[0-9a-fA-F]{40}", branch):
            raise Problem("branch_required", "This snapshot was imported by commit SHA. Download the patch, or import a branch to create a pull request.", 409)
        remote = await self.request("GET", f"/repos/{name}/commits/{quote(branch, safe='')}", token)
        if remote["sha"] != project["sha"]:
            raise Problem("stale_head", "The GitHub branch changed after this snapshot. Import the latest commit and rehearse again.", 409)
        info = await self.request("GET", f"/repos/{name}", token)
        if not info.get("permissions", {}).get("push"):
            raise Problem("github_write", "Your GitHub account cannot push to this repository. Download the patch instead.", 403)
        # Deterministic branch and marker recover safely after an interrupted response.
        head = "rehearsal/" + run["id"] + "-" + candidate["id"]
        prs = await self.request("GET", f"/repos/{name}/pulls", token, params={"state": "all", "head": name.split("/")[0] + ":" + head})
        if prs:
            return {"url": prs[0]["html_url"], "number": prs[0]["number"], "branch": head}
        tree = await self.request("POST", f"/repos/{name}/git/trees", token, json={
            "base_tree": remote["commit"]["tree"]["sha"],
            "tree": [{"path": p, "mode": "100644", "type": "blob", "content": c} for p, c in candidate["changes"].items()],
        })
        refs = await self.request("GET", f"/repos/{name}/git/matching-refs/heads/{quote(head, safe='')}", token)
        if refs:
            existing = next((r for r in refs if r["ref"] == "refs/heads/" + head), None)
            existing_commit = await self.request("GET", f"/repos/{name}/git/commits/{existing['object']['sha']}", token) if existing else None
            if not existing_commit or existing_commit["tree"]["sha"] != tree["sha"] or [p["sha"] for p in existing_commit["parents"]] != [project["sha"]]:
                raise Problem("branch_conflict", "The repair branch already contains different changes. Download the patch for manual review.", 409)
        else:
            commit = await self.request("POST", f"/repos/{name}/git/commits", token, json={"message": "Rehearsal: " + candidate["title"], "tree": tree["sha"], "parents": [project["sha"]]})
            await self.request("POST", f"/repos/{name}/git/refs", token, json={"ref": "refs/heads/" + head, "sha": commit["sha"]})
        latest = await self.request("GET", f"/repos/{name}/commits/{quote(branch, safe='')}", token)
        if latest["sha"] != project["sha"]:
            raise Problem("stale_head", "The base branch changed during publication. The repair branch was created, but a new rehearsal is required before a pull request.", 409)
        reproduction = ("The existing tests initially passed. A new regression test reproduced the reported bug on the original source; the expanded checks passed in two fresh sandboxes with this patch."
                        if run.get("regression") else "The original test command failed; the same command passed in two fresh sandboxes with this patch.")
        body = (f"{candidate['reason']}\n\n"
                f"Rehearsed against `{project['sha']}`. {reproduction}\n\n"
                f"Test command: `{run['test_command']}`\n\n"
                "Existing tests, dependency manifests, and CI configuration were not edited. Review the patch and run your normal CI before merging. Test success is evidence for the configured checks, not a guarantee of production correctness.\n\n"
                f"Rehearsal record: `{run['id']}` · candidate `{candidate['id']}`")
        pr = await self.request("POST", f"/repos/{name}/pulls", token, json={"title": "Rehearsal: " + candidate["title"], "body": body, "head": head, "base": branch, "draft": True})
        return {"url": pr["html_url"], "number": pr["number"], "branch": head}
