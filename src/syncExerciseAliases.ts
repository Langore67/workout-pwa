// src/syncExerciseAliases.ts
/* ============================================================================
   syncExerciseAliases.ts — Merge alias seed entries into existing exercises
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-03-07-ALIASES-01
   FILE: src/syncExerciseAliases.ts
   ============================================================================ */

import { db, normalizeName } from "./db";
import { addAppLog } from "./appLog";

export type ExerciseAliasSeedRow = {
  alias: string;
  exerciseName: string;
};

export async function syncExerciseAliasesFromRows(rows: ExerciseAliasSeedRow[]) {
  const allExercises = await db.exercises.toArray();

  const byCanonicalName = new Map<string, (typeof allExercises)[number]>();
  for (const ex of allExercises) {
    byCanonicalName.set(normalizeName(ex.name), ex);
  }

  let rowsRead = 0;
  let updatedExercises = 0;
  let aliasesAdded = 0;
  let missingCanonicals = 0;

  const touchedExerciseIds = new Set<string>();

  for (const row of rows) {
    rowsRead += 1;

    const aliasRaw = String(row.alias || "").trim();
    const exerciseNameRaw = String(row.exerciseName || "").trim();

    if (!aliasRaw || !exerciseNameRaw) continue;

    const canonical = byCanonicalName.get(normalizeName(exerciseNameRaw));
    if (!canonical) {
      missingCanonicals += 1;
      continue;
    }

    const existingAliases = Array.isArray(canonical.aliases) ? canonical.aliases : [];
    const existingNorms = new Set(existingAliases.map((x) => normalizeName(x)));
    const aliasNorm = normalizeName(aliasRaw);

    if (!aliasNorm) continue;
    if (aliasNorm === normalizeName(canonical.name)) continue;
    if (existingNorms.has(aliasNorm)) continue;

    const nextAliases = [...existingAliases, aliasRaw];

    await db.exercises.update(canonical.id, {
      aliases: nextAliases,
      updatedAt: Date.now(),
    });

    canonical.aliases = nextAliases;
    touchedExerciseIds.add(canonical.id);
    aliasesAdded += 1;
  }

  updatedExercises = touchedExerciseIds.size;

  const result = {
    rowsRead,
    updatedExercises,
    aliasesAdded,
    missingCanonicals,
  };

  await addAppLog({
    type: "system",
    level: "info",
    message: "Synced exercise aliases from seed rows",
    detailsJson: JSON.stringify(result),
  });

  return result;
}