import { expect, test, type Page } from "@playwright/test";
import { resetDexieDb } from "./helpers/dbSeed";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173";
const CARD_ID = "Corrected Body Fat % Trend";

async function seed(page: Page, includeGoal = true) {
  await page.evaluate(async (withGoal) => {
    const db = (window as any).__db;
    if (!db) throw new Error("__db missing");
    const now = Date.now();
    const day = 86_400_000;
    await db.bodyMetrics.bulkAdd(Array.from({ length: 9 }, (_, index) => {
      const at = now - (8 - index) * 7 * day;
      return {
        id: crypto.randomUUID(),
        measuredAt: at,
        takenAt: at,
        createdAt: at,
        weightLb: 190 - index,
        waistIn: 38 - index * 0.15,
        bodyFatPct: 21 - index * 0.4,
      };
    }));
    if (withGoal) {
      await db.app_meta.put({
        key: "profile.goals.v1",
        valueJson: JSON.stringify({ targetWeightLb: 167, targetWaistIn: 34, targetBodyFatPct: 15 }),
        updatedAt: now,
      });
    }
  }, includeGoal);
}

async function openProductionChart(page: Page, includeGoal = true) {
  await page.goto(new URL("/", BASE_URL).toString(), { waitUntil: "domcontentloaded" });
  await resetDexieDb(page);
  await seed(page, includeGoal);
  await page.goto(new URL("/body-composition", BASE_URL).toString(), { waitUntil: "domcontentloaded" });
  return page.getByTestId(`${CARD_ID}:card`);
}

test("production Corrected BF opts into the modern shared-archetype capabilities", async ({ page }) => {
  const card = await openProductionChart(page, true);
  await expect(card).toBeVisible();
  const svg = card.getByTestId(`${CARD_ID}:svg`);
  await expect(svg).toHaveAttribute("data-curve-mode", "smooth");
  await expect(svg).toHaveAttribute("data-area-fill", "true");
  await expect(card.getByTestId(`${CARD_ID}:series-line`)).toHaveAttribute("stroke", "var(--accent)");
  await expect(card.getByTestId(`${CARD_ID}:point`).first()).toHaveAttribute("fill", "var(--accent)");
  await expect(card.getByTestId(`${CARD_ID}:area-fill`)).toBeVisible();
  await expect(card.getByTestId(`${CARD_ID}:selected-detail`)).toBeVisible();
  await expect(card.getByTestId(`${CARD_ID}:selected-detail-range`)).toHaveText("Weekly");
  await expect(card.getByTestId(`${CARD_ID}:reference-line`)).toContainText("Goal 15.0%");
  await expect(card.getByTestId(`${CARD_ID}:peer-reference`)).toBeVisible();
  await expect(card.locator(".if-peer-tick")).toHaveText(["5th", "10th", "25th", "50th", "75th", "90th", "95th"]);
  await expect(card.locator(".if-peer-labels span")).toHaveText(["Leaner than most", "Typical", "Higher than most"]);
  await expect(card.locator(".if-peer-disclaimer")).toContainText("Approximate NHANES DXA reference");
  await expect(card.locator(".if-peer-marker")).toBeVisible();

  const toggle = card.getByTestId(`${CARD_ID}:peer-reference-toggle`);
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(card.getByTestId(`${CARD_ID}:peer-reference-content`)).toBeHidden();
  await expect(card.locator(".if-peer-disclaimer")).toBeHidden();
  await expect(toggle).toContainText(/between .* percentile/);
  await toggle.click();
  await expect(card.getByTestId(`${CARD_ID}:peer-reference-content`)).toBeVisible();
  await expect(card).not.toContainText(/diagnos|clinical assessment[^.]*is|disease/i);
});

