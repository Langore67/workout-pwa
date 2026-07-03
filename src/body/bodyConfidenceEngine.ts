export type BodyConfidenceLevel = "high" | "moderate" | "low";

export type BodyMetricConfidenceLike = {
  latest?: number | null;
  baseline14d?: number | null;
  delta14d?: number | null;
};

export type BodyHydrationConfidenceLike = {
  latestWaterPct?: number | null;
  confidenceLabel: string;
  confidenceScore?: number | null;
  note?: string;
  distortionLikely?: boolean;
};

export type BodyConfidenceInput = {
  bodyComp: {
    weight: BodyMetricConfidenceLike;
    waist: BodyMetricConfidenceLike;
    bodyFatPct: BodyMetricConfidenceLike;
    leanMass: BodyMetricConfidenceLike;
    visceralFat?: BodyMetricConfidenceLike;
    bodyweightDelta7d?: number | null;
    bodyweightDelta14d?: number | null;
  };
  hydration: BodyHydrationConfidenceLike;
};

export type BodyConfidence = {
  overall: BodyConfidenceLevel;
  weight: BodyConfidenceLevel;
  waist: BodyConfidenceLevel;
  leanMass: BodyConfidenceLevel;
  bodyFat: BodyConfidenceLevel;
  visceralFat: BodyConfidenceLevel;
  hydration: BodyConfidenceLevel;
  supportingEvidence: string[];
  cautionFlags: string[];
};

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function levelFromScore(score: number): BodyConfidenceLevel {
  if (score >= 80) return "high";
  if (score >= 50) return "moderate";
  return "low";
}

function hydrationLevelFromInput(input: BodyHydrationConfidenceLike): { level: BodyConfidenceLevel; score: number } {
  if (finite(input.confidenceScore)) {
    const score = clamp(input.confidenceScore);
    return { level: levelFromScore(score), score };
  }

  const label = String(input.confidenceLabel ?? "").trim().toLowerCase();
  if (label.includes("high")) return { level: "high", score: 88 };
  if (label.includes("moderate") || label.includes("medium")) return { level: "moderate", score: 65 };
  if (label.includes("low") || label.includes("unknown")) return { level: "low", score: 35 };
  return { level: "low", score: 35 };
}

function direction(delta: number | null | undefined, threshold: number): "down" | "flat" | "up" | "unknown" {
  if (!finite(delta)) return "unknown";
  if (delta < -threshold) return "down";
  if (delta > threshold) return "up";
  return "flat";
}

function uniquePush(target: string[], ...values: Array<string | null | undefined>) {
  const seen = new Set(target.map((value) => value.toLowerCase()));
  for (const raw of values) {
    const value = String(raw ?? "").trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    target.push(value);
  }
}

function sameTrend(a: string, b: string) {
  return a !== "unknown" && b !== "unknown" && a === b;
}

