import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";

const artifacts = path.resolve("..", "artifacts");
test.beforeAll(() => fs.mkdirSync(artifacts, { recursive: true }));
test.beforeEach(async ({ page }) => {
  await page.request.post("/api/session", {
    data: { person: "nia" },
    headers: { "X-Rehearsal-Request": "1" },
  });
  const response = await page.request.post("/api/reset", {
    data: {},
    headers: { "X-Rehearsal-Request": "1" },
  });
  expect(response.ok()).toBeTruthy();
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Export pipeline failure" }),
  ).toBeVisible();
});

test("compare actual artifacts, approve once, and inspect the decision", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1512, height: 900 });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: path.join(artifacts, "incident-start.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Run rehearsal", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Review proposed repair" }),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(artifacts, "incident-tested.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: /02 Bypass/ }).click();
  await page.getByRole("button", { name: "Open full evidence" }).click();
  await expect(
    page.getByRole("dialog").getByText("HTTP 200", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("dialog")
      .getByText("Alder’s report is missing required provenance."),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(artifacts, "artifact-evidence.png"),
    fullPage: false,
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Open full evidence" }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Review proposed repair" }).click();
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
  await page.getByRole("button", { name: "Open decision log" }).click();
  await page
    .getByRole("button", {
      name: /Use the verified cache.*Approved by Nia Chen/,
    })
    .click();
  await expect(page.getByText("Follow-up assigned to Nia Chen")).toBeVisible();
  const response = await page.request.get("/api/workspace");
  expect((await response.json()).runtime.mutation_count).toBe(1);
});

