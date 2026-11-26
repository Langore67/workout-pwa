import type { Exercise, Session, SetEntry, Track } from "../db";
import {
  buildExerciseProgressionContext,
  EXERCISE_PROGRESSION_LOOKBACK_DAYS,
  type ExerciseProgressionContext,
} from "../domain/progression/exerciseProgressionContext";
import type { StrengthIndexResult, StrengthPattern, StrengthTrendRow } from "./Strength";
import type { CoachExportAnchorLift } from "../lib/coachExport/types";

const DAY_MS = 24 * 60 * 60 * 1000;
const COMPARISON_POINTS = 4;
const STRENGTH_PATTERNS: StrengthPattern[] = ["squat", "hinge", "push", "pull"];

export type StrengthSnapshotPatternEvidence = {
  pattern: StrengthPattern;
  covered: boolean;
  contributingExerciseIds: string[];
  qualifyingWorkingSetCount: number;
  hardSetCount: number;
  exposure: number;
  absoluteScore: number;
  normalizedScore: number;
};

export type StrengthSnapshotPopulationEvidence = {
  snapshotAt: number;
  windowStartAt: number;
  windowEndAt: number;
  windowDays: number;
  bodyweightLb: number;
  bodyweightDaysUsed: number;
  absoluteIndex: number;
  normalizedIndex: number;
  patterns: StrengthSnapshotPatternEvidence[];
};

export type StrengthExerciseEvidenceStatus =
  | "direct_comparable"
  | "insufficient"
  | "stale"
  | "missing";

export type StrengthExerciseComparabilityEvidence = {
  status: StrengthExerciseEvidenceStatus;
  canonicalExerciseId: string;
  canonicalExerciseName: string;
  metricMode: ExerciseProgressionContext["metricMode"] | null;
  direction: ExerciseProgressionContext["direction"];
  observationCount: number;
  latestObservationAt?: number;
  freshness: "current" | "recent" | "stale" | "missing";
  /** Existing comparator output, newest first; prior observations remain explicit evidence. */
  observations: ExerciseProgressionContext["recentObservations"];
  limitations: string[];
};

export type StrengthComparabilityEvidence = {
  strengthSignalSnapshots?: {
    current: StrengthSnapshotPopulationEvidence;
    prior14d: StrengthSnapshotPopulationEvidence;
    best90d: StrengthSnapshotPopulationEvidence | null;
  };
  aggregate: {
    baseline: StrengthSnapshotPopulationEvidence;
    recent: StrengthSnapshotPopulationEvidence;
    normalizedDelta: number;
    comparedWeeklyPoints: number;
  } | null;
  populationChange: {
    exercisesEntering: string[];
    exercisesLeaving: string[];
    sharedExerciseIds: string[];
    patternsEntering: StrengthPattern[];
    patternsLeaving: StrengthPattern[];
    patternChanges: Array<{
      pattern: StrengthPattern;
      baselineQualifyingWorkingSets: number;
      recentQualifyingWorkingSets: number;
      baselineExposure: number;
      recentExposure: number;
    }>;
    baselineBodyweightLb: number;
    recentBodyweightLb: number;
    bodyweightDeltaLb: number;
  } | null;
  exerciseEvidence: StrengthExerciseComparabilityEvidence[];
  anchorRelationships: Array<{
    exerciseId: string | null;
    exerciseName: string | null;
    benchmarkStatus: CoachExportAnchorLift["benchmarkStatus"];
    movementStatus: CoachExportAnchorLift["movementStatus"];
    relationship: CoachExportAnchorLift["relationship"];
    currentFamilyExerciseName?: string;
    interpretation?: string;
  }>;
  limitations: string[];
};

export type ComparableStrengthState =
  | "improving"
  | "maintained"
  | "declining"
  | "mixed_evidence"
  | "insufficient_comparable_evidence";

export type ComparableStrengthAssessment = {
  state: ComparableStrengthState;
  /** Scope is deliberately a sample; this model never asserts whole-program representativeness. */
  evidenceScope: "none" | "single_exercise" | "multiple_exercise_sample";
  wholeProgramConclusion: "not_established";
  directComparableExerciseCount: number;
  directionCounts: { higher: number; similar: number; lower: number };
  staleExerciseNames: string[];
  insufficientExerciseNames: string[];
  missingExerciseNames: string[];
  limitations: string[];
};

