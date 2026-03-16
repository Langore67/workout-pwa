// src/pages/PerformanceDashboardPage.tsx
/* ============================================================================
   PerformanceDashboardPage.tsx
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-03-16-DASH-IRONFORGE-07
   FILE: src/pages/PerformanceDashboardPage.tsx

   Purpose
   - Provide IronForge's big-picture coaching dashboard
   - Combine strength, body composition, and training load into one coach view
   - Keep phase as an interpretation lens, not a data source override

   Changes (DASH-IRONFORGE-07)
   ✅ Keep compact top header with ← Progress navigation
   ✅ Keep current body metrics sourced from DB (not phase placeholders)
   ✅ Preserve shared chart framework usage
   ✅ Restore separate Body Weight chart
   ✅ Restore separate Waist Trend chart
   ✅ Make phase control the coaching layer
   ✅ Replace Range overview stat with Strength Efficiency
   ✅ Make Body Weight / Waist chart badges phase-aware
   ✅ Keep real Strength Signal and weekly Training Volume trend wired in
   ✅ Preserve dashboard insights / debug / build priorities sections

   Notes
   - Phase changes interpretation only
   - Current Body Weight / Waist do not change when CUT / MAINTAIN / BULK changes
   - Shared TrendChartCard is the standard chart renderer for this page
   ============================================================================ */

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Page, Section } from "../components/Page.tsx";
import TrendChartCard from "../components/charts/TrendChartCard";
import type { ChartDatum, ChartSeriesConfig } from "../components/charts/chartTypes";
import { formatLbs } from "../components/charts/chartFormatters";
import {
  db,
  type Exercise,
  type Track,
  type Session,
  type SetEntry,
  type BodyMetricEntry,
} from "../db";

/* ============================================================================
   Breadcrumb 1 — Types
   ============================================================================ */

export type DashboardPhase = "CUT" | "MAINTAIN" | "BULK";
export type DashboardRange = "4W" | "8W" | "12W" | "YTD" | "ALL";
export type TrendDirection = "improving" | "stable" | "declining" | "watch";

type AnalysisRow = {
  label: string;
  value: string;
};

type ChartViewModel = {
  id: "strength" | "bodyWeight" | "waist" | "volume";
  title: string;
  subtitle: string;
  direction: TrendDirection;
  momentumMessage?: string;
  analysisRows: AnalysisRow[];
  interpretation: string;
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
    dataSource: "Real DB" | "Mock Fallback";
    exercisesCounted: number;
    currentSignal: string;
    topComposite: string;
    composites: Array<{ movement: string; score: string; exerciseCount: number }>;
    topExercises: Array<{ label: string; changePct: string; score: string }>;
  };
};

type SignalSet = {
  date: string;
  weight: number;
  reps: number;
  rir?: number;
};

type ExerciseHistory = {
  exerciseId: string;
  label: string;
  movement: "push" | "pull" | "squat" | "hinge" | "lunge" | "carry" | "core";
  baselineE1RM: number;
  sessions: SignalSet[];
};

type ExerciseSignal = {
  exerciseId: string;
  label: string;
  movement: ExerciseHistory["movement"];
  latestE1RM: number;
  baselineE1RM: number;
  baselineAvgE1RM: number;
  recentAvgE1RM: number;
  changePct: number;
  normalizedScore: number;
};

type CompositeSignal = {
  movement: ExerciseHistory["movement"];
  score: number;
  exerciseCount: number;
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
  exercises: Exercise[];
  tracks: Track[];
  sessions: Session[];
  sets: SetEntry[];
  bodyMetrics: BodyMetricEntry[];
};

type DashboardBodySnapshot = {
  weightLabel: string;
  waistLabel: string;
  asOfLabel: string;
  weightValue?: number;
  waistValue?: number;
};

type StrengthMovement = ExerciseHistory["movement"] | "exclude";

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

const PHASE_TABS: Array<{ phase: DashboardPhase; tone: string }> = [
  { phase: "CUT", tone: "Fat loss with muscle retention" },
  { phase: "MAINTAIN", tone: "Hold body comp and consolidate performance" },
  { phase: "BULK", tone: "Drive growth with controlled waist gain" },
];

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

function scoreFromPctChange(changePct: number) {
  return clamp(5 + changePct / 4, 0, 10);
}

