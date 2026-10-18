import {
  chromium,
  expect,
} from "../web/node_modules/@playwright/test/index.mjs";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const baseURL = process.env.REHEARSAL_BASE_URL || "http://127.0.0.1:5182";
assert(
  ["127.0.0.1", "localhost", "[::1]"].includes(new URL(baseURL).hostname),
  "Screenshot capture requires a local demo server.",
);
const root = fileURLToPath(new URL("..", import.meta.url));
const output = `${root}/docs/screenshots`;
const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL === "chromium" ? undefined : "chrome",
  headless: true,
});

try {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 1512, height: 900 },
    deviceScaleFactor: 2,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  async function workspace() {
    const response = await context.request.get("/api/workspace");
    assert(response.ok(), "The local demo server is unavailable.");
    return response.json();
  }
  const initial = await workspace();
  assert(
    !initial.provider.available,
    "Use a separate server with BACKBOARD_API_KEY= and ANTHROPIC_API_KEY=; this script resets sample data.",
  );
  assert(
    !initial.runs.some((run) => ["queued", "running"].includes(run.status)),
    "Wait for the active investigation to finish before capturing screenshots.",
  );
  const headers = { "X-Rehearsal-Request": "1" };
  for (const [path, data] of [
    ["/api/session", { person: "nia" }],
    ["/api/reset", {}],
  ]) {
    const response = await context.request.post(path, { data, headers });
    assert(response.ok(), `${path} failed with HTTP ${response.status()}.`);
  }
  await mkdir(output, { recursive: true });
  const files = [];
  async function capture(name, locator) {
    await page.mouse.move(5, 5);
    await page.evaluate(() => document.fonts.ready);
    const options = { path: `${output}/${name}.png`, animations: "disabled" };
    if (locator) await locator.screenshot(options);
    else await page.screenshot({ ...options, fullPage: true });
    files.push(`docs/screenshots/${name}.png`);
    console.log(`Captured ${name}`);
  }

  await page.goto("/#incident");
  await page.getByLabel("Execution mode").selectOption("guided");
  await page
    .getByRole("button", { name: "Run rehearsal", exact: true })
    .click();
  const review = page.getByRole("button", { name: "Review proposed repair" });
  await expect(review).toBeVisible({ timeout: 30000 });
  await page.getByRole("button", { name: /02 Bypass/ }).click();
  await expect(page.locator(".graph-node.breach")).toContainText("Alder");
  await expect(
    page.locator(".outcome-inspector").getByText("HTTP 200", { exact: true }),
  ).toBeVisible();
  await capture("workbench");

  await page.getByRole("tab", { name: /Comparison/ }).click();
  await expect(page.getByText("Rejected", { exact: true })).toHaveCount(2);
  await expect(page.getByText("Eligible", { exact: true })).toHaveCount(1);
  await capture("comparison", page.locator(".comparison-view"));

  await page.getByRole("tab", { name: "Workbench", exact: true }).click();
  await review.click();
  await capture("approval", page.getByRole("dialog"));
  await page
    .getByRole("button", { name: "Approve and apply repair", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("heading", { name: "Recovery verified" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close panel" }).click();

  await page.getByRole("tab", { name: "Boundary tests", exact: true }).click();
  await page
    .getByRole("button", { name: "Run boundary tests", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "900 seconds, required provenance, Verified cache: eligible",
      exact: true,
    }),
  ).toBeVisible({ timeout: 30000 });
  await expect(
    page.getByRole("button", {
      name: "901 seconds, required provenance, Verified cache: rejected",
      exact: true,
    }),
  ).toBeVisible();
  await capture("boundary-tests", page.locator(".boundary-tests"));

  const final = await workspace();
  assert.equal(final.runs[0].mode, "guided");
  assert.equal(final.runs[0].status, "completed");
  assert.equal(final.runs[0].trials.length, 3);
  assert.equal(final.runtime.mutation_count, 1);
  assert(Object.values(final.exports).every((output) => output.status === 200));
  assert.equal(errors.length, 0, JSON.stringify(errors));
  await mkdir(`${root}/artifacts`, { recursive: true });
  await writeFile(
    `${root}/artifacts/screenshots.json`,
    JSON.stringify(
      {
        captured_at: new Date().toISOString(),
        base_url: baseURL,
        mode: "guided",
        viewport: { width: 1512, height: 900, scale: 2 },
        run_id: final.runs[0].id,
        trial_count: final.runs[0].trials.length,
        mutation_count: final.runtime.mutation_count,
        browser_errors: errors,
        files,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "Screenshots verified: guided run, three trials, one approved change.",
  );
} finally {
  await browser.close();
}
