# Diagram generation prompts

These README assets were generated with the built-in `image_gen` tool and checked against the implementation. Keep the stored relationship names, arrow directions, and approval gates aligned with the code when regenerating them.

| Asset | Source of truth |
| --- | --- |
| [Dependency graph](dependency-graph.png) | [`NODES` and `EDGES`](../../server/seed.py); [impact and worker-footprint queries](../../server/graph.py) |
| [Evidence graph](evidence-graph.png) | [Claim/source creation, revision updates, and decision writes](../../server/graph.py) |
| [Repair algorithm](repair-algorithm.png) | [Recommendation and approval](../../server/engine.py), [trial checks](../../server/workload.py), and [transactional application](../../server/storage.py) |

The dependency graph shows the incident-related subset of entities. The evidence graph is a schema across source revisions; it does not imply that superseded evidence supplies current facts. The algorithm's candidate outcomes use the initial 720-second cache and 900-second policy fixture; later trials use the current context and clock.

## Dependency graph

```text
Use case: infographic-diagram.
Asset: an accurate technical diagram embedded in the GitHub README of Rehearsal, an incident-repair simulator. Make a polished, extremely readable editorial engineering diagram, not a marketing poster. Wide landscape canvas about 2400x1500. Pure white background, generous white space, precise thin orthogonal arrow connectors, restrained rounded rectangles, no shadows, no gradients, no texture, no decorative illustrations, no 3D. Near-black large sans-serif type similar to Geist, monospaced relationship labels. Dark navy-blue for graph/context, muted teal for healthy/passing, muted coral for failures, neutral light gray for generic nodes. Body labels must be comfortably readable when displayed at 900px width. Exact spelling and exact arrow endpoints matter more than decoration. Give the heading modest size; spend most of the canvas on the diagram. Each diagram has a tiny top-left "REHEARSAL / FALKORDB" eyebrow. No extra invented text or relationships.
Title verbatim: "How the outage reaches customers"
Subtitle verbatim: "Two customers are affected. Three share the worker."
Draw exactly these eleven entity boxes and ten directed labeled relationships. The arrows are stored graph edges, not an order-of-execution flow. Names must appear exactly; kind labels can be small above the names.
Nodes:
Alder (customer, affected), Beacon (customer, affected), Cedar (customer, healthy), Rich export (capability), Basic export (capability), Build rich report (operation), Build basic report (operation), Resolve provenance (operation), Export worker (service), Enrichment API (service, failed), INC-204 (incident).
Edges, source -> target, exact relationship label:
Alder -> Rich export: USES
Beacon -> Rich export: USES
Cedar -> Basic export: USES
Rich export -> Build rich report: IMPLEMENTED_BY
Basic export -> Build basic report: IMPLEMENTED_BY
Build rich report -> Resolve provenance: CALLS
Build rich report -> Export worker: RUNS_ON
Build basic report -> Export worker: RUNS_ON
Resolve provenance -> Enrichment API: RUNS_ON
INC-204 -> Enrichment API: OBSERVED_ON

Layout for clarity: five columns. Upper main row Rich export -> Build rich report -> Resolve provenance -> Enrichment API, with Alder and Beacon stacked at the left and each pointing right into Rich export. Lower row Cedar -> Basic export -> Build basic report -> Export worker; INC-204 below Enrichment API, pointing up into that API. The additional Build rich report -> Export worker connector goes down and right through the open gap between rows; keep it distinct from CALLS. Each edge has its own clear arrowhead at the target and its relationship printed once. All rectangles separated with generous gaps for labels. Use coral only for the failed Enrichment API and subtle affected markers on Alder and Beacon; Cedar teal. Worker neutral to show the healthy customer shares it.
Bottom annotation strip: "Impact query: Alder + Beacon" and "Worker footprint: Alder + Beacon + Cedar".
Do not add a direct connection from customer to service. Do not add an edge between Export worker and Enrichment API. Retain every one of the ten specified arrows.
```

## Evidence graph

