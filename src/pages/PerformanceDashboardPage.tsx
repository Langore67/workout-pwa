// src/pages/PerformanceDashboardPage.tsx
/* ============================================================================
   PerformanceDashboardPage.tsx
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-03-28-PERFORMANCE-DASH-11
   FILE: src/pages/PerformanceDashboardPage.tsx

   Purpose
   - Provide IronForge's big-picture coaching dashboard
   - Combine strength, body composition, and training load into one coach view
   - Keep phase as an interpretation lens, not a data source override
   - Align the page shell with the shared Progress sub-page standard

   Changes (PERFORMANCE-DASH-11)
   ✅ Cleaned full-file formatting, spacing, and indentation
   ✅ Preserved shared breadcrumb navigation back to Progress
   ✅ Preserved current body metrics sourced from DB (not phase placeholders)
   ✅ Preserved shared Strength engine wiring for chart/history when available
   ✅ Preserved Performance-specific fallback chart/debug behavior
   ✅ Kept hero stats synchronized with shared chart-history availability
   ✅ Tightened page backlog items so they stay scoped to this page

   Prior version (PERFORMANCE-DASH-10)
   ✅ Clean up indentation and formatting throughout the file
   ✅ Refresh top versioning/comment header to reflect current page state
   ✅ Preserve working breadcrumb navigation back to Progress
   ✅ Preserve one-line hero stat tiles
   ✅ Preserve current body metrics sourced from DB (not phase placeholders)
   ✅ Preserve shared chart framework usage
   ✅ Preserve dashboard insights / debug / build priorities sections

   Notes
   - Phase changes interpretation only
   - Current Body Weight / Waist do not change when CUT / MAINTAIN / BULK changes
   - Shared TrendChartCard is the standard chart renderer for this page
   - Shared Strength engine is preferred when shared chart history is available
   ============================================================================ */

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Page, Section } from "../components/Page.tsx";
import { formatLbs } from "../components/charts/chartFormatters";
import type { ChartDatum, ChartSeriesConfig } from "../components/charts/chartTypes";
import ProgressPageHeader from "../components/layout/ProgressPageHeader";
import DashboardChartCard from "../components/performance/DashboardChartCard";
import PerformanceInsightsSection from "../components/performance/PerformanceInsightsSection";
import PerformanceOverviewSection from "../components/performance/PerformanceOverviewSection";
import PerformanceStrengthSignalSection from "../components/performance/PerformanceStrengthSignalSection";
import {
  computeStrengthIndex,
  computeStrengthTrend,
  type StrengthTrendRow,
} from "../strength/Strength";
import {
  getPerformanceAnchorIdsFromStrengthSignalV2,
  getSelectedAnchorLabelsByPattern,
} from "../strength/performanceAnchorContext";
import { buildStrengthPatternContributors } from "../strength/strengthContributors";
import {
  computeStrengthSignalV2,
  type StrengthSignalV2Result,
} from "../strength/v2/computeStrengthSignalV2";
import {
  buildPhaseQualityInputsFromBodyRows,
  computeStrengthDeltaFromStrengthTrend,
  evaluatePhaseQuality,
  type PhaseQualityResult,
} from "../body/phaseQualityModel";
import { dataReadinessConfidenceFromFlags } from "../body/dataReadinessConfidence";
import { computeHydrationConfidenceFromBodyRows } from "../body/hydrationConfidence";
import {
  db,
  type Exercise,
  type BodyMetricEntry,
  type Session,
  type SetEntry,
  type Track,
} from "../db";
import {
  dashboardPhaseToPhase,
  getCurrentPhase,
  phaseToDashboardPhase,
  setCurrentPhase,
} from "../config/appConfig";

/* ============================================================================
   Breadcrumb 1 — Types
   ============================================================================ */

export type DashboardPhase = "CUT" | "MAINTAIN" | "BULK";
export type DashboardRange = "4W" | "8W" | "12W" | "YTD" | "ALL";
export type TrendDirection = "improving" | "stable" | "declining" | "watch";

type ChartViewModel = {
  id: "strength" | "bodyWeight" | "waist" | "volume";
  title: string;
  subtitle: string;
  direction: TrendDirection;
  momentumMessage?: string;
  analysisRows: Array<{
    label: string;
    value: string;
  }>;
  interpretation: string;
  topMovers?: Array<{
    label: string;
    changePct: number;
    score: number;
  }>;
    movementBreakdown?: Array<{
      movement: string;
      score: number;
      exerciseCount: number;
      anchorLabel?: string | null;
      includedExercises: Array<{
        label: string;
        score: number;
      }>;
  }>;
};

type InsightViewModel = {
  id: string;
  title: string;
  status: string;
  confidence: string;
  body: string;
  evidence: string[];
  action?: string;
};

type DashboardViewModel = {
  activePhase: DashboardPhase;
  activeRange: DashboardRange;
  flagshipTitle: string;
  flagshipScore: number;
  flagshipBadge: string;
  heroSummary: string;
  flagshipBody: string;
  heroStats: Array<{ label: string; value: string }>;
  charts: {
    strength: ChartViewModel;
    bodyWeight: ChartViewModel;
    waist: ChartViewModel;
    volume: ChartViewModel;
  };
  insights: InsightViewModel[];
  actions: string[];
  debug: {
    dataSource: string;
    dateWindowUsed: string;
    confidenceLevel: string;
    exercisesCounted: number;
    currentSignal: string;
    topComposite: string;
    composites: Array<{
      movement: string;
      score: string;
      exerciseCount: number;
    }>;
    topExercises: Array<{
      label: string;
      changePct: string;
      score: string;
    }>;
  };
};

type ExerciseSignal = {
  exerciseId: string;
  label: string;
  movement: "push" | "pull" | "squat" | "hinge";
  changePct: number;
  normalizedScore: number;
};

type CompositeSignal = {
  movement: ExerciseSignal["movement"];
  score: number;
  exerciseCount: number;
  anchorLabel?: string | null;
  includedExercises: Array<{
    label: string;
    score: number;
  }>;
};

type StrengthSignalResult = {
  score: number;
  trend: TrendDirection;
  exerciseSignals: ExerciseSignal[];
  composites: CompositeSignal[];
  chartPoints: Array<{ week: string; value: number }>;
  summary: string;
};

type DbStrengthSource = {
  sessions: Session[];
  sets: SetEntry[];
  bodyMetrics: BodyMetricEntry[];
  tracks: Track[];
  exercises: Exercise[];
};

type DashboardBodySnapshot = {
  weightLabel: string;
  waistLabel: string;
  asOfLabel: string;
  weightValue?: number;
  waistValue?: number;
};

