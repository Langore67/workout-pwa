import type { CoachExportMetrics } from "../coachExport/types";
import type { CoachState } from "../coachState/coachStateTypes";
import type {
  CoachReport,
  CoachReportAnchor,
  CoachReportBody,
  CoachReportCardio,
  CoachReportGoals,
  CoachReportLine,
  CoachReportLearnings,
  CoachReportPerformance,
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

  const line: CoachReportLine = {
    label,
    value,
    text: `- ${label}: ${value}`,
    latest: latestText,
    coachAverage: averageText,
    method,
    delta: delta != null ? fmtSigned(delta, 1, unit) : undefined,
  };
  return line;
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

function formatGoalTargetRow(row: CoachState["goals"]["targets"][number]): CoachReportLine {
  const current = fmtBodyMetricValue(row.current, row.unit === "ratio" ? 3 : row.unit === "pts" ? 1 : 1, row.unit === "pts" ? "%" : row.unit === "ratio" ? "" : row.unit ? ` ${row.unit}` : "");
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

  const cardio = formatCardioSection(coachState.cardio);

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
    performance,
    goals,
    learnings,
    cardio,
  };
}
