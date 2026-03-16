// src/pages/PasteWorkoutPage.tsx
/* ============================================================================
   PasteWorkoutPage.tsx — Paste Coach Workout -> Preview -> Import -> Rollback
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-03-16-PASTEWORKOUT-06
   FILE: src/pages/PasteWorkoutPage.tsx

   Purpose
   - Allow ChatGPT coach output to be pasted directly into IronForge
   - Parse a simple workout text format
   - Preview before writing to DB
   - Support dry run + rollback
   - Preserve real session date/start/end times
   - Reuse existing exercise / track matching via normalizeName()
   - Block accidental duplicate session imports for the same day + program day

   Supported input format (MVP+)
   ----------------------------------------------------------------------------
   Session: Upper A
   Date: 2026-03-09
   Start: 08:20
   End: 10:17

   Bench Press
   warmup 45x10
   warmup 95x8
   warmup 115x5
   warmup 125x3
   work 135x9 @2.5 full ROM
   work 145x6 @2 full ROM
   work 150x3 @1 deeper range

   Incline DB Press
   warmup 45x10
   work 55x9 @1 setup awkward
   work 50x7 @1.5
   work 40x10 @2

   Assisted Pull Up
   warmup 90x6 activation
   work 80x10 @3
   work 75x9 @3
   work 70x8 @2

   Additional supported set variants
   - work BWx12
   - work BWx12/side
   - work BWx30s
   - work BWx30s/side
   - work 15x12/side @3
   - warmup Barx10
   - technique 65x10 notes
   - test 95x12 @4 notes
   - cardio 15 min Zone 1 treadmill
   - work 50x40m
   - work 15min

   Notes
   - Exercise line = plain text line that is not metadata and not a set line
   - Section headers like "Correctives" or "# Main Lifts" are ignored
   - technique / test / cardio are imported as working sets with a tag in notes
   - /side is preserved in notes as "per-side" for now
   - "Bar" is interpreted as 45 lb
   - Distance sets are preserved in notes for now (e.g. "40m")
   - Time-only sets are imported into seconds when possible
   - Duplicate guard blocks import when the same program day already exists on
     the same calendar date
   ============================================================================ */

import React, { useMemo, useState } from "react";
import {
  db,
  Exercise,
  Session,
  SessionItem,
  SetEntry,
  Track,
  TrackType,
  TrackingMode,
  normalizeName,
} from "../db";
import { uuid } from "../utils";
import { addAppLog } from "../appLog";

/* ============================================================================
   Breadcrumb 1 — Types
   ============================================================================ */

type ParsedSetKind = "warmup" | "work" | "technique" | "test" | "cardio";

type ParsedSet = {
  rawLine: string;
  setKind: ParsedSetKind;
  weight?: number;
  reps?: number;
  seconds?: number;
  rir?: number;
  isBodyweight?: boolean;
  isPerSide?: boolean;
  notes?: string;
};

type ParsedExerciseBlock = {
  exercise: string;
  sets: ParsedSet[];
};

type ParsedWorkout = {
  programDay: string;
  date: string; // YYYY-MM-DD
  start?: string; // HH:mm
  end?: string; // HH:mm
  exercises: ParsedExerciseBlock[];
  warnings: string[];
  failedLines: string[];
};

type LastPasteImportRecord = {
  importId: string;
  createdAt: number;
  sessionIds: string[];
  summary: string;
};

type PreviewSummary = {
  exerciseCount: number;
  setCount: number;
  warningCount: number;
  failedLineCount: number;
  wouldAddExercises: number;
  wouldAddTracks: number;
  wouldAddSessions: number;
  wouldAddSessionItems: number;
  wouldAddSets: number;
  duplicateSessionFound: boolean;
  duplicateSessionId?: string;
};

type ResultTone = "info" | "success" | "warn";

type ResultStyle = {
  border: string;
  background: string;
  accent: string;
};

/* ============================================================================
   Breadcrumb 2 — Constants
   ============================================================================ */

const LAST_IMPORT_KEY = "workout_last_paste_import_v1";
const PAGE_VERSION = "6";
const BUILD_ID = "2026-03-16-PASTEWORKOUT-06";
const FILE_FOOTER = "src/pages/PasteWorkoutPage.tsx";

const SAMPLE_TEXT = `Session: Upper A
Date: 2026-03-09
Start: 08:20
End: 10:17

Bench Press
warmup 45x10
warmup 95x8
warmup 115x5
warmup 125x3
work 135x9 @2.5 full ROM
work 145x6 @2 full ROM
work 150x3 @1 deeper range

Incline DB Press
warmup 45x10
work 55x9 @1 setup awkward
work 50x7 @1.5
work 40x10 @2

Assisted Pull Up
warmup 90x6 activation
work 80x10 @3
work 75x9 @3
work 70x8 @2

Farmer Carry
work 50x40m
work 50x40m
work 50x40m

Treadmill Walk (Z1)
work 15min`;

/* ============================================================================
   Breadcrumb 3 — Local storage helpers
   ============================================================================ */

function saveLastImport(rec: LastPasteImportRecord) {
  localStorage.setItem(LAST_IMPORT_KEY, JSON.stringify(rec));
}

