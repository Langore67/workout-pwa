import { expect, test, type Page } from "@playwright/test";
import { resetDexieDb } from "./helpers/dbSeed";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173";
const WAVE_TWO_CHARTS = ["Fat Mass Trend", "Lean Mass Trend", "Corrected Lean Mass Trend"] as const;

async function openWaveTwo(page: Page) {
  await page.goto(new URL("/", BASE_URL).toString(), { waitUntil: "domcontentloaded" });
  await resetDexieDb(page);
  await page.evaluate(async () => {
    const db = (window as any).__db;
    const now = Date.now();
    const day = 86_400_000;
    await db.bodyMetrics.bulkAdd(Array.from({ length: 9 }, (_, index) => {
      const at = now - (8 - index) * 7 * day;
      return {
        id: crypto.randomUUID(),
        measuredAt: at,
        takenAt: at,
        createdAt: at,
        weightLb: 184 - index * 0.7,
        bodyFatPct: 20 - index * 0.3,
        ecwLb: 37 - index * 0.05,
        icwLb: 57 + index * 0.05,
      };
    }));
  });
  await page.goto(new URL("/body-composition", BASE_URL).toString(), { waitUntil: "domcontentloaded" });
}

test.beforeEach(async ({ page }) => openWaveTwo(page));

for (const id of WAVE_TWO_CHARTS) {
  test(`${id} uses the modern green mass-chart treatment without goals or peers`, async ({ page }) => {
    const card = page.getByTestId(`${id}:card`);
    await card.scrollIntoViewIfNeeded();
    const svg = card.getByTestId(`${id}:svg`);
    await expect(svg).toHaveAttribute("data-curve-mode", "smooth");
    await expect(svg).toHaveAttribute("data-area-fill", "true");
    await expect(card.getByTestId(`${id}:series-line`)).toHaveAttribute("stroke", "var(--accent)");
    await expect(card.getByTestId(`${id}:point`).first()).toHaveAttribute("fill", "var(--accent)");
    await expect(card.getByTestId(`${id}:area-fill`)).toBeVisible();
    await expect(card.getByTestId(`${id}:selected-detail-value`)).toContainText("lb");
    await expect(card.getByTestId(`${id}:selected-detail-range`)).toHaveText("Weekly");
    await expect(card.getByTestId(`${id}:reference-line`)).toHaveCount(0);
    await expect(card.getByTestId(`${id}:selected-detail-goal`)).toHaveCount(0);
    await expect(card.getByTestId(`${id}:peer-reference`)).toHaveCount(0);
  });
}

test("Wave 2 retains D/W/M range behavior and pound-specific selected-point changes", async ({ page }) => {
  for (const id of WAVE_TWO_CHARTS) {
    const card = page.getByTestId(`${id}:card`);
    await card.scrollIntoViewIfNeeded();
    await card.getByRole("button", { name: "D", exact: true }).click();
    await expect(card.getByTestId(`${id}:selected-detail-range`)).toHaveText("Daily");
    await card.getByRole("button", { name: "M", exact: true }).click();
    await expect(card.getByTestId(`${id}:selected-detail-range`)).toHaveText("Monthly");
    await card.getByRole("button", { name: "W", exact: true }).click();
    await expect(card.getByTestId(`${id}:selected-detail-range`)).toHaveText("Weekly");

    const overlay = card.getByTestId(`${id}:overlay`);
    const box = await overlay.boundingBox();
    if (!box) throw new Error(`${id} overlay missing`);
    await overlay.hover({ position: { x: box.width * 0.5, y: box.height / 2 } });
    const delta = card.getByTestId(`${id}:selected-detail-delta`);
    await expect(delta).toHaveText(/^(Up|Down) \d+(?:\.\d)? lb from |^No change from /);
    await expect(delta).not.toContainText("pp");
    await expect(delta).not.toContainText("Change vs previous visible");
  }
});

test("non-modernized Body Composition charts retain their existing defaults", async ({ page }) => {
  for (const id of ["TBW Trend", "Fluid Ratio Trend", "Confidence Trend"]) {
    const card = page.getByTestId(`${id}:card`);
    await card.scrollIntoViewIfNeeded();
    const svg = card.getByTestId(`${id}:svg`);
    await expect(svg).toHaveAttribute("data-curve-mode", "linear");
    await expect(svg).toHaveAttribute("data-area-fill", "false");
    await expect(card.getByTestId(`${id}:selected-detail`)).toHaveCount(0);
    await expect(card.getByTestId(`${id}:area-fill`)).toHaveCount(0);
  }
});
