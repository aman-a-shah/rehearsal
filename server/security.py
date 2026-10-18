"""Request limits, operator sessions, and durable provider quotas."""

import asyncio
import math
import os
import secrets
import sqlite3
import threading
import time
from collections import deque
from pathlib import Path

from starlette.responses import JSONResponse

from .domain import Problem


def positive_int(name, default):
    try:
        value = int(os.getenv(name, str(default)))
        return value if value > 0 else default
    except ValueError:
        return default


class UsageBudget:
    """Reserve quota before network I/O; reset and process restart cannot erase it."""

    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.runs_per_hour = positive_int("REHEARSAL_LIVE_RUNS_PER_HOUR", 3)
        self.runs_per_day = positive_int("REHEARSAL_LIVE_RUNS_PER_DAY", 6)
        self.requests_per_day = positive_int("REHEARSAL_PROVIDER_REQUESTS_PER_DAY", 60)
        with self.connect() as db:
            db.execute("CREATE TABLE IF NOT EXISTS usage (kind TEXT NOT NULL, at REAL NOT NULL)")
            db.execute("CREATE INDEX IF NOT EXISTS usage_window ON usage(kind,at)")

    def connect(self):
        return sqlite3.connect(self.path, timeout=10)

    def consume(self, kind):
        now = time.time()
        limits = ([(3600, self.runs_per_hour), (86400, self.runs_per_day)]
                  if kind == "live_run" else [(86400, self.requests_per_day)])
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            db.execute("DELETE FROM usage WHERE at<=?", (now - 86400,))
            for window, limit in limits:
                count = db.execute("SELECT count(*) FROM usage WHERE kind=? AND at>?",
                                   (kind, now - window)).fetchone()[0]
                if count >= limit:
                    raise Problem("usage_limit", "The workspace's live usage allowance is exhausted. Try the examples or return after the rolling quota resets.", 429)
            db.execute("INSERT INTO usage VALUES (?,?)", (kind, now))

    def status(self):
        with self.connect() as db:
            used = db.execute("SELECT count(*) FROM usage WHERE kind='provider_request' AND at>?",
                              (time.time() - 86400,)).fetchone()[0]
        return {"live_runs_per_hour": self.runs_per_hour, "live_runs_per_day": self.runs_per_day,
                "provider_requests_per_day": self.requests_per_day, "provider_requests_remaining": max(0, self.requests_per_day - used)}


class Access:
    def __init__(self):
        self.public = os.getenv("REHEARSAL_PUBLIC", "0") == "1"
        self.token = os.getenv("REHEARSAL_OPERATOR_TOKEN", "").strip()
        if self.token and len(self.token) < 32:
            raise ValueError("REHEARSAL_OPERATOR_TOKEN must contain at least 32 characters.")
        self.sessions = {}
        self.lock = threading.Lock()

    def is_operator(self, request):
        cookie = request.cookies.get("rehearsal_operator", "")
        with self.lock:
            return bool(self.token and self.sessions.get(cookie, 0) > time.time())

    def require_operator(self, request):
        if not self.is_operator(request):
            raise Problem("operator_required", "Operator access is required for this action. Unlock it in Connections.", 403)

    def require_writer(self, request):
        if self.public:
            self.require_operator(request)

    def login(self, supplied):
        if not self.token or not secrets.compare_digest(supplied.encode("utf-8"), self.token.encode("utf-8")):
            raise Problem("operator_denied", "Operator access could not be verified.", 403)
        with self.lock:
            now = time.time()
            self.sessions = {k: v for k, v in self.sessions.items() if v > now}
            if len(self.sessions) >= 32:
                raise Problem("session_limit", "Too many operator sessions. Sign out of another session first.", 429)
            cookie = secrets.token_urlsafe(32)
            self.sessions[cookie] = now + 3600
        return cookie

    def logout(self, request):
        with self.lock:
            self.sessions.pop(request.cookies.get("rehearsal_operator", ""), None)

    def status(self, request):
        operator = self.is_operator(request)
        return {"public": self.public, "operator": operator, "operator_configured": bool(self.token),
                "can_edit": operator or not self.public, "can_use_provider": operator}


