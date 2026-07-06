import type { CoachExportMetrics } from "../coachExport/types";
import type { CoachState } from "../coachState/coachStateTypes";
import { buildCoachIntelligence, clarifyCoachExportLine } from "../coachExport/coachIntelligence";
import {
  buildCoachingMemory,
  isActiveWatchSignal,
  isGenericStaleDiscussPrompt,
  normalizeCoachingMemoryText,
} from "../coachExport/coachingMemory";
import type {
  CoachReport,
  CoachReportAnchor,
  CoachReportBody,
  CoachReportCardio,
  CoachReportGoals,
  CoachReportLine,
  CoachReportLearnings,
  CoachReportPerformance,
  CoachReportSection,
  CoachReportSnapshot,
} from "./coachReportTypes";

function fmtNumber(value?: number | null, decimals = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const fixed = value.toFixed(decimals);
  return fixed.replace(/\.0+$/, "");
}

function fmtSigned(value?: number | null, decimals = 1, suffix = "") {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const fixed = value.toFixed(decimals).replace(/\.0+$/, "");
  return value > 0 ? `+${fixed}${suffix}` : `${fixed}${suffix}`;
}

function fmtStatus(value?: string) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "—";
  if (normalized === "not_enough_data") return "Not Enough Data";
  return normalized
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function fmtConfidence(value?: string) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "high") return "High";
  if (normalized === "moderate" || normalized === "medium") return "Moderate";
  if (normalized === "low") return "Low";
  return "—";
}

function fmtConfidencePhrase(value?: string) {
  const label = fmtConfidence(value);
  return label === "—" ? "—" : `${label} confidence`;
}

function fmtCardioWindowSummary(count?: number, durationSeconds?: number, distanceMeters?: number) {
  const parts = [count != null ? `${count} walk${count === 1 ? "" : "s"}` : null];
  if (typeof durationSeconds === "number" && Number.isFinite(durationSeconds) && durationSeconds > 0) {
    const mins = Math.floor(durationSeconds / 60);
    const hrs = Math.floor(mins / 60);
    const rem = mins % 60;
    const duration =
      hrs > 0 ? `${hrs} hr${hrs === 1 ? "" : "s"}${rem > 0 ? ` ${rem} min` : ""}` : `${mins} min`;
    parts.push(duration);
  }
  if (typeof distanceMeters === "number" && Number.isFinite(distanceMeters) && distanceMeters > 0) {
    parts.push(`${(distanceMeters / 1609.344).toFixed(1)} mi`);
  }
  return parts.filter(Boolean).join(" | ") || "—";
}

