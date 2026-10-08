import { db } from "../../db";
import type { AppMeta } from "../../db";
import type { PersistedCoachComparisonSnapshot } from "./coachExplainability";

export const COACH_COMPARISON_META_KEY = "coach.comparisonSnapshot.v1";

export type CoachComparisonMetaStore = {
  get(key: string): Promise<AppMeta | undefined>;
  put(value: AppMeta): Promise<unknown>;
};

const FRESHNESS_VALUES = new Set(["fresh", "aging", "stale", "unknown"]);

function optionalFinite(value: unknown): value is number | undefined {
  return value === undefined || (typeof value === "number" && Number.isFinite(value));
}

export function parsePersistedCoachComparisonSnapshot(raw: unknown): PersistedCoachComparisonSnapshot | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw as Record<string, any>;
  if (value.schemaVersion !== 1 || typeof value.savedAt !== "string" || !Number.isFinite(Date.parse(value.savedAt))) {
    return undefined;
  }
  if (value.snapshotStatus !== undefined && typeof value.snapshotStatus !== "string") return undefined;
  if (value.strength !== undefined && (!value.strength || typeof value.strength !== "object")) return undefined;
  if (!optionalFinite(value.strength?.signal)) return undefined;
  if (value.strength?.benchmarkFreshness !== undefined && !FRESHNESS_VALUES.has(value.strength.benchmarkFreshness)) return undefined;
  if (value.body !== undefined && (!value.body || typeof value.body !== "object")) return undefined;
  if (!optionalFinite(value.body?.weightTrend14d) || !optionalFinite(value.body?.waistIn)) return undefined;
  if (value.cardio !== undefined && (!value.cardio || typeof value.cardio !== "object")) return undefined;
  if (!optionalFinite(value.cardio?.activities7d)) return undefined;

  return {
    schemaVersion: 1,
    savedAt: value.savedAt,
    ...(value.snapshotStatus !== undefined ? { snapshotStatus: value.snapshotStatus } : {}),
    ...(value.strength !== undefined
      ? { strength: {
          ...(value.strength.signal !== undefined ? { signal: value.strength.signal } : {}),
          ...(value.strength.benchmarkFreshness !== undefined
            ? { benchmarkFreshness: value.strength.benchmarkFreshness }
            : {}),
        } }
      : {}),
    ...(value.body !== undefined
      ? { body: {
          ...(value.body.weightTrend14d !== undefined ? { weightTrend14d: value.body.weightTrend14d } : {}),
          ...(value.body.waistIn !== undefined ? { waistIn: value.body.waistIn } : {}),
        } }
      : {}),
    ...(value.cardio !== undefined
      ? { cardio: {
          ...(value.cardio.activities7d !== undefined ? { activities7d: value.cardio.activities7d } : {}),
        } }
      : {}),
  };
}

export async function loadPersistedCoachComparisonSnapshot(
  store: CoachComparisonMetaStore = db.app_meta,
): Promise<PersistedCoachComparisonSnapshot | undefined> {
  try {
    const row = await store.get(COACH_COMPARISON_META_KEY);
    if (!row?.valueJson) return undefined;
    return parsePersistedCoachComparisonSnapshot(JSON.parse(row.valueJson));
  } catch {
    return undefined;
  }
}

export async function savePersistedCoachComparisonSnapshot(
  snapshot: PersistedCoachComparisonSnapshot,
  store: CoachComparisonMetaStore = db.app_meta,
): Promise<boolean> {
  try {
    const validated = parsePersistedCoachComparisonSnapshot(snapshot);
    if (!validated) return false;
    const updatedAt = Date.now();
    await store.put({
      key: COACH_COMPARISON_META_KEY,
      valueJson: JSON.stringify(validated),
      updatedAt,
    });
    return true;
  } catch {
    return false;
  }
}
