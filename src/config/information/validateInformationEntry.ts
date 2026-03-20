/* ============================================================================
   validateInformationEntry.ts — Dev-only Information review helper
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-03-20-INFO-01
   FILE: src/config/information/validateInformationEntry.ts

   Purpose
   - Provide a lightweight dev-only warning if an Information entry is draft
   - Reinforce the review discipline when pages evolve
   ============================================================================ */

import type { InformationEntry } from "./informationTypes";

export function validateInformationEntry(entry: InformationEntry | null) {
  if (!entry) return;

  if (import.meta.env.DEV && entry.status !== "reviewed") {
    console.warn(
      `[Information] Entry "${entry.title}" is not marked reviewed. Last reviewed build: ${entry.lastReviewedBuild}`,
    );
  }
}