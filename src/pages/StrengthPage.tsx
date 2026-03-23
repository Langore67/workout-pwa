// src/pages/StrengthPage.tsx
/* ========================================================================== */
/*  StrengthPage.tsx                                                          */
/*  BUILD_ID: 2026-03-17-STRENGTHPAGE-08                                      */
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

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import ProgressPageHeader from "../components/layout/ProgressPageHeader";
import { Page, Section } from "../components/Page.tsx";
import {
  computeStrengthIndex,
  computeStrengthTrend,
  StrengthTrendRow,
} from "../strength/Strength";
import TrendChartCard from "../components/charts/TrendChartCard";
import type { ChartSeriesConfig, ChartDatum } from "../components/charts/chartTypes";
import { formatTwoDecimals } from "../components/charts/chartFormatters";

type StrengthPattern = "squat" | "hinge" | "push" | "pull";
type Mode = "cut" | "maintain" | "bulk";

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

/* ========================================================================== */
/*  Breadcrumb 3 — Mode (persisted)                                           */
/* ========================================================================== */

function loadMode(): Mode {
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
    return "Cut: Relative Strength is the main signal because it accounts for bodyweight changes.";
  }
  if (mode === "bulk") {
    return "Bulk: Absolute Strength often rises first, while Relative Strength may lag as bodyweight increases.";
  }
  return "Maintain: Look for stable-to-rising strength signals and consistency across squat, hinge, push, and pull.";
}

/* ========================================================================== */
/*  Breadcrumb 4 — Page component                                             */
/* ========================================================================== */

export default function StrengthPage() {
  const navigate = useNavigate();
  const windowDays = 28;

  const [mode, setMode] = useState<Mode>(() => loadMode());
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>("");
  const [result, setResult] = useState<any | null>(null);
  const [trend, setTrend] = useState<StrengthTrendRow[]>([]);

  useEffect(() => {
    saveMode(mode);
  }, [mode]);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setErr("");

        const [r, t] = await Promise.all([
          computeStrengthIndex(windowDays),
          computeStrengthTrend(12, windowDays),
        ]);

        if (!alive) return;
        setResult(r ?? null);
        setTrend(Array.isArray(t) ? t : []);
      } catch (e: any) {
        if (!alive) return;
        setResult(null);
        setTrend([]);
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

  const patterns = useMemo(() => {
    const p = result?.patterns;
    return Array.isArray(p) ? p : [];
  }, [result]);

  const bwLabel = useMemo(() => {
    if (!result || !Number.isFinite(Number(result.bodyweight))) return "—";
    const n = Number(result.bodyweightDaysUsed);
    const nLabel = Number.isFinite(n) && n > 0 ? ` • n=${n}` : "";
    return `${fmt1(result.bodyweight)} (5-day avg${nLabel})`;
  }, [result]);

  const trendSorted = useMemo(() => {
    return (trend ?? []).slice().sort((a, b) => b.weekEndMs - a.weekEndMs);
  }, [trend]);

  const bwSeries = useMemo(
    () => trendSorted.map((r) => (Number.isFinite(r.bodyweight) ? r.bodyweight : null)),
    [trendSorted],
  );

  const relSeries = useMemo(
    () => trendSorted.map((r) => (Number.isFinite(r.relativeIndex) ? r.relativeIndex : null)),
    [trendSorted],
  );

  const absSeries = useMemo(
    () => trendSorted.map((r) => (Number.isFinite(r.absoluteIndex) ? r.absoluteIndex : null)),
    [trendSorted],
  );

  const relativeChartData: ChartDatum[] = useMemo(
    () =>
      trendSorted
        .slice()
        .reverse()
        .map((r, index) => ({
          label: r.label ?? `W${index + 1}`,
          value: Number.isFinite(r.relativeIndex) ? r.relativeIndex : null,
          date: r.label,
          bodyweight: Number.isFinite(r.bodyweight) ? r.bodyweight : null,
          absoluteIndex: Number.isFinite(r.absoluteIndex) ? r.absoluteIndex : null,
        })),
    [trendSorted],
  );

  const relativeStrengthSeries: ChartSeriesConfig[] = useMemo(
    () => [
      {
        key: "value",
        label: "Relative Strength",
        shortLabel: "Rel Str",
        formatter: formatTwoDecimals,
        stroke: "var(--accent)",
      },
    ],
    [],
  );

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
	  
	            <div style={{ fontWeight: 900, fontSize: 22 }}>Strength Signal</div>
	  
	            <div className="muted" style={{ marginTop: 6, lineHeight: 1.45 }}>
	              Window: last <b>{windowDays}</b> days • Completed working sets only • e1RM (Epley)
	            </div>
	  
	            <div className="muted" style={{ marginTop: 8, fontSize: 13, lineHeight: 1.45 }}>
	              Relative Strength is the main signal during a cut. Absolute Strength helps show
	              raw lifting progress, especially during maintain and bulk phases.
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

                <div className="card" style={{ padding: 12, minWidth: 220, flex: 1, minHeight:170 }}>
		    <div
		      className="muted"
		      style={{
			fontSize: 12,
			fontWeight: 800,
			textTransform: "uppercase",
			letterSpacing: 0.5,
		      }}
		    >
		      Relative Strength
                  </div>
                  <div style={{ fontWeight: 900, fontSize: 22, marginTop: 6 }}>
                    {Number.isFinite(Number(result.relativeIndex))
                      ? fmt2(result.relativeIndex)
                      : "—"}
                  </div>
		    <div className="muted" style={{ fontSize: 12, marginTop: 6, lineHeight: 1.4 }}>
		      Bodyweight-normalized signal. This is the primary metric to watch during a cut.
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <Sparkline values={relSeries} />
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

              {/* ===================== Pattern scores ===================== */}
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
	                      Pattern Scores
              </div>

              <div style={{ display: "grid", gap: 8 }}>
                {patterns.length ? (
                  patterns.map((p: any) => (
                    <div
                      key={p.pattern as StrengthPattern}
                      className="card"
                      style={{ padding: 12 }}
                    >
                      <div
                        className="row"
                        style={{
                          justifyContent: "space-between",
                          alignItems: "baseline",
                          gap: 10,
                        }}
                      >
                        <div
                          style={{
                            fontWeight: 900,
                            textTransform: "capitalize",
                          }}
                        >
                          {p.pattern}
                        </div>
                        <div className="muted" style={{ fontSize: 12 }}>
                          abs: <b>{Number.isFinite(Number(p.absolute)) ? fmt0(p.absolute) : "—"}</b>
                          {"  "}•{"  "}
                          rel: <b>{Number.isFinite(Number(p.relative)) ? fmt2(p.relative) : "—"}</b>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
		    <div className="muted">
		      No pattern scores yet. Log completed working sets across your main lift patterns to build this section.
                  </div>
                )}
              </div>

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
	                      Trend (Last 12 Weeks)
              </div>
		    <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
		     Weekly snapshots using the same Strength Signal rules. During a cut, Relative Strength is the primary signal.
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
		      Tip: During a cut, watch <b>Relative Strength</b> first. If it stays stable while bodyweight trends down, you are likely preserving strength well.
              </div>
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