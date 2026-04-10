import type { BodyMetricEntry } from "../db";
import { getCorrectedBodyFatPct, getCorrectedLeanMassLb } from "./bodyCalculations";
import { pickTime, pickWaistIn, pickWeightLb } from "./bodySignalModel";
import type { StrengthTrendRow } from "../strength/Strength";

export type PhaseMode = "cut" | "maintain" | "bulk";
type Trend = "up" | "down" | "flat";
type PhaseTone = "good" | "watch" | "bad" | "neutral";

export type PhaseQualityInputs = {
  weightDelta?: number;
  waistDelta?: number;
  correctedLeanDelta?: number;
  correctedBodyFatDelta?: number;
  strengthDelta?: number;
  sampleCount?: number;
  hydrationDistortionLikely?: boolean;
};

export type PhaseQualityMetricCard = {
  label: string;
  value: string;
  tone: PhaseTone;
};

export type PhaseQualityCell = {
  key: string;
  title: string;
  subtitle?: string;
  tone: PhaseTone;
};

export type PhaseQualityStrengthResult = {
  strengthDelta?: number;
  strengthLabel: string;
};

export type PhaseQualityResult = {
  title: string;
  quadrant: string;
  quadrantLabel: string;
  quadrantNote: string;
  finalStatus: string;
  cells: PhaseQualityCell[];
  metricCards: PhaseQualityMetricCard[];
  tone: PhaseTone;
  confidence: "High" | "Moderate" | "Low";
  drivers: string[];
};

function isFiniteNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function getTrend(delta: number | undefined, threshold: number): Trend {
  if (!isFiniteNum(delta)) return "flat";
  if (delta > threshold) return "up";
  if (delta < -threshold) return "down";
  return "flat";
}

function getLeanCutStatus(delta?: number): "good" | "watch" | "poor" {
  if (!isFiniteNum(delta)) return "watch";
  if (delta >= -0.5) return "good";
  if (delta >= -1.5) return "watch";
  return "poor";
}

function getLeanBulkStatus(delta?: number): "positive" | "flat" | "negative" {
  if (!isFiniteNum(delta)) return "flat";
  if (delta > 0.5) return "positive";
  if (delta < -0.5) return "negative";
  return "flat";
}

function getStrengthStatus(
  delta: number | undefined,
  mode: PhaseMode
): "stable" | "drop" | "significant_drop" | "improving" {
  if (!isFiniteNum(delta)) return "stable";

  if (mode === "cut" || mode === "maintain") {
    if (delta > 0.03) return "improving";
    if (delta >= -0.03) return "stable";
    if (delta >= -0.08) return "drop";
    return "significant_drop";
  }

  if (delta > 8) return "improving";
  if (delta >= -5) return "stable";
  if (delta >= -15) return "drop";
  return "significant_drop";
}

function getBFStatus(delta?: number): "improving" | "flat" | "worsening" {
  if (!isFiniteNum(delta)) return "flat";
  if (delta < -0.3) return "improving";
  if (delta > 0.3) return "worsening";
  return "flat";
}

function getCutQuadrant(weightTrend: Trend, waistTrend: Trend) {
  if (weightTrend === "down" && waistTrend === "down") return "ideal";
  if (weightTrend === "down" && waistTrend !== "down") return "fast_loss";
  if (weightTrend !== "down" && waistTrend === "down") return "recomp";
  return "poor";
}

function getCutQuadrantLabel(quadrant: string) {
  if (quadrant === "ideal") return "IDEAL CUT";
  if (quadrant === "fast_loss") return "AGGRESSIVE / POSSIBLE";
  if (quadrant === "recomp") return "RECOMP / NOISY DATA";
  return "POOR CUT QUALITY";
}

