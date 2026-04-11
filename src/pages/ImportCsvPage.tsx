// src/pages/ImportCsvPage.tsx
/* ============================================================================
   ImportCsvPage.tsx — Journal CSV Import + Preview + Rollback + Logging
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-03-07-IMPORTCSV-06
   FILE: src/pages/ImportCsvPage.tsx

   Changes (IMPORTCSV-06)
   ✅ Add file/version breadcrumbs
   ✅ Add alias-aware exercise lookup
   ✅ Keep preview / dry run / import / rollback logging
   ✅ Keep warmup + working set support
   ✅ Keep technique rows mapped to working + tagged in notes
   ============================================================================ */

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
  defaultTrackTypeFromExerciseName,
  inferTrackingModeFromSetSignals,
  inferTrackingModeFromExerciseName,
} from "../domain/trackingMode";
import { parseImportLoadToken } from "../domain/import/loadParsing";
import {
  importSetClassToDbSetType,
  importSetClassToTrackIntentKind,
  normalizeImportSetClass,
  type ImportSetClass,
} from "../domain/import/setClassParsing";

/* ============================================================================
   Breadcrumb 1 — Types
   ============================================================================ */
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

type ImportDuplicateReview = {
  exerciseName: string;
  candidates: ExerciseDuplicateCandidate[];
};

type ImportExerciseResolutionSummary = {
  newExerciseNames: string[];
  reviewExerciseNames: string[];
  duplicateReviews: ImportDuplicateReview[];
};

/* ============================================================================
   Breadcrumb 2 — Constants
   ============================================================================ */
const LAST_IMPORT_KEY = "workout_last_import_v2";
const PAGE_VERSION = "6";
const BUILD_ID = "2026-03-07-IMPORTCSV-06";
const FILE_FOOTER = "src/pages/ImportCsvPage.tsx";

/* ============================================================================
   Breadcrumb 3 — Local storage helpers
   ============================================================================ */
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

/* ============================================================================
   Breadcrumb 4 — Parsing / normalization helpers
   ============================================================================ */
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

function buildExerciseLookup(exercises: Exercise[]): Map<string, Exercise> {
  const map = new Map<string, Exercise>();

  for (const ex of exercises) {
    const canonical = normalizeName(ex.name);
    if (canonical) map.set(canonical, ex);

    if (ex.normalizedName) {
      map.set(ex.normalizedName, ex);
    }

    if (Array.isArray(ex.aliases)) {
      for (const alias of ex.aliases) {
        const norm = normalizeName(String(alias || ""));
        if (norm) map.set(norm, ex);
      }
    }
  }

  return map;
}

function inferSetType(row: JournalRow): "warmup" | "working" {
  const explicit = normalizeImportSetClass(row.set_type);
  if (explicit) return importSetClassToDbSetType(explicit);

  const notes = String(row.notes || "").toLowerCase();
  if (notes.includes("set_type=warmup")) return "warmup";
  if (notes.includes("set_type=technique")) return "working";
  if (notes.includes("set_type=diagnostic")) return "working";
  if (notes.includes("set_type=rehab")) return "working";

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
  return parseImportLoadToken(loadRaw)?.weight;
}

function inferTrackingMode(exerciseName: string): TrackingMode {
  return inferTrackingModeFromExerciseName(exerciseName);
}

