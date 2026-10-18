import type { Exercise, MetricMode, Session, SetEntry, Track } from "../../db";
import {
  buildExerciseResolverIndex,
  resolveExerciseFromIndex,
  type ExerciseResolverIndex,
} from "../exercises/exerciseResolver";
import { computeScoredE1RM } from "../../strength/Strength";

export const EXERCISE_PROGRESSION_LOOKBACK_DAYS = 28;
export const MAX_EXERCISE_PROGRESSION_OBSERVATIONS = 5;
export const EXERCISE_PROGRESSION_SIMILAR_TOLERANCE = 0.03;

export type ExerciseProgressionDirection =
  | "higher"
  | "lower"
  | "similar"
  | "insufficient_context";

export type ExerciseProgressionBestSet = {
  setId: string;
  load?: number;
  reps?: number;
  rir?: number;
  e1RM?: number;
  time?: number;
  distance?: number;
  distanceUnit?: "m" | "steps";
};

export type ExerciseProgressionObservation = {
  sessionId: string;
  observedAt: number;
  bestWorkingSet?: ExerciseProgressionBestSet;
  load?: number;
  reps?: number;
  rir?: number;
  e1RM?: number;
  volume?: number;
  maxReps?: number;
  maxLoad?: number;
  time?: number;
  distance?: number;
  distanceUnit?: "m" | "steps";
};

export type ExerciseProgressionContext = {
  exerciseId: string;
  exerciseName: string;
  metricMode: MetricMode;
  latestObservationAt?: number;
  observationCount: number;
  recentObservations: ExerciseProgressionObservation[];
  bestRecentObservation?: ExerciseProgressionObservation;
  direction: ExerciseProgressionDirection;
  limitations: string[];
};

export type BuildExerciseProgressionContextInput = {
  exerciseId: string;
  exercises: readonly Exercise[];
  tracks: readonly Track[];
  sessions: readonly Session[];
  sets: readonly SetEntry[];
  asOf?: number;
  lookbackDays?: number;
  maxObservations?: number;
};

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function positive(value: unknown): value is number {
  return finite(value) && value > 0;
}

function metricMode(exercise: Exercise): MetricMode {
  return exercise.metricMode === "time" || exercise.metricMode === "distance"
    ? exercise.metricMode
    : "reps";
}

function canonicalExercise(exercise: Exercise, index: ExerciseResolverIndex): Exercise | undefined {
  const resolved = resolveExerciseFromIndex(
    { rawName: exercise.name, allowAlias: true, followMerged: true, includeArchived: true },
    index
  );
  return resolved.canonicalExercise ?? resolved.exercise;
}

function completedSessionTime(session: Session): number | undefined {
  return positive(session.endedAt) && !session.deletedAt ? session.endedAt : undefined;
}

function completedWorkingSet(set: SetEntry): boolean {
  return set.setType === "working" && positive(set.completedAt) && !set.deletedAt;
}

function setSnapshot(set: SetEntry, mode: MetricMode): ExerciseProgressionBestSet {
  const snapshot: ExerciseProgressionBestSet = { setId: set.id };
  if (finite(set.weight)) snapshot.load = set.weight;
  if (positive(set.reps)) snapshot.reps = set.reps;
  if (finite(set.rir)) snapshot.rir = set.rir;
  if (mode === "reps" && positive(set.weight) && positive(set.reps)) {
    const value = computeScoredE1RM(set.weight, set.reps);
    if (value > 0) snapshot.e1RM = value;
  }
  if (mode === "time" && positive(set.seconds)) snapshot.time = set.seconds;
  if (mode === "distance" && positive(set.distance)) {
    snapshot.distance = set.distance;
    snapshot.distanceUnit = set.distanceUnit ?? "m";
  }
  return snapshot;
}

function bestSet(sets: readonly SetEntry[], mode: MetricMode): ExerciseProgressionBestSet | undefined {
  const snapshots = sets.map((set) => setSnapshot(set, mode));
  if (mode === "time") {
    return snapshots.filter((row) => positive(row.time)).sort((a, b) => (b.time as number) - (a.time as number))[0];
  }
  if (mode === "distance") {
    return snapshots.filter((row) => positive(row.distance)).sort((a, b) => (b.distance as number) - (a.distance as number))[0];
  }
  return snapshots.sort((a, b) => {
    const e1Difference = (b.e1RM ?? -Infinity) - (a.e1RM ?? -Infinity);
    if (e1Difference) return e1Difference;
    const repsDifference = (b.reps ?? -Infinity) - (a.reps ?? -Infinity);
    if (repsDifference) return repsDifference;
    return (b.load ?? -Infinity) - (a.load ?? -Infinity);
  })[0];
}

