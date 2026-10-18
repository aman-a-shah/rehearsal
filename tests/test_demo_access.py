import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from server.demo import install_demo


@pytest.mark.parametrize("legacy_expiry", [None, "1", "9999999999", "invalid"])
def test_public_demo_opens_without_invitation_even_with_legacy_settings(monkeypatch, legacy_expiry):
    monkeypatch.setenv("REHEARSAL_TEMPORARY_DEMO", "1")
    if legacy_expiry is None:
        monkeypatch.delenv("REHEARSAL_DEMO_INVITE", raising=False)
        monkeypatch.delenv("REHEARSAL_DEMO_EXPIRES_AT", raising=False)
    else:
        monkeypatch.setenv("REHEARSAL_DEMO_INVITE", "a" * 48)
        monkeypatch.setenv("REHEARSAL_DEMO_EXPIRES_AT", legacy_expiry)
    app = FastAPI()
    install_demo(app)

    @app.get("/api/code/session")
    @app.get("/api/workspace")
    @app.get("/exports-service/report")
    @app.get("/mcp")
    def public():
        return {"ok": True}

    with TestClient(app, base_url="https://testserver") as client:
        for path in ("/api/code/session", "/api/workspace", "/exports-service/report", "/mcp"):
            response = client.get(path)
            assert response.status_code == 200
            assert response.json() == {"ok": True}
            assert response.headers["x-robots-tag"].startswith("noindex")
        status = client.get("/api/demo/status")
        assert status.json() == {"required": False, "authorized": True, "expired": False,
                                 "temporary": True, "expires_at": None}
        assert status.headers["cache-control"] == "no-store"
        # Cached clients can still complete their old invitation exchange.
        response = client.post("/api/demo/access", json={"token": "obsolete"})
        assert response.status_code == 200
        assert response.json() == {"authorized": True}
        assert "set-cookie" not in response.headers
