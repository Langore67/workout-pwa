import React, { useEffect, useMemo, useState } from "react";
import type { Exercise } from "../../db";
import {
  MAX_STRENGTH_GOALS,
  addStrengthGoal,
  deactivateStrengthGoal,
  reactivateStrengthGoal,
  updateStrengthGoal,
  type StrengthGoal,
  type StrengthGoalDraft,
  type StrengthGoalMutationResult,
  type StrengthGoalTargetMetric,
} from "../../domain/goals/strengthGoals";

type Props = {
  isEditing: boolean;
  loading: boolean;
  goals: readonly StrengthGoal[];
  exercises: readonly Exercise[];
  persistGoals: (goals: readonly StrengthGoal[]) => Promise<void>;
};

type DraftState = {
  goalId?: string;
  exerciseId: string;
  targetMetric: StrengthGoalTargetMetric;
  targetValue: string;
  label: string;
};

const EMPTY_DRAFT: DraftState = {
  exerciseId: "",
  targetMetric: "load",
  targetValue: "",
  label: "",
};

function metricLabel(metric: StrengthGoalTargetMetric) {
  return metric === "load" ? "Performed load" : "Reps";
}

function goalSummary(goal: StrengthGoal) {
  return goal.targetMetric === "load"
    ? `${goal.targetValue} lb performed load`
    : `${goal.targetValue} reps`;
}

