// src/pages/BodyCompositionPage.tsx
/* ============================================================================
   BodyCompositionPage.tsx
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-03-15-BODYCOMP-07
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
   ============================================================================ */

import React, { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate } from "react-router-dom";
import { db } from "../db";
import { Page, Section } from "../components/Page.tsx";
import TrendChartCard from "../components/charts/TrendChartCard";
import type { ChartDatum, ChartSeriesConfig } from "../components/charts/chartTypes";
import { formatInches, formatLbs } from "../components/charts/chartFormatters";

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
  leanMassLb?: number;
  skeletalMuscleMassLb?: number;
  visceralFatIndex?: number;
  bodyWaterPct?: number;
};

const MODE_KEY = "workout_pwa_bodycomp_mode_v1";

/* ============================================================================
   Breadcrumb 1 — Helpers
   ============================================================================ */

function pickTime(r: BodyMetricRow): number {
  const t = Number(r?.measuredAt ?? r?.takenAt ?? r?.date ?? r?.createdAt);
  return Number.isFinite(t) ? t : 0;
}

function pickWeightLb(r: BodyMetricRow): number | undefined {
  const bw = (r as any)?.weightLb ?? (r as any)?.weight;
  return typeof bw === "number" && Number.isFinite(bw) && bw > 0 ? bw : undefined;
}

function pickWaistIn(r: BodyMetricRow): number | undefined {
  const w = (r as any)?.waistIn ?? (r as any)?.waist;
  return typeof w === "number" && Number.isFinite(w) && w > 0 ? w : undefined;
}

function pickBodyFatPct(r: BodyMetricRow): number | undefined {
  const bf = (r as any)?.bodyFatPct;
  return typeof bf === "number" && Number.isFinite(bf) && bf >= 0 ? bf : undefined;
}

function computeFatMassLb(r: BodyMetricRow): number | undefined {
  const weight = pickWeightLb(r);
  const bf = pickBodyFatPct(r);
  if (weight == null || bf == null) return undefined;
  return weight * (bf / 100);
}

function computeLeanMassLb(r: BodyMetricRow): number | undefined {
  const weight = pickWeightLb(r);
  const fatMass = computeFatMassLb(r);
  if (weight == null || fatMass == null) return undefined;
  return weight - fatMass;
}

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

function average(nums: number[]): number | undefined {
  if (!nums.length) return undefined;
  return nums.reduce((sum, n) => sum + n, 0) / nums.length;
}

function averagePreviousValues<T>(
  rows: T[],
  getter: (row: T) => number | undefined,
  count = 3
): number | undefined {
  const priorValues = rows
    .slice(1)
    .map(getter)
    .filter((v): v is number => v != null && Number.isFinite(v))
    .slice(0, count);

  return average(priorValues);
}

