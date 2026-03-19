/* ============================================================================
   bodyCalculations.ts — Derived body composition metrics
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-03-18-BODY-02
   FILE: src/body/bodyCalculations.ts

   Purpose
   - Centralize ALL derived body composition logic
   - Keep DB clean (raw inputs only)
   - Provide stable calculations for charts + coaching layer

   Design principles
   - Never mutate inputs
   - Graceful fallback when some fields are missing
   - Prefer direct measurements over derived estimates
   - Keep helpers small, predictable, and phase-safe
   ============================================================================ */

import type { BodyMetricEntry } from "../db";

/* ============================================================================
   Breadcrumb 1 — Helpers
   ============================================================================ */

function isNum(v: any): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/* ============================================================================
   Breadcrumb 2 — Raw pick helpers
   ----------------------------------------------------------------------------
   Keep raw field normalization in one place so downstream functions stay small.
   ============================================================================ */

export function getWeightLb(m: BodyMetricEntry): number | undefined {
  if (isNum((m as any).weightLb) && (m as any).weightLb > 0) return (m as any).weightLb;
  if (isNum((m as any).weight) && (m as any).weight > 0) return (m as any).weight;
  return undefined;
}

export function getWaistIn(m: BodyMetricEntry): number | undefined {
  if (isNum((m as any).waistIn) && (m as any).waistIn > 0) return (m as any).waistIn;
  if (isNum((m as any).waist) && (m as any).waist > 0) return (m as any).waist;
  return undefined;
}

export function getBodyFatPctRaw(m: BodyMetricEntry): number | undefined {
  if (isNum(m.bodyFatPct) && m.bodyFatPct >= 0 && m.bodyFatPct <= 100) {
    return m.bodyFatPct;
  }
  return undefined;
}

/* ============================================================================
   Breadcrumb 3 — Core derived metrics
   ============================================================================ */

export function getFatMassLb(m: BodyMetricEntry): number | undefined {
  if (isNum(m.bodyFatMassLb) && m.bodyFatMassLb >= 0) return m.bodyFatMassLb;

  const weight = getWeightLb(m);
  const bodyFatPct = getBodyFatPctRaw(m);

  if (isNum(weight) && isNum(bodyFatPct)) {
    return (weight * bodyFatPct) / 100;
  }

  return undefined;
}

export function getLeanMassLb(m: BodyMetricEntry): number | undefined {
  if (isNum(m.leanMassLb) && m.leanMassLb >= 0) return m.leanMassLb;

  const weight = getWeightLb(m);
  const fat = getFatMassLb(m);

  if (isNum(weight) && isNum(fat)) {
    return weight - fat;
  }

  return undefined;
}

/* ============================================================================
   Breadcrumb 4 — FFM / dry lean mass / mineral-aware helpers
   ----------------------------------------------------------------------------
   Definitions used here
   - Lean Mass = total body weight minus fat mass
   - TBW = ICW + ECW
   - FFM = fat-free mass (same as lean mass in this app's practical usage)
   - Dry Lean Mass = lean mass minus total body water
   - Mineral-adjusted dry mass = dry lean mass + mineral mass when available
   ============================================================================ */

export function getFFMLb(m: BodyMetricEntry): number | undefined {
  return getLeanMassLb(m);
}

export function getTBW(m: BodyMetricEntry): number | undefined {
  if (isNum(m.icwLb) && isNum(m.ecwLb) && m.icwLb >= 0 && m.ecwLb >= 0) {
    return m.icwLb + m.ecwLb;
  }

  return undefined;
}

export function getDryLeanMassLb(m: BodyMetricEntry): number | undefined {
  const lean = getLeanMassLb(m);
  const tbw = getTBW(m);

  if (isNum(lean) && isNum(tbw)) {
    return lean - tbw;
  }

  return undefined;
}

export function getMineralAdjustedLeanDryMassLb(m: BodyMetricEntry): number | undefined {
  const dryLean = getDryLeanMassLb(m);

  if (!isNum(dryLean)) return undefined;
  if (!isNum(m.mineralMassLb)) return dryLean;

  return dryLean + m.mineralMassLb;
}

/* ============================================================================
   Breadcrumb 5 — Fluid balance helpers
   ============================================================================ */

export function getFluidRatio(m: BodyMetricEntry): number | undefined {
  const tbw = getTBW(m);
  if (isNum(tbw) && tbw > 0 && isNum(m.ecwLb) && m.ecwLb >= 0) {
    return m.ecwLb / tbw;
  }

  return undefined;
}

export function getCellHydration(m: BodyMetricEntry): number | undefined {
  const tbw = getTBW(m);
  if (isNum(tbw) && tbw > 0 && isNum(m.icwLb) && m.icwLb >= 0) {
    return m.icwLb / tbw;
  }

  return undefined;
}

export function getICWtoECWRatio(m: BodyMetricEntry): number | undefined {
  if (isNum(m.icwLb) && isNum(m.ecwLb) && m.ecwLb > 0) {
    return m.icwLb / m.ecwLb;
  }

  return undefined;
}

export function getFluidBalanceFlag(
  m: BodyMetricEntry
): "good" | "watch" | "high-ecw" | "low-data" {
  const fluidRatio = getFluidRatio(m);

  if (!isNum(fluidRatio)) return "low-data";

  // Practical app bands, not medical diagnosis bands.
  if (fluidRatio <= 0.390) return "good";
  if (fluidRatio <= 0.395) return "watch";
  return "high-ecw";
}

