// src/data/normalizeTimestamps.ts
// BUILD_ID: 2026-03-01-NORM-TS-01
//
// Goal: guarantee createdAt/completedAt are sane after any import.
// - Strong import: keep real timestamps if present
// - Journal import (date-only): create deterministic timestamps at local midday
//
// Notes:
// - "midday" avoids DST edge cases around midnight.
// - we keep ordering stable by adding small offsets per set.

import type { SetEntry } from "../db";

export type TimestampFixStats = {
  scannedSets: number;
  fixedCreatedAt: number;
  fixedCompletedAt: number;
  fixedNegativeCreatedAt: number;
};

export function localMiddayEpochMs(dateISO: string): number {
  // Accepts "YYYY-MM-DD" (date-only).
  // Creates Date in local time at 12:00:00.000
  const [y, m, d] = dateISO.split("-").map((x) => Number(x));
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0);
  return dt.getTime();
}

export function isBadEpochMs(x: any): boolean {
  return typeof x !== "number" || !Number.isFinite(x) || x <= 0;
}

export function normalizeImportedSets(
  sets: Array<SetEntry & Record<string, any>>,
  opts: {
    // If the import only has a date (YYYY-MM-DD), provide it.
    // We'll use local midday + deterministic offsets.
    dateISO?: string;

    // Optional: if you know the session startedAt, pass it.
    startedAt?: number;

    // How many ms to add per set to preserve ordering.
    perSetMs?: number;
  } = {}
): { sets: Array<SetEntry & Record<string, any>>; stats: TimestampFixStats } {
  const perSetMs = opts.perSetMs ?? 30_000; // 30s increments
  const base =
    (typeof opts.startedAt === "number" && Number.isFinite(opts.startedAt) && opts.startedAt > 0
      ? opts.startedAt
      : opts.dateISO
      ? localMiddayEpochMs(opts.dateISO)
      : Date.now()) || Date.now();

  let fixedCreatedAt = 0;
  let fixedCompletedAt = 0;
  let fixedNegativeCreatedAt = 0;

  const out = sets.map((s, idx) => {
    const patch: any = { ...s };

    // createdAt: must exist and be > 0
    if (typeof patch.createdAt === "number" && patch.createdAt < 0) {
      fixedNegativeCreatedAt += 1;
    }
    if (isBadEpochMs(patch.createdAt)) {
      patch.createdAt = base + idx * perSetMs;
      fixedCreatedAt += 1;
    }

    // completedAt: if set is "completed", must exist and be > 0
    // Heuristic: if reps/weight/etc exist and it's a working set, mark completedAt if missing.
    // NOTE: your app’s "done" is currently tied to completedAt presence.
    const kind = String(patch.setType ?? "working");
    const looksCompleted =
      patch.completedAt ||
      // if you imported sets that were "done" but missing completedAt, this catches them:
      (kind === "working" &&
        (patch.reps !== undefined ||
          patch.weight !== undefined ||
          patch.distance !== undefined ||
          patch.seconds !== undefined));

    if (looksCompleted && isBadEpochMs(patch.completedAt)) {
      patch.completedAt = patch.createdAt;
      fixedCompletedAt += 1;
    }

    return patch;
  });

  return {
    sets: out,
    stats: {
      scannedSets: sets.length,
      fixedCreatedAt,
      fixedCompletedAt,
      fixedNegativeCreatedAt,
    },
  };
}