import { expect, test, type Page } from "@playwright/test";
import { resetDexieDb } from "./helpers/dbSeed";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173/";

async function goto(page: Page, path: string) {
  await page.goto(new URL(path, BASE_URL).toString(), { waitUntil: "domcontentloaded" });
}

async function seedSameDayHistoryWalks(page: Page) {
  return page.evaluate(async () => {
    const db = (window as any).__db;
    if (!db) throw new Error("__db missing on window.");

    const uuid = () => crypto.randomUUID();
    const base = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const at = (hour: number, minute: number) =>
      new Date(base.getFullYear(), base.getMonth(), base.getDate(), hour, minute).getTime();

    const exerciseId = uuid();
    const timeTrackId = uuid();
    const distanceTrackId = uuid();
    const treadmillSessionId = uuid();
    const parkSessionId = uuid();
    const mapMyWalkSessionId = uuid();

    await db.exercises.add({
      id: exerciseId,
      name: "Walk",
      normalizedName: "walk",
      category: "Cardio",
      metricMode: "distance",
      equipmentTags: ["bodyweight"],
      createdAt: at(8, 0),
    });

    await db.tracks.bulkAdd([
      {
        id: timeTrackId,
        exerciseId,
        trackType: "conditioning",
        displayName: "Walk",
        trackingMode: "timeSeconds",
        warmupSetsDefault: 0,
        workingSetsDefault: 1,
        repMin: 1,
        repMax: 1,
        restSecondsDefault: 0,
        weightJumpDefault: 0,
        createdAt: at(8, 1),
      },
      {
        id: distanceTrackId,
        exerciseId,
        trackType: "conditioning",
        displayName: "Walk",
        trackingMode: "repsOnly",
        warmupSetsDefault: 0,
        workingSetsDefault: 1,
        repMin: 1,
        repMax: 1,
        restSecondsDefault: 0,
        weightJumpDefault: 0,
        createdAt: at(8, 2),
      },
    ]);

    await db.sessions.bulkAdd([
      {
        id: treadmillSessionId,
        templateName: "Walk - Treadmill",
        startedAt: at(9, 30),
        endedAt: at(9, 50),
        notes: "",
      },
      {
        id: parkSessionId,
        templateName: "Walk - Park",
        startedAt: at(13, 0),
        endedAt: at(14, 0),
        notes: "",
      },
      {
        id: mapMyWalkSessionId,
        templateName: "Walk - MapMyWalk",
        startedAt: at(17, 30),
        endedAt: at(18, 30),
        notes: "Route: Neighborhood Loop\nPace: 20:00/mi",
      },
    ]);

    await db.sets.bulkAdd([
      {
        id: uuid(),
        sessionId: treadmillSessionId,
        trackId: timeTrackId,
        createdAt: at(9, 31),
        setType: "working",
        seconds: 20 * 60,
      },
      {
        id: uuid(),
        sessionId: parkSessionId,
        trackId: timeTrackId,
        createdAt: at(13, 1),
        setType: "working",
        seconds: 60 * 60,
      },
      {
        id: uuid(),
        sessionId: mapMyWalkSessionId,
        trackId: distanceTrackId,
        createdAt: at(17, 31),
        setType: "working",
        distance: 3 * 1609.344,
        distanceUnit: "m",
      },
      {
        id: uuid(),
        sessionId: mapMyWalkSessionId,
        trackId: timeTrackId,
        createdAt: at(17, 32),
        setType: "working",
        seconds: 60 * 60,
      },
    ]);

    return { treadmillSessionId, parkSessionId, mapMyWalkSessionId };
  });
}

test.describe("/walks History-backed summary", () => {
  test("shows empty state, points to Paste Workout, and ignores legacy manual db.walks rows", async ({ page }) => {
    await resetDexieDb(page);

    await page.evaluate(async () => {
      const db = (window as any).__db;
      if (!db) throw new Error("__db missing on window.");
      await db.walks.add({
        id: crypto.randomUUID(),
        date: Date.now(),
        durationSeconds: 1800,
        distanceMiles: 1.5,
        notes: "Legacy manual walk",
      });
    });

    await goto(page, "/walks");

    await expect(page.getByTestId("walks-empty-state")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("walks-empty-state")).toContainText("No imported walk sessions found yet.");
    await expect(page.getByTestId("walks-empty-state")).toContainText("Paste Workout");
    await expect(page.getByRole("button", { name: /add walk/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /delete/i })).toHaveCount(0);
    await expect(page.getByText("Legacy manual walk")).toHaveCount(0);
  });

  test("shows the same History-backed totals and preserves same-day walk rows", async ({ page }) => {
    await resetDexieDb(page);
    const seeded = await seedSameDayHistoryWalks(page);

    await goto(page, "/walks");

    await expect(page.getByTestId("walks-last7-count")).toHaveText("3 walks");
    await expect(page.getByTestId("walks-last7-duration")).toHaveText("2h 20m");
    await expect(page.getByTestId("walks-last7-distance")).toHaveText("3.0 mi");
    await expect(page.getByTestId("walks-last28-count")).toHaveText("3 walks");
    await expect(page.getByTestId("walks-last28-duration")).toHaveText("2h 20m");
    await expect(page.getByTestId("walks-last28-distance")).toHaveText("3.0 mi");
    await expect(page.getByTestId("walks-average-duration")).toHaveText("47 min");
    await expect(page.getByTestId("walks-average-pace")).toHaveText("20:00/mi");

    await expect(page.getByTestId("walks-history-list").getByTestId(/^walks-history-row:/)).toHaveCount(3);
    await expect(page.getByTestId(`walks-history-row:${seeded.treadmillSessionId}`)).toBeVisible();
    await expect(page.getByTestId(`walks-history-row:${seeded.parkSessionId}`)).toBeVisible();
    await expect(page.getByTestId(`walks-history-row:${seeded.mapMyWalkSessionId}`)).toBeVisible();
    await expect(page.getByTestId(`walks-history-row-meta:${seeded.mapMyWalkSessionId}`)).toHaveText(
      "60 min · 3.0 mi · 20:00/mi · Neighborhood Loop"
    );
  });
});