function observation(sessionId: string, observedAt: number, sets: readonly SetEntry[], mode: MetricMode) {
  const best = bestSet(sets, mode);
  const row: ExerciseProgressionObservation = { sessionId, observedAt };
  if (best) {
    row.bestWorkingSet = best;
    if (finite(best.load)) row.load = best.load;
    if (positive(best.reps)) row.reps = best.reps;
    if (finite(best.rir)) row.rir = best.rir;
    if (positive(best.e1RM)) row.e1RM = best.e1RM;
    if (positive(best.time)) row.time = best.time;
    if (positive(best.distance)) {
      row.distance = best.distance;
      row.distanceUnit = best.distanceUnit;
    }
  }
  if (mode === "reps") {
    const reps = sets.map((set) => set.reps).filter(positive);
    if (reps.length) row.maxReps = Math.max(...reps);
    const loads = sets.map((set) => set.weight).filter(positive);
    if (loads.length) row.maxLoad = Math.max(...loads);
    const volume = sets.reduce(
      (sum, set) => sum + (positive(set.weight) && positive(set.reps) ? set.weight * set.reps : 0),
      0
    );
    if (volume > 0) row.volume = volume;
  }
  return row;
}

function comparisonValue(row: ExerciseProgressionObservation, mode: MetricMode): number | undefined {
  if (mode === "time") return row.time;
  if (mode === "distance") return row.distance;
  return row.e1RM ?? row.maxReps;
}

function getDirection(rows: readonly ExerciseProgressionObservation[], mode: MetricMode): ExerciseProgressionDirection {
  const latest = rows[0];
  if (!latest) return "insufficient_context";
  const latestValue = comparisonValue(latest, mode);
  if (!positive(latestValue)) return "insufficient_context";

  let prior = rows.slice(1).filter((row) => positive(comparisonValue(row, mode)));
  if (mode === "distance") {
    prior = prior.filter((row) => row.distanceUnit === latest.distanceUnit);
  }
  if (mode === "reps" && !positive(latest.e1RM)) {
    prior = prior.filter((row) => !positive(row.e1RM) && row.load === latest.load);
  } else if (mode === "reps") {
    prior = prior.filter((row) => positive(row.e1RM));
  }
  if (!prior.length) return "insufficient_context";

  const values = prior.map((row) => comparisonValue(row, mode) as number).sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  const baseline = values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
  const difference = (latestValue - baseline) / baseline;
  if (Math.abs(difference) <= EXERCISE_PROGRESSION_SIMILAR_TOLERANCE) return "similar";
  return difference > 0 ? "higher" : "lower";
}

function bestObservation(rows: readonly ExerciseProgressionObservation[], mode: MetricMode) {
  return rows
    .filter((row) => positive(comparisonValue(row, mode)))
    .slice()
    .sort((a, b) => (comparisonValue(b, mode) as number) - (comparisonValue(a, mode) as number))[0];
}

export function buildExerciseProgressionContext(
  input: BuildExerciseProgressionContextInput
): ExerciseProgressionContext | null {
  const exercises = Array.from(input.exercises ?? []);
  const index = buildExerciseResolverIndex(exercises);
  const requested = exercises.find((exercise) => exercise.id === input.exerciseId);
  if (!requested) return null;
  const canonical = canonicalExercise(requested, index);
  if (!canonical) return null;
  const mode = metricMode(canonical);
  const canonicalTrackIds = new Set(
    (input.tracks ?? [])
      .filter((track) => {
        const direct = exercises.find((exercise) => exercise.id === track.exerciseId);
        return direct ? canonicalExercise(direct, index)?.id === canonical.id : false;
      })
      .map((track) => track.id)
  );
  const asOf = finite(input.asOf) ? input.asOf : Date.now();
  const lookbackDays = positive(input.lookbackDays)
    ? input.lookbackDays
    : EXERCISE_PROGRESSION_LOOKBACK_DAYS;
  const cutoff = asOf - lookbackDays * 24 * 60 * 60 * 1000;
  const sessions = (input.sessions ?? [])
    .map((session) => ({ session, at: completedSessionTime(session) }))
    .filter((row): row is { session: Session; at: number } => positive(row.at) && row.at >= cutoff && row.at <= asOf)
    .sort((a, b) => b.at - a.at);
  const setsBySession = new Map<string, SetEntry[]>();
  for (const set of input.sets ?? []) {
    if (!canonicalTrackIds.has(set.trackId) || !completedWorkingSet(set)) continue;
    const group = setsBySession.get(set.sessionId) ?? [];
    group.push(set);
    setsBySession.set(set.sessionId, group);
  }
  const allObservations = sessions
    .filter(({ session }) => setsBySession.has(session.id))
    .map(({ session, at }) => observation(session.id, at, setsBySession.get(session.id)!, mode))
    .filter((row) => positive(comparisonValue(row, mode)));
  const maxObservations = positive(input.maxObservations)
    ? Math.floor(input.maxObservations)
    : MAX_EXERCISE_PROGRESSION_OBSERVATIONS;
  const recentObservations = allObservations.slice(0, maxObservations);
  const limitations: string[] = [];
  if (!recentObservations.length) limitations.push("No comparable completed working-set observations in the recent window.");
  else if (recentObservations.length < 2) limitations.push("Fewer than two comparable observations in the recent window.");
  if (mode === "reps" && recentObservations.length && !recentObservations.some((row) => positive(row.e1RM))) {
    limitations.push("No valid capped e1RM is available; direction uses directly comparable max reps.");
  }

  return {
    exerciseId: canonical.id,
    exerciseName: canonical.name,
    metricMode: mode,
    latestObservationAt: recentObservations[0]?.observedAt,
    observationCount: allObservations.length,
    recentObservations,
    bestRecentObservation: bestObservation(recentObservations, mode),
    direction: getDirection(recentObservations, mode),
    limitations,
  };
}
