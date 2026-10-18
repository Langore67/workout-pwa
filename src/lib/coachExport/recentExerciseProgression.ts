import type { Exercise, Session, SetEntry, Track } from "../../db";
import {
  buildExerciseProgressionContext,
  type ExerciseProgressionContext,
} from "../../domain/progression/exerciseProgressionContext";
import type { CoachExportAnchorLift } from "./types";

export const MAX_COACH_PROGRESSION_EXERCISES = 14;

type Candidate = {
  context: ExerciseProgressionContext;
  anchor: boolean;
  roleRank: number;
};

function roleRank(exercise: Exercise): number {
  if (exercise.strengthSignalRole === "included") return 0;
  if (exercise.strengthSignalRole === "secondary") return 1;
  return 2;
}

/**
 * Ranking is deterministic: Coach/Strength anchor first, then strength-signal
 * role (included, secondary, unclassified), then >=2 observations, recency,
 * canonical exercise id. Excluded exercises are retained only when anchored.
 */
export function buildRecentExerciseProgressionPacket(args: {
  exercises: readonly Exercise[];
  tracks: readonly Track[];
  sessions: readonly Session[];
  sets: readonly SetEntry[];
  anchorLifts?: readonly CoachExportAnchorLift[];
  asOf: number;
  limit?: number;
}): ExerciseProgressionContext[] {
  const anchorIds = new Set(
    (args.anchorLifts ?? [])
      .map((anchor) => String(anchor.exerciseId ?? "").trim())
      .filter(Boolean)
  );
  const candidates: Candidate[] = [];

  for (const exercise of args.exercises ?? []) {
    if (exercise.archivedAt || exercise.mergedIntoExerciseId) continue;
    const anchor = anchorIds.has(exercise.id);
    if (exercise.strengthSignalRole === "excluded" && !anchor) continue;
    const context = buildExerciseProgressionContext({
      exerciseId: exercise.id,
      exercises: args.exercises,
      tracks: args.tracks,
      sessions: args.sessions,
      sets: args.sets,
      asOf: args.asOf,
    });
    if (!context?.observationCount) continue;
    candidates.push({ context, anchor, roleRank: roleRank(exercise) });
  }

  candidates.sort((a, b) => {
    const anchorDifference = Number(b.anchor) - Number(a.anchor);
    if (anchorDifference) return anchorDifference;
    const roleDifference = a.roleRank - b.roleRank;
    if (roleDifference) return roleDifference;
    const comparableDifference = Number(b.context.observationCount >= 2) - Number(a.context.observationCount >= 2);
    if (comparableDifference) return comparableDifference;
    const recencyDifference = (b.context.latestObservationAt ?? 0) - (a.context.latestObservationAt ?? 0);
    if (recencyDifference) return recencyDifference;
    return a.context.exerciseId.localeCompare(b.context.exerciseId);
  });

  const limit = Number.isFinite(args.limit)
    ? Math.max(0, Math.floor(Number(args.limit)))
    : MAX_COACH_PROGRESSION_EXERCISES;
  return candidates.slice(0, limit).map((candidate) => candidate.context);
}
