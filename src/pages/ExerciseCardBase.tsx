// /src/pages/ExerciseCardBase.tsx
/* ========================================================================== */
/*  ExerciseCardBase.tsx                                                      */
/*  BUILD_ID: 2026-02-18-ECB-02                                                */
/* -------------------------------------------------------------------------- */
/*  Unified Exercise Card (Gym Mode)                                           */
/*                                                                            */
/*  Goals (this iteration):                                                    */
/*  1) Keep the unified table stable (no hook violations; predictable deps)    */
/*  2) iPhone-only NumericPad UX (Path 2): prevent OS keyboard when enabled    */
/*  3) "Ghost" placeholders: previous (weight/reps) show as placeholder when   */
/*     current value is empty (Option A)                                       */
/*  4) RIR enforcement (on completion):                                       */
/*     - REQUIRED only for WORKING sets when track is NOT corrective           */
/*     - NOT enforced for correctives                                          */
/*     - NOT enforced for warmups/drops/failure (failure may auto-set to 0)    */
/*  5) Change 2: remove “running commentary” footer (no inline suggestion UI)  */
/*                                                                            */
/*  Fix (2026-02-18):                                                          */
/*  - Resolve Playwright flake where checkbox click races DB write for RIR      */
/*    (fill RIR -> immediately click ✓ -> se.rir still undefined).              */
/*  - On toggle, re-read set from Dexie once before enforcing “RIR required”.   */
/* ========================================================================== */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";

import { db } from "../db";
import type { TemplateItem, Track, SetEntry } from "../db";
import { uuid } from "../utils";

import { getBestSessionLastNDays, suggestionFromHistory } from "../progression";

import type { ExerciseSpec, SetKind } from "./exerciseSpecs";
import NumericPad from "../components/NumericPad";
import {
  useNumericPadController,
  type PadField,
  type PadTarget,
} from "../hooks/useNumericPadController";

/**
 * --- Breadcrumb ECB1 --------------------------------------------------------
 * Local widening (so this file can evolve UI without requiring immediate db.ts changes)
 */
type SetEntryX = SetEntry & {
  setType?: SetKind | string;
  completedAt?: number;
  seconds?: number;
};

type Props = {
  sessionId: string;
  item: TemplateItem;
  track: Track;
  sets: SetEntryX[];
  spec: ExerciseSpec;
};

/**
 * --- Breadcrumb ECB2 (Helpers: device detect) -------------------------------
 * NOTE: used only to gate NumericPad UX (iPhone-like only)
 */
function isIphoneLike(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  // iPhone + iPod (and iPad in "mobile" mode sometimes)
  return /iPhone|iPod/.test(ua) || (/iPad/.test(ua) && /Mobile/.test(ua));
}

function isMissingNumber(v: any): boolean {
  return v === undefined || v === null || String(v).trim() === "";
}

