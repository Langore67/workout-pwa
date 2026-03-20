// src/pages/BodyPage.tsx
/* ============================================================================
   BodyPage.tsx
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-03-15-BODY-08
   FILE: src/pages/BodyPage.tsx

   Purpose
   - Provide fast entry for body metrics and profile metrics
   - Preserve compatibility with older body-metric rows
   - Add simple trend visualization for weight and waist
   - Keep recent-entry history manageable as the dataset grows

   Goals
   - Fast entry: all body fields optional
   - Keep height separate from body snapshots
   - Add waist as a high-value body snapshot field
   - No bottlenecks: missing metrics allowed
   - Simple list + delete
   - Future-proof old rows: tolerate takenAt/date/createdAt, backfill
     measuredAt, and keep new writes dual-written
   - Add lightweight analytics without turning this page into a heavy archive

   Changes (BODY-08)
   ✅ Keep compact app-style top header with Progress back link
   ✅ Add Trend snapshots section using shared chart framework
   ✅ Add Weight Trend chart
   ✅ Add Waist Trend chart
   ✅ Add Show more / Show fewer for Recent entries
   ✅ Keep existing profile metrics + add entry + delete flow intact

   Revision history
   - 2026-02-24  BODY-01  Initial: add + list + delete (sparse-safe)
   - 2026-03-01  BODY-02  Prefer measuredAt index; tolerate old rows
   - 2026-03-05  BODY-03  Harden mixed-row reads; write both timestamps
   - 2026-03-08  BODY-04  Reorder fields + add Lean Mass
   - 2026-03-08  BODY-05  Add Height profile metric via app_meta
   - 2026-03-08  BODY-06  Add Waist to body snapshots
   - 2026-03-14  BODY-07  Add Progress / Body header block
   - 2026-03-15  BODY-08  Add trend charts + recent-entry collapse
   ============================================================================ */

import React, { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate } from "react-router-dom";
import { db } from "../db";
import { uuid } from "../utils";
import { Page, Section } from "../components/Page.tsx";
import TrendChartCard from "../components/charts/TrendChartCard";
import type { ChartDatum, ChartSeriesConfig } from "../components/charts/chartTypes";
import { formatInches, formatLbs } from "../components/charts/chartFormatters";
import {
  getFatMassLb,
  getLeanMassLb,
  getTBW,
  getFluidRatio,
} from "../body/bodyCalculations";

type BodyMetricRow = {
  id: string;

  // compatibility + canonical
  takenAt?: number;
  measuredAt?: number;

  // extra legacy tolerance
  date?: number;

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

  createdAt?: number;
};

const HEIGHT_META_KEY = "profile.heightIn";
const RECENT_ROWS_DEFAULT = 8;

/* ----------------------------------------------------------------------------
   Breadcrumb 1 — Helpers
   ----------------------------------------------------------------------------
   What this section does
   - Normalizes legacy/body rows into consistent values for display and sorting
   - Provides small formatting helpers used throughout the page

   Why this matters
   - Body rows can come from mixed historical shapes
   - The UI should not care whether a row used measuredAt, takenAt, or date
   ---------------------------------------------------------------------------- */

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

