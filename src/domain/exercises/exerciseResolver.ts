import { db, normalizeName, type Exercise } from "../../db";
import {
  getCanonicalExerciseNormalizedName,
  isMappedExerciseAlias,
} from "./exerciseAliasMap";

export type ExerciseResolutionStatus =
  | "exact"
  | "alias"
  | "merged_redirect"
  | "archived_match"
  | "not_found"
  | "ambiguous";

export type ExerciseResolutionSource =
  | "normalizedName"
  | "alias"
  | "mergedIntoExerciseId"
  | "fallback_scan";

export type ResolveExerciseInput = {
  rawName: string;
  allowAlias?: boolean;
  followMerged?: boolean;
  includeArchived?: boolean;
};

export type ResolvedExercise = {
  status: ExerciseResolutionStatus;
  source?: ExerciseResolutionSource;
  inputName: string;
  normalizedInput: string;
  exercise?: Exercise;
  canonicalExercise?: Exercise;
  matchedAlias?: string;
  candidates?: Exercise[];
  warnings: string[];
};

export type ExerciseResolverIndex = {
  allExercises: Exercise[];
  canonicalById: Map<string, Exercise>;
  activeByNormalizedName: Map<string, Exercise[]>;
  activeByAlias: Map<string, Exercise[]>;
  mergedByNormalizedName: Map<string, Exercise[]>;
  archivedByNormalizedName: Map<string, Exercise[]>;
};

function addToMap(map: Map<string, Exercise[]>, key: string, exercise: Exercise) {
  if (!key) return;
  const arr = map.get(key) ?? [];
  arr.push(exercise);
  map.set(key, arr);
}

function uniqueExercises(rows: Exercise[] | undefined): Exercise[] {
  if (!rows?.length) return [];
  const byId = new Map<string, Exercise>();
  for (const row of rows) {
    if (!row?.id || byId.has(row.id)) continue;
    byId.set(row.id, row);
  }
  return Array.from(byId.values());
}

function buildNotFound(inputName: string, normalizedInput: string, warnings: string[] = []): ResolvedExercise {
  return {
    status: "not_found",
    inputName,
    normalizedInput,
    warnings,
  };
}

function buildAmbiguous(
  inputName: string,
  normalizedInput: string,
  source: ExerciseResolutionSource,
  candidates: Exercise[],
  warnings: string[] = []
): ResolvedExercise {
  return {
    status: "ambiguous",
    source,
    inputName,
    normalizedInput,
    candidates,
    warnings,
  };
}

function resolveBucket(
  rows: Exercise[] | undefined,
  inputName: string,
  normalizedInput: string,
  status: "exact" | "alias" | "archived_match",
  source: ExerciseResolutionSource,
  matchedAlias?: string
): ResolvedExercise | undefined {
  const candidates = uniqueExercises(rows);
  if (!candidates.length) return undefined;
  if (candidates.length > 1) {
    return buildAmbiguous(inputName, normalizedInput, source, candidates);
  }

  return {
    status,
    source,
    inputName,
    normalizedInput,
    exercise: candidates[0],
    warnings: [],
    ...(matchedAlias ? { matchedAlias } : {}),
  };
}

function resolveMergedRedirect(
  rows: Exercise[] | undefined,
  index: ExerciseResolverIndex,
  inputName: string,
  normalizedInput: string
): ResolvedExercise | undefined {
  const mergedRows = uniqueExercises(rows);
  if (!mergedRows.length) return undefined;

  const warnings: string[] = [];
  const targets: Exercise[] = [];

  for (const row of mergedRows) {
    const targetId = row.mergedIntoExerciseId;
    if (!targetId) continue;
    const canonical = index.canonicalById.get(targetId);
    if (!canonical) {
      warnings.push(`Merged exercise "${row.name}" points to missing canonical "${targetId}".`);
      continue;
    }
    targets.push(canonical);
  }

  const candidates = uniqueExercises(targets);
  if (!candidates.length) {
    return buildNotFound(inputName, normalizedInput, warnings);
  }
  if (candidates.length > 1) {
    return buildAmbiguous(
      inputName,
      normalizedInput,
      "mergedIntoExerciseId",
      candidates,
      warnings
    );
  }

  return {
    status: "merged_redirect",
    source: "mergedIntoExerciseId",
    inputName,
    normalizedInput,
    exercise: candidates[0],
    canonicalExercise: candidates[0],
    warnings,
  };
}

export function normalizeExerciseQuery(rawName: string): string {
  return normalizeName(rawName);
}

