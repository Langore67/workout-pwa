// src/pages/StrengthPage.tsx
/* ========================================================================== */
/*  StrengthPage.tsx                                                          */
/*  BUILD_ID: 2026-04-19-STRENGTHPAGE-09                                      */
/*  FILE: src/pages/StrengthPage.tsx                                          */
/* -------------------------------------------------------------------------- */
/*  Purpose                                                                   */
/*  - Provide lift-performance analytics inside the Progress system           */
/*  - Show absolute + relative strength indices                               */
/*  - Show pattern scores and weekly trend snapshots                          */
/*                                                                            */
/*  Changes (STRENGTHPAGE-07)                                                 */
/*  ✅ Align Relative Strength chart with shared chart contract               */
/*  ✅ Add shortLabel support for compact shared chart readouts               */
/*  ✅ Remove old showBrush prop usage after chart paging refactor            */
/*  ✅ Preserve dashboard, pattern scores, and weekly trend table             */
/*                                                                            */
/*  Prior version (STRENGTHPAGE-06)                                           */
/*  ✅ Repair page structure after shared chart extraction                    */
/*  ✅ Add Relative Strength Trend shared chart                               */
/*  ✅ Preserve dashboard, pattern scores, and weekly trend table             */
/*  ✅ Preserve mode toggle persistence and trend calculations                */
/* ========================================================================== */
// TEMP: force sync of read-only anchors UI

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db, type Exercise } from "../db";
import ProgressPageHeader from "../components/layout/ProgressPageHeader";
import { Page, Section } from "../components/Page.tsx";
import {
  computeStrengthSnapshot,
  StrengthSnapshot,
} from "../strength/Strength";
import {
  computeStrengthSignalV2,
  getStrengthSignalV2Debug,
  type StrengthSignalV2Pattern,
  type StrengthSignalV2Result,
} from "../strength/v2/computeStrengthSignalV2";
import TrendChartCard from "../components/charts/TrendChartCard";
import { formatTwoDecimals } from "../components/charts/chartFormatters";
import InfoStubButton from "../components/information/InfoStubButton";
import { buildStrengthPageViewModel } from "./strength/strengthPageViewModel";
import {
  getCurrentPhase,
  getStrengthSignalConfig,
  setCurrentPhase,
  setStrengthSignalConfig,
  type CurrentPhase,
  type StrengthSignalConfig,
} from "../config/appConfig";

type Mode = CurrentPhase;

const MODE_KEY = "workout_pwa_strength_mode_v1";

/* ========================================================================== */
/*  Breadcrumb 1 — Formatting helpers                                         */
/* ========================================================================== */

function fmt1(v: any): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  const s = n.toFixed(1);
  return s.endsWith(".0") ? String(Math.round(n)) : s;
}

function fmt2(v: any): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(2);
}

function fmt0(v: any): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return String(Math.round(n));
}

/* ========================================================================== */
/*  Breadcrumb 2 — Tiny Sparkline (SVG)                                       */
/* ========================================================================== */

function Sparkline({
  values,
  height = 36,
}: {
  values: Array<number | null | undefined>;
  height?: number;
}) {
  const clean = (values ?? []).map((v) =>
    Number.isFinite(Number(v)) ? Number(v) : null,
  );
  const pts = clean.filter((v) => v != null) as number[];

  if (pts.length < 2) {
    return (
      <div className="muted" style={{ fontSize: 12 }}>
        —
      </div>
    );
  }

  const w = 220;
  const pad = 4;

  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;

  const xs = clean.map((_, i) => {
    const x = pad + (i * (w - pad * 2)) / Math.max(1, clean.length - 1);
    return x;
  });

  const ys = clean.map((v) => {
    if (v == null) return null;
    const t = (v - min) / span;
    const y = pad + (1 - t) * (height - pad * 2);
    return y;
  });

  let d = "";
  for (let i = 0; i < clean.length; i++) {
    const y = ys[i];
    if (y == null) continue;
    const x = xs[i];
    d += d
      ? ` L ${x.toFixed(1)} ${y.toFixed(1)}`
      : `M ${x.toFixed(1)} ${y.toFixed(1)}`;
  }

  return (
    <svg width="100%" viewBox={`0 0 ${w} ${height}`} style={{ display: "block" }}>
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.75"
      />
    </svg>
  );
}