function getCutQuadrantNote(quadrant: string, sampleCount?: number) {
  const sampleText = isFiniteNum(sampleCount)
    ? `over last ${sampleCount} entries`
    : "over recent entries";

  if (quadrant === "ideal") return `Weight down / Waist down ${sampleText}`;
  if (quadrant === "fast_loss") return `Weight down / Waist flat or up ${sampleText}`;
  if (quadrant === "recomp") return `Weight flat or up / Waist down ${sampleText}`;
  return `Weight flat or up / Waist flat or up ${sampleText}`;
}

function getCutFinalStatus(args: {
  quadrant: string;
  lean: "good" | "watch" | "poor";
  strength: "stable" | "drop" | "significant_drop" | "improving";
  bf: "improving" | "flat" | "worsening";
  hydrationDistortionLikely?: boolean;
}) {
  const { quadrant, lean, strength, bf, hydrationDistortionLikely } = args;

  if (quadrant === "ideal") {
    if (lean === "good" && (strength === "stable" || strength === "improving") && bf === "improving") {
      return "High-Quality Cut";
    }
    if (lean === "watch" && (strength === "drop" || strength === "stable") && bf === "improving") {
      return "Acceptable Cut";
    }
    if (lean === "poor" || strength === "significant_drop") {
      if (
        hydrationDistortionLikely &&
        lean === "poor" &&
        bf === "worsening" &&
        (strength === "stable" || strength === "improving")
      ) {
        return "Acceptable Cut";
      }
      return "Aggressive Cut / Muscle-Risk Cut";
    }
    return "Acceptable Cut";
  }

  if (quadrant === "fast_loss") return "Aggressive Cut / Muscle-Risk Cut";
  if (quadrant === "recomp") return "Recomp-Style Cut";
  return "Mixed / Noisy Cut";
}

function getBulkQuadrant(weightTrend: Trend, waistTrend: Trend) {
  if (weightTrend === "up" && waistTrend === "flat") return "quality";
  if (weightTrend === "up" && waistTrend === "up") return "aggressive";
  if (weightTrend !== "up" && waistTrend !== "up") return "undershooting";
  return "mixed";
}

function getBulkQuadrantLabel(quadrant: string) {
  if (quadrant === "quality") return "QUALITY BULK";
  if (quadrant === "aggressive") return "AGGRESSIVE SURPLUS";
  if (quadrant === "undershooting") return "UNDERSHOOTING BULK";
  return "MIXED / RECOMP-LIKE";
}

function getBulkQuadrantNote(quadrant: string, sampleCount?: number) {
  const sampleText = isFiniteNum(sampleCount)
    ? `over last ${sampleCount} entries`
    : "over recent entries";

  if (quadrant === "quality") return `Weight up / Waist flat ${sampleText}`;
  if (quadrant === "aggressive") return `Weight up / Waist up ${sampleText}`;
  if (quadrant === "undershooting") return `Weight flat or down / Waist flat or down ${sampleText}`;
  return `Mixed weight / waist behavior ${sampleText}`;
}

function getBulkFinalStatus(args: {
  quadrant: string;
  lean: "positive" | "flat" | "negative";
  bf: "improving" | "flat" | "worsening";
  strength: "stable" | "drop" | "significant_drop" | "improving";
}) {
  const { quadrant, lean, bf, strength } = args;

  if (quadrant === "quality") {
    if (lean === "positive" && bf !== "worsening" && (strength === "stable" || strength === "improving")) {
      return "Lean Gain Phase (High Quality)";
    }
    return "Moderate Bulk";
  }

  if (quadrant === "aggressive") {
    if (bf === "worsening") return "Aggressive Surplus (Fat Gain)";
    return "High Surplus";
  }

  if (quadrant === "undershooting") return "Undershooting Bulk";
  return "Mixed Bulk Signal";
}