function loadLastImport(): LastPasteImportRecord | null {
  const raw = localStorage.getItem(LAST_IMPORT_KEY);
  if (!raw) return null;

  try {
    const obj = JSON.parse(raw);
    if (!obj?.importId || !Array.isArray(obj.sessionIds)) return null;
    return obj as LastPasteImportRecord;
  } catch {
    return null;
  }
}

function clearLastImport() {
  localStorage.removeItem(LAST_IMPORT_KEY);
}

/* ============================================================================
   Breadcrumb 4 — Parsing helpers
   ============================================================================ */

function isBlank(line: string): boolean {
  return !line.trim();
}

function isSectionHeader(line: string): boolean {
  const s = line.trim().toLowerCase();

  return [
    "correctives",
    "mobility",
    "activation",
    "warmup",
    "warmups",
    "main lifts",
    "accessories",
    "finisher",
    "finishers",
    "cooldown",
  ].includes(s);
}

function normalizeTimeString(s: string): string | undefined {
  const m = s.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return undefined;

  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return undefined;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return undefined;

  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function parseDateOnly(dateStr: string): { y: number; m: number; d: number } | null {
  const m = dateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;

  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);

  if (!y || !mo || !d) return null;
  return { y, m: mo, d };
}

function dateTimeToMs(dateStr: string, timeStr?: string): number {
  const dt = parseDateOnly(dateStr);
  if (!dt) return Date.now();

  const safeTime = normalizeTimeString(timeStr || "09:00") || "09:00";
  const [hh, mm] = safeTime.split(":").map(Number);

  return new Date(dt.y, dt.m - 1, dt.d, hh, mm, 0, 0).getTime();
}

function sameCalendarDay(ms: number, dateStr: string): boolean {
  const dt = parseDateOnly(dateStr);
  if (!dt) return false;

  const d = new Date(ms);
  return d.getFullYear() === dt.y && d.getMonth() === dt.m - 1 && d.getDate() === dt.d;
}

async function findExistingSessionForProgramDay(
  programDay: string,
  dateStr: string
): Promise<Session | null> {
  const sessions = await db.sessions.toArray();

  const match =
    sessions.find((s) => {
      const sameName =
        normalizeName(String(s.templateName || "")) === normalizeName(programDay);
      const sameDay = sameCalendarDay(s.startedAt, dateStr);
      return sameName && sameDay;
    }) || null;

  return match;
}

function normalizeExerciseDisplayName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

function inferTrackingMode(
  exerciseName: string,
  hasWeight: boolean,
  hasReps: boolean
): TrackingMode {
  const s = exerciseName.toLowerCase();

  if (s.includes("plank") || s.includes("hold")) return "timeSeconds";
  if (!hasWeight && hasReps) return "repsOnly";
  if (s.includes("band") || s.includes("pull-apart") || s.includes("pull apart")) {
    return "repsOnly";
  }

  return "weightedReps";
}

function defaultTrackType(exerciseName: string): TrackType {
  const s = exerciseName.toLowerCase();

  if (
    s.includes("breathing") ||
    s.includes("reset") ||
    s.includes("mobility") ||
    s.includes("stretch") ||
    s.includes("clamshell") ||
    s.includes("clams")
  ) {
    return "corrective";
  }

  if (
    s.includes("walk") ||
    s.includes("bike") ||
    s.includes("cardio") ||
    s.includes("treadmill")
  ) {
    return "cardio";
  }

  return "hypertrophy";
}

function buildSetNotes(set: ParsedSet): string | undefined {
  const parts: string[] = [];

  if (set.setKind === "technique") parts.push("technique");
  if (set.setKind === "test") parts.push("test");
  if (set.setKind === "cardio") parts.push("cardio");

  const noteText = String(set.notes || "").trim();
  if (noteText) parts.push(noteText);

  return parts.length ? parts.join(" | ") : undefined;
}

function parseWeightToken(
  token: string
): {
  weight?: number;
  isBodyweight?: boolean;
} | null {
  const t = token.trim().toLowerCase();

  if (t === "bw") {
    return { weight: 0, isBodyweight: true };
  }

  if (t === "bar") {
    return { weight: 45, isBodyweight: false };
  }

  const n = Number(t);
  if (!Number.isFinite(n)) return null;

  return { weight: n, isBodyweight: false };
}

function durationToSeconds(valueRaw: string, unitRaw: string): number | undefined {
  const value = Number(valueRaw);
  if (!Number.isFinite(value)) return undefined;

  const unit = unitRaw.toLowerCase();

  if (["s", "sec", "secs", "second", "seconds"].includes(unit)) {
    return Math.round(value);
  }

  if (["min", "mins", "minute", "minutes"].includes(unit)) {
    return Math.round(value * 60);
  }

  if (["hr", "hrs", "hour", "hours"].includes(unit)) {
    return Math.round(value * 3600);
  }

  return undefined;
}

function previewDurationToken(seconds: number): string {
  if (!Number.isFinite(seconds)) return "—";
  if (seconds % 3600 === 0) return `${seconds / 3600}hr`;
  if (seconds % 60 === 0) return `${seconds / 60}min`;
  return `${seconds}s`;
}

