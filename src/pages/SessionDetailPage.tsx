// /src/pages/SessionDetailPage.tsx
/* ============================================================================
   SessionDetailPage.tsx — Session Review (Strong-ish, calm) — SET-DRIVEN VIEW
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-02-28-SESS-DETAIL-04
   FILE: src/pages/SessionDetailPage.tsx

   What changed (this iteration)
   ✅ FIX: Render exercises from SETS (truth) instead of templateItems/sessionItems (plan)
      - Imported sessions with sets now show correctly even if templates are incomplete.
      - If a template/sessionItems exist, we use them for ordering + "planned" display.
   ✅ FIX: trackingMode normalization
      - DB may store: "weight_reps" | "reps_only" | "time_seconds" etc.
      - UI expects: weightedReps | repsOnly | timeSeconds | breaths | checkbox
   ✅ Keep calm Warmups toggle (default OFF)
   ✅ Keep breadcrumbs + docs + footer (file path)

   Version history
   - 2026-02-23  SESS-DETAIL-01  Baseline session detail
   - 2026-02-23  SESS-DETAIL-02  Performance header, hide warmups, table nits
   - 2026-02-23  SESS-DETAIL-03  Warmups toggle + breadcrumbs + doc boundaries
   - 2026-02-28  SESS-DETAIL-04  SET-DRIVEN rendering + trackingMode normalize (import-safe)
   ============================================================================ */

import React, { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db, TemplateItem, SessionItem, Track, SetEntry } from "../db";
import {
  isBodyweightEffectiveLoadExerciseName,
} from "../strength/Strength";
import {
  normalizeTrackingMode,
  type CanonTrackingMode,
} from "../domain/trackingMode";
import { safeParsePrsCount } from "../lib/safeParsePrsCount";
import { computeSessionTotalLifted } from "../lib/sessionTotalLifted";

/* =============================================================================
   Breadcrumb 0 — Types
   ============================================================================= */

type SetBuckets = {
  warmup: SetEntry[];
  working: SetEntry[];
  drop: SetEntry[];
  failure: SetEntry[];
};

type PlannedItem = {
  id: string;
  orderIndex: number;
  trackId: string;
  notes?: string;
};

/* =============================================================================
   Breadcrumb 1 — Formatting helpers
   ============================================================================= */

