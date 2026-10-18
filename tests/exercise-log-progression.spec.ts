import { expect, test } from "@playwright/test";
import { resetDexieDb } from "./helpers/dbSeed";
import { buildRecentExerciseProgressionPacket } from "../src/lib/coachExport/recentExerciseProgression";

test("Exercise Log uses the same strict progression evidence as Coach while detailed history remains available", async ({ page }) => {
  await page.goto("/");
  await resetDexieDb(page);
  const now = Date.now();
  const exercises = [
    { id: "bench", name: "Barbell Bench Press", normalizedName: "barbell bench press", metricMode: "reps", strengthSignalRole: "included", equipmentTags: [], createdAt: now },
    { id: "old-bench", name: "Bench Press Old", normalizedName: "bench press old", metricMode: "reps", mergedIntoExerciseId: "bench", archivedAt: now - 1000, equipmentTags: [], createdAt: now - 1000 },
  ];
  const trackBase = { trackingMode: "weightedReps", trackType: "strength", warmupSetsDefault: 1, workingSetsDefault: 2, repMin: 5, repMax: 10, restSecondsDefault: 120, weightJumpDefault: 5, createdAt: now };
  const tracks = [
    { id: "bench-track", exerciseId: "bench", displayName: "Barbell Bench Press", ...trackBase },
    { id: "old-bench-track", exerciseId: "old-bench", displayName: "Bench Press Old", ...trackBase },
  ];
  const sessions = [
    { id: "latest", templateName: "Upper A", startedAt: now - 1 * 86400000 - 3600000, endedAt: now - 1 * 86400000 },
    { id: "prior", templateName: "Upper A", startedAt: now - 8 * 86400000 - 3600000, endedAt: now - 8 * 86400000 },
  ];
  const set = (id: string, sessionId: string, setType: string, weight: number, reps: number, rir?: number) => ({ id, sessionId, trackId: "bench-track", setType, weight, reps, rir, createdAt: now, completedAt: now });
  const sets = [
    set("latest-working", "latest", "working", 110, 6, 1),
    set("latest-warmup", "latest", "warmup", 450, 10),
    set("latest-drop", "latest", "drop", 500, 10),
    set("latest-failure", "latest", "failure", 475, 12, 0),
    { ...set("prior-working", "prior", "working", 100, 6, 2), trackId: "old-bench-track" },
  ];
  const coach = buildRecentExerciseProgressionPacket({ exercises: exercises as any, tracks: tracks as any, sessions: sessions as any, sets: sets as any, asOf: now });

  await page.evaluate(async (fixture) => {
    // @ts-ignore
    const db = window.__db;
    await db.exercises.bulkAdd(fixture.exercises);
    await db.tracks.bulkAdd(fixture.tracks);
    await db.sessions.bulkAdd(fixture.sessions);
    await db.sets.bulkAdd(fixture.sets);
  }, { exercises, tracks, sessions, sets });

  await page.goto("/exercises");
  await page.getByRole("button", { name: /Barbell Bench Press/i }).first().click();
  const summary = page.getByTestId("exercise-progression-summary");
  await expect(summary).toContainText("Direction: higher");
  await expect(summary).toContainText(`Comparable observations: ${coach[0].observationCount}`);
  await expect(summary).toContainText("110 x 6");
  await expect(summary).toContainText("RIR 1");
  await expect(summary).not.toContainText("500 x 10");
  await expect(summary).not.toContainText("475 x 12");
  await expect(page.getByText("Progression uses completed working sets only.")).toBeVisible();
  await expect(page.getByText("Detailed completed sessions")).toBeVisible();
  await expect(page.getByText(/Best set:\s*500 x 10/i)).toBeVisible();
});

test("Exercise Log progression summary renders time and distance metrics", async ({ page }) => {
  await page.goto("/");
  await resetDexieDb(page);
  const now = Date.now();
  await page.evaluate(async ({ now }) => {
    // @ts-ignore
    const db = window.__db;
    const exercises = [
      { id: "plank", name: "Plank", normalizedName: "plank", metricMode: "time", equipmentTags: [], createdAt: now },
      { id: "carry", name: "Loaded Carry", normalizedName: "loaded carry", metricMode: "distance", equipmentTags: [], createdAt: now },
    ];
    const tracks = exercises.map((row) => ({ id: `track-${row.id}`, exerciseId: row.id, displayName: row.name, trackingMode: row.metricMode === "time" ? "timeSeconds" : "weightedReps", trackType: "strength", warmupSetsDefault: 0, workingSetsDefault: 1, repMin: 1, repMax: 20, restSecondsDefault: 60, weightJumpDefault: 5, createdAt: now }));
    const sessions = [{ id: "recent", startedAt: now - 86401000, endedAt: now - 86400000 }, { id: "prior", startedAt: now - 8 * 86400000 - 1000, endedAt: now - 8 * 86400000 }];
    const sets = [
      { id: "plank-r", sessionId: "recent", trackId: "track-plank", setType: "working", seconds: 75, createdAt: now, completedAt: now },
      { id: "plank-p", sessionId: "prior", trackId: "track-plank", setType: "working", seconds: 60, createdAt: now, completedAt: now },
      { id: "carry-r", sessionId: "recent", trackId: "track-carry", setType: "working", distance: 80, distanceUnit: "m", createdAt: now, completedAt: now },
      { id: "carry-p", sessionId: "prior", trackId: "track-carry", setType: "working", distance: 70, distanceUnit: "m", createdAt: now, completedAt: now },
    ];
    await db.exercises.bulkAdd(exercises);
    await db.tracks.bulkAdd(tracks);
    await db.sessions.bulkAdd(sessions);
    await db.sets.bulkAdd(sets);
  }, { now });

  await page.goto("/exercises");
  await page.getByRole("button", { name: /Plank/i }).first().click();
  await expect(page.getByTestId("exercise-progression-summary")).toContainText("75 sec");
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: /Loaded Carry/i }).first().click();
  await expect(page.getByTestId("exercise-progression-summary")).toContainText("80 m");
});