function parseSetLine(line: string): ParsedSet | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const cardioMatch = trimmed.match(/^(cardio)\s+(.+)$/i);
  if (cardioMatch) {
    return {
      rawLine: line,
      setKind: "cardio",
      notes: cardioMatch[2].trim(),
    };
  }

  /* ------------------------------------------------------------------------
     Breadcrumb — Standard weighted / BW / bar sets
     Examples
     - work 125x7 @2
     - work BWx12/side
     - work BWx30s
     - warmup Barx10
     --------------------------------------------------------------------- */
  const standardMatch = trimmed.match(
    /^(warmup|work|technique|test)\s+(BW|Bar|-?\d+(?:\.\d+)?)x(\d+)(s)?(?:\/(side))?(?:\s+@(\d+(?:\.\d+)?))?(?:\s+(.*))?$/i
  );

  if (standardMatch) {
    const kindRaw = standardMatch[1].toLowerCase() as ParsedSetKind;
    const weightRaw = standardMatch[2];
    const countRaw = standardMatch[3];
    const isSeconds = !!standardMatch[4];
    const isPerSide = !!standardMatch[5];
    const rirRaw = standardMatch[6];
    const notes = standardMatch[7]?.trim() || undefined;

    const parsedWeight = parseWeightToken(weightRaw);
    if (!parsedWeight) return null;

    const count = Number(countRaw);
    const rir = rirRaw !== undefined ? Number(rirRaw) : undefined;

    return {
      rawLine: line,
      setKind: kindRaw,
      weight: parsedWeight.weight,
      reps: !isSeconds && Number.isFinite(count) ? count : undefined,
      seconds: isSeconds && Number.isFinite(count) ? count : undefined,
      rir: rir !== undefined && Number.isFinite(rir) ? rir : undefined,
      isBodyweight: !!parsedWeight.isBodyweight,
      isPerSide,
      notes,
    };
  }

  /* ------------------------------------------------------------------------
     Breadcrumb — Distance sets
     Examples
     - work 50x40m
     - work 50x40yd
     Notes
     - For MVP, preserve distance in notes and store numeric count in reps
     --------------------------------------------------------------------- */
  const distanceMatch = trimmed.match(
    /^(warmup|work|technique|test)\s+(BW|Bar|-?\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)(m|meter|meters|ft|yd)(?:\/(side))?(?:\s+@(\d+(?:\.\d+)?))?(?:\s+(.*))?$/i
  );

  if (distanceMatch) {
    const kindRaw = distanceMatch[1].toLowerCase() as ParsedSetKind;
    const weightRaw = distanceMatch[2];
    const distanceRaw = distanceMatch[3];
    const unitRaw = distanceMatch[4];
    const isPerSide = !!distanceMatch[5];
    const rirRaw = distanceMatch[6];
    const notesRaw = distanceMatch[7]?.trim() || "";

    const parsedWeight = parseWeightToken(weightRaw);
    if (!parsedWeight) return null;

    const distanceNum = Number(distanceRaw);
    const rir = rirRaw !== undefined ? Number(rirRaw) : undefined;

    const noteParts = [`${distanceRaw}${unitRaw}`];
    if (notesRaw) noteParts.push(notesRaw);

    return {
      rawLine: line,
      setKind: kindRaw,
      weight: parsedWeight.weight,
      reps: Number.isFinite(distanceNum) ? distanceNum : undefined,
      rir: rir !== undefined && Number.isFinite(rir) ? rir : undefined,
      isBodyweight: !!parsedWeight.isBodyweight,
      isPerSide,
      notes: noteParts.join(" | "),
    };
  }

  /* ------------------------------------------------------------------------
     Breadcrumb — Time-only sets
     Examples
     - work 15min
     - work 30s
     - work 15min @2
     - work 30s/side
     --------------------------------------------------------------------- */
  const timeOnlyMatch = trimmed.match(
    /^(warmup|work|technique|test)\s+(\d+(?:\.\d+)?)(s|sec|secs|second|seconds|min|mins|minute|minutes|hr|hrs|hour|hours)(?:\/(side))?(?:\s+@(\d+(?:\.\d+)?))?(?:\s+(.*))?$/i
  );

  if (timeOnlyMatch) {
    const kindRaw = timeOnlyMatch[1].toLowerCase() as ParsedSetKind;
    const durationRaw = timeOnlyMatch[2];
    const unitRaw = timeOnlyMatch[3];
    const isPerSide = !!timeOnlyMatch[4];
    const rirRaw = timeOnlyMatch[5];
    const notesRaw = timeOnlyMatch[6]?.trim() || "";

    const seconds = durationToSeconds(durationRaw, unitRaw);
    const rir = rirRaw !== undefined ? Number(rirRaw) : undefined;

    const noteParts = [`${durationRaw}${unitRaw}`];
    if (notesRaw) noteParts.push(notesRaw);

    return {
      rawLine: line,
      setKind: kindRaw,
      seconds,
      rir: rir !== undefined && Number.isFinite(rir) ? rir : undefined,
      isPerSide,
      notes: noteParts.join(" | "),
    };
  }

  return null;
}

function formatParsedSetPreview(set: ParsedSet): string {
  const prefix = `${set.setKind} • `;

  const base =
    set.seconds !== undefined && (set.weight === undefined || set.weight === 0)
      ? `${previewDurationToken(set.seconds)}`
      : `${set.isBodyweight ? "BW" : set.weight ?? "—"} x ${
          set.seconds !== undefined ? previewDurationToken(set.seconds) : set.reps ?? "—"
        }`;

  return `${prefix}${base}${set.isPerSide ? " /side" : ""}${set.rir !== undefined ? ` @${set.rir}` : ""}${set.notes ? ` • ${set.notes}` : ""}`;
}

