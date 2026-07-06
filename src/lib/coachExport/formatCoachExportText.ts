import type { CoachExportMetrics } from "./types";
import { buildCoachIntelligence, clarifyCoachExportLine } from "./coachIntelligence";
import {
  buildCoachingMemory,
  isGenericStaleDiscussPrompt,
  isActiveWatchSignal,
  normalizeCoachingMemoryText,
} from "./coachingMemory";
import type { GoalProgressRow } from "./goalEngine";
import { buildCoachStateFromExportMetrics } from "../coachState/buildCoachState";
import { buildCoachReport } from "../coachReport/buildCoachReport";
import { formatCoachReportText } from "../coachReport/formatCoachReportText";

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

function formatCoachSummarySection(metrics: CoachExportMetrics): string[] {
  const intelligence = metrics.coachIntelligence ?? buildCoachIntelligence(metrics);
  const summary = intelligence.summary?.trim();
  const biggestWin = intelligence.biggestWin?.trim();
  const biggestRisk = intelligence.biggestRisk?.trim();
  const fatLossNarrative =
    intelligence.narrative.find((item) => item.startsWith("Fat Loss:")) ?? "Fat Loss: Evidence is incomplete.";
  const muscleNarrative =
    intelligence.narrative.find((item) => item.startsWith("Muscle Preservation:")) ??
    "Muscle Preservation: Evidence is incomplete.";
  const performanceNarrative =
    intelligence.narrative.find((item) => item.startsWith("Performance Trend:")) ??
    "Performance Trend: Evidence is incomplete.";
  const movementNarrative =
    intelligence.narrative.find((item) => item.startsWith("Movement Quality:")) ??
    "Movement Quality: Evidence is incomplete.";

  return [
    "Coach Summary",
    `- Overall: ${intelligence.overallStatus}`,
    `- Confidence: ${intelligence.confidence}`,
    "",
    ...(summary ? ["Summary", `- ${summary}`, ""] : []),
    ...(biggestWin ? ["Biggest Win", `- ${biggestWin}`, ""] : []),
    ...(biggestRisk ? ["Biggest Risk", `- ${biggestRisk}`, ""] : []),
    "Fat Loss",
    `- ${intelligence.fatLossStatus}`,
    `- ${fatLossNarrative.replace(/^Fat Loss:\s*/, "")}`,
    "",
    "Muscle Preservation",
    `- ${intelligence.musclePreservationStatus}`,
    `- ${muscleNarrative.replace(/^Muscle Preservation:\s*/, "")}`,
    "",
    "Training",
    `- Performance Trend: ${intelligence.performanceTrendStatus}`,
    `- ${performanceNarrative.replace(/^Performance Trend:\s*/, "")}`,
    `- Movement Quality: ${intelligence.movementQualityStatus}`,
    `- ${movementNarrative.replace(/^Movement Quality:\s*/, "")}`,
    "",
    "Recommendations",
    ...intelligence.recommendations.map((item) => `- ${item}`),
    "",
  ];
}

function formatWaistToHeightSection(metrics: CoachExportMetrics): string[] {
  const whtr = metrics.bodyComp.waistToHeight;
  if (!whtr || whtr.latest == null || !Number.isFinite(whtr.latest)) return [];

  return [
    "Waist-to-Height Ratio",
    `- Current: ${whtr.latest.toFixed(3)}`,
    ...(whtr.delta14d != null && Number.isFinite(whtr.delta14d)
      ? [`- 14d trend: ${formatSigned(whtr.delta14d, 3)}`]
      : []),
    `- Status: ${whtr.status}`,
    "- Healthy threshold: < 0.500",
    `- Waist needed for threshold: ${formatValue(whtr.healthyWaistTargetIn, 1, " in")}`,
    `- Distance to threshold: ${formatValue(whtr.distanceToThresholdIn, 1, " in")}`,
    "",
  ];
}

