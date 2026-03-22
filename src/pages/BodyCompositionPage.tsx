// src/pages/BodyCompositionPage.tsx
/* ============================================================================
   BodyCompositionPage.tsx
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-03-21-BODYCOMP-10
   FILE: src/pages/BodyCompositionPage.tsx

   Purpose
   - Provide a dedicated analytics page for body-composition trends
   - Separate body entry/logging from body-composition interpretation
   - Establish the phase-aware framework for Cut / Maintain / Bulk

   Final v1 scope
   - Compact app-style header with Progress back link
   - Breadcrumb header card
   - Quick link back to Body metrics entry page
   - Phase-first layout
   - Latest snapshot strip with percent change vs previous 3-entry average
   - Coaching signals section
   - Weight / Waist / Body Fat % / Fat Mass / Lean Mass trend charts
   - Refactored chart config map to reduce repeated chart boilerplate

   Notes
   - Weight and waist remain separate charts because they use different units
     and scales
   - Fat mass and lean mass are derived from weight and body-fat %
   - This page is intended to be stable for a while after this version

   Layout guardrail
   - Keep the prod-style top header:
     * Big page title
     * Compact top nav card with page label + ← Progress
     * Separate detail card below
   - Keep Goal Targets and Latest Snapshot as compact row layouts
   - Do not replace these sections with HubPageHeader or stacked metric tiles
   ============================================================================ */
   /* --------------------------------------------------------------------------
      Layout guardrail
      - Keep the current prod-style top header stack
      - Keep Goal Targets as compact rows
      - Keep Latest Snapshot as compact rows
      - Do not replace these sections with shared header components
      - Do not revert these sections to stacked metric tiles without review
   -------------------------------------------------------------------------- */

import React, { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate } from "react-router-dom";
import { db } from "../db";
import { Page, Section } from "../components/Page.tsx";
import TrendChartCard from "../components/charts/TrendChartCard";
import PhaseQualityCard from "../components/phase/PhaseQualityCard";
import type { ChartDatum, ChartSeriesConfig } from "../components/charts/chartTypes";
import { formatInches, formatLbs } from "../components/charts/chartFormatters";
import {
  averagePreviousValues as sharedAveragePreviousValues,
  computePhaseSignal as sharedComputePhaseSignal,
  pickTime as sharedPickTime,
  pickWeightLb as sharedPickWeightLb,
  pickWaistIn as sharedPickWaistIn,
  pickBodyFatPct as sharedPickBodyFatPct,
} from "../body/bodySignalModel";
import {
  getFatMassLb,
  getLeanMassLb,
  getTBW,
  getFluidRatio,
  getCorrectedBodyFatPct,
  getCorrectedLeanMassLb,
  getBodyCompConfidence,
  getBodyCompConfidenceLabel,
  getFluidBalanceNote,
} from "../body/bodyCalculations";
import {
  computeStrengthTrend,
  type StrengthTrendRow,
} from "../strength/Strength";

type Mode = "cut" | "maintain" | "bulk";

type BodyMetricRow = {
  id: string;
  takenAt?: number;
  measuredAt?: number;
  date?: number;
  createdAt?: number;

  weightLb?: number;
  weight?: number;

  waistIn?: number;
  waist?: number;

  bodyFatPct?: number;
  bodyFatMassLb?: number;
  leanMassLb?: number;
  skeletalMuscleMassLb?: number;
  visceralFatIndex?: number;
  bodyWaterPct?: number;

  icwLb?: number;
  ecwLb?: number;
  mineralMassLb?: number;
};

const MODE_KEY = "workout_pwa_bodycomp_mode_v1";
const PROFILE_STORAGE_KEY = "workout_pwa_profile_v1";

type ProfileGoalData = {
  targetWeightLb?: string;
  targetBodyFatPct?: string;
};

type PhaseQualityStrengthResult = {
  strengthDelta?: number;
  strengthLabel: string;
};

