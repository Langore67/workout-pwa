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
import { informationRegistry } from "../../config/information/informationRegistry";

type SectionHeaderRowProps = {
  title: string;
  infoPageKey?: keyof typeof informationRegistry;
  infoKey?: string;
  infoContext?: {
    waistEntryCount?: number;
    waistTargetCount?: number;
    waistEntriesNeeded?: number;
    confidenceLabel?: string;
  };
};

export default function SectionHeaderRow({
  title,
  infoPageKey,
  infoKey,
  infoContext,
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

      {infoKey ? (
        <InfoStubButton
          pageKey={infoPageKey}
          infoKey={infoKey}
          context={infoContext}
        />
      ) : null}
    </div>
  );
}

/* ============================================================================
   End of file: src/components/layout/SectionHeaderRow.tsx
   ============================================================================ */
