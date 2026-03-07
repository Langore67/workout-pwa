import React, { useMemo, useState } from "react";
import Papa from "papaparse";
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

/**
 * Imports journal CSV
 * Columns:
 * - date
 * - session_type
 * - program_day
 * - exercise
 * - set
 * - load
 * - reps
 * - rpe
 * - rir
 * - notes
 * - set_type   (optional; supports warmup / working / technique)
 *
 * Writes to Dexie:
 * - exercises (unique by normalizedName)
 * - tracks (one per exercise, points to exerciseId)
 * - sessions (Lift only, grouped by date + program_day)
 * - sessionItems
 * - sets
 *
 * Notes:
 * - DB supports SetType: warmup | working | drop | failure
 * - "technique" is not a DB SetType yet, so technique rows are imported as
 *   working sets and tagged in notes as "technique".
 */

type JournalRow = {
  date?: string;
  session_type?: string;
  program_day?: string;
  exercise?: string;
  set?: string | number;
  load?: string | number;
  reps?: string | number;
  rpe?: string | number;
  rir?: string | number;
  notes?: string;
  set_type?: string;
};

type LastImportRecord = {
  importId: string;
  createdAt: number;
  sessionIds: string[];
  summary: string;
};

const LAST_IMPORT_KEY = "workout_last_import_v2";

function saveLastImport(rec: LastImportRecord) {
  localStorage.setItem(LAST_IMPORT_KEY, JSON.stringify(rec));
}

function loadLastImport(): LastImportRecord | null {
  const raw = localStorage.getItem(LAST_IMPORT_KEY);
  if (!raw) return null;

  try {
    const obj = JSON.parse(raw);
    if (!obj?.importId || !Array.isArray(obj.sessionIds)) return null;
    return obj as LastImportRecord;
  } catch {
    return null;
  }
}

function clearLastImport() {
  localStorage.removeItem(LAST_IMPORT_KEY);
}

function parseDateToMs(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map((x) => Number(x));
  if (!y || !m || !d) return Date.now();
  return new Date(y, m - 1, d, 9, 0, 0, 0).getTime();
}

function normalizeExerciseName(name: string): string {
  let s = name.trim();

  if (s.toLowerCase().startsWith("warm-up ")) {
    s = s.slice("warm-up ".length).trim();
  }

  s = s.replace(/\s*\(warm-up\)\s*/gi, "").trim();
  s = s.replace(/\s+/g, " ").trim();

  return s;
}

function inferSetType(row: JournalRow): "warmup" | "working" {
  const explicit = String(row.set_type || "").trim().toLowerCase();
  if (explicit === "warmup") return "warmup";
  if (explicit === "working") return "working";
  if (explicit === "technique") return "working"; // DB does not support "technique" yet

  const notes = String(row.notes || "").toLowerCase();
  if (notes.includes("set_type=warmup")) return "warmup";
  if (notes.includes("set_type=technique")) return "working";

  const ex = String(row.exercise || "").toLowerCase();
  if (ex.startsWith("warm-up ")) return "warmup";
  if (ex.includes("(warm-up)")) return "warmup";

  return "working";
}

