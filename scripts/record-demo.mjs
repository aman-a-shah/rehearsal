import { chromium, expect } from "../web/node_modules/@playwright/test/index.mjs";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

try {
  process.loadEnvFile(fileURLToPath(new URL("../.env", import.meta.url)));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const mode = process.argv[2] || "guided";
assert(["guided", "live"].includes(mode), "Choose guided or live.");
const baseURL = process.env.REHEARSAL_BASE_URL || "http://127.0.0.1:8785";
assert(["127.0.0.1", "localhost", "[::1]"].includes(new URL(baseURL).hostname),
  "Recording resets the sample and is restricted to a local demo workspace.");
const pace = Number(process.env.REHEARSAL_RECORD_PACE || 1);
assert(Number.isFinite(pace) && pace > 0 && pace <= 1);
const stamp = new Date().toISOString().replaceAll(":", "-");
const output = fileURLToPath(new URL(`../artifacts/demo/${mode}-${stamp}/`, import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  baseURL,
  viewport: { width: 1536, height: 864 },
  deviceScaleFactor: 1,
  recordVideo: { dir: output, size: { width: 1536, height: 864 } },
});
const headers = { "X-Rehearsal-Request": "1" };
const shots = [], runs = [], browserErrors = [];
let page, video, started, succeeded = false;
const hold = (seconds) => new Promise(resolve => setTimeout(resolve, seconds * 1000 * pace));
async function post(path, data = {}) {
  const response = await context.request.post(path, { data, headers });
  assert(response.ok(), `${path}: HTTP ${response.status()}`);
  return response.json();
}
async function workspace() {
  const response = await context.request.get("/api/workspace");
  assert(response.ok(), "The local demo workspace is unavailable.");
  return response.json();
}
function mark(id, narration) {
  const start = (Date.now() - started) / 1000;
  if (shots.length) shots.at(-1).end = start;
  shots.push({ id, start, narration });
  console.log(JSON.stringify({ shot: id, seconds: Math.round(start), mode }));
}
async function launch() {
  const response = page.waitForResponse(r => r.url().endsWith("/api/runs") && r.request().method() === "POST");
  await page.getByLabel("Execution mode").selectOption(mode);
  await page.getByRole("button", { name: "Run rehearsal", exact: true }).click();
  const launched = await response;
  assert(launched.ok());
  const initial = await launched.json();
  await page.getByRole("tab", { name: /Activity/ }).click();
  const deadline = Date.now() + 210000;
  let run;
  do {
    const response = await context.request.get(`/api/runs/${initial.id}`);
    assert(response.ok());
    run = await response.json();
    if (!["queued", "running"].includes(run.status)) break;
    await hold(1 / pace);
  } while (Date.now() < deadline);
  assert.equal(run.mode, mode);
  assert.deepEqual(run.trials.map(t => t.repair).sort(), ["bypass", "cache", "rollback"]);
  if (mode === "live") {
    assert.equal(run.usage.provider, "Backboard");
    assert(run.thread_id);
  }
  runs.push(run);
  await hold(3);
  await page.getByRole("tab", { name: "Workbench", exact: true }).click();
  return run;
}

try {
  let initial = await workspace();
  assert(!initial.runs.some(r => ["queued", "running"].includes(r.status)), "Another investigation is active.");
  if (mode === "live") {
    assert(initial.provider.available && initial.provider.name === "Backboard", "Configure Backboard on the demo server.");
  }
  // Authenticate before opening the recorded page; credentials never appear in footage.
  if (initial.access.operator_configured) {
    assert(process.env.REHEARSAL_OPERATOR_TOKEN?.length >= 32, "Configure the operator token locally.");
    await post("/api/operator/login", { token: process.env.REHEARSAL_OPERATOR_TOKEN });
  }
  await post("/api/session", { person: "nia" });
  await post("/api/reset");
  page = await context.newPage();
  video = page.video();
  // Chrome's headless window includes an 87px toolbar inset in screencasts.
  // Enlarge the backing window while retaining the exact 16:9 page viewport.
  const cdp = await context.newCDPSession(page);
  const { windowId } = await cdp.send("Browser.getWindowForTarget");
  await cdp.send("Browser.setWindowBounds", { windowId, bounds: { width: 1536, height: 951 } });
  started = Date.now();
  page.on("pageerror", error => browserErrors.push(error.message));
  await page.goto("/#incident");
  await expect(page.getByRole("heading", { name: "Export pipeline failure", exact: true })).toBeVisible();
  await page.getByLabel("Execution mode").selectOption(mode);
  mark("incident", "Rehearsal tests incident repairs against customer requirements. Alder and Beacon cannot export. Cedar is still healthy. Before changing the service, we need to know who is affected and what a valid report contains.");
  await hold(10);

  await page.getByRole("button", { name: "Show operations", exact: true }).click();
  mark("dependencies", "FalkorDB connects customers to capabilities, operations, and services. Rich exports depend on enrichment. The shared export worker also serves Cedar, so a rollback has a wider footprint than the original outage.");
  await hold(9);
  await page.getByRole("button", { name: "View graph query", exact: true }).click();
  await page.getByRole("button", { name: "FalkorDB queries", exact: true }).click();
  const impact = page.locator(".query-list details").filter({ hasText: "Multi-hop customer impact" }).last();
  await expect(impact).toBeVisible();
  if (!(await impact.getAttribute("open"))) await impact.locator("summary").click();
  await impact.scrollIntoViewIfNeeded();
  mark("cypher", "This is the executed, parameterized Cypher traversal. It follows customer dependencies to the failed service. A separate worker-footprint query protects unaffected customers too.");
  await hold(8);
  await page.getByRole("button", { name: "Close panel", exact: true }).click();

  mark("investigation", mode === "live"
    ? "This is a live Backboard investigation. The model selects MCP tools to read graph context and source records, then runs rollback, bypass, and verified cache on isolated service copies. The activity shown here is the actual execution."
    : "This is the guided rehearsal. It uses a fixed sequence of real MCP tools, FalkorDB queries, and HTTP trials, without model inference. The live Backboard mode selects its tools through the model.");
  const first = await launch();
  assert.equal(first.status, "awaiting_approval");
  assert.equal(first.proposal.repair, "cache");
  await page.getByRole("button", { name: /02 Bypass/ }).click();
  await expect(page.locator(".graph-node.breach")).toContainText("Alder");
  mark("bypass", "Bypass returns HTTP 200, but Alder's output is missing required provenance. Availability alone is not success. The verifier checks the customer's requirements as well as the response.");
  await hold(10);
  await page.getByRole("button", { name: /Provenance is required/ }).click();
  await expect(page.getByRole("dialog")).toContainText("Alder export agreement");
  mark("source", "The requirement comes from Alder's agreement, stored as a reviewed claim with its source revision in FalkorDB. The graph supplies the rule that rejects the superficially successful repair.");
  await hold(8);
  await page.getByRole("button", { name: "Close panel", exact: true }).click();
  await page.getByRole("button", { name: /01 Rollback/ }).click();
  mark("rollback", "Rollback fails because the older worker cannot read the current schema. It also reaches Cedar, which was healthy before the incident.");
  await hold(6);
  await page.getByRole("button", { name: /03 Verified cache/ }).click();
  mark("cache", "Verified cache preserves report data and provenance, and its age is within the current policy. Only a repair that passes every required check can be proposed.");
  await hold(7);
  await page.getByRole("button", { name: "Review proposed repair", exact: true }).click();
  mark("approval", "The agent proposes; the current owner approves. The proposal binds the graph context, runtime, and trial evidence, and expires after two minutes. Approval reads the graph again and reruns the selected repair.");
  await hold(9);
  await page.getByRole("button", { name: "Approve and apply repair", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Recovery verified", exact: true })).toBeVisible();
  mark("receipt", "All three exports recover. The change and receipt commit together. Retries reuse this receipt, while the approved decision cites its source revisions and creates an assigned follow-up in FalkorDB.");
  await hold(9);
  await page.getByRole("button", { name: "Close panel", exact: true }).click();
  if (mode === "live") {
    const deadline = Date.now() + 60000;
    let recovered;
    do {
      recovered = await (await context.request.get(`/api/runs/${first.id}`)).json();
      if (recovered.memory_sync && recovered.memory_sync !== "pending") break;
      await hold(1 / pace);
    } while (Date.now() < deadline);
    assert.equal(recovered.memory_sync, "saved");
    runs[0] = recovered;
  }
  const restored = await workspace();
  assert.equal(restored.runtime.mutation_count, 1);
  assert(Object.values(restored.exports).every(e => e.status === 200));

  await page.getByRole("button", { name: "Reset sample workspace", exact: true }).click();
  await page.getByRole("button", { name: "Reset workspace", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Export pipeline failure", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Company context", exact: true }).click();
  mark("policy", "Now reset the incident and change one graph fact. The reviewed cache policy currently allows nine hundred seconds. We will lower that limit to six hundred seconds.");
  await page.getByLabel("Proposed maximum age").fill("600");
  await hold(5);
  await page.getByRole("button", { name: "Propose policy revision" }).click();
  await page.getByRole("button", { name: "Switch to Policy reviewer" }).click();
  await hold(3);
  await page.getByRole("button", { name: "Accept revision", exact: true }).click();
  await expect(page.locator(".policy-current")).toContainText("600");
  mark("accepted-policy", "The reviewer accepts the revision. The source history and active claims change together in FalkorDB. This changes the authoritative policy, not a hypothetical example setting.");
  await hold(7);
  await page.getByLabel("Demo identity").selectOption("nia");
  await page.getByRole("link", { name: "Incident room", exact: true }).click();
  mark("second-investigation", mode === "live"
    ? "A second live investigation reads the revised graph context. The cache is already twelve minutes old, so it now fails the ten-minute limit. Earlier recovery memory cannot override the current policy."
    : "The second guided rehearsal reads the revised graph context. The cache is already twelve minutes old, so it now fails the ten-minute limit.");
  const second = await launch();
  assert.equal(second.status, "blocked");
  assert.equal(second.proposal, null);
  assert(second.trials.every(t => !t.passed));
  await page.getByRole("tab", { name: /Comparison/ }).click();
  mark("blocked", "All three candidates fail. No repair proposal is created and no change can be approved. Changing a fact in the graph changed what the agent was allowed to do.");
  await hold(9);

  for (const [id, expected, narration] of [
    ["exact-boundary", "Verified cache recommended", "The public examples let anyone reproduce the checks without a key. This isolated case uses a fixed timestamp: cache age exactly nine hundred seconds passes a nine-hundred-second policy."],
    ["one-second-late", "No eligible repair", "One second later, the same complete output fails freshness. These examples execute the real verifier on isolated copies. They do not modify the active service or grant approval."],
  ]) {
    await page.goto(`/#examples/${id}`);
    await page.getByRole("button", { name: "Run example", exact: true }).click();
    await expect(page.locator(".example-result-heading").getByRole("heading", { name: expected, exact: true })).toBeVisible();
    mark(id, narration);
    await hold(9);
  }
  mark("closing", "The public repository includes the graph model, queries, verification algorithm, setup, and tests. Rehearsal uses synthetic company data and three predefined repairs, with explicit owner approval before application.");
  await hold(9);
  assert.equal(browserErrors.length, 0);
  succeeded = true;
} finally {
  if (shots.length) shots.at(-1).end = (Date.now() - started) / 1000;
  await context.close();
  if (video) await video.saveAs(`${output}/recording.webm`);
  await browser.close();
  await writeFile(`${output}/recording.json`, JSON.stringify({ mode, succeeded, recorded_at: stamp, viewport: { width: 1536, height: 864 }, pacing: pace, shots, runs, browser_errors: browserErrors }, null, 2) + "\n");
  const transcript = shots.map(s => `${s.start.toFixed(1)}–${s.end.toFixed(1)}s · ${s.id}\n${s.narration}`).join("\n\n");
  await writeFile(`${output}/narration.txt`, `Rehearsal — ${mode} demo\n${succeeded ? "Verified recording" : "Incomplete take — do not submit"}\n\n${transcript}\n`);
  console.log(JSON.stringify({ output, succeeded, mode }));
}