function formatGoalValue(row: GoalProgressRow, value: number) {
  if (row.label === "Visceral Fat") {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }
  if (row.unit === "ratio") return value.toFixed(3);
  if (row.unit === "pts") return `${value.toFixed(1)}%`;
  return `${value.toFixed(1)} ${row.unit}`;
}

function formatGoalRemaining(row: GoalProgressRow) {
  if (row.remaining <= 0) return "reached";
  if (row.unit === "ratio") return `${row.remaining.toFixed(3)} remaining`;
  if (row.unit === "pts") return `${row.remaining.toFixed(1)} pts remaining`;
  if (row.unit === "") {
    return `${Number.isInteger(row.remaining) ? String(row.remaining) : row.remaining.toFixed(1)} remaining`;
  }
  return `${row.remaining.toFixed(1)} ${row.unit} remaining`;
}

function formatGoalProgressSection(metrics: CoachExportMetrics): string[] {
  const progress = metrics.goalProgress;
  if (!progress?.rows.length) return [];

  return [
    "Goal Trajectory",
    ...progress.rows.map(
      (row) =>
        `- ${row.label}: ${formatGoalValue(row, row.current)} -> ${row.label === "Waist-to-Height Ratio" ? `< ${row.target.toFixed(3)}` : formatGoalValue(row, row.target)} | ${formatGoalRemaining(row)}`
    ),
    `- Status: ${progress.status}`,
    "",
  ];
}

function normalizeNarrativeLine(value: string) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .replace(/[.]+$/g, "")
    .trim()
    .toLowerCase();
}

function isDuplicateReadinessNote(note: string, metrics: CoachExportMetrics, phaseDriverKeys: Set<string>) {
  const raw = String(note ?? "").trim();
  const normalized = normalizeNarrativeLine(raw);
  if (!normalized) return true;

  if (/^phase quality:/i.test(raw)) return true;
  if (/^status\s*:/i.test(raw)) return true;
  if (phaseDriverKeys.has(normalized)) return true;
  if (normalizeNarrativeLine(metrics.hydration.note) === normalized) return true;
  if (metrics.leanPreservation && /lean preservation\s*:/i.test(raw)) return true;
  if (/^strength preservation\s*:/i.test(raw)) return true;
  if (/^hydration confidence\s+(?:is\s+)?(?:low|moderate|high|unknown)/i.test(raw)) return true;
  if (/hydration.*(?:distort|distorting|impedance)|impedance-derived/i.test(raw)) return true;
  if (/^weight\s+(?:down|flat|up)\s*\/\s*waist\s+(?:down|flat|up)/i.test(raw)) return true;
  if (/^no additional readiness notes\.?$/i.test(raw)) return true;

  return false;
}

function removePromotedTrainingSignals(values: string[], promotedKeys: Set<string>) {
  return values.filter((value) => !promotedKeys.has(normalizeCoachingMemoryText(value)));
}

function filterStaleWatchSignals(values: string[], activeWatchKeys: Set<string>) {
  return values.filter((value) => !isActiveWatchSignal(value) || activeWatchKeys.has(normalizeCoachingMemoryText(value)));
}

