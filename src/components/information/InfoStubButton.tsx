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

import React, { useEffect, useMemo, useState } from "react";
import InformationModal from "./InformationModal";
import { getInformationEntry } from "../../config/information/getInformationEntry";
import { validateInformationEntry } from "../../config/information/validateInformationEntry";
import { informationRegistry } from "../../config/information/informationRegistry";

type InfoStubButtonProps = {
  pageKey?: keyof typeof informationRegistry;
  infoKey?: string;
  context?: {
    waistEntryCount?: number;
    waistTargetCount?: number;
    waistEntriesNeeded?: number;
    confidenceLabel?: string;
  };
};

export default function InfoStubButton({
  pageKey,
  infoKey,
  context,
}: InfoStubButtonProps) {
  const [open, setOpen] = useState(false);

  const entry = useMemo(() => {
    if (!pageKey || !infoKey) return null;
    return getInformationEntry(pageKey, infoKey);
  }, [pageKey, infoKey]);

  useEffect(() => {
    validateInformationEntry(entry);
  }, [entry]);

  const canOpen = Boolean(entry);

  return (
    <>
      <button
        data-info-key={infoKey}
        type="button"
        aria-label={canOpen ? `More information about ${entry?.title}` : "More information"}
        title={canOpen ? `About ${entry?.title}` : "More information"}
        onClick={canOpen ? () => setOpen(true) : undefined}
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
          cursor: canOpen ? "pointer" : "default",
          padding: 0,
        }}
      >
        i
      </button>

      <InformationModal
        open={open}
        onClose={() => setOpen(false)}
        entry={entry}
        context={context}
      />
    </>
  );
}

/* ============================================================================
   End of file: src/components/information/InfoStubButton.tsx
   ============================================================================ */