function positive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function snapshotEvidence(row: StrengthTrendRow | StrengthIndexResult): StrengthSnapshotPopulationEvidence {
  const isTrend = "weekEndMs" in row;
  const patternByName = new Map((row.patterns ?? []).map((pattern) => [pattern.pattern, pattern]));
  return {
    snapshotAt: isTrend ? row.weekEndMs : row.snapshotAt,
    windowStartAt: row.windowStartAt,
    windowEndAt: isTrend ? row.weekEndMs : row.snapshotAt,
    windowDays: row.windowDays,
    bodyweightLb: row.bodyweight,
    bodyweightDaysUsed: row.bodyweightDaysUsed,
    absoluteIndex: row.absoluteIndex,
    normalizedIndex: row.normalizedIndex,
    patterns: STRENGTH_PATTERNS.map((patternName) => {
      const pattern = patternByName.get(patternName);
      return {
        pattern: patternName,
        covered: (pattern?.completedWorkingSets ?? 0) > 0,
        contributingExerciseIds: (pattern?.exerciseIds ?? []).slice().sort(),
        qualifyingWorkingSetCount: pattern?.completedWorkingSets ?? 0,
        hardSetCount: pattern?.hardSets ?? 0,
        exposure: pattern?.exposure ?? 0,
        absoluteScore: pattern?.absolute ?? 0,
        normalizedScore: pattern?.normalized ?? 0,
      };
    }),
  };
}

function allExerciseIds(snapshot: StrengthSnapshotPopulationEvidence): Set<string> {
  return new Set(snapshot.patterns.flatMap((pattern) => pattern.contributingExerciseIds));
}

function deriveExerciseEvidence(args: {
  exerciseId: string;
  exercises: readonly Exercise[];
  tracks: readonly Track[];
  sessions: readonly Session[];
  sets: readonly SetEntry[];
  asOf: number;
}): StrengthExerciseComparabilityEvidence | null {
  const current = buildExerciseProgressionContext({
    ...args,
    lookbackDays: EXERCISE_PROGRESSION_LOOKBACK_DAYS,
  });
  if (!current) return null;

  let status: StrengthExerciseEvidenceStatus;
  let freshness: StrengthExerciseComparabilityEvidence["freshness"];
  let latestObservationAt = current.latestObservationAt;
  let limitations = current.limitations.slice();

  if (current.observationCount > 0 && current.direction !== "insufficient_context") {
    status = "direct_comparable";
    const ageDays = latestObservationAt == null ? Infinity : Math.floor(Math.max(0, (args.asOf - latestObservationAt) / DAY_MS));
    freshness = ageDays <= 7 ? "current" : "recent";
  } else if (current.observationCount > 0) {
    status = "insufficient";
    freshness = "recent";
  } else {
    const completedSessionTimes = (args.sessions ?? [])
      .map((session) => session.endedAt)
      .filter(positive);
    const earliest = completedSessionTimes.length ? Math.min(...completedSessionTimes) : null;
    const historyDays = earliest == null
      ? EXERCISE_PROGRESSION_LOOKBACK_DAYS
      : Math.max(EXERCISE_PROGRESSION_LOOKBACK_DAYS, Math.ceil((args.asOf - earliest) / DAY_MS) + 1);
    const historical = historyDays > EXERCISE_PROGRESSION_LOOKBACK_DAYS
      ? buildExerciseProgressionContext({
          ...args,
          lookbackDays: historyDays,
          maxObservations: 1,
        })
      : null;
    if (historical?.observationCount) {
      status = "stale";
      freshness = "stale";
      latestObservationAt = historical.latestObservationAt;
      limitations = historical.limitations.slice();
      limitations.unshift("No comparable observation is present in the current 28-day progression window.");
    } else {
      status = "missing";
      freshness = "missing";
    }
  }

  if (current.observationCount > 0 && current.direction === "insufficient_context") {
    status = "insufficient";
    freshness = "recent";
  }

  return {
    status,
    canonicalExerciseId: current.exerciseId,
    canonicalExerciseName: current.exerciseName,
    metricMode: current.metricMode,
    direction: current.direction,
    observationCount: current.observationCount,
    latestObservationAt,
    freshness,
    observations: current.recentObservations,
    limitations,
  };
}

/**
 * Builds non-persisted evidence from already-computed Strength Signal snapshots and the
 * canonical exercise progression comparator. It never calculates or changes a score.
 */
