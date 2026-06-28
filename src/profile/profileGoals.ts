import { db } from "../db";

export type ProfileGoalsV1 = {
  targetWeightLb?: number;
  targetBodyFatPct?: number;
  targetWaistIn?: number;
  targetVisceralFatEstimate?: number;
};

export const PROFILE_GOALS_META_KEY = "profile.goals.v1";
export const LEGACY_PROFILE_STORAGE_KEY = "workout_pwa_profile_v1";

function finitePositive(value: unknown): number | undefined {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : undefined;
}

function compactGoals(goals: ProfileGoalsV1): ProfileGoalsV1 {
  return {
    ...(goals.targetWeightLb != null ? { targetWeightLb: goals.targetWeightLb } : {}),
    ...(goals.targetBodyFatPct != null ? { targetBodyFatPct: goals.targetBodyFatPct } : {}),
    ...(goals.targetWaistIn != null ? { targetWaistIn: goals.targetWaistIn } : {}),
    ...(goals.targetVisceralFatEstimate != null
      ? { targetVisceralFatEstimate: goals.targetVisceralFatEstimate }
      : {}),
  };
}

export function normalizeProfileGoals(raw: unknown): ProfileGoalsV1 {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return compactGoals({
    targetWeightLb: finitePositive(value.targetWeightLb),
    targetBodyFatPct: finitePositive(value.targetBodyFatPct),
    targetWaistIn: finitePositive(value.targetWaistIn),
    targetVisceralFatEstimate: finitePositive(value.targetVisceralFatEstimate),
  });
}

function hasGoals(goals: ProfileGoalsV1): boolean {
  return Object.keys(goals).length > 0;
}

export function readLegacyProfileGoalsFromLocalStorage(
  storage: Storage | undefined = typeof localStorage !== "undefined" ? localStorage : undefined
): ProfileGoalsV1 {
  if (!storage) return {};

  try {
    const raw = storage.getItem(LEGACY_PROFILE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    return compactGoals({
      targetWeightLb: finitePositive(parsed.targetWeightLb),
      targetBodyFatPct: finitePositive(parsed.targetBodyFatPct),
    });
  } catch {
    return {};
  }
}

export async function getProfileGoals(): Promise<ProfileGoalsV1> {
  try {
    const row = await db.app_meta.get(PROFILE_GOALS_META_KEY);
    const parsed = row?.valueJson ? JSON.parse(row.valueJson) : undefined;
    const stored = normalizeProfileGoals(parsed);
    if (hasGoals(stored)) return stored;
  } catch {
    // Fall through to legacy localStorage targets.
  }

  return readLegacyProfileGoalsFromLocalStorage();
}

export async function setProfileGoals(goalsRaw: ProfileGoalsV1): Promise<ProfileGoalsV1> {
  const goals = normalizeProfileGoals(goalsRaw);
  const now = Date.now();

  await db.app_meta.put({
    key: PROFILE_GOALS_META_KEY,
    valueJson: JSON.stringify({ ...goals, updatedAt: now }),
    updatedAt: now,
  });

  return goals;
}
