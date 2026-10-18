import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const require = createRequire(new URL("../web/package.json", import.meta.url));
const { chromium, expect } = require("@playwright/test");
const url = process.env.REHEARSAL_CHECK_URL || "http://127.0.0.1:8786";
if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname))
  throw new Error("Run this verification against a local test workspace.");
const live = process.env.REHEARSAL_CHECK_LIVE === "1";
const output = new URL("../artifacts/repositories/", import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1536, height: 1000 },
  reducedMotion: "reduce",
  acceptDownloads: true,
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(url, { waitUntil: "networkidle" });
  await page
    .getByRole("heading", { name: "Fix an incident in your own codebase." })
    .waitFor();
  await page.screenshot({
    path: new URL("home.png", output).pathname,
    fullPage: true,
  });
  console.log("Home screen loaded.");
  await page
    .getByRole("button", { name: /Python · unittest.*order-service/ })
    .click();
  await page
    .getByRole("heading", { name: "Harbor / order-service" })
    .waitFor({ timeout: 30000 });
  assert.match(
    await page.locator("#incident-description").inputValue(),
    /coupon/i,
  );
  assert.match(await page.locator("#test-command").inputValue(), /unittest/);
  assert.equal(await page.locator(".repo-graph-file").count(), 28);
  await page.getByRole("button", { name: "Expand graph", exact: true }).click();
  await page.getByRole("button", { name: "Fit graph to view" }).click();
  await page.keyboard.press("Escape");
  await page.screenshot({
    path: new URL("workspace.png", output).pathname,
    fullPage: true,
  });
  await page
    .getByRole("button", {
      name: "Inspect discounts.py commerce (commerce/discounts.py)",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "View source", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  assert.match(await page.getByRole("dialog").innerText(), /allocate_discount/);
  await page.getByRole("button", { name: "Close file", exact: true }).click();
  console.log(
    "Imported code, graph, source inspection, and run commands verified.",
  );
  const graph = page.getByRole("region", {
    name: "Repository dependency graph",
    exact: true,
  });
  const graphBox = await graph.boundingBox();
  const graphTransform = () =>
    page.locator(".repo-graph-canvas > svg > g").getAttribute("transform");
  const selectedFile = () =>
    page
      .locator('.repo-graph-file[aria-pressed="true"]')
      .getAttribute("data-file");
  const selection = await selectedFile();
  const transform = await graphTransform();
  for (const name of [
    "Activity",
    "Tests",
    "Patch",
    "Graph evidence",
    "Overview",
  ]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(graph).toBeVisible();
    assert.deepEqual(
      await graph.boundingBox(),
      graphBox,
      "Changing tabs moved the graph",
    );
    assert.equal(
      await graphTransform(),
      transform,
      "Changing tabs reset the graph viewport",
    );
    assert.equal(
      await selectedFile(),
      selection,
      "Changing tabs reset the selected file",
    );
  }
  // Exercise the running UI without model/sandbox usage. These staged responses
  // are layout fixtures, not evidence of a successful repair.
  if (!live) {
    const projectId = new URL(page.url()).hash.split("/")[1];
    const baseline = {
      exit_code: 1,
      test_count: 46,
      duration_ms: 100,
      test_command: "python -m unittest discover -s tests -v",
      setup_output: "",
      output: "UI fixture: failing check\n".repeat(60),
    };
    let staged = {
      id: "ui-layout-check",
      project_id: projectId,
      status: "running",
      stage: "baseline",
      incident: "UI fixture",
      candidates: [],
      recommended: null,
      events: [
        {
          stage: "baseline",
          message: "UI fixture: running original checks",
          at: Date.now() / 1000,
        },
      ],
    };
    await page.route("**/api/code/projects/*/runs", (route) =>
      route.fulfill({ json: staged }),
    );
    await page.route("**/api/code/runs/ui-layout-check", (route) =>
      route.fulfill({ json: staged }),
    );
    await page
      .getByRole("button", { name: "Run rehearsal", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Stop rehearsal", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("UI fixture: running original checks", { exact: true }),
    ).toBeVisible();
    assert.equal(await page.locator("#repo-incident-panel").isVisible(), false);
    assert.deepEqual(
      await graph.boundingBox(),
      graphBox,
      "Starting a run moved the graph",
    );
    staged = {
      ...staged,
      baseline,
      stage: "generating",
      events: [
        ...staged.events,
        {
          stage: "graph",
          message: "UI fixture: traversing imports",
          at: Date.now() / 1000,
        },
      ],
      context: {
        seeds: ["commerce/totals.py"],
        files: ["commerce/totals.py", "commerce/discounts.py"],
        editable: ["commerce/discounts.py"],
        affected_tests: ["tests/test_discounts.py"],
        owners: [],
        queries: [],
        omitted_files: 0,
      },
    };
    await expect(
      page.getByText("UI fixture: traversing imports", { exact: true }),
    ).toBeVisible({ timeout: 10000 });
    assert.equal(
      await selectedFile(),
      selection,
      "Polling replaced the manual file selection",
    );
    assert.equal(
      await graphTransform(),
      transform,
      "Polling reset graph pan/zoom",
    );
    await page
      .getByRole("button", { name: "Follow the repair automatically" })
      .click();
    await expect(
      page.locator('.repo-graph-file[aria-pressed="true"]'),
    ).toHaveAttribute("data-file", "commerce/totals.py");
    await page.locator('[data-file="commerce/discounts.py"]').click();
    await page.getByRole("button", { name: "Tests", exact: true }).click();
    await page.locator(".repo-evidence").evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await page
      .locator(".repo-log pre")
      .first()
      .evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
    assert.deepEqual(
      await graph.boundingBox(),
      graphBox,
      "Scrolling tests moved the graph",
    );
    await expect(graph).toBeInViewport({ ratio: 1 });
    staged = {
      ...staged,
      status: "review",
      stage: "complete",
      recommended: "1",
      candidates: [
        {
          id: "1",
          title: "UI fixture patch",
          reason: "A layout fixture, not a generated repair.",
          status: "verified",
          changes: { "commerce/discounts.py": "# UI fixture" },
          patch:
            "diff --git a/commerce/discounts.py b/commerce/discounts.py\n@@ -1 +1 @@\n-old\n+new",
          trial: { ...baseline, exit_code: 0 },
          verification: { ...baseline, exit_code: 0 },
        },
      ],
    };
    await expect(
      page.getByRole("button", { name: "Stop rehearsal", exact: true }),
    ).toHaveCount(0, { timeout: 10000 });
    await page.getByRole("button", { name: /^Patch/ }).click();
    await expect(
      page.getByRole("heading", { name: "UI fixture patch" }),
    ).toBeVisible();
    await expect(graph).toBeInViewport({ ratio: 1 });
    assert.deepEqual(
      await graph.boundingBox(),
      graphBox,
      "Finishing a run moved the graph",
    );
    await page.getByRole("button", { name: "Incident", exact: true }).click();
    await expect(page.locator("#incident-description")).toBeVisible();
    await page.getByRole("button", { name: "Incident", exact: true }).click();
    console.log(
      "Staged UI run: graph stays visible through polling, tests, patch review, scrolling, and incident toggles.",
    );
  }
  if (live) {
    await page
      .getByRole("button", { name: "Run rehearsal", exact: true })
      .click();
    console.log(
      "Live rehearsal started: original tests, model-generated patches, fresh repeat.",
    );
    let run;
    for (let attempt = 0; attempt < 160; attempt++) {
      const response = await page.request.get(url + "/api/code/runs");
      const runs = await response.json();
      run = runs[0];
      if (run && !["queued", "running"].includes(run.status)) break;
      if (attempt % 8 === 0 && run) console.log("Stage:", run.stage);
      await new Promise((r) => setTimeout(r, 2500));
    }
    assert.equal(run?.status, "review", run?.message || "Run did not finish");
    assert.equal(run.baseline.exit_code, 1);
    assert.equal(run.baseline.test_count, 46);
    const chosen = run.candidates.find((c) => c.id === run.recommended);
    assert.equal(chosen.status, "verified");
    assert.equal(chosen.trial.exit_code, 0);
    assert.equal(chosen.verification.exit_code, 0);
    assert.equal(chosen.trial.test_count, run.baseline.test_count);
    assert(run.context.queries.some((q) => q.query.includes("IMPORTS*0..8")));
    await page.getByRole("button", { name: /^Patch/ }).click();
    await page
      .getByText("The same checks passed in two fresh sandboxes.")
      .waitFor({ timeout: 10000 });
    await page.screenshot({
      path: new URL("verified-patch.png", output).pathname,
      fullPage: true,
    });
    const download = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: "Download patch" }).first().click(),
    ]);
    await download[0].saveAs(new URL("verified.patch", output).pathname);
    await page.getByRole("button", { name: "Tests", exact: true }).click();
    await page.screenshot({
      path: new URL("test-evidence.png", output).pathname,
      fullPage: true,
    });
    await writeFile(
      new URL("live-evidence.json", output),
      JSON.stringify(run, null, 2),
    );
    console.log(
      JSON.stringify({
        status: run.status,
        baseline: run.baseline.exit_code,
        tests: run.baseline.test_count,
        candidates: run.candidates.map((c) => ({
          title: c.title,
          status: c.status,
          exit: c.trial?.exit_code,
        })),
        model_usage: run.usage,
      }),
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: new URL("mobile.png", output).pathname,
    fullPage: true,
  });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
    "Mobile page overflows horizontally",
  );
  assert.deepEqual(errors, []);
  console.log("Browser checks passed; no page errors or mobile overflow.");
} finally {
  await browser.close();
}
