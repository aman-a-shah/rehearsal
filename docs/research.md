# Rehearsal product and interface research

Research date: October 17, 2026.

The prototype tests repairs against customer requirements. Its dependency map identifies affected customers; service trials produce the outputs used for verification. These sources informed the design choices below.

## Incident investigation and testing

| Area                                   | Evidence                                                                                                                                                                                                                                                                                                                                                                    | Consequence for Rehearsal                                                                                                                                            |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Autonomous incident investigation      | [Resolve’s AI SRE](https://website-prod.resolve.ai/product/ai-sre) describes agents that triage alerts, investigate production systems, and pursue hypotheses.                                                                                                                                                                                                              | Make executed repair outcomes the memorable demonstration. Investigation alone is an established product category.                                                   |
| Grounded findings and changing context | [incident.io’s engineering account](https://incident.io/blog/building-investigations-what-it-takes-to-build-an-ai-sre), October 1, 2026, explains evidence-linked findings, revisions when observations contradict earlier conclusions, and backtesting against historical context.                                                                                         | Show source revisions, retain rejected experiments, invalidate stale proposals, and make the run history inspectable.                                                |
| Executable evaluation                  | [Microsoft AIOpsLab](https://www.microsoft.com/en-us/research/publication/aiopslab-a-holistic-framework-for-evaluating-ai-agents-for-enabling-autonomous-cloud/), MLSys 2025, combines deployed services, injected faults, workloads, telemetry, and agent evaluation. Its [implementation](https://github.com/microsoft/AIOpsLab) evaluates actions, traces, and outcomes. | Keep actual HTTP handlers and isolated databases as the verifier. A model’s confidence is not a pass condition.                                                      |
| Scenario coverage                      | [SREGym](https://arxiv.org/abs/2605.07161), revised July 30, 2026, describes a live benchmark with 90 failure scenarios and substantially different results across failure types.                                                                                                                                                                                           | Add repeatable counterfactuals now; treat general production reliability as a future benchmark problem. Three local repairs do not demonstrate broad SRE capability. |
| Persistent memory                      | [Backboard memory](https://docs.backboard.io/concepts/memory) is shared across an assistant’s threads and supports retrieval without writing.                                                                                                                                                                                                                               | Recall prior recoveries using `Readonly`; save only verified outcomes explicitly. Recalled experience remains subordinate to current policy.                         |
| Structured model actions               | [Backboard tool calling](https://docs.backboard.io/concepts/tool-calling) returns function requests for local execution and supports iterative tool-output submission.                                                                                                                                                                                                      | Route real MCP tool schemas through Backboard, bind every call to the active run, and keep human approval outside the model’s tool set.                              |
| Cost and failure visibility            | [Backboard messages](https://docs.backboard.io/concepts/messages) documents token counts, nullable reported cost, thread IDs, and failure states.                                                                                                                                                                                                                           | Record provider usage, cap tools and turns, check reported cost between calls, and display actionable provider errors.                                               |

In the sample incident, rollback fails on schema compatibility and bypass drops required provenance. Cache passes while its age meets policy. Each result has an export artifact and requirement checks.

## Interface references and decisions

[Linear’s March 2026 refresh](https://linear.app/now/behind-the-latest-design-refresh) emphasizes consistent placement and a quieter navigation layer. Its [2024 redesign account](https://linear.app/now/how-we-redesigned-the-linear-ui) also treats alignment, density, and hierarchy as a connected system. Rehearsal adopts a single workspace bar and stable incident controls. The primary workbench places repair branches, observed output, and verification beside one another, keeping the decision visible without scrolling through introductory panels. It does not reproduce Linear’s visual identity.

[Vercel’s Geist system](https://vercel.com/geist/introduction) supplies a useful reference for restrained developer interfaces. Its [typography](https://vercel.com/geist/typography) separates display, reading, and metadata roles; its [tab guidance](https://vercel.com/geist/tabs) distinguishes sibling views from global destinations and describes keyboard operation. Rehearsal uses locally hosted Geist and Geist Mono, five incident tabs with shareable hash URLs, and separate global navigation.

[Vercel’s tracing interface](https://vercel.com/docs/tracing) connects a timeline of measured requests to inspectable span details. Rehearsal applies that interaction to baseline and repaired HTTP execution: select a customer, compare before and after, expand a request, and inspect its actual payload and response. These spans are measured around local ASGI handlers; they are not production telemetry or simulated performance claims.

[Raycast’s navigation model](https://manual.raycast.com/navigation) makes frequently needed actions directly searchable. The workspace command menu applies that principle to pages, incident actions, and source records. It supports keyboard selection, Escape, and focus restoration.

The interface uses a plain wordmark, straight panel boundaries, small control corners, and cobalt for selection. Graph nodes use muted fills and uniform borders; status text identifies failures without relying on color. Selecting a repair updates the graph and its output evidence together. Graph labels use HTML so their text stays readable as the canvas resizes.

The [writing notes](writing.md) cover research into recurring AI writing patterns and the subsequent README and interface edits.

## Implemented improvements

| Improvement                     | Behavior                                                                                                                                                                                      |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Incident workbench              | Selectable repair branches, synchronized graph preview, side-by-side output diff, current owner/context, and verification result.                                                             |
| Expandable dependency graph     | Condensed service view or full operation paths from stored graph relationships; mouse and keyboard inspection.                                                                                |
| Repair matrix                   | Five independent groups: availability, integrity, provenance, freshness, and regression protection.                                                                                           |
| Policy lab                      | Three parallel isolated trials with explicit cache age, freshness limit, and provenance assumptions. The simulator creates no proposal and changes no company record or active service state. |
| Stateful Backboard investigator | Actual tool calls through official MCP contracts; thread IDs, tokens, and reported costs retained with the run.                                                                               |
| Verified incident memory        | Saves the approved repair, requirements at approval, rejected candidates, and follow-up. Historical memory cannot override current evidence.                                                  |
| Event updates                   | Server-sent updates transmit changed run records, with a slower polling fallback. The graph is not rebuilt for every client progress tick.                                                    |
| Investigation history           | Failed, blocked, pending, and completed runs remain inspectable. Historical source references use saved source snapshots.                                                                     |
| Output inspection               | Customer selection, before/after JSON diffs, recorded HTTP spans and payloads, and expected-versus-observed check details.                                                                    |
| Boundary suite                  | Frozen-snapshot replay across cache ages and provenance requirements; 36 actual trials in the default 12-scenario suite, with inspectable cells and an exportable report.                     |
| Connections                     | Validates a Backboard key server-side. A browser-entered key stays in server memory; `.env` supports persistence across restarts.                                                             |
| Accessibility                   | Keyboard navigation, focus restoration, responsive views, reduced-motion support, and automated contrast/label checks.                                                                        |

## Demonstration sequence

1. Rehearse the original incident and open the bypass artifact. Show HTTP 200 alongside the missing required field.
2. Inspect the cache evidence, approve as the current owner, and show the verified receipt.
3. Open the policy lab. A 600-second limit with a 720-second cache rejects every repair.
4. Make provenance optional under the same freshness limit. Bypass becomes eligible in the hypothetical result.
5. Distinguish that hypothetical result from an authoritative policy revision: the lab never authorizes deployment.
6. With Backboard configured and tested, show model-selected tools and the verified-recovery memory path.

## Boundaries and next experiments

The current implementation is a local, synthetic, single-incident simulator. It has three bounded configuration repairs. The model does not patch arbitrary repositories, query live production telemetry, or operate a cloud infrastructure sandbox. The counterfactual lab is an executable policy sensitivity test, not a probabilistic forecast or a benchmark of model accuracy.

The highest-value next experiments would be a versioned catalog of independent faults; a permanent request-format repair with regression coverage; an offline benchmark separating diagnosis accuracy, repair correctness, and unsafe-action rate; and model comparisons using frozen inputs. These are prospective extensions, not implemented features.

The per-run dollar limit uses provider-reported cost and is checked after each response. It can be exceeded by that response and cannot enforce an account-wide credit ceiling. Memory persistence is best effort and separate from the durable local execution receipt; an ambiguous network failure can leave remote memory status uncertain. Subsequent [live verification](verification.md#live-backboard-verification) confirmed Claude Sonnet 4.6 execution, memory persistence and recall, and the account billing ledger. Per-message costs remained unavailable, so the reported-cost limit could not enforce a dollar ceiling in those runs.
