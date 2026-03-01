// /src/pages/GymPage.tsx
/* ============================================================================
   GymPage.tsx — Execution / Logging (Strong-ish)
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-02-22-GYM-CANCEL-01

   Version history
   - 2026-02-11  GP-01  Baseline Gym Mode execution + sets + finish pipeline
   - 2026-02-14  GP-02  SetRow refinements + iPhone/compact ghost placeholders
   - 2026-02-17  GP-03  Finish gate review list (tap-to-jump), RIR rule, green ring
   - 2026-02-19  GP-04  Rest timer banner (per-exercise card) + timer controls
   - 2026-02-22  GP-05  Cues modal (Strong-style) + ✅ DB wired cuesSetup/cuesExecution
   - 2026-02-22  GP-06  ✅ Copy cues to clipboard + ✅ Edit in catalog deep-link
   - 2026-02-22  GP-07  ✅ Cancel session (delete sets + session) next to Finish
   ============================================================================
*/

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
// 5) RIR required for working sets (weightedReps) before you can finish
// 6) Finish gate + review list: block finishing when sets missing ✓ or missing RIR,
//    and allow tap-to-scroll to the exact row.
// 7) Green outline (ring) for completed WORKING rows.
// 8) ✅ Cancel session next to Finish (deletes sets + session; no PRs; no template lastPerformedAt)
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

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to legacy attempt
  }

  // Legacy fallback
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "true");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export default function GymPage() {
  const { sessionId } = useParams();
  const nav = useNavigate();

   // --- Breadcrumb 5 (DB reads) ----------------------------------------------
   const session = useLiveQuery(
     () => (sessionId ? db.sessions.get(sessionId) : Promise.resolve(undefined)),
     [sessionId]
   );
   
   // ✅ Plan source:
   // - Prefer sessionItems if table exists and has rows (import-safe)
   // - Fallback to templateItems
   const sessionItems = useLiveQuery(async () => {
     if (!sessionId) return [];
     const t = (db as any).sessionItems;
     if (!t || typeof t.where !== "function") return [];
     return t.where("sessionId").equals(sessionId).sortBy("orderIndex");
   }, [sessionId]);
   
   const templateItems = useLiveQuery(async () => {
     if (!session?.templateId) return [];
     return db.templateItems.where("templateId").equals(session.templateId).sortBy("orderIndex");
   }, [session?.templateId]);
   
   // ✅ Truth: sets are always authoritative (single declaration)
   const sets = useLiveQuery(async () => {
     if (!sessionId) return [];
     return db.sets.where("sessionId").equals(sessionId).sortBy("createdAt");
   }, [sessionId]);
   
   // ✅ planned items = sessionItems (if any) else templateItems
   const plannedItems = useMemo(() => {
     const si = (sessionItems ?? []) as any[];
     if (si.length) return si;
     return (templateItems ?? []) as any[];
   }, [sessionItems, templateItems]);
   
   // ✅ set-driven track ids (stable order by first appearance)
   const setDrivenTrackIds = useMemo(() => {
     const s = (sets ?? []) as SetEntryX[];
     if (!s.length) return [] as string[];
   
     const firstSeen = new Map<string, number>();
     for (const se of s) {
       if (!firstSeen.has(se.trackId)) firstSeen.set(se.trackId, se.createdAt ?? 0);
     }
   
     return [...firstSeen.entries()]
       .sort((a, b) => a[1] - b[1])
       .map(([trackId]) => trackId);
   }, [sets]);
   
   // ✅ renderTrackIds = planned order first, then any set-tracks not in the plan
   const renderTrackIds = useMemo(() => {
     const planIds = (plannedItems ?? []).map((p: any) => String(p.trackId));
     const planSet = new Set(planIds);
   
     const merged: string[] = [];
     for (const id of planIds) merged.push(id);
     for (const id of setDrivenTrackIds) if (!planSet.has(id)) merged.push(id);
   
     return merged;
   }, [plannedItems, setDrivenTrackIds]);
   
   const trackIdsKey = useMemo(() => renderTrackIds.join("|"), [renderTrackIds]);
   
   const tracks = useLiveQuery(async () => {
     if (!renderTrackIds.length) return [];
     const arr = await db.tracks.bulkGet(renderTrackIds);
     return arr.filter(Boolean) as Track[];
}, [trackIdsKey]);

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

  // --- Breadcrumb 8b (Cancel pipeline) --------------------------------------
  async function cancelSession() {
    const ok = window.confirm(
      "Cancel this session?\n\nThis will delete all logged sets and remove the session from history."
    );
    if (!ok) return;

    try {
      // Keep it simple: delete sets then the session.
      await db.sets.where("sessionId").equals(sessionId).delete();
      await db.sessions.delete(sessionId);

      // Go back to history (recommended mental model).
      nav("/history");
    } catch (err: any) {
      window.alert(err?.message || "Cancel failed. Please try again.");
    }
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
        <textarea
          className="input"
          rows={3}
          value={sessionNotes}
          onChange={(e) => setSessionNotes(e.target.value)}
        />

        <hr />

        <button className="btn" onClick={() => nav("/history")}>
          Back to history
        </button>
      </div>

      {/* --- Exercise cards (plan + set-driven) --- */}
      {(() => {
        const planArr = (plannedItems ?? []) as any[];

        // Map of planned item by trackId (for overrides/notes when present)
        const planByTrackId = new Map<string, any>();
        for (const it of planArr) planByTrackId.set(String(it.trackId), it);

        return (renderTrackIds ?? []).map((trackId) => {
          const tid = String(trackId);
          const track = trackById.get(tid);
          if (!track) return null;

          const planned = planByTrackId.get(tid);

          // If this track came from sets (not in plan), synthesize a minimal item.
          const item =
            planned ??
            ({
              id: `adhoc-${tid}`,
              trackId: tid,
              orderIndex: 9999,
              notes: undefined,
            } as any);

          return (
            <div key={String(item.id ?? tid)} id={`track-${track.id}`}>
              <ExerciseCard
                sessionId={sessionId}
                item={item as any}
                track={track}
                sets={(sets ?? []) as SetEntryX[]}
              />
            </div>
          );
        });
      })()}

      {/* --- Single Finish control at very bottom --- */}
      <FinishSessionCard
        sessionId={sessionId}
        tracks={(tracks ?? []) as Track[]}
        sets={(sets ?? []) as SetEntryX[]}
        onFinish={finish}
        onCancel={cancelSession}
      />
    </div>
  );
}

