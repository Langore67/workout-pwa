// src/body/hydrationConfidence.ts
/* ============================================================================
   hydrationConfidence.ts — Body comp confidence helper
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-03-22-BODYCOMP-CONFIDENCE-01
   FILE: src/features/bodyComp/hydrationConfidence.ts

   Purpose
   - Estimate whether today's body composition reading is trustworthy
   - Flag likely hydration-driven distortion before user overreacts
   - Provide a simple interpretation layer for Body Comp Page

   Notes
   - v1 is intentionally simple and conservative
   - We are NOT changing raw body-fat or lean-mass values yet
   - We are only adding confidence + messaging
   ============================================================================ */

import type { BodyMetricEntry } from "../db";
import { getBodyFatPctRaw, getLeanMassLb, getWeightLb } from "./bodyCalculations";

export type HydrationConfidenceLevel = "high" | "medium" | "low";

export type HydrationConfidenceInput = {
  waterPctNow?: number | null;
  waterPctAvg?: number | null;
  waterPctRecentHigh?: number | null;

  icwNow?: number | null;
  ecwNow?: number | null;
  tbwNow?: number | null;

  weightNow?: number | null;
  weightPrev?: number | null;

  leanMassNow?: number | null;
  leanMassPrev?: number | null;

  bodyFatPctNow?: number | null;
  bodyFatPctPrev?: number | null;
};

export type HydrationConfidenceResult = {
  score: number;
  level: HydrationConfidenceLevel;
  label: string;
  tone: "success" | "warning" | "danger";

  waterDelta: number | null;
  fluidRatio: number | null;

    adequacyScore: number;
    adequacyLabel: "good" | "watch" | "low" | "unknown";
    hydrationLow: boolean;
  
    hydrationDriftPct: number | null;
    hydrationDriftLabel: "none" | "watch" | "high" | "unknown";
    hydrationBaselineLow: boolean;
  
  likelyHydrationDistortion: boolean;
  interpretation: string;
  detail: string;
};