test("production pilot preserves range selection, nearest-point detail, and drag navigation", async ({ page }) => {
  const card = await openProductionChart(page, true);
  const latestLabel = await card.getByTestId(`${CARD_ID}:selected-detail-label`).innerText();
  await card.getByRole("button", { name: "D", exact: true }).click();
  await expect(card.getByTestId(`${CARD_ID}:selected-detail-range`)).toHaveText("Daily");
  await card.getByRole("button", { name: "M", exact: true }).click();
  await expect(card.getByTestId(`${CARD_ID}:selected-detail-range`)).toHaveText("Monthly");
  await card.getByRole("button", { name: "W", exact: true }).click();

  const overlay = card.getByTestId(`${CARD_ID}:overlay`);
  const box = await overlay.boundingBox();
  if (!box) throw new Error("chart overlay missing");
  await overlay.hover({ position: { x: box.width * 0.5, y: box.height / 2 } });
  await expect(card.getByText(/^Selected point ·/)).toBeVisible();
  await expect(card.getByTestId(`${CARD_ID}:selected-detail-label`)).not.toHaveText(latestLabel);
  const delta = card.getByTestId(`${CARD_ID}:selected-detail-delta`);
  await expect(delta).toHaveText(/^(Up|Down) \d+(?:\.\d)? points from |^No change from /);
  await expect(delta).not.toContainText("%");
  await expect(delta).not.toContainText("pp");
  await expect(delta).not.toContainText("+");
  const goalText = card.getByTestId(`${CARD_ID}:selected-detail-goal`);
  await expect(goalText).toHaveText(/points (above|below) 15\.0% goal|At 15\.0% goal/);

  const firstLabel = await card.getByTestId(`${CARD_ID}:selected-detail-label`).innerText();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.95, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => card.getByTestId(`${CARD_ID}:selected-detail-label`).innerText()).not.toBe(firstLabel);
});

test("goal line is omitted without a configured goal", async ({ page }) => {
  const card = await openProductionChart(page, false);
  await expect(card.getByTestId(`${CARD_ID}:svg`)).toBeVisible();
  await expect(card.getByTestId(`${CARD_ID}:reference-line`)).toHaveCount(0);
  await expect(card.getByTestId(`${CARD_ID}:selected-detail-goal`)).toHaveCount(0);
});

test("retired Confidence Trend remains absent from production", async ({ page }) => {
  await openProductionChart(page, true);
  await expect(page.getByTestId("Confidence Trend:card")).toHaveCount(0);
});

test("peer reference domain resolution is deterministic and presentation-only", async ({ page }) => {
  await page.goto(new URL("/", BASE_URL).toString(), { waitUntil: "domcontentloaded" });
  const result = await page.evaluate(async () => {
    const module = await import("/src/body/bodyFatPeerReference.ts");
    return {
      low: module.resolveBodyFatPercentileBracket(10),
      middle: module.resolveBodyFatPercentileBracket(24.4),
      high: module.resolveBodyFatPercentileBracket(50),
      model: module.buildBodyFatPeerReference(20),
    };
  });
  expect(result.low).toBe("below 5th percentile");
  expect(result.middle).toBe("between 25th and 50th percentile");
  expect(result.high).toBe("95th percentile or above");
  expect(result.model?.landmarks).toHaveLength(7);
  expect(JSON.stringify(result.model)).not.toMatch(/diagnos|disease|treatment/i);
});

test("shared detail and peer presentation remain aligned without horizontal overflow", async ({ page }) => {
  const card = await openProductionChart(page, true);
  await card.scrollIntoViewIfNeeded();
  const geometry = await card.evaluate((element) => {
    const detail = element.querySelector(".if-chart-detail")!.getBoundingClientRect();
    const header = element.querySelector(".if-chart-detail-header")!.getBoundingClientRect();
    const date = element.querySelector(".if-chart-detail-date")!.getBoundingClientRect();
    const value = element.querySelector(".if-chart-detail-value")!.getBoundingClientRect();
    const track = element.querySelector(".if-peer-track")!.getBoundingClientRect();
    const marker = element.querySelector(".if-peer-marker")!.getBoundingClientRect();
    const toggle = element.querySelector(".if-peer-toggle")! as HTMLButtonElement;
    return {
      detailFits: detail.left >= element.getBoundingClientRect().left && detail.right <= element.getBoundingClientRect().right,
      topRowAligned: Math.abs(date.top - value.top) < Math.max(date.height, value.height),
      headerFits: header.right <= detail.right && header.left >= detail.left,
      markerOnTrack: marker.left < track.right && marker.right > track.left && marker.top < track.bottom && marker.bottom > track.top,
      buttonBorder: getComputedStyle(toggle).borderTopWidth,
      buttonBackground: getComputedStyle(toggle).backgroundColor,
      pageFits: document.documentElement.scrollWidth <= window.innerWidth,
    };
  });
  expect(geometry).toMatchObject({
    detailFits: true,
    topRowAligned: true,
    headerFits: true,
    markerOnTrack: true,
    buttonBorder: "0px",
    pageFits: true,
  });
  expect(geometry.buttonBackground).toMatch(/rgba?\(0, 0, 0, 0\)|transparent/);
});
