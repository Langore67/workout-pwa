import { db } from "../../db";

export const STRENGTH_GOALS_META_KEY = "strength.goals.v1";
export const MAX_STRENGTH_GOALS = 25;

export type StrengthGoalTargetMetric = "load" | "reps";

export type StrengthGoal = {
  id: string;
  type: "strength";
  exerciseId: string;
  targetMetric: StrengthGoalTargetMetric;
  targetValue: number;
  targetUnit?: "lb" | "reps";
  label?: string;
  active: boolean;
  createdAt: number;
  updatedAt: number;
};

function finitePositive(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function normalizeStrengthGoals(raw: unknown): StrengthGoal[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const goals: StrengthGoal[] = [];
  for (const value of raw) {
    if (!value || typeof value !== "object") continue;
    const row = value as Record<string, unknown>;
    const id = String(row.id ?? "").trim();
    const exerciseId = String(row.exerciseId ?? "").trim();
    const targetMetric = row.targetMetric === "load" || row.targetMetric === "reps" ? row.targetMetric : undefined;
    const targetValue = finitePositive(row.targetValue);
    if (!id || seen.has(id) || !exerciseId || !targetMetric || targetValue == null) continue;
    seen.add(id);
    const createdAt = finitePositive(row.createdAt) ?? Date.now();
    const updatedAt = finitePositive(row.updatedAt) ?? createdAt;
    const targetUnit = targetMetric === "load" ? "lb" : "reps";
    const label = String(row.label ?? "").trim();
    goals.push({
      id,
      type: "strength",
      exerciseId,
      targetMetric,
      targetValue,
      targetUnit,
      ...(label ? { label } : {}),
      active: row.active !== false,
      createdAt,
      updatedAt,
    });
    if (goals.length >= MAX_STRENGTH_GOALS) break;
  }
  return goals;
}

export async function getStrengthGoals(): Promise<StrengthGoal[]> {
  try {
    const row = await db.app_meta.get(STRENGTH_GOALS_META_KEY);
    return normalizeStrengthGoals(row?.valueJson ? JSON.parse(row.valueJson) : []);
  } catch {
    return [];
  }
}

export async function setStrengthGoals(goals: readonly StrengthGoal[]): Promise<StrengthGoal[]> {
  const normalized = normalizeStrengthGoals(goals);
  const now = Date.now();
  await db.app_meta.put({
    key: STRENGTH_GOALS_META_KEY,
    valueJson: JSON.stringify(normalized),
    updatedAt: now,
  });
  return normalized;
}
