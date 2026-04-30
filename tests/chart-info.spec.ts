import { expect, test, type Page } from "@playwright/test";

import { resetDexieDb } from "./helpers/dbSeed";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173/";

async function goto(page: Page, path: string) {
  await page.goto(new URL(path, BASE_URL).toString(), { waitUntil: "domcontentloaded" });
}

async function seedChartInfoData(page: Page) {
  return await page.evaluate(async () => {
    // @ts-ignore
    const db = window.__db;
    if (!db) throw new Error("__db missing on window.");

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const uuid = () => crypto.randomUUID();

    const exercises = [
      { name: "Back Squat", equipment: "Barbell", category: "Barbell", baseWeight: 225 },
      { name: "Romanian Deadlift", equipment: "Barbell", category: "Barbell", baseWeight: 245 },
      { name: "Bench Press", equipment: "Barbell", category: "Barbell", baseWeight: 185 },
      { name: "Pull Up", equipment: "Bodyweight", category: "Bodyweight", baseWeight: 0 },
    ];

    const tracks = await Promise.all(
      exercises.map(async (exercise, index) => {
        const exerciseId = uuid();
        const trackId = uuid();

        await db.exercises.add({
          id: exerciseId,
          name: exercise.name,
          equipment: exercise.equipment,
          category: exercise.category,
          equipmentTags: [exercise.category.toLowerCase()],
          createdAt: now - (120 + index) * dayMs,
        });

        await db.tracks.add({
          id: trackId,
          exerciseId,
          trackType: "strength",
          displayName: exercise.name,
          trackingMode: "weightedReps",
          warmupSetsDefault: 0,
          workingSetsDefault: 2,
          repMin: 4,
          repMax: 8,
          restSecondsDefault: 150,
          weightJumpDefault: 5,
          createdAt: now - (120 + index) * dayMs,
        });

        return { ...exercise, trackId };
      })
    );

    await db.bodyMetrics.bulkAdd(
      Array.from({ length: 14 }, (_, index) => {
        const measuredAt = now - (13 - index) * 7 * dayMs;
        const weightLb = 208 - index * 0.7;
        const bodyFatPct = 24 - index * 0.18;
        const ecwLb = 38.5 - index * 0.04;
        const icwLb = 64.5 - index * 0.08;

        return {
          id: uuid(),
          weightLb,
          waistIn: 37.5 - index * 0.08,
          bodyFatPct,
          bodyFatMassLb: weightLb * (bodyFatPct / 100),
          leanMassLb: weightLb * (1 - bodyFatPct / 100),
          bodyWaterPct: 52 + index * 0.12,
          ecwLb,
          icwLb,
          measuredAt,
          takenAt: measuredAt,
          createdAt: measuredAt,
        };
      })
    );

    for (let week = 0; week < 12; week += 1) {
      const sessionId = uuid();
      const sessionAt = now - (11 - week) * 7 * dayMs;

      await db.sessions.add({
        id: sessionId,
        startedAt: sessionAt,
        endedAt: sessionAt + 45 * 60 * 1000,
      });

      for (const exercise of tracks) {
        const load =
          exercise.name === "Pull Up" ? 0 : exercise.baseWeight + week * 5;

        await db.sets.add({
          id: uuid(),
          sessionId,
          trackId: exercise.trackId,
          setType: "working",
          weight: load,
          reps: exercise.name === "Pull Up" ? 6 : 5,
          rpe: 8,
          completedAt: sessionAt + 5 * 60 * 1000,
          createdAt: sessionAt + 5 * 60 * 1000,
        });
      }
    }
  });
}

async function expectInfoButtons(page: Page, titles: string[]) {
  for (const title of titles) {
    await expect(
      page.getByRole("button", { name: `More information about ${title}` })
    ).toBeVisible();
  }
}

async function openInfoModal(page: Page, title: string) {
  await page.getByRole("button", { name: `More information about ${title}` }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(title, { exact: true })).toBeVisible();
}

function centerY(box: { y: number; height: number }) {
  return box.y + box.height / 2;
}

