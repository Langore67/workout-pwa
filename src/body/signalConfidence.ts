/* ============================================================================
   signalConfidence.ts
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-04-23-SIGNAL-CONFIDENCE-01
   FILE: src/body/signalConfidence.ts

   Purpose
   - Centralize reusable signal-confidence scoring
   - Preserve current MPS confidence math without behavior change
   - Provide a shared trust/readiness layer for MPS, Performance, and exports

   Notes
   - v1 is intentionally small and score-only
   - MPS-specific partial-state caps remain page-local for now
   - This helper does not assign green/yellow/red status
   ============================================================================ */

export type SignalConfidenceLabel = "Low" | "Building" | "Moderate" | "Strong";

export type SignalConfidenceInputs = {
  waistEntryCount?: number;
  waistTargetCount?: number;

  weightNow?: number;
  weightPrev?: number;

  waistNow?: number;
  waistPrev?: number;

  strengthNow?: number;
  strengthPrev?: number;
  strengthBest?: number;

  weightDelta?: number;
  waistDelta?: number;
  strengthDeltaPct?: number;
};

export type SignalConfidenceResult = {
  score: number;
  label: SignalConfidenceLabel;
  components: {
    waistReadiness: number;
    weightDataReady: number;
    strengthDataReady: number;
    coherenceScore: number;
  };
};

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function signalConfidenceLabelFromScore(
  score: number
): SignalConfidenceLabel {
  if (score >= 85) return "Strong";
  if (score >= 65) return "Moderate";
  if (score >= 40) return "Building";
  return "Low";
}

export function computeSignalConfidence(
  inputs: SignalConfidenceInputs
): SignalConfidenceResult {
  const waistTarget = inputs.waistTargetCount ?? 14;
  const waistCount = inputs.waistEntryCount ?? 0;

  const waistReadiness = Math.min(
    1,
    waistTarget > 0 ? waistCount / waistTarget : 0
  );

  const weightDataReady =
    finite(inputs.weightNow) && finite(inputs.weightPrev) ? 1 : 0;

  const strengthDataReady =
    finite(inputs.strengthNow) &&
    finite(inputs.strengthPrev) &&
    finite(inputs.strengthBest)
      ? 1
      : 0;

  let coherenceScore = 0;

  const hasWaist = finite(inputs.waistNow) && finite(inputs.waistPrev);

  if (weightDataReady && strengthDataReady && hasWaist) {
    const strengthStableOrUp = (inputs.strengthDeltaPct ?? -999) >= -1.5;
    const strengthClearlyDown = (inputs.strengthDeltaPct ?? -999) < -1.5;
    const weightDown = (inputs.weightDelta ?? 999) < 0;
    const waistDown = (inputs.waistDelta ?? 999) < 0;
    const waistFlatOrDown = (inputs.waistDelta ?? 999) <= 0;

    if (weightDown && waistDown && strengthStableOrUp) {
      coherenceScore = 1;
    } else if (weightDown && waistFlatOrDown && strengthStableOrUp) {
      coherenceScore = 0.8;
    } else if (weightDown && strengthClearlyDown) {
      coherenceScore = 0.35;
    } else {
      coherenceScore = 0.55;
    }
  } else if (weightDataReady || strengthDataReady) {
    coherenceScore = 0.4;
  } else {
    coherenceScore = 0;
  }

  const score = Math.round(
    waistReadiness * 40 +
      weightDataReady * 20 +
      strengthDataReady * 25 +
      coherenceScore * 15
  );

  return {
    score,
    label: signalConfidenceLabelFromScore(score),
    components: {
      waistReadiness,
      weightDataReady,
      strengthDataReady,
      coherenceScore,
    },
  };
}

/* ============================================================================
   FOOTER COMMENT
   FILE: src/body/signalConfidence.ts
   ============================================================================ */