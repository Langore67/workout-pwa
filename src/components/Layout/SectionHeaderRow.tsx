// src/components/layout/SectionHeaderRow.tsx
/* ============================================================================
   SectionHeaderRow.tsx
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-03-22-SECTION-HEADER-01
   FILE: src/components/layout/SectionHeaderRow.tsx

   Purpose
   - Shared section header for Progress pages
   - Left-aligned title + optional right-side info button

   Notes
   - Uses InfoStubButton
   - Keeps layout consistent across pages
   ============================================================================ */

import React from "react";
import InfoStubButton from "../information/InfoStubButton";

type SectionHeaderRowProps = {
  title: string;
  infoKey?: string;
};

export default function SectionHeaderRow({
  title,
  infoKey,
}: SectionHeaderRowProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        marginBottom: 8,
      }}
    >
      <div
        className="muted"
        style={{
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        {title}
      </div>

      {infoKey ? <InfoStubButton infoKey={infoKey} /> : null}
    </div>
  );
}

/* ============================================================================
   End of file: src/components/layout/SectionHeaderRow.tsx
   ============================================================================ */