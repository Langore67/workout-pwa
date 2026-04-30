import type { CoachExportAnchorLift, CoachExportMetrics } from "./types";
import type { CurrentPhase } from "../../config/appConfig";

function formatDate(ms: number | null | undefined) {
  if (ms == null || !Number.isFinite(ms)) return "Unknown";
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatSigned(value: number | null | undefined, digits = 1, suffix = "") {
  if (value == null || !Number.isFinite(value)) return "Unknown";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}${suffix}`;
}

function formatValue(value: number | null | undefined, digits = 1, suffix = "") {
  if (value == null || !Number.isFinite(value)) return "Unknown";
  return `${value.toFixed(digits)}${suffix}`;
}

function formatMetricLine(
  label: string,
  latest: number | null,
  delta14d: number | null,
  unit: string,
  digits = 1
) {
  return `- ${label}: ${formatValue(latest, digits, unit)} (14d ${formatSigned(delta14d, digits, unit)})`;
}

function formatAnchorLift(lift: CoachExportAnchorLift) {
  if (lift.e1rm == null || lift.effectiveWeightLb == null || lift.reps == null) {
    return `- ${lift.pattern}: Insufficient Data`;
  }

  const name = lift.trackDisplayName || lift.exerciseName || "Unknown";
  return `- ${lift.pattern}: ${name} | effective ${formatValue(lift.effectiveWeightLb, 0, " lb")} x ${formatValue(lift.reps, 0)} | e1RM ${formatValue(lift.e1rm, 0)} | ${formatDate(lift.performedAt)}`;
}

function formatPhaseQualityHeading(phase: CurrentPhase) {
  if (phase === "bulk") return "Bulk / Phase Quality";
  if (phase === "maintain") return "Maintenance / Phase Quality";
  return "Cut / Phase Quality";
}

function formatPhaseQuestions(phase: CurrentPhase) {
  if (phase === "bulk") {
    return [
      "1. Is weight gain trending appropriately?",
      "2. Are lean mass gain signals showing up?",
      "3. How is strength progression?",
    ];
  }

  if (phase === "maintain") {
    return [
      "1. Is body weight staying stable?",
      "2. Are recomposition signals showing up?",
      "3. How stable is strength?",
    ];
  }

  return [
    "1. Is fat loss occurring (weight and waist aligned)?",
    "2. Is muscle being preserved (lean mass and strength stable)?",
    "3. Is training performance staying consistent?",
  ];
}

export function formatCoachExportText(metrics: CoachExportMetrics) {
  const nextWorkoutFocusLines = [
    "Next Workout Focus",
    ...(metrics.nextWorkoutFocus.progressionGuardrails.length
      ? [
          "Progression Guardrails",
          ...metrics.nextWorkoutFocus.progressionGuardrails.map((item) => `- ${item}`),
          "",
        ]
      : []),
    ...(metrics.nextWorkoutFocus.executionPriorities.length
      ? [
          "Execution Priorities",
          ...metrics.nextWorkoutFocus.executionPriorities.map((item) => `- ${item}`),
          "",
        ]
      : []),
    ...(metrics.nextWorkoutFocus.adjustmentTriggers.length
      ? [
          "Adjustment Triggers",
          ...metrics.nextWorkoutFocus.adjustmentTriggers.map((item) => `- ${item}`),
          "",
        ]
      : []),
  ];
  if (nextWorkoutFocusLines[nextWorkoutFocusLines.length - 1] === "") {
    nextWorkoutFocusLines.pop();
  }

  const trainingSignalLines = [
    "Training Signals (Recent Sessions)",
    "Movement Quality",
    ...(metrics.trainingSignals.movementQuality.length
      ? metrics.trainingSignals.movementQuality.map((item) => `- ${item}`)
      : ["- No recent movement-quality notes."]),
    "",
    "Stimulus / Coverage",
    ...(metrics.trainingSignals.stimulusCoverage.length
      ? metrics.trainingSignals.stimulusCoverage.map((item) => `- ${item}`)
      : ["- No recent stimulus notes."]),
    "",
    "Fatigue / Readiness",
    ...(metrics.trainingSignals.fatigueReadiness.length
      ? metrics.trainingSignals.fatigueReadiness.map((item) => `- ${item}`)
      : ["- No recent fatigue notes."]),
    "",
    "Discuss with Gaz",
    ...(metrics.trainingSignals.discussWithGaz.length
      ? metrics.trainingSignals.discussWithGaz.map((item) => `- ${item}`)
      : ["- No coach discussion flags from recent sessions."]),
  ];

  const patternSummaryLines = [
    "Recent Patterns (Last 4 Sessions)",
    "Movement Quality",
    ...(metrics.patternSummary.movementQuality.length
      ? metrics.patternSummary.movementQuality.map((item) => `- ${item}`)
      : ["- No repeated movement-quality pattern yet."]),
    "",
    "Stimulus",
    ...(metrics.patternSummary.stimulus.length
      ? metrics.patternSummary.stimulus.map((item) => `- ${item}`)
      : ["- No repeated stimulus pattern yet."]),
    "",
    "Fatigue / Readiness",
    ...(metrics.patternSummary.fatigue.length
      ? metrics.patternSummary.fatigue.map((item) => `- ${item}`)
      : ["- No repeated fatigue pattern yet."]),
    "",
    "Constraints",
    ...(metrics.patternSummary.constraints.length
      ? metrics.patternSummary.constraints.map((item) => `- ${item}`)
      : ["- No repeated constraint pattern yet."]),
    "",
    "Progression",
    ...(metrics.patternSummary.progression.length
      ? metrics.patternSummary.progression.map((item) => `- ${item}`)
      : ["- No repeated progression pattern yet."]),
  ];

  const lines = [
    "IronForge Coach Export",
    `Generated: ${formatDate(metrics.generatedAt)}`,
    "",
    "Questions to answer:",
    ...formatPhaseQuestions(metrics.currentPhase),
    "",
    "Body Composition (14d trends)",
    formatMetricLine("Weight", metrics.bodyComp.weight.latest, metrics.bodyComp.weight.delta14d, " lb"),
    formatMetricLine("Waist", metrics.bodyComp.waist.latest, metrics.bodyComp.waist.delta14d, " in"),
    formatMetricLine("Body Fat %", metrics.bodyComp.bodyFatPct.latest, metrics.bodyComp.bodyFatPct.delta14d, "%"),
    formatMetricLine("Lean Mass", metrics.bodyComp.leanMass.latest, metrics.bodyComp.leanMass.delta14d, " lb"),
    `- Bodyweight delta 7d: ${formatSigned(metrics.bodyComp.bodyweightDelta7d, 1, " lb")}`,
    `- Bodyweight delta 14d: ${formatSigned(metrics.bodyComp.bodyweightDelta14d, 1, " lb")}`,
    "",
    formatPhaseQualityHeading(metrics.currentPhase),
    `- Status: ${metrics.phaseQuality?.finalStatus ?? "Insufficient Data"}`,
    `- Confidence: ${metrics.phaseQuality?.confidence ?? "Unknown"}`,
    ...(metrics.phaseQuality?.drivers?.length
      ? metrics.phaseQuality.drivers.slice(0, 4).map((driver) => `- ${driver}`)
      : ["- Drivers: Insufficient Data"]),
    "",
    "Hydration",
    `- Latest body water %: ${formatValue(metrics.hydration.latestWaterPct, 1, "%")}`,
    `- Confidence: ${metrics.hydration.confidenceLabel}${metrics.hydration.confidenceScore != null ? ` (${Math.round(metrics.hydration.confidenceScore)})` : ""}`,
    `- Note: ${metrics.hydration.note || "Unknown"}`,
    "",
    "Strength Signal",
    "- Primary metric: IronForge's blended strength trend metric.",
    `- Current: ${formatValue(metrics.strengthSignal.current, 2)}`,
    `- 14d delta: ${formatSigned(metrics.strengthSignal.delta14d, 2)}`,
    `- Vs 90d best: ${formatSigned(metrics.strengthSignal.vs90dBestPct, 1, "%")}`,
    `- Method: Blended strength signal using Epley-based e1RM, allometric normalization (BW^0.67), and weekly snapshots from overlapping 28-day windows.`,
    `- Relative Strength: Secondary linear bodyweight comparison, distinct from Strength Signal.`,
        `- Bodyweight used by strength engine: ${formatValue(metrics.strengthSignal.currentBodyweight, 1, " lb")} (${metrics.strengthSignal.bodyweightDaysUsed ?? "Unknown"} day avg sample; missing bodyweight lowers confidence)`,
        "",
        "Export Confidence",
        `- Confidence: ${metrics.exportConfidence.label} (${metrics.exportConfidence.score})`,
    "",
    "Anchor Lifts",
    ...metrics.anchorLifts.map(formatAnchorLift),
    "",
    "Exercise Vocabulary",
    "Use these IronForge exercise names exactly when recommending movements:",
    ...(metrics.exerciseVocabulary.length
      ? metrics.exerciseVocabulary.map((name) => `- ${name}`)
      : ["- No recent canonical exercise names available."]),
    "- Prefer exact names from this list.",
    "- Do not create new exercise names unless necessary.",
    "- If suggesting a variation, label it as a new exercise.",
    "",
    ...nextWorkoutFocusLines,
    "",
    ...trainingSignalLines,
    "",
    ...patternSummaryLines,
    "",
    "Readiness / Confidence Notes",
    ...metrics.readinessNotes.map((note) => `- ${note || "Unknown"}`),
    "",
    "Data Gaps",
    ...metrics.dataNotes.map((note) => `- ${note || "Unknown"}`),
  ];

  return lines.join("\n");
}
