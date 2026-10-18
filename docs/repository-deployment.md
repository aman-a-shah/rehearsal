# Repository deployment

The website and API are independently deployable. The API needs persistent storage and a long-lived worker because a rehearsal can outlast an HTTP request. Closing the browser does not cancel a run.

## Free temporary judge preview

Use [render-demo.yaml](../render-demo.yaml) for a **Free** Render service with no persistent disk. This is a separate deployment choice from the paid configuration below. Vercel serves the website and proxies API requests to that free service. No hosting payment method is required; model calls and sandboxes still use the connected providers' existing allowances.

Set `REHEARSAL_DEMO_INVITE` to a random 48+ character value, `REHEARSAL_DEMO_EXPIRES_AT` to a fixed Unix expiry timestamp, and `REHEARSAL_TEMPORARY_DEMO=1`. Share `<website-origin>/#invite=<value>` privately. The browser exchanges the fragment for a signed Secure, HttpOnly cookie and removes it from the URL. The invitation never enters the public source or frontend build. Protected API routes require access; health and invitation endpoints remain available. The website sends `noindex` headers. Invitations expire even if the server restarts.

Public GitHub URLs, ZIP uploads, and three built-in examples work without GitHub OAuth registration. Guests can download verified patches. The demo permits four runs per guest, with shared hourly, daily, model-call, and sandbox limits. GitHub sign-in and draft PR publication remain optional additional configuration.

