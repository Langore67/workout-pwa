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
Start: 17:25
End: 18:29
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
        id: row.id,
        trackId: row.trackId,
        distance: row.distance,
        distanceUnit: row.distanceUnit,
        seconds: row.seconds,
        notes: row.notes,
        trackType: tracksById.get(row.trackId)?.trackType,
        trackingMode: tracksById.get(row.trackId)?.trackingMode,
      })),
      bodyCoreSets: bodyCoreSets.map((row: any) => ({
        id: row.id,
        trackId: row.trackId,
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
  await expect(page.getByTestId(`history-metrics:${imported.walkingSession.id}`)).toContainText("3 km");
  await expect(page.getByTestId(`history-metrics:${imported.walkingSession.id}`)).not.toContainText("0 lb");

  await goto(page, `/session/${imported.walkingSession.id}`);
  await expect(page.getByTestId("session-activity-metric")).toContainText("Distance 3 km");
  await expect(page.getByTestId(`exercise-activity-time:${imported.walkingSets[0].trackId}`)).toContainText("1h 4m");
  await expect(page.getByTestId(`exercise-activity-distance:${imported.walkingSets[0].trackId}`)).toContainText("3 km");
  await expect(page.getByTestId(`working-table:${imported.walkingSets[0].trackId}`)).toContainText("Distance");
  await expect(page.getByTestId(`set-distance:${imported.walkingSets[0].id}`)).toContainText("1 km");

  await goto(page, `/session/${imported.bodyCoreSession.id}`);
  await expect(page.getByTestId("session-activity-metric")).toContainText("Time 5m");
  await expect(page.getByTestId(`exercise-activity-time:${imported.bodyCoreSets[0].trackId}`)).toContainText("5m");
  await expect(page.getByTestId(`working-table:${imported.bodyCoreSets[0].trackId}`)).toContainText("Time");
  await expect(page.getByTestId(`set-seconds:${imported.bodyCoreSets[0].id}`)).toContainText("5m");

  await page.evaluate(async ({ sessionId, setId }) => {
    // @ts-ignore
    const db = window.__db;
    const session = await db.sessions.get(sessionId);
    if (session) await db.sessions.update(sessionId, { endedAt: undefined });
    await db.sets.update(setId, { completedAt: undefined });
  }, { sessionId: imported.bodyCoreSession.id, setId: imported.bodyCoreSets[0].id });

  await goto(page, `/gym/${imported.bodyCoreSession.id}`);
  const timeInput = page.getByRole("textbox", { name: "time" }).first();
  await expect(timeInput).toBeVisible();
  await expect(timeInput).toHaveValue("05:00");
  await timeInput.fill("06:30");
  await timeInput.blur();
  await expect(timeInput).toHaveValue("06:30");
});

test("IF journal import supports MapMyWalk distance in miles", async ({ page }) => {
  await goto(page, "/");
  await resetDexieDb(page);

  const imported = await page.evaluate(async () => {
    const { importSessionFromJournal } = await import("/src/importers/importSession.ts");
    // @ts-ignore
    const db = window.__db;
    if (!db) throw new Error("__db missing on window.");

    const result = await importSessionFromJournal({
      text: `Session: Walk - MapMyWalk
Date: 2026-05-13
Start: 07:30
End: 08:12

Walk
conditioning BWx3.12mi`,
    });

    const session = await db.sessions.get(result.sessionId);
    const sets = await db.sets.where("sessionId").equals(result.sessionId).toArray();
    const tracks = await db.tracks.toArray();
    const exercises = await db.exercises.toArray();
    const set = sets[0];
    const track = tracks.find((row: any) => row.id === set.trackId);
    const exercise = exercises.find((row: any) => row.id === track.exerciseId);

    return {
      session,
      set,
      track,
      exercise,
      setCount: sets.length,
    };
  });

  expect(imported.session.templateName).toBe("Walk - MapMyWalk");
  expect(imported.setCount).toBe(1);
  expect(imported.exercise.name).toBe("Walk");
  expect(imported.exercise.metricMode).toBe("distance");
  expect(imported.track.displayName).toBe("Walk");
  expect(imported.track.trackType).toBe("conditioning");
  expect(imported.set.distance).toBeCloseTo(5021.15328, 4);
  expect(imported.set.distanceUnit).toBe("m");
  expect(imported.set.seconds).toBeUndefined();
  expect(imported.set.reps).toBeUndefined();
  expect(imported.set.weight).toBeUndefined();
});

test("IF journal import supports MapMyWalk duration in minutes", async ({ page }) => {
  await goto(page, "/");
  await resetDexieDb(page);

  const imported = await page.evaluate(async () => {
    const { importSessionFromJournal } = await import("/src/importers/importSession.ts");
    // @ts-ignore
    const db = window.__db;
    if (!db) throw new Error("__db missing on window.");

    const result = await importSessionFromJournal({
      text: `Session: Walk - MapMyWalk
Date: 2026-05-13

Walk
conditioning BWx42min`,
    });

    const sets = await db.sets.where("sessionId").equals(result.sessionId).toArray();
    const tracks = await db.tracks.toArray();
    const set = sets[0];
    const track = tracks.find((row: any) => row.id === set.trackId);

    return { set, track, setCount: sets.length };
  });

  expect(imported.setCount).toBe(1);
  expect(imported.track.trackType).toBe("conditioning");
  expect(imported.track.trackingMode).toBe("timeSeconds");
  expect(imported.set.seconds).toBe(2520);
  expect(imported.set.distance).toBeUndefined();
});

test("IF journal import supports MapMyWalk distance, duration, notes, and session window", async ({ page }) => {
  await goto(page, "/");
  await resetDexieDb(page);

  const imported = await page.evaluate(async () => {
    const { importSessionFromJournal } = await import("/src/importers/importSession.ts");
    // @ts-ignore
    const db = window.__db;
    if (!db) throw new Error("__db missing on window.");

    const result = await importSessionFromJournal({
      text: `Session: Walk - MapMyWalk
Date: 2026-05-13
Start: 07:30
End: 08:12

Walk
conditioning BWx3.12mi
conditioning BWx42min

Session Notes:
Source: MapMyWalk screenshot
Route: Neighborhood Loop
Pace: 13:28/mi
Elevation: 120 ft
Avg HR: 112
Max HR: 138`,
    });

    const session = await db.sessions.get(result.sessionId);
    const sets = await db.sets.where("sessionId").equals(result.sessionId).sortBy("createdAt");

    return {
      session,
      sets,
      durationMs: session.endedAt - session.startedAt,
    };
  });

  expect(imported.session.templateName).toBe("Walk - MapMyWalk");
  expect(imported.durationMs).toBe(42 * 60 * 1000);
  expect(imported.sets).toHaveLength(2);
  expect(imported.sets.some((set: any) => Math.abs(set.distance - 5021.15328) < 0.001)).toBe(true);
  expect(imported.sets.some((set: any) => set.seconds === 2520)).toBe(true);
  expect(imported.session.notes).toContain("Source: MapMyWalk screenshot");
  expect(imported.session.notes).toContain("Route: Neighborhood Loop");
  expect(imported.session.notes).toContain("Pace: 13:28/mi");
  expect(imported.session.notes).toContain("Elevation: 120 ft");
  expect(imported.session.notes).toContain("Avg HR: 112");
  expect(imported.session.notes).toContain("Max HR: 138");
});

test("IF journal import supports simple conditioning distance and clock duration syntax", async ({ page }) => {
  await goto(page, "/");
  await resetDexieDb(page);

  const imported = await page.evaluate(async () => {
    const { importSessionFromJournal, parseIfJournalText } = await import("/src/importers/importSession.ts");
    // @ts-ignore
    const db = window.__db;
    if (!db) throw new Error("__db missing on window.");

    const text = `Session: Walk - Peachtree Ridge Park
Date: 2026-05-23
Start: 19:04
End: 20:09

Walk
conditioning 6.10km
conditioning duration 1:05:31

Session Notes:
- Avg pace 10:43/km
- Avg HR 115`;

    const parsed = parseIfJournalText(text);
    const result = await importSessionFromJournal({ text });
    const session = await db.sessions.get(result.sessionId);
    const sets = await db.sets.where("sessionId").equals(result.sessionId).sortBy("createdAt");
    const tracks = await db.tracks.toArray();

    return {
      parsedSets: parsed.sets.map((set: any) => ({
        distance: set.distance,
        distanceUnit: set.distanceUnit,
        seconds: set.seconds,
        notes: set.notes,
      })),
      sessionNotes: session.notes,
      sets: sets.map((set: any) => {
        const track = tracks.find((row: any) => row.id === set.trackId);
        return {
          distance: set.distance,
          distanceUnit: set.distanceUnit,
          seconds: set.seconds,
          notes: set.notes,
          trackType: track?.trackType,
          trackingMode: track?.trackingMode,
        };
      }),
    };
  });

  expect(imported.parsedSets).toEqual([
    expect.objectContaining({ distance: 6100, distanceUnit: "m", seconds: undefined }),
    expect.objectContaining({ distance: undefined, seconds: 3931 }),
  ]);
  expect(imported.sets).toEqual([
    expect.objectContaining({ distance: 6100, distanceUnit: "m", seconds: undefined, trackType: "conditioning" }),
    expect.objectContaining({ distance: undefined, seconds: 3931, trackType: "conditioning", trackingMode: "timeSeconds" }),
  ]);
  expect(imported.sessionNotes).toContain("Avg pace 10:43/km");
  expect(imported.sessionNotes).toContain("Avg HR 115");
});

test("IF journal import supports simple conditioning duration minute variants", async ({ page }) => {
  await goto(page, "/");

  const parsed = await page.evaluate(async () => {
    const { parseIfJournalText } = await import("/src/importers/importSession.ts");
    const result = parseIfJournalText(`Session: Walk - Minute Variants
Date: 2026-05-24

Walk
conditioning duration 42min
conditioning duration 42 min`);
    return result.sets.map((set: any) => ({
      seconds: set.seconds,
      metricType: set.metricType,
      trackingMode: set.trackingMode,
    }));
  });

  expect(parsed).toEqual([
    expect.objectContaining({ seconds: 2520, metricType: "duration", trackingMode: "timeSeconds" }),
    expect.objectContaining({ seconds: 2520, metricType: "duration", trackingMode: "timeSeconds" }),
  ]);
});

test("IF journal import parses conditioning intent when valid and ignores invalid intent", async ({ page }) => {
  await goto(page, "/");
  await resetDexieDb(page);

  const imported = await page.evaluate(async () => {
    const { importSessionFromJournal, parseIfJournalText } = await import("/src/importers/importSession.ts");
    // @ts-ignore
    const db = window.__db;
    if (!db) throw new Error("__db missing on window.");

    const validText = `Session: Walk - Recovery
Intent: Recovery
Date: 2026-05-24

Walk
conditioning duration 42min`;

    const invalidText = `Session: Walk - Invalid
Intent: expedition
Date: 2026-05-25

Walk
conditioning duration 20min`;

    const parsedValid = parseIfJournalText(validText);
    const parsedInvalid = parseIfJournalText(invalidText);
    const validResult = await importSessionFromJournal({ text: validText });
    const invalidResult = await importSessionFromJournal({ text: invalidText });

    const validSession = await db.sessions.get(validResult.sessionId);
    const invalidSession = await db.sessions.get(invalidResult.sessionId);

    return {
      parsedValidIntent: parsedValid.conditioningIntent,
      parsedInvalidIntent: parsedInvalid.conditioningIntent,
      validSessionIntent: validSession?.conditioningIntent,
      invalidSessionIntent: invalidSession?.conditioningIntent,
    };
  });

  expect(imported).toEqual({
    parsedValidIntent: "recovery",
    parsedInvalidIntent: undefined,
    validSessionIntent: "recovery",
    invalidSessionIntent: undefined,
  });
});

test("IF journal import treats walk metadata outside Session Notes as notes, not exercises", async ({ page }) => {
  await goto(page, "/");
  await resetDexieDb(page);

  const imported = await page.evaluate(async () => {
    const { importSessionFromJournal, parseIfJournalText } = await import("/src/importers/importSession.ts");
    // @ts-ignore
    const db = window.__db;
    const text = `Session: Walk Metadata Boundary
Date: 2026-05-24

Walk
Avg HR 112
Max HR 136
Steps 6200
Calories 398
Elevation gain 43m
Avg cadence 112 spm
Pace 11:06/km
Route Neighborhood Loop
conditioning 6.10km
conditioning duration 1:05:31`;

    const parsed = parseIfJournalText(text);
    const result = await importSessionFromJournal({ text });
    const session = await db.sessions.get(result.sessionId);
    const sets = await db.sets.where("sessionId").equals(result.sessionId).sortBy("createdAt");
    const tracks = await db.tracks.toArray();

    return {
      parsedExerciseNames: Array.from(new Set(parsed.sets.map((set: any) => set.exerciseName))).sort(),
      sessionNotes: session.notes,
      trackNames: Array.from(new Set(sets.map((set: any) => tracks.find((track: any) => track.id === set.trackId)?.displayName))).sort(),
      sets: sets.map((set: any) => ({
        distance: set.distance,
        distanceUnit: set.distanceUnit,
        seconds: set.seconds,
        weight: set.weight,
        reps: set.reps,
      })),
    };
  });

  expect(imported.parsedExerciseNames).toEqual(["Walk"]);
  expect(imported.trackNames).toEqual(["Walk"]);
  expect(imported.sessionNotes).toContain("Avg HR 112");
  expect(imported.sessionNotes).toContain("Calories 398");
  expect(imported.sessionNotes).toContain("Avg cadence 112 spm");
  expect(imported.sessionNotes).toContain("Pace 11:06/km");
  expect(imported.sessionNotes).toContain("Elevation gain 43m");
  expect(imported.sets).toEqual([
    expect.objectContaining({ distance: 6100, distanceUnit: "m" }),
    expect.objectContaining({ seconds: 3931 }),
  ]);
});

test("IF journal import supports cardio unit spelling variants", async ({ page }) => {
  await goto(page, "/");
  await resetDexieDb(page);

  const parsed = await page.evaluate(async () => {
    const { parseIfJournalText } = await import("/src/importers/importSession.ts");
    const units = ["miles", "mile", "mi", "km", "m", "minutes", "min", "seconds", "sec"];
    return units.map((unit) => {
      const parsed = parseIfJournalText(`Session: Walk - ${unit}
Date: 2026-05-13

Walk
conditioning BWx1${unit}`);
      const set = parsed.sets[0];
      return {
        unit,
        distance: set.distance,
        distanceUnit: set.distanceUnit,
        seconds: set.seconds,
      };
    });
  });

  expect(parsed).toEqual([
    expect.objectContaining({ unit: "miles", distance: 1609.344, distanceUnit: "m" }),
    expect.objectContaining({ unit: "mile", distance: 1609.344, distanceUnit: "m" }),
    expect.objectContaining({ unit: "mi", distance: 1609.344, distanceUnit: "m" }),
    expect.objectContaining({ unit: "km", distance: 1000, distanceUnit: "m" }),
    expect.objectContaining({ unit: "m", distance: 1, distanceUnit: "m" }),
    expect.objectContaining({ unit: "minutes", seconds: 60 }),
    expect.objectContaining({ unit: "min", seconds: 60 }),
    expect.objectContaining({ unit: "seconds", seconds: 1 }),
    expect.objectContaining({ unit: "sec", seconds: 1 }),
  ]);
});
