import type { CoachExportMetrics } from "./types";

export type CoachIntelligence = {
  fatLossStatus: "On Track" | "Watch" | "Off Track";
  musclePreservationStatus: "Strong" | "Acceptable" | "Watch" | "Poor";
  trainingStatus: "Progressing" | "Stable" | "Mixed" | "Regressing";
  performanceTrendStatus: "Improving" | "Stable" | "Mixed" | "Regressing" | "Insufficient Data";
  movementQualityStatus: "Improving" | "Stable" | "Watch" | "Mixed" | "Insufficient Data";
  recoveryStatus: "Good" | "Watch" | "Poor";
  overallStatus: "On Track" | "Watch" | "Intervene";
  confidence: "High" | "Moderate" | "Low";
  positives: string[];
  watchItems: string[];
  recommendations: string[];
  narrative: string[];
};

type Direction = "down" | "flat" | "up" | "unknown";

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function direction(delta: number | null | undefined, threshold: number): Direction {
  if (!finite(delta)) return "unknown";
  if (delta < -threshold) return "down";
  if (delta > threshold) return "up";
  return "flat";
}

function unique(items: string[], limit?: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const text = String(item ?? "").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
    if (limit && out.length >= limit) break;
  }
  return out;
}

function strengthTrend(metrics: CoachExportMetrics): "improving" | "stable" | "slipping" | "declining" | "unknown" {
  const delta = metrics.strengthSignal.delta14d;
  if (!finite(delta)) return "unknown";
  if (delta > 0.03) return "improving";
  if (delta >= -0.03) return "stable";
  if (delta >= -0.08) return "slipping";
  return "declining";
}

function hasPhaseStrengthImproving(metrics: CoachExportMetrics): boolean {
  return (metrics.phaseQuality?.drivers ?? []).some((driver) => /Strength Preservation:\s*Improving/i.test(driver));
}

function aggressiveCut(metrics: CoachExportMetrics): boolean {
  const delta = metrics.bodyComp.weight.delta14d;
  const latest = metrics.bodyComp.weight.latest;
  if (!finite(delta)) return false;
  if (delta <= -3) return true;
  return finite(latest) && latest > 0 && delta / latest <= -0.015;
}

function classifyFatLoss(metrics: CoachExportMetrics): {
  status: CoachIntelligence["fatLossStatus"];
  explanation: string;
  positives: string[];
  watchItems: string[];
} {
  const weight = direction(metrics.bodyComp.weight.delta14d, 0.5);
  const waist = direction(metrics.bodyComp.waist.delta14d, 0.25);
  const bf = direction(metrics.bodyComp.bodyFatPct.delta14d, 0.3);
  const visceral = direction(metrics.bodyComp.visceralFat?.delta14d, 0);
  const whtr = direction(metrics.bodyComp.waistToHeight?.delta14d, 0.001);
  const positives: string[] = [];
  const watchItems: string[] = [];

  if (weight === "down") positives.push("Body weight is decreasing");
  if (waist === "down") positives.push("Waist is decreasing");
  if (bf === "down") positives.push("Body-fat trend is improving");
  if (visceral === "down") positives.push("Visceral fat estimate is improving");
  if (finite(metrics.bodyComp.waistToHeight?.latest)) {
    const latest = metrics.bodyComp.waistToHeight.latest;
    if (latest < 0.5) positives.push("Waist-to-height ratio is below the healthy threshold");
    else if (latest < 0.52 && whtr === "down") {
      positives.push("Waist-to-height ratio is near the healthy threshold and improving");
    } else if (whtr === "down") {
      positives.push("Waist-to-height ratio is improving");
    }
  }

  if (weight === "up") watchItems.push("Body weight is rising");
  if (waist === "up") watchItems.push("Waist is increasing");
  if (bf === "up") watchItems.push("Body-fat trend is worsening");
  if (visceral === "up") watchItems.push("Visceral fat estimate is worsening");
  if (
    finite(metrics.bodyComp.waistToHeight?.latest) &&
    metrics.bodyComp.waistToHeight.latest >= 0.52 &&
    whtr !== "down"
  ) {
    watchItems.push("Waist-to-height ratio remains elevated");
  }

  if (weight === "down" && waist === "down") {
    return {
      status: "On Track",
      explanation: visceral === "down"
        ? "Weight, waist, and visceral-fat estimate are moving in the intended direction."
        : "Weight and waist are moving in the intended direction.",
      positives,
      watchItems,
    };
  }

  if (weight === "down" || waist === "down" || bf === "down") {
    return {
      status: "Watch",
      explanation: "Fat-loss evidence is present, but not all body-composition signals agree yet.",
      positives,
      watchItems,
    };
  }

  return {
    status: "Off Track",
    explanation: "Fat-loss evidence is not yet showing clearly in weight, waist, or body-fat trend.",
    positives,
    watchItems,
  };
}

