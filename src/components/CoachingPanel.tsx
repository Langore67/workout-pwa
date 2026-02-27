// src/components/CoachingPanel.tsx
/* ========================================================================== */
/*  CoachingPanel.tsx                                                         */
/*  BUILD_ID: 2026-02-24-CP-02                                                */
/* -------------------------------------------------------------------------- */
/*  Drop-in Coaching Panel (trainer-brain UI)                                 */
/*                                                                            */
/*  Revision history                                                          */
/*  - 2026-02-24  CP-01  Initial drop-in panel (cut hint + perf snapshot)      */
/*  - 2026-02-24  CP-02  Add breadcrumbs + common mistakes + video section     */
/*                       Harden against sparse/missing data; tidy helpers      */
/* ========================================================================== */

import React, { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getBodyMetricsSummary, getCutModeHint, formatDelta, formatMaybe } from "../coaching/bodyMetrics";

// --- Breadcrumb 1 -----------------------------------------------------------
// CoachingPanel is a pure UI panel used inside Exercise Details (Option B).
// - Must tolerate: missing body metrics, missing history, missing coaching text
// - Does NOT own navigation or DB writes
// ---------------------------------------------------------------------------

/** Minimal shape (avoid import churn). Works with your Exercise type. */
type ExerciseLike = {
  id: string;
  name: string;
  bodyPart?: string;
  cuesSetup?: string[];
  cuesExecution?: string[];
  commonMistakes?: string[];
  summary?: string;
  directions?: string;
  videoUrl?: string;
};

type PerfLike = {
  sessionCount: number;
  historyRows: Array<{
    sessionId: string;
    dateLabel: string;
    templateName?: string;
    bestSetLabel?: string;
    bestE1rm?: number;
    totalVolume?: number;
    maxReps?: number;
  }>;
  records: {
    bestE1rm?: number;
    bestE1rmLabel?: string;
    bestWeight?: number;
    bestWeightLabel?: string;
    bestSessionVolume?: number;
    bestSessionVolumeLabel?: string;
    bestReps?: number;
    bestRepsLabel?: string;
  };
};

// --- Breadcrumb 2 -----------------------------------------------------------
// Small defensive helpers (keep them local; do not import churn)
// ---------------------------------------------------------------------------

function cleanStringArray(v: any): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean);
}

function textOrUndef(v: string): string | undefined {
  const s = (v ?? "").trim();
  return s ? s : undefined;
}

function StatPill({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card" style={{ padding: 10 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
        <div className="muted" style={{ fontSize: 12 }}>
          {label}
        </div>
        <div style={{ fontWeight: 900 }}>{value}</div>
      </div>
      {sub ? (
        <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
          {sub}
        </div>
      ) : null}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontWeight: 900, marginBottom: 8 }}>{children}</div>;
}