type MetricTrendSummary = {
  points: number;
  start: number | null;
  current: number | null;
  changeAbs: number;
  changePct: number;
};

/* ============================================================================
   Breadcrumb 2 — Static controls
   ============================================================================ */

const TIME_RANGES: DashboardRange[] = ["4W", "8W", "12W", "YTD", "ALL"];

/* ============================================================================
   Breadcrumb 3 — Small helpers
   ============================================================================ */

const DAY_MS = 24 * 60 * 60 * 1000;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatOneDecimal(value?: number) {
  if (value == null || !Number.isFinite(value)) return "—";
  const fixed = value.toFixed(1);
  return fixed.endsWith(".0") ? String(Math.round(value)) : fixed;
}

function formatVolume(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${Math.round(value).toLocaleString()} lb`;
}

function formatInches(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${formatOneDecimal(value)} in`;
}

function trendFromChange(changePct: number): TrendDirection {
  if (changePct >= 5) return "improving";
  if (changePct <= -3) return "declining";
  if (changePct > -3 && changePct < 2) return "stable";
  return "watch";
}

function rangeStartMs(range: DashboardRange, now = Date.now()): number | undefined {
  if (range === "4W") return now - 28 * DAY_MS;
  if (range === "8W") return now - 56 * DAY_MS;
  if (range === "12W") return now - 84 * DAY_MS;
  if (range === "YTD") {
    const d = new Date(now);
    return new Date(d.getFullYear(), 0, 1).getTime();
  }
  return undefined;
}

function weekKeyFromMs(ms: number) {
  const d = new Date(ms);
  const start = new Date(d);
  const day = start.getDay();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - day);
  return start.toISOString().slice(0, 10);
}

