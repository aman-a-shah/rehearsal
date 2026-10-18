import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const require = createRequire(new URL("../web/package.json", import.meta.url));
const { chromium } = require("@playwright/test");
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
    .getByRole("button", { name: /Python · unittest.*pricing-service/ })
    .click();
  await page
    .getByRole("heading", { name: "Harbor / pricing-service" })
    .waitFor({ timeout: 30000 });
  assert.match(
    await page.locator("#incident-description").inputValue(),
    /round/i,
  );
  assert.match(await page.locator("#test-command").inputValue(), /unittest/);
  await page.screenshot({
    path: new URL("workspace.png", output).pathname,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Open pricing.py", exact: true })
    .click();
  await page.getByRole("dialog").waitFor();
  assert.match(await page.getByRole("dialog").innerText(), /discounted_total/);
  await page.getByRole("button", { name: "Close file", exact: true }).click();
  console.log(
    "Imported code, graph, source inspection, and run commands verified.",
  );
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
      page.getByRole("link", { name: "Download patch" }).click(),
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