export function getFluidBalanceNote(m: BodyMetricEntry): string {
  const flag = getFluidBalanceFlag(m);

  if (flag === "good") return "Fluid balance looks stable.";
  if (flag === "watch") return "Fluid ratio is slightly elevated. Watch trend, not one reading.";
  if (flag === "high-ecw") return "Higher ECW share. Possible fluid retention or noisy reading.";
  return "Add ICW and ECW to assess fluid balance.";
}

/* ============================================================================
   Breadcrumb 6 — Corrected body fat logic
   ----------------------------------------------------------------------------
   Goal
   - Keep raw BF% available
   - Offer a "corrected" BF% that down-weights fluid-distorted readings
   - Use only lightweight app-safe logic for now

   Interpretation
   - If fluid ratio is elevated, slightly reduce the effective lean mass share
     confidence by nudging corrected BF% upward.
   - If hydration looks stable, corrected BF% should stay very close to raw BF%.
   - This is a coaching metric, not a clinical estimate.
   ============================================================================ */

export function getCorrectedBodyFatPct(m: BodyMetricEntry): number | undefined {
  const weight = getWeightLb(m);
  const rawBodyFatPct = getBodyFatPctRaw(m);
  const fatMass = getFatMassLb(m);
  const fluidRatio = getFluidRatio(m);

  if (!isNum(weight) || weight <= 0) return undefined;

  // Start from best available baseline.
  const baselinePct =
    isNum(rawBodyFatPct)
      ? rawBodyFatPct
      : isNum(fatMass)
        ? (fatMass / weight) * 100
        : undefined;

  if (!isNum(baselinePct)) return undefined;

  // No fluid data? Return baseline.
  if (!isNum(fluidRatio)) return baselinePct;

  // Small upward correction when ECW share is elevated.
  // Example:
  // 0.390 -> +0.0
  // 0.395 -> +0.5
  // 0.400 -> +1.0
  // capped to avoid crazy jumps from noisy readings
  const correction = clamp((fluidRatio - 0.390) * 100, 0, 1.5);

  return baselinePct + correction;
}

export function getCorrectedFatMassLb(m: BodyMetricEntry): number | undefined {
  const weight = getWeightLb(m);
  const correctedPct = getCorrectedBodyFatPct(m);

  if (isNum(weight) && weight > 0 && isNum(correctedPct)) {
    return (weight * correctedPct) / 100;
  }

  return undefined;
}

export function getCorrectedLeanMassLb(m: BodyMetricEntry): number | undefined {
  const weight = getWeightLb(m);
  const correctedFat = getCorrectedFatMassLb(m);

  if (isNum(weight) && isNum(correctedFat)) {
    return weight - correctedFat;
  }

  return undefined;
}

/* ============================================================================
   Breadcrumb 7 — Confidence scoring
   ----------------------------------------------------------------------------
   What this does
   - Provides a more useful quality score for body composition readings
   - Rewards completeness + coherence
   - Still lightweight and stable for charts / UI

   Scale
   - 0 → very low confidence
   - 8 → high confidence
   ============================================================================ */

export function getBodyCompConfidence(m: BodyMetricEntry): number {
  let score = 0;

  const weight = getWeightLb(m);
  const waist = getWaistIn(m);
  const rawBodyFatPct = getBodyFatPctRaw(m);
  const fatMass = getFatMassLb(m);
  const leanMass = getLeanMassLb(m);
  const tbw = getTBW(m);
  const fluidRatio = getFluidRatio(m);

  if (isNum(weight)) score += 1;
  if (isNum(waist)) score += 1;
  if (isNum(rawBodyFatPct) || isNum(m.bodyFatMassLb)) score += 1;
  if (isNum(m.skeletalMuscleMassLb)) score += 1;
  if (isNum(m.icwLb) && isNum(m.ecwLb)) score += 1;
  if (isNum(m.mineralMassLb)) score += 1;

  // Coherence bonus: weight + fat + lean line up.
  if (isNum(weight) && isNum(fatMass) && isNum(leanMass)) {
    const error = Math.abs(weight - (fatMass + leanMass));
    if (error <= 1.5) score += 1;
  }

  // Fluid reasonableness bonus.
  if (isNum(tbw) && isNum(fluidRatio) && fluidRatio > 0.34 && fluidRatio < 0.42) {
    score += 1;
  }

  return score; // 0–8 scale
}

export function getBodyCompConfidenceLabel(score: number): string {
  if (score >= 7) return "High";
  if (score >= 5) return "Moderate";
  if (score >= 3) return "Limited";
  return "Low";
}

/* ============================================================================
   Breadcrumb 8 — Safe formatters (for UI reuse)
   ============================================================================ */

export function formatLb(v?: number): string {
  if (!isNum(v)) return "—";
  return v.toFixed(1);
}

export function formatPct(v?: number): string {
  if (!isNum(v)) return "—";
  return v.toFixed(1) + "%";
}

export function formatRatio(v?: number): string {
  if (!isNum(v)) return "—";
  return v.toFixed(3);
}

/* ============================================================================
   FOOTER COMMENT
   FILE: src/body/bodyCalculations.ts
   ============================================================================ */