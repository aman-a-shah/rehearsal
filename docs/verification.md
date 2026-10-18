# Verification record

## Real repository workflow — October 18

Three live Backboard investigations executed real commands in disposable local Docker containers, using real FalkorDB graphs:

| Repository | Before | Generated repair | Independent verification |
| --- | --- | --- | --- |
| Python pricing service | Six unittest tests; rounding assertion fails | Two generated alternatives pass; smaller patch selected | Six tests pass again |
| Node event feed | Five node:test cases; exclusive-cursor assertion fails | Generated source patch fixes pagination | Five tests pass again |
| Uploaded timeout module | Four existing unittest tests pass | Agent adds a fifth test; it fails on integer zero; generated source patch fixes it | All five tests pass, then pass again in a new container |

The public GitHub importer also fetched and indexed `pallets/itsdangerous` at commit `672971d66a2ef9f85151e53283113f33d642dabd` (50 imported files). Its test suite was not executed. The first pricing browser run correctly rejected a provider response using an unsupported patch format; the adapter was corrected and the subsequent complete live run passed. The timeout check exposed an overbroad protected-filename rule; that was corrected before the successful regression-test run.

The browser check imported a repository, inspected a graph node's source, started a real investigation, displayed the generated diff, downloaded the patch, and inspected the test logs. It reported no browser errors or horizontal overflow at 390 px. Evidence is stored locally under `artifacts/repositories/`; these artifacts contain no deployment or provider credentials.

Two additional investigations imported real public GitHub repositories and executed their baseline, candidates, and repeat verification in separate Vercel microVMs:

