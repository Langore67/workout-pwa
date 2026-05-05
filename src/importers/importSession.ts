// src/importers/importSession.ts
// BUILD_ID: 2026-05-04-IMPORT-SESSION-02

import { db, normalizeName, type MetricMode, type SetEntry, type TrackType, type TrackingMode } from "../db";
import { uuid } from "../utils";
import {
  localMiddayEpochMs,
  normalizeImportedSets as normalizeImportedSetTimestamps,
} from "../data/normalizeTimestamps";
import { findOrCreateReusableTrack } from "../lib/reusableTrackWorkflow";

type ImportedMetricType = "reps" | "distance" | "duration";

type ImportedSet = Partial<SetEntry> &
  Record<string, any> & {
    exerciseName?: string;
    trackType?: TrackType;
    trackingMode?: TrackingMode;
    metricType?: ImportedMetricType;
  };

export type ParsedIfWorkout = {
  dateISO: string;
  templateName: string;
  start?: string;
  end?: string;
  notes?: string;
  sets: ImportedSet[];
};

function parseClockMs(dateISO: string, rawTime?: string): number | undefined {
  const time = String(rawTime ?? "").trim();
  if (!time) return undefined;
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return undefined;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return undefined;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return undefined;
  const [y, m, d] = dateISO.split("-").map((x) => Number(x));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return undefined;
  return new Date(y, m - 1, d, hh, mm, 0, 0).getTime();
}

function resolveSessionWindow(dateISO: string, start?: string, end?: string) {
  const fallback = localMiddayEpochMs(dateISO);
  const startedAt = parseClockMs(dateISO, start) ?? fallback;
  const resolvedEnd = parseClockMs(dateISO, end);
  const endedAt = resolvedEnd && resolvedEnd >= startedAt ? resolvedEnd : startedAt;
  return { startedAt, endedAt };
}

function parseDurationSeconds(valueRaw: string, unitRaw: string): number | undefined {
  const value = Number(valueRaw);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  const unit = unitRaw.trim().toLowerCase();
  if (unit === "s" || unit === "sec" || unit === "secs" || unit === "second" || unit === "seconds") {
    return Math.round(value);
  }
  if (unit === "min" || unit === "mins" || unit === "minute" || unit === "minutes") {
    return Math.round(value * 60);
  }
  return undefined;
}

function parseDistanceMeters(valueRaw: string, unitRaw: string): number | undefined {
  const value = Number(valueRaw);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  const unit = unitRaw.trim().toLowerCase();
  if (unit === "km") return value * 1000;
  return undefined;
}

function parseIfSetLine(line: string): ImportedSet | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const match = trimmed.match(
    /^(warmup|work|technique|mobility|corrective|diagnostic|rehab|conditioning|test)\s+(BW)x(\d+(?:\.\d+)?)(km|min|mins|minute|minutes|s|sec|secs|second|seconds)(?:\s+(.*))?$/i
  );
  if (!match) return null;

  const setKind = String(match[1] ?? "").trim().toLowerCase();
  const valueRaw = String(match[3] ?? "");
  const unitRaw = String(match[4] ?? "");
  const notes = String(match[5] ?? "").trim() || undefined;

  const seconds = parseDurationSeconds(valueRaw, unitRaw);
  if (seconds !== undefined) {
    return {
      setType: setKind === "warmup" ? "warmup" : "working",
      trackType: "conditioning",
      trackingMode: "timeSeconds",
      metricType: "duration",
      weight: undefined,
      seconds,
      notes,
    };
  }

  const distance = parseDistanceMeters(valueRaw, unitRaw);
  if (distance !== undefined) {
    return {
      setType: setKind === "warmup" ? "warmup" : "working",
      trackType: "conditioning",
      trackingMode: "repsOnly",
      metricType: "distance",
      weight: undefined,
      distance,
      distanceUnit: "m",
      notes,
    };
  }

  return null;
}