```text
Use case: infographic-diagram.
Asset: an accurate technical diagram embedded in the GitHub README of Rehearsal, an incident-repair simulator. Make a polished, extremely readable editorial engineering diagram, not a marketing poster. Wide landscape canvas about 2400x1500. Pure white background, generous white space, precise thin orthogonal arrow connectors, restrained rounded rectangles, no shadows, no gradients, no texture, no decorative illustrations, no 3D. Near-black large sans-serif type similar to Geist, monospaced relationship labels. Dark navy-blue for graph/context, muted teal for healthy/passing, muted coral for failures, neutral light gray for generic nodes. Body labels must be comfortably readable when displayed at 900px width. Exact spelling and exact arrow endpoints matter more than decoration. Give the heading modest size; spend most of the canvas on the diagram. Each diagram has a tiny top-left "REHEARSAL / FALKORDB" eyebrow. No extra invented text or relationships.
Title verbatim: "From reviewed facts to an accountable decision"
Subtitle verbatim: "Facts retain their sources. Approved repairs retain their evidence."
Draw a schema diagram with exactly seven nodes, using the exact stored relationship names on directed connectors. Use navy-blue headers on evidence nodes and muted teal on the approved-decision path. Upper evidence row: Claim on left, Source near middle, New source revision on right. Lower decision row: Decision on left, Task in middle-left, Person in middle-right, Team on right. Arrange Source above the gap between Decision and Task so its arrows remain uncrossed. Person and Team are Entity nodes: small secondary labels "Entity · person" and "Entity · team".

Exact nodes, with optional specified smaller detail:
Claim, detail "subject · predicate · value"
Source, detail "document / ticket / chat"
New source revision, detail "Source"
Decision, detail "approved repair"
Task, detail "follow-up"
Person, detail "Entity · person"
Team, detail "Entity · team"

Exactly six directed edges:
Claim -> Source, label "SUPPORTED_BY"
New source revision -> Source, label "SUPERSEDES" (arrow must point LEFT from newer to older Source)
Decision -> Source, label "CITES" (upward diagonal or orthogonal)
Decision -> Task, label "CREATED"
Task -> Person, label "ASSIGNED_TO"
Person -> Team, label "MEMBER_OF"

Use large clear labels and whitespace. Nothing may obscure arrowheads or overlap relationships.
Below the graph place two discrete, unconnected explanatory notes, separated by a thin rule from the graph (not nodes and no connectors):
"Ownership is a claim" with next line 'worker / owner / "nia"' and next line "The subject refers to an entity ID."
"Context metadata" with next line "Reviewed topology hash + revision" and next line "Validated before approval."
These are explanations; do not invent an OWNS edge or connect the notes into the graph. This is a schema showing relationships across revisions; do not label Source as active or current.
```

## Repair algorithm — initial composition

```text
Use case: infographic-diagram.
Asset: an accurate technical diagram embedded in the GitHub README of Rehearsal, an incident-repair simulator. Make a polished, extremely readable editorial engineering diagram, not a marketing poster. Wide landscape canvas about 2400x1500. Pure white background, generous white space, precise thin orthogonal arrow connectors, restrained rounded rectangles, no shadows, no gradients, no texture, no decorative illustrations, no 3D. Near-black large sans-serif type similar to Geist, monospaced relationship labels. Dark navy-blue for graph/context, muted teal for healthy/passing, muted coral for failures, neutral light gray for generic nodes. Body labels must be comfortably readable when displayed at 900px width. Exact spelling and exact arrow endpoints matter more than decoration. Give the heading modest size; spend most of the canvas on the diagram. Each diagram has a tiny top-left "REHEARSAL / FALKORDB" eyebrow. No extra invented text or relationships.
Title verbatim: "A repair must earn approval"
Subtitle verbatim: "Graph facts → isolated trials → owner approval → durable receipt"
Create an elegant, precise numbered flowchart, about 2000x1800 or a landscape 2400x1900 canvas, readable without magnification. Use large type and a clean vertical main flow, with three equal candidate cards in a horizontal row and a narrow right margin for two stop branches. No decorative icons. Use exact short copy below, don't invent extra words.

1. Blue block "Resolve FalkorDB context"
   detail "Affected paths · worker footprint · requirements · owner"
   Arrow down.
2. Section "Test all three on isolated service copies"
   Three equal cards in one row, each headed with candidate:
   "Rollback" / "Schema mismatch" / coral "FAIL"
   "Bypass" / "HTTP 200; required provenance missing" / coral "FAIL"
   "Verified cache" / "Data + provenance + freshness preserved" / teal "PASS"
   A small caption under the row says "Initial fixture: cache age 720 s; policy limit 900 s".
   All three converge via connectors into:
3. A gate "Every required check passes?"
   Directly under it, compact helper text "Availability · data integrity · provenance · schema · unaffected customers · cache policy".
   Arrow from gate to right labeled "No eligible repair" leading to a coral stop box "Abstain / escalate".
   Arrow down labeled "Passing repair" goes to:
4. Blue block "Create a bound proposal"
   detail "Context + runtime + trial hashes · current owner · 2-minute expiry".
   Arrow down to:
5. A distinct navy-outlined gate "Owner approves; server revalidates"
   detail "Read graph again · rerun selected trial · compare output hashes".
   Rightward arrow labeled "Stale or failed" to coral stop box "Block; rehearse again".
   Downward arrow labeled "Valid" to:
6. Teal block "Apply once + save receipt"
   detail "Atomic SQLite transaction · retries reuse the receipt".
   Arrow down to final slim blue block "Sync decision citations + assigned task to FalkorDB"
   detail "Idempotent graph write; retry if interrupted".

Every dependency must be clear. This is not autonomous deployment: owner approval is mandatory and visibly gates applying the repair. Do not show bypass as passing just because HTTP is 200. The condition is candidate eligibility; at least one must pass, not all three candidates. No arrow from a failure stop box to apply. Give the complex gate labels enough room, no tiny type, no cramped line wraps.
```