test("review a policy change and observe a different decision", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Run rehearsal", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Review proposed repair" }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Company context", exact: true })
    .click();
  await page
    .getByRole("spinbutton", { name: "Proposed maximum age" })
    .fill("600");
  await page.getByRole("button", { name: "Propose policy revision" }).click();
  await expect(
    page.getByText("Awaiting review", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Switch to Policy reviewer" }).click();
  await page.getByRole("button", { name: "Accept revision" }).click();
  await expect(
    page.getByRole("button", { name: /Verified cache policy 600 seconds/ }),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(artifacts, "company-context.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("link", { name: "Incident room" }).click();
  await expect(page.getByText(/Company evidence changed\./)).toBeVisible();
  await page.getByRole("button", { name: "Run a fresh rehearsal" }).click();
  await expect(
    page.getByText("No eligible repair", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: /Comparison/ }).click();
  await expect(page.getByText("Rejected", { exact: true })).toHaveCount(3);
  await page.screenshot({
    path: path.join(artifacts, "policy-blocked.png"),
    fullPage: true,
    animations: "disabled",
  });
});

test("an expert cannot approve and the owner can take over", async ({
  page,
}) => {
  await page.getByLabel("Demo identity").selectOption("mira");
  await page
    .getByRole("button", { name: "Run rehearsal", exact: true })
    .click();
  await page.getByRole("button", { name: "Review proposed repair" }).click();
  await expect(
    page.getByRole("button", { name: "Approve and apply repair", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Switch demo identity to Nia Chen" })
    .click();
  await expect(
    page.getByRole("button", { name: "Approve and apply repair", exact: true }),
  ).toBeEnabled();
});

test("source search, pending revision, and keyboard drawer dismissal", async ({
  page,
}) => {
  await page
    .getByRole("link", { name: "Company context", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Search company sources" })
    .fill("no-such-record");
  await expect(page.getByText("No matching records")).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).click();
  await page
    .getByRole("button", {
      name: /OP-17 · Cache operating policy Platform engineering/,
    })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("spinbutton", { name: "Proposed maximum age" })
    .fill("650");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Propose policy revision" })
    .click();
  await expect(
    page.getByRole("dialog").getByText("650s", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", {
      name: /OP-17 · Cache operating policy Platform engineering/,
    })
    .click();
  await expect(
    page.getByRole("dialog").getByText("650s", { exact: true }),
  ).toBeVisible();
});

test("mobile navigation and repair review stay within the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Run rehearsal", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Review proposed repair" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: path.join(artifacts, "mobile-incident.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Review proposed repair" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(
    await page
      .getByRole("dialog")
      .evaluate((el) => el.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
  await page.screenshot({
    path: path.join(artifacts, "mobile-approval.png"),
    fullPage: false,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Close panel" }).click();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .getByRole("link", { name: "Company context", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Company context" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
});

test("main screens and review panel pass automated accessibility checks", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const scan = async () => {
    await page.evaluate(() =>
      Promise.all(
        document
          .getAnimations()
          .filter(
            (animation) =>
              animation.effect?.getTiming().iterations !== Infinity,
          )
          .map((animation) => animation.finished.catch(() => {})),
      ),
    );
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(
      result.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          summary: n.failureSummary,
        })),
      })),
    ).toEqual([]);
  };
  await scan();
  await page
    .getByRole("button", { name: "Run rehearsal", exact: true })
    .click();
  await page.getByRole("button", { name: "Review proposed repair" }).click();
  await scan();
  await page.getByRole("button", { name: "Close panel" }).click();
  await page
    .getByRole("link", { name: "Company context", exact: true })
    .click();
  await scan();
});

test("counterfactual lab changes the outcome without changing company authority", async ({
  page,
}) => {
  const before = await (await page.request.get("/api/workspace")).json();
  await page.getByRole("tab", { name: "Policy lab" }).click();
  await expect(page).toHaveURL(/#incident\/lab$/);
  await page.getByRole("button", { name: /Stricter freshness/ }).click();
  await page
    .getByRole("button", { name: "Run simulation", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "No repair satisfies these conditions.",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Optional provenance/ }).click();
  await expect(
    page.getByText(
      "Inputs changed. Run the simulation again to update these results.",
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Run simulation", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "One repair is eligible under these conditions.",
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Bypass enrichment passes the executable checks."),
  ).toBeVisible();
  await page.getByRole("button", { name: /Bypass enrichment/ }).click();
  await expect(
    page.getByRole("dialog").getByText("Every requirement passed"),
  ).toBeVisible();
  await expect(
    page
      .getByRole("dialog")
      .getByText("Alder’s report is missing required provenance."),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  const after = await (await page.request.get("/api/workspace")).json();
  expect(after.runtime).toEqual(before.runtime);
  expect(after.context.fingerprint).toBe(before.context.fingerprint);
  expect(after.runs).toEqual([]);
  expect(after.decisions).toEqual([]);
  await page.screenshot({
    path: path.join(artifacts, "policy-lab.png"),
    fullPage: true,
  });
  await page.reload();
  await expect(page.getByRole("tab", { name: "Policy lab" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("command search, expanded graph, baseline evidence, and run archive", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Show operations" }).click();
  await expect(
    page.getByRole("button", { name: /Build rich report Graph dependency/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Build rich report Graph dependency/ })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("heading", { name: "Direct relationships" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /Search workspace/ }).click();
  await page
    .getByRole("combobox", { name: "Search commands and evidence" })
    .fill("Alder export agreement");
  await page.keyboard.press("Enter");
  await expect(
    page
      .getByRole("dialog")
      .getByRole("heading", { name: "Alder export agreement" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Run rehearsal", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Review proposed repair" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /02 Bypass/ }).click();
  await page.getByRole("button", { name: "Open full evidence" }).click();
  await page
    .getByRole("button", { name: "Compare with baseline output" })
    .click();
  await expect(
    page.getByRole("dialog").getByText("HTTP 502", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "Decision log", exact: true }).click();
  await page.locator(".archive-row").first().click();
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: "Rehearsal record" }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog").getByText("Waiting for owner approval"),
  ).toBeVisible();
});

test("lab, connections, and command search have accessible desktop and mobile layouts", async ({
  page,
}) => {
  const scan = async () => {
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(
      result.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          summary: n.failureSummary,
        })),
      })),
    ).toEqual([]);
  };
  await page.getByRole("tab", { name: "Policy lab" }).click();
  await scan();
  await page.getByRole("link", { name: "Connections", exact: true }).click();
  await expect(
    page
      .getByRole("main")
      .getByRole("button", { name: "Connect Backboard", exact: true }),
  ).toBeDisabled();
  await scan();
  await page.getByRole("button", { name: /Search workspace/ }).click();
  await scan();
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel("API key")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await scan();
  await page.screenshot({
    path: path.join(artifacts, "mobile-connections.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("link", { name: "Incident room" }).click();
  await page.getByRole("tab", { name: "Policy lab" }).click();
  await page.getByRole("button", { name: /Stricter freshness/ }).click();
  await page
    .getByRole("button", { name: "Run simulation", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "No repair satisfies these conditions.",
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await scan();
  await page.screenshot({
    path: path.join(artifacts, "mobile-policy-lab.png"),
    fullPage: true,
  });
});

test("repair branches update the graph, output diff, and recorded request trace", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1512, height: 900 });
  await page
    .getByRole("button", { name: "Run rehearsal", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Review proposed repair" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /02 Bypass/ }).click();
  const inspector = page.getByRole("region", { name: "Response inspector" });
  await expect(
    page.getByRole("heading", { name: "Repair rejected" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Alder HTTP 200 · requirement failed" }),
  ).toBeVisible();
  await expect(inspector.getByText("HTTP 502", { exact: true })).toBeVisible();
  await expect(inspector.getByText("HTTP 200", { exact: true })).toBeVisible();
  const bounds = await inspector.boundingBox();
  expect(bounds!.y).toBeLessThan(700);
  await page
    .getByRole("button", { name: "Alder HTTP 200 · requirement failed" })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("heading", { name: "Isolated trial export" }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog").getByText("HTTP 200", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await inspector.getByRole("button", { name: "HTTP trace" }).click();
  await expect(inspector.getByText("422", { exact: true })).toBeVisible();
  await inspector.getByText("POST /resolve", { exact: true }).click();
  await expect(
    inspector
      .locator(".trace-span[open] .span-payloads > div")
      .first()
      .getByText(/"account": "alder"/),
  ).toBeVisible();
  await expect(
    inspector.locator(".span-payloads").getByText(/"account_id"/),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(artifacts, "request-trace.png"),
    fullPage: true,
  });
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    accessibility.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        summary: n.failureSummary,
      })),
    })),
  ).toEqual([]);
  await inspector
    .getByRole("button", { name: "After repair", exact: true })
    .click();
  await expect(
    inspector.getByText("POST /resolve", { exact: true }),
  ).toHaveCount(0);
  await expect(inspector.getByText("200", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /01 Rollback/ }).click();
  await inspector.getByLabel("Inspect customer").selectOption("cedar");
  await expect(inspector.getByText("HTTP 409", { exact: true })).toBeVisible();
  await expect(inspector.getByText("HTTP 200", { exact: true })).toBeVisible();
  const state = await (await page.request.get("/api/workspace")).json();
  expect(state.runtime.mutation_count).toBe(0);
});

test("boundary suite reveals policy edges, exports evidence, and stays accessible on mobile", async ({
  page,
}) => {
  await page.getByRole("tab", { name: "Boundary tests" }).click();
  await page
    .getByRole("button", { name: "Run boundary tests", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "900 seconds, required provenance, Verified cache: eligible",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "901 seconds, required provenance, Verified cache: rejected",
    }),
  ).toBeVisible();
  await expect(page.locator(".suite-summary")).toContainText("36");
  const scan = async () => {
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(
      result.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          summary: n.failureSummary,
        })),
      })),
    ).toEqual([]);
  };
  await scan();
  await page.screenshot({
    path: path.join(artifacts, "boundary-tests.png"),
    fullPage: true,
  });
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export results" }).click();
  expect((await downloaded).suggestedFilename()).toMatch(
    /^rehearsal-boundary-tests-/,
  );
  await page
    .getByRole("button", {
      name: "900 seconds, required provenance, Verified cache: eligible",
    })
    .click();
  await expect(
    page.getByRole("dialog").getByText("Hypothetical experiment"),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog").getByText("Every requirement passed"),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await scan();
  await page.screenshot({
    path: path.join(artifacts, "mobile-boundary-tests.png"),
    fullPage: true,
  });
  const state = await (await page.request.get("/api/workspace")).json();
  expect(state.runtime.mutation_count).toBe(0);
  expect(state.runs).toEqual([]);
  await page.getByLabel("Maximum cache age").fill("600");
  await expect(
    page.getByText(
      "Inputs or company evidence changed. Run the suite again to refresh these results.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Export results" }),
  ).toBeDisabled();
});
