// /src/pages/GymPage.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import type { TemplateItem, Track, SetEntry } from "../db";
import { uuid } from "../utils";
import { getBestSessionLastNDays, suggestionFromBest } from "../progression";
import { computeAndStorePRsForSession } from "../prs";

// --- Breadcrumb 1 -----------------------------------------------------------
// GymPage.tsx (Execution / Logging)
// Goals (this iteration):
// 1) Single Finish Session control at bottom (remove top/original)
// 2) “ghost” placeholders for working sets (weight + reps) on compact screens
//    - show previous as placeholder (light gray) when current is empty
// 3) Keep logging stable + fast (no hook violations)
// 4) Guardrails: prevent obvious fat-finger errors (weight > 300, reps > 50)
// 5) RIR required for working sets (weightedReps) before you can check ✓
// 6) Finish gate + review list: block finishing when sets missing ✓ or missing RIR,
//    and allow tap-to-scroll to the exact row.
// 7) Green outline (ring) for completed WORKING rows.
// ---------------------------------------------------------------------------

// Local widening (so this file can evolve UI without requiring immediate db.ts changes)
type SetKind = "warmup" | "working" | "drop" | "failure";
type SetEntryX = SetEntry & {
  setType?: SetKind | string; // allow old values, future values
  completedAt?: number;
};

// --- Breadcrumb 2 (Helper: compact mode detect) ------------------------------
// "Mobile-like" behavior on small screens (iPhone/iPad/Android) using viewport,
// not brittle user-agent checks.
function useCompactMode(maxWidthPx: number = 520): boolean {
  const [compact, setCompact] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(`(max-width: ${maxWidthPx}px)`).matches;
  });

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(`(max-width: ${maxWidthPx}px)`);
    const onChange = () => setCompact(mq.matches);

    onChange();
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, [maxWidthPx]);

  return compact;
}

// --- Breadcrumb 3 (Helper: parse "135 x 10") --------------------------------
function parsePrev(prevText: string): { prevWeight?: number; prevReps?: number } {
  const t = (prevText || "").trim();
  if (!t) return {};
  const m = t.match(/^\s*([0-9]+(?:\.[0-9]+)?)\s*[x×]\s*([0-9]+)\s*$/i);
  if (!m) return {};
  const w = Number(m[1]);
  const r = Number(m[2]);
  return {
    prevWeight: Number.isFinite(w) ? w : undefined,
    prevReps: Number.isFinite(r) ? r : undefined,
  };
}

// --- Breadcrumb 4 (Helper: guardrails) --------------------------------------
const LIMITS = {
  maxWeight: 300,
  maxReps: 50,
};

function parseNum(v: string): number | undefined {
  const t = v.trim();
  if (!t) return undefined;
  const x = Number(t);
  return Number.isFinite(x) ? x : undefined;
}

