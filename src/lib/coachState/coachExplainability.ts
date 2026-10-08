import type {
  CoachEvidenceFreshness,
  CoachEvidenceItem,
  CoachExplanation,
  CoachState,
  CoachStateStrengthAnchor,
} from "./coachStateTypes";

const MATERIAL_STRENGTH_CHANGE = 0.05;
const MATERIAL_WEIGHT_CHANGE_LB = 1;
const MATERIAL_WAIST_CHANGE_IN = 0.25;
const MATERIAL_CARDIO_COUNT_CHANGE = 2;

export type PersistedCoachComparisonSnapshot = {
  schemaVersion: 1;
  savedAt: string;
  snapshotStatus?: string;
  strength?: {
    signal?: number;
    benchmarkFreshness?: CoachEvidenceFreshness;
  };
  body?: {
    weightTrend14d?: number;
    waistIn?: number;
  };
  cardio?: {
    activities7d?: number;
  };
};

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function evidenceConfidence(value: string | undefined): "high" | "medium" | "low" {
  if (value === "high") return "high";
  if (value === "moderate" || value === "medium") return "medium";
  return "low";
}

export function getBenchmarkFreshness(anchor?: CoachStateStrengthAnchor): CoachEvidenceFreshness {
  if (!anchor) return "unknown";
  if (anchor.recency === "recent") return "fresh";
  if (anchor.recency === "historical") return "aging";
  if (anchor.recency === "stale" || anchor.isStale) return "stale";
  if (!finite(anchor.ageDays)) return "unknown";
  if (anchor.ageDays <= 21) return "fresh";
  if (anchor.ageDays <= 28) return "aging";
  return "stale";
}

function buildEvidence(state: CoachState): CoachEvidenceItem[] {
  const evidence: CoachEvidenceItem[] = [];
  const anchor = state.strength.anchors?.[0];
  const benchmarkFreshness = getBenchmarkFreshness(anchor);
  if (anchor) {
    evidence.push({
      id: "strength-benchmark",
      label: "Strength benchmark",
      value: [anchor.exerciseName ?? anchor.trackDisplayName, finite(anchor.ageDays) ? `${anchor.ageDays}d old` : undefined]
        .filter(Boolean)
        .join(" · "),
      freshness: benchmarkFreshness,
      confidence: benchmarkFreshness === "fresh" ? "high" : benchmarkFreshness === "aging" ? "medium" : "low",
      note: anchor.interpretation ?? undefined,
    });
  }

  if (finite(state.strength.strengthSignalCurrent)) {
    const delta = state.strength.strengthSignalDelta14d;
    evidence.push({
      id: "strength-signal",
      label: "Strength signal",
      value: state.strength.strengthSignalCurrent.toFixed(2),
      direction: finite(delta)
        ? delta >= MATERIAL_STRENGTH_CHANGE
          ? "up"
          : delta <= -MATERIAL_STRENGTH_CHANGE
            ? "down"
            : "flat"
        : undefined,
      confidence: anchor ? (benchmarkFreshness === "fresh" ? "high" : benchmarkFreshness === "aging" ? "medium" : "low") : "low",
    });
  }

  const cardioCount = state.cardio.walkCount7d ?? 0;
  evidence.push({
    id: "cardio",
    label: "Cardio",
    value: state.cardio.available ? `${cardioCount} activities in 7d` : "Unavailable",
    freshness: cardioCount > 0 ? "fresh" : (state.cardio.walkCount28d ?? 0) > 0 ? "aging" : state.cardio.available ? "stale" : "unknown",
    confidence: cardioCount >= 4 ? "high" : cardioCount >= 2 ? "medium" : "low",
    note: state.cardio.note,
  });

  const bodyConfidence = state.body.confidence?.overall;
  evidence.push({
    id: "body-composition",
    label: "Body composition",
    value: finite(state.body.latestWeightLb) ? `${state.body.latestWeightLb.toFixed(1)} lb` : "Unavailable",
    freshness: "unknown",
    confidence: evidenceConfidence(bodyConfidence),
    note: state.body.confidence?.cautionFlags?.[0],
  });

  const targetCount = state.goals.targets?.length ?? 0;
  evidence.push({
    id: "goal-trajectory",
    label: "Goal trajectory",
    value: state.goals.trajectoryStatus,
    freshness: "unknown",
    confidence: targetCount >= 2 ? "high" : targetCount === 1 ? "medium" : "low",
  });

  return evidence;
}

export function buildCoachExplanation(state: CoachState): CoachExplanation {
  const why = [
    state.snapshot.narrative,
    state.snapshot.biggestWin ? `Biggest win: ${state.snapshot.biggestWin}` : undefined,
    state.snapshot.biggestRisk ? `Attention: ${state.snapshot.biggestRisk}` : undefined,
    state.snapshot.todayFocus ? `Today: ${state.snapshot.todayFocus}` : undefined,
  ].filter((item): item is string => Boolean(item));

  return { why, whatChanged: [], evidence: buildEvidence(state), comparisonAvailable: false };
}