function num(v: unknown): number | undefined {
  if (v === null || v === undefined) return undefined;

  const s = String(v).trim();
  if (!s || s.toLowerCase() === "nan") return undefined;

  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function parseWeight(loadRaw: unknown): number | undefined {
  if (loadRaw === null || loadRaw === undefined) return undefined;

  const s = String(loadRaw).trim();
  if (!s || s.toLowerCase() === "nan") return undefined;

  if (s.toLowerCase() === "bar") return 45;
  if (s.toLowerCase() === "bw") return 0;
  if (s.toLowerCase() === "bodyweight") return 0;

  const dumbbellMatch = s.match(/^(\d+(\.\d+)?)s$/i);
  if (dumbbellMatch) return Number(dumbbellMatch[1]);

  const assistMatch = s.match(/^(-?\d+(\.\d+)?)\s*assist$/i);
  if (assistMatch) return Number(assistMatch[1]);

  const totalMatch = s.match(/\((\d+(\.\d+)?)\s*total\)/i);
  if (totalMatch) return Number(totalMatch[1]);

  const n = Number(s);
  if (Number.isFinite(n)) return n;

  return undefined;
}

function inferTrackingMode(exerciseName: string): TrackingMode {
  const s = exerciseName.toLowerCase();

  if (s.includes("plank") || s.includes("hold")) return "timeSeconds";
  if (s.includes("band") || s.includes("pull-apart") || s.includes("pull apart")) return "repsOnly";

  return "weightedReps";
}

function defaultTrackType(exerciseName: string): TrackType {
  const s = exerciseName.toLowerCase();

  if (s.includes("breathing") || s.includes("reset") || s.includes("mobility")) {
    return "corrective";
  }

  return "hypertrophy";
}

function parseRir(row: JournalRow): number | undefined {
  const rirVal = num(row.rir);
  if (rirVal !== undefined) return rirVal;

  const rpeVal = num(row.rpe);
  if (rpeVal !== undefined) {
    const rirFromRpe = 10 - rpeVal;
    return Number.isFinite(rirFromRpe) ? rirFromRpe : undefined;
  }

  return undefined;
}

function buildSetNotes(row: JournalRow): string | undefined {
  const parts: string[] = [];
  const st = String(row.set_type || "").trim().toLowerCase();

  if (st === "technique") parts.push("technique");

  const noteText = String(row.notes || "").trim();
  if (noteText) parts.push(noteText);

  return parts.length ? parts.join(" | ") : undefined;
}

export default function ImportCsvPage() {
  const [status, setStatus] = useState<string>("");
  const [preview, setPreview] = useState<{
    totalRows: number;
    liftRows: number;
    uniqueExercises: number;
  } | null>(null);
  const [dryRun, setDryRun] = useState(true);
  const [fileObj, setFileObj] = useState<File | null>(null);

  const [lastImport, setLastImport] = useState<LastImportRecord | null>(() => loadLastImport());

  const canImport = useMemo(() => !!preview && !!fileObj, [preview, fileObj]);
  const canRollback = useMemo(() => !!lastImport?.sessionIds?.length, [lastImport]);

  async function parseForPreview(file: File) {
    setStatus("Parsing CSV…");
    setPreview(null);

    const text = await file.text();
    const parsed = Papa.parse<JournalRow>(text, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
    });

    if (parsed.errors?.length) {
      setStatus(`CSV parse error: ${parsed.errors[0].message}`);
      return;
    }

    const rows = (parsed.data || []).filter(Boolean);
    const liftRows = rows.filter(
      (r) => String(r.session_type || "").trim().toLowerCase() === "lift" && r.exercise
    );

    const uniqueExercises = new Set(
      liftRows.map((r) => normalizeExerciseName(String(r.exercise || ""))).filter((x) => x.length > 0)
    );

    setPreview({
      totalRows: rows.length,
      liftRows: liftRows.length,
      uniqueExercises: uniqueExercises.size,
    });
    setStatus("Parsed ✓ Ready to import.");
  }

  async function rollbackLastImport() {
    const rec = loadLastImport();
    if (!rec || !rec.sessionIds?.length) {
      setStatus("No last import found to rollback.");
      setLastImport(null);
      return;
    }

    setStatus(`Rolling back last import (${rec.sessionIds.length} sessions)…`);

    const setIds = await db.sets.where("sessionId").anyOf(rec.sessionIds).primaryKeys();
    if (setIds.length) await db.sets.bulkDelete(setIds as string[]);

    const siIds = await db.sessionItems.where("sessionId").anyOf(rec.sessionIds).primaryKeys();
    if (siIds.length) await db.sessionItems.bulkDelete(siIds as string[]);

    await db.sessions.bulkDelete(rec.sessionIds);

    clearLastImport();
    setLastImport(null);

    setStatus(
      `Rollback complete ✓ Deleted ${rec.sessionIds.length} sessions, ${siIds.length} session items, ${setIds.length} sets. (Tracks/Exercises left intact.)`
    );
  }

  async function importNow(file: File) {
    setStatus("Importing…");

    const text = await file.text();
    const parsed = Papa.parse<JournalRow>(text, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
    });

    if (parsed.errors?.length) {
      setStatus(`CSV parse error: ${parsed.errors[0].message}`);
      return;
    }

    const rows = (parsed.data || []).filter(Boolean);
    const liftRows = rows.filter(
      (r) => String(r.session_type || "").trim().toLowerCase() === "lift" && r.exercise
    );

    const exerciseNames = Array.from(
      new Set(
        liftRows.map((r) => normalizeExerciseName(String(r.exercise || ""))).filter((x) => x.length > 0)
      )
    );

    const existingExercises = await db.exercises.toArray();
    const exerciseByName = new Map<string, Exercise>();
    for (const ex of existingExercises) {
      exerciseByName.set(normalizeName(ex.name), ex);
      exerciseByName.set(ex.normalizedName, ex);
    }

    const existingTracks = await db.tracks.toArray();
    const trackByDisplay = new Map<string, Track>();
    for (const t of existingTracks) {
      trackByDisplay.set(normalizeName(t.displayName), t);
    }

    const now = Date.now();

    const newExercises: Exercise[] = [];
    for (const name of exerciseNames) {
      const normalized = normalizeName(name);
      if (exerciseByName.has(normalized)) continue;

      const ex: Exercise = {
        id: uuid(),
        name,
        normalizedName: normalized,
        equipmentTags: [],
        createdAt: now,
        updatedAt: now,
      };

      newExercises.push(ex);
      exerciseByName.set(normalized, ex);
    }

    const newTracks: Track[] = [];
    for (const name of exerciseNames) {
      const normalized = normalizeName(name);
      if (trackByDisplay.has(normalized)) continue;

      const ex = exerciseByName.get(normalized);
      if (!ex) continue;

      const t: Track = {
        id: uuid(),
        exerciseId: ex.id,
        displayName: name,
        trackType: defaultTrackType(name),
        trackingMode: inferTrackingMode(name),
        warmupSetsDefault: 2,
        workingSetsDefault: 3,
        repMin: 6,
        repMax: 12,
        restSecondsDefault: 120,
        weightJumpDefault: 5,
        createdAt: now,
      };

      newTracks.push(t);
      trackByDisplay.set(normalized, t);
    }

    const grouped = new Map<string, JournalRow[]>();
    for (const r of liftRows) {
      const date = String(r.date || "").trim();
      if (!date) continue;

      const pd = String(r.program_day || "Lift").trim() || "Lift";
      const key = `${date}__${pd}`;

      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(r);
    }

    const importId = `import_${new Date().toISOString()}`;

    const sessionsToAdd: Session[] = [];
    const sessionItemsToAdd: SessionItem[] = [];
    const setsToAdd: SetEntry[] = [];
    const createdSessionIds: string[] = [];

    for (const [groupKey, groupRows] of grouped.entries()) {
      const [date, programDay] = groupKey.split("__");
      const startedAt = parseDateToMs(date);
      const sessionId = uuid();
      createdSessionIds.push(sessionId);

      const sessionNotes = Array.from(
        new Set(groupRows.map((r) => String(r.notes || "").trim()).filter((n) => n.length > 0))
      ).join("\n");

      sessionsToAdd.push({
        id: sessionId,
        startedAt,
        endedAt: startedAt + 60 * 60 * 1000,
        templateId: undefined,
        templateName: programDay,
        notes: `${importId}\n${sessionNotes}`.trim() || importId,
        updatedAt: startedAt + 60 * 60 * 1000,
      });

      const sorted = [...groupRows].sort((a, b) => {
        const ea = String(a.exercise || "");
        const eb = String(b.exercise || "");
        if (ea !== eb) return ea.localeCompare(eb);
        return (num(a.set) ?? 0) - (num(b.set) ?? 0);
      });

      const order: string[] = [];
      const seen = new Set<string>();

      for (const r of sorted) {
        const exerciseRaw = String(r.exercise || "").trim();
        const displayName = normalizeExerciseName(exerciseRaw);
        const track = trackByDisplay.get(normalizeName(displayName));
        if (!track) continue;

        if (!seen.has(track.id)) {
          seen.add(track.id);
          order.push(track.id);
        }
      }

      order.forEach((trackId, idx) => {
        sessionItemsToAdd.push({
          id: uuid(),
          sessionId,
          orderIndex: idx,
          trackId,
          notes: undefined,
          createdAt: startedAt + idx,
        });
      });

      let createdAt = startedAt + 1000;

      for (const r of sorted) {
        const exerciseRaw = String(r.exercise || "").trim();
        const displayName = normalizeExerciseName(exerciseRaw);
        const track = trackByDisplay.get(normalizeName(displayName));
        if (!track) continue;

        const setType = inferSetType(r);
        const reps = num(r.reps);
        const weight = parseWeight(r.load);
        const rir = parseRir(r);

        const hasAny = reps !== undefined || weight !== undefined || rir !== undefined;
        if (!hasAny) continue;

        const seconds = track.trackingMode === "timeSeconds" ? reps : undefined;

        setsToAdd.push({
          id: uuid(),
          sessionId,
          trackId: track.id,
          createdAt,
          completedAt: createdAt,
          setType,
          weight: track.trackingMode === "weightedReps" ? weight : undefined,
          reps:
            track.trackingMode === "weightedReps" || track.trackingMode === "repsOnly"
              ? reps
              : undefined,
          seconds,
          rir,
          notes: buildSetNotes(r),
          updatedAt: createdAt,
        });

        createdAt += 1;
      }
    }

    const summary = `Exercises +${newExercises.length}, Tracks +${newTracks.length}, Sessions +${sessionsToAdd.length}, SessionItems +${sessionItemsToAdd.length}, Sets +${setsToAdd.length}`;

    if (dryRun) {
      setStatus(`Dry run ✓ Would add: ${summary}`);
      return;
    }

    if (newExercises.length) await db.exercises.bulkAdd(newExercises);
    if (newTracks.length) await db.tracks.bulkAdd(newTracks);
    if (sessionsToAdd.length) await db.sessions.bulkAdd(sessionsToAdd);
    if (sessionItemsToAdd.length) await db.sessionItems.bulkAdd(sessionItemsToAdd);
    if (setsToAdd.length) await db.sets.bulkAdd(setsToAdd);

    const rec: LastImportRecord = {
      importId,
      createdAt: Date.now(),
      sessionIds: createdSessionIds,
      summary,
    };

    saveLastImport(rec);
    setLastImport(rec);

    setStatus(`Imported ✓ ${summary}\nSaved rollback handle: ${importId}`);
  }

  return (
    <div className="card" style={{ maxWidth: 920 }}>
      <h2>Import CSV</h2>
      <p className="muted">
        Imports journal CSV into <b>Exercises</b> + <b>Tracks</b> + <b>Sessions</b> + <b>SessionItems</b> +{" "}
        <b>Sets</b> (Lift rows only).
      </p>

      <hr />

      <div className="row" style={{ gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
          Dry run (don’t write to DB)
        </label>

        <div className="muted" style={{ marginLeft: "auto" }}>
          {lastImport ? (
            <>
              Last import: <b>{new Date(lastImport.createdAt).toLocaleString()}</b> • {lastImport.summary}
            </>
          ) : (
            <>
              Last import: <b>none</b>
            </>
          )}
        </div>
      </div>

      <hr />

      <input
        type="file"
        accept=".csv,text/csv"
        onChange={async (e) => {
          const file = e.target.files?.[0] || null;
          setFileObj(file);
          if (!file) return;
          await parseForPreview(file);
        }}
      />

      {preview && (
        <>
          <hr />
          <div className="kv">
            <span>Total rows</span>
            <span>{preview.totalRows}</span>
          </div>
          <div className="kv">
            <span>Lift rows</span>
            <span>{preview.liftRows}</span>
          </div>
          <div className="kv">
            <span>Unique exercises</span>
            <span>{preview.uniqueExercises}</span>
          </div>
        </>
      )}

      <hr />

      <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
        <button className="btn primary" disabled={!canImport} onClick={() => fileObj && importNow(fileObj)}>
          {dryRun ? "Run Dry Import" : "Import Now"}
        </button>

        <button className="btn danger" disabled={!canRollback || dryRun} onClick={rollbackLastImport}>
          Rollback last import
        </button>

        <div className="muted" style={{ alignSelf: "center" }}>
          (Rollback deletes sessions + sessionItems + sets from the last import. Tracks/Exercises remain.)
        </div>
      </div>

      <div className="muted" style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>
        {status}
      </div>
    </div>
  );
}