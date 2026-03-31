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

import React, { useState } from "react";
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

/* ============================================================================
   Breadcrumb 3 — Page
   ============================================================================ */

export default function ProgressPage() {
  const nav = useNavigate();
  const [copyState, setCopyState] = useState<"idle" | "copying" | "copied" | "error">("idle");

  async function onCopyCoachExport() {
    try {
      setCopyState("copying");
      const metrics = await buildCoachExportMetrics();
      const text = formatCoachExportText(metrics);
      await navigator.clipboard.writeText(text);
      setCopyState("copied");
      window.setTimeout(() => {
        setCopyState((current) => (current === "copied" ? "idle" : current));
      }, 2000);
    } catch {
      setCopyState("error");
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
          <div className="muted" style={{ fontSize: 13 }}>
            {copyState === "copied"
              ? "Coach export copied."
              : copyState === "error"
                ? "Could not copy export."
                : "Creates a copy/paste summary for ChatGPT analysis."}
          </div>
        </div>
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