// --- Breadcrumb 3 -----------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export function CoachingPanel({ exercise, perf }: { exercise: ExerciseLike; perf: PerfLike }) {
  // Body metrics summary (sparse-safe). 56d default supports 28d + prior 28d.
  const bodySummary = useLiveQuery(async () => {
    return await getBodyMetricsSummary({ lookbackDays: 56 });
  }, []);

  const hint = useMemo(() => {
    if (!bodySummary?.hasAny) return "No body metrics yet. Add a few weigh-ins for cut feedback.";
    return getCutModeHint(bodySummary);
  }, [bodySummary]);

  const summary = textOrUndef(String((exercise as any).summary ?? ""));
  const directions = textOrUndef(String((exercise as any).directions ?? ""));
  const cs = cleanStringArray((exercise as any).cuesSetup);
  const ce = cleanStringArray((exercise as any).cuesExecution);
  const cm = cleanStringArray((exercise as any).commonMistakes);
  const videoUrl = textOrUndef(String((exercise as any).videoUrl ?? ""));

  // Body snapshot lines (only show what we can support)
  const bodyLines = useMemo(() => {
    if (!bodySummary?.hasAny) return [];

    const m = bodySummary.metrics;

    const line = (label: string, key: keyof typeof m, digits = 1, use28 = false) => {
      const s = (m as any)[key];
      if (!s) return null;

      const avg = use28 ? s.avg28d : s.avg7d;
      const delta = use28 ? s.delta28d : s.delta7d;
      const ok = use28 ? s.sufficient28d : s.sufficient7d;

      if (!ok || avg == null) return null;

      return {
        label,
        value: formatMaybe(avg as any, digits),
        delta: delta == null ? "—" : formatDelta(delta as any, digits),
      };
    };

    // 7d for weight & water; 28d for BF/SMM/VFI (more stable)
    const out = [
      line("Weight", "weightLb", 1, false),
      line("Body Fat %", "bodyFatPct", 2, true),
      line("SMM", "skeletalMuscleMassLb", 1, true),
      line("VFI", "visceralFatIndex", 2, true),
      line("Water %", "bodyWaterPct", 2, false),
    ].filter(Boolean) as Array<{ label: string; value: string; delta: string }>;

    return out;
  }, [bodySummary]);

  const latest = perf?.historyRows?.[0];

  const hasAnyCoaching =
    !!summary || !!directions || cs.length > 0 || ce.length > 0 || cm.length > 0 || !!videoUrl;

  return (
    <div className="card" style={{ padding: 12 }}>
      {/* ============================================================= */}
      {/* Coach verdict (cut-mode hint + body trends)                   */}
      {/* ============================================================= */}
      <div className="card" style={{ padding: 10, marginBottom: 10 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
          <div style={{ fontWeight: 900 }}>Coach</div>
          <span className="badge">Cut mode</span>
        </div>

        <div className="muted" style={{ marginTop: 6, fontSize: 13, lineHeight: 1.5 }}>
          {hint}
        </div>

        {bodyLines.length ? (
          <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
            <div className="muted" style={{ fontSize: 12 }}>
              Body snapshot (trends)
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              {bodyLines.map((x) => (
                <div key={x.label} className="row" style={{ justifyContent: "space-between", gap: 10 }}>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {x.label}
                  </div>
                  <div className="row" style={{ gap: 10, alignItems: "baseline" }}>
                    <div style={{ fontWeight: 900, fontSize: 13 }}>{x.value}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{x.delta}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>
            Not enough body data yet for trends (need a few entries per metric).
          </div>
        )}
      </div>

      {/* ============================================================= */}
      {/* Performance snapshot                                          */}
      {/* ============================================================= */}
      <div className="card" style={{ padding: 10, marginBottom: 10 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
          <SectionTitle>Performance</SectionTitle>
          <div className="muted" style={{ fontSize: 12 }}>
            {perf?.sessionCount ? `${perf.sessionCount} sessions` : "—"}
          </div>
        </div>

        {latest ? (
          <div className="muted" style={{ marginTop: 4, fontSize: 12 }}>
            Latest: <b>{latest.dateLabel}</b>
            {latest.templateName ? ` • ${latest.templateName}` : ""}
          </div>
        ) : (
          <div className="muted" style={{ marginTop: 4, fontSize: 12 }}>
            No completed sessions yet for this exercise.
          </div>
        )}

        <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
          <StatPill
            label="Best e1RM"
            value={perf?.records?.bestE1rm != null ? String(Math.round(perf.records.bestE1rm)) : "—"}
            sub={perf?.records?.bestE1rmLabel}
          />
          <StatPill
            label="Best set (max weight)"
            value={perf?.records?.bestWeight != null ? String(perf.records.bestWeight) : "—"}
            sub={perf?.records?.bestWeightLabel}
          />
          <StatPill
            label="Best session volume"
            value={perf?.records?.bestSessionVolume != null ? String(Math.round(perf.records.bestSessionVolume)) : "—"}
            sub={perf?.records?.bestSessionVolumeLabel}
          />
          <StatPill
            label="Max reps in a set"
            value={perf?.records?.bestReps != null ? String(perf.records.bestReps) : "—"}
            sub={perf?.records?.bestRepsLabel}
          />
        </div>
      </div>

      {/* ============================================================= */}
      {/* Coaching cues (Option B: cues are the star)                   */}
      {/* ============================================================= */}
      <div className="card" style={{ padding: 10 }}>
        <SectionTitle>Coaching</SectionTitle>

        {!hasAnyCoaching ? (
          <div className="muted" style={{ fontSize: 13 }}>
            No coaching yet. Add summary/cues in Edit.
          </div>
        ) : (
          <>
            {summary ? (
              <div className="card" style={{ padding: 10, marginBottom: 10 }}>
                <div style={{ fontWeight: 900, marginBottom: 6 }}>Summary</div>
                <div className="muted" style={{ whiteSpace: "pre-wrap" }}>
                  {summary}
                </div>
              </div>
            ) : null}

            {directions ? (
              <div className="card" style={{ padding: 10, marginBottom: 10 }}>
                <div style={{ fontWeight: 900, marginBottom: 6 }}>Directions</div>
                <div className="muted" style={{ whiteSpace: "pre-wrap" }}>
                  {directions}
                </div>
              </div>
            ) : null}

            {cs.length ? (
              <div className="card" style={{ padding: 10, marginBottom: 10 }}>
                <div style={{ fontWeight: 900, marginBottom: 6 }}>Cues — Setup</div>
                <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.55 }}>
                  {cs.map((c, i) => (
                    <li key={`cs-${i}`}>{c}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {ce.length ? (
              <div className="card" style={{ padding: 10, marginBottom: 10 }}>
                <div style={{ fontWeight: 900, marginBottom: 6 }}>Cues — Execution</div>
                <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.55 }}>
                  {ce.map((c, i) => (
                    <li key={`ce-${i}`}>{c}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {cm.length ? (
              <div className="card" style={{ padding: 10, marginBottom: 10 }}>
                <div style={{ fontWeight: 900, marginBottom: 6 }}>Common Mistakes</div>
                <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.55 }}>
                  {cm.map((c, i) => (
                    <li key={`cm-${i}`}>{c}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {videoUrl ? (
              <div className="card" style={{ padding: 10 }}>
                <div style={{ fontWeight: 900, marginBottom: 6 }}>Video</div>
                <div className="muted" style={{ wordBreak: "break-word" }}>
                  {videoUrl}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

/* ========================================================================== */
/*  END OF FILE — src/components/CoachingPanel.tsx                             */
/* ========================================================================== */