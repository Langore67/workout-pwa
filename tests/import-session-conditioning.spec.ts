import { expect, test, type Page } from "@playwright/test";
import { resetDexieDb } from "./helpers/dbSeed";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173/";

async function goto(page: Page, path: string) {
  await page.goto(new URL(path, BASE_URL).toString(), { waitUntil: "domcontentloaded" });
}

test("IF journal import supports conditioning distance and duration sessions", async ({ page }) => {
  await goto(page, "/");
  await resetDexieDb(page);

  const imported = await page.evaluate(async () => {
    const { importSessionFromJournal, parseIfJournalText } = await import("/src/importers/importSession.ts");
    // @ts-ignore
    const db = window.__db;
    if (!db) throw new Error("__db missing on window.");

    const walkingText = `Session: Walking
Date: 2026-05-01
Notes: outside loop
Walk
conditioning BWx1km easy pace
conditioning BWx2km finish strong`;

    const bodyCoreText = `Session: Body Core
Date: 2026-05-02
Notes: nasal only
Box Breathing
conditioning BWx5min reset between rounds`;

    const parsedWalking = parseIfJournalText(walkingText);
    const parsedBodyCore = parseIfJournalText(bodyCoreText);

    const walkingImport = await importSessionFromJournal({ text: walkingText });
    const bodyCoreImport = await importSessionFromJournal({ text: bodyCoreText });

    const sessions = await db.sessions.orderBy("startedAt").toArray();
    const sets = await db.sets.orderBy("createdAt").toArray();
    const tracks = await db.tracks.toArray();
    const exercises = await db.exercises.toArray();

    const sessionsByName = new Map(sessions.map((row: any) => [row.templateName, row]));
    const tracksById = new Map(tracks.map((row: any) => [row.id, row]));

    const walkingSession = sessionsByName.get("Walking");
    const bodyCoreSession = sessionsByName.get("Body Core");

    const walkingSets = sets.filter((row: any) => row.sessionId === walkingSession?.id);
    const bodyCoreSets = sets.filter((row: any) => row.sessionId === bodyCoreSession?.id);

    return {
      parsedWalkingSetCount: parsedWalking.sets.length,
      parsedBodyCoreSetCount: parsedBodyCore.sets.length,
      walkingImport,
      bodyCoreImport,
      walkingSession,
      bodyCoreSession,
      walkingSets: walkingSets.map((row: any) => ({
        distance: row.distance,
        distanceUnit: row.distanceUnit,
        seconds: row.seconds,
        notes: row.notes,
        trackType: tracksById.get(row.trackId)?.trackType,
        trackingMode: tracksById.get(row.trackId)?.trackingMode,
      })),
      bodyCoreSets: bodyCoreSets.map((row: any) => ({
        distance: row.distance,
        seconds: row.seconds,
        notes: row.notes,
        trackType: tracksById.get(row.trackId)?.trackType,
        trackingMode: tracksById.get(row.trackId)?.trackingMode,
      })),
      exerciseMetricModes: exercises.map((row: any) => ({
        name: row.name,
        metricMode: row.metricMode,
      })),
    };
  });

  expect(imported.parsedWalkingSetCount).toBe(2);
  expect(imported.parsedBodyCoreSetCount).toBe(1);

  expect(imported.walkingSession?.endedAt).toBeGreaterThan(0);
  expect(imported.bodyCoreSession?.endedAt).toBeGreaterThan(0);
  expect(imported.walkingSession?.notes).toContain("outside loop");
  expect(imported.bodyCoreSession?.notes).toContain("nasal only");

  expect(imported.walkingSets).toHaveLength(2);
  expect(imported.walkingSets[0]).toMatchObject({
    distance: 1000,
    distanceUnit: "m",
    seconds: undefined,
    trackType: "conditioning",
    trackingMode: "repsOnly",
  });
  expect(imported.walkingSets[1]).toMatchObject({
    distance: 2000,
    distanceUnit: "m",
    seconds: undefined,
    trackType: "conditioning",
    trackingMode: "repsOnly",
  });

  expect(imported.bodyCoreSets).toHaveLength(1);
  expect(imported.bodyCoreSets[0]).toMatchObject({
    distance: undefined,
    seconds: 300,
    trackType: "conditioning",
    trackingMode: "timeSeconds",
  });

  expect(imported.exerciseMetricModes).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: "Walk", metricMode: "distance" }),
      expect.objectContaining({ name: "Box Breathing", metricMode: "time" }),
    ])
  );

  await goto(page, "/history");
  await expect(page.getByText("Walking")).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("Body Core")).toBeVisible({ timeout: 15000 });
});
