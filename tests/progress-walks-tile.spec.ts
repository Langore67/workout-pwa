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
    const now = Date.now();
    const base = new Date(now - 24 * 60 * 60 * 1000);
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
        notes: [
          "Source: MapMyWalk screenshot",
          "Route: Neighborhood Loop",
          "Pace: 20:00/mi",
          "Elevation: 120 ft",
          "Avg HR: 112",
          "Max HR: 138",
        ].join("\n"),
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

test.describe("Progress Walks tile", () => {
  test("shows empty state and ignores legacy manual db.walks rows", async ({ page }) => {
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

    await goto(page, "/progress");

    await expect(page.getByTestId("progress-walks-tile")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("progress-walks-empty")).toHaveText("No imported walk sessions found yet.");
    await expect(page.getByTestId("progress-walks-tile")).toContainText(
      "Paste MapMyWalk screenshot summaries into Paste Workout to add walks to History."
    );
  });

  test("shows History-based totals and keeps multiple same-day walks as separate recent rows", async ({ page }) => {
    await resetDexieDb(page);
    const seeded = await seedSameDayHistoryWalks(page);

    await goto(page, "/progress");

    await expect(page.getByTestId("progress-walks-last7-count")).toHaveText("3 walks");
    await expect(page.getByTestId("progress-walks-last7-duration")).toHaveText("2h 20m");
    await expect(page.getByTestId("progress-walks-last7-distance")).toHaveText("3.0 mi");
    await expect(page.getByTestId("progress-walks-last28-count")).toHaveText("3 walks");
    await expect(page.getByTestId("progress-walks-last28-duration")).toHaveText("2h 20m");
    await expect(page.getByTestId("progress-walks-last28-distance")).toHaveText("3.0 mi");
    await expect(page.getByTestId("progress-walks-average-duration")).toHaveText("47 min");
    await expect(page.getByTestId("progress-walks-average-pace")).toHaveText("20:00/mi");

    await expect(page.getByTestId(`progress-walk-row:${seeded.treadmillSessionId}`)).toBeVisible();
    await expect(page.getByTestId(`progress-walk-row:${seeded.parkSessionId}`)).toBeVisible();
    await expect(page.getByTestId(`progress-walk-row:${seeded.mapMyWalkSessionId}`)).toBeVisible();
    await expect(page.getByTestId("progress-walks-tile").getByTestId(/^progress-walk-row:/)).toHaveCount(3);

    await expect(page.getByTestId(`progress-walk-row-meta:${seeded.mapMyWalkSessionId}`)).toHaveText(
      "60 min · 3.0 mi · 20:00/mi · Neighborhood Loop"
    );
    await expect(page.getByTestId(`progress-walk-row-meta:${seeded.parkSessionId}`)).toHaveText("60 min");
  });

  test("hides pace when distance or duration is missing and reports data quality", async ({ page }) => {
    await resetDexieDb(page);

    const seeded = await page.evaluate(async () => {
      const db = (window as any).__db;
      if (!db) throw new Error("__db missing on window.");

      const uuid = () => crypto.randomUUID();
      const now = Date.now();
      const exerciseId = uuid();
      const distanceTrackId = uuid();
      const sessionId = uuid();

      await db.exercises.add({
        id: exerciseId,
        name: "Walk",
        normalizedName: "walk",
        category: "Cardio",
        metricMode: "distance",
        equipmentTags: ["bodyweight"],
        createdAt: now - 10_000,
      });
      await db.tracks.add({
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
        createdAt: now - 9_000,
      });
      await db.sessions.add({
        id: sessionId,
        templateName: "Walk - Distance Only",
        startedAt: now - 60 * 60 * 1000,
        notes: "",
      });
      await db.sets.add({
        id: uuid(),
        sessionId,
        trackId: distanceTrackId,
        createdAt: now - 59 * 60 * 1000,
        setType: "working",
        distance: 1609.344,
        distanceUnit: "m",
      });

      return { sessionId };
    });

    await goto(page, "/progress");

    await expect(page.getByTestId(`progress-walk-row:${seeded.sessionId}`)).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId(`progress-walk-row-meta:${seeded.sessionId}`)).toHaveText("1.0 mi");
    await expect(page.getByTestId("progress-walks-tile")).not.toContainText("/mi");
    await expect(page.getByTestId("progress-walks-data-quality")).toContainText("1 walk is missing duration.");
  });
});
