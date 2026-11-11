import { expect, test, type Page } from "@playwright/test";
import { resetDexieDb } from "./helpers/dbSeed";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173";

async function seedCorrectedBodyFat(page: Page, withGoal = true) {
  await page.evaluate(async (includeGoal) => {
    const db = (window as any).__db;
    if (!db) throw new Error("__db missing");
    localStorage.removeItem("workout_pwa_profile_v1");
    const now = Date.now();
    await db.bodyMetrics.bulkAdd([
      { id: crypto.randomUUID(), measuredAt: now - 10 * 86400000, takenAt: now - 10 * 86400000, createdAt: now, weightLb: 180, bodyFatPct: 18.2 },
      { id: crypto.randomUUID(), measuredAt: now - 86400000, takenAt: now - 86400000, createdAt: now, weightLb: 179.5, bodyFatPct: 17.8 },
      { id: crypto.randomUUID(), measuredAt: now, takenAt: now, createdAt: now, weightLb: 179, bodyFatPct: 17.2 },
    ]);
    if (includeGoal) await db.app_meta.put({ key: "profile.goals.v1", valueJson: JSON.stringify({ targetBodyFatPct: 15 }), updatedAt: now });
  }, withGoal);
}

async function seedDatedCorrectedBodyFat(page: Page, dates: Array<[number, number]>) {
  await page.evaluate(async (entries) => {
    const db = (window as any).__db;
    if (!db) throw new Error("__db missing");
    await db.bodyMetrics.bulkAdd(entries.map(([at, bodyFatPct]) => ({
      id: crypto.randomUUID(), measuredAt: at, takenAt: at, createdAt: at,
      weightLb: 180, bodyFatPct,
    })));
  }, dates);
}

test.beforeEach(async ({ page }) => {
  await resetDexieDb(page);
});

test("Dev renders real corrected body-fat evidence, D/W/M aggregation and configured goal line", async ({ page }) => {
  test.setTimeout(60_000);
  await seedCorrectedBodyFat(page, true);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(new URL("/dev", BASE_URL).toString(), { waitUntil: "domcontentloaded" });

  const card = page.getByTestId("corrected-body-fat-v2");
  await expect(card).toBeVisible();
  await expect(card.getByTestId("corrected-bf-v2-latest")).toHaveText("17.2%");
  const metricRow = card.getByTestId("corrected-bf-v2-metric-row");
  await expect(metricRow.getByTestId("corrected-bf-v2-latest-date")).toContainText("Latest ·");
  await expect(metricRow.getByRole("group", { name: "Corrected body fat chart range" })).toBeVisible();
  await expect(metricRow.getByTestId("corrected-bf-v2-latest")).toBeVisible();
  await expect(card.getByTestId("corrected-bf-v2-goal")).toContainText("Goal 15%");
  await expect(card.locator("svg")).toHaveAttribute("aria-label", "Corrected body fat percentage trend, W range");

  for (const range of ["D", "W", "M"] as const) {
    await card.getByTestId(`corrected-bf-v2-range-${range}`).click();
    await expect(card.locator("svg")).toHaveAttribute("aria-label", `Corrected body fat percentage trend, ${range} range`);
    await expect(card.getByTestId("corrected-bf-v2-range-" + range)).toHaveAttribute("aria-pressed", "true");
    await expect(card.getByTestId("corrected-bf-v2-range-name")).toHaveText({ D: "Daily", W: "Weekly", M: "Monthly" }[range]);
  }

  const interaction = card.getByTestId("corrected-bf-v2-interaction");
  const interactionBox = await interaction.boundingBox();
  if (!interactionBox) throw new Error("Chart interaction surface is unavailable");
  await interaction.hover({ position: { x: interactionBox.width * 0.9, y: interactionBox.height * 0.5 } });
  const tooltip = card.getByTestId("corrected-bf-v2-tooltip");
  await expect(tooltip).toBeVisible();
  await expect(tooltip.locator(".if-cbf-v2-tooltip-value")).toContainText("%");
  await expect(tooltip.locator(".if-cbf-v2-tooltip-date")).not.toBeEmpty();
  const tooltipText = (await tooltip.innerText()).trim().replace(/\s+/g, " ");
  expect(tooltipText).toMatch(/^\d+(?:\.\d+)?%\s+\w{3}/);
  const detail = card.getByTestId("corrected-bf-v2-detail");
  await expect(detail).toContainText("Selected point");
  const detailHeader = card.getByTestId("corrected-bf-v2-detail-header");
  await expect(detailHeader).toContainText("Selected point");
  await expect(detailHeader.locator(".if-chart-detail-value")).toContainText("%");
  await expect(card.getByTestId("corrected-bf-v2-point-change")).toContainText(/Down [\d.]+ points from Oct/);
  await expect(card.getByTestId("corrected-bf-v2-goal-difference")).toContainText(/[\d.]+ points above 15% goal/);
  await expect(detail).not.toContainText("pp");
  await expect(detail).not.toContainText("Change vs previous visible");
  await expect(detail).not.toContainText("Difference from goal");
});

