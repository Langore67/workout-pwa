import { test, expect } from "@playwright/test";
import { resetDexieDb } from "./helpers/dbSeed";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173";

const CSV_TEXT = `date,session_type,program_day,exercise,set,load,reps,rir,notes,set_type
2026-04-01,lift,Upper A,Dumbbell Bench Press,1,65,10,2,,working`;

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

async function openImportCsvReview(page: Parameters<typeof test>[0]["page"]) {
  await page.goto(new URL("/import", BASE_URL).toString(), { waitUntil: "domcontentloaded" });

  await page.locator('input[type="file"]').setInputFiles({
    name: "journal.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(CSV_TEXT, "utf8"),
  });
}

test("Import CSV REVIEW use-existing path imports against the existing exercise", async ({ page }) => {
  await seedBenchDuplicateCandidate(page);
  await openImportCsvReview(page);

  await page.getByRole("button", { name: "Use existing" }).first().click();
  await expect(page.getByText(/Using existing: DB Bench Press/i)).toBeVisible();
  await page.getByLabel(/Remember this as an alias for future imports/i).check();
  await page.getByLabel(/Dry run/i).uncheck();
  await page.getByRole("button", { name: "Import Now" }).click();
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

  await page.locator('input[type="file"]').setInputFiles({
    name: "journal-2.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      `date,session_type,program_day,exercise,set,load,reps,rir,notes,set_type
2026-04-02,lift,Upper A,Dumbbell Bench Press,1,65,10,2,,working`,
      "utf8"
    ),
  });

  await expect(page.getByText("Review before create", { exact: true })).toHaveCount(0);
  await expect(page.locator("span.badge").filter({ hasText: /^REVIEW$/ })).toHaveCount(0);
  await expect(page.getByText("Possible duplicate", { exact: true })).toHaveCount(0);
});

test("Import CSV preview shows REVIEW and blocks create until duplicate review is acknowledged", async ({
  page,
}) => {
  await seedBenchDuplicateCandidate(page);
  await openImportCsvReview(page);

  await expect(page.getByText("Review before create", { exact: true })).toBeVisible();
  await expect(page.getByText("Dumbbell Bench Press", { exact: true })).toBeVisible();
  await expect(page.getByText("Possible duplicate", { exact: true })).toBeVisible();
  await expect(page.getByText("DB Bench Press", { exact: true })).toBeVisible();
  await expect(page.locator("span.badge").filter({ hasText: /^REVIEW$/ })).toBeVisible();

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

test("Import CSV normalizes assisted loads to signed negative values", async ({ page }) => {
  await page.goto(new URL("/", BASE_URL).toString(), { waitUntil: "domcontentloaded" });
  await resetDexieDb(page);

  await page.goto(new URL("/import", BASE_URL).toString(), { waitUntil: "domcontentloaded" });
  await page.locator('input[type="file"]').setInputFiles({
    name: "assisted.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      `date,session_type,program_day,exercise,set,load,reps,rir,notes,set_type
2026-04-01,lift,Pull,Test Assisted Pull Up,1,65 assist,8,2,,working
2026-04-01,lift,Pull,Test Assisted Pull Up,2,assist 40,10,3,,working`,
      "utf8"
    ),
  });

  await page.getByLabel(/Dry run/i).uncheck();

  const reviewCheckbox = page.getByLabel(/I reviewed these possible duplicates/i);
  if (await reviewCheckbox.count()) {
    await reviewCheckbox.check();
  }

  await page.getByRole("button", { name: "Import Now" }).click();
  await expect(page.getByText(/Imported/i)).toBeVisible();

  const dbState = await page.evaluate(async () => {
    // @ts-ignore
    const db = window.__db;
    const sessions = await db.sessions.toArray();
    if (!sessions.length) throw new Error("Imported sessions not found");

    const sessionIds = new Set(sessions.map((s: any) => s.id));
    const allSets = await db.sets.toArray();

    return allSets
      .filter((set: any) => sessionIds.has(set.sessionId))
      .sort((a: any, b: any) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
      .map((set: any) => ({
        weight: set.weight ?? null,
        reps: set.reps ?? null,
        rir: set.rir ?? null,
      }));
  });

  expect(dbState).toEqual([
    { weight: -65, reps: 8, rir: 2 },
    { weight: -40, reps: 10, rir: 3 },
  ]);
});

test("Import CSV normalizes mixed BW+, BW-, and assisted loads in one import", async ({ page }) => {
  await page.goto(new URL("/", BASE_URL).toString(), { waitUntil: "domcontentloaded" });
  await resetDexieDb(page);

  await page.goto(new URL("/import", BASE_URL).toString(), { waitUntil: "domcontentloaded" });
  await page.locator('input[type="file"]').setInputFiles({
    name: "mixed-bodyweight-loads.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      `date,session_type,program_day,exercise,set,load,reps,rir,notes,set_type
2026-04-01,lift,Pull,Test Pull Up,1,BW+25,5,2,,working
2026-04-01,lift,Pull,Test Pull Up,2,BW-40,6,2,,working
2026-04-01,lift,Pull,Test Assisted Pull Up,1,assist 55,8,3,,working
2026-04-01,lift,Pull,Test Assisted Pull Up,2,65 assist,10,2,,working`,
      "utf8"
    ),
  });

  await page.getByLabel(/Dry run/i).uncheck();

  const reviewCheckbox = page.getByLabel(/I reviewed these possible duplicates/i);
  if (await reviewCheckbox.count()) {
    await reviewCheckbox.check();
  }

  await page.getByRole("button", { name: "Import Now" }).click();
  await expect(page.getByText(/Imported/i)).toBeVisible();

  const dbState = await page.evaluate(async () => {
    // @ts-ignore
    const db = window.__db;

    const tracks = await db.tracks.toArray();
    const sets = await db.sets.toArray();
    const trackById = new Map(tracks.map((track: any) => [track.id, track]));

    return sets
      .map((set: any) => ({
        trackName: trackById.get(set.trackId)?.displayName ?? null,
        weight: set.weight ?? null,
        reps: set.reps ?? null,
        rir: set.rir ?? null,
      }))
      .sort((a: any, b: any) => {
        const nameCmp = String(a.trackName ?? "").localeCompare(String(b.trackName ?? ""));
        if (nameCmp !== 0) return nameCmp;
        return (a.weight ?? 0) - (b.weight ?? 0);
      });
  });

  expect(dbState).toEqual([
    { trackName: "Test Assisted Pull Up", weight: -65, reps: 10, rir: 2 },
    { trackName: "Test Assisted Pull Up", weight: -55, reps: 8, rir: 3 },
    { trackName: "Test Pull Up", weight: -40, reps: 6, rir: 2 },
    { trackName: "Test Pull Up", weight: 25, reps: 5, rir: 2 },
  ]);
});

test("Import CSV splits rows into separate sessions by program_day", async ({ page }) => {
  await page.goto(new URL("/", BASE_URL).toString(), { waitUntil: "domcontentloaded" });
  await resetDexieDb(page);

  await page.goto(new URL("/import", BASE_URL).toString(), { waitUntil: "domcontentloaded" });
  await page.locator('input[type="file"]').setInputFiles({
    name: "program-day-session-split.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      `date,session_type,program_day,exercise,set,load,reps,rir,notes,set_type
2026-04-01,lift,Pull,Test Pull Up,1,BW,5,2,,working
2026-04-01,lift,Pull,Test Pull Up,2,BW+25,5,2,,working
2026-04-01,lift,Upper,Test Barbell Row,1,Bar,8,2,,working
2026-04-01,lift,Upper,Test Barbell Row,2,95,6,1,,working`,
      "utf8"
    ),
  });

  await page.getByLabel(/Dry run/i).uncheck();

  const reviewCheckbox = page.getByLabel(/I reviewed these possible duplicates/i);
  if (await reviewCheckbox.count()) {
    await reviewCheckbox.check();
  }

  await page.getByRole("button", { name: "Import Now" }).click();
  await expect(page.getByText(/Imported/i)).toBeVisible();

  const dbState = await page.evaluate(async () => {
    // @ts-ignore
    const db = window.__db;

    const sessions = await db.sessions.toArray();
    const tracks = await db.tracks.toArray();
    const sets = await db.sets.toArray();
    const trackById = new Map(tracks.map((track: any) => [track.id, track]));

    const rows = sets.map((set: any) => ({
      sessionId: set.sessionId ?? null,
      trackName: trackById.get(set.trackId)?.displayName ?? null,
      weight: set.weight ?? null,
      reps: set.reps ?? null,
      rir: set.rir ?? null,
    }));

    const grouped = Array.from(
      rows.reduce((map: Map<string, any[]>, row: any) => {
        const key = String(row.sessionId ?? "");
        const bucket = map.get(key) ?? [];
        bucket.push({
          trackName: row.trackName,
          weight: row.weight,
          reps: row.reps,
          rir: row.rir,
        });
        map.set(key, bucket);
        return map;
      }, new Map())
    )
      .map(([sessionId, sessionRows]) => ({
        sessionId,
        rows: sessionRows.sort((a, b) => {
          const nameCmp = String(a.trackName ?? "").localeCompare(String(b.trackName ?? ""));
          if (nameCmp !== 0) return nameCmp;
          return (a.weight ?? 0) - (b.weight ?? 0);
        }),
      }))
      .sort((a, b) => {
        const aKey = a.rows[0]?.trackName ?? "";
        const bKey = b.rows[0]?.trackName ?? "";
        return String(aKey).localeCompare(String(bKey));
      });

    return {
      sessionCount: sessions.length,
      grouped,
    };
  });

  expect(dbState.sessionCount).toBe(2);
  expect(dbState.grouped).toEqual([
    {
      sessionId: expect.any(String),
      rows: [
        { trackName: "Test Barbell Row", weight: 45, reps: 8, rir: 2 },
        { trackName: "Test Barbell Row", weight: 95, reps: 6, rir: 1 },
      ],
    },
    {
      sessionId: expect.any(String),
      rows: [
        { trackName: "Test Pull Up", weight: 0, reps: 5, rir: 2 },
        { trackName: "Test Pull Up", weight: 25, reps: 5, rir: 2 },
      ],
    },
  ]);
});




test("Import CSV normalizes BW, BW+/- and Bar loads", async ({ page }) => {
  await page.goto(new URL("/", BASE_URL).toString(), { waitUntil: "domcontentloaded" });
  await resetDexieDb(page);

  await page.goto(new URL("/import", BASE_URL).toString(), { waitUntil: "domcontentloaded" });
  await page.locator('input[type="file"]').setInputFiles({
    name: "bw-bar-loads.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      `date,session_type,program_day,exercise,set,load,reps,rir,notes,set_type
2026-04-01,lift,Pull,Test Pull Up,1,BW,5,2,,working
2026-04-01,lift,Pull,Test Pull Up,2,BW+25,5,2,,working
2026-04-01,lift,Pull,Test Pull Up,3,BW-40,5,2,,working
2026-04-01,lift,Pull,Test Barbell Row,1,Bar,8,2,,working`,
      "utf8"
    ),
  });

  await page.getByLabel(/Dry run/i).uncheck();

  const reviewCheckbox = page.getByLabel(/I reviewed these possible duplicates/i);
  if (await reviewCheckbox.count()) {
    await reviewCheckbox.check();
  }

  await page.getByRole("button", { name: "Import Now" }).click();
  await expect(page.getByText(/Imported/i)).toBeVisible();

    const dbState = await page.evaluate(async () => {
      // @ts-ignore
      const db = window.__db;
  
      const tracks = await db.tracks.toArray();
      const sets = await db.sets.toArray();
      const trackById = new Map(tracks.map((track: any) => [track.id, track]));
  
      return sets
        .map((set: any) => ({
          trackName: trackById.get(set.trackId)?.displayName ?? null,
          weight: set.weight ?? null,
          reps: set.reps ?? null,
          rir: set.rir ?? null,
        }))
        .sort((a: any, b: any) => {
          const nameCmp = String(a.trackName ?? "").localeCompare(String(b.trackName ?? ""));
          if (nameCmp !== 0) return nameCmp;
          return (a.weight ?? 0) - (b.weight ?? 0);
        });
  });

    expect(dbState).toEqual([
      { trackName: "Test Barbell Row", weight: 45, reps: 8, rir: 2 },
      { trackName: "Test Pull Up", weight: -40, reps: 5, rir: 2 },
      { trackName: "Test Pull Up", weight: 0, reps: 5, rir: 2 },
      { trackName: "Test Pull Up", weight: 25, reps: 5, rir: 2 },
  ]);
});

test("Import CSV preserves diagnostic and rehab rows through the corrective path", async ({ page }) => {
  await page.goto(new URL("/", BASE_URL).toString(), { waitUntil: "domcontentloaded" });
  await resetDexieDb(page);

  await page.goto(new URL("/import", BASE_URL).toString(), { waitUntil: "domcontentloaded" });
  await page.locator('input[type="file"]').setInputFiles({
    name: "diagnostic-rehab.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      `date,session_type,program_day,exercise,set,load,reps,rir,notes,set_type
2026-04-01,lift,Lower B,Hip Shift Check,1,BW,8,,,diagnostic
2026-04-01,lift,Lower B,Shoulder ER ISO,1,BW,12,,,rehab`,
      "utf8"
    ),
  });

  await page.getByLabel(/Dry run/i).uncheck();
  await page.getByRole("button", { name: "Import Now" }).click();
  await expect(page.getByText(/Imported/i)).toBeVisible();

  const dbState = await page.evaluate(async () => {
    // @ts-ignore
    const db = window.__db;
    const tracks = await db.tracks.toArray();
    const sessions = await db.sessions.toArray();
    const session = sessions.sort((a: any, b: any) => (b.startedAt ?? 0) - (a.startedAt ?? 0))[0];
    if (!session) throw new Error("Imported session not found");
    const sessionSets = await db.sets.where("sessionId").equals(session.id).sortBy("createdAt");
    const trackById = new Map(tracks.map((track: any) => [track.id, track]));

    return {
      tracks: tracks
        .filter((track: any) => ["Hip Shift Check", "Shoulder ER ISO"].includes(track.displayName))
        .map((track: any) => ({
          displayName: track.displayName,
          trackType: track.trackType,
          trackingMode: track.trackingMode,
        }))
        .sort((a: any, b: any) => a.displayName.localeCompare(b.displayName)),
      sets: sessionSets.map((set: any) => ({
        trackName: trackById.get(set.trackId)?.displayName ?? null,
        setType: set.setType ?? null,
        notes: set.notes ?? null,
        reps: set.reps ?? null,
        weight: set.weight ?? null,
      })),
    };
  });

  expect(dbState.tracks).toEqual([
    { displayName: "Hip Shift Check", trackType: "corrective", trackingMode: "repsOnly" },
    { displayName: "Shoulder ER ISO", trackType: "corrective", trackingMode: "repsOnly" },
  ]);

  expect(dbState.sets).toEqual([
    {
      trackName: "Hip Shift Check",
      setType: "working",
      notes: "diagnostic",
      reps: 8,
      weight: null,
    },
    {
      trackName: "Shoulder ER ISO",
      setType: "working",
      notes: "rehab",
      reps: 12,
      weight: null,
    },
  ]);
});
test("Import CSV remembers alias after Use existing and skips review on the next import", async ({ page }) => {
  await seedBenchDuplicateCandidate(page);

  await page.goto(new URL("/import", BASE_URL).toString(), { waitUntil: "domcontentloaded" });
  await page.locator('input[type="file"]').setInputFiles({
    name: "alias-round-1.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      `date,session_type,program_day,exercise,set,load,reps,rir,notes,set_type
2026-04-01,lift,Upper A,Dumbbell Bench Press,1,65,10,2,,working`,
      "utf8"
    ),
  });

  await expect(page.getByText("Review before create", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Use existing" }).first().click();
  await expect(page.getByText(/Using existing: DB Bench Press/i)).toBeVisible();
  await page.getByLabel(/Remember this as an alias for future imports/i).check();
  await page.getByLabel(/Dry run/i).uncheck();
  await page.getByRole("button", { name: "Import Now" }).click();

  await expect(page.getByText(/Imported/i)).toBeVisible();
  await expect(page.getByText(/Aliases remembered: 1/i)).toBeVisible();

  const afterFirstImport = await page.evaluate(async () => {
    // @ts-ignore
    const db = window.__db;
    const exercises = await db.exercises.toArray();
    const bench = exercises.find((row: any) => row.normalizedName === "db bench press");
    return {
      exerciseCount: exercises.length,
      aliases: Array.isArray(bench?.aliases) ? [...bench.aliases].sort() : [],
    };
  });

  expect(afterFirstImport.exerciseCount).toBe(1);
  expect(afterFirstImport.aliases).toContain("Dumbbell Bench Press");

  await page.locator('input[type="file"]').setInputFiles({
    name: "alias-round-2.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      `date,session_type,program_day,exercise,set,load,reps,rir,notes,set_type
2026-04-02,lift,Upper A,Dumbbell Bench Press,1,70,8,1,,working`,
      "utf8"
    ),
  });

  await expect(page.getByText("Review before create", { exact: true })).toHaveCount(0);
  await expect(page.locator("span.badge").filter({ hasText: /^REVIEW$/ })).toHaveCount(0);
  await expect(page.getByText("Possible duplicate", { exact: true })).toHaveCount(0);

  await page.getByLabel(/Dry run/i).uncheck();
  await page.getByRole("button", { name: "Import Now" }).click();
  await expect(page.getByText(/Imported/i)).toBeVisible();

    const finalDbState = await page.evaluate(async () => {
      // @ts-ignore
      const db = window.__db;
      const exercises = await db.exercises.toArray();
      const tracks = await db.tracks.toArray();
      const sessions = await db.sessions.toArray();
      const sets = await db.sets.toArray();
  
      const canonicalExercise = exercises.find((row: any) => row.normalizedName === "db bench press");
      const canonicalTrackIds = new Set(
        tracks.filter((track: any) => track.exerciseId === canonicalExercise?.id).map((track: any) => track.id)
      );
      const realSessionIds = new Set(sessions.map((session: any) => session.id));
  
      return {
        exerciseCount: exercises.length,
        aliases: Array.isArray(canonicalExercise?.aliases) ? [...canonicalExercise.aliases].sort() : [],
        importedSetWeights: sets
          .filter((set: any) => canonicalTrackIds.has(set.trackId) && realSessionIds.has(set.sessionId))
          .map((set: any) => set.weight ?? null)
          .sort((a: number, b: number) => a - b),
      };
  });
 

  expect(finalDbState.exerciseCount).toBe(1);
  expect(finalDbState.aliases).toContain("Dumbbell Bench Press");
  expect(finalDbState.importedSetWeights).toEqual([65, 70]);
});

test("Import CSV Use existing without alias memory still requires review on the next import", async ({ page }) => {
  await seedBenchDuplicateCandidate(page);

  await page.goto(new URL("/import", BASE_URL).toString(), { waitUntil: "domcontentloaded" });
  await page.locator('input[type="file"]').setInputFiles({
    name: "alias-disabled-round-1.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      `date,session_type,program_day,exercise,set,load,reps,rir,notes,set_type
2026-04-01,lift,Upper A,Dumbbell Bench Press,1,65,10,2,,working`,
      "utf8"
    ),
  });

  await expect(page.getByText("Review before create", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Use existing" }).first().click();
  await expect(page.getByText(/Using existing: DB Bench Press/i)).toBeVisible();

  const rememberAliasCheckbox = page.getByLabel(/Remember this as an alias for future imports/i);
  await expect(rememberAliasCheckbox).not.toBeChecked();

    await page.getByLabel(/Dry run/i).uncheck();
    await page.getByRole("button", { name: "Import Now" }).click();
  
    await expect(page.getByText(/Imported/i)).toBeVisible();
  
  const afterFirstImport = await page.evaluate(async () => {
    // @ts-ignore
    const db = window.__db;
    const exercises = await db.exercises.toArray();
    const bench = exercises.find((row: any) => row.normalizedName === "db bench press");
    return {
      exerciseCount: exercises.length,
      aliases: Array.isArray(bench?.aliases) ? [...bench.aliases].sort() : [],
    };
  });

  expect(afterFirstImport.exerciseCount).toBe(1);
  expect(afterFirstImport.aliases).not.toContain("Dumbbell Bench Press");

  await page.locator('input[type="file"]').setInputFiles({
    name: "alias-disabled-round-2.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      `date,session_type,program_day,exercise,set,load,reps,rir,notes,set_type
2026-04-02,lift,Upper A,Dumbbell Bench Press,1,70,8,1,,working`,
      "utf8"
    ),
  });

  await expect(page.getByText("Review before create", { exact: true })).toBeVisible();
  await expect(page.locator("span.badge").filter({ hasText: /^REVIEW$/ })).toBeVisible();
  await expect(page.getByText("Possible duplicate", { exact: true })).toBeVisible();
  await expect(page.getByText("DB Bench Press", { exact: true })).toBeVisible();
});