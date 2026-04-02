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

  await expect(page.getByText("Review before create", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Use existing" }).first().click();
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
