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
      "Relative Strength Trend",
    ]);

    await openInfoModal(page, "Relative Strength Trend");
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