function safeNum(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function computeHydrationConfidence(
  input: HydrationConfidenceInput
): HydrationConfidenceResult {
  const waterPctNow = safeNum(input.waterPctNow);
  const waterPctAvg = safeNum(input.waterPctAvg);
  const waterPctRecentHigh = safeNum(input.waterPctRecentHigh);
  const ecwNow = safeNum(input.ecwNow);
  const tbwNow = safeNum(input.tbwNow);
  const weightNow = safeNum(input.weightNow);
  const weightPrev = safeNum(input.weightPrev);
  const leanMassNow = safeNum(input.leanMassNow);
  const leanMassPrev = safeNum(input.leanMassPrev);
  const bodyFatPctNow = safeNum(input.bodyFatPctNow);
  const bodyFatPctPrev = safeNum(input.bodyFatPctPrev);

    let stability = 20; // neutral default when data missing
    let distribution = 20; // neutral default when data missing
    let consistency = 15; // neutral default when data missing
  let adequacyScore = 10; // neutral default when data missing

    let waterDelta: number | null = null;
  let hydrationDriftPct: number | null = null;
  if (waterPctNow != null && waterPctAvg != null) {
    waterDelta = waterPctNow - waterPctAvg;
    const absDelta = Math.abs(waterDelta);
  
    stability = absDelta <= 1.0 ? 40 : absDelta <= 2.0 ? 25 : 10;
  }
  
  // --- Hydration Drift vs recent high ---
  if (
    waterPctNow != null &&
    waterPctRecentHigh != null &&
    Number.isFinite(waterPctNow) &&
    Number.isFinite(waterPctRecentHigh)
  ) {
    hydrationDriftPct = waterPctNow - waterPctRecentHigh;
}

    let fluidRatio: number | null = null;
    if (ecwNow != null && tbwNow != null && tbwNow > 0) {
      fluidRatio = ecwNow / tbwNow;
  
      distribution =
        fluidRatio >= 0.36 && fluidRatio <= 0.39
          ? 35
          : fluidRatio >= 0.35 && fluidRatio <= 0.4
            ? 20
            : 10;
    }
  
      const hydrationLowNow =
        waterPctNow != null && Number.isFinite(waterPctNow) && waterPctNow < 52;
    
      const hydrationModerateNow =
        waterPctNow != null &&
        Number.isFinite(waterPctNow) &&
        waterPctNow >= 52 &&
    waterPctNow < 55;
  
    const fluidAdequacyPoor =
      fluidRatio != null && Number.isFinite(fluidRatio) && fluidRatio > 0.4;
  
    const fluidAdequacyWatch =
      fluidRatio != null &&
      Number.isFinite(fluidRatio) &&
      fluidRatio > 0.39 &&
      fluidRatio <= 0.4;
  
      if (hydrationLowNow || fluidAdequacyPoor) {
        adequacyScore = 5;
      } else if (hydrationModerateNow || fluidAdequacyWatch) {
        adequacyScore = 10;
  } else if (
      waterPctNow != null &&
      Number.isFinite(waterPctNow) &&
      waterPctNow >= 55 &&
      fluidRatio != null &&
      Number.isFinite(fluidRatio) &&
      fluidRatio <= 0.39
    ) {
      adequacyScore = 15;
  }

  if (
    weightNow != null &&
    weightPrev != null &&
    leanMassNow != null &&
    leanMassPrev != null
  ) {
    const weightSwing = Math.abs(weightNow - weightPrev);
    const leanSwing = Math.abs(leanMassNow - leanMassPrev);

    consistency =
      weightSwing <= 1.0 && leanSwing <= 1.0
        ? 25
        : weightSwing <= 2.0 && leanSwing <= 2.0
          ? 15
          : 5;
  }

  const score = Math.max(
    0,
    Math.min(100, Math.round(stability + distribution + consistency))
  );

  const level: HydrationConfidenceLevel =
    score >= 80 ? "high" : score >= 60 ? "medium" : "low";

  const label =
    level === "high"
      ? "High Confidence"
      : level === "medium"
        ? "Moderate Confidence"
        : "Low Confidence";

      const tone =
        level === "high"
          ? "success"
          : level === "medium"
            ? "warning"
            : "danger";
    
      const adequacyLabel =
        waterPctNow == null && fluidRatio == null
          ? "unknown"
          : adequacyScore >= 15
            ? "good"
            : adequacyScore >= 10
              ? "watch"
              : "low";
    
      const hydrationDriftLabel =
        hydrationDriftPct == null
          ? "unknown"
          : hydrationDriftPct <= -1.5
            ? "high"
            : hydrationDriftPct <= -0.75
              ? "watch"
              : "none";
    
      const hydrationBaselineLow =
    hydrationDriftPct != null && hydrationDriftPct <= -1.5;

    const leanDown =
      leanMassNow != null &&
      leanMassPrev != null &&
      leanMassNow < leanMassPrev;
  
    const bfUp =
      bodyFatPctNow != null &&
      bodyFatPctPrev != null &&
      bodyFatPctNow > bodyFatPctPrev;
  
    const waterDropFromBaseline =
      waterDelta != null && waterDelta <= -1.0;
  
    const ecwElevated =
      fluidRatio != null && fluidRatio > 0.39;
  
      const likelyHydrationDistortion =
        !!leanDown &&
        !!bfUp &&
        (
          waterDropFromBaseline ||
          hydrationLowNow ||
          hydrationBaselineLow ||
          ecwElevated ||
          level !== "high"
      );

  let interpretation = "";
  let detail = "";

  if (level === "high") {
    interpretation = "Today's body comp reading is likely trustworthy.";
    detail = "Hydration and fluid balance look stable enough to interpret today's values normally.";
  } else if (level === "medium") {
    interpretation = "Use today's reading carefully.";
    detail = "Small hydration-related distortion is possible. Confirm with the next few readings before reacting.";
  } else {
    interpretation = "Today's reading may be distorted.";
    detail = "Hydration variability is high enough that body fat and lean mass may not reflect true tissue change.";
  }

  if (hydrationLowNow) {
    interpretation = "Hydration level is low — readings may be biased.";
    detail =
      "Hydration appears stable, but the absolute level is still low. Even when day-to-day readings are consistent, low hydration can inflate body-fat estimates and suppress lean-mass estimates.";
  }

  if (hydrationBaselineLow) {
    interpretation = "Hydration baseline is lower than recent levels.";
    detail =
      "Your current hydration appears meaningfully below your recent high-water baseline. This can make body-fat read artificially higher and lean mass read artificially lower, even when hydration looks stable day to day.";
  }


  if (likelyHydrationDistortion) {
    interpretation = "Lean mass drop and body-fat rise may be hydration-driven.";
    detail = "This pattern often occurs when water balance or fluid distribution shifts, even when tissue has not meaningfully changed.";
  }

    return {
      score,
      level,
      label,
      tone,
      waterDelta,
      fluidRatio,
      adequacyScore,
      adequacyLabel,
      hydrationLow: hydrationLowNow,
      hydrationDriftPct,
      hydrationDriftLabel,
      hydrationBaselineLow,
      likelyHydrationDistortion,
      interpretation,
      detail,
  };
}

export function computeHydrationConfidenceFromBodyRows(rows: BodyMetricEntry[]) {
  const latest = rows?.[0];
  if (!latest) return null;

  const prev = rows?.[1];
  const waterSamples = (rows ?? [])
    .slice(1, 6)
    .map((row) => row?.bodyWaterPct)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  const waterPctAvg =
    waterSamples.length > 0
      ? waterSamples.reduce((sum, value) => sum + value, 0) / waterSamples.length
      : null;

  const waterPctRecentHigh = waterSamples.length > 0 ? Math.max(...waterSamples) : null;
  const tbwNow =
    typeof latest.icwLb === "number" && typeof latest.ecwLb === "number"
      ? latest.icwLb + latest.ecwLb
      : null;

  return computeHydrationConfidence({
    waterPctNow: latest?.bodyWaterPct ?? null,
    waterPctAvg,
    waterPctRecentHigh,
    icwNow: latest?.icwLb ?? null,
    ecwNow: latest?.ecwLb ?? null,
    tbwNow,
    weightNow: getWeightLb(latest) ?? null,
    weightPrev: prev ? getWeightLb(prev) ?? null : null,
    leanMassNow: getLeanMassLb(latest) ?? null,
    leanMassPrev: prev ? getLeanMassLb(prev) ?? null : null,
    bodyFatPctNow: getBodyFatPctRaw(latest) ?? null,
    bodyFatPctPrev: prev ? getBodyFatPctRaw(prev) ?? null : null,
  });
}