export function StrengthGoalsCard({ isEditing, loading, goals, exercises, persistGoals }: Props) {
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isEditing) {
      setDraft(null);
      setError("");
    }
  }, [isEditing]);

  const exerciseById = useMemo(
    () => new Map(exercises.map((exercise) => [exercise.id, exercise])),
    [exercises]
  );
  const exerciseOptions = useMemo(
    () =>
      exercises
        .filter(
          (exercise) =>
            !exercise.archivedAt &&
            !exercise.mergedIntoExerciseId &&
            exercise.metricMode !== "time" &&
            exercise.metricMode !== "distance"
        )
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
    [exercises]
  );
  const sortedGoals = useMemo(
    () =>
      goals
        .slice()
        .sort((a, b) => {
          if (a.active !== b.active) return a.active ? -1 : 1;
          const aName = exerciseById.get(a.exerciseId)?.name ?? a.exerciseId;
          const bName = exerciseById.get(b.exerciseId)?.name ?? b.exerciseId;
          return aName.localeCompare(bName) || a.targetMetric.localeCompare(b.targetMetric) || a.id.localeCompare(b.id);
        }),
    [exerciseById, goals]
  );

  function startEdit(goal: StrengthGoal) {
    setDraft({
      goalId: goal.id,
      exerciseId: goal.exerciseId,
      targetMetric: goal.targetMetric,
      targetValue: String(goal.targetValue),
      label: goal.label ?? "",
    });
    setError("");
  }

  async function applyMutation(result: StrengthGoalMutationResult) {
    if (!result.ok) {
      setError(result.error.message);
      return false;
    }
    setSaving(true);
    setError("");
    try {
      await persistGoals(result.goals);
      return true;
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : "Could not save strength goals. Try again.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveDraft() {
    if (!draft || saving) return;
    const value: StrengthGoalDraft = {
      exerciseId: draft.exerciseId,
      targetMetric: draft.targetMetric,
      targetValue: draft.targetValue,
      label: draft.label,
    };
    const result = draft.goalId
      ? updateStrengthGoal({ goals, exercises, goalId: draft.goalId, draft: value })
      : addStrengthGoal({ goals, exercises, draft: value, id: crypto.randomUUID() });
    if (await applyMutation(result)) setDraft(null);
  }

  async function toggleActive(goal: StrengthGoal) {
    if (saving) return;
    const result = goal.active
      ? deactivateStrengthGoal({ goals, exercises, goalId: goal.id })
      : reactivateStrengthGoal({ goals, exercises, goalId: goal.id });
    await applyMutation(result);
  }

  return (
    <div className="card" style={{ padding: 14, marginBottom: 12 }} data-testid="strength-goals-card">
      <div
        className="muted"
        style={{ fontSize: 12, fontWeight: 700, marginBottom: 10, letterSpacing: 0.4 }}
      >
        STRENGTH GOALS
      </div>

      {loading ? (
        <div className="muted">Loading strength goals…</div>
      ) : sortedGoals.length === 0 ? (
        <div className="muted">No strength goals set.</div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {sortedGoals.map((goal) => {
            const exerciseName = exerciseById.get(goal.exerciseId)?.name ?? "Unknown exercise";
            return (
              <div
                key={goal.id}
                data-testid={`strength-goal-${goal.id}`}
                style={{
                  borderTop: "1px solid var(--border)",
                  paddingTop: 10,
                  opacity: goal.active ? 1 : 0.62,
                }}
              >
                <div style={{ fontWeight: 800 }}>{exerciseName}</div>
                <div style={{ fontSize: 14, marginTop: 2 }}>{goalSummary(goal)}</div>
                {goal.label ? <div className="muted" style={{ fontSize: 13 }}>{goal.label}</div> : null}
                <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>
                  {goal.active ? "Active" : "Inactive"}
                </div>
                {isEditing ? (
                  <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                    <button className="btn small" type="button" disabled={saving} onClick={() => startEdit(goal)}>
                      Edit
                    </button>
                    <button className="btn small" type="button" disabled={saving} onClick={() => void toggleActive(goal)}>
                      {goal.active ? "Deactivate" : "Reactivate"}
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {isEditing && !loading ? (
        <div style={{ marginTop: 12 }}>
          {!draft ? (
            <button
              className="btn small"
              type="button"
              disabled={saving || goals.length >= MAX_STRENGTH_GOALS}
              onClick={() => {
                setDraft({ ...EMPTY_DRAFT });
                setError("");
              }}
            >
              Add strength goal
            </button>
          ) : (
            <div
              data-testid="strength-goal-form"
              style={{ borderTop: "1px solid var(--border)", marginTop: 4, paddingTop: 12, display: "grid", gap: 10 }}
            >
              <div style={{ fontWeight: 800 }}>{draft.goalId ? "Edit strength goal" : "Add strength goal"}</div>
              <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
                <span className="muted">Exercise</span>
                <select
                  aria-label="Exercise"
                  className="input"
                  value={draft.exerciseId}
                  onChange={(event) => setDraft({ ...draft, exerciseId: event.target.value })}
                >
                  <option value="">Select…</option>
                  {exerciseOptions.map((exercise) => (
                    <option key={exercise.id} value={exercise.id}>{exercise.name}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
                <span className="muted">Target metric</span>
                <select
                  aria-label="Target metric"
                  className="input"
                  value={draft.targetMetric}
                  onChange={(event) => setDraft({ ...draft, targetMetric: event.target.value as StrengthGoalTargetMetric })}
                >
                  <option value="load">Performed load</option>
                  <option value="reps">Reps</option>
                </select>
              </label>
              <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
                <span className="muted">Target value</span>
                <input
                  aria-label="Target value"
                  className="input"
                  inputMode="decimal"
                  value={draft.targetValue}
                  onChange={(event) => setDraft({ ...draft, targetValue: event.target.value })}
                />
              </label>
              <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
                <span className="muted">Label (optional)</span>
                <input
                  aria-label="Label (optional)"
                  className="input"
                  value={draft.label}
                  onChange={(event) => setDraft({ ...draft, label: event.target.value })}
                />
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn small primary" type="button" disabled={saving} onClick={() => void saveDraft()}>
                  {saving ? "Saving…" : "Save goal"}
                </button>
                <button
                  className="btn small"
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    setDraft(null);
                    setError("");
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          {goals.length >= MAX_STRENGTH_GOALS && !draft ? (
            <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              The strength-goal limit of {MAX_STRENGTH_GOALS} has been reached.
            </div>
          ) : null}
          {error ? (
            <div role="alert" style={{ color: "#b91c1c", fontWeight: 700, fontSize: 13, marginTop: 8 }}>
              {error}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
