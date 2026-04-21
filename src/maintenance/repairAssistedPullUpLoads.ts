import { db, normalizeName, type Exercise, type Track } from "../db";
import {
  buildExerciseResolverIndex,
  resolveExerciseFromIndex,
} from "../domain/exercises/exerciseResolver";

export type AssistedPullUpLoadRepairResult = {
  ok: boolean;
  message: string;
  canonicalExerciseId: string | null;
  canonicalExerciseName: string | null;
  tracksMatched: number;
  rowsScanned: number;
  rowsRepaired: number;
  rowsSkipped: number;
  warnings: string[];
};

const ASSISTED_PULL_UP_LOOKUPS = [
  "Assisted Pull Up",
  "Assisted Pull-Up",
  "Assisted Pullup",
];

function isAssistedPullUpName(value: unknown): boolean {
  const normalized = normalizeName(String(value ?? ""));
  return (
    normalized === "assisted pull up" ||
    normalized === "assisted pullup" ||
    normalized === "assisted pull-up"
  );
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

function resolveCanonicalAssistedPullUp(exercises: Exercise[]): {
  exercise: Exercise | null;
  warnings: string[];
} {
  const index = buildExerciseResolverIndex(exercises);
  const warnings: string[] = [];
  const candidates = new Map<string, Exercise>();

  for (const rawName of ASSISTED_PULL_UP_LOOKUPS) {
    const resolution = resolveExerciseFromIndex(
      {
        rawName,
        allowAlias: true,
        followMerged: true,
        includeArchived: false,
      },
      index
    );

    if (resolution.status === "ambiguous") {
      warnings.push(
        `Ambiguous Assisted Pull Up lookup for "${rawName}": ${(resolution.candidates ?? [])
          .map((exercise) => exercise.name)
          .join(", ")}`
      );
      continue;
    }

    if (
      resolution.status === "exact" ||
      resolution.status === "alias" ||
      resolution.status === "merged_redirect"
    ) {
      const exercise = resolution.canonicalExercise ?? resolution.exercise ?? null;
      if (exercise?.id) candidates.set(exercise.id, exercise);
    }
  }

  if (candidates.size !== 1) {
    return {
      exercise: null,
      warnings: [
        ...warnings,
        candidates.size
          ? `Assisted Pull Up resolved to multiple canonical exercises: ${Array.from(candidates.values())
              .map((exercise) => exercise.name)
              .join(", ")}`
          : "Could not resolve a canonical Assisted Pull Up exercise.",
      ],
    };
  }

  const exercise = Array.from(candidates.values())[0];
  const aliases = Array.isArray(exercise.aliases) ? exercise.aliases : [];
  if (![exercise.name, exercise.normalizedName, ...aliases].some(isAssistedPullUpName)) {
    return {
      exercise: null,
      warnings: [
        ...warnings,
        `Resolved exercise "${exercise.name}" does not look like Assisted Pull Up; repair aborted.`,
      ],
    };
  }

  return { exercise, warnings };
}

function resolvesToCanonicalAssistedPullUp(
  exercise: Exercise,
  exercises: Exercise[],
  canonicalExerciseId: string
): boolean {
  if (exercise.id === canonicalExerciseId) return true;

  const index = buildExerciseResolverIndex(exercises);
  const resolution = resolveExerciseFromIndex(
    {
      rawName: exercise.name || exercise.normalizedName || "",
      allowAlias: true,
      followMerged: true,
      includeArchived: false,
    },
    index
  );
  const resolvedExercise = resolution.canonicalExercise ?? resolution.exercise ?? null;
  return resolvedExercise?.id === canonicalExerciseId;
}

export async function repairAssistedPullUpLoads(): Promise<AssistedPullUpLoadRepairResult> {
  const warnings: string[] = [];
  const [exercises, tracks, sets] = await Promise.all([
    db.exercises.toArray(),
    db.tracks.toArray(),
    db.sets.toArray(),
  ]);

  const { exercise: canonicalExercise, warnings: resolveWarnings } =
    resolveCanonicalAssistedPullUp(exercises);
  warnings.push(...resolveWarnings);

  if (!canonicalExercise) {
    return {
      ok: false,
      message: "Assisted Pull Up load repair aborted.",
      canonicalExerciseId: null,
      canonicalExerciseName: null,
      tracksMatched: 0,
      rowsScanned: 0,
      rowsRepaired: 0,
      rowsSkipped: 0,
      warnings,
    };
  }

  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const assistedPullUpExerciseIds = uniqueStrings(
    exercises
      .filter((exercise) =>
        resolvesToCanonicalAssistedPullUp(exercise, exercises, canonicalExercise.id)
      )
      .map((exercise) => exercise.id)
  );
  const assistedPullUpExerciseIdSet = new Set(assistedPullUpExerciseIds);
  const matchingTrackIds = new Set<string>();

  for (const track of tracks as Track[]) {
    const exerciseId = String(track?.exerciseId ?? "").trim();
    if (!exerciseId) continue;
    const exercise = exerciseById.get(exerciseId);
    if (!exercise) {
      warnings.push(`Track "${track.id}" points to missing exercise "${exerciseId}".`);
      continue;
    }
    if (assistedPullUpExerciseIdSet.has(exercise.id)) matchingTrackIds.add(track.id);
  }

  let rowsScanned = 0;
  let rowsRepaired = 0;
  let rowsSkipped = 0;

  await db.transaction("rw", db.sets, async () => {
    for (const set of sets as any[]) {
      const trackMatches = matchingTrackIds.has(String(set?.trackId ?? ""));
      const directExerciseMatches = assistedPullUpExerciseIdSet.has(String(set?.exerciseId ?? ""));
      if (!set?.id || (!trackMatches && !directExerciseMatches)) continue;

      rowsScanned += 1;
      const weight = Number(set.weight);
      if (!Number.isFinite(weight) || weight <= 0) {
        rowsSkipped += 1;
        continue;
      }

      await (db.sets as any).update(set.id, {
        weight: -Math.abs(weight),
        updatedAt: Date.now(),
      });
      rowsRepaired += 1;
    }
  });

  return {
    ok: true,
    message:
      rowsRepaired > 0
        ? "Assisted Pull Up load repair complete."
        : "No Assisted Pull Up loads needed repair.",
    canonicalExerciseId: canonicalExercise.id,
    canonicalExerciseName: canonicalExercise.name,
    tracksMatched: matchingTrackIds.size,
    rowsScanned,
    rowsRepaired,
    rowsSkipped,
    warnings,
  };
}