function fmtCardioRecentSummary(recent?: NonNullable<CoachState["cardio"]["recent"]> | null) {
  if (!recent) return "—";
  const date = new Date(recent.startedAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const parts = [
    date,
    recent.name,
    recent.durationSeconds != null ? `${Math.floor(recent.durationSeconds / 60)} min` : null,
    recent.distanceMeters != null ? `${(recent.distanceMeters / 1609.344).toFixed(1)} mi` : null,
    recent.paceSecondsPerMile != null
      ? `${Math.floor(recent.paceSecondsPerMile / 60)}:${String(Math.round(recent.paceSecondsPerMile % 60)).padStart(2, "0")}/mi`
      : null,
  ].filter(Boolean);
  return parts.join(" | ") || "—";
}

function fmtBodyMetricValue(value?: number | null, digits = 1, suffix = "") {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return `${fmtNumber(value, digits)}${suffix}`;
}

function formatDate(ms: number | null | undefined) {
  if (ms == null || !Number.isFinite(ms)) return "Unknown";
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function buildLine(label: string, value: string): CoachReportLine {
  return { label, value, text: `- ${label}: ${value}` };
}

function buildBodyValueLine(
  label: string,
  metric:
    | {
        rawLatest: number | null;
        rolling5: number | null;
        sampleCount: number;
        delta14d?: number | null;
      }
    | undefined,
  unit: string,
  manualOnly = false
): CoachReportLine | null {
  if (!metric && !manualOnly) return null;

  const latest = metric?.rawLatest;
  const average = metric?.rolling5;
  const hasLatest = latest != null && Number.isFinite(latest);
  const hasAverage = average != null && Number.isFinite(average);
  const distinctAverage =
    !manualOnly &&
    hasLatest &&
    hasAverage &&
    (metric?.sampleCount ?? 0) > 1 &&
    Math.abs((average as number) - (latest as number)) > 0.0001;
  const delta = metric?.delta14d != null && Number.isFinite(metric.delta14d) ? metric.delta14d : null;

  let value = "—";
  let method: CoachReportLine["method"] = "raw";
  const latestText = hasLatest ? fmtBodyMetricValue(latest, 1, unit) : undefined;
  const averageText = hasAverage ? fmtBodyMetricValue(average, 1, unit) : undefined;

  if (manualOnly) {
    value = `${latestText ?? "—"} latest/manual${delta != null ? ` | 14d ${fmtSigned(delta, 1, unit)}` : ""}`;
    method = "latest_manual";
  } else if (distinctAverage && latestText && averageText) {
    value = `${latestText} latest · ${averageText} coach avg${delta != null ? ` | 14d ${fmtSigned(delta, 1, unit)}` : ""}`;
    method = "rolling_5";
  } else if (hasLatest && hasAverage && latestText && averageText) {
    value = `${latestText} latest / ${averageText} coach avg${delta != null ? ` | 14d ${fmtSigned(delta, 1, unit)}` : ""}`;
    method = "rolling_5";
  } else if (hasLatest && latestText) {
    value = `${latestText} latest/manual${delta != null ? ` | 14d ${fmtSigned(delta, 1, unit)}` : ""}`;
    method = "latest_manual";
  } else if (hasAverage && averageText) {
    value = `${averageText} coach avg${delta != null ? ` | 14d ${fmtSigned(delta, 1, unit)}` : ""}`;
    method = "rolling_5";
  }

  return {
    label,
    value,
    text: `- ${label}: ${value}`,
    latest: latestText,
    coachAverage: averageText,
    method,
    delta: delta != null ? fmtSigned(delta, 1, unit) : undefined,
  };
}

function fmtSnapshotWhy(state: CoachState) {
  return state.snapshot.narrative ?? state.snapshot.biggestRisk ?? state.snapshot.biggestWin ?? "—";
}

function fmtPerformanceRead(state: CoachState) {
  const trend = String(state.strength.performanceTrend ?? "").trim();
  const movement = String(state.strength.movementQuality ?? "").trim();
  const anchor = state.strength.anchors?.[0];
  const hasHistoricalAnchor =
    anchor?.recency === "historical" || anchor?.recency === "stale" || anchor?.isStale;

  if (trend === "Regressing" || trend === "Mixed" || movement === "Watch" || movement === "Mixed") {
    return hasHistoricalAnchor
      ? "Historical anchors remain useful, but recent strength signal is pressured."
      : "Recent strength signal is pressured.";
  }

  if (trend === "Improving") {
    return "Recent strength trend is improving, with cleaner movement noted in recent sessions.";
  }

  if (trend === "Stable") {
    return "Strength is holding steady, with no major movement-quality limiter in recent sessions.";
  }

  return hasHistoricalAnchor
    ? "Historical anchors are still useful context."
    : "Recent performance evidence is still building.";
}

function fmtGoalRead(state: CoachState) {
  const rows = state.goals.targets ?? [];
  if (!rows.length) return "—";

  const findRow = (pattern: RegExp) => rows.find((row) => pattern.test(row.label));
  const weight = findRow(/^Weight$/i);
  const waist = findRow(/waist/i);
  const bodyFat = findRow(/body fat/i);
  const status = String(state.goals.trajectoryStatus ?? "").trim().toLowerCase();

  const weightClose =
    weight != null &&
    typeof weight.remaining === "number" &&
    Number.isFinite(weight.remaining) &&
    weight.remaining <= Math.max(5, Math.abs(weight.target) * 0.08);
  const bodyCompNeedsConfirmation =
    [waist, bodyFat].filter(
      (row) => row != null && typeof row.remaining === "number" && Number.isFinite(row.remaining) && row.remaining > 0
    ).length > 0;

  if (status === "watch") {
    if (weightClose && bodyCompNeedsConfirmation) {
      return "Weight goal is close, but waist/body-fat goals need cleaner confirmation.";
    }
    return "Trajectory is watchable; keep the cut conservative and confirm the body-composition trend.";
  }

  if (status === "intervene") {
    return "Body-composition trend is not yet close enough to relax progression.";
  }

  if (status === "solid") {
    return "Goal trajectory is moving in the right direction.";
  }

  return "Goal trajectory still needs more data before it can be called clearly.";
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

function formatCardioSection(cardio: CoachState["cardio"]): CoachReportCardio {
  if (!cardio.available) {
    return {
      status: fmtStatus(cardio.status),
      rows: [],
      note: "Cardio summary not available yet.",
      isEmpty: true,
    };
  }

  const rows: CoachReportLine[] = [
    buildLine("Last 7 Days", fmtCardioWindowSummary(cardio.walkCount7d, cardio.totalDuration7dSeconds, cardio.totalDistance7dMeters)),
    buildLine(
      "Last 28 Days",
      fmtCardioWindowSummary(cardio.walkCount28d, cardio.totalDuration28dSeconds, cardio.totalDistance28dMeters)
    ),
  ];

  if (cardio.recent) {
    rows.push(buildLine("Recent Walk/Cardio", fmtCardioRecentSummary(cardio.recent)));
  }

  return {
    status: fmtStatus(cardio.status),
    rows,
    note: cardio.note,
  };
}

export function hasCoachReportDashboardContent(
  report?: Pick<CoachReport, "body" | "performance" | "goals" | "learnings" | "cardio"> | null
) {
  if (!report) return false;
  const hasMeaningfulText = (value?: string | null) => {
    const normalized = String(value ?? "").trim();
    if (!normalized) return false;
    return !/^(?:—|not enough data|unknown)$/i.test(normalized);
  };
  return Boolean(
    (report.body?.values?.length ?? 0) > 0 ||
      hasMeaningfulText(report.performance?.trend) ||
      hasMeaningfulText(report.performance?.strengthSignal) ||
      hasMeaningfulText(report.performance?.movementQuality) ||
      hasMeaningfulText(report.performance?.anchor?.text) ||
      hasMeaningfulText(report.performance?.read) ||
      hasMeaningfulText(report.goals?.trajectory) ||
      hasMeaningfulText(report.goals?.read) ||
      (report.goals?.targets?.length ?? 0) > 0 ||
      (report.learnings?.whatsWorking?.length ?? 0) > 0 ||
      (report.learnings?.watchNow?.length ?? 0) > 0 ||
      (report.cardio?.isEmpty === false &&
        Boolean(
          hasMeaningfulText(report.cardio.status) ||
            hasMeaningfulText(report.cardio.note) ||
            (report.cardio.rows?.length ?? 0) > 0
        ))
  );
}

function buildWaistToHeightReportSection(metrics: CoachExportMetrics): CoachReportSection | undefined {
  const whtr = metrics.bodyComp.waistToHeight;
  if (!whtr || whtr.latest == null || !Number.isFinite(whtr.latest)) return undefined;

  const rows: CoachReportLine[] = [
    { label: "Current", value: whtr.latest.toFixed(3), text: `- Current: ${whtr.latest.toFixed(3)}` },
  ];
  if (whtr.delta14d != null && Number.isFinite(whtr.delta14d)) {
    rows.push({ label: "14d trend", value: fmtSigned(whtr.delta14d, 3), text: `- 14d trend: ${fmtSigned(whtr.delta14d, 3)}` });
  }
  rows.push(
    { label: "Status", value: whtr.status, text: `- Status: ${whtr.status}` },
    { label: "Healthy threshold", value: "< 0.500", text: "- Healthy threshold: < 0.500" },
    {
      label: "Waist needed for threshold",
      value: `${fmtNumber(whtr.healthyWaistTargetIn, 1)} in`,
      text: `- Waist needed for threshold: ${fmtNumber(whtr.healthyWaistTargetIn, 1)} in`,
    },
    {
      label: "Distance to threshold",
      value: `${fmtNumber(whtr.distanceToThresholdIn, 1)} in`,
      text: `- Distance to threshold: ${fmtNumber(whtr.distanceToThresholdIn, 1)} in`,
    }
  );

  return {
    title: "Waist-to-Height Ratio",
    rows,
  };
}

function buildCoachSummaryReportSection(metrics: CoachExportMetrics): CoachReportSection {
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

  return {
    title: "Coach Summary",
    rows: [
      { label: "Overall", value: intelligence.overallStatus, text: `- Overall: ${intelligence.overallStatus}` },
      { label: "Confidence", value: intelligence.confidence, text: `- Confidence: ${intelligence.confidence}` },
    ],
    blocks: [
      ...(summary ? [{ heading: "Summary", items: [summary] }] : []),
      ...(biggestWin ? [{ heading: "Biggest Win", items: [biggestWin] }] : []),
      ...(biggestRisk ? [{ heading: "Biggest Risk", items: [biggestRisk] }] : []),
      { heading: "Fat Loss", items: [intelligence.fatLossStatus, fatLossNarrative.replace(/^Fat Loss:\s*/, "")] },
      {
        heading: "Muscle Preservation",
        items: [intelligence.musclePreservationStatus, muscleNarrative.replace(/^Muscle Preservation:\s*/, "")],
      },
      {
        heading: "Training",
        items: [
          `Performance Trend: ${intelligence.performanceTrendStatus}`,
          performanceNarrative.replace(/^Performance Trend:\s*/, ""),
          `Movement Quality: ${intelligence.movementQualityStatus}`,
          movementNarrative.replace(/^Movement Quality:\s*/, ""),
        ],
      },
      { heading: "Recommendations", items: intelligence.recommendations.slice() },
    ],
  };
}

function buildHydrationReportSection(metrics: CoachExportMetrics): CoachReportSection {
  const phaseDriverKeys = new Set((metrics.phaseQuality?.drivers ?? []).map((driver) => normalizeNarrativeLine(driver)));
  const hydrationNote = metrics.hydration.note || "Unknown";
  const hydrationNoteDuplicatesPhase =
    phaseDriverKeys.has(normalizeNarrativeLine(hydrationNote)) &&
    /hydration|impedance|lean mass|body-fat/i.test(hydrationNote);

  return {
    title: "Hydration",
    rows: [
      {
        label: "Latest body water %",
        value: fmtNumber(metrics.hydration.latestWaterPct, 1, "%"),
        text: `- Latest body water %: ${fmtNumber(metrics.hydration.latestWaterPct, 1, "%")}`,
      },
      {
        label: "Confidence",
        value:
          `${metrics.hydration.confidenceLabel}${metrics.hydration.confidenceScore != null ? ` (${Math.round(metrics.hydration.confidenceScore)})` : ""}`,
        text: `- Confidence: ${metrics.hydration.confidenceLabel}${metrics.hydration.confidenceScore != null ? ` (${Math.round(metrics.hydration.confidenceScore)})` : ""}`,
      },
    ],
    note: hydrationNoteDuplicatesPhase ? undefined : hydrationNote,
  };
}

function buildTrainingSignalsReportSection(metrics: CoachExportMetrics): CoachReportSection | undefined {
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

  const groups = [
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

  if (!groups.length) return undefined;

  return {
    title: "Training Signals (Recent Sessions)",
    blocks: groups.map((group) => ({
      heading: group.heading,
      items: group.items.map((item) => clarifyCoachExportLine(item)),
    })),
  };
}

function buildReadinessNotesReportSection(metrics: CoachExportMetrics): CoachReportSection | undefined {
  const phaseDriverKeys = new Set((metrics.phaseQuality?.drivers ?? []).map((driver) => normalizeNarrativeLine(driver)));
  const notes = metrics.readinessNotes
    .filter((note) => !isDuplicateReadinessNote(note, metrics, phaseDriverKeys))
    .map((note) => clarifyCoachExportLine(note || "Unknown"));

  if (!notes.length) return undefined;

  return {
    title: "Readiness / Confidence Notes",
    bullets: notes,
  };
}

function buildDataGapsReportSection(metrics: CoachExportMetrics): CoachReportSection | undefined {
  const notes = metrics.dataNotes.filter((note) => !/^No major data gaps detected\.?$/i.test(String(note ?? "").trim()));
  if (!notes.length) return undefined;

  return {
    title: "Data Gaps",
    bullets: notes.map((note) => note || "Unknown"),
  };
}

function formatGoalTargetRow(row: CoachState["goals"]["targets"][number]): CoachReportLine {
  const current = fmtBodyMetricValue(
    row.current,
    row.unit === "ratio" ? 3 : row.unit === "pts" ? 1 : 1,
    row.unit === "pts" ? "%" : row.unit === "ratio" ? "" : row.unit ? ` ${row.unit}` : ""
  );
  const target =
    row.label === "Waist-to-Height Ratio"
      ? `< ${Number.isFinite(row.target) ? row.target.toFixed(3) : "—"}`
      : row.label === "Visceral Fat"
        ? Number.isInteger(row.target)
          ? String(row.target)
          : row.target.toFixed(1)
        : row.unit === "ratio"
          ? row.target.toFixed(3)
          : row.unit === "pts"
            ? `${row.target.toFixed(1)}%`
            : `${row.target.toFixed(1)} ${row.unit}`;

  const remaining =
    row.remaining <= 0
      ? "reached"
      : row.unit === "ratio"
        ? `${row.remaining.toFixed(3)} remaining`
        : row.unit === "pts"
          ? `${row.remaining.toFixed(1)} pts remaining`
          : row.unit === ""
            ? `${Number.isInteger(row.remaining) ? String(row.remaining) : row.remaining.toFixed(1)} remaining`
            : `${row.remaining.toFixed(1)} ${row.unit} remaining`;

  const value = `${current} -> ${target} | ${remaining} • ${fmtStatus(row.status)}`;
  return {
    label: row.label,
    value,
    text: `- ${row.label}: ${value}`,
  };
}

function hasSectionContent(section?: CoachReportSection | null) {
  if (!section) return false;
  return Boolean(
    section.status ||
      section.confidence ||
      (section.rows?.length ?? 0) > 0 ||
      (section.bullets?.length ?? 0) > 0 ||
      (section.positive?.length ?? 0) > 0 ||
      (section.negative?.length ?? 0) > 0 ||
      section.note ||
      (section.blocks?.length ?? 0) > 0
  );
}

function lineText(label: string, value: string) {
  return `- ${label}: ${value}`;
}

function formatVisceralFatValue(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "Unknown";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatAnchorRecencyLabel(lift: NonNullable<CoachExportMetrics["anchorLifts"]>[number]) {
  if (lift.ageDays == null || !Number.isFinite(lift.ageDays)) return null;
  const age = Math.max(0, Math.floor(lift.ageDays));
  if (lift.recency === "stale") return `${age}d old | stale anchor`;
  if (lift.recency === "historical") return `${age}d old | historical anchor`;
  if (lift.recency === "recent") return `${age}d old | recent anchor`;
  return `${age}d old`;
}

function formatAnchorLiftText(lift: NonNullable<CoachExportMetrics["anchorLifts"]>[number]) {
  if (lift.e1rm == null || lift.effectiveWeightLb == null || lift.reps == null) {
    return `- ${lift.pattern}: Insufficient Data`;
  }

  const name = lift.trackDisplayName || lift.exerciseName || "Unknown";
  const recency = formatAnchorRecencyLabel(lift);
  return `- ${lift.pattern}: ${name} | effective ${fmtNumber(lift.effectiveWeightLb, 0)} lb x ${fmtNumber(lift.reps, 0)} | e1RM ${fmtNumber(lift.e1rm, 0)} | ${formatDate(lift.performedAt)}${recency ? ` | ${recency}` : ""}`;
}

function buildLeanPreservationReportSection(metrics: CoachExportMetrics): CoachReportSection | undefined {
  const composite = metrics.leanPreservation;
  if (!composite) return undefined;

  const intelligence = metrics.coachIntelligence ?? buildCoachIntelligence(metrics);
  const positive = composite.evidence.positive.length
    ? composite.evidence.positive.map((item) => `✓ ${clarifyCoachExportLine(item)}`)
    : [];
  const negativeSource = intelligence.watchItems.length ? intelligence.watchItems : composite.evidence.negative;
  const negative = negativeSource.length ? negativeSource.map((item) => `• ${clarifyCoachExportLine(item)}`) : [];

  return {
    title: "Lean Preservation",
    rows: [
      {
        label: "Raw Metrics",
        value: `Lean Mass: ${fmtNumber(composite.rawMetrics.leanMassLatest, 1)} lb (14d ${fmtSigned(composite.rawMetrics.leanMassDelta14d, 1, " lb")})`,
        text: lineText("Raw Metrics", `Lean Mass: ${fmtNumber(composite.rawMetrics.leanMassLatest, 1)} lb (14d ${fmtSigned(composite.rawMetrics.leanMassDelta14d, 1, " lb")})`),
      },
      { label: "Composite", value: composite.status, text: lineText("Composite", composite.status) },
      { label: "Confidence", value: composite.confidence, text: lineText("Confidence", composite.confidence) },
    ],
    positive,
    negative,
    blocks: [
      {
        heading: "Coach Interpretation",
        items: [composite.coachInterpretation ? composite.coachInterpretation : "No additional interpretation."],
      },
    ],
  };
}

function buildVisceralFatReportSection(metrics: CoachExportMetrics): CoachReportSection | undefined {
  const visceralFat = metrics.bodyComp.visceralFat;
  if (!visceralFat || visceralFat.latest == null || !Number.isFinite(visceralFat.latest)) return undefined;

  const trend = fmtSigned(visceralFat.delta14d, 0);
  const direction =
    visceralFat.delta14d == null || !Number.isFinite(visceralFat.delta14d)
      ? "Unknown"
      : visceralFat.delta14d < 0
        ? "Improving"
        : visceralFat.delta14d > 0
          ? "Worsening"
          : "Flat";

  return {
    title: "Visceral Fat",
    rows: [
      { label: "Latest estimate", value: formatVisceralFatValue(visceralFat.latest), text: lineText("Latest estimate", formatVisceralFatValue(visceralFat.latest)) },
      { label: "14d trend", value: trend, text: lineText("14d trend", trend) },
      { label: "Direction", value: direction, text: lineText("Direction", direction) },
      { label: "Confidence", value: visceralFat.delta14d == null ? "Low" : "Moderate", text: lineText("Confidence", visceralFat.delta14d == null ? "Low" : "Moderate") },
    ],
    note: "Hume visceral fat is an estimate. Use trend alongside waist circumference rather than as an absolute measurement.",
  };
}

function buildPhaseQualityReportSection(metrics: CoachExportMetrics): CoachReportSection | undefined {
  const phase = metrics.phaseQuality;
  if (!phase) return undefined;
  const drivers = phase.drivers
    .filter((driver) => !/^Status\s*:/i.test(driver))
    .filter((driver) => !/^Lean Preservation\s*:/i.test(driver));

  return {
    title: "Cut / Phase Quality",
    status: phase.finalStatus,
    confidence: phase.confidence,
    rows: [
      { label: "Quadrant", value: phase.quadrantLabel, text: lineText("Quadrant", phase.quadrantLabel) },
      { label: "Quadrant Note", value: phase.quadrantNote, text: lineText("Quadrant Note", phase.quadrantNote) },
    ],
    blocks: drivers.length
      ? [
          {
            heading: "Drivers",
            items: drivers.map((driver) => clarifyCoachExportLine(driver)),
          },
        ]
      : undefined,
  };
}

function buildStrengthSignalReportSection(metrics: CoachExportMetrics): CoachReportSection {
  const rows: NonNullable<CoachReportSection["rows"]> = [
    { label: "Primary metric", value: "IronForge's blended strength trend metric.", text: lineText("Primary metric", "IronForge's blended strength trend metric.") },
    { label: "Current", value: fmtNumber(metrics.strengthSignal.current, 2), text: lineText("Current", fmtNumber(metrics.strengthSignal.current, 2)) },
    { label: "14d delta", value: fmtSigned(metrics.strengthSignal.delta14d, 2), text: lineText("14d delta", fmtSigned(metrics.strengthSignal.delta14d, 2)) },
    { label: "Vs 90d best", value: fmtSigned(metrics.strengthSignal.vs90dBestPct, 1, "%"), text: lineText("Vs 90d best", fmtSigned(metrics.strengthSignal.vs90dBestPct, 1, "%")) },
    {
      label: "Method",
      value: "Blended strength signal using Epley-based e1RM, allometric normalization (BW^0.67), and weekly snapshots from overlapping 28-day windows.",
      text: lineText("Method", "Blended strength signal using Epley-based e1RM, allometric normalization (BW^0.67), and weekly snapshots from overlapping 28-day windows."),
    },
    {
      label: "Relative Strength",
      value: "Secondary linear bodyweight comparison, distinct from Strength Signal.",
      text: lineText("Relative Strength", "Secondary linear bodyweight comparison, distinct from Strength Signal."),
    },
    {
      label: "Bodyweight used by strength engine",
      value: `${fmtNumber(metrics.strengthSignal.currentBodyweight, 1)} lb (${metrics.strengthSignal.bodyweightDaysUsed ?? "Unknown"} day avg sample; missing bodyweight lowers confidence)`,
      text: lineText(
        "Bodyweight used by strength engine",
        `${fmtNumber(metrics.strengthSignal.currentBodyweight, 1)} lb (${metrics.strengthSignal.bodyweightDaysUsed ?? "Unknown"} day avg sample; missing bodyweight lowers confidence)`
      ),
    },
    {
      label: "Export Confidence",
      value: `${metrics.exportConfidence.label} (${metrics.exportConfidence.score})`,
      text: lineText("Export Confidence", `${metrics.exportConfidence.label} (${metrics.exportConfidence.score})`),
    },
  ];

  const performanceAnchors = metrics.anchorLifts.length
    ? [
        {
          heading: "Performance Anchors",
          items: metrics.anchorLifts.map(formatAnchorLiftText),
        },
      ]
    : undefined;

  return {
    title: "Strength Signal",
    rows,
    blocks: performanceAnchors,
  };
}

function buildCurrentMovementFocusReportSection(metrics: CoachExportMetrics): CoachReportSection | undefined {
  if (!metrics.currentMovementFocus?.length) return undefined;

  return {
    title: "Current Movement Focus",
    rows: metrics.currentMovementFocus.map((group) => ({
      label: group.label,
      value: group.exercises.join("; "),
      text: lineText(group.label, group.exercises.join("; ")),
    })),
  };
}

function buildNextWorkoutFocusReportSection(metrics: CoachExportMetrics): CoachReportSection | undefined {
  const focus = metrics.nextWorkoutFocus;
  const hasContent =
    focus.progressionGuardrails.length || focus.executionPriorities.length || focus.adjustmentTriggers.length;
  if (!hasContent) return undefined;

  const blocks = [
    ...(focus.progressionGuardrails.length
      ? [{ heading: "Progression Guardrails", items: focus.progressionGuardrails.slice() }]
      : []),
    ...(focus.executionPriorities.length
      ? [{ heading: "Execution Priorities", items: focus.executionPriorities.slice() }]
      : []),
    ...(focus.adjustmentTriggers.length
      ? [{ heading: "Adjustment Triggers", items: focus.adjustmentTriggers.slice() }]
      : []),
  ];

  return {
    title: "Next Workout Focus",
    blocks,
  };
}

function buildRecentPatternsReportSection(metrics: CoachExportMetrics): CoachReportSection | undefined {
  const summary = metrics.patternSummary;
  const blocks = [
    ...(summary.movementQuality.length ? [{ heading: "Movement Quality", items: summary.movementQuality.slice() }] : []),
    ...(summary.stimulus.length ? [{ heading: "Stimulus", items: summary.stimulus.slice() }] : []),
    ...(summary.fatigue.length ? [{ heading: "Fatigue / Readiness", items: summary.fatigue.slice() }] : []),
    ...(summary.constraints.length ? [{ heading: "Constraints", items: summary.constraints.slice() }] : []),
    ...(summary.progression.length ? [{ heading: "Progression", items: summary.progression.slice() }] : []),
  ];

  if (!blocks.length) return undefined;

  return {
    title: "Recent Patterns (Last 4 Sessions)",
    blocks,
  };
}

export function buildCoachReport({
  coachState,
  metrics,
  generatedAt,
}: {
  coachState: CoachState;
  metrics: CoachExportMetrics;
  generatedAt?: number | string;
}): CoachReport {
  const bodyTrendInputs = metrics.bodyTrendInputs;
  const bodyValues: CoachReportLine[] = [];

  if (bodyTrendInputs?.weight14d) {
    const line = buildBodyValueLine("Weight", bodyTrendInputs.weight14d, " lb");
    if (line) bodyValues.push(line);
  } else if (coachState.body.latestWeightLb != null) {
    bodyValues.push({
      label: "Weight",
      value: `${fmtNumber(coachState.body.latestWeightLb)} lb${coachState.body.weightDelta14dLb != null ? ` (14d ${fmtSigned(coachState.body.weightDelta14dLb)} lb)` : ""}`,
      text: `- Weight: ${fmtNumber(coachState.body.latestWeightLb)} lb${coachState.body.weightDelta14dLb != null ? ` (14d ${fmtSigned(coachState.body.weightDelta14dLb)} lb)` : ""}`,
      method: "raw",
    });
  }

  if (coachState.body.latestWaistIn != null) {
    bodyValues.push({
      label: "Waist",
      value: `${fmtNumber(coachState.body.latestWaistIn)} in latest/manual${coachState.body.waistDelta14dIn != null ? ` | 14d ${fmtSigned(coachState.body.waistDelta14dIn)} in` : ""}`,
      text: `- Waist: ${fmtNumber(coachState.body.latestWaistIn)} in latest/manual${coachState.body.waistDelta14dIn != null ? ` | 14d ${fmtSigned(coachState.body.waistDelta14dIn)} in` : ""}`,
      method: "latest_manual",
    });
  }

  if (bodyTrendInputs?.bodyFatPct) {
    const line = buildBodyValueLine("Body Fat", bodyTrendInputs.bodyFatPct, "%");
    if (line) bodyValues.push(line);
  } else if (coachState.body.latestBodyFatPct != null) {
    bodyValues.push({
      label: "Body Fat",
      value: `${fmtNumber(coachState.body.latestBodyFatPct)}%`,
      text: `- Body Fat: ${fmtNumber(coachState.body.latestBodyFatPct)}%`,
      method: "raw",
    });
  }

  if (bodyTrendInputs?.leanMass) {
    const line = buildBodyValueLine("Lean Mass", bodyTrendInputs.leanMass, " lb");
    if (line) bodyValues.push(line);
  } else if (coachState.body.latestLeanMassLb != null) {
    bodyValues.push({
      label: "Lean Mass",
      value: `${fmtNumber(coachState.body.latestLeanMassLb)} lb`,
      text: `- Lean Mass: ${fmtNumber(coachState.body.latestLeanMassLb)} lb`,
      method: "raw",
    });
  }

  if (bodyTrendInputs?.fatMass) {
    const line = buildBodyValueLine("Fat Mass", bodyTrendInputs.fatMass, " lb");
    if (line) bodyValues.push(line);
  }

  const bodyConfidenceRows: CoachReportLine[] = coachState.body.confidence
    ? [
        buildLine("Overall confidence", fmtConfidencePhrase(coachState.body.confidence.overall)),
        buildLine("Weight trend confidence", fmtConfidencePhrase(coachState.body.confidence.weight)),
        buildLine("Waist trend confidence", fmtConfidencePhrase(coachState.body.confidence.waist)),
        buildLine("Lean mass confidence", fmtConfidencePhrase(coachState.body.confidence.leanMass)),
        buildLine("Body fat confidence", fmtConfidencePhrase(coachState.body.confidence.bodyFat)),
        buildLine("Hydration confidence", fmtConfidencePhrase(coachState.body.confidence.hydration)),
      ]
    : [];

  const performance: CoachReportPerformance = {
    trend: fmtStatus(coachState.strength.performanceTrend),
    strengthSignal:
      coachState.strength.strengthSignalCurrent != null
        ? [
            `${fmtNumber(coachState.strength.strengthSignalCurrent, 2)}`,
            coachState.strength.strengthSignalDelta14d != null ? `Δ ${fmtSigned(coachState.strength.strengthSignalDelta14d, 2)}` : null,
            coachState.strength.strengthSignalVsBestPct != null ? `vs best ${fmtSigned(coachState.strength.strengthSignalVsBestPct, 1)}%` : null,
          ]
            .filter(Boolean)
            .join(" | ")
        : undefined,
    movementQuality: fmtStatus(coachState.strength.movementQuality),
    anchor: coachState.strength.anchors?.[0]
      ? {
          label: "Anchor",
          text:
            [
              coachState.strength.anchors[0].pattern
                ? `${String(coachState.strength.anchors[0].pattern).charAt(0).toUpperCase()}${String(coachState.strength.anchors[0].pattern).slice(1)}`
                : "",
              coachState.strength.anchors[0].exerciseName ?? coachState.strength.anchors[0].trackDisplayName ?? "",
            ]
              .filter(Boolean)
              .join(": ") +
            " | " +
            [
              coachState.strength.anchors[0].effectiveWeightLb != null ? `${fmtNumber(coachState.strength.anchors[0].effectiveWeightLb)} lb` : null,
              coachState.strength.anchors[0].reps != null ? `${fmtNumber(coachState.strength.anchors[0].reps, 0)} reps` : null,
            ]
              .filter(Boolean)
              .join(" x ") +
            `${coachState.strength.anchors[0].e1rm != null ? ` | e1RM ${fmtNumber(coachState.strength.anchors[0].e1rm)} lb` : ""}` +
            `${typeof coachState.strength.anchors[0].ageDays === "number" && Number.isFinite(coachState.strength.anchors[0].ageDays) ? ` | ${Math.max(0, Math.floor(coachState.strength.anchors[0].ageDays))}d old` : ""}` +
            `${coachState.strength.anchors[0].recency === "stale" ? " | stale anchor" : coachState.strength.anchors[0].recency === "historical" ? " | historical anchor" : coachState.strength.anchors[0].recency === "recent" ? " | recent anchor" : ""}`,
          recency: coachState.strength.anchors[0].recency,
          ageText:
            typeof coachState.strength.anchors[0].ageDays === "number" && Number.isFinite(coachState.strength.anchors[0].ageDays)
              ? `${Math.max(0, Math.floor(coachState.strength.anchors[0].ageDays))}d old`
              : undefined,
          isStale: coachState.strength.anchors[0].isStale,
        }
      : undefined,
    read: fmtPerformanceRead(coachState),
  };

  const targets = (coachState.goals.targets ?? []).map(formatGoalTargetRow);
  const goals: CoachReportGoals = {
    trajectory: fmtStatus(coachState.goals.trajectoryStatus),
    read: fmtGoalRead(coachState),
    targets,
  };

  const learnings: CoachReportLearnings = {
    whatsWorking: coachState.learnings.validated.slice(0, 3),
    watchNow: coachState.learnings.watchItems.slice(0, 2),
  };

  const waistToHeight = buildWaistToHeightReportSection(metrics);
  const summary = buildCoachSummaryReportSection(metrics);
  const hydration = buildHydrationReportSection(metrics);
  const trainingSignals = buildTrainingSignalsReportSection(metrics);
  const readinessNotes = buildReadinessNotesReportSection(metrics);
  const dataGaps = buildDataGapsReportSection(metrics);
  const cardio = formatCardioSection(coachState.cardio);
  const exportOnly = {
    leanPreservation: buildLeanPreservationReportSection(metrics),
    visceralFat: buildVisceralFatReportSection(metrics),
    phaseQuality: buildPhaseQualityReportSection(metrics),
    strengthSignalDetails: buildStrengthSignalReportSection(metrics),
    currentMovementFocus: buildCurrentMovementFocusReportSection(metrics),
    nextWorkoutFocus: buildNextWorkoutFocusReportSection(metrics),
    recentPatterns: buildRecentPatternsReportSection(metrics),
  };

  return {
    generatedAt: generatedAt != null ? new Date(generatedAt as number).toLocaleString() : undefined,
    snapshot: {
      status: fmtStatus(coachState.snapshot.overallStatus),
      confidence: fmtConfidence(coachState.snapshot.confidence),
      why: fmtSnapshotWhy(coachState),
      today: coachState.snapshot.todayFocus ?? "—",
      biggestWin: coachState.snapshot.biggestWin ?? undefined,
      biggestRisk: coachState.snapshot.biggestRisk ?? undefined,
    } satisfies CoachReportSnapshot,
    body: {
      heading: "Body Values",
      note: "Coach trends use rolling 5-entry averages except waist. Latest is today's/raw reading. Coach avg is what Coach uses for trend decisions.",
      values: bodyValues,
      confidenceRows: bodyConfidenceRows,
    } satisfies CoachReportBody,
    waistToHeight,
    summary,
    hydration,
    trainingSignals,
    readinessNotes,
    dataGaps,
    performance,
    goals,
    learnings,
    cardio,
    exportOnly: Object.fromEntries(Object.entries(exportOnly).filter(([, section]) => hasSectionContent(section))) as NonNullable<
      CoachReport["exportOnly"]
    >,
  };
}