export default function GymPageLegacy() {
  const { sessionId } = useParams();
  const nav = useNavigate();

  // --- Breadcrumb 5 (DB reads) ----------------------------------------------
  const session = useLiveQuery(
    () => (sessionId ? db.sessions.get(sessionId) : Promise.resolve(undefined)),
    [sessionId]
  );

  const templateItems = useLiveQuery(async () => {
    if (!session?.templateId) return [];
    return db.templateItems.where("templateId").equals(session.templateId).sortBy("orderIndex");
  }, [session?.templateId]);

  const trackIdsKey = useMemo(() => {
    const ids = (templateItems ?? []).map((i) => i.trackId);
    return ids.join("|");
  }, [templateItems]);

  const tracks = useLiveQuery(async () => {
    if (!templateItems || templateItems.length === 0) return [];
    const ids = templateItems.map((i) => i.trackId);
    const arr = await db.tracks.bulkGet(ids);
    return arr.filter(Boolean) as Track[];
  }, [trackIdsKey]);

  const sets = useLiveQuery(async () => {
    if (!sessionId) return [];
    return db.sets.where("sessionId").equals(sessionId).sortBy("createdAt");
  }, [sessionId]);

  // --- Breadcrumb 6 (UI state) ----------------------------------------------
  const [sessionNotes, setSessionNotes] = useState("");
  useEffect(() => {
    setSessionNotes(session?.notes ?? "");
  }, [session?.id]);

  const trackById = useMemo(() => new Map((tracks ?? []).map((t) => [t.id, t] as const)), [tracks]);

  // --- Breadcrumb 7 (Guards) -------------------------------------------------
  if (!sessionId) {
    return (
      <div className="card">
        <p className="muted">Missing session id.</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="card">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  // --- Breadcrumb 8 (Finish pipeline) ---------------------------------------
  async function finish() {
    const endedAt = Date.now();

    await db.sessions.update(sessionId, {
      notes: sessionNotes.trim() || undefined,
      endedAt,
    });

    const hits = await computeAndStorePRsForSession(sessionId);
    await db.sessions.update(sessionId, { prsJson: JSON.stringify(hits ?? []) });

    if (session?.templateId) {
      await db.templates.update(session.templateId, { lastPerformedAt: endedAt } as any);
    }

    nav(`/complete/${sessionId}`);
  }

  // --- Breadcrumb 9 (Render) ------------------------------------------------
  return (
    <div className="grid">
      {/* --- Gym Mode header card (NO Finish button here) --- */}
      <div className="card">
        <h2>Gym Mode</h2>

        <div className="kv">
          <span>Template</span>
          <span>
            <b>{session.templateName ?? "Ad-hoc"}</b>
          </span>
        </div>

        <div className="kv">
          <span>Started</span>
          <span>{new Date(session.startedAt).toLocaleString()}</span>
        </div>

        <hr />

        <label>Session notes (optional)</label>
        <textarea className="input" rows={3} value={sessionNotes} onChange={(e) => setSessionNotes(e.target.value)} />

        <hr />

        <button className="btn" onClick={() => nav("/history")}>
          Back to history
        </button>
      </div>

      {/* --- Exercise cards --- */}
      {(templateItems ?? []).map((item) => {
        const track = trackById.get(item.trackId);
        if (!track) return null;

        return (
          <div key={item.id} id={`track-${track.id}`}>
            <ExerciseCard sessionId={sessionId} item={item} track={track} sets={(sets ?? []) as SetEntryX[]} />
          </div>
        );
      })}

      {/* --- Single Finish control at very bottom --- */}
      <FinishSessionCard
        sessionId={sessionId}
        tracks={(tracks ?? []) as Track[]}
        sets={(sets ?? []) as SetEntryX[]}
        onFinish={finish}
      />
    </div>
  );
}

// --- Breadcrumb 10 ----------------------------------------------------------
// ExerciseCard: unified set table + W/D/F + completion + timer
// Adds: compact-screen ghost placeholders (working sets only)
// Adds: RIR required to complete working sets (weightedReps)
// Adds: Guardrails on write (reject > max rather than silently clamp)
// ---------------------------------------------------------------------------
function ExerciseCard({
  sessionId,
  item,
  track,
  sets,
}: {
  sessionId: string;
  item: TemplateItem;
  track: Track;
  sets: SetEntryX[];
}) {
  const repMin = item.repMinOverride ?? track.repMin;
  const repMax = item.repMaxOverride ?? track.repMax;

  const warmupTarget = item.warmupSetsOverride ?? track.warmupSetsDefault;
  const workingTarget = item.workingSetsOverride ?? track.workingSetsDefault;

  const [restSec, setRestSec] = useState<number>(120);
  const timer = useRestTimer();

  // compact mode computed once per ExerciseCard
  const compact = useCompactMode();

  // IMPORTANT: do NOT mutate Dexie objects during render; normalize via copies.
  const currentSets = useMemo(() => {
    const arr = (sets ?? [])
      .filter((s) => s.trackId === track.id)
      .slice()
      .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));

    return arr.map((s) => {
      const raw = String((s as any).setType ?? "");
      const setType: SetKind =
        raw === "warmup" || raw === "working" || raw === "drop" || raw === "failure" ? (raw as SetKind) : "working";
      return { ...s, setType };
    });
  }, [sets, track.id]);

  const workingIndexById = useMemo(() => {
    const map = new Map<string, number>();
    let n = 0;
    for (const s of currentSets) {
      if (s.setType === "working") {
        n += 1;
        map.set(s.id, n);
      }
    }
    return map;
  }, [currentSets]);

  const prev = usePrevByWorkingIndex(sessionId, track.id);

  const [bestSummary, setBestSummary] = useState<string>("");
  const [suggestion, setSuggestion] = useState<string>("");
  const [prefillWeight, setPrefillWeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    let alive = true;

    (async () => {
      if (track.trackType === "corrective") {
        if (!alive) return;
        setBestSummary("");
        setSuggestion("Complete this corrective (does not affect progression).");
        setPrefillWeight(undefined);
        return;
      }

      const best = await getBestSessionLastNDays(track.id, 5);
      const res = suggestionFromBest(track, repMin, repMax, workingTarget, best);

      if (!alive) return;
      setBestSummary(res.summary);
      setSuggestion(res.suggestion);
      setPrefillWeight(res.prefillWeight);
    })();

    return () => {
      alive = false;
    };
  }, [track.id, track.trackType, repMin, repMax, workingTarget, (track as any).weightJumpDefault, track.rirTargetMin]);

  // --- Breadcrumb 10a (DB writes with guardrails) ----------------------------
  async function updateSet(id: string, patch: Partial<SetEntryX>) {
    // Reject obvious fat-finger values rather than silently clamping.
    if ("weight" in patch) {
      const w = patch.weight as any;
      if (w !== undefined && w !== null && Number.isFinite(w) && w > LIMITS.maxWeight) {
        window.alert(`Max weight is ${LIMITS.maxWeight}. Did you accidentally append reps to weight?`);
        return;
      }
      if (w !== undefined && w !== null && Number.isFinite(w) && w < 0) patch.weight = 0 as any;
    }

    if ("reps" in patch) {
      const r = patch.reps as any;
      if (r !== undefined && r !== null && Number.isFinite(r) && r > LIMITS.maxReps) {
        window.alert(`Max reps is ${LIMITS.maxReps}. Did you accidentally type the wrong field?`);
        return;
      }
      if (r !== undefined && r !== null && Number.isFinite(r) && r < 0) patch.reps = 0 as any;
    }

    if ("rir" in patch) {
      const v = patch.rir as any;
      if (v === undefined || v === null) {
        patch.rir = undefined;
      } else if (!Number.isFinite(v)) {
        patch.rir = undefined;
      } else {
        patch.rir = Math.max(0, v) as any;
      }
    }

    await db.sets.update(id, patch as any);
  }

  async function addSet() {
    const id = uuid();
    const createdAt = Date.now();

    const lastWorkingLike = [...currentSets].reverse().find((s) => s.setType !== "warmup");

    const entry: SetEntryX = {
      id,
      sessionId,
      trackId: track.id,
      createdAt,
      setType: "working",
    };

    if (track.trackingMode === "weightedReps") {
      if (lastWorkingLike?.weight !== undefined) entry.weight = lastWorkingLike.weight;
      else if (prefillWeight !== undefined) entry.weight = prefillWeight;
    }

    await db.sets.add(entry as any);
  }

  async function deleteSet(id: string) {
    await db.sets.delete(id);
  }

  function restLabel(seconds: number) {
    const mm = String(Math.floor(seconds / 60));
    const ss = String(seconds % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  }

  const addLabel = timer.running ? restLabel(timer.remainingSec) : restLabel(restSec);

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ marginBottom: 6 }}>{track.displayName}</h3>

          {track.trackType !== "corrective" && track.trackingMode === "weightedReps" && (
            <div className="muted">
              Rep range:{" "}
              <b>
                {repMin}–{repMax}
              </b>{" "}
              <span className="badge green" style={{ marginLeft: 8 }}>
                {track.trackType}
              </span>
              <span className="badge" style={{ marginLeft: 8 }}>
                targets WU {warmupTarget} / WK {workingTarget}
              </span>
            </div>
          )}

          {track.trackType === "corrective" && (
            <div className="muted">
              <span className="badge">corrective</span> • mode {track.trackingMode}
            </div>
          )}

          {item.notes && (
            <div className="muted" style={{ marginTop: 6 }}>
              {item.notes}
            </div>
          )}

          {track.trackType !== "corrective" && bestSummary && (
            <div className="muted" style={{ marginTop: 6 }}>
              {bestSummary}
            </div>
          )}

          {/* You were computing suggestion but not showing it */}
          {track.trackType !== "corrective" && suggestion && (
            <div className="muted" style={{ marginTop: 6 }}>
              {suggestion}
            </div>
          )}
        </div>
      </div>

      <hr />

      <div className="set-table">
        <div className="set-head">
          <div>Set</div>
          <div>Previous</div>
          <div>Lbs</div>
          <div>Reps</div>
          <div>RIR</div>
          <div>✓</div>
          <div></div>
        </div>

        {currentSets.length ? (
          currentSets.map((se) => {
            const done = !!se.completedAt;

            const label =
              se.setType === "warmup"
                ? "W"
                : se.setType === "drop"
                ? "D"
                : se.setType === "failure"
                ? "F"
                : String(workingIndexById.get(se.id) ?? "");

            const workingIndex = workingIndexById.get(se.id);
            const prevText = se.setType === "working" && workingIndex ? prev.get(workingIndex) ?? "" : "";
            const prevParsed = se.setType === "working" && workingIndex ? parsePrev(prevText) : {};

            return (
              <SetRow
                key={se.id}
                rowDomId={`set-${se.id}`}
                se={se}
                label={label}
                prevText={prevText}
                prevParsed={prevParsed}
                track={track}
                done={done}
                compact={compact}
                onChange={updateSet}
                onDelete={deleteSet}
                onSetType={async (t) => {
                  const patch: Partial<SetEntryX> = { setType: t };
                  if (t === "failure") patch.rir = 0;
                  await updateSet(se.id, patch);
                }}
                onToggleDone={async (next) => {
                  // Enforce RIR for WORKING sets in weightedReps
                  const kind = ((se.setType as SetKind) ?? "working") as SetKind;
                  const isWorking = kind === "working";
                  if (
                    next &&
                    isWorking &&
                    track.trackingMode === "weightedReps" &&
                    track.trackType !== "corrective" &&
                    (se.rir === undefined || se.rir === null)
                  ) {
                    window.alert("Enter RIR before checking this working set.");
                    return;
                  }

                  if (next) {
                    const patch: Partial<SetEntryX> = { completedAt: Date.now() };
                    if (kind === "failure") patch.rir = 0;
                    await updateSet(se.id, patch);

                    if (kind !== "warmup") timer.start(restSec);
                  } else {
                    await updateSet(se.id, { completedAt: undefined });
                  }
                }}
                // Tap-to-accept previous (working sets only)
                onAcceptPrevWeight={() => {
                  const kind = ((se.setType as SetKind) ?? "working") as SetKind;
                  if (kind !== "working") return;
                  if (se.weight === undefined && prevParsed.prevWeight !== undefined) {
                    updateSet(se.id, { weight: prevParsed.prevWeight });
                  }
                }}
                onAcceptPrevReps={() => {
                  const kind = ((se.setType as SetKind) ?? "working") as SetKind;
                  if (kind !== "working") return;
                  if (se.reps === undefined && prevParsed.prevReps !== undefined) {
                    updateSet(se.id, { reps: prevParsed.prevReps });
                  }
                }}
              />
            );
          })
        ) : (
          <div className="muted" style={{ padding: "10px 2px" }}>
            No sets logged yet.
          </div>
        )}

        <div className="set-add-row">
          <button className="btn small primary" onClick={addSet}>
            + Add Set <span className="muted">({addLabel})</span>
          </button>

          <div className="row" style={{ gap: 8 }}>
            <button className="btn small" onClick={() => setRestSec((s) => Math.max(15, s - 15))}>
              −15s
            </button>
            <button className="btn small" onClick={() => setRestSec((s) => s + 15)}>
              +15s
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Breadcrumb 11 ----------------------------------------------------------
// SetRow (clean row)
// Adds:
// - compact ghost placeholders (WORKING only)
// - focus weight/reps to accept prev value (WORKING only)
// - checkbox locks row; uncheck unlocks row
// - completed WORKING sets get green outline (ring) via inline style
// ---------------------------------------------------------------------------
function SetRow({
  rowDomId,
  se,
  label,
  prevText,
  prevParsed,
  track,
  done,
  compact,
  onChange,
  onDelete,
  onSetType,
  onToggleDone,
  onAcceptPrevWeight,
  onAcceptPrevReps,
}: {
  rowDomId: string;
  se: SetEntryX;
  label: string;
  prevText: string;
  prevParsed: { prevWeight?: number; prevReps?: number };
  track: Track;
  done: boolean;
  compact: boolean;
  onChange: (id: string, patch: Partial<SetEntryX>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onSetType: (t: SetKind) => Promise<void>;
  onToggleDone: (next: boolean) => Promise<void>;
  onAcceptPrevWeight: () => void;
  onAcceptPrevReps: () => void;
}) {
  const selectRef = useRef<HTMLSelectElement | null>(null);

  function openTypePicker() {
    selectRef.current?.focus();
    selectRef.current?.click();
  }

  const kind = (se.setType as SetKind) ?? "working";
  const isWorking = kind === "working";
  const locked = done;

  const ghostWeight =
    compact && isWorking && se.weight === undefined && prevParsed.prevWeight !== undefined
      ? String(prevParsed.prevWeight)
      : "lbs";

  const ghostReps =
    compact && isWorking && se.reps === undefined && prevParsed.prevReps !== undefined ? String(prevParsed.prevReps) : "reps";

  const rowClass = "set-row" + (done ? " done" : "") + (kind === "warmup" ? " warmup" : "");

  // Green outline for completed WORKING sets only
  const ringStyle: React.CSSProperties =
    done && isWorking
      ? {
          outline: "2px solid rgba(22,163,74,0.55)",
          outlineOffset: "2px",
          borderRadius: 12,
        }
      : {};

  return (
    <div id={rowDomId} className={rowClass} style={ringStyle}>
      <div className="set-badge-wrap">
        <button className="set-badge" type="button" onClick={openTypePicker} title="Set type" disabled={locked}>
          {label}
        </button>

        <select
          ref={selectRef}
          className="set-type-select"
          value={kind}
          onChange={(e) => onSetType(e.target.value as SetKind)}
          aria-label="Set type"
          disabled={locked}
        >
          <option value="working">Working (1/2/3…)</option>
          <option value="warmup">W • Warm-up</option>
          <option value="drop">D • Drop</option>
          <option value="failure">F • Failure</option>
        </select>
      </div>

      <div className="prev-cell">{prevText || "—"}</div>

      {track.trackingMode === "weightedReps" && (
        <>
          <input
            className="cell-input"
            placeholder={ghostWeight}
            value={se.weight ?? ""}
            inputMode="decimal"
            onChange={(e) => onChange(se.id, { weight: parseNum(e.target.value) })}
            onFocus={() => {
              if (compact && isWorking && !locked) onAcceptPrevWeight();
            }}
            disabled={locked}
          />
          <input
            className="cell-input"
            placeholder={ghostReps}
            value={se.reps ?? ""}
            inputMode="numeric"
            onChange={(e) => onChange(se.id, { reps: parseNum(e.target.value) })}
            onFocus={() => {
              if (compact && isWorking && !locked) onAcceptPrevReps();
            }}
            disabled={locked}
          />
          <input
            className="cell-input"
            placeholder="rir"
            value={se.rir ?? ""}
            inputMode="decimal"
            onChange={(e) => onChange(se.id, { rir: parseNum(e.target.value) })}
            disabled={locked || kind === "failure"}
          />
        </>
      )}

      {track.trackingMode === "repsOnly" && (
        <>
          <div className="muted">—</div>
          <input
            className="cell-input"
            placeholder="reps"
            value={se.reps ?? ""}
            inputMode="numeric"
            onChange={(e) => onChange(se.id, { reps: parseNum(e.target.value) })}
            disabled={locked}
          />
          <div className="muted">—</div>
        </>
      )}

      {track.trackingMode === "timeSeconds" && (
        <>
          <div className="muted">—</div>
          <input
            className="cell-input"
            placeholder="seconds"
            value={(se as any).seconds ?? ""}
            inputMode="numeric"
            onChange={(e) => onChange(se.id, { seconds: parseNum(e.target.value) } as any)}
            disabled={locked}
          />
          <div className="muted">—</div>
        </>
      )}

      {track.trackingMode === "breaths" && (
        <>
          <div className="muted">—</div>
          <input
            className="cell-input"
            placeholder="breaths"
            value={se.reps ?? ""}
            inputMode="numeric"
            onChange={(e) => onChange(se.id, { reps: parseNum(e.target.value) })}
            disabled={locked}
          />
          <div className="muted">—</div>
        </>
      )}

      {track.trackingMode === "checkbox" && (
        <>
          <div className="muted">—</div>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={(se.reps ?? 0) === 1}
              onChange={(e) => onChange(se.id, { reps: e.target.checked ? 1 : 0 })}
              disabled={locked}
            />
            Done
          </label>
          <div className="muted">—</div>
        </>
      )}

      <div className="check-cell">
        <input type="checkbox" checked={done} onChange={(e) => onToggleDone(e.target.checked)} aria-label="Complete set" />
      </div>

      <div className="row-actions">
        <button className="btn small" onClick={() => onDelete(se.id)} title="Delete set" disabled={locked}>
          ✕
        </button>
      </div>
    </div>
  );
}

// --- Breadcrumb 12 ----------------------------------------------------------
// FinishSessionCard (single bottom-only finish)
//
// Updated Behavior:
// - Hide all warnings/review by default
// - On "Finish session" click:
//    - If OK -> call onFinish()
//    - If NOT OK -> reveal warnings + tappable review list (tap to jump)
// - Rule 2 (RIR): ONLY for non-corrective + weightedReps + completed working sets
// ---------------------------------------------------------------------------
function FinishSessionCard({
  sessionId,
  tracks,
  sets,
  onFinish,
}: {
  sessionId: string;
  tracks: Track[];
  sets: SetEntryX[];
  onFinish: () => Promise<void>;
}) {
  const nav = useNavigate();

  // --- Breadcrumb 12.1 (UI state: hide review until user tries to finish) ---
  const [showReview, setShowReview] = useState(false);

  // --- Breadcrumb 12.2 (Track lookup) ---------------------------------------
  const trackById = useMemo(() => new Map(tracks.map((t) => [t.id, t] as const)), [tracks]);
  const trackNameById = useMemo(() => new Map(tracks.map((t) => [t.id, t.displayName] as const)), [tracks]);

  // --- Breadcrumb 12.3 (Compute problems) -----------------------------------
  const review = useMemo(() => {
    const working = (sets ?? []).filter((s) => (((s.setType as SetKind) ?? "working") as SetKind) === "working");

    const unchecked = working.filter((s) => !s.completedAt);

    // Rule 2: require RIR only for NON-corrective + weightedReps, and only if checked
    const missingRir = working.filter((s) => {
      if (!s.completedAt) return false;

      const tr = trackById.get(s.trackId);
      if (!tr) return false;

      if (tr.trackType === "corrective") return false;
      if (tr.trackingMode !== "weightedReps") return false;

      return s.rir === undefined || s.rir === null || String(s.rir).trim() === "";
    });

    const problems = [
      ...unchecked.map((s) => ({
        kind: "unchecked" as const,
        setId: s.id,
        trackId: s.trackId,
        label: "Not checked",
      })),
      ...missingRir.map((s) => ({
        kind: "missingRir" as const,
        setId: s.id,
        trackId: s.trackId,
        label: "Missing RIR",
      })),
    ];

    return {
      uncheckedCount: unchecked.length,
      missingRirCount: missingRir.length,
      problems,
      canFinish: problems.length === 0,
    };
  }, [sets, trackById]);

  // --- Breadcrumb 12.4 (Scroll helper) --------------------------------------
  function scrollToSet(setId: string, trackId: string) {
    const row = document.getElementById(`set-${setId}`);
    if (row) {
      row.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const card = document.getElementById(`track-${trackId}`);
    card?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // --- Breadcrumb 12.5 (Click handler: finish-or-reveal) --------------------
  async function onClickFinish() {
    if (review.canFinish) {
      await onFinish();
      return;
    }
    // reveal only when user tries to finish
    setShowReview(true);
  }

  return (
    <div className="card">
      <h3 style={{ marginBottom: 6 }}>Finish</h3>

      {/* Hidden until Finish is clicked */}
      {showReview && !review.canFinish && (
        <>
          <div className="muted" style={{ marginBottom: 10 }}>
            {review.uncheckedCount > 0 && <div>• {review.uncheckedCount} working set(s) not checked</div>}
            {review.missingRirCount > 0 && <div>• {review.missingRirCount} completed working set(s) missing RIR</div>}
          </div>

          {review.problems.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div className="muted" style={{ marginBottom: 6 }}>
                Review (tap to jump):
              </div>

              <div className="list" style={{ gap: 6 }}>
                {review.problems.slice(0, 12).map((p) => (
                  <div
                    key={`${p.kind}-${p.setId}`}
                    className="card clickable"
                    style={{ padding: "8px 10px" }}
                    onClick={() => scrollToSet(p.setId, p.trackId)}
                  >
                    <div className="kv">
                      <span>
                        <b>{trackNameById.get(p.trackId) ?? "Exercise"}</b>
                      </span>
                      <span className="muted">{p.label}</span>
                    </div>
                  </div>
                ))}

                {review.problems.length > 12 && (
                  <div className="muted" style={{ padding: "0 2px" }}>
                    +{review.problems.length - 12} more…
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      <div className="row" style={{ justifyContent: "space-between" }}>
        {/* NOTE: no longer disabled — click reveals problems instead */}
        <button className="btn primary" onClick={onClickFinish} title={review.canFinish ? "Finish session" : "Tap to review issues"}>
          Finish session
        </button>

        <button className="btn" onClick={() => nav("/history")}>
          Back to history
        </button>
      </div>
    </div>
  );
}

// --- Breadcrumb 13 (Helpers) ------------------------------------------------
// Per-exercise rest timer
function useRestTimer() {
  const [running, setRunning] = useState(false);
  const [remainingSec, setRemainingSec] = useState(0);

  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => {
      setRemainingSec((s) => {
        if (s <= 1) {
          setRunning(false);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(t);
  }, [running]);

  function start(seconds: number) {
    setRemainingSec(Math.max(0, Math.floor(seconds)));
    setRunning(true);
  }

  return { running, remainingSec, start };
}

// --- Breadcrumb 14 (Helpers) ------------------------------------------------
// Previous session’s same exercise + same working-set index
function usePrevByWorkingIndex(currentSessionId: string, trackId: string) {
  const data = useLiveQuery(async () => {
    const recent = (await db.sets.where("trackId").equals(trackId).reverse().sortBy("createdAt")) as SetEntryX[];

    const sessionIds = Array.from(new Set(recent.map((s) => s.sessionId).filter((sid) => sid !== currentSessionId))).slice(0, 30);

    if (!sessionIds.length) return { prevSessionId: undefined as string | undefined, prevSets: [] as SetEntryX[] };

    const sessions = (await db.sessions.bulkGet(sessionIds)).filter(Boolean) as any[];
    const ended = sessions
      .filter((s) => typeof s.endedAt === "number")
      .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0));

    if (!ended.length) return { prevSessionId: undefined as string | undefined, prevSets: [] as SetEntryX[] };

    const prevSessionId = ended[0].id as string;

    const prevSets = recent
      .filter((s) => s.sessionId === prevSessionId)
      .slice()
      .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));

    return { prevSessionId, prevSets };
  }, [currentSessionId, trackId]);

  const map = useMemo(() => {
    const m = new Map<number, string>();
    if (!data?.prevSets?.length) return m;

    let idx = 0;
    for (const s of data.prevSets) {
      const st = ((s.setType as SetKind) ?? "working") as SetKind;
      if (st === "working") {
        idx += 1;
        const wt = (s as any).weight;
        const reps = (s as any).reps;
        if (wt !== undefined && reps !== undefined) m.set(idx, `${wt} x ${reps}`);
      }
    }
    return m;
  }, [data?.prevSets]);

  return map;
}
