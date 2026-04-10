import type { TrackType, TrackingMode } from "../../db";
import { isStrengthTrackType } from "../trackingMode";
import {
  buildWeightedRepsProgressionPlan,
  type BestSetLike,
} from "../../progression";
import { computeE1RM } from "../../strength/Strength";

export type WorkingRecommendation = {
  targetWeight: number | null;
  targetReps: number | null;
  action: "increase" | "hold" | "reduce" | "rebuild";
  confidence: "low" | "medium" | "high";
  rationale: string;
};

export type RecentWorkingRecommendationSet = {
  weight?: number;
  reps?: number;
  rir?: number;
  completed: boolean;
  timestamp: number;
};

export function getNextWorkingRecommendation(params: {
  trackId: string;
  trackType: TrackType;
  trackingMode: TrackingMode;
  recentSets: RecentWorkingRecommendationSet[];
  bodyweight?: number | null;
  repMin?: number | null;
  repMax?: number | null;
  weightJump?: number | null;
  roundingStep?: number | null;
  rirTargetMin?: number | null;
}): WorkingRecommendation {
  if (!params.trackId) {
    return {
      targetWeight: null,
      targetReps: null,
      action: "rebuild",
      confidence: "low",
      rationale: "Missing track id — no recommendation applied",
    };
  }

  if (!isStrengthTrackType(params.trackType)) {
    return {
      targetWeight: null,
      targetReps: null,
      action: "hold",
      confidence: "low",
      rationale: "Non-strength track — no progression applied",
    };
  }

  if (params.trackingMode !== "weightedReps") {
    return {
      targetWeight: null,
      targetReps: null,
      action: "hold",
      confidence: "low",
      rationale: "Non-weighted track mode — no load progression applied",
    };
  }

  const completedWeightedSets = (params.recentSets ?? [])
    .filter((set) => set?.completed)
    .map((set) => ({
      weight: typeof set.weight === "number" && Number.isFinite(set.weight) ? set.weight : null,
      reps: typeof set.reps === "number" && Number.isFinite(set.reps) ? set.reps : null,
      timestamp:
        typeof set.timestamp === "number" && Number.isFinite(set.timestamp) ? set.timestamp : 0,
    }))
    .filter(
      (set): set is { weight: number; reps: number; timestamp: number } =>
        set.weight != null && set.reps != null && set.reps > 0
    );

  const best: BestSetLike | null =
    completedWeightedSets
      .slice()
      .sort((a, b) => {
        const e1Diff = computeE1RM(b.weight, b.reps) - computeE1RM(a.weight, a.reps);
        if (e1Diff !== 0) return e1Diff;
        return b.timestamp - a.timestamp;
      })
      .map((set) => ({
        bestWeight: set.weight,
        bestReps: set.reps,
        endedAt: set.timestamp > 0 ? set.timestamp : undefined,
      } satisfies BestSetLike))[0] ?? null;

  const plan = buildWeightedRepsProgressionPlan({
    best,
    repMin: params.repMin ?? undefined,
    repMax: params.repMax ?? undefined,
    weightJump: params.weightJump ?? undefined,
    roundStep: params.roundingStep ?? undefined,
    rirTargetMin: params.rirTargetMin ?? undefined,
  });

  const completedSetCount = completedWeightedSets.length;
  const confidence =
    plan.action === "rebuild"
      ? "low"
      : completedSetCount >= 3
        ? "high"
        : completedSetCount >= 1
          ? "medium"
          : "low";

  return {
    targetWeight: plan.targetWeight,
    targetReps: plan.targetReps,
    action: plan.action,
    confidence,
    rationale: plan.rationale,
  };
}
