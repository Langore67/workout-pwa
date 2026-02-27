// src/strength/strength.ts
/* ========================================================================== */
/*  strength.ts                                                               */
/*  BUILD_ID: 2026-02-26-STRENGTH-08                                           */
/* -------------------------------------------------------------------------- */
/*  Strength Index                                                            */
/*                                                                            */
/*  Adds (STRENGTH-08)                                                        */
/*  ✅ computeStrengthIndexAt(endAtMs, windowDays)                             */
/*  ✅ computeStrengthTrend(weeks, windowDays) — REAL snapshots                */
/*  ✅ Trend sorted most-recent-first                                          */
/*                                                                            */
/*  Revision history                                                          */
/*  - 2026-02-25  STRENGTH-01  Initial computeStrengthIndex() scaffold         */
/*  - 2026-02-26  STRENGTH-03  Perf: remove N+1 track loop (batch load)        */
/*  - 2026-02-26  STRENGTH-06  BW: use BodyPage schema (takenAt/weightLb)      */
/*  - 2026-02-26  STRENGTH-07  BW: accept weightLb/weight + takenAt/date/...   */
/*  - 2026-02-26  STRENGTH-08  Trend: computeStrengthIndexAt + computeTrend    */
/* ========================================================================== */

import { db } from "../db";

export type StrengthPattern = "squat" | "hinge" | "push" | "pull";

export interface PatternScore {
  pattern: StrengthPattern;
  absolute: number; // best e1RM for pattern
  relative: number; // best e1RM / bodyweight
}

export interface StrengthIndexResult {
  absoluteIndex: number;
  relativeIndex: number;
  patterns: PatternScore[];
  bodyweight: number; // BW used for relative index (5-day avg if available)
  bodyweightDaysUsed: number; // distinct days used (<= 5). 0 means fallback.
}

export type StrengthTrendRow = {
  weekEndMs: number; // snapshot timestamp (week end anchor)
  label: string; // e.g., "Feb 26"
  bodyweight: number;
  bodyweightDaysUsed: number;
  absoluteIndex: number;
  relativeIndex: number;
};

/* -------------------------------------------------------------------------- */
/* Breadcrumb 1 — E1RM                                                        */
/* -------------------------------------------------------------------------- */
export function computeE1RM(weight: number, reps: number) {
  const w = Number(weight);
  const r = Number(reps);
  if (!Number.isFinite(w) || !Number.isFinite(r) || w <= 0 || r <= 0) return 0;
  return w * (1 + r / 30);
}

/* -------------------------------------------------------------------------- */
/* Breadcrumb 2 — Pattern classification                                       */
/* -------------------------------------------------------------------------- */
const EXERCISE_ID_OVERRIDES: Record<string, StrengthPattern> = {
  // Optional: pin specific UUIDs once you know them.
};

