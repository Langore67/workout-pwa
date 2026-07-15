import type { CardioWalkSummary } from "../cardio/cardioTypes";
import type { CoachIntelligence } from "../coachExport/coachIntelligence";
import type { CoachExportMetrics } from "../coachExport/types";
import type {
  CoachState,
  CoachStateConfidence,
  CoachStateOverallStatus,
  CoachStateStrengthAnchor,
} from "./coachStateTypes";

function mapConfidence(value: string | undefined | null): CoachStateConfidence {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "high") return "high";
  if (normalized === "moderate" || normalized === "medium") return "moderate";
  return "low";
}

function mapOverallStatus(value: CoachIntelligence["overallStatus"] | undefined): CoachStateOverallStatus {
  if (value === "On Track") return "solid";
  if (value === "Watch") return "watch";
  if (value === "Intervene") return "intervene";
  return "not_enough_data";
}

function firstDefined(values: Array<string | null | undefined>): string | undefined {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return undefined;
}

function buildCardioState(cardioSummary?: CardioWalkSummary | null) {
  if (!cardioSummary) {
    return {
      available: false,
      status: "not_enough_data",
    } as const;
  }

  const hasWalkHistory = (cardioSummary.normalizedWalks?.length ?? 0) > 0;
  const recentCount = cardioSummary.last7d.count;
  const recent28dCount = cardioSummary.last28d.count;
  const status: CoachState["cardio"]["status"] = !hasWalkHistory
    ? "not_enough_data"
    : recentCount >= 4 || recent28dCount >= 8
      ? "solid"
      : "watch";

  const recentWalk = cardioSummary.recentWalks?.[0];
  const recent =
    recentWalk && Number.isFinite(recentWalk.startedAt)
      ? {
          sessionId: recentWalk.sessionId,
          name: recentWalk.name,
          startedAt: recentWalk.startedAt,
          durationSeconds: recentWalk.durationSeconds,
          distanceMeters: recentWalk.distanceMeters,
          paceSecondsPerMile: recentWalk.paceSecondsPerMile,
        }
      : undefined;

  const note = hasWalkHistory
    ? recentCount > 0
      ? `${recentCount} walk${recentCount === 1 ? "" : "s"} in the last 7 days.`
      : recent28dCount > 0
        ? `${recent28dCount} walk${recent28dCount === 1 ? "" : "s"} in the last 28 days.`
        : `${cardioSummary.normalizedWalks.length} walk${cardioSummary.normalizedWalks.length === 1 ? "" : "s"} in history.`
    : undefined;

  return {
    available: hasWalkHistory,
    status,
    note,
    recent,
    walkCount7d: cardioSummary.last7d.count,
    totalDuration7dSeconds: cardioSummary.last7d.totalDurationSeconds,
    totalDistance7dMeters: cardioSummary.last7d.totalDistanceMeters,
    walkCount28d: cardioSummary.last28d.count,
    totalDuration28dSeconds: cardioSummary.last28d.totalDurationSeconds,
    totalDistance28dMeters: cardioSummary.last28d.totalDistanceMeters,
    averagePace7dSecondsPerMile: cardioSummary.last7d.averagePaceSecondsPerMile,
  } as const;
}

function buildStrengthAnchors(metrics: CoachExportMetrics): CoachStateStrengthAnchor[] {
  return (metrics.anchorLifts ?? []).map((lift) => ({
    pattern: lift.pattern,
    exerciseName: lift.exerciseName,
    trackDisplayName: lift.trackDisplayName,
    effectiveWeightLb: lift.effectiveWeightLb,
    reps: lift.reps,
    e1rm: lift.e1rm,
    performedAt: lift.performedAt,
    ageDays: lift.ageDays,
    recency: lift.recency,
    isStale: lift.isStale,
    movementFamily: lift.movementFamily,
    status: lift.status,
    currentMovement: lift.currentMovement
      ? {
          exerciseName: lift.currentMovement.exerciseName,
          movementFamily: lift.currentMovement.movementFamily,
          performedAt: lift.currentMovement.performedAt,
          ageDays: lift.currentMovement.ageDays,
        }
      : undefined,
    relationship: lift.relationship,
    interpretation: lift.interpretation ?? undefined,
  }));
}

export function buildCoachStateFromExportMetrics(metrics: CoachExportMetrics | null | undefined): CoachState {
  const source = metrics ?? ({} as CoachExportMetrics);
  const intelligence = source.coachIntelligence ?? null;
  const cardioSummary = source.cardioSummary;
  const goalProgress = source.goalProgress ?? null;
  const coachingMemory = source.coachingMemory ?? null;
  const nextWorkoutFocus = source.nextWorkoutFocus ?? null;
  const trainingVolume = source.weeklyVolume ?? undefined;

  const todayFocus = firstDefined([
    intelligence?.recommendations?.[0],
    nextWorkoutFocus?.progressionGuardrails?.[0],
    nextWorkoutFocus?.executionPriorities?.[0],
    nextWorkoutFocus?.adjustmentTriggers?.[0],
    intelligence?.biggestRisk ?? undefined,
    intelligence?.summary ?? undefined,
  ]);

  return {
    generatedAt: source.generatedAt ?? 0,
    snapshot: {
      overallStatus: mapOverallStatus(intelligence?.overallStatus),
      confidence: mapConfidence(intelligence?.confidence),
      narrative: intelligence?.summary ?? undefined,
      biggestWin: intelligence?.biggestWin ?? undefined,
      biggestRisk: intelligence?.biggestRisk ?? undefined,
      todayFocus,
    },
    body: {
      confidence: source.bodyConfidence,
      latestWeightLb: source.bodyComp?.weight?.latest ?? undefined,
      weightDelta14dLb: source.bodyComp?.weight?.delta14d ?? undefined,
      latestWaistIn: source.bodyComp?.waist?.latest ?? undefined,
      waistDelta14dIn: source.bodyComp?.waist?.delta14d ?? undefined,
      latestBodyFatPct: source.bodyComp?.bodyFatPct?.latest ?? undefined,
      latestLeanMassLb: source.bodyComp?.leanMass?.latest ?? undefined,
      whtr: source.bodyComp?.waistToHeight
        ? {
            current: source.bodyComp.waistToHeight.latest ?? undefined,
            status: source.bodyComp.waistToHeight.status,
            distanceToThresholdIn: source.bodyComp.waistToHeight.distanceToThresholdIn ?? undefined,
          }
        : undefined,
    },
    strength: {
      performanceTrend: intelligence?.performanceTrendStatus,
      movementQuality: intelligence?.movementQualityStatus,
      strengthSignalCurrent: source.strengthSignal?.current ?? undefined,
      strengthSignalDelta14d: source.strengthSignal?.delta14d ?? undefined,
      strengthSignalVsBestPct: source.strengthSignal?.vs90dBestPct ?? undefined,
      anchors: buildStrengthAnchors(source),
    },
    cardio: buildCardioState(cardioSummary),
    goals: {
      trajectoryStatus: goalProgress?.status,
      targets: goalProgress?.rows ?? [],
    },
    learnings: {
      validated: coachingMemory?.validatedLearnings?.map((item) => item.text) ?? [],
      watchItems: coachingMemory?.activeWatchItems?.map((item) => item.text) ?? [],
      resolved: coachingMemory?.resolvedItems?.map((item) => item.text) ?? [],
    },
    trainingVolume,
    export: {
      available: metrics != null,
      sourceMetrics: metrics ?? undefined,
    },
  };
}
