import { expect, test, type Page } from "@playwright/test";
import { resetDexieDb } from "./helpers/dbSeed";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173";

async function openWaveThree(page: Page) {
  await page.goto(new URL("/", BASE_URL).toString(), { waitUntil: "domcontentloaded" });
  await resetDexieDb(page);
  await page.evaluate(async () => {
    const db = (window as any).__db;
    const now = Date.now();
    const day = 86_400_000;
    await db.bodyMetrics.bulkAdd(Array.from({ length: 9 }, (_, index) => {
      const at = now - (8 - index) * 7 * day;
      return {
        id: crypto.randomUUID(), measuredAt: at, takenAt: at, createdAt: at,
        weightLb: 180 - index * 0.4, bodyFatPct: 19 - index * 0.2,
        icwLb: 55 + index * 0.12, ecwLb: 35 - index * 0.04,
      };
    }));
  });
  await page.goto(new URL("/body-composition", BASE_URL).toString(), { waitUntil: "domcontentloaded" });
}

test.beforeEach(async ({ page }) => openWaveThree(page));

test("TBW uses the modern green pound treatment while retaining W/M-only ranges", async ({ page }) => {
  const id = "TBW Trend";
  const card = page.getByTestId(`${id}:card`);
  await card.scrollIntoViewIfNeeded();
  const svg = card.getByTestId(`${id}:svg`);
  await expect(svg).toHaveAttribute("data-curve-mode", "smooth");
  await expect(svg).toHaveAttribute("data-area-fill", "true");
  await expect(card.getByTestId(`${id}:series-line`)).toHaveAttribute("stroke", "var(--accent)");
  await expect(card.getByTestId(`${id}:point`).first()).toHaveAttribute("fill", "var(--accent)");
  await expect(card.getByTestId(`${id}:selected-detail-value`)).toContainText("lb");
  await expect(card.getByTestId(`${id}:selected-detail-range`)).toHaveText("Weekly");
  await expect(card.getByRole("button", { name: "D", exact: true })).toHaveCount(0);
  await expect(card.getByRole("button", { name: "W", exact: true })).toBeVisible();
  await expect(card.getByRole("button", { name: "M", exact: true })).toBeVisible();
  await expect(card.getByTestId(`${id}:peer-reference`)).toHaveCount(0);
  await expect(card.getByTestId(`${id}:reference-line`)).toHaveCount(0);
});

test("Fluid Ratio preserves three-decimal ratio semantics with modern presentation", async ({ page }) => {
  const id = "Fluid Ratio Trend";
  const card = page.getByTestId(`${id}:card`);
  await card.scrollIntoViewIfNeeded();
  const svg = card.getByTestId(`${id}:svg`);
  await expect(svg).toHaveAttribute("data-curve-mode", "smooth");
  await expect(svg).toHaveAttribute("data-area-fill", "true");
  await expect(card.getByTestId(`${id}:series-line`)).toHaveAttribute("stroke", "var(--accent)");
  await expect(card.getByTestId(`${id}:selected-detail-value`)).toHaveText(/^0\.\d{3}$/);
  await expect(card.getByTestId(`${id}:selected-detail-range`)).toHaveText("Weekly");
  await expect(card.getByRole("button", { name: "D", exact: true })).toHaveCount(0);
  await expect(card.getByTestId(`${id}:peer-reference`)).toHaveCount(0);
  await expect(card.getByTestId(`${id}:reference-line`)).toHaveCount(0);
});

test("Wave 3 range changes and selected-point deltas retain metric-specific wording", async ({ page }) => {
  for (const id of ["TBW Trend", "Fluid Ratio Trend"]) {
    const card = page.getByTestId(`${id}:card`);
    await card.scrollIntoViewIfNeeded();
    await card.getByRole("button", { name: "M", exact: true }).click();
    await expect(card.getByTestId(`${id}:selected-detail-range`)).toHaveText("Monthly");
    await card.getByRole("button", { name: "W", exact: true }).click();

    const overlay = card.getByTestId(`${id}:overlay`);
    const box = await overlay.boundingBox();
    if (!box) throw new Error(`${id} overlay missing`);
    await overlay.hover({ position: { x: box.width * 0.5, y: box.height / 2 } });
    const delta = card.getByTestId(`${id}:selected-detail-delta`);
    if (id === "TBW Trend") await expect(delta).toHaveText(/^(Up|Down) \d+(?:\.\d)? lb from |^No change from /);
    else await expect(delta).toHaveText(/^(Up|Down) 0\.\d{3} from |^No change from /);
    await expect(delta).not.toContainText("pp");
    await expect(delta).not.toContainText("Change vs previous visible");
  }
});

test("Confidence Trend is retired while the confidence card and nine physical charts remain", async ({ page }) => {
  await expect(page.getByTestId("Confidence Trend:card")).toHaveCount(0);
  for (const id of [
    "Weight Trend", "Waist Trend", "Body Fat % Trend", "Corrected Body Fat % Trend",
    "Fat Mass Trend", "Lean Mass Trend", "Corrected Lean Mass Trend", "TBW Trend", "Fluid Ratio Trend",
  ]) {
    await expect(page.getByTestId(`${id}:card`)).toBeVisible();
  }
  const confidenceCard = page.getByText("CONFIDENCE", { exact: true }).locator("..");
  await expect(confidenceCard).toContainText(/High|Moderate|Limited|Low/);
  await expect(confidenceCard).toContainText(/Score \d\/8/);
});
