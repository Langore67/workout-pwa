// src/strength/strength.ts
/* ========================================================================== */
/*  strength.ts                                                               */
/*  BUILD_ID: 2026-03-08-STRENGTH-09                                          */
/*  FILE: src/strength/strength.ts                                            */
/* -------------------------------------------------------------------------- */
/*  Strength Index                                                            */
/*                                                                            */
/*  Changes (STRENGTH-09)                                                     */
/*  ✅ Upgrade per-pattern scoring from "single best set" to blended signal    */
/*  ✅ Add scored E1RM cap for rep-range stability (default max reps = 12)     */
/*  ✅ Add working-strength component (best N scored working sets average)      */
/*  ✅ Add exposure component (hard-set / completed-set signal)                */
/*  ✅ Preserve existing computeStrengthIndex* API                             */
/*  ✅ Keep legacy relativeIndex (linear BW) for compatibility                 */
/*  ✅ Add normalizedIndex using allometric scaling (BW^0.67)                  */
/*  ✅ Add richer pattern detail for future MPS / debug / UI                   */
/*                                                                            */
/*  Revision history                                                          */
/*  - 2026-02-25  STRENGTH-01  Initial computeStrengthIndex() scaffold         */
/*  - 2026-02-26  STRENGTH-03  Perf: remove N+1 track loop (batch load)        */
/*  - 2026-02-26  STRENGTH-06  BW: use BodyPage schema (takenAt/weightLb)      */
/*  - 2026-02-26  STRENGTH-07  BW: accept weightLb/weight + takenAt/date/...   */
/*  - 2026-02-26  STRENGTH-08  Trend: computeStrengthIndexAt + computeTrend    */
/*  - 2026-03-08  STRENGTH-09  Blended pattern score + normalized strength     */
/* ========================================================================== */

import { db } from "../db";
import {
  classifyStrengthPattern,
  classifyStrengthPatternFromExerciseName as classifyStrengthPatternFromSharedSource,
} from "../domain/exercises/strengthPatternClassifier";
import { isStrengthTrackType } from "../domain/trackingMode";

/* -------------------------------------------------------------------------- */
/* Breadcrumb 1 — Types                                                       */
/* -------------------------------------------------------------------------- */

export type StrengthPattern = "squat" | "hinge" | "push" | "pull";

export interface PatternScore {
  pattern: StrengthPattern;

  // Core components
  topSet: number; // best scored e1RM in window
  working: number; // avg of best working e1RMs in window
  exposure: number; // 0..1 readiness / exposure signal

  // Outputs
  absolute: number; // blended pattern score
  relative: number; // legacy linear absolute / BW
  normalized: number; // allometric absolute / BW^0.67

  // Debug / observability
  hardSets: number;
  completedWorkingSets: number;
}

export interface StrengthIndexResult {
  absoluteIndex: number;
  relativeIndex: number; // legacy linear relative score for compatibility
  normalizedIndex: number; // preferred relative score for MPS / bodyweight changes
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
  relativeIndex: number; // legacy linear
  normalizedIndex: number; // preferred relative trend
};

export type StrengthHeroMeta = {
  value: number | null;
  trendLabel: "Rising" | "Stable" | "Falling" | "Building";
  trendDetail: string;
  confidence: "High" | "Moderate" | "Low";
};

export type StrengthSnapshot = {
  result: StrengthIndexResult;
  trend: StrengthTrendRow[];
  heroMeta: StrengthHeroMeta;
};

/* -------------------------------------------------------------------------- */
/* Breadcrumb 2 — Constants / tuning knobs                                    */
/* -------------------------------------------------------------------------- */

const MAX_SCORING_REPS = 12;
const WORKING_SET_AVG_COUNT = 3;
const TARGET_HARD_SETS_PER_PATTERN = 6;

// Blended score weights
const TOP_WEIGHT = 0.55;
const WORKING_WEIGHT = 0.30;
const EXPOSURE_WEIGHT = 0.15;