function parseWorkoutText(text: string): ParsedWorkout {
  const lines = text.replace(/\r/g, "").split("\n");

  let programDay = "";
  let date = "";
  let start = "";
  let end = "";

  const warnings: string[] = [];
  const failedLines: string[] = [];
  const exercises: ParsedExerciseBlock[] = [];

  let currentExercise: ParsedExerciseBlock | null = null;

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const line = raw.trim();

    if (isBlank(line)) continue;

    const sessionMatch = line.match(/^session\s*:\s*(.+)$/i);
    if (sessionMatch) {
      programDay = sessionMatch[1].trim();
      currentExercise = null;
      continue;
    }

    const dateMatch = line.match(/^date\s*:\s*(.+)$/i);
    if (dateMatch) {
      date = dateMatch[1].trim();
      currentExercise = null;
      continue;
    }

    const startMatch = line.match(/^start\s*:\s*(.+)$/i);
    if (startMatch) {
      start = startMatch[1].trim();
      currentExercise = null;
      continue;
    }

    const endMatch = line.match(/^end\s*:\s*(.+)$/i);
    if (endMatch) {
      end = endMatch[1].trim();
      currentExercise = null;
      continue;
    }

    if (isSectionHeader(line) || line.startsWith("#")) {
      currentExercise = null;
      continue;
    }

    const parsedSet = parseSetLine(line);
    if (parsedSet) {
      if (!currentExercise) {
        failedLines.push(raw);
      } else {
        currentExercise.sets.push(parsedSet);
      }
      continue;
    }

    /* ----------------------------------------------------------------------
       Breadcrumb — Guard unsupported set-like lines
       Why this matters
       - Prevent lines like "work 50x40m" or "work 15min" from becoming fake
         exercise titles when a future format is not yet supported
       ------------------------------------------------------------------- */
    if (/^(warmup|work|technique|test|cardio)\b/i.test(line)) {
      warnings.push(
        `Unsupported set format under ${currentExercise?.exercise ?? "unknown exercise"}: ${line}`
      );
      failedLines.push(raw);
      continue;
    }

    currentExercise = {
      exercise: normalizeExerciseDisplayName(line),
      sets: [],
    };
    exercises.push(currentExercise);
  }

  if (!programDay) warnings.push("Missing Session: line");
  if (!date) warnings.push("Missing Date: line");
  if (date && !parseDateOnly(date)) warnings.push("Date must be YYYY-MM-DD");
  if (start && !normalizeTimeString(start)) {
    warnings.push("Start time should look like HH:mm");
  }
  if (end && !normalizeTimeString(end)) {
    warnings.push("End time should look like HH:mm");
  }

  for (const ex of exercises) {
    if (!ex.sets.length) warnings.push(`Exercise has no parsed sets: ${ex.exercise}`);
  }

  return {
    programDay: programDay || "Imported Session",
    date,
    start: normalizeTimeString(start),
    end: normalizeTimeString(end),
    exercises,
    warnings,
    failedLines,
  };
}

/* ============================================================================
   Breadcrumb 5 — Page
   ============================================================================ */

