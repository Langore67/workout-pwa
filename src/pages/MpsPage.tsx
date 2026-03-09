// src/pages/MpsPage.tsx
/* ============================================================================
   MpsPage.tsx — Muscle Preservation Signal
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-03-08-MPS-03
   FILE: src/pages/MpsPage.tsx

   Purpose
   - Evaluate whether fat loss is occurring while strength is being preserved
   - Use normalized strength as the primary performance signal
   - Use a dual-anchor model:
     * 14-day anchor for short-term coaching signal
     * 90-day best as reserve / backstop reference
   - Use weight + waist as the main confirmation layer
   - Use lean mass / body fat as supporting context
   - Detect "bad cuts" automatically
   - Surface coaching-style interpretation rather than raw metrics only

   Inputs
   - strength.ts normalizedIndex trend
   - Body metrics table (weight, waist, lean mass, body fat, etc.)
   - app_meta height profile metric

   States
   - Preserved
   - Monitor
   - At Risk
   - Partial Signal

   Safe
   - Read-only
   - No DB writes
   ============================================================================ */

import React, { useEffect, useMemo, useState } from "react";
import { db } from "../db";
import { computeStrengthTrend } from "../strength/strength";

/* ============================================================================
   Breadcrumb 1 — Types
   ============================================================================ */

type MpsState = "green" | "yellow" | "red" | "partial";

type BodySnapshot = {
  takenAt: number;
  weightLb?: number;
  waistIn?: number;
  leanMassLb?: number;
  bodyFatPct?: number;
  smmLb?: number;
  visceralFat?: number;
  bodyWaterPct?: number;
};

type MpsModel = {
  state: MpsState;
  title: string;
  note: string;
  badCut: boolean;
  badCutNote?: string;

  normalizedStrengthNow?: number;
  normalizedStrengthPrev14?: number;
  normalizedDelta14Pct?: number;

  normalizedBest90?: number;
  normalizedVsBest90Pct?: number;

  weightNow?: number;
  weightPrev14?: number;
  weightDelta14?: number;

  waistNow?: number;
  waistPrev14?: number;
  waistDelta14?: number;

  leanMassNow?: number;
  leanMassPrev14?: number;
  leanMassDelta14?: number;

  bodyFatNow?: number;
  bodyFatPrev14?: number;
  bodyFatDelta14?: number;

  heightIn?: number;
  waistToHeightRatio?: number;
};

/* ============================================================================
   Breadcrumb 2 — Constants / helpers
   ============================================================================ */

const HEIGHT_META_KEY = "profile.heightIn";

function fmtNum(n?: number, digits = 1) {
  if (!Number.isFinite(n)) return "—";
  return Number(n).toFixed(digits);
}