// Allometric exponent for bodyweight normalization
const BW_EXPONENT = 0.67;

/* -------------------------------------------------------------------------- */
/* Breadcrumb 3 — E1RM helpers                                                */
/* -------------------------------------------------------------------------- */

export function computeE1RM(weight: number, reps: number) {
  const w = Number(weight);
  const r = Number(reps);
  if (!Number.isFinite(w) || !Number.isFinite(r) || w <= 0 || r <= 0) return 0;
  return w * (1 + r / 30);
}

export function computeScoredE1RM(weight: number, reps: number) {
  const w = Number(weight);
  const r = Number(reps);
  if (!Number.isFinite(w) || !Number.isFinite(r) || w <= 0 || r <= 0) return 0;
  if (r > MAX_SCORING_REPS) return 0;
  return computeE1RM(w, r);
}

export function isBodyweightEffectiveLoadExerciseName(name: string) {
  const n = String(name || "").trim().toLowerCase();
  if (!n) return false;

  return (
    n.includes("pull up") ||
    n.includes("pull-up") ||
    n.includes("pullup") ||
    n.includes("chin up") ||
    n.includes("chin-up") ||
    n.includes("chinup") ||
    n.includes("dip")
  );
}

export function isExplicitlyAssistedBodyweightExerciseName(name: string) {
  const n = String(name || "").trim().toLowerCase();
  if (!n) return false;

  return (
    n.includes("assisted pull up") ||
    n.includes("assisted pull-up") ||
    n.includes("assisted pullup") ||
    n.includes("assisted chin up") ||
    n.includes("assisted chin-up") ||
    n.includes("assisted chinup") ||
    n.includes("assisted dip")
  );
}

export function calcEffectiveStrengthWeightLb(rawWeight: number, exerciseName: string, bodyweight: number): number {
  const w = Number(rawWeight);
  if (!Number.isFinite(w)) return 0;

  if (!isBodyweightEffectiveLoadExerciseName(exerciseName)) {
    return w > 0 ? w : 0;
  }

  const bwSafe = Number.isFinite(bodyweight) && bodyweight > 0 ? bodyweight : 0;
  const effective = bwSafe + w;
  return Number.isFinite(effective) && effective > 0 ? effective : 0;
}

export function bodyMetricTimeMs(row: any): number {
  const at = Number(row?.measuredAt ?? row?.takenAt ?? row?.date ?? row?.createdAt);
  return Number.isFinite(at) ? at : NaN;
}

export function latestBodyweightFromRows(rows: Array<any>): number | undefined {
  let bestAt = -Infinity;
  let bestWeight: number | undefined;

  for (const row of rows ?? []) {
    const weight = Number(row?.weightLb ?? row?.weight);
    const at = bodyMetricTimeMs(row);
    if (!Number.isFinite(weight) || weight <= 0) continue;
    if (!Number.isFinite(at)) continue;
    if (at >= bestAt) {
      bestAt = at;
      bestWeight = weight;
    }
  }

  return bestWeight;
}

export function bodyweightFromRowsAt(rows: Array<any>, atMs: number): number | undefined {
  const targetAt = Number(atMs);
  if (!Number.isFinite(targetAt)) return latestBodyweightFromRows(rows);

  const usable = (rows ?? [])
    .map((row) => ({
      at: bodyMetricTimeMs(row),
      weight: Number(row?.weightLb ?? row?.weight),
    }))
    .filter(
      (row): row is { at: number; weight: number } =>
        Number.isFinite(row.at) && row.at > 0 && Number.isFinite(row.weight) && row.weight > 0
    )
    .sort((a, b) => a.at - b.at);

  if (!usable.length) return undefined;

  let chosen = usable[0].weight;
  for (const row of usable) {
    if (row.at <= targetAt) chosen = row.weight;
    if (row.at > targetAt) break;
  }
  return chosen;
}

function normalizeByBodyweight(value: number, bodyweight: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const bw = Number(bodyweight);
  if (!Number.isFinite(bw) || bw <= 0) return 0;
  return value / Math.pow(bw, BW_EXPONENT);
}

function avgTopN(values: number[], n: number) {
  const clean = values.filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => b - a).slice(0, n);
  if (!clean.length) return 0;
  return clean.reduce((a, b) => a + b, 0) / clean.length;
}

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

export function buildStrengthHeroMeta(
  result: StrengthIndexResult | null | undefined,
  trendRows: StrengthTrendRow[] | null | undefined,
): StrengthHeroMeta {
  const valueRaw = Number(result?.normalizedIndex);
  const value = Number.isFinite(valueRaw) ? valueRaw : null;

  const sorted = (trendRows ?? [])
    .filter((row) => Number.isFinite(Number(row?.weekEndMs)))
    .slice()
    .sort((a, b) => Number(b.weekEndMs) - Number(a.weekEndMs));

  const latestValue = Number(sorted[0]?.normalizedIndex);
  const priorValue = Number(sorted[1]?.normalizedIndex);

  let trendLabel: StrengthHeroMeta["trendLabel"] = "Building";
  let trendDetail = "Need at least 2 weekly points";

  if (Number.isFinite(latestValue) && Number.isFinite(priorValue)) {
    const delta = latestValue - priorValue;
    trendLabel = delta >= 0.05 ? "Rising" : delta <= -0.03 ? "Falling" : "Stable";
    trendDetail = `${delta > 0 ? "+" : ""}${delta.toFixed(2)} vs prior week`;
  }

  const weeksLoaded = sorted.filter((row) =>
    Number.isFinite(Number(row?.normalizedIndex)),
  ).length;
  const bwDaysUsed = Number(result?.bodyweightDaysUsed ?? 0);

  const confidence: StrengthHeroMeta["confidence"] =
    weeksLoaded >= 8 && bwDaysUsed >= 3
      ? "High"
      : weeksLoaded >= 4
        ? "Moderate"
        : "Low";

  return {
    value,
    trendLabel,
    trendDetail,
    confidence,
  };
}

/* -------------------------------------------------------------------------- */
/* Breadcrumb 4 — Pattern classification                                      */
/* -------------------------------------------------------------------------- */

export function classifyStrengthPatternFromExerciseName(name: string): StrengthPattern | undefined {
  return classifyStrengthPatternFromSharedSource(name);
}

/* -------------------------------------------------------------------------- */
/* Breadcrumb 5 — Bodyweight (5-day rolling avg)                              */
/*   - Prefer BodyPage table: db.bodyMetrics                                  */
/*   - Accept schema variants: weightLb | weight, takenAt | date | createdAt  */
/*   - Support "as-of" computations (endAtMs) for trend snapshots             */
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
  try {
    if (typeof table.orderBy === "function") {
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
/* Breadcrumb 6 — Pattern accumulation                                        */
/* -------------------------------------------------------------------------- */

type PatternAccumulator = {
  top: number;
  working: number[];
  hardSets: number;
  completedWorkingSets: number;
};

function makeAccumulator(): Record<StrengthPattern, PatternAccumulator> {
  return {
    squat: { top: 0, working: [], hardSets: 0, completedWorkingSets: 0 },
    hinge: { top: 0, working: [], hardSets: 0, completedWorkingSets: 0 },
    push: { top: 0, working: [], hardSets: 0, completedWorkingSets: 0 },
    pull: { top: 0, working: [], hardSets: 0, completedWorkingSets: 0 },
  };
}

function isHardSet(setRow: any) {
  const rir = Number(setRow?.rir);
  if (Number.isFinite(rir)) return rir <= 3;
  // Fallback: completed working set counts as general exposure, but not hard exposure.
  return false;
}

function buildPatternScore(pattern: StrengthPattern, acc: PatternAccumulator, bodyweight: number): PatternScore {
  const topSet = acc.top;
  const working = avgTopN(acc.working, WORKING_SET_AVG_COUNT);

  // Prefer true hard sets when available; otherwise fall back to completed working set signal.
  const exposureBase =
    acc.hardSets > 0
      ? acc.hardSets / TARGET_HARD_SETS_PER_PATTERN
      : acc.completedWorkingSets / TARGET_HARD_SETS_PER_PATTERN;

  const exposure = clamp01(exposureBase);

  const absolute =
    topSet * TOP_WEIGHT +
    working * WORKING_WEIGHT +
    topSet * exposure * EXPOSURE_WEIGHT;

  const relative = bodyweight > 0 ? absolute / bodyweight : 0;
  const normalized = normalizeByBodyweight(absolute, bodyweight);

  return {
    pattern,
    topSet: Number.isFinite(topSet) ? topSet : 0,
    working: Number.isFinite(working) ? working : 0,
    exposure,
    absolute: Number.isFinite(absolute) ? absolute : 0,
    relative: Number.isFinite(relative) ? relative : 0,
    normalized: Number.isFinite(normalized) ? normalized : 0,
    hardSets: acc.hardSets,
    completedWorkingSets: acc.completedWorkingSets,
  };
}

/* -------------------------------------------------------------------------- */
/* Breadcrumb 7 — Core computation (as-of endAtMs)                            */
/* -------------------------------------------------------------------------- */

export async function computeStrengthIndexAt(endAtMs: number, windowDays = 28): Promise<StrengthIndexResult> {
  const endAt = Number(endAtMs);
  const cutoff = endAt - windowDays * 24 * 60 * 60 * 1000;

  const bw = await getBodyweightRollingAvgAt(endAt, 5);
  const bodyweight = bw.avg;

  // Sessions ended within window (cutoff..endAt)
  const sessions = await db.sessions.where("endedAt").between(cutoff, endAt, true, true).toArray();
  const sessionIds = sessions.map((s: any) => s.id).filter(Boolean);

  if (!sessionIds.length) {
    const emptyAcc = makeAccumulator();
    const patterns: PatternScore[] = (Object.keys(emptyAcc) as StrengthPattern[]).map((p) =>
      buildPatternScore(p, emptyAcc[p], bodyweight)
    );

    return {
      absoluteIndex: 0,
      relativeIndex: 0,
      normalizedIndex: 0,
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
    const emptyAcc = makeAccumulator();
    const patterns: PatternScore[] = (Object.keys(emptyAcc) as StrengthPattern[]).map((p) =>
      buildPatternScore(p, emptyAcc[p], bodyweight)
    );

    return {
      absoluteIndex: 0,
      relativeIndex: 0,
      normalizedIndex: 0,
      patterns,
      bodyweight,
      bodyweightDaysUsed: bw.daysUsed,
    };
  }

  /* ------------------------------------------------------------------------ */
  /* Breadcrumb 7A — Batch load tracks / exercises                            */
  /* ------------------------------------------------------------------------ */
  const trackIds = Array.from(new Set(working.map((s) => s.trackId).filter(Boolean)));
  const tracksArr: any[] = await db.tracks.bulkGet(trackIds);

  const trackById = new Map<string, any>();
  for (const t of tracksArr) if (t?.id) trackById.set(t.id, t);

  const exerciseIds = Array.from(new Set(tracksArr.map((t) => t?.exerciseId).filter(Boolean))) as string[];
  const exercisesArr: any[] = await db.exercises.bulkGet(exerciseIds);

  const exerciseById = new Map<string, any>();
  for (const ex of exercisesArr) if (ex?.id) exerciseById.set(ex.id, ex);

  function patternFast(track: any): StrengthPattern | undefined {
    const exerciseId = String(track?.exerciseId ?? "");
    if (!exerciseId) return undefined;
    const ex = exerciseById.get(exerciseId);
    return classifyStrengthPattern({
      exerciseId,
      exercise: ex ?? null,
      exerciseName: ex?.name ?? ex?.displayName ?? ex?.title ?? "",
      trackDisplayName: String(track?.displayName ?? ""),
    });
  }

  /* ------------------------------------------------------------------------ */
  /* Breadcrumb 7B — Accumulate per-pattern strength signal                    */
  /* ------------------------------------------------------------------------ */
  const acc = makeAccumulator();

  for (const s of working) {
    const track = trackById.get(s.trackId);
    if (!track) continue;
    if (!isStrengthTrackType(track.trackType)) continue;
  
    const exId = String(track.exerciseId ?? "");
    if (!exId) continue;
  
    const ex = exerciseById.get(exId);
    const exerciseName = String(ex?.name ?? ex?.displayName ?? ex?.title ?? "").trim();
  
    const pattern = patternFast(track);
    if (!pattern) continue;
  
    const effectiveWeight = calcEffectiveStrengthWeightLb(s.weight, exerciseName, bodyweight);
    const scored = computeScoredE1RM(effectiveWeight, s.reps);
    if (scored <= 0) continue;
  
    const bucket = acc[pattern];
    bucket.completedWorkingSets += 1;
  
    if (scored > bucket.top) bucket.top = scored;
    bucket.working.push(scored);
  
    if (isHardSet(s)) bucket.hardSets += 1;
}

  /* ------------------------------------------------------------------------ */
  /* Breadcrumb 7C — Build pattern outputs                                     */
  /* ------------------------------------------------------------------------ */
  const patterns: PatternScore[] = (Object.keys(acc) as StrengthPattern[]).map((p) =>
    buildPatternScore(p, acc[p], bodyweight)
  );

  const absoluteIndex = patterns.reduce((sum, p) => sum + p.absolute, 0) / patterns.length;
  const relativeIndex = patterns.reduce((sum, p) => sum + p.relative, 0) / patterns.length;
  const normalizedIndex = patterns.reduce((sum, p) => sum + p.normalized, 0) / patterns.length;

  return {
    absoluteIndex: Number.isFinite(absoluteIndex) ? absoluteIndex : 0,
    relativeIndex: Number.isFinite(relativeIndex) ? relativeIndex : 0,
    normalizedIndex: Number.isFinite(normalizedIndex) ? normalizedIndex : 0,
    patterns,
    bodyweight,
    bodyweightDaysUsed: bw.daysUsed,
  };
}

/* -------------------------------------------------------------------------- */
/* Breadcrumb 8 — Default: "now" computation (existing API)                   */
/* -------------------------------------------------------------------------- */

export async function computeStrengthIndex(windowDays = 28): Promise<StrengthIndexResult> {
  return computeStrengthIndexAt(Date.now(), windowDays);
}

/* -------------------------------------------------------------------------- */
/* Breadcrumb 9 — Trend (last N weeks), most recent first                     */
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
  const end0 = startOfDay(Date.now()) + 23 * 60 * 60 * 1000 + 59 * 60 * 1000 + 59 * 1000;

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
      normalizedIndex: r.normalizedIndex,
    });
  }

  rows.sort((a, b) => b.weekEndMs - a.weekEndMs);
  return rows;
}

export async function computeStrengthSnapshot(
  weeks = 12,
  windowDays = 28,
): Promise<StrengthSnapshot> {
  const [result, trend] = await Promise.all([
    computeStrengthIndex(windowDays),
    computeStrengthTrend(weeks, windowDays),
  ]);

  return {
    result,
    trend,
    heroMeta: buildStrengthHeroMeta(result, trend),
  };
}

/* ========================================================================== */
/*  End of file: src/strength/strength.ts                                     */
/* ========================================================================== */
