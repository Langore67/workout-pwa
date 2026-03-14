// src/pages/ProgressPage.tsx
/* ============================================================================
   ProgressPage.tsx — Progress hub (Strength / Body / Walks / MPS)
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-03-08-PROGRESS-02
   FILE: src/pages/ProgressPage.tsx

   Purpose
   - Provide a cleaner analytics hub
   - Replace multiple top-nav entries with a single Progress section
   - Host current and future body-composition / performance analytics
   - Position MPS as a premium coaching-style feature

   Navigation targets
   - /strength
   - /body
   - /walks
   - /mps

   Changes (PROGRESS-02)
   ✅ Add breadcrumb structure throughout
   ✅ Upgrade page hierarchy and spacing
   ✅ Improve tile styling and click affordance
   ✅ Add section labels for stronger UX
   ✅ Keep implementation read-only / navigation-only
   ============================================================================ */

import React from "react";
import { useNavigate } from "react-router-dom";

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
          fontWeight: 900,
          fontSize: 18,
          lineHeight: 1.15,
          color: "var(--text, #111827)",
        }}
      >
        {title}
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
   Breadcrumb 2 — Page
   ============================================================================ */

export default function ProgressPage() {
  const nav = useNavigate();

  return (
    <div className="container">
      {/* ======================================================================
          Breadcrumb 2A — Header
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
      </div>

      {/* ======================================================================
          Breadcrumb 2B — Featured dashboard
         ==================================================================== */}
      <div style={{ marginBottom: 10, fontWeight: 800, fontSize: 14 }}>
        Overview
      </div>
      
            <div style={{ marginBottom: 20 }}>
        <ProgressTile
          eyebrow="Overview"
          title="Performance"
          subtitle="Big-picture coaching view across strength, body composition, and training trends."
          onClick={() => nav("/performance")}
        />
      </div>

      {/* ======================================================================
          Breadcrumb 2C — Detailed views
         ==================================================================== */}
      <div style={{ marginBottom: 10, fontWeight: 800, fontSize: 14 }}>
        Detailed Views
      </div>

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
          onClick={() => nav("/body")}
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