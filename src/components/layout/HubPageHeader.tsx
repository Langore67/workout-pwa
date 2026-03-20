// src/components/layout/HubPageHeader.tsx
/* ============================================================================
   HubPageHeader.tsx — Shared header for hub child pages
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-03-20-LAYOUT-04
   FILE: src/components/layout/HubPageHeader.tsx

   Purpose
   - Standardize top-of-page header layout for pages that belong to a parent hub
   - Match the working Performance page pattern:
       1) compact top row with page title + back-to-hub action
       2) optional detail card below with breadcrumb + descriptive copy
   - Support both Progress and More hub patterns
   - Leave room for future right-side actions without redesign

   Supported use cases
   - Progress -> Performance / Strength / Body / Walks / MPS
   - More -> Profile / Paste Workout / Export / Help / Dev
   ============================================================================ */

import React from "react";
import { useNavigate } from "react-router-dom";

type HubPageHeaderProps = {
  hubLabel: string;
  hubRoute: string;
  pageTitle: string;

  /* ------------------------------------------------------------------------
     Compact top row
     ------------------------------------------------------------------------ */
  showBackButton?: boolean;
  backLabel?: string;
  rightSlot?: React.ReactNode;

  /* ------------------------------------------------------------------------
     Optional detail card beneath the top row
     ------------------------------------------------------------------------ */
  showDetailCard?: boolean;
  eyebrow?: string;
  subtitle?: string;
  metaLine?: string;
};

export default function HubPageHeader({
  hubLabel,
  hubRoute,
  pageTitle,
  showBackButton = true,
  backLabel,
  rightSlot,
  showDetailCard = true,
  eyebrow,
  subtitle,
  metaLine,
}: HubPageHeaderProps) {
  const navigate = useNavigate();

  return (
    <>
      {/* =====================================================================
          Compact top row — matches Performance page pattern
         =================================================================== */}
      <div
        className="row"
        style={{
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 6,
        }}
      >
        <h2 style={{ margin: 0 }}>{pageTitle}</h2>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {rightSlot}

          {showBackButton ? (
            <div
              className="muted"
              style={{
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                padding: "4px 6px",
                borderRadius: 6,
              }}
              onClick={() => navigate(hubRoute)}
            >
              {backLabel ?? `← ${hubLabel}`}
            </div>
          ) : null}
        </div>
      </div>

      {/* =====================================================================
          Optional detail card
         =================================================================== */}
      {showDetailCard ? (
        <div className="card" style={{ marginBottom: 12, padding: 14 }}>
          <div
            className="muted"
            style={{
              fontSize: 12,
              fontWeight: 700,
              marginBottom: 8,
            }}
          >
            {eyebrow ?? `${hubLabel} / ${pageTitle}`}
          </div>

          {subtitle ? (
            <div className="muted" style={{ lineHeight: 1.45 }}>
              {subtitle}
            </div>
          ) : null}

          {metaLine ? (
            <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
              {metaLine}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

/* ============================================================================
   End of file: src/components/layout/HubPageHeader.tsx
   ============================================================================ */