test("selected-point detail uses Up and below-goal wording", async ({ page }) => {
  await seedDatedCorrectedBodyFat(page, [
    [new Date(2026, 9, 11).getTime(), 17],
    [new Date(2026, 9, 18).getTime(), 18],
  ]);
  await page.evaluate(async () => {
    const db = (window as any).__db;
    await db.app_meta.put({ key: "profile.goals.v1", valueJson: JSON.stringify({ targetBodyFatPct: 25 }), updatedAt: Date.now() });
  });
  await page.goto(new URL("/dev", BASE_URL).toString(), { waitUntil: "domcontentloaded" });
  const card = page.getByTestId("corrected-body-fat-v2");
  await card.getByTestId("corrected-bf-v2-range-W").click();
  const interaction = card.getByTestId("corrected-bf-v2-interaction");
  const bounds = await interaction.boundingBox();
  if (!bounds) throw new Error("Chart interaction surface is unavailable");
  await interaction.hover({ position: { x: bounds.width * 0.9, y: bounds.height * 0.5 } });
  await expect(card.getByTestId("corrected-bf-v2-point-change")).toHaveText(/Up [\d.]+ points from Oct 11/);
  await expect(card.getByTestId("corrected-bf-v2-goal-difference")).toHaveText(/[\d.]+ points below 25% goal/);
});

test("selected-point detail uses No change and At-goal wording at displayed precision", async ({ page }) => {
  await seedDatedCorrectedBodyFat(page, [
    [new Date(2026, 9, 11).getTime(), 17.25],
    [new Date(2026, 9, 18).getTime(), 17.25],
  ]);
  await page.goto(new URL("/dev", BASE_URL).toString(), { waitUntil: "domcontentloaded" });
  const card = page.getByTestId("corrected-body-fat-v2");
  await card.getByTestId("corrected-bf-v2-range-W").click();
  const detailValue = await card.getByTestId("corrected-bf-v2-detail").locator(".if-chart-detail-value").textContent();
  const goal = Number.parseFloat(detailValue ?? "");
  expect(Number.isFinite(goal)).toBe(true);
  await page.evaluate(async (targetBodyFatPct) => {
    const db = (window as any).__db;
    await db.app_meta.put({ key: "profile.goals.v1", valueJson: JSON.stringify({ targetBodyFatPct }), updatedAt: Date.now() });
  }, goal);
  const interaction = card.getByTestId("corrected-bf-v2-interaction");
  const bounds = await interaction.boundingBox();
  if (!bounds) throw new Error("Chart interaction surface is unavailable");
  await interaction.hover({ position: { x: bounds.width * 0.9, y: bounds.height * 0.5 } });
  await expect(card.getByTestId("corrected-bf-v2-point-change")).toHaveText("No change from Oct 11");
  await expect(card.getByTestId("corrected-bf-v2-goal-difference")).toHaveText(`At ${goal}% goal`);
});

test("single visible point omits a previous-point comparison", async ({ page }) => {
  await seedDatedCorrectedBodyFat(page, [[new Date(2026, 9, 18).getTime(), 17.25]]);
  await page.goto(new URL("/dev", BASE_URL).toString(), { waitUntil: "domcontentloaded" });
  const card = page.getByTestId("corrected-body-fat-v2");
  await card.getByTestId("corrected-bf-v2-range-M").click();
  await expect(card.getByTestId("corrected-bf-v2-range-name")).toHaveText("Monthly");
  await expect(card.getByTestId("corrected-bf-v2-point-change")).toHaveCount(0);
});