export function buildStrengthComparabilityEvidence(args: {
  trend: readonly StrengthTrendRow[];
  exercises: readonly Exercise[];
  tracks: readonly Track[];
  sessions: readonly Session[];
  sets: readonly SetEntry[];
  anchors?: readonly CoachExportAnchorLift[];
  strengthSignalSnapshots?: {
    current: StrengthIndexResult;
    prior14d: StrengthIndexResult;
    best90d: StrengthTrendRow | null;
  };
  asOf: number;
}): StrengthComparabilityEvidence {
  const ordered = (args.trend ?? [])
    .filter((row) => Number.isFinite(row.weekEndMs) && Number.isFinite(row.normalizedIndex))
    .slice()
    .sort((a, b) => a.weekEndMs - b.weekEndMs);
  const selected = ordered.slice(-COMPARISON_POINTS);
  const baselineRow = selected[0];
  const recentRow = selected[selected.length - 1];
  const baseline = baselineRow ? snapshotEvidence(baselineRow) : null;
  const recent = recentRow ? snapshotEvidence(recentRow) : null;
  const aggregate = baseline && recent
    ? {
        baseline,
        recent,
        normalizedDelta: recent.normalizedIndex - baseline.normalizedIndex,
        comparedWeeklyPoints: selected.length,
      }
    : null;

  const populationChange = baseline && recent
    ? (() => {
        const before = allExerciseIds(baseline);
        const after = allExerciseIds(recent);
        const baselinePatterns = new Map(baseline.patterns.map((pattern) => [pattern.pattern, pattern]));
        const recentPatterns = new Map(recent.patterns.map((pattern) => [pattern.pattern, pattern]));
        const patterns = Array.from(new Set([...baselinePatterns.keys(), ...recentPatterns.keys()])) as StrengthPattern[];
        return {
          exercisesEntering: Array.from(after).filter((id) => !before.has(id)).sort(),
          exercisesLeaving: Array.from(before).filter((id) => !after.has(id)).sort(),
          sharedExerciseIds: Array.from(after).filter((id) => before.has(id)).sort(),
          patternsEntering: patterns.filter((pattern) => !baselinePatterns.get(pattern)?.covered && !!recentPatterns.get(pattern)?.covered),
          patternsLeaving: patterns.filter((pattern) => !!baselinePatterns.get(pattern)?.covered && !recentPatterns.get(pattern)?.covered),
          patternChanges: patterns.map((pattern) => ({
            pattern,
            baselineQualifyingWorkingSets: baselinePatterns.get(pattern)?.qualifyingWorkingSetCount ?? 0,
            recentQualifyingWorkingSets: recentPatterns.get(pattern)?.qualifyingWorkingSetCount ?? 0,
            baselineExposure: baselinePatterns.get(pattern)?.exposure ?? 0,
            recentExposure: recentPatterns.get(pattern)?.exposure ?? 0,
          })),
          baselineBodyweightLb: baseline.bodyweightLb,
          recentBodyweightLb: recent.bodyweightLb,
          bodyweightDeltaLb: recent.bodyweightLb - baseline.bodyweightLb,
        };
      })()
    : null;

  const relevantIds = new Set([
    ...(baseline ? Array.from(allExerciseIds(baseline)) : []),
    ...(recent ? Array.from(allExerciseIds(recent)) : []),
    ...(args.anchors ?? []).map((anchor) => String(anchor.exerciseId ?? "").trim()).filter(Boolean),
  ]);
  const exerciseEvidence = Array.from(relevantIds)
    .sort()
    .map((exerciseId) => {
      const evidence = deriveExerciseEvidence({ ...args, exerciseId });
      if (evidence) return evidence;
      const anchor = (args.anchors ?? []).find((item) => item.exerciseId === exerciseId);
      return {
        status: "missing" as const,
        canonicalExerciseId: exerciseId,
        canonicalExerciseName: anchor?.exerciseName ?? "Unknown exercise",
        metricMode: null,
        direction: "insufficient_context" as const,
        observationCount: 0,
        freshness: "missing" as const,
        observations: [],
        limitations: ["No canonical exercise record is available for direct progression comparison."],
      };
    });

  const limitations: string[] = [];
  if (!aggregate) limitations.push("Fewer than two weekly aggregate snapshots are available for comparison.");
  if (aggregate && (populationChange?.exercisesEntering.length || populationChange?.exercisesLeaving.length)) {
    limitations.push("The contributing exercise population differs between the selected aggregate snapshots; this documents a comparability limitation, not a cause.");
  }
  if (aggregate && (populationChange?.patternsEntering.length || populationChange?.patternsLeaving.length)) {
    limitations.push("Movement-pattern coverage differs between the selected aggregate snapshots.");
  }
  if (aggregate && populationChange?.bodyweightDeltaLb !== 0) {
    limitations.push("The bodyweight normalization input differs between the selected aggregate snapshots.");
  }

  return {
    strengthSignalSnapshots: args.strengthSignalSnapshots
      ? {
          current: snapshotEvidence(args.strengthSignalSnapshots.current),
          prior14d: snapshotEvidence(args.strengthSignalSnapshots.prior14d),
          best90d: args.strengthSignalSnapshots.best90d
            ? snapshotEvidence(args.strengthSignalSnapshots.best90d)
            : null,
        }
      : undefined,
    aggregate,
    populationChange,
    exerciseEvidence,
    anchorRelationships: (args.anchors ?? []).map((anchor) => ({
      exerciseId: anchor.exerciseId ?? null,
      exerciseName: anchor.exerciseName ?? null,
      benchmarkStatus: anchor.benchmarkStatus,
      movementStatus: anchor.movementStatus,
      relationship: anchor.relationship,
      currentFamilyExerciseName: anchor.latestFamilyMovement?.exerciseName,
      interpretation: anchor.interpretation ?? undefined,
    })),
    limitations,
  };
}

