/// /src/pages/GymPage.tsx
/* ============================================================================
   GymPage.tsx — Execution / Logging (Strong-ish)
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-03-06-GYM-ADD-EXERCISE-01

   Version history
   - 2026-02-11  GP-01  Baseline Gym Mode execution + sets + finish pipeline
   - 2026-02-14  GP-02  SetRow refinements + iPhone/compact ghost placeholders
   - 2026-02-17  GP-03  Finish gate review list (tap-to-jump), RIR rule, green ring
   - 2026-02-19  GP-04  Rest timer banner (per-exercise card) + timer controls
   - 2026-02-22  GP-05  Cues modal (Strong-style) + DB wired cuesSetup/cuesExecution
   - 2026-02-22  GP-06  Copy cues to clipboard + Edit in catalog deep-link
   - 2026-02-22  GP-07  Cancel session (delete sets + session)
   - 2026-03-02  GP-08  Decimal RIR support (1.5 / 2.5 allowed)
   - 2026-03-06  GP-09  Loaded-reps hardening
   - 2026-03-06  GP-10  Add Exercise during active session
                      - searchable modal
                      - reuse/create track
                      - append sessionItem
                      - duplicate guard
   ============================================================================ */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import type {
  Track,
  SetEntry,
  Exercise,
  TrackType,
  TrackingMode,
} from "../db";
import { uuid } from "../utils";
import { getBestSessionLastNDays } from "../progression";
import { finalizeGymSessionWrites } from "../finalizeSession";
import { resolveExercise } from "../domain/exercises/exerciseResolver";
import { isBodyweightEffectiveLoadExerciseName } from "../strength/Strength";
import { getNextWorkingRecommendation } from "../domain/coaching/nextWorkingRecommendation";
import NumericPad from "../components/NumericPad";
import {
  createTrackVariant as createTrackVariantShared,
  findOrCreateExerciseByName as findOrCreateExerciseByNameShared,
  findOrCreateReusableTrack as findOrCreateReusableTrackShared,
} from "../lib/reusableTrackWorkflow";
import { isNonStrengthTrackType, isStrengthTrackType } from "../domain/trackingMode";

/* ============================================================================
   Breadcrumb 01 — Local widenings / UI-only types
   ============================================================================ */
type SetKind = "warmup" | "working" | "drop" | "failure";
type MetricModeX = "reps" | "distance" | "time";

type SetEntryX = SetEntry & {
  setType?: SetKind | string;
  completedAt?: number;
};

type CatalogGroup = {
  key: string;
  title: string;
  exercises: Exercise[];
};

type GymPadField = "weight" | "reps" | "rir";

type ActiveGymPad = {
  setId: string;
  rowDomId: string;
  field: GymPadField;
  title: string;
  decimalEnabled: boolean;
  allowsNegativeWeight: boolean;
  buffer: string;
  onCommit: (buffer: string) => Promise<void>;
  onDismiss: () => void;
  onNext: () => void;
};

/* ============================================================================
   Breadcrumb 02 — Shared helpers
   ============================================================================ */
