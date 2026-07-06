import type { CoachExportAnchorLift, CoachExportBodyTrendMetric, CoachExportMetrics } from "./types";
import type { CurrentPhase } from "../../config/appConfig";
import { buildCoachIntelligence, clarifyCoachExportLine } from "./coachIntelligence";
import {
  buildCoachingMemory,
  isGenericStaleDiscussPrompt,
  isActiveWatchSignal,
  normalizeCoachingMemoryText,
} from "./coachingMemory";
import type { GoalProgressRow } from "./goalEngine";

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

function formatCoachTrendMetricLine(
  label: string,
  metric: CoachExportBodyTrendMetric | undefined,
  unit: string,
  digits = 1
) {
  if (!metric) return `- ${label}: Unknown (coach trend unavailable)`;
  const value = metric.rolling5 ?? metric.rawLatest;
  const trendLabel = metric.rolling5 != null ? "rolling avg" : "latest";
  return `- ${label}: ${formatValue(value, digits, unit)} ${trendLabel} (14d ${formatSigned(metric.delta14d, digits, unit)})`;
}

function formatVisceralFatValue(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "Unknown";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatAnchorRecencyLabel(lift: CoachExportAnchorLift) {
  if (lift.ageDays == null || !Number.isFinite(lift.ageDays)) return null;
  const age = Math.max(0, Math.floor(lift.ageDays));
  if (lift.recency === "stale") return `${age}d old | stale anchor`;
  if (lift.recency === "historical") return `${age}d old | historical anchor`;
  if (lift.recency === "recent") return `${age}d old | recent anchor`;
  return `${age}d old`;
}

function visceralFatDirection(delta14d: number | null | undefined) {
  if (delta14d == null || !Number.isFinite(delta14d)) return "Unknown";
  if (delta14d < 0) return "Improving";
  if (delta14d > 0) return "Worsening";
  return "Flat";
}

function formatVisceralFatSection(metrics: CoachExportMetrics): string[] {
  const visceralFat = metrics.bodyComp.visceralFat;
  if (!visceralFat || visceralFat.latest == null || !Number.isFinite(visceralFat.latest)) return [];

  return [
    "Visceral Fat",
    `- Latest estimate: ${formatVisceralFatValue(visceralFat.latest)}`,
    `- 14d trend: ${formatSigned(visceralFat.delta14d, 0)}`,
    `- Direction: ${visceralFatDirection(visceralFat.delta14d)}`,
    `- Confidence: ${visceralFat.delta14d == null ? "Low" : "Moderate"}`,
    "- Note: Hume visceral fat is an estimate. Use trend alongside waist circumference rather than as an absolute measurement.",
    "",
  ];
}

function formatLeanPreservationSection(metrics: CoachExportMetrics): string[] {
  const composite = metrics.leanPreservation;
  if (!composite) return [];

  const positive = composite.evidence.positive.length
    ? composite.evidence.positive.map((item) => `✓ ${item}`)
    : ["- No positive evidence available."];
  const negative = composite.evidence.negative.length
    ? composite.evidence.negative.map((item) => `• ${item}`)
    : ["- No negative evidence available."];

  return [
    "Lean Preservation",
    "",
    "Raw Metrics",
    `- Lean Mass: ${formatValue(composite.rawMetrics.leanMassLatest, 1, " lb")} (14d ${formatSigned(composite.rawMetrics.leanMassDelta14d, 1, " lb")})`,
    "",
    "Composite",
    `- ${composite.status}`,
    `- Confidence: ${composite.confidence}`,
    "",
    "Evidence",
    "",
    "Positive",
    ...positive,
    "",
    "Negative",
    ...negative,
    "",
    "Coach Interpretation",
    composite.coachInterpretation
      ? `- ${composite.coachInterpretation}`
      : "- No additional interpretation.",
    "",
  ];
}

function formatCoachSummarySection(metrics: CoachExportMetrics): string[] {
  const intelligence = metrics.coachIntelligence ?? buildCoachIntelligence(metrics);
  const summary = intelligence.summary?.trim();
  const biggestWin = intelligence.biggestWin?.trim();
  const biggestRisk = intelligence.biggestRisk?.trim();
  const fatLossNarrative = intelligence.narrative.find((item) => item.startsWith("Fat Loss:")) ?? "Fat Loss: Evidence is incomplete.";
  const muscleNarrative = intelligence.narrative.find((item) => item.startsWith("Muscle Preservation:")) ?? "Muscle Preservation: Evidence is incomplete.";
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

function formatGoalTarget(row: GoalProgressRow) {
  if (row.label === "Waist-to-Height Ratio") return `< ${row.target.toFixed(3)}`;
  return formatGoalValue(row, row.target);
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
        `- ${row.label}: ${formatGoalValue(row, row.current)} -> ${formatGoalTarget(row)} | ${formatGoalRemaining(row)}`
    ),
    `- Status: ${progress.status}`,
    "",
  ];
}