/**
 * Summarizes only existing direct, fresh exercise comparisons. This is directional
 * evidence reporting—not voting: every distinct direction remains visible, and the
 * result is never promoted to a whole-program conclusion.
 */
export function assessComparableStrengthEvidence(
  evidence: StrengthComparabilityEvidence | null | undefined
): ComparableStrengthAssessment {
  const exercises = evidence?.exerciseEvidence ?? [];
  const direct = exercises.filter((item) =>
    item.status === "direct_comparable" &&
    (item.freshness === "current" || item.freshness === "recent") &&
    (item.direction === "higher" || item.direction === "similar" || item.direction === "lower")
  );
  const directionCounts = {
    higher: direct.filter((item) => item.direction === "higher").length,
    similar: direct.filter((item) => item.direction === "similar").length,
    lower: direct.filter((item) => item.direction === "lower").length,
  };
  const directions = [
    directionCounts.higher > 0 ? "improving" : null,
    directionCounts.similar > 0 ? "maintained" : null,
    directionCounts.lower > 0 ? "declining" : null,
  ].filter((direction): direction is "improving" | "maintained" | "declining" => direction !== null);
  const state: ComparableStrengthState = directions.length === 0
    ? "insufficient_comparable_evidence"
    : directions.length > 1
      ? "mixed_evidence"
      : directions[0];
  const evidenceScope: ComparableStrengthAssessment["evidenceScope"] = direct.length === 0
    ? "none"
    : direct.length === 1
      ? "single_exercise"
      : "multiple_exercise_sample";
  const staleExerciseNames = exercises.filter((item) => item.status === "stale").map((item) => item.canonicalExerciseName).sort();
  const insufficientExerciseNames = exercises.filter((item) => item.status === "insufficient").map((item) => item.canonicalExerciseName).sort();
  const missingExerciseNames = exercises.filter((item) => item.status === "missing").map((item) => item.canonicalExerciseName).sort();
  const limitations = [...(evidence?.limitations ?? [])];
  if (staleExerciseNames.length) limitations.push(`${staleExerciseNames.length} exercise comparison${staleExerciseNames.length === 1 ? " is" : "s are"} stale and cannot establish current performance.`);
  if (insufficientExerciseNames.length) limitations.push(`${insufficientExerciseNames.length} exercise comparison${insufficientExerciseNames.length === 1 ? " has" : "s have"} insufficient comparable observations.`);
  if (missingExerciseNames.length) limitations.push(`${missingExerciseNames.length} exercise${missingExerciseNames.length === 1 ? " has" : "s have"} no available comparable evidence.`);
  if (direct.length) limitations.push("Direct comparisons describe the observed exercise sample; whole-program strength status is not established.");
  if (!direct.length) limitations.push("No fresh direct exercise comparison establishes maintained or declining strength.");

  return {
    state,
    evidenceScope,
    wholeProgramConclusion: "not_established",
    directComparableExerciseCount: direct.length,
    directionCounts,
    staleExerciseNames,
    insufficientExerciseNames,
    missingExerciseNames,
    limitations: Array.from(new Set(limitations)),
  };
}