export default function PasteWorkoutPage() {
  const [pasteText, setPasteText] = useState<string>(SAMPLE_TEXT);
  const [status, setStatus] = useState<string>("");
  const [dryRun, setDryRun] = useState<boolean>(true);
  const [parsed, setParsed] = useState<ParsedWorkout | null>(null);
  const [preview, setPreview] = useState<PreviewSummary | null>(null);
  const [lastImport, setLastImport] = useState<LastPasteImportRecord | null>(() =>
    loadLastImport()
  );

  const canImport = useMemo(() => !!parsed && !!preview, [parsed, preview]);
  const canRollback = useMemo(() => !!lastImport?.sessionIds?.length, [lastImport]);
  const footer = useMemo(
    () => `${FILE_FOOTER} • v${PAGE_VERSION} • ${BUILD_ID}`,
    []
  );

  const topResultTitle = useMemo(() => {
    if (!status) return "";

    const s = status.toLowerCase();

    if (dryRun && s.includes("dry run")) return "Dry Run Result";
    if (!dryRun && s.includes("imported")) return "Import Complete";
    if (s.includes("parsing")) return "Parsing";
    if (s.includes("parsed")) return "Preview Ready";
    if (s.includes("rollback")) return "Rollback";
    if (s.includes("blocked")) return "Import Blocked";

    return "Status";
  }, [status, dryRun]);

  const topResultTone = useMemo<ResultTone>(() => {
    const s = status.toLowerCase();

    if (s.includes("blocked") || s.includes("failed")) return "warn";
    if (s.includes("imported") || s.includes("parsed") || s.includes("dry run ✓")) {
      return "success";
    }

    return "info";
  }, [status]);

  const topResultStyles = useMemo<ResultStyle>(() => {
    if (topResultTone === "success") {
      return {
        border: "1px solid var(--line)",
        background: "var(--card)",
        accent: "✓",
      };
    }

    if (topResultTone === "warn") {
      return {
        border: "1px solid var(--line)",
        background: "var(--card)",
        accent: "!",
      };
    }

    return {
      border: "1px solid var(--line)",
      background: "var(--card)",
      accent: "…",
    };
  }, [topResultTone]);

  /* --------------------------------------------------------------------------
     Breadcrumb 6 — Preview parse + dry run summary
     ----------------------------------------------------------------------- */

  async function buildPreview(parsedWorkout: ParsedWorkout): Promise<PreviewSummary> {
    const existingExercises = await db.exercises.toArray();
    const existingTracks = await db.tracks.toArray();

    const exerciseKeys = new Set(existingExercises.map((e) => normalizeName(e.name)));
    const trackKeys = new Set(existingTracks.map((t) => normalizeName(t.displayName)));

    const importableExercises = parsedWorkout.exercises.filter((ex) => ex.sets.length > 0);

    let wouldAddExercises = 0;
    let wouldAddTracks = 0;
    let wouldAddSessions = 0;
    let wouldAddSessionItems = 0;
    let wouldAddSets = 0;

    for (const ex of importableExercises) {
      const norm = normalizeName(ex.exercise);

      if (!exerciseKeys.has(norm)) {
        wouldAddExercises += 1;
        exerciseKeys.add(norm);
      }

      if (!trackKeys.has(norm)) {
        wouldAddTracks += 1;
        trackKeys.add(norm);
      }

      wouldAddSessionItems += 1;
      wouldAddSets += ex.sets.length;
    }

    if (importableExercises.length > 0) {
      wouldAddSessions = 1;
    }

    const existingSession =
      parsedWorkout.date && parsedWorkout.programDay
        ? await findExistingSessionForProgramDay(parsedWorkout.programDay, parsedWorkout.date)
        : null;

    return {
      exerciseCount: parsedWorkout.exercises.length,
      setCount: parsedWorkout.exercises.reduce((sum, ex) => sum + ex.sets.length, 0),
      warningCount: parsedWorkout.warnings.length,
      failedLineCount: parsedWorkout.failedLines.length,
      wouldAddExercises,
      wouldAddTracks,
      wouldAddSessions: existingSession ? 0 : wouldAddSessions,
      wouldAddSessionItems: existingSession ? 0 : wouldAddSessionItems,
      wouldAddSets: existingSession ? 0 : wouldAddSets,
      duplicateSessionFound: !!existingSession,
      duplicateSessionId: existingSession?.id,
    };
  }

  async function parsePreviewNow() {
    setStatus("Parsing pasted workout…");

    const p = parseWorkoutText(pasteText);
    const pv = await buildPreview(p);

    if (pv.duplicateSessionFound) {
      p.warnings.push(`Session already exists for ${p.programDay} on ${p.date}`);
    }

    setParsed(p);
    setPreview({
      ...pv,
      warningCount: p.warnings.length,
      failedLineCount: p.failedLines.length,
    });

    await addAppLog({
      type: "import",
      level: "info",
      message: "Parsed pasted workout for preview",
      detailsJson: JSON.stringify({
        programDay: p.programDay,
        date: p.date,
        start: p.start,
        end: p.end,
        exerciseCount: pv.exerciseCount,
        setCount: pv.setCount,
        duplicateSessionFound: pv.duplicateSessionFound,
        duplicateSessionId: pv.duplicateSessionId,
        warnings: p.warnings,
        failedLines: p.failedLines,
      }),
    });

    setStatus("Parsed ✓ Review preview below.");
  }

  /* --------------------------------------------------------------------------
     Breadcrumb 7 — Rollback
     ----------------------------------------------------------------------- */

  async function rollbackLastImport() {
    const rec = loadLastImport();
    if (!rec || !rec.sessionIds?.length) {
      setStatus("No last paste import found to rollback.");
      setLastImport(null);
      return;
    }

    setStatus(`Rolling back last paste import (${rec.sessionIds.length} sessions)…`);

    const setIds = await db.sets.where("sessionId").anyOf(rec.sessionIds).primaryKeys();
    if (setIds.length) await db.sets.bulkDelete(setIds as string[]);

    const siIds = await db.sessionItems
      .where("sessionId")
      .anyOf(rec.sessionIds)
      .primaryKeys();
    if (siIds.length) await db.sessionItems.bulkDelete(siIds as string[]);

    await db.sessions.bulkDelete(rec.sessionIds);

    clearLastImport();
    setLastImport(null);

    await addAppLog({
      type: "import",
      level: "warn",
      message: "Rolled back last paste import",
      detailsJson: JSON.stringify({
        importId: rec.importId,
        sessionCount: rec.sessionIds.length,
        deletedSessionItems: siIds.length,
        deletedSets: setIds.length,
      }),
    });

    setStatus(
      `Rollback complete ✓ Deleted ${rec.sessionIds.length} sessions, ${siIds.length} session items, ${setIds.length} sets. (Tracks/Exercises remain.)`
    );
  }

  /* --------------------------------------------------------------------------
     Breadcrumb 8 — Import
     ----------------------------------------------------------------------- */

  async function importParsedWorkout() {
    if (!parsed || !preview) {
      setStatus("Nothing parsed yet.");
      return;
    }

    if (!parsed.date || !parseDateOnly(parsed.date)) {
      setStatus("Import blocked: Date must be YYYY-MM-DD.");
      return;
    }

    if (!parsed.exercises.some((x) => x.sets.length > 0)) {
      setStatus("Import blocked: No parsed sets found.");
      return;
    }

    if (preview.duplicateSessionFound) {
      setStatus(
        `Import blocked: Session already exists for ${parsed.programDay} on ${parsed.date}.`
      );
      return;
    }

    setStatus(dryRun ? "Running dry import…" : "Importing pasted workout…");

    const existingExercises = await db.exercises.toArray();
    const existingTracks = await db.tracks.toArray();

    const exerciseByName = new Map<string, Exercise>();
    for (const ex of existingExercises) {
      const norm = normalizeName(ex.name);
      if (norm) exerciseByName.set(norm, ex);

      if (Array.isArray((ex as any).aliases)) {
        for (const alias of (ex as any).aliases) {
          const a = normalizeName(String(alias || ""));
          if (a) exerciseByName.set(a, ex);
        }
      }
    }

    const trackByDisplay = new Map<string, Track>();
    for (const t of existingTracks) {
      trackByDisplay.set(normalizeName(t.displayName), t);
    }

    const now = Date.now();
    const importableExercises = parsed.exercises.filter((ex) => ex.sets.length > 0);

    const newExercises: Exercise[] = [];
    for (const ex of importableExercises) {
      const norm = normalizeName(ex.exercise);
      if (exerciseByName.has(norm)) continue;

      const newEx: Exercise = {
        id: uuid(),
        name: ex.exercise,
        normalizedName: norm,
        aliases: [],
        equipmentTags: [],
        createdAt: now,
        updatedAt: now,
      };

      newExercises.push(newEx);
      exerciseByName.set(norm, newEx);
    }

    const newTracks: Track[] = [];
    for (const ex of importableExercises) {
      const norm = normalizeName(ex.exercise);
      if (trackByDisplay.has(norm)) continue;

      const exercise = exerciseByName.get(norm);
      if (!exercise) continue;

      const hasWeight = ex.sets.some((s) => s.weight !== undefined && s.weight > 0);
      const hasReps = ex.sets.some((s) => s.reps !== undefined);
      const hasSeconds = ex.sets.some((s) => s.seconds !== undefined);

      const t: Track = {
        id: uuid(),
        exerciseId: exercise.id,
        displayName: ex.exercise,
        trackType: defaultTrackType(ex.exercise),
        trackingMode: hasSeconds
          ? "timeSeconds"
          : inferTrackingMode(ex.exercise, hasWeight, hasReps),
        warmupSetsDefault: 2,
        workingSetsDefault: 3,
        repMin: 6,
        repMax: 12,
        restSecondsDefault: 120,
        weightJumpDefault: 5,
        createdAt: now,
      };

      newTracks.push(t);
      trackByDisplay.set(norm, t);
    }

    const importId = `paste_import_${new Date().toISOString()}`;
    const startedAt = dateTimeToMs(parsed.date, parsed.start);
    const endedAt = parsed.end
      ? dateTimeToMs(parsed.date, parsed.end)
      : startedAt + 60 * 60 * 1000;

    const sessionId = uuid();
    const createdSessionIds = [sessionId];

    const sessionNotesParts = [importId, "source=paste-workout"];
    if (parsed.warnings.length) sessionNotesParts.push(`warnings=${parsed.warnings.length}`);
    if (parsed.failedLines.length) {
      sessionNotesParts.push(`failedLines=${parsed.failedLines.length}`);
    }

    const safeEndedAt =
      endedAt >= startedAt ? endedAt : startedAt + 60 * 60 * 1000;

    const sessionsToAdd: Session[] = [
      {
        id: sessionId,
        startedAt,
        endedAt: safeEndedAt,
        templateId: undefined,
        templateName: parsed.programDay,
        notes: sessionNotesParts.join("\n"),
        updatedAt: safeEndedAt,
      },
    ];

    const sessionItemsToAdd: SessionItem[] = [];
    const setsToAdd: SetEntry[] = [];

    let orderIndex = 0;
    let createdAt = startedAt + 1000;

    for (const ex of importableExercises) {
      const track = trackByDisplay.get(normalizeName(ex.exercise));
      if (!track) continue;

      sessionItemsToAdd.push({
        id: uuid(),
        sessionId,
        orderIndex,
        trackId: track.id,
        notes: undefined,
        createdAt: startedAt + orderIndex,
      });

      orderIndex += 1;

      for (const set of ex.sets) {
        const dbSetType: "warmup" | "working" =
          set.setKind === "warmup" ? "warmup" : "working";

        const seconds =
          track.trackingMode === "timeSeconds" ? set.seconds : undefined;

        const mergedNotes =
          [buildSetNotes(set), set.isPerSide ? "per-side" : undefined]
            .filter(Boolean)
            .join(" | ") || undefined;

        setsToAdd.push({
          id: uuid(),
          sessionId,
          trackId: track.id,
          createdAt,
          completedAt: createdAt,
          setType: dbSetType,
          weight: track.trackingMode === "weightedReps" ? set.weight : undefined,
          reps:
            track.trackingMode === "weightedReps" || track.trackingMode === "repsOnly"
              ? set.reps
              : undefined,
          seconds,
          rir: set.rir,
          notes: mergedNotes,
          updatedAt: createdAt,
        });

        createdAt += 1;
      }
    }

    const summary = `Exercises +${newExercises.length}, Tracks +${newTracks.length}, Sessions +${sessionsToAdd.length}, SessionItems +${sessionItemsToAdd.length}, Sets +${setsToAdd.length}`;

    if (dryRun) {
      await addAppLog({
        type: "import",
        level: "info",
        message: "Completed paste workout dry run",
        detailsJson: JSON.stringify({
          programDay: parsed.programDay,
          date: parsed.date,
          duplicateSessionFound: preview.duplicateSessionFound,
          duplicateSessionId: preview.duplicateSessionId,
          exercisesAdded: newExercises.length,
          tracksAdded: newTracks.length,
          sessionsAdded: sessionsToAdd.length,
          sessionItemsAdded: sessionItemsToAdd.length,
          setsAdded: setsToAdd.length,
        }),
      });

      setStatus(`Dry run ✓ Would add: ${summary}`);
      return;
    }

    if (newExercises.length) await db.exercises.bulkAdd(newExercises);
    if (newTracks.length) await db.tracks.bulkAdd(newTracks);
    if (sessionsToAdd.length) await db.sessions.bulkAdd(sessionsToAdd);
    if (sessionItemsToAdd.length) await db.sessionItems.bulkAdd(sessionItemsToAdd);
    if (setsToAdd.length) await db.sets.bulkAdd(setsToAdd);

    const rec: LastPasteImportRecord = {
      importId,
      createdAt: Date.now(),
      sessionIds: createdSessionIds,
      summary,
    };

    saveLastImport(rec);
    setLastImport(rec);

    await addAppLog({
      type: "import",
      level: "info",
      message: "Imported pasted workout successfully",
      detailsJson: JSON.stringify({
        programDay: parsed.programDay,
        date: parsed.date,
        duplicateSessionFound: preview.duplicateSessionFound,
        duplicateSessionId: preview.duplicateSessionId,
        exercisesAdded: newExercises.length,
        tracksAdded: newTracks.length,
        sessionsAdded: sessionsToAdd.length,
        sessionItemsAdded: sessionItemsToAdd.length,
        setsAdded: setsToAdd.length,
        importId,
      }),
    });

    setStatus(`Imported ✓ ${summary}\nSaved rollback handle: ${importId}`);
  }

  /* --------------------------------------------------------------------------
     Breadcrumb 9 — Render
     ----------------------------------------------------------------------- */

  return (
    <div className="card" style={{ maxWidth: 980 }}>
      <h2>Paste Workout</h2>
      <p className="muted">
        Paste coach-formatted workout text, preview the parse, then dry run or import
        directly into <b>Exercises</b> + <b>Tracks</b> + <b>Sessions</b> +{" "}
        <b>SessionItems</b> + <b>Sets</b>.
      </p>

      <hr />

      <div className="row" style={{ gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={dryRun}
            onChange={(e) => setDryRun(e.target.checked)}
          />
          Dry run (don’t write to DB)
        </label>

        <div className="muted" style={{ marginLeft: "auto", fontSize: 13 }}>
          {dryRun ? "Preview mode only" : "DB write enabled"}
        </div>
      </div>

      <hr />

      <label className="muted" style={{ display: "block", marginBottom: 8 }}>
        Paste coach workout text
      </label>

      <textarea
        value={pasteText}
        onChange={(e) => setPasteText(e.target.value)}
        style={{
          width: "100%",
          minHeight: 360,
          resize: "vertical",
          padding: 12,
          borderRadius: 12,
          border: "1px solid var(--border)",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
          fontSize: 14,
          lineHeight: 1.45,
          background: "var(--card)",
          color: "var(--text)",
        }}
      />

      <div className="row" style={{ gap: 10, marginTop: 12, flexWrap: "wrap" }}>
        <button className="btn" onClick={() => setPasteText(SAMPLE_TEXT)}>
          Load Sample
        </button>
        <button className="btn" onClick={() => setPasteText("")}>
          Clear
        </button>
        <button className="btn primary" onClick={parsePreviewNow}>
          Parse Preview
        </button>
        <button className="btn primary" disabled={!canImport} onClick={importParsedWorkout}>
          {dryRun ? "Run Dry Import (No DB Write)" : "Import Now"}
        </button>
        <button
          className="btn danger"
          disabled={!canRollback || dryRun}
          onClick={rollbackLastImport}
        >
          Rollback last import
        </button>
      </div>

      {status && (
        <div
          style={{
            marginTop: 14,
            padding: 14,
            borderRadius: 14,
            border: topResultStyles.border,
            background: topResultStyles.background,
            display: "grid",
            gap: 10,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 999,
                  border: "1px solid var(--line)",
                  display: "grid",
                  placeItems: "center",
                  fontWeight: 700,
                  color: "var(--text)",
                  flex: "0 0 auto",
                }}
              >
                {topResultStyles.accent}
              </div>

              <div>
                <div style={{ fontWeight: 700 }}>{topResultTitle}</div>
                <div className="muted" style={{ fontSize: 13 }}>
                  {dryRun
                    ? "No data will be written while Dry run is checked."
                    : "Changes can be written to the database."}
                </div>
              </div>
            </div>

            {preview && (
              <div className="muted" style={{ fontSize: 13 }}>
                {preview.duplicateSessionFound ? "Duplicate detected" : "Ready for next step"}
              </div>
            )}
          </div>

          <div className="muted" style={{ whiteSpace: "pre-wrap" }}>
            {status}
          </div>

          {(status.toLowerCase().includes("dry run") ||
            status.toLowerCase().includes("imported")) &&
            preview && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                  gap: 10,
                }}
              >
                <div className="card" style={{ padding: 10 }}>
                  <div className="muted" style={{ fontSize: 12 }}>
                    Exercises
                  </div>
                  <div style={{ fontWeight: 700 }}>{preview.wouldAddExercises}</div>
                </div>

                <div className="card" style={{ padding: 10 }}>
                  <div className="muted" style={{ fontSize: 12 }}>
                    Tracks
                  </div>
                  <div style={{ fontWeight: 700 }}>{preview.wouldAddTracks}</div>
                </div>

                <div className="card" style={{ padding: 10 }}>
                  <div className="muted" style={{ fontSize: 12 }}>
                    Sessions
                  </div>
                  <div style={{ fontWeight: 700 }}>{preview.wouldAddSessions}</div>
                </div>

                <div className="card" style={{ padding: 10 }}>
                  <div className="muted" style={{ fontSize: 12 }}>
                    SessionItems
                  </div>
                  <div style={{ fontWeight: 700 }}>{preview.wouldAddSessionItems}</div>
                </div>

                <div className="card" style={{ padding: 10 }}>
                  <div className="muted" style={{ fontSize: 12 }}>
                    Sets
                  </div>
                  <div style={{ fontWeight: 700 }}>{preview.wouldAddSets}</div>
                </div>
              </div>
            )}

          {lastImport && (
            <div
              style={{
                marginTop: 2,
                paddingTop: 10,
                borderTop: "1px solid var(--line)",
              }}
            >
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                Last paste import
              </div>
              <div className="muted" style={{ fontSize: 13 }}>
                <b>{new Date(lastImport.createdAt).toLocaleString()}</b> • {lastImport.summary}
              </div>
            </div>
          )}
        </div>
      )}

      {parsed && preview && (
        <>
          <hr />

          <h3 style={{ marginTop: 0 }}>Preview</h3>

          <div className="kv">
            <span>Session</span>
            <span>{parsed.programDay || "—"}</span>
          </div>
          <div className="kv">
            <span>Date</span>
            <span>{parsed.date || "—"}</span>
          </div>
          <div className="kv">
            <span>Start</span>
            <span>{parsed.start || "—"}</span>
          </div>
          <div className="kv">
            <span>End</span>
            <span>{parsed.end || "—"}</span>
          </div>
          <div className="kv">
            <span>Exercises</span>
            <span>{preview.exerciseCount}</span>
          </div>
          <div className="kv">
            <span>Sets</span>
            <span>{preview.setCount}</span>
          </div>
          <div className="kv">
            <span>Warnings</span>
            <span>{preview.warningCount}</span>
          </div>
          <div className="kv">
            <span>Failed lines</span>
            <span>{preview.failedLineCount}</span>
          </div>

          <hr />

          <div className="kv">
            <span>Duplicate session found</span>
            <span>{preview.duplicateSessionFound ? "Yes" : "No"}</span>
          </div>
          <div className="kv">
            <span>Would add Exercises</span>
            <span>{preview.wouldAddExercises}</span>
          </div>
          <div className="kv">
            <span>Would add Tracks</span>
            <span>{preview.wouldAddTracks}</span>
          </div>
          <div className="kv">
            <span>Would add Sessions</span>
            <span>{preview.wouldAddSessions}</span>
          </div>
          <div className="kv">
            <span>Would add SessionItems</span>
            <span>{preview.wouldAddSessionItems}</span>
          </div>
          <div className="kv">
            <span>Would add Sets</span>
            <span>{preview.wouldAddSets}</span>
          </div>

          {preview.duplicateSessionFound && (
            <>
              <hr />
              <div className="muted">
                Import blocked until session name or date is changed.
              </div>
            </>
          )}

          {parsed.warnings.length > 0 && (
            <>
              <hr />
              <div className="muted" style={{ whiteSpace: "pre-wrap" }}>
                <b>Warnings</b>
                {"\n"}
                {parsed.warnings.map(
                  (w, i) => `• ${w}${i < parsed.warnings.length - 1 ? "\n" : ""}`
                )}
              </div>
            </>
          )}

          {parsed.failedLines.length > 0 && (
            <>
              <hr />
              <div className="muted" style={{ whiteSpace: "pre-wrap" }}>
                <b>Failed lines</b>
                {"\n"}
                {parsed.failedLines.map(
                  (w, i) => `• ${w}${i < parsed.failedLines.length - 1 ? "\n" : ""}`
                )}
              </div>
            </>
          )}

          <hr />

          <h3 style={{ marginTop: 0 }}>Parsed exercises</h3>
          <div style={{ display: "grid", gap: 12 }}>
            {parsed.exercises.map((ex, exIdx) => (
              <div key={`${ex.exercise}-${exIdx}`} className="card" style={{ padding: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>{ex.exercise}</div>
                {!ex.sets.length ? (
                  <div className="muted">No parsed sets</div>
                ) : (
                  <div style={{ display: "grid", gap: 6 }}>
                    {ex.sets.map((s, idx) => (
                      <div key={`${ex.exercise}-${exIdx}-${idx}`} className="muted">
                        {formatParsedSetPreview(s)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{ marginTop: 10, fontSize: 12, color: "var(--muted)" }}>{footer}</div>
    </div>
  );
}

/* ============================================================================
   End of file: src/pages/PasteWorkoutPage.tsx
   ============================================================================ */