## Repair algorithm — final layout edit

The initial algorithm image was supplied as the edit target. This edit produces the committed `repair-algorithm.png`.

```text
Use case: infographic-diagram. Edit the supplied Rehearsal workflow diagram to improve readability in a README. Recompose it as a PORTRAIT 3:4 diagram, about 1200 pixels wide by 1600 pixels tall. This is an exact technical workflow, not an illustration. Preserve the white background, navy/blue, teal pass states and coral stop states, simple sans-serif and monospaced details, precise arrows and seven numbered stages. Use flat fills. Make all body text LARGE (at least 24px on a 1200px-wide canvas) and give wrapped lines comfortable leading. Reduce the blank left margin so the main flow occupies about 75% of the image width; reserve 20% on the right for the two stop boxes. Heading modest, two lines if needed.

Exact content, in order:
Eyebrow: "REHEARSAL / FALKORDB"
Title: "A repair must earn approval"
Subtitle: "Graph facts → trials → owner approval → receipt"

1. "Resolve FalkorDB context"
   "Dependencies · requirements · current owner"
   Down arrow to 2.

2. "Test all three on isolated copies"
   Three cards across the main-flow width:
   "Rollback" / "Schema mismatch" / "FAIL"
   "Bypass" / "Required provenance missing" / "FAIL"
   "Verified cache" / "Data + provenance preserved" / "PASS"
   Below cards, caption: "Initial fixture: cache 720 s; policy 900 s".
   Three arrows converge into 3.

3. Change gate wording to EXACTLY "Any repair passes every check?"
   Helper: "Data · availability · provenance · schema · cache policy"
   Right arrow labeled "None" to coral terminal "Abstain / escalate".
   Down arrow labeled "Passing repair" to 4.
   Meaning: every check must pass for a candidate; we need at least one eligible candidate, NOT all three candidates to pass.

4. "Create a bound proposal"
   "Context + runtime + trial hashes"
   "Current owner · expires in 2 minutes"
   Down arrow to 5.

5. "Owner approves; server revalidates"
   "Reread graph · rerun trial · compare outputs"
   Right arrow labeled "Stale / failed" to coral terminal "Block; rehearse again".
   Down arrow labeled "Valid" to 6.

6. "Apply once + save receipt"
   "Atomic SQLite transaction"
   "Retries reuse the receipt"
   Down arrow to 7.

7. "Sync evidence to FalkorDB"
   "Decision citations + assigned follow-up"
   "Idempotent write; retry if interrupted"

Do not omit a stage, misdirect an arrow, or let text overlap. Neither failure branch may connect to application of a repair. Keep each failure box aligned to its actual gate. The two-minute bound and human owner gate must be prominent. All seven stages must fit within the image without clipping. Preserve the original meaning while replacing text with the exact concise copy above.
```
