"""Obtain short-lived project identity from the app's authenticated Vercel function."""
import base64
import json
import os
import time
from urllib.parse import urlparse

import httpx


class SandboxIdentity:
    def __init__(self, transport=None):
        self.cached = None
        self.expires = 0
        self.transport = transport

    async def __call__(self):
        from vercel.sandbox import SandboxCredentials

        if self.cached and self.expires > time.time() + 600:
            return self.cached
        origin = os.environ["REHEARSAL_APP_ORIGIN"].rstrip("/")
        parsed = urlparse(origin)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.path or parsed.query or parsed.fragment or parsed.port:
            raise ValueError("The sandbox identity origin must use HTTPS.")
        secret = os.environ["REHEARSAL_SANDBOX_BROKER_SECRET"]
        if len(secret) < 40:
            raise ValueError("The sandbox identity secret is not configured.")
        async with httpx.AsyncClient(timeout=15, follow_redirects=False, transport=self.transport) as client:
            async with client.stream("POST", origin + "/internal/sandbox-identity", headers={"Authorization": "Bearer " + secret}) as response:
                response.raise_for_status()
                body = bytearray()
                async for chunk in response.aiter_bytes():
                    body.extend(chunk)
                    if len(body) > 32000:
                        raise ValueError("The identity response exceeded its limit.")
        data = json.loads(body)
        # The authenticated TLS endpoint supplies the identity; Vercel verifies
        # its signature when used. Parse only to bound caching and check scope.
        payload = data["token"].split(".")[1]
        claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
        if data["project_id"] != os.environ["VERCEL_PROJECT_ID"] or data["team_id"] != os.environ["VERCEL_TEAM_ID"]:
            raise ValueError("The sandbox identity belongs to another project.")
        expires = float(claims["exp"])
        if not time.time() + 600 < expires < time.time() + 10800:
            raise ValueError("The sandbox identity has expired or has an unexpected lifetime.")
        self.cached = SandboxCredentials(token=data["token"], project_id=data["project_id"], team_id=data["team_id"])
        self.expires = expires
        return self.cached
