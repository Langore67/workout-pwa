import { db } from "../../db";

export const AEROBIC_BASE_GOAL_META_KEY = "cardio.aerobicBaseGoal.v1";
export const MAX_AEROBIC_BASE_WEEKLY_TARGET_MINUTES = 1000;

export type AerobicBaseGoal = {
  weeklyTargetMinutes: number;
  updatedAt: number;
};

export type AerobicBaseGoalValidation =
  | { valid: true; value: number }
  | { valid: false; error: string };

export function validateAerobicBaseWeeklyTarget(value: unknown): AerobicBaseGoalValidation {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
    return { valid: false, error: "Weekly target must be a whole number of minutes." };
  }
  if (value <= 0) return { valid: false, error: "Weekly target must be greater than 0 minutes." };
  if (value > MAX_AEROBIC_BASE_WEEKLY_TARGET_MINUTES) {
    return { valid: false, error: `Weekly target cannot exceed ${MAX_AEROBIC_BASE_WEEKLY_TARGET_MINUTES} minutes.` };
  }
  return { valid: true, value };
}

export function parseAerobicBaseGoal(value: unknown): AerobicBaseGoal | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<AerobicBaseGoal>;
  const target = validateAerobicBaseWeeklyTarget(candidate.weeklyTargetMinutes);
  if (!target.valid || typeof candidate.updatedAt !== "number" || !Number.isFinite(candidate.updatedAt)) return undefined;
  return { weeklyTargetMinutes: target.value, updatedAt: candidate.updatedAt };
}

export async function getAerobicBaseGoal(): Promise<AerobicBaseGoal | undefined> {
  const row = await db.app_meta.get(AEROBIC_BASE_GOAL_META_KEY);
  if (!row?.valueJson) return undefined;
  try {
    return parseAerobicBaseGoal(JSON.parse(row.valueJson));
  } catch {
    return undefined;
  }
}

export async function setAerobicBaseGoal(weeklyTargetMinutes: number): Promise<AerobicBaseGoal> {
  const validation = validateAerobicBaseWeeklyTarget(weeklyTargetMinutes);
  if (!validation.valid) throw new Error(validation.error);
  const goal: AerobicBaseGoal = { weeklyTargetMinutes: validation.value, updatedAt: Date.now() };
  await db.app_meta.put({
    key: AEROBIC_BASE_GOAL_META_KEY,
    valueJson: JSON.stringify(goal),
    updatedAt: goal.updatedAt,
  });
  return goal;
}

export async function clearAerobicBaseGoal(): Promise<void> {
  await db.app_meta.delete(AEROBIC_BASE_GOAL_META_KEY);
}