function computeStrengthDeltaFromTrend(
  trend: StrengthTrendRow[],
  mode: Mode
): PhaseQualityStrengthResult {
  const sorted = (trend ?? [])
    .slice()
    .filter((r) =>
      mode === "bulk"
        ? Number.isFinite(r.absoluteIndex)
        : Number.isFinite(r.relativeIndex)
    )
    .sort((a, b) => a.weekEndMs - b.weekEndMs);

  const recent = sorted.slice(-4);

  if (recent.length < 2) {
    return {
      strengthDelta: undefined,
      strengthLabel:
        mode === "bulk"
          ? "Absolute strength trend needs more weekly data"
          : "Relative strength trend needs more weekly data",
    };
  }

  const first = recent[0];
  const last = recent[recent.length - 1];

  const firstValue =
    mode === "bulk" ? first.absoluteIndex : first.relativeIndex;
  const lastValue =
    mode === "bulk" ? last.absoluteIndex : last.relativeIndex;

  if (!Number.isFinite(firstValue) || !Number.isFinite(lastValue)) {
    return {
      strengthDelta: undefined,
      strengthLabel:
        mode === "bulk"
          ? "Absolute strength trend unavailable"
          : "Relative strength trend unavailable",
    };
  }

  return {
    strengthDelta: lastValue - firstValue,
    strengthLabel:
      mode === "bulk"
        ? `Using Absolute Strength trend • last ${recent.length} weekly points`
        : `Using Relative Strength trend • last ${recent.length} weekly points`,
  };
}

function loadProfileGoals(): {
  targetWeightLb?: number;
  targetBodyFatPct?: number;
} {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw) as ProfileGoalData;

    const targetWeightLb =
      parsed?.targetWeightLb != null && parsed.targetWeightLb !== ""
        ? Number(parsed.targetWeightLb)
        : undefined;

    const targetBodyFatPct =
      parsed?.targetBodyFatPct != null && parsed.targetBodyFatPct !== ""
        ? Number(parsed.targetBodyFatPct)
        : undefined;

    return {
      targetWeightLb:
        targetWeightLb != null && Number.isFinite(targetWeightLb)
          ? targetWeightLb
          : undefined,
      targetBodyFatPct:
        targetBodyFatPct != null && Number.isFinite(targetBodyFatPct)
          ? targetBodyFatPct
          : undefined,
    };
  } catch {
    return {};
  }
}

/* ============================================================================
   Breadcrumb 1 — Helpers
   ============================================================================ */

