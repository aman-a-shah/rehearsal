import time

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from server.demo import COOKIE, install_demo
from server.domain import Problem
from server.security import RequestLimits
from starlette.responses import JSONResponse


@pytest.fixture
def demo(monkeypatch):
    monkeypatch.setenv("REHEARSAL_DEMO_INVITE", "a" * 48)
    monkeypatch.setenv("REHEARSAL_DEMO_EXPIRES_AT", str(int(time.time() + 86400)))
    monkeypatch.setenv("REHEARSAL_PUBLIC", "1")
    monkeypatch.setenv("REHEARSAL_TEMPORARY_DEMO", "1")
    app = FastAPI()
    install_demo(app, RequestLimits())

    @app.exception_handler(Problem)
    async def problem(request, error):
        return JSONResponse({"code": error.code, "message": error.message}, error.status)

    @app.get("/api/health")
    @app.get("/api/code/session")
    @app.get("/api/workspace")
    @app.get("/exports-service/report")
    def protected():
        return {"ok": True}

    return app


def test_invitation_protects_both_workflows_without_leaking_the_secret(demo):
    with TestClient(demo, base_url="https://testserver") as client:
        for path in ("/api/code/session", "/api/workspace", "/exports-service/report"):
            response = client.get(path)
            assert response.status_code == 403
            assert "a" * 48 not in response.text
            assert response.headers["x-robots-tag"].startswith("noindex")
        assert client.get("/api/health").status_code == 200
        status = client.get("/api/demo/status")
        assert status.json()["required"] and not status.json()["authorized"]
        assert status.headers["cache-control"] == "no-store"
        assert client.post("/api/demo/access", json={"token": "wrong"}).status_code == 403
        response = client.post("/api/demo/access", json={"token": "a" * 48})
        assert response.status_code == 200
        cookie = response.headers["set-cookie"]
        assert "Secure" in cookie and "HttpOnly" in cookie and "SameSite=lax" in cookie
        assert "a" * 48 not in cookie
        assert client.get("/api/code/session").status_code == 200
        # A fresh browser has no access merely because another judge unlocked it.
        client.cookies.clear()
        assert client.get("/api/code/session").status_code == 403


def test_forged_and_expired_invitations_are_rejected(demo):
    with TestClient(demo, base_url="https://testserver") as client:
        valid = demo.state.demo.issue("a" * 48)
        for value in ("a" * 48, "invalid", valid + "extra", "9999999999." + valid.split(".")[1]):
            assert client.get("/api/code/session", headers={"Cookie": COOKIE + "=" + value}).status_code == 403
        demo.state.demo.expires = time.time() - 1
        assert client.get("/api/code/session", headers={"Cookie": COOKIE + "=" + valid}).status_code == 410
        assert client.get("/api/demo/status").json()["expired"]
        assert client.post("/api/demo/access", json={"token": "a" * 48}).status_code == 410


def test_invitation_attempts_are_limited(demo):
    with TestClient(demo) as client:
        for _ in range(10):
            assert client.post("/api/demo/access", json={"token": "wrong"}).status_code == 403
        assert client.post("/api/demo/access", json={"token": "a" * 48}).status_code == 429


def test_regular_installations_need_no_invitation(monkeypatch):
    monkeypatch.delenv("REHEARSAL_DEMO_INVITE", raising=False)
    monkeypatch.delenv("REHEARSAL_DEMO_EXPIRES_AT", raising=False)
    app = FastAPI()
    install_demo(app, RequestLimits())
    with TestClient(app) as client:
        status = client.get("/api/demo/status").json()
        assert status["authorized"] and not status["required"] and not status["expired"]
