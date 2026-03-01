// src/importers/importSession.ts
// BUILD_ID: 2026-03-02-IMPORT-SESSION-01

import { db } from "../db";
import { uuid } from "../utils";

// Bring your SetEntry type if you want it strongly typed.
// If not, keep it as any.
import type { SetEntry } from "../db";

type ImportedSet = Partial<SetEntry> & Record<string, any>;

function localMiddayEpochMs(dateISO: string): number {
  const [y, m, d] = dateISO.split("-").map((x) => Number(x));
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0);
  return dt.getTime();
}

function isBadEpochMs(x: any): boolean {
  return typeof x !== "number" || !Number.isFinite(x) || x <= 0;
}

function normalizeImportedSets(
  sets: ImportedSet[],
  opts: { startedAt: number; perSetMs?: number }
) {
  const perSetMs = opts.perSetMs ?? 30_000;

  let fixedCreatedAt = 0;
  let fixedCompletedAt = 0;
  let fixedNegativeCreatedAt = 0;

  const out = sets.map((s, idx) => {
    const patch: any = { ...s };

    // createdAt must be sane
    if (typeof patch.createdAt === "number" && patch.createdAt < 0) fixedNegativeCreatedAt += 1;
    if (isBadEpochMs(patch.createdAt)) {
      patch.createdAt = opts.startedAt + idx * perSetMs;
      fixedCreatedAt += 1;
    }

    // completedAt is what your UI uses for ✓
    // If import says it's done but completedAt missing, set it.
    // Heuristic: if it has performance data, treat it as completed.
    const kind = String(patch.setType ?? "working");
    const hasAnyMetric =
      patch.reps !== undefined ||
      patch.weight !== undefined ||
      patch.distance !== undefined ||
      patch.seconds !== undefined;

    if ((patch.completedAt || (kind === "working" && hasAnyMetric)) && isBadEpochMs(patch.completedAt)) {
      patch.completedAt = patch.createdAt;
      fixedCompletedAt += 1;
    }

    return patch;
  });

  return {
    sets: out,
    stats: { scanned: sets.length, fixedCreatedAt, fixedCompletedAt, fixedNegativeCreatedAt },
  };
}

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
  const { sets: normalized, stats } = normalizeImportedSets(args.sets, { startedAt });

  // Attach sessionId
  const toInsert = normalized.map((s) => ({
    ...s,
    id: s.id ?? uuid(),
    sessionId,
  }));

  await db.sets.bulkAdd(toInsert as any);

  return { sessionId, startedAt, stats };
}