test("peer-group strip shows the fixed Men 51–59 reference and factual percentile bracket", async ({ page }) => {
  await seedCorrectedBodyFat(page, true);
  await page.goto(new URL("/dev", BASE_URL).toString(), { waitUntil: "domcontentloaded" });
  const peer = page.getByTestId("corrected-bf-v2-peer-strip");
  await expect(peer).toBeVisible();
  const disclosure = peer.getByTestId("corrected-bf-v2-peer-toggle");
  await expect(disclosure).toHaveAttribute("aria-expanded", "true");
  await expect(peer.locator(".if-peer-track")).toBeVisible();
  const referenceNote = peer.getByText("Approximate NHANES DXA reference; population context only, not a clinical assessment.");
  await expect(referenceNote).toBeVisible();
  await expect(peer).toContainText("Men 51–59");
  await expect(peer).toContainText("Current position:");
  await expect(peer).toContainText("below median");
  await expect(peer).toContainText("between 10th and 25th percentile");
  await expect(peer).toContainText("Leaner than most");
  await expect(peer).toContainText("Typical");
  await expect(peer).toContainText("Higher than most");
  await expect(peer.getByTestId("corrected-bf-v2-peer-marker")).toHaveAttribute("style", /left:/);
  await disclosure.focus();
  await page.keyboard.press("Space");
  await expect(disclosure).toHaveAttribute("aria-expanded", "false");
  await expect(peer.getByTestId("corrected-bf-v2-peer-collapsed-summary")).toContainText("between 10th and 25th percentile");
  await expect(peer.locator(".if-peer-track")).toBeHidden();
  await expect(referenceNote).toBeHidden();
  await disclosure.focus();
  await page.keyboard.press("Enter");
  await expect(disclosure).toHaveAttribute("aria-expanded", "true");
  await expect(peer.locator(".if-peer-track")).toBeVisible();
  await expect(referenceNote).toBeVisible();
  await expect(peer.getByText("5th", { exact: true })).toHaveAttribute("title", "5th percentile · 11.5% body fat");
  await expect(peer.getByText("95th", { exact: true })).toHaveAttribute("title", "95th percentile · 44.4% body fat");
});

test("monthly x-axis retains every visible month bucket, including August", async ({ page }) => {
  await seedDatedCorrectedBodyFat(page, [
    [new Date(2026, 6, 15).getTime(), 18.1],
    [new Date(2026, 7, 15).getTime(), 17.9],
    [new Date(2026, 8, 15).getTime(), 17.7],
    [new Date(2026, 9, 15).getTime(), 17.5],
  ]);
  await page.goto(new URL("/dev", BASE_URL).toString(), { waitUntil: "domcontentloaded" });
  const card = page.getByTestId("corrected-body-fat-v2");
  await card.getByTestId("corrected-bf-v2-range-M").click();
  await expect(card.locator("svg")).toHaveAttribute("aria-label", "Corrected body fat percentage trend, M range");
  await expect(card.getByTestId("corrected-bf-v2-x-label")).toHaveText(["Jul", "Aug", "Sep", "Oct"]);
});

test("weekly labels use bucket dates and daily labels thin deterministically", async ({ page }) => {
  const weeklyDates = [
    new Date(2026, 7, 24).getTime(),
    new Date(2026, 8, 14).getTime(),
    new Date(2026, 9, 5).getTime(),
    new Date(2026, 9, 26).getTime(),
  ];
  await seedDatedCorrectedBodyFat(page, weeklyDates.map((at, index) => [at, 18 - index * 0.2] as [number, number]));
  await page.goto(new URL("/dev", BASE_URL).toString(), { waitUntil: "domcontentloaded" });
  const card = page.getByTestId("corrected-body-fat-v2");

  const weeklyAxisLabels = card.getByTestId("corrected-bf-v2-x-label");
  await expect(weeklyAxisLabels).toHaveText(["Aug 23", "Sep 13", "Oct 4", "Oct 25"]);
  const weeklyLabels = await weeklyAxisLabels.allTextContents();
  expect(weeklyLabels.length).toBe(4);
  expect(weeklyLabels.every((label) => /^[A-Z][a-z]{2} \d{1,2}$/.test(label))).toBe(true);
  expect(weeklyLabels.some((label) => /^W\d+$/i.test(label))).toBe(false);
  expect(weeklyLabels).toEqual(["Aug 23", "Sep 13", "Oct 4", "Oct 25"]);

  const dailyRows = Array.from({ length: 20 }, (_, index) => [
    new Date(2026, 9, index + 1).getTime(),
    18 - index * 0.05,
  ] as [number, number]);
  await page.evaluate(async (entries) => {
    const db = (window as any).__db;
    await db.bodyMetrics.clear();
    await db.bodyMetrics.bulkAdd(entries.map(([at, bodyFatPct]) => ({
      id: crypto.randomUUID(), measuredAt: at, takenAt: at, createdAt: at,
      weightLb: 180, bodyFatPct,
    })));
  }, dailyRows);
  await card.getByTestId("corrected-bf-v2-range-D").click();
  const dailyLabels = card.getByTestId("corrected-bf-v2-x-label");
  const labels = await dailyLabels.allTextContents();
  expect(labels.length).toBeGreaterThanOrEqual(2);
  expect(labels.length).toBeLessThanOrEqual(6);
  expect(labels.every((label) => /^[A-Z][a-z]{2} \d{1,2}$/.test(label))).toBe(true);
  expect(labels[0]).toBe("Oct 1");
  expect(labels.at(-1)).toBe("Oct 20");
});