function getMaintainStatus(args: {
  weightTrend: Trend;
  waistTrend: Trend;
  leanDelta?: number;
  strength: "stable" | "drop" | "significant_drop" | "improving";
}) {
  const { weightTrend, waistTrend, leanDelta, strength } = args;

  if (
    weightTrend === "flat" &&
    waistTrend === "flat" &&
    (!isFiniteNum(leanDelta) || leanDelta >= -0.5) &&
    (strength === "stable" || strength === "improving")
  ) {
    return {
      label: "Stable Maintenance",
      note: "Weight and waist are holding in a tight range.",
    };
  }

  if ((weightTrend === "flat" || weightTrend === "up") && waistTrend === "down") {
    return {
      label: "Recomp Signal",
      note: "Waist is improving without clear bodyweight loss.",
    };
  }

  if (weightTrend === "up" && waistTrend === "up") {
    return {
      label: "Maintenance Drift Up",
      note: "Weight and waist are both drifting upward.",
    };
  }

  if (weightTrend === "down" && waistTrend === "down" && strength === "significant_drop") {
    return {
      label: "Possible Under-Recovery",
      note: "Bodyweight is dropping while strength is falling sharply.",
    };
  }

  return {
    label: "Mixed Maintenance Signal",
    note: "Recent maintenance signals are mixed. Watch the next few entries.",
  };
}

function quadrantTone(mode: PhaseMode, quadrant: string): PhaseTone {
  if (mode === "cut") {
    if (quadrant === "ideal") return "good";
    if (quadrant === "recomp" || quadrant === "fast_loss") return "watch";
    return "bad";
  }

  if (mode === "bulk") {
    if (quadrant === "quality") return "good";
    if (quadrant === "mixed" || quadrant === "undershooting") return "watch";
    return "bad";
  }

  return "good";
}

function buildConfidence(inputs: PhaseQualityInputs): "High" | "Moderate" | "Low" {
  let score = 0;
  if ((inputs.sampleCount ?? 0) >= 3) score += 1;
  if (isFiniteNum(inputs.correctedLeanDelta) && isFiniteNum(inputs.correctedBodyFatDelta)) score += 1;
  if (isFiniteNum(inputs.strengthDelta)) score += 1;

  if (inputs.hydrationDistortionLikely) {
    score = Math.max(0, score - 1);
  }

  if (score >= 3) return "High";
  if (score === 2) return "Moderate";
  return "Low";
}

function buildDrivers(
  metricCards: PhaseQualityMetricCard[],
  quadrantNote: string,
  finalStatus: string,
  hydrationDistortionLikely?: boolean
) {
  const drivers = [quadrantNote];
  for (const card of metricCards) {
    drivers.push(`${card.label}: ${card.value}`);
  }
  if (hydrationDistortionLikely) {
    drivers.push("Hydration context may be distorting impedance-derived lean mass and body-fat changes.");
  }
  drivers.push(`Status: ${finalStatus}`);
  return drivers;
}