function uniqueEvidenceLines(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const value = String(raw ?? "").replace(/\s+/g, " ").trim();
    if (!value) continue;
    const key = value
      .toLowerCase()
      .replace(/\bhydration confidence is low\b/g, "hydration confidence low")
      .replace(/\bhydration confidence is high\b/g, "hydration confidence high")
      .replace(/[.]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function formatLeanPreservationSectionV2(metrics: CoachExportMetrics): string[] {
  const composite = metrics.leanPreservation;
  if (!composite) return [];
  const intelligence = metrics.coachIntelligence ?? buildCoachIntelligence(metrics);
  const positive = composite.evidence.positive.length
    ? uniqueEvidenceLines(composite.evidence.positive).map((item) => `+ ${clarifyCoachExportLine(item === "Strength declining" ? "Strength evidence is mixed" : item)}`)
    : ["- No positive evidence available."];
  const negativeSource = intelligence.watchItems.length ? intelligence.watchItems : composite.evidence.negative;
  const negative = negativeSource.length
    ? uniqueEvidenceLines(negativeSource).map((item) => `- ${clarifyCoachExportLine(item === "Strength declining" ? "Strength evidence is mixed" : item)}`)
    : ["- No negative evidence available."];
  const muscleNarrative =
    intelligence.narrative.find((item) => item.startsWith("Muscle Preservation:")) ??
    "Muscle Preservation: Continue monitoring lean-mass estimates alongside strength and waist trend.";

  return [
    "Lean Preservation",
    "",
    "Raw Metrics",
    `- Lean Mass: ${formatValue(composite.rawMetrics.leanMassLatest, 1, " lb")} (14d ${formatSigned(composite.rawMetrics.leanMassDelta14d, 1, " lb")})`,
    "",
    "Composite",
    `- ${composite.status}`,
    `- Confidence: ${composite.confidence}`,
    "",
    "Evidence",
    "",
    "Positive",
    ...positive,
    "",
    "Negative",
    ...negative,
    "",
    "Coach Interpretation",
    composite.coachInterpretation
      ? `- ${composite.coachInterpretation}`
      : `- ${muscleNarrative.replace(/^Muscle Preservation:\s*/, "")}`,
    "",
  ];
}

function formatAnchorLift(lift: CoachExportAnchorLift) {
  if (lift.e1rm == null || lift.effectiveWeightLb == null || lift.reps == null) {
    return `- ${lift.pattern}: Insufficient Data`;
  }

  const name = lift.trackDisplayName || lift.exerciseName || "Unknown";
  const recency = formatAnchorRecencyLabel(lift);
  return `- ${lift.pattern}: ${name} | effective ${formatValue(lift.effectiveWeightLb, 0, " lb")} x ${formatValue(lift.reps, 0)} | e1RM ${formatValue(lift.e1rm, 0)} | ${formatDate(lift.performedAt)}${recency ? ` | ${recency}` : ""}`;
}

function formatPerformanceAnchorsSection(metrics: CoachExportMetrics): string[] {
  if (!metrics.anchorLifts.length) return [];

  return [
    "Performance Anchors",
    ...metrics.anchorLifts.map(formatAnchorLift),
    "",
  ];
}

function formatCurrentMovementFocusSection(metrics: CoachExportMetrics): string[] {
  if (!metrics.currentMovementFocus?.length) return [];

  return [
    "Current Movement Focus",
    ...metrics.currentMovementFocus.map(
      (group) => `- ${group.label}: ${group.exercises.join("; ")}`
    ),
    "",
  ];
}

function formatPhaseQualityHeading(phase: CurrentPhase) {
  if (phase === "bulk") return "Bulk / Phase Quality";
  if (phase === "maintain") return "Maintenance / Phase Quality";
  return "Cut / Phase Quality";
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
  const nextWorkoutFocusHasContent =
    metrics.nextWorkoutFocus.progressionGuardrails.length ||
    metrics.nextWorkoutFocus.executionPriorities.length ||
    metrics.nextWorkoutFocus.adjustmentTriggers.length;
  const nextWorkoutFocusLines = nextWorkoutFocusHasContent ? [
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
    ] : [];
  if (nextWorkoutFocusLines[nextWorkoutFocusLines.length - 1] === "") {
    nextWorkoutFocusLines.pop();
  }

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

  const phaseQualityDriverLines = metrics.phaseQuality?.drivers?.length
    ? metrics.phaseQuality.drivers
        .filter((driver) => (metrics.leanPreservation ? !/^Lean Preservation\s*:/i.test(driver) : true))
        .filter((driver) => !/^Status\s*:/i.test(driver))
        .slice(0, 4)
        .map((driver) => `- ${clarifyCoachExportLine(driver)}`)
    : ["- Drivers: Insufficient Data"];

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
  const bodyTrendInputs = metrics.bodyTrendInputs;

  const lines = [
    "IronForge Coach Export",
    `Generated: ${formatDate(metrics.generatedAt)}`,
    "",
    "Body Composition (14d trends)",
    ...(bodyTrendInputs ? ["- Coach body trends use a rolling 5-entry average for weight, body fat %, lean mass, and fat mass, except waist."] : []),
    bodyTrendInputs
      ? formatCoachTrendMetricLine("Weight", bodyTrendInputs.weight14d, " lb")
      : formatMetricLine("Weight", metrics.bodyComp.weight.latest, metrics.bodyComp.weight.delta14d, " lb"),
    bodyTrendInputs
      ? `- Waist: ${formatValue(metrics.bodyComp.waist.latest, 1, " in")} latest/manual (14d ${formatSigned(metrics.bodyComp.waist.delta14d, 1, " in")})`
      : formatMetricLine("Waist", metrics.bodyComp.waist.latest, metrics.bodyComp.waist.delta14d, " in"),
    bodyTrendInputs
      ? formatCoachTrendMetricLine("Body Fat %", bodyTrendInputs.bodyFatPct, "%")
      : formatMetricLine("Body Fat %", metrics.bodyComp.bodyFatPct.latest, metrics.bodyComp.bodyFatPct.delta14d, "%"),
    bodyTrendInputs
      ? formatCoachTrendMetricLine("Lean Mass", bodyTrendInputs.leanMass, " lb")
      : formatMetricLine("Lean Mass", metrics.bodyComp.leanMass.latest, metrics.bodyComp.leanMass.delta14d, " lb"),
    ...(bodyTrendInputs?.fatMass ? [formatCoachTrendMetricLine("Fat Mass", bodyTrendInputs.fatMass, " lb")] : []),
    `- Bodyweight delta 7d: ${formatSigned(bodyTrendInputs?.weight7d?.delta14d ?? metrics.bodyComp.bodyweightDelta7d, 1, " lb")}`,
    `- Bodyweight delta 14d: ${formatSigned(bodyTrendInputs?.weight14d?.delta14d ?? metrics.bodyComp.bodyweightDelta14d, 1, " lb")}`,
    "",
    ...formatWaistToHeightSection(metrics),
    ...formatCoachSummarySection(metrics),
    ...formatGoalProgressSection(metrics),
    ...formatLeanPreservationSectionV2(metrics),
    ...formatVisceralFatSection(metrics),
    formatPhaseQualityHeading(metrics.currentPhase),
    `- Status: ${metrics.phaseQuality?.finalStatus ?? "Insufficient Data"}`,
    `- Confidence: ${metrics.phaseQuality?.confidence ?? "Unknown"}`,
    ...phaseQualityDriverLines,
    "",
    "Hydration",
    `- Latest body water %: ${formatValue(metrics.hydration.latestWaterPct, 1, "%")}`,
    `- Confidence: ${metrics.hydration.confidenceLabel}${metrics.hydration.confidenceScore != null ? ` (${Math.round(metrics.hydration.confidenceScore)})` : ""}`,
    ...(hydrationNoteDuplicatesPhase ? [] : [`- Note: ${hydrationNote}`]),
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
    ...formatPerformanceAnchorsSection(metrics),
    ...formatCurrentMovementFocusSection(metrics),
    "",
    ...(nextWorkoutFocusLines.length ? [...nextWorkoutFocusLines, ""] : []),
    ...(trainingSignalLines.length ? [...trainingSignalLines, ""] : []),
    ...patternSummaryLines,
    ...(readinessNoteLines.length
      ? ["", "Readiness / Confidence Notes", ...readinessNoteLines]
      : []),
    ...(dataGapLines.length ? ["", "Data Gaps", ...dataGapLines] : []),
  ];

  return lines.join("\n");
}
