"""Production launcher for one persistent Rehearsal workspace."""

import os
from urllib.parse import urlparse

import uvicorn


def main():
    # Resolve the host-provided URL before server.api constructs its allowlists.
    if os.getenv("REHEARSAL_PUBLIC", "1") != "1":
        raise SystemExit("The production launcher requires REHEARSAL_PUBLIC=1.")
    os.environ["REHEARSAL_PUBLIC"] = "1"
    origin = os.getenv("REHEARSAL_PUBLIC_ORIGIN", "").strip()
    if not origin:
        origin = os.getenv("RENDER_EXTERNAL_URL", "").strip()
    if not origin and os.getenv("RAILWAY_PUBLIC_DOMAIN"):
        origin = "https://" + os.environ["RAILWAY_PUBLIC_DOMAIN"].strip()
    parsed = urlparse(origin)
    if (parsed.scheme != "https" or not parsed.hostname
            or parsed.path not in {"", "/"} or parsed.query or parsed.fragment
            or parsed.username or parsed.password):
        raise SystemExit("Set REHEARSAL_PUBLIC_ORIGIN to the public HTTPS origin before starting.")
    os.environ["REHEARSAL_PUBLIC_ORIGIN"] = origin.rstrip("/")
    try:
        port = int(os.getenv("PORT", "8080"))
    except ValueError:
        raise SystemExit("PORT must be an integer from 1 to 65535.") from None
    if not 1 <= port <= 65535:
        raise SystemExit("PORT must be an integer from 1 to 65535.")

    # Trust forwarded addresses only when the operator supplies the exact proxy
    # addresses. Without that setting, rate limits use the socket peer.
    trusted_proxies = os.getenv("FORWARDED_ALLOW_IPS", "").strip()
    if "*" in {address.strip() for address in trusted_proxies.split(",")}:
        raise SystemExit("FORWARDED_ALLOW_IPS must list trusted proxies explicitly.")
    uvicorn.run(
        "server.api:app", host="0.0.0.0", port=port, workers=1,
        proxy_headers=bool(trusted_proxies),
        forwarded_allow_ips=trusted_proxies,
        access_log=False,
    )


if __name__ == "__main__":
    main()
