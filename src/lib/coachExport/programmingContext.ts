import type { Exercise, Session, SetEntry, Track } from "../../db";
import { TRAINING_ROLES, parseTrainingRole, type TrainingRole } from "../../domain/trainingRole";
import { buildCardioProgressionContext } from "../cardio/cardioProgressionContext";
import { buildCardioStrengthInterferenceContext } from "./cardioStrengthInterferenceContext";
import { buildTrainingExposureContext } from "../../domain/training/trainingExposureContext";
import { localCalendarDayDifference } from "../../domain/training/trainingCalendarContext";
import type { CoachExportMetrics, CoachProgrammingContext } from "./types";

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function benchmarkText(anchor: CoachExportMetrics["anchorLifts"][number]) {
  const parts = [
    finite(anchor.effectiveWeightLb) ? `${anchor.effectiveWeightLb} lb` : undefined,
    finite(anchor.reps) ? `${anchor.reps} reps` : undefined,
    finite(anchor.e1rm) ? `e1RM ${anchor.e1rm.toFixed(1)} lb` : undefined,
  ].filter(Boolean);
  return parts.length ? parts.join(" x ").replace(" x e1RM", " | e1RM") : undefined;
}

function freshness(anchor: CoachExportMetrics["anchorLifts"][number]) {
  if (anchor.recency === "recent") return "fresh" as const;
  if (anchor.recency === "historical") return "aging" as const;
  if (anchor.recency === "stale") return "stale" as const;
  return "unknown" as const;
}

function uniqueDefined(values: Array<string | undefined>) {
  return [...new Set(values.filter((value): value is string => !!value))].sort();
}

function nameKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function buildCoachProgrammingContext(args: {
  metrics: CoachExportMetrics;
  sessions: Session[];
  sets: SetEntry[];
  tracks: Track[];
  exercises?: Exercise[];
  asOf: number;
}): CoachProgrammingContext {
  // Production supplies this once from CoachExportMetrics. Direct legacy
  // callers are upgraded through the shared factual builder rather than a
  // separate Programming Context session counter.
  const trainingExposure = args.metrics.trainingExposure ?? buildTrainingExposureContext({
    sessions: args.sessions,
    sets: args.sets,
    tracks: args.tracks,
    exercises: args.exercises ?? [],
    asOf: args.asOf,
  });

  const anchors = (args.metrics.anchorLifts ?? []).map((anchor) => ({
    pattern: anchor.pattern,
    ...(anchor.exerciseName ? { exerciseName: anchor.exerciseName } : {}),
    ...(benchmarkText(anchor) ? { benchmark: benchmarkText(anchor) } : {}),
    ...(finite(anchor.ageDays) ? { ageDays: Math.max(0, Math.floor(anchor.ageDays)) } : {}),
    freshness: freshness(anchor),
  }));
  const roleByExerciseName = new Map<string, TrainingRole>();
  for (const exercise of args.exercises ?? []) {
    const role = parseTrainingRole(exercise.trainingRole);
    if (role) roleByExerciseName.set(nameKey(exercise.name), role);
  }
  const recentRoleNames = new Set(
    (args.metrics.movementCoverage?.entries ?? []).flatMap((entry) =>
      (entry.contributingExercises ?? []).map((exercise) => nameKey(exercise.exerciseName))
    )
  );
  const trainingRoles = TRAINING_ROLES.map((role) => {
    const exercises = (args.exercises ?? [])
      .filter((exercise) => !exercise.archivedAt && !(exercise as any).mergedIntoExerciseId && parseTrainingRole(exercise.trainingRole) === role)
      .sort((a, b) => {
        const recentDiff = Number(recentRoleNames.has(nameKey(b.name))) - Number(recentRoleNames.has(nameKey(a.name)));
        return recentDiff || a.name.localeCompare(b.name);
      });
    return { role, exercises: exercises.slice(0, 5).map((exercise) => exercise.name), totalExercises: exercises.length };
  }).filter((group) => group.totalExercises > 0);
  const constraints: string[] = [];
  for (const anchor of anchors) {
    const label = anchor.exerciseName ?? anchor.pattern;
    if (anchor.freshness === "stale") constraints.push(`${label} benchmark is stale.`);
    if (!anchor.benchmark) constraints.push(`${label} benchmark is unavailable.`);
  }
  // Legacy Movement Coverage statuses are compatibility-only. Training
  // Exposure carries the factual partial/complete-period context, so no
  // deficiency constraint is generated from legacy status labels.
  for (const note of args.metrics.readinessNotes ?? []) {
    const clean = note.trim();
    if (clean) constraints.push(clean);
  }

  const cardioEvents = args.metrics.cardioSummary?.normalizedWalks ?? [];
  const cardio = args.metrics.cardioSummary && args.metrics.cardioSummary.last28d.count > 0
    ? {
        activities7d: args.metrics.cardioSummary.last7d.count,
        duration7dSeconds: args.metrics.cardioSummary.last7d.totalDurationSeconds,
        distance7dMeters: args.metrics.cardioSummary.last7d.totalDistanceMeters,
        activities28d: args.metrics.cardioSummary.last28d.count,
        activityTypes: uniqueDefined(cardioEvents.map((event) => event.activityType)),
        intents: uniqueDefined(cardioEvents.map((event) => event.conditioningIntent)),
        formats: uniqueDefined(cardioEvents.map((event) => event.cardioFormat)),
        // Coach exports provide this once on CoachExportMetrics. The fallback
        // preserves compatibility for direct callers that supply only the
        // older cardio summary shape.
        progression: args.metrics.cardioProgression ?? buildCardioProgressionContext(cardioEvents, { asOf: args.asOf }),
        strengthProximity: buildCardioStrengthInterferenceContext({
          sessions: args.sessions,
          sets: args.sets,
          tracks: args.tracks,
          exercises: args.exercises ?? [],
          cardioEvents,
          asOf: args.asOf,
          bodyweightLb: args.metrics.strengthSignal?.currentBodyweight ?? undefined,
        }),
      }
    : undefined;

  return {
    strength: {
      ...(finite(args.metrics.strengthSignal?.current) ? { strengthSignal: args.metrics.strengthSignal.current } : {}),
      ...(finite(args.metrics.strengthSignal?.delta14d) ? { strengthSignalDelta14d: args.metrics.strengthSignal.delta14d } : {}),
      ...(args.metrics.coachIntelligence?.performanceTrendStatus
        ? { performanceTrend: args.metrics.coachIntelligence.performanceTrendStatus }
        : {}),
      anchors,
    },
    coverage: {
      windowDays: args.metrics.movementCoverage?.volumeWindowDays ?? 7,
      movementPatterns: (args.metrics.movementCoverage?.entries ?? []).map((entry) => ({
        family: entry.family,
        label: entry.label,
        status: entry.status,
        effectiveSets: entry.effectiveSets7d,
        controlExposures: entry.controlExposures7d,
        sessions: entry.sessionCount7d,
        roleBreakdown: (entry.contributingExercises ?? []).reduce<Partial<Record<TrainingRole | "untagged", number>>>((totals, exercise) => {
          const role = roleByExerciseName.get(nameKey(exercise.exerciseName)) ?? "untagged";
          totals[role] = Math.round(((totals[role] ?? 0) + exercise.effectiveSets) * 10) / 10;
          return totals;
        }, {}),
      })),
    },
    trainingRoles,
    strengthConsistency: {
      currentWeekToDateSessions: trainingExposure.windows.currentWeekToDate.completedStrengthSessions,
      previousCompleteWeekSessions: trainingExposure.windows.previousCompleteWeek.completedStrengthSessions,
      rolling14DaySessions: trainingExposure.windows.rolling14Days.completedStrengthSessions,
      ...(trainingExposure.latestCompletedStrengthSessionAt != null
        ? {
            latestCompletedStrengthSessionAt: trainingExposure.latestCompletedStrengthSessionAt,
            daysSinceLastCompletedStrengthSession: localCalendarDayDifference(args.asOf, trainingExposure.latestCompletedStrengthSessionAt),
          }
        : {}),
    },
    goals: {
      ...(args.metrics.goalProgress?.status ? { trajectory: args.metrics.goalProgress.status } : {}),
      targets: (args.metrics.goalProgress?.rows ?? []).map((row) => ({
        label: row.label,
        current: row.current,
        target: row.target,
        unit: row.unit,
      })),
    },
    constraints: [...new Set(constraints)],
    exerciseProgression: args.metrics.recentExerciseProgression ?? [],
    strengthGoalProgress: args.metrics.strengthGoalProgress ?? [],
    intendedWeeklySchedule: args.metrics.intendedWeeklySchedule,
    trainingExposure,
    ...(cardio ? { cardio } : {}),
  };
}
