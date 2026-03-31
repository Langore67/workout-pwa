// src/importers/importSession.ts
// BUILD_ID: 2026-03-02-IMPORT-SESSION-01

import { db } from "../db";
import { uuid } from "../utils";
import {
  localMiddayEpochMs,
  normalizeImportedSets as normalizeImportedSetTimestamps,
} from "../data/normalizeTimestamps";

// Bring your SetEntry type if you want it strongly typed.
// If not, keep it as any.
import type { SetEntry } from "../db";

type ImportedSet = Partial<SetEntry> & Record<string, any>;

export async function importSessionFromJournal(args: {
  // Required: date-only journal import
  dateISO: string; // "YYYY-MM-DD"
  templateId?: string;
  templateName?: string;

  // Any notes you want on the session
  notes?: string;

  // Sets must already include trackId, setType, reps/weight/etc as available
  sets: ImportedSet[];
}) {
  const startedAt = localMiddayEpochMs(args.dateISO);
  const sessionId = uuid();

  // Create session
  await db.sessions.add({
    id: sessionId,
    templateId: args.templateId,
    templateName: args.templateName,
    startedAt,
    notes: args.notes?.trim() || undefined,
  } as any);

  // Normalize sets (timestamps + completedAt semantics)
  const { sets: normalized, stats } = normalizeImportedSetTimestamps(args.sets as ImportedSet[], {
    startedAt,
  });

  // Attach sessionId
  const toInsert = normalized.map((s) => ({
    ...s,
    id: s.id ?? uuid(),
    sessionId,
  }));

  await db.sets.bulkAdd(toInsert as any);

  return {
    sessionId,
    startedAt,
    stats: {
      scanned: stats.scannedSets,
      fixedCreatedAt: stats.fixedCreatedAt,
      fixedCompletedAt: stats.fixedCompletedAt,
      fixedNegativeCreatedAt: stats.fixedNegativeCreatedAt,
    },
  };
}