function weekLabelFromKey(key: string) {
  const d = new Date(`${key}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatRangeLabel(range: DashboardRange): string {
  switch (range) {
    case "4W":
      return "Last 4 weeks";
    case "8W":
      return "Last 8 weeks";
    case "12W":
      return "Last 12 weeks";
    case "YTD":
      return "Year to date";
    case "ALL":
      return "All available";
    default:
      return range;
  }
}

function pickBodyMetricTime(entry: BodyMetricEntry): number {
  return Number(entry.measuredAt ?? entry.takenAt ?? entry.createdAt ?? 0);
}

function analyzeMetricTrend(points: ChartDatum[]): MetricTrendSummary {
  const values = points
    .map((point) => point.value)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  if (!values.length) {
    return {
      points: 0,
      start: null,
      current: null,
      changeAbs: 0,
      changePct: 0,
    };
  }

  const start = values[0];
  const current = values[values.length - 1];
  const changeAbs = current - start;
  const changePct = start !== 0 ? ((current - start) / start) * 100 : 0;

  return {
    points: values.length,
    start: round2(start),
    current: round2(current),
    changeAbs: round2(changeAbs),
    changePct: round2(changePct),
  };
}

function getWeightTrendDirection(
  phase: DashboardPhase,
  trend: MetricTrendSummary
): TrendDirection {
  if (trend.points < 2) return "stable";

  if (phase === "CUT") {
    if (trend.changeAbs <= -0.75) return "improving";
    if (trend.changeAbs <= 0.75) return "stable";
    return "watch";
  }

  if (phase === "MAINTAIN") {
    if (Math.abs(trend.changeAbs) <= 0.75) return "improving";
    if (Math.abs(trend.changeAbs) <= 1.5) return "stable";
    return "watch";
  }

  if (trend.changeAbs >= 0.5 && trend.changeAbs <= 3) return "improving";
  if (trend.changeAbs >= 0 && trend.changeAbs <= 4) return "stable";
  return "watch";
}

function getWaistTrendDirection(
  phase: DashboardPhase,
  trend: MetricTrendSummary
): TrendDirection {
  if (trend.points < 2) return "stable";

  if (phase === "CUT") {
    if (trend.changeAbs <= -0.2) return "improving";
    if (trend.changeAbs <= 0.2) return "stable";
    return "declining";
  }

  if (phase === "MAINTAIN") {
    if (Math.abs(trend.changeAbs) <= 0.2) return "improving";
    if (Math.abs(trend.changeAbs) <= 0.4) return "stable";
    return "watch";
  }

  if (trend.changeAbs <= 0.2) return "improving";
  if (trend.changeAbs <= 0.5) return "stable";
  return "declining";
}

function buildPrimaryCoachingSignal(args: {
  phase: DashboardPhase;
  strengthSignal: StrengthSignalResult;
  bodySnapshot: DashboardBodySnapshot;
  weightTrend: MetricTrendSummary;
  waistTrend: MetricTrendSummary;
  sharedCutQuality?: PhaseQualityResult | null;
}) {
  const { phase, strengthSignal, bodySnapshot, weightTrend, waistTrend, sharedCutQuality } = args;

  if (phase === "CUT" && sharedCutQuality) {
    const status =
      sharedCutQuality.finalStatus === "High-Quality Cut"
        ? "Strong"
        : sharedCutQuality.finalStatus === "Acceptable Cut"
          ? "Good"
          : sharedCutQuality.finalStatus === "Recomp-Style Cut"
            ? "Mixed"
            : sharedCutQuality.finalStatus === "Aggressive Cut / Muscle-Risk Cut"
              ? "Watch"
              : "Mixed";

    const score =
      status === "Strong" ? 85 : status === "Good" ? 72 : status === "Watch" ? 45 : 58;

    const strengthEfficiency =
      bodySnapshot.weightValue && bodySnapshot.weightValue > 0
        ? round2((strengthSignal.score / bodySnapshot.weightValue) * 100)
        : undefined;

    return {
      title: "Cut Quality",
      score,
      badge: status,
      summary: "Cut quality is using the shared Body Composition phase-quality logic.",
      body: `${sharedCutQuality.finalStatus}. ${sharedCutQuality.quadrantNote} Confidence is ${sharedCutQuality.confidence.toLowerCase()}.`,
      confidence: sharedCutQuality.confidence,
      bullets: sharedCutQuality.drivers.slice(0, 3),
      strengthEfficiencyLabel:
        strengthEfficiency != null ? `${strengthEfficiency.toFixed(2)}` : "—",
    };
  }

  const strengthComponent = clamp((strengthSignal.score / 10) * 45, 0, 45);

  let weightComponent = 12;
  let waistComponent = 18;

  if (phase === "CUT") {
    weightComponent =
      weightTrend.points < 2
        ? 12
        : weightTrend.changeAbs <= -1.5
          ? 20
          : weightTrend.changeAbs <= -0.5
            ? 18
            : weightTrend.changeAbs <= 0
              ? 14
              : weightTrend.changeAbs <= 1
                ? 8
                : 4;

    waistComponent =
      waistTrend.points < 2
        ? 18
        : waistTrend.changeAbs <= -0.3
          ? 35
          : waistTrend.changeAbs <= -0.1
            ? 30
            : waistTrend.changeAbs <= 0.15
              ? 22
              : 10;
  } else if (phase === "MAINTAIN") {
    weightComponent =
      weightTrend.points < 2
        ? 12
        : Math.abs(weightTrend.changeAbs) <= 0.75
          ? 20
          : Math.abs(weightTrend.changeAbs) <= 1.5
            ? 16
            : Math.abs(weightTrend.changeAbs) <= 3
              ? 12
              : 8;

    waistComponent =
      waistTrend.points < 2
        ? 18
        : Math.abs(waistTrend.changeAbs) <= 0.2
          ? 35
          : Math.abs(waistTrend.changeAbs) <= 0.4
            ? 24
            : 12;
  } else {
    weightComponent =
      weightTrend.points < 2
        ? 12
        : weightTrend.changeAbs >= 0.5 && weightTrend.changeAbs <= 3
          ? 20
          : weightTrend.changeAbs >= 0 && weightTrend.changeAbs <= 4
            ? 15
            : 8;

    waistComponent =
      waistTrend.points < 2
        ? 18
        : waistTrend.changeAbs <= 0.2
          ? 35
          : waistTrend.changeAbs <= 0.5
            ? 24
            : 12;
  }

  const rawScore = strengthComponent + weightComponent + waistComponent;
  const score = round2(clamp(rawScore, 0, 100));

    const confidence = dataReadinessConfidenceFromFlags({
      hasWeight: weightTrend.points >= 2,
      hasWaist: waistTrend.points >= 2,
      hasStrength: strengthSignal.exerciseSignals.length >= 3,
    });

  const badge =
    score >= 80 ? "Strong" : score >= 65 ? "Good" : score >= 50 ? "Mixed" : "Watch";

  const title =
    phase === "CUT"
      ? "Cut Quality"
      : phase === "MAINTAIN"
        ? "Stability"
        : "Growth Quality";

  const summary =
    phase === "CUT"
      ? "CUT mode evaluates whether fat loss is occurring while strength is preserved and waist stays controlled."
      : phase === "MAINTAIN"
        ? "MAINTAIN mode evaluates whether performance and body composition are staying stable."
        : "BULK mode evaluates whether strength and body weight are rising without waist drifting too fast.";

  const weightText =
    weightTrend.points >= 2
      ? `${weightTrend.changeAbs > 0 ? "+" : ""}${formatOneDecimal(weightTrend.changeAbs)} lb`
      : "trend history is still building";

  const waistText =
    waistTrend.points >= 2
      ? `${waistTrend.changeAbs > 0 ? "+" : ""}${formatOneDecimal(waistTrend.changeAbs)} in`
      : "trend history is still building";

  const body = `Strength Signal is ${strengthSignal.trend}. Body weight is ${weightText} over the selected range, and waist ${
    waistTrend.points >= 2 ? `is ${waistText}` : waistText
  }. Confidence is ${confidence.toLowerCase()}.`;

  const strengthBullet =
    strengthSignal.trend === "improving"
      ? "Strength improving"
      : strengthSignal.trend === "stable"
        ? "Strength stable"
        : strengthSignal.trend === "declining"
          ? "Strength declining"
          : "Strength needs watching";

  const weightBullet =
    weightTrend.points < 2
      ? "Body-weight trend history is still building"
      : phase === "CUT"
        ? weightTrend.changeAbs <= -0.5
          ? "Weight gradually decreasing"
          : weightTrend.changeAbs <= 0.5
            ? "Weight broadly stable"
            : "Weight rising during cut"
        : phase === "MAINTAIN"
          ? Math.abs(weightTrend.changeAbs) <= 1
            ? "Body weight staying controlled"
            : "Body weight drifting"
          : weightTrend.changeAbs >= 0.5
            ? "Body weight increasing"
            : "Body weight not yet rising";

  const waistBullet =
    waistTrend.points < 2
      ? "Waist trend history is still building"
      : phase === "CUT"
        ? waistTrend.changeAbs <= -0.1
          ? "Waist trending down"
          : waistTrend.changeAbs <= 0.15
            ? "Waist broadly stable"
            : "Waist rising"
        : phase === "MAINTAIN"
          ? Math.abs(waistTrend.changeAbs) <= 0.2
            ? "Waist staying controlled"
            : "Waist drifting"
          : waistTrend.changeAbs <= 0.2
            ? "Waist staying controlled"
            : "Waist rising during bulk";

  const strengthEfficiency =
    bodySnapshot.weightValue && bodySnapshot.weightValue > 0
      ? round2((strengthSignal.score / bodySnapshot.weightValue) * 100)
      : undefined;

  return {
    title,
    score,
    badge,
    summary,
    body,
    confidence,
    bullets: [strengthBullet, waistBullet, weightBullet],
    strengthEfficiencyLabel:
      strengthEfficiency != null ? `${strengthEfficiency.toFixed(2)}` : "—",
  };
}

function buildCurrentBodySnapshot(bodyMetrics: BodyMetricEntry[]): DashboardBodySnapshot {
  const sorted = bodyMetrics
    .slice()
    .sort((a, b) => pickBodyMetricTime(b) - pickBodyMetricTime(a));

  const latestWeight = sorted.find(
    (entry) => typeof entry.weightLb === "number" && Number.isFinite(entry.weightLb)
  );

  const latestWaist = sorted.find((entry) => {
    const waist = (entry as any).waistIn ?? (entry as any).waist;
    return typeof waist === "number" && Number.isFinite(waist);
  });

  const latestAt = Math.max(
    latestWeight ? pickBodyMetricTime(latestWeight) : 0,
    latestWaist ? pickBodyMetricTime(latestWaist) : 0
  );

  const weightValue =
    latestWeight && typeof latestWeight.weightLb === "number"
      ? latestWeight.weightLb
      : undefined;

  const latestWaistValue = latestWaist
    ? ((latestWaist as any).waistIn ?? (latestWaist as any).waist)
    : undefined;

  const waistValue =
    typeof latestWaistValue === "number" && Number.isFinite(latestWaistValue)
      ? latestWaistValue
      : undefined;

  const asOfLabel =
    latestAt > 0
      ? new Date(latestAt).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : "—";

  return {
    weightLabel: weightValue != null ? `${formatOneDecimal(weightValue)} lb` : "—",
    waistLabel: waistValue != null ? `${formatOneDecimal(waistValue)} in` : "—",
    asOfLabel,
    weightValue,
    waistValue,
  };
}

function buildBodyWeightTrend(
  bodyMetrics: BodyMetricEntry[],
  range: DashboardRange
): ChartDatum[] {
  const startMs = rangeStartMs(range) ?? 0;

  const filtered = bodyMetrics
    .filter((entry) => {
      const at = pickBodyMetricTime(entry);
      return at > 0 && at >= startMs && typeof entry.weightLb === "number";
    })
    .sort((a, b) => pickBodyMetricTime(a) - pickBodyMetricTime(b));

  const byWeek = new Map<string, number[]>();

  filtered.forEach((entry) => {
    const at = pickBodyMetricTime(entry);
    const key = weekKeyFromMs(at);
    const bucket = byWeek.get(key) ?? [];
    bucket.push(entry.weightLb as number);
    byWeek.set(key, bucket);
  });

  return Array.from(byWeek.entries()).map(([key, values]) => ({
    label: weekLabelFromKey(key),
    value: round2(average(values)),
    date: key,
  }));
}

function buildWaistTrend(
  bodyMetrics: BodyMetricEntry[],
  range: DashboardRange
): ChartDatum[] {
  const startMs = rangeStartMs(range) ?? 0;

  const filtered = bodyMetrics
    .filter((entry) => {
      const at = pickBodyMetricTime(entry);
      const waist = (entry as any).waistIn ?? (entry as any).waist;
      return at > 0 && at >= startMs && typeof waist === "number" && Number.isFinite(waist);
    })
    .sort((a, b) => pickBodyMetricTime(a) - pickBodyMetricTime(b));

  const byWeek = new Map<string, number[]>();

  filtered.forEach((entry) => {
    const at = pickBodyMetricTime(entry);
    const key = weekKeyFromMs(at);
    const waist = (entry as any).waistIn ?? (entry as any).waist;
    const bucket = byWeek.get(key) ?? [];
    bucket.push(waist as number);
    byWeek.set(key, bucket);
  });

  return Array.from(byWeek.entries()).map(([key, values]) => ({
    label: weekLabelFromKey(key),
    value: round2(average(values)),
    date: key,
  }));
}

function buildVolumeTrend(
  sessions: Session[],
  sets: SetEntry[],
  range: DashboardRange
): ChartDatum[] {
  const sessionById = new Map(sessions.filter((s) => !s.deletedAt).map((s) => [s.id, s]));
  const startMs = rangeStartMs(range) ?? 0;
  const byWeek = new Map<string, number>();

  sets.forEach((set) => {
    if (set.deletedAt) return;
    if (set.setType !== "working") return;
    if (!set.completedAt) return;
    if (typeof set.reps !== "number" || set.reps <= 0) return;
    if (typeof set.weight !== "number" || !Number.isFinite(set.weight) || set.weight <= 0) {
      return;
    }

    const session = sessionById.get(set.sessionId);
    if (!session) return;

    const at = session.startedAt ?? set.completedAt ?? set.createdAt;
    if (!Number.isFinite(at) || at < startMs) return;

    const volume = set.weight * set.reps;
    const key = weekKeyFromMs(at);
    byWeek.set(key, (byWeek.get(key) ?? 0) + volume);
  });

  return Array.from(byWeek.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, value]) => ({
      label: weekLabelFromKey(key),
      value: round2(value),
      date: key,
    }));
}

/* ============================================================================
   Breadcrumb 4 — Mock fallback data
   ============================================================================ */

async function loadStrengthSource(): Promise<DbStrengthSource> {
  const [sessions, sets, bodyMetrics, tracks, exercises] = await Promise.all([
    db.sessions.toArray(),
    db.sets.toArray(),
    db.bodyMetrics.toArray(),
    db.tracks.toArray(),
    db.exercises.toArray(),
  ]);

  return { sessions, sets, bodyMetrics, tracks, exercises };
}

function analyzeStrengthChart(points: Array<{ week: string; value: number }>) {
  if (!points.length) {
    return { start: 0, current: 0, changePct: 0, high: 0, low: 0 };
  }

  const values = points.map((p) => p.value);
  const start = values[0];
  const current = values[values.length - 1];
  const high = Math.max(...values);
  const low = Math.min(...values);
  const changePct = start > 0 ? ((current - start) / start) * 100 : 0;

  return {
    start: round2(start),
    current: round2(current),
    changePct: round2(changePct),
    high: round2(high),
    low: round2(low),
  };
}

function buildMomentumMessage(changePct: number) {
  if (changePct > 5) return "Momentum building.";
  if (changePct > 0) return "Momentum improving.";
  if (changePct > -5) return "Momentum softening slightly.";
  return "Momentum has dipped recently.";
}

function avgTopN(values: number[], count: number) {
  const clean = values
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => b - a)
    .slice(0, count);

  if (!clean.length) return 0;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}



function buildStrengthSignalFromShared(
  phase: DashboardPhase,
  source: DbStrengthSource | null,
  result: Awaited<ReturnType<typeof computeStrengthIndex>> | null,
  trendRows: StrengthTrendRow[],
  selectedAnchorIdsByPattern?: Parameters<typeof getSelectedAnchorLabelsByPattern>[1]
): StrengthSignalResult {
  const chartPoints = [...(trendRows ?? [])]
    .sort((a, b) => a.weekEndMs - b.weekEndMs)
    .filter((row) => Number.isFinite(row.normalizedIndex))
    .map((row, index) => ({
      week: row.label ?? `W${index + 1}`,
      value: round2(row.normalizedIndex),
    }));

  const analysis = analyzeStrengthChart(chartPoints);
  const scoreRaw =
    result && Number.isFinite(result.normalizedIndex) ? result.normalizedIndex : analysis.current;
  const score = Number.isFinite(scoreRaw) ? round2(scoreRaw) : 0;
    const patternContributors = buildStrengthPatternContributors(
      source,
      Number(result?.bodyweight ?? 0),
      { formatLabel: normalizeExerciseDisplayLabel }
  );
  const selectedAnchorLabelsByPattern = getSelectedAnchorLabelsByPattern(
    source,
    selectedAnchorIdsByPattern,
    { formatLabel: normalizeExerciseDisplayLabel }
  );

  const exerciseSignals = (result?.patterns ?? [])
    .filter((pattern) => Number.isFinite(pattern.normalized))
    .map((pattern) => {
      const changePct = score > 0 ? round2(((pattern.normalized - score) / score) * 100) : 0;

      return {
        exerciseId: pattern.pattern,
        label: capitalize(pattern.pattern),
        movement: pattern.pattern,
        latestE1RM: round2(pattern.topSet),
        baselineE1RM: round2(pattern.topSet),
        baselineAvgE1RM: round2(pattern.working),
        recentAvgE1RM: round2(pattern.normalized),
        changePct: Number.isFinite(changePct) ? changePct : 0,
        normalizedScore: round2(pattern.normalized),
      } satisfies ExerciseSignal;
    });

  const composites = exerciseSignals.map((signal) => ({
    movement: signal.movement,
    score: signal.normalizedScore,
    exerciseCount: patternContributors[signal.movement].length,
    anchorLabel: selectedAnchorLabelsByPattern[signal.movement],
    includedExercises: patternContributors[signal.movement],
  }));

  const summary =
    phase === "CUT"
      ? "Strength Signal is following the shared normalized strength trend while cutting."
      : phase === "MAINTAIN"
        ? "Strength Signal is using the shared normalized trend to track performance stability."
        : "Strength Signal is using the shared normalized trend to track productive growth quality.";

  return {
    score,
    trend: trendFromChange(analysis.changePct),
    exerciseSignals,
    composites,
    chartPoints,
    summary,
  };
}

/* ============================================================================
   Breadcrumb 6 — Dashboard view model builder
   ============================================================================ */

function buildDashboardViewModel(
  phase: DashboardPhase,
  range: DashboardRange,
  strengthSignal: StrengthSignalResult,
  bodySnapshot: DashboardBodySnapshot,
  bodyWeightTrendData: ChartDatum[],
  waistTrendData: ChartDatum[],
  sharedCutQuality?: PhaseQualityResult | null
): DashboardViewModel {
  const strengthAnalysis = analyzeStrengthChart(strengthSignal.chartPoints);
  const momentumMessage = buildMomentumMessage(strengthAnalysis.changePct);

  const topComposite =
    strengthSignal.composites.slice().sort((a, b) => b.score - a.score)[0]?.movement ?? "—";

  const weightTrend = analyzeMetricTrend(bodyWeightTrendData);
  const waistTrend = analyzeMetricTrend(waistTrendData);

  const primarySignal = buildPrimaryCoachingSignal({
    phase,
    strengthSignal,
    bodySnapshot,
    weightTrend,
    waistTrend,
    sharedCutQuality,
  });

  return {
    activePhase: phase,
    activeRange: range,
    flagshipTitle: primarySignal.title,
    flagshipScore: primarySignal.score,
    flagshipBadge: primarySignal.badge,
    heroSummary: primarySignal.summary,
    flagshipBody: primarySignal.body,
    heroStats: [
      { label: "Current Strength Signal", value: strengthSignal.score.toFixed(2) },
      { label: "Body Weight", value: bodySnapshot.weightLabel },
      { label: "Waist", value: bodySnapshot.waistLabel },
      { label: "Strength Efficiency", value: primarySignal.strengthEfficiencyLabel },
    ],
    charts: {
      strength: {
        id: "strength",
        title: "Strength Signal Trend",
        subtitle: `Weekly historical trend • ${range}`,
        direction: strengthSignal.trend,
        momentumMessage,
        analysisRows: [
          { label: "Formula", value: "Shared Strength engine (normalized Strength Signal)" },
          { label: "Start Value", value: strengthAnalysis.start.toFixed(2) },
          { label: "Current Value", value: strengthAnalysis.current.toFixed(2) },
          {
            label: "Overall Change",
            value: `${strengthAnalysis.changePct > 0 ? "+" : ""}${strengthAnalysis.changePct}%`,
          },
          { label: "Highest Value", value: strengthAnalysis.high.toFixed(2) },
          { label: "Lowest Value", value: strengthAnalysis.low.toFixed(2) },
          {
            label: "Pattern Buckets",
            value: String(strengthSignal.exerciseSignals.length),
          },
          { label: "Top Composite", value: topComposite },
        ],
        interpretation: strengthSignal.summary,
        topMovers: strengthSignal.exerciseSignals
          .slice()
          .sort((a, b) => b.changePct - a.changePct)
          .slice(0, 5)
          .map((item) => ({
            label: normalizeExerciseDisplayLabel(item.label),
            changePct: item.changePct,
            score: item.normalizedScore,
          })),
        movementBreakdown: strengthSignal.composites
          .slice()
          .sort((a, b) => b.score - a.score)
          .map((item) => ({
            movement: item.movement,
            score: item.score,
            exerciseCount: item.exerciseCount,
            anchorLabel: item.anchorLabel,
            includedExercises: item.includedExercises,
          })),
      },

      bodyWeight: {
        id: "bodyWeight",
        title: "Body Weight",
        subtitle: `Weekly trend • ${range}`,
        direction: getWeightTrendDirection(phase, weightTrend),
        analysisRows: [
          { label: "Current Weight", value: bodySnapshot.weightLabel },
          { label: "As Of", value: bodySnapshot.asOfLabel },
          {
            label: "Goal Fit",
            value:
              phase === "BULK"
                ? "Gain / controlled"
                : phase === "MAINTAIN"
                  ? "Stable"
                  : "Loss / favorable",
          },
        ],
        interpretation:
          phase === "CUT"
            ? "Body weight should trend down gradually during a cut, but must be interpreted alongside waist and strength."
            : phase === "MAINTAIN"
              ? "Stable body weight fits maintain mode best."
              : "In bulk mode, body weight can rise, but rate of gain should stay controlled.",
      },

      waist: {
        id: "waist",
        title: "Waist Trend",
        subtitle: `Weekly trend • ${range}`,
        direction: getWaistTrendDirection(phase, waistTrend),
        analysisRows: [
          { label: "Current Waist", value: bodySnapshot.waistLabel },
          { label: "As Of", value: bodySnapshot.asOfLabel },
          {
            label: "Goal Fit",
            value:
              phase === "BULK"
                ? "Keep controlled"
                : phase === "MAINTAIN"
                  ? "Hold steady"
                  : "Decline favored",
          },
        ],
        interpretation:
          phase === "CUT"
            ? "Waist trend is one of the best confirmation layers for favorable fat loss."
            : phase === "MAINTAIN"
              ? "Stable waist supports maintain mode."
              : "During a bulk, waist can rise slightly, but should stay controlled.",
      },

      volume: {
        id: "volume",
        title: "Training Load",
        subtitle: `Weekly working-set volume • ${range}`,
        direction: phase === "BULK" ? "improving" : "stable",
        analysisRows: [
          { label: "Source", value: "Completed working sets" },
          { label: "Unit", value: "Weight × reps" },
          { label: "Spike Risk", value: phase === "BULK" ? "Moderate" : "Low" },
        ],
        interpretation:
          phase === "CUT"
            ? "Training load should stay high enough to preserve performance without causing recovery debt."
            : phase === "MAINTAIN"
              ? "Controlled, repeatable volume supports stable performance."
              : "Volume can climb during a bulk, but large spikes still need watching.",
      },
    },
    insights: [
      {
        id: "insight-topline",
        title: primarySignal.title,
        status: primarySignal.badge,
        confidence: primarySignal.confidence,
        body: primarySignal.body,
        evidence: primarySignal.bullets,
        action:
          phase === "CUT"
            ? "Stay focused on fat loss quality while protecting strength."
            : phase === "MAINTAIN"
              ? "Keep performance stable while holding body composition steady."
              : "Push growth while keeping waist drift controlled.",
      },
      {
        id: "insight-load",
        title: "Training Load",
        status: phase === "BULK" ? "Build" : "Controlled",
        confidence: "Moderate",
        body: "Weekly load is a context layer for how hard the block is pushing.",
        evidence: ["Volume trend", "No sharp spikes"],
        action: "Monitor fatigue while progressing core lifts.",
      },
    ],
    actions: [
      "Next: add a Cut Quality evidence card below the phase selector.",
      "Next: allow user-configurable Strength Signal windows.",
      "Next: allow exercise inclusion and exclusion for Strength Signal.",
    ],
    debug: {
      dataSource: "Shared Strength engine",
      dateWindowUsed: formatRangeLabel(range),
      confidenceLevel:
        strengthSignal.exerciseSignals.length < 2
          ? "Low"
          : strengthSignal.exerciseSignals.length < 4
            ? "Moderate"
            : "High",
      exercisesCounted: strengthSignal.exerciseSignals.length,
      currentSignal: strengthSignal.score.toFixed(2),
      topComposite,
      composites: strengthSignal.composites
        .slice()
        .sort((a, b) => b.score - a.score)
        .map((item) => ({
          movement: item.movement,
          score: item.score.toFixed(2),
          exerciseCount: item.exerciseCount,
        })),
      topExercises: strengthSignal.exerciseSignals
        .slice()
        .sort((a, b) => b.normalizedScore - a.normalizedScore)
        .slice(0, 5)
        .map((item) => ({
          label: normalizeExerciseDisplayLabel(item.label),
          changePct: `vs composite ${item.changePct > 0 ? "+" : ""}${item.changePct.toFixed(2)}%`,
          score: item.normalizedScore.toFixed(2),
        })),
    },
  };
}

/* ============================================================================
   Breadcrumb 7 — UI helpers
   ============================================================================ */

function TimeRangeControl({
  activeRange,
  onChange,
}: {
  activeRange: DashboardRange;
  onChange: (range: DashboardRange) => void;
}) {
  return (
    <div
      className="row dashboard-range-scroll"
      style={{
        overflowX: "auto",
        flexWrap: "nowrap",
        WebkitOverflowScrolling: "touch",
        scrollbarWidth: "none",
      }}
    >
      {TIME_RANGES.map((range) => {
        const active = range === activeRange;

        return (
          <button
            key={range}
            type="button"
            className={`btn small ${active ? "primary" : ""}`}
            onClick={() => onChange(range)}
            style={{ flex: "0 0 auto" }}
          >
            {range}
          </button>
        );
      })}
    </div>
  );
}

/* ============================================================================
   Breadcrumb 8 — Page
   ============================================================================ */

export default function PerformanceDashboardPage() {
  const navigate = useNavigate();

  const [activePhase, setActivePhase] = useState<DashboardPhase>("CUT");
  const [phaseLoaded, setPhaseLoaded] = useState(false);
  const [activeRange, setActiveRange] = useState<DashboardRange>("8W");
  const [dbSource, setDbSource] = useState<DbStrengthSource | null>(null);
  const [sharedStrengthResult, setSharedStrengthResult] = useState<
    Awaited<ReturnType<typeof computeStrengthIndex>> | null
  >(null);
  const [sharedStrengthTrend, setSharedStrengthTrend] = useState<StrengthTrendRow[]>([]);
  const [strengthSignalV2Result, setStrengthSignalV2Result] =
    useState<StrengthSignalV2Result | null>(null);
  const [showDebug, setShowDebug] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadPhase() {
      try {
        const phase = await getCurrentPhase();
        if (cancelled) return;
        setActivePhase(phaseToDashboardPhase(phase));
      } finally {
        if (!cancelled) setPhaseLoaded(true);
      }
    }

    void loadPhase();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!phaseLoaded) return;
    void setCurrentPhase(dashboardPhaseToPhase(activePhase));
  }, [activePhase, phaseLoaded]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const source = await loadStrengthSource();

        if (cancelled) return;

        setDbSource(source);
      } catch (err) {
        console.error("PerformanceDashboardPage load failed:", err);
        if (!cancelled) {
          setDbSource(null);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadSharedStrength() {
      if (!phaseLoaded) return;

      try {
        await setCurrentPhase(dashboardPhaseToPhase(activePhase));

        const weeks =
          activeRange === "4W"
            ? 4
            : activeRange === "8W"
              ? 8
              : activeRange === "12W"
                ? 12
                : activeRange === "YTD"
                  ? 52
                  : activeRange === "ALL"
                    ? 104
                    : 12;

        const [result, trend, strengthV2Result] = await Promise.all([
          computeStrengthIndex(28),
          computeStrengthTrend(weeks, 28),
          computeStrengthSignalV2(),
        ]);

        if (cancelled) return;

        setSharedStrengthResult(result ?? null);
        setSharedStrengthTrend(Array.isArray(trend) ? trend : []);
        setStrengthSignalV2Result(strengthV2Result ?? null);
      } catch (err) {
        console.error("PerformanceDashboardPage shared strength load failed:", err);
        if (!cancelled) {
          setSharedStrengthResult(null);
          setSharedStrengthTrend([]);
          setStrengthSignalV2Result(null);
        }
      }
    }

    void loadSharedStrength();

    return () => {
      cancelled = true;
    };
  }, [activePhase, activeRange, phaseLoaded]);

  const bodySnapshot = useMemo(
    () => buildCurrentBodySnapshot(dbSource?.bodyMetrics ?? []),
    [dbSource]
  );

  const sharedStrengthSignal = useMemo(
    () => {
      const selectedAnchorIdsByPattern =
        getPerformanceAnchorIdsFromStrengthSignalV2(strengthSignalV2Result);

      return buildStrengthSignalFromShared(
        activePhase,
        dbSource,
        sharedStrengthResult,
        sharedStrengthTrend,
        selectedAnchorIdsByPattern
      );
    },
    [activePhase, dbSource, sharedStrengthResult, sharedStrengthTrend, strengthSignalV2Result]
  );

  const sharedStrengthChartData: ChartDatum[] = useMemo(() => {
    const sorted = [...sharedStrengthTrend].sort((a, b) => a.weekEndMs - b.weekEndMs);

    return sorted.map((row, index) => ({
      label: row.label ?? `W${index + 1}`,
      value: Number.isFinite(row.normalizedIndex) ? row.normalizedIndex : null,
      date:
        typeof row.weekEndMs === "number" && Number.isFinite(row.weekEndMs)
          ? new Date(row.weekEndMs).toISOString().slice(0, 10)
          : row.label ?? `W${index + 1}`,
      }));
  }, [sharedStrengthTrend]);

  const hasSharedStrengthChart = sharedStrengthChartData.length > 0;

  const sharedCurrentStrengthSignal = useMemo(() => {
    const value = sharedStrengthResult?.normalizedIndex;
    return Number.isFinite(value) ? Number(value) : null;
  }, [sharedStrengthResult]);

  const bodyWeightChartData = useMemo(
    () => buildBodyWeightTrend(dbSource?.bodyMetrics ?? [], activeRange),
    [dbSource, activeRange]
  );

  const waistChartData = useMemo(
    () => buildWaistTrend(dbSource?.bodyMetrics ?? [], activeRange),
    [dbSource, activeRange]
  );

  const sharedCutQuality = useMemo(() => {
    if (activePhase !== "CUT") return null;
    const bodyRows = dbSource?.bodyMetrics ?? [];
    const hydration = computeHydrationConfidenceFromBodyRows(bodyRows as any);
    const strengthDelta = computeStrengthDeltaFromStrengthTrend(sharedStrengthTrend, "cut");
    const inputs = buildPhaseQualityInputsFromBodyRows(
      bodyRows,
      strengthDelta.strengthDelta,
      10,
      !!(hydration?.likelyHydrationDistortion || hydration?.hydrationBaselineLow)
    );
    if ((inputs.sampleCount ?? 0) < 1) return null;
    return evaluatePhaseQuality("cut", inputs);
  }, [activePhase, dbSource, sharedStrengthTrend]);

  const vm = useMemo(
    () =>
      buildDashboardViewModel(
        activePhase,
        activeRange,
        sharedStrengthSignal,
        bodySnapshot,
        bodyWeightChartData,
        waistChartData,
        sharedCutQuality
      ),
    [
      activePhase,
      activeRange,
      sharedStrengthSignal,
      bodySnapshot,
      bodyWeightChartData,
      waistChartData,
      sharedCutQuality,
    ]
  );

  const effectiveHeroStats = useMemo(() => {
    if (!hasSharedStrengthChart || sharedCurrentStrengthSignal == null) {
      return vm.heroStats;
    }

    return vm.heroStats.map((stat) =>
      stat.label === "Current Strength Signal"
        ? {
            ...stat,
            value: sharedCurrentStrengthSignal.toFixed(2),
          }
        : stat
    );
  }, [vm.heroStats, sharedCurrentStrengthSignal, hasSharedStrengthChart]);

  const effectiveStrengthChart = useMemo(() => {
    if (!hasSharedStrengthChart) {
      return vm.charts.strength;
    }

    const values = sharedStrengthChartData
      .map((point) => point.value)
      .filter(
        (value): value is number => typeof value === "number" && Number.isFinite(value)
      );

    const start = values.length > 0 ? values[0] : null;
    const current = values.length > 0 ? values[values.length - 1] : null;
    const high = values.length > 0 ? Math.max(...values) : null;
    const low = values.length > 0 ? Math.min(...values) : null;

    const changePct =
      start != null && start !== 0 && current != null
        ? round2(((current - start) / start) * 100)
        : 0;

    const direction: TrendDirection =
      changePct >= 5
        ? "improving"
        : changePct <= -3
          ? "declining"
          : changePct > -3 && changePct < 2
            ? "stable"
            : "watch";

    return {
      ...vm.charts.strength,
      subtitle: `Weekly historical trend • ${activeRange}`,
      direction,
      momentumMessage: buildMomentumMessage(changePct),
      analysisRows: [
        { label: "Formula", value: "Shared Strength engine" },
        { label: "Start Value", value: start != null ? start.toFixed(2) : "—" },
        { label: "Current Value", value: current != null ? current.toFixed(2) : "—" },
        {
          label: "Overall Change",
          value: `${changePct > 0 ? "+" : ""}${changePct.toFixed(2)}%`,
        },
        { label: "Highest Value", value: high != null ? high.toFixed(2) : "—" },
        { label: "Lowest Value", value: low != null ? low.toFixed(2) : "—" },
        { label: "Weeks Loaded", value: String(sharedStrengthChartData.length) },
        { label: "Source", value: "Shared Strength engine" },
      ],
      interpretation:
        "Strength Signal trend is now using the shared Strength engine for charted performance over the selected window.",
    };
  }, [vm.charts.strength, sharedStrengthChartData, activeRange, hasSharedStrengthChart]);

  const sharedStrengthConfidenceLabel = useMemo(() => {
    if (!hasSharedStrengthChart) {
      return vm.debug.confidenceLevel;
    }

    const weeksLoaded = sharedStrengthChartData.length;
    const bwDaysUsed = sharedStrengthResult?.bodyweightDaysUsed ?? 0;

    if (weeksLoaded >= 8 && bwDaysUsed >= 3) return "High";
    if (weeksLoaded >= 4) return "Moderate";
    return "Low";
  }, [
    vm.debug.confidenceLevel,
    sharedStrengthChartData.length,
    sharedStrengthResult,
    hasSharedStrengthChart,
  ]);

  const sharedStrongestPatternLabel = useMemo(() => {
    if (!hasSharedStrengthChart) return capitalize(vm.debug.topComposite);

    const patterns = sharedStrengthResult?.patterns ?? [];
    if (!patterns.length) return capitalize(vm.debug.topComposite);

    const top = patterns
      .slice()
      .sort((a, b) => (b.normalized ?? 0) - (a.normalized ?? 0))[0];

    return top?.pattern ? capitalize(top.pattern) : capitalize(vm.debug.topComposite);
  }, [sharedStrengthResult, vm.debug.topComposite, hasSharedStrengthChart]);

  const sharedStrengthNarrative = useMemo(() => {
    if (!hasSharedStrengthChart) return null;

    const values = sharedStrengthChartData
      .map((point) => point.value)
      .filter(
        (value): value is number => typeof value === "number" && Number.isFinite(value)
      );

    const start = values.length > 0 ? values[0] : null;
    const current = values.length > 0 ? values[values.length - 1] : null;
    const changePct =
      start != null && start !== 0 && current != null
        ? round2(((current - start) / start) * 100)
        : 0;

    const directionText =
      changePct >= 5
        ? "improving"
        : changePct <= -3
          ? "declining"
          : "stable";

    const currentLabel =
      sharedCurrentStrengthSignal != null
        ? sharedCurrentStrengthSignal.toFixed(2)
        : current != null
          ? current.toFixed(2)
          : "—";

    return {
      heroSummary: `Shared Strength engine is active. Current Strength Signal is ${currentLabel} with ${directionText} trend over ${formatRangeLabel(activeRange).toLowerCase()}.`,
      flagshipBody: `Strength narrative is using the shared Strength engine only. Current signal, chart trend, strongest pattern, and confidence now reflect the same shared source of truth.`,
      evidence: [
        `Shared Strength Signal: ${currentLabel}`,
        `Trend: ${changePct > 0 ? "+" : ""}${changePct.toFixed(2)}% over ${formatRangeLabel(activeRange)}`,
        `Strongest Pattern: ${sharedStrongestPatternLabel}`,
      ],
    };
  }, [
    activeRange,
    hasSharedStrengthChart,
    sharedCurrentStrengthSignal,
    sharedStrengthChartData,
    sharedStrongestPatternLabel,
  ]);

  const volumeChartData = useMemo(
    () => buildVolumeTrend(dbSource?.sessions ?? [], dbSource?.sets ?? [], activeRange),
    [dbSource, activeRange]
  );

  const strengthSeries: ChartSeriesConfig[] = useMemo(
    () => [
      {
        key: "value",
        label: "Strength Signal",
        formatter: (value) =>
          value == null || !Number.isFinite(value) ? "—" : value.toFixed(2),
      },
    ],
    []
  );

  const bodyWeightSeries: ChartSeriesConfig[] = useMemo(
    () => [
      {
        key: "value",
        label: "Body Weight",
        formatter: formatLbs,
      },
    ],
    []
  );

  const waistSeries: ChartSeriesConfig[] = useMemo(
    () => [
      {
        key: "value",
        label: "Waist",
        formatter: formatInches,
      },
    ],
    []
  );

  const volumeSeries: ChartSeriesConfig[] = useMemo(
    () => [
      {
        key: "value",
        label: "Weekly Volume",
        formatter: formatVolume,
      },
    ],
    []
  );

  return (
    <Page>
      {/* ======================================================================
          Breadcrumb 8A — Shared Progress sub-page header
         ==================================================================== */}
      <Section>
        <ProgressPageHeader
          breadcrumb="← Progress / Performance"
          description="Big-picture coaching view across strength, body composition, and training trends."
          metaLine={`Current body metrics as of ${bodySnapshot.asOfLabel}`}
          onBreadcrumbClick={() => navigate("/progress")}
        />
      </Section>

      {/* ======================================================================
          Breadcrumb 8C — Hero area
         ==================================================================== */}
      <Section>
        <PerformanceOverviewSection
          activePhase={activePhase}
          setActivePhase={setActivePhase}
          heroSummary={sharedStrengthNarrative?.heroSummary ?? vm.heroSummary}
          heroStats={effectiveHeroStats}
          flagshipTitle={vm.flagshipTitle}
          flagshipScore={vm.flagshipScore}
          flagshipBadge={vm.flagshipBadge}
          flagshipBody={sharedStrengthNarrative?.flagshipBody ?? vm.flagshipBody}
          firstInsight={
            hasSharedStrengthChart
              ? { evidence: sharedStrengthNarrative?.evidence ?? [] }
              : vm.insights[0]
          }
        />
      </Section>

      {/* ======================================================================
          Breadcrumb 8D — Charts + insights
         ==================================================================== */}
      <Section>
        <div className="grid two" style={{ alignItems: "start" }}>
          <div className="list">
            <div className="card">
              <div style={{ display: "grid", gap: 8, marginBottom: 4 }}>
                <div>
                  <h2 style={{ margin: 0 }}>Trend Charts</h2>
                  <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                    Pattern recognition, quick analysis, and interpretation.
                  </div>
                </div>

                <div>
                  <TimeRangeControl
                    activeRange={activeRange}
                    onChange={setActiveRange}
                  />
                </div>
              </div>
            </div>

            <PerformanceStrengthSignalSection
              chart={effectiveStrengthChart}
              chartData={sharedStrengthChartData}
              series={strengthSeries}
              showDebug={showDebug}
              setShowDebug={setShowDebug}
              sourceUsed="Shared Strength Engine"
              dateWindowUsed={formatRangeLabel(activeRange)}
              confidenceLevel={sharedStrengthConfidenceLabel}
              exercisesIncluded={String(vm.debug.exercisesCounted)}
              currentStrengthSignal={
                sharedCurrentStrengthSignal != null
                  ? sharedCurrentStrengthSignal.toFixed(2)
                  : vm.debug.currentSignal
              }
              strongestPattern={sharedStrongestPatternLabel}
              note="Note: Performance Strength Signal now uses the shared Strength engine for the current value, chart trend, strongest pattern, and details panel."
              debugComposites={vm.debug.composites}
              debugTopExercises={vm.debug.topExercises}
            />

            <DashboardChartCard
              chart={vm.charts.bodyWeight}
              chartData={bodyWeightChartData}
              series={bodyWeightSeries}
              yDomainMode="auto"
              valueFormatter={formatLbs}
              emptyMessage="No body-weight entries yet."
            />

            <DashboardChartCard
              chart={vm.charts.waist}
              chartData={waistChartData}
              series={waistSeries}
              yDomainMode="auto"
              valueFormatter={formatInches}
              emptyMessage="No waist entries yet."
            />

            <DashboardChartCard
              chart={vm.charts.volume}
              chartData={volumeChartData}
              series={volumeSeries}
              yDomainMode="auto"
              valueFormatter={formatVolume}
              emptyMessage="No completed training volume yet."
            />
          </div>

          <PerformanceInsightsSection insights={vm.insights} actions={vm.actions} />
        </div>
      </Section>
    </Page>
  );
}

function capitalize(value: string) {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function normalizeExerciseDisplayLabel(value: string) {
  if (!value) return "";

  return value
    .replace(/\s+[—-]\s*hypertrophy\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* ============================================================================
   FOOTER COMMENT
   FILE: src/pages/PerformanceDashboardPage.tsx
   ============================================================================ */