function calcE1RM(weight: number, reps: number) {
  return weight * (1 + reps / 30);
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

function getExpectedPointCount(range: DashboardRange): number | undefined {
  if (range === "4W") return 4;
  if (range === "8W") return 8;
  if (range === "12W") return 12;
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

  // BULK
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

  // BULK
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
}) {
  const { phase, strengthSignal, bodySnapshot, weightTrend, waistTrend } = args;

  /* ------------------------------------------------------------------------
     Breadcrumb — Score components
     What this does
     - Computes separate score contributions for strength, weight, and waist
     - Treats missing waist history as neutral, not negative

     Why this matters
     - Incomplete waist data should reduce confidence, not unfairly tank score
     ------------------------------------------------------------------------ */

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
    // BULK
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

  /* ------------------------------------------------------------------------
     Breadcrumb — Confidence model
     What this does
     - Separates signal quality from data completeness
     - Uses trend-history availability to drive confidence

     Why this matters
     - A score can be decent while confidence remains only moderate
     ------------------------------------------------------------------------ */

  const confidencePoints =
    (weightTrend.points >= 2 ? 1 : 0) +
    (waistTrend.points >= 2 ? 1 : 0) +
    (strengthSignal.exerciseSignals.length >= 3 ? 1 : 0);

  const confidence =
    confidencePoints === 3
      ? "High"
      : confidencePoints === 2
        ? "Moderate"
        : "Low";

  /* ------------------------------------------------------------------------
     Breadcrumb — Badge thresholds
     ------------------------------------------------------------------------ */

  const badge =
    score >= 80
      ? "Strong"
      : score >= 65
        ? "Good"
        : score >= 50
          ? "Mixed"
          : "Watch";

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

  /* ------------------------------------------------------------------------
     Breadcrumb — Friendly coaching text
     ------------------------------------------------------------------------ */

  const weightText =
    weightTrend.points >= 2
      ? `${weightTrend.changeAbs > 0 ? "+" : ""}${formatOneDecimal(weightTrend.changeAbs)} lb`
      : "trend history is still building";

  const waistText =
    waistTrend.points >= 2
      ? `${waistTrend.changeAbs > 0 ? "+" : ""}${formatOneDecimal(waistTrend.changeAbs)} in`
      : "trend history is still building";

  const body =
    phase === "CUT"
      ? `Strength Signal is ${strengthSignal.trend}. Body weight is ${weightText} over the selected range, and waist ${waistTrend.points >= 2 ? `is ${waistText}` : waistText}. Confidence is ${confidence.toLowerCase()}.`
      : phase === "MAINTAIN"
        ? `Strength Signal is ${strengthSignal.trend}. Body weight is ${weightText} over the selected range, and waist ${waistTrend.points >= 2 ? `is ${waistText}` : waistText}. Confidence is ${confidence.toLowerCase()}.`
        : `Strength Signal is ${strengthSignal.trend}. Body weight is ${weightText} over the selected range, and waist ${waistTrend.points >= 2 ? `is ${waistText}` : waistText}. Confidence is ${confidence.toLowerCase()}.`;

  /* ------------------------------------------------------------------------
     Breadcrumb — Evidence bullets
     What this does
     - Produces clean stateful bullets for future ribbon / summary card UI

     Why this matters
     - UI should consume clear signal states, not raw numbers only
     ------------------------------------------------------------------------ */

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

  /* ------------------------------------------------------------------------
     Breadcrumb — Strength efficiency
     ------------------------------------------------------------------------ */

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
  const sessionById = new Map(
    sessions.filter((s) => !s.deletedAt).map((s) => [s.id, s])
  );

  const startMs = rangeStartMs(range) ?? 0;
  const byWeek = new Map<string, number>();

  sets.forEach((set) => {
    if (set.deletedAt) return;
    if (set.setType !== "working") return;
    if (!set.completedAt) return;
    if (typeof set.reps !== "number" || set.reps <= 0) return;
    if (typeof set.weight !== "number" || !Number.isFinite(set.weight) || set.weight <= 0) return;

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

const MOCK_EXERCISE_HISTORY: ExerciseHistory[] = [
  {
    exerciseId: "back-squat",
    label: "Back Squat",
    movement: "squat",
    baselineE1RM: 225,
    sessions: [
      { date: "2026-01-12", weight: 155, reps: 12, rir: 3 },
      { date: "2026-01-19", weight: 165, reps: 10, rir: 3 },
      { date: "2026-01-26", weight: 175, reps: 10, rir: 2.5 },
      { date: "2026-02-02", weight: 185, reps: 8, rir: 2 },
    ],
  },
  {
    exerciseId: "bench-press",
    label: "Bench Press",
    movement: "push",
    baselineE1RM: 185,
    sessions: [
      { date: "2026-01-12", weight: 115, reps: 10, rir: 3 },
      { date: "2026-01-19", weight: 120, reps: 10, rir: 3 },
      { date: "2026-01-26", weight: 125, reps: 9, rir: 2.5 },
      { date: "2026-02-02", weight: 130, reps: 8, rir: 2 },
    ],
  },
  {
    exerciseId: "barbell-row",
    label: "Barbell Row",
    movement: "pull",
    baselineE1RM: 145,
    sessions: [
      { date: "2026-01-12", weight: 95, reps: 12, rir: 4 },
      { date: "2026-01-19", weight: 105, reps: 12, rir: 3.5 },
      { date: "2026-01-26", weight: 115, reps: 10, rir: 3 },
      { date: "2026-02-02", weight: 125, reps: 10, rir: 2 },
    ],
  },
  {
    exerciseId: "rdl",
    label: "Romanian Deadlift",
    movement: "hinge",
    baselineE1RM: 215,
    sessions: [
      { date: "2026-01-12", weight: 115, reps: 12, rir: 3.5 },
      { date: "2026-01-19", weight: 125, reps: 12, rir: 3 },
      { date: "2026-01-26", weight: 135, reps: 10, rir: 3 },
      { date: "2026-02-02", weight: 145, reps: 10, rir: 2.5 },
    ],
  },
];

/* ============================================================================
   Breadcrumb 5 — Strength Signal model + source loading
   ============================================================================ */

function computeExerciseSignal(exercise: ExerciseHistory): ExerciseSignal {
  const rawE1rms = exercise.sessions.map((session) => calcE1RM(session.weight, session.reps));
  const e1rms = rawE1rms.filter((v) => Number.isFinite(v) && v > 0);

  const safeBaseline =
    Number.isFinite(exercise.baselineE1RM) && exercise.baselineE1RM > 0
      ? exercise.baselineE1RM
      : 1;

  const latestE1RM = e1rms.length > 0 ? e1rms[e1rms.length - 1] : safeBaseline;

  const baselineWindow = e1rms.slice(0, Math.min(2, e1rms.length));
  const recentWindow = e1rms.slice(Math.max(0, e1rms.length - 2));

  const baselineAvgRaw = average(baselineWindow);
  const recentAvgRaw = average(recentWindow);

  const baselineAvgE1RM =
    Number.isFinite(baselineAvgRaw) && baselineAvgRaw > 0 ? baselineAvgRaw : safeBaseline;

  const recentAvgE1RM =
    Number.isFinite(recentAvgRaw) && recentAvgRaw > 0 ? recentAvgRaw : latestE1RM;

  const changePctRaw = ((recentAvgE1RM - baselineAvgE1RM) / baselineAvgE1RM) * 100;
  const changePct = Number.isFinite(changePctRaw) ? changePctRaw : 0;

  const normalizedScoreRaw = scoreFromPctChange(changePct);
  const normalizedScore = Number.isFinite(normalizedScoreRaw) ? normalizedScoreRaw : 5;

  return {
    exerciseId: exercise.exerciseId,
    label: exercise.label,
    movement: exercise.movement,
    latestE1RM: round2(latestE1RM),
    baselineE1RM: round2(safeBaseline),
    baselineAvgE1RM: round2(baselineAvgE1RM),
    recentAvgE1RM: round2(recentAvgE1RM),
    changePct: round2(changePct),
    normalizedScore: round2(normalizedScore),
  };
}

function computeCompositeSignals(exerciseSignals: ExerciseSignal[]): CompositeSignal[] {
  const byMovement = new Map<ExerciseHistory["movement"], ExerciseSignal[]>();

  exerciseSignals.forEach((item) => {
    if (!Number.isFinite(item.normalizedScore)) return;
    const bucket = byMovement.get(item.movement) ?? [];
    bucket.push(item);
    byMovement.set(item.movement, bucket);
  });

  return Array.from(byMovement.entries())
    .map(([movement, items]) => {
      if (!items.length) return null;
      const avgRaw = items.reduce((sum, item) => sum + item.normalizedScore, 0) / items.length;
      const score = Number.isFinite(avgRaw) ? round2(avgRaw) : 5;
      return {
        movement,
        exerciseCount: items.length,
        score,
      } satisfies CompositeSignal;
    })
    .filter((x): x is CompositeSignal => Boolean(x));
}

function buildStrengthChartPoints(
  history: ExerciseHistory[],
  range: DashboardRange
): Array<{ week: string; value: number }> {
  const safeHistory = history.length > 0 ? history : MOCK_EXERCISE_HISTORY;
  const expectedPoints = getExpectedPointCount(range);

  const maxSessions = Math.max(...safeHistory.map((exercise) => exercise.sessions.length), 0);
  const rawPoints: Array<{ week: string; value: number }> = [];

  for (let i = 0; i < maxSessions; i += 1) {
    const scores: number[] = [];

    safeHistory.forEach((exercise) => {
      const sessionSlice = exercise.sessions.slice(0, i + 1);
      if (!sessionSlice.length) return;

      const e1rms = sessionSlice
        .map((session) => calcE1RM(session.weight, session.reps))
        .filter((v) => Number.isFinite(v) && v > 0);

      if (!e1rms.length) return;

      const safeBaseline =
        Number.isFinite(exercise.baselineE1RM) && exercise.baselineE1RM > 0
          ? exercise.baselineE1RM
          : 1;

      const baselineWindow = e1rms.slice(0, Math.min(2, e1rms.length));
      const recentWindow = e1rms.slice(Math.max(0, e1rms.length - 2));

      const baselineAvgRaw = average(baselineWindow);
      const recentAvgRaw = average(recentWindow);

      const baselineAvg =
        Number.isFinite(baselineAvgRaw) && baselineAvgRaw > 0 ? baselineAvgRaw : safeBaseline;
      const recentAvg =
        Number.isFinite(recentAvgRaw) && recentAvgRaw > 0 ? recentAvgRaw : baselineAvg;

      const changePctRaw = ((recentAvg - baselineAvg) / baselineAvg) * 100;
      const changePct = Number.isFinite(changePctRaw) ? changePctRaw : 0;

      scores.push(scoreFromPctChange(changePct));
    });

    rawPoints.push({
      week: `W${i + 1}`,
      value: round2(scores.length > 0 ? average(scores) : 5),
    });
  }

  if (!expectedPoints || rawPoints.length <= expectedPoints) {
    return rawPoints;
  }

  const bucketed: Array<{ week: string; value: number }> = [];
  const bucketSize = rawPoints.length / expectedPoints;

  for (let i = 0; i < expectedPoints; i += 1) {
    const start = Math.floor(i * bucketSize);
    const end = Math.floor((i + 1) * bucketSize);
    const slice = rawPoints.slice(start, Math.max(start + 1, end));
    bucketed.push({
      week: `W${i + 1}`,
      value: round2(average(slice.map((p) => p.value))),
    });
  }

  return bucketed;
}

function classifyMovementPattern(exercise: Exercise, track: Track): StrengthMovement {
  const name = `${exercise.name} ${track.displayName}`.toLowerCase();

  const excludeTerms = [
    "lateral raise",
    "lat raise",
    "rear delt",
    "reverse pec deck",
    "rear pec deck",
    "face pull",
    "pull apart",
    "pull-apart",
    "pec deck",
    "fly",
    "curl",
    "pushdown",
    "push down",
    "tricep extension",
    "kickback",
    "leg extension",
    "leg curl",
    "hamstring curl",
    "calf raise",
    "shrug",
    "wall sit",
    "mobility",
    "corrective",
    "breathing",
    "dorsiflexion",
  ];

  if (excludeTerms.some((term) => name.includes(term))) return "exclude";

  if (
    name.includes("back squat") ||
    name.includes("front squat") ||
    name.includes("box squat") ||
    name.includes("safety bar squat") ||
    name.includes("goblet squat") ||
    name.includes("leg press") ||
    name.includes("hack squat") ||
    name.includes("smith squat")
  ) {
    return "squat";
  }

  if (
    name.includes("deadlift") ||
    name.includes("romanian deadlift") ||
    name.includes(" rdl") ||
    name.startsWith("rdl") ||
    name.includes("trap bar deadlift") ||
    name.includes("hip thrust") ||
    name.includes("glute bridge") ||
    name.includes("good morning")
  ) {
    return "hinge";
  }

  if (
    name.includes("bench press") ||
    name.includes("incline press") ||
    name.includes("decline press") ||
    name.includes("overhead press") ||
    name.includes("shoulder press") ||
    name.includes("chest press") ||
    name.includes("dip")
  ) {
    return "push";
  }

  if (
    name.includes("pull-up") ||
    name.includes("pull up") ||
    name.includes("chin-up") ||
    name.includes("chin up") ||
    name.includes("pulldown") ||
    name.includes("pull down") ||
    name.includes("barbell row") ||
    name.includes("pendlay row") ||
    name.includes("dumbbell row") ||
    name.includes("3-point row") ||
    name.includes("3 point row") ||
    name.includes("chest-supported row") ||
    name.includes("chest supported row") ||
    name.includes("seated cable row") ||
    name.includes("machine row") ||
    name.includes("cable row")
  ) {
    return "pull";
  }

  return "exclude";
}

function shouldIncludeInStrengthSignal(exercise: Exercise, track: Track): boolean {
  return classifyMovementPattern(exercise, track) !== "exclude";
}

function inferMovement(exercise: Exercise, track: Track): ExerciseHistory["movement"] {
  const movement = classifyMovementPattern(exercise, track);
  return movement === "exclude" ? "core" : movement;
}

function nearestBodyweightLb(bodyMetrics: BodyMetricEntry[], atMs: number): number | undefined {
  const usable = bodyMetrics
    .filter((m) => typeof m.weightLb === "number")
    .map((m) => ({
      at: pickBodyMetricTime(m),
      weightLb: m.weightLb as number,
    }))
    .sort((a, b) => a.at - b.at);

  if (!usable.length) return undefined;

  let chosen = usable[0].weightLb;
  for (const item of usable) {
    if (item.at <= atMs) chosen = item.weightLb;
    if (item.at > atMs) break;
  }
  return chosen;
}

function calcEffectiveWeightLb(
  set: SetEntry,
  exercise: Exercise,
  track: Track,
  bodyMetrics: BodyMetricEntry[],
  sessionAt: number
): number | undefined {
  const explicit = typeof set.weight === "number" ? set.weight : undefined;
  const name = `${exercise.name} ${track.displayName}`.toLowerCase();

  const looksBodyweight =
    exercise.equipment === "Bodyweight" ||
    exercise.category === "Bodyweight" ||
    name.includes("pull up") ||
    name.includes("pull-up") ||
    name.includes("chin up") ||
    name.includes("chin-up") ||
    name.includes("dip");

  if (!looksBodyweight) return explicit;

  const bw = nearestBodyweightLb(bodyMetrics, sessionAt);
  if (typeof bw !== "number") return explicit;
  return bw + (explicit ?? 0);
}

async function loadStrengthSource(range: DashboardRange): Promise<DbStrengthSource> {
  const startMs = rangeStartMs(range);

  const [exercises, tracks, sessions, sets, bodyMetrics] = await Promise.all([
    db.exercises.toArray(),
    db.tracks.toArray(),
    startMs
      ? db.sessions.where("startedAt").aboveOrEqual(startMs).toArray()
      : db.sessions.toArray(),
    db.sets.toArray(),
    db.bodyMetrics.toArray(),
  ]);

  return { exercises, tracks, sessions, sets, bodyMetrics };
}

function buildExerciseHistoryFromDb(source: DbStrengthSource): ExerciseHistory[] {
  const exerciseById = new Map(source.exercises.map((e) => [e.id, e]));
  const trackById = new Map(source.tracks.map((t) => [t.id, t]));
  const sessionById = new Map(
    source.sessions.filter((s) => !s.deletedAt).map((s) => [s.id, s])
  );

  const perExerciseSessionBest = new Map<
    string,
    {
      exerciseId: string;
      label: string;
      movement: ExerciseHistory["movement"];
      items: Array<{ at: number; weight: number; reps: number; rir?: number }>;
    }
  >();

  for (const set of source.sets) {
    if (set.deletedAt) continue;
    if (set.setType !== "working") continue;
    if (!set.completedAt) continue;
    if (typeof set.reps !== "number" || set.reps <= 0) continue;

    const track = trackById.get(set.trackId);
    if (!track) continue;

    const exercise = exerciseById.get(track.exerciseId);
    if (!exercise) continue;

    if (!shouldIncludeInStrengthSignal(exercise, track)) continue;

    const session = sessionById.get(set.sessionId);
    if (!session) continue;

    const at = session.startedAt ?? set.completedAt ?? set.createdAt;
    const effectiveWeight = calcEffectiveWeightLb(set, exercise, track, source.bodyMetrics, at);

    if (
      typeof effectiveWeight !== "number" ||
      !Number.isFinite(effectiveWeight) ||
      effectiveWeight <= 0
    ) {
      continue;
    }

    const currentE1RM = calcE1RM(effectiveWeight, set.reps);
    if (!Number.isFinite(currentE1RM) || currentE1RM <= 0) continue;

    const bucketKey = exercise.id;
    const existing =
      perExerciseSessionBest.get(bucketKey) ?? {
        exerciseId: exercise.id,
        label: track.displayName || exercise.name,
        movement: inferMovement(exercise, track),
        items: [],
      };

    const sameSessionIdx = existing.items.findIndex((x) => x.at === at);

    if (sameSessionIdx === -1) {
      existing.items.push({
        at,
        weight: effectiveWeight,
        reps: set.reps,
        rir: set.rir,
      });
    } else {
      const prev = existing.items[sameSessionIdx];
      const prevE1RM = calcE1RM(prev.weight, prev.reps);
      if (currentE1RM > prevE1RM) {
        existing.items[sameSessionIdx] = {
          at,
          weight: effectiveWeight,
          reps: set.reps,
          rir: set.rir,
        };
      }
    }

    perExerciseSessionBest.set(bucketKey, existing);
  }

  return Array.from(perExerciseSessionBest.values())
    .map((entry) => {
      const sessions = entry.items
        .sort((a, b) => a.at - b.at)
        .map((item) => ({
          date: new Date(item.at).toISOString().slice(0, 10),
          weight: item.weight,
          reps: item.reps,
          rir: item.rir,
        }));

      if (sessions.length < 2) return null;

      const baselineE1RM = calcE1RM(sessions[0].weight, sessions[0].reps);
      if (!Number.isFinite(baselineE1RM) || baselineE1RM <= 0) return null;

      return {
        exerciseId: entry.exerciseId,
        label: entry.label,
        movement: entry.movement,
        baselineE1RM,
        sessions,
      } satisfies ExerciseHistory;
    })
    .filter((x): x is ExerciseHistory => Boolean(x));
}

function computeStrengthSignal(
  phase: DashboardPhase,
  range: DashboardRange,
  exerciseHistory: ExerciseHistory[]
): StrengthSignalResult {
  const safeHistory = exerciseHistory.length >= 2 ? exerciseHistory : MOCK_EXERCISE_HISTORY;

  const exerciseSignals = safeHistory
    .map(computeExerciseSignal)
    .filter(
      (item) =>
        Number.isFinite(item.latestE1RM) &&
        Number.isFinite(item.baselineAvgE1RM) &&
        Number.isFinite(item.recentAvgE1RM) &&
        Number.isFinite(item.changePct) &&
        Number.isFinite(item.normalizedScore)
    );

  const composites = computeCompositeSignals(exerciseSignals);

  const MOVEMENT_WEIGHTS: Record<ExerciseHistory["movement"], number> = {
    squat: 3,
    hinge: 3,
    push: 2,
    pull: 2,
    lunge: 1,
    carry: 1,
    core: 0,
  };

  const weightedItems = composites.filter(
    (item) => Number.isFinite(item.score) && (MOVEMENT_WEIGHTS[item.movement] ?? 0) > 0
  );

  const totalWeight = weightedItems.reduce(
    (sum, item) => sum + (MOVEMENT_WEIGHTS[item.movement] ?? 0),
    0
  );

  const rawScore =
    totalWeight > 0
      ? weightedItems.reduce(
          (sum, item) => sum + item.score * (MOVEMENT_WEIGHTS[item.movement] ?? 0),
          0
        ) / totalWeight
      : 5;

  const score = Number.isFinite(rawScore) ? round2(rawScore) : 5;

  const avgChangePct =
    exerciseSignals.length > 0
      ? exerciseSignals.reduce((sum, item) => sum + item.changePct, 0) / exerciseSignals.length
      : 0;

  const safeAvgChangePct = Number.isFinite(avgChangePct) ? avgChangePct : 0;

  const chartPoints = buildStrengthChartPoints(safeHistory, range);

  const summary =
    phase === "CUT"
      ? "Strength Signal is rising on a rolling 2-session basis while cutting, which supports muscle preservation."
      : phase === "MAINTAIN"
        ? "Strength Signal is stable-to-rising on a rolling 2-session basis, which supports performance stability."
        : "Strength Signal is rising on a rolling 2-session basis, which supports productive growth quality.";

  return {
    score,
    trend: trendFromChange(safeAvgChangePct),
    exerciseSignals,
    composites,
    chartPoints,
    summary,
  };
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

/* ============================================================================
   Breadcrumb 6 — Dashboard view model builder
   ============================================================================ */

function buildDashboardViewModel(
  phase: DashboardPhase,
  range: DashboardRange,
  exerciseHistory: ExerciseHistory[],
  bodySnapshot: DashboardBodySnapshot,
  bodyWeightTrendData: ChartDatum[],
  waistTrendData: ChartDatum[]
): DashboardViewModel {
  const usingFallback = exerciseHistory.length < 2;
  const sourceHistory = usingFallback ? MOCK_EXERCISE_HISTORY : exerciseHistory;

  const strengthSignal = computeStrengthSignal(phase, range, sourceHistory);
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
      { label: "Strength Signal", value: strengthSignal.score.toFixed(2) },
      { label: "Body Weight", value: bodySnapshot.weightLabel },
      { label: "Waist", value: bodySnapshot.waistLabel },
      { label: "Strength Efficiency", value: primarySignal.strengthEfficiencyLabel },
    ],
    charts: {
      strength: {
        id: "strength",
        title: "Strength Signal",
        subtitle: `Weekly trend • ${range}`,
        direction: strengthSignal.trend,
        momentumMessage,
        analysisRows: [
          { label: "Formula", value: "Rolling 2-session composite strength" },
          { label: "Start Value", value: strengthAnalysis.start.toFixed(2) },
          { label: "Current Value", value: strengthAnalysis.current.toFixed(2) },
          {
            label: "Overall Change",
            value: `${strengthAnalysis.changePct > 0 ? "+" : ""}${strengthAnalysis.changePct}%`,
          },
          { label: "Highest Value", value: strengthAnalysis.high.toFixed(2) },
          { label: "Lowest Value", value: strengthAnalysis.low.toFixed(2) },
          { label: "Exercises Included", value: String(strengthSignal.exerciseSignals.length) },
          { label: "Top Composite", value: topComposite },
        ],
        interpretation: strengthSignal.summary,
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
      "Next: add an explicit Cut Quality evidence card below the phase selector.",
      "Next: build the Cut Quality quadrant on the Muscle Preservation page.",
      "Next: make the rolling window user-configurable.",
      "Next: let the user select which exercises contribute to Strength Signal.",
    ],
    debug: {
      dataSource: usingFallback ? "Mock Fallback" : "Real DB",
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
        .sort((a, b) => b.changePct - a.changePct)
        .slice(0, 5)
        .map((item) => ({
          label: item.label,
          changePct: `${item.changePct > 0 ? "+" : ""}${item.changePct.toFixed(2)}%`,
          score: item.normalizedScore.toFixed(2),
        })),
    },
  };
}

/* ============================================================================
   Breadcrumb 7 — UI helpers
   ============================================================================ */

function iconForTrend(direction: TrendDirection) {
  if (direction === "improving") return "↗";
  if (direction === "stable") return "→";
  if (direction === "declining") return "↘";
  return "!";
}

function badgeClassForTrend(direction: TrendDirection) {
  return direction === "improving" ? "badge green" : "badge";
}

function AnalysisRows({ rows }: { rows: AnalysisRow[] }) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {rows.map((row) => (
        <div key={row.label} className="kv">
          <span>{row.label}</span>
          <span style={{ color: "var(--text)", fontWeight: 700 }}>{row.value}</span>
        </div>
      ))}
    </div>
  );
}

function SectionHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle: string;
  right?: React.ReactNode;
}) {
  return (
    <div style={{ display: "grid", gap: 8, marginBottom: 4 }}>
      <div>
        <h2 style={{ margin: 0 }}>{title}</h2>
        <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
          {subtitle}
        </div>
      </div>
      {right ? <div>{right}</div> : null}
    </div>
  );
}

