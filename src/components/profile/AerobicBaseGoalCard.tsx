import { useEffect, useState } from "react";
import type { AerobicBaseGoal } from "../../lib/cardio/aerobicBaseGoal";
import {
  MAX_AEROBIC_BASE_WEEKLY_TARGET_MINUTES,
  validateAerobicBaseWeeklyTarget,
} from "../../lib/cardio/aerobicBaseGoal";
import type { AerobicBaseGoalProgress } from "../../lib/cardio/aerobicBaseGoalProgress";

export function AerobicBaseGoalCard({
  isEditing,
  loading,
  goal,
  progress,
  saveGoal,
  clearGoal,
}: {
  isEditing: boolean;
  loading: boolean;
  goal?: AerobicBaseGoal;
  progress?: AerobicBaseGoalProgress;
  saveGoal: (minutes: number) => Promise<void>;
  clearGoal: () => Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  useEffect(() => setDraft(goal ? String(goal.weeklyTargetMinutes) : ""), [goal]);

  async function save() {
    const value = Number(draft);
    const validation = validateAerobicBaseWeeklyTarget(value);
    if (!validation.valid) return setError(validation.error);
    setSaving(true);
    setError(undefined);
    try {
      await saveGoal(validation.value);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save the aerobic-base goal.");
    } finally {
      setSaving(false);
    }
  }

  async function clear() {
    setSaving(true);
    setError(undefined);
    try {
      await clearGoal();
      setDraft("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to clear the aerobic-base goal.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card" style={{ padding: 14, marginBottom: 12 }} data-testid="aerobic-base-goal-card">
      <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 0.8, marginBottom: 10 }}>AEROBIC BASE GOAL</div>
      {loading ? <div className="muted">Loading aerobic-base goal…</div> : !goal && !isEditing ? (
        <div className="muted">No weekly aerobic-base target set.</div>
      ) : (
        <>
          {goal && (
            <div style={{ display: "grid", gap: 5, marginBottom: isEditing ? 12 : 0 }}>
              <div>Weekly target: <strong>{goal.weeklyTargetMinutes} min</strong></div>
              {progress && <>
                <div>Current week documented: {progress.currentWeek.documentedMinutes} min</div>
                <div>Remaining documented amount: {progress.currentWeek.remainingDocumentedMinutes} min</div>
                <div>Missing usable zone data: {progress.currentWeek.missingUsableZoneEvidenceSessions} sessions</div>
              </>}
            </div>
          )}
          {isEditing && (
            <div style={{ display: "grid", gap: 8 }}>
              <label>
                <span className="muted" style={{ display: "block", fontSize: 12, marginBottom: 4 }}>Weekly target minutes</span>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={MAX_AEROBIC_BASE_WEEKLY_TARGET_MINUTES}
                  step={1}
                  value={draft}
                  onChange={(event) => { setDraft(event.target.value); setError(undefined); }}
                  aria-label="Weekly aerobic-base target minutes"
                />
              </label>
              {error && <div style={{ color: "var(--danger, #b91c1c)", fontSize: 12 }}>{error}</div>}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="btn primary" type="button" disabled={saving} onClick={() => void save()}>Save target</button>
                {goal && <button className="btn" type="button" disabled={saving} onClick={() => void clear()}>Clear target</button>}
              </div>
            </div>
          )}
        </>
      )}
      <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
        Documented exposure uses the MapMyWalk/MapMyFitness Zone 3 proxy. Missing zone evidence is not counted as zero activity.
      </div>
    </div>
  );
}
