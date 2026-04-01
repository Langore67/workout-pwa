// src/pages/ProgressPage.tsx
/* ============================================================================
   ProgressPage.tsx — Analytics home for Progress
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-03-14-PROGRESS-03
   FILE: src/pages/ProgressPage.tsx

   Purpose
   - Serve as the analytics home inside Progress
   - Feature Performance as the primary overview destination
   - Organize Strength / Body / Walks / Muscle Preservation as drill-down views
   - Keep implementation read-only / navigation-only

   Navigation targets
   - /performance
   - /strength
   - /body
   - /walks
   - /mps

   Changes (PROGRESS-03)
   ✅ Promote Performance to the featured overview destination
   ✅ Add stronger page hierarchy: Header → Overview → Detailed Views
   ✅ Rename featured tile from "Performance Dashboard" to "Performance"
   ✅ Keep Progress as the analytics hub
   ✅ Keep implementation simple and navigation-only
   ============================================================================ */

import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { buildCoachExportMetrics } from "../lib/coachExport/buildCoachExportMetrics";
import { formatCoachExportText } from "../lib/coachExport/formatCoachExportText";

/* ============================================================================
   Breadcrumb 1 — Tile component
   ============================================================================ */

function ProgressTile({
  title,
  subtitle,
  eyebrow,
  onClick,
}: {
  title: string;
  subtitle: string;
  eyebrow: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="card clickable"
      onClick={onClick}
      style={{
        cursor: "pointer",
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        textAlign: "left",
        border: "none",
        background: "var(--card, white)",
        transition: "transform 120ms ease, box-shadow 120ms ease, opacity 120ms ease",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--muted)",
        }}
      >
        {eyebrow}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div
          style={{
            fontWeight: 900,
            fontSize: 18,
            lineHeight: 1.15,
            color: "var(--text, #111827)",
          }}
        >
          {title}
        </div>

        <div
          aria-hidden="true"
          style={{
            fontSize: 18,
            fontWeight: 800,
            color: "var(--muted)",
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          →
        </div>
      </div>

      <div
        className="muted"
        style={{
          lineHeight: 1.35,
          fontSize: 14,
        }}
      >
        {subtitle}
      </div>
    </button>
  );
}

/* ============================================================================
   Breadcrumb 2 — Small section label helper
   ============================================================================ */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10, fontWeight: 800, fontSize: 14 }}>{children}</div>
  );
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to textarea fallback
  }

  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "true");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "0";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/* ============================================================================
   Breadcrumb 3 — Page
   ============================================================================ */

export default function ProgressPage() {
  const nav = useNavigate();
  const [copyState, setCopyState] = useState<"idle" | "copying" | "copied" | "error">("idle");
  const [manualCopyText, setManualCopyText] = useState<string | null>(null);
  const manualCopyRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!manualCopyText) return;
    window.requestAnimationFrame(() => {
      manualCopyRef.current?.focus();
      manualCopyRef.current?.select();
      manualCopyRef.current?.setSelectionRange(0, manualCopyText.length);
    });
  }, [manualCopyText]);

  async function onCopyCoachExport() {
    let text = "";
    try {
      setCopyState("copying");
      setManualCopyText(null);
      const metrics = await buildCoachExportMetrics();
      text = formatCoachExportText(metrics);
      const copied = await copyTextToClipboard(text);
      if (!copied) throw new Error("copy failed");
      setCopyState("copied");
      window.setTimeout(() => {
        setCopyState((current) => (current === "copied" ? "idle" : current));
      }, 2000);
    } catch {
      setCopyState("error");
      setManualCopyText(text || "Could not generate coach export text.");
    }
  }

  return (
    <div className="container">
      {/* ======================================================================
          Breadcrumb 3A — Page header
         ==================================================================== */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--muted)",
            marginBottom: 6,
          }}
        >
          Analytics Hub
        </div>

        <h2 style={{ marginTop: 0, marginBottom: 8 }}>Progress</h2>

        <div className="muted" style={{ lineHeight: 1.45 }}>
          Strength trends, body metrics, walking volume, and muscle preservation.
        </div>

        <div className="row" style={{ gap: 10, marginTop: 14, alignItems: "center", flexWrap: "wrap" }}>
          <button className="btn primary" onClick={() => void onCopyCoachExport()} disabled={copyState === "copying"}>
            {copyState === "copying" ? "Building Export…" : "Copy Coach Export"}
          </button>
          <div className="muted" style={{ fontSize: 13, flex: "1 1 220px", minWidth: 0 }}>
            {copyState === "copied"
              ? "Coach export copied."
              : copyState === "error"
                ? "Copy not available on this device. Tap and hold to copy manually."
                : "Creates a copy/paste summary for ChatGPT analysis."}
          </div>
        </div>

        {manualCopyText ? (
          <div
            className="card"
            style={{
              marginTop: 12,
              padding: 12,
              background: "rgba(248,250,252,0.9)",
              border: "1px solid rgba(148,163,184,0.35)",
            }}
          >
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Manual Copy</div>
            <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
              Copy not available on this device. Tap and hold to copy manually.
            </div>
            <textarea
              ref={manualCopyRef}
              className="input"
              readOnly
              value={manualCopyText}
              rows={14}
              style={{
                width: "100%",
                fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
                fontSize: 12,
                lineHeight: 1.45,
                whiteSpace: "pre",
              }}
              onFocus={(e) => e.currentTarget.select()}
            />
            <div className="row" style={{ gap: 8, marginTop: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button className="btn small" type="button" onClick={() => manualCopyRef.current?.select()}>
                Select All
              </button>
              <button className="btn small" type="button" onClick={() => setManualCopyText(null)}>
                Close
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* ======================================================================
          Breadcrumb 3B — Featured overview destination
         ==================================================================== */}
      <SectionLabel>Overview</SectionLabel>

      <div style={{ marginBottom: 20 }}>
        <ProgressTile
          eyebrow="Overview"
          title="Performance"
          subtitle="Big-picture coaching view across strength, body composition, and training trends."
          onClick={() => nav("/performance")}
        />
      </div>

      {/* ======================================================================
          Breadcrumb 3C — Detailed drill-down destinations
         ==================================================================== */}
      <SectionLabel>Detailed Views</SectionLabel>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 14,
        }}
      >
        <ProgressTile
          eyebrow="Performance"
          title="Strength"
          subtitle="Estimated 1RM, trend snapshots, and lifting performance."
          onClick={() => nav("/strength")}
        />

        <ProgressTile
          eyebrow="Body Composition"
          title="Body"
          subtitle="Weight, body fat, lean mass, and body-composition tracking."
          onClick={() => nav("/body-composition")}
        />

        <ProgressTile
          eyebrow="Conditioning"
          title="Walks"
          subtitle="Daily steps, distance, and conditioning volume."
          onClick={() => nav("/walks")}
        />

        <ProgressTile
          eyebrow="Cut Quality"
          title="Muscle Preservation"
          subtitle="Strength signal during fat loss, using MPS and body trends."
          onClick={() => nav("/mps")}
        />
      </div>
    </div>
  );
}

/* ============================================================================
   End of file: src/pages/ProgressPage.tsx
   ============================================================================ */
