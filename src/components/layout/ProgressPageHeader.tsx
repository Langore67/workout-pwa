// src/components/layout/ProgressPageHeader.tsx
/* ============================================================================
   ProgressPageHeader.tsx
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-03-22-PROGRESS-HEADER-01
   FILE: src/components/layout/ProgressPageHeader.tsx

   Purpose
   - Shared lightweight page header for Progress pages
   - Standardize breadcrumb, description, and optional action link
   - Prevent top-of-page drift across Body Comp, MPS, Strength, and Performance

   Notes
   - This is a layout primitive, not a card stack
   - Keep the header lightweight and inline
   - Do not reintroduce redundant title cards above it
   ============================================================================ */

import React from "react";

type ProgressPageHeaderProps = {
  breadcrumb: string;
  description: string;
  actionLabel?: string;
  onBreadcrumbClick?: () => void;
  onActionClick?: () => void;
};

export default function ProgressPageHeader({
  breadcrumb,
  description,
  actionLabel,
  onBreadcrumbClick,
  onActionClick,
}: ProgressPageHeaderProps) {


  return (
    <div className="card" style={{ marginBottom: 12, padding: 14 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                marginBottom: 6,
                opacity: 0.75,
                cursor: onBreadcrumbClick ? "pointer" : "default",
                display: "inline-block",
              }}
              onClick={onBreadcrumbClick}
            >
              {breadcrumb}
      </div>

      <div style={{ lineHeight: 1.45, opacity: 0.85 }}>
        {description}
      </div>

      {actionLabel ? (
        <div
          style={{
            marginTop: 10,
            fontSize: 13,
            fontWeight: 600,
            cursor: onActionClick ? "pointer" : "default",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
          onClick={onActionClick}
        >
          {actionLabel}
        </div>
      ) : null}
    </div>
  );
}

/* ============================================================================
   End of file: src/components/layout/ProgressPageHeader.tsx
   ============================================================================ */