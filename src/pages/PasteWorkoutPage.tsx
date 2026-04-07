// src/pages/PasteWorkoutPage.tsx
/* ============================================================================
   PasteWorkoutPage.tsx — Paste Coach Workout -> Preview -> Import -> Rollback
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-03-17-PASTEWORKOUT-08
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
   - warmup x15
   - warmup x6/side

   Notes
   - Exercise line = plain text line that is not metadata and not a set line
   - Section headers like "Correctives" or "# Main Lifts" are ignored
   - technique / test / cardio are imported as working sets with a tag in notes
   - /side is preserved in notes as "per-side" for now
   - "Bar" is interpreted as 45 lb
   - Distance sets are preserved in notes for now (e.g. "40m")
   - Time-only sets are imported into seconds when possible
   - Loadless rep-only sets import as repsOnly
   - Existing tracks may be upgraded when parsed data clearly indicates a better
     tracking mode (e.g. stale timeSeconds -> weightedReps)
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
import {
  appendExerciseAlias,
  buildExerciseResolverIndex,
  resolveExerciseFromIndex,
} from "../domain/exercises/exerciseResolver";
import {
  buildExerciseDuplicateCandidates,
  type ExerciseDuplicateCandidate,
} from "../domain/exercises/exerciseDuplicateCandidates";
import {
  inferTrackTypeFromParsedSetKinds,
  inferTrackingModeFromSetSignals,
  isNonStrengthTrackType,
} from "../domain/trackingMode";

/* ============================================================================
   Breadcrumb 1 — Types
   ============================================================================ */

type ParsedSetKind =
  | "warmup"
  | "work"
  | "technique"
  | "mobility"
  | "corrective"
  | "conditioning"
  | "test"
  | "cardio";

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
  newExerciseNames: string[];
  reviewExerciseNames: string[];
  duplicateReviews: {
    exerciseName: string;
    candidates: ExerciseDuplicateCandidate[];
  }[];
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
const PAGE_VERSION = "8";
const BUILD_ID = "2026-03-17-PASTEWORKOUT-08";
const FILE_FOOTER = "src/pages/PasteWorkoutPage.tsx";

const SAMPLE_TEXT = `Session: Lower A
Date: 2026-03-17
Start: 07:45
End: 09:18

Clamshell
warmup BWx15/side
warmup BWx15/side

Locked Clams
warmup BWx15/side
warmup BWx15/side

Glute Bridge
warmup BWx15

Knee to Wall
warmup BWx12/side
warmup BWx12/side

Banded Pull-Aparts
warmup x15
warmup x15

Dead Hang
warmup 40sec
warmup 40sec

Y Shoulder Wall Slides
warmup x10
warmup x10

90/90 Hip Rotation
warmup x6/side

Hamstring Walkouts
warmup x6
warmup x6

Good Morning
warmup 45x10
work 95x10 @5
work 105x10 @4
work 105x10 @4`;

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

function inferBetterTrackingModeFromParsedSets(
  exerciseName: string,
  sets: ParsedSet[]
): TrackingMode {
  const hasWeightedLoad = sets.some(
    (s) => s.weight !== undefined && Number.isFinite(s.weight) && s.weight > 0
  );
  const hasReps = sets.some(
    (s) => s.reps !== undefined && Number.isFinite(s.reps) && s.reps > 0
  );
  const hasSeconds = sets.some(
    (s) => s.seconds !== undefined && Number.isFinite(s.seconds) && s.seconds > 0
  );

  return inferTrackingModeFromSetSignals(
    exerciseName,
    {
      hasWeightedLoad,
      hasReps,
      hasSeconds,
    },
    { treatHangAsTime: true }
  );
}

function inferTrackTypeFromParsedSets(exerciseName: string, sets: ParsedSet[]): TrackType {
  return inferTrackTypeFromParsedSetKinds(
    exerciseName,
    sets.map((set) => set.setKind),
    {
      extraCorrectiveTerms: [
        "stretch",
        "clamshell",
        "clams",
        "wall slide",
        "hip rotation",
        "walkout",
        "knee to wall",
      ],
      enableCardioTerms: true,
    }
  );
}

function trackIntentKey(displayName: string, trackType: TrackType): string {
  return `${normalizeName(displayName)}::${trackType}`;
}