export default function ExerciseCardBase({ sessionId, item, track, sets, spec }: Props) {
  /**
   * --- Breadcrumb ECB3 (Targets / overrides) --------------------------------
   */
  const repMin = item.repMinOverride ?? track.repMin;
  const repMax = item.repMaxOverride ?? track.repMax;

  const warmupTarget = item.warmupSetsOverride ?? track.warmupSetsDefault;
  const workingTarget = item.workingSetsOverride ?? track.workingSetsDefault;

  const [restSec, setRestSec] = useState<number>(spec.defaultRestSec ?? 120);
  const timer = useRestTimer();

  /**
   * --- Breadcrumb ECB4 (Normalize + sort sets) ------------------------------
   * Normalize setType safely (avoid mutating Dexie objects)
   */
  const currentSets = useMemo(() => {
    const arr = (sets ?? [])
      .filter((s) => s.trackId === track.id)
      .slice()
      .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));

    return arr.map((s) => {
      let st: any = s.setType ?? "working";
      if (!["warmup", "working", "drop", "failure"].includes(String(st))) st = "working";
      return { ...s, setType: st };
    });
  }, [sets, track.id]);

  /**
   * --- Breadcrumb ECB5 (Working set numbering) ------------------------------
   * Only "working" sets get 1..N (used for previous-by-working-index mapping)
   */
  const workingIndexById = useMemo(() => {
    const map = new Map<string, number>();
    let n = 0;
    for (const s of currentSets) {
      if ((s.setType as SetKind) === "working") {
        n += 1;
        map.set(s.id, n);
      }
    }
    return map;
  }, [currentSets]);

  /**
   * --- Breadcrumb ECB6 (Previous column; spec-driven) ------------------------
   */
  const prevTextByWorkingIndex =
    spec.previousMode === "byWorkingIndex"
      ? usePrevByWorkingIndex(sessionId, track.id)
      : useMemo(() => new Map<number, string>(), []);

  /**
   * --- Breadcrumb ECB7 (Helper: parse previous -> placeholders) -------------
   * Pull first two numeric values from prevText into {weight,reps}
   * Works for: "95 x 10", "95 lb x 10 (W)", "95 × 10", etc.
   */
  const prevParsedByWorkingIndex = useMemo(() => {
    const m = new Map<number, { weight?: number; reps?: number }>();

    for (const [idx, txt] of prevTextByWorkingIndex.entries()) {
      const nums = String(txt).match(/[0-9]+(?:\.[0-9]+)?/g) ?? [];
      if (nums.length < 2) continue;

      const w = Number(nums[0]);
      const r = Number(nums[1]);

      m.set(idx, {
        weight: Number.isFinite(w) ? w : undefined,
        reps: Number.isFinite(r) ? r : undefined,
      });
    }

    return m;
  }, [prevTextByWorkingIndex]);

  /**
   * --- Breadcrumb ECB8 (Coaching: compute but DO NOT render footer) ----------
   * We keep bestSummary for the subtle line under the exercise header.
   * We DO NOT render “Next time: …” at the bottom anymore.
   */
  const [bestSummary, setBestSummary] = useState<string>("");
  const [prefillWeight, setPrefillWeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    let alive = true;

    (async () => {
      // Correctives: no coaching / no prefill
      if (track.trackType === "corrective") {
        if (!alive) return;
        setBestSummary("");
        setPrefillWeight(undefined);
        return;
      }

      const best = await getBestSessionLastNDays(track.id, 5);

      const res = await suggestionFromHistory({
        track,
        repMin,
        repMax,
        workingTarget,
        best,
        requiredConsecutive: 2,
      });

      if (!alive) return;
      setBestSummary(res.summary);
      setPrefillWeight(res.prefillWeight);
    })();

    return () => {
      alive = false;
    };
  }, [
    track.id,
    track.trackType,
    repMin,
    repMax,
    workingTarget,
    track.weightJumpDefault,
    track.rirTargetMin,
  ]);

  /**
   * --- Breadcrumb ECB9 (DB writes) ------------------------------------------
   */
  async function updateSet(id: string, patch: Partial<SetEntryX>) {
    await db.sets.update(id, patch as any);
  }

  async function addSet() {
    const id = uuid();
    const createdAt = Date.now();

    const lastForClone =
      spec.addSetClonePolicy === "cloneLastAny"
        ? [...currentSets].reverse().find(Boolean)
        : [...currentSets].reverse().find((s) => s.setType !== "warmup");

    const entry: SetEntryX = {
      id,
      sessionId,
      trackId: track.id,
      createdAt,
      setType: "working",
    };

    if (track.trackingMode === "weightedReps") {
      if (lastForClone?.weight !== undefined) entry.weight = lastForClone.weight;
      else if (prefillWeight !== undefined) entry.weight = prefillWeight;
    }

    await db.sets.add(entry as any);
  }

  async function deleteSet(id: string) {
    await db.sets.delete(id);
  }

  /**
   * --- Breadcrumb ECB10 (UI helpers) ----------------------------------------
   */
  function restLabel(seconds: number) {
    const mm = String(Math.floor(seconds / 60));
    const ss = String(seconds % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  }

  const addLabel = timer.running ? restLabel(timer.remainingSec) : restLabel(restSec);
  const allowedSetTypes = spec.allowSetTypes ?? ["warmup", "working", "drop", "failure"];

  /**
   * --- Breadcrumb ECB11 (NumericPad: iPhone-only / Path 2) -------------------
   */
  const iphone = isIphoneLike();

  const pad = useNumericPadController(async (target, value) => {
    const patch: any = {};
    if (target.field === "weight") patch.weight = value;
    if (target.field === "reps") patch.reps = value;
    if (target.field === "rir") patch.rir = value;
    await updateSet(target.setId, patch);
  });

  // Only treat pad as "enabled UX" on iPhone-like devices
  const padUXEnabled = iphone && pad.enabled;

  // Determine next navigation (field + row)
  const orderedSetIds = useMemo(() => currentSets.map((s) => s.id), [currentSets]);

  function nextTarget(from: PadTarget): PadTarget | null {
    const fields: PadField[] =
      track.trackingMode === "weightedReps"
        ? ["weight", "reps", "rir"]
        : track.trackingMode === "repsOnly"
        ? ["reps"]
        : track.trackingMode === "breaths"
        ? ["reps"]
        : [];

    if (!fields.length) return null;

    const fIdx = fields.indexOf(from.field);
    const rowIdx = orderedSetIds.indexOf(from.setId);
    if (rowIdx < 0) return null;

    // next field in same row
    if (fIdx >= 0 && fIdx < fields.length - 1) {
      return { setId: from.setId, field: fields[fIdx + 1] };
    }

    // next row first field
    const nextRowId = orderedSetIds[rowIdx + 1];
    if (!nextRowId) return null;
    return { setId: nextRowId, field: fields[0] };
  }

  function padTitle(): string {
    if (!pad.active) return "Enter value";
    if (pad.active.field === "weight") return "Weight";
    if (pad.active.field === "reps") return "Reps";
    return "RIR";
  }

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ marginBottom: 6 }}>{track.displayName}</h3>

          {track.trackType !== "corrective" && track.trackingMode === "weightedReps" && (
            <div className="muted">
              Rep range: <b>{repMin}–{repMax}</b>{" "}
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

          {/* Subtle coaching line under header is OK */}
          {track.trackType !== "corrective" && bestSummary && (
            <div className="muted" style={{ marginTop: 6 }}>
              {bestSummary}
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
            const kind = ((se.setType as SetKind) ?? "working") as SetKind;

            const label =
              kind === "warmup"
                ? "W"
                : kind === "drop"
                ? "D"
                : kind === "failure"
                ? "F"
                : String(workingIndexById.get(se.id) ?? "");

            const workingIndex = workingIndexById.get(se.id);
            const prevText =
              kind === "working" && workingIndex ? prevTextByWorkingIndex.get(workingIndex) ?? "" : "";

            const prevParsed = workingIndex ? prevParsedByWorkingIndex.get(workingIndex) : undefined;

            /**
             * --- Breadcrumb ECB12 (RIR requirement on completion) -------------
             * Enforce RIR ONLY for non-corrective WORKING sets in weightedReps.
             * Not enforced for correctives, warmups, drops, failure.
             */
            const requireRirOnComplete =
              track.trackType !== "corrective" &&
              track.trackingMode === "weightedReps" &&
              kind === "working";

            return (
              <SetRow
                key={se.id}
                se={se}
                label={label}
                prevText={prevText}
                track={track}
                done={done}
                allowedSetTypes={allowedSetTypes}
                prevWeight={prevParsed?.weight}
                prevReps={prevParsed?.reps}
                padUXEnabled={padUXEnabled}
                onOpenPad={(field, currentValue) => {
                  if (!padUXEnabled) return;
                  pad.open({ setId: se.id, field }, currentValue);
                }}
                onChange={updateSet}
                onDelete={deleteSet}
                onSetType={async (t) => {
                  const patch: Partial<SetEntryX> = { setType: t };
                  if (t === "failure" && spec.autoRirForFailure) patch.rir = 0;
                  await updateSet(se.id, patch);
                }}
                onToggleDone={async (next) => {
                  if (next) {
                    // --- Fix: re-read once to avoid race between typing RIR and clicking ✓ ---
                    let effectiveRir = se.rir;

                    if (requireRirOnComplete && isMissingNumber(effectiveRir)) {
                      const fresh = (await db.sets.get(se.id)) as any;
                      effectiveRir = fresh?.rir;
                    }

                    // Enforce RIR ONLY for non-corrective WORKING sets
                    if (requireRirOnComplete && isMissingNumber(effectiveRir)) {
                      // If NumericPad UX is enabled, take user straight to RIR
                      if (padUXEnabled) pad.open({ setId: se.id, field: "rir" }, effectiveRir as any);
                      return; // do not complete
                    }

                    const patch: Partial<SetEntryX> = { completedAt: Date.now() };
                    if (kind === "failure" && spec.autoRirForFailure) patch.rir = 0;

                    await updateSet(se.id, patch);
                    if (kind !== "warmup") timer.start(restSec);
                  } else {
                    await updateSet(se.id, { completedAt: undefined });
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

      {/* --- Breadcrumb ECB13 (Change 2) --------------------------------------
          Removed “running commentary” footer:
          - No inline suggestion text rendered below the table.
      --------------------------------------------------------------------- */}

      {/* iPhone-only numeric pad */}
      {iphone && (
        <NumericPad
          visible={pad.visible}
          decimalEnabled={pad.decimalEnabled}
          title={padTitle()}
          onKey={pad.key}
          onBackspace={pad.backspace}
          onClear={pad.clear}
          onDone={() => pad.close(true)}
          onNext={async () => {
            if (!pad.active) return;

            // commit current
            await pad.commitActive();

            // move to next target
            const nt = nextTarget(pad.active);
            if (!nt) {
              await pad.close(false);
              return;
            }

            // open next
            pad.setActive(nt);

            // initialize buffer from current snapshot (local)
            const s = currentSets.find((x) => x.id === nt.setId) as any;
            const currentValue =
              nt.field === "weight" ? s?.weight : nt.field === "reps" ? s?.reps : s?.rir;

            pad.setBuffer(currentValue == null ? "" : String(currentValue));
          }}
        />
      )}
    </div>
  );
}

/**
 * --- Breadcrumb ECB14 -------------------------------------------------------
 * SetRow
 *
 * Behaviors:
 * - Ghost placeholders (prev weight/reps) via placeholder ONLY (Option A)
 * - If NumericPad UX is enabled (iPhone), inputs become readOnly and open pad on focus/tap
 * - Row lock: when completed, disable inputs/select/delete; uncheck unlocks
 * ---------------------------------------------------------------------------
 */
function SetRow({
  se,
  label,
  prevText,
  track,
  done,
  allowedSetTypes,
  prevWeight,
  prevReps,
  padUXEnabled,
  onOpenPad,
  onChange,
  onDelete,
  onSetType,
  onToggleDone,
}: {
  se: SetEntryX;
  label: string;
  prevText: string;
  track: Track;
  done: boolean;
  allowedSetTypes: SetKind[];
  prevWeight?: number;
  prevReps?: number;
  padUXEnabled: boolean;
  onOpenPad: (field: PadField, currentValue?: number) => void;
  onChange: (id: string, patch: Partial<SetEntryX>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onSetType: (t: SetKind) => Promise<void>;
  onToggleDone: (next: boolean) => Promise<void>;
}) {
  const selectRef = useRef<HTMLSelectElement | null>(null);

  function openTypePicker() {
    selectRef.current?.focus();
    selectRef.current?.click();
  }

  function num(v: string): number | undefined {
    const t = v.trim();
    if (!t) return undefined;
    const x = Number(t);
    return Number.isFinite(x) ? x : undefined;
  }

  const kind = ((se.setType as SetKind) ?? "working") as SetKind;
  const rowClass = "set-row" + (done ? " done" : "") + (kind === "warmup" ? " warmup" : "");
  const locked = done;

  // Placeholder-only prefills (Option A)
  const weightPh = se.weight == null && prevWeight != null ? String(prevWeight) : "lbs";
  const repsPh = se.reps == null && prevReps != null ? String(prevReps) : "reps";

  const openPadIfEnabled = (field: PadField) => {
    if (!padUXEnabled) return;
    const currentValue =
      field === "weight" ? (se.weight as any) : field === "reps" ? (se.reps as any) : (se.rir as any);
    onOpenPad(field, currentValue);
  };

  return (
    <div className={rowClass}>
      <div className="set-badge-wrap">
        <button
          className="set-badge"
          type="button"
          onClick={openTypePicker}
          title="Set type"
          disabled={locked}
        >
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
          {allowedSetTypes.includes("working") && <option value="working">Working (1/2/3…)</option>}
          {allowedSetTypes.includes("warmup") && <option value="warmup">W • Warm-up</option>}
          {allowedSetTypes.includes("drop") && <option value="drop">D • Drop</option>}
          {allowedSetTypes.includes("failure") && <option value="failure">F • Failure</option>}
        </select>
      </div>

      <div className="prev-cell">{prevText || "—"}</div>

      {track.trackingMode === "weightedReps" && (
        <>
          <input
            className="cell-input"
            placeholder={weightPh}
            value={se.weight ?? ""}
            inputMode="decimal"
            readOnly={padUXEnabled}
            disabled={locked}
            onFocus={() => openPadIfEnabled("weight")}
            onClick={() => openPadIfEnabled("weight")}
            onChange={(e) => onChange(se.id, { weight: num(e.target.value) })}
          />
          <input
            className="cell-input"
            placeholder={repsPh}
            value={se.reps ?? ""}
            inputMode="numeric"
            readOnly={padUXEnabled}
            disabled={locked}
            onFocus={() => openPadIfEnabled("reps")}
            onClick={() => openPadIfEnabled("reps")}
            onChange={(e) => onChange(se.id, { reps: num(e.target.value) })}
          />
          <input
            className="cell-input"
            placeholder="rir"
            value={se.rir ?? ""}
            inputMode="decimal"
            readOnly={padUXEnabled}
            disabled={locked || kind === "failure"}
            onFocus={() => openPadIfEnabled("rir")}
            onClick={() => openPadIfEnabled("rir")}
            onChange={(e) => onChange(se.id, { rir: num(e.target.value) })}
          />
        </>
      )}

      {track.trackingMode === "repsOnly" && (
        <>
          <div className="muted">—</div>
          <input
            className="cell-input"
            placeholder={repsPh}
            value={se.reps ?? ""}
            inputMode="numeric"
            readOnly={padUXEnabled}
            disabled={locked}
            onFocus={() => openPadIfEnabled("reps")}
            onClick={() => openPadIfEnabled("reps")}
            onChange={(e) => onChange(se.id, { reps: num(e.target.value) })}
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
            disabled={locked}
            onChange={(e) => onChange(se.id, { seconds: num(e.target.value) } as any)}
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
            readOnly={padUXEnabled}
            disabled={locked}
            onFocus={() => openPadIfEnabled("reps")}
            onClick={() => openPadIfEnabled("reps")}
            onChange={(e) => onChange(se.id, { reps: num(e.target.value) })}
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

/**
 * --- Breadcrumb ECB15 (Helpers) ---------------------------------------------
 * Rest timer
 * ---------------------------------------------------------------------------
 */
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

/**
 * --- Breadcrumb ECB16 (Helpers) ---------------------------------------------
 * Previous session’s same exercise + same working-set index
 * ---------------------------------------------------------------------------
 */
function usePrevByWorkingIndex(currentSessionId: string, trackId: string) {
  const data = useLiveQuery(async () => {
    const recent = (await db.sets.where("trackId").equals(trackId).reverse().sortBy("createdAt")) as SetEntryX[];

    const sessionIds = Array.from(
      new Set(recent.map((s) => s.sessionId).filter((sid) => sid !== currentSessionId))
    ).slice(0, 30);

    if (!sessionIds.length) {
      return { prevSessionId: undefined as string | undefined, prevSets: [] as SetEntryX[] };
    }

    const sessions = (await db.sessions.bulkGet(sessionIds)).filter(Boolean) as any[];
    const ended = sessions
      .filter((s) => typeof s.endedAt === "number")
      .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0));

    if (!ended.length) {
      return { prevSessionId: undefined as string | undefined, prevSets: [] as SetEntryX[] };
    }

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
