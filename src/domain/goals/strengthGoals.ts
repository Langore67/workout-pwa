import { db, type Exercise } from "../../db";

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

export type StrengthGoalDraft = {
  exerciseId: string;
  targetMetric: StrengthGoalTargetMetric | string;
  targetValue: number | string;
  label?: string;
};

export type StrengthGoalValidationCode =
  | "exercise_required"
  | "exercise_not_found"
  | "exercise_not_canonical"
  | "exercise_metric_incompatible"
  | "metric_invalid"
  | "target_required"
  | "load_invalid"
  | "reps_invalid"
  | "duplicate_active"
  | "goal_limit";

export type StrengthGoalValidationError = {
  code: StrengthGoalValidationCode;
  message: string;
  field?: "exerciseId" | "targetMetric" | "targetValue";
};

export type StrengthGoalValidationResult =
  | { ok: true; value: Omit<StrengthGoal, "id" | "type" | "active" | "createdAt" | "updatedAt"> }
  | { ok: false; error: StrengthGoalValidationError };

export type StrengthGoalMutationResult =
  | { ok: true; goals: StrengthGoal[]; goal: StrengthGoal }
  | { ok: false; error: StrengthGoalValidationError };

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

function error(
  code: StrengthGoalValidationCode,
  message: string,
  field?: StrengthGoalValidationError["field"]
): StrengthGoalValidationResult {
  return { ok: false, error: { code, message, ...(field ? { field } : {}) } };
}

function duplicateMessage(metric: StrengthGoalTargetMetric) {
  return metric === "load"
    ? "An active performed-load goal already exists for this exercise."
    : "An active reps goal already exists for this exercise.";
}

export function validateStrengthGoalDraft(args: {
  draft: StrengthGoalDraft;
  goals: readonly StrengthGoal[];
  exercises: readonly Exercise[];
  editingGoalId?: string;
  active?: boolean;
}): StrengthGoalValidationResult {
  const exerciseId = String(args.draft.exerciseId ?? "").trim();
  if (!exerciseId) return error("exercise_required", "Choose an exercise.", "exerciseId");

  const exercise = args.exercises.find((row) => row.id === exerciseId);
  if (!exercise) {
    return error("exercise_not_found", "Choose an exercise from the active exercise catalog.", "exerciseId");
  }
  if (exercise.archivedAt || exercise.mergedIntoExerciseId) {
    return error(
      "exercise_not_canonical",
      "This exercise is archived or merged. Choose an active exercise.",
      "exerciseId"
    );
  }
  if (exercise.metricMode === "time" || exercise.metricMode === "distance") {
    return error(
      "exercise_metric_incompatible",
      "Choose an exercise that supports performed load or reps.",
      "exerciseId"
    );
  }

  const targetMetric = args.draft.targetMetric;
  if (targetMetric !== "load" && targetMetric !== "reps") {
    return error("metric_invalid", "Choose performed load or reps.", "targetMetric");
  }

  const rawTarget = args.draft.targetValue;
  if (rawTarget === "" || rawTarget == null) {
    return error("target_required", "Enter a target value.", "targetValue");
  }
  const targetValue = Number(rawTarget);
  if (targetMetric === "reps" && (!Number.isFinite(targetValue) || targetValue <= 0 || !Number.isInteger(targetValue))) {
    return error("reps_invalid", "Reps must be a positive whole number.", "targetValue");
  }
  if (targetMetric === "load" && (!Number.isFinite(targetValue) || targetValue <= 0)) {
    return error("load_invalid", "Enter a load greater than 0.", "targetValue");
  }

  if (args.active !== false) {
    const duplicate = args.goals.some(
      (goal) =>
        goal.id !== args.editingGoalId &&
        goal.active &&
        goal.exerciseId === exerciseId &&
        goal.targetMetric === targetMetric
    );
    if (duplicate) return error("duplicate_active", duplicateMessage(targetMetric), "targetMetric");
  }

  const label = String(args.draft.label ?? "").trim();
  return {
    ok: true,
    value: {
      exerciseId,
      targetMetric,
      targetValue,
      targetUnit: targetMetric === "load" ? "lb" : "reps",
      ...(label ? { label } : {}),
    },
  };
}

export function addStrengthGoal(args: {
  goals: readonly StrengthGoal[];
  exercises: readonly Exercise[];
  draft: StrengthGoalDraft;
  id: string;
  now?: number;
}): StrengthGoalMutationResult {
  if (args.goals.length >= MAX_STRENGTH_GOALS) {
    return {
      ok: false,
      error: { code: "goal_limit", message: `The strength-goal limit of ${MAX_STRENGTH_GOALS} has been reached.` },
    };
  }
  const validated = validateStrengthGoalDraft({ draft: args.draft, goals: args.goals, exercises: args.exercises });
  if (!validated.ok) return validated;
  const now = args.now ?? Date.now();
  const goal: StrengthGoal = {
    id: args.id,
    type: "strength",
    ...validated.value,
    active: true,
    createdAt: now,
    updatedAt: now,
  };
  return { ok: true, goals: [...args.goals, goal], goal };
}

export function updateStrengthGoal(args: {
  goals: readonly StrengthGoal[];
  exercises: readonly Exercise[];
  goalId: string;
  draft: StrengthGoalDraft;
  now?: number;
}): StrengthGoalMutationResult {
  const existing = args.goals.find((goal) => goal.id === args.goalId);
  if (!existing) {
    return { ok: false, error: { code: "exercise_not_found", message: "Strength goal was not found." } };
  }
  const validated = validateStrengthGoalDraft({
    draft: args.draft,
    goals: args.goals,
    exercises: args.exercises,
    editingGoalId: existing.id,
    active: existing.active,
  });
  if (!validated.ok) return validated;
  const goal: StrengthGoal = {
    ...existing,
    ...validated.value,
    createdAt: existing.createdAt,
    updatedAt: args.now ?? Date.now(),
  };
  return { ok: true, goals: args.goals.map((row) => (row.id === goal.id ? goal : row)), goal };
}

function setStrengthGoalActive(args: {
  goals: readonly StrengthGoal[];
  exercises: readonly Exercise[];
  goalId: string;
  active: boolean;
  now?: number;
}): StrengthGoalMutationResult {
  const existing = args.goals.find((goal) => goal.id === args.goalId);
  if (!existing) {
    return { ok: false, error: { code: "exercise_not_found", message: "Strength goal was not found." } };
  }
  if (args.active) {
    const validated = validateStrengthGoalDraft({
      draft: existing,
      goals: args.goals,
      exercises: args.exercises,
      editingGoalId: existing.id,
      active: true,
    });
    if (!validated.ok) return validated;
  }
  const goal = { ...existing, active: args.active, updatedAt: args.now ?? Date.now() };
  return { ok: true, goals: args.goals.map((row) => (row.id === goal.id ? goal : row)), goal };
}

export function deactivateStrengthGoal(args: {
  goals: readonly StrengthGoal[];
  exercises: readonly Exercise[];
  goalId: string;
  now?: number;
}) {
  return setStrengthGoalActive({ ...args, active: false });
}

export function reactivateStrengthGoal(args: {
  goals: readonly StrengthGoal[];
  exercises: readonly Exercise[];
  goalId: string;
  now?: number;
}) {
  return setStrengthGoalActive({ ...args, active: true });
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