export function buildPersistedCoachComparisonSnapshot(state: CoachState): PersistedCoachComparisonSnapshot {
  const generatedAt = typeof state.generatedAt === "number" ? state.generatedAt : Date.parse(state.generatedAt);
  return {
    schemaVersion: 1,
    savedAt: new Date(Number.isFinite(generatedAt) ? generatedAt : 0).toISOString(),
    snapshotStatus: state.snapshot.overallStatus,
    strength: {
      ...(finite(state.strength.strengthSignalCurrent) ? { signal: state.strength.strengthSignalCurrent } : {}),
      benchmarkFreshness: getBenchmarkFreshness(state.strength.anchors?.[0]),
    },
    body: {
      ...(finite(state.body.weightDelta14dLb) ? { weightTrend14d: state.body.weightDelta14dLb } : {}),
      ...(finite(state.body.latestWaistIn) ? { waistIn: state.body.latestWaistIn } : {}),
    },
    cardio: {
      ...(finite(state.cardio.walkCount7d) ? { activities7d: state.cardio.walkCount7d } : {}),
    },
  };
}

function comparisonSnapshot(prior: CoachState | PersistedCoachComparisonSnapshot): PersistedCoachComparisonSnapshot {
  return "schemaVersion" in prior ? prior : buildPersistedCoachComparisonSnapshot(prior);
}

export function buildCoachWhatChanged(
  current: CoachState,
  prior?: CoachState | PersistedCoachComparisonSnapshot | null,
): string[] {
  if (!prior) return [];
  const priorSnapshot = comparisonSnapshot(prior);
  const changes: string[] = [];
  const strengthChange = finite(current.strength.strengthSignalCurrent) && finite(priorSnapshot.strength?.signal)
    ? current.strength.strengthSignalCurrent - priorSnapshot.strength.signal
    : undefined;
  if (finite(strengthChange) && Math.abs(strengthChange) >= MATERIAL_STRENGTH_CHANGE) {
    changes.push(`Strength Signal ${strengthChange > 0 ? "improved" : "declined"} ${strengthChange > 0 ? "+" : ""}${strengthChange.toFixed(2)}.`);
  }

  const weightChange = finite(current.body.weightDelta14dLb) && finite(priorSnapshot.body?.weightTrend14d)
    ? current.body.weightDelta14dLb - priorSnapshot.body.weightTrend14d
    : undefined;
  if (finite(weightChange) && Math.abs(weightChange) >= MATERIAL_WEIGHT_CHANGE_LB) {
    changes.push(`14-day weight trend ${weightChange < 0 ? "accelerated downward" : "moved upward"} by ${Math.abs(weightChange).toFixed(1)} lb.`);
  }

  const waistChange = finite(current.body.latestWaistIn) && finite(priorSnapshot.body?.waistIn)
    ? current.body.latestWaistIn - priorSnapshot.body.waistIn
    : undefined;
  if (finite(waistChange) && Math.abs(waistChange) >= MATERIAL_WAIST_CHANGE_IN) {
    changes.push(`Waist ${waistChange < 0 ? "decreased" : "increased"} ${Math.abs(waistChange).toFixed(1)} in.`);
  }

  const cardioChange = finite(current.cardio.walkCount7d) && finite(priorSnapshot.cardio?.activities7d)
    ? current.cardio.walkCount7d - priorSnapshot.cardio.activities7d
    : undefined;
  if (finite(cardioChange) && Math.abs(cardioChange) >= MATERIAL_CARDIO_COUNT_CHANGE) {
    changes.push(`Cardio consistency ${cardioChange > 0 ? "increased" : "decreased"} by ${Math.abs(cardioChange)} activities in the 7-day window.`);
  }

  const currentFreshness = getBenchmarkFreshness(current.strength.anchors?.[0]);
  const priorFreshness = priorSnapshot.strength?.benchmarkFreshness ?? "unknown";
  if (currentFreshness !== priorFreshness && currentFreshness !== "unknown" && priorFreshness !== "unknown") {
    changes.push(`Strength benchmark freshness changed from ${priorFreshness} to ${currentFreshness}.`);
  }
  return changes;
}

export function withCoachStateComparison(
  current: CoachState,
  prior?: CoachState | PersistedCoachComparisonSnapshot | null,
): CoachState {
  return {
    ...current,
    explanation: {
      ...current.explanation,
      whatChanged: buildCoachWhatChanged(current, prior),
      comparisonAvailable: Boolean(prior),
    },
  };
}
