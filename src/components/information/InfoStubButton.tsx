// src/components/information/InfoStubButton.tsx
/* ============================================================================
   InfoStubButton.tsx
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-03-22-INFO-STUB-01
   FILE: src/components/information/InfoStubButton.tsx

   Purpose
   - Lightweight shared info-button stub for Progress pages
   - Establish a stable info-button contract before modal behavior is added

   Notes
   - No click behavior yet
   - Carries optional infoKey for future wiring
   ============================================================================ */

import React from "react";

type InfoStubButtonProps = {
  infoKey?: string;
};

export default function InfoStubButton({ infoKey }: InfoStubButtonProps) {
  return (
    <button
      data-info-key={infoKey}
      type="button"
      aria-label="More information"
      title="More information"
      style={{
        border: "1px solid var(--line)",
        background: "transparent",
        color: "var(--muted)",
        borderRadius: 999,
        width: 20,
        height: 20,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 11,
        fontWeight: 700,
        lineHeight: 1,
        cursor: "default",
        padding: 0,
      }}
    >
      i
    </button>
  );
}

/* ============================================================================
   End of file: src/components/information/InfoStubButton.tsx
   ============================================================================ */