export function buildBodyConfidence(input: BodyConfidenceInput): BodyConfidence {
  const hydration = hydrationLevelFromInput(input.hydration);
  const weightTrend = direction(input.bodyComp.weight.delta14d, 0.5);
  const waistTrend = direction(input.bodyComp.waist.delta14d, 0.25);
  const bodyFatTrend = direction(input.bodyComp.bodyFatPct.delta14d, 0.3);
  const leanTrend = direction(input.bodyComp.leanMass.delta14d, 0.5);
  const visceralTrend = direction(input.bodyComp.visceralFat?.delta14d, 0);
  const weightHasLatest = finite(input.bodyComp.weight.latest);
  const waistHasLatest = finite(input.bodyComp.waist.latest);
  const leanHasLatest = finite(input.bodyComp.leanMass.latest);
  const bodyFatHasLatest = finite(input.bodyComp.bodyFatPct.latest);
  const visceralHasLatest = finite(input.bodyComp.visceralFat?.latest);
  const rapidWeightLoss =
    finite(input.bodyComp.weight.delta14d) &&
    (input.bodyComp.weight.delta14d <= -3 ||
      (finite(input.bodyComp.weight.latest) && input.bodyComp.weight.latest > 0 && input.bodyComp.weight.delta14d / input.bodyComp.weight.latest <= -0.015));
  const impedanceConflict =
    (weightTrend === "down" && waistTrend === "down" && bodyFatTrend === "up") ||
    (weightTrend === "down" && waistTrend === "down" && leanTrend === "down" && hydration.level === "low");
  const alignedBodyComp = sameTrend(weightTrend, waistTrend) && (weightTrend === "down" || weightTrend === "up");

  let weightScore = weightHasLatest ? 70 : 20;
  if (weightHasLatest && (finite(input.bodyComp.weight.delta14d) || finite(input.bodyComp.bodyweightDelta7d))) {
    weightScore += 15;
  }
  if (finite(input.bodyComp.bodyweightDelta7d) || finite(input.bodyComp.bodyweightDelta14d)) {
    weightScore += 5;
  }
  if (!weightHasLatest) weightScore = 20;

  let waistScore = waistHasLatest ? 70 : 20;
  if (waistHasLatest && finite(input.bodyComp.waist.delta14d)) waistScore += 15;
  if (waistHasLatest && !finite(input.bodyComp.waist.delta14d)) waistScore -= 10;
  if (!waistHasLatest) waistScore = 20;

  let leanScore = hydration.score;
  if (leanHasLatest && finite(input.bodyComp.leanMass.delta14d)) leanScore += 10;
  if (!leanHasLatest) leanScore = 20;
  if (hydration.level === "low") leanScore -= 25;
  if (hydration.level === "moderate") leanScore -= 5;
  if (rapidWeightLoss && leanTrend === "down") leanScore -= 15;
  if (impedanceConflict) leanScore -= 20;
  if (hydration.level === "high" && leanTrend !== "unknown" && !impedanceConflict) leanScore += 10;
  if (hydration.level === "high" && alignedBodyComp && leanTrend !== "down") leanScore += 5;

  let bodyFatScore = hydration.score - (hydration.level === "low" ? 20 : hydration.level === "moderate" ? 5 : 0);
  if (bodyFatHasLatest && finite(input.bodyComp.bodyFatPct.delta14d)) bodyFatScore += 10;
  if (!bodyFatHasLatest) bodyFatScore = 20;
  if (hydration.level === "low" && bodyFatTrend !== "unknown") bodyFatScore -= 15;
  if (rapidWeightLoss && bodyFatTrend === "up") bodyFatScore -= 20;
  if (weightTrend === "down" && waistTrend === "down" && bodyFatTrend === "down") bodyFatScore += 10;
  if (weightTrend === "down" && waistTrend === "down" && bodyFatTrend === "up") bodyFatScore -= 20;

  let visceralScore = visceralHasLatest ? 60 : 20;
  if (visceralHasLatest && finite(input.bodyComp.visceralFat?.delta14d)) visceralScore += 15;
  if (!visceralHasLatest) visceralScore = 20;
  if (visceralHasLatest && sameTrend(visceralTrend, waistTrend) && visceralTrend !== "flat") visceralScore += 10;
  if (visceralHasLatest && !finite(input.bodyComp.visceralFat?.delta14d)) visceralScore -= 10;

  weightScore = clamp(weightScore);
  waistScore = clamp(waistScore);
  leanScore = clamp(leanScore);
  bodyFatScore = clamp(bodyFatScore);
  visceralScore = clamp(visceralScore);

  const overallScore = clamp(
    (weightScore * 30 + waistScore * 30 + hydration.score * 10 + leanScore * 15 + bodyFatScore * 10 + visceralScore * 5) / 100
  );

  const overall =
    weightScore >= 80 &&
    waistScore >= 80 &&
    hydration.level !== "low" &&
    leanScore >= 50 &&
    bodyFatScore >= 50
      ? "high"
      : weightScore >= 50 || waistScore >= 50
        ? overallScore >= 50
          ? "moderate"
          : "low"
        : "low";

  const supportingEvidence: string[] = [];
  const cautionFlags: string[] = [];

  if (weightHasLatest) uniquePush(supportingEvidence, "Weight trend has recent data.");
  if (waistHasLatest) uniquePush(supportingEvidence, "Waist trend has recent data.");
  if (alignedBodyComp) uniquePush(supportingEvidence, "Weight and waist are directionally aligned.");
  if (hydration.level === "high") uniquePush(supportingEvidence, "Hydration confidence is high.");
  if (bodyFatTrend === "down" || bodyFatTrend === "flat") uniquePush(supportingEvidence, "Body composition trends are directionally stable.");
  if (visceralHasLatest) uniquePush(supportingEvidence, "Visceral fat is available as trend support only.");

  if (hydration.level === "low") uniquePush(cautionFlags, "Hydration confidence is low.");
  if (!waistHasLatest || !finite(input.bodyComp.waist.delta14d)) uniquePush(cautionFlags, "Waist data is missing or sparse.");
  if (!weightHasLatest || (!finite(input.bodyComp.weight.delta14d) && !finite(input.bodyComp.bodyweightDelta7d))) {
    uniquePush(cautionFlags, "Weight data is sparse.");
  }
  if (rapidWeightLoss) uniquePush(cautionFlags, "Rapid bodyweight loss may distort impedance-derived metrics.");
  if (hydration.level !== "high") uniquePush(cautionFlags, "Lean mass estimate is hydration-sensitive.");
  if (bodyFatHasLatest && weightTrend === "down" && waistTrend === "down" && bodyFatTrend === "up") {
    uniquePush(cautionFlags, "Body fat and weight/waist trends disagree.");
  }
  if (visceralHasLatest) uniquePush(cautionFlags, "Visceral fat is an estimate; use trend only.");
  if (impedanceConflict) uniquePush(cautionFlags, "Impedance-derived body composition signals are conflicting.");

  return {
    overall,
    weight: levelFromScore(weightScore),
    waist: levelFromScore(waistScore),
    leanMass: levelFromScore(leanScore),
    bodyFat: levelFromScore(bodyFatScore),
    visceralFat: levelFromScore(visceralScore),
    hydration: hydration.level,
    supportingEvidence,
    cautionFlags,
  };
}