function fmtSigned(n?: number, digits = 1, suffix = "") {
  if (!Number.isFinite(n)) return "—";
  const v = Number(n);
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(digits)}${suffix}`;
}

function fmtPct(n?: number, digits = 1) {
  if (!Number.isFinite(n)) return "—";
  return `${Number(n).toFixed(digits)}%`;
}

function startOfDay(ms: number) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function daysAgo(ms: number, days: number) {
  return ms - days * 24 * 60 * 60 * 1000;
}

function readNum(v: any): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function readTimeMs(row: any): number | undefined {
  return readNum(row?.measuredAt ?? row?.takenAt ?? row?.date ?? row?.createdAt);
}

/* ============================================================================
   Breadcrumb 3 — Body metric table access
   ============================================================================ */

function pickBodyTable(): any | null {
  const anyDb: any = db as any;

  const preferred = anyDb.bodyMetrics;
  if (preferred && (typeof preferred.toArray === "function" || typeof preferred.orderBy === "function")) {
    return preferred;
  }

  const candidates = [anyDb.bodyLogs, anyDb.body, anyDb.bodyEntries, anyDb.bodyweights].filter(Boolean);
  for (const t of candidates) {
    if (t && (typeof t.toArray === "function" || typeof t.orderBy === "function")) return t;
  }

  return null;
}

function mapBodyRow(row: any): BodySnapshot | null {
  const takenAt = readTimeMs(row);
  if (!takenAt) return null;

  return {
    takenAt,
    weightLb: readNum(row?.weightLb ?? row?.weight),
    waistIn: readNum(row?.waistIn ?? row?.waist ?? row?.waist_inches),
    leanMassLb: readNum(row?.leanMassLb ?? row?.leanMass ?? row?.lean_mass_lb),
    bodyFatPct: readNum(row?.bodyFatPct ?? row?.bodyFat ?? row?.body_fat_pct),
    smmLb: readNum(row?.smmLb ?? row?.smm ?? row?.skeletalMuscleMass ?? row?.skeletal_muscle_mass_lb),
    visceralFat: readNum(row?.visceralFat ?? row?.visceralFatIndex ?? row?.visceral_fat),
    bodyWaterPct: readNum(row?.bodyWaterPct ?? row?.bodyWater ?? row?.body_water_pct),
  };
}

async function loadBodySnapshots(): Promise<BodySnapshot[]> {
  const table = pickBodyTable();
  if (!table) return [];

  try {
    const rows = await table.toArray();
    return (rows ?? [])
      .map(mapBodyRow)
      .filter(Boolean)
      .sort((a: any, b: any) => b.takenAt - a.takenAt);
  } catch {
    return [];
  }
}

function pickLatestAtOrBefore(rows: BodySnapshot[], endAtMs: number): BodySnapshot | undefined {
  return rows.find((r) => r.takenAt <= endAtMs);
}

async function loadHeightIn(): Promise<number | undefined> {
  try {
    const row: any = await db.app_meta.get(HEIGHT_META_KEY);
    const parsed = row?.valueJson ? JSON.parse(row.valueJson) : undefined;
    const h = Number(parsed?.heightIn);
    return Number.isFinite(h) && h > 0 ? h : undefined;
  } catch {
    return undefined;
  }
}

/* ============================================================================
   Breadcrumb 4 — Interpretation logic
   ============================================================================ */

function buildMpsModel(args: {
  normalizedStrengthNow?: number;
  normalizedStrengthPrev14?: number;
  normalizedBest90?: number;
  weightNow?: number;
  weightPrev14?: number;
  waistNow?: number;
  waistPrev14?: number;
  leanMassNow?: number;
  leanMassPrev14?: number;
  bodyFatNow?: number;
  bodyFatPrev14?: number;
  heightIn?: number;
}): MpsModel {
  const {
    normalizedStrengthNow,
    normalizedStrengthPrev14,
    normalizedBest90,
    weightNow,
    weightPrev14,
    waistNow,
    waistPrev14,
    leanMassNow,
    leanMassPrev14,
    bodyFatNow,
    bodyFatPrev14,
    heightIn,
  } = args;

  const normalizedDelta14Pct =
    Number.isFinite(normalizedStrengthNow) &&
    Number.isFinite(normalizedStrengthPrev14) &&
    normalizedStrengthPrev14! > 0
      ? ((normalizedStrengthNow! - normalizedStrengthPrev14!) / normalizedStrengthPrev14!) * 100
      : undefined;

  const normalizedVsBest90Pct =
    Number.isFinite(normalizedStrengthNow) &&
    Number.isFinite(normalizedBest90) &&
    normalizedBest90! > 0
      ? ((normalizedStrengthNow! - normalizedBest90!) / normalizedBest90!) * 100
      : undefined;

  const weightDelta14 =
    Number.isFinite(weightNow) && Number.isFinite(weightPrev14) ? weightNow! - weightPrev14! : undefined;

  const waistDelta14 =
    Number.isFinite(waistNow) && Number.isFinite(waistPrev14) ? waistNow! - waistPrev14! : undefined;

  const leanMassDelta14 =
    Number.isFinite(leanMassNow) && Number.isFinite(leanMassPrev14) ? leanMassNow! - leanMassPrev14! : undefined;

  const bodyFatDelta14 =
    Number.isFinite(bodyFatNow) && Number.isFinite(bodyFatPrev14) ? bodyFatNow! - bodyFatPrev14! : undefined;

  const waistToHeightRatio =
    Number.isFinite(waistNow) && Number.isFinite(heightIn) && heightIn! > 0 ? waistNow! / heightIn! : undefined;

  const hasStrength =
    Number.isFinite(normalizedStrengthNow) &&
    Number.isFinite(normalizedStrengthPrev14) &&
    Number.isFinite(normalizedBest90);

  const hasWeight = Number.isFinite(weightNow) && Number.isFinite(weightPrev14);
  const hasWaist = Number.isFinite(waistNow) && Number.isFinite(waistPrev14);

  if (!hasStrength || !hasWeight) {
    return {
      state: "partial",
      title: "Partial Signal",
      note: "Not enough strength or body-weight history yet to compute a reliable preservation signal.",
      badCut: false,
      normalizedStrengthNow,
      normalizedStrengthPrev14,
      normalizedDelta14Pct,
      normalizedBest90,
      normalizedVsBest90Pct,
      weightNow,
      weightPrev14,
      weightDelta14,
      waistNow,
      waistPrev14,
      waistDelta14,
      leanMassNow,
      leanMassPrev14,
      leanMassDelta14,
      bodyFatNow,
      bodyFatPrev14,
      bodyFatDelta14,
      heightIn,
      waistToHeightRatio,
    };
  }

  if (!hasWaist) {
    return {
      state: "partial",
      title: "Partial Signal",
      note: "Add waist measurements to improve confidence. Right now the preservation signal is incomplete.",
      badCut: false,
      normalizedStrengthNow,
      normalizedStrengthPrev14,
      normalizedDelta14Pct,
      normalizedBest90,
      normalizedVsBest90Pct,
      weightNow,
      weightPrev14,
      weightDelta14,
      waistNow,
      waistPrev14,
      waistDelta14,
      leanMassNow,
      leanMassPrev14,
      leanMassDelta14,
      bodyFatNow,
      bodyFatPrev14,
      bodyFatDelta14,
      heightIn,
      waistToHeightRatio,
    };
  }

  const strengthUpOrFlat = (normalizedDelta14Pct ?? -999) >= 0;
  const strengthSlightlyDown = (normalizedDelta14Pct ?? -999) > -1.5;
  const strengthClearlyDown = (normalizedDelta14Pct ?? -999) <= -1.5;
  const farBelowBest90 = (normalizedVsBest90Pct ?? -999) <= -5;

  const weightDown = (weightDelta14 ?? 999) < 0;
  const waistDown = (waistDelta14 ?? 999) < 0;
  const waistFlatOrDown = (waistDelta14 ?? 999) <= 0;
  const waistNotImproving = (waistDelta14 ?? -999) >= 0;

  const leanMassDown = (leanMassDelta14 ?? 999) < 0;

  const badCut =
    weightDown &&
    strengthClearlyDown &&
    waistNotImproving &&
    (leanMassDown || farBelowBest90);

  let badCutNote: string | undefined;
  if (badCut) {
    badCutNote =
      "Bad cut signal: body weight is dropping, but normalized strength is falling and waist is not improving. Lean tissue or recovery may be taking the hit.";
  }

  if (weightDown && waistDown && strengthUpOrFlat && !farBelowBest90) {
    return {
      state: "green",
      title: "Preserved",
      note: "Weight and waist are down while normalized strength is stable to rising. Muscle is likely being preserved.",
      badCut,
      badCutNote,
      normalizedStrengthNow,
      normalizedStrengthPrev14,
      normalizedDelta14Pct,
      normalizedBest90,
      normalizedVsBest90Pct,
      weightNow,
      weightPrev14,
      weightDelta14,
      waistNow,
      waistPrev14,
      waistDelta14,
      leanMassNow,
      leanMassPrev14,
      leanMassDelta14,
      bodyFatNow,
      bodyFatPrev14,
      bodyFatDelta14,
      heightIn,
      waistToHeightRatio,
    };
  }

  if (weightDown && waistFlatOrDown && strengthSlightlyDown && !badCut) {
    return {
      state: "yellow",
      title: "Monitor",
      note: "Weight is down and waist is not worsening, but normalized strength slipped slightly. Monitor recovery, protein, and training quality.",
      badCut,
      badCutNote,
      normalizedStrengthNow,
      normalizedStrengthPrev14,
      normalizedDelta14Pct,
      normalizedBest90,
      normalizedVsBest90Pct,
      weightNow,
      weightPrev14,
      weightDelta14,
      waistNow,
      waistPrev14,
      waistDelta14,
      leanMassNow,
      leanMassPrev14,
      leanMassDelta14,
      bodyFatNow,
      bodyFatPrev14,
      bodyFatDelta14,
      heightIn,
      waistToHeightRatio,
    };
  }

  return {
    state: "red",
    title: "At Risk",
    note: "Normalized strength is falling without a clear waist improvement signal. This cut may be risking lean tissue or recovery capacity.",
    badCut,
    badCutNote,
    normalizedStrengthNow,
    normalizedStrengthPrev14,
    normalizedDelta14Pct,
    normalizedBest90,
    normalizedVsBest90Pct,
    weightNow,
    weightPrev14,
    weightDelta14,
    waistNow,
    waistPrev14,
    waistDelta14,
    leanMassNow,
    leanMassPrev14,
    leanMassDelta14,
    bodyFatNow,
    bodyFatPrev14,
    bodyFatDelta14,
    heightIn,
    waistToHeightRatio,
  };
}

/* ============================================================================
   Breadcrumb 5 — UI helpers
   ============================================================================ */

function stateTheme(state: MpsState) {
  switch (state) {
    case "green":
      return {
        border: "1px solid rgba(16, 185, 129, 0.28)",
        background: "rgba(16, 185, 129, 0.08)",
        color: "#065f46",
      };
    case "yellow":
      return {
        border: "1px solid rgba(245, 158, 11, 0.28)",
        background: "rgba(245, 158, 11, 0.08)",
        color: "#92400e",
      };
    case "red":
      return {
        border: "1px solid rgba(239, 68, 68, 0.28)",
        background: "rgba(239, 68, 68, 0.08)",
        color: "#991b1b",
      };
    case "partial":
    default:
      return {
        border: "1px solid rgba(100, 116, 139, 0.28)",
        background: "rgba(100, 116, 139, 0.08)",
        color: "#334155",
      };
  }
}

function whtrHelper(ratio?: number) {
  if (!Number.isFinite(ratio)) return "Height or waist missing";
  if (ratio! < 0.5) return "Below 0.50";
  if (ratio! < 0.55) return "0.50–0.55";
  return "Above 0.55";
}

function MetricCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <div
      className="card"
      style={{
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--muted)",
        }}
      >
        {label}
      </div>

      <div style={{ fontWeight: 900, fontSize: 22, lineHeight: 1.1 }}>{value}</div>

      {helper ? (
        <div className="muted" style={{ fontSize: 13 }}>
          {helper}
        </div>
      ) : null}
    </div>
  );
}

/* ============================================================================
   Breadcrumb 6 — Page
   ============================================================================ */

export default function MpsPage() {
  const [loading, setLoading] = useState(true);
  const [model, setModel] = useState<MpsModel | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);

      try {
        const [trend, bodyRows, heightIn] = await Promise.all([
          computeStrengthTrend(14, 28),
          loadBodySnapshots(),
          loadHeightIn(),
        ]);

        const now = startOfDay(Date.now()) + 23 * 60 * 60 * 1000 + 59 * 60 * 1000 + 59 * 1000;
        const prev14 = daysAgo(now, 14);
        const prev90 = daysAgo(now, 90);

        const currentStrength = trend[0];
        const prevStrength14 =
          trend.find((r) => r.weekEndMs <= prev14) ?? trend[trend.length - 1];

        const best90Candidates = trend.filter((r) => r.weekEndMs >= prev90 && Number.isFinite(r.normalizedIndex));
        const best90Strength =
          best90Candidates.sort((a, b) => (b.normalizedIndex ?? 0) - (a.normalizedIndex ?? 0))[0] ??
          currentStrength;

        const currentBody = pickLatestAtOrBefore(bodyRows, now);
        const prevBody14 = pickLatestAtOrBefore(bodyRows, prev14);

        const nextModel = buildMpsModel({
          normalizedStrengthNow: currentStrength?.normalizedIndex,
          normalizedStrengthPrev14: prevStrength14?.normalizedIndex,
          normalizedBest90: best90Strength?.normalizedIndex,
          weightNow: currentBody?.weightLb,
          weightPrev14: prevBody14?.weightLb,
          waistNow: currentBody?.waistIn,
          waistPrev14: prevBody14?.waistIn,
          leanMassNow: currentBody?.leanMassLb,
          leanMassPrev14: prevBody14?.leanMassLb,
          bodyFatNow: currentBody?.bodyFatPct,
          bodyFatPrev14: prevBody14?.bodyFatPct,
          heightIn,
        });

        if (!cancelled) setModel(nextModel);
      } catch {
        if (!cancelled) {
          setModel({
            state: "partial",
            title: "Partial Signal",
            note: "Unable to compute Muscle Preservation right now. Check strength and body data availability.",
            badCut: false,
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, []);

  const theme = useMemo(() => stateTheme(model?.state ?? "partial"), [model?.state]);

  return (
    <div className="container">
      {/* ======================================================================
          Breadcrumb 6A — Header
         ==================================================================== */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--muted)",
            marginBottom: 6,
          }}
        >
          Cut Quality Signal
        </div>

        <h2 style={{ marginTop: 0, marginBottom: 8 }}>Muscle Preservation</h2>

        <div className="muted" style={{ lineHeight: 1.45 }}>
          Evaluates whether body weight is dropping while normalized strength is being preserved.
        </div>
      </div>

      {/* ======================================================================
          Breadcrumb 6B — Status card
         ==================================================================== */}
      <div
        className="card"
        style={{
          marginBottom: 16,
          ...theme,
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            marginBottom: 8,
          }}
        >
          Current Status
        </div>

        <div style={{ fontSize: 28, fontWeight: 900, lineHeight: 1.05 }}>
          {loading ? "Loading…" : model?.title ?? "Partial Signal"}
        </div>

        <div style={{ marginTop: 10, lineHeight: 1.45 }}>
          {loading
            ? "Computing normalized strength, body-weight trend, waist trend, and reserve check."
            : model?.note}
        </div>
      </div>

      {/* ======================================================================
          Breadcrumb 6C — Bad cut detection
         ==================================================================== */}
      {model?.badCut ? (
        <div
          className="card"
          style={{
            marginBottom: 16,
            border: "1px solid rgba(239, 68, 68, 0.28)",
            background: "rgba(239, 68, 68, 0.08)",
            color: "#991b1b",
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            Bad Cut Detection
          </div>

          <div style={{ fontWeight: 900, fontSize: 22, lineHeight: 1.1 }}>
            Warning
          </div>

          <div style={{ marginTop: 8, lineHeight: 1.45 }}>
            {model.badCutNote}
          </div>
        </div>
      ) : null}

      {/* ======================================================================
          Breadcrumb 6D — Core metrics
         ==================================================================== */}
      <div style={{ marginBottom: 10, fontWeight: 800, fontSize: 14 }}>
        Core Signal
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))",
          gap: 14,
          marginBottom: 18,
        }}
      >
        <MetricCard
          label="Normalized Strength"
          value={fmtNum(model?.normalizedStrengthNow, 3)}
          helper={`14d ${fmtSigned(model?.normalizedDelta14Pct, 1, "%")}`}
        />

        <MetricCard
          label="Vs 90d Best"
          value={fmtSigned(model?.normalizedVsBest90Pct, 1, "%")}
          helper={model?.normalizedBest90 != null ? `best ${fmtNum(model.normalizedBest90, 3)}` : "—"}
        />

        <MetricCard
          label="Body Weight"
          value={`${fmtNum(model?.weightNow, 1)} lb`}
          helper={`14d ${fmtSigned(model?.weightDelta14, 1, " lb")}`}
        />

        <MetricCard
          label="Waist"
          value={model?.waistNow != null ? `${fmtNum(model?.waistNow, 1)} in` : "—"}
          helper={`14d ${fmtSigned(model?.waistDelta14, 1, " in")}`}
        />
      </div>

      {/* ======================================================================
          Breadcrumb 6E — Supporting body composition
         ==================================================================== */}
      <div style={{ marginBottom: 10, fontWeight: 800, fontSize: 14 }}>
        Supporting Context
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))",
          gap: 14,
          marginBottom: 18,
        }}
      >
        <MetricCard
          label="Lean Mass"
          value={model?.leanMassNow != null ? `${fmtNum(model?.leanMassNow, 1)} lb` : "—"}
          helper={`14d ${fmtSigned(model?.leanMassDelta14, 1, " lb")}`}
        />

        <MetricCard
          label="Body Fat"
          value={fmtPct(model?.bodyFatNow, 1)}
          helper={`14d ${fmtSigned(model?.bodyFatDelta14, 1, "%")}`}
        />

        <MetricCard
          label="Waist / Height"
          value={fmtNum(model?.waistToHeightRatio, 3)}
          helper={whtrHelper(model?.waistToHeightRatio)}
        />
      </div>

      {/* ======================================================================
          Breadcrumb 6F — Interpretation
         ==================================================================== */}
      <div className="card">
        <div
          style={{
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--muted)",
            marginBottom: 8,
          }}
        >
          Interpretation
        </div>

        <div className="muted" style={{ lineHeight: 1.55 }}>
          This signal uses a dual-anchor model. The 14-day comparison acts as the short-term coaching signal,
          while the 90-day best normalized strength acts as a reserve check. Waist is the main short-term body
          confirmation signal. Lean mass and body-fat trends provide supporting context, and waist-to-height
          ratio serves as a slower structural indicator.
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   End of file: src/pages/MpsPage.tsx
   ============================================================================ */