export function parseIfJournalText(text: string): ParsedIfWorkout {
  const lines = String(text ?? "").replace(/\r/g, "").split("\n");
  let templateName = "";
  let dateISO = "";
  let start = "";
  let end = "";
  let notes = "";
  let inNotesBlock = false;
  let currentExercise = "";
  const sets: ImportedSet[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line) continue;

    if (inNotesBlock) {
      const isMetaLine =
        /^session\s*:/i.test(line) || /^date\s*:/i.test(line) || /^start\s*:/i.test(line) || /^end\s*:/i.test(line);
      if (isMetaLine) {
        inNotesBlock = false;
        i -= 1;
        continue;
      }
      const maybeSet = parseIfSetLine(line);
      if (maybeSet || /^exercises?\s*:?\s*$/i.test(line)) {
        inNotesBlock = false;
        i -= 1;
        continue;
      }
      if (currentExercise && !maybeSet) {
        inNotesBlock = false;
        i -= 1;
        continue;
      }
      notes = notes ? `${notes}\n${raw}` : raw;
      continue;
    }

    const sessionMatch = line.match(/^session\s*:\s*(.+)$/i);
    if (sessionMatch) {
      templateName = sessionMatch[1].trim();
      currentExercise = "";
      continue;
    }

    const dateMatch = line.match(/^date\s*:\s*(\d{4}-\d{2}-\d{2})$/i);
    if (dateMatch) {
      dateISO = dateMatch[1].trim();
      currentExercise = "";
      continue;
    }

    const startMatch = line.match(/^start\s*:\s*(.*)$/i);
    if (startMatch) {
      start = startMatch[1].trim();
      currentExercise = "";
      continue;
    }

    const endMatch = line.match(/^end\s*:\s*(.*)$/i);
    if (endMatch) {
      end = endMatch[1].trim();
      currentExercise = "";
      continue;
    }

    const notesInlineMatch = line.match(/^notes?\s*:\s*(.*)$/i);
    if (notesInlineMatch) {
      notes = notesInlineMatch[1].trim();
      if (!notes) inNotesBlock = true;
      currentExercise = "";
      continue;
    }

    if (/^exercises?\s*:?\s*$/i.test(line)) {
      currentExercise = "";
      continue;
    }

    const parsedSet = parseIfSetLine(line);
    if (parsedSet) {
      if (!currentExercise) throw new Error(`Set line appeared before an exercise name: ${line}`);
      sets.push({
        ...parsedSet,
        exerciseName: currentExercise,
      });
      continue;
    }

    currentExercise = line;
  }

  if (!dateISO) throw new Error("IF import requires Date: YYYY-MM-DD");
  if (!templateName) templateName = "Imported Session";

  return {
    dateISO,
    templateName,
    start: start || undefined,
    end: end || undefined,
    notes: notes.trim() || undefined,
    sets,
  };
}

async function findOrCreateExerciseId(exerciseName: string, metricType?: ImportedMetricType): Promise<string> {
  const name = String(exerciseName ?? "").trim();
  if (!name) throw new Error("Exercise name is required.");
  const normalized = normalizeName(name);
  const now = Date.now();

  const existing = await db.exercises.where("normalizedName").equals(normalized).first();
  if (existing?.id) {
    const metricMode = metricType === "distance" ? "distance" : metricType === "duration" ? "time" : undefined;
    if (metricMode && (existing as any).metricMode !== metricMode) {
      await db.exercises.update(existing.id, { metricMode, updatedAt: now } as any);
    }
    return existing.id;
  }

  const exerciseId = uuid();
  const metricMode: MetricMode = metricType === "distance" ? "distance" : metricType === "duration" ? "time" : "reps";

  await db.exercises.add({
    id: exerciseId,
    name,
    normalizedName: normalized,
    equipmentTags: [],
    metricMode,
    createdAt: now,
    updatedAt: now,
  } as any);

  return exerciseId;
}