function norm(s: any): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[_\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function patternFromName(name: string): StrengthPattern | undefined {
  const n = norm(name);

  if (n.includes("squat") || n.includes("front squat") || n.includes("box squat")) return "squat";

  if (
    n.includes("deadlift") ||
    n.includes("rdl") ||
    n.includes("romanian") ||
    n.includes("good morning") ||
    n.includes("hip hinge")
  )
    return "hinge";

  if (
    (n.includes("bench") || n.includes("press") || n.includes("overhead") || n.includes("incline")) &&
    !n.includes("leg press")
  )
    return "push";

  if (
    n.includes("row") ||
    n.includes("pulldown") ||
    n.includes("pull down") ||
    n.includes("pullup") ||
    n.includes("pull-up") ||
    n.includes("chin") ||
    n.includes("lat pull")
  )
    return "pull";

  return undefined;
}

/* -------------------------------------------------------------------------- */
/* Breadcrumb 3 — Bodyweight (5-day rolling avg)                               */
/*   - Prefer BodyPage table: db.bodyMetrics                                   */
/*   - Accept schema variants: weightLb | weight, takenAt | date | createdAt   */
/*   - Support "as-of" computations (endAtMs) for trend snapshots              */
/* -------------------------------------------------------------------------- */
function dayKey(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function pickBodyTable(): any | null {
  const anyDb: any = db as any;

  const preferred = anyDb.bodyMetrics;
  if (preferred && (typeof preferred.orderBy === "function" || typeof preferred.toArray === "function")) return preferred;

  const candidates = [anyDb.bodyLogs, anyDb.body, anyDb.bodyEntries, anyDb.bodyweights].filter(Boolean);
  for (const t of candidates) {
    if (t && (typeof t.orderBy === "function" || typeof t.toArray === "function")) return t;
  }
  return null;
}

function readRowTimeMs(r: any): number {
  const t = Number(r?.takenAt ?? r?.date ?? r?.createdAt);
  return Number.isFinite(t) ? t : NaN;
}

function readRowWeightLb(r: any): number {
  const w = Number(r?.weightLb ?? r?.weight);
  return Number.isFinite(w) ? w : NaN;
}

async function loadRecentRows(table: any, endAtMs: number): Promise<any[]> {
  // Pull a chunk of recent rows. Try indexed order first; fallback to toArray+sort.
  // We filter to <= endAtMs to make "as-of" snapshots stable.
  try {
    if (typeof table.orderBy === "function") {
      // Try takenAt index first. If not indexed, this can throw.
      const arr = await table.orderBy("takenAt").reverse().limit(300).toArray();
      return (arr ?? []).filter((r: any) => readRowTimeMs(r) <= endAtMs);
    }
  } catch {
    // fallback below
  }

  try {
    const arr: any[] = (await table.toArray()) ?? [];
    return arr
      .slice()
      .filter((r) => readRowTimeMs(r) <= endAtMs)
      .sort((a, b) => {
        const tb = readRowTimeMs(b);
        const ta = readRowTimeMs(a);
        return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
      })
      .slice(0, 300);
  } catch {
    return [];
  }
}

async function getBodyweightRollingAvgAt(
  endAtMs: number,
  days = 5
): Promise<{ avg: number; daysUsed: number }> {
  const table = pickBodyTable();
  if (!table) return { avg: 200, daysUsed: 0 };

  const rows = await loadRecentRows(table, endAtMs);
  if (!rows.length) return { avg: 200, daysUsed: 0 };

  // Latest entry per DISTINCT day (up to N days)
  const latestPerDay = new Map<string, number>();

  for (const r of rows) {
    const t = readRowTimeMs(r);
    const w = readRowWeightLb(r);
    if (!Number.isFinite(t) || !Number.isFinite(w) || w <= 0) continue;

    const k = dayKey(t);
    if (!latestPerDay.has(k)) latestPerDay.set(k, w);
    if (latestPerDay.size >= days) break;
  }

  const weights = Array.from(latestPerDay.values());
  if (!weights.length) return { avg: 200, daysUsed: 0 };

  const avg = weights.reduce((a, b) => a + b, 0) / weights.length;
  return { avg, daysUsed: weights.length };
}

/* -------------------------------------------------------------------------- */
/* Breadcrumb 4 — Core computation (as-of endAtMs)                             */
/* -------------------------------------------------------------------------- */
export async function computeStrengthIndexAt(endAtMs: number, windowDays = 28): Promise<StrengthIndexResult> {
  const endAt = Number(endAtMs);
  const cutoff = endAt - windowDays * 24 * 60 * 60 * 1000;

  const bestByPattern: Record<StrengthPattern, number> = {
    squat: 0,
    hinge: 0,
    push: 0,
    pull: 0,
  };

  const bw = await getBodyweightRollingAvgAt(endAt, 5);
  const bodyweight = bw.avg;

  // Sessions ended within window (cutoff..endAt)
  const sessions = await db.sessions.where("endedAt").between(cutoff, endAt, true, true).toArray();
  const sessionIds = sessions.map((s: any) => s.id).filter(Boolean);

  if (!sessionIds.length) {
    const patterns: PatternScore[] = (Object.keys(bestByPattern) as StrengthPattern[]).map((p) => ({
      pattern: p,
      absolute: 0,
      relative: 0,
    }));
    return {
      absoluteIndex: 0,
      relativeIndex: 0,
      patterns,
      bodyweight,
      bodyweightDaysUsed: bw.daysUsed,
    };
  }

  const sets = await db.sets.where("sessionId").anyOf(sessionIds).toArray();

  const working = (sets as any[]).filter(
    (s) =>
      !!s?.completedAt &&
      Number(s?.completedAt) <= endAt &&
      s?.setType === "working" &&
      typeof s?.weight === "number" &&
      typeof s?.reps === "number"
  );

  if (!working.length) {
    const patterns: PatternScore[] = (Object.keys(bestByPattern) as StrengthPattern[]).map((p) => ({
      pattern: p,
      absolute: 0,
      relative: 0,
    }));
    return {
      absoluteIndex: 0,
      relativeIndex: 0,
      patterns,
      bodyweight,
      bodyweightDaysUsed: bw.daysUsed,
    };
  }

  // PERF: batch load tracks
  const trackIds = Array.from(new Set(working.map((s) => s.trackId).filter(Boolean)));
  const tracksArr: any[] = await db.tracks.bulkGet(trackIds);

  const trackById = new Map<string, any>();
  for (const t of tracksArr) if (t?.id) trackById.set(t.id, t);

  // Batch load exercises (for name heuristic)
  const exerciseIds = Array.from(new Set(tracksArr.map((t) => t?.exerciseId).filter(Boolean))) as string[];
  const exercisesArr: any[] = await db.exercises.bulkGet(exerciseIds);

  const exerciseById = new Map<string, any>();
  for (const ex of exercisesArr) if (ex?.id) exerciseById.set(ex.id, ex);

  function patternFast(exerciseId: string): StrengthPattern | undefined {
    const override = EXERCISE_ID_OVERRIDES[exerciseId];
    if (override) return override;

    const ex = exerciseById.get(exerciseId);
    const name = ex?.name ?? ex?.displayName ?? ex?.title ?? "";
    return patternFromName(name);
  }

  for (const s of working) {
    const track = trackById.get(s.trackId);
    if (!track) continue;

    const exId = String(track.exerciseId ?? "");
    if (!exId) continue;

    const pattern = patternFast(exId);
    if (!pattern) continue;

    const e1rm = computeE1RM(s.weight, s.reps);
    if (e1rm > bestByPattern[pattern]) bestByPattern[pattern] = e1rm;
  }

  const patterns: PatternScore[] = (Object.keys(bestByPattern) as StrengthPattern[]).map((p) => ({
    pattern: p,
    absolute: bestByPattern[p],
    relative: bodyweight > 0 ? bestByPattern[p] / bodyweight : 0,
  }));

  const absoluteIndex = patterns.reduce((sum, p) => sum + p.absolute, 0) / patterns.length;
  const relativeIndex = patterns.reduce((sum, p) => sum + p.relative, 0) / patterns.length;

  return {
    absoluteIndex: Number.isFinite(absoluteIndex) ? absoluteIndex : 0,
    relativeIndex: Number.isFinite(relativeIndex) ? relativeIndex : 0,
    patterns,
    bodyweight,
    bodyweightDaysUsed: bw.daysUsed,
  };
}

/* -------------------------------------------------------------------------- */
/* Breadcrumb 5 — Default: "now" computation (existing API)                    */
/* -------------------------------------------------------------------------- */
export async function computeStrengthIndex(windowDays = 28): Promise<StrengthIndexResult> {
  return computeStrengthIndexAt(Date.now(), windowDays);
}

/* -------------------------------------------------------------------------- */
/* Breadcrumb 6 — Trend (last N weeks), most recent first                      */
/* -------------------------------------------------------------------------- */
function fmtWeekLabel(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export async function computeStrengthTrend(weeks = 12, windowDays = 28): Promise<StrengthTrendRow[]> {
  const n = Math.max(1, Math.min(52, Math.floor(Number(weeks) || 12)));
  const end0 = startOfDay(Date.now()) + 23 * 60 * 60 * 1000 + 59 * 60 * 1000 + 59 * 1000; // end of today

  const rows: StrengthTrendRow[] = [];

  for (let i = 0; i < n; i++) {
    const endAt = end0 - i * 7 * 24 * 60 * 60 * 1000;
    const r = await computeStrengthIndexAt(endAt, windowDays);

    rows.push({
      weekEndMs: endAt,
      label: fmtWeekLabel(endAt),
      bodyweight: r.bodyweight,
      bodyweightDaysUsed: r.bodyweightDaysUsed,
      absoluteIndex: r.absoluteIndex,
      relativeIndex: r.relativeIndex,
    });
  }

  // Most recent week at top
  rows.sort((a, b) => b.weekEndMs - a.weekEndMs);
  return rows;
}

/* ========================================================================== */
/*  End of file: src/strength/strength.ts                                     */
/* ========================================================================== */