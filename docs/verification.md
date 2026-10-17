# Verification record

Verified on October 17, 2026, on macOS arm64 with Python 3.13, Node 22.20.0, and installed Google Chrome. These are results from this rebuild, not reports copied from the earlier prototype.

| Check                                              | Result                                                                                                                    |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| TypeScript strict build and Vite production bundle | Passed                                                                                                                    |
| Backend suite                                      | 23 passed                                                                                                                 |
| Browser suite against the Vite development app     | 6 passed                                                                                                                  |
| Automated accessibility scans                      | No violations in the tested incident screen, approval drawer, and company context screen for the selected WCAG A/AA rules |
| Keyboard behavior                                  | Escape closes the evidence drawer and returns focus to its trigger                                                        |
| Mobile layout                                      | Incident, approval, and company context flows verified at 390 × 844 without horizontal overflow                           |
| Built frontend and API HTTP checks                 | Index, JavaScript, CSS, and health endpoints returned HTTP 200                                                            |
| Python dependency consistency                      | All 44 installed versions matched `requirements.lock`; `pip check` passed                                                 |

The backend coverage includes actual FalkorDB impact queries, HTTP export artifacts, source revisions, owner checks, evidence/runtime tampering, cache freshness boundaries, corrupt cached data, graph unavailability, approval expiry, policy-change invalidation, concurrent/idempotent execution, restart recovery, an interrupted journal write after execution, interrupted policy acceptance, API sessions/origins, official in-memory MCP calls, and the external Streamable HTTP endpoint. The live-provider contract test uses a mocked provider response and verifies that the server binds the run ID and records token usage.

The browser coverage includes the complete repair-to-decision flow, an HTTP-200 response that still violates an agreement, reviewed policy changes that block all repairs, ownership switching, source search, pending revisions, keyboard dismissal, responsive navigation, and automated accessibility checks. Screenshots were inspected during the rebuild. Automated scans do not establish full WCAG conformance.

The production JavaScript bundle is approximately 247 kB, or 77 kB gzip. CSS is approximately 38 kB, or 9 kB gzip. Fonts are bundled locally.

## Limits of this verification

- Paid live model inference was not run. Add a provider key and complete a real live rehearsal before presenting that mode as demonstrated.
- The optional external FalkorDB configuration was not exercised; the suite uses the embedded engine.
- Python verification used an already-provisioned environment, checked against all locked versions. The complete setup script was not tested on an empty machine.
- The suite was not run on Windows, Linux, Safari, or Firefox.
- A separate browser run pointed at the built app could not launch Chrome under that command's session restrictions; it failed before reaching the application and is not counted as a passing production browser run.
- The passing backend run emitted one dependency deprecation warning about Starlette's HTTPX test client. It did not affect the results.

Reproduce the checks with the commands in the [README](../README.md). `REHEARSAL_BASE_URL` can point the browser suite at a different local serving configuration. Browser checks reset synthetic workspace state.
