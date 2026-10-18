"""One-time local form for registering the deployment's GitHub OAuth app.

No credentials appear in the terminal or chat. The resulting .env.github.local
is ignored by Git and readable only by the current user.
"""
import argparse
import html
import os
import re
import secrets
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import httpx


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--origin", required=True)
    parser.add_argument("--port", type=int, default=8790)
    args = parser.parse_args()
    origin = args.origin.rstrip("/")
    parsed = urlparse(origin)
    if parsed.scheme != "https" or not parsed.hostname or parsed.path or parsed.query or parsed.fragment or parsed.username or parsed.password or parsed.port:
        raise SystemExit("Use the final HTTPS website origin.")
    output = Path(__file__).resolve().parents[1] / ".env.github.local"
    if output.exists():
        raise SystemExit(".env.github.local already exists; registration is already saved.")
    nonce = secrets.token_urlsafe(32)
    local = f"http://127.0.0.1:{args.port}"
    route = "/" + nonce
    saved = False
    style = "body{font:16px system-ui;color:#262c29;background:#f7f8f6;max-width:720px;margin:60px auto;padding:24px;line-height:1.6}h1{font-size:32px;letter-spacing:-1px}a{color:#27654b}code{display:block;padding:12px;background:white;border:1px solid #dce1dc;border-radius:6px;overflow-wrap:anywhere}label{display:block;margin-top:18px}input{box-sizing:border-box;display:block;width:100%;font:inherit;padding:10px;border:1px solid #b9c4bd;border-radius:6px}button{margin-top:24px;background:#286347;color:white;border:0;border-radius:6px;padding:12px 18px;font:inherit}p{color:#46534a}"

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def respond(self, status, body):
            content = ("<!doctype html><html lang=en><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>Rehearsal · GitHub setup</title><style>" + style + "</style><body>" + body + "</body></html>").encode()
            self.send_response(status)
            for name, value in {"Content-Type": "text/html; charset=utf-8", "Content-Length": str(len(content)), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"}.items():
                self.send_header(name, value)
            self.end_headers()
            self.wfile.write(content)

        def valid(self):
            return self.headers.get("Host") == f"127.0.0.1:{args.port}" and secrets.compare_digest(self.path, route)

        def do_GET(self):
            if not self.valid():
                return self.respond(404, "<h1>Not found</h1>")
            self.respond(200, f"""<h1>Connect Rehearsal to GitHub</h1>
<p>This registers the application once so visitors can sign in. The client secret is saved directly on this computer.</p>
<p><a href="https://github.com/settings/applications/new" target="_blank" rel="noreferrer">Open GitHub's application registration</a> and enter:</p>
<p>Application name<code>Rehearsal</code></p>
<p>Homepage URL<code>{html.escape(origin)}</code></p>
<p>Authorization callback URL<code>{html.escape(origin)}/api/code/auth/github/callback</code></p>
<p>Register the application, generate its client secret, then paste the two values below. If access tokens expire, users can reconnect GitHub.</p>
<form method="post" action="{route}">
<label>Client ID<input name="client_id" required maxlength="100" autocomplete="off"></label>
<label>Client secret<input type="password" name="client_secret" required maxlength="200" autocomplete="off"></label>
<button type="submit">Save GitHub configuration</button></form>""")

        def do_POST(self):
            nonlocal saved
            if not self.valid() or self.headers.get("Origin") != local:
                return self.respond(403, "<h1>Request could not be verified</h1>")
            try:
                size = int(self.headers.get("Content-Length", "0"))
                if not 0 < size < 4000:
                    return self.respond(413, "<h1>Invalid form</h1>")
                data = parse_qs(self.rfile.read(size).decode())
                client = data.get("client_id", [""])[0].strip()
                secret = data.get("client_secret", [""])[0].strip()
                if not re.fullmatch(r"[A-Za-z0-9_.-]{10,100}", client) or not re.fullmatch(r"[A-Za-z0-9_.-]{20,200}", secret):
                    return self.respond(400, "<h1>Check both values</h1><p>Return to the form and paste the GitHub client ID and client secret.</p>")
                result = httpx.post(f"https://api.github.com/applications/{client}/token", auth=(client, secret), json={"access_token": "rehearsal-configuration-check"}, timeout=15)
                if result.status_code != 404:
                    return self.respond(400, "<h1>GitHub could not verify this configuration</h1><p>Return to the form and check the application credentials.</p>")
                with os.fdopen(os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w") as handle:
                    handle.write(f"GITHUB_CLIENT_ID={client}\nGITHUB_CLIENT_SECRET={secret}\n")
                saved = True
                print("GitHub configuration verified and saved privately to .env.github.local.", flush=True)
                self.respond(200, "<h1>GitHub is configured.</h1><p>You can close this tab. The deployment can now enable sign-in.</p>")
            except (ValueError, OSError, httpx.HTTPError):
                self.respond(500, "<h1>Configuration was not saved</h1><p>Return to the form and try again.</p>")

    server = HTTPServer(("127.0.0.1", args.port), Handler)
    server.timeout = 5
    print("Open this local setup form: " + local + route, flush=True)
    try:
        while not saved:
            server.handle_request()
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
