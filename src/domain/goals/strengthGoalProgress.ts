import type { Exercise, Session, SetEntry, Track } from "../../db";
import {
  buildExerciseProgressionContext,
  type ExerciseProgressionContext,
  type ExerciseProgressionDirection,
  type ExerciseProgressionObservation,
} from "../progression/exerciseProgressionContext";
import type { StrengthGoal } from "./strengthGoals";

const DAY_MS = 24 * 60 * 60 * 1000;
const ALL_HISTORY_DAYS = 36500;
export const MAX_COACH_STRENGTH_GOALS = 12;

export type StrengthGoalFreshness = "fresh" | "aging" | "stale" | "unknown";
export type StrengthGoalComparability = "direct" | "unavailable";

export type StrengthGoalProgressContext = {
  goalId: string;
  exerciseId: string;
  exerciseName: string;
  label?: string;
  targetMetric: StrengthGoal["targetMetric"];
  targetValue: number;
  targetUnit?: StrengthGoal["targetUnit"];
  currentComparableObservation?: ExerciseProgressionObservation;
  bestComparableObservation?: ExerciseProgressionObservation;
  currentValue?: number;
  bestValue?: number;
  absoluteDistance?: number;
  percentOfGoal?: number;
  supportingScoredE1RM?: number;
  latestObservationAt?: number;
  observationCount: number;
  direction: ExerciseProgressionDirection;
  freshness: StrengthGoalFreshness;
  comparability: StrengthGoalComparability;
  limitations: string[];
};

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function freshness(asOf: number, observedAt?: number): StrengthGoalFreshness {
  if (!finite(observedAt)) return "unknown";
  const ageDays = Math.floor(Math.max(0, asOf - observedAt) / DAY_MS);
  if (ageDays <= 21) return "fresh";
  if (ageDays <= 28) return "aging";
  return "stale";
}

function valueFor(goal: StrengthGoal, observation: ExerciseProgressionObservation): number | undefined {
  return goal.targetMetric === "load" ? observation.maxLoad ?? observation.load : observation.maxReps ?? observation.reps;
}

function directlyComparableObservations(
  goal: StrengthGoal,
  exercise: Exercise,
  context: ExerciseProgressionContext | null
) {
  const observations = context?.recentObservations ?? [];
  if (goal.targetMetric !== "reps" || exercise.equipment !== "Bodyweight") return observations;
  return observations.filter((observation) => observation.load == null || observation.load === 0);
}

export function buildStrengthGoalProgressContexts(args: {
  goals: readonly StrengthGoal[];
  exercises: readonly Exercise[];
  tracks: readonly Track[];
  sessions: readonly Session[];
  sets: readonly SetEntry[];
  asOf?: number;
}): StrengthGoalProgressContext[] {
  const asOf = finite(args.asOf) ? args.asOf : Date.now();
  const exercisesById = new Map((args.exercises ?? []).map((exercise) => [exercise.id, exercise]));
  const contexts: StrengthGoalProgressContext[] = [];

  for (const goal of (args.goals ?? []).filter((row) => row.active).slice(0, MAX_COACH_STRENGTH_GOALS)) {
    const recent = buildExerciseProgressionContext({ ...args, exerciseId: goal.exerciseId, asOf });
    if (!recent) continue;
    const canonicalExercise = exercisesById.get(recent.exerciseId);
    if (!canonicalExercise || canonicalExercise.archivedAt || canonicalExercise.mergedIntoExerciseId) continue;
    const allHistory = buildExerciseProgressionContext({
      ...args,
      exerciseId: goal.exerciseId,
      asOf,
      lookbackDays: ALL_HISTORY_DAYS,
      maxObservations: Number.MAX_SAFE_INTEGER,
    });
    const recentComparable = directlyComparableObservations(goal, canonicalExercise, recent)
      .filter((observation) => finite(valueFor(goal, observation)));
    const allComparable = directlyComparableObservations(goal, canonicalExercise, allHistory)
      .filter((observation) => finite(valueFor(goal, observation)));
    const currentComparableObservation = recentComparable[0] ?? allComparable[0];
    const bestComparableObservation = allComparable
      .slice()
      .sort((a, b) => (valueFor(goal, b) as number) - (valueFor(goal, a) as number))[0];
    const currentValue = currentComparableObservation ? valueFor(goal, currentComparableObservation) : undefined;
    const bestValue = bestComparableObservation ? valueFor(goal, bestComparableObservation) : undefined;
    const limitations = [...recent.limitations];
    if (goal.targetMetric === "reps" && canonicalExercise.equipment === "Bodyweight" && recent.recentObservations.length > recentComparable.length) {
      limitations.push("Loaded or assisted observations are not comparable to this bodyweight rep goal.");
    }
    if (!currentComparableObservation) limitations.push("No directly comparable completed working-set observation is available in the recent window.");
    const supportingScoredE1RM = currentComparableObservation?.e1RM;

    contexts.push({
      goalId: goal.id,
      exerciseId: recent.exerciseId,
      exerciseName: recent.exerciseName,
      ...(goal.label ? { label: goal.label } : {}),
      targetMetric: goal.targetMetric,
      targetValue: goal.targetValue,
      targetUnit: goal.targetUnit,
      currentComparableObservation,
      bestComparableObservation,
      currentValue,
      bestValue,
      ...(finite(currentValue) ? { absoluteDistance: goal.targetValue - currentValue, percentOfGoal: (currentValue / goal.targetValue) * 100 } : {}),
      ...(finite(supportingScoredE1RM) ? { supportingScoredE1RM } : {}),
      latestObservationAt: currentComparableObservation?.observedAt,
      observationCount: recentComparable.length,
      direction: recentComparable[0] ? recent.direction : "insufficient_context",
      freshness: freshness(asOf, currentComparableObservation?.observedAt),
      comparability: currentComparableObservation ? "direct" : "unavailable",
      limitations: [...new Set(limitations)],
    });
  }
  return contexts;
}
