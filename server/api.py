import asyncio
import json
import os
import secrets
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse, FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .agent import Runner, make_mcp
from .domain import Problem
from .engine import Engine
from .workload import workload
from .simulation import simulate, sweep

load_dotenv(override=False)


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid")


class SessionInput(Input):
    person: Literal["nia", "mira", "owen", "reviewer"]


class RunInput(Input):
    mode: Literal["guided", "live"] = "guided"


class ApprovalInput(Input):
    digest: str = Field(min_length=64, max_length=64)


class PolicyInput(Input):
    max_age: int = Field(ge=0, le=86400, strict=True)


class ReviewInput(Input):
    accept: bool


class SimulationInput(Input):
    cache_max_age: int = Field(ge=0, le=86400, strict=True)
    requires_provenance: bool = Field(strict=True)
    cache_age: int = Field(ge=0, le=86400, strict=True)


class SweepInput(Input):
    cache_max_age: int = Field(ge=0, le=86400, strict=True)


class ConnectionInput(Input):
    api_key: str = Field(min_length=8, max_length=512)
    model: str = Field(min_length=1, max_length=150)
    llm_provider: Literal["anthropic", "openai", "google", "openrouter"] = "anthropic"


def create_app(engine=None, runner_factory=Runner):
    core = engine or Engine(Path(os.getenv("REHEARSAL_STATE_DIR", ".state")).resolve())
    mcp = make_mcp(core)
    runner = runner_factory(core, mcp)
    sessions = {}

    @asynccontextmanager
    async def lifespan(app):
        await asyncio.to_thread(core.start)
        async with mcp.session_manager.run():
            yield
        await runner.close()
        await asyncio.to_thread(core.graph.close)

    app = FastAPI(title="Rehearsal", version="0.2.0", lifespan=lifespan)
    app.state.engine, app.state.runner = core, runner
    app.add_middleware(
        TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost", "testserver"]
    )

    @app.middleware("http")
    async def boundaries(request, call_next):
        if request.method in {
            "POST",
            "PUT",
            "PATCH",
            "DELETE",
        } and request.url.path.startswith("/api/"):
            if request.headers.get("x-rehearsal-request") != "1":
                return JSONResponse(
                    {"message": "Use the Rehearsal interface to make changes."}, 403
                )
            origin = request.headers.get("origin")
            if origin and origin not in {
                "http://127.0.0.1:5180",
                "http://localhost:5180",
                "http://127.0.0.1:8780",
                "http://localhost:8780",
                f"http://127.0.0.1:{os.getenv('REHEARSAL_WEB_PORT', '5180')}",
                f"http://localhost:{os.getenv('REHEARSAL_WEB_PORT', '5180')}",
                str(request.base_url).rstrip("/"),
            }:
                return JSONResponse(
                    {"message": "This request came from an unrecognized origin."}, 403
                )
        return await call_next(request)

    @app.exception_handler(Problem)
    async def handle_problem(request, error):
        return JSONResponse(
            {"code": error.code, "message": error.message}, error.status
        )

    def person(request):
        session = sessions.get(request.cookies.get("rehearsal_session"))
        if not session or session[1] <= time.time():
            raise Problem(
                "session_required", "Choose a demo identity to continue.", 401
            )
        return session[0]

    @app.get("/api/health")
    def health():
        with core.lock:
            return {
                "status": "ok",
                "engine": "FalkorDB",
                "context_revision": core.graph.context()["revision"],
            }

    @app.get("/api/workspace")
    def workspace():
        return {**core.overview(), "provider": runner.configuration()}

    @app.get("/api/session")
    def session(request: Request):
        return {"person": person(request), "demo": True}

    @app.post("/api/session")
    def select_person(body: SessionInput, response: Response):
        expired = [
            token for token, (_, until) in sessions.items() if until <= time.time()
        ]
        for token in expired:
            sessions.pop(token, None)
        token = secrets.token_urlsafe(32)
        sessions[token] = (body.person, time.time() + 28800)
        response.set_cookie(
            "rehearsal_session", token, httponly=True, samesite="strict", max_age=28800
        )
        return {"person": body.person, "demo": True}

    @app.post("/api/runs")
    async def create_run(body: RunInput, request: Request):
        person(request)
        return await runner.launch(body.mode)

    @app.get("/api/runs/{id}")
    def run(id: str):
        return core.get_run(id)

    @app.post("/api/runs/{id}/approve")
    async def approve(id: str, body: ApprovalInput, request: Request):
        receipt = await asyncio.to_thread(core.approve, id, person(request), body.digest)
        runner.remember(receipt)
        return receipt

    @app.get("/api/runs/{id}/events")
    async def events(id: str, request: Request):
        await asyncio.to_thread(core.get_run, id)

        async def stream():
            previous = None
            heartbeat = 0
            while not await request.is_disconnected():
                current = await asyncio.to_thread(core.get_run, id)
                encoded = json.dumps(current, separators=(",", ":"))
                if encoded != previous:
                    yield f"data: {encoded}\n\n"
                    previous = encoded
                if current["status"] not in {"queued", "running"}:
                    break
                heartbeat += 1
                if heartbeat % 40 == 0:
                    yield ": heartbeat\n\n"
                await asyncio.sleep(0.25)

        return StreamingResponse(stream(), media_type="text/event-stream", headers={
            "Cache-Control": "no-cache", "X-Accel-Buffering": "no",
        })

    @app.post("/api/simulations")
    def simulation(body: SimulationInput, request: Request):
        person(request)
        return simulate(core, body.cache_max_age, body.requires_provenance, body.cache_age)

    @app.post("/api/simulations/sweep")
    def simulation_sweep(body: SweepInput, request: Request):
        person(request)
        return sweep(core, body.cache_max_age)

    @app.post("/api/connections/backboard")
    async def connect(body: ConnectionInput, request: Request):
        person(request)
        if runner.tasks:
            raise Problem("run_busy", "Wait for the current investigation to finish before changing connections.")
        await runner.backboard.connect(body.api_key, body.model, body.llm_provider)
        runner.provider = "backboard"
        return runner.configuration()

    @app.get("/api/runs/{id}/evidence")
    def evidence(id: str):
        return JSONResponse(
            core.get_run(id),
            headers={"Content-Disposition": f'attachment; filename="{id}.json"'},
        )

    @app.post("/api/policy/propose")
    def propose(body: PolicyInput, request: Request):
        person(request)
        return core.propose_policy(body.max_age)

    @app.post("/api/policy/{id}/review")
    def review(id: str, body: ReviewInput, request: Request):
        return core.review_policy(id, person(request), body.accept)

    @app.post("/api/reset")
    def reset(request: Request):
        person(request)
        if runner.tasks:
            raise Problem("run_busy", "Wait for the investigation and memory sync to finish before resetting.")
        core.reset()
        return {"status": "reset"}

    app.mount("/exports-service", workload(core.service))
    app.mount("/mcp", mcp.streamable_http_app())
    build = Path(__file__).resolve().parent.parent / "web" / "dist"
    if build.exists():
        app.mount("/assets", StaticFiles(directory=build / "assets"), name="assets")

        @app.get("/")
        def index():
            return FileResponse(build / "index.html")

        @app.get("/favicon.svg")
        def favicon():
            return FileResponse(build / "favicon.svg")

    return app


app = create_app()
