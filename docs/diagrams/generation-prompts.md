# Diagram generation prompts

The README diagrams were restyled with the built-in `image_gen` tool using the [workbench screenshot](../screenshots/workbench.png) as the visual reference. The palette, typography, node treatment, and spacing follow the app's [studio styles](../../web/src/studio.css) and [base styles](../../web/src/styles.css).

| Asset | Source of truth |
| --- | --- |
| [Dependency graph](dependency-graph.png) | [`NODES` and `EDGES`](../../server/seed.py); [impact and worker-footprint queries](../../server/graph.py) |
| [Evidence graph](evidence-graph.png) | [Claim/source creation, revision updates, and decision writes](../../server/graph.py) |
| [Repair algorithm](repair-algorithm.png) | [Recommendation and approval](../../server/engine.py), [trial checks](../../server/workload.py), and [transactional application](../../server/storage.py) |

Each edit supplied the workbench screenshot as image 1 and the previous version of the corresponding diagram as image 2. Those content references are preserved in commit `d535463`. The full prompt for each asset is the shared style brief followed by its asset-specific section below. Outputs were copied into this directory; README image paths remain unchanged.

The dependency graph shows the incident-related subset of entities. The evidence graph is a schema across source revisions; superseded evidence does not supply current facts. The algorithm's candidate outcomes use the initial 720-second cache and 900-second policy fixture. Labels, arrow directions, and approval gates were checked against the implementation.

## Shared style brief

```text
Use case: style-transfer.
Task: redesign the supplied documentation diagram so it belongs visually to the Rehearsal web application.
Input Image 1 is the STRICT VISUAL STYLE REFERENCE: the actual Rehearsal workbench screenshot. Match its refined, understated, crisp, clean software-interface aesthetic.
Input Image 2 is the CONTENT REFERENCE / EDIT TARGET: the existing diagram. Preserve its technical meaning and exact named relationships, but completely replace its graphic styling. Do NOT preserve the old diagram's typography, huge headline, strong fills, chunky arrows or rounded blocks. The screenshot is the visual authority.

Specific visual system taken from the app CSS:
- Background #f7f8fa; white #ffffff panel headers; graph canvas #fafbfd.
- Main ink #22252d; secondary #656a75. Geist-like sans-serif, medium 500 / semibold 600. Use Geist Mono-like typography for relationship names, small indices, values and metadata.
- Hairline borders #e0e3e8, node borders #d4dae2, connectors #bec7d6. Very thin 1–1.5 px visual strokes with small precise arrow tips.
- Default graph nodes #f1f3f6 with text #425168. Sharp 2–3 px corners.
- Error state: muted background #f7edeb, border #dfc8c2, ink #8b4339.
- Healthy state: muted background #edf3ef, border #c9d8cd, ink #315b44.
- Blue #3156cf appears only as a tiny active-tab underline or narrow accent rule, never as a large filled panel.
- Small status dots, quiet monospaced labels. Large flat white panels divided by subtle lines. Extremely faint dotted graph grid like the screenshot, beneath the node region only.
- NO gradients anywhere, NO glow, NO texture/grain, NO shadows, NO dark filled headers, NO bold blue/red/green banners, NO bright or saturated node fills, NO pill badges, NO giant step numbers, NO marketing-poster type.
- Compact understated page title, comfortable white space, exact visual alignment. The node labels must be substantially larger than tiny screenshot labels so they read well at 900 px README width: about 24px at 1600px source width; relationship labels about 20–22px.
- Do not recreate the screenshot's navigation buttons, personal details, sidebar, or JSON output. Create a standalone DOCUMENTATION DIAGRAM styled using the same design system. It must not look like a screenshot claiming to show a real app screen.
- All text is crisp. All geometry is flat, precise and aligned.
At the top use a restrained white header strip with a small lowercase "rehearsal" wordmark, a thin divider, and "Documentation" in muted text. Beneath it place the compact diagram title and its one-line subtitle, then the main bordered panel. Headline no larger than twice node-label size. No giant eyebrow or slogan.
```

## dependency-graph.png

```text
Canvas: landscape 1600 × 1000 or similar aspect ratio.
Title: "Customer dependencies"
Subtitle: "INC-204 · Enrichment API"
Panel header: "Dependency graph" with tiny blue active underline; right metadata "11 entities · 10 relationships".
Preserve all eleven named entity boxes and ALL TEN labeled directed edges from Image 2:
Alder -> Rich export [USES]
Beacon -> Rich export [USES]
Cedar -> Basic export [USES]
Rich export -> Build rich report [IMPLEMENTED_BY]
Basic export -> Build basic report [IMPLEMENTED_BY]
Build rich report -> Resolve provenance [CALLS]
Build rich report -> Export worker [RUNS_ON]
Build basic report -> Export worker [RUNS_ON]
Resolve provenance -> Enrichment API [RUNS_ON]
INC-204 -> Enrichment API [OBSERVED_ON]
Keep the readable five-column arrangement from Image 2. Show Alder and Beacon stacked in upper left, sharing Rich export; Cedar lower left through Basic export and Build basic report. Build rich report and Build basic report BOTH point into the shared Export worker. INC-204 beneath Enrichment API points UP into that API. Each arrow points to its exact target, labels sit in clear whitespace.
Use subtle small column labels like the screenshot: "CUSTOMERS", "CAPABILITIES", "OPERATIONS", "EXECUTION", "DEPENDENCY". These are layout labels, not extra nodes.
Color Alder, Beacon and Enrichment API with the app's muted failing palette, with tiny dots and small state words "affected", "affected", "failed". Cedar uses muted healthy palette with small state word "healthy". All other nodes neutral gray. No status pills.
Quiet divided footer strip:
"Impact query" / "Alder · Beacon"
"Worker footprint" / "Alder · Beacon · Cedar".
Wrap long node names onto two balanced lines if needed. Do not sacrifice labels, arrowheads or direction. No direct Export worker→Enrichment API edge. All content must fit with comfortable margins.
```