function normalizeLoose(s: string) {
  return (s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function hasMeaningfulSetData(se: SetEntry | SetEntryX) {
  return (
    (typeof se.weight === "number" && Number.isFinite(se.weight)) ||
    (typeof se.reps === "number" && se.reps > 0) ||
    (typeof se.seconds === "number" && se.seconds > 0) ||
    (typeof se.distance === "number" && se.distance > 0) ||
    (typeof se.rir === "number" && Number.isFinite(se.rir)) ||
    (typeof se.completedAt === "number" && Number.isFinite(se.completedAt) && se.completedAt > 0)
  );
}

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

const LIMITS = {
  maxWeight: 300,
  maxReps: 50,
};

function parseNum(v: string): number | undefined {
  const t = (v ?? "").trim();
  if (!t) return undefined;
  const x = Number(t);
  return Number.isFinite(x) ? x : undefined;
}

function normalizeDecimalInput(raw: string): string {
  return (raw ?? "").replace(",", ".").trim();
}

function normalizeWeightInput(raw: string): string {
  const cleaned = (raw ?? "").replace(",", ".");
  const hadMinus = cleaned.includes("-");
  const base = cleaned.replace(/-/g, "").replace(/[^\d.]/g, "");
  return hadMinus ? `-${base}` : base;
}

function parseCommittedWeight(raw: string, allowNegative: boolean): number | undefined {
  const t = normalizeWeightInput(raw).trim();
  if (!t || t === "-") return undefined;
  if (/^-?\.\d+$/.test(t)) return Number(t.replace(/^-\./, "-0.").replace(/^\./, "0."));
  if (/^-?\d+\.$/.test(t)) return Number(t.slice(0, -1));
  const n = Number(t);
  if (!Number.isFinite(n)) return undefined;
  return allowNegative ? n : Math.max(0, n);
}

function parseTimeToSeconds(raw: string): number | undefined {
  const s = (raw ?? "").trim();
  if (!s) return undefined;

  const m = s.match(/^(\d{1,3})\s*:\s*(\d{1,2})$/);
  if (m) {
    const mins = Number(m[1]);
    const secs = Number(m[2]);
    if (!Number.isFinite(mins) || !Number.isFinite(secs)) return undefined;
    if (secs < 0 || secs > 59) return undefined;
    return Math.max(0, mins * 60 + secs);
  }

  if (!/^\d+$/.test(s)) return undefined;

  if (s.length === 3 || s.length === 4) {
    const mins = Number(s.slice(0, s.length - 2));
    const secs = Number(s.slice(-2));
    if (!Number.isFinite(mins) || !Number.isFinite(secs)) return undefined;
    if (secs > 59) return undefined;
    return Math.max(0, mins * 60 + secs);
  }

  const sec = Number(s);
  return Number.isFinite(sec) ? Math.max(0, Math.floor(sec)) : undefined;
}

function formatSecondsToMMSS(totalSeconds?: number): string {
  if (typeof totalSeconds !== "number" || !Number.isFinite(totalSeconds) || totalSeconds < 0) return "";
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through
  }

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

function isLoadedRepsTrack(track: Track, metricMode: MetricModeX): boolean {
  if (metricMode !== "reps") return false;
  if (track.trackType === "corrective") return false;

  if (track.trackingMode === "weightedReps") return true;
  if (track.trackingMode === "repsOnly") return isStrengthTrackType(track.trackType);
  return false;
}

function requiresRirForTrack(track: Track, metricMode: MetricModeX): boolean {
  return metricMode === "reps" && track.trackingMode === "weightedReps" && isStrengthTrackType(track.trackType);
}

const GYM_TRACK_INTENT_OPTIONS: Array<{
  value: TrackType;
  label: string;
  defaultMode: TrackingMode;
}> = [
  { value: "strength", label: "Strength", defaultMode: "weightedReps" },
  { value: "technique", label: "Technique", defaultMode: "weightedReps" },
  { value: "mobility", label: "Mobility", defaultMode: "repsOnly" },
  { value: "corrective", label: "Corrective", defaultMode: "repsOnly" },
  { value: "conditioning", label: "Conditioning", defaultMode: "timeSeconds" },
];

function defaultTrackingModeForIntent(trackType: TrackType): TrackingMode {
  return (
    GYM_TRACK_INTENT_OPTIONS.find((option) => option.value === trackType)?.defaultMode ??
    "weightedReps"
  );
}

function buildTrackDisplayNameForIntent(baseRaw: string, trackType: TrackType): string {
  const base = baseRaw.trim();
  if (!base) return "";
  if (trackType === "strength") return base;
  if (base.toLowerCase().includes(trackType)) return base;
  return `${base} - ${trackType}`;
}

function formatNextWorkingRecommendationText(rec: ReturnType<typeof getNextWorkingRecommendation>): string {
  if (rec.action === "hold" && rec.confidence === "low") return rec.rationale;

  const targetWeight =
    typeof rec.targetWeight === "number" && Number.isFinite(rec.targetWeight)
      ? `${Math.round(rec.targetWeight)} lb`
      : null;
  const targetReps =
    typeof rec.targetReps === "number" && Number.isFinite(rec.targetReps)
      ? `${Math.round(rec.targetReps)} reps`
      : null;

  const targetBits = [targetWeight, targetReps].filter(Boolean).join(" x ");
  if (!targetBits) return rec.rationale;

  return `${rec.rationale}. Next working target: ${targetBits}.`;
}

function formatBestSessionSummary(best: Awaited<ReturnType<typeof getBestSessionLastNDays>>): string {
  if (!best || typeof best.bestWeight !== "number" || typeof best.bestReps !== "number") {
    return "No recent baseline found.";
  }

  const endedTxt = best.endedAt ? ` on ${new Date(best.endedAt).toLocaleDateString()}` : "";
  return `Best in recent sessions: ${best.bestWeight} x ${best.bestReps}${endedTxt}.`;
}

function formatCompletedSetForCoachSnapshot(
  se: SetEntryX,
  track: Track,
  metricMode: MetricModeX
): string | null {
  if (!se.completedAt) return null;

  if (track.trackingMode === "weightedReps") {
    const parts: string[] = [];
    if (typeof se.weight === "number" && Number.isFinite(se.weight)) parts.push(String(se.weight));
    if (typeof se.reps === "number" && Number.isFinite(se.reps)) {
      if (parts.length) parts.push(`x ${se.reps}`);
      else parts.push(`${se.reps} reps`);
    }
    if (typeof se.rir === "number" && Number.isFinite(se.rir)) parts.push(`@${se.rir}`);
    return parts.length ? parts.join(" ") : "completed set";
  }

  if (track.trackingMode === "timeSeconds") {
    const timeText = formatSecondsToMMSS(se.seconds);
    return timeText ? `${timeText}` : "completed interval";
  }

  if (track.trackingMode === "breaths") {
    return typeof se.reps === "number" && Number.isFinite(se.reps) ? `${se.reps} breaths` : "completed breathing set";
  }

  if (track.trackingMode === "checkbox") {
    return (se.reps ?? 0) === 1 ? "completed" : null;
  }

  if (metricMode === "time") {
    const timeText = formatSecondsToMMSS(se.seconds);
    return timeText ? `${timeText}` : "completed interval";
  }

  if (metricMode === "distance") {
    const distance = typeof se.distance === "number" && Number.isFinite(se.distance) ? se.distance : undefined;
    if (distance === undefined) return "completed distance set";
    const unit = ((se as any).distanceUnit as string | undefined) ?? "mi";
    if (typeof se.weight === "number" && Number.isFinite(se.weight)) return `${se.weight} lbs • ${distance} ${unit}`;
    return `${distance} ${unit}`;
  }

  const reps = typeof se.reps === "number" && Number.isFinite(se.reps) ? se.reps : undefined;
  if (reps === undefined) return "completed set";
  return `${reps} reps`;
}

function buildCoachSnapshotText(params: {
  sessionLabel: string;
  track: Track;
  metricMode: MetricModeX;
  currentSets: SetEntryX[];
  recentBest: Awaited<ReturnType<typeof getBestSessionLastNDays>> | null;
  recommendation: ReturnType<typeof getNextWorkingRecommendation> | null;
  exercisePosition?: number;
}) {
  const {
    sessionLabel,
    track,
    metricMode,
    currentSets,
    recentBest,
    recommendation,
    exercisePosition,
  } = params;

  const lines: string[] = [];
  lines.push("Exercise Snapshot");
  lines.push(`Session: ${sessionLabel}`);
  lines.push(`Exercise: ${track.displayName}`);
  lines.push(`Intent: ${track.trackType}`);
  lines.push(`Mode: ${track.trackingMode}`);
  if (typeof exercisePosition === "number" && Number.isFinite(exercisePosition)) {
    lines.push(`Position: ${exercisePosition}`);
  }

  lines.push("");
  lines.push("This Session");
  const completedSetLines = currentSets
    .map((se) => formatCompletedSetForCoachSnapshot(se, track, metricMode))
    .filter((line): line is string => !!line);
  if (completedSetLines.length) {
    for (const line of completedSetLines) lines.push(`- ${line}`);
  } else {
    lines.push("- No completed sets yet");
  }

  if (recentBest && typeof recentBest.bestWeight === "number" && typeof recentBest.bestReps === "number") {
    lines.push("");
    lines.push("Recent Best");
    lines.push(`- ${recentBest.bestWeight} x ${recentBest.bestReps}`);
  }

  if (recommendation) {
    lines.push("");
    lines.push("Recommendation");
    lines.push(`- Action: ${recommendation.action}`);
    if (
      typeof recommendation.targetWeight === "number" &&
      Number.isFinite(recommendation.targetWeight) &&
      typeof recommendation.targetReps === "number" &&
      Number.isFinite(recommendation.targetReps)
    ) {
      lines.push(`- Target: ${recommendation.targetWeight} x ${recommendation.targetReps}`);
    } else if (
      typeof recommendation.targetWeight === "number" &&
      Number.isFinite(recommendation.targetWeight)
    ) {
      lines.push(`- Target weight: ${recommendation.targetWeight}`);
    } else if (
      typeof recommendation.targetReps === "number" &&
      Number.isFinite(recommendation.targetReps)
    ) {
      lines.push(`- Target reps: ${recommendation.targetReps}`);
    }
    lines.push(`- Confidence: ${recommendation.confidence}`);
    lines.push(`- Why: ${recommendation.rationale}`);
  }

  return lines.join("\n").trim() + "\n";
}

function applyActivePadDraftToSnapshotSets(params: {
  currentSets: SetEntryX[];
  activePad: ActiveGymPad | null;
  track: Track;
  metricMode: MetricModeX;
  weightEntryContextName: string;
}) {
  const { currentSets, activePad, track, metricMode, weightEntryContextName } = params;
  if (!activePad) return currentSets;

  const allowsNegativeWeight = isBodyweightEffectiveLoadExerciseName(weightEntryContextName);

  return currentSets.map((se) => {
    if (se.id !== activePad.setId) return se;

    if (activePad.field === "weight") {
      return {
        ...se,
        weight: parseCommittedWeight(activePad.buffer, allowsNegativeWeight),
      };
    }

    if (activePad.field === "rir") {
      return {
        ...se,
        rir: parseNum(normalizeDecimalInput(activePad.buffer)),
      };
    }

    if (metricMode === "time" || track.trackingMode === "timeSeconds") {
      return {
        ...se,
        seconds: parseTimeToSeconds(activePad.buffer),
      };
    }

    return {
      ...se,
      reps: parseNum(activePad.buffer),
    };
  });
}

/* ============================================================================
   Breadcrumb 03 — Active-session add exercise helpers
   ============================================================================ */
async function findOrCreateExerciseByName(rawName: string): Promise<string> {
  return findOrCreateExerciseByNameShared({
    rawName,
    normalizeName: normalizeLoose,
    resolveExisting: async (name) => {
      const resolution = await resolveExercise({
        rawName: name,
        allowAlias: true,
        followMerged: true,
        includeArchived: true,
      });

      if (
        resolution.status === "exact" ||
        resolution.status === "alias" ||
        resolution.status === "merged_redirect"
      ) {
        const resolvedExercise = resolution.exercise ?? resolution.canonicalExercise;
        if (resolvedExercise?.id) {
          return { kind: "existing", exerciseId: resolvedExercise.id } as const;
        }
      }

      if (resolution.status === "ambiguous") {
        return {
          kind: "ambiguous",
          message: `Ambiguous exercise match for "${name}". Review duplicate/alias data in Exercises first.`,
        } as const;
      }

      if (resolution.status === "archived_match" && resolution.exercise?.id) {
        return {
          kind: "existing",
          exerciseId: resolution.exercise.id,
          unarchive: true,
        } as const;
      }

      return null;
    },
  });
}

async function createTrackVariant(args: {
  exerciseId: string;
  displayName: string;
  trackType: TrackType;
  trackingMode: TrackingMode;
}): Promise<string> {
  return createTrackVariantShared(args);
}

async function findOrCreateReusableTrack(args: {
  exerciseId: string;
  desiredDisplayName: string;
  trackType: TrackType;
  trackingMode: TrackingMode;
}): Promise<string> {
  return findOrCreateReusableTrackShared({
    ...args,
    preferExactDisplayName: true,
    normalizeDisplayName: normalizeLoose,
  });
}

async function addTrackToSession(args: {
  sessionId: string;
  existingSessionItems: any[];
  existingRenderTrackIds: string[];
  exerciseName: string;
  trackDisplayName: string;
  trackType: TrackType;
  trackingMode: TrackingMode;
}): Promise<{ trackId: string; added: boolean }> {
  const exerciseName = args.exerciseName.trim();
  const trackDisplayName = args.trackDisplayName.trim();
  if (!exerciseName || !trackDisplayName) throw new Error("Exercise name is required.");

  return await db.transaction("rw", db.exercises, db.tracks, db.sessionItems, async () => {
    const exerciseId = await findOrCreateExerciseByName(exerciseName);

    const trackId = await findOrCreateReusableTrack({
      exerciseId,
      desiredDisplayName: trackDisplayName,
      trackType: args.trackType,
      trackingMode: args.trackingMode,
    });

    if (args.existingRenderTrackIds.includes(trackId)) {
      return { trackId, added: false };
    }

    const maxOrder = args.existingSessionItems.length
      ? Math.max(...args.existingSessionItems.map((x: any) => x.orderIndex ?? 0))
      : 0;

    await db.sessionItems.add({
      id: uuid(),
      sessionId: args.sessionId,
      orderIndex: maxOrder + 1,
      trackId,
      createdAt: Date.now(),
    } as any);

    return { trackId, added: true };
  });
}

/* ============================================================================
   Breadcrumb 04 — Add Exercise Modal
   ============================================================================ */
function AddExerciseModal({
  open,
  sessionId,
  existingSessionItems,
  existingRenderTrackIds,
  onClose,
}: {
  open: boolean;
  sessionId: string;
  existingSessionItems: any[];
  existingRenderTrackIds: string[];
  onClose: () => void;
}) {
  const [quickAddName, setQuickAddName] = useState("");
  const [variantType, setVariantType] = useState<TrackType>("strength");
  const [variantMode, setVariantMode] = useState<TrackingMode>(
    defaultTrackingModeForIntent("strength")
  );
  const [busy, setBusy] = useState(false);

  const exercises = useLiveQuery(async () => {
    const arr = await db.exercises.toArray();
    const filtered = arr.filter((e: any) => !e.mergedIntoExerciseId && !e.archivedAt);
    filtered.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
    return filtered as Exercise[];
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuickAddName("");
    setVariantType("strength");
    setVariantMode(defaultTrackingModeForIntent("strength"));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const filteredExercises = useMemo(() => {
    const q = normalizeLoose(quickAddName);
    let arr = (exercises ?? []).slice();

    if (q) {
      arr = arr.filter((ex) => {
        const name = normalizeLoose(ex.name ?? "");
        const aliases = Array.isArray((ex as any).aliases) ? (ex as any).aliases : [];
        const aliasHay = aliases.map((a: string) => normalizeLoose(a)).join(" ");
        return name.includes(q) || aliasHay.includes(q);
      });
    }

    arr.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
    return arr;
  }, [exercises, quickAddName]);

  const catalogGroups: CatalogGroup[] = useMemo(() => {
    const m = new Map<string, Exercise[]>();
    for (const ex of filteredExercises) {
      const ch = (ex.name?.trim()?.[0] ?? "#").toUpperCase();
      const key = /[A-Z]/.test(ch) ? ch : "#";
      const arr = m.get(key) ?? [];
      arr.push(ex);
      m.set(key, arr);
    }

    const keys = Array.from(m.keys()).sort((a, b) => {
      if (a === "#") return 1;
      if (b === "#") return -1;
      return a.localeCompare(b);
    });

    return keys.map((k) => ({ key: k, title: k, exercises: m.get(k)! }));
  }, [filteredExercises]);

  const catalogHasResults = useMemo(
    () => catalogGroups.some((g) => g.exercises.length > 0),
    [catalogGroups]
  );

  const topCatalogExercise = useMemo(() => {
    for (const g of catalogGroups) {
      if (g.exercises.length) return g.exercises[0];
    }
    return undefined as Exercise | undefined;
  }, [catalogGroups]);

  const suggestedTrackName = useMemo(
    () => buildTrackDisplayNameForIntent(quickAddName, variantType),
    [quickAddName, variantType]
  );

  async function doAdd(exerciseName: string, displayName: string) {
    const exName = exerciseName.trim();
    const trName = displayName.trim();
    if (!exName || !trName) return;

    setBusy(true);
    try {
      const res = await addTrackToSession({
        sessionId,
        existingSessionItems,
        existingRenderTrackIds,
        exerciseName: exName,
        trackDisplayName: trName,
        trackType: variantType,
        trackingMode: variantMode,
      });

      if (!res.added) {
        window.alert("That exercise/variant is already in this session.");
        return;
      }

      onClose();
    } catch (err: any) {
      window.alert(err?.message || "Could not add exercise to session.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onMouseDown={onClose}>
      <div
        className="card modal-card"
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          maxWidth: 760,
          width: "min(760px, calc(100vw - 24px))",
          maxHeight: "calc(100vh - 24px)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <button className="btn small" onClick={onClose} aria-label="Close" disabled={busy}>
            ✕
          </button>

          <div style={{ textAlign: "center", flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 900 }}>Add Exercise</div>
            <div className="muted" style={{ marginTop: 4 }}>
              Add an exercise to the active session without restarting.
            </div>
          </div>

          <div style={{ width: 36 }} />
        </div>

        <hr />

        <div style={{ paddingRight: 2, overflowY: "auto", maxHeight: "min(600px, calc(100vh - 260px))" }}>
          <div className="card" style={{ padding: 12, marginBottom: 10 }}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Search / Quick add</div>

            <div className="row" style={{ gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <input
                className="input"
                placeholder="Search exercises…"
                value={quickAddName}
                onChange={(e) => setQuickAddName(e.target.value)}
                style={{ flex: 1, minWidth: 220 }}
                disabled={busy}
              />

              <select
                className="input"
                value={variantType}
                onChange={(e) => {
                  const nextType = e.target.value as TrackType;
                  setVariantType(nextType);
                  setVariantMode(defaultTrackingModeForIntent(nextType));
                }}
                style={{ width: "auto", minWidth: 160 }}
                aria-label="Track intent"
                disabled={busy}
              >
                {GYM_TRACK_INTENT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <select
                className="input"
                value={variantMode}
                onChange={(e) => setVariantMode(e.target.value as TrackingMode)}
                style={{ width: "auto", minWidth: 170 }}
                aria-label="Tracking mode"
                disabled={busy}
              >
                <option value="weightedReps">weighted reps</option>
                <option value="repsOnly">reps only</option>
                <option value="timeSeconds">time</option>
                <option value="checkbox">checkbox</option>
                <option value="breaths">breaths</option>
              </select>
            </div>

            <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>
              Reuse rule: exercise + intent + mode. If no matching track exists, a new one is created.
            </div>

            <div style={{ marginTop: 12 }}>
              <div className="row" style={{ alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div style={{ fontWeight: 800 }}>Quick add</div>
                <div className="muted" style={{ fontSize: 13 }}>
                  Track name:{" "}
                  <span style={{ color: "var(--text)", fontWeight: 800 }}>
                    {suggestedTrackName || "—"}
                  </span>
                </div>
              </div>

              <div style={{ marginTop: 10 }} className="row">
                <button
                  className="btn primary"
                  disabled={!quickAddName.trim() || busy}
                  onClick={() =>
                    doAdd(
                      quickAddName,
                      suggestedTrackName || quickAddName.trim()
                    )
                  }
                >
                  Add to session
                </button>

                <button
                  className="btn"
                  disabled={!quickAddName.trim() || busy}
                  onClick={() => {
                    if (topCatalogExercise?.name) setQuickAddName(topCatalogExercise.name);
                  }}
                >
                  Use top match
                </button>
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: 12 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Catalog</div>

            {!catalogHasResults ? (
              <p className="muted" style={{ margin: 0 }}>
                No exercises match your search.
              </p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {catalogGroups
                  .filter((g) => g.exercises.length)
                  .slice(0, 6)
                  .map((g) => (
                    <div key={g.key}>
                      <div className="muted" style={{ fontWeight: 900, marginBottom: 6 }}>
                        {g.title}
                      </div>

                      <div style={{ display: "grid", gap: 6 }}>
                        {g.exercises.slice(0, 10).map((ex) => (
                          <div
                            key={ex.id}
                            className="row"
                            style={{ justifyContent: "space-between", alignItems: "center", gap: 10 }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 800, wordBreak: "break-word" }}>{ex.name}</div>
                            </div>

                            <button
                              className="btn small primary"
                              disabled={busy}
                              onClick={() =>
                                doAdd(
                                  ex.name ?? "",
                                  buildTrackDisplayNameForIntent(ex.name ?? "", variantType)
                                )
                              }
                            >
                              Add
                            </button>
                          </div>
                        ))}
                        {g.exercises.length > 10 ? (
                          <div className="muted" style={{ fontSize: 13 }}>
                            + {g.exercises.length - 10} more in {g.title} (refine search to narrow)
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <button className="btn" style={{ width: "100%", padding: "12px 14px" }} onClick={onClose} disabled={busy}>
            Done
          </button>
        </div>
      </div>

    </div>
  );
}

/* ============================================================================
   Breadcrumb 05 — GymPage shell
   ============================================================================ */
export default function GymPage() {
  const { sessionId } = useParams();
  const nav = useNavigate();

  /* ------------------------------------------------------------------------
     Breadcrumb 05.1 — Session read
     ------------------------------------------------------------------------ */
  const session = useLiveQuery(
    () => (sessionId ? db.sessions.get(sessionId) : Promise.resolve(undefined)),
    [sessionId]
  );

  /* ------------------------------------------------------------------------
     Breadcrumb 05.2 — Planned items source
     ------------------------------------------------------------------------ */
  const sessionItems = useLiveQuery(async () => {
    if (!sessionId) return [];
    return db.sessionItems.where("sessionId").equals(sessionId).sortBy("orderIndex");
  }, [sessionId]);

  const templateItems = useLiveQuery(async () => {
    if (!session?.templateId) return [];
    return db.templateItems.where("templateId").equals(session.templateId).sortBy("orderIndex");
  }, [session?.templateId]);

  /* ------------------------------------------------------------------------
     Breadcrumb 05.3 — Sets are authoritative
     ------------------------------------------------------------------------ */
  const sets = useLiveQuery(async () => {
    if (!sessionId) return [];
    return db.sets.where("sessionId").equals(sessionId).sortBy("createdAt");
  }, [sessionId]);

  /* ------------------------------------------------------------------------
     Breadcrumb 05.4 — Add Exercise modal state
     ------------------------------------------------------------------------ */
  const [showAddExercise, setShowAddExercise] = useState(false);

  /* ------------------------------------------------------------------------
     Breadcrumb 05.5 — Planned items memo
     ------------------------------------------------------------------------ */
  const plannedItems = useMemo(() => {
    const si = (sessionItems ?? []) as any[];
    if (si.length) return si;
    return (templateItems ?? []) as any[];
  }, [sessionItems, templateItems]);

  /* ------------------------------------------------------------------------
     Breadcrumb 05.6 — Set-driven track ids
     ------------------------------------------------------------------------ */
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

  /* ------------------------------------------------------------------------
     Breadcrumb 05.7 — Merge planned order + set-driven extras
     ------------------------------------------------------------------------ */
  const renderTrackIds = useMemo(() => {
    const planIds = (plannedItems ?? []).map((p: any) => String(p.trackId));
    const planSet = new Set(planIds);

    const merged: string[] = [];
    for (const id of planIds) merged.push(id);
    for (const id of setDrivenTrackIds) if (!planSet.has(id)) merged.push(id);

    return merged;
  }, [plannedItems, setDrivenTrackIds]);

  const trackIdsKey = useMemo(() => renderTrackIds.join("|"), [renderTrackIds]);

  /* ------------------------------------------------------------------------
     Breadcrumb 05.8 — Bulk track read
     ------------------------------------------------------------------------ */
  const tracks = useLiveQuery(async () => {
    if (!renderTrackIds.length) return [];
    const arr = await db.tracks.bulkGet(renderTrackIds);
    return arr.filter(Boolean) as Track[];
  }, [trackIdsKey]);

  /* ------------------------------------------------------------------------
     Breadcrumb 05.9 — Session notes
     ------------------------------------------------------------------------ */
  const [sessionNotes, setSessionNotes] = useState("");
  useEffect(() => {
    setSessionNotes(session?.notes ?? "");
  }, [session?.id, session?.notes]);

  const [activePad, setActivePad] = useState<ActiveGymPad | null>(null);
  const activePadRef = useRef<ActiveGymPad | null>(null);

  useEffect(() => {
    activePadRef.current = activePad;
  }, [activePad]);

  async function openGymPad(pad: Omit<ActiveGymPad, "buffer"> & { initialValue: string }) {
    const prevPad = activePad;
    if (prevPad && (prevPad.setId !== pad.setId || prevPad.field !== pad.field)) {
      await prevPad.onCommit(prevPad.buffer);
      prevPad.onDismiss();
    }

    const nextPad: ActiveGymPad = {
      ...pad,
      buffer: pad.initialValue,
    };
    setActivePad(nextPad);

    window.requestAnimationFrame(() => {
      const rowEl = document.getElementById(pad.rowDomId);
      rowEl?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }

  async function closeGymPad(commitFirst: boolean) {
    const pad = activePad;
    if (!pad) return;
    if (commitFirst) await pad.onCommit(pad.buffer);
    pad.onDismiss();
    setActivePad(null);
  }

  async function flushActivePadDraft() {
    const pad = activePadRef.current;
    if (!pad) return;

    await pad.onCommit(pad.buffer);
    pad.onDismiss();
    activePadRef.current = null;
    setActivePad((current) =>
      current?.setId === pad.setId && current.field === pad.field ? null : current
    );
  }

  function handleGymPadKey(k: string) {
    setActivePad((prev) => {
      if (!prev) return prev;
      const nextBuffer =
        prev.field === "weight"
          ? normalizeWeightInput(`${prev.buffer}${k}`)
          : normalizeDecimalInput(`${prev.buffer}${k}`);
      return { ...prev, buffer: nextBuffer };
    });
  }

  function handleGymPadBackspace() {
    setActivePad((prev) => (prev ? { ...prev, buffer: prev.buffer.slice(0, -1) } : prev));
  }

  function toggleGymPadWeightSign() {
    setActivePad((prev) => {
      if (!prev || prev.field !== "weight" || !prev.allowsNegativeWeight) return prev;
      const normalized = normalizeWeightInput(prev.buffer);
      let nextBuffer = "-";
      if (!normalized) nextBuffer = "-";
      else if (normalized === "-") nextBuffer = "";
      else nextBuffer = normalized.startsWith("-") ? normalized.slice(1) : `-${normalized}`;
      return { ...prev, buffer: nextBuffer };
    });
  }

  async function focusNextFromGymPad() {
    const pad = activePad;
    if (!pad) return;
    await pad.onCommit(pad.buffer);
    pad.onNext();
    setActivePad(null);
  }

  /* ------------------------------------------------------------------------
     Breadcrumb 05.10 — Track lookup map
     ------------------------------------------------------------------------ */
  const trackById = useMemo(() => new Map((tracks ?? []).map((t) => [t.id, t] as const)), [tracks]);

  /* ------------------------------------------------------------------------
     Breadcrumb 05.11 — Guards
     ------------------------------------------------------------------------ */
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

  /* ------------------------------------------------------------------------
     Breadcrumb 05.12 — Finish pipeline
     ------------------------------------------------------------------------ */
  async function finalizeCurrentSession() {
    await flushActivePadDraft();
    await finalizeGymSessionWrites(sessionId, {
      notes: sessionNotes,
    });
  }

  async function finish() {
    await finalizeCurrentSession();
    nav(`/complete/${sessionId}`);
  }

  /* ------------------------------------------------------------------------
     Breadcrumb 05.13 — Cancel pipeline
     ------------------------------------------------------------------------ */
  async function cancelSession() {
    const ok = window.confirm(
      "Cancel this session?\n\nThis will delete all logged sets and remove the session from history."
    );
    if (!ok) return;

    try {
      await db.sets.where("sessionId").equals(sessionId).delete();
      await db.sessions.delete(sessionId);
      nav("/history");
    } catch (err: any) {
      window.alert(err?.message || "Cancel failed. Please try again.");
    }
  }

  async function leaveSession() {
    await flushActivePadDraft();
    const hasLoggedData = ((sets ?? []) as SetEntryX[]).some((se) => hasMeaningfulSetData(se));
    const isOpenAdHoc = !session.templateId && !session.endedAt;

    try {
      if (isOpenAdHoc && !hasLoggedData) {
        await db.sets.where("sessionId").equals(sessionId).delete();
        await db.sessionItems.where("sessionId").equals(sessionId).delete();
        await db.sessions.delete(sessionId);
      } else if (isOpenAdHoc) {
        await finalizeCurrentSession();
      }

      nav("/history");
    } catch (err: any) {
      window.alert(err?.message || "Could not leave session. Please try again.");
    }
  }

  /* ------------------------------------------------------------------------
     Breadcrumb 05.14 — Render
     ------------------------------------------------------------------------ */
  const accessorySignLabel = activePad?.buffer.trim().startsWith("-") ? "-/+ -" : "-/+ +";

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="grid" style={{ paddingBottom: activePad ? 320 : 0 }}>
      {/* --------------------------------------------------------------------
         Breadcrumb 05.14.a — Header card
         -------------------------------------------------------------------- */}
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

        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <button className="btn primary" onClick={() => setShowAddExercise(true)}>
            + Add Exercise
          </button>

          <button className="btn" onClick={leaveSession}>
            Back to history
          </button>
        </div>
      </div>

      {/* --------------------------------------------------------------------
         Breadcrumb 05.14.b — Exercise cards
         -------------------------------------------------------------------- */}
      {(() => {
        const planArr = (plannedItems ?? []) as any[];

        const planByTrackId = new Map<string, any>();
        for (const it of planArr) planByTrackId.set(String(it.trackId), it);

        return (renderTrackIds ?? []).map((trackId) => {
          const tid = String(trackId);
          const track = trackById.get(tid);
          if (!track) return null;

          const planned = planByTrackId.get(tid);

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
                sessionLabel={session.templateName ?? "Ad-hoc"}
                item={item as any}
                track={track}
                sets={(sets ?? []) as SetEntryX[]}
                activePad={activePad}
                onOpenPad={openGymPad}
                onFlushActivePad={flushActivePadDraft}
              />
            </div>
          );
        });
      })()}

      {/* --------------------------------------------------------------------
         Breadcrumb 05.14.c — Finish card
         -------------------------------------------------------------------- */}
      <FinishSessionCard
        sessionId={sessionId}
        tracks={(tracks ?? []) as Track[]}
        sets={(sets ?? []) as SetEntryX[]}
        onFlushActivePad={flushActivePadDraft}
        onFinish={finish}
        onCancel={cancelSession}
        onBack={leaveSession}
      />

      {/* --------------------------------------------------------------------
         Breadcrumb 05.14.d — Add Exercise modal
         -------------------------------------------------------------------- */}
      <AddExerciseModal
        open={showAddExercise}
        sessionId={sessionId}
        existingSessionItems={(sessionItems ?? []) as any[]}
        existingRenderTrackIds={renderTrackIds}
        onClose={() => setShowAddExercise(false)}
      />

      {/* --------------------------------------------------------------------
         Breadcrumb 05.14.e — Dev overlay
         -------------------------------------------------------------------- */}
      <DevGymOverlay
        sessionId={sessionId}
        sets={(sets ?? []) as SetEntryX[]}
        tracks={(tracks ?? []) as Track[]}
      />
      </div>

      <div
        data-testid="gym-numeric-pad-dock"
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 2000,
          pointerEvents: activePad ? "auto" : "none",
        }}
      >
        <NumericPad
          visible={!!activePad}
          decimalEnabled={!!activePad?.decimalEnabled}
          title={activePad?.title}
          layout="strongColumn"
          theme="ironforge"
          position="static"
          onKey={handleGymPadKey}
          onBackspace={handleGymPadBackspace}
          onClear={() => setActivePad((prev) => (prev ? { ...prev, buffer: "" } : prev))}
          onDone={() => {
            void closeGymPad(true);
          }}
          onNext={() => {
            void focusNextFromGymPad();
          }}
          rightColumnButtons={[
            {
              key: "hide",
              label: "Hide",
              onClick: () => {
                void closeGymPad(true);
              },
              testId: "gym-weight-accessory-dismiss",
            },
            {
              key: "calc",
              label: "Calc",
              onClick: () => {},
              disabled: true,
              testId: "gym-weight-accessory-utility",
            },
            activePad?.field === "weight" && activePad.allowsNegativeWeight
              ? {
                  key: "sign",
                  label: accessorySignLabel,
                  onClick: toggleGymPadWeightSign,
                  testId: "gym-weight-accessory-sign",
                }
              : {
                  key: "sign-disabled",
                  label: "-/+",
                  onClick: () => {},
                  disabled: true,
                  testId: "gym-weight-accessory-sign-disabled",
                },
            {
              key: "next",
              label: "Next",
              onClick: () => {
                void focusNextFromGymPad();
              },
              testId: "gym-weight-accessory-next",
            },
          ]}
        />
      </div>
    </div>
  );
}

/* ============================================================================
   Breadcrumb 06 — ExerciseCard
   ============================================================================ */
function ExerciseCard({
  sessionId,
  sessionLabel,
  item,
  track,
  sets,
  activePad,
  onOpenPad,
  onFlushActivePad,
}: {
  sessionId: string;
  sessionLabel: string;
  item: any;
  track: Track;
  sets: SetEntryX[];
  activePad: ActiveGymPad | null;
  onOpenPad: (pad: Omit<ActiveGymPad, "buffer"> & { initialValue: string }) => void;
  onFlushActivePad: () => Promise<void>;
}) {
  const nav = useNavigate();

  /* ------------------------------------------------------------------------
     Breadcrumb 06.1 — Template overrides / targets
     ------------------------------------------------------------------------ */
  const repMin = item?.repMinOverride ?? track.repMin;
  const repMax = item?.repMaxOverride ?? track.repMax;

  const warmupTarget = item?.warmupSetsOverride ?? track.warmupSetsDefault;
  const workingTarget = item?.workingSetsOverride ?? track.workingSetsDefault;

  /* ------------------------------------------------------------------------
     Breadcrumb 06.2 — Timer state
     ------------------------------------------------------------------------ */
  const [restSec, setRestSec] = useState<number>(120);
  const timer = useRestTimer();

  /* ------------------------------------------------------------------------
     Breadcrumb 06.3 — Cues modal state
     ------------------------------------------------------------------------ */
  const [showCues, setShowCues] = useState<boolean>(false);
  const [coachSnapshotCopied, setCoachSnapshotCopied] = useState<boolean>(false);

  /* ------------------------------------------------------------------------
     Breadcrumb 06.4 — Compact mode
     ------------------------------------------------------------------------ */
  const compact = useCompactMode();

  /* ------------------------------------------------------------------------
     Breadcrumb 06.5 — Exercise / variant reads
     ------------------------------------------------------------------------ */
  const exercise = useLiveQuery(async () => {
    return await db.exercises.get(track.exerciseId);
  }, [track.exerciseId]);

  const variant = useLiveQuery(async () => {
    const vid = (track as any).variantId as string | undefined;
    if (!vid) return undefined;
    return await db.exerciseVariants.get(vid);
  }, [(track as any).variantId]);

  /* ------------------------------------------------------------------------
     Breadcrumb 06.6 — Metric mode
     ------------------------------------------------------------------------ */
  const metricMode = useMemo<MetricModeX>(() => {
    const m = (exercise as any)?.metricMode;
    return m === "distance" || m === "time" ? m : "reps";
  }, [exercise]);

  /* ------------------------------------------------------------------------
     Breadcrumb 06.7 — Loaded reps inference
     ------------------------------------------------------------------------ */
  const loadedReps = useMemo(() => {
    return isLoadedRepsTrack(track, metricMode);
  }, [track, metricMode]);

  /* ------------------------------------------------------------------------
     Breadcrumb 06.8 — Text cleaners
     ------------------------------------------------------------------------ */
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

  /* ------------------------------------------------------------------------
     Breadcrumb 06.9 — Cue resolution
     ------------------------------------------------------------------------ */
  const cuesSetup = useMemo(() => {
    const v = cleanCueArray((variant as any)?.cuesSetup);
    if (v.length) return v;

    const e = cleanCueArray((exercise as any)?.cuesSetup);
    if (e.length) return e;

    const legacy = cleanCueArray((exercise as any)?.cues);
    return legacy.length ? legacy : [];
  }, [exercise, variant]);

  const cuesExecution = useMemo(() => {
    const v = cleanCueArray((variant as any)?.cuesExecution);
    if (v.length) return v;

    const e = cleanCueArray((exercise as any)?.cuesExecution);
    if (e.length) return e;

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
    cuesSetup.length > 0 ||
    cuesExecution.length > 0 ||
    !!summary ||
    !!directions ||
    (commonMistakes?.length ?? 0) > 0;

  const variantName = useMemo(() => cleanText((variant as any)?.name), [variant]);
  const weightEntryContextName = useMemo(
    () => [cleanText((exercise as any)?.name), track.displayName].filter(Boolean).join(" ").trim(),
    [exercise, track.displayName]
  );

  /* ------------------------------------------------------------------------
     Breadcrumb 06.10 — Clipboard builder
     ------------------------------------------------------------------------ */
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

  async function onCopyCoachSnapshot() {
    const snapshotSets = applyActivePadDraftToSnapshotSets({
      currentSets,
      activePad,
      track,
      metricMode,
      weightEntryContextName,
    });
    const txt = buildCoachSnapshotText({
      sessionLabel,
      track,
      metricMode,
      currentSets: snapshotSets,
      recentBest,
      recommendation: workingRecommendation,
      exercisePosition:
        typeof item?.orderIndex === "number" && Number.isFinite(item.orderIndex) ? item.orderIndex + 1 : undefined,
    });
    const ok = await copyTextToClipboard(txt);
    if (!ok) {
      window.alert("Could not copy to clipboard in this browser.");
      return;
    }
    setCoachSnapshotCopied(true);
    window.setTimeout(() => setCoachSnapshotCopied(false), 1500);
  }

  function onEditInCatalog() {
    nav(`/exercises?edit=${encodeURIComponent(track.exerciseId)}&from=gym`);
  }

  /* ------------------------------------------------------------------------
     Breadcrumb 06.11 — Current sets normalization
     ------------------------------------------------------------------------ */
  const currentSets = useMemo(() => {
    const arr = (sets ?? [])
      .filter((s) => s.trackId === track.id)
      .slice()
      .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));

    return arr.map((s) => {
      const raw = String((s as any).setType ?? "");
      const setType: SetKind =
        raw === "warmup" || raw === "working" || raw === "drop" || raw === "failure"
          ? (raw as SetKind)
          : "working";
      return { ...s, setType };
    });
  }, [sets, track.id]);

  /* ------------------------------------------------------------------------
     Breadcrumb 06.12 — Working index map
     ------------------------------------------------------------------------ */
  const workingIndexById = useMemo(() => {
    const map = new Map<string, number>();
    let workingIndex = 0;

    for (const s of currentSets) {
      const type = ((s.setType as SetKind) ?? "working") as SetKind;
      if (type !== "working") continue;

      workingIndex += 1;
      map.set(s.id, workingIndex);
    }

    return map;
  }, [currentSets]);

  /* ------------------------------------------------------------------------
     Breadcrumb 06.13 — Previous session mapping
     ------------------------------------------------------------------------ */
  const prev = usePrevByWorkingIndex(sessionId, track.id);

  /* ------------------------------------------------------------------------
     Breadcrumb 06.14 — Progression / suggestion state
     ------------------------------------------------------------------------ */
  const [recentBest, setRecentBest] = useState<Awaited<ReturnType<typeof getBestSessionLastNDays>> | null>(null);
  const [workingRecommendation, setWorkingRecommendation] = useState<ReturnType<
    typeof getNextWorkingRecommendation
  > | null>(null);
  const [bestSummary, setBestSummary] = useState<string>("");
  const [suggestion, setSuggestion] = useState<string>("");
  const [prefillWeight, setPrefillWeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    let alive = true;

    (async () => {
      if (!isStrengthTrackType(track.trackType)) {
        const conservativeRecommendation = getNextWorkingRecommendation({
          trackId: track.id,
          trackType: track.trackType,
          trackingMode: track.trackingMode,
          recentSets: [],
          repMin,
          repMax,
          weightJump: (track as any).weightJumpDefault,
          rirTargetMin: track.rirTargetMin,
        });
        if (!alive) return;
        setRecentBest(null);
        setWorkingRecommendation(conservativeRecommendation);
        setBestSummary("");
        setSuggestion("");
        setPrefillWeight(undefined);
        return;
      }

      const best = await getBestSessionLastNDays(track.id, 5);
      const recommendation = getNextWorkingRecommendation({
        trackId: track.id,
        trackType: track.trackType,
        trackingMode: track.trackingMode,
        recentSets:
          best && typeof best.bestWeight === "number" && typeof best.bestReps === "number"
            ? [
                {
                  weight: best.bestWeight,
                  reps: best.bestReps,
                  completed: true,
                  timestamp: best.endedAt ?? Date.now(),
                },
              ]
            : [],
        repMin,
        repMax,
        weightJump: (track as any).weightJumpDefault,
        rirTargetMin: track.rirTargetMin,
      });

      if (!alive) return;
      setRecentBest(best ?? null);
      setWorkingRecommendation(recommendation);
      setBestSummary(formatBestSessionSummary(best));
      setSuggestion(formatNextWorkingRecommendationText(recommendation));
      setPrefillWeight(recommendation.targetWeight ?? undefined);
    })();

    return () => {
      alive = false;
    };
  }, [
    track.id,
    track.trackType,
    track.trackingMode,
    repMin,
    repMax,
    workingTarget,
    (track as any).weightJumpDefault,
    track.rirTargetMin,
  ]);

  /* ------------------------------------------------------------------------
     Breadcrumb 06.15 — DB write helper
     ------------------------------------------------------------------------ */
  async function updateSet(id: string, patch: Partial<SetEntryX>) {
    const allowsNegativeWeight = isBodyweightEffectiveLoadExerciseName(weightEntryContextName);

    if ("weight" in patch) {
      const w = patch.weight as any;
      if (w !== undefined && w !== null && Number.isFinite(w) && Math.abs(w) > LIMITS.maxWeight) {
        window.alert(`Max weight is ${LIMITS.maxWeight}. Did you accidentally append reps to weight?`);
        return;
      }
      if (w !== undefined && w !== null && Number.isFinite(w) && w < 0 && !allowsNegativeWeight) {
        patch.weight = 0 as any;
      }
    }

    if ("reps" in patch) {
      const r = patch.reps as any;
      if (r !== undefined && r !== null && Number.isFinite(r) && r > LIMITS.maxReps) {
        window.alert(`Max reps is ${LIMITS.maxReps}. Did you accidentally type the wrong field?`);
        return;
      }
      if (r !== undefined && r !== null && Number.isFinite(r) && r < 0) patch.reps = 0 as any;
    }

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
      if (v === undefined || v === null) patch.rir = undefined;
      else if (!Number.isFinite(v)) patch.rir = undefined;
      else patch.rir = Math.max(0, v) as any;
    }

    await db.sets.update(id, patch as any);
  }

  /* ------------------------------------------------------------------------
     Breadcrumb 06.16 — Add set
     ------------------------------------------------------------------------ */
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

    const wantsWeight = metricMode === "reps" || metricMode === "distance";

    if (
      wantsWeight &&
      (
        track.trackingMode === "weightedReps" ||
        (metricMode === "reps" && isStrengthTrackType(track.trackType))
      )
    ) {
      if (lastWorkingLike?.weight !== undefined) entry.weight = lastWorkingLike.weight;
      else if (prefillWeight !== undefined) entry.weight = prefillWeight;
    }

    await db.sets.add(entry as any);
  }

  /* ------------------------------------------------------------------------
     Breadcrumb 06.17 — Delete set
     ------------------------------------------------------------------------ */
  async function deleteSet(id: string) {
    await db.sets.delete(id);
  }

  /* ------------------------------------------------------------------------
     Breadcrumb 06.18 — Rest label
     ------------------------------------------------------------------------ */
  function restLabel(seconds: number) {
    const mm = String(Math.floor(seconds / 60));
    const ss = String(seconds % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  }

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

    if (metricMode === "reps") return prev.get(workingIndex) ?? "";

    if (metricMode === "time") {
      const sec = (se as any).seconds as number | undefined;
      return sec !== undefined ? formatMMSS(sec) : "";
    }

    const d = (se as any).distance as number | undefined;
    const u = ((se as any).distanceUnit as string | undefined) ?? "mi";
    const w = se.weight as number | undefined;

    if (d === undefined) return "";
    const distTxt = `${d} ${u}`;

    if (track.trackingMode === "weightedReps" && w !== undefined) return `${w} lbs • ${distTxt}`;
    return distTxt;
  }

  /* ------------------------------------------------------------------------
     Breadcrumb 06.19 — Cues modal
     ------------------------------------------------------------------------ */
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
    useEffect(() => {
      if (!open) return;
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") onClose();
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

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
                <button className="btn" onClick={onCopyCues}>
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

  /* ------------------------------------------------------------------------
     Breadcrumb 06.20 — Header labels / geometry
     ------------------------------------------------------------------------ */
  const weightHeader = metricMode === "time" ? "—" : "Lbs";
  const midHeader = metricMode === "distance" ? "Dist" : metricMode === "time" ? "Time" : "Reps";
  const rirHeader = metricMode === "reps" && loadedReps ? "RIR" : "—";

  const cardScope = useMemo(() => `excard-${track.id}`, [track.id]);

  const gridTemplateColumnsDesktop = useMemo(() => {
    if (metricMode === "distance") return "64px 1.4fr 96px 200px 56px 44px 44px";
    if (metricMode === "time") return "64px 1.4fr 56px 200px 56px 44px 44px";
    return "64px 1.4fr 110px 110px 70px 44px 44px";
  }, [metricMode]);

  const gridTemplateColumnsMobile = useMemo(() => {
    if (metricMode === "distance") return "44px minmax(0,1fr) 56px minmax(0,120px) 40px 32px 32px";
    if (metricMode === "time") return "44px minmax(0,1fr) 40px minmax(0,120px) 40px 32px 32px";
    return "44px minmax(0,1fr) 64px 64px 48px 32px 32px";
  }, [metricMode]);

  return (
    <div className="card">
      <div data-excard-scope={cardScope}>
        <style>
          {`
            [data-excard-scope="${cardScope}"] .set-head,
            [data-excard-scope="${cardScope}"] .set-row{
              display: grid;
              grid-template-columns: ${gridTemplateColumnsDesktop};
              column-gap: 10px;
              align-items: center;
            }

            [data-excard-scope="${cardScope}"] .set-row{
              padding: 10px 0;
            }

            [data-excard-scope="${cardScope}"] .set-head{
              font-size: 13px;
              opacity: 0.75;
              padding: 6px 0 10px 0;
            }

            [data-excard-scope="${cardScope}"] .set-row .row{
              flex-wrap: nowrap;
            }

            [data-excard-scope="${cardScope}"] .cell-input{
              min-width: 0;
            }

            @media (max-width: 520px){
              [data-excard-scope="${cardScope}"] .set-head,
              [data-excard-scope="${cardScope}"] .set-row{
                grid-template-columns: ${gridTemplateColumnsMobile};
                column-gap: 6px;
              }

              [data-excard-scope="${cardScope}"] .set-head{
                font-size: 12px;
              }
            }
          `}
        </style>

        <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ marginBottom: 6 }}>{track.displayName}</h3>

            {isStrengthTrackType(track.trackType) && loadedReps && (
              <div className="muted">
                Rep range: <b>{repMin}–{repMax}</b>{" "}
                <span className="badge" style={{ marginLeft: 8 }}>
                  targets WU {warmupTarget} / WK {workingTarget}
                </span>
              </div>
            )}

            {isNonStrengthTrackType(track.trackType) && (
              <div className="muted">
                <span className="badge">{track.trackType}</span> • mode {track.trackingMode}
              </div>
            )}

            {item.notes && (
              <div className="muted" style={{ marginTop: 6 }}>
                {item.notes}
              </div>
            )}

            {isStrengthTrackType(track.trackType) && bestSummary && (
              <div className="muted" style={{ marginTop: 6 }}>
                {bestSummary}
              </div>
            )}

            {isStrengthTrackType(track.trackType) && suggestion && (
              <div className="muted" style={{ marginTop: 6 }}>
                {suggestion}
              </div>
            )}

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

              <button
                className="btn small"
                type="button"
                onClick={onCopyCoachSnapshot}
                title="Copy current exercise snapshot for coaching"
              >
                {coachSnapshotCopied ? "Copied" : "Copy Coach Snapshot"}
              </button>

              <button className="btn small" type="button" onClick={onEditInCatalog} title="Edit cues in Exercise Catalog">
                Edit
              </button>
            </div>

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
              const prevText = se.setType === "working" && workingIndex ? formatPrevForMode(se, workingIndex) : "";
              const prevParsed =
                metricMode === "reps" && se.setType === "working" && workingIndex ? parsePrev(prevText) : {};

              const onTapPrev = () => {
                const kind = ((se.setType as SetKind) ?? "working") as SetKind;
                if (kind !== "working") return;
                if (metricMode !== "reps") return;

                const pw = (prevParsed as any).prevWeight as number | undefined;
                const pr = (prevParsed as any).prevReps as number | undefined;

                if (se.weight === undefined && pw !== undefined) updateSet(se.id, { weight: pw });
                if (se.reps === undefined && pr !== undefined) updateSet(se.id, { reps: pr });
              };

              return (
                <SetRow
                  key={se.id}
                  rowDomId={`set-${se.id}`}
                  se={se}
                  label={label}
                  prevText={prevText}
                  prevParsed={prevParsed}
                  track={track}
                  weightEntryContextName={weightEntryContextName}
                  metricMode={metricMode}
                  loadedReps={loadedReps}
                  done={done}
                  compact={compact}
                  activePad={activePad}
                  onOpenPad={onOpenPad}
                  onTapPrev={onTapPrev}
                  onChange={updateSet}
                  onDelete={deleteSet}
                  onSetType={async (t) => {
                    const patch: Partial<SetEntryX> = { setType: t };
                    if (t === "failure") patch.rir = 0;
                    if (t === "warmup") patch.rir = undefined;
                    await updateSet(se.id, patch);
                  }}
                  onToggleDone={async (next) => {
                    await onFlushActivePad();
                    const kind = ((se.setType as SetKind) ?? "working") as SetKind;

                    if (next) {
                      const patch: Partial<SetEntryX> = { completedAt: Date.now() };
                      if (kind === "failure") patch.rir = 0;
                      if (kind === "warmup") patch.rir = undefined;
                      await updateSet(se.id, patch);
                      if (kind !== "warmup") timer.start(restSec);
                    } else {
                      await updateSet(se.id, { completedAt: undefined });
                    }
                  }}
                  onAcceptPrevWeight={() => {
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

/* ============================================================================
   Breadcrumb 07 — SetRow
   ============================================================================ */
function SetRow({
  rowDomId,
  se,
  label,
  prevText,
  prevParsed,
  track,
  weightEntryContextName,
  metricMode,
  loadedReps,
  done,
  compact,
  activePad,
  onOpenPad,
  onTapPrev,
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
  weightEntryContextName: string;
  metricMode: "reps" | "distance" | "time";
  loadedReps: boolean;
  done: boolean;
  compact: boolean;
  activePad: ActiveGymPad | null;
  onOpenPad: (pad: Omit<ActiveGymPad, "buffer"> & { initialValue: string }) => void;
  onTapPrev: () => void;
  onChange: (id: string, patch: Partial<SetEntryX>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onSetType: (t: SetKind) => Promise<void>;
  onToggleDone: (next: boolean) => Promise<void>;
  onAcceptPrevWeight: () => void;
  onAcceptPrevReps: () => void;
}) {
  const selectRef = useRef<HTMLSelectElement | null>(null);
  const weightInputRef = useRef<HTMLInputElement | null>(null);
  const repsInputRef = useRef<HTMLInputElement | null>(null);
  const rirInputRef = useRef<HTMLInputElement | null>(null);
  const distanceInputRef = useRef<HTMLInputElement | null>(null);

  function openTypePicker() {
    selectRef.current?.focus();
    selectRef.current?.click();
  }

  const kind = (se.setType as SetKind) ?? "working";
  const isWorking = kind === "working";
  const locked = done;

  const distance = (se as any).distance as number | undefined;
  const distanceUnit = ((se as any).distanceUnit as string | undefined) ?? "mi";

  const showsWeightedRepsFields = metricMode === "reps" && track.trackingMode === "weightedReps";
  const showWeightInDistance = track.trackingMode === "weightedReps";
  const allowsNegativeWeight = isBodyweightEffectiveLoadExerciseName(weightEntryContextName);

  const ghostWeight =
    compact && isWorking && se.weight === undefined && prevParsed.prevWeight !== undefined
      ? String(prevParsed.prevWeight)
      : "lbs";

  const ghostReps =
    compact && isWorking && se.reps === undefined && prevParsed.prevReps !== undefined
      ? String(prevParsed.prevReps)
      : "reps";

  const rowClass = "set-row" + (done ? " done" : "") + (kind === "warmup" ? " warmup" : "");

  const ringStyle: React.CSSProperties =
    done && isWorking
      ? {
          outline: "2px solid rgba(22,163,74,0.55)",
          outlineOffset: "2px",
          borderRadius: 12,
        }
      : {};

  function parseRirCommitted(raw: string): number | undefined {
    const t = normalizeDecimalInput(raw);
    if (!t) return undefined;
    if (/^\.\d+$/.test(t)) return Math.max(0, Number(`0${t}`));
    if (/^\d+\.$/.test(t)) return Math.max(0, Number(t.slice(0, -1)));
    const n = Number(t);
    return Number.isFinite(n) ? Math.max(0, n) : undefined;
  }

  const showRir = isWorking && requiresRirForTrack(track, metricMode);

  const activeFieldForRow = activePad?.setId === se.id ? activePad.field : null;

  function openPad(field: GymPadField) {
    if (locked) return;

    if (field === "weight" && compact && isWorking && se.weight === undefined) {
      onAcceptPrevWeight();
    }

    if (field === "reps" && compact && isWorking) {
      onAcceptPrevReps();
    }

    const initialValue =
      field === "weight"
        ? se.weight === undefined || se.weight === null
          ? ""
          : String(se.weight)
        : field === "reps"
        ? se.reps === undefined || se.reps === null
          ? ""
          : String(se.reps)
        : (se as any).rir === undefined || (se as any).rir === null
        ? ""
        : String((se as any).rir);

    onOpenPad({
      setId: se.id,
      rowDomId,
      field,
      title: field === "weight" ? "Weight" : field === "reps" ? "Reps" : "RIR",
      decimalEnabled: field !== "reps",
      allowsNegativeWeight,
      initialValue,
      onCommit: async (buffer) => {
        if (field === "weight") {
          await onChange(se.id, { weight: parseCommittedWeight(buffer, allowsNegativeWeight) });
          return;
        }
        if (field === "reps") {
          await onChange(se.id, { reps: parseNum(buffer) });
          return;
        }
        await onChange(se.id, { rir: parseRirCommitted(buffer) });
      },
      onDismiss: () => {
        if (field === "weight") weightInputRef.current?.blur();
        if (field === "reps") repsInputRef.current?.blur();
        if (field === "rir") rirInputRef.current?.blur();
      },
      onNext: () => {
        if (field === "weight" && showsWeightedRepsFields) {
          repsInputRef.current?.focus();
          return;
        }

        if (field === "weight" && metricMode === "distance" && showWeightInDistance) {
          distanceInputRef.current?.focus();
          return;
        }

        if (field === "reps" && showRir && !locked && kind !== "failure") {
          rirInputRef.current?.focus();
          return;
        }

        if (field === "reps") {
          repsInputRef.current?.blur();
          return;
        }

        if (field === "rir") {
          rirInputRef.current?.blur();
          return;
        }

        weightInputRef.current?.blur();
      },
    });
  }

  const [timeText, setTimeText] = useState<string>("");

  useEffect(() => {
    const sec = (se as any).seconds as number | undefined;
    setTimeText(sec === undefined || sec === null ? "" : formatSecondsToMMSS(sec));
  }, [se.id, (se as any).seconds]);

  const canTapPrev = !locked && isWorking && metricMode === "reps" && !!(prevText || "").trim();

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

      <div
        className="prev-cell"
        role={canTapPrev ? "button" : undefined}
        tabIndex={canTapPrev ? 0 : -1}
        title={canTapPrev ? "Tap to prefill missing weight/reps from previous" : undefined}
        onClick={() => {
          if (canTapPrev) onTapPrev();
        }}
        onKeyDown={(e) => {
          if (!canTapPrev) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onTapPrev();
          }
        }}
        style={{
          cursor: canTapPrev ? "pointer" : "default",
          opacity: canTapPrev ? 0.9 : 0.7,
          userSelect: "none",
        }}
      >
        {prevText || "—"}
      </div>

      {metricMode === "reps" && (
        <>
          {showsWeightedRepsFields && (
            <>
              <input
                  ref={weightInputRef}
                  className="cell-input"
                  name="weight"
                  aria-label="weight"
                  placeholder={ghostWeight}
                  value={activeFieldForRow === "weight" ? activePad?.buffer ?? "" : se.weight ?? ""}
                  inputMode="none"
                  type="text"
                  onFocus={() => openPad("weight")}
                  onClick={() => openPad("weight")}
                  readOnly
                  disabled={locked}
              />

              <input
                ref={repsInputRef}
                className="cell-input"
                name="reps"
                aria-label="reps"
                placeholder={ghostReps}
                value={activeFieldForRow === "reps" ? activePad?.buffer ?? "" : (se.reps ?? "")}
                inputMode="none"
                onFocus={() => openPad("reps")}
                onClick={() => openPad("reps")}
                readOnly
                disabled={locked}
              />

              {showRir ? (
                <input
                  ref={rirInputRef}
                  className="cell-input"
                  name="rir"
                  aria-label="rir"
                  placeholder="rir"
                  value={activeFieldForRow === "rir" ? activePad?.buffer ?? "" : ((se as any).rir ?? "")}
                  inputMode="none"
                  type="text"
                  onFocus={() => openPad("rir")}
                  onClick={() => openPad("rir")}
                  readOnly
                  disabled={locked || kind === "failure"}
                />
              ) : (
                <div className="muted">—</div>
              )}
            </>
          )}

          {!showsWeightedRepsFields && track.trackingMode === "repsOnly" && (
            <>
              <div className="muted">—</div>
              <input
                ref={repsInputRef}
                className="cell-input"
                name="reps"
                aria-label="reps"
                placeholder="reps"
                value={activeFieldForRow === "reps" ? activePad?.buffer ?? "" : (se.reps ?? "")}
                inputMode="none"
                onFocus={() => openPad("reps")}
                onClick={() => openPad("reps")}
                readOnly
                disabled={locked}
              />
              <div className="muted">—</div>
            </>
          )}

          {!loadedReps && track.trackingMode === "timeSeconds" && (
            <>
              <div className="muted">—</div>
              <input
                className="cell-input"
                placeholder="mm:ss"
                value={formatSecondsToMMSS((se as any).seconds)}
                inputMode="numeric"
                type="text"
                onChange={(e) => onChange(se.id, { seconds: parseTimeToSeconds(e.target.value) } as any)}
                disabled={locked}
              />
              <div className="muted">—</div>
            </>
          )}

          {!loadedReps && track.trackingMode === "breaths" && (
            <>
              <div className="muted">—</div>
              <input
                ref={repsInputRef}
                className="cell-input"
                name="reps"
                aria-label="reps"
                placeholder="breaths"
                value={activeFieldForRow === "reps" ? activePad?.buffer ?? "" : (se.reps ?? "")}
                inputMode="none"
                onFocus={() => openPad("reps")}
                onClick={() => openPad("reps")}
                readOnly
                disabled={locked}
              />
              <div className="muted">—</div>
            </>
          )}

          {!loadedReps && track.trackingMode === "checkbox" && (
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

      {metricMode === "distance" && (
        <>
          {showWeightInDistance ? (
            <input
                ref={weightInputRef}
                className="cell-input"
                name="weight"
                aria-label="weight"
                placeholder={ghostWeight}
                value={activeFieldForRow === "weight" ? activePad?.buffer ?? "" : se.weight ?? ""}
                inputMode="none"
                type="text"
                onFocus={() => openPad("weight")}
                onClick={() => openPad("weight")}
                readOnly
                disabled={locked}
            />
          ) : (
            <div className="muted">—</div>
          )}

          <div className="row" style={{ gap: 6, alignItems: "center" }}>
            <input
              ref={distanceInputRef}
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

      {metricMode === "time" && (
        <>
          <div className="muted">—</div>

          <input
            className="cell-input"
            name="time"
            aria-label="time"
            placeholder="mm:ss"
            type="text"
            inputMode="numeric"
            value={timeText}
            onChange={(e) => {
              const v = (e.target.value ?? "").replace(/[^\d:]/g, "");
              setTimeText(v);
            }}
            onBlur={() => {
              const committed = parseTimeToSeconds(timeText);
              onChange(se.id, { seconds: committed } as any);
              setTimeText(committed === undefined ? "" : formatSecondsToMMSS(committed));
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
              if (e.key === "Escape") {
                const sec = (se as any).seconds as number | undefined;
                setTimeText(sec === undefined || sec === null ? "" : formatSecondsToMMSS(sec));
                (e.currentTarget as HTMLInputElement).blur();
              }
            }}
            disabled={locked}
          />

          <div className="muted">—</div>
        </>
      )}

      <div className="check-cell">
        <input
          type="checkbox"
          checked={done}
          onChange={(e) => onToggleDone(e.target.checked)}
          aria-label="Complete set"
        />
      </div>

      <div className="row-actions">
        <button className="btn small" onClick={() => onDelete(se.id)} title="Delete set" disabled={locked}>
          ✕
        </button>
      </div>
    </div>
  );
}

/* ============================================================================
   Breadcrumb 08 — FinishSessionCard
   ============================================================================ */
function FinishSessionCard({
  sessionId,
  tracks,
  sets,
  onFlushActivePad,
  onFinish,
  onCancel,
  onBack,
}: {
  sessionId: string;
  tracks: Track[];
  sets: SetEntryX[];
  onFlushActivePad: () => Promise<void>;
  onFinish: () => Promise<void>;
  onCancel: () => Promise<void>;
  onBack: () => Promise<void>;
}) {
  const nav = useNavigate();
  const [showReview, setShowReview] = useState(false);

  const trackById = useMemo(() => new Map(tracks.map((t) => [t.id, t] as const)), [tracks]);
  const trackNameById = useMemo(() => new Map(tracks.map((t) => [t.id, t.displayName] as const)), [tracks]);

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

  function metricModeForTrack(tr: Track): MetricModeX {
    const ex = exerciseById?.get(tr.exerciseId);
    const mm = (ex as any)?.metricMode;
    if (mm === "distance" || mm === "time" || mm === "reps") return mm;
    return "reps";
  }

  const review = useMemo(() => {
    const working = (sets ?? []).filter((s) => (((s.setType as SetKind) ?? "working") as SetKind) === "working");

    const unchecked = working.filter((s) => !s.completedAt);

    const missingRir = working.filter((s) => {
      if (!s.completedAt) return false;

      const tr = trackById.get(s.trackId);
      if (!tr) return false;

      const mm = metricModeForTrack(tr);
      if (!requiresRirForTrack(tr, mm)) return false;

      const hasWR = typeof (s as any).weight === "number" && typeof (s as any).reps === "number";
      if (!hasWR) return false;

      const rir = (s as any).rir;
      const rirOk = typeof rir === "number" && Number.isFinite(rir);
      return !rirOk;
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
  }, [sets, trackById, exerciseById]);

  function scrollToSet(setId: string, trackId: string) {
    const row = document.getElementById(`set-${setId}`);
    if (row) {
      row.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const card = document.getElementById(`track-${trackId}`);
    card?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function onClickFinish() {
    await onFlushActivePad();

    const freshSets = await db.sets.where("sessionId").equals(sessionId).sortBy("createdAt");
    const freshReview = (() => {
      const working = (freshSets ?? []).filter(
        (s) => (((s.setType as SetKind) ?? "working") as SetKind) === "working"
      );

      const unchecked = working.filter((s) => !s.completedAt);

      const missingRir = working.filter((s) => {
        if (!s.completedAt) return false;

        const tr = trackById.get(s.trackId);
        if (!tr) return false;

        const mm = metricModeForTrack(tr);
        if (!requiresRirForTrack(tr, mm)) return false;

        const hasWR = typeof (s as any).weight === "number" && typeof (s as any).reps === "number";
        if (!hasWR) return false;

        const rir = (s as any).rir;
        const rirOk = typeof rir === "number" && Number.isFinite(rir);
        return !rirOk;
      });

      return {
        canFinish: unchecked.length === 0 && missingRir.length === 0,
      };
    })();

    if (freshReview.canFinish) {
      await onFinish();
      return;
    }

    setShowReview(true);
  }

  return (
    <div className="card">
      <h3 style={{ marginBottom: 6 }}>Finish</h3>

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

        <button className="btn" onClick={onBack}>
          Back to history
        </button>
      </div>
    </div>
  );
}

/* ============================================================================
   Breadcrumb 09 — Rest timer hook
   ============================================================================ */
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

  function addSeconds(delta: number) {
    setRemainingSec((s) => {
      const next = Math.max(0, Math.floor(s + delta));
      if (next === 0) setRunning(false);
      return next;
    });
  }

  function stop() {
    setRunning(false);
    setRemainingSec(0);
  }

  return { running, remainingSec, start, addSeconds, stop };
}

/* ============================================================================
   Breadcrumb 10 — Previous session mapping by working index
   ============================================================================ */
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
      const reps = (s as any).reps as number | undefined;

      if (wt !== undefined && reps !== undefined) {
        m.set(idx, `${wt} x ${reps}`);
        continue;
      }

      const seconds = (s as any).seconds as number | undefined;
      if (seconds !== undefined) {
        const t = formatMMSS(seconds);
        if (t) m.set(idx, t);
        continue;
      }

      const distance = (s as any).distance as number | undefined;
      const unit = ((s as any).distanceUnit as string | undefined) ?? "m";
      if (distance !== undefined) {
        const distTxt = `${distance} ${unit}`;
        if (wt !== undefined) m.set(idx, `${wt} lbs • ${distTxt}`);
        else m.set(idx, distTxt);
        continue;
      }
    }

    return m;
  }, [data?.prevSets]);

  return map;
}

/* ============================================================================
   Breadcrumb 11 — Dev-only overlay
   ============================================================================ */
function DevGymOverlay({
  sessionId,
  sets,
  tracks,
}: {
  sessionId: string;
  sets: SetEntryX[];
  tracks: Track[];
}) {
  if (!import.meta.env.DEV) return null;

  const trackNameById = useMemo(
    () => new Map(tracks.map((t) => [t.id, t.displayName] as const)),
    [tracks]
  );

  const rows = useMemo(() => {
    const s = (sets ?? [])
      .filter((x) => x.sessionId === sessionId)
      .slice()
      .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));

    return s.map((x) => {
      const kind = ((x.setType as any) ?? "working") as string;
      const done = !!x.completedAt;

      const weight = (x as any).weight;
      const reps = (x as any).reps;
      const seconds = (x as any).seconds;
      const distance = (x as any).distance;
      const unit = ((x as any).distanceUnit as string | undefined) ?? "";
      const rir = (x as any).rir;

      return {
        id: x.id,
        track: trackNameById.get(x.trackId) ?? x.trackId,
        kind,
        done: done ? "✓" : "",
        weight: typeof weight === "number" ? weight : "",
        reps: typeof reps === "number" ? reps : "",
        seconds: typeof seconds === "number" ? seconds : "",
        distance: typeof distance === "number" ? `${distance}${unit ? " " + unit : ""}` : "",
        rir: typeof rir === "number" && Number.isFinite(rir) ? rir : "",
      };
    });
  }, [sets, sessionId, trackNameById]);

  const storageKey = "devHudCollapsed";
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(storageKey);
      return v === null ? true : v === "1";
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, collapsed ? "1" : "0");
    } catch {}
  }, [collapsed]);

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        title="Open DEV HUD"
        style={{
          position: "fixed",
          right: 10,
          bottom: 10,
          zIndex: 9999,
          border: "0",
          background: "rgba(0,0,0,0.78)",
          color: "white",
          borderRadius: 999,
          padding: "8px 10px",
          fontSize: 12,
          fontWeight: 900,
          lineHeight: 1,
          boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
          display: "flex",
          gap: 8,
          alignItems: "center",
          cursor: "pointer",
        }}
      >
        <span style={{ opacity: 0.9 }}>DEV</span>
        <span style={{ opacity: 0.7, fontWeight: 800 }}>{rows.length}</span>
        <span style={{ opacity: 0.55, fontWeight: 800 }}>tap</span>
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        right: 10,
        bottom: 10,
        zIndex: 9999,
        width: "min(520px, calc(100vw - 20px))",
        maxHeight: "40vh",
        overflow: "auto",
        background: "rgba(0,0,0,0.82)",
        color: "white",
        borderRadius: 12,
        padding: 10,
        fontSize: 12,
        lineHeight: 1.35,
        boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <div style={{ fontWeight: 900 }}>DEV HUD</div>
          <div style={{ opacity: 0.8 }}>sets: {rows.length}</div>
        </div>

        <button
          type="button"
          className="btn small"
          onClick={() => setCollapsed(true)}
          style={{
            background: "rgba(255,255,255,0.08)",
            color: "white",
            border: "1px solid rgba(255,255,255,0.18)",
          }}
          title="Collapse"
        >
          Collapse
        </button>
      </div>

      <div style={{ opacity: 0.85, marginTop: 4, marginBottom: 8 }}>
        session: <span style={{ opacity: 1 }}>{sessionId}</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 48px 56px 48px 56px 60px 40px", gap: 6 }}>
        <div style={{ opacity: 0.75 }}>track</div>
        <div style={{ opacity: 0.75 }}>kind</div>
        <div style={{ opacity: 0.75 }}>wt</div>
        <div style={{ opacity: 0.75 }}>reps</div>
        <div style={{ opacity: 0.75 }}>sec</div>
        <div style={{ opacity: 0.75 }}>dist</div>
        <div style={{ opacity: 0.75 }}>RIR</div>

        {rows.slice(-40).map((r) => (
          <React.Fragment key={r.id}>
            <div title={r.id} style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {r.done} {r.track}
            </div>
            <div>{r.kind}</div>
            <div>{r.weight}</div>
            <div>{r.reps}</div>
            <div>{r.seconds}</div>
            <div>{r.distance}</div>
            <div>{r.rir}</div>
          </React.Fragment>
        ))}
      </div>

      <div style={{ marginTop: 8, opacity: 0.65 }}>
        Dev-only. Removed from prod by <code style={{ opacity: 0.9 }}>import.meta.env.DEV</code>.
      </div>
    </div>
  );
}

/* ============================================================================
   End of file: src/pages/GymPage.tsx
   ============================================================================ */




