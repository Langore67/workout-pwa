// src/importMasterExecutionLog.ts
/* ============================================================================
   importMasterExecutionLog.ts — Import MASTER_Execution_Log_*.csv into Dexie
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-02-28-MASTERLOG-IMPORT-02
   FILE: src/importMasterExecutionLog.ts

   Why this exists
   - You have workout history in a flat CSV (Master Execution Log).
   - The PWA needs Sessions + Sets (and ideally those sets should attach to
     *template tracks* so History/Session Detail renders correctly).

   Key fixes in this revision
   ✅ Canonical name matching (handles aliases like "Assisted Pull Up" vs "Assisted Pull-Up")
   ✅ Template linking is STRICT (canonical exact match only)
      - prevents "Upper B" accidentally linking to "Lower A"
   ✅ Attach sets to template tracks when possible (massively reduces fallback tracks)
   ✅ Mark imported sessions as complete (endedAt) so they don't show "In progress"
   ✅ Keeps your existing catalog when possible, auto-creates missing exercises (optional)

   Expected CSV columns
   Date, Session, Exercise, Load, Reps, RPE, SourceFile, RawLine, LoadNum, Workout, Details
   ============================================================================ */

import { db } from "./db";

// Minimal local UUID helper (works in modern browsers)
function uid(): string {
  // @ts-ignore
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "id_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);
}

type RowObj = Record<string, string>;

export type MasterLogImportResult = {
  sessionsCreated: number;
  exercisesUpserted: number;
  tracksUpserted: number;
  setsInserted: number;

  rowsRead: number;
  rowsUsedAsSets: number;
  rowsRolledIntoNotes: number;

  // Debug counters
  badDateRowsSkipped: number;
  sessionsLinkedToTemplates: number;
  setsAttachedToTemplateTracks: number;
  setsAttachedToFallbackTracks: number;
  setsUnmatchedToTemplate: number;
};

const REQUIRED_HEADERS = [
  "Date",
  "Session",
  "Exercise",
  "Load",
  "Reps",
  "RPE",
  "SourceFile",
  "RawLine",
  "LoadNum",
  "Workout",
  "Details",
] as const;

const TRACK_DEFAULTS = {
  trackType: "lift",
  trackingMode: "weight_reps",
  warmupSetsDefault: 0,
  workingSetsDefault: 3,
  repMin: 5,
  repMax: 12,
  restSecondsDefault: 120,
  rirTargetMin: undefined as number | undefined,
  rirTargetMax: undefined as number | undefined,
  weightJumpDefault: 5,
};

/** ---------------------------------------------------------------------------
 *  Breadcrumb 1 — Canonical name key
 *  Goal: treat minor spelling/punctuation differences as aliases.
 *  Examples:
 *   - "Assisted Pull-Up" == "Assisted Pull Up"
 *   - "DB" vs "D/B" stays mostly intact, but punctuation is removed
 *  Note:
 *   - We keep digits so "3 Point DB Row" is NOT equal to "DB Row".
 * ------------------------------------------------------------------------ */
function canonKey(s: string): string {
  const raw = (s ?? "").toString().trim().toLowerCase();
  if (!raw) return "";
  // Normalize a few common variants first
  const swapped = raw
    .replaceAll("dumbell", "dumbbell")
    .replaceAll("pull-up", "pull up")
    .replaceAll("pullup", "pull up")
    .replaceAll("peck", "pec"); // optional: if your catalog uses "pec"

  // Remove punctuation and collapse whitespace
  const stripped = swapped
    .replace(/[^a-z0-9\s]/g, " ")  // turn punctuation into spaces
    .replace(/\s+/g, " ")
    .trim();

  return stripped;
}

function ensureHeaders(actual: string[]) {
  const set = new Set(actual);
  const missing = REQUIRED_HEADERS.filter((h) => !set.has(h));
  if (missing.length) {
    throw new Error(`Master log CSV missing required columns: ${missing.join(", ")}`);
  }
}

