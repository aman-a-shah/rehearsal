# Demo video plan

Target: a 3½-minute, 16:9 screen recording of the running application. Keep the selected execution mode visible. Show one complete live investigation through approval and recovery, then a second investigation whose outcome changes after a graph-policy revision. Use the Examples page for the final reproducible boundary check.

## Prepare the recording

1. Follow [setup](../README.md#try-it) and [operator configuration](development.md#backboard). Unlock Connections and verify the Backboard connection before recording. Close the credential form and any terminal showing `.env`.
2. Use a 1920 × 1080 capture with readable browser zoom, notifications off, and the application filling the frame. Record microphone narration; captions are useful. No slides are needed.
3. Select **Nia Chen · owner** and **Backboard agent**. Reset the sample workspace immediately before the take. The cache starts 720 seconds old and expires after another 180 seconds under the initial policy. Approval itself expires two minutes after the proposal.
4. Leave allowance for two live investigations and their continuations. The default hourly limit is three runs. Rehearse narration with **Demo · real tools** or the isolated Examples page so practice does not consume the paid allowance.
5. Keep a copy of the README graph section ready in another tab. Do not open settings, cloud consoles, provider billing, or source files containing credentials during the recording.

## Shot list and narration

Timings are targets, not claims about provider speed. Keep the actual run visible from launch to decision. If a long wait is shortened in editing, label it clearly.

| Time | Show and do | Narration |
| --- | --- | --- |
| 0:00–0:15 | Incident room: Alder and Beacon fail; Cedar remains healthy. | “Rehearsal tests incident repairs against customer requirements. Two customers cannot export. Before changing the service, the agent has to establish who is affected and what a valid report contains.” |
| 0:15–0:35 | **Show operations**. Follow the enrichment path. Open **View graph query → FalkorDB queries**, then the multi-hop impact query. | “FalkorDB connects customers to capabilities, operations, and services. This traversal finds Alder and Beacon. A separate worker-footprint query includes Cedar, because rolling back the shared worker can affect it too.” |
| 0:35–1:05 | Close the drawer. Keep **Backboard agent** visible and click **Run rehearsal**. Open **Activity** while tools execute. | “This is a live Backboard investigation. Its MCP tools read graph context and source records, then test rollback, bypass, and verified cache on separate service copies.” |
| 1:05–1:35 | In **Workbench**, select **Bypass**. Hold the output diff and failed provenance check. Open the Alder agreement citation. Briefly show **Rollback** and **Verified cache**. | “Bypass returns HTTP 200, but it removes the provenance Alder requires. That requirement comes from a reviewed claim and its source in FalkorDB. Rollback cannot read the current schema. Verified cache preserves the required data and passes the current freshness policy.” |
| 1:35–2:00 | **Review proposed repair**: owner, source revisions, checks. **Approve and apply repair**. Show the verified receipt and restored outputs. | “The agent proposes; the owner approves. Approval rechecks the graph and reruns the selected repair. The change and receipt commit together, and retries reuse the receipt. The completed decision cites its sources in FalkorDB.” |
| 2:00–2:25 | Wait for memory sync. Reset. In **Company context**, propose **600** seconds, switch to **Policy reviewer**, accept, then return to Nia. Show the new policy revision. | “Now change one graph fact. This reviewed policy revision lowers the allowed cache age from fifteen minutes to ten. The source revision and active claims change together.” |
| 2:25–3:00 | Return to incident room. Run the **Backboard agent** again. Show all three failed trials and no proposal. | “The restored incident still has a twelve-minute-old cache. It now fails the ten-minute limit. Bypass still violates Alder’s agreement, and rollback still fails. The agent must stop without a repair proposal.” |
| 3:00–3:20 | **Examples → Exactly 900 seconds old → Run example**, then **One second changes the outcome → Run example**. Show opposite results. | “Anyone can reproduce the checks without a key. These isolated examples use one fixed timestamp: cache passes at 900 seconds and fails at 901. They do not change the active service or grant approval.” |
| 3:20–3:30 | README graph diagram and repository link, then return to the app. | “The repository includes the graph queries, verification algorithm, local setup, and tests. Rehearsal uses synthetic company data and three predefined repairs.” |

## What must be visible

- The live-mode selector, the launch click, actual tool activity, candidate results, and recovery receipt.
- An executed FalkorDB query and the source claim responsible for rejecting bypass.
- The accepted graph-policy revision followed by a changed outcome. Changing an Examples/Policy lab assumption alone does not demonstrate a write to the authoritative graph.
- A clear separation between the live agent and the keyless, deterministic examples.

If the provider fails, show its error and rerun within the allowance. Do not substitute guided footage while describing it as live. The guided mode is a useful rehearsal and a valid demonstration of the local tools, but it does not demonstrate model-driven tool selection.

## Runnable examples for viewers

| Link (local development) | Assumptions | Result to inspect |
| --- | --- | --- |
| [Customer agreement](http://127.0.0.1:5180/#examples/agreement) | 720-second cache, 900-second limit, required provenance | Bypass: HTTP 200, missing provenance, rejected. Cache passes. |
| [Stricter policy](http://127.0.0.1:5180/#examples/stricter-policy) | 720-second cache, 600-second limit, required provenance | No eligible repair. |
| [Optional provenance](http://127.0.0.1:5180/#examples/optional-provenance) | Same freshness values, provenance optional | Bypass passes. |
| [Exact boundary](http://127.0.0.1:5180/#examples/exact-boundary) | Cache age equals the 900-second limit | Cache passes. |
| [One second late](http://127.0.0.1:5180/#examples/one-second-late) | 901-second cache, 900-second limit | Complete output still fails freshness. |
| [Two eligible options](http://127.0.0.1:5180/#examples/two-options) | Fresh cache, optional provenance | Bypass and cache pass; the example prefers cache. |

Each example executes the existing verifier and exposes comparison rows, HTTP traces, output diffs, checks, source records, and downloadable JSON. Results are hypothetical and cannot authorize an active-service change.

## Export and submission

Export an H.264 MP4 at 1080p with legible narration/captions. Upload the completed recording to a link judges can open without signing in, and put that link in the README and submission form. Check both video and repository from a signed-out browser. This document is the recording plan; it is not a recorded demo.

### Repeatable browser capture

`npm run demo:record -- live` records the actual workflow in Chrome at 1536 × 864. It resets a local demo workspace, runs two paid Backboard investigations, verifies the first recovery and memory save, changes the authoritative graph policy, and verifies that the second run creates no proposal. Operator authentication happens before the recorded page opens.

Start a separate API-only server with its own state directory and configured operator/provider credentials. Then record against its loopback URL:

```sh
REHEARSAL_BASE_URL=http://127.0.0.1:8785 npm run demo:record -- live
```

The script saves footage, execution evidence, and a timed narration script under `artifacts/demo/`. Use `guided` for keyless practice. `REHEARSAL_RECORD_PACE=0.1` shortens practice holds; accelerated practice takes cannot be exported as submission footage.

With FFmpeg installed, export a completed take:

```sh
npm run demo:export -- artifacts/demo/live-RECORDING_TIMESTAMP
```

This produces `rehearsal-demo.mp4` at 1920 × 1080, with optional English subtitles, plus a separate `captions.srt`. The footage stays at its original speed. It has no voice track; `narration.txt` provides the script for recording one. Keep these large files out of Git and upload the final video separately.

Prior live results are in [verification](verification.md#live-backboard-verification). The project history is explained in [rebuild notes](rebuild.md).