export async function appendExerciseAlias(exerciseId: string, aliasRaw: string): Promise<{
  added: boolean;
  aliases: string[];
}> {
  const exercise = await db.exercises.get(exerciseId);
  if (!exercise) return { added: false, aliases: [] };

  const alias = String(aliasRaw || "").trim();
  const aliasNorm = normalizeExerciseQuery(alias);
  if (!aliasNorm) {
    return {
      added: false,
      aliases: Array.isArray(exercise.aliases) ? exercise.aliases : [],
    };
  }

  const nameNorm = normalizeExerciseQuery(exercise.name || "");
  const existingAliases = Array.isArray(exercise.aliases) ? exercise.aliases : [];
  const existingNorms = new Set(existingAliases.map((value) => normalizeExerciseQuery(String(value || ""))));

  if (aliasNorm === nameNorm || existingNorms.has(aliasNorm)) {
    return { added: false, aliases: existingAliases };
  }

  const allExercises = await db.exercises.toArray();
  const conflictsWithActiveExercise = allExercises.some((row) => {
    if (!row?.id || row.id === exercise.id) return false;
    if (row.archivedAt || row.mergedIntoExerciseId) return false;
    if (normalizeExerciseQuery(row.name || "") === aliasNorm) return true;
    return (Array.isArray(row.aliases) ? row.aliases : []).some(
      (value) => normalizeExerciseQuery(String(value || "")) === aliasNorm
    );
  });

  if (conflictsWithActiveExercise) {
    return { added: false, aliases: existingAliases };
  }

  const nextAliases = [...existingAliases, alias];
  await db.exercises.update(exercise.id, {
    aliases: nextAliases,
    updatedAt: Date.now(),
  });

  return {
    added: true,
    aliases: nextAliases,
  };
}

export async function resolveExerciseToCanonicalAlias(params: {
  canonicalExerciseId: string;
  sourceExerciseId: string;
}): Promise<{
  canonicalExerciseId: string;
  sourceExerciseId: string;
  aliases: string[];
}> {
  const canonicalExerciseId = String(params.canonicalExerciseId || "").trim();
  const sourceExerciseId = String(params.sourceExerciseId || "").trim();

  if (!canonicalExerciseId || !sourceExerciseId || canonicalExerciseId === sourceExerciseId) {
    throw new Error("Choose a source exercise and a different canonical exercise.");
  }

  await db.transaction("rw", db.exercises, async () => {
    const [canonical, source] = await Promise.all([
      db.exercises.get(canonicalExerciseId),
      db.exercises.get(sourceExerciseId),
    ]);

    if (!canonical) throw new Error("Canonical exercise not found.");
    if (!source) throw new Error("Source exercise not found.");

    const existingAliases = Array.isArray(canonical.aliases) ? canonical.aliases : [];
    const existingNorms = new Set(
      existingAliases.map((value) => normalizeExerciseQuery(String(value || "")))
    );
    existingNorms.add(normalizeExerciseQuery(canonical.name || ""));

    const nextAliases = existingAliases.slice();
    for (const aliasRaw of [source.name, ...(Array.isArray(source.aliases) ? source.aliases : [])]) {
      const alias = String(aliasRaw || "").trim();
      const aliasNorm = normalizeExerciseQuery(alias);
      if (!aliasNorm || existingNorms.has(aliasNorm)) continue;
      existingNorms.add(aliasNorm);
      nextAliases.push(alias);
    }

    const now = Date.now();
    await db.exercises.update(canonical.id, {
      aliases: nextAliases,
      updatedAt: now,
    });

    await db.exercises.update(source.id, {
      mergedIntoExerciseId: canonical.id,
      mergeNote: `Resolved to ${canonical.name} as canonical on ${new Date(now).toISOString()}`,
      updatedAt: now,
    });
  });

  const canonical = await db.exercises.get(canonicalExerciseId);
  return {
    canonicalExerciseId,
    sourceExerciseId,
    aliases: Array.isArray(canonical?.aliases) ? canonical.aliases : [],
  };
}