function toObjects(headers: string[], rows: string[][]): RowObj[] {
  return rows.map((cells) => {
    const o: RowObj = {};
    for (let i = 0; i < headers.length; i++) o[headers[i]] = cells[i] ?? "";
    return o;
  });
}

/** Robust CSV parsing (quotes, commas) */
function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const s = (text ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];

    if (inQuotes) {
      if (c === '"') {
        const next = s[i + 1];
        if (next === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (c === "\n") {
      row.push(field);
      field = "";
      const isAllEmpty = row.every((x) => (x ?? "").length === 0);
      if (!isAllEmpty) rows.push(row);
      row = [];
      continue;
    }
    field += c;
  }

  row.push(field);
  const isAllEmpty = row.every((x) => (x ?? "").length === 0);
  if (!isAllEmpty) rows.push(row);

  if (!rows.length) return { headers: [], rows: [] };

  const headers = rows[0].map((h) => (h ?? "").trim());
  const dataRows = rows.slice(1);
  return { headers, rows: dataRows };
}

/** Dates in your normalized CSV are already ISO (YYYY-MM-DD). */
function parseDateToStartedAt(dateStr: string): number {
  const raw = (dateStr ?? "").trim();
  if (!raw) throw new Error(`Invalid Date value "${dateStr}"`);

  const ms = Date.parse(raw);
  if (Number.isFinite(ms)) return new Date(ms).setHours(12, 0, 0, 0);

  throw new Error(`Invalid Date value "${dateStr}"`);
}

function toNum(v: string): number | undefined {
  const t = (v ?? "").trim();
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

function parseRepsToInt(repsRaw: string): number | undefined {
  const t = (repsRaw ?? "").toString().trim();
  if (!t) return undefined;
  const m = t.match(/(\d+)/);
  if (!m) return undefined;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : undefined;
}

function isWalkLike(exerciseName: string, rawLine: string): boolean {
  const e = (exerciseName ?? "").toLowerCase();
  const r = (rawLine ?? "").toLowerCase();
  return e.includes("walk") || r.includes("walk") || r.includes("treadmill");
}

function looksLikeLiftSet(row: RowObj): boolean {
  const ex = (row["Exercise"] ?? "").trim();
  if (!ex) return false;
  if (ex.toLowerCase() === "unspecified") return false;
  if (isWalkLike(ex, row["RawLine"] ?? "")) return false;

  const repsRaw = (row["Reps"] ?? "").trim();
  const loadRaw = (row["Load"] ?? "").trim();
  const loadNum = toNum(row["LoadNum"] ?? "");

  const reps = parseRepsToInt(repsRaw);
  if (reps !== undefined) return loadNum !== undefined || !!loadRaw;

  return false;
}

export async function importMasterExecutionLogCsvText(csvText: string): Promise<MasterLogImportResult> {
  const { headers, rows } = parseCsv(csvText);
  ensureHeaders(headers);
  const objs = toObjects(headers, rows);

  // Group rows into sessions by Date + SessionName
  const groups = new Map<string, RowObj[]>();
  for (const r of objs) {
    const d = (r["Date"] ?? "").trim();
    const s = (r["Session"] ?? "").trim() || "Session";
    if (!d) continue;
    const key = `${d}__${s}`;
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }

  // Preload catalog/config
  const [existingExercises, existingTracks, templates, templateItems] = await Promise.all([
    db.exercises.toArray(),
    db.tracks.toArray(),
    db.templates.toArray(),
    db.templateItems.toArray(),
  ]);

  // Map: canonical exercise name -> Exercise row
  const exerciseByCanon = new Map<string, any>();
  for (const e of existingExercises) {
    const k = canonKey(e.name ?? "");
    if (!k) continue;
    // If duplicates exist, keep the first one (stable). You can refine later.
    if (!exerciseByCanon.has(k)) exerciseByCanon.set(k, e);
  }

  // Map: exerciseId -> track (fallback per exercise)
  const trackByExerciseId = new Map<string, any>();
  for (const t of existingTracks) {
    if (t?.exerciseId) trackByExerciseId.set(t.exerciseId, t);
  }

  // Map templates by canonical name (STRICT matching)
  const templateByCanonName = new Map<string, any>();
  for (const t of templates) {
    const k = canonKey(t.name ?? "");
    if (!k) continue;
    // If duplicates exist, do NOT overwrite — keep first and force strict uniqueness.
    if (!templateByCanonName.has(k)) templateByCanonName.set(k, t);
  }

  // Helper: for a given templateId, build map canonical exercise name -> template trackId
  // We do this lazily per template used to keep it fast.
  const templateTrackMapCache = new Map<string, Map<string, string>>();

  async function getTemplateTrackMap(templateId: string): Promise<Map<string, string>> {
    const cached = templateTrackMapCache.get(templateId);
    if (cached) return cached;

    // templateItems rows point at trackId; track points at exerciseId; exercises provide name
    const items = templateItems.filter((it: any) => it.templateId === templateId);
    const map = new Map<string, string>();

    for (const it of items) {
      const tr = existingTracks.find((t: any) => t.id === it.trackId);
      if (!tr) continue;
      const ex = existingExercises.find((e: any) => e.id === tr.exerciseId);
      const exName = ex?.name ?? tr.displayName ?? "";
      const k = canonKey(exName);
      if (!k) continue;
      // If duplicates in template map, keep first (stable)
      if (!map.has(k)) map.set(k, tr.id);
    }

    templateTrackMapCache.set(templateId, map);
    return map;
  }

  // Counters
  let exercisesUpserted = 0;
  let tracksUpserted = 0;
  let sessionsCreated = 0;
  let setsInserted = 0;
  let rowsUsedAsSets = 0;
  let rowsRolledIntoNotes = 0;
  let badDateRowsSkipped = 0;

  let sessionsLinkedToTemplates = 0;
  let setsAttachedToTemplateTracks = 0;
  let setsAttachedToFallbackTracks = 0;
  let setsUnmatchedToTemplate = 0;

  // Write batches
  const newExercises: any[] = [];
  const newTracks: any[] = [];
  const newSessions: any[] = [];
  const newSets: any[] = [];

  for (const [key, rowsInGroup] of groups.entries()) {
    const [dateStr, sessionNameRaw] = key.split("__");
    let startedAt: number;

    try {
      startedAt = parseDateToStartedAt(dateStr);
    } catch {
      badDateRowsSkipped += rowsInGroup.length;
      continue;
    }

    const sessionName = (sessionNameRaw ?? "").trim() || "Session";
    const sessionCanon = canonKey(sessionName);

    // STRICT template match: canonical exact equality only
    const template = sessionCanon ? templateByCanonName.get(sessionCanon) : undefined;
    const templateId = template?.id;

    // Build session notes (unique-ish)
    const noteLines: string[] = [];
    for (const r of rowsInGroup) {
      const w = (r["Workout"] ?? "").trim();
      const d = (r["Details"] ?? "").trim();
      if (w && !noteLines.includes(w)) noteLines.push(w);
      if (d && !noteLines.includes(d)) noteLines.push(d);
    }

    const sessionId = uid();

    // Mark imported sessions complete by default (prevents "In progress")
    // End time: startedAt + 30 minutes OR + N seconds based on set count later.
    // We'll set a provisional endedAt now and adjust after we count sets.
    let provisionalEndedAt = startedAt + 30 * 60 * 1000;

    newSessions.push({
      id: sessionId,
      templateId: templateId ?? undefined,
      templateName: sessionName,
      startedAt,
      endedAt: provisionalEndedAt,
      notes: noteLines.length ? noteLines.join(" | ") : undefined,
    });
    sessionsCreated++;
    if (templateId) sessionsLinkedToTemplates++;

    // If template exists, load its track map once
    const templateTrackMap = templateId ? await getTemplateTrackMap(templateId) : null;

    // Create sets
    let setIndex = 0;

    for (const r of rowsInGroup) {
      if (!looksLikeLiftSet(r)) {
        const extra = [(r["Exercise"] ?? "").trim(), (r["RawLine"] ?? "").trim()].filter(Boolean).join(" — ").trim();
        if (extra) rowsRolledIntoNotes++;
        continue;
      }

      rowsUsedAsSets++;

      const exNameRaw = (r["Exercise"] ?? "").trim();
      const exCanon = canonKey(exNameRaw);

      const rawLine = (r["RawLine"] ?? "").trim();
      const loadRaw = (r["Load"] ?? "").trim();
      const repsRaw = (r["Reps"] ?? "").trim();
      const rpeRaw = (r["RPE"] ?? "").trim();
      const loadNum = toNum(r["LoadNum"] ?? "");

      // Upsert Exercise using canonical key
      let ex = exCanon ? exerciseByCanon.get(exCanon) : undefined;
      if (!ex) {
        ex = {
          id: uid(),
          name: exNameRaw,
          equipmentTags: [],
          notes: undefined,
          createdAt: Date.now(),
        };
        if (exCanon) exerciseByCanon.set(exCanon, ex);
        newExercises.push(ex);
        exercisesUpserted++;
      }

      // Ensure fallback track exists (1 per exercise)
      let fallbackTrack = trackByExerciseId.get(ex.id);
      if (!fallbackTrack) {
        fallbackTrack = {
          id: uid(),
          exerciseId: ex.id,
          trackType: TRACK_DEFAULTS.trackType,
          displayName: ex.name,
          trackingMode: TRACK_DEFAULTS.trackingMode,
          warmupSetsDefault: TRACK_DEFAULTS.warmupSetsDefault,
          workingSetsDefault: TRACK_DEFAULTS.workingSetsDefault,
          repMin: TRACK_DEFAULTS.repMin,
          repMax: TRACK_DEFAULTS.repMax,
          restSecondsDefault: TRACK_DEFAULTS.restSecondsDefault,
          rirTargetMin: TRACK_DEFAULTS.rirTargetMin,
          rirTargetMax: TRACK_DEFAULTS.rirTargetMax,
          weightJumpDefault: TRACK_DEFAULTS.weightJumpDefault,
          createdAt: Date.now(),
        };
        trackByExerciseId.set(ex.id, fallbackTrack);
        newTracks.push(fallbackTrack);
        tracksUpserted++;
      }

      // Prefer attaching to template track if available
      let trackIdToUse = fallbackTrack.id;

      if (templateTrackMap && exCanon) {
        const templateTrackId = templateTrackMap.get(exCanon);
        if (templateTrackId) {
          trackIdToUse = templateTrackId;
          setsAttachedToTemplateTracks++;
        } else {
          setsUnmatchedToTemplate++;
          setsAttachedToFallbackTracks++;
        }
      } else {
        setsAttachedToFallbackTracks++;
      }

      const reps = parseRepsToInt(repsRaw);

      // warmup heuristic
      const isWarmup =
        rawLine.toLowerCase().includes("warm") ||
        rawLine.toLowerCase().startsWith("warm") ||
        rawLine.toLowerCase().includes("warm-up");

      const noteParts: string[] = [];
      if (rawLine) noteParts.push(rawLine);
      if (rpeRaw) noteParts.push(`RPE=${rpeRaw}`);

      // Ensure stable, non-negative timestamps
      const createdAtRaw = (startedAt ?? 0) + setIndex * 1000;
      const createdAtSafe =
        Number.isFinite(createdAtRaw) && createdAtRaw > 0
          ? createdAtRaw
          : Date.now();
      
      // Master Execution Log = historical performed data → mark completed
      const completedAtSafe = createdAtSafe;
      
      // Parse RIR if present (allow 0)
      // Sources (best → fallback):
      // 1) Explicit CSV column RIR (if it exists)
      // 2) RawLine tokens like "@2", "RIR 3.5", "/rir 4"
      // 3) From RPE approximation: RIR = 10 - RPE
      const rirRaw =
        (r as any)["RIR"] ??
        (r as any)["Rir"] ??
        (r as any)["rir"] ??
        undefined;
      
      let rirNum: number | undefined = undefined;
      
      // 1) Direct column
      if (typeof rirRaw === "number" && Number.isFinite(rirRaw)) {
        rirNum = rirRaw;
      } else if (typeof rirRaw === "string" && rirRaw.trim() !== "") {
        const n = Number(rirRaw.trim());
        if (Number.isFinite(n)) rirNum = n;
      }
      
      // 2) Parse from rawLine if still missing
      if (rirNum === undefined && rawLine) {
        // examples: "185 x 8 @2", "185x8/rir 4", "RIR=3.5"
        const m =
          rawLine.match(/(?:\bRIR\b\s*=?\s*|\/\s*rir\s*|@\s*)(\d+(?:\.\d+)?)/i) ??
          rawLine.match(/(?:\bRIR\b)(\d+(?:\.\d+)?)/i);
      
        if (m && m[1] !== undefined) {
          const n = Number(String(m[1]).trim());
          if (Number.isFinite(n)) rirNum = n;
        }
      }
      
      // 3) Optional fallback from RPE: RIR ≈ 10 - RPE
      if (rirNum === undefined && rpeRaw) {
        const rpeNum = Number(String(rpeRaw).trim());
        if (Number.isFinite(rpeNum)) {
          const approx = 10 - rpeNum;
          // allow 0, clamp negatives
          rirNum = Math.max(0, approx);
        }
      }
      
      // Normalize: allow 0, drop NaN/invalid
      const rirSafe =
        rirNum === undefined || rirNum === null || !Number.isFinite(rirNum)
          ? undefined
    : Math.max(0, rirNum);
      
      newSets.push({
        id: uid(),
        sessionId,
        trackId: trackIdToUse,
        createdAt: createdAtSafe,
        completedAt: completedAtSafe,
        setType: isWarmup ? "warmup" : "working",
        weight: loadNum ?? undefined,
        reps: reps ?? undefined,
        seconds: undefined,
        rir: Number.isFinite(rirNum as any) ? (rirNum as number) : undefined,
        notes: noteParts.length ? noteParts.join(" | ") : undefined,
});
      setsInserted++;
      setIndex++;
    }

    // Improve endedAt for this session based on set count (at least +5 minutes)
    const computedEndedAt = startedAt + Math.max(5 * 60 * 1000, setIndex * 15 * 1000);
    const lastSession = newSessions[newSessions.length - 1];
    lastSession.endedAt = computedEndedAt;
  }

  // Write to DB
  await db.transaction("rw", db.exercises, db.tracks, db.sessions, db.sets, async () => {
    if (newExercises.length) await (db.exercises as any).bulkPut(newExercises);
    if (newTracks.length) await (db.tracks as any).bulkPut(newTracks);
    if (newSessions.length) await (db.sessions as any).bulkAdd(newSessions);
    if (newSets.length) await (db.sets as any).bulkAdd(newSets);
  });

  return {
    sessionsCreated,
    exercisesUpserted,
    tracksUpserted,
    setsInserted,
    rowsRead: objs.length,
    rowsUsedAsSets,
    rowsRolledIntoNotes,
    badDateRowsSkipped,
    sessionsLinkedToTemplates,
    setsAttachedToTemplateTracks,
    setsAttachedToFallbackTracks,
    setsUnmatchedToTemplate,
  };
}