function PhaseControl({
  activePhase,
  onChange,
}: {
  activePhase: DashboardPhase;
  onChange: (phase: DashboardPhase) => void;
}) {
  return (
    <div className="row">
      {PHASE_TABS.map((tab) => {
        const active = tab.phase === activePhase;
        return (
          <button
            key={tab.phase}
            type="button"
            className={`btn ${active ? "primary" : ""}`}
            onClick={() => onChange(tab.phase)}
            title={tab.tone}
          >
            {tab.phase}
          </button>
        );
      })}
    </div>
  );
}

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

function TrendBadge({ direction }: { direction: TrendDirection }) {
  return (
    <span className={badgeClassForTrend(direction)}>
      {iconForTrend(direction)} {direction}
    </span>
  );
}

function DashboardChartCard({
  chart,
  chartData,
  series,
  yDomainMode,
  valueFormatter,
  emptyMessage,
}: {
  chart: ChartViewModel;
  chartData: ChartDatum[];
  series: ChartSeriesConfig[];
  yDomainMode: "auto" | "tight";
  valueFormatter: (value: number | null | undefined) => string;
  emptyMessage: string;
}) {
  return (
    <div className="card">
      <div
        className="row"
        style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}
      >
        <div>
          <h3 style={{ margin: 0 }}>{chart.title}</h3>
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            {chart.subtitle}
          </div>

          {chart.momentumMessage ? (
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              {chart.momentumMessage}
            </div>
          ) : null}
        </div>
        <TrendBadge direction={chart.direction} />
      </div>

      <TrendChartCard
        title={chart.title}
        subtitle={chart.subtitle}
        data={chartData}
        series={series}
        yDomainMode={yDomainMode}
        valueFormatter={valueFormatter}
        tooltipLabelFormatter={(label, datum) => {
          if (typeof datum?.date === "string" && datum.date.trim()) return datum.date;
          return label;
        }}
        emptyMessage={emptyMessage}
      />

      <div className="grid two dashboard-analysis" style={{ marginTop: 12 }}>
        <div className="card">
          <div
            className="row"
            style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}
          >
            <strong>Analysis</strong>
            <TrendBadge direction={chart.direction} />
          </div>
          <AnalysisRows rows={chart.analysisRows} />
        </div>

        <div className="card">
          <div
            className="row"
            style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}
          >
            <strong>Coach Interpretation</strong>
            <TrendBadge direction={chart.direction} />
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.5 }}>{chart.interpretation}</div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   Breadcrumb 8 — Page
   ============================================================================ */

