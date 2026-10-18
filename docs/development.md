# Development

The [README](../README.md) covers installation. This guide covers configuration, tests, and screenshots.

## Local server

`npm run dev` starts Vite on port 5180 and FastAPI on port 8780. Use one API process per state directory. Stop both processes with Ctrl+C. Restart after Python or environment changes; the frontend reloads automatically.

To use separate ports and state:

```sh
REHEARSAL_API_PORT=8781 REHEARSAL_WEB_PORT=5181 REHEARSAL_STATE_DIR=.state-local npm run dev
```

To serve the built frontend from FastAPI:

```sh
npm run build
npm run dev -- --api-only
```

Open http://127.0.0.1:8780. Stop the development pair first so the API port is free.

## Backboard

Copy `.env.example` to `.env` if that file does not already exist. Set a random `REHEARSAL_OPERATOR_TOKEN` of at least 32 characters, set `BACKBOARD_API_KEY`, and restart. `.env` is excluded from Git. Unlock **Connections → Operator access** using that token. You can also enter a Backboard key there for the current server process; operator access is required even on localhost.

The default route is `anthropic` / `claude-sonnet-4-6`. Change it in Connections or with `BACKBOARD_LLM_PROVIDER` and `REHEARSAL_MODEL`. Connecting checks authentication; the first live run checks model availability. Provider errors appear in the app.

Live investigations use paid inference. Durable rolling quotas default to 3 live runs/hour, 6/day, and 60 provider requests/day. Connection checks and memory writes share the request allowance. Per-run limits are 12 responses, 24 tool calls, 180 seconds, and 80,000 cumulative reported tokens. The $1 threshold is checked after responses and only when the provider reports cost. A single response can exceed it. Our live tests returned no per-message cost, so this threshold could not enforce a dollar ceiling. See [security](security.md) for public hosting and independent provider-account caps.

Activity records tool calls, reported usage, and memory status. After verified live approval, Backboard saves the outcome, policy values, rejected repairs, and follow-up. Guided approvals never call the provider. Subsequent live investigations can retrieve memories; current requirements still control eligibility. Resetting the sample workspace retains the assistant ID, remote memories, and usage quotas.

Keys remain on the server. They are excluded from browser storage, workspace responses, and run journals. The legacy direct Anthropic adapter uses `REHEARSAL_PROVIDER=anthropic` with `ANTHROPIC_API_KEY`.

## Tests

Build and run backend tests:

```sh
npm run build
npm test
```

Python tests disable developer credentials and mock provider responses. Browser tests reset the running workspace, so use a separate server with keys disabled:

```sh
BACKBOARD_API_KEY= ANTHROPIC_API_KEY= BACKBOARD_ASSISTANT_ID= FALKORDB_URL= REHEARSAL_OPERATOR_TOKEN= REHEARSAL_PUBLIC=0 REHEARSAL_PUBLIC_ORIGIN= REHEARSAL_API_PORT=8782 REHEARSAL_WEB_PORT=5182 REHEARSAL_STATE_DIR=.state-tests npm run dev
```

In another terminal:

```sh
REHEARSAL_BASE_URL=http://127.0.0.1:5182 npm run test:e2e -- --ui-only
```

Chrome is the default browser. For Playwright's Chromium, run `npm exec --prefix web -- playwright install chromium` and set `PLAYWRIGHT_CHANNEL=chromium` when testing. Omitting `--ui-only` runs both backend and browser suites. Screenshots go to `artifacts/`; failed browser checks retain traces in `web/test-results/`.

### Live provider checks

Use a separate workspace with a configured Backboard key and operator token. The live harness loads the ignored root `.env` without overriding existing environment variables, signs in with the token, and obeys the same quotas:

```sh
REHEARSAL_BASE_URL=http://127.0.0.1:5181 npm run test:live -- approval
REHEARSAL_BASE_URL=http://127.0.0.1:5181 npm run test:live -- blocked
```

Both commands reset the target workspace and incur provider charges. `approval` checks three trials, recovery, approval retries, and remote memory. `blocked` accepts a 600-second cache policy and checks that all repairs are rejected. Run them in that order to exercise recall under changed requirements. `preview` stops at the proposal.

Evidence is saved under `artifacts/live-backboard/`. See the [verification record](verification.md) for observed results and test limits.

## Screenshots

Start the separate keyless server above, then run:

```sh
REHEARSAL_BASE_URL=http://127.0.0.1:5182 npm run screenshots
```

The capture script resets that workspace and runs the guided demo through the browser. It saves the workbench, repair comparison, approval, and boundary suite in `docs/screenshots/`, with capture details in `artifacts/screenshots.json`. It refuses to run against a workspace with a provider key or an active investigation. Screenshots show actual service output; the guided run makes no model calls.

## State and tools

Local state lives in `.state/`. `REHEARSAL_STATE_DIR` selects another directory. Both `.state/` and `.state-*` are excluded from Git. Keep one API process per workspace; the workflow lock is local to that process.

FalkorDB runs embedded by default. `FALKORDB_URL` can select an external server using the `rehearsal_v2` graph. Use a dedicated demo graph: resetting the sample workspace clears it. External-server operation has not been verified in this environment.

The MCP endpoint is http://127.0.0.1:8780/mcp/. Its tools inspect context, read sources, run trials, and recommend a repair. The model cannot approve a change. Details of receipts, recovery, and isolation are in [architecture](architecture.md).
