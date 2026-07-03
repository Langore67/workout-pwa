import type { BodyConfidence } from "../../body/bodyConfidenceEngine";
import type { CoachExportHydration, CoachExportMetric, CoachExportStrengthSignal } from "./types";

export type LeanPreservationCompositeStatus = "Strong" | "Acceptable" | "Watch" | "Poor";
export type LeanPreservationCompositeConfidence = "High" | "Moderate" | "Low";

export type LeanPreservationComposite = {
  status: LeanPreservationCompositeStatus;
  confidence: LeanPreservationCompositeConfidence;
  rawMetrics: {
    leanMassLatest: number | null;
    leanMassDelta14d: number | null;
  };
  evidence: {
    positive: string[];
    negative: string[];
  };
  coachInterpretation?: string;
};

type BuildLeanPreservationCompositeInput = {
  leanMass: CoachExportMetric;
  weight: CoachExportMetric;
  waist: CoachExportMetric;
  bodyFatPct: CoachExportMetric;
  hydration: CoachExportHydration;
  bodyConfidence?: BodyConfidence;
  strengthSignal: CoachExportStrengthSignal;
  fatigueSignals?: string[];
  recentPerformanceSignals?: string[];
};

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function improveConfidence(confidence: LeanPreservationCompositeConfidence): LeanPreservationCompositeConfidence {
  if (confidence === "Low") return "Moderate";
  if (confidence === "Moderate") return "High";
  return "High";
}

function reduceConfidence(confidence: LeanPreservationCompositeConfidence): LeanPreservationCompositeConfidence {
  if (confidence === "High") return "Moderate";
  if (confidence === "Moderate") return "Low";
  return "Low";
}

function strengthState(delta: number | null): "improving" | "stable" | "slipping" | "declining" | "unknown" {
  if (!finite(delta)) return "unknown";
  if (delta > 0.03) return "improving";
  if (delta >= -0.03) return "stable";
  if (delta >= -0.08) return "slipping";
  return "declining";
}

function direction(delta: number | null, threshold: number): "down" | "flat" | "up" | "unknown" {
  if (!finite(delta)) return "unknown";
  if (delta < -threshold) return "down";
  if (delta > threshold) return "up";
  return "flat";
}

function hydrationIsHigh(hydration: CoachExportHydration): boolean {
  return String(hydration.confidenceLabel ?? "").trim().toLowerCase() === "high";
}

function hydrationIsLow(hydration: CoachExportHydration): boolean {
  const label = String(hydration.confidenceLabel ?? "").trim().toLowerCase();
  return label === "low" || label === "unknown" || hydration.distortionLikely === true;
}

function aggressiveWeightLoss(weight: CoachExportMetric): boolean {
  if (!finite(weight.delta14d)) return false;
  if (weight.delta14d <= -3) return true;
  if (finite(weight.latest) && weight.latest > 0) {
    return weight.delta14d / weight.latest <= -0.015;
  }
  return false;
}