| Repository / tested commit | Observed result | Published evidence |
| --- | --- | --- |
| `aman-a-shah/rehearsal-python-example` at `3c6a4734155c2a05c7b3c27551269d32884c27ef` | Six tests, one original rounding failure. Two generated alternatives passed; the selected patch passed a fresh repeat. | [Draft PR #1](https://github.com/aman-a-shah/rehearsal-python-example/pull/1), changing only `pricing.py` |
| `aman-a-shah/rehearsal-node-example` at `cbcfc6b2f18d0636864024f32b5fb69b72604e90` | Five tests, one original exclusive-cursor failure. The source repair passed twice in separate sandboxes. | [Draft PR #1](https://github.com/aman-a-shah/rehearsal-node-example/pull/1), changing only `src/pagination.js` |

Both PRs were inspected before publication. Retrying publication returned the same PR; both remain drafts and the original branches retain their bugs. These runs used a local verification identity seeded from the owner's authorized GitHub CLI session. They verify real GitHub import and publication, but do not substitute for testing the browser OAuth callback. The README screenshot shows the real Python cloud run and its draft PR link.

A separate cloud trial installed `is-number@7.0.0` from npm and passed three checks: the installed dependency worked, API credentials were absent from the sandbox environment, and outbound access to `example.com` was blocked during tests. The production Vercel identity function returned 404 anonymously, returned a short-lived project identity only after authentication, and successfully authorized sandbox creation from the external Python adapter. A live check exposed the SDK's requirement for `writable()` on its bounded log sink; the adapter and its contract test were corrected.

The backend suite completed with **126 passing tests** and two dependency deprecation warnings. After the final persistence and validation changes, the expanded repository suite completed with **56 passing tests**. Its seven added cases bring coverage across these runs to 133 distinct backend tests. Additional checks cover malformed manifests, shared import concurrency, malformed URL ports, and graph recovery from on-disk snapshots without a graceful shutdown save. Coverage also includes archive traversal and links, credential filtering, fixed GitHub hosts and redirects, immutable imports, tenant isolation, encrypted sessions, one-use OAuth state and PKCE, persistent quotas, exact edits, protected files, test-count drops, flaky repeats, graph scope, stale commits, and idempotent draft PR creation. The OAuth callback's network exchanges are mocked in this suite.

The latest frontend build and identity-function tests passed. Browser checks reported no JavaScript errors, no horizontal overflow at 390 px, and zero selected WCAG A/AA findings from Axe on the repository home and workspace. The Linux amd64 API image started successfully with embedded FalkorDB; checks covered secure cookies, account isolation, persistent SQLite history, real graph health, and rejection of the local Docker runner in public mode. After replacing the container with the final image and restarting it, an authenticated session and imported source remained available; a direct FalkorDB query recovered all three import edges. Source and built browser assets were scanned for configured credentials and common secret patterns without findings. These checks do not establish full accessibility or security conformance.

The final public website/API integration and real browser OAuth callback are still pending. Vercel currently hosts the authenticated sandbox identity function only. Render authentication works, but provisioning is blocked by `need_payment_info`; no paid API service has been created. The local and cloud integration checks above are not presented as a completed public deployment.

## October 18 demo recording and container

The repeatable Chrome capture completed two real Backboard investigations through `anthropic` / `claude-sonnet-4-6`. Under the initial policy, rollback and bypass failed, verified cache passed, owner approval restored all three exports, and Backboard confirmed the memory save. After accepting a 600-second graph policy, the second investigation tested all three repairs and stopped without a proposal. Both used three provider responses. No browser page errors occurred.

The recording also shows the executed Cypher, Alder's source agreement, owner approval, recovery receipt, accepted policy revision, and opposite example results at 900 and 901 seconds. The exported H.264 MP4 is 193.68 seconds at 1920 × 1080 and 25 fps, with optional English subtitles and a separate narration script. Footage remains at its original speed and has no voice track. The local packet is `artifacts/submission/rehearsal-graph-hacks.zip`; it has not been publicly uploaded.

The Docker image built successfully for Linux amd64 and ran under Docker Desktop on the macOS arm64 host. FastAPI and embedded FalkorDB ran as UID 10001. Integration checks verified real graph health, frontend serving, secure session-cookie attributes, denied public shared writes and external MCP, exact-boundary examples, redacted validation errors, untrusted-host rejection, and simulation throttling despite changed forwarding headers. A replacement image retained the persistent usage counter; a subsequent restart retained both the accepted 600-second graph policy at context revision 2 and that counter. No provider key was installed in the test container.

The production-launcher and existing security suites passed together: **27 tests in 36.28 seconds**. The launcher rejects missing/insecure origins, disabled public mode, invalid ports, and wildcard proxy trust, including a wildcard mixed into an address list. The container entrypoint also rejected a normalized path escaping `/data/rehearsal`. A scoped scan found no configured credential values in tracked or unignored project files. The existing Starlette test-client deprecation warning remained.

These container checks were local. No internet-facing deployment, public video upload, or event-form submission has been completed. See the [deployment guide](deployment.md), [recording workflow](demo.md#repeatable-browser-capture), and [submission draft](submission.md).

## October 18 submission checks

The updated build and 63 distinct backend tests passed across the full run and focused reruns. The full run initially passed 58 of 59 tests; the boundary-input test encountered the new throttle before reaching validation. That test now isolates input validation from throttling and passed on rerun. Four additional security cases brought the final security suite to 13 passing tests in 38.13 seconds.

Security coverage includes anonymous denial of paid runs, connection changes and live approvals; operator cookies and logout; Unicode login input; secret-free validation responses; body limits; login throttling despite changed forwarded headers; public read/simulation access with shared writes and external MCP denied; atomic persistent quotas; rolling hour/day windows; simulation concurrency; and zero provider calls after guided approval. Provider requests were mocked; no paid inference was needed for this pass.

All 13 browser scenarios passed across the suite and focused reruns. The 11 existing scenarios passed with the new controls. The two Examples cases cover all six outcomes, downloadable evidence, source/output inspection, unchanged graph/runtime/run/receipt state, deep links, mobile navigation, viewport bounds, and automated accessibility scans. A hidden mobile policy-lab link was restored; both example cases then passed in 5.3 seconds. Desktop and mobile screenshots were visually inspected.

The production build passed with approximately 298 kB JavaScript (90 kB gzip) and 72 kB CSS (15 kB gzip). README query blocks were checked against the actual Cypher constants and local documentation links resolved. A local audit checked tracked/unignored files, built assets, and reachable Git blobs for configured secret values and common credential/private-key patterns; it found no matches. `.env` remains ignored and restricted to the current user. This is a scoped audit, not a claim that arbitrary future changes cannot expose credentials.

Browser verification used a separate keyless FastAPI server on port 8783 with `.state-submission-check`. Public-mode access and secure-cookie behavior were tested with an HTTPS TestClient origin; an internet-facing reverse proxy has not been deployed or tested. The live-provider results below are from October 17.

## October 17 baseline

Verified on October 17, 2026, on macOS arm64 with Python 3.13, Node 22.20.0, and installed Google Chrome. These are results from this rebuild, not reports copied from the earlier prototype.

| Check                                                      | Result                                                                                                                                                                          |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript strict build and Vite production bundle         | Passed                                                                                                                                                                          |
| Backend suite                                              | 50 passed in 213.26 seconds after the live-provider fixes                                                                                                                       |
| Browser suite against the built frontend served by FastAPI | 11 passed in 46.6 seconds                                                                                                                                                       |
| Automated accessibility scans                              | No violations in tested incident, request trace, boundary suite, approval, company context, policy lab, Connections, and command search states for the selected WCAG A/AA rules |
| Keyboard behavior                                          | Command search selection, tab navigation, Escape dismissal, and drawer focus restoration verified                                                                               |
| Mobile layout                                              | Incident, approval, context, Connections, policy lab, and boundary tests verified at 390 × 844 without page-level horizontal overflow; wide evidence has local scrolling        |
| Built frontend and API HTTP checks                         | Index, JavaScript, CSS, and health endpoints returned HTTP 200                                                                                                                  |
| Python dependency consistency                              | `pip check` passed                                                                                                                                                              |

The backend coverage includes actual FalkorDB impact queries, HTTP export artifacts, source revisions, owner checks, evidence/runtime tampering, cache freshness boundaries, corrupt cached data, graph unavailability, approval expiry, policy-change invalidation, concurrent/idempotent execution, restart recovery, interrupted journal writes, interrupted policy acceptance, API sessions/origins, official in-memory MCP calls, and the external Streamable HTTP endpoint.

The Backboard contract tests use HTTPX mock responses with actual local MCP execution. They verify stateful tool-output submission with schemas preserved on every continuation, server-bound run IDs, cumulative tool-call deduplication, rejection of changed call IDs and missing provider run IDs, token and cost accounting, the twelve-response ceiling, malformed budget configuration, provider failures, rejection of unsupported tools, verified memory persistence and deduplication, connection authentication, and key exclusion from workspace responses. Overlong recommendations must be corrected before a proposal is issued; evidence is never silently truncated. Counterfactual tests cover five outcome/freshness scenarios and confirm that runtime, graph authority, runs, and receipts are unchanged. API checks cover strict inputs and the SSE response contract.

The request-trace tests verify actual request and response payloads, parent-child timing bounds, and before/after request counts for all three repairs. Boundary-suite checks verify the default twelve cases and 36 trials, zero-second policy behavior, expected eligibility at the freshness edge, one shared input fingerprint and observation time, authenticated strict inputs, and no changes to runtime, policy, runs, proposals, or receipts.

The browser coverage includes the complete repair-to-decision flow, an HTTP-200 response that still violates an agreement, reviewed policy changes that block all repairs, ownership switching, source search, pending revisions, baseline output comparison, expanded graph inspection, run history, counterfactual outcomes and isolation, deep links, command search, responsive navigation, and automated accessibility checks. Additional flows verify synchronized branch/graph/output inspection, trial-aware node details, the actual invalid request payload, removal of the enrichment request after bypass, boundary results at 900 and 901 seconds, downloadable evidence, and stale-input handling. Screenshots of the desktop workbench, request trace, boundary suite, and policy lab and mobile incident, boundary suite, approval, Connections, and policy lab were inspected. Automated scans do not establish full WCAG conformance.

The production JavaScript bundle is approximately 286 kB, or 87 kB gzip. CSS is approximately 65 kB, or 14 kB gzip. Fonts are bundled locally. Run progress uses SSE with a polling fallback; simulations execute three independent trials in parallel. A boundary suite captures its graph and service inputs once, then evaluates its cases against that frozen snapshot.

Final browser verification used `REHEARSAL_BASE_URL=http://127.0.0.1:8781`, with the built app served by the API and isolated state in `.state-overhaul`. The development interface remains available at http://127.0.0.1:5181 while that local server process is running.

## Documentation and copy refresh

The October 17 documentation pass reduced the README from 1,386 to 440 words and replaced its old image with screenshots from the current app. Four captures cover the workbench, repair comparison, owner approval, and boundary suite. They use the guided demo with provider keys disabled, actual trial outputs, and no altered timestamps or result text.

The production build passed. All 11 browser scenarios passed on the current frontend; the approval scenario was rerun after its assertion was scoped to the evidence panel. Automated accessibility and mobile checks are included in those scenarios. The capture script separately verified three trials, one approved change, restored exports, and zero browser errors. Local documentation links and image references resolved.

Images are stored in `docs/screenshots/` for inclusion in the repository. Capture metadata is saved locally in `artifacts/screenshots.json`. Use the [development guide](development.md#screenshots) to reproduce them. The earlier 50-test result above remains the backend verification record; this pass changed documentation, UI copy, and browser tooling.

## Live Backboard verification

On October 17, 2026, real Backboard requests routed to `anthropic` / `claude-sonnet-4-6` were exercised through the local browser interface. The live harness is separate from the ordinary suites: `npm run test:live -- approval`, `blocked`, or `preview`. It resets the synthetic workspace, incurs provider charges, and saves JSON evidence and screenshots under `artifacts/live-backboard/`.

| Scenario                                              | Observed result                                                                                                                                                                        |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Final normal-policy investigation, `run_094e891e61e5` | Reached a cache proposal in 27.3 seconds, using four provider responses and nine unique tool calls. All three repairs were tested and one historical memory was retrieved.             |
| Approval and recovery                                 | Browser approval restored all three HTTP exports. The receipt verified successfully. Repeating approval returned the identical receipt and left the mutation count at one.             |
| Memory persistence                                    | Backboard returned a memory ID after approval; an independent GET verified its contents and originating run ID. The browser displayed the completed memory save.                       |
| Stricter 600-second policy, `run_07ba75f6d33e`        | Recalled one prior memory, inspected current source records, tested all three repairs, and escalated with `repair: null` in 37.8 seconds. No proposal or service mutation was created. |
| Browser runtime                                       | Both repeatable live scenarios completed without JavaScript page errors.                                                                                                               |

Live testing exposed two protocol assumptions missed by the initial mocks. Message-scoped tools disappeared on the simple continuation endpoint, and continuation responses repeated earlier tool calls. The adapter now uses the explicit provider-run endpoint with schemas on every continuation and reuses completed outputs by tool-call ID. The final approval run had nine unique provider call IDs and exactly nine local tool events.

An earlier stricter-policy run (`run_b45501efa05b`) attempted to recommend stale cache despite its failed check. The deterministic verifier rejected it before granting approval authority, and the model subsequently abstained. That observation is retained in the run evidence; these checks do not establish that model recommendations are consistently correct. The final prompt also makes immediate trial eligibility explicit. The last follow-up fix rejects overlong explanations with a correctable tool error instead of cutting off their supporting evidence.

Backboard's billing ledger reported **$0.335560** across 22 usage events in the 17:42:58–17:56:00 UTC test window, including debugging attempts and memory operations. Per-message `cost_usd` was absent/null, so the application correctly showed cost as unavailable. Its displayed input/output counts exclude provider cache accounting that appeared only in the billing ledger: that window reported 22,111 cached-input and 56,244 cache-write tokens in addition to fresh input/output. The reported-cost limit cannot cap spending while the provider omits costs.

Local evidence files under `artifacts/live-backboard/` include `approval.json`, `blocked.json`, `final-verified-memory.json`, and `billing-session.json`. These files are ignored by Git; the verification record retains the conclusions.

## Limits of this verification

- Live verification covered Claude Sonnet 4.6 through Backboard and this one synthetic incident. Other providers, models, failure scenarios, and broad model accuracy were not evaluated. Cost reporting in message responses remained unavailable; account billing was checked separately.
- The optional external FalkorDB configuration was not exercised; the suite uses the embedded engine.
- Python verification used an already-provisioned environment. The complete setup script was not tested on an empty machine.
- The full suite was not run on Windows or Linux, or in Safari or Firefox. The October 18 container integration checks above used Linux amd64.
- The passing backend run emitted one dependency deprecation warning about Starlette's HTTPX test client. It did not affect the results.

Reproduce the checks with the commands in the [development guide](development.md#tests). `REHEARSAL_BASE_URL` can point the browser suite at a different local serving configuration. Browser checks reset synthetic workspace state.