function fmtShortDate(ms: number) {
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function fmtSnapshotDate(ms?: number) {
  if (!ms || !Number.isFinite(ms)) return "—";
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatBodyFatPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}%`;
}

function computePercentChange(current?: number, baseline?: number) {
  if (
    current == null ||
    baseline == null ||
    !Number.isFinite(current) ||
    !Number.isFinite(baseline) ||
    baseline === 0
  ) {
    return undefined;
  }

  return ((current - baseline) / baseline) * 100;
}

function formatChange(pct?: number) {
  if (pct == null || !Number.isFinite(pct)) return "—";
  const arrow = pct > 0 ? "↑" : pct < 0 ? "↓" : "→";
  const signed = pct > 0 ? `+${pct.toFixed(1)}%` : `${pct.toFixed(1)}%`;
  return `${arrow} ${signed}`;
}

function formatRemaining(value?: number, unit = "") {
  if (value == null || !Number.isFinite(value)) return "—";
  if (Math.abs(value) < 0.05) return `At goal${unit ? ` ${unit}` : ""}`;
  const sign = value > 0 ? "" : "+";
  return `${sign}${value.toFixed(1)}${unit ? ` ${unit}` : ""}`;
}

function getChangeColor(
  pct: number | undefined,
  direction: "lower-is-better" | "higher-is-better"
) {
  if (pct == null || !Number.isFinite(pct) || pct === 0) {
    return "var(--muted)";
  }

  const isGood = direction === "lower-is-better" ? pct < 0 : pct > 0;
  return isGood ? "var(--accent)" : "var(--danger)";
}





function loadMode(): Mode {
  try {
    const raw = String(localStorage.getItem(MODE_KEY) ?? "");
    if (raw === "cut" || raw === "maintain" || raw === "bulk") return raw;
  } catch {}
  return "cut";
}

function saveMode(mode: Mode) {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {}
}

function modeSummary(mode: Mode) {
  if (mode === "cut") {
    return {
      primary: "Fat Loss Focus",
      secondary: "Watch waist and weight together.",
      confidence: "Confidence comes from repeated body snapshots.",
    };
  }

  if (mode === "bulk") {
    return {
      primary: "Lean Gain Focus",
      secondary: "Look for controlled weight gain and stable waist.",
      confidence: "Trends matter more than single check-ins.",
    };
  }

  return {
    primary: "Maintenance Focus",
    secondary: "Look for stable weight with minimal waist drift.",
    confidence: "Small changes can still indicate recomp.",
  };
}

/* ============================================================================
   Breadcrumb 2 — Compact row helpers
   ============================================================================ */

function SnapshotRow({
  label,
  value,
  changeText,
  changeColor,
  showDivider = true,
}: {
  label: string;
  value: string;
  changeText: string;
  changeColor: string;
  showDivider?: boolean;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(140px, 1fr) auto auto",
        alignItems: "center",
        gap: 12,
        padding: "10px 0",
        borderBottom: showDivider ? "1px solid var(--line)" : "none",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 0.6,
          color: "var(--muted)",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>

      <div
        style={{
          fontWeight: 900,
          fontSize: 17,
          lineHeight: 1.1,
          letterSpacing: -0.2,
          color: "var(--text)",
          textAlign: "right",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </div>

      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: changeColor,
          textAlign: "right",
          whiteSpace: "nowrap",
          minWidth: 74,
        }}
      >
        {changeText}
      </div>
    </div>
  );
}

function TargetRow({
  label,
  value,
  remainingText,
  showDivider = true,
}: {
  label: string;
  value: string;
  remainingText: string;
  showDivider?: boolean;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(140px, 1fr) auto auto",
        alignItems: "center",
        gap: 12,
        padding: "10px 0",
        borderBottom: showDivider ? "1px solid var(--line)" : "none",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 0.6,
          color: "var(--muted)",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>

      <div
        style={{
          fontWeight: 900,
          fontSize: 17,
          lineHeight: 1.1,
          letterSpacing: -0.2,
          color: "var(--text)",
          textAlign: "right",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </div>

      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "var(--muted)",
          textAlign: "right",
          whiteSpace: "nowrap",
          minWidth: 90,
        }}
      >
        {remainingText === "—" ? "—" : `Remaining: ${remainingText}`}
      </div>
    </div>
  );
}

/* ============================================================================
   Breadcrumb 3 — Page
   ============================================================================ */

export default function BodyCompositionPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>(() => loadMode());
  const [strengthTrend, setStrengthTrend] = useState<StrengthTrendRow[]>([]);

  const rows = useLiveQuery(async () => {
    try {
      const arr = ((await db.bodyMetrics.toArray()) ?? []) as BodyMetricRow[];
      return arr
        .slice()
        .sort((a, b) => sharedPickTime(b) - sharedPickTime(a))
        .slice(0, 60);
    } catch {
    return [] as BodyMetricRow[];
    }
  }, []);

  React.useEffect(() => {
    saveMode(mode);
  }, [mode]);

  React.useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const trend = await computeStrengthTrend(12, 28);
        if (!alive) return;
        setStrengthTrend(Array.isArray(trend) ? trend : []);
      } catch {
        if (!alive) return;
        setStrengthTrend([]);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  /* ==========================================================================
     Breadcrumb 3A — Derived data
     ========================================================================== */

  const profileGoals = useMemo(() => loadProfileGoals(), []);

  const chartRows = useMemo(() => {
    return (rows ?? [])
      .slice()
      .reverse()
      .filter((r) => sharedPickTime(r) > 0);
  }, [rows]);

  const latestSnapshot = useMemo(() => {
    const source = rows ?? [];
    const latest = source[0];

    const weight = latest ? sharedPickWeightLb(latest) : undefined;
    const waist = latest ? sharedPickWaistIn(latest) : undefined;
    const bodyFatPct = latest ? sharedPickBodyFatPct(latest) : undefined;
    const correctedBodyFatPct = latest ? getCorrectedBodyFatPct(latest as any) : undefined;
    const leanMass = latest ? getLeanMassLb(latest as any) : undefined;
    const correctedLeanMass = latest ? getCorrectedLeanMassLb(latest as any) : undefined;

    const prevWeightAvg = sharedAveragePreviousValues(source, sharedPickWeightLb, 3);
    const prevWaistAvg = sharedAveragePreviousValues(source, sharedPickWaistIn, 3);
    const prevBodyFatPctAvg = sharedAveragePreviousValues(source, sharedPickBodyFatPct, 3);
    const prevCorrectedBodyFatAvg = sharedAveragePreviousValues(
      source,
      (r) => getCorrectedBodyFatPct(r as any),
      3
    );
    const prevLeanAvg = sharedAveragePreviousValues(
      source,
      (r) => getLeanMassLb(r as any),
      3
    );
    const prevCorrectedLeanAvg = sharedAveragePreviousValues(
      source,
      (r) => getCorrectedLeanMassLb(r as any),
      3
    );

    const confidenceScore = latest ? getBodyCompConfidence(latest as any) : 0;
    const confidenceLabel = getBodyCompConfidenceLabel(confidenceScore);
    const fluidNote = latest
      ? getFluidBalanceNote(latest as any)
      : "Add ICW and ECW to assess fluid balance.";

    return {
      date: latest ? fmtSnapshotDate(sharedPickTime(latest)) : "—",

      weight,
      weightChange: computePercentChange(weight, prevWeightAvg),

      waist,
      waistChange: computePercentChange(waist, prevWaistAvg),

      bodyFatPct,
      bfChange: computePercentChange(bodyFatPct, prevBodyFatPctAvg),

      correctedBodyFatPct,
      correctedBfChange: computePercentChange(
        correctedBodyFatPct,
        prevCorrectedBodyFatAvg
      ),

      leanMass,
      leanChange: computePercentChange(leanMass, prevLeanAvg),

      correctedLeanMass,
      correctedLeanChange: computePercentChange(
        correctedLeanMass,
        prevCorrectedLeanAvg
      ),

      targetWeightLb: profileGoals.targetWeightLb,
      targetBodyFatPct: profileGoals.targetBodyFatPct,

      remainingWeightLb:
        weight != null && profileGoals.targetWeightLb != null
          ? weight - profileGoals.targetWeightLb
          : undefined,

      remainingCorrectedBfPct:
        correctedBodyFatPct != null && profileGoals.targetBodyFatPct != null
          ? correctedBodyFatPct - profileGoals.targetBodyFatPct
          : undefined,

      confidenceScore,
      confidenceLabel,
      fluidNote,
    };
  }, [rows, profileGoals]);

  const summary = modeSummary(mode);

  const phaseSignal = useMemo(
    () => sharedComputePhaseSignal(chartRows.slice(-10), mode),
    [chartRows, mode]
  );

  const phaseQualityStrength = useMemo(
    () => computeStrengthDeltaFromTrend(strengthTrend, mode),
    [strengthTrend, mode]
  );

  /* ============================================================================
     Breadcrumb 3C — Phase Quality Inputs (derived deltas)
     ============================================================================ */

  const phaseQualityInputs = useMemo(() => {
    const window = chartRows.slice(-10);

    if (window.length < 3) {
      return {
        strengthDelta: phaseQualityStrength.strengthDelta,
        strengthLabel: phaseQualityStrength.strengthLabel,
        sampleCount: window.length,
      };
    }

    const first = window[0];
    const last = window[window.length - 1];

    const weightDelta =
      (sharedPickWeightLb(last) ?? 0) - (sharedPickWeightLb(first) ?? 0);

    const waistDelta =
      (sharedPickWaistIn(last) ?? 0) - (sharedPickWaistIn(first) ?? 0);

    const correctedLeanDelta =
      (getCorrectedLeanMassLb(last as any) ?? 0) -
      (getCorrectedLeanMassLb(first as any) ?? 0);

    const correctedBodyFatDelta =
      (getCorrectedBodyFatPct(last as any) ?? 0) -
      (getCorrectedBodyFatPct(first as any) ?? 0);

    return {
      weightDelta,
      waistDelta,
      correctedLeanDelta,
      correctedBodyFatDelta,
      strengthDelta: phaseQualityStrength.strengthDelta,
      strengthLabel: phaseQualityStrength.strengthLabel,
      sampleCount: window.length,
    };
  }, [chartRows, phaseQualityStrength]);

  /* ==========================================================================
     Breadcrumb 3B — Chart config map
     ========================================================================== */

  const chartConfigs = useMemo(() => {
    const weightData: ChartDatum[] = chartRows
      .filter((r) => sharedPickWeightLb(r) != null)
      .map((r) => ({
        label: fmtShortDate(sharedPickTime(r)),
        value: sharedPickWeightLb(r) ?? null,
        date: fmtShortDate(sharedPickTime(r)),
      }));

    const waistData: ChartDatum[] = chartRows
      .filter((r) => sharedPickWaistIn(r) != null)
      .map((r) => ({
        label: fmtShortDate(sharedPickTime(r)),
        value: sharedPickWaistIn(r) ?? null,
        date: fmtShortDate(sharedPickTime(r)),
      }));

    const bodyFatPctData: ChartDatum[] = chartRows
      .filter((r) => sharedPickBodyFatPct(r) != null)
      .map((r) => ({
        label: fmtShortDate(sharedPickTime(r)),
        value: sharedPickBodyFatPct(r) ?? null,
        date: fmtShortDate(sharedPickTime(r)),
      }));

    const correctedBodyFatPctData: ChartDatum[] = chartRows
      .filter((r) => getCorrectedBodyFatPct(r as any) != null)
      .map((r) => ({
        label: fmtShortDate(sharedPickTime(r)),
        value: getCorrectedBodyFatPct(r as any) ?? null,
        date: fmtShortDate(sharedPickTime(r)),
      }));

    const fatMassData: ChartDatum[] = chartRows
      .filter((r) => getFatMassLb(r as any) != null)
      .map((r) => ({
        label: fmtShortDate(sharedPickTime(r)),
        value: getFatMassLb(r as any) ?? null,
        date: fmtShortDate(sharedPickTime(r)),
      }));

    const leanMassData: ChartDatum[] = chartRows
      .filter((r) => getLeanMassLb(r as any) != null)
      .map((r) => ({
        label: fmtShortDate(sharedPickTime(r)),
        value: getLeanMassLb(r as any) ?? null,
        date: fmtShortDate(sharedPickTime(r)),
      }));

    const correctedLeanMassData: ChartDatum[] = chartRows
      .filter((r) => getCorrectedLeanMassLb(r as any) != null)
      .map((r) => ({
        label: fmtShortDate(sharedPickTime(r)),
        value: getCorrectedLeanMassLb(r as any) ?? null,
        date: fmtShortDate(sharedPickTime(r)),
      }));

    const tbwData: ChartDatum[] = chartRows
      .filter((r) => getTBW(r as any) != null)
      .map((r) => ({
        label: fmtShortDate(sharedPickTime(r)),
        value: getTBW(r as any) ?? null,
        date: fmtShortDate(sharedPickTime(r)),
      }));

    const fluidRatioData: ChartDatum[] = chartRows
      .filter((r) => getFluidRatio(r as any) != null)
      .map((r) => ({
        label: fmtShortDate(sharedPickTime(r)),
        value: getFluidRatio(r as any) ?? null,
        date: fmtShortDate(sharedPickTime(r)),
      }));

    const confidenceData: ChartDatum[] = chartRows
      .map((r) => ({
        label: fmtShortDate(sharedPickTime(r)),
        value: getBodyCompConfidence(r as any),
        date: fmtShortDate(sharedPickTime(r)),
      }))
      .filter((r) => r.value != null);

    return [
      {
        title: "Weight Trend",
        subtitle: "Recent bodyweight snapshots",
        data: weightData,
        series: [
          {
            key: "value",
            label: "Weight",
            formatter: formatLbs,
            stroke: "var(--accent)",
          },
        ] satisfies ChartSeriesConfig[],
        yDomainMode: "auto" as const,
        valueFormatter: (value: number | null | undefined) => formatLbs(value),
        emptyMessage: "Add a few weight entries to see the trend.",
      },
      {
        title: "Waist Trend",
        subtitle: "Recent waist snapshots",
        data: waistData,
        series: [
          {
            key: "value",
            label: "Waist",
            formatter: formatInches,
            stroke: "var(--text)",
          },
        ] satisfies ChartSeriesConfig[],
        yDomainMode: "tight" as const,
        valueFormatter: (value: number | null | undefined) => formatInches(value),
        emptyMessage: "Add a few waist entries to see the trend.",
      },
      {
        title: "Body Fat % Trend",
        subtitle: "Recent body fat percentage snapshots",
        data: bodyFatPctData,
        series: [
          {
            key: "value",
            label: "Body Fat %",
            formatter: formatBodyFatPct,
            stroke: "var(--text)",
          },
        ] satisfies ChartSeriesConfig[],
        yDomainMode: "tight" as const,
        valueFormatter: (value: number | null | undefined) => formatBodyFatPct(value),
        emptyMessage: "Add body fat % entries to see the trend.",
      },
      {
        title: "Corrected Body Fat % Trend",
        subtitle: "Fluid-aware body fat interpretation",
        data: correctedBodyFatPctData,
        series: [
          {
            key: "value",
            label: "Corrected BF %",
            formatter: formatBodyFatPct,
            stroke: "var(--accent)",
          },
        ] satisfies ChartSeriesConfig[],
        yDomainMode: "tight" as const,
        valueFormatter: (value: number | null | undefined) => formatBodyFatPct(value),
        emptyMessage: "Add body fat %, weight, and ideally ICW / ECW to see corrected body fat.",
      },
      {
        title: "Fat Mass Trend",
        subtitle: "Estimated fat mass from weight and body fat %",
        data: fatMassData,
        series: [
          {
            key: "value",
            label: "Fat Mass",
            formatter: formatLbs,
            stroke: "var(--text)",
          },
        ] satisfies ChartSeriesConfig[],
        yDomainMode: "auto" as const,
        valueFormatter: (value: number | null | undefined) => formatLbs(value),
        emptyMessage: "Add weight and body fat % entries to see fat mass.",
      },
      {
        title: "Lean Mass Trend",
        subtitle: "Estimated lean mass from weight and body fat %",
        data: leanMassData,
        series: [
          {
            key: "value",
            label: "Lean Mass",
            formatter: formatLbs,
            stroke: "var(--accent)",
          },
        ] satisfies ChartSeriesConfig[],
        yDomainMode: "auto" as const,
        valueFormatter: (value: number | null | undefined) => formatLbs(value),
        emptyMessage: "Add weight and body fat % entries to see lean mass.",
      },
      {
        title: "Corrected Lean Mass Trend",
        subtitle: "Fluid-aware lean mass interpretation",
        data: correctedLeanMassData,
        series: [
          {
            key: "value",
            label: "Corrected Lean Mass",
            shortLabel: "Corr Lean",
            formatter: formatLbs,
            stroke: "var(--accent)",
          },
        ] satisfies ChartSeriesConfig[],
        yDomainMode: "auto" as const,
        valueFormatter: (value: number | null | undefined) => formatLbs(value),
        emptyMessage: "Add weight, body fat %, and ideally ICW / ECW to see corrected lean mass.",
      },
      {
        title: "TBW Trend",
        subtitle: "Total body water from ICW + ECW",
        data: tbwData,
        series: [
          {
            key: "value",
            label: "TBW",
            formatter: formatLbs,
            stroke: "var(--text)",
          },
        ] satisfies ChartSeriesConfig[],
        yDomainMode: "auto" as const,
        valueFormatter: (value: number | null | undefined) => formatLbs(value),
        emptyMessage: "Add ICW and ECW entries to see TBW.",
      },
      {
        title: "Fluid Ratio Trend",
        subtitle: "ECW / TBW fluid balance",
        data: fluidRatioData,
        series: [
          {
            key: "value",
            label: "Fluid Ratio",
            formatter: (value: number | null | undefined) =>
              value == null || !Number.isFinite(value) ? "—" : value.toFixed(3),
            stroke: "var(--text)",
          },
        ] satisfies ChartSeriesConfig[],
        yDomainMode: "tight" as const,
        valueFormatter: (value: number | null | undefined) =>
          value == null || !Number.isFinite(value) ? "—" : value.toFixed(3),
        emptyMessage: "Add ICW and ECW entries to see fluid ratio.",
      },
      {
        title: "Confidence Trend",
        subtitle: "Body composition data completeness and coherence",
        data: confidenceData,
        series: [
          {
            key: "value",
            label: "Confidence",
            formatter: (value: number | null | undefined) =>
              value == null || !Number.isFinite(value) ? "—" : `${value.toFixed(0)}/8`,
            stroke: "var(--accent)",
          },
        ] satisfies ChartSeriesConfig[],
        yDomainMode: "tight" as const,
        valueFormatter: (value: number | null | undefined) =>
          value == null || !Number.isFinite(value) ? "—" : `${value.toFixed(0)}/8`,
        emptyMessage: "Add body composition entries to see confidence trend.",
      },
    ];
  }, [chartRows]);

  /* ==========================================================================
     Breadcrumb 4 — Render
     ========================================================================== */

  return (
    <Page title="Body Composition">
      {/* =====================================================================
          Breadcrumb 4A — Big page title
         ================================================================== */}
      <Section>
        <h1 style={{ margin: 0 }}>Body Composition</h1>
      </Section>

      {/* =====================================================================
          Breadcrumb 4B — Compact page nav card
         ================================================================== */}
      <Section>
        <div className="card" style={{ marginBottom: 12, padding: 14 }}>
          <div
            className="row"
            style={{
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div style={{ fontWeight: 900, fontSize: 18, lineHeight: 1.2 }}>
              Body Composition
            </div>

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
        </div>
      </Section>

      {/* =====================================================================
          Breadcrumb 4C — Detail header card
         ================================================================== */}
      <Section>
        <div className="card" style={{ marginBottom: 12, padding: 14 }}>
          <div
            className="card"
            style={{
              padding: 14,
            }}
          >
            <div
              className="muted"
              style={{
                fontSize: 12,
                fontWeight: 700,
                marginBottom: 8,
              }}
            >
              Progress / Body Composition
            </div>

            <div className="muted" style={{ lineHeight: 1.45 }}>
              Weight, waist, and body-composition trends across cut, maintain, and bulk phases.
            </div>

            <div
              className="muted"
              style={{
                marginTop: 10,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
              onClick={() => navigate("/body")}
            >
              Open Body Metrics →
            </div>
          </div>
        </div>
      </Section>

      {/* =====================================================================
          Breadcrumb 4D — Phase toggle
         ================================================================== */}
      <Section>
        <div className="card" style={{ padding: 12, marginBottom: 12 }}>
          <div
            style={{
              fontWeight: 900,
              fontSize: 18,
              marginBottom: 10,
            }}
          >
            Phase
          </div>

          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <button
              className={`btn small ${mode === "cut" ? "primary" : ""}`}
              onClick={() => setMode("cut")}
            >
              Cut
            </button>
            <button
              className={`btn small ${mode === "maintain" ? "primary" : ""}`}
              onClick={() => setMode("maintain")}
            >
              Maintain
            </button>
            <button
              className={`btn small ${mode === "bulk" ? "primary" : ""}`}
              onClick={() => setMode("bulk")}
            >
              Bulk
            </button>
          </div>
        </div>
      </Section>

      {/* =====================================================================
          Breadcrumb 4E — Goal targets
         ================================================================== */}
      <Section>
        <div className="card" style={{ padding: 12, marginBottom: 12 }}>
          <div className="muted" style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
            GOAL TARGETS
          </div>

          <div className="card" style={{ padding: "0 14px" }}>
            <TargetRow
              label="Target Weight"
              value={formatLbs(latestSnapshot.targetWeightLb)}
              remainingText={formatRemaining(latestSnapshot.remainingWeightLb, "lb")}
            />

            <TargetRow
              label="Target BF %"
              value={formatBodyFatPct(latestSnapshot.targetBodyFatPct)}
              remainingText={formatRemaining(latestSnapshot.remainingCorrectedBfPct, "%")}
              showDivider={false}
            />
          </div>
        </div>
      </Section>

      {/* =====================================================================
          Breadcrumb 4F — Latest snapshot
         ================================================================== */}
      <Section>
        <div className="card" style={{ padding: 12, marginBottom: 12 }}>
          <div className="muted" style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
            LATEST SNAPSHOT
          </div>

          <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
            Most recent available body-composition metrics • {latestSnapshot.date}
          </div>

          <div className="card" style={{ padding: "0 14px" }}>
            <SnapshotRow
              label="Weight"
              value={formatLbs(latestSnapshot.weight)}
              changeText={formatChange(latestSnapshot.weightChange)}
              changeColor={getChangeColor(latestSnapshot.weightChange, "lower-is-better")}
            />

            <SnapshotRow
              label="Waist"
              value={formatInches(latestSnapshot.waist)}
              changeText={formatChange(latestSnapshot.waistChange)}
              changeColor={getChangeColor(latestSnapshot.waistChange, "lower-is-better")}
            />

            <SnapshotRow
              label="Corrected BF %"
              value={formatBodyFatPct(latestSnapshot.correctedBodyFatPct)}
              changeText={formatChange(latestSnapshot.correctedBfChange)}
              changeColor={getChangeColor(latestSnapshot.correctedBfChange, "lower-is-better")}
            />

            <SnapshotRow
              label="Corrected Lean"
              value={formatLbs(latestSnapshot.correctedLeanMass)}
              changeText={formatChange(latestSnapshot.correctedLeanChange)}
              changeColor={getChangeColor(latestSnapshot.correctedLeanChange, "higher-is-better")}
              showDivider={false}
            />
          </div>
        </div>
      </Section>

      {/* =====================================================================
          Breadcrumb 4G — Coaching signals
         ================================================================== */}
      <Section>
        <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 6 }}>Coaching Signals</div>
        <div className="muted" style={{ marginBottom: 12 }}>
          Interpret the current phase before reading the deeper trend charts.
        </div>

        <div className="grid two" style={{ marginBottom: 12 }}>
          <div className="card">
            <div className="muted" style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
              PRIMARY
            </div>
            <div style={{ fontWeight: 900, fontSize: 18 }}>{summary.primary}</div>
          </div>

          <div className="card">
            <div className="muted" style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
              COACHING NOTE
            </div>
            <div className="muted" style={{ lineHeight: 1.4 }}>{summary.secondary}</div>
          </div>

          <div className="card">
            <div className="muted" style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
              CONFIDENCE
            </div>
            <div style={{ fontWeight: 900, fontSize: 18 }}>
              {latestSnapshot.confidenceLabel}
            </div>
            <div className="muted" style={{ lineHeight: 1.4, marginTop: 6 }}>
              Score {latestSnapshot.confidenceScore}/8 • {summary.confidence}
            </div>
          </div>

          <div className="card">
            <div className="muted" style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
              FLUID BALANCE
            </div>
            <div style={{ fontWeight: 900, fontSize: 18 }}>
              {latestSnapshot.fluidNote.includes("stable")
                ? "Stable"
                : latestSnapshot.fluidNote.includes("slightly elevated")
                  ? "Watch"
                  : latestSnapshot.fluidNote.includes("Higher ECW")
                    ? "Elevated"
                    : "Low data"}
            </div>
            <div className="muted" style={{ lineHeight: 1.4, marginTop: 6 }}>
              {latestSnapshot.fluidNote}
            </div>
          </div>

          <div className="card">
            <div className="muted" style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
              {phaseSignal.label.toUpperCase()}
            </div>
            <div style={{ fontWeight: 900, fontSize: 18 }}>{phaseSignal.status}</div>
            <div className="muted" style={{ lineHeight: 1.4, marginTop: 6 }}>
              {phaseSignal.note}
            </div>
          </div>
        </div>
      </Section>

      {/* =====================================================================
          Breadcrumb 4H — Phase Quality
         ================================================================== */}
      <Section>
        <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 6 }}>
          Phase Quality
        </div>
        <div className="muted" style={{ marginBottom: 6 }}>
          Direction + composition + strength combined into a single quality signal.
        </div>

        {phaseQualityInputs.strengthLabel ? (
          <div className="muted" style={{ marginBottom: 12, fontSize: 12 }}>
            Strength: {phaseQualityInputs.strengthLabel}
          </div>
        ) : null}

        <PhaseQualityCard
          mode={mode}
          weightDelta={phaseQualityInputs.weightDelta}
          waistDelta={phaseQualityInputs.waistDelta}
          correctedLeanDelta={phaseQualityInputs.correctedLeanDelta}
          correctedBodyFatDelta={phaseQualityInputs.correctedBodyFatDelta}
          strengthDelta={phaseQualityInputs.strengthDelta}
          sampleCount={phaseQualityInputs.sampleCount}
        />
      </Section>

      {/* =====================================================================
          Breadcrumb 4I — Trend charts
         ================================================================== */}
      <Section>
        <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 6 }}>Trend Snapshots</div>
        <div className="muted" style={{ marginBottom: 12 }}>
          Start with the highest-value body metrics: scale weight, waist, body fat %, fat mass,
          and lean mass.
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          {chartConfigs.map((chart) => (
            <TrendChartCard
              key={chart.title}
              title={chart.title}
              subtitle={chart.subtitle}
              data={chart.data}
              series={chart.series}
              yDomainMode={chart.yDomainMode}
              valueFormatter={chart.valueFormatter}
              tooltipLabelFormatter={(label, datum) => {
                if (typeof datum?.date === "string" && datum.date.trim()) return datum.date;
                return label;
              }}
              emptyMessage={chart.emptyMessage}
            />
          ))}
        </div>
      </Section>
    </Page>
  );
}

/* ============================================================================
   End of file: src/pages/BodyCompositionPage.tsx
   ============================================================================ */