function fmtDayDate(ms?: number) {
  if (!ms) return "—";
  try {
    const d = new Date(ms);
    return d.toLocaleDateString(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

function fmtDuration(startedAt?: number, endedAt?: number) {
  if (!startedAt || !endedAt) return "—";
  const ms = Math.max(0, endedAt - startedAt);
  const mins = Math.round(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m}m`;
  if (m <= 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function fmtTotal(n: number) {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 10000) return `${Math.round(n / 1000)}k`;
  return `${Math.round(n)}`;
}


/* =============================================================================
   Breadcrumb 1b — trackingMode normalization (IMPORT-SAFE)
   ============================================================================= */

function inferDisplayMode(
  track: Track,
  rows: SetEntry[],
  weightEntryContextName: string
): CanonTrackingMode {
  const normalized = normalizeTrackingMode((track as any).trackingMode);

  const hasSeconds = rows.some(
    (se) => se.seconds !== undefined && se.seconds !== null
  );

  const hasPositiveWeight = rows.some(
    (se) =>
      se.weight !== undefined &&
      se.weight !== null &&
      Number.isFinite(se.weight) &&
      se.weight > 0
  );

  const hasLoggedBodyweightWeight = isBodyweightEffectiveLoadExerciseName(weightEntryContextName)
    ? rows.some(
        (se) =>
          se.weight !== undefined &&
          se.weight !== null &&
          Number.isFinite(se.weight) &&
          se.reps !== undefined &&
          se.reps !== null
      )
    : false;

  const hasReps = rows.some(
    (se) => se.reps !== undefined && se.reps !== null
  );

  // Let actual row data win over stale track metadata.
  if (hasSeconds) return "timeSeconds";
  if ((hasPositiveWeight || hasLoggedBodyweightWeight) && hasReps) return "weightedReps";
  if (hasReps) return "repsOnly";

  return normalized;
}







/* =============================================================================
   Breadcrumb 2 — Component: SessionDetailPage (screen)
   ============================================================================= */

const PAGE_VERSION = "4";
const BUILD_ID = "2026-02-28-SESS-DETAIL-04";
const FILE_FOOTER = "src/pages/SessionDetailPage.tsx";

export default function SessionDetailPage() {
  /* ---------------------------------------------------------------------------
     Breadcrumb 2a — Routing + local UI state
     --------------------------------------------------------------------------- */
  const { sessionId } = useParams();
  const nav = useNavigate();

  // Calm warmup toggle (default OFF)
  const [showWarmups, setShowWarmups] = useState<boolean>(false);

  /* ---------------------------------------------------------------------------
     Breadcrumb 2b — Data loading (Dexie)
     --------------------------------------------------------------------------- */
  const session = useLiveQuery(
    () => (sessionId ? db.sessions.get(sessionId) : Promise.resolve(undefined)),
    [sessionId]
  );

  // sessionItems (preferred “plan” when present)
  const sessionItems = useLiveQuery(async () => {
    if (!sessionId) return [];
    const t = (db as any).sessionItems;
    if (!t || typeof t.where !== "function") return [];
    return t.where("sessionId").equals(sessionId).sortBy("orderIndex");
  }, [sessionId]);

  // templateItems (fallback plan)
  const templateItems = useLiveQuery(async () => {
    if (!session?.templateId) return [];
    const t = (db as any).templateItems;
    if (!t || typeof t.where !== "function") return [];
    return t.where("templateId").equals(session.templateId).sortBy("orderIndex");
  }, [session?.templateId]);

  // ✅ Truth source: sets in this session
  const sets = useLiveQuery(async () => {
    if (!sessionId) return [];
    return db.sets.where("sessionId").equals(sessionId).sortBy("createdAt");
  }, [sessionId]);

  /* ---------------------------------------------------------------------------
     Breadcrumb 2c — Build "planned items" (if any)
     --------------------------------------------------------------------------- */
  const plannedItems: PlannedItem[] = useMemo(() => {
    const si = sessionItems ?? [];
    if (si.length) {
      return si.map((i: SessionItem) => ({
        id: i.id,
        orderIndex: i.orderIndex,
        trackId: i.trackId,
        notes: i.notes,
      }));
    }

    const ti = templateItems ?? [];
    return ti.map((i: TemplateItem) => ({
      id: i.id,
      orderIndex: i.orderIndex,
      trackId: i.trackId,
      notes: i.notes,
    }));
  }, [sessionItems, templateItems]);

  /* ---------------------------------------------------------------------------
     Breadcrumb 2d — Build "set-driven tracks" (always)
     - If template is incomplete, we still show tracks that have sets.
     --------------------------------------------------------------------------- */
  const setDrivenTrackIds = useMemo(() => {
    const s = sets ?? [];
    if (!s.length) return [] as string[];

    // preserve a stable order: first appearance by createdAt
    const firstSeen = new Map<string, number>();
    for (const se of s) {
      if (!firstSeen.has(se.trackId)) firstSeen.set(se.trackId, se.createdAt ?? 0);
    }
    return [...firstSeen.entries()]
      .sort((a, b) => a[1] - b[1])
      .map(([trackId]) => trackId);
  }, [sets]);

  /* ---------------------------------------------------------------------------
     Breadcrumb 2e — Merge plan + truth into final render order
     Rules:
     1) Start with planned items (if any) in their orderIndex order
     2) Append any set-driven trackIds that are NOT in the plan
     3) If there is NO plan, just render set-driven
     --------------------------------------------------------------------------- */
  const renderTrackIds = useMemo(() => {
    const planned = plannedItems ?? [];
    const planIds = planned.map((p) => p.trackId);
    const planSet = new Set(planIds);

    const merged: string[] = [];

    // 1) planned first
    for (const id of planIds) merged.push(id);

    // 2) append set-driven extras
    for (const id of setDrivenTrackIds) {
      if (!planSet.has(id)) merged.push(id);
    }

    // 3) if nothing planned and nothing set-driven
    return merged;
  }, [plannedItems, setDrivenTrackIds]);

  /* ---------------------------------------------------------------------------
     Breadcrumb 2f — Load tracks for render list
     --------------------------------------------------------------------------- */
  const tracks = useLiveQuery(async () => {
    if (!renderTrackIds.length) return [];
    const arr = await db.tracks.bulkGet(renderTrackIds);
    return arr.filter(Boolean) as Track[];
  }, [renderTrackIds.join("|")]);

  const trackById = useMemo(() => new Map((tracks ?? []).map((t) => [t.id, t])), [tracks]);

  const exercises = useLiveQuery(async () => {
    const ids = Array.from(new Set((tracks ?? []).map((t) => t.exerciseId).filter(Boolean)));
    if (!ids.length) return [];
    const arr = await db.exercises.bulkGet(ids);
    return arr.filter(Boolean) as any[];
  }, [tracks?.map((t) => t.exerciseId).join("|") ?? ""]);

  const exerciseById = useMemo(() => new Map((exercises ?? []).map((e: any) => [e.id, e])), [exercises]);

  const bodyMetrics = useLiveQuery(async () => {
    const table = (db as any).bodyMetrics;
    if (!table || typeof table.toArray !== "function") return [];
    return (await table.toArray()) as any[];
  }, []);

  /* ---------------------------------------------------------------------------
     Breadcrumb 2g — Bucket sets by trackId
     --------------------------------------------------------------------------- */
  const setsByTrack = useMemo(() => {
    const map = new Map<string, SetBuckets>();
    for (const se of sets ?? []) {
      const g =
        map.get(se.trackId) ?? ({ warmup: [], working: [], drop: [], failure: [] } as SetBuckets);

      if (se.setType === "warmup") g.warmup.push(se);
      else if (se.setType === "drop") g.drop.push(se);
      else if (se.setType === "failure") g.failure.push(se);
      else g.working.push(se);

      map.set(se.trackId, g);
    }
    return map;
  }, [sets]);

  /* ---------------------------------------------------------------------------
     Breadcrumb 2h — Session summary stats
     --------------------------------------------------------------------------- */
  const summary = useMemo(() => {
    const dur = fmtDuration(session?.startedAt, session?.endedAt);
    const total = computeSessionTotalLifted({
      sets: sets ?? [],
      sessionAt: Number(session?.endedAt ?? session?.startedAt),
      trackById,
      exerciseById,
      bodyMetrics: bodyMetrics ?? [],
    });

    const prs = safeParsePrsCount(session?.prsJson);
    return { dur, total, prs };
  }, [session?.startedAt, session?.endedAt, session?.prsJson, sets, trackById, exerciseById, bodyMetrics]);

  /* ---------------------------------------------------------------------------
     Breadcrumb 2i — Guards
     --------------------------------------------------------------------------- */
  if (!sessionId) {
    return (
      <div className="card" data-testid="session-detail-missing">
        <p className="muted">Missing session id.</p>
        <button className="btn" onClick={() => nav("/history")}>
          Back to history
        </button>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="card" data-testid="session-detail-loading">
        <p className="muted">Loading…</p>
        <button className="btn" onClick={() => nav("/history")}>
          Back to history
        </button>
      </div>
    );
  }

  const title = session.templateName ?? "Session";
  const dateLine = fmtDayDate(session.startedAt);

  // Helpful debug counts (for import troubleshooting)
  const plannedCount = plannedItems.length;
  const setDrivenCount = setDrivenTrackIds.length;
  const renderCount = renderTrackIds.length;

  return (
    <div className="grid" data-testid="session-detail">
      {/* --------------------------------------------------------------------
         Breadcrumb 3 — Sticky header + actions + warmup toggle
         -------------------------------------------------------------------- */}
      <div
        className="card"
        data-testid="session-summary"
        style={{
          position: "sticky",
          top: 12,
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
          <div>
            <h2 style={{ margin: 0 }} data-testid="session-title">
              {title}
            </h2>
            <div className="muted" style={{ marginTop: 4 }} data-testid="session-date">
              {dateLine}
            </div>

            {/* Stats row */}
            <div
              style={{
                display: "flex",
                gap: 14,
                flexWrap: "wrap",
                marginTop: 10,
              }}
              data-testid="session-stats"
            >
              <span className="muted" data-testid="session-duration">
                ⏱ {summary.dur}
              </span>
              <span className="muted" data-testid="session-total-lifted">
                🏋️ {fmtTotal(summary.total)} lb
              </span>
              <span className="muted" data-testid="session-prs">
                🏆 {summary.prs} PR{summary.prs === 1 ? "" : "s"}
              </span>
            </div>

            {/* Import/debug line (quiet but useful) */}
            <div className="muted" style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
              Render sources: planned={plannedCount} • setTracks={setDrivenCount} • showing={renderCount}
            </div>
          </div>

          {/* Actions + calm warmups toggle */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button className="btn" onClick={() => nav("/history")} data-testid="back-to-history">
              Back to history
            </button>
            <button className="btn" onClick={() => nav(`/gym/${sessionId}`)} data-testid="open-gym-mode">
              Open in Gym Mode
            </button>

            <button
              className="btn small"
              type="button"
              onClick={() => setShowWarmups((v) => !v)}
              aria-pressed={showWarmups}
              data-testid="toggle-warmups"
              style={{
                opacity: 0.72,
                borderRadius: 999,
                paddingLeft: 12,
                paddingRight: 12,
              }}
              title="Toggle warm-up visibility"
            >
              Warmups: {showWarmups ? "On" : "Off"}
            </button>
          </div>
        </div>

        <hr />
        <label>Session notes</label>
        <div className="input" style={{ minHeight: 54, whiteSpace: "pre-wrap" }} data-testid="session-notes">
          {session.notes ?? <span className="muted">No notes.</span>}
        </div>
      </div>

      {/* --------------------------------------------------------------------
         Breadcrumb 4 — Empty states
         -------------------------------------------------------------------- */}
      {renderTrackIds.length === 0 && (
        <div className="card" data-testid="session-no-exercises">
          <p className="muted">No exercises found for this session.</p>
          <p className="muted" style={{ marginTop: 6 }}>
            This usually means there are no sets yet AND no template/session items.
          </p>
        </div>
      )}

      {/* --------------------------------------------------------------------
         Breadcrumb 5 — Exercise cards (SET-DRIVEN)
         - We render tracks in renderTrackIds order (planned first, then set-driven extras).
         - Each track shows warmups (optional) + working (always).
         -------------------------------------------------------------------- */}
      {renderTrackIds.map((trackId) => {
        const track = trackById.get(trackId);
        if (!track) return null;

        const bucket = setsByTrack.get(track.id) ?? { warmup: [], working: [], drop: [], failure: [] };
        const workingRows = [...bucket.working, ...bucket.drop, ...bucket.failure];

        // Planned notes (if this track was in the plan)
        const planned = plannedItems.find((p) => p.trackId === track.id);

        // Flag: set-driven extra (not in plan)
        const isExtra = planned ? false : plannedItems.length > 0;

        return (
          <div key={track.id} className="card" data-testid={`exercise-card:${track.id}`}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                <h3 style={{ marginTop: 0, marginBottom: 0 }} data-testid={`exercise-name:${track.id}`}>
                  {track.displayName}
                </h3>
                {isExtra && (
                  <span
                    className="muted"
                    style={{
                      fontSize: 12,
                      border: "1px solid var(--line)",
                      padding: "2px 8px",
                      borderRadius: 999,
                      opacity: 0.9,
                    }}
                    title="This exercise has sets, but it isn't in the template/session plan for this workout."
                  >
                    imported
                  </span>
                )}
              </div>

              <span className="muted" style={{ whiteSpace: "nowrap" }} data-testid={`exercise-mode:${track.id}`}>
                {track.trackType}
              </span>
            </div>

            {planned?.notes && (
              <div className="muted" style={{ marginTop: 6 }} data-testid={`exercise-notes:${track.id}`}>
                {planned.notes}
              </div>
            )}

            <hr />

            {/* ================================================================
               Breadcrumb 6 — WHERE I RENDER SETS
               - Warmups: rendered only when showWarmups === true
               - Working: always rendered (working + drop + failure)
               ================================================================ */}
            <div data-testid={`exercise-sets:${track.id}`}>
              {showWarmups && (
                <div
                  className="card"
                  data-testid={`warmup-block:${track.id}`}
                  style={{
                    marginBottom: 10,
                    padding: 12,
                  }}
                >
                  <div className="muted" style={{ marginBottom: 8 }}>
                    Warm-up
                  </div>
                  {bucket.warmup.length ? (
                    <ReadOnlySetTable
                      track={track}
                      exerciseName={String(exerciseById.get(track.exerciseId)?.name ?? "")}
                      rows={bucket.warmup}
                      tableTestId={`warmup-table:${track.id}`}
                    />
                  ) : (
                    <p className="muted" style={{ margin: 0 }}>
                      No warm-up sets.
                    </p>
                  )}
                </div>
              )}

                            {workingRows.length ? (
	                      <ReadOnlySetTable
	                        track={track}
	                        exerciseName={String(exerciseById.get(track.exerciseId)?.name ?? "")}
	                        rows={workingRows}
	                        tableTestId={`working-table:${track.id}`}
	                      />
	                    ) : showWarmups && bucket.warmup.length ? (
	                      <p className="muted">Warm-up only.</p>
	                    ) : (
	                      <p className="muted">No logged sets.</p>
              )}
            </div>
          </div>
        );
      })}

      {/* Breadcrumb 7 — Footer */}
      <div className="muted" style={{ marginBottom: 20, fontSize: 12 }}>
        {FILE_FOOTER} • v{PAGE_VERSION} • {BUILD_ID}
      </div>
    </div>
  );
}

/* =============================================================================
   Breadcrumb 8 — Component: ReadOnlySetTable
   Single place where row cells are rendered.
   ============================================================================= */

function ReadOnlySetTable({
  track,
  exerciseName,
  rows,
  tableTestId,
}: {
  track: Track;
  exerciseName: string;
  rows: SetEntry[];
  tableTestId?: string;
}) {
    const weightEntryContextName = [exerciseName, track.displayName].filter(Boolean).join(" ").trim();
    const mode = inferDisplayMode(track, rows, weightEntryContextName);

  const headers: string[] = (() => {
    switch (mode) {
      case "weightedReps":
        return ["Weight", "Reps", "RIR"];
      case "repsOnly":
        return ["Reps"];
      case "timeSeconds":
        return ["Seconds"];
      case "breaths":
        return ["Breaths"];
      case "checkbox":
        return ["Done"];
      default:
        // Safe fallback for unknown modes
        return ["Weight", "Reps", "RIR"];
    }
  })();

  function cellAlign(h: string) {
    if (h === "Weight" || h === "Reps" || h === "RIR" || h === "Seconds" || h === "Breaths") return "right";
    return "left";
  }

  function renderCells(se: SetEntry) {
    const badge = se.setType === "drop" ? "DROP" : se.setType === "failure" ? "FAIL" : undefined;

    switch (mode) {
            case "weightedReps": {
	      const hasLoggedWeight =
	        typeof se.weight === "number" &&
	        Number.isFinite(se.weight);
	    
	      const w = hasLoggedWeight ? (se.weight === 0 ? "BW" : se.weight) : "BW";
	    
	      const r =
	        se.reps !== undefined && se.reps !== null
	          ? se.reps
	          : "—";
	    
	      const rir =
	        (se as any).rir !== undefined && (se as any).rir !== null
	          ? (se as any).rir
	          : "—";
	    
	      return (
	        <>
	          <td style={{ textAlign: "right" }} data-testid={`set-weight:${se.id}`}>
	            {w}
	          </td>
	          <td style={{ textAlign: "right" }} data-testid={`set-reps:${se.id}`}>
	            {r}
	            {badge && (
	              <span
	                className="muted"
	                style={{
	                  marginLeft: 8,
	                  fontSize: 12,
	                  border: "1px solid var(--line)",
	                  padding: "2px 6px",
	                  borderRadius: 999,
	                  verticalAlign: "middle",
	                }}
	                data-testid={`set-badge:${se.id}`}
	              >
	                {badge}
	              </span>
	            )}
	          </td>
	          <td style={{ textAlign: "right" }} data-testid={`set-rir:${se.id}`}>
	            {rir}
	          </td>
	        </>
	      );
             }

      case "repsOnly":
        return (
          <td style={{ textAlign: "right" }} data-testid={`set-reps:${se.id}`}>
            {se.reps ?? "—"}
          </td>
        );

      case "timeSeconds":
        return (
          <td style={{ textAlign: "right" }} data-testid={`set-seconds:${se.id}`}>
            {se.seconds ?? "—"}
          </td>
        );

      case "breaths":
        return (
          <td style={{ textAlign: "right" }} data-testid={`set-breaths:${se.id}`}>
            {se.reps ?? "—"}
          </td>
        );

      case "checkbox":
        return <td data-testid={`set-done:${se.id}`}>{(se.reps ?? 0) === 1 ? "Yes" : "No"}</td>;

            default:
	      return (
	        <>
	          <td style={{ textAlign: "right" }}>
	            {typeof se.weight === "number" &&
	             Number.isFinite(se.weight) &&
	             se.weight > 0
	              ? se.weight
	              : "BW"}
	          </td>
	          <td style={{ textAlign: "right" }}>
	            {se.reps !== undefined && se.reps !== null ? se.reps : "—"}
	          </td>
	          <td style={{ textAlign: "right" }}>
	            {(se as any).rir !== undefined && (se as any).rir !== null
	              ? (se as any).rir
	              : "—"}
	          </td>
	        </>
              );
    }
  }

  return (
    <table className="table" style={{ width: "100%" }} data-testid={tableTestId ?? "set-table"}>
      <thead>
        <tr>
          {headers.map((h) => (
            <th key={h} style={{ textAlign: cellAlign(h) }}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((se) => (
          <tr
            key={se.id}
            data-testid={`set-row:${se.id}`}
            style={{
              borderTop: "1px solid var(--line)",
            }}
          >
            {renderCells(se)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
