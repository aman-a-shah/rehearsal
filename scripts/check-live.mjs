import {
  chromium,
  expect,
} from "../web/node_modules/@playwright/test/index.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(
  new URL("../artifacts/live-backboard", import.meta.url),
);
const baseURL = process.env.REHEARSAL_BASE_URL || "http://127.0.0.1:5180";
const scenario = process.argv[2] || "approval";
assert(["approval", "blocked", "preview"].includes(scenario));
await mkdir(root, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  baseURL,
  viewport: { width: 1512, height: 900 },
});
const page = await context.newPage();
const browserErrors = [];
page.on("pageerror", (error) => browserErrors.push(error.message));
const headers = { "X-Rehearsal-Request": "1" };
const log = (step, detail = {}) =>
  console.log(
    JSON.stringify({
      time: new Date().toISOString(),
      scenario,
      step,
      ...detail,
    }),
  );
async function post(path, data = {}) {
  const response = await page.request.post(path, { data, headers });
  const body = await response.json();
  assert(response.ok(), `${path}: ${JSON.stringify(body)}`);
  return body;
}
async function state() {
  const response = await page.request.get("/api/workspace");
  assert(response.ok());
  return response.json();
}
async function save(run, suffix = "") {
  const evidence = JSON.stringify(
    {
      recorded_at: new Date().toISOString(),
      browser_errors: browserErrors,
      run,
    },
    null,
    2,
  );
  await writeFile(`${root}/${scenario}${suffix}.json`, evidence);
  await writeFile(`${root}/${run.id}${suffix}.json`, evidence);
}
try {
  await post("/api/session", { person: "nia" });
  const initial = await state();
  assert(
    initial.provider.available,
    "Backboard is not configured in the running server.",
  );
  assert.equal(initial.provider.name, "Backboard");
  assert(
    !initial.runs.some((run) => ["queued", "running"].includes(run.status)),
    "Another investigation is active.",
  );
  await writeFile(
    `${root}/${scenario}-before-reset.json`,
    JSON.stringify(initial, null, 2),
  );
  await post("/api/reset");
  if (scenario === "blocked") {
    const change = await post("/api/policy/propose", { max_age: 600 });
    await post("/api/session", { person: "reviewer" });
    await post(`/api/policy/${change.id}/review`, { accept: true });
    await post("/api/session", { person: "nia" });
  }
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Export pipeline failure" }),
  ).toBeVisible();
  await page.getByLabel("Execution mode").selectOption("live");
  const launched = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/runs") &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Run rehearsal", exact: true })
    .click();
  const launchResponse = await launched;
  assert(launchResponse.ok());
  let run = await launchResponse.json();
  log("live_run_started", { run_id: run.id, model: initial.provider.model });
  const started = Date.now();
  let previous = "";
  while (Date.now() - started < 210_000) {
    run = await (await page.request.get(`/api/runs/${run.id}`)).json();
    const signature = JSON.stringify([
      run.status,
      run.events.length,
      run.usage?.turns,
    ]);
    if (signature !== previous) {
      previous = signature;
      log("progress", {
        status: run.status,
        tools: run.events.map((event) => ({
          name: event.tool,
          arguments: {
            repair: event.arguments.repair,
            source_key: event.arguments.source_key,
          },
          status: event.status,
        })),
        usage: run.usage,
      });
    }
    if (!["queued", "running"].includes(run.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  await save(run, "-investigation");
  log("decision", {
    status: run.status,
    elapsed_seconds: (Date.now() - started) / 1000,
    recommendation: run.recommendation,
    message: run.message,
    usage: run.usage,
    memory_retrieved: run.memory_retrieved,
  });
  await page.screenshot({
    path: `${root}/${scenario}-decision.png`,
    fullPage: true,
  });
  assert.equal(run.mode, "live");
  assert.equal(run.usage?.provider, "Backboard");
  assert(run.thread_id);
  assert.deepEqual(run.trials.map((trial) => trial.repair).sort(), [
    "bypass",
    "cache",
    "rollback",
  ]);
  assert(
    run.events.some(
      (event) => event.tool === "inspect_context" && event.status === "ok",
    ),
    "The model must inspect current company context and its source records.",
  );
  assert(
    run.context.sources.some(
      (source) => source.key === "cache-policy" && source.authoritative,
    ),
  );
  assert.equal((await state()).runtime.mutation_count, 0);
  if (scenario === "blocked") {
    assert.equal(run.status, "blocked");
    assert.equal(run.recommendation.repair, null);
    assert.equal(run.proposal, null);
    assert(run.trials.every((trial) => !trial.passed));
    await expect(
      page.getByText("No eligible repair", { exact: true }),
    ).toBeVisible();
  } else {
    assert.equal(run.status, "awaiting_approval");
    assert.equal(run.proposal.repair, "cache");
    assert.equal(
      run.trials.find((trial) => trial.repair === "bypass").exports.alder
        .status,
      200,
    );
    assert.equal(
      run.trials.find((trial) => trial.repair === "bypass").passed,
      false,
    );
    await expect(
      page.getByRole("button", { name: "Review proposed repair" }),
    ).toBeVisible();
    if (scenario === "approval") {
      await page
        .getByRole("button", { name: "Review proposed repair" })
        .click();
      await page
        .getByRole("button", { name: "Approve and apply repair", exact: true })
        .click();
      await expect(
        page
          .getByRole("dialog")
          .getByRole("heading", { name: "Recovery verified" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Close panel" }).click();
      await expect(
        page.getByRole("heading", { name: "Export pipeline recovered" }),
      ).toBeVisible();
      const memoryStarted = Date.now();
      while (Date.now() - memoryStarted < 60_000) {
        run = await (await page.request.get(`/api/runs/${run.id}`)).json();
        if (run.memory_sync && run.memory_sync !== "pending") break;
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      await save(run);
      assert.equal(run.status, "completed");
      assert.equal(run.receipt.verified, true);
      assert.equal(run.memory_sync, "saved");
      assert(run.memory_id, "A successful memory write should return an ID.");
      const final = await state();
      assert.equal(final.runtime.mutation_count, 1);
      assert(
        Object.values(final.exports).every((output) => output.status === 200),
      );
      const replayed = await post(`/api/runs/${run.id}/approve`, {
        digest: run.proposal.digest,
      });
      assert.equal(replayed.run_id, run.id);
      assert.deepEqual(replayed, run.receipt);
      assert.equal((await state()).runtime.mutation_count, 1);
      log("recovery_and_memory_verified", {
        receipt_run_id: run.receipt.run_id,
        memory_id: run.memory_id,
        memory_sync: run.memory_sync,
        mutation_count: 1,
      });
    }
  }
  await page.getByRole("tab", { name: /Activity/ }).click();
  await expect(
    page.getByText("Live investigator", { exact: true }),
  ).toBeVisible();
  if (scenario === "approval")
    await expect(
      page.getByText(
        "Verified recovery saved to Backboard memory. Future investigations can recall this evidence.",
      ),
    ).toBeVisible();
  await page.screenshot({
    path: `${root}/${scenario}-activity.png`,
    fullPage: true,
  });
  assert.deepEqual(browserErrors, []);
  await save(run);
  log("passed", {
    run_id: run.id,
    usage: run.usage,
    memory_retrieved: run.memory_retrieved,
    browser_errors: browserErrors.length,
  });
} catch (error) {
  await page
    .screenshot({ path: `${root}/${scenario}-failure.png`, fullPage: true })
    .catch(() => {});
  log("failed", { error: error.message });
  process.exitCode = 1;
} finally {
  await browser.close();
}