export function evaluatePhaseQuality(mode: PhaseMode, inputs: PhaseQualityInputs): PhaseQualityResult {
  const {
    weightDelta,
    waistDelta,
    correctedLeanDelta,
    correctedBodyFatDelta,
    strengthDelta,
    sampleCount = 10,
    hydrationDistortionLikely,
  } = inputs;
  const weightTrend = getTrend(weightDelta, 0.5);
  const waistTrend = getTrend(waistDelta, 0.25);
  const cutLean = getLeanCutStatus(correctedLeanDelta);
  const bulkLean = getLeanBulkStatus(correctedLeanDelta);
  const strength = getStrengthStatus(strengthDelta, mode);
  const bf = getBFStatus(correctedBodyFatDelta);

  if (mode === "cut") {
    const quadrant = getCutQuadrant(weightTrend, waistTrend);
    const quadrantLabel = getCutQuadrantLabel(quadrant);
    const quadrantNote = getCutQuadrantNote(quadrant, sampleCount);
    const finalStatus = getCutFinalStatus({
      quadrant,
      lean: cutLean,
      strength,
      bf,
      hydrationDistortionLikely,
    });
    const metricCards: PhaseQualityMetricCard[] = [
      {
        label: "Lean Preservation",
        value: cutLean === "good" ? "Good" : cutLean === "watch" ? "Watch" : "Poor",
        tone: cutLean === "good" ? "good" : cutLean === "watch" ? "watch" : "bad",
      },
      {
        label: "Strength Preservation",
        value:
          strength === "stable"
            ? "Stable"
            : strength === "improving"
              ? "Improving"
              : strength === "drop"
                ? "Slight Drop"
                : "Significant Drop",
        tone:
          strength === "stable" || strength === "improving"
            ? "good"
            : strength === "drop"
              ? "watch"
              : "bad",
      },
      {
        label: "BF Trend",
        value: bf === "improving" ? "Improving" : bf === "flat" ? "Flat" : "Worsening",
        tone: bf === "improving" ? "good" : bf === "flat" ? "watch" : "bad",
      },
    ];

    return {
      title: "CUT QUALITY",
      quadrant,
      quadrantLabel,
      quadrantNote,
      finalStatus,
      cells: [
        { key: "ideal", title: "IDEAL CUT", subtitle: "fat loss signal", tone: "good" },
        { key: "fast_loss", title: "AGGRESSIVE / POSSIBLE", subtitle: "water loss / muscle loss", tone: "watch" },
        { key: "recomp", title: "RECOMP / NOISY DATA", subtitle: "or temporary mismatch", tone: "watch" },
        { key: "poor", title: "POOR CUT QUALITY", subtitle: "likely off-plan", tone: "bad" },
      ],
      metricCards,
      tone: quadrantTone(mode, quadrant),
      confidence: buildConfidence(inputs),
      drivers: buildDrivers(metricCards, quadrantNote, finalStatus, hydrationDistortionLikely),
    };
  }

  if (mode === "bulk") {
    const quadrant = getBulkQuadrant(weightTrend, waistTrend);
    const quadrantLabel = getBulkQuadrantLabel(quadrant);
    const quadrantNote = getBulkQuadrantNote(quadrant, sampleCount);
    const finalStatus = getBulkFinalStatus({ quadrant, lean: bulkLean, bf, strength });
    const metricCards: PhaseQualityMetricCard[] = [
      {
        label: "Lean Gain",
        value: bulkLean === "positive" ? "Positive" : bulkLean === "flat" ? "Flat" : "Negative",
        tone: bulkLean === "positive" ? "good" : bulkLean === "flat" ? "watch" : "bad",
      },
      {
        label: "BF Trend",
        value: bf === "improving" ? "Controlled" : bf === "flat" ? "Stable" : "Worsening",
        tone: bf === "improving" || bf === "flat" ? "good" : "bad",
      },
      {
        label: "Strength Signal",
        value:
          strength === "stable"
            ? "Stable"
            : strength === "improving"
              ? "Improving"
              : strength === "drop"
                ? "Slight Drop"
                : "Significant Drop",
        tone:
          strength === "stable" || strength === "improving"
            ? "good"
            : strength === "drop"
              ? "watch"
              : "bad",
      },
    ];

    return {
      title: "BULK QUALITY",
      quadrant,
      quadrantLabel,
      quadrantNote,
      finalStatus,
      cells: [
        { key: "quality", title: "QUALITY BULK", subtitle: "controlled gain", tone: "good" },
        { key: "aggressive", title: "AGGRESSIVE SURPLUS", subtitle: "fat gain risk", tone: "bad" },
        { key: "undershooting", title: "UNDERSHOOTING BULK", subtitle: "not enough gain", tone: "watch" },
        { key: "mixed", title: "MIXED / RECOMP-LIKE", subtitle: "unclear direction", tone: "watch" },
      ],
      metricCards,
      tone: quadrantTone(mode, quadrant),
      confidence: buildConfidence(inputs),
      drivers: buildDrivers(metricCards, quadrantNote, finalStatus, hydrationDistortionLikely),
    };
  }

  const maintain = getMaintainStatus({ weightTrend, waistTrend, leanDelta: correctedLeanDelta, strength });
  const metricCards: PhaseQualityMetricCard[] = [
    {
      label: "Weight Trend",
      value: weightTrend === "flat" ? "Stable" : weightTrend === "down" ? "Down" : "Up",
      tone: weightTrend === "flat" ? "good" : "watch",
    },
    {
      label: "Waist Trend",
      value: waistTrend === "flat" ? "Stable" : waistTrend === "down" ? "Down" : "Up",
      tone: waistTrend === "flat" || waistTrend === "down" ? "good" : "watch",
    },
    {
      label: "Strength Signal",
      value:
        strength === "stable"
          ? "Stable"
          : strength === "improving"
            ? "Improving"
            : strength === "drop"
              ? "Slight Drop"
              : "Significant Drop",
      tone:
        strength === "stable" || strength === "improving"
          ? "good"
          : strength === "drop"
            ? "watch"
            : "bad",
    },
  ];

  return {
    title: "MAINTENANCE QUALITY",
    quadrant: "maintain",
    quadrantLabel: maintain.label,
    quadrantNote: maintain.note,
    finalStatus: maintain.label,
    cells: [],
    metricCards,
    tone: "good",
    confidence: buildConfidence(inputs),
    drivers: buildDrivers(metricCards, maintain.note, maintain.label, hydrationDistortionLikely),
  };
}

