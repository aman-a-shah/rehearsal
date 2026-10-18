# Deployment

Run one persistent container behind the hosting platform's HTTPS proxy. The container serves the built React app and FastAPI together, and starts embedded FalkorDB. A static-site host alone cannot run the workspace.

## Container and storage

Build from the repository root:

```sh
docker build --platform linux/amd64 -t rehearsal .
```

Use a persistent volume mounted at `/data`. The application stores its graph, service database, receipts, and usage quotas in `/data/rehearsal`. Keep one replica and one API worker. Deployments must reuse the same volume; an ephemeral filesystem loses both the workspace and its durable spending counters.

The build context excludes credentials, local state, recordings, and Git history. Node and the native compiler remain in build stages. The entrypoint initializes the mounted data directory, then runs Python and FalkorDB as the unprivileged `rehearsal` user.

## Host settings

| Setting | Value |
| --- | --- |
| Build | Repository-root `Dockerfile` |
| Start command | Use the image default |
| Container port | `8080`, or the host-provided `PORT` |
| Health check | `GET /api/health` |
| Persistent disk | Mount at `/data` |
| Replicas | `1` |
| Public mode | `REHEARSAL_PUBLIC=1` (image default) |
| Public origin | `REHEARSAL_PUBLIC_ORIGIN=https://your-demo-host` |

The launcher can also derive the origin from `RENDER_EXTERNAL_URL` or `RAILWAY_PUBLIC_DOMAIN`. An explicit `REHEARSAL_PUBLIC_ORIGIN` takes precedence. It refuses to start without an HTTPS origin, with public mode disabled, or with wildcard proxy trust. Platform health probes must preserve an allowed Host or use `localhost`; check this before deploying to a particular host.

Add `REHEARSAL_OPERATOR_TOKEN` as a secret with at least 32 random characters. Add `BACKBOARD_API_KEY` only when live operator investigations are needed. Never put either in a `VITE_*` variable, Docker build argument, repository file, or public deployment log. The Examples page works without a provider key.

The defaults allow 3 live runs/hour, 6/day, and 60 provider requests/day across the workspace. Connection checks and memory writes count too. Configure a provider-account spending cap separately; request counts are not a dollar limit. See [access and resource limits](security.md).

## Reverse proxy

Expose the application only through HTTPS ingress. The container listens on its private interface at `0.0.0.0`; do not separately publish its port to the internet. Preserve the public Host header. Leave `FORWARDED_ALLOW_IPS` unset unless the hosting platform provides the exact trusted proxy addresses or network ranges. Without that setting, rate limits group requests by the socket peer; global quotas still apply.

## Verify the public URL

1. Open `/api/health`: it must report `status: ok` and `engine: FalkorDB`. This endpoint actually reads graph context.
2. Open the site in a signed-out browser. Run **Examples → Exactly 900 seconds old**, then **One second changes the outcome**. Cache must pass the first and fail the second.
3. Confirm that shared runs, reset, approvals, and policy edits require operator access. Public visitors should still be able to inspect sources and run isolated examples.
4. Restart the container and confirm the same graph revision, receipts, and usage counters remain. Keep the persistent volume when replacing the image.
5. Add the verified URL to the README and submission. Record the operator demo separately; do not publish the operator token.

If hosting is unavailable, the [Graph Hacks rules](https://www.wemakedevs.org/hackathons/falkordb) accept complete local setup instructions and a working demo video. A prepared container is not itself a live deployment.