class RequestLimits:
    """Sliding windows keyed by the socket peer, never by client-supplied headers."""

    def __init__(self):
        self.windows = {}
        self.lock = threading.Lock()
        self.active = {}

    def check(self, key, limit, seconds):
        with self.lock:
            now = time.monotonic()
            if key not in self.windows:
                if len(self.windows) >= 10000:
                    self.windows = {k: v for k, v in self.windows.items() if v and now - v[-1] < 300}
                if len(self.windows) >= 10000:
                    return 60
                self.windows[key] = deque()
            window = self.windows[key]
            while window and window[0] <= now - seconds:
                window.popleft()
            if len(window) >= limit:
                return max(1, math.ceil(window[0] + seconds - now))
            window.append(now)
        return 0

    def enter(self, keys):
        with self.lock:
            if any(self.active.get(k, 0) >= limit for k, limit in keys):
                return False
            for key, _ in keys:
                self.active[key] = self.active.get(key, 0) + 1
        return True

    def leave(self, keys):
        with self.lock:
            for key, _ in keys:
                self.active[key] -= 1
                if not self.active[key]:
                    del self.active[key]


class ResourceBoundary:
    def __init__(self, app, access, limits):
        self.app, self.access, self.limits = app, access, limits

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        path = scope["path"]
        protected = path.startswith(("/api/", "/mcp", "/exports-service"))
        peer = (scope.get("client") or ("unknown",))[0]
        slots = []

        async def reject(code, message, status, retry=None):
            response = JSONResponse({"code": code, "message": message}, status,
                                    headers={"Retry-After": str(retry), "Cache-Control": "no-store"} if retry else {"Cache-Control": "no-store"})
            await response(scope, receive, send)

        if protected:
            rules = [(('requests', peer), 240, 60), (('requests', '*'), 1200, 60)]
            if scope["method"] not in {"GET", "HEAD", "OPTIONS"}:
                rules += [(('writes', peer), 120, 60), (('writes', '*'), 300, 60)]
            if path == "/api/runs":
                rules += [(('run', peer), 12, 60), (('run', '*'), 30, 60)]
            if path == "/api/operator/login":
                rules += [(('login', peer), 5, 300), (('login', '*'), 30, 300)]
            if path == "/api/connections/backboard":
                rules += [(('connection', peer), 3, 60)]
            if path.startswith("/api/simulations") or path.endswith("/evaluate"):
                rules += [(('simulation', peer), 12, 60), (('simulation', '*'), 60, 60)]
                slots = [(('simulation', '*'), 2)]
            if path == "/api/simulations/sweep":
                rules += [(('sweep', peer), 2, 60), (('sweep', '*'), 6, 60)]
            if path.startswith("/mcp"):
                if self.access.public:
                    return await reject("mcp_private", "External MCP is disabled on the public demo.", 403)
                slots = [(('mcp', '*'), 4)]
            if path.endswith("/events"):
                slots = [(('stream', peer), 2), (('stream', '*'), 12)]
            for key, limit, seconds in rules:
                retry = self.limits.check(key, limit, seconds)
                if retry:
                    return await reject("rate_limited", "Too many requests. Wait before trying again.", 429, retry)

            # Buffer at most 16 KiB, including chunked bodies without Content-Length.
            if scope["method"] in {"POST", "PUT", "PATCH", "DELETE"}:
                parts, size = [], 0
                try:
                    async with asyncio.timeout(10):
                        while True:
                            message = await receive()
                            if message["type"] == "http.disconnect":
                                return
                            part = message.get("body", b"")
                            size += len(part)
                            if size > 16384:
                                return await reject("body_too_large", "Request bodies are limited to 16 KiB.", 413)
                            parts.append(part)
                            if not message.get("more_body", False):
                                break
                except TimeoutError:
                    return await reject("request_timeout", "The request body took too long to arrive.", 408)
                body, delivered = b"".join(parts), False
                original_receive = receive

                async def bounded_receive():
                    nonlocal delivered
                    if not delivered:
                        delivered = True
                        return {"type": "http.request", "body": body, "more_body": False}
                    return await original_receive()

                receive = bounded_receive

        if slots and not self.limits.enter(slots):
            return await reject("capacity_limit", "The demo is busy. Try again shortly.", 429, 5)

        async def secure_send(message):
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                headers += [(b"x-content-type-options", b"nosniff"), (b"referrer-policy", b"no-referrer"),
                            (b"x-frame-options", b"DENY")]
                if self.access.public:
                    headers += [(b"content-security-policy", b"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'")]
                    if scope.get("scheme") == "https":
                        headers.append((b"strict-transport-security", b"max-age=31536000"))
                if protected:
                    headers = [(k, v) for k, v in headers if k.lower() != b"cache-control"]
                    headers.append((b"cache-control", b"no-store"))
                message["headers"] = headers
            await send(message)

        try:
            await self.app(scope, receive, secure_send)
        finally:
            if slots:
                self.limits.leave(slots)
