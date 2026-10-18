# Access and resource limits

Paid provider operations require a separate operator session. Selecting Nia or another demo identity does not grant that access. The default server binds to loopback; a public deployment needs HTTPS and the public-mode settings below.

## Credentials

- Set `REHEARSAL_OPERATOR_TOKEN` to a random value of at least 32 characters in the server's secret environment or ignored `.env`. Generate one locally with `python3 -c 'import secrets; print(secrets.token_urlsafe(32))'`. Treat it as a password.
- Unlock **Connections → Operator access** before changing a provider key or running a live investigation. The server compares the token with `compare_digest` and issues an opaque, one-hour, HttpOnly, SameSite=Strict cookie. Public-mode cookies also require HTTPS. Sign out to invalidate the server session.
- `BACKBOARD_API_KEY` and `ANTHROPIC_API_KEY` stay on the server. Browser-entered keys are transient form state and are cleared after every submission. They are not written to browser storage, run records, or API responses.
- Request-validation errors return a fixed message. They do not serialize Pydantic's submitted `input`, body, or field locations. API responses use `Cache-Control: no-store`. Provider failures use status-specific messages without echoing provider bodies or headers.
- `.env`, state databases, logs, and local evidence artifacts are ignored by Git and are not static web routes. Keep secrets out of `VITE_*` variables; those are frontend configuration.

## Spending controls

| Control | Default |
| --- | --- |
| Operator authentication | Required for provider configuration, live runs, and live approvals |
| Active investigations | One per workspace; connection changes wait for investigation/memory tasks |
| Rolling live-run allowance | 3/hour and 6/24 hours |
| Rolling provider-request allowance | 60/24 hours, across connection validation, inference, continuation, and memory writes |
| Per-investigation limits | 12 responses, 24 tools, 180 seconds, 80,000 reported tokens |
| Memory writes | Verified live recoveries; pending and completed saves are locally deduplicated |

`REHEARSAL_LIVE_RUNS_PER_HOUR`, `REHEARSAL_LIVE_RUNS_PER_DAY`, and `REHEARSAL_PROVIDER_REQUESTS_PER_DAY` set positive integer quotas. Invalid values use the defaults. An atomic SQLite transaction reserves each allowance before network I/O. Failed/ambiguous requests still consume allowance; there are no automatic inference retries. `usage.sqlite` is separate from resettable workspace records and survives restarts.

These are request-count limits, not a guaranteed dollar ceiling. The existing `REHEARSAL_RUN_BUDGET_USD` threshold is checked after responses and cannot enforce a ceiling when the provider omits price information. Configure a spending cap or credit balance on the provider account as the independent billing boundary. Calls from other applications using the same provider key are outside this app's quotas.

## Public hosting

Serve a production build behind an HTTPS reverse proxy with one API worker and persistent storage:

```dotenv
REHEARSAL_PUBLIC=1
REHEARSAL_PUBLIC_ORIGIN=https://your-demo.example
REHEARSAL_STATE_DIR=/persistent/rehearsal
```

Set the operator token and provider key through the host's secret settings. Public visitors can read the synthetic workspace and execute isolated examples, simulations, and boundary suites. Only the operator can launch shared runs, approve repairs, accept policy revisions, reset the workspace, or configure the provider. External `/mcp` access is disabled in public mode; the agent's in-process MCP tools still work.

The public origin must be an HTTPS origin without a path. It is added to the exact host/origin allowlists. Keep the API bound to loopback behind the proxy, preserve the public Host, and trust forwarding headers only from that proxy. The application never parses `X-Forwarded-For` as a rate-limit identity; use correct Uvicorn proxy trust settings so `request.client` reflects a verified peer. Set ingress connection and body limits at the proxy as well.

Public responses include a Content Security Policy allowing local scripts/assets, a frame restriction, and HTTPS HSTS. Inline styles remain enabled for the graph and request-trace layouts. Development Vite hot reload is not the public serving configuration.

## Request limits

Sliding-window counters use the peer address plus workspace-wide buckets. Changing a demo identity, cookie, or forwarded-header value does not create a new bucket. A rejected request returns HTTP 429 and `Retry-After`.

| Operation | Per peer | Workspace-wide |
| --- | --- | --- |
| API/service requests | 240/minute | 1,200/minute |
| Writes | 120/minute | 300/minute |
| Investigation launches | 12/minute | 30/minute, plus durable live quotas |
| Operator login attempts | 5/5 minutes | 30/5 minutes |
| Provider connection attempts | 3/minute | General and durable provider limits |
| Simulations | 12/minute | 60/minute; 2 executing concurrently |
| Boundary suites | 2/minute | 6/minute; share simulation capacity |
| Event streams | 2 active | 12 active |

Mutation bodies, including chunked uploads, are limited to 16 KiB and 10 seconds to arrive. In-memory limiter keys and demo/operator session counts are bounded. Rate counters reset on process restart; provider quotas do not. Horizontal replicas with independent storage are not supported by these workspace controls.

The controls follow [OWASP's resource-consumption guidance](https://api-security.owasp.org/editions/2023/en/0xa4-unrestricted-resource-consumption/). Validation handling uses FastAPI's documented [RequestValidationError override](https://fastapi.tiangolo.com/tutorial/handling-errors/#override-request-validation-exceptions).
