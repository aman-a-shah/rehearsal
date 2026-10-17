# A three-minute Rehearsal demo

Start `npm run dev`, open http://127.0.0.1:5180, and reset the sample workspace. Select **Nia Chen · owner**. Use **Guided demo · real tools** for a reproducible presentation. It runs real tools but contains no model inference; say that explicitly. Only present live model execution if you have configured and tested a provider key.

## 0:00 — Establish the incident

“Two customers cannot export their reports. A third is healthy. Rehearsal asks which repair restores service while preserving what the company promised.”

Point to Alder and Beacon's dependency on enrichment, then Cedar's independent basic export. Open a graph node or **View graph query** if the audience wants the underlying evidence.

## 0:30 — Test all three repairs

Click **Run rehearsal**. Explain that each trial executes against its own SQLite copy of the export service.

Open **Bypass enrichment**. Its actual response is HTTP 200, but `provenance_id` is missing. Open Alder's agreement to show why a healthy response alone is insufficient. Close the drawer with Escape.

Point to rollback's HTTP 409: the older worker cannot read the current schema, and it also breaks Cedar. The verified cache passes the report, provenance, freshness, and unaffected-customer checks.

## 1:20 — Put the owner in control

Click **Review proposed repair**. The panel shows scope, checks, evidence revision, and accountable owner. The proposal lasts two minutes; approval rechecks current evidence and actual output.

Click **Approve and apply repair**. Open the decision log. Show the saved result, source revisions, follow-up owner, and downloadable evidence. Explain that the receipt survives a retry or an interrupted journal write.

## 2:00 — Change the company evidence

Reset the workspace and run another rehearsal. Before approving it, open **Company context** and propose a maximum cache age of **600** seconds. Switch to **Policy reviewer**, then accept the revision.

Return to **Incident room**. The old proposal is stale. Click **Run a fresh rehearsal**. All three options now fail: the cache started 12 minutes old, so a ten-minute policy disallows it.

“The same incident and the same repair candidates produce a different decision when the company's reviewed requirements change. When nothing passes, Rehearsal stops.”

## Before recording

- Reset immediately before starting. Cache freshness follows the clock.
- Finish approval within its two-minute window; otherwise run a fresh rehearsal.
- Keep the source, output evidence, and rejection visible long enough to read.
- Use the live agent only after a successful real provider run; a mocked provider test is not a live demonstration.
- Disclose that the concept and earlier prototype predate this rebuild. Repository dates record actual rebuild commits; determine competition eligibility from the event's rules.
