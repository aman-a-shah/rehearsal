import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs/promises";
import path from "node:path";

test("six examples execute real checks without changing the workspace", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1512, height: 980 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const before = await (await page.request.get("/api/workspace")).json();
  expect(before.provider.available).toBe(false);
  await page.request.post("/api/session", {
    data: { person: "nia" },
    headers: { "X-Rehearsal-Request": "1" },
  });
  await page.goto("/#examples/agreement");
  await expect(
    page.getByRole("heading", { name: "See what changes the decision." }),
  ).toBeVisible();
  const cases = [
    ["agreement", "Verified cache recommended", ["cache"]],
    ["stricter-policy", "No eligible repair", []],
    ["optional-provenance", "Bypass recommended", ["bypass"]],
    ["exact-boundary", "Verified cache recommended", ["cache"]],
    ["one-second-late", "No eligible repair", []],
    ["two-options", "Verified cache recommended", ["bypass", "cache"]],
  ] as const;
  for (const [id, title, eligible] of cases) {
    await page
      .getByRole("navigation", { name: "Examples", exact: true })
      .locator(`a[href="#examples/${id}"]`)
      .click();
    const response = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/simulations") && r.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Run example", exact: true })
      .click();
    const payload = await (await response).json();
    expect(payload.eligible).toEqual([...eligible]);
    expect(payload.hypothetical).toBe(true);
    await expect(
      page
        .locator(".example-result-heading")
        .getByRole("heading", { name: title }),
    ).toBeVisible();
  }
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download evidence" }).click();
  const evidence = JSON.parse(
    await fs.readFile((await (await download).path())!, "utf8"),
  );
  expect(evidence.example).toBe("two-options");
  expect(evidence.eligible).toEqual(["bypass", "cache"]);
  await page
    .getByRole("navigation", { name: "Examples", exact: true })
    .locator('a[href="#examples/agreement"]')
    .click();
  await expect(
    page.getByRole("button", { name: "Run again", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Full evidence", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").getByText("HTTP 200", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("dialog")
      .getByText("This repair is not eligible", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close panel" }).click();
  const scan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    scan.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.failureSummary),
    })),
  ).toEqual([]);
  await fs.mkdir(path.resolve("..", "docs", "screenshots"), {
    recursive: true,
  });
  await page.screenshot({
    path: path.resolve("..", "docs", "screenshots", "examples.png"),
    fullPage: true,
  });
  const after = await (await page.request.get("/api/workspace")).json();
  expect(after.context.fingerprint).toBe(before.context.fingerprint);
  expect(after.runtime).toEqual(before.runtime);
  expect(after.runs).toEqual(before.runs);
  expect(after.decisions).toEqual(before.decisions);
  expect(errors).toEqual([]);
});

test("example deep links, evidence, and navigation work on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#examples/one-second-late");
  await expect(
    page.getByRole("heading", { name: "One second changes the outcome" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Run example", exact: true }).click();
  await expect(
    page
      .locator(".example-result-heading")
      .getByRole("heading", { name: "No eligible repair" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const scan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    scan.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.failureSummary),
    })),
  ).toEqual([]);
  await fs.mkdir(path.resolve("..", "artifacts"), { recursive: true });
  await page.screenshot({
    path: path.resolve("..", "artifacts", "mobile-examples.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Open policy lab" }).click();
  await expect(
    page.getByRole("heading", { name: "Policy lab", exact: true }),
  ).toBeVisible();
});