function inferTrackingModeFromCsvRows(exerciseName: string, rows: JournalRow[]): TrackingMode {
  const hasWeightedLoad = rows.some((row) => {
    const weight = parseWeight(row.load);
    return weight !== undefined && Number.isFinite(weight) && weight !== 0;
  });
  const hasReps = rows.some((row) => {
    const reps = num(row.reps);
    return reps !== undefined && Number.isFinite(reps) && reps > 0;
  });
  const hasSeconds = rows.some((row) => {
    const reps = num(row.reps);
    const setType = normalizeImportSetClass(row.set_type);
    return (
      reps !== undefined &&
      Number.isFinite(reps) &&
      reps > 0 &&
      (setType === "conditioning" || setType === "cardio")
    );
  });

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

function defaultTrackType(exerciseName: string): TrackType {
  return defaultTrackTypeFromExerciseName(exerciseName);
}

function inferTrackTypeFromCsvRows(exerciseName: string, rows: JournalRow[]): TrackType {
  const classes = rows
    .map((row) => normalizeImportSetClass(row.set_type))
    .filter((kind): kind is ImportSetClass => kind !== null)
    .map(importSetClassToTrackIntentKind);

  if (!classes.length) return defaultTrackType(exerciseName);
  if (classes.every((kind) => kind === "technique")) return "technique";
  if (classes.every((kind) => kind === "mobility")) return "mobility";
  if (classes.every((kind) => kind === "corrective")) {
    return "corrective";
  }
  if (classes.every((kind) => kind === "conditioning" || kind === "cardio")) {
    return "conditioning";
  }

  return defaultTrackType(exerciseName);
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
  const st = normalizeImportSetClass(row.set_type);

  if (st === "technique") parts.push("technique");
  if (st === "diagnostic") parts.push("diagnostic");
  if (st === "rehab") parts.push("rehab");

  const noteText = String(row.notes || "").trim();
  if (noteText) parts.push(noteText);

  return parts.length ? parts.join(" | ") : undefined;
}

async function analyzeImportedExerciseNames(
  exerciseNames: string[]
): Promise<ImportExerciseResolutionSummary> {
  const exercises = await db.exercises.toArray();
  const resolverIndex = buildExerciseResolverIndex(exercises);
  const [tracks, templateItems, sessionItems, sets] = await Promise.all([
    db.tracks.toArray(),
    db.templateItems.toArray(),
    db.sessionItems.toArray(),
    db.sets.toArray(),
  ]);

  const newExerciseNames: string[] = [];
  const reviewExerciseNames: string[] = [];
  const duplicateReviews: ImportDuplicateReview[] = [];

  for (const name of exerciseNames) {
    const resolution = resolveExerciseFromIndex(
      {
        rawName: name,
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
      continue;
    }

    const candidates = buildExerciseDuplicateCandidates({
      rawName: name,
      exercises,
      tracks,
      templateItems,
      sessionItems,
      sets,
      maxCandidates: 3,
    }).filter((candidate) => candidate.confidence === "high");

    if (candidates.length > 0) {
      reviewExerciseNames.push(name);
      duplicateReviews.push({
        exerciseName: name,
        candidates,
      });
      continue;
    }

    newExerciseNames.push(name);
  }

  return {
    newExerciseNames,
    reviewExerciseNames,
    duplicateReviews,
  };
}

/* ============================================================================
   Breadcrumb 5 — Page
   ============================================================================ */
export default function ImportCsvPage() {
  const [status, setStatus] = useState<string>("");
  const [preview, setPreview] = useState<{
    totalRows: number;
    liftRows: number;
    uniqueExercises: number;
    newExerciseNames: string[];
    reviewExerciseNames: string[];
    duplicateReviews: ImportDuplicateReview[];
  } | null>(null);
  const [dryRun, setDryRun] = useState(true);
  const [fileObj, setFileObj] = useState<File | null>(null);
  const [reviewAcknowledged, setReviewAcknowledged] = useState(false);
  const [selectedExistingByName, setSelectedExistingByName] = useState<Record<string, string>>({});
  const [rememberAliasByName, setRememberAliasByName] = useState<Record<string, boolean>>({});

  const [lastImport, setLastImport] = useState<LastImportRecord | null>(() => loadLastImport());

  const canImport = useMemo(() => !!preview && !!fileObj, [preview, fileObj]);
  const canRollback = useMemo(() => !!lastImport?.sessionIds?.length, [lastImport]);
  const unresolvedReviewNames = useMemo(
    () => preview?.reviewExerciseNames.filter((name) => !selectedExistingByName[name]) ?? [],
    [preview, selectedExistingByName]
  );
  const effectiveNewCount = useMemo(
    () => (preview?.newExerciseNames.length ?? 0) + unresolvedReviewNames.length,
    [preview, unresolvedReviewNames]
  );
  const effectiveReviewCount = unresolvedReviewNames.length;

  const footer = useMemo(() => `${FILE_FOOTER} • v${PAGE_VERSION} • ${BUILD_ID}`, []);

  /* --------------------------------------------------------------------------
     Breadcrumb 6 — Preview parse
     ----------------------------------------------------------------------- */
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
      const message = `CSV parse error: ${parsed.errors[0].message}`;
      setStatus(message);

      await addAppLog({
        type: "import",
        level: "error",
        message: "CSV preview parse failed",
        detailsJson: JSON.stringify({
          fileName: file.name,
          error: parsed.errors[0].message,
        }),
      });
      return;
    }

    const rows = (parsed.data || []).filter(Boolean);
    const liftRows = rows.filter(
      (r) => String(r.session_type || "").trim().toLowerCase() === "lift" && r.exercise
    );

    const uniqueExercises = new Set(
      liftRows.map((r) => normalizeExerciseName(String(r.exercise || ""))).filter((x) => x.length > 0)
    );
    const duplicateSummary = await analyzeImportedExerciseNames(Array.from(uniqueExercises));

    setPreview({
      totalRows: rows.length,
      liftRows: liftRows.length,
      uniqueExercises: uniqueExercises.size,
      newExerciseNames: duplicateSummary.newExerciseNames,
      reviewExerciseNames: duplicateSummary.reviewExerciseNames,
      duplicateReviews: duplicateSummary.duplicateReviews,
    });
    setReviewAcknowledged(false);
    setSelectedExistingByName({});
    setRememberAliasByName({});

    await addAppLog({
      type: "import",
      level: "info",
      message: "Parsed CSV for preview",
        detailsJson: JSON.stringify({
          fileName: file.name,
          totalRows: rows.length,
          liftRows: liftRows.length,
          uniqueExercises: uniqueExercises.size,
          reviewExercises: duplicateSummary.reviewExerciseNames.length,
        }),
      });

    setStatus("Parsed ✓ Ready to import.");
  }

  /* --------------------------------------------------------------------------
     Breadcrumb 7 — Rollback
     ----------------------------------------------------------------------- */
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

    await addAppLog({
      type: "import",
      level: "warn",
      message: "Rolled back last import",
      detailsJson: JSON.stringify({
        importId: rec.importId,
        sessionCount: rec.sessionIds.length,
        deletedSessionItems: siIds.length,
        deletedSets: setIds.length,
      }),
    });

    setStatus(
      `Rollback complete ✓ Deleted ${rec.sessionIds.length} sessions, ${siIds.length} session items, ${setIds.length} sets. (Tracks/Exercises left intact.)`
    );
  }

  /* --------------------------------------------------------------------------
     Breadcrumb 8 — Import
     ----------------------------------------------------------------------- */
  async function importNow(file: File) {
    setStatus("Importing…");

    const text = await file.text();
    const parsed = Papa.parse<JournalRow>(text, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
    });

    if (parsed.errors?.length) {
      const message = `CSV parse error: ${parsed.errors[0].message}`;
      setStatus(message);

      await addAppLog({
        type: "import",
        level: "error",
        message: "CSV import parse failed",
        detailsJson: JSON.stringify({
          fileName: file.name,
          error: parsed.errors[0].message,
        }),
      });
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
    const duplicateSummary = await analyzeImportedExerciseNames(exerciseNames);
    const unresolvedReviewNames = duplicateSummary.reviewExerciseNames.filter(
      (name) => !selectedExistingByName[name]
    );

    if (unresolvedReviewNames.length > 0 && !reviewAcknowledged) {
      setPreview((prev) =>
        prev
          ? {
              ...prev,
              newExerciseNames: duplicateSummary.newExerciseNames,
              reviewExerciseNames: duplicateSummary.reviewExerciseNames,
              duplicateReviews: duplicateSummary.duplicateReviews,
            }
          : prev
      );
      setStatus(
        `Import blocked: review possible duplicate exercises before continuing.\n${unresolvedReviewNames.join(", ")}`
      );
      return;
    }

    const existingExercises = await db.exercises.toArray();
    const resolverIndex = buildExerciseResolverIndex(existingExercises);

    const existingTracks = await db.tracks.toArray();
    const trackByDisplay = new Map<string, Track>();
    for (const t of existingTracks) {
      trackByDisplay.set(normalizeName(t.displayName), t);
    }

    const now = Date.now();
    let aliasesRemembered = 0;

    const exerciseByImportedName = new Map<string, Exercise>();
    const newExercises: Exercise[] = [];
    for (const name of exerciseNames) {
      const selectedExistingId = selectedExistingByName[name];
      if (selectedExistingId) {
        const selectedExercise = existingExercises.find((exercise) => exercise.id === selectedExistingId);
        if (selectedExercise) {
          if (!dryRun && rememberAliasByName[name]) {
            const aliasResult = await appendExerciseAlias(selectedExercise.id, name);
            if (aliasResult.added) aliasesRemembered += 1;
          }
          exerciseByImportedName.set(name, selectedExercise);
          continue;
        }
      }

      const resolution = resolveExerciseFromIndex(
        {
          rawName: name,
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
          exerciseByImportedName.set(name, resolvedExercise);
          continue;
        }
      }

      if (resolution.status === "ambiguous" || resolution.status === "archived_match") {
        await addAppLog({
          type: "import",
          level: "error",
          message: "CSV import blocked by ambiguous exercise resolution",
          detailsJson: JSON.stringify({
            fileName: file.name,
            exerciseName: name,
            normalizedInput: resolution.normalizedInput,
            status: resolution.status,
            candidateIds: (resolution.candidates ?? []).map((x) => x.id),
            candidateNames: (resolution.candidates ?? []).map((x) => x.name),
            warnings: resolution.warnings,
          }),
        });

        setStatus(
          `Import blocked: ambiguous exercise match for "${name}". Review duplicate/alias data in Exercises before importing.`
        );
        return;
      }

      const normalized = normalizeName(name);
      const ex: Exercise = {
        id: uuid(),
        name,
        normalizedName: normalized,
        aliases: [],
        equipmentTags: [],
        createdAt: now,
        updatedAt: now,
      };

      newExercises.push(ex);
      exerciseByImportedName.set(name, ex);
    }

    const rowsByExerciseName = new Map<string, JournalRow[]>();
    for (const row of liftRows) {
      const name = normalizeExerciseName(String(row.exercise || ""));
      if (!name) continue;
      const arr = rowsByExerciseName.get(name) ?? [];
      arr.push(row);
      rowsByExerciseName.set(name, arr);
    }

    const newTracks: Track[] = [];
    for (const name of exerciseNames) {
      const normalized = normalizeName(name);
      if (trackByDisplay.has(normalized)) continue;

      const ex = exerciseByImportedName.get(name);
      if (!ex) continue;

      const t: Track = {
        id: uuid(),
        exerciseId: ex.id,
        displayName: name,
        trackType: inferTrackTypeFromCsvRows(name, rowsByExerciseName.get(name) ?? []),
        trackingMode: inferTrackingModeFromCsvRows(name, rowsByExerciseName.get(name) ?? []),
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
      await addAppLog({
        type: "import",
        level: "info",
        message: "Completed import dry run",
        detailsJson: JSON.stringify({
          fileName: file.name,
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

    const rec: LastImportRecord = {
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
      message: "Imported CSV successfully",
      detailsJson: JSON.stringify({
        fileName: file.name,
        exercisesAdded: newExercises.length,
        tracksAdded: newTracks.length,
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
          setReviewAcknowledged(false);
          setSelectedExistingByName({});
          setRememberAliasByName({});
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
          <div className="kv">
            <span>Preview NEW</span>
            <span>{effectiveNewCount}</span>
          </div>
          <div className="kv">
            <span>Preview REVIEW</span>
            <span>{effectiveReviewCount}</span>
          </div>

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
                {preview.duplicateReviews.map((review) => (
                  <div key={review.exerciseName} className="card" style={{ padding: 10 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flexWrap: "wrap",
                        marginBottom: 8,
                      }}
                    >
                      <div style={{ fontWeight: 700 }}>{review.exerciseName}</div>
                      {selectedExistingByName[review.exerciseName] ? (
                        <span className="badge">USE EXISTING</span>
                      ) : (
                        <span className="badge" style={{ background: "#f59e0b", color: "#111827" }}>
                          REVIEW
                        </span>
                      )}
                    </div>
                    <div style={{ display: "grid", gap: 8 }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>Possible duplicate</div>
                      {review.candidates.map((candidate) => (
                        <div
                          key={`${review.exerciseName}-${candidate.exerciseId}`}
                          className="muted"
                          style={{ fontSize: 13 }}
                        >
                          <div style={{ color: "var(--text)", fontWeight: 700 }}>{candidate.name}</div>
                          <div>{candidate.reason}</div>
                          <div>
                            Sets {candidate.evidence.setCount} • Tracks {candidate.evidence.trackCount}
                            {candidate.evidence.equipment ? ` • ${candidate.evidence.equipment}` : ""}
                            {candidate.evidence.bodyPart ? ` • ${candidate.evidence.bodyPart}` : ""}
                          </div>
                          <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button
                              type="button"
                              className="btn"
                              onClick={() => {
                                setSelectedExistingByName((prev) => ({
                                  ...prev,
                                  [review.exerciseName]: candidate.exerciseId,
                                }));
                                setRememberAliasByName((prev) => ({
                                  ...prev,
                                  [review.exerciseName]: false,
                                }));
                                setReviewAcknowledged(false);
                              }}
                            >
                              Use existing
                            </button>
                            {selectedExistingByName[review.exerciseName] === candidate.exerciseId && (
                              <span style={{ color: "var(--text)", fontWeight: 700 }}>
                                Using existing: {candidate.name}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    {selectedExistingByName[review.exerciseName] && (
                      <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                        <label style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                          <input
                            type="checkbox"
                            checked={!!rememberAliasByName[review.exerciseName]}
                            onChange={(e) =>
                              setRememberAliasByName((prev) => ({
                                ...prev,
                                [review.exerciseName]: e.target.checked,
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
                                delete next[review.exerciseName];
                                return next;
                              });
                              setRememberAliasByName((prev) => {
                                const next = { ...prev };
                                delete next[review.exerciseName];
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
                  </div>
                ))}

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

      {status && (
        <div className="muted" style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>
          {status}
        </div>
      )}

      <div style={{ marginTop: 10, fontSize: 12, color: "var(--muted)" }}>{footer}</div>
    </div>
  );
}

/* ============================================================================
   End of file: src/pages/ImportCsvPage.tsx
   ============================================================================ */