export function computeStrengthDeltaFromStrengthTrend(
  trend: StrengthTrendRow[],
  mode: PhaseMode
): PhaseQualityStrengthResult {
  const sorted = (trend ?? [])
    .slice()
    .filter((row) =>
      mode === "bulk" ? Number.isFinite(row.absoluteIndex) : Number.isFinite(row.normalizedIndex)
    )
    .sort((a, b) => a.weekEndMs - b.weekEndMs);

  const recent = sorted.slice(-4);

  if (recent.length < 2) {
    return {
      strengthDelta: undefined,
      strengthLabel:
        mode === "bulk"
          ? "Absolute strength trend needs more weekly data"
          : "Strength Signal trend needs more weekly data",
    };
  }

  const first = recent[0];
  const last = recent[recent.length - 1];
  const firstValue = mode === "bulk" ? first.absoluteIndex : first.normalizedIndex;
  const lastValue = mode === "bulk" ? last.absoluteIndex : last.normalizedIndex;

  if (!Number.isFinite(firstValue) || !Number.isFinite(lastValue)) {
    return {
      strengthDelta: undefined,
      strengthLabel:
        mode === "bulk"
          ? "Absolute strength trend unavailable"
          : "Strength Signal trend unavailable",
    };
  }

  return {
    strengthDelta: lastValue - firstValue,
    strengthLabel:
      mode === "bulk"
        ? `Using Absolute Strength trend • last ${recent.length} weekly points`
        : `Using Strength Signal trend • last ${recent.length} weekly points`,
  };
}

export function buildPhaseQualityInputsFromBodyRows(
  rows: BodyMetricEntry[],
  strengthDelta?: number,
  sampleWindow = 10,
  hydrationDistortionLikely?: boolean
): PhaseQualityInputs {
  const window = (rows ?? [])
    .slice()
    .sort((a, b) => pickTime(a as any) - pickTime(b as any))
    .slice(-sampleWindow);

  if (window.length < 3) {
    return {
      strengthDelta,
      sampleCount: window.length,
      hydrationDistortionLikely,
    };
  }

  const first = window[0];
  const last = window[window.length - 1];

  return {
    weightDelta: (pickWeightLb(last as any) ?? 0) - (pickWeightLb(first as any) ?? 0),
    waistDelta: (pickWaistIn(last as any) ?? 0) - (pickWaistIn(first as any) ?? 0),
    correctedLeanDelta:
      (getCorrectedLeanMassLb(last as any) ?? 0) - (getCorrectedLeanMassLb(first as any) ?? 0),
    correctedBodyFatDelta:
      (getCorrectedBodyFatPct(last as any) ?? 0) - (getCorrectedBodyFatPct(first as any) ?? 0),
    strengthDelta,
    sampleCount: window.length,
    hydrationDistortionLikely,
  };
}