function computeCutSignal(rows: BodyMetricRow[]) {
  const weight = rows.map(pickWeightLb).filter((v): v is number => v != null);
  const waist = rows.map(pickWaistIn).filter((v): v is number => v != null);

  if (weight.length < 3 || waist.length < 3) {
    return {
      status: "Not enough data",
      note: "Add more weight and waist entries.",
    };
  }

  const weightDelta = weight[weight.length - 1] - weight[0];
  const waistDelta = waist[waist.length - 1] - waist[0];

  if (weightDelta < 0 && waistDelta < 0) {
    return {
      status: "Strong fat-loss signal",
      note: "Weight and waist both trending down.",
    };
  }

  if (weightDelta < 0 && waistDelta >= 0) {
    return {
      status: "Possible water loss",
      note: "Weight dropping but waist stable.",
    };
  }

  if (weightDelta >= 0 && waistDelta < 0) {
    return {
      status: "Possible recomposition",
      note: "Waist decreasing while weight is stable or up.",
    };
  }

  return {
    status: "Fat gain risk",
    note: "Weight and waist both increasing.",
  };
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
   Breadcrumb 2 — Small reusable snapshot tile
   ============================================================================ */

function SnapshotTile({
  label,
  value,
  changeText,
  changeColor,
}: {
  label: string;
  value: string;
  changeText: string;
  changeColor: string;
}) {
  return (
    <div className="card">
      <div className="muted" style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
        {label}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontWeight: 900, fontSize: 18 }}>{value}</div>
        <div style={{ fontSize: 13, color: changeColor }}>{changeText}</div>
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

  const rows = useLiveQuery(async () => {
    try {
      const arr = ((await db.bodyMetrics.toArray()) ?? []) as BodyMetricRow[];
      return arr
        .slice()
        .sort((a, b) => pickTime(b) - pickTime(a))
        .slice(0, 60);
    } catch {
      return [] as BodyMetricRow[];
    }
  }, []);

  React.useEffect(() => {
    saveMode(mode);
  }, [mode]);

  /* ==========================================================================
     Breadcrumb 3A — Derived data
     ========================================================================== */

  const chartRows = useMemo(() => {
    return (rows ?? [])
      .slice()
      .reverse()
      .filter((r) => pickTime(r) > 0);
  }, [rows]);

  const latestSnapshot = useMemo(() => {
    const source = rows ?? [];
    const latest = source[0];

    const weight = latest ? pickWeightLb(latest) : undefined;
    const waist = latest ? pickWaistIn(latest) : undefined;
    const bodyFatPct = latest ? pickBodyFatPct(latest) : undefined;
    const leanMass = latest ? computeLeanMassLb(latest) : undefined;

    const prevWeightAvg = averagePreviousValues(source, pickWeightLb, 3);
    const prevWaistAvg = averagePreviousValues(source, pickWaistIn, 3);
    const prevBodyFatAvg = averagePreviousValues(source, pickBodyFatPct, 3);
    const prevLeanAvg = averagePreviousValues(source, computeLeanMassLb, 3);

    return {
      date: latest ? fmtSnapshotDate(pickTime(latest)) : "—",

      weight,
      weightChange: computePercentChange(weight, prevWeightAvg),

      waist,
      waistChange: computePercentChange(waist, prevWaistAvg),

      bodyFatPct,
      bfChange: computePercentChange(bodyFatPct, prevBodyFatAvg),

      leanMass,
      leanChange: computePercentChange(leanMass, prevLeanAvg),
    };
  }, [rows]);

  const summary = modeSummary(mode);
  const cutSignal = useMemo(() => computeCutSignal(chartRows.slice(-10)), [chartRows]);

  /* ==========================================================================
     Breadcrumb 3B — Chart config map
     --------------------------------------------------------------------------
     This bundles the chart definitions so we do not repeat the same
     TrendChartCard boilerplate five times.
     ========================================================================== */

  const chartConfigs = useMemo(() => {
    const weightData: ChartDatum[] = chartRows
      .filter((r) => pickWeightLb(r) != null)
      .map((r) => ({
        label: fmtShortDate(pickTime(r)),
        value: pickWeightLb(r) ?? null,
        date: fmtShortDate(pickTime(r)),
      }));

    const waistData: ChartDatum[] = chartRows
      .filter((r) => pickWaistIn(r) != null)
      .map((r) => ({
        label: fmtShortDate(pickTime(r)),
        value: pickWaistIn(r) ?? null,
        date: fmtShortDate(pickTime(r)),
      }));

    const bodyFatPctData: ChartDatum[] = chartRows
      .filter((r) => pickBodyFatPct(r) != null)
      .map((r) => ({
        label: fmtShortDate(pickTime(r)),
        value: pickBodyFatPct(r) ?? null,
        date: fmtShortDate(pickTime(r)),
      }));

    const fatMassData: ChartDatum[] = chartRows
      .filter((r) => computeFatMassLb(r) != null)
      .map((r) => ({
        label: fmtShortDate(pickTime(r)),
        value: computeFatMassLb(r) ?? null,
        date: fmtShortDate(pickTime(r)),
      }));

    const leanMassData: ChartDatum[] = chartRows
      .filter((r) => computeLeanMassLb(r) != null)
      .map((r) => ({
        label: fmtShortDate(pickTime(r)),
        value: computeLeanMassLb(r) ?? null,
        date: fmtShortDate(pickTime(r)),
      }));

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
    ];
  }, [chartRows]);

  /* ==========================================================================
     Breadcrumb 4 — Render
     ========================================================================== */

  return (
    <Page title="Body Composition">
      {/* =====================================================================
          Breadcrumb 4A — Compact top header
         ================================================================== */}
      <Section>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 6,
          }}
        >
          <h2 style={{ margin: 0 }}>Body Composition</h2>

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

      {/* =====================================================================
          Breadcrumb 4B — Breadcrumb header card
         ================================================================== */}
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
      </Section>

      {/* =====================================================================
          Breadcrumb 4C — Phase toggle
         ================================================================== */}
      <Section>
        <div className="card" style={{ padding: 12, marginBottom: 12 }}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Phase</div>

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
          Breadcrumb 4D — Latest snapshot strip
         ================================================================== */}
      <Section>
        <div className="card" style={{ padding: 12, marginBottom: 12 }}>
          <div className="muted" style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
            LATEST SNAPSHOT
          </div>

          <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
            Most recent available body-composition metrics • {latestSnapshot.date}
          </div>

          <div className="grid two">
            <SnapshotTile
              label="WEIGHT"
              value={formatLbs(latestSnapshot.weight)}
              changeText={formatChange(latestSnapshot.weightChange)}
              changeColor={getChangeColor(latestSnapshot.weightChange, "lower-is-better")}
            />

            <SnapshotTile
              label="WAIST"
              value={formatInches(latestSnapshot.waist)}
              changeText={formatChange(latestSnapshot.waistChange)}
              changeColor={getChangeColor(latestSnapshot.waistChange, "lower-is-better")}
            />

            <SnapshotTile
              label="BODY FAT %"
              value={formatBodyFatPct(latestSnapshot.bodyFatPct)}
              changeText={formatChange(latestSnapshot.bfChange)}
              changeColor={getChangeColor(latestSnapshot.bfChange, "lower-is-better")}
            />

            <SnapshotTile
              label="LEAN MASS"
              value={formatLbs(latestSnapshot.leanMass)}
              changeText={formatChange(latestSnapshot.leanChange)}
              changeColor={getChangeColor(latestSnapshot.leanChange, "higher-is-better")}
            />
          </div>
        </div>
      </Section>

      {/* =====================================================================
          Breadcrumb 4E — Coaching signals
         ================================================================== */}
      <Section>
        <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 6 }}>Coaching signals</div>
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
            <div className="muted" style={{ lineHeight: 1.4 }}>{summary.confidence}</div>
          </div>

          <div className="card">
            <div className="muted" style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
              CUT SIGNAL
            </div>
            <div style={{ fontWeight: 900, fontSize: 18 }}>{cutSignal.status}</div>
            <div className="muted" style={{ lineHeight: 1.4, marginTop: 6 }}>
              {cutSignal.note}
            </div>
          </div>
        </div>
      </Section>

      {/* =====================================================================
          Breadcrumb 4F — Trend charts
         ================================================================== */}
      <Section>
        <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 6 }}>Trend snapshots</div>
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
              showBrush={chart.data.length > 12}
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