function trainingEvidenceText(metrics: CoachExportMetrics) {
  const movementText = metrics.trainingSignals.movementQuality.join(" ");
  const stimulusText = metrics.trainingSignals.stimulusCoverage.join(" ");
  const fatigueText = [
    ...metrics.trainingSignals.fatigueReadiness,
    ...metrics.patternSummary.fatigue,
  ].join(" ");
  const patternText = [
    ...metrics.patternSummary.movementQuality,
    ...metrics.patternSummary.constraints,
    ...metrics.patternSummary.progression,
  ].join(" ");

  return {
    movementText,
    stimulusText,
    fatigueText,
    patternText,
    allText: [movementText, stimulusText, fatigueText, patternText].join(" "),
  };
}

function classifyPerformanceTrend(metrics: CoachExportMetrics): {
  status: CoachIntelligence["performanceTrendStatus"];
  explanation: string;
  positives: string[];
  watchItems: string[];
} {
  const strength = strengthTrend(metrics);
  const { allText } = trainingEvidenceText(metrics);
  const hasPositivePerformanceEvidence =
    /pr\b|personal record|breakthrough|improved|improving|strong|consistent/i.test(allText) ||
    hasPhaseStrengthImproving(metrics);
  const positives: string[] = [];
  const watchItems: string[] = [];

  if (strength === "improving") positives.push("Strength Signal is improving");
  else if (strength === "stable") positives.push("Strength Signal is stable");
  else if (strength === "slipping") watchItems.push("Strength Signal is modestly below recent best");
  else if (strength === "declining") {
    watchItems.push(
      hasPhaseStrengthImproving(metrics)
        ? "Strength evidence is mixed"
        : "Strength Signal is below recent trend"
    );
  }

  if (hasPositivePerformanceEvidence) {
    positives.push("Recent notes include positive performance or breakthrough evidence");
  }

  if (strength === "unknown" && !hasPositivePerformanceEvidence) {
    return { status: "Insufficient Data", explanation: "Performance trend needs more strength or performance evidence.", positives, watchItems };
  }
  if (strength === "improving") {
    return { status: "Improving", explanation: "Strength Signal and recent performance evidence are moving positively.", positives, watchItems };
  }
  if (strength === "stable") {
    return { status: "Stable", explanation: "Strength Signal is holding steady.", positives, watchItems };
  }
  if (strength === "declining" && hasPositivePerformanceEvidence) {
    return { status: "Mixed", explanation: "Global strength is down, but recent exercise-level performance evidence is positive.", positives, watchItems };
  }
  if (strength === "declining") {
    return { status: "Regressing", explanation: "Global strength is below recent trend.", positives, watchItems };
  }
  return { status: "Mixed", explanation: "Performance evidence is mixed across global strength and recent sessions.", positives, watchItems };
}

