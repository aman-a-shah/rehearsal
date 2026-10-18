import asyncio
import base64
import hashlib
import os
import secrets
import time
import uuid
from urllib.parse import urlencode, urlparse

import httpx
from fastapi import APIRouter, Request, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, ConfigDict, Field

from ..domain import Problem
from .codegraph import CodeGraph
from .examples import EXAMPLES
from .snapshot import MAX_ARCHIVE, public_project, unpack_archive

COOKIE = "rehearsal_account"


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ImportInput(Input):
    repository: str = Field(min_length=3, max_length=250)
    ref: str = Field(default="", max_length=200)
    directory: str = Field(default="", max_length=300)


class RepairInput(Input):
    incident: str = Field(min_length=15, max_length=12000)
    setup_command: str = Field(default="", max_length=1500)
    test_command: str = Field(min_length=1, max_length=1500)
    allow_regression: bool = True


class PublishInput(Input):
    candidate_id: str = Field(pattern=r"^[12]$")
    digest: str = Field(min_length=64, max_length=64)


def install_routes(app, service):
    router = APIRouter(prefix="/api/code")
    public = os.getenv("REHEARSAL_PUBLIC") == "1"
    origin = (os.getenv("REHEARSAL_APP_ORIGIN") or os.getenv("REHEARSAL_PUBLIC_ORIGIN") or ("https://localhost" if public else "http://127.0.0.1:8780")).rstrip("/")
    parsed = urlparse(origin)
    if (not parsed.hostname or parsed.path or parsed.query or parsed.fragment or parsed.username or parsed.password
        or (public and parsed.scheme != "https") or (not public and parsed.scheme not in {"http", "https"})):
        raise ValueError("REHEARSAL_APP_ORIGIN must be an origin, using HTTPS in public mode.")
    client_id, client_secret = os.getenv("GITHUB_CLIENT_ID", ""), os.getenv("GITHUB_CLIENT_SECRET", "")
    callback = origin + "/api/code/auth/github/callback"

    def user(request):
        return service.store.user(request.cookies.get(COOKIE, ""))

    def peer(request):
        # Only the ASGI peer, rewritten by explicitly trusted proxies, is accepted.
        return hashlib.sha256((request.client.host if request.client else "unknown").encode()).hexdigest()

    def set_cookie(response, token):
        response.set_cookie(COOKIE, token, max_age=86400 * 7, httponly=True, secure=public, samesite="lax", path="/")

    def public_user(account):
        return {"login": account["login"], "github": bool(account.get("github_id")), "id": account["id"]}

    @router.get("/session")
    def session(request: Request):
        allowance = None
        try:
            stored_user = user(request)
            account = public_user(stored_user)
            allowance = service.store.allowance(stored_user, peer(request))
        except Problem:
            account = None
        return {"user": account, "allowance": allowance, "github_configured": bool(client_id and client_secret and service.store.cipher),
                "provider_available": service.provider.available(), "sandbox": service.runner.configuration(),
                "limits": {"files": 1800, "archive_mb": 12, "runtimes": ["Python", "Node.js / TypeScript"]},
                "examples": [{"id": k, "name": v["name"], "description": v["description"], "runtime": v["runtime"], "incident": v["incident"]} for k, v in EXAMPLES.items()]}

    @router.post("/auth/guest")
    def guest(request: Request, response: Response):
        try:
            return public_user(user(request))
        except Problem:
            pass
        service.store.reserve("guest", peer(request), 10)
        service.store.reserve("guest", "global", 200)
        id = "guest_" + uuid.uuid4().hex
        record = {"id": id, "user_id": id, "login": "Guest workspace", "created_at": time.time()}
        service.store.put("user", record)
        set_cookie(response, service.store.session(id))
        return public_user(record)

    @router.post("/auth/logout")
    def logout(request: Request, response: Response):
        service.store.logout(request.cookies.get(COOKIE, ""))
        response.delete_cookie(COOKIE, path="/", httponly=True, secure=public, samesite="lax")
        return {"signed_out": True}

    @router.get("/auth/github")
    def login(request: Request, private: bool = False):
        if not client_id or not client_secret or not service.store.cipher:
            raise Problem("github_configuration", "GitHub sign-in needs an OAuth application configured on the server. Public URL imports and ZIP uploads work in a guest workspace.", 503)
        service.store.reserve("oauth", peer(request), 12, 3600)
        verifier = secrets.token_urlsafe(64)
        try:
            previous = user(request)["id"]
        except Problem:
            previous = None
        state = service.store.oauth_start({"verifier": verifier, "previous": previous})
        challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
        url = "https://github.com/login/oauth/authorize?" + urlencode({"client_id": client_id, "redirect_uri": callback,
              "scope": "repo" if private else "public_repo", "state": state, "code_challenge": challenge, "code_challenge_method": "S256"})
        response = RedirectResponse(url, 303)
        response.set_cookie("rehearsal_oauth", state, max_age=600, secure=public, httponly=True, samesite="lax", path="/api/code/auth")
        return response

    @router.get("/auth/github/callback")
    async def complete_login(request: Request, code: str = "", state: str = ""):
        cookie = request.cookies.get("rehearsal_oauth", "")
        if not code or len(code) > 300 or not state or len(state) > 200 or not secrets.compare_digest(cookie, state):
            raise Problem("oauth_state", "GitHub sign-in could not be verified. Start again from Rehearsal.", 400)
        saved = service.store.oauth_consume(state)
        try:
            async with httpx.AsyncClient(timeout=20, transport=service.github.transport) as http:
                result = await http.post("https://github.com/login/oauth/access_token", headers={"Accept": "application/json"}, json={
                    "client_id": client_id, "client_secret": client_secret, "code": code, "redirect_uri": callback, "code_verifier": saved["verifier"]})
                token = result.json().get("access_token")
        except (httpx.HTTPError, ValueError) as error:
            raise Problem("oauth_exchange", "GitHub sign-in could not be completed. Please try again.", 502) from error
        if not isinstance(token, str) or not token:
            raise Problem("oauth_exchange", "GitHub did not authorize this sign-in. Please try again.", 401)
        identity = await service.github.request("GET", "/user", token)
        id = "github_" + str(identity["id"])
        account = {"id": id, "user_id": id, "github_id": identity["id"], "login": identity["login"], "github_token": service.store.encrypt(token)}
        service.store.put("user", account)
        # Preserve the workspace only when the same browser completed the OAuth flow.
        try:
            previous = user(request)
        except Problem:
            previous = None
        if previous and previous["id"] == saved.get("previous") and previous["id"].startswith("guest_"):
            with service.store.connect() as db:
                db.execute("UPDATE records SET user_id=?,payload=json_set(payload,'$.user_id',?) WHERE user_id=? AND kind IN ('project','run')", (id, id, previous["id"]))
            service.store.logout(request.cookies.get(COOKIE, ""))
        response = RedirectResponse(origin + "/#repositories", 303)
        set_cookie(response, service.store.session(id))
        response.delete_cookie("rehearsal_oauth", path="/api/code/auth", secure=public, httponly=True, samesite="lax")
        return response

    @router.get("/github/repositories")
    async def github_repositories(request: Request):
        account = user(request)
        if not account.get("github_token"):
            raise Problem("github_required", "Sign in with GitHub to list your repositories.", 401)
        service.store.reserve("github-list", account["id"], 40, 3600)
        return await service.github.repositories(service.store.decrypt(account["github_token"]))

    @router.get("/projects")
    def projects(request: Request):
        account = user(request)
        return [public_project(p) for p in service.store.all("project", account["id"])]

    @router.post("/projects/import")
    async def import_project(body: ImportInput, request: Request):
        account = user(request)
        service.store.reserve("import", peer(request), 20)
        service.store.reserve("import", "global", 100)
        token = service.store.decrypt(account["github_token"]) if account.get("github_token") else ""
        imported = await service.github.import_repository(body.repository, body.ref, token)
        return await service.save_project(account, imported, body.directory)

    @router.post("/projects/upload")
    async def upload(request: Request, name: str = "Uploaded project", directory: str = ""):
        account = user(request)
        if len(name) > 120 or len(directory) > 300:
            raise Problem("upload_name", "Use a shorter project name and directory.", 422)
        service.store.reserve("import", peer(request), 20)
        service.store.reserve("import", "global", 100)
        data = await request.body()
        if len(data) > MAX_ARCHIVE:
            raise Problem("archive_limit", "Upload a ZIP smaller than 12 MB.", 413)
        files, skipped = await asyncio.to_thread(unpack_archive, data)
        return await service.save_project(account, {"name": name, "source": "upload", "sha": None, "files": files, "skipped": skipped, "private": True}, directory)

    @router.post("/examples/{name}")
    async def example(name: str, request: Request):
        account = user(request)
        service.store.reserve("example", peer(request), 20)
        return await service.example(account, name)

    @router.get("/projects/{id}")
    def project(id: str, request: Request):
        return public_project(service.store.get("project", id, user(request)["id"]))

    @router.get("/projects/{id}/file")
    def file(id: str, path: str, request: Request):
        project = service.store.get("project", id, user(request)["id"])
        if path not in project["files"]:
            raise Problem("file_missing", "This file is not part of the imported snapshot.", 404)
        return {"path": path, "content": project["files"][path]}

    @router.delete("/projects/{id}")
    async def delete(id: str, request: Request):
        account = user(request)
        project = service.store.get("project", id, account["id"])
        if any(r["project_id"] == id and r["status"] in {"queued", "running"} for r in service.store.all("run", account["id"])):
            raise Problem("project_busy", "Stop the active rehearsal before deleting its repository.", 409)
        await asyncio.to_thread(CodeGraph(service.connector, project).delete)
        service.store.delete_project(id, account["id"])
        return {"deleted": True}

    @router.post("/projects/{id}/runs")
    async def launch(id: str, body: RepairInput, request: Request):
        if "\x00" in body.test_command or "\x00" in body.setup_command:
            raise Problem("invalid_command", "Commands cannot contain null bytes.", 422)
        return service.launch(user(request), peer(request), id, body.model_dump())

    @router.get("/runs")
    def runs(request: Request):
        return [service.public_run(r) for r in service.store.all("run", user(request)["id"])]

    @router.get("/runs/{id}")
    def run(id: str, request: Request):
        return service.public_run(service.store.get("run", id, user(request)["id"]))

    @router.post("/runs/{id}/cancel")
    async def cancel(id: str, request: Request):
        return service.cancel(user(request), id)

    @router.get("/runs/{id}/patch/{candidate_id}")
    def patch(id: str, candidate_id: str, request: Request):
        run = service.store.get("run", id, user(request)["id"])
        candidate = next((c for c in run["candidates"] if c["id"] == candidate_id), None)
        if not candidate or candidate.get("status") != "verified" or run["status"] != "review":
            raise Problem("unverified_patch", "A patch must pass repeat verification before export.", 409)
        return Response(candidate["patch"], media_type="text/x-diff", headers={"Content-Disposition": f'attachment; filename="rehearsal-{id[:8]}.patch"'})

    @router.post("/runs/{id}/publish")
    async def publish(id: str, body: PublishInput, request: Request):
        return await service.publish(user(request), id, body.candidate_id, body.digest)

    app.include_router(router)