export function formatCoachExportText(metrics: CoachExportMetrics) {
  const coachingMemory =
    metrics.coachingMemory ??
    buildCoachingMemory({
      trainingSignals: metrics.trainingSignals,
      patternSummary: metrics.patternSummary,
    });
  const validatedLearningItems = coachingMemory.validatedLearnings.map((item) => item.text);
  const validatedLearningKeys = new Set(validatedLearningItems.map(normalizeCoachingMemoryText));
  const activeWatchKeys = new Set(coachingMemory.activeWatchItems.map((item) => normalizeCoachingMemoryText(item.text)));
  const discussWithGazItems = metrics.trainingSignals.discussWithGaz.filter(
    (item) => !isGenericStaleDiscussPrompt(item) && (!isActiveWatchSignal(item) || activeWatchKeys.has(normalizeCoachingMemoryText(item)))
  );

  const trainingSignalGroups = [
    { heading: "Validated Learnings", items: validatedLearningItems },
    {
      heading: "Movement Quality",
      items: filterStaleWatchSignals(
        removePromotedTrainingSignals(metrics.trainingSignals.movementQuality, validatedLearningKeys),
        activeWatchKeys
      ),
    },
    {
      heading: "Stimulus / Coverage",
      items: removePromotedTrainingSignals(metrics.trainingSignals.stimulusCoverage, validatedLearningKeys),
    },
    { heading: "Fatigue / Readiness", items: filterStaleWatchSignals(metrics.trainingSignals.fatigueReadiness, activeWatchKeys) },
    { heading: "Discuss with Gaz", items: discussWithGazItems },
  ].filter((group) => group.items.length > 0);
  const trainingSignalLines = trainingSignalGroups.length
    ? [
        "Training Signals (Recent Sessions)",
        ...trainingSignalGroups.flatMap((group, index) => [
          ...(index > 0 ? [""] : []),
          group.heading,
          ...group.items.map((item) => `- ${clarifyCoachExportLine(item)}`),
        ]),
      ]
    : [];

  const patternSummaryGroups = [
    { heading: "Movement Quality", items: metrics.patternSummary.movementQuality },
    { heading: "Stimulus", items: metrics.patternSummary.stimulus },
    { heading: "Fatigue / Readiness", items: metrics.patternSummary.fatigue },
    { heading: "Constraints", items: metrics.patternSummary.constraints },
    { heading: "Progression", items: metrics.patternSummary.progression },
  ].filter((group) => group.items.length > 0);
  const patternSummaryLines = patternSummaryGroups.length
    ? [
        "Recent Patterns (Last 4 Sessions)",
        ...patternSummaryGroups.flatMap((group, index) => [
          ...(index > 0 ? [""] : []),
          group.heading,
          ...group.items.map((item) => `- ${item}`),
        ]),
      ]
    : ["Recent Patterns (Last 4 Sessions)", "- No repeated patterns detected."];

  const phaseDriverKeys = new Set(
    (metrics.phaseQuality?.drivers ?? []).map((driver) => normalizeNarrativeLine(driver))
  );
  const readinessNoteLines = metrics.readinessNotes
    .filter((note) => !isDuplicateReadinessNote(note, metrics, phaseDriverKeys))
    .map((note) => `- ${clarifyCoachExportLine(note || "Unknown")}`);

  const dataGapLines = metrics.dataNotes
    .filter((note) => !/^No major data gaps detected\.?$/i.test(String(note ?? "").trim()))
    .map((note) => `- ${note || "Unknown"}`);
  const hydrationNote = metrics.hydration.note || "Unknown";
  const hydrationNoteDuplicatesPhase =
    phaseDriverKeys.has(normalizeNarrativeLine(hydrationNote)) &&
    /hydration|impedance|lean mass|body-fat/i.test(hydrationNote);
  const coachState = buildCoachStateFromExportMetrics(metrics);
  const report = buildCoachReport({
    coachState,
    metrics,
    generatedAt: metrics.generatedAt,
  });
  const sharedLines = formatCoachReportText(report, {
    bodyHeadingOverride: "Body Composition — Coach Trend Values",
  }).split("\n");

  const lines = [
    ...sharedLines,
    ...formatWaistToHeightSection(metrics),
    ...formatCoachSummarySection(metrics),
    "Hydration",
    `- Latest body water %: ${formatValue(metrics.hydration.latestWaterPct, 1, "%")}`,
    `- Confidence: ${metrics.hydration.confidenceLabel}${metrics.hydration.confidenceScore != null ? ` (${Math.round(metrics.hydration.confidenceScore)})` : ""}`,
    ...(hydrationNoteDuplicatesPhase ? [] : [`- Note: ${hydrationNote}`]),
    "",
    ...(trainingSignalLines.length ? [...trainingSignalLines, ""] : []),
    ...(readinessNoteLines.length
      ? ["", "Readiness / Confidence Notes", ...readinessNoteLines]
      : []),
    ...(dataGapLines.length ? ["", "Data Gaps", ...dataGapLines] : []),
  ];

  return lines.join("\n");
}