export default function PerformanceDashboardPage() {
  const navigate = useNavigate();

  const [activePhase, setActivePhase] = useState<DashboardPhase>("CUT");
  const [activeRange, setActiveRange] = useState<DashboardRange>("8W");
  const [exerciseHistory, setExerciseHistory] = useState<ExerciseHistory[]>(MOCK_EXERCISE_HISTORY);
  const [dbSource, setDbSource] = useState<DbStrengthSource | null>(null);
  const [showDebug, setShowDebug] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const source = await loadStrengthSource(activeRange);
        const realHistory = buildExerciseHistoryFromDb(source);

        if (!cancelled) {
          setDbSource(source);
        }

        if (!cancelled && realHistory.length >= 2) {
          setExerciseHistory(realHistory);
        } else if (!cancelled) {
          setExerciseHistory(MOCK_EXERCISE_HISTORY);
        }
      } catch (err) {
        console.error("PerformanceDashboardPage load failed:", err);
        if (!cancelled) {
          setDbSource(null);
          setExerciseHistory(MOCK_EXERCISE_HISTORY);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [activeRange]);

  const bodySnapshot = useMemo(
    () => buildCurrentBodySnapshot(dbSource?.bodyMetrics ?? []),
    [dbSource]
  );

  const strengthChartData: ChartDatum[] = useMemo(
    () =>
      buildStrengthChartPoints(
        exerciseHistory.length >= 2 ? exerciseHistory : MOCK_EXERCISE_HISTORY,
        activeRange
      ).map((point) => ({
        label: point.week,
        value: point.value,
        date: point.week,
      })),
    [exerciseHistory, activeRange]
  );

  const bodyWeightChartData = useMemo(
    () => buildBodyWeightTrend(dbSource?.bodyMetrics ?? [], activeRange),
    [dbSource, activeRange]
  );

  const waistChartData = useMemo(
    () => buildWaistTrend(dbSource?.bodyMetrics ?? [], activeRange),
    [dbSource, activeRange]
  );

  const vm = useMemo(
    () =>
      buildDashboardViewModel(
        activePhase,
        activeRange,
        exerciseHistory,
        bodySnapshot,
        bodyWeightChartData,
        waistChartData
      ),
    [activePhase, activeRange, exerciseHistory, bodySnapshot, bodyWeightChartData, waistChartData]
  );

  const volumeChartData = useMemo(
    () => buildVolumeTrend(dbSource?.sessions ?? [], dbSource?.sets ?? [], activeRange),
    [dbSource, activeRange]
  );

  const strengthSeries: ChartSeriesConfig[] = useMemo(
    () => [
      {
        key: "value",
        label: "Strength Signal",
        formatter: (value) => (value == null || !Number.isFinite(value) ? "—" : value.toFixed(2)),
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
    <Page title="Performance">
      {/* ======================================================================
          Breadcrumb 8A — Compact top header
         ==================================================================== */}
      <Section>
        <div
          className="row"
          style={{
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 6,
          }}
        >
          <h2 style={{ margin: 0 }}>Performance</h2>

          <div
            className="muted"
            style={{
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              padding: "4px 6px",
              borderRadius: 6,
            }}
            onClick={() => navigate("/progress")}
          >
            ← Progress
          </div>
        </div>
      </Section>

      {/* ======================================================================
          Breadcrumb 8B — Page breadcrumb + header card
         ==================================================================== */}
      <Section>
        <div className="card" style={{ marginBottom: 12, padding: 14 }}>
          <div
            className="muted"
            style={{
              fontSize: 12,
              fontWeight: 700,
              marginBottom: 8,
            }}
          >
            Progress / Performance
          </div>

          <div className="muted" style={{ lineHeight: 1.45 }}>
            Big-picture coaching view across strength, body composition, and training trends.
          </div>

          <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
            Current body metrics as of {bodySnapshot.asOfLabel}
          </div>
        </div>
      </Section>

      {/* ======================================================================
          Breadcrumb 8C — Hero area
         ==================================================================== */}
      <Section>
        <div className="dashboard-hero">
          <div className="card">
            <div
              className="row"
              style={{ justifyContent: "space-between", alignItems: "flex-start" }}
            >
              <div>
                <div
                  className="muted"
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  Overview
                </div>
                <h2 style={{ marginTop: 6 }}>Dashboard Overview</h2>
                <div className="muted" style={{ fontSize: 14 }}>
                  Flagship signals, charts, and coaching insights.
                </div>
              </div>
              <span className="badge">Preview</span>
            </div>

            <hr />

            <label>Current Phase</label>
            <div style={{ marginTop: 8 }}>
              <PhaseControl activePhase={activePhase} onChange={setActivePhase} />
            </div>

            <div className="card" style={{ marginTop: 10 }}>
              <div style={{ fontSize: 14, lineHeight: 1.5 }}>{vm.heroSummary}</div>
            </div>

            <div className="grid two dashboard-hero-stats" style={{ marginTop: 12 }}>
              {vm.heroStats.map((stat) => (
                <div key={stat.label} className="card dashboard-stat">
                  <div className="muted dashboard-stat-label">{stat.label}</div>
                  <div className="dashboard-stat-value">{stat.value}</div>
                </div>
              ))}
            </div>
          </div>

                    <div className="card">
	              <div
	                className="card"
	                style={{
	                  borderColor: "rgba(34, 197, 94, 0.22)",
	                  background: "rgba(34, 197, 94, 0.035)",
	                }}
	              >
	                <div
	                  className="row"
	                  style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}
	                >
	                  <div>
	                    <div className="row" style={{ alignItems: "center", gap: 10 }}>
	                      <span className="badge green">✓ flagship</span>
	                      <div
	                        className="muted"
	                        style={{ fontSize: 12, textTransform: "uppercase", fontWeight: 700 }}
	                      >
	                        Flagship Signal
	                      </div>
	                    </div>
	  
	                    <h2 style={{ marginTop: 10, marginBottom: 0 }}>{vm.flagshipTitle}</h2>
	                  </div>
	  
	                  <span
	                    className={
	                      vm.flagshipBadge === "Strong" || vm.flagshipBadge === "Productive"
	                        ? "badge green"
	                        : "badge"
	                    }
	                  >
	                    {vm.flagshipBadge}
	                  </span>
	                </div>
	  
	                <div
	                  className="row"
	                  style={{ justifyContent: "space-between", alignItems: "flex-end", marginTop: 16 }}
	                >
	                  <div>
	                    <div className="dashboard-flagship-score">{vm.flagshipScore}</div>
	                    <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
	                      out of 100
	                    </div>
	                  </div>
	                </div>
	  
	                <div style={{ marginTop: 14 }}>
	                  <div
	                    style={{
	                      width: "100%",
	                      height: 10,
	                      background: "#e5e7eb",
	                      borderRadius: 999,
	                      overflow: "hidden",
	                    }}
	                  >
	                    <div
	                      style={{
	                        width: `${vm.flagshipScore}%`,
	                        height: "100%",
	                        background: "var(--accent)",
	                        borderRadius: 999,
	                      }}
	                    />
	                  </div>
	                </div>
	  
	                <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
	                  {vm.insights[0]?.evidence?.slice(0, 3).map((bullet) => {
			    let icon = "✓";
			    let color = "var(--accent)";
			  
			    const text = bullet.toLowerCase();
			  
			    if (text.includes("rising during cut") || text.includes("building")) {
			      icon = "⚠";
			      color = "#f59e0b"; // amber
			    }
			  
			    if (text.includes("needs correction") || text.includes("declining")) {
			      icon = "✕";
			      color = "#ef4444"; // red
			    }
			  
			    return (
			      <div
			        key={bullet}
			        className="row"
			        style={{ alignItems: "center", gap: 10 }}
			      >
			        <span
			          style={{
			            color,
			            fontSize: 16,
			            lineHeight: 1,
			            fontWeight: 700,
			          }}
			        >
			          {icon}
			        </span>
			  
			        <span style={{ fontSize: 14, lineHeight: 1.4 }}>{bullet}</span>
			      </div>
			    );
                          })}
	                </div>
	              </div>
	  
	              <div className="card" style={{ marginTop: 12 }}>
	                <div style={{ fontSize: 14, lineHeight: 1.5 }}>{vm.flagshipBody}</div>
	              </div>
          </div>
        </div>
      </Section>

      {/* ======================================================================
          Breadcrumb 8D — Charts + insights
         ==================================================================== */}
      <Section>
        <div className="grid two" style={{ alignItems: "start" }}>
          <div className="list">
            <div className="card">
              <SectionHeader
                title="Trend Charts"
                subtitle="Pattern recognition, quick analysis, and interpretation."
                right={<TimeRangeControl activeRange={activeRange} onChange={setActiveRange} />}
              />
            </div>

            <DashboardChartCard
              chart={vm.charts.strength}
              chartData={strengthChartData}
              series={strengthSeries}
              yDomainMode="auto"
              valueFormatter={(value) =>
                value == null || !Number.isFinite(value) ? "—" : value.toFixed(2)
              }
              emptyMessage="Not enough strength history yet."
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

          <div className="list">
            <div className="card">
              <SectionHeader
                title="Coaching Insights"
                subtitle="Phase-aware outputs from the selector / rules layer."
              />
            </div>

            {vm.insights.map((item) => (
              <div key={item.id} className="card dashboard-insight">
                <div
                  className="row"
                  style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}
                >
                  <h3 style={{ margin: 0 }}>{item.title}</h3>
                  <div className="row">
                    <span
                      className={
                        item.status === "Strong" || item.status === "Productive"
                          ? "badge green"
                          : "badge"
                      }
                    >
                      {item.status}
                    </span>
                    <span className="badge">{item.confidence}</span>
                  </div>
                </div>

                <div style={{ fontSize: 14, lineHeight: 1.5 }}>{item.body}</div>

                <div className="list" style={{ marginTop: 10 }}>
                  {item.evidence.map((evidenceItem) => (
                    <div key={evidenceItem} className="card">
                      {evidenceItem}
                    </div>
                  ))}
                </div>

                {item.action ? (
                  <div className="card" style={{ marginTop: 10, fontWeight: 700 }}>
                    {item.action}
                  </div>
                ) : null}
              </div>
            ))}

            <div className="card">
              <div
                className="row"
                style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}
              >
                <h3 style={{ margin: 0 }}>Strength Signal Debug</h3>
                <button
                  type="button"
                  className="btn small"
                  onClick={() => setShowDebug((v) => !v)}
                >
                  {showDebug ? "Hide Debug" : "Show Debug"}
                </button>
              </div>

              <div className="kv">
                <span>Data Source</span>
                <span style={{ color: "var(--text)", fontWeight: 700 }}>{vm.debug.dataSource}</span>
              </div>

              <div className="kv" style={{ marginTop: 8 }}>
                <span>Exercises Counted</span>
                <span style={{ color: "var(--text)", fontWeight: 700 }}>
                  {vm.debug.exercisesCounted}
                </span>
              </div>

              <div className="kv" style={{ marginTop: 8 }}>
                <span>Current Signal</span>
                <span style={{ color: "var(--text)", fontWeight: 700 }}>
                  {vm.debug.currentSignal}
                </span>
              </div>

              <div className="kv" style={{ marginTop: 8 }}>
                <span>Top Composite</span>
                <span style={{ color: "var(--text)", fontWeight: 700 }}>
                  {vm.debug.topComposite}
                </span>
              </div>

              {showDebug ? (
                <div className="list" style={{ marginTop: 12 }}>
                  <div className="card">
                    <strong>Composite Scores</strong>
                    <div className="list" style={{ marginTop: 10 }}>
                      {vm.debug.composites.map((item) => (
                        <div key={item.movement} className="kv">
                          <span>
                            {item.movement} ({item.exerciseCount})
                          </span>
                          <span style={{ color: "var(--text)", fontWeight: 700 }}>
                            {item.score}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="card">
                    <strong>Top Exercise Signals</strong>
                    <div className="list" style={{ marginTop: 10 }}>
                      {vm.debug.topExercises.map((item) => (
                        <div key={item.label} className="kv">
                          <span>{item.label}</span>
                          <span style={{ color: "var(--text)", fontWeight: 700 }}>
                            {item.changePct} • {item.score}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="card">
              <h3>Build Priorities</h3>
              <div className="list">
                {vm.actions.map((action) => (
                  <div key={action} className="card dashboard-priority">
                    {action}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Section>
    </Page>
  );
}

/* ============================================================================
   FOOTER COMMENT
   FILE: src/pages/PerformanceDashboardPage.tsx
   ============================================================================ */