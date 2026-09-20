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

test("IF journal import parses conditioning intent values when valid and ignores invalid intent", async ({ page }) => {
  await goto(page, "/");
  await resetDexieDb(page);

  const imported = await page.evaluate(async () => {
    const { importSessionFromJournal, parseIfJournalText } = await import("/src/importers/importSession.ts");
    const { parseCardioIntent } = await import("/src/lib/cardio/cardioIntent.ts");
    // @ts-ignore
    const db = window.__db;
    if (!db) throw new Error("__db missing on window.");

    const validTexts = [
      ["fitness", `Session: Walk - Fitness
Intent: Fitness
Date: 2026-05-23

Walk
conditioning duration 30min`],
      ["recovery", `Session: Walk - Recovery
Intent: Recovery
Date: 2026-05-24

Walk
conditioning duration 42min`],
      ["adventure", `Session: Walk - Adventure
Intent: AdVenTure
Date: 2026-05-26

Walk
conditioning duration 45min`],
    ] as const;

    const invalidText = `Session: Walk - Invalid
Intent: expedition
Date: 2026-05-25

Walk
conditioning duration 20min`;

    const validResults = [];
    for (const [expected, text] of validTexts) {
      const parsed = parseIfJournalText(text);
      const result = await importSessionFromJournal({ text });
      const session = await db.sessions.get(result.sessionId);
      validResults.push({
        expected,
        sharedParserIntent: parseCardioIntent(text.match(/^Intent:\s*(.+)$/m)?.[1]),
        parsedIntent: parsed.conditioningIntent,
        sessionIntent: session?.conditioningIntent,
      });
    }

    const parsedInvalid = parseIfJournalText(invalidText);
    const invalidResult = await importSessionFromJournal({ text: invalidText });
    const invalidSession = await db.sessions.get(invalidResult.sessionId);

    return {
      validResults,
      parsedInvalidIntent: parsedInvalid.conditioningIntent,
      invalidSessionIntent: invalidSession?.conditioningIntent,
      sharedInvalidIntent: parseCardioIntent("expedition"),
    };
  });

  expect(imported.validResults).toEqual([
    { expected: "fitness", sharedParserIntent: "fitness", parsedIntent: "fitness", sessionIntent: "fitness" },
    { expected: "recovery", sharedParserIntent: "recovery", parsedIntent: "recovery", sessionIntent: "recovery" },
    { expected: "adventure", sharedParserIntent: "adventure", parsedIntent: "adventure", sessionIntent: "adventure" },
  ]);
  expect(imported).toMatchObject({
    parsedInvalidIntent: undefined,
    invalidSessionIntent: undefined,
    sharedInvalidIntent: undefined,
  });
});