function buildSetNotes(set: ParsedSet): string | undefined {
  const parts: string[] = [];

  if (set.setKind === "technique") parts.push("technique");
  if (set.setKind === "mobility") parts.push("mobility");
  if (set.setKind === "corrective") parts.push("corrective");
  if (set.setKind === "conditioning" || set.setKind === "cardio") parts.push("conditioning");
  if (set.setKind === "test") parts.push("test");

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

function normalizeSetLineForParsing(line: string): string {
  return line
    .trim()
    .replace(/\s*x\s*/gi, "x")
    .replace(/\s*\/\s*side\b/gi, "/side")
    .replace(/\s*@\s*/g, "@");
}

function parseSetLine(line: string): ParsedSet | null {
  const trimmed = normalizeSetLineForParsing(line);
  if (!trimmed) return null;

  /* ------------------------------------------------------------------------
     Breadcrumb — Standard weighted / BW / bar sets
     --------------------------------------------------------------------- */
  const standardMatch = trimmed.match(
    /^(warmup|work|technique|mobility|corrective|conditioning|test)\s+(BW|Bar|-?\d+(?:\.\d+)?)x(\d+)(s)?(?:\/(side))?(?:\s*@\s*(\d+(?:\.\d+)?))?(?:\s+(.*))?$/i
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
     --------------------------------------------------------------------- */
  const distanceMatch = trimmed.match(
    /^(warmup|work|technique|mobility|corrective|conditioning|test)\s+(BW|Bar|-?\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)(m|meter|meters|ft|yd)(?:\/(side))?(?:\s*@\s*(\d+(?:\.\d+)?))?(?:\s+(.*))?$/i
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
     --------------------------------------------------------------------- */
    const timeOnlyMatch = trimmed.match(
      /^(warmup|work|technique|mobility|corrective|conditioning|test)\s+(\d+(?:\.\d+)?)(s|sec|secs|second|seconds|min|mins|minute|minutes|hr|hrs|hour|hours)(?:\/(side))?(?:\s*@\s*(\d+(?:\.\d+)?))?(?:\s+(.*))?$/i
    );
  
    if (timeOnlyMatch) {
      const kindRaw = timeOnlyMatch[1].toLowerCase() as ParsedSetKind;
      const durationRaw = timeOnlyMatch[2];
      const unitRaw = timeOnlyMatch[3];
      const isPerSide = !!timeOnlyMatch[4];
      const rirRaw = timeOnlyMatch[5];
      const notesRaw = timeOnlyMatch[6]?.trim() || undefined;
  
      const seconds = durationToSeconds(durationRaw, unitRaw);
      const rir = rirRaw !== undefined ? Number(rirRaw) : undefined;
  
      return {
        rawLine: line,
        setKind: kindRaw,
        seconds,
        rir: rir !== undefined && Number.isFinite(rir) ? rir : undefined,
        isPerSide,
        notes: notesRaw,
      };
  }

  /* ------------------------------------------------------------------------
     Breadcrumb — Loadless rep-only sets
     Examples
     - warmup x15
     - warmup x6/side
     - work x12 @3
     --------------------------------------------------------------------- */
  const repsOnlyNoLoadMatch = trimmed.match(
    /^(warmup|work|technique|mobility|corrective|conditioning|test)\s+x(\d+)(?:\/(side))?(?:\s*@\s*(\d+(?:\.\d+)?))?(?:\s+(.*))?$/i
  );

  if (repsOnlyNoLoadMatch) {
    const kindRaw = repsOnlyNoLoadMatch[1].toLowerCase() as ParsedSetKind;
    const repsRaw = repsOnlyNoLoadMatch[2];
    const isPerSide = !!repsOnlyNoLoadMatch[3];
    const rirRaw = repsOnlyNoLoadMatch[4];
    const notesRaw = repsOnlyNoLoadMatch[5]?.trim() || undefined;

    const reps = Number(repsRaw);
    const rir = rirRaw !== undefined ? Number(rirRaw) : undefined;

    return {
      rawLine: line,
      setKind: kindRaw,
      reps: Number.isFinite(reps) ? reps : undefined,
      rir: rir !== undefined && Number.isFinite(rir) ? rir : undefined,
      isPerSide,
      notes: notesRaw,
    };
  }

  const cardioMatch = trimmed.match(/^(cardio|conditioning)\s+(.+)$/i);
  if (cardioMatch) {
    return {
      rawLine: line,
      setKind: "conditioning",
      notes: cardioMatch[2].trim(),
    };
  }

  return null;
}

function formatParsedSetPreview(set: ParsedSet): string {
  const prefix = `${set.setKind} • `;

  // Cardio note-only preview
  if (set.setKind === "cardio" || set.setKind === "conditioning") {
    return `${prefix}${String(set.notes || "").trim() || "—"}`;
  }

  const hasNumericWeight =
    typeof set.weight === "number" &&
    Number.isFinite(set.weight) &&
    !set.isBodyweight;

  const isTimeOnly =
    set.seconds !== undefined && !hasNumericWeight;

  const loadLabel = hasNumericWeight ? String(set.weight) : "BW";

  const base = isTimeOnly
    ? previewDurationToken(set.seconds as number)
    : `${loadLabel} x ${
        set.seconds !== undefined
          ? previewDurationToken(set.seconds)
          : set.reps ?? "—"
      }`;

  const notesText = String(set.notes || "").trim();

  const shouldHideDuplicateDurationNote =
    isTimeOnly &&
    !!notesText &&
    normalizeName(notesText) ===
      normalizeName(previewDurationToken(set.seconds as number));

  const suffixNotes =
    notesText && !shouldHideDuplicateDurationNote
      ? ` • ${notesText}`
      : "";

  return `${prefix}${base}${set.isPerSide ? " /side" : ""}${
    set.rir !== undefined ? ` @${set.rir}` : ""
  }${suffixNotes}`;
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

    if (/^(warmup|work|technique|mobility|corrective|conditioning|test|cardio)\b/i.test(line)) {
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
  const [reviewAcknowledged, setReviewAcknowledged] = useState<boolean>(false);
  const [selectedExistingByName, setSelectedExistingByName] = useState<Record<string, string>>({});
  const [rememberAliasByName, setRememberAliasByName] = useState<Record<string, boolean>>({});
  const [lastImport, setLastImport] = useState<LastPasteImportRecord | null>(() =>
    loadLastImport()
  );

  const canImport = useMemo(() => !!parsed && !!preview, [parsed, preview]);
  const canRollback = useMemo(() => !!lastImport?.sessionIds?.length, [lastImport]);
  const unresolvedReviewNames = useMemo(
    () => preview?.reviewExerciseNames.filter((name) => !selectedExistingByName[name]) ?? [],
    [preview, selectedExistingByName]
  );
  const effectiveWouldAddExercises = useMemo(
    () => (preview?.newExerciseNames.length ?? 0) + unresolvedReviewNames.length,
    [preview, unresolvedReviewNames]
  );
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
    const [templateItems, sessionItems, sets] = await Promise.all([
      db.templateItems.toArray(),
      db.sessionItems.toArray(),
      db.sets.toArray(),
    ]);
    const resolverIndex = buildExerciseResolverIndex(existingExercises);

    const trackKeys = new Set(
      existingTracks.map((t) => trackIntentKey(t.displayName, t.trackType as TrackType))
    );

    const importableExercises = parsedWorkout.exercises.filter((ex) => ex.sets.length > 0);
    const newExerciseNames = new Set<string>();
    const reviewExerciseNames = new Set<string>();
    const duplicateReviews: PreviewSummary["duplicateReviews"] = [];

    let wouldAddTracks = 0;
    let wouldAddSessions = 0;
    let wouldAddSessionItems = 0;
    let wouldAddSets = 0;

    for (const ex of importableExercises) {
      const desiredTrackType = inferTrackTypeFromParsedSets(ex.exercise, ex.sets);
      const resolution = resolveExerciseFromIndex(
        {
          rawName: ex.exercise,
          allowAlias: true,
          followMerged: true,
          includeArchived: false,
        },
        resolverIndex
      );
      const isExistingExercise =
        resolution.status === "exact" ||
        resolution.status === "alias" ||
        resolution.status === "merged_redirect";

      if (!isExistingExercise) {
        newExerciseNames.add(ex.exercise);

        const duplicateCandidates = buildExerciseDuplicateCandidates({
          rawName: ex.exercise,
          exercises: existingExercises,
          tracks: existingTracks,
          templateItems,
          sessionItems,
          sets,
          maxCandidates: 3,
        }).filter((candidate) => candidate.confidence === "high");

        if (duplicateCandidates.length) {
          reviewExerciseNames.add(ex.exercise);
          duplicateReviews.push({
            exerciseName: ex.exercise,
            candidates: duplicateCandidates,
          });
        }
      }

      const trackKey = trackIntentKey(ex.exercise, desiredTrackType);
      if (!trackKeys.has(trackKey)) {
        wouldAddTracks += 1;
        trackKeys.add(trackKey);
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
      newExerciseNames: Array.from(newExerciseNames),
      reviewExerciseNames: Array.from(reviewExerciseNames),
      duplicateReviews,
      wouldAddExercises: newExerciseNames.size,
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
    setReviewAcknowledged(false);
    setSelectedExistingByName({});
    setRememberAliasByName({});

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

    if (unresolvedReviewNames.length > 0 && !reviewAcknowledged) {
      setStatus(
        `Import blocked: review possible duplicate exercises before continuing.\n${unresolvedReviewNames.join(", ")}`
      );
      return;
    }

    setStatus(dryRun ? "Running dry import…" : "Importing pasted workout…");

    const existingExercises = await db.exercises.toArray();
    const existingTracks = await db.tracks.toArray();
    const resolverIndex = buildExerciseResolverIndex(existingExercises);

    const trackByDisplay = new Map<string, Track>();
    for (const t of existingTracks) {
      trackByDisplay.set(trackIntentKey(t.displayName, t.trackType), t);
    }

    const now = Date.now();
    let aliasesRemembered = 0;
    const importableExercises = parsed.exercises.filter((ex) => ex.sets.length > 0);

    const exerciseByImportedName = new Map<string, Exercise>();
    const newExercises: Exercise[] = [];
    for (const ex of importableExercises) {
      const selectedExistingId = selectedExistingByName[ex.exercise];
      if (selectedExistingId) {
        const selectedExercise = existingExercises.find((exercise) => exercise.id === selectedExistingId);
        if (selectedExercise) {
          if (!dryRun && rememberAliasByName[ex.exercise]) {
            const aliasResult = await appendExerciseAlias(selectedExercise.id, ex.exercise);
            if (aliasResult.added) aliasesRemembered += 1;
          }
          exerciseByImportedName.set(ex.exercise, selectedExercise);
          continue;
        }
      }

      const resolution = resolveExerciseFromIndex(
        {
          rawName: ex.exercise,
          allowAlias: true,
          followMerged: true,
          includeArchived: false,
        },
        resolverIndex
      );

      if (
        resolution.status === "exact" ||
        resolution.status === "alias" ||
        resolution.status === "merged_redirect"
      ) {
        const resolvedExercise = resolution.exercise ?? resolution.canonicalExercise;
        if (resolvedExercise) {
          exerciseByImportedName.set(ex.exercise, resolvedExercise);
          continue;
        }
      }

      if (resolution.status === "ambiguous" || resolution.status === "archived_match") {
        await addAppLog({
          type: "import",
          level: "error",
          message: "Paste workout import blocked by ambiguous exercise resolution",
          detailsJson: JSON.stringify({
            programDay: parsed.programDay,
            date: parsed.date,
            exerciseName: ex.exercise,
            normalizedInput: resolution.normalizedInput,
            status: resolution.status,
            candidateIds: (resolution.candidates ?? []).map((x) => x.id),
            candidateNames: (resolution.candidates ?? []).map((x) => x.name),
            warnings: resolution.warnings,
          }),
        });

        setStatus(
          `Import blocked: ambiguous exercise match for "${ex.exercise}". Review duplicate/alias data in Exercises before importing.`
        );
        return;
      }

      const norm = normalizeName(ex.exercise);
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
      exerciseByImportedName.set(ex.exercise, newEx);
    }

    const newTracks: Track[] = [];
    const tracksToUpdate: Track[] = [];

    for (const ex of importableExercises) {
      const desiredTrackType = inferTrackTypeFromParsedSets(ex.exercise, ex.sets);
      const existingTrack = trackByDisplay.get(trackIntentKey(ex.exercise, desiredTrackType));

      const desiredTrackingMode = inferBetterTrackingModeFromParsedSets(
        ex.exercise,
        ex.sets
      );

            if (existingTrack) {
              const shouldUpgradeTrackingMode =
                existingTrack.trackingMode !== desiredTrackingMode;
      
              if (shouldUpgradeTrackingMode) {
                const updatedTrack: Track = {
                  ...existingTrack,
                  trackingMode: desiredTrackingMode,
                  trackType: existingTrack.trackType,
                };
      
                tracksToUpdate.push(updatedTrack);
                trackByDisplay.set(trackIntentKey(updatedTrack.displayName, updatedTrack.trackType), updatedTrack);
              }
      
              continue;
      }

      const exercise = exerciseByImportedName.get(ex.exercise);
      if (!exercise) continue;

      const t: Track = {
        id: uuid(),
        exerciseId: exercise.id,
        displayName: ex.exercise,
        trackType: desiredTrackType,
        trackingMode: desiredTrackingMode,
        warmupSetsDefault:
          desiredTrackType === "strength" || desiredTrackType === "hypertrophy" ? 2 : 0,
        workingSetsDefault:
          desiredTrackType === "strength" || desiredTrackType === "hypertrophy"
            ? 3
            : desiredTrackType === "technique"
              ? 2
              : 1,
        repMin: desiredTrackType === "strength" ? 3 : desiredTrackType === "technique" ? 3 : 1,
        repMax:
          desiredTrackType === "strength"
            ? 6
            : desiredTrackType === "technique"
              ? 8
              : 12,
        restSecondsDefault: desiredTrackType === "strength" ? 180 : desiredTrackType === "technique" ? 90 : 60,
        weightJumpDefault:
          desiredTrackType === "strength" || desiredTrackType === "hypertrophy" ? 5 : 0,
        createdAt: now,
      };

      newTracks.push(t);
      trackByDisplay.set(trackIntentKey(t.displayName, t.trackType), t);
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
      const desiredTrackType = inferTrackTypeFromParsedSets(ex.exercise, ex.sets);
      const track = trackByDisplay.get(trackIntentKey(ex.exercise, desiredTrackType));
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

        const parsedHasFiniteWeight =
          set.weight !== undefined &&
          Number.isFinite(set.weight);
        const parsedHasFiniteReps =
          set.reps !== undefined &&
          Number.isFinite(set.reps);
        const persistedWeight = set.weight;
        // Preserve valid parsed weighted-rep lines even if the resolved track
        // mode is stale or mis-inferred during import.
        const shouldPersistParsedWeightedRepFields =
          persistedWeight !== undefined && parsedHasFiniteReps;

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
          weight:
            shouldPersistParsedWeightedRepFields ||
            track.trackingMode === "weightedReps"
              ? persistedWeight
              : undefined,
          reps:
            shouldPersistParsedWeightedRepFields ||
            track.trackingMode === "weightedReps" ||
            track.trackingMode === "repsOnly"
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

    const summary = `Exercises +${newExercises.length}, Tracks +${newTracks.length}, TrackUpdates +${tracksToUpdate.length}, Sessions +${sessionsToAdd.length}, SessionItems +${sessionItemsToAdd.length}, Sets +${setsToAdd.length}`;

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
          trackUpdates: tracksToUpdate.length,
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
    if (tracksToUpdate.length) await db.tracks.bulkPut(tracksToUpdate);
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
        trackUpdates: tracksToUpdate.length,
        sessionsAdded: sessionsToAdd.length,
        sessionItemsAdded: sessionItemsToAdd.length,
        setsAdded: setsToAdd.length,
        importId,
      }),
    });

    setStatus(
      `Imported ✓ ${summary}${
        aliasesRemembered > 0 ? `\nAliases remembered: ${aliasesRemembered}` : ""
      }\nSaved rollback handle: ${importId}`
    );
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
        onChange={(e) => {
          setPasteText(e.target.value);
          setReviewAcknowledged(false);
          setSelectedExistingByName({});
          setRememberAliasByName({});
        }}
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
                  <div style={{ fontWeight: 700 }}>{effectiveWouldAddExercises}</div>
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
            <span>{effectiveWouldAddExercises}</span>
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

          {preview.reviewExerciseNames.length > 0 && (
            <>
              <hr />
              <div
                style={{
                  display: "grid",
                  gap: 10,
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid rgba(245, 158, 11, 0.35)",
                  background: "rgba(245, 158, 11, 0.08)",
                }}
              >
                <div style={{ fontWeight: 700 }}>Review before create</div>
                <div className="muted">
                  Possible duplicates were found. IronForge will not create these exercises until you explicitly continue.
                </div>
                {unresolvedReviewNames.length > 0 && (
                  <label style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <input
                      type="checkbox"
                      checked={reviewAcknowledged}
                      onChange={(e) => setReviewAcknowledged(e.target.checked)}
                    />
                    <span>
                      I reviewed these possible duplicates and want to continue creating new exercises if I proceed.
                    </span>
                  </label>
                )}
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
                {(() => {
                  const review = preview.duplicateReviews.find((row) => row.exerciseName === ex.exercise);
                  const showReview = preview.reviewExerciseNames.includes(ex.exercise) && !!review;
                  const inferredTrackType = inferTrackTypeFromParsedSets(ex.exercise, ex.sets);
                  return (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                    marginBottom: 8,
                  }}
                >
                  <div style={{ fontWeight: 700 }}>{ex.exercise}</div>
                  {selectedExistingByName[ex.exercise] ? (
                    <span className="badge">USE EXISTING</span>
                  ) : showReview ? (
                    <span className="badge" style={{ background: "#f59e0b", color: "#111827" }}>
                      REVIEW
                    </span>
                  ) : preview.newExerciseNames.includes(ex.exercise) ? (
                    <span className="badge">NEW</span>
                  ) : null}
                  {isNonStrengthTrackType(inferredTrackType) ? (
                    <span className="badge" style={{ background: "rgba(15, 118, 110, 0.12)", color: "#115e59" }}>
                      {inferredTrackType}
                    </span>
                  ) : null}
                </div>
                  );
                })()}
                {(() => {
                  const inferredTrackType = inferTrackTypeFromParsedSets(ex.exercise, ex.sets);
                  if (!isNonStrengthTrackType(inferredTrackType)) return null;
                  return (
                    <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
                      Logged as {inferredTrackType} work. Excluded from strength metrics.
                    </div>
                  );
                })()}
                {(() => {
                  const review = preview.duplicateReviews.find((row) => row.exerciseName === ex.exercise);
                  if (!review) return null;
                  return (
                    <div
                      style={{
                        display: "grid",
                        gap: 8,
                        marginBottom: 10,
                        padding: 10,
                        borderRadius: 10,
                        border: "1px solid rgba(245, 158, 11, 0.35)",
                        background: "rgba(245, 158, 11, 0.08)",
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: 13 }}>Possible duplicate</div>
                      {review.candidates.map((candidate) => (
                        <div key={`${ex.exercise}-${candidate.exerciseId}`} className="muted" style={{ fontSize: 13 }}>
                          <div style={{ color: "var(--text)", fontWeight: 700 }}>{candidate.name}</div>
                          <div>{candidate.reason}</div>
                          <div>
                            Sets {candidate.evidence.setCount} • Tracks {candidate.evidence.trackCount}
                            {candidate.evidence.equipment ? ` • ${candidate.evidence.equipment}` : ""}
                            {candidate.evidence.bodyPart ? ` • ${candidate.evidence.bodyPart}` : ""}
                          </div>
                        </div>
                      ))}
                      {review.candidates[0] && (
                        <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            className="btn"
                            onClick={() => {
                              setSelectedExistingByName((prev) => ({
                                ...prev,
                                [ex.exercise]: review.candidates[0].exerciseId,
                              }));
                              setRememberAliasByName((prev) => ({
                                ...prev,
                                [ex.exercise]: false,
                              }));
                              setReviewAcknowledged(false);
                            }}
                          >
                            Use existing
                          </button>
                          {selectedExistingByName[ex.exercise] === review.candidates[0].exerciseId && (
                            <span style={{ color: "var(--text)", fontWeight: 700 }}>
                              Using existing: {review.candidates[0].name}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
                {selectedExistingByName[ex.exercise] && (
                  <div style={{ marginBottom: 10, display: "grid", gap: 10 }}>
                    <label style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <input
                        type="checkbox"
                        checked={!!rememberAliasByName[ex.exercise]}
                        onChange={(e) =>
                          setRememberAliasByName((prev) => ({
                            ...prev,
                            [ex.exercise]: e.target.checked,
                          }))
                        }
                      />
                      <span>Remember this as an alias for future imports</span>
                    </label>
                    <button
                      type="button"
                      className="btn"
                      onClick={() =>
                        {
                          setSelectedExistingByName((prev) => {
                            const next = { ...prev };
                            delete next[ex.exercise];
                            return next;
                          });
                          setRememberAliasByName((prev) => {
                            const next = { ...prev };
                            delete next[ex.exercise];
                            return next;
                          });
                          setReviewAcknowledged(false);
                        }
                      }
                    >
                      Create new instead
                    </button>
                  </div>
                )}
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
