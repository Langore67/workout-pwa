import { test, expect, type Page } from "@playwright/test";
import { resetDexieDb } from "./helpers/dbSeed";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173/";

async function goto(page: Page, path: string) {
  await page.goto(new URL(path, BASE_URL).toString(), { waitUntil: "domcontentloaded" });
}

async function seedPerformanceBodyweightTiming(page: Page) {
  return await page.evaluate(async () => {
    // @ts-ignore
    const db = window.__db;
    if (!db) throw new Error("__db missing on window.");

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const uuid = () => crypto.randomUUID();

    const exerciseId = uuid();
    const trackId = uuid();
    const olderSessionAId = uuid();
    const olderSessionBId = uuid();
    const recentSessionAId = uuid();
    const recentSessionBId = uuid();

    await db.exercises.add({
      id: exerciseId,
      name: "Pull Up",
      equipment: "Bodyweight",
      category: "Bodyweight",
      equipmentTags: ["bodyweight"],
      createdAt: now - 30 * dayMs,
    });

    await db.tracks.add({
      id: trackId,
      exerciseId,
      trackType: "hypertrophy",
      displayName: "Pull Up",
      trackingMode: "weightedReps",
      warmupSetsDefault: 0,
      workingSetsDefault: 3,
      repMin: 5,
      repMax: 10,
      restSecondsDefault: 120,
      weightJumpDefault: 5,
      createdAt: now - 30 * dayMs,
    });

    await db.bodyMetrics.bulkAdd([
      {
        id: uuid(),
        weightLb: 220,
        measuredAt: now - 20 * dayMs,
        takenAt: now - 20 * dayMs,
        createdAt: now - 20 * dayMs,
      },
      {
        id: uuid(),
        weightLb: 180,
        measuredAt: now - 6 * dayMs,
        takenAt: now - 6 * dayMs,
        createdAt: now - 6 * dayMs,
      },
      {
        id: uuid(),
        weightLb: 170,
        measuredAt: now - 1 * dayMs,
        takenAt: now - 1 * dayMs,
        createdAt: now - 1 * dayMs,
      },
    ]);

    await db.sessions.bulkAdd([
      {
        id: olderSessionAId,
        startedAt: now - 18 * dayMs,
        endedAt: now - 18 * dayMs + 45 * 60 * 1000,
      },
      {
        id: olderSessionBId,
        startedAt: now - 16 * dayMs,
        endedAt: now - 16 * dayMs + 45 * 60 * 1000,
      },
      {
        id: recentSessionAId,
        startedAt: now - 5 * dayMs,
        endedAt: now - 5 * dayMs + 45 * 60 * 1000,
      },
      {
        id: recentSessionBId,
        startedAt: now - 4 * dayMs,
        endedAt: now - 4 * dayMs + 45 * 60 * 1000,
      },
    ]);

    await db.sets.bulkAdd([
      {
        id: uuid(),
        sessionId: olderSessionAId,
        trackId,
        setType: "working",
        weight: 0,
        reps: 5,
        completedAt: now - 18 * dayMs + 5 * 60 * 1000,
        createdAt: now - 18 * dayMs + 5 * 60 * 1000,
      },
      {
        id: uuid(),
        sessionId: olderSessionBId,
        trackId,
        setType: "working",
        weight: 0,
        reps: 5,
        completedAt: now - 16 * dayMs + 5 * 60 * 1000,
        createdAt: now - 16 * dayMs + 5 * 60 * 1000,
      },
      {
        id: uuid(),
        sessionId: recentSessionAId,
        trackId,
        setType: "working",
        weight: 0,
        reps: 5,
        completedAt: now - 5 * dayMs + 5 * 60 * 1000,
        createdAt: now - 5 * dayMs + 5 * 60 * 1000,
      },
      {
        id: uuid(),
        sessionId: recentSessionBId,
        trackId,
        setType: "working",
        weight: 0,
        reps: 5,
        completedAt: now - 4 * dayMs + 5 * 60 * 1000,
        createdAt: now - 4 * dayMs + 5 * 60 * 1000,
      },
    ]);
  });
}

test.describe("Performance bodyweight timing", () => {
  test.beforeEach(async ({ page }) => {
    await goto(page, "/");
    await resetDexieDb(page);
  });

  test("uses bodyweight appropriate to each pull-up session instead of latest current bodyweight", async ({ page }) => {
    await seedPerformanceBodyweightTiming(page);

    await goto(page, "/performance");
    await expect(page.getByText("Strength Signal Details")).toBeVisible({ timeout: 15000 });

    await page.getByRole("button", { name: "Show Details" }).click();

    const topDrivers = page.locator(".card").filter({ hasText: "Top Exercise Drivers" }).first();
    await expect(topDrivers).toContainText("Pull Up", { timeout: 15000 });
    await expect(topDrivers).toContainText("-18.18% • 0.45", { timeout: 15000 });
  });
});
