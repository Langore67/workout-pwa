import { expect, test, type Page } from "@playwright/test";

import { resetDexieDb } from "./helpers/dbSeed";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173/";

async function goto(page: Page, path: string) {
  await page.goto(new URL(path, BASE_URL).toString(), { waitUntil: "domcontentloaded" });
}

async function seedStrengthViewportData(page: Page) {
  return await page.evaluate(async () => {
    // @ts-ignore
    const db = window.__db;
    if (!db) throw new Error("__db missing on window.");

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const uuid = () => crypto.randomUUID();

    const exercises = [
      { name: "Back Squat", pattern: "squat", baseWeight: 225 },
      { name: "Romanian Deadlift", pattern: "hinge", baseWeight: 245 },
      { name: "Bench Press", pattern: "push", baseWeight: 185 },
      { name: "Pull Up", pattern: "pull", baseWeight: 0 },
    ];

    const exerciseIds = await Promise.all(
      exercises.map(async (exercise, index) => {
        const exerciseId = uuid();
        const trackId = uuid();

        await db.exercises.add({
          id: exerciseId,
          name: exercise.name,
          equipment: exercise.name === "Pull Up" ? "Bodyweight" : "Barbell",
          category: exercise.name === "Pull Up" ? "Bodyweight" : "Barbell",
          equipmentTags: [exercise.name === "Pull Up" ? "bodyweight" : "barbell"],
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

        return { exerciseId, trackId, ...exercise };
      })
    );

    const bodyMetrics = Array.from({ length: 14 }, (_, index) => ({
      id: uuid(),
      weightLb: 194 - index * 0.6,
      measuredAt: now - (index * 7 + 1) * dayMs,
      takenAt: now - (index * 7 + 1) * dayMs,
      createdAt: now - (index * 7 + 1) * dayMs,
    }));

    await db.bodyMetrics.bulkAdd(bodyMetrics);

    for (let week = 0; week < 12; week += 1) {
      const sessionId = uuid();
      const sessionAt = now - (week * 7 + 2) * dayMs;

      await db.sessions.add({
        id: sessionId,
        startedAt: sessionAt,
        endedAt: sessionAt + 45 * 60 * 1000,
      });

      for (const exercise of exerciseIds) {
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

test.describe("Strength moving-pane viewport", () => {
  test.beforeEach(async ({ page }) => {
    await goto(page, "/");
    await resetDexieDb(page);
  });

  test("Strength Signal exposes the current five-point drag surface without a legacy slider", async ({
    page,
  }) => {
    await seedStrengthViewportData(page);

    await goto(page, "/strength");
    const id = "strength-signal-trend";
    const overlay = page.getByTestId(`${id}:overlay`);
    await expect(overlay).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId(`${id}:slider-input`)).toHaveCount(0);
    const points = page.locator(`[data-testid="${id}:point"]`);
    await expect(points).toHaveCount(5);
    await expect(overlay).toHaveCSS("cursor", "grab");
  });

  test("Strength Signal keeps touch selection and omits the retired slider on iPhone", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "iphone", "Mobile touch path only");

    await seedStrengthViewportData(page);

    await goto(page, "/strength");
    const id = "strength-signal-trend";
    const overlay = page.getByTestId(`${id}:overlay`);
    await overlay.scrollIntoViewIfNeeded();
    await expect(overlay).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId(`${id}:slider-input`)).toHaveCount(0);
    await expect(page.locator(`[data-testid="${id}:point"]`)).toHaveCount(5);
    const box = await overlay.boundingBox();
    if (!box) throw new Error("Strength Signal touch surface missing");
    await page.touchscreen.tap(box.x + box.width * 0.35, box.y + box.height * 0.45);
    await expect(page.getByTestId(`${id}:selected-detail`)).toContainText("Selected point");
  });
});
