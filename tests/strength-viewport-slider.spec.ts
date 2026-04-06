import { expect, test, type Page } from "@playwright/test";

import { resetDexieDb } from "./helpers/dbSeed";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173/";

async function goto(page: Page, path: string) {
  await page.goto(new URL(path, BASE_URL).toString(), { waitUntil: "domcontentloaded" });
}

async function setSliderValue(
  page: Page,
  sliderAriaLabel: string,
  nextValue: number,
) {
  await page.evaluate(
    ({ sliderAriaLabel, nextValue }) => {
      const slider = document.querySelector<HTMLInputElement>(
        `input[type="range"][aria-label="${sliderAriaLabel}"]`,
      );
      if (!slider) throw new Error(`Slider not found: ${sliderAriaLabel}`);
      slider.value = String(nextValue);
      slider.dispatchEvent(new Event("input", { bubbles: true }));
      slider.dispatchEvent(new Event("change", { bubbles: true }));
    },
    { sliderAriaLabel, nextValue },
  );
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

test.describe("Strength viewport slider", () => {
  test.beforeEach(async ({ page }) => {
    await goto(page, "/");
    await resetDexieDb(page);
  });

  test("dragging the Strength Signal viewport updates the visible chart window", async ({
    page,
  }) => {
    await seedStrengthViewportData(page);

    await goto(page, "/strength");
    await expect(page.getByText("Strength Signal Trend")).toBeVisible({ timeout: 15000 });

    const slider = page.getByRole("slider", { name: "Strength Signal Trend viewport" });
    await slider.scrollIntoViewIfNeeded();
    await expect(slider).toBeVisible({ timeout: 15000 });
    await expect(slider).toHaveAttribute("aria-valuenow", "7");
    await expect(page.getByText("7-12 of 12")).toBeVisible();

    await setSliderValue(page, "Strength Signal Trend viewport", 2);

    const afterFirstDrag = Number(await slider.getAttribute("aria-valuenow"));
    expect(Number.isFinite(afterFirstDrag)).toBe(true);
    expect(afterFirstDrag).toBeLessThan(7);
    await expect(page.getByText("7-12 of 12")).toBeHidden();

    await setSliderValue(page, "Strength Signal Trend viewport", 5);

    const afterSecondDrag = Number(await slider.getAttribute("aria-valuenow"));
    expect(Number.isFinite(afterSecondDrag)).toBe(true);
    expect(afterSecondDrag).toBeGreaterThan(afterFirstDrag);
  });

  test("changing the Strength Signal viewport slider updates the visible chart window on iPhone", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "iphone", "Mobile touch path only");

    await seedStrengthViewportData(page);

    await goto(page, "/strength");
    const slider = page.getByRole("slider", { name: "Strength Signal Trend viewport" });
    await slider.scrollIntoViewIfNeeded();
    await expect(slider).toBeVisible({ timeout: 15000 });
    await expect(slider).toHaveAttribute("aria-valuenow", "7");

    await setSliderValue(page, "Strength Signal Trend viewport", 3);

    await expect.poll(async () => Number(await slider.getAttribute("aria-valuenow"))).toBeLessThan(7);

    const afterFirstTouchDrag = Number(await slider.getAttribute("aria-valuenow"));
    await setSliderValue(page, "Strength Signal Trend viewport", 6);

    await expect.poll(async () => Number(await slider.getAttribute("aria-valuenow"))).toBeGreaterThan(
      afterFirstTouchDrag,
    );
  });
});
