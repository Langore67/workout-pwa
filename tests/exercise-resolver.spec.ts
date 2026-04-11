import { test, expect } from "@playwright/test";
import { resetDexieDb } from "./helpers/dbSeed";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173";

test("exercise resolver v1 handles exact, alias, merged, archived, ambiguous, and not_found cases", async ({
  page,
}) => {
  await page.goto(new URL("/", BASE_URL).toString(), { waitUntil: "domcontentloaded" });
  await resetDexieDb(page);

  const result = await page.evaluate(async () => {
    // @ts-ignore
    const db = window.__db;
    if (!db) throw new Error("__db missing on window.");

    const now = Date.now();

    const canonicalBenchId = crypto.randomUUID();
    const mergedBenchId = crypto.randomUUID();
    const archivedDipId = crypto.randomUUID();
    const exactRowId = crypto.randomUUID();
    const aliasAId = crypto.randomUUID();
    const aliasBId = crypto.randomUUID();
    const brokenMergedId = crypto.randomUUID();

    await db.exercises.bulkAdd([
      {
        id: canonicalBenchId,
        name: "Bench Press",
        normalizedName: "bench press",
        equipmentTags: [],
        aliases: ["Barbell Bench Press"],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: mergedBenchId,
        name: "Benching",
        normalizedName: "benching",
        equipmentTags: [],
        mergedIntoExerciseId: canonicalBenchId,
        archivedAt: now,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: archivedDipId,
        name: "Weighted Dip",
        normalizedName: "weighted dip",
        equipmentTags: [],
        archivedAt: now,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: exactRowId,
        name: "Romanian Deadlift",
        normalizedName: "romanian deadlift",
        equipmentTags: [],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: aliasAId,
        name: "Cable Row",
        normalizedName: "cable row",
        equipmentTags: [],
        aliases: ["Row Variant"],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: aliasBId,
        name: "Machine Row",
        normalizedName: "machine row",
        equipmentTags: [],
        aliases: ["Row Variant"],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: brokenMergedId,
        name: "Ghost Lift",
        normalizedName: "ghost lift",
        equipmentTags: [],
        mergedIntoExerciseId: "missing-target-id",
        archivedAt: now,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const {
      normalizeExerciseQuery,
      buildExerciseResolverIndex,
      resolveExerciseFromIndex,
      resolveExercise,
    } = await import("/src/domain/exercises/exerciseResolver.ts");
    const { normalizeName } = await import("/src/db.ts");

    const exercises = await db.exercises.toArray();
    const index = buildExerciseResolverIndex(exercises);

    const exact = resolveExerciseFromIndex({ rawName: "Romanian Deadlift" }, index);
    const alias = resolveExerciseFromIndex({ rawName: "Barbell Bench Press" }, index);
    const merged = resolveExerciseFromIndex({ rawName: "Benching" }, index);
    const archivedDefault = resolveExerciseFromIndex({ rawName: "Weighted Dip" }, index);
    const archivedIncluded = resolveExerciseFromIndex(
      { rawName: "Weighted Dip", includeArchived: true },
      index
    );
    const ambiguous = resolveExerciseFromIndex({ rawName: "Row Variant" }, index);
    const notFound = resolveExerciseFromIndex({ rawName: "Made Up Lift" }, index);
    const brokenMerged = resolveExerciseFromIndex({ rawName: "Ghost Lift" }, index);
    const delegated = await resolveExercise({ rawName: "Barbell Bench Press" });

    return {
      normalizedParity:
        normalizeExerciseQuery("  Pull-Up  ") === normalizeName("  Pull-Up  "),
      exact: {
        status: exact.status,
        source: exact.source,
        name: exact.exercise?.name ?? null,
      },
      alias: {
        status: alias.status,
        source: alias.source,
        name: alias.exercise?.name ?? null,
        matchedAlias: alias.matchedAlias ?? null,
      },
      merged: {
        status: merged.status,
        source: merged.source,
        name: merged.exercise?.name ?? null,
        canonical: merged.canonicalExercise?.name ?? null,
      },
      archivedDefault: {
        status: archivedDefault.status,
        name: archivedDefault.exercise?.name ?? null,
      },
      archivedIncluded: {
        status: archivedIncluded.status,
        name: archivedIncluded.exercise?.name ?? null,
      },
      ambiguous: {
        status: ambiguous.status,
        count: ambiguous.candidates?.length ?? 0,
      },
      notFound: {
        status: notFound.status,
      },
      brokenMerged: {
        status: brokenMerged.status,
        warnings: brokenMerged.warnings,
      },
      delegated: {
        status: delegated.status,
        name: delegated.exercise?.name ?? null,
        matchedAlias: delegated.matchedAlias ?? null,
      },
    };
  });

  expect(result.normalizedParity).toBe(true);

  expect(result.exact).toEqual({
    status: "exact",
    source: "normalizedName",
    name: "Romanian Deadlift",
  });

  expect(result.alias).toEqual({
    status: "alias",
    source: "alias",
    name: "Bench Press",
    matchedAlias: "Barbell Bench Press",
  });

  expect(result.merged).toEqual({
    status: "merged_redirect",
    source: "mergedIntoExerciseId",
    name: "Bench Press",
    canonical: "Bench Press",
  });

  expect(result.archivedDefault).toEqual({
    status: "not_found",
    name: null,
  });

  expect(result.archivedIncluded).toEqual({
    status: "archived_match",
    name: "Weighted Dip",
  });

  expect(result.ambiguous).toEqual({
    status: "ambiguous",
    count: 2,
  });

  expect(result.notFound).toEqual({
    status: "not_found",
  });

  expect(result.brokenMerged.status).toBe("not_found");
  expect(result.brokenMerged.warnings.length).toBeGreaterThan(0);

  expect(result.delegated).toEqual({
    status: "alias",
    name: "Bench Press",
    matchedAlias: "Barbell Bench Press",
  });
});

test("exercise resolver normalizes case and supported spacing or punctuation across push pull hinge and squat", async ({
  page,
}) => {
  await page.goto(new URL("/", BASE_URL).toString(), { waitUntil: "domcontentloaded" });
  await resetDexieDb(page);

  const result = await page.evaluate(async () => {
    // @ts-ignore
    const db = window.__db;
    if (!db) throw new Error("__db missing on window.");

    const now = Date.now();
    const benchId = crypto.randomUUID();
    const pullId = crypto.randomUUID();
    const hingeId = crypto.randomUUID();
    const squatId = crypto.randomUUID();

    await db.exercises.bulkAdd([
      { id: benchId, name: "Bench Press", normalizedName: "bench press", equipmentTags: [], createdAt: now, updatedAt: now },
      { id: pullId, name: "Pull Up", normalizedName: "pull up", equipmentTags: [], createdAt: now, updatedAt: now },
      { id: hingeId, name: "Romanian Deadlift", normalizedName: "romanian deadlift", equipmentTags: [], createdAt: now, updatedAt: now },
      { id: squatId, name: "Hack Squat", normalizedName: "hack squat", equipmentTags: [], createdAt: now, updatedAt: now },
    ]);

    const { buildExerciseResolverIndex, resolveExerciseFromIndex } = await import("/src/domain/exercises/exerciseResolver.ts");
    const index = buildExerciseResolverIndex(await db.exercises.toArray());

    const cases = [
      { rawName: "bench press", expectedId: benchId, label: "push lower" },
      { rawName: "Bench press", expectedId: benchId, label: "push title" },
      { rawName: "Pull-Up", expectedId: pullId, label: "pull hyphen" },
      { rawName: "pull up", expectedId: pullId, label: "pull lower" },
      { rawName: "romanian deadlift", expectedId: hingeId, label: "hinge lower" },
      { rawName: "Romanian_deadlift", expectedId: hingeId, label: "hinge underscore" },
      { rawName: "hack squat", expectedId: squatId, label: "squat lower" },
      { rawName: "Hack   squat", expectedId: squatId, label: "squat spacing" },
    ].map((entry) => {
      const resolution = resolveExerciseFromIndex({ rawName: entry.rawName }, index);
      return {
        label: entry.label,
        expectedId: entry.expectedId,
        status: resolution.status,
        exerciseId: resolution.exercise?.id ?? null,
      };
    });

    return { cases };
  });

  for (const row of result.cases) {
    expect(row.status, row.label).toBe("exact");
    expect(row.exerciseId, row.label).toBe(row.expectedId);
  }
});

test("duplicate candidate builder surfaces strong candidates for likely duplicates", async ({ page }) => {
  await page.goto(new URL("/", BASE_URL).toString(), { waitUntil: "domcontentloaded" });
  await resetDexieDb(page);

  const result = await page.evaluate(async () => {
    // @ts-ignore
    const db = window.__db;
    if (!db) throw new Error("__db missing on window.");

    const now = Date.now();
    const exerciseId = crypto.randomUUID();
    const trackId = crypto.randomUUID();

    await db.exercises.add({
      id: exerciseId,
      name: "DB Bench Press",
      normalizedName: "db bench press",
      aliases: [],
      equipmentTags: ["dumbbell"],
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
      sessionId: crypto.randomUUID(),
      trackId,
      orderIndex: 0,
      createdAt: now,
    });

    await db.sets.add({
      id: crypto.randomUUID(),
      sessionId: crypto.randomUUID(),
      trackId,
      setType: "working",
      weight: 65,
      reps: 10,
      createdAt: now,
    });

    const { buildExerciseDuplicateCandidates } = await import("/src/domain/exercises/exerciseDuplicateCandidates.ts");
    const candidates = buildExerciseDuplicateCandidates({
      rawName: "Dumbbell Bench Press",
      exercises: await db.exercises.toArray(),
      tracks: await db.tracks.toArray(),
      templateItems: await db.templateItems.toArray(),
      sessionItems: await db.sessionItems.toArray(),
      sets: await db.sets.toArray(),
      maxCandidates: 3,
    });

    return candidates.map((candidate: any) => ({
      name: candidate.name,
      confidence: candidate.confidence,
      recommendation: candidate.recommendation,
      reason: candidate.reason,
      setCount: candidate.evidence.setCount,
      trackCount: candidate.evidence.trackCount,
    }));
  });

  expect(result[0]).toMatchObject({
    name: "DB Bench Press",
    confidence: "high",
    recommendation: "safe merge",
    setCount: 1,
    trackCount: 1,
  });
  expect(result[0].reason).toContain("Same normalized name");
});

test("appendExerciseAlias persists a remembered alias that shared resolver respects", async ({ page }) => {
  await page.goto(new URL("/", BASE_URL).toString(), { waitUntil: "domcontentloaded" });
  await resetDexieDb(page);

  const result = await page.evaluate(async () => {
    // @ts-ignore
    const db = window.__db;
    if (!db) throw new Error("__db missing on window.");

    const now = Date.now();
    const exerciseId = crypto.randomUUID();

    await db.exercises.add({
      id: exerciseId,
      name: "DB Bench Press",
      normalizedName: "db bench press",
      aliases: [],
      equipmentTags: ["dumbbell"],
      createdAt: now,
      updatedAt: now,
    });

    const {
      appendExerciseAlias,
      buildExerciseResolverIndex,
      resolveExerciseFromIndex,
    } = await import("/src/domain/exercises/exerciseResolver.ts");

    const appendResult = await appendExerciseAlias(exerciseId, "Dumbbell Bench Press");
    const exercises = await db.exercises.toArray();
    const resolution = resolveExerciseFromIndex(
      { rawName: "Dumbbell Bench Press", allowAlias: true, followMerged: true },
      buildExerciseResolverIndex(exercises)
    );

    return {
      appendResult,
      aliases: exercises[0]?.aliases ?? [],
      resolution: {
        status: resolution.status,
        source: resolution.source,
        name: resolution.exercise?.name ?? null,
        matchedAlias: resolution.matchedAlias ?? null,
      },
    };
  });

  expect(result.appendResult.added).toBe(true);
  expect(result.aliases).toContain("Dumbbell Bench Press");
  expect(result.resolution).toEqual({
    status: "alias",
    source: "alias",
    name: "DB Bench Press",
    matchedAlias: "Dumbbell Bench Press",
  });
});

test("appendExerciseAlias refuses aliases already owned by another active exercise", async ({ page }) => {
  await page.goto(new URL("/", BASE_URL).toString(), { waitUntil: "domcontentloaded" });
  await resetDexieDb(page);

  const result = await page.evaluate(async () => {
    // @ts-ignore
    const db = window.__db;
    if (!db) throw new Error("__db missing on window.");

    const now = Date.now();
    const canonicalId = crypto.randomUUID();
    const activeDuplicateId = crypto.randomUUID();

    await db.exercises.bulkAdd([
      {
        id: canonicalId,
        name: "Dumbbell Bench Press",
        normalizedName: "dumbbell bench press",
        aliases: [],
        equipmentTags: ["dumbbell"],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: activeDuplicateId,
        name: "DB Bench Press",
        normalizedName: "db bench press",
        aliases: ["DB Press"],
        equipmentTags: ["dumbbell"],
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const { appendExerciseAlias } = await import("/src/domain/exercises/exerciseResolver.ts");

    const nameConflict = await appendExerciseAlias(canonicalId, "DB Bench Press");
    const aliasConflict = await appendExerciseAlias(canonicalId, "DB Press");
    const canonical = await db.exercises.get(canonicalId);

    return {
      nameConflict,
      aliasConflict,
      aliases: canonical?.aliases ?? [],
    };
  });

  expect(result.nameConflict).toEqual({ added: false, aliases: [] });
  expect(result.aliasConflict).toEqual({ added: false, aliases: [] });
  expect(result.aliases).toEqual([]);
});

test("shared alias map resolves high-confidence aliases to canonical exercises", async ({ page }) => {
  await page.goto(new URL("/", BASE_URL).toString(), { waitUntil: "domcontentloaded" });
  await resetDexieDb(page);

  const result = await page.evaluate(async () => {
    // @ts-ignore
    const db = window.__db;
    if (!db) throw new Error("__db missing on window.");

    const now = Date.now();
    const canonicalId = crypto.randomUUID();
    const aliasRowId = crypto.randomUUID();

    await db.exercises.bulkAdd([
      {
        id: canonicalId,
        name: "Dumbbell Bench Press",
        normalizedName: "dumbbell bench press",
        aliases: [],
        equipmentTags: ["dumbbell"],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: aliasRowId,
        name: "DB Bench Press",
        normalizedName: "db bench press",
        aliases: [],
        equipmentTags: ["dumbbell"],
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const { buildExerciseResolverIndex, resolveExerciseFromIndex } = await import(
      "/src/domain/exercises/exerciseResolver.ts"
    );

    const resolution = resolveExerciseFromIndex(
      { rawName: "DB Bench Press", allowAlias: true, followMerged: true },
      buildExerciseResolverIndex(await db.exercises.toArray())
    );

    return {
      status: resolution.status,
      source: resolution.source,
      name: resolution.exercise?.name ?? null,
      canonical: resolution.canonicalExercise?.name ?? null,
      matchedAlias: resolution.matchedAlias ?? null,
    };
  });

  expect(result).toEqual({
    status: "alias",
    source: "alias",
    name: "Dumbbell Bench Press",
    canonical: "Dumbbell Bench Press",
    matchedAlias: "DB Bench Press",
  });
});

test("guided canonical resolution marks a duplicate as redirect and adds its name to canonical aliases", async ({
  page,
}) => {
  await page.goto(new URL("/", BASE_URL).toString(), { waitUntil: "domcontentloaded" });
  await resetDexieDb(page);

  const result = await page.evaluate(async () => {
    // @ts-ignore
    const db = window.__db;
    if (!db) throw new Error("__db missing on window.");

    const now = Date.now();
    const canonicalId = crypto.randomUUID();
    const sourceId = crypto.randomUUID();

    await db.exercises.bulkAdd([
      {
        id: canonicalId,
        name: "Dumbbell Bench Press",
        normalizedName: "dumbbell bench press",
        aliases: [],
        equipmentTags: ["dumbbell"],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: sourceId,
        name: "Flat DB Bench",
        normalizedName: "flat db bench",
        aliases: ["DB Flat Bench"],
        equipmentTags: ["dumbbell"],
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const {
      buildExerciseResolverIndex,
      resolveExerciseFromIndex,
      resolveExerciseToCanonicalAlias,
    } = await import("/src/domain/exercises/exerciseResolver.ts");

    await resolveExerciseToCanonicalAlias({
      canonicalExerciseId: canonicalId,
      sourceExerciseId: sourceId,
    });

    const exercises = await db.exercises.toArray();
    const index = buildExerciseResolverIndex(exercises);
    const source = exercises.find((row: any) => row.id === sourceId);
    const canonical = exercises.find((row: any) => row.id === canonicalId);
    const resolution = resolveExerciseFromIndex(
      { rawName: "Flat DB Bench", allowAlias: true, followMerged: true },
      index
    );

    return {
      sourceMergedInto: source?.mergedIntoExerciseId ?? null,
      canonicalAliases: canonical?.aliases ?? [],
      resolution: {
        status: resolution.status,
        source: resolution.source,
        name: resolution.exercise?.name ?? null,
        canonical: resolution.canonicalExercise?.name ?? null,
      },
    };
  });

  expect(result.sourceMergedInto).toBeTruthy();
  expect(result.canonicalAliases).toContain("Flat DB Bench");
  expect(result.canonicalAliases).toContain("DB Flat Bench");
  expect(["alias", "merged_redirect"]).toContain(result.resolution.status);
  expect(result.resolution).toEqual({
    status: result.resolution.status,
    source: result.resolution.source,
    name: "Dumbbell Bench Press",
    canonical: "Dumbbell Bench Press",
  });
});

test("guided canonical resolution rejects inactive or redirected canonical targets", async ({ page }) => {
  await page.goto(new URL("/", BASE_URL).toString(), { waitUntil: "domcontentloaded" });
  await resetDexieDb(page);

  const result = await page.evaluate(async () => {
    // @ts-ignore
    const db = window.__db;
    if (!db) throw new Error("__db missing on window.");

    const now = Date.now();
    const activeCanonicalId = crypto.randomUUID();
    const archivedCanonicalId = crypto.randomUUID();
    const redirectedCanonicalId = crypto.randomUUID();
    const sourceId = crypto.randomUUID();
    const secondSourceId = crypto.randomUUID();

    await db.exercises.bulkAdd([
      {
        id: activeCanonicalId,
        name: "Dumbbell Bench Press",
        normalizedName: "dumbbell bench press",
        aliases: [],
        equipmentTags: ["dumbbell"],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: archivedCanonicalId,
        name: "Archived DB Bench",
        normalizedName: "archived db bench",
        aliases: [],
        equipmentTags: ["dumbbell"],
        archivedAt: now,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: redirectedCanonicalId,
        name: "Redirected DB Bench",
        normalizedName: "redirected db bench",
        aliases: [],
        equipmentTags: ["dumbbell"],
        mergedIntoExerciseId: activeCanonicalId,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: sourceId,
        name: "Flat DB Bench",
        normalizedName: "flat db bench",
        aliases: [],
        equipmentTags: ["dumbbell"],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: secondSourceId,
        name: "DB Flat Press",
        normalizedName: "db flat press",
        aliases: [],
        equipmentTags: ["dumbbell"],
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const { resolveExerciseToCanonicalAlias } = await import("/src/domain/exercises/exerciseResolver.ts");

    const errors: string[] = [];
    for (const [canonicalExerciseId, sourceExerciseId] of [
      [archivedCanonicalId, sourceId],
      [redirectedCanonicalId, secondSourceId],
    ]) {
      try {
        await resolveExerciseToCanonicalAlias({ canonicalExerciseId, sourceExerciseId });
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }

    const source = await db.exercises.get(sourceId);
    const secondSource = await db.exercises.get(secondSourceId);
    return {
      errors,
      sourceMergedInto: source?.mergedIntoExerciseId ?? null,
      secondSourceMergedInto: secondSource?.mergedIntoExerciseId ?? null,
    };
  });

  expect(result.errors).toEqual([
    "Canonical exercise must be active, not archived.",
    "Canonical exercise must not already redirect to another exercise.",
  ]);
  expect(result.sourceMergedInto).toBeNull();
  expect(result.secondSourceMergedInto).toBeNull();
});