function uniqueEvidence(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const value = String(raw ?? "").replace(/\s+/g, " ").trim();
    if (!value) continue;
    const key = value.toLowerCase().replace(/\bis\b/g, "").replace(/\s+/g, " ").trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function recentPerformanceState(
  signals: string[] | undefined
): "positive" | "mixedPositive" | "negative" | "unknown" {
  const text = (signals ?? []).join(" ").toLowerCase();
  if (!text.trim()) return "unknown";

  const hasPositive = /\b(pr|personal record|breakthrough|improved|improving|strong|consistent|lat dominance|stretch and contraction|repeatable)\b/.test(text);
  const hasNegative = /\b(pain|twinge|joint feedback|stopped due to|form breakdown|form breaking|terminal-rep|terminal reps|reduced capacity|failed|missed|regress|worse|declin)\b/.test(text);

  if (hasPositive && hasNegative) return "mixedPositive";
  if (hasPositive) return "positive";
  if (hasNegative) return "negative";
  return "unknown";
}

export function buildLeanPreservationComposite(
  input: BuildLeanPreservationCompositeInput
): LeanPreservationComposite | null {
  const leanLatest = finite(input.leanMass.latest) ? input.leanMass.latest : null;
  const leanDelta = finite(input.leanMass.delta14d) ? input.leanMass.delta14d : null;
  if (leanLatest == null && leanDelta == null) return null;

  const strength = strengthState(input.strengthSignal.delta14d);
  const waist = direction(input.waist.delta14d, 0.25);
  const bodyFat = direction(input.bodyFatPct.delta14d, 0.3);
  const leanStable = !finite(leanDelta) || leanDelta >= -0.5;
  const leanModestlyDown = finite(leanDelta) && leanDelta < -0.5 && leanDelta >= -1.5;
  const leanDown = finite(leanDelta) && leanDelta < -0.5;
  const leanDeclining = finite(leanDelta) && leanDelta < -1.5;
  const strengthImproving = strength === "improving";
  const strengthStableOrImproving = strength === "stable" || strength === "improving";
  const strengthDeclining = strength === "slipping" || strength === "declining";
  const waistImproving = waist === "down";
  const waistNotImproving = waist === "flat" || waist === "up" || waist === "unknown";
  const bodyFatImproving = bodyFat === "down";
  const aggressiveCut = aggressiveWeightLoss(input.weight);
  const repeatedFatigue = (input.fatigueSignals ?? []).length >= 2;
  const hasPerformanceMetric = strength !== "unknown";
  const recentPerformance = recentPerformanceState(input.recentPerformanceSignals);
  const recentPerformanceClearlyNegative = recentPerformance === "negative";
  const bodyConfidenceHydration = input.bodyConfidence?.hydration ?? (hydrationIsHigh(input.hydration) ? "high" : hydrationIsLow(input.hydration) ? "low" : "moderate");
  const bodyConfidenceLeanMass = input.bodyConfidence?.leanMass ?? bodyConfidenceHydration;
  const hydrationConfidenceLow = bodyConfidenceHydration === "low";
  const leanMassConfidenceLow = bodyConfidenceLeanMass === "low" || hydrationConfidenceLow;

  const positive: string[] = [];
  const negative: string[] = [];

  if (strengthImproving) positive.push("Strength improving");
  else if (strength === "stable") positive.push("Strength stable");
  else if (strengthDeclining) negative.push("Strength declining");

  if (recentPerformance === "positive") {
    positive.push(
      strengthDeclining
        ? "Strength is pressured globally, but recent session performance includes positive evidence"
        : "Recent exercise-level performance evidence is positive"
    );
  } else if (recentPerformance === "mixedPositive") {
    positive.push(
      strengthDeclining
        ? "Strength is pressured globally, but recent session performance includes positive evidence"
        : "Recent performance evidence is mixed but includes positive exercise-level signals"
    );
  }

  if (waistImproving) positive.push("Waist decreasing");
  else if (waist === "up") negative.push("Waist not improving");

  if (bodyFatImproving) positive.push("BF trend improving");
  else if (bodyFat === "up") negative.push("BF trend worsening");

  if (bodyConfidenceHydration === "high") positive.push("Hydration confidence high");
  else if (hydrationConfidenceLow) negative.push("Hydration confidence low");

  if (leanDown && finite(leanDelta)) {
    negative.push(`Lean mass estimate down ${Math.abs(leanDelta).toFixed(1)} lb`);
  }

  if (aggressiveCut) negative.push("Aggressive rate of weight loss");
  if (repeatedFatigue) negative.push("Repeated fatigue signals");

  let status: LeanPreservationCompositeStatus = "Watch";
  if (leanStable && strengthImproving) {
    status = "Strong";
  } else if ((leanStable || leanModestlyDown) && strengthStableOrImproving && waistImproving) {
    status = "Acceptable";
  } else if (leanDeclining && strengthDeclining && waistNotImproving && hasPerformanceMetric) {
    status = "Poor";
  } else if (leanDown && (strengthDeclining || aggressiveCut)) {
    status = "Watch";
  } else if (strengthStableOrImproving && waistImproving) {
    status = "Acceptable";
  }

  // Never classify Poor from lean mass alone; require at least one performance metric.
  if (status === "Poor" && !hasPerformanceMetric) status = "Watch";
  if (status === "Poor" && !strengthDeclining) status = "Watch";

  const hydrationCapsPoor =
    status === "Poor" &&
    leanMassConfidenceLow &&
    leanDown &&
    !recentPerformanceClearlyNegative;
  if (hydrationCapsPoor) status = "Watch";

  const hydrationCapsAcceptable =
    (status === "Acceptable" || status === "Poor") &&
    leanMassConfidenceLow &&
    leanDown &&
    !recentPerformanceClearlyNegative;
  if (hydrationCapsAcceptable) status = "Watch";

  if (
    aggressiveCut &&
    strengthStableOrImproving &&
    status === "Watch" &&
    !(hydrationConfidenceLow && leanMassConfidenceLow && leanDown && !recentPerformanceClearlyNegative)
  ) {
    status = "Acceptable";
  }

  let confidence: LeanPreservationCompositeConfidence = "Low";
  const evidenceCount = [
    finite(leanDelta),
    strength !== "unknown",
    waist !== "unknown",
    bodyFat !== "unknown",
    input.hydration.confidenceLabel !== "Unknown",
  ].filter(Boolean).length;
  if (evidenceCount >= 4) confidence = "High";
  else if (evidenceCount >= 3) confidence = "Moderate";

  if (strengthImproving && hasPerformanceMetric) confidence = improveConfidence(confidence);
  if (hydrationConfidenceLow) confidence = reduceConfidence(confidence);

  let coachInterpretation: string | undefined;
  if (hydrationCapsPoor) {
    const caution = input.bodyConfidence?.cautionFlags.find((flag) => /hydration|impedance/i.test(flag));
    coachInterpretation = caution
      ? `${caution} Lean-preservation risk is elevated, but the lean-mass drop is less conclusive. Treat this as Watch until hydration stabilizes or performance confirms the trend.`
      : "Lean-preservation risk is elevated, but low hydration confidence makes the lean-mass drop less conclusive. Treat this as Watch until hydration stabilizes or performance confirms the trend.";
  } else if (hydrationConfidenceLow && leanDown && strengthDeclining && recentPerformanceClearlyNegative) {
    coachInterpretation =
      "Lean-mass estimate is down and performance evidence is also deteriorating, so muscle-preservation risk remains high despite hydration uncertainty.";
  } else if (bodyConfidenceHydration === "high" && strengthStableOrImproving) {
    coachInterpretation =
      "Bioimpedance lean-mass estimates can fluctuate with hydration. Current lifting performance suggests muscle preservation is better than lean-mass estimates alone indicate.";
  } else if (hydrationConfidenceLow && leanDown) {
    coachInterpretation =
      "Lean-preservation risk is elevated, but low hydration confidence makes the lean-mass drop less conclusive.";
  }

  return {
    status,
    confidence,
    rawMetrics: {
      leanMassLatest: leanLatest,
      leanMassDelta14d: leanDelta,
    },
    evidence: {
      positive: uniqueEvidence(positive),
      negative: uniqueEvidence(negative),
    },
    coachInterpretation,
  };
}