test("IF journal import parses explicit activity type metadata with precedence over inference", async ({ page }) => {
  await goto(page, "/");
  await resetDexieDb(page);

  const imported = await page.evaluate(async () => {
    const { importSessionFromJournal, parseIfJournalText } = await import("/src/importers/importSession.ts");
    // @ts-ignore
    const db = window.__db;
    if (!db) throw new Error("__db missing on window.");

    const cases = [
      { label: "Walk", expected: "walk", date: "2026-07-01" },
      { label: "Hike", expected: "hike", date: "2026-07-02", intent: "Adventure" },
      { label: "Run", expected: "run", date: "2026-07-03", intent: "Fitness" },
      { label: "Bike", expected: "bike", date: "2026-07-04" },
      { label: "Row", expected: "row", date: "2026-07-05" },
      { label: "Other", expected: "other", date: "2026-07-06", intent: "Recovery" },
    ] as const;

    const results = [];
    for (const item of cases) {
      const text = `Session: ${item.label} Metadata
Activity Type: ${item.label}
${item.intent ? `Intent: ${item.intent}\n` : ""}Date: ${item.date}

Walk
conditioning duration 20min`;
      const parsed = parseIfJournalText(text);
      const result = await importSessionFromJournal({ text });
      const session = await db.sessions.get(result.sessionId);
      results.push({
        label: item.label,
        expected: item.expected,
        parsedActivityType: parsed.activityType,
        sessionActivityType: session?.activityType,
        conditioningIntent: session?.conditioningIntent,
      });
    }

    const precedenceText = `Session: Walk
Activity Type: Hike
Intent: Adventure
Date: 2026-07-07

Walk
conditioning 5km`;
    const parsedPrecedence = parseIfJournalText(precedenceText);
    const precedenceResult = await importSessionFromJournal({ text: precedenceText });
    const precedenceSession = await db.sessions.get(precedenceResult.sessionId);

    const invalidText = `Session: Mountain Day
Activity Type: Swim
Intent: expedition
Date: 2026-07-08

Training
conditioning duration 20min`;
    const parsedInvalid = parseIfJournalText(invalidText);
    const invalidResult = await importSessionFromJournal({ text: invalidText });
    const invalidSession = await db.sessions.get(invalidResult.sessionId);

    const legacyText = `Session: Walk - Legacy
Date: 2026-07-09

Walk
conditioning duration 20min`;
    const parsedLegacy = parseIfJournalText(legacyText);
    const legacyResult = await importSessionFromJournal({ text: legacyText });
    const legacySession = await db.sessions.get(legacyResult.sessionId);

    return {
      results,
      precedence: {
        parsedActivityType: parsedPrecedence.activityType,
        sessionActivityType: precedenceSession?.activityType,
        conditioningIntent: precedenceSession?.conditioningIntent,
      },
      invalid: {
        parsedActivityType: parsedInvalid.activityType,
        sessionActivityType: invalidSession?.activityType,
        parsedIntent: parsedInvalid.conditioningIntent,
        sessionIntent: invalidSession?.conditioningIntent,
      },
      legacy: {
        parsedActivityType: parsedLegacy.activityType,
        sessionActivityType: legacySession?.activityType,
        parsedIntent: parsedLegacy.conditioningIntent,
        sessionIntent: legacySession?.conditioningIntent,
      },
    };
  });

  expect(imported.results.map((row: any) => row.sessionActivityType)).toEqual([
    "walk",
    "hike",
    "run",
    "bike",
    "row",
    "other",
  ]);
  expect(imported.results.find((row: any) => row.label === "Hike")).toMatchObject({
    parsedActivityType: "hike",
    sessionActivityType: "hike",
    conditioningIntent: "adventure",
  });
  expect(imported.results.find((row: any) => row.label === "Run")).toMatchObject({
    sessionActivityType: "run",
    conditioningIntent: "fitness",
  });
  expect(imported.results.find((row: any) => row.label === "Other")).toMatchObject({
    sessionActivityType: "other",
    conditioningIntent: "recovery",
  });
  expect(imported.precedence).toEqual({
    parsedActivityType: "hike",
    sessionActivityType: "hike",
    conditioningIntent: "adventure",
  });
  expect(imported.invalid).toEqual({
    parsedActivityType: undefined,
    sessionActivityType: undefined,
    parsedIntent: undefined,
    sessionIntent: undefined,
  });
  expect(imported.legacy).toEqual({
    parsedActivityType: "walk",
    sessionActivityType: "walk",
    parsedIntent: undefined,
    sessionIntent: undefined,
  });
});

test("journal import does not infer parent cardio type from an embedded treadmill set", async ({ page }) => {
  await goto(page, "/");
  await resetDexieDb(page);

  const result = await page.evaluate(async () => {
    const { importSessionFromJournal } = await import("/src/importers/importSession.ts");
    // @ts-ignore
    const db = window.__db;
    const mixedSets = [
      { exerciseName: "Back Squat", trackType: "strength", weight: 135, reps: 5 },
      { exerciseName: "Treadmill Walk", trackType: "conditioning", seconds: 300 },
    ];
    const inferredImport = await importSessionFromJournal({
      dateISO: "2026-07-10",
      templateName: "Lower B",
      sets: mixedSets,
    });
    const explicitImport = await importSessionFromJournal({
      dateISO: "2026-07-11",
      templateName: "Upper A",
      activityType: "walk",
      sets: mixedSets,
    });
    const inferredSession = await db.sessions.get(inferredImport.sessionId);
    const explicitSession = await db.sessions.get(explicitImport.sessionId);
    const inferredSets = await db.sets.where("sessionId").equals(inferredImport.sessionId).toArray();
    return {
      inferredStoredType: inferredSession?.activityType,
      explicitStoredType: explicitSession?.activityType,
      inferredSetCount: inferredSets.length,
      embeddedSeconds: inferredSets.find((set: any) => set.seconds === 300)?.seconds,
    };
  });

  expect(result).toEqual({
    inferredStoredType: undefined,
    explicitStoredType: "walk",
    inferredSetCount: 2,
    embeddedSeconds: 300,
  });
});

test("IF journal import persists explicit cardio format independently and leaves legacy undefined", async ({ page }) => {
  await goto(page, "/");
  await resetDexieDb(page);

  const result = await page.evaluate(async () => {
    const { importSessionFromJournal, parseIfJournalText } = await import("/src/importers/importSession.ts");
    // @ts-ignore
    const db = window.__db;
    const inputs = [
      `Session: PRP Run/Walk Intervals\nActivity Type: Run\nIntent: Fitness\nCardio Format: Intervals\nDate: 2026-07-20\n\nRun\nconditioning duration 20min`,
      `Session: PRP Walk\nActivity Type: Walk\nCardio Format: Continuous\nDate: 2026-07-21\n\nWalk\nconditioning duration 20min`,
      `Session: Invalid Format\nActivity Type: Walk\nCardio Format: Tempo\nDate: 2026-07-22\n\nWalk\nconditioning duration 20min`,
      `Session: Legacy Walk\nActivity Type: Walk\nDate: 2026-07-23\n\nWalk\nconditioning duration 20min`,
    ];
    const rows = [];
    for (const text of inputs) {
      const parsed = parseIfJournalText(text);
      const imported = await importSessionFromJournal({ text });
      const session = await db.sessions.get(imported.sessionId);
      rows.push({
        activityType: session?.activityType,
        intent: session?.conditioningIntent,
        parsedFormat: parsed.cardioFormat,
        storedFormat: session?.cardioFormat,
      });
    }
    return rows;
  });

  expect(result).toEqual([
    { activityType: "run", intent: "fitness", parsedFormat: "intervals", storedFormat: "intervals" },
    { activityType: "walk", intent: undefined, parsedFormat: "continuous", storedFormat: "continuous" },
    { activityType: "walk", intent: undefined, parsedFormat: undefined, storedFormat: undefined },
    { activityType: "walk", intent: undefined, parsedFormat: undefined, storedFormat: undefined },
  ]);
});

