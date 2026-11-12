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
    await db.app_meta.put({ key: "profile.heightIn", valueJson: JSON.stringify({ heightIn: 70 }), updatedAt: now });
  });
  await page.goto(new URL("/body-composition", BASE_URL).toString(), { waitUntil: "domcontentloaded" });
}

test.beforeEach(async ({ page }) => openWaveTwo(page));

for (const id of WAVE_TWO_CHARTS) {
  test(`${id} uses the modern green mass-chart treatment and normalized peer metric`, async ({ page }) => {
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
    const peer = card.getByTestId(`${id}:peer-reference`);
    await expect(peer).toBeVisible();
    await expect(peer).toContainText(id === "Fat Mass Trend" ? "Peer-group reference · FMI" : "Peer-group reference · LMI");
    await expect(peer).toContainText("kg/m²");
    await expect(peer).not.toContainText(/healthy|unhealthy|obese|sarcopen/i);
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

test("retired Confidence Trend remains absent", async ({ page }) => {
  await expect(page.getByTestId("Confidence Trend:card")).toHaveCount(0);
});

test("FMI, LMI, corrected LMI, and waist resolvers use published ordered landmarks", async ({ page }) => {
  const resolved = await page.evaluate(async () => {
    const reference = await import("/src/body/bodyCompositionPeerReferences.ts");
    return {
      fmi: reference.MEN_50_59_FMI_REFERENCE.landmarks,
      lmi: reference.MEN_50_59_LMI_REFERENCE.landmarks,
      waist: reference.MEN_50_59_WAIST_REFERENCE_CM.landmarks,
      lean: reference.buildLeanMassIndexPeerReference(140, 70)?.landmarks,
      corrected: reference.buildLeanMassIndexPeerReference(138, 70, true)?.landmarks,
      missingHeight: reference.buildFatMassIndexPeerReference(30, Number.NaN),
    };
  });
  expect(resolved.fmi).toEqual([
    { percentile: 10, value: 4.7 }, { percentile: 20, value: 5.9 }, { percentile: 30, value: 6.7 },
    { percentile: 40, value: 7.8 }, { percentile: 50, value: 8.7 }, { percentile: 60, value: 9.4 },
    { percentile: 70, value: 10.3 }, { percentile: 80, value: 11.7 }, { percentile: 90, value: 13.4 },
  ]);
  expect(resolved.lmi.map(({ value }) => value)).toEqual([16.3, 17.2, 17.8, 18.3, 18.8, 19.4, 20.1, 20.8, 21.6]);
  expect(resolved.waist.map(({ value }) => value)).toEqual([83.2, 88.2, 90.5, 94.2, 104.3, 114.8, 123.4, 128.4, 137]);
  expect(resolved.lean).toEqual(resolved.corrected);
  expect(resolved.missingHeight).toBeUndefined();
});
