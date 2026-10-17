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
    page.getByRole("heading", { name: "Rich exports are failing." }),
  ).toBeVisible();
});

test("compare actual artifacts, approve once, and inspect the decision", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1512, height: 1080 });
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
  await page.getByRole("button", { name: /Bypass enrichment/ }).click();
  await expect(
    page.getByRole("dialog").getByText("HTTP 200", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("The response is healthy. The agreement is not satisfied."),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(artifacts, "artifact-evidence.png"),
    fullPage: false,
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: /Bypass enrichment/ }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Review proposed repair" }).click();
  await page
    .getByRole("button", { name: "Approve and apply repair", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("heading", { name: "The promised exports are restored." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close panel" }).click();
  await expect(
    page.getByRole("heading", { name: "Exports restored. Promises kept." }),
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
  await expect(page.getByText("The company evidence changed.")).toBeVisible();
  await page.getByRole("button", { name: "Run a fresh rehearsal" }).click();
  await expect(
    page.getByRole("heading", { name: "No safe repair found." }),
  ).toBeVisible();
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
    page.getByRole("heading", { name: "The facts behind the decision." }),
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