function classifyMovementQuality(metrics: CoachExportMetrics): {
  status: CoachIntelligence["movementQualityStatus"];
  explanation: string;
  positives: string[];
  watchItems: string[];
} {
  const { movementText, fatigueText, allText } = trainingEvidenceText(metrics);
  const positives: string[] = [];
  const watchItems: string[] = [];

  if (/improved|improving|breakthrough|clean|solid|consistent|strong/i.test(movementText)) {
    positives.push("Recent movement notes include positive execution signals");
  }
  if (/terminal reps|terminal-rep|later-set fatigue|fatigue/i.test(fatigueText)) {
    watchItems.push("Terminal-rep quality dropped under fatigue");
  }
  if (/press|pressing|bench|overhead/i.test(fatigueText) && /fatigue|terminal|later/i.test(fatigueText)) {
    watchItems.push("Pressing endurance limited later sets");
  }
  if (/pain|twinge|joint feedback|stopped due to|sensitive|sensitivity/i.test(allText)) {
    watchItems.push("Joint feedback or pain affected movement quality");
  }
  if (/form breakdown|form breaking|range shortened|reduced range|rom|lost position/i.test(allText)) {
    watchItems.push("Form or range of motion changed under fatigue");
  }
  if (/technique|probe|rejected/i.test(allText)) {
    watchItems.push("Technique/probe variation was rejected");
  }
  if (/equipment/i.test(allText)) {
    watchItems.push("Equipment issue identified");
  }

  if (!allText.trim()) {
    return { status: "Insufficient Data", explanation: "Movement quality needs more recent session-note evidence.", positives, watchItems };
  }
  if (watchItems.some((item) => /Joint feedback|pain|Form|range of motion|Technique\/probe|Equipment/i.test(item))) {
    return { status: "Watch", explanation: "Recent session notes show movement-quality constraints to monitor.", positives, watchItems };
  }
  if (positives.length && watchItems.length) {
    return { status: "Mixed", explanation: "Recent sessions include both positive execution signals and movement-quality watch items.", positives, watchItems };
  }
  if (watchItems.length) {
    return { status: "Watch", explanation: "Recent session notes show movement-quality constraints to monitor.", positives, watchItems };
  }
  if (positives.length) {
    return { status: "Improving", explanation: "Recent movement notes show cleaner or improving execution.", positives, watchItems };
  }
  return { status: "Stable", explanation: "No major movement-quality limiter is visible in recent session notes.", positives, watchItems };
}

function legacyTrainingStatus(
  performance: ReturnType<typeof classifyPerformanceTrend>,
  movement: ReturnType<typeof classifyMovementQuality>
): CoachIntelligence["trainingStatus"] {
  if (performance.status === "Regressing" && movement.status === "Watch") return "Regressing";
  if (performance.status === "Improving" && (movement.status === "Improving" || movement.status === "Stable")) return "Progressing";
  if (performance.status === "Stable" && movement.status !== "Watch") return "Stable";
  return "Mixed";
}

function classifyRecovery(metrics: CoachExportMetrics): {
  status: CoachIntelligence["recoveryStatus"];
  explanation: string;
  positives: string[];
  watchItems: string[];
} {
  const fatigueCount = metrics.trainingSignals.fatigueReadiness.length + metrics.patternSummary.fatigue.length;
  const hydrationLabel = String(metrics.hydration.confidenceLabel ?? "").toLowerCase();
  const positives: string[] = [];
  const watchItems: string[] = [];

  if (hydrationLabel === "high") positives.push("Hydration confidence is high");
  if (hydrationLabel === "low" || metrics.hydration.distortionLikely) watchItems.push("Hydration confidence is low");
  if (fatigueCount >= 2) watchItems.push("Repeated fatigue signals are present");

  if (watchItems.length >= 2) return { status: "Poor", explanation: "Recovery evidence is constrained by hydration uncertainty and repeated fatigue.", positives, watchItems };
  if (watchItems.length === 1) return { status: "Watch", explanation: "Recovery is mostly manageable, but one recovery signal needs monitoring.", positives, watchItems };
  return { status: "Good", explanation: "No major recovery limiter is visible in the export evidence.", positives, watchItems };
}

function recommendationSet(metrics: CoachExportMetrics, movement: ReturnType<typeof classifyMovementQuality>): string[] {
  const recommendations: string[] = [];
  if (aggressiveCut(metrics)) recommendations.push("Keep progression conservative while the cut rate is aggressive.");
  if (movement.watchItems.some((item) => /Pressing endurance/i.test(item))) {
    recommendations.push("Monitor pressing endurance and stop sets before terminal-rep quality breaks down.");
  }
  if (movement.watchItems.some((item) => /Technique\/probe/i.test(item))) {
    recommendations.push("Do not progress rejected technique/probe variations until execution is clean.");
  }
  if (!recommendations.length) recommendations.push("Continue current approach and monitor the next 1-2 check-ins.");
  return unique(recommendations, 3);
}