test("Dev chart omits goal line without a configured body-fat target and shows a safe empty state", async ({ page }) => {
  await seedCorrectedBodyFat(page, false);
  await page.goto(new URL("/dev", BASE_URL).toString(), { waitUntil: "domcontentloaded" });
  const card = page.getByTestId("corrected-body-fat-v2");
  await expect(card).toBeVisible();
  await expect(card.getByTestId("corrected-bf-v2-goal")).toHaveCount(0);

  await page.evaluate(async () => { await (window as any).__db.bodyMetrics.clear(); });
  await expect(card.getByTestId("corrected-bf-v2-empty")).toHaveText("Not enough corrected body-fat data yet.");
});

test("experimental chart remains within desktop, tablet, and phone widths and supports touch selection", async ({ page }) => {
  await seedCorrectedBodyFat(page, true);
  await page.goto(new URL("/dev", BASE_URL).toString(), { waitUntil: "domcontentloaded" });
  const card = page.getByTestId("corrected-body-fat-v2");
  await expect(card).toBeVisible();

  for (const width of [1280, 768, 390]) {
    await page.setViewportSize({ width, height: 850 });
    await expect.poll(() => card.evaluate((element) => Math.round(element.getBoundingClientRect().width))).toBeLessThanOrEqual(width);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await card.getByTestId("corrected-bf-v2-range-W").click();
    const interaction = card.getByTestId("corrected-bf-v2-interaction");
    if (test.info().project.name === "iphone") {
      await interaction.tap();
    } else {
      const bounds = await interaction.boundingBox();
      if (!bounds) throw new Error("Chart interaction surface is unavailable");
      await interaction.hover({ position: { x: bounds.width * 0.9, y: bounds.height * 0.5 } });
    }
    const detail = card.getByTestId("corrected-bf-v2-detail");
    const geometry = await detail.evaluate((element) => {
      const header = element.querySelector('[data-testid="corrected-bf-v2-detail-header"]')!;
      const date = header.querySelector(".if-chart-detail-date")!.getBoundingClientRect();
      const value = header.querySelector(".if-chart-detail-value")!.getBoundingClientRect();
      const card = element.getBoundingClientRect();
      return {
        dateVisible: date.width > 0 && date.height > 0,
        valueVisible: value.width > 0 && value.height > 0,
        headerFits: date.left >= card.left && value.right <= card.right,
        headerItemsOverlap: !(date.right <= value.left || value.right <= date.left || date.bottom <= value.top || value.bottom <= date.top),
      };
    });
    expect(geometry.dateVisible).toBe(true);
    expect(geometry.valueVisible).toBe(true);
    expect(geometry.headerFits).toBe(true);
    expect(geometry.headerItemsOverlap).toBe(false);
    await expect(detail).toContainText("Selected point");
    const tooltip = card.getByTestId("corrected-bf-v2-tooltip");
    await expect(tooltip).toBeVisible();
    const tooltipFits = await tooltip.evaluate((element) => {
      const tooltipBounds = element.getBoundingClientRect();
      const cardBounds = element.closest("[data-testid='corrected-body-fat-v2']")!.getBoundingClientRect();
      return tooltipBounds.left >= cardBounds.left && tooltipBounds.right <= cardBounds.right;
    });
    expect(tooltipFits).toBe(true);
    await expect(card.getByTestId("corrected-bf-v2-peer-strip")).toBeVisible();
    if (width === 390) {
      const peerToggle = card.getByTestId("corrected-bf-v2-peer-toggle");
      await peerToggle.click();
      await expect(peerToggle).toHaveAttribute("aria-expanded", "false");
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const fits = await peerToggle.evaluate((element) => {
        const button = element.getBoundingClientRect();
        const cardBounds = element.closest("[data-testid='corrected-body-fat-v2']")!.getBoundingClientRect();
        return button.left >= cardBounds.left && button.right <= cardBounds.right;
      });
      expect(fits).toBe(true);
    }
    const labelBottom = await card.getByTestId("corrected-bf-v2-x-label").last().evaluate((element) => element.getBoundingClientRect().bottom);
    const detailTop = await detail.evaluate((element) => element.getBoundingClientRect().top);
    expect(labelBottom).toBeLessThanOrEqual(detailTop);
  }

});

test("experimental chart is not wired into the normal Start route", async ({ page }) => {
  await page.goto(new URL("/", BASE_URL).toString(), { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("corrected-body-fat-v2")).toHaveCount(0);
});
