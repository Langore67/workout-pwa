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
    "1. Is retatrutide working / is fat loss showing up?",
    "2. Am I preserving muscle?",
    "3. How is strength retention?",
  ];
}

export function formatCoachExportText(metrics: CoachExportMetrics) {
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
    "Readiness / Confidence Notes",
    ...metrics.readinessNotes.map((note) => `- ${note || "Unknown"}`),
    "",
    "Data Gaps",
    ...metrics.dataNotes.map((note) => `- ${note || "Unknown"}`),
  ];

  return lines.join("\n");
}