Render's free service sleeps after 15 idle minutes, takes roughly a minute to wake, and discards local source, sessions, graph data, run history, and quota counters on sleep/restart. The invitation cookie remains valid, but visitors start a new workspace. The page retries during startup and tells visitors to download patches before leaving. Keep the invitation limited to judges; this configuration is temporary and does not provide durable storage or durable cross-restart usage accounting. See [Render's documented limits](https://render.com/docs/free).

To end the preview, suspend/delete the free service or let the invitation expire. Do not upgrade it or attach a disk for the temporary preview.

## Persistent API

Deploy the repository's `Dockerfile` using [render.yaml](../render.yaml) or an existing container host. The Render blueprint selects a paid Starter service and persistent disk. Use one replica, one Python worker, port 8080, and a volume at `/data`. Do not expose a Docker socket in the public API container.

Set server variables through the hosting dashboard:

| Variable | Value |
| --- | --- |
| `REHEARSAL_PUBLIC` | `1` |
| `REHEARSAL_STATE_DIR` | `/data/rehearsal` |
| `REHEARSAL_APP_ORIGIN` | Final Vercel website origin |
| `REHEARSAL_PUBLIC_ORIGIN` | API HTTPS origin; Render's URL can be derived automatically |
| `REHEARSAL_SESSION_KEY` | Fernet key generated locally; preserve it across deployments |
| `REHEARSAL_OPERATOR_TOKEN` | Random secret for the separate guided demo's operator controls |
| `BACKBOARD_API_KEY` | Server-side Backboard credential |
| `REHEARSAL_SANDBOX` | `vercel` |
| `REHEARSAL_SANDBOX_BROKER_SECRET` | Random 48+ character secret, also set on the Vercel production deployment |
| `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID` | Sandbox project and team identifiers |

Generate the encryption key locally and paste it directly into the host's secret field:

```sh
.venv/bin/python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'
```

Changing this key makes stored GitHub credentials unreadable until users reconnect.

The Vercel deployment includes a small `/internal/sandbox-identity` function. Only a production request authenticated with `REHEARSAL_SANDBOX_BROKER_SECRET` can retrieve its short-lived, project-scoped Vercel identity. The API uses that identity through the sandbox SDK's credential factory. Anonymous requests receive 404; responses are never cached. Configure the same secret, `VERCEL_PROJECT_ID`, and `VERCEL_TEAM_ID` on Vercel and the API. This avoids copying a developer's CLI credentials or manually rotating a Vercel personal token. The function handles no source files or test execution.

Alternatively, omit the broker secret and use `VERCEL_TOKEN` with the project and team IDs. For local cloud checks, `vercel env pull .env.vercel.local` supplies a development OIDC token. A CLI login alone does not configure an external API server.

The cloud runner uses Vercel's default universal sandbox image. Setup can reach only `registry.npmjs.org`, `pypi.org`, and `files.pythonhosted.org`. Tests run after a deny-all outbound policy is installed. Public servers reject the Docker adapter. The local adapter runs with a read-only root, unprivileged UID, no capabilities, bounded memory/CPU/processes, no network, and no host mounts.

## Vercel website

Import this GitHub repository into Vercel with the root directory unchanged. `vercel.json` selects the build commands. Set **`REHEARSAL_API_ORIGIN`** to the API's HTTPS origin. This is public routing configuration. Never put provider keys into frontend variables.

`scripts/build-vercel.mjs` builds React and emits Vercel Build Output API configuration. `/api/*` requests are proxied to the persistent API, preserving a same-origin browser session. Security headers and no-store API responses are included. A missing or invalid API origin fails the build.

For a CLI deployment:

```sh
vercel login
vercel link
REHEARSAL_API_ORIGIN=https://your-api.example node scripts/build-vercel.mjs
vercel deploy --prebuilt --prod
```

Replace the example origin with the provisioned API address. Configure the actual website origin on the API before signing in.

## GitHub sign-in

Register a [GitHub OAuth application](https://github.com/settings/applications/new):

| Field | Value |
| --- | --- |
| Application name | Rehearsal |
| Homepage URL | Final website origin |
| Authorization callback URL | `<website-origin>/api/code/auth/github/callback` |

Save `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` on the API. Default login requests `public_repo`; the user explicitly selects **Include private repositories** to request `repo`. GitHub Apps with installation-scoped permissions are a future improvement over these broader OAuth scopes.

For a local registration form that validates credentials and saves them privately without putting secrets in chat, run:

```sh
.venv/bin/python scripts/setup-github.py --origin https://your-project.vercel.app
```

Open the printed loopback URL. The resulting `.env.github.local` is ignored by Git and has mode 600. Transfer those values to the API's secret environment settings. Expired or revoked GitHub authorization requires reconnecting; automatic refresh of expiring GitHub tokens is not implemented.

The server verifies one-use state, uses PKCE, retrieves the authenticated identity, encrypts the access token, and rotates the session. Public URL and ZIP imports work without OAuth configuration. Private imports, repository listing, and draft PR creation require real GitHub authorization. Publication also requires push permission on the selected repository. Automatic fork-and-PR is not implemented.

## Verify the deployed system

1. `/api/health` must read real FalkorDB. `/api/code/session` should report an available provider and sandbox, and configured GitHub sign-in.
2. Sign in through the final website. Confirm a Secure, HttpOnly, SameSite=Lax session and a redirect back to the repository page.
3. Import a small repository at a known failing commit, run it in Vercel Sandbox, inspect both passing trials, and download its patch.
4. Review and create a draft PR on a repository you control. Confirm its base SHA, changed files, and draft status. A changed base branch must cause a stale-head rejection.
5. A second account must receive 404 for the first account's project/run URLs. Restart the API and confirm history, graph data, and usage reservations remain.

Live cloud execution and draft PR creation were verified on the two public example repositories; see the [verification record](verification.md). The final OAuth callback and hosting integration still need their own checks. Local Docker success and mocked API contracts do not establish that a deployment is provisioned correctly.

## Operational limits

The queue accepts four active/queued runs and one per account, and executes one at a time. In-progress runs interrupted by a crash are marked interrupted on startup; queued runs remain queued. Paid work is not silently replayed. Runs have a 20-minute overall limit, 180-second setup commands, 120-second test commands, and at most two generated repair candidates.

Keep one API replica. Multiple replicas, multi-region coordination, automatic recovery of interrupted jobs, custom service containers, and production incident deployment are outside this version. Configure billing controls on both Backboard and Vercel.