export function buildExerciseResolverIndex(exercises: Exercise[]): ExerciseResolverIndex {
  const allExercises = Array.isArray(exercises) ? exercises.slice() : [];
  const canonicalById = new Map<string, Exercise>();
  const activeByNormalizedName = new Map<string, Exercise[]>();
  const activeByAlias = new Map<string, Exercise[]>();
  const mergedByNormalizedName = new Map<string, Exercise[]>();
  const archivedByNormalizedName = new Map<string, Exercise[]>();

  for (const exercise of allExercises) {
    if (!exercise?.id) continue;
    if (!exercise.mergedIntoExerciseId) {
      canonicalById.set(exercise.id, exercise);
    }
  }

  for (const exercise of allExercises) {
    if (!exercise?.id) continue;

    const normalizedExerciseName =
      normalizeExerciseQuery(exercise.normalizedName || exercise.name || "");

    if (exercise.mergedIntoExerciseId) {
      addToMap(mergedByNormalizedName, normalizedExerciseName, exercise);
      continue;
    }

    if (exercise.archivedAt) {
      addToMap(archivedByNormalizedName, normalizedExerciseName, exercise);
      continue;
    }

    addToMap(activeByNormalizedName, normalizedExerciseName, exercise);

    if (Array.isArray(exercise.aliases)) {
      for (const alias of exercise.aliases) {
        const normalizedAlias = normalizeExerciseQuery(String(alias || ""));
        addToMap(activeByAlias, normalizedAlias, exercise);
      }
    }
  }

  return {
    allExercises,
    canonicalById,
    activeByNormalizedName,
    activeByAlias,
    mergedByNormalizedName,
    archivedByNormalizedName,
  };
}

export function resolveExerciseFromIndex(
  input: ResolveExerciseInput,
  index: ExerciseResolverIndex
): ResolvedExercise {
  const inputName = String(input.rawName ?? "");
  const normalizedInput = normalizeExerciseQuery(inputName);
  const allowAlias = input.allowAlias !== false;
  const followMerged = input.followMerged !== false;
  const includeArchived = input.includeArchived === true;

  if (!normalizedInput) {
    return buildNotFound(inputName, normalizedInput, ["Exercise name is empty after normalization."]);
  }

  if (allowAlias && isMappedExerciseAlias(normalizedInput)) {
    const canonicalNormalized = getCanonicalExerciseNormalizedName(normalizedInput);
    const mappedRows = canonicalNormalized
      ? uniqueExercises(index.activeByNormalizedName.get(canonicalNormalized))
      : [];

    if (mappedRows.length === 1) {
      return {
        status: "alias",
        source: "alias",
        inputName,
        normalizedInput,
        exercise: mappedRows[0],
        canonicalExercise: mappedRows[0],
        matchedAlias: inputName,
        warnings: [],
      };
    }

    if (mappedRows.length > 1) {
      return buildAmbiguous(inputName, normalizedInput, "alias", mappedRows);
    }
  }

  const exact = resolveBucket(
    index.activeByNormalizedName.get(normalizedInput),
    inputName,
    normalizedInput,
    "exact",
    "normalizedName"
  );
  if (exact) return exact;

  if (allowAlias) {
    const aliasMatches = uniqueExercises(index.activeByAlias.get(normalizedInput));
    if (aliasMatches.length === 1) {
      const exercise = aliasMatches[0];
      const matchedAlias =
        exercise.aliases?.find((alias) => normalizeExerciseQuery(String(alias || "")) === normalizedInput) ??
        undefined;
      return {
        status: "alias",
        source: "alias",
        inputName,
        normalizedInput,
        exercise,
        matchedAlias,
        warnings: [],
      };
    }
    if (aliasMatches.length > 1) {
      return buildAmbiguous(inputName, normalizedInput, "alias", aliasMatches);
    }
  }

  if (followMerged) {
    const merged = resolveMergedRedirect(
      index.mergedByNormalizedName.get(normalizedInput),
      index,
      inputName,
      normalizedInput
    );
    if (merged) return merged;
  }

  if (includeArchived) {
    const archived = resolveBucket(
      index.archivedByNormalizedName.get(normalizedInput),
      inputName,
      normalizedInput,
      "archived_match",
      "normalizedName"
    );
    if (archived) return archived;
  }

  const scanMatches = uniqueExercises(
    index.allExercises.filter((exercise) => {
      if (!exercise?.id) return false;
      if (exercise.mergedIntoExerciseId) return false;
      if (exercise.archivedAt && !includeArchived) return false;
      return normalizeExerciseQuery(exercise.name || "") === normalizedInput;
    })
  );

  if (scanMatches.length === 1) {
    const exercise = scanMatches[0];
    return {
      status: exercise.archivedAt ? "archived_match" : "exact",
      source: "fallback_scan",
      inputName,
      normalizedInput,
      exercise,
      warnings: [],
    };
  }
  if (scanMatches.length > 1) {
    return buildAmbiguous(inputName, normalizedInput, "fallback_scan", scanMatches);
  }

  return buildNotFound(inputName, normalizedInput);
}

export async function resolveExercise(input: ResolveExerciseInput): Promise<ResolvedExercise> {
  const exercises = await db.exercises.toArray();
  const index = buildExerciseResolverIndex(exercises);
  return resolveExerciseFromIndex(input, index);
}
