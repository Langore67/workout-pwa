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
