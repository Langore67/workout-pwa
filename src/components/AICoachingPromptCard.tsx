import React, { useCallback, useState } from "react";
import { buildAICoachingPrompt, formatAICoachingAthleteContext, loadAICoachingAthleteContext } from "../domain/coaching/aiCoachingPrompt";
import { AI_COACHING_PROTOCOL_VERSION, DEFAULT_AI_COACHING_PROTOCOL_V1_2, getAICoachingProtocol, resetAICoachingProtocol, setAICoachingProtocol } from "../domain/coaching/aiCoachingProtocol";
import { ironForgeImportContractV1 } from "../domain/coaching/ironForgeImportContractV1";

export function AICoachingPromptCard() {
  const [expanded, setExpanded] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [storedVersion, setStoredVersion] = useState(AI_COACHING_PROTOCOL_VERSION);
  const [preview, setPreview] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async (instructionOverride?: string) => {
    setLoading(true); setError("");
    try {
      const [stored, athlete] = await Promise.all([getAICoachingProtocol(), loadAICoachingAthleteContext()]);
      const text = instructionOverride ?? stored.instructionText;
      setInstructions(text); setStoredVersion(stored.protocolVersion);
      setPreview(buildAICoachingPrompt({ coachingProtocol: text, athleteContext: formatAICoachingAthleteContext(athlete), importContract: ironForgeImportContractV1 }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not generate the coaching prompt."); }
    finally { setLoading(false); }
  }, []);

  async function toggle() {
    const next = !expanded; setExpanded(next); setFeedback("");
    if (next) await refresh();
  }

  async function save() {
    setSaving(true); setFeedback(""); setError("");
    try { const stored = await setAICoachingProtocol(instructions); setStoredVersion(stored.protocolVersion); await refresh(stored.instructionText); setFeedback("Instructions saved."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save instructions."); }
    finally { setSaving(false); }
  }

  async function reset() {
    if (!window.confirm("Reset coaching instructions to the complete IronForge v1.2 default?")) return;
    setSaving(true); setFeedback(""); setError("");
    try { await resetAICoachingProtocol(); await refresh(DEFAULT_AI_COACHING_PROTOCOL_V1_2); setFeedback("Instructions reset to the v1.2 default."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not reset instructions."); }
    finally { setSaving(false); }
  }

  async function copy() {
    setFeedback(""); setError("");
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard access is unavailable.");
      await navigator.clipboard.writeText(preview);
      setFeedback("Complete prompt copied.");
    } catch { setError("Could not copy the prompt. Select the preview and copy it manually."); }
  }

  return <div className="card" data-testid="ai-coaching-prompt" style={{ padding: 14 }}>
    <button type="button" aria-expanded={expanded} aria-controls="ai-coaching-prompt-content" onClick={() => void toggle()} style={{ width: "100%", border: 0, padding: 0, background: "transparent", color: "inherit", textAlign: "left", cursor: "pointer", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
      <span><span style={{ display: "block", fontWeight: 900, fontSize: 18 }}>AI Coaching Prompt</span><span className="muted" style={{ display: "block", marginTop: 3, fontSize: 12 }}>Protocol version: v1.2 · Personalized, high-intensity interactive gym coaching</span></span>
      <span aria-hidden="true" style={{ fontSize: 18 }}>{expanded ? "▾" : "›"}</span>
    </button>
    {expanded ? <div id="ai-coaching-prompt-content" style={{ marginTop: 14, display: "grid", gap: 12 }}>
      {storedVersion !== AI_COACHING_PROTOCOL_VERSION ? <div role="status" style={{ color: "#92400e", fontSize: 13 }}>Saved customization uses protocol v{storedVersion}; bundled default is v{AI_COACHING_PROTOCOL_VERSION}. Your customization was preserved.</div> : null}
      <label style={{ display: "grid", gap: 6 }}><span style={{ fontWeight: 800 }}>Generated Preview</span><textarea aria-label="Generated coaching prompt" readOnly value={loading ? "Generating current athlete context…" : preview} rows={18} style={{ width: "100%", resize: "vertical", fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace", fontSize: 12 }} /></label>
      <label style={{ display: "grid", gap: 6 }}><span style={{ fontWeight: 800 }}>Edit Instructions</span><textarea aria-label="Coaching instructions" value={instructions} onChange={(event) => setInstructions(event.target.value)} rows={14} style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }} /></label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button className="btn primary" type="button" disabled={loading || !preview} onClick={() => void copy()}>Copy Prompt</button>
        <button className="btn" type="button" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save Instructions"}</button>
        <button className="btn" type="button" disabled={saving} onClick={() => void reset()}>Reset to Default</button>
        <button className="btn" type="button" disabled={loading} onClick={() => void refresh(instructions)}>{loading ? "Refreshing…" : "Refresh Context"}</button>
      </div>
      {feedback ? <div role="status" style={{ color: "#166534", fontWeight: 700 }}>{feedback}</div> : null}
      {error ? <div role="alert" style={{ color: "#b91c1c", fontWeight: 700 }}>{error}</div> : null}
    </div> : null}
  </div>;
}