test("cardio activity type classifier uses explicit activity names and avoids false positives", async ({ page }) => {
  await goto(page, "/");

  const classified = await page.evaluate(async () => {
    const { inferCardioActivityType } = await import("/src/lib/cardio/cardioActivityType.ts");
    return {
      walk: inferCardioActivityType({ sessionName: "Walk" }),
      walking: inferCardioActivityType({ sessionName: "Walking" }),
      hike: inferCardioActivityType({ sessionName: "Hike" }),
      hiking: inferCardioActivityType({ sessionName: "Hiking" }),
      run: inferCardioActivityType({ sessionName: "Run" }),
      running: inferCardioActivityType({ sessionName: "Running" }),
      bike: inferCardioActivityType({ sessionName: "Bike" }),
      biking: inferCardioActivityType({ sessionName: "Biking" }),
      cycling: inferCardioActivityType({ sessionName: "Cycling" }),
      row: inferCardioActivityType({ sessionName: "Row" }),
      rowing: inferCardioActivityType({ sessionName: "Rowing" }),
      otherCardio: inferCardioActivityType({ sessionName: "Conditioning" }),
      farmerWalk: inferCardioActivityType({ sessionName: "Farmer's Walk" }),
      walkingLunge: inferCardioActivityType({ sessionName: "Walking Lunge" }),
      walkout: inferCardioActivityType({ sessionName: "Walkout Mobility" }),
      unsupported: inferCardioActivityType({ sessionName: "Upper A" }),
    };
  });

  expect(classified).toEqual({
    walk: "walk",
    walking: "walk",
    hike: "hike",
    hiking: "hike",
    run: "run",
    running: "run",
    bike: "bike",
    biking: "bike",
    cycling: "bike",
    row: "row",
    rowing: "row",
    otherCardio: "other",
    farmerWalk: undefined,
    walkingLunge: undefined,
    walkout: undefined,
    unsupported: undefined,
  });
});

test("IF journal import persists activity type from trusted activity names independently from intent", async ({ page }) => {
  await goto(page, "/");
  await resetDexieDb(page);

  const imported = await page.evaluate(async () => {
    const { importSessionFromJournal, parseIfJournalText } = await import("/src/importers/importSession.ts");
    // @ts-ignore
    const db = window.__db;
    if (!db) throw new Error("__db missing on window.");

    const cases = [
      { name: "Walk", expected: "walk" },
      { name: "Walking", expected: "walk" },
      { name: "Hike", expected: "hike", intent: "Adventure" },
      { name: "Hiking", expected: "hike" },
      { name: "Run", expected: "run" },
      { name: "Running", expected: "run" },
      { name: "Bike", expected: "bike" },
      { name: "Biking", expected: "bike" },
      { name: "Cycling", expected: "bike" },
      { name: "Row", expected: "row" },
      { name: "Rowing", expected: "row" },
      { name: "Conditioning", expected: "other" },
      { name: "Upper A", expected: undefined },
    ];

    const rows = [];
    for (const [index, item] of cases.entries()) {
      const text = `Session: ${item.name}
${item.intent ? `Intent: ${item.intent}\n` : ""}Date: 2026-06-${String(index + 1).padStart(2, "0")}

${item.name}
conditioning duration 20min`;
      const parsed = parseIfJournalText(text);
      const result = await importSessionFromJournal({ text });
      const session = await db.sessions.get(result.sessionId);
      rows.push({
        name: item.name,
        expected: item.expected,
        parsedActivityType: parsed.activityType,
        sessionActivityType: session?.activityType,
        conditioningIntent: session?.conditioningIntent,
      });
    }

    return rows;
  });

  for (const row of imported) {
    expect(row.parsedActivityType).toBe(row.expected);
    expect(row.sessionActivityType).toBe(row.expected);
  }
  expect(imported.find((row: any) => row.name === "Hike")).toMatchObject({
    sessionActivityType: "hike",
    conditioningIntent: "adventure",
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
