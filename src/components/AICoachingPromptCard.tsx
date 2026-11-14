import React, { useEffect, useMemo, useState } from "react";
import {
  buildGymCoachHandoff,
  type GymCoachTodayIntent,
} from "../domain/coaching/gymCoachHandoff";
import {
  AI_COACHING_PROTOCOL_VERSION,
  DEFAULT_AI_COACHING_PROTOCOL,
  getAICoachingProtocol,
  resetAICoachingProtocol,
  setAICoachingProtocol,
} from "../domain/coaching/aiCoachingProtocol";
import { IRONFORGE_HANDOFF_RETURN_INSTRUCTIONS } from "../domain/import/ironForgeFormattingHelp";
import { copyTextToClipboard } from "../lib/clipboard/copyTextToClipboard";

export type AICoachingPromptCardProps = {
  coachExportText: string;
  coachContextLoading?: boolean;
  todayIntent: GymCoachTodayIntent;
};

export function AICoachingPromptCard({
  coachExportText,
  coachContextLoading = false,
  todayIntent,
}: AICoachingPromptCardProps) {
  const [advanced, setAdvanced] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [storedVersion, setStoredVersion] = useState(AI_COACHING_PROTOCOL_VERSION);
  const [sessionNote, setSessionNote] = useState("");
  const [loadingInstructions, setLoadingInstructions] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void getAICoachingProtocol()
      .then((stored) => {
        if (cancelled) return;
        setInstructions(stored.instructionText);
        setStoredVersion(stored.protocolVersion);
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load coaching instructions.");
      })
      .finally(() => {
        if (!cancelled) setLoadingInstructions(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const preview = useMemo(() => {
    if (!instructions.trim() || !coachExportText.trim()) return "";
    return buildGymCoachHandoff({
      coachingInstructions: instructions,
      todayIntent,
      sessionSpecificNote: sessionNote,
      coachExportText,
      workoutReturnInstructions: IRONFORGE_HANDOFF_RETURN_INSTRUCTIONS,
    });
  }, [coachExportText, instructions, sessionNote, todayIntent]);

  async function save() {
    setSaving(true);
    setFeedback("");
    setError("");
    try {
      const stored = await setAICoachingProtocol(instructions);
      setInstructions(stored.instructionText);
      setStoredVersion(stored.protocolVersion);
      setFeedback("Instructions saved.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save instructions.");
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    if (!window.confirm("Reset coaching instructions to the concise IronForge default?")) return;
    setSaving(true);
    setFeedback("");
    setError("");
    try {
      const stored = await resetAICoachingProtocol();
      setInstructions(DEFAULT_AI_COACHING_PROTOCOL);
      setStoredVersion(stored.protocolVersion);
      setFeedback("Instructions reset to the default.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not reset instructions.");
    } finally {
      setSaving(false);
    }
  }

  async function copy() {
    setFeedback("");
    setError("");
    try {
      if (!preview) throw new Error("Coach context is not ready.");
      const result = await copyTextToClipboard(preview);
      if (!result.ok) throw new Error(result.detail);
      setFeedback("Gym Coach Handoff copied.");
    } catch {
      setAdvanced(true);
      setError("Could not copy the handoff. Select the preview and copy it manually.");
    }
  }

  const busy = coachContextLoading || loadingInstructions;
  const todaySummary = [todayIntent.assignment, todayIntent.focus].filter(Boolean).join(" · ");

  return (
    <div className="card" data-testid="gym-coach-handoff" style={{ padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>Gym Coach Handoff</div>
          <div className="muted" style={{ marginTop: 4, fontSize: 12 }}>
            One copy with today&apos;s intent, current Coach context, and completed-workout return instructions.
          </div>
        </div>
        <span className="badge">Coach context {coachExportText ? "current" : busy ? "loading" : "unavailable"}</span>
      </div>

      <div style={{ marginTop: 12, display: "grid", gap: 3 }} data-testid="gym-coach-handoff:today">
        <span className="muted" style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em" }}>TODAY</span>
        <strong>{todaySummary}</strong>
        {todayIntent.completed ? <span className="muted" style={{ fontSize: 12 }}>Completed today</span> : null}
      </div>

      <label style={{ display: "grid", gap: 5, marginTop: 12 }}>
        <span style={{ fontWeight: 800, fontSize: 13 }}>Today&apos;s note <span className="muted">(optional, not saved)</span></span>
        <input
          aria-label="Today's session note"
          value={sessionNote}
          onChange={(event) => setSessionNote(event.target.value)}
          placeholder="Time, equipment, pain, or preference for this session"
        />
      </label>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
        <button className="btn primary" type="button" disabled={busy || !preview} onClick={() => void copy()}>
          {busy ? "Preparing Handoff…" : "Copy Gym Coach Handoff"}
        </button>
        <button
          className="btn"
          type="button"
          aria-expanded={advanced}
          aria-controls="gym-coach-handoff-advanced"
          onClick={() => setAdvanced((value) => !value)}
        >
          {advanced ? "Hide Advanced" : "Advanced / Preview"}
        </button>
      </div>

      {advanced ? (
        <div id="gym-coach-handoff-advanced" style={{ marginTop: 14, display: "grid", gap: 12 }}>
          {storedVersion !== AI_COACHING_PROTOCOL_VERSION ? (
            <div role="status" style={{ color: "#92400e", fontSize: 13 }}>
              Saved customization uses protocol v{storedVersion}; bundled default is v{AI_COACHING_PROTOCOL_VERSION}. Your customization was preserved.
            </div>
          ) : null}
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 800 }}>Edit coaching instructions</span>
            <textarea
              aria-label="Coaching instructions"
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              rows={9}
              style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
            />
          </label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button className="btn" type="button" disabled={saving} onClick={() => void save()}>
              {saving ? "Saving…" : "Save Instructions"}
            </button>
            <button className="btn" type="button" disabled={saving} onClick={() => void reset()}>
              Reset to Default
            </button>
          </div>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 800 }}>Handoff preview</span>
            <textarea
              aria-label="Gym Coach Handoff preview"
              readOnly
              value={busy ? "Preparing current Coach context…" : preview}
              rows={18}
              style={{ width: "100%", resize: "vertical", fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace", fontSize: 12 }}
            />
          </label>
        </div>
      ) : null}

      {feedback ? <div role="status" style={{ marginTop: 10, color: "#166534", fontWeight: 700 }}>{feedback}</div> : null}
      {error ? <div role="alert" style={{ marginTop: 10, color: "#b91c1c", fontWeight: 700 }}>{error}</div> : null}
    </div>
  );
}