function fmtDate(ms: number) {
  const d = new Date(ms);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtShortDate(ms: number) {
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function toNumOrUndef(s: string): number | undefined {
  const t = (s ?? "").trim();
  if (!t) return undefined;
  const n = Number(t);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

function show(v: number | undefined, digits = 1) {
  if (v == null || !Number.isFinite(v)) return "—";
  const f = digits === 0 ? Math.round(v).toString() : v.toFixed(digits);
  if (digits > 0 && f.endsWith(".0")) return String(Math.round(v));
  return f;
}

/* ----------------------------------------------------------------------------
   Breadcrumb 2 — Page
   ----------------------------------------------------------------------------
   What this section does
   - Owns page state, persistence actions, recent-row reading, and chart prep

   Why this matters
   - Keeps body entry, recent history, and lightweight analytics together in one
     page without duplicating logic elsewhere
   ---------------------------------------------------------------------------- */

export default function BodyPage() {
  const navigate = useNavigate();
  const table = db.bodyMetrics;

  /* ------------------------------------------------------------------------
     Breadcrumb 2A — Profile state
     ------------------------------------------------------------------------
     What this section does
     - Manages the saved profile metric for height

     Why this matters
     - Height is not a daily snapshot metric
     - It is a persistent profile metric used later for derived analysis
     ------------------------------------------------------------------------ */
  const [heightIn, setHeightIn] = useState("");
  const [heightLoaded, setHeightLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadHeight() {
      try {
        const row: any = await db.app_meta.get(HEIGHT_META_KEY);
        const parsed = row?.valueJson ? JSON.parse(row.valueJson) : undefined;
        const value = Number(parsed?.heightIn);
        if (!cancelled && Number.isFinite(value) && value > 0) {
          setHeightIn(String(value));
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setHeightLoaded(true);
      }
    }

    loadHeight();

    return () => {
      cancelled = true;
    };
  }, []);

  /* ------------------------------------------------------------------------
     Breadcrumb 2B — Body form state
     ------------------------------------------------------------------------
     What this section does
     - Tracks the quick-entry fields for daily/snapshot body metrics

     Why this matters
     - Fast sparse entry is the whole point of this page
     - Users should be able to log any subset of metrics quickly
     ------------------------------------------------------------------------ */
  const [weightLb, setWeightLb] = useState("");
  const [waistIn, setWaistIn] = useState("");
  const [bodyFatPct, setBodyFatPct] = useState("");
  const [bodyFatMassLb, setBodyFatMassLb] = useState("");
  const [leanMassLb, setLeanMassLb] = useState("");
  const [visceralFatIndex, setVisceralFatIndex] = useState("");
  const [skeletalMuscleMassLb, setSkeletalMuscleMassLb] = useState("");
  const [bodyWaterPct, setBodyWaterPct] = useState("");
  const [icwLb, setIcwLb] = useState("");
  const [ecwLb, setEcwLb] = useState("");
  const [mineralMassLb, setMineralMassLb] = useState("");

  const hasAnyInput = useMemo(() => {
    return (
      !!weightLb.trim() ||
      !!waistIn.trim() ||
      !!bodyFatPct.trim() ||
      !!bodyFatMassLb.trim() ||
      !!leanMassLb.trim() ||
      !!visceralFatIndex.trim() ||
      !!skeletalMuscleMassLb.trim() ||
      !!bodyWaterPct.trim() ||
      !!icwLb.trim() ||
      !!ecwLb.trim() ||
      !!mineralMassLb.trim()
    );
  }, [
    weightLb,
    waistIn,
    bodyFatPct,
    bodyFatMassLb,
    leanMassLb,
    visceralFatIndex,
    skeletalMuscleMassLb,
    bodyWaterPct,
    icwLb,
    ecwLb,
    mineralMassLb,
  ]);

  const hasHeightInput = !!heightIn.trim();

  /* ------------------------------------------------------------------------
     Breadcrumb 2C — History display state
     ------------------------------------------------------------------------
     What this section does
     - Controls how many recent entries are shown by default
     - Prevents the page from becoming an endlessly long archive

     Why this matters
     - This page is primarily for entry + quick review
     - Charts should carry more of the trend-reading burden over time
     ------------------------------------------------------------------------ */
  const [showAllRows, setShowAllRows] = useState(false);

  /* ------------------------------------------------------------------------
     Breadcrumb 2D — Read recent body rows
     ------------------------------------------------------------------------
     What this section does
     - Reads recent rows
     - Repairs legacy timestamps when possible
     - Sorts rows newest-first
     - Keeps a bounded recent dataset for UI and charts

     Why this matters
     - We need clean recent data for both the list and the new trend charts
     ------------------------------------------------------------------------ */
  const rows = useLiveQuery(async () => {
    try {
      try {
        const indexed = ((await table.orderBy("measuredAt").reverse().limit(60).toArray()) ??
          []) as BodyMetricRow[];

        const indexedLooksClean =
          indexed.length > 0 &&
          indexed.every((r) => typeof r.measuredAt === "number" && Number.isFinite(r.measuredAt));

        if (indexedLooksClean) return indexed;
      } catch {
        // ignore and fall through
      }

      const arr = ((await table.toArray()) ?? []) as BodyMetricRow[];

      const patch: BodyMetricRow[] = [];
      for (const r of arr) {
        const legacyTime = Number(
          (r as any)?.takenAt ?? (r as any)?.date ?? (r as any)?.createdAt,
        );

        if ((r as any)?.measuredAt == null && Number.isFinite(legacyTime) && legacyTime > 0) {
          (r as any).measuredAt = legacyTime;
          patch.push(r);
        }

        if ((r as any)?.takenAt == null) {
          const measured = Number((r as any)?.measuredAt);
          if (Number.isFinite(measured) && measured > 0) {
            (r as any).takenAt = measured;
            if (!patch.includes(r)) patch.push(r);
          }
        }
      }

      if (patch.length) {
        try {
          await table.bulkPut(patch as any[]);
        } catch {
          // ignore persistence errors
        }
      }

      return arr
        .slice()
        .sort((a, b) => pickTime(b) - pickTime(a))
        .slice(0, 60);
    } catch {
      return [] as BodyMetricRow[];
    }
  }, []);

  /* ------------------------------------------------------------------------
     Breadcrumb 2E — Chart data preparation
     ------------------------------------------------------------------------
     What this section does
     - Derives chart-ready data from the recent body rows
     - Uses oldest → newest ordering for trend readability
     - Separates weight and waist because they use very different units/ranges

     Why this matters
     - A single Y-axis chart for weight and waist would be misleading
     - Separate charts keep the trend honest and readable
     ------------------------------------------------------------------------ */
  const chartRows = useMemo(() => {
    return (rows ?? [])
      .slice()
      .reverse()
      .filter((r) => pickTime(r) > 0);
  }, [rows]);

  const weightChartData: ChartDatum[] = useMemo(
    () =>
      chartRows
        .filter((r) => pickWeightLb(r) != null)
        .map((r) => ({
          label: fmtShortDate(pickTime(r)),
          value: pickWeightLb(r) ?? null,
          date: fmtShortDate(pickTime(r)),
        })),
    [chartRows],
  );

  const waistChartData: ChartDatum[] = useMemo(
    () =>
      chartRows
        .filter((r) => pickWaistIn(r) != null)
        .map((r) => ({
          label: fmtShortDate(pickTime(r)),
          value: pickWaistIn(r) ?? null,
          date: fmtShortDate(pickTime(r)),
        })),
    [chartRows],
  );

  const weightSeries: ChartSeriesConfig[] = useMemo(
    () => [
      {
        key: "value",
        label: "Weight",
        formatter: formatLbs,
        stroke: "var(--accent)",
      },
    ],
    [],
  );

  const waistSeries: ChartSeriesConfig[] = useMemo(
    () => [
      {
        key: "value",
        label: "Waist",
        formatter: formatInches,
        stroke: "var(--text)",
      },
    ],
    [],
  );

  /* ------------------------------------------------------------------------
     Breadcrumb 2F — Visible recent entries
     ------------------------------------------------------------------------
     What this section does
     - Applies the Show more / Show fewer behavior to the recent-entry list

     Why this matters
     - Keeps the page compact by default
     - Still allows deeper recent review on demand
     ------------------------------------------------------------------------ */
  const visibleRows = useMemo(() => {
    const source = rows ?? [];
    return showAllRows ? source : source.slice(0, RECENT_ROWS_DEFAULT);
  }, [rows, showAllRows]);

  /* ------------------------------------------------------------------------
     Breadcrumb 3 — Actions
     ------------------------------------------------------------------------ */

  async function saveHeight() {
    const h = toNumOrUndef(heightIn);

    if (heightIn.trim() && h == null) {
      window.alert("Height must be a valid number.");
      return;
    }

    if (h == null || h <= 0) return;

    await db.app_meta.put({
      key: HEIGHT_META_KEY,
      valueJson: JSON.stringify({ heightIn: h }),
      updatedAt: Date.now(),
    } as any);
  }

  async function clearHeight() {
    const ok = window.confirm("Clear saved height?");
    if (!ok) return;
    await db.app_meta.delete(HEIGHT_META_KEY);
    setHeightIn("");
  }

    async function addEntry() {
      const w = toNumOrUndef(weightLb);
      const waist = toNumOrUndef(waistIn);
      const bf = toNumOrUndef(bodyFatPct);
      const fatMass = toNumOrUndef(bodyFatMassLb);
      const lm = toNumOrUndef(leanMassLb);
      const vfi = toNumOrUndef(visceralFatIndex);
      const smm = toNumOrUndef(skeletalMuscleMassLb);
      const water = toNumOrUndef(bodyWaterPct);
      const icw = toNumOrUndef(icwLb);
      const ecw = toNumOrUndef(ecwLb);
      const mineral = toNumOrUndef(mineralMassLb);
  
      const typedButInvalid =
        (weightLb.trim() && w == null) ||
        (waistIn.trim() && waist == null) ||
        (bodyFatPct.trim() && bf == null) ||
        (bodyFatMassLb.trim() && fatMass == null) ||
        (leanMassLb.trim() && lm == null) ||
        (visceralFatIndex.trim() && vfi == null) ||
        (skeletalMuscleMassLb.trim() && smm == null) ||
        (bodyWaterPct.trim() && water == null) ||
        (icwLb.trim() && icw == null) ||
        (ecwLb.trim() && ecw == null) ||
        (mineralMassLb.trim() && mineral == null);
  
      if (typedButInvalid) {
        window.alert("One or more fields are not valid numbers. Please correct and try again.");
        return;
      }
  
      const hasAnyValid =
        w != null ||
        waist != null ||
        bf != null ||
        fatMass != null ||
        lm != null ||
        vfi != null ||
        smm != null ||
        water != null ||
        icw != null ||
        ecw != null ||
        mineral != null;
  
      if (!hasAnyValid) return;
  
      const now = Date.now();
  
      const row: BodyMetricRow = {
        id: uuid(),
        measuredAt: now,
        takenAt: now,
        createdAt: now,
        weightLb: w,
        waistIn: waist,
        bodyFatPct: bf,
        bodyFatMassLb: fatMass,
        leanMassLb: lm,
        visceralFatIndex: vfi,
        skeletalMuscleMassLb: smm,
        bodyWaterPct: water,
        icwLb: icw,
        ecwLb: ecw,
        mineralMassLb: mineral,
      };
  
      await table.add(row as any);
  
      setWeightLb("");
      setWaistIn("");
      setBodyFatPct("");
      setBodyFatMassLb("");
      setLeanMassLb("");
      setVisceralFatIndex("");
      setSkeletalMuscleMassLb("");
      setBodyWaterPct("");
      setIcwLb("");
      setEcwLb("");
      setMineralMassLb("");
  }

  async function deleteEntry(id: string) {
    const ok = window.confirm("Delete this entry?");
    if (!ok) return;
    await table.delete(id);
  }

  /* ------------------------------------------------------------------------
     Breadcrumb 4 — Render
     ------------------------------------------------------------------------ */
  return (
    <Page title="Body">
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
          <h2 style={{ margin: 0 }}>Body</h2>

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
          Breadcrumb 4B — Progress-system page header
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
            Progress / Body
          </div>

          <div className="muted" style={{ lineHeight: 1.45 }}>
            Weight, body fat, lean mass, and body-composition trends.
          </div>
        </div>
      </Section>

      {/* =====================================================================
          Breadcrumb 4C — Body metrics content
         ================================================================== */}
      <Section>
        <div style={{ fontWeight: 900, fontSize: 18 }}>Body metrics</div>
        <div className="muted" style={{ marginTop: 6 }}>
          Quick entry. All fields optional. Hume handles detailed trends — we store snapshots for
          coaching context.
        </div>

        {/* ------------------------------------------------------------------
            Breadcrumb 4C.1 — Profile metrics card
           ------------------------------------------------------------------ */}
        <div className="card" style={{ padding: 12, marginTop: 12 }}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Profile metrics</div>

          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <div style={{ minWidth: 160, flex: 1 }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                Height (in)
              </div>
              <input
                className="input"
                value={heightIn}
                onChange={(e) => setHeightIn(e.target.value)}
                placeholder="72"
                inputMode="decimal"
                disabled={!heightLoaded}
              />
            </div>
          </div>

          <div className="row" style={{ marginTop: 12, gap: 8, flexWrap: "wrap" }}>
            <button className="btn primary" onClick={saveHeight} disabled={!hasHeightInput}>
              Save Height
            </button>
            <button className="btn" onClick={clearHeight} disabled={!hasHeightInput}>
              Clear
            </button>
          </div>

          <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
            Height is stored once and used later for waist-to-height ratio and other derived metrics.
          </div>
        </div>

        {/* ------------------------------------------------------------------
            Breadcrumb 4C.2 — Add entry card
           ------------------------------------------------------------------ */}
        <div className="card" style={{ padding: 12, marginTop: 12 }}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Add entry</div>

          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <div style={{ minWidth: 160, flex: 1 }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                Weight (lb)
              </div>
              <input
                className="input"
                value={weightLb}
                onChange={(e) => setWeightLb(e.target.value)}
                placeholder="200"
                inputMode="decimal"
              />
            </div>

            <div style={{ minWidth: 160, flex: 1 }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                Waist (in)
              </div>
              <input
                className="input"
                value={waistIn}
                onChange={(e) => setWaistIn(e.target.value)}
                placeholder="36.0"
                inputMode="decimal"
              />
            </div>

            <div style={{ minWidth: 160, flex: 1 }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                Body Fat %
              </div>
              <input
                className="input"
                value={bodyFatPct}
                onChange={(e) => setBodyFatPct(e.target.value)}
                placeholder="23.0"
                inputMode="decimal"
              />
            </div>
            
                        <div style={{ minWidth: 160, flex: 1 }}>
	                  <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
	                    Body Fat Mass (lb)
	                  </div>
	                  <input
	                    className="input"
	                    value={bodyFatMassLb}
	                    onChange={(e) => setBodyFatMassLb(e.target.value)}
	                    placeholder="46.0"
	                    inputMode="decimal"
	                  />
            </div>
        
            <div style={{ minWidth: 160, flex: 1 }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                Lean Mass (lb)
              </div>
              <input
                className="input"
                value={leanMassLb}
                onChange={(e) => setLeanMassLb(e.target.value)}
                placeholder="154.0"
                inputMode="decimal"
              />
            </div>

            <div style={{ minWidth: 160, flex: 1 }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                Visceral Fat Index
              </div>
              <input
                className="input"
                value={visceralFatIndex}
                onChange={(e) => setVisceralFatIndex(e.target.value)}
                placeholder="—"
                inputMode="decimal"
              />
            </div>

            <div style={{ minWidth: 160, flex: 1 }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                SMM (lb)
              </div>
              <input
                className="input"
                value={skeletalMuscleMassLb}
                onChange={(e) => setSkeletalMuscleMassLb(e.target.value)}
                placeholder="—"
                inputMode="decimal"
              />
            </div>

            <div style={{ minWidth: 160, flex: 1 }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                Body Water %
              </div>
              <input
                className="input"
                value={bodyWaterPct}
                onChange={(e) => setBodyWaterPct(e.target.value)}
                placeholder="—"
                inputMode="decimal"
              />
            </div>
            
                       <div style={{ minWidth: 160, flex: 1 }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                ICW (lb)
              </div>
              <input
                className="input"
                value={icwLb}
                onChange={(e) => setIcwLb(e.target.value)}
                placeholder="—"
                inputMode="decimal"
              />
            </div>

            <div style={{ minWidth: 160, flex: 1 }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                ECW (lb)
              </div>
              <input
                className="input"
                value={ecwLb}
                onChange={(e) => setEcwLb(e.target.value)}
                placeholder="—"
                inputMode="decimal"
              />
            </div>

            <div style={{ minWidth: 160, flex: 1 }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                Mineral Mass (lb)
              </div>
              <input
                className="input"
                value={mineralMassLb}
                onChange={(e) => setMineralMassLb(e.target.value)}
                placeholder="—"
                inputMode="decimal"
              />
            </div> 
                        
          </div>

          <div className="row" style={{ marginTop: 12, gap: 8, flexWrap: "wrap" }}>
            <button className="btn primary" onClick={addEntry} disabled={!hasAnyInput}>
              Save
            </button>
            <button
              className="btn"
              onClick={() => {
	        setWeightLb("");
	        setWaistIn("");
	        setBodyFatPct("");
	        setBodyFatMassLb("");
	        setLeanMassLb("");
	        setVisceralFatIndex("");
	        setSkeletalMuscleMassLb("");
	        setBodyWaterPct("");
	        setIcwLb("");
	        setEcwLb("");
	        setMineralMassLb("");
              }}
              disabled={!hasAnyInput}
            >
              Clear
            </button>
          </div>

          <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
            Tip: Daily weight is useful. Waist and body comp 2–3x/week is plenty.
          </div>
        </div>

        {/* ------------------------------------------------------------------
            Breadcrumb 4C.3 — Trend snapshots
            ------------------------------------------------------------------
            What this section does
            - Adds the first lightweight analytics view to the Body page
            - Uses separate charts for weight and waist so scale differences do
              not distort the visualization
           ------------------------------------------------------------------ */}
        <div className="card" style={{ padding: 12, marginTop: 12 }}>
          <div style={{ fontWeight: 900, marginBottom: 6 }}>Trend snapshots</div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
            Quick trend view for recent weight and waist snapshots.
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            <TrendChartCard
              title="Weight Trend"
              subtitle="Recent bodyweight snapshots"
              data={weightChartData}
              series={weightSeries}
              showBrush={weightChartData.length > 12}
              yDomainMode="auto"
              valueFormatter={(value) => formatLbs(value)}
              tooltipLabelFormatter={(label, datum) => {
                if (typeof datum?.date === "string" && datum.date.trim()) {
                  return datum.date;
                }
                return label;
              }}
              emptyMessage="Add a few weight entries to see the trend."
            />

            <TrendChartCard
              title="Waist Trend"
              subtitle="Recent waist snapshots"
              data={waistChartData}
              series={waistSeries}
              showBrush={waistChartData.length > 12}
              yDomainMode="tight"
              valueFormatter={(value) => formatInches(value)}
              tooltipLabelFormatter={(label, datum) => {
                if (typeof datum?.date === "string" && datum.date.trim()) {
                  return datum.date;
                }
                return label;
              }}
              emptyMessage="Add a few waist entries to see the trend."
            />
          </div>
        </div>

        {/* ------------------------------------------------------------------
            Breadcrumb 4C.4 — Recent entries
            ------------------------------------------------------------------
            What this section does
            - Shows recent rows only by default
            - Allows expansion when the user wants more historical detail

            Why this matters
            - Prevents the page from becoming a long scrolling archive
            - Keeps entry + trend review as the primary experience
           ------------------------------------------------------------------ */}
        <div className="card" style={{ padding: 12, marginTop: 12 }}>
          <div
            className="row"
            style={{ justifyContent: "space-between", alignItems: "baseline", gap: 10 }}
          >
            <div style={{ fontWeight: 900 }}>Recent entries</div>
            <div className="muted" style={{ fontSize: 12 }}>
              {rows?.length ? `${visibleRows.length} of ${rows.length} shown` : "—"}
            </div>
          </div>

          <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
            {visibleRows.length ? (
              visibleRows.map((r) => (
                <div key={r.id} className="card" style={{ padding: 10 }}>
                  <div
                    className="row"
                    style={{ justifyContent: "space-between", alignItems: "center", gap: 10 }}
                  >
                    <div style={{ fontWeight: 900 }}>{fmtDate(pickTime(r))}</div>
                    <button
                      className="btn small"
                      onClick={() => deleteEntry(r.id)}
                      title="Delete entry"
                    >
                      Delete
                    </button>
                  </div>

		    <div className="muted" style={{ marginTop: 8, fontSize: 13, lineHeight: 1.6 }}>
		      Weight: <b>{show(pickWeightLb(r), 1)}</b>
		      {"  •  "}
		      Waist: <b>{show(pickWaistIn(r), 1)}</b>
		      {"  •  "}
		      BF%: <b>{show(r.bodyFatPct, 2)}</b>
		      {"  •  "}
		      Fat Mass: <b>{show(getFatMassLb(r as any), 1)}</b>
		      {"  •  "}
		      Lean Mass: <b>{show(getLeanMassLb(r as any), 1)}</b>
		      <br />
		      VFI: <b>{show(r.visceralFatIndex, 2)}</b>
		      {"  •  "}
		      SMM: <b>{show(r.skeletalMuscleMassLb, 1)}</b>
		      {"  •  "}
		      Water%: <b>{show(r.bodyWaterPct, 2)}</b>
		      {"  •  "}
		      TBW: <b>{show(getTBW(r as any), 1)}</b>
		      {"  •  "}
		      Fluid Ratio: <b>{show(getFluidRatio(r as any), 3)}</b>
                  </div>
                </div>
              ))
            ) : (
              <div className="muted" style={{ fontSize: 13 }}>
                No entries yet.
              </div>
            )}
          </div>

          {rows && rows.length > RECENT_ROWS_DEFAULT ? (
            <div className="row" style={{ marginTop: 12, gap: 8, flexWrap: "wrap" }}>
              <button
                className="btn"
                onClick={() => setShowAllRows((prev) => !prev)}
              >
                {showAllRows ? "Show fewer" : "Show more"}
              </button>
            </div>
          ) : null}
        </div>
      </Section>
    </Page>
  );
}

/* ============================================================================
   End of file: src/pages/BodyPage.tsx
   ============================================================================ */