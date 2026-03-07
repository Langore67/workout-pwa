import React, { useEffect, useState } from "react";
import { db } from "../db";
import { DEFAULT_HELP_CONTENT } from "../content/helpContent";

const HELP_KEY = "help_content_markdown";

export default function HelpPage() {
  const [content, setContent] = useState<string>(DEFAULT_HELP_CONTENT);
  const [draft, setDraft] = useState<string>(DEFAULT_HELP_CONTENT);
  const [status, setStatus] = useState<string>("");

  const isDev = import.meta.env.DEV;

  useEffect(() => {
    let mounted = true;

    (async () => {
      const meta = await db.app_meta.get(HELP_KEY);
      if (!mounted) return;

      if (meta?.valueJson) {
        try {
          const parsed = JSON.parse(meta.valueJson);
          if (typeof parsed === "string" && parsed.trim()) {
            setContent(parsed);
            setDraft(parsed);
            return;
          }
        } catch {
          // ignore invalid stored help content and fall back to default
        }
      }

      setContent(DEFAULT_HELP_CONTENT);
      setDraft(DEFAULT_HELP_CONTENT);
    })();

    return () => {
      mounted = false;
    };
  }, []);

  async function saveHelp() {
    try {
      await db.app_meta.put({
        key: HELP_KEY,
        valueJson: JSON.stringify(draft),
        updatedAt: Date.now(),
      });
      setContent(draft);
      setStatus("Help saved.");
    } catch (e: any) {
      setStatus(`Save failed: ${e?.message ?? e}`);
    }
  }

  async function resetHelp() {
    try {
      await db.app_meta.put({
        key: HELP_KEY,
        valueJson: JSON.stringify(DEFAULT_HELP_CONTENT),
        updatedAt: Date.now(),
      });
      setContent(DEFAULT_HELP_CONTENT);
      setDraft(DEFAULT_HELP_CONTENT);
      setStatus("Help reset to default.");
    } catch (e: any) {
      setStatus(`Reset failed: ${e?.message ?? e}`);
    }
  }

  return (
    <div className="card" style={{ maxWidth: 980 }}>
      <h2>Help</h2>
      <p className="muted">
        Workflow notes, naming rules, restore steps, and troubleshooting.
      </p>

      <hr />

      <div
        className="input"
        style={{
          whiteSpace: "pre-wrap",
          lineHeight: 1.5,
          minHeight: 320,
        }}
      >
        {content}
      </div>

      {isDev && (
        <>
          <hr />
          <h3 style={{ marginTop: 0 }}>Edit Help (DEV only)</h3>

          <textarea
            className="input"
            style={{ width: "100%", minHeight: 320, fontFamily: "inherit" }}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />

          <div className="row" style={{ gap: 10, marginTop: 10, flexWrap: "wrap" }}>
            <button className="btn primary" onClick={saveHelp}>
              Save Help
            </button>
            <button className="btn" onClick={resetHelp}>
              Reset to Default
            </button>
          </div>
        </>
      )}

      {status && (
        <div className="muted" style={{ marginTop: 12 }}>
          {status}
        </div>
      )}
    </div>
  );
}