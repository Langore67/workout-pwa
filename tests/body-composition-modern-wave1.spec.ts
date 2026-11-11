import { expect, test, type Page } from "@playwright/test";
import { resetDexieDb } from "./helpers/dbSeed";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173";

async function openWaveOne(page: Page) {
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
        weightLb: 176 - index * 0.7,
        waistIn: 36 - index * 0.2,
        bodyFatPct: 18.8 - index * 0.35,
      };
    }));
    await db.app_meta.put({
      key: "profile.goals.v1",
      valueJson: JSON.stringify({ targetWeightLb: 167, targetWaistIn: 34, targetBodyFatPct: 15 }),
      updatedAt: now,
    });
  });
  await page.goto(new URL("/body-composition", BASE_URL).toString(), { waitUntil: "domcontentloaded" });
}

async function selectMiddlePoint(page: Page, id: string) {
  const card = page.getByTestId(`${id}:card`);
  await card.scrollIntoViewIfNeeded();
  const overlay = card.getByTestId(`${id}:overlay`);
  const box = await overlay.boundingBox();
  if (!box) throw new Error(`${id} overlay missing`);
  await overlay.hover({ position: { x: box.width * 0.5, y: box.height / 2 } });
  return card;
}

async function expectSharedGreenModernSeries(page: Page, id: string) {
  const card = page.getByTestId(`${id}:card`);
  const svg = card.getByTestId(`${id}:svg`);
  await expect(svg).toHaveAttribute("data-area-fill", "true");
  await expect(card.getByTestId(`${id}:series-line`)).toHaveAttribute("stroke", "var(--accent)");
  await expect(card.getByTestId(`${id}:point`).first()).toHaveAttribute("fill", "var(--accent)");
  await expect(card.getByTestId(`${id}:area-fill`)).toBeVisible();
  await expect(svg.locator("linearGradient stop").first()).toHaveAttribute("stop-color", "var(--accent)");
}

test.beforeEach(async ({ page }) => openWaveOne(page));

test("modern Body Composition charts share the green series, marker, and area treatment", async ({ page }) => {
  for (const id of ["Weight Trend", "Waist Trend", "Body Fat % Trend", "Corrected Body Fat % Trend"]) {
    await expectSharedGreenModernSeries(page, id);
  }
});

test("Weight uses the modern family with pound-specific goal and detail wording", async ({ page }) => {
  const id = "Weight Trend";
  const card = await selectMiddlePoint(page, id);
  await expect(card.getByTestId(`${id}:svg`)).toHaveAttribute("data-curve-mode", "smooth");
  await expect(card.getByTestId(`${id}:svg`)).toHaveAttribute("data-area-fill", "true");
  await expect(card.getByTestId(`${id}:area-fill`)).toBeVisible();
  await expect(card.getByTestId(`${id}:reference-line`)).toContainText("Goal 167 lb");
  await expect(card.getByTestId(`${id}:selected-detail-value`)).toContainText("lb");
  await expect(card.getByTestId(`${id}:selected-detail-delta`)).toHaveText(/(Up|Down) \d+(?:\.\d)? lb from |No change from /);
  await expect(card.getByTestId(`${id}:selected-detail-goal`)).toHaveText(/\d+(?:\.\d)? lb (above|below) 167 lb goal|At 167 lb goal/);
  await expect(card.getByTestId(`${id}:peer-reference`)).toHaveCount(0);
});

test("Waist uses the modern family with factual inch-specific goal wording", async ({ page }) => {
  const id = "Waist Trend";
  const card = await selectMiddlePoint(page, id);
  await expect(card.getByTestId(`${id}:svg`)).toHaveAttribute("data-curve-mode", "smooth");
  await expect(card.getByTestId(`${id}:svg`)).toHaveAttribute("data-area-fill", "true");
  await expect(card.getByTestId(`${id}:reference-line`)).toContainText("Goal 34 in");
  await expect(card.getByTestId(`${id}:selected-detail-value`)).toContainText("in");
  await expect(card.getByTestId(`${id}:selected-detail-delta`)).toHaveText(/(Up|Down) \d+(?:\.\d)? in from |No change from /);
  await expect(card.getByTestId(`${id}:selected-detail-goal`)).toHaveText(/\d+(?:\.\d)? in (above|below) 34 in goal|At 34 in goal/);
  await expect(card.getByTestId(`${id}:peer-reference`)).toContainText("Peer-group reference · Waist");
  await expect(card.getByTestId(`${id}:peer-reference-content`)).toContainText("Current waist:");
});

test("raw Body Fat uses percentage-point wording and the shared BF peer profile", async ({ page }) => {
  const id = "Body Fat % Trend";
  const card = await selectMiddlePoint(page, id);
  await expect(card.getByTestId(`${id}:svg`)).toHaveAttribute("data-curve-mode", "smooth");
  await expect(card.getByTestId(`${id}:svg`)).toHaveAttribute("data-area-fill", "true");
  await expect(card.getByTestId(`${id}:reference-line`)).toContainText("Goal 15%");
  await expect(card.getByTestId(`${id}:selected-detail-delta`)).toHaveText(/(Up|Down) \d+(?:\.\d)? points from |No change from /);
  await expect(card.getByTestId(`${id}:selected-detail-delta`)).not.toContainText("%");
  const peer = card.getByTestId(`${id}:peer-reference`);
  await expect(peer).toContainText("Men 51–59");
  await expect(peer.locator(".if-peer-tick")).toHaveText(["5th", "10th", "25th", "50th", "75th", "90th", "95th"]);
  const toggle = card.getByTestId(`${id}:peer-reference-toggle`);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(card.getByTestId(`${id}:peer-reference-content`)).toBeHidden();

  const shared = await page.evaluate(async () => {
    const reference = await import("/src/body/bodyFatPeerReference.ts");
    return {
      raw: reference.buildBodyFatPeerReference(17)?.landmarks,
      corrected: reference.buildBodyFatPeerReference(16)?.landmarks,
    };
  });
  expect(shared.raw).toEqual(shared.corrected);
});

test("Wave 1 remains responsive and non-Wave-1 charts retain archetype defaults", async ({ page }) => {
  for (const id of ["Weight Trend", "Waist Trend", "Body Fat % Trend"]) {
    const card = page.getByTestId(`${id}:card`);
    await card.scrollIntoViewIfNeeded();
    await expect(card.getByTestId(`${id}:selected-detail`)).toBeVisible();
    const fits = await card.evaluate((element) => element.scrollWidth <= element.clientWidth && document.documentElement.scrollWidth <= window.innerWidth);
    expect(fits).toBe(true);
  }
  for (const id of ["Confidence Trend"]) {
    const card = page.getByTestId(`${id}:card`);
    await card.scrollIntoViewIfNeeded();
    const svg = card.getByTestId(`${id}:svg`);
    await expect(svg).toHaveAttribute("data-curve-mode", "linear");
    await expect(svg).toHaveAttribute("data-area-fill", "false");
    await expect(card.getByTestId(`${id}:area-fill`)).toHaveCount(0);
    await expect(card.getByTestId(`${id}:selected-detail`)).toHaveCount(0);
  }
});