## evidence-graph.png

```text
Canvas: landscape 1600 × 1000 or similar aspect ratio.
Title: "Evidence and ownership"
Subtitle: "Reviewed facts, source revisions and approved repairs"
Panel header: "Evidence graph" with tiny blue active underline; right metadata "7 nodes · 6 relationships".
Keep the exact seven nodes and six arrows from Image 2, but render EVERY node as a subtle light gray app graph node. No colored header bands. Use normal-sized medium-weight names and smaller muted details within the same flat rectangle:
Claim / "subject · predicate · value"
Source / "document / ticket / chat"
New source revision / "Source"
Decision / "approved repair"
Task / "follow-up"
Person / "Entity · person"
Team / "Entity · team"
Exact six directed relationships:
Claim -> Source [SUPPORTED_BY]
New source revision -> Source [SUPERSEDES], points LEFT from newer source to older source.
Decision -> Source [CITES]
Decision -> Task [CREATED]
Task -> Person [ASSIGNED_TO]
Person -> Team [MEMBER_OF]
Preserve the spacious two-row layout: Claim, Source, New source revision in upper row; Decision, Task, Person, Team in lower row. A clear CITES connector rises from Decision to Source. Gentle curved connector or clean orthogonal routing like the app; arrow tips small, visible, precise. Do not omit or reverse any edge.
Use only tiny muted green status dots on Decision and Task; keep their node background neutral. No filled green blocks.
Bottom annotation strip beneath a thin divider, two columns with a subtle vertical rule:
"Ownership is a claim"
'worker / owner / "nia"'
"Subject refers to an entity ID."
and
"Context metadata"
"Reviewed topology hash + revision"
"Validated before approval."
These annotations are NOT extra graph nodes. No invented OWNS relationship. Keep Source generic across revisions, do not label it active/current. Typography and spacing must look like the app's output-diff and graph panels.
```

## repair-algorithm.png

```text
Canvas: PORTRAIT 1200 × 1440 (5:6), a compact readable technical workflow.
Title: "Repair verification"
Subtitle: "Graph context → trials → approval → receipt"
Panel header: "Execution flow" with tiny blue active underline; right metadata "Owner approval required".
Retain the seven-step flow and two stop branches from Image 2, but make it look like a refined app activity / verification panel. Narrow muted monospaced stage indices "01"..."07"; never big colored number blocks. Seven aligned flat WHITE rows/blocks with fine gray borders and 2px corners, soft thin gray connectors down the main lane. Right margin for the two small stop boxes. No blue-filled sections. Only the owner-approval row may have a narrow blue 2px left rule. Body text at least 21–23px on 1200px canvas; title around 34px, row headings about 25px. Keep compact readable proportions, fine white gutters.
Exact content and flow:
01 "Resolve graph context"
   "Dependencies · requirements · current owner"
   Down arrow to 02.
02 "Rehearse all three repairs"
   Render a compact TABLE, like the app verification panel, with three divided rows, NOT three oversized cards:
   "Rollback" | "Schema mismatch" | "Fail"
   "Bypass" | "Required provenance missing" | "Fail"
   "Verified cache" | "Data + provenance preserved" | "Pass"
   Fail appears as a small muted rust dot plus text. Pass appears as a small muted green dot plus text. The table is white/very faint gray, NO saturated filled status banners.
   Small footer within this stage: "Initial fixture: cache 720 s · policy 900 s"
   Down arrow to 03.
03 "Any repair passes every check?"
   "Data · availability · provenance · schema · cache policy"
   Right arrow labeled "None" to small very pale rust terminal "Abstain / escalate".
   Down arrow labeled "Passing repair" to 04.
04 "Create a bound proposal"
   "Context + runtime + trial hashes"
   "Current owner · expires in 2 minutes"
   Down arrow to 05.
05 "Owner approves; server revalidates"
   "Reread graph · rerun trial · compare outputs"
   Right arrow labeled "Stale / failed" to small very pale rust terminal "Block; rehearse again".
   Down arrow labeled "Valid" to 06.
06 "Apply once + save receipt"
   "Atomic SQLite transaction"
   "Retries reuse the receipt"
   Down arrow to 07.
07 "Sync evidence to FalkorDB"
   "Decision citations + assigned follow-up"
   "Idempotent write; retry if interrupted"
No failure terminal connects to application. Approval must gate applying a change. Preserve the conditional branch semantics. Give all short lines room; allow two-line wrap where needed instead of shrinking text. At the bottom a quiet slim status strip: "FalkorDB context · isolated HTTP trials · durable receipt".
```
