import { test, expect } from "@playwright/test";
import { resetDexieDb } from "./helpers/dbSeed";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173";

async function seedBenchDuplicateCandidate(page: Parameters<typeof test>[0]["page"]) {
  await page.goto(new URL("/", BASE_URL).toString(), { waitUntil: "domcontentloaded" });
  await resetDexieDb(page);

  await page.evaluate(async () => {
    // @ts-ignore
    const db = window.__db;
    if (!db) throw new Error("__db missing on window.");

    const now = Date.now();
    const exerciseId = crypto.randomUUID();
    const trackId = crypto.randomUUID();
    const sessionId = crypto.randomUUID();

    await db.exercises.add({
      id: exerciseId,
      name: "DB Bench Press",
      normalizedName: "db bench press",
      aliases: [],
      equipmentTags: ["dumbbell"],
      bodyPart: "Chest",
      createdAt: now,
      updatedAt: now,
    });

    await db.tracks.add({
      id: trackId,
      exerciseId,
      displayName: "DB Bench Press",
      trackType: "hypertrophy",
      trackingMode: "weightedReps",
      warmupSetsDefault: 2,
      workingSetsDefault: 3,
      repMin: 8,
      repMax: 12,
      restSecondsDefault: 120,
      weightJumpDefault: 5,
      createdAt: now,
    });

    await db.sessionItems.add({
      id: crypto.randomUUID(),
      sessionId,
      trackId,
      orderIndex: 0,
      createdAt: now,
    });

    await db.sets.add({
      id: crypto.randomUUID(),
      sessionId,
      trackId,
      setType: "working",
      weight: 70,
      reps: 9,
      createdAt: now,
    });
  });
}

async function openPasteWorkoutReview(page: Parameters<typeof test>[0]["page"]) {
  await page.goto(new URL("/paste-workout", BASE_URL).toString(), { waitUntil: "domcontentloaded" });

  await page.getByRole("textbox").first().fill(`Session: Upper A
Date: 2026-04-01
Start: 08:00
End: 09:00

Dumbbell Bench Press
work 65x10 @2`);

  await page.getByRole("button", { name: "Parse Preview" }).click();
}

async function seedPasteWorkoutTrack(
  page: Parameters<typeof test>[0]["page"],
  {
    name,
    normalizedName,
    trackingMode,
  }: { name: string; normalizedName: string; trackingMode: "weightedReps" | "repsOnly" }
) {
  await page.evaluate(
    async ({ name, normalizedName, trackingMode }) => {
      // @ts-ignore
      const db = window.__db;
      if (!db) throw new Error("__db missing on window.");

      const now = Date.now();
      const exerciseId = crypto.randomUUID();
      const trackId = crypto.randomUUID();

      await db.exercises.add({
        id: exerciseId,
        name,
        normalizedName,
        aliases: [],
        equipmentTags: [],
        createdAt: now,
        updatedAt: now,
      });

      await db.tracks.add({
        id: trackId,
        exerciseId,
        displayName: name,
        trackType: "hypertrophy",
        trackingMode,
        warmupSetsDefault: 2,
        workingSetsDefault: 3,
        repMin: 8,
        repMax: 12,
        restSecondsDefault: 120,
        weightJumpDefault: 5,
        createdAt: now,
      });
    },
    { name, normalizedName, trackingMode }
  );
}

