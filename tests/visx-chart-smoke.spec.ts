import { expect, test, type Page } from "@playwright/test";

import { resetDexieDb } from "./helpers/dbSeed";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173/";

async function goto(page: Page, path: string) {
  await page.goto(new URL(path, BASE_URL).toString(), { waitUntil: "domcontentloaded" });
}

async function seedSharedStrengthTrendData(page: Page) {
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
          createdAt: now - (90 + index) * dayMs,
        });

        await db.tracks.add({
          id: trackId,
          exerciseId,
          trackType: "strength",
          displayName: exercise.name,
          trackingMode: "weightedReps",
          warmupSetsDefault: 0,
          workingSetsDefault: 1,
          repMin: 4,
          repMax: 8,
          restSecondsDefault: 150,
          weightJumpDefault: 5,
          createdAt: now - (90 + index) * dayMs,
        });

        return { ...exercise, trackId };
      })
    );

    await db.bodyMetrics.bulkAdd(
      Array.from({ length: 14 }, (_, index) => ({
        id: uuid(),
        weightLb: 194 - index * 0.6,
        measuredAt: now - (index * 7 + 1) * dayMs,
        takenAt: now - (index * 7 + 1) * dayMs,
        createdAt: now - (index * 7 + 1) * dayMs,
      }))
    );

    for (let week = 0; week < 12; week += 1) {
      const sessionId = uuid();
      const sessionAt = now - (week * 7 + 2) * dayMs;

      await db.sessions.add({
        id: sessionId,
        startedAt: sessionAt,
        endedAt: sessionAt + 45 * 60 * 1000,
      });

      for (const exercise of tracks) {
        const load =
          exercise.name === "Pull Up" ? 0 : exercise.baseWeight + (11 - week) * 5;

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

async function expectRenderedVisxTrendChart(page: Page, title: string) {
  const card = page.getByTestId(`visx-trend-chart-card:${title}`).first();
  await expect(card).toBeVisible({ timeout: 15000 });

  const host = card.getByTestId(`visx-trend-chart-host:${title}`);
  await expect(host).toBeVisible({ timeout: 15000 });

  const chart = card.getByTestId(`visx-trend-chart-svg:${title}`);
  await expect(chart).toBeVisible({ timeout: 15000 });

  const markers = chart.locator("circle");
  const paths = chart.locator("path");

  expect(await markers.count()).toBeGreaterThan(1);
  expect(await paths.count()).toBeGreaterThan(0);
}

test.describe("VisX chart smoke", () => {
  test.beforeEach(async ({ page }) => {
    await goto(page, "/");
    await resetDexieDb(page);
  });

  test("Strength and Performance render the current VisX Strength Signal Trend charts with seeded data", async ({
    page,
  }) => {
    await seedSharedStrengthTrendData(page);

    await goto(page, "/strength");
    await expectRenderedVisxTrendChart(page, "Strength Signal Trend");

    await goto(page, "/performance");
    await expectRenderedVisxTrendChart(page, "Strength Signal Trend");
  });
});