export function buildCoachIntelligence(metrics: CoachExportMetrics): CoachIntelligence {
  const fatLoss = classifyFatLoss(metrics);
  const performance = classifyPerformanceTrend(metrics);
  const movement = classifyMovementQuality(metrics);
  const trainingStatus = legacyTrainingStatus(performance, movement);
  const recovery = classifyRecovery(metrics);
  const muscleStatus = metrics.leanPreservation?.status ?? "Watch";
  const confidenceInputs = [
    metrics.bodyComp.weight.delta14d,
    metrics.bodyComp.waist.delta14d,
    metrics.bodyComp.leanMass.delta14d,
    metrics.strengthSignal.delta14d,
  ].filter(finite).length;

  let overallStatus: CoachIntelligence["overallStatus"] = "Watch";
  if (fatLoss.status === "On Track" && (muscleStatus === "Strong" || muscleStatus === "Acceptable") && trainingStatus !== "Regressing") {
    overallStatus = aggressiveCut(metrics) || recovery.status === "Watch" ? "Watch" : "On Track";
  }
  if (fatLoss.status === "Off Track" || muscleStatus === "Poor" || trainingStatus === "Regressing" || recovery.status === "Poor") {
    overallStatus = "Intervene";
  }

  const confidence: CoachIntelligence["confidence"] =
    confidenceInputs >= 4 && metrics.leanPreservation?.confidence === "High"
      ? "High"
      : confidenceInputs >= 3
        ? "Moderate"
        : "Low";

  const muscleExplanation =
    muscleStatus === "Strong"
      ? "Lean-mass and performance evidence support strong muscle preservation."
      : muscleStatus === "Acceptable"
        ? "Lean-mass estimate is not perfect, but performance and waist evidence support acceptable preservation."
        : muscleStatus === "Poor"
          ? "Lean-mass and performance evidence both indicate elevated muscle-preservation risk."
          : "Muscle-preservation evidence needs monitoring before increasing cut pressure.";

  const positives = unique([
    ...fatLoss.positives,
    ...(metrics.leanPreservation?.evidence.positive ?? []),
    ...performance.positives,
    ...movement.positives,
    ...recovery.positives,
  ], 8);

  const watchItems = unique([
    ...fatLoss.watchItems,
    ...(metrics.leanPreservation?.evidence.negative ?? []).map((item) =>
      item === "Strength declining" ? "Strength evidence is mixed" : item
    ),
    ...performance.watchItems,
    ...movement.watchItems,
    ...recovery.watchItems,
  ], 8);

  return {
    fatLossStatus: fatLoss.status,
    musclePreservationStatus: muscleStatus,
    trainingStatus,
    performanceTrendStatus: performance.status,
    movementQualityStatus: movement.status,
    recoveryStatus: recovery.status,
    overallStatus,
    confidence,
    positives,
    watchItems,
    recommendations: recommendationSet(metrics, movement),
    narrative: [
      `Fat Loss: ${fatLoss.explanation}`,
      `Muscle Preservation: ${muscleExplanation}`,
      `Performance Trend: ${performance.explanation}`,
      `Movement Quality: ${movement.explanation}`,
      `Recovery: ${recovery.explanation}`,
    ],
  };
}

export function clarifyCoachExportLine(line: string): string {
  const text = String(line ?? "").trim();
  if (!text) return text;
  if (/Load looked too heavy/i.test(text)) {
    if (/equipment/i.test(text)) return "Equipment issue identified";
    if (/technique|probe|rejected/i.test(text)) return "Technique/probe variation was rejected";
    if (/press|bench|overhead/i.test(text)) return "Pressing endurance limited later sets";
    if (/terminal|fatigue|later/i.test(text)) return "Terminal-rep quality dropped";
    return "Terminal-rep quality dropped";
  }
  if (/technique|probe|rejected/i.test(text)) return text.replace(/Load looked too heavy/gi, "Technique/probe variation was rejected");
  return text;
}
