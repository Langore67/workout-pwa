/* ============================================================================
   dataReadinessConfidence.ts
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-04-23-DATA-READINESS-CONFIDENCE-01
   FILE: src/body/dataReadinessConfidence.ts

   Purpose
   - Centralize simple data-readiness confidence labels
   - Keep lightweight "High / Moderate / Low" readiness semantics consistent
   - Support analytical surfaces like Performance without forcing full
     signal-confidence/coherence modeling

   Notes
   - This is intentionally smaller than signalConfidence.ts
   - v1 only maps readiness booleans/counts to a simple label
   ============================================================================ */

export type DataReadinessConfidenceLabel = "High" | "Moderate" | "Low";

export function dataReadinessConfidenceFromCount(
  readinessCount: number
): DataReadinessConfidenceLabel {
  if (readinessCount >= 3) return "High";
  if (readinessCount >= 2) return "Moderate";
  return "Low";
}

export function dataReadinessConfidenceFromFlags(flags: {
  hasWeight?: boolean;
  hasWaist?: boolean;
  hasStrength?: boolean;
}): DataReadinessConfidenceLabel {
  const count =
    (flags.hasWeight ? 1 : 0) +
    (flags.hasWaist ? 1 : 0) +
    (flags.hasStrength ? 1 : 0);

  return dataReadinessConfidenceFromCount(count);
}

/* ============================================================================
   FOOTER COMMENT
   FILE: src/body/dataReadinessConfidence.ts
   ============================================================================ */