function CollapseChevron({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      aria-hidden="true"
      style={{
        display: "block",
        opacity: 0.8,
        transform: open ? "rotate(90deg)" : "rotate(0deg)",
        transition: "transform 160ms ease",
      }}
    >
      <path
        d="M6 4.5 10 8l-4 3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ========================================================================== */
/*  Breadcrumb 3 — Mode (persisted)                                           */
/* ========================================================================== */

function loadLegacyMode(): Mode {
  try {
    const raw = String(localStorage.getItem(MODE_KEY) ?? "");
    if (raw === "cut" || raw === "maintain" || raw === "bulk") return raw;
  } catch {}
  return "cut";
}

function saveMode(m: Mode) {
  try {
    localStorage.setItem(MODE_KEY, m);
  } catch {}
}

function modeHint(mode: Mode) {
  if (mode === "cut") {
    return "Cut: Strength Signal is the primary trend metric. Relative Strength stays useful as a secondary comparison against bodyweight change.";
  }
  if (mode === "bulk") {
    return "Bulk: Strength Signal is the primary trend metric. Absolute Strength often rises first, while Relative Strength can lag as bodyweight increases.";
  }
  return "Maintain: Look for stable-to-rising Strength Signal and consistency across squat, hinge, push, and pull patterns.";
}

const CUT_MAINTAIN_ANCHOR_SLOTS: StrengthSignalV2Pattern[] = [
  "push",
  "pull",
  "hinge",
  "squat",
];

const BULK_ANCHOR_SLOTS: StrengthSignalV2Pattern[] = [
  "horizontalPush",
  "verticalPush",
  "horizontalPull",
  "verticalPull",
  "hinge",
  "squat",
  "carry",
];

const ANCHOR_SLOT_LABELS: Record<StrengthSignalV2Pattern, string> = {
  push: "Push",
  pull: "Pull",
  hinge: "Hinge",
  squat: "Squat",
  horizontalPush: "Horizontal Push",
  verticalPush: "Vertical Push",
  horizontalPull: "Horizontal Pull",
  verticalPull: "Vertical Pull",
  carry: "Carry",
};

const ANCHOR_SLOT_SUBTYPES: Record<StrengthSignalV2Pattern, string[]> = {
  push: ["horizontalPush", "verticalPush"],
  pull: ["horizontalPull", "verticalPull"],
  hinge: ["hinge"],
  squat: ["squat"],
  horizontalPush: ["horizontalPush"],
  verticalPush: ["verticalPush"],
  horizontalPull: ["horizontalPull"],
  verticalPull: ["verticalPull"],
  carry: ["carry"],
};

function anchorSlotsForMode(mode: Mode): StrengthSignalV2Pattern[] {
  return mode === "bulk" ? BULK_ANCHOR_SLOTS : CUT_MAINTAIN_ANCHOR_SLOTS;
}

function anchorSourceLabel(source: "CONFIGURED" | "AUTO_SELECTED" | undefined): string {
  return source === "CONFIGURED" ? "Configured" : "Auto-selected";
}

function formatAnchorE1RM(value: unknown): string {
  const n = Number(value);
  return Number.isFinite(n) ? fmt0(n) : "Unknown";
}

function formatAnchorDate(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "Unknown";
  return new Date(n).toLocaleDateString();
}

function formatConfidence(value: unknown): string {
  if (value === "HIGH") return "High";
  if (value === "MEDIUM") return "Medium";
  if (value === "LOW") return "Low";
  return "Unknown";
}

function formatAnchorSetText(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "Unknown";
}

function formatAnchorSetCount(value: unknown): string {
  const n = Number(value);
  return Number.isFinite(n) ? fmt0(n) : "Unknown";
}

function anchorDirectionLabel(capacityValue: unknown, stateValue: unknown): string {
  const capacity = Number(capacityValue);
  const state = Number(stateValue);
  if (!Number.isFinite(capacity) || capacity <= 0 || !Number.isFinite(state) || state <= 0) {
    return "State unknown";
  }
  if (state >= capacity) return "▲ Improving / At capacity";
  return (capacity - state) / capacity <= 0.03 ? "▬ Stable" : "▼ Down";
}

function exerciseEligibleForAnchorSlot(exercise: Exercise, slot: StrengthSignalV2Pattern): boolean {
  if (exercise.archivedAt) return false;
  const eligibility = String(exercise.anchorEligibility ?? "").trim().toLowerCase();
  if (eligibility !== "primary" && eligibility !== "conditional") return false;

  const subtypes = Array.isArray(exercise.anchorSubtypes)
    ? exercise.anchorSubtypes.map((subtype) => String(subtype ?? "").trim()).filter(Boolean)
    : [];
  return subtypes.some((subtype) => ANCHOR_SLOT_SUBTYPES[slot].includes(subtype));
}

function configuredAnchorIdForSlot(
  config: StrengthSignalConfig | null,
  phase: Mode,
  slot: StrengthSignalV2Pattern
): string {
  const value = (config?.strengthSignalV2Config?.phases as any)?.[phase]?.[slot];
  return typeof value === "string" ? value : "";
}

/* ========================================================================== */
/*  Breadcrumb 4 — Page component                                             */
/* ========================================================================== */

export default function StrengthPage() {
  const navigate = useNavigate();
  const windowDays = 28;

  const [mode, setMode] = useState<Mode>(() => loadLegacyMode());
  const [phaseLoaded, setPhaseLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>("");
  const [snapshot, setSnapshot] = useState<StrengthSnapshot | null>(null);
  const [strengthV2, setStrengthV2] = useState<StrengthSignalV2Result | null>(null);
  const [strengthV2Err, setStrengthV2Err] = useState<string>("");
  const [strengthConfig, setStrengthConfig] = useState<StrengthSignalConfig | null>(null);
  const [anchorExercises, setAnchorExercises] = useState<Exercise[]>([]);
  const [anchorsEditOpen, setAnchorsEditOpen] = useState(false);
  const [anchorConfigErr, setAnchorConfigErr] = useState<string>("");
  const [anchorConfigRevision, setAnchorConfigRevision] = useState(0);
  const [savingAnchorSlot, setSavingAnchorSlot] = useState<StrengthSignalV2Pattern | null>(null);
  const [patternScoresOpen, setPatternScoresOpen] = useState(false);
  const [trendTableOpen, setTrendTableOpen] = useState(false);

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    let alive = true;

    (async () => {
      try {
        const debugText = await getStrengthSignalV2Debug();
        if (alive) console.info("[StrengthSignalV2Debug]\n" + debugText);
      } catch (e) {
        if (alive) console.warn("[StrengthSignalV2Debug] Failed to compute debug output.", e);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;

    (async () => {
      const [sharedPhase, config, exercises] = await Promise.all([
        getCurrentPhase({ fallbackPhase: loadLegacyMode() }),
        getStrengthSignalConfig(),
        db.exercises.toArray(),
      ]);
      if (!alive) return;
      setMode(sharedPhase);
      setStrengthConfig(config);
      setAnchorExercises(
        (exercises ?? [])
          .filter((exercise) => !exercise.archivedAt)
          .slice()
          .sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? "")))
      );
      setPhaseLoaded(true);
    })();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!phaseLoaded) return;
    saveMode(mode);

    let alive = true;

    (async () => {
      try {
        setStrengthV2Err("");
        setStrengthV2(null);
        await setCurrentPhase(mode);
        const nextSignal = await computeStrengthSignalV2();
        if (!alive) return;
        setStrengthV2(nextSignal);
      } catch (e: any) {
        if (!alive) return;
        setStrengthV2(null);
        setStrengthV2Err(String(e?.message ?? e ?? "Failed to compute current anchors."));
      }
    })();

    return () => {
      alive = false;
    };
  }, [mode, phaseLoaded, anchorConfigRevision]);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setErr("");
        const nextSnapshot = await computeStrengthSnapshot(12, windowDays);

        if (!alive) return;
        setSnapshot(nextSnapshot ?? null);
      } catch (e: any) {
        if (!alive) return;
        setSnapshot(null);
        setErr(String(e?.message ?? e ?? "Failed to compute strength signal."));
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [windowDays]);

  const result = snapshot?.result ?? null;
  const heroMeta = snapshot?.heroMeta ?? null;
  const {
    bwLabel,
    trendSorted,
    bwSeries,
    absSeries,
    relativeChartData,
    strengthSignalChartData,
    relativeStrengthSeries,
    strengthSignalSeries,
    strengthSignalCompactMetaLine,
  } = useMemo(() => buildStrengthPageViewModel(snapshot), [snapshot]);
  const anchorSlots = useMemo(() => anchorSlotsForMode(mode), [mode]);
  const eligibleAnchorExercisesBySlot = useMemo(() => {
    const rows: Partial<Record<StrengthSignalV2Pattern, Exercise[]>> = {};
    for (const slot of anchorSlots) {
      rows[slot] = anchorExercises.filter((exercise) => exerciseEligibleForAnchorSlot(exercise, slot));
    }
    return rows;
  }, [anchorExercises, anchorSlots]);

  async function saveAnchorOverride(slot: StrengthSignalV2Pattern, exerciseId: string) {
    try {
      setAnchorConfigErr("");
      setSavingAnchorSlot(slot);

      const current = strengthConfig ?? await getStrengthSignalConfig();
      const phases = { ...(current.strengthSignalV2Config?.phases ?? {}) } as any;
      const phaseConfig = { ...(phases[mode] ?? {}) };

      if (exerciseId) {
        phaseConfig[slot] = exerciseId;
      } else {
        delete phaseConfig[slot];
      }

      phases[mode] = phaseConfig;

      const nextConfig = await setStrengthSignalConfig({
        ...current,
        strengthSignalV2Config: {
          ...(current.strengthSignalV2Config ?? {}),
          phases,
        },
      });

      setStrengthConfig(nextConfig);
      setAnchorConfigRevision((revision) => revision + 1);
    } catch (e: any) {
      setAnchorConfigErr(String(e?.message ?? e ?? "Failed to update anchor override."));
    } finally {
      setSavingAnchorSlot(null);
    }
  }

    return (
    <Page>
	  <Section>
	    <ProgressPageHeader
	      breadcrumb="← Progress / Strength"
	      description="Estimated 1RM, trend snapshots, and lifting performance."
	      onBreadcrumbClick={() => navigate("/progress")}
	    />
      </Section>

      {/* =====================================================================
          Breadcrumb 4B — Strength analytics content
         ================================================================== */}
      <Section>
                <div className="card" style={{ padding: 14 }}>
	            <div
	              className="muted"
	              style={{
	                fontSize: 12,
	                fontWeight: 800,
	                textTransform: "uppercase",
	                letterSpacing: 0.5,
	                marginBottom: 6,
	              }}
	            >
	              Strength Analytics
	            </div>
	  
	            <div
	              style={{
	                display: "flex",
	                alignItems: "center",
	                justifyContent: "space-between",
	                gap: 8,
	              }}
	            >
	              <div style={{ fontWeight: 900, fontSize: 22 }}>Strength Signal</div>
	              <InfoStubButton pageKey="strength" infoKey="strengthSignal" />
	            </div>
	  
	            <div className="muted" style={{ marginTop: 6, lineHeight: 1.45 }}>
	              Window: last <b>{windowDays}</b> days • Completed working sets only • e1RM (Epley)
	            </div>
	  
	            <div className="muted" style={{ marginTop: 8, fontSize: 13, lineHeight: 1.45 }}>
	              Strength Signal is IronForge&apos;s primary strength trend metric. It blends
	              squat, hinge, push, and pull performance, uses allometric normalization
	              (BW^0.67), and keeps Relative Strength as a secondary comparison lens.
	            </div>
	  
          <hr style={{ marginTop: 12 }} />

          {loading ? (
            <div className="muted">Loading…</div>
          ) : err ? (
            <div className="card" style={{ padding: 12 }}>
              <div style={{ fontWeight: 900 }}>Couldn’t compute strength signal</div>
              <div
                className="muted"
                style={{ marginTop: 6, whiteSpace: "pre-wrap" }}
              >
                {err}
              </div>
              <div
                className="row"
                style={{ gap: 8, marginTop: 10, flexWrap: "wrap" }}
              >
                <button
                  className="btn small"
                  onClick={() => window.location.reload()}
                >
                  Reload
                </button>
              </div>
            </div>
          ) : !result ? (
            <div className="muted">No data yet (log some completed working sets).</div>
          ) : (
            <>
              <div className="card" style={{ padding: 16, marginBottom: 12 }}>
                <div
                  className="muted"
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    marginBottom: 6,
                  }}
                >
                  Strength Signal
                </div>

                <div style={{ fontWeight: 900, fontSize: 34, lineHeight: 1 }}>
                  {Number.isFinite(Number(result?.normalizedIndex))
                    ? fmt2(result?.normalizedIndex)
                    : "—"}
                </div>

                <div className="muted" style={{ marginTop: 8, lineHeight: 1.45 }}>
                  Primary blended strength trend using Epley-based e1RM scoring, allometric
                  normalization (BW^0.67), and weekly snapshots from overlapping <b>{windowDays}</b>-day windows.
                </div>

                <div
                  className="row"
                  style={{
                    gap: 12,
                    flexWrap: "wrap",
                    marginTop: 10,
                    fontSize: 12,
                    lineHeight: 1.4,
                  }}
                >
                  <div className="muted">
                    Trend: <b>{heroMeta?.trendLabel ?? "—"}</b>
                  </div>
                  <div className="muted">
                    Confidence: <b>{heroMeta?.confidence ?? "—"}</b>
                  </div>
                  <div className="muted">
                    Window: <b>{windowDays} days</b>
                  </div>
                </div>
              </div>

              <TrendChartCard
                title="Strength Signal Trend"
                subtitle="Weekly snapshots of normalized strength signal"
                data={strengthSignalChartData}
                series={strengthSignalSeries}
            windowSize={6}
            paneNavigationMode="movingPane"
                valueFormatter={formatTwoDecimals}
                showTrendLine={true}
                readoutMode="statRow"
                compactMetaLineText={strengthSignalCompactMetaLine}
              />

              {/* ===================== Dashboard ===================== */}
	      <div
		className="muted"
		style={{
		  fontSize: 12,
		  fontWeight: 800,
		  textTransform: "uppercase",
		  letterSpacing: 0.5,
	          marginBottom: 8,
	        }}
	      >
		 Dashboard
              </div>

              <div className="row" style={{ gap: 12, flexWrap: "wrap", alignItems: "stretch" }}>
                <div className="card" style={{ padding: 12, minWidth: 220, flex: 1, minHeight: 170 }}>
		    <div
		      className="muted"
		      style={{
			fontSize: 12,
			fontWeight: 800,
			textTransform: "uppercase",
			letterSpacing: 0.5,
		      }}
		    >
		      Mode
                  </div>

                  <div
                    className="row"
                    style={{ gap: 8, marginTop: 8, flexWrap: "wrap" }}
                  >
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

		    <div style={{ fontWeight: 900, fontSize: 18, marginTop: 10 }}>
		      {mode === "cut"
			? "Cut Lens"
			: mode === "bulk"
			  ? "Bulk Lens"
			  : "Maintain Lens"}
		    </div>

		    <div className="muted" style={{ fontSize: 12, marginTop: 8, lineHeight: 1.45 }}>
		      {modeHint(mode)}
                  </div>
                </div>

                <div className="card" style={{ padding: 12, minWidth: 220, flex: 1, minHeight: 170 }}>
		    <div
		      className="muted"
		      style={{
			fontSize: 12,
			fontWeight: 800,
			textTransform: "uppercase",
			letterSpacing: 0.5,
		      }}
		    >
		      Bodyweight
                  </div>
                  <div style={{ fontWeight: 900, fontSize: 22, marginTop: 6 }}>
                    {bwLabel === "—"
                      ? "—"
                      : bwLabel.replace(/\s*\(.*\)\s*$/, "")}
                  </div>
		    <div className="muted" style={{ fontSize: 12, marginTop: 6, lineHeight: 1.4 }}>
		      Strength uses a rolling 5-day average bodyweight for normalization • <b>{bwLabel}</b>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <Sparkline values={bwSeries} />
                  </div>
                </div>


                <div className="card" style={{ padding: 12, minWidth: 220, flex: 1, minHeight: 170 }}>
		                  <div
		                    className="muted"
		                    style={{
		                      fontSize: 12,
		                      fontWeight: 800,
		                      textTransform: "uppercase",
		                      letterSpacing: 0.5,
		                      marginBottom: 6,
		                    }}
		                  >
		                    Absolute Strength Trend
              </div>
                  <div style={{ fontWeight: 900, fontSize: 22, marginTop: 6 }}>
                    {Number.isFinite(Number(result.absoluteIndex))
                      ? fmt0(result.absoluteIndex)
                      : "—"}
                  </div>
		    <div className="muted" style={{ fontSize: 12, marginTop: 6, lineHeight: 1.4 }}>
		      Raw strength signal across squat, hinge, push, and pull patterns.
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <Sparkline values={absSeries} />
                  </div>
                </div>
              </div>

              <hr style={{ marginTop: 12 }} />

              {/* ===================== Current strength anchors ===================== */}
              <div
                className="row"
                style={{
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: patternScoresOpen ? 8 : 0,
                  flexWrap: "wrap",
                }}
              >
                <button
                  type="button"
                  className="row"
                  onClick={() => {
                    setPatternScoresOpen((open) => {
                      if (open) setAnchorsEditOpen(false);
                      return !open;
                    });
                  }}
                  aria-expanded={patternScoresOpen}
                  style={{
                    flex: "1 1 220px",
                    justifyContent: "space-between",
                    alignItems: "center",
                    background: "transparent",
                    border: 0,
                    padding: 0,
                    cursor: "pointer",
                  }}
                >
                  <div
                    className="muted"
                    style={{
                      fontSize: 12,
                      fontWeight: 800,
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                    }}
                  >
                    Current Strength Anchors
                  </div>
                  <div className="muted" style={{ lineHeight: 1 }}>
                    <CollapseChevron open={patternScoresOpen} />
                  </div>
                </button>
                {patternScoresOpen ? (
                  <button
                    type="button"
                    className={`btn small ${anchorsEditOpen ? "primary" : ""}`}
                    onClick={() => setAnchorsEditOpen((open) => !open)}
                  >
                    {anchorsEditOpen ? "Done" : "Edit anchors"}
                  </button>
                ) : null}
              </div>

              {patternScoresOpen ? (
                <div style={{ display: "grid", gap: 8 }}>
                  {anchorConfigErr ? (
                    <div className="muted" style={{ color: "var(--danger)" }}>
                      Could not update anchor override: {anchorConfigErr}
                    </div>
                  ) : null}
                  {strengthV2Err ? (
                    <div className="muted">
                      Could not load current anchors: {strengthV2Err}
                    </div>
                  ) : strengthV2 ? (
                    anchorSlots.map((slot) => {
                      const anchor = strengthV2.anchors[slot] ?? null;
                      const isResolved = Boolean(anchor?.exerciseName);
                      const capacity = anchor?.capacity;
                      const state = anchor?.state;
                      const configuredAnchorId = configuredAnchorIdForSlot(strengthConfig, mode, slot);
                      const eligibleExercises = eligibleAnchorExercisesBySlot[slot] ?? [];
                      const configuredAnchorIsListed = eligibleExercises.some(
                        (exercise) => exercise.id === configuredAnchorId
                      );
                      const savingThisAnchor = savingAnchorSlot === slot;

                      return (
                        <div key={slot} className="card" style={{ padding: 12 }}>
                          <div
                            className="row"
                            style={{
                              justifyContent: "space-between",
                              alignItems: "flex-start",
                              gap: 10,
                              flexWrap: "wrap",
                            }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div
                                className="muted"
                                style={{
                                  fontSize: 12,
                                  fontWeight: 800,
                                  textTransform: "uppercase",
                                  letterSpacing: 0.5,
                                  marginBottom: 4,
                                }}
                              >
                                {ANCHOR_SLOT_LABELS[slot]}
                              </div>
                              <div style={{ fontWeight: 900 }}>
                                {anchor?.exerciseName ?? "Unresolved"}
                              </div>
                            </div>
                            <div
                              className="muted"
                              style={{
                                border: "1px solid var(--border)",
                                borderRadius: 8,
                                fontSize: 12,
                                fontWeight: 800,
                                padding: "3px 8px",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {anchorSourceLabel(anchor?.selectionSource)}
                            </div>
                          </div>

                          {anchorsEditOpen ? (
                            <div
                              style={{
                                display: "grid",
                                gap: 6,
                                marginTop: 10,
                              }}
                            >
                              <div className="muted" style={{ fontSize: 12 }}>
                                {configuredAnchorId ? "Override active" : "Using automatic selection"}
                              </div>
                              <div
                                className="row"
                                style={{
                                  alignItems: "center",
                                  gap: 8,
                                  flexWrap: "wrap",
                                }}
                              >
                                <label
                                  className="muted"
                                  htmlFor={`anchor-${slot}`}
                                  style={{ fontSize: 12, fontWeight: 800 }}
                                >
                                  {configuredAnchorId ? "Change anchor" : "Set anchor"}
                                </label>
                                <select
                                  id={`anchor-${slot}`}
                                  value={configuredAnchorId}
                                  disabled={savingThisAnchor}
                                  onChange={(event) => void saveAnchorOverride(slot, event.target.value)}
                                  style={{
                                    flex: "1 1 220px",
                                    minWidth: 0,
                                    maxWidth: "100%",
                                  }}
                                >
                                  <option value="">Automatic selection</option>
                                  {configuredAnchorId && !configuredAnchorIsListed ? (
                                    <option value={configuredAnchorId}>Current override unavailable</option>
                                  ) : null}
                                  {eligibleExercises.map((exercise) => (
                                    <option key={exercise.id} value={exercise.id}>
                                      {exercise.name}
                                    </option>
                                  ))}
                                </select>
                                {configuredAnchorId ? (
                                  <button
                                    type="button"
                                    className="btn small"
                                    disabled={savingThisAnchor}
                                    onClick={() => void saveAnchorOverride(slot, "")}
                                  >
                                    Clear override
                                  </button>
                                ) : null}
                              </div>
                              {!eligibleExercises.length ? (
                                <div className="muted" style={{ fontSize: 12 }}>
                                  No eligible exercises for this slot.
                                </div>
                              ) : null}
                            </div>
                          ) : null}

                          {isResolved ? (
                            <div
                              style={{
                                display: "grid",
                                gap: 10,
                                marginTop: 10,
                              }}
                            >
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                                  gap: 8,
                                }}
                              >
                                <div>
                                  <div className="muted" style={{ fontSize: 12 }}>
                                    Capacity
                                  </div>
                                  <div style={{ fontWeight: 900, fontSize: 18 }}>
                                    {formatAnchorE1RM(capacity?.e1RM)}
                                  </div>
                                </div>
                                <div>
                                  <div className="muted" style={{ fontSize: 12 }}>
                                    State
                                  </div>
                                  <div style={{ fontWeight: 900, fontSize: 18 }}>
                                    {formatAnchorE1RM(state?.e1RM)}
                                  </div>
                                </div>
                              </div>

                              <div
                                className="muted"
                                style={{
                                  border: "1px solid var(--border)",
                                  borderRadius: 8,
                                  display: "inline-flex",
                                  fontSize: 12,
                                  fontWeight: 850,
                                  justifySelf: "start",
                                  padding: "4px 8px",
                                }}
                              >
                                {anchorDirectionLabel(capacity?.e1RM, state?.e1RM)}
                              </div>

                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                                  gap: 8,
                                }}
                              >
                                <div>
                                  <div className="muted" style={{ fontSize: 12 }}>
                                    Capacity best
                                  </div>
                                  <div style={{ fontSize: 13, fontWeight: 850 }}>
                                    {formatAnchorSetText(capacity?.bestSetText)}
                                  </div>
                                </div>
                                <div>
                                  <div className="muted" style={{ fontSize: 12 }}>
                                    State best
                                  </div>
                                  <div style={{ fontSize: 13, fontWeight: 850 }}>
                                    {formatAnchorSetText(state?.bestSetText)}
                                  </div>
                                </div>
                              </div>

                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                                  gap: 8,
                                }}
                              >
                                <div>
                                  <div className="muted" style={{ fontSize: 12 }}>
                                    Last performed
                                  </div>
                                  <div style={{ fontWeight: 850 }}>
                                    {formatAnchorDate(state?.lastPerformedAt)}
                                  </div>
                                </div>
                                <div>
                                  <div className="muted" style={{ fontSize: 12 }}>
                                    Confidence
                                  </div>
                                  <div style={{ fontWeight: 850 }}>
                                    {formatConfidence(state?.confidence)}
                                  </div>
                                </div>
                              </div>

                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                                  gap: 8,
                                }}
                              >
                                <div>
                                  <div className="muted" style={{ fontSize: 12 }}>
                                    Sets (90d)
                                  </div>
                                  <div style={{ fontWeight: 850 }}>
                                    {formatAnchorSetCount(capacity?.completedSetsConsidered)}
                                  </div>
                                </div>
                                <div>
                                  <div className="muted" style={{ fontSize: 12 }}>
                                    Sets (28d)
                                  </div>
                                  <div style={{ fontWeight: 850 }}>
                                    {formatAnchorSetCount(state?.completedSetsConsidered)}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="muted" style={{ marginTop: 8 }}>
                              No eligible recent anchor data
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="muted">Loading current anchors...</div>
                  )}
                </div>
              ) : null}

              <hr style={{ marginTop: 12 }} />


    {/* ===================== Relative strength chart ===================== */}
                  <div
                    className="muted"
                    style={{
                      fontSize: 12,
                      fontWeight: 800,
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                      marginBottom: 6,
                    }}
                  >
                    Relative Strength Trend
              </div>
              
    <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
      Weekly snapshots of bodyweight-normalized strength across your recent training history.
              </div>

              <TrendChartCard
                title="Relative Strength Trend"
                subtitle="Weekly snapshots of bodyweight-normalized strength"
                data={relativeChartData}
                series={relativeStrengthSeries}
                windowSize={12}
                yDomainMode="auto"
                showTrendLine={true}
                readoutMode="statRow"
                valueFormatter={(value) => {
                  if (value == null || !Number.isFinite(value)) return "—";
                  return value.toFixed(2);
                }}
                tooltipLabelFormatter={(label, datum) => {
                  if (typeof datum?.date === "string" && datum.date.trim()) {
                    return datum.date;
                  }
                  return label;
                }}
              />

              <hr style={{ marginTop: 12 }} />

              {/* ===================== Trend table ===================== */}
              <button
                type="button"
                className="row"
                onClick={() => setTrendTableOpen((open) => !open)}
                aria-expanded={trendTableOpen}
                style={{
                  width: "100%",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: "transparent",
                  border: 0,
                  padding: 0,
                  cursor: "pointer",
                  marginBottom: trendTableOpen ? 6 : 0,
                }}
              >
                <div
                  className="muted"
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  Trend (Last 12 Weeks)
                </div>
                <div className="muted" style={{ lineHeight: 1 }}>
                  <CollapseChevron open={trendTableOpen} />
                </div>
              </button>
              {trendTableOpen ? (
                <>
                  <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
                    Weekly snapshots using the same Strength Signal rules. Relative Strength remains a secondary linear bodyweight comparison.
                  </div>

                  <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ textAlign: "left" }}>
                          <th
                            style={{
                              padding: "10px 12px",
                              borderBottom: "1px solid var(--line)",
                            }}
                          >
                            Week
                          </th>
                          <th
                            style={{
                              padding: "10px 12px",
                              borderBottom: "1px solid var(--line)",
                            }}
                          >
                            BW (avg)
                          </th>
                          <th
                            style={{
                              padding: "10px 12px",
                              borderBottom: "1px solid var(--line)",
                            }}
                          >
                            Rel
                          </th>
                          <th
                            style={{
                              padding: "10px 12px",
                              borderBottom: "1px solid var(--line)",
                            }}
                          >
                            Abs
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {trendSorted.length ? (
                          trendSorted.map((r) => (
                            <tr key={r.weekEndMs}>
                              <td
                                style={{
                                  padding: "10px 12px",
                                  borderBottom: "1px solid var(--line)",
                                }}
                              >
                                {r.label}
                              </td>
                              <td
                                style={{
                                  padding: "10px 12px",
                                  borderBottom: "1px solid var(--line)",
                                }}
                              >
                                {Number.isFinite(r.bodyweight) ? fmt1(r.bodyweight) : "—"}
                                <span
                                  className="muted"
                                  style={{ marginLeft: 6, fontSize: 12 }}
                                >
                                  {r.bodyweightDaysUsed ? `(n=${r.bodyweightDaysUsed})` : ""}
                                </span>
                              </td>
                              <td
                                style={{
                                  padding: "10px 12px",
                                  borderBottom: "1px solid var(--line)",
                                }}
                              >
                                {Number.isFinite(r.relativeIndex)
                                  ? fmt2(r.relativeIndex)
                                  : "—"}
                              </td>
                              <td
                                style={{
                                  padding: "10px 12px",
                                  borderBottom: "1px solid var(--line)",
                                }}
                              >
                                {Number.isFinite(r.absoluteIndex)
                                  ? fmt0(r.absoluteIndex)
                                  : "—"}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td
                              className="muted"
                              style={{ padding: "10px 12px" }}
                              colSpan={4}
                            >
                              No trend data yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="muted" style={{ marginTop: 10, fontSize: 12, lineHeight: 1.45 }}>
                    Tip: Watch <b>Strength Signal</b> first for the primary blended trend. Use <b>Relative Strength</b> as a secondary comparison when bodyweight is changing quickly.
                  </div>
                </>
              ) : null}
            </>
          )}
        </div>
      </Section>
    </Page>
  );
}

/* ========================================================================== */
/*  End of file: src/pages/StrengthPage.tsx                                   */
/* ========================================================================== */