// --- Breadcrumb 10 ----------------------------------------------------------
// ExerciseCard: unified set table + W/D/F + completion + timer banner + cues modal
// Adds: compact-screen ghost placeholders (working sets only)
// Adds: RIR recommended for working sets (weightedReps) before you can finish
// Adds: Guardrails on write (reject > max rather than silently clamp)
// ✅ Rest timer banner appears at bottom of THIS exercise card
//    - Starts ONLY when you check a NON-warmup set
//    - Shows countdown + -15/+15 + Skip
// ✅ Cues modal (Strong-style full screen takeover)
//    - Per-track (title uses track.displayName)
//    - ✅ DB wired: pulls cuesSetup/cuesExecution from Exercise / Variant
//    - ✅ Copy cues to clipboard
//    - ✅ Deep-link to Exercises page to edit cues
// ✅ MetricMode-aware logging:
//    - reps: weight + reps (+ RIR for weightedReps)
//    - distance: distance + unit (optionally weight for weighted movements)
//    - time: mm:ss (stored as seconds)
// ✅ Spacing polish (Strong-ish):
//    - tighter row height + header alignment
//    - explicit grid columns so distance unit stays inline
// ---------------------------------------------------------------------------
function ExerciseCard({
  sessionId,
  item,
  track,
  sets,
}: {
  sessionId: string;
  item: any;
  track: Track;
  sets: SetEntryX[];
}) {
  const nav = useNavigate();

  const repMin = item?.repMinOverride ?? track.repMin;
  const repMax = item?.repMaxOverride ?? track.repMax;

  const warmupTarget = item?.warmupSetsOverride ?? track.warmupSetsDefault;
  const workingTarget = item?.workingSetsOverride ?? track.workingSetsDefault;

  // ✅ TIMER STATE (per-exercise)
  const [restSec, setRestSec] = useState<number>(120);
  const timer = useRestTimer();

  // Cues modal state
  const [showCues, setShowCues] = useState<boolean>(false);

  // compact mode computed once per ExerciseCard
  const compact = useCompactMode();

  // ------------------------------------------------------------
  // ✅ DB READ: Exercise + Variant (for cues + metricMode)
  // - Prefer variant cues if present; otherwise fall back to exercise cues.
  // ------------------------------------------------------------
  const exercise = useLiveQuery(async () => {
    return await db.exercises.get(track.exerciseId);
  }, [track.exerciseId]);

  const variant = useLiveQuery(async () => {
    const vid = (track as any).variantId as string | undefined;
    if (!vid) return undefined;
    return await db.exerciseVariants.get(vid);
  }, [(track as any).variantId]);

  // ✅ Metric mode (reps | distance | time). Defaults to reps.
  const metricMode = useMemo(() => {
    const m = (exercise as any)?.metricMode;
    return m === "distance" || m === "time" ? m : "reps";
  }, [exercise]);

  function cleanCueArray(v: any): string[] {
    if (!Array.isArray(v)) return [];
    return v
      .map((x) => (typeof x === "string" ? x.trim() : ""))
      .filter(Boolean);
  }

  function cleanText(v: any): string | undefined {
    if (typeof v !== "string") return undefined;
    const s = v.trim();
    return s ? s : undefined;
  }

  // cues: variant first, then exercise, then legacy fields if any
  const cuesSetup = useMemo(() => {
    const v = cleanCueArray((variant as any)?.cuesSetup);
    if (v.length) return v;

    const e = cleanCueArray((exercise as any)?.cuesSetup);
    if (e.length) return e;

    // legacy fallback (if something older exists)
    const legacy = cleanCueArray((exercise as any)?.cues);
    return legacy.length ? legacy : [];
  }, [exercise, variant]);

  const cuesExecution = useMemo(() => {
    const v = cleanCueArray((variant as any)?.cuesExecution);
    if (v.length) return v;

    const e = cleanCueArray((exercise as any)?.cuesExecution);
    if (e.length) return e;

    // legacy fallback (if something older exists)
    const legacy = cleanCueArray((exercise as any)?.cues);
    return legacy.length ? legacy : [];
  }, [exercise, variant]);

  const summary = useMemo(
    () => cleanText((variant as any)?.summary) ?? cleanText((exercise as any)?.summary),
    [exercise, variant]
  );
  const directions = useMemo(
    () => cleanText((variant as any)?.directions) ?? cleanText((exercise as any)?.directions),
    [exercise, variant]
  );

  const commonMistakes = useMemo(() => {
    const v = cleanCueArray((variant as any)?.commonMistakes);
    if (v.length) return v;
    return cleanCueArray((exercise as any)?.commonMistakes);
  }, [exercise, variant]);

  const cuesHasAnything =
    cuesSetup.length > 0 || cuesExecution.length > 0 || !!summary || !!directions || (commonMistakes?.length ?? 0) > 0;

  const variantName = useMemo(() => cleanText((variant as any)?.name), [variant]);

  function buildCuesClipboardText(): string {
    const lines: string[] = [];
    lines.push(track.displayName);
    if (variantName) lines.push(`Variant: ${variantName}`);
    lines.push("");

    if (summary) {
      lines.push("Summary");
      lines.push(summary);
      lines.push("");
    }

    if (directions) {
      lines.push("Directions");
      lines.push(directions);
      lines.push("");
    }

    if (cuesSetup.length) {
      lines.push("Setup cues");
      for (const c of cuesSetup) lines.push(`- ${c}`);
      lines.push("");
    }

    if (cuesExecution.length) {
      lines.push("Execution cues");
      for (const c of cuesExecution) lines.push(`- ${c}`);
      lines.push("");
    }

    if ((commonMistakes?.length ?? 0) > 0) {
      lines.push("Common mistakes");
      for (const c of commonMistakes) lines.push(`- ${c}`);
      lines.push("");
    }

    if (!cuesHasAnything) {
      lines.push("(No cues yet — add in Exercise Catalog and re-open.)");
      lines.push("");
    }

    return lines.join("\n").trim() + "\n";
  }

  async function onCopyCues() {
    const txt = buildCuesClipboardText();
    const ok = await copyTextToClipboard(txt);
    if (!ok) window.alert("Could not copy to clipboard in this browser.");
  }

  function onEditInCatalog() {
    // Deep-link so Exercises page can auto-open edit modal:
    // implement there with: const id = new URLSearchParams(location.search).get("edit")
    nav(`/exercises?edit=${encodeURIComponent(track.exerciseId)}&from=gym`);
  }

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

    // ✅ distance guardrail (fat-finger), if present
    if ("distance" in (patch as any)) {
      const d = (patch as any).distance as any;
      if (d !== undefined && d !== null && Number.isFinite(d) && d < 0) (patch as any).distance = 0;
      if (d !== undefined && d !== null && Number.isFinite(d) && d > 5000) {
        window.alert("Distance looks high (over 5000). Check units/entry.");
        return;
      }
    }

    if ("seconds" in (patch as any)) {
      const s = (patch as any).seconds as any;
      if (s !== undefined && s !== null && Number.isFinite(s) && s < 0) (patch as any).seconds = 0;
      if (s !== undefined && s !== null && Number.isFinite(s) && s > 60 * 60 * 4) {
        window.alert("Time looks high (over 4 hours). Check entry.");
        return;
      }
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

    // ✅ Prefill weight for loaded movements (reps OR distance), but not time-only.
    const wantsWeight = metricMode === "reps" || metricMode === "distance";

    if (wantsWeight && track.trackingMode === "weightedReps") {
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

  // ✅ Previous formatting helpers (time/distance)
  function formatMMSS(totalSeconds?: number): string {
    const s = Number(totalSeconds);
    if (!Number.isFinite(s) || s < 0) return "";
    const secs = Math.floor(s);
    const mm = Math.floor(secs / 60);
    const ss = secs % 60;
    return `${mm}:${String(ss).padStart(2, "0")}`;
  }

  function formatPrevForMode(se: SetEntryX, workingIndex?: number): string {
    if (se.setType !== "working" || !workingIndex) return "";

    // reps mode uses the existing prev map (weight x reps)
    if (metricMode === "reps") return prev.get(workingIndex) ?? "";

    // time mode: show previous duration (mm:ss) if we can
    if (metricMode === "time") {
      const sec = (se as any).seconds as number | undefined;
      return sec !== undefined ? formatMMSS(sec) : "";
    }

    // distance mode: show previous distance + unit (and weight if present on the row)
    const d = (se as any).distance as number | undefined;
    const u = ((se as any).distanceUnit as string | undefined) ?? "mi";
    const w = se.weight as number | undefined;

    if (d === undefined) return "";
    const distTxt = `${d} ${u}`;

    // Only include weight if the movement is weight-based
    if (track.trackingMode === "weightedReps" && w !== undefined) return `${w} lbs • ${distTxt}`;
    return distTxt;
  }

  // --- Breadcrumb 10b (Cues modal: ✅ DB wired + copy + edit link) -----------
  function CuesModal({
    open,
    title,
    onClose,
    setupCues,
    executionCues,
  }: {
    open: boolean;
    title: string;
    onClose: () => void;
    setupCues: string[];
    executionCues: string[];
  }) {
    // close on ESC
    useEffect(() => {
      if (!open) return;
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") onClose();
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    // lock background scroll while open
    useEffect(() => {
      if (!open) return;
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prevOverflow;
      };
    }, [open]);

    if (!open) return null;

    const hasSetup = Array.isArray(setupCues) && setupCues.length > 0;
    const hasExec = Array.isArray(executionCues) && executionCues.length > 0;
    const hasMistakes = (commonMistakes?.length ?? 0) > 0;

    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${title} cues`}
        className="modal-overlay"
        onMouseDown={(e) => {
          // outside click closes
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          className="modal-card card"
          style={{
            width: "min(980px, 100%)",
            maxHeight: "min(86vh, 760px)",
            overflow: "auto",
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <h3 style={{ margin: 0 }}>{title}</h3>
              <div className="muted" style={{ marginTop: 4 }}>
                Cues • Setup + Execution
                {variantName ? (
                  <span className="badge" style={{ marginLeft: 8 }}>
                    {variantName}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="row" style={{ gap: 8, alignItems: "center" }}>
              <button className="btn small" type="button" onClick={onCopyCues} title="Copy cues to clipboard">
                Copy
              </button>
              <button className="btn small" type="button" onClick={onEditInCatalog} title="Edit cues in Exercise Catalog">
                Edit
              </button>
              <button className="btn small" type="button" onClick={onClose}>
                Done
              </button>
            </div>
          </div>

          <hr />

          {!cuesHasAnything ? (
            <div className="card">
              <div style={{ fontWeight: 900, marginBottom: 6 }}>No cues yet</div>
              <div className="muted">
                Add cues in <b>Exercise Catalog</b> and re-open this modal.
              </div>
              <div className="row" style={{ marginTop: 10, gap: 8 }}>
                <button className="btn primary" onClick={onEditInCatalog}>
                  Open catalog
                </button>
                <button className="btn" onClick={onCopyCues} title="Copies a scaffold you can paste into notes/ChatGPT">
                  Copy scaffold
                </button>
              </div>
            </div>
          ) : (
            <>
              {summary ? (
                <div className="card" style={{ marginBottom: 10 }}>
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>Summary</div>
                  <div style={{ lineHeight: 1.55 }}>{summary}</div>
                </div>
              ) : null}

              {directions ? (
                <div className="card" style={{ marginBottom: 10 }}>
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>Directions</div>
                  <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{directions}</div>
                </div>
              ) : null}

              {hasSetup && (
                <div className="card" style={{ marginBottom: 10 }}>
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>Setup</div>
                  <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.55 }}>
                    {setupCues.map((c, i) => (
                      <li key={`setup-${i}`}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}

              {hasExec && (
                <div className="card" style={{ marginBottom: hasMistakes ? 10 : 0 }}>
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>Execution</div>
                  <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.55 }}>
                    {executionCues.map((c, i) => (
                      <li key={`exec-${i}`}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}

              {hasMistakes && (
                <div className="card">
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>Common mistakes</div>
                  <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.55 }}>
                    {commonMistakes.map((c, i) => (
                      <li key={`mist-${i}`}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  // ✅ Header labels and visibility
  const weightHeader = metricMode === "time" ? "—" : "Lbs";
  const midHeader = metricMode === "distance" ? "Dist" : metricMode === "time" ? "Time" : "Reps";
  const rirHeader = metricMode === "reps" && track.trackingMode === "weightedReps" ? "RIR" : "—";

  // ✅ Strong-ish table geometry (keeps distance unit on the same line)
  const cardScope = useMemo(() => `excard-${track.id}`, [track.id]);

  const gridTemplateColumns = useMemo(() => {
    // 7 columns: Set | Previous | Weight | Mid | RIR | ✓ | X
    // Keep “Mid” wider in distance mode so unit dropdown never wraps.
    if (metricMode === "distance") return "64px 1.4fr 96px 200px 56px 44px 44px";
    if (metricMode === "time") return "64px 1.4fr 56px 200px 56px 44px 44px";
    return "64px 1.4fr 110px 110px 70px 44px 44px";
  }, [metricMode]);

  return (
    <div className="card">
      {/* Local, scoped layout polish (no global CSS churn) */}
      <div data-excard-scope={cardScope}>
        <style>
          {`
            [data-excard-scope="${cardScope}"] .set-head,
            [data-excard-scope="${cardScope}"] .set-row{
              display: grid;
              grid-template-columns: ${gridTemplateColumns};
              column-gap: 10px;
              align-items: center;
            }

            /* tighter row height */
            [data-excard-scope="${cardScope}"] .set-row{
              padding: 10px 0;
            }

            /* header looks lighter + tighter */
            [data-excard-scope="${cardScope}"] .set-head{
              font-size: 13px;
              opacity: 0.75;
              padding: 6px 0 10px 0;
            }

            /* prevent inline “distance input + unit” from wrapping */
            [data-excard-scope="${cardScope}"] .set-row .row{
              flex-wrap: nowrap;
            }

            /* keep inputs compact inside grid */
            [data-excard-scope="${cardScope}"] .cell-input{
              min-width: 0;
            }
          `}
        </style>

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

            {track.trackType !== "corrective" && suggestion && (
              <div className="muted" style={{ marginTop: 6 }}>
                {suggestion}
              </div>
            )}

            {/* Cues trigger */}
            <div style={{ marginTop: 10 }} className="row">
              <button className="btn small" type="button" onClick={() => setShowCues(true)} aria-expanded={showCues}>
                Cues
                {cuesHasAnything ? null : (
                  <span className="badge" style={{ marginLeft: 8 }}>
                    empty
                  </span>
                )}
              </button>

              <button className="btn small" type="button" onClick={onCopyCues} title="Copy cues to clipboard">
                Copy
              </button>

              <button className="btn small" type="button" onClick={onEditInCatalog} title="Edit cues in Exercise Catalog">
                Edit
              </button>
            </div>

            {/* Modal mount */}
            <CuesModal
              open={showCues}
              title={track.displayName}
              onClose={() => setShowCues(false)}
              setupCues={cuesSetup}
              executionCues={cuesExecution}
            />
          </div>
        </div>

        <hr />

        <div className="set-table">
          <div className="set-head">
            <div>Set</div>
            <div>Previous</div>
            <div>{weightHeader}</div>
            <div>{midHeader}</div>
            <div>{rirHeader}</div>
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

              // ✅ Mode-aware Previous
              const prevText = se.setType === "working" && workingIndex ? formatPrevForMode(se, workingIndex) : "";

              // reps mode uses weight x reps parsing for ghost placeholders; otherwise blank
              const prevParsed =
                metricMode === "reps" && se.setType === "working" && workingIndex ? parsePrev(prevText) : {};

              return (
                <SetRow
                  key={se.id}
                  rowDomId={`set-${se.id}`}
                  se={se}
                  label={label}
                  prevText={prevText}
                  prevParsed={prevParsed}
                  track={track}
                  metricMode={metricMode}
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
                    // ✅ Don’t block checking when RIR is missing.
                    // Finishing is gated in FinishSessionCard (missingRir).
                    const kind = ((se.setType as SetKind) ?? "working") as SetKind;

                    if (next) {
                      const patch: Partial<SetEntryX> = { completedAt: Date.now() };
                      if (kind === "failure") patch.rir = 0;
                      await updateSet(se.id, patch);

                      // ✅ TIMER START (only for non-warmup sets)
                      if (kind !== "warmup") timer.start(restSec);
                    } else {
                      await updateSet(se.id, { completedAt: undefined });
                    }
                  }}
                  onAcceptPrevWeight={() => {
                    // Only relevant for reps-weighted and weight-prefill scenarios
                    const kind = ((se.setType as SetKind) ?? "working") as SetKind;
                    if (kind !== "working") return;
                    if (metricMode !== "reps") return;

                    if (se.weight === undefined && (prevParsed as any).prevWeight !== undefined) {
                      updateSet(se.id, { weight: (prevParsed as any).prevWeight });
                    }
                  }}
                  onAcceptPrevReps={() => {
                    const kind = ((se.setType as SetKind) ?? "working") as SetKind;
                    if (kind !== "working") return;
                    if (metricMode !== "reps") return;

                    if (se.reps === undefined && (prevParsed as any).prevReps !== undefined) {
                      updateSet(se.id, { reps: (prevParsed as any).prevReps });
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

          <div className="set-add-row" style={{ marginTop: 8 }}>
            <button className="btn small primary" onClick={addSet}>
              + Add Set
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

          {/* =========================================================
              ✅ TIMER UI (Option B)
              - Desktop: renders as a normal banner inside the card
              - Mobile: CSS docks it fixed at bottom of screen
             ========================================================= */}
          {timer.running && (
            <div className="rest-banner" role="status" aria-live="polite">
              <div className="rest-banner-inner">
                <div className="rest-banner__top">
                  <div style={{ minWidth: 0 }}>
                    <div className="rest-banner__title">{track.displayName}</div>
                    <div className="rest-banner__sub">
                      Rest • <b>{restLabel(timer.remainingSec)}</b>
                    </div>
                  </div>

                  <div className="rest-banner__actions">
                    <button className="btn small" onClick={() => timer.addSeconds(-15)}>
                      −15s
                    </button>
                    <button className="btn small" onClick={() => timer.addSeconds(15)}>
                      +15s
                    </button>
                    <button className="btn small" onClick={() => timer.stop()}>
                      Skip
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
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
// ✅ MetricMode-aware inputs:
//    - reps: weight + reps (+ RIR for weightedReps; existing behavior)
//    - distance: distance + unit (optionally weight for weighted movements), RIR hidden
//    - time: mm:ss input stored as seconds, RIR hidden
// ---------------------------------------------------------------------------
function SetRow({
  rowDomId,
  se,
  label,
  prevText,
  prevParsed,
  track,
  metricMode,
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
  metricMode: "reps" | "distance" | "time";
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

  // Local widening for distance without requiring immediate db.ts updates
  const distance = (se as any).distance as number | undefined;
  const distanceUnit = ((se as any).distanceUnit as string | undefined) ?? "mi"; // cardio-friendly default

  function formatMMSS(totalSeconds?: number): string {
    const s = Number(totalSeconds);
    if (!Number.isFinite(s) || s < 0) return "";
    const secs = Math.floor(s);
    const mm = Math.floor(secs / 60);
    const ss = secs % 60;
    return `${mm}:${String(ss).padStart(2, "0")}`;
  }

  function parseTimeToSeconds(input: string): number | undefined {
    const t = (input || "").trim();
    if (!t) return undefined;

    // Accept mm:ss
    const m = t.match(/^(\d+)\s*:\s*(\d{1,2})$/);
    if (m) {
      const mm = Number(m[1]);
      const ss = Number(m[2]);
      if (!Number.isFinite(mm) || !Number.isFinite(ss)) return undefined;
      return Math.max(0, mm * 60 + Math.min(59, ss));
    }

    // Accept seconds (numeric)
    const n = Number(t);
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : undefined;
  }

  const ghostWeight =
    compact && isWorking && se.weight === undefined && prevParsed.prevWeight !== undefined ? String(prevParsed.prevWeight) : "lbs";

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

  // Weight cell usage:
  // - reps mode: only when weightedReps (existing behavior)
  // - distance mode: show weight only when the track is actually weight-based (eg sled/prowler)
  // - time mode: hide weight by default
  const showWeightInDistance = track.trackingMode === "weightedReps";

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

      {/* -------------------------------------------------------------------
         REPS MODE (existing behavior preserved)
         ------------------------------------------------------------------- */}
      {metricMode === "reps" && (
        <>
          {track.trackingMode === "weightedReps" && (
            <>
              <input
                className="cell-input"
                name="weight"
                aria-label="weight"
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
                name="reps"
                aria-label="reps"
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
                placeholder="mm:ss"
                value={formatMMSS((se as any).seconds)}
                inputMode="text"
                onChange={(e) => onChange(se.id, { seconds: parseTimeToSeconds(e.target.value) } as any)}
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
        </>
      )}

      {/* -------------------------------------------------------------------
         DISTANCE MODE
         - Distance + Unit
         - Optional weight only when track is weight-based
         - RIR hidden
         ------------------------------------------------------------------- */}
      {metricMode === "distance" && (
        <>
          {showWeightInDistance ? (
            <input
              className="cell-input"
              name="weight"
              aria-label="weight"
              placeholder={ghostWeight}
              value={se.weight ?? ""}
              inputMode="decimal"
              onChange={(e) => onChange(se.id, { weight: parseNum(e.target.value) })}
              onFocus={() => {
                if (compact && isWorking && !locked) onAcceptPrevWeight();
              }}
              disabled={locked}
            />
          ) : (
            <div className="muted">—</div>
          )}

          <div className="row" style={{ gap: 6, alignItems: "center" }}>
            <input
              className="cell-input"
              name="distance"
              aria-label="distance"
              placeholder={compact ? "dist" : "distance"}
              value={distance ?? ""}
              inputMode="decimal"
              onChange={(e) => onChange(se.id, ({ distance: parseNum(e.target.value) } as any) as any)}
              disabled={locked}
              style={{ minWidth: 0 }}
            />

            <select
              className="cell-input"
              aria-label="distance unit"
              value={distanceUnit}
              onChange={(e) => onChange(se.id, ({ distanceUnit: e.target.value } as any) as any)}
              disabled={locked}
              style={{ width: 64, paddingLeft: 8, paddingRight: 8 }}
            >
              <option value="mi">mi</option>
              <option value="km">km</option>
              <option value="m">m</option>
            </select>
          </div>

          <div className="muted">—</div>
        </>
      )}

      {/* -------------------------------------------------------------------
         TIME MODE
         - Time as mm:ss stored to seconds
         - Weight hidden + RIR hidden
         ------------------------------------------------------------------- */}
      {metricMode === "time" && (
        <>
          <div className="muted">—</div>

          <input
            className="cell-input"
            name="time"
            aria-label="time"
            placeholder="mm:ss"
            value={formatMMSS((se as any).seconds)}
            inputMode="text"
            onChange={(e) => onChange(se.id, { seconds: parseTimeToSeconds(e.target.value) } as any)}
            disabled={locked}
          />

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
// - Rule 2 (RIR): ONLY for non-corrective + weightedReps + metricMode=reps + completed working sets
// - ✅ Cancel session button next to Finish (deletes sets + session)
// ---------------------------------------------------------------------------
function FinishSessionCard({
  sessionId,
  tracks,
  sets,
  onFinish,
  onCancel,
}: {
  sessionId: string;
  tracks: Track[];
  sets: SetEntryX[];
  onFinish: () => Promise<void>;
  onCancel: () => Promise<void>;
}) {
  const nav = useNavigate();

  // --- Breadcrumb 12.1 (UI state: hide review until user tries to finish) ---
  const [showReview, setShowReview] = useState(false);

  // --- Breadcrumb 12.2 (Track lookup) ---------------------------------------
  const trackById = useMemo(() => new Map(tracks.map((t) => [t.id, t] as const)), [tracks]);
  const trackNameById = useMemo(() => new Map(tracks.map((t) => [t.id, t.displayName] as const)), [tracks]);

  // --- Breadcrumb 12.2b (Exercise lookup for metricMode) --------------------
  // Back-compat: if exercises don't yet have metricMode, treat as "reps".
  const exerciseIdsKey = useMemo(() => {
    const ids = Array.from(new Set((tracks ?? []).map((t) => t.exerciseId).filter(Boolean)));
    return ids.join("|");
  }, [tracks]);

  const exerciseById = useLiveQuery(async () => {
    const ids = Array.from(new Set((tracks ?? []).map((t) => t.exerciseId).filter(Boolean)));
    if (!ids.length) return new Map<string, any>();
    const exArr = await db.exercises.bulkGet(ids as any);
    const m = new Map<string, any>();
    for (const ex of exArr) {
      if (ex && (ex as any).id) m.set((ex as any).id, ex);
    }
    return m;
  }, [exerciseIdsKey]);

  function metricModeForTrack(tr: Track): "reps" | "distance" | "time" {
    // Default to "reps" until DB + seeds are updated.
    const ex = exerciseById?.get(tr.exerciseId);
    const mm = (ex as any)?.metricMode;
    if (mm === "distance" || mm === "time" || mm === "reps") return mm;
    return "reps";
  }

  // --- Breadcrumb 12.3 (Compute problems) -----------------------------------
  const review = useMemo(() => {
    const working = (sets ?? []).filter((s) => (((s.setType as SetKind) ?? "working") as SetKind) === "working");

    const unchecked = working.filter((s) => !s.completedAt);

    // Rule 2: require RIR only for:
    // - completed sets
    // - NON-corrective tracks
    // - weightedReps mode
    // - metricMode === "reps" (distance/time shouldn't be blocked by RIR)
    const missingRir = working.filter((s) => {
      if (!s.completedAt) return false;

      const tr = trackById.get(s.trackId);
      if (!tr) return false;

      if (tr.trackType === "corrective") return false;
      if (tr.trackingMode !== "weightedReps") return false;

      const mm = metricModeForTrack(tr);
      if (mm !== "reps") return false;

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
  }, [sets, trackById, exerciseById]); // include exerciseById so metricMode updates re-compute

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

      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {/* Left group: Finish + Cancel adjacent */}
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <button
            className="btn primary"
            onClick={onClickFinish}
            title={review.canFinish ? "Finish session" : "Tap to review issues"}
          >
            Finish session
          </button>

          <button className="btn" onClick={onCancel} title="Cancel and delete this session">
            Cancel session
          </button>
        </div>

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

  // ✅ TIMER CONTROL: +/- seconds while running
  function addSeconds(delta: number) {
    setRemainingSec((s) => {
      const next = Math.max(0, Math.floor(s + delta));
      if (next === 0) setRunning(false);
      return next;
    });
  }

  // ✅ TIMER CONTROL: user can cancel/skip the timer
  function stop() {
    setRunning(false);
    setRemainingSec(0);
  }

  return { running, remainingSec, start, addSeconds, stop };
}

// --- Breadcrumb 14 (Helpers) ------------------------------------------------
// Previous session’s same exercise + same working-set index
// ✅ Supports reps (weight x reps), time (mm:ss), distance (dist + unit, optional weight)
// Note: Uses local widening via `any` so db.ts does not need immediate updates.
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

  function formatMMSS(totalSeconds?: number): string {
    const s = Number(totalSeconds);
    if (!Number.isFinite(s) || s < 0) return "";
    const secs = Math.floor(s);
    const mm = Math.floor(secs / 60);
    const ss = secs % 60;
    return `${mm}:${String(ss).padStart(2, "0")}`;
  }

  const map = useMemo(() => {
    const m = new Map<number, string>();
    if (!data?.prevSets?.length) return m;

    let idx = 0;

    for (const s of data.prevSets) {
      const st = ((s.setType as SetKind) ?? "working") as SetKind;
      if (st !== "working") continue;

      idx += 1;

      const wt = (s as any).weight as number | undefined;

      // reps
      const reps = (s as any).reps as number | undefined;
      if (wt !== undefined && reps !== undefined) {
        m.set(idx, `${wt} x ${reps}`);
        continue;
      }

      // time (seconds)
      const seconds = (s as any).seconds as number | undefined;
      if (seconds !== undefined) {
        const t = formatMMSS(seconds);
        if (t) m.set(idx, t);
        continue;
      }

      // distance
      const distance = (s as any).distance as number | undefined;
      const unit = ((s as any).distanceUnit as string | undefined) ?? "m";
      if (distance !== undefined) {
        const distTxt = `${distance} ${unit}`;
        if (wt !== undefined) m.set(idx, `${wt} lbs • ${distTxt}`);
        else m.set(idx, distTxt);
        continue;
      }

      // else: no mapping for this working index
    }

    return m;
  }, [data?.prevSets]);

  return map;
}