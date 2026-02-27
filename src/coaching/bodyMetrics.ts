// src/coaching/bodyMetrics.ts
/* ==========================================================================
   bodyMetrics.ts
   BUILD_ID: 2026-02-24-BM-01
   --------------------------------------------------------------------------
   Sparse body metrics (Hume Body Pod) helpers for coaching engine.
   - Never throws on missing metrics
   - Works with partial snapshots (any field optional)
   - Provides rolling averages + deltas for 7d and 28d windows
   - Designed for Cut Mode coaching, but mode-agnostic
   ========================================================================== */

import { db } from "../db";

export type BodyMetricKey =
  | "weightLb"
  | "bodyFatPct"
  | "skeletalMuscleMassLb"
  | "visceralFatIndex"
  | "bodyWaterPct";

export type BodyMetricEntry = {
  id: string;
  measuredAt: number;

  weightLb?: number;
  bodyFatPct?: number;
  skeletalMuscleMassLb?: number;
  visceralFatIndex?: number;
  bodyWaterPct?: number;

  notes?: string;
  createdAt: number;
};

export type MetricPoint = { ms: number; value: number };

export type MetricStat = {
  key: BodyMetricKey;

  // Latest observed value (from most recent row that contains that metric)
  latest?: number;
  latestAt?: number;

  // Rolling averages (based on points in the window)
  avg7d?: number;
  avg28d?: number;

  // Delta = avg(window) - avg(previous window of same length)
  // (e.g., last 7 days avg minus previous 7 days avg)
  delta7d?: number;
  delta28d?: number;

  // Counts used to compute
  n7d: number;
  n28d: number;

  // Data-sufficiency flags (per metric, per window)
  sufficient7d: boolean;
  sufficient28d: boolean;
};

export type BodyMetricsSummary = {
  // Raw rows (most recent first), within max lookback
  rows: BodyMetricEntry[];

  // Latest row (regardless of which metrics it contains)
  latestRow?: BodyMetricEntry;

  // Per-metric stats
  metrics: Record<BodyMetricKey, MetricStat>;

  // Convenience: whether we have ANY measurements at all
  hasAny: boolean;

  // For UI: time bounds used
  lookbackDays: number;
  nowMs: number;
};

export type BodyMetricsSummaryOptions = {
  // How far back to load rows (default 56 days: supports 28d + previous 28d)
  lookbackDays?: number;

  // Sufficient data thresholds
  minPoints7d?: number; // default 3
  minPoints28d?: number; // default 6

  // For testing
  nowMs?: number;
};

const KEYS: BodyMetricKey[] = [
  "weightLb",
  "bodyFatPct",
  "skeletalMuscleMassLb",
  "visceralFatIndex",
  "bodyWaterPct",
];

function isFiniteNumber(v: any): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function clampToDayStart(ms: number): number {
  // for stable window boundaries in charts/summaries
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function avg(values: number[]): number | undefined {
  if (!values.length) return undefined;
  const s = values.reduce((a, b) => a + b, 0);
  return s / values.length;
}

function roundMaybe(v: number | undefined, digits = 1): number | undefined {
  if (!isFiniteNumber(v)) return undefined;
  const p = Math.pow(10, digits);
  return Math.round(v * p) / p;
}

function collectPoints(rows: BodyMetricEntry[], key: BodyMetricKey): MetricPoint[] {
  const pts: MetricPoint[] = [];
  for (const r of rows) {
    const v = (r as any)[key];
    if (isFiniteNumber(v) && isFiniteNumber(r.measuredAt)) {
      pts.push({ ms: r.measuredAt, value: v });
    }
  }
  // sort ascending by time for stable window slicing
  pts.sort((a, b) => a.ms - b.ms);
  return pts;
}

function windowPoints(points: MetricPoint[], startMs: number, endMs: number): MetricPoint[] {
  // inclusive start, exclusive end
  return points.filter((p) => p.ms >= startMs && p.ms < endMs);
}

function computeWindowAvg(points: MetricPoint[], startMs: number, endMs: number): { n: number; avg?: number } {
  const w = windowPoints(points, startMs, endMs);
  const values = w.map((p) => p.value);
  return { n: values.length, avg: avg(values) };
}

function mostRecentValue(rowsDesc: BodyMetricEntry[], key: BodyMetricKey): { latest?: number; latestAt?: number } {
  for (const r of rowsDesc) {
    const v = (r as any)[key];
    if (isFiniteNumber(v)) return { latest: v, latestAt: r.measuredAt };
  }
  return {};
}

/**
 * Load bodyMetrics rows (sparse snapshots) and compute safe rolling stats.
 * This NEVER throws due to missing metrics; missing values are ignored.
 */
export async function getBodyMetricsSummary(opts?: BodyMetricsSummaryOptions): Promise<BodyMetricsSummary> {
  const lookbackDays = Math.max(14, Math.floor(opts?.lookbackDays ?? 56));
  const minPoints7d = Math.max(1, Math.floor(opts?.minPoints7d ?? 3));
  const minPoints28d = Math.max(1, Math.floor(opts?.minPoints28d ?? 6));
  const nowMs = isFiniteNumber(opts?.nowMs) ? (opts!.nowMs as number) : Date.now();

  const endMs = nowMs;
  const startMs = endMs - lookbackDays * 24 * 60 * 60 * 1000;

  // Pull recent rows (most recent first). Use measuredAt when possible.
  // Note: measuredAt is indexed (v9 store), so orderBy("measuredAt") is fast.
  const rows = (await db.bodyMetrics
    .where("measuredAt")
    .between(startMs, endMs, true, false)
    .toArray()) as any[];

  // normalize + sort DESC (most recent first)
  const rowsDesc: BodyMetricEntry[] = (rows ?? [])
    .map((r) => ({
      id: String(r.id),
      measuredAt: isFiniteNumber(r.measuredAt) ? r.measuredAt : r.createdAt ?? 0,
      weightLb: isFiniteNumber(r.weightLb) ? r.weightLb : undefined,
      bodyFatPct: isFiniteNumber(r.bodyFatPct) ? r.bodyFatPct : undefined,
      skeletalMuscleMassLb: isFiniteNumber(r.skeletalMuscleMassLb) ? r.skeletalMuscleMassLb : undefined,
      visceralFatIndex: isFiniteNumber(r.visceralFatIndex) ? r.visceralFatIndex : undefined,
      bodyWaterPct: isFiniteNumber(r.bodyWaterPct) ? r.bodyWaterPct : undefined,
      notes: typeof r.notes === "string" ? r.notes : undefined,
      createdAt: isFiniteNumber(r.createdAt) ? r.createdAt : (isFiniteNumber(r.measuredAt) ? r.measuredAt : 0),
    }))
    .sort((a, b) => (b.measuredAt ?? 0) - (a.measuredAt ?? 0));

  const latestRow = rowsDesc[0];

  // Define window boundaries using day-start for stability
  const today0 = clampToDayStart(nowMs);
  const w7Start = today0 - 7 * 24 * 60 * 60 * 1000;
  const w7PrevStart = today0 - 14 * 24 * 60 * 60 * 1000;

  const w28Start = today0 - 28 * 24 * 60 * 60 * 1000;
  const w28PrevStart = today0 - 56 * 24 * 60 * 60 * 1000;

  const metrics: Record<BodyMetricKey, MetricStat> = {} as any;

  for (const key of KEYS) {
    const pts = collectPoints(rowsDesc, key);
    const { latest, latestAt } = mostRecentValue(rowsDesc, key);

    const cur7 = computeWindowAvg(pts, w7Start, today0 + 24 * 60 * 60 * 1000);
    const prev7 = computeWindowAvg(pts, w7PrevStart, w7Start);

    const cur28 = computeWindowAvg(pts, w28Start, today0 + 24 * 60 * 60 * 1000);
    const prev28 = computeWindowAvg(pts, w28PrevStart, w28Start);

    const avg7d = cur7.avg;
    const avg28d = cur28.avg;

    const delta7d =
      isFiniteNumber(cur7.avg) && isFiniteNumber(prev7.avg) ? (cur7.avg as number) - (prev7.avg as number) : undefined;

    const delta28d =
      isFiniteNumber(cur28.avg) && isFiniteNumber(prev28.avg)
        ? (cur28.avg as number) - (prev28.avg as number)
        : undefined;

    metrics[key] = {
      key,
      latest: roundMaybe(latest, 1),
      latestAt,

      avg7d: roundMaybe(avg7d, 2),
      avg28d: roundMaybe(avg28d, 2),

      delta7d: roundMaybe(delta7d, 2),
      delta28d: roundMaybe(delta28d, 2),

      n7d: cur7.n,
      n28d: cur28.n,

      sufficient7d: cur7.n >= minPoints7d,
      sufficient28d: cur28.n >= minPoints28d,
    };
  }

  return {
    rows: rowsDesc,
    latestRow,
    metrics,
    hasAny: rowsDesc.length > 0,
    lookbackDays,
    nowMs,
  };
}

/**
 * Formatting helpers for UI (optional use).
 * Keep them here so UI code stays simple and consistent.
 */

export function formatDelta(v: number | undefined, digits = 1): string {
  if (!isFiniteNumber(v)) return "—";
  const p = Math.pow(10, digits);
  const x = Math.round(v * p) / p;
  if (x === 0) return "0";
  return x > 0 ? `+${x}` : `${x}`;
}

export function formatMaybe(v: number | undefined, digits = 1): string {
  if (!isFiniteNumber(v)) return "—";
  const p = Math.pow(10, digits);
  return String(Math.round(v * p) / p);
}

/**
 * Coach-grade interpretation helper (non-blocking).
 * Returns a short hint string based on trends, ignoring missing metrics safely.
 *
 * NOTE: This is intentionally conservative; do not over-diagnose.
 */
export function getCutModeHint(summary: BodyMetricsSummary): string {
  const m = summary.metrics;

  const w = m.weightLb;
  const bf = m.bodyFatPct;
  const smm = m.skeletalMuscleMassLb;
  const water = m.bodyWaterPct;

  // If we can't even compute weight trend, bail out.
  if (!w?.sufficient7d || !isFiniteNumber(w.delta7d)) return "Add a few weigh-ins to see your cut trend.";

  const wtDown = (w.delta7d as number) < 0;
  const wtUp = (w.delta7d as number) > 0;

  // Muscle + water heuristic (very conservative)
  const smmDown = smm?.sufficient28d && isFiniteNumber(smm.delta28d) ? (smm.delta28d as number) < 0 : false;
  const waterDown = water?.sufficient7d && isFiniteNumber(water.delta7d) ? (water.delta7d as number) < 0 : false;

  if (wtDown && smmDown && !waterDown) {
    return "Weight is trending down. Muscle looks slightly down too (not explained by water). Consider a less aggressive deficit or reduce fatigue.";
  }

  if (wtDown) {
    // Optional BF confirmation if present
    if (bf?.sufficient28d && isFiniteNumber(bf.delta28d) && (bf.delta28d as number) < 0) {
      return "Cut is on track: weight and body fat are trending down. Prioritize strength maintenance.";
    }
    return "Cut is on track: weight is trending down. Prioritize strength maintenance.";
  }

  if (wtUp) return "Weight is trending up. If you’re trying to cut, tighten intake or increase daily activity slightly.";

  return "Weight trend is flat. If you’re cutting, you may need a small calorie or activity adjustment.";
}