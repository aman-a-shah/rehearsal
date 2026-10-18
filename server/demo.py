"""Public demo status, including compatibility for previously deployed clients."""

import os


def install_demo(app):
    @app.get("/api/demo/status")
    def status():
        # Retired invitation/expiry settings must not lock out public visitors.
        return {"required": False, "authorized": True, "expired": False,
                "temporary": os.getenv("REHEARSAL_TEMPORARY_DEMO") == "1",
                "expires_at": None}

    @app.post("/api/demo/access")
    def access():
        return {"authorized": True}

    @app.middleware("http")
    async def demo_headers(request, call_next):
        response = await call_next(request)
        if os.getenv("REHEARSAL_TEMPORARY_DEMO") == "1":
            response.headers["X-Robots-Tag"] = "noindex, nofollow, noarchive"
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response