test("Paste Workout REVIEW use-existing path imports against the existing exercise", async ({ page }) => {
  await seedBenchDuplicateCandidate(page);
  await openPasteWorkoutReview(page);

  await expect(page.getByText("Review before create", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Use existing" }).click();
  await expect(page.getByText(/Using existing: DB Bench Press/i)).toBeVisible();
  await page.getByLabel(/Remember this as an alias for future imports/i).check();
  await page.getByLabel(/Dry run/i).uncheck();
  await page.getByRole("button", { name: "Import Now" }).click();

  await expect(page.getByText(/Imported/i)).toBeVisible();
  await expect(page.getByText(/Aliases remembered: 1/i)).toBeVisible();

  let dbState = await page.evaluate(async () => {
    // @ts-ignore
    const db = window.__db;
    const exercises = await db.exercises.toArray();
    const importedVariant = await db.exercises.where("normalizedName").equals("dumbbell bench press").first();
    const importedTrack = await db.tracks.where("displayName").equals("Dumbbell Bench Press").first();
    return {
      exerciseCount: exercises.length,
      importedVariant: !!importedVariant,
      importedTrackExerciseId: importedTrack?.exerciseId ?? null,
      canonicalExerciseId: exercises.find((row: any) => row.normalizedName === "db bench press")?.id ?? null,
    };
  });

  expect(dbState.exerciseCount).toBe(1);
  expect(dbState.importedVariant).toBe(false);
  expect(dbState.importedTrackExerciseId).toBe(dbState.canonicalExerciseId);

  await page.getByRole("textbox").first().fill(`Session: Upper A
Date: 2026-04-02
Start: 08:00
End: 09:00

Dumbbell Bench Press
work 65x10 @2`);
  await page.getByRole("button", { name: "Parse Preview" }).click();

  await expect(page.getByText("Review before create", { exact: true })).toHaveCount(0);
  await expect(page.locator("span.badge").filter({ hasText: /^REVIEW$/ })).toHaveCount(0);
  await expect(page.getByText("Possible duplicate", { exact: true })).toHaveCount(0);
});

test("Paste Workout REVIEW requires acknowledgment before creating likely duplicate exercises", async ({
  page,
}) => {
  await seedBenchDuplicateCandidate(page);
  await openPasteWorkoutReview(page);

  await expect(page.locator("span.badge").filter({ hasText: /^REVIEW$/ })).toBeVisible();
  await expect(page.getByText("Possible duplicate", { exact: true })).toBeVisible();
  await expect(page.getByText("DB Bench Press", { exact: true })).toBeVisible();
  await expect(page.getByText(/Same normalized name/i)).toBeVisible();
  await expect(page.locator("span.badge").filter({ hasText: /^NEW$/ })).toHaveCount(0);
  await expect(page.getByText("Review before create", { exact: true })).toBeVisible();

  await page.getByLabel(/Dry run/i).uncheck();
  await page.getByRole("button", { name: "Import Now" }).click();

  await expect(page.getByText(/Import blocked: review possible duplicate exercises before continuing\./i)).toBeVisible();

  let dbState = await page.evaluate(async () => {
    // @ts-ignore
    const db = window.__db;
    return {
      count: await db.exercises.count(),
      hasImportedVariant: !!(await db.exercises.where("normalizedName").equals("dumbbell bench press").first()),
    };
  });

  expect(dbState).toEqual({
    count: 1,
    hasImportedVariant: false,
  });

  await page
    .getByLabel(/I reviewed these possible duplicates and want to continue creating new exercises/i)
    .check();
  await page.getByRole("button", { name: "Import Now" }).click();

  await expect(page.getByText(/Imported/i)).toBeVisible();

  dbState = await page.evaluate(async () => {
    // @ts-ignore
    const db = window.__db;
    return {
      count: await db.exercises.count(),
      importedExercise: await db.exercises.where("normalizedName").equals("dumbbell bench press").first(),
    };
  });

  expect(dbState.count).toBe(2);
  expect(dbState.importedExercise?.name).toBe("Dumbbell Bench Press");
});

test("Paste Workout preview and import preserve per-set weight semantics", async ({
  page,
}) => {
  await page.goto(new URL("/", BASE_URL).toString(), { waitUntil: "domcontentloaded" });
  await resetDexieDb(page);

  await seedPasteWorkoutTrack(page, {
    name: "Assisted Pull Up",
    normalizedName: "assisted pull up",
    trackingMode: "repsOnly",
  });
  await seedPasteWorkoutTrack(page, {
    name: "Standing DB Lateral Raise",
    normalizedName: "standing db lateral raise",
    trackingMode: "repsOnly",
  });
  await seedPasteWorkoutTrack(page, {
    name: "Bench Press",
    normalizedName: "bench press",
    trackingMode: "repsOnly",
  });

  await page.goto(new URL("/paste-workout", BASE_URL).toString(), { waitUntil: "domcontentloaded" });
  await page.getByRole("textbox").first().fill(`Session: Pull + Delts
Date: 2026-04-01
Start: 08:00
End: 09:00

Bench Press
work 25x2@1
work 25 x 2 @ 1

Assisted Pull Up
work -25 x 2 @ 1
work 25 x 10 @ 2
work BW x 12 @ 10
work BW+25x8 @ 2
work BW-40x8 @ 3

Standing DB Lateral Raise
work 10x15/side @2`);
  await page.getByRole("button", { name: "Parse Preview" }).click();
  await expect(page.getByText(/work .* -25 x 2 @1/i)).toBeVisible();
  await expect(page.getByText(/work .* 25 x 10 @2/i)).toBeVisible();
  await expect(page.getByText(/work .* BW x 12 @10/i)).toBeVisible();
  await page.getByLabel(/Dry run/i).uncheck();
  await page.getByRole("button", { name: "Import Now" }).click();

  await expect(page.getByText(/Imported/i)).toBeVisible();

  const dbState = await page.evaluate(async () => {
    // @ts-ignore
    const db = window.__db;
    const session = (await db.sessions.toArray())
      .filter((row: any) => row.templateName === "Pull + Delts")
      .sort((a: any, b: any) => (b.startedAt ?? 0) - (a.startedAt ?? 0))[0];
    if (!session) throw new Error("Imported session not found");

    const items = await db.sessionItems.where("sessionId").equals(session.id).toArray();
    const tracks = await db.tracks.bulkGet(items.map((item: any) => item.trackId));
    const sets = await db.sets.where("sessionId").equals(session.id).sortBy("createdAt");

    const byTrackName = new Map(
      tracks.filter(Boolean).map((track: any) => [track.displayName, track])
    );
    const trackIdToName = new Map(
      tracks.filter(Boolean).map((track: any) => [track.id, track.displayName])
    );

    return {
      benchTrackMode: byTrackName.get("Bench Press")?.trackingMode ?? null,
      assistedTrackMode: byTrackName.get("Assisted Pull Up")?.trackingMode ?? null,
      lateralTrackMode: byTrackName.get("Standing DB Lateral Raise")?.trackingMode ?? null,
      sets: sets.map((set: any) => ({
        trackName: trackIdToName.get(set.trackId) ?? null,
        weight: set.weight ?? null,
        reps: set.reps ?? null,
        rir: set.rir ?? null,
        notes: set.notes ?? null,
      })),
    };
  });

  expect(dbState.benchTrackMode).toBe("weightedReps");
  expect(dbState.assistedTrackMode).toBe("weightedReps");
  expect(dbState.lateralTrackMode).toBe("weightedReps");
  expect(dbState.sets).toEqual([
    {
      trackName: "Bench Press",
      weight: 25,
      reps: 2,
      rir: 1,
      notes: null,
    },
    {
      trackName: "Bench Press",
      weight: 25,
      reps: 2,
      rir: 1,
      notes: null,
    },
    {
      trackName: "Assisted Pull Up",
      weight: -25,
      reps: 2,
      rir: 1,
      notes: null,
    },
    {
      trackName: "Assisted Pull Up",
      reps: 10,
      weight: 25,
      rir: 2,
      notes: null,
    },
    {
      trackName: "Assisted Pull Up",
      weight: 0,
      reps: 12,
      rir: 10,
      notes: null,
    },
    {
      trackName: "Assisted Pull Up",
      weight: 25,
      reps: 8,
      rir: 2,
      notes: null,
    },
    {
      trackName: "Assisted Pull Up",
      weight: -40,
      reps: 8,
      rir: 3,
      notes: null,
    },
    {
      trackName: "Standing DB Lateral Raise",
      weight: 10,
      reps: 15,
      rir: 2,
      notes: "per-side",
    },
  ]);
});

test("Paste Workout accepts non-strength intents without false no-parsed-set warnings and stores their track types", async ({
  page,
}) => {
  await page.goto(new URL("/", BASE_URL).toString(), { waitUntil: "domcontentloaded" });
  await resetDexieDb(page);

  await page.goto(new URL("/paste-workout", BASE_URL).toString(), { waitUntil: "domcontentloaded" });
  await page.getByRole("textbox").first().fill(`Session: Lower B
Date: 2026-04-07
Start: 08:00
End: 09:00

Locked Clams
corrective BWx15

Knee to Wall
mobility BWx10 /side

Shoulder ER ISO
rehab BWx12

Hip Shift Check
diagnostic BWx8

Barbell RDL
technique 95x10
technique 20x10 @4 4 sec eccentric

Air Bike
conditioning BWx30s`);
  await page.getByRole("button", { name: "Parse Preview" }).click();

  await expect(page.getByText(/Exercise has no parsed sets/i)).toHaveCount(0);
  await expect(
    page.getByText(/Logged as corrective work\. Excluded from strength metrics\./i)
  ).toHaveCount(3);
  await expect(page.getByText(/Logged as mobility work\. Excluded from strength metrics\./i)).toBeVisible();
  await expect(page.getByText(/Logged as technique work\. Excluded from strength metrics\./i)).toBeVisible();
  await expect(page.getByText(/Logged as conditioning work\. Excluded from strength metrics\./i)).toBeVisible();
  await expect(page.getByText(/corrective .* BW x 15/i)).toBeVisible();
  await expect(page.getByText(/mobility .* BW x 10 \/side/i)).toBeVisible();
  await expect(page.getByText(/rehab .* BW x 12/i)).toBeVisible();
  await expect(page.getByText(/diagnostic .* BW x 8/i)).toBeVisible();
  await expect(page.getByText(/technique .* 95 x 10/i)).toBeVisible();

  await page.getByLabel(/Dry run/i).uncheck();
  await page.getByRole("button", { name: "Import Now" }).click();
  await expect(page.getByText(/Imported/i)).toBeVisible();

  const dbState = await page.evaluate(async () => {
    // @ts-ignore
    const db = window.__db;
    const tracks = await db.tracks.toArray();
    return tracks
      .filter((track: any) =>
        [
          "Locked Clams",
          "Knee to Wall",
          "Shoulder ER ISO",
          "Hip Shift Check",
          "Barbell RDL",
          "Air Bike",
        ].includes(track.displayName)
      )
      .map((track: any) => ({
        displayName: track.displayName,
        trackType: track.trackType,
        trackingMode: track.trackingMode,
      }))
      .sort((a: any, b: any) => a.displayName.localeCompare(b.displayName));
  });

  expect(dbState).toEqual([
    { displayName: "Air Bike", trackType: "conditioning", trackingMode: "timeSeconds" },
    { displayName: "Barbell RDL", trackType: "technique", trackingMode: "weightedReps" },
    { displayName: "Hip Shift Check", trackType: "corrective", trackingMode: "repsOnly" },
    { displayName: "Knee to Wall", trackType: "mobility", trackingMode: "repsOnly" },
    { displayName: "Locked Clams", trackType: "corrective", trackingMode: "repsOnly" },
    { displayName: "Shoulder ER ISO", trackType: "corrective", trackingMode: "repsOnly" },
  ]);
});

test("Paste Workout imports structured session note blocks onto the session record without breaking exercise parsing", async ({ page }) => {
  await page.goto(new URL("/", BASE_URL).toString(), { waitUntil: "domcontentloaded" });
  await resetDexieDb(page);

  await page.goto(new URL("/paste-workout", BASE_URL).toString(), { waitUntil: "domcontentloaded" });
  await page.getByRole("textbox").first().fill(`Session: Lower B
Date: 2026-04-08
Start: 07:30
End: 08:45

Session Notes:
Quality-first session. Low back fatigue early.
Glutes engaged better on RDL after stance change.

Start State:
Sleep decent. Low back slightly tight.

End Verdict:
Cut volume short intentionally.

Carry Forward:
Keep the narrower RDL stance next time.

Barbell RDL
work 135x8 @2
work 155x6 @2`);
  await page.getByRole("button", { name: "Parse Preview" }).click();
  await expect(page.getByText(/Exercise has no parsed sets/i)).toHaveCount(0);

  await page.getByLabel(/Dry run/i).uncheck();
  await page.getByRole("button", { name: "Import Now" }).click();
  await expect(page.getByText(/Imported/i)).toBeVisible();

  const dbState = await page.evaluate(async () => {
    // @ts-ignore
    const db = window.__db;
    const session = (await db.sessions.toArray())
      .filter((row: any) => row.templateName === "Lower B")
      .sort((a: any, b: any) => (b.startedAt ?? 0) - (a.startedAt ?? 0))[0];
    const sets = session ? await db.sets.where("sessionId").equals(session.id).sortBy("createdAt") : [];
    return {
      notes: session?.notes ?? null,
      sets: sets.map((set: any) => ({
        weight: set.weight ?? null,
        reps: set.reps ?? null,
        rir: set.rir ?? null,
      })),
    };
  });

  expect(dbState.notes).toBe(
    [
      "Quality-first session. Low back fatigue early.",
      "Glutes engaged better on RDL after stance change.",
      "",
      "Start State:",
      "Sleep decent. Low back slightly tight.",
      "",
      "End Verdict:",
      "Cut volume short intentionally.",
      "",
      "Carry Forward:",
      "Keep the narrower RDL stance next time.",
    ].join("\n")
  );
  expect(dbState.sets).toEqual([
    { weight: 135, reps: 8, rir: 2 },
    { weight: 155, reps: 6, rir: 2 },
  ]);
});