async function resolveTrackIdForImportedSet(set: ImportedSet): Promise<string> {
  if (set.trackId) return String(set.trackId);

  const exerciseName = String(set.exerciseName ?? "").trim();
  if (!exerciseName) throw new Error("Imported set is missing exerciseName/trackId.");

  const trackType = (set.trackType ?? "strength") as TrackType;
  const trackingMode =
    set.trackingMode ??
    (set.metricType === "duration"
      ? "timeSeconds"
      : trackType === "conditioning"
        ? "repsOnly"
        : "weightedReps");

  const exerciseId = await findOrCreateExerciseId(exerciseName, set.metricType);
  return findOrCreateReusableTrack({
    exerciseId,
    desiredDisplayName: exerciseName,
    trackType,
    trackingMode,
    preferExactDisplayName: true,
    normalizeDisplayName: normalizeName,
  });
}

async function buildNormalizedImportSets(rawSets: ImportedSet[], startedAt: number) {
  const orderedTrackIds: string[] = [];
  const seenTrackIds = new Set<string>();
  let createdAt = startedAt + 1000;

  const resolved = [];
  for (const rawSet of rawSets) {
    const trackId = await resolveTrackIdForImportedSet(rawSet);
    if (!seenTrackIds.has(trackId)) {
      seenTrackIds.add(trackId);
      orderedTrackIds.push(trackId);
    }

    resolved.push({
      ...rawSet,
      trackId,
      createdAt: rawSet.createdAt ?? createdAt,
      completedAt: rawSet.completedAt ?? createdAt,
      updatedAt: rawSet.updatedAt ?? createdAt,
    });
    createdAt += 1000;
  }

  const { sets: normalized, stats } = normalizeImportedSetTimestamps(resolved as ImportedSet[], {
    startedAt,
  });

  return { normalized, stats, orderedTrackIds };
}

export async function importSessionFromJournal(
  args:
    | {
        text: string;
      }
    | {
        dateISO: string;
        templateId?: string;
        templateName?: string;
        start?: string;
        end?: string;
        notes?: string;
        sets: ImportedSet[];
      }
) {
  const parsed = "text" in args
    ? parseIfJournalText(args.text)
    : {
        dateISO: args.dateISO,
        templateId: args.templateId,
        templateName: args.templateName,
        start: args.start,
        end: args.end,
        notes: args.notes,
        sets: args.sets,
      };

  const { startedAt, endedAt } = resolveSessionWindow(parsed.dateISO, parsed.start, parsed.end);
  const sessionId = uuid();

  const { normalized, stats, orderedTrackIds } = await buildNormalizedImportSets(parsed.sets as ImportedSet[], startedAt);

  const toInsert = normalized.map((s) => ({
    ...s,
    id: s.id ?? uuid(),
    sessionId,
  }));

  const sessionItems = orderedTrackIds.map((trackId, index) => ({
    id: uuid(),
    sessionId,
    trackId,
    orderIndex: index,
    createdAt: startedAt + index,
  }));

  await db.transaction("rw", db.sessions, db.sets, db.sessionItems, async () => {
    await db.sessions.add({
      id: sessionId,
      templateId: "templateId" in parsed ? parsed.templateId : undefined,
      templateName: parsed.templateName,
      startedAt,
      endedAt,
      notes: parsed.notes?.trim() || undefined,
      updatedAt: endedAt,
    } as any);

    if (sessionItems.length) {
      await db.sessionItems.bulkAdd(sessionItems as any);
    }

    await db.sets.bulkAdd(toInsert as any);
  });

  return {
    sessionId,
    startedAt,
    endedAt,
    stats: {
      scanned: stats.scannedSets,
      fixedCreatedAt: stats.fixedCreatedAt,
      fixedCompletedAt: stats.fixedCompletedAt,
      fixedNegativeCreatedAt: stats.fixedNegativeCreatedAt,
    },
  };
}