test.describe("Chart info buttons", () => {
  test.beforeEach(async ({ page }) => {
    await goto(page, "/");
    await resetDexieDb(page);
    await seedChartInfoData(page);
  });

  test("Performance charts render info buttons and open chart info modal", async ({ page }) => {
    await goto(page, "/performance");

    await expectInfoButtons(page, [
      "Performance Strength Signal Trend",
      "Performance Body Weight Trend",
      "Performance Waist Trend",
      "Performance Training Load Trend",
    ]);

    await openInfoModal(page, "Performance Strength Signal Trend");
  });

  test("Strength charts render info buttons and open chart info modal", async ({ page }) => {
    await goto(page, "/strength");

    await expectInfoButtons(page, [
      "Strength Signal Trend",
      "Relative Strength Trend",
    ]);

    await openInfoModal(page, "Strength Signal Trend");
  });

  test("Shared chart header keeps title, info, and status in distinct rendered zones", async ({ page }) => {
    await goto(page, "/performance");

    const title = page.getByTestId("performance-strength-signal-trend:title");
    const titleRow = page.getByTestId("performance-strength-signal-trend:title-row");
    const info = page
      .getByTestId("performance-strength-signal-trend:title-info")
      .getByRole("button", { name: "More information about Performance Strength Signal Trend" });
    const status = page.getByTestId("performance-strength-signal-trend:status-content");
    const subtitle = page.getByTestId("performance-strength-signal-trend:subtitle");

    await expect(title).toBeVisible();
    await expect(titleRow).toBeVisible();
    await expect(info).toBeVisible();
    await expect(status).toBeVisible();
    await expect(subtitle).toBeVisible();

    const [titleBox, titleRowBox, infoBox, statusBox, subtitleBox] = await Promise.all([
      title.boundingBox(),
      titleRow.boundingBox(),
      info.boundingBox(),
      status.boundingBox(),
      subtitle.boundingBox(),
    ]);

    expect(titleBox).not.toBeNull();
    expect(titleRowBox).not.toBeNull();
    expect(infoBox).not.toBeNull();
    expect(statusBox).not.toBeNull();
    expect(subtitleBox).not.toBeNull();

    if (!titleBox || !titleRowBox || !infoBox || !statusBox || !subtitleBox) return;

    expect(infoBox.y).toBeGreaterThanOrEqual(titleRowBox.y - 2);
    expect(infoBox.y + infoBox.height).toBeLessThanOrEqual(titleRowBox.y + titleRowBox.height + 8);
    expect(infoBox.x).toBeGreaterThanOrEqual(titleBox.x);
    expect(infoBox.x - (titleBox.x + titleBox.width)).toBeLessThanOrEqual(48);
    expect(statusBox.x).toBeGreaterThanOrEqual(infoBox.x);
    expect(subtitleBox.y).toBeGreaterThan(titleRowBox.y + titleRowBox.height - 2);
  });

  test("Strength chart readout renders value, date, and summary as separate rows", async ({ page }) => {
    await goto(page, "/strength");

    const value = page.getByTestId("strength-signal-trend:readout-value");
    const valueRow = page.getByTestId("strength-signal-trend:readout-value-row");
    const datePill = page.getByTestId("strength-signal-trend:readout-label");
    const summaryRow = page.getByTestId("strength-signal-trend:readout-summary-row");

    await value.scrollIntoViewIfNeeded();
    await expect(value).toBeVisible();
    await expect(valueRow).toBeVisible();
    await expect(datePill).toBeVisible();
    await expect(summaryRow).toBeVisible();

    const [valueBox, valueRowBox, dateBox, summaryBox] = await Promise.all([
      value.boundingBox(),
      valueRow.boundingBox(),
      datePill.boundingBox(),
      summaryRow.boundingBox(),
    ]);

    expect(valueBox).not.toBeNull();
    expect(valueRowBox).not.toBeNull();
    expect(dateBox).not.toBeNull();
    expect(summaryBox).not.toBeNull();

    if (!valueBox || !valueRowBox || !dateBox || !summaryBox) return;

    expect(dateBox.y + dateBox.height).toBeLessThanOrEqual(valueRowBox.y + valueRowBox.height + 8);
    expect(summaryBox.y).toBeGreaterThan(valueRowBox.y + valueRowBox.height - 2);
  });

  test("Body charts render info buttons and open chart info modal", async ({ page }) => {
    await goto(page, "/body");

    await expectInfoButtons(page, [
      "Weight Trend",
      "Waist Trend",
    ]);

    await openInfoModal(page, "Waist Trend");
  });

  test("Body Composition charts render info buttons and open chart info modal", async ({
    page,
  }) => {
    await goto(page, "/body-composition");

    await expectInfoButtons(page, [
      "Weight Trend",
      "Body Fat % Trend",
    ]);

    await openInfoModal(page, "Body Fat % Trend");
  });
});
