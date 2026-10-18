"""Optional, expiring invitation access for a temporary judge deployment."""

import hashlib
import hmac
import os
import secrets
import time

from fastapi import Request, Response
from pydantic import BaseModel, ConfigDict, Field
from starlette.responses import JSONResponse

from .domain import Problem

COOKIE = "rehearsal_demo"


class InviteInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    token: str = Field(min_length=1, max_length=200)


class DemoAccess:
    def __init__(self):
        self.key = os.getenv("REHEARSAL_DEMO_INVITE", "")
        self.expires = float(os.getenv("REHEARSAL_DEMO_EXPIRES_AT", "0"))
        self.temporary = os.getenv("REHEARSAL_TEMPORARY_DEMO") == "1"
        if self.key and (len(self.key) < 40 or not 0 < self.expires < 10**11):
            raise ValueError("A private demo needs a strong invitation and an explicit expiry timestamp.")

    def signature(self, value):
        return hmac.new(self.key.encode(), ("demo-cookie:" + value).encode(), hashlib.sha256).hexdigest()

    def authorized(self, cookie):
        if not self.key:
            return True
        try:
            expiry, signature = cookie.split(".", 1)
            return (time.time() < int(expiry) <= self.expires
                    and secrets.compare_digest(signature, self.signature(expiry)))
        except (ValueError, TypeError):
            return False

    def issue(self, supplied):
        if time.time() >= self.expires:
            raise Problem("demo_expired", "This temporary demo has ended.", 410)
        if not secrets.compare_digest(hashlib.sha256(supplied.encode()).digest(), hashlib.sha256(self.key.encode()).digest()):
            raise Problem("demo_invitation", "That invitation could not be verified. Open the link shared with you.", 403)
        expiry = str(int(min(time.time() + 7 * 86400, self.expires)))
        return expiry + "." + self.signature(expiry)


def install_demo(app, limits):
    demo = DemoAccess()
    app.state.demo = demo

    @app.get("/api/demo/status")
    def status(request: Request):
        return {"required": bool(demo.key), "authorized": demo.authorized(request.cookies.get(COOKIE, "")),
                "expired": bool(demo.key and time.time() >= demo.expires),
                "temporary": demo.temporary, "expires_at": demo.expires if demo.key else None}

    @app.post("/api/demo/access")
    def unlock(body: InviteInput, request: Request, response: Response):
        if not demo.key:
            return {"authorized": True}
        peer = request.client.host if request.client else "unknown"
        if limits.check(("demo-access", peer), 10, 300) or limits.check(("demo-access", "*"), 100, 300):
            raise Problem("demo_rate_limit", "Too many invitation attempts. Wait a few minutes before trying again.", 429)
        cookie = demo.issue(body.token)
        response.set_cookie(COOKIE, cookie, max_age=max(0, int(cookie.split(".")[0]) - int(time.time())),
                            httponly=True, secure=os.getenv("REHEARSAL_PUBLIC") == "1", samesite="lax", path="/")
        return {"authorized": True}

    @app.middleware("http")
    async def invitation(request, call_next):
        path = request.url.path
        protected = path.startswith(("/api/", "/exports-service", "/mcp"))
        exempt = path in {"/api/health", "/api/demo/status", "/api/demo/access"}
        if demo.key and protected and not exempt and not demo.authorized(request.cookies.get(COOKIE, "")):
            expired = time.time() >= demo.expires
            response = JSONResponse({"code": "demo_expired" if expired else "demo_invitation",
                                     "message": "This temporary demo has ended." if expired else "Open your judge invitation link to use this demo."},
                                    410 if expired else 403)
        else:
            response = await call_next(request)
        if demo.key:
            response.headers["X-Robots-Tag"] = "noindex, nofollow, noarchive"
        if path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response
