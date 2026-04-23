import { db, type BodyMetricEntry } from "../../db";
import {
  computeStrengthIndexAt,
  computeStrengthTrend,
  type StrengthPattern,
} from "../../strength/Strength";
import { computeStrengthSignalV2 } from "../../strength/v2/computeStrengthSignalV2";
import {
  getBodyFatPctRaw,
  getLeanMassLb,
  getWeightLb,
  getWaistIn,
} from "../../body/bodyCalculations";
import { computeHydrationConfidenceFromBodyRows } from "../../body/hydrationConfidence";
import { pickTime } from "../../body/bodySignalModel";
import { computeSignalConfidence } from "../../body/signalConfidence";
import {
  buildPhaseQualityInputsFromBodyRows,
  computeStrengthDeltaFromStrengthTrend,
  evaluatePhaseQuality,
} from "../../body/phaseQualityModel";
import type {
  CoachExportAnchorLift,
  CoachExportMetric,
  CoachExportMetrics,
} from "./types";
import { getCurrentPhase } from "../../config/appConfig";

const DAY_MS = 24 * 60 * 60 * 1000;

function cleanNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sortedBodyRows(rows: BodyMetricEntry[]): BodyMetricEntry[] {
  return (rows ?? [])
    .slice()
    .sort((a, b) => pickTime(b as any) - pickTime(a as any));
}

function findLatestValue(
  rows: BodyMetricEntry[],
  getter: (row: BodyMetricEntry) => number | undefined
): { value: number | null; at: number | null } {
  for (const row of rows) {
    const value = getter(row);
    const at = pickTime(row as any);
    if (value != null && Number.isFinite(value) && Number.isFinite(at) && at > 0) {
      return { value, at };
    }
  }
  return { value: null, at: null };
}

function findBaselineValue(
  rows: BodyMetricEntry[],
  getter: (row: BodyMetricEntry) => number | undefined,
  latestAt: number | null,
  days: number
): number | null {
  if (!latestAt || !Number.isFinite(latestAt)) return null;
  const target = latestAt - days * DAY_MS;

  let bestAfter: { at: number; value: number } | null = null;
  let bestBefore: { at: number; value: number } | null = null;

  for (const row of rows) {
    const value = getter(row);
    const at = pickTime(row as any);
    if (value == null || !Number.isFinite(value) || !Number.isFinite(at) || at <= 0) continue;

    if (at <= target) {
      if (!bestBefore || at > bestBefore.at) bestBefore = { at, value };
      continue;
    }

    if (at < latestAt) {
      if (!bestAfter || at < bestAfter.at) bestAfter = { at, value };
    }
  }

  return bestBefore?.value ?? bestAfter?.value ?? null;
}

function buildMetric(
  rows: BodyMetricEntry[],
  getter: (row: BodyMetricEntry) => number | undefined
): CoachExportMetric {
  const latest = findLatestValue(rows, getter);
  const baseline14d = findBaselineValue(rows, getter, latest.at, 14);

  return {
    latest: latest.value,
    baseline14d,
    delta14d:
      latest.value != null && baseline14d != null ? latest.value - baseline14d : null,
  };
}

function buildHydration(rows: BodyMetricEntry[]) {
  const hydration = computeHydrationConfidenceFromBodyRows(rows);
  const latest = rows[0];
  if (!latest || !hydration) {
    return {
      latestWaterPct: null,
      confidenceLabel: "Unknown",
      confidenceScore: null,
      note: "Insufficient Data",
    };
  }

  return {
    latestWaterPct: cleanNumber(latest.bodyWaterPct),
    confidenceLabel: hydration.label || "Unknown",
    confidenceScore: cleanNumber(hydration.score),
    note: hydration.interpretation || hydration.detail || "Unknown",
    distortionLikely: !!(
      hydration.likelyHydrationDistortion || hydration.hydrationBaselineLow
    ),
  };
}

async function buildStrengthSignal(now: number) {
  const [current, prior14d, weeklyTrend] = await Promise.all([
    computeStrengthIndexAt(now, 28),
    computeStrengthIndexAt(now - 14 * DAY_MS, 28),
    computeStrengthTrend(13, 28),
  ]);

  const currentValue = cleanNumber(current.normalizedIndex);
  const priorValue = cleanNumber(prior14d.normalizedIndex);

  const best90d = (weeklyTrend ?? [])
    .filter((row) => now - row.weekEndMs <= 90 * DAY_MS)
    .map((row) => cleanNumber(row.normalizedIndex))
    .filter((value): value is number => value != null)
    .reduce<number | null>((best, value) => (best == null || value > best ? value : best), null);

  return {
    current: currentValue,
    delta14d:
      currentValue != null && priorValue != null ? currentValue - priorValue : null,
    vs90dBestPct:
      currentValue != null && best90d != null && best90d > 0
        ? ((currentValue - best90d) / best90d) * 100
        : null,
    currentBodyweight: cleanNumber(current.bodyweight),
    bodyweightDaysUsed: cleanNumber(current.bodyweightDaysUsed),
  };
}


async function buildAnchorLifts(): Promise<CoachExportAnchorLift[]> {
  const result = await computeStrengthSignalV2();

  const anchorForExport = {
    hinge: result.anchors.hinge,
    squat: result.anchors.squat,
    push: result.anchors.push ?? result.anchors.horizontalPush ?? result.anchors.verticalPush,
    pull: result.anchors.pull ?? result.anchors.verticalPull ?? result.anchors.horizontalPull,
  };

  const patterns: StrengthPattern[] = ["hinge", "push", "pull", "squat"];

  return patterns.map((pattern) => {
    const anchor = anchorForExport[pattern];

    return {
      pattern,
      exerciseName: anchor?.exerciseName ?? null,
      trackDisplayName: anchor?.exerciseName ?? null,
      effectiveWeightLb: anchor?.latestSet?.effectiveWeightLb ?? null,
      reps: anchor?.latestSet?.reps ?? null,
      e1rm: anchor?.capacity?.e1RM ?? null,
      performedAt: anchor?.latestSet?.completedAt ?? null,
    };
  });
}

function buildReadinessNotes(metrics: {
  hydrationNote: string;
  phaseQualityStatus: string | null;
  phaseQualityDrivers: string[];
}) {
  const notes: string[] = [];
  notes.push(metrics.phaseQualityStatus ? `Phase quality: ${metrics.phaseQualityStatus}.` : "Phase quality: Insufficient Data.");
  notes.push(...metrics.phaseQualityDrivers.slice(0, 3));
  notes.push(metrics.hydrationNote || "Hydration confidence: Unknown.");
  return notes;
}

function buildExportConfidence(args: {
  bodyComp: {
    weight: CoachExportMetric;
    waist: CoachExportMetric;
  };
  strengthSignal: {
    current: number | null;
    delta14d: number | null;
    vs90dBestPct: number | null;
  };
  waistEntryCount: number;
  waistTargetCount?: number;
}) {
  return computeSignalConfidence({
    waistEntryCount: args.waistEntryCount,
    waistTargetCount: args.waistTargetCount ?? 14,
    weightNow: args.bodyComp.weight.latest ?? undefined,
    weightPrev: args.bodyComp.weight.baseline14d ?? undefined,
    waistNow: args.bodyComp.waist.latest ?? undefined,
    waistPrev: args.bodyComp.waist.baseline14d ?? undefined,
    strengthNow: args.strengthSignal.current ?? undefined,
    strengthPrev:
      args.strengthSignal.current != null && args.strengthSignal.delta14d != null
        ? args.strengthSignal.current - args.strengthSignal.delta14d
        : undefined,
    strengthBest:
      args.strengthSignal.current != null && args.strengthSignal.vs90dBestPct != null
        ? args.strengthSignal.current /
          (1 + args.strengthSignal.vs90dBestPct / 100)
        : undefined,
    weightDelta: args.bodyComp.weight.delta14d ?? undefined,
    waistDelta: args.bodyComp.waist.delta14d ?? undefined,
    strengthDeltaPct:
      args.strengthSignal.current != null &&
      args.strengthSignal.delta14d != null &&
      args.strengthSignal.current - args.strengthSignal.delta14d > 0
        ? (args.strengthSignal.delta14d /
            (args.strengthSignal.current - args.strengthSignal.delta14d)) *
          100
        : undefined,
  });
}

function buildDataNotes(metrics: CoachExportMetrics) {
  const notes: string[] = [];

  if (metrics.bodyComp.weight.latest == null) notes.push("Missing bodyweight data.");
  if (metrics.bodyComp.waist.latest == null) notes.push("Missing waist data.");
  if (metrics.bodyComp.bodyFatPct.latest == null) notes.push("Missing body-fat data.");
  if (metrics.bodyComp.leanMass.latest == null) notes.push("Missing lean-mass data.");
  if (metrics.hydration.latestWaterPct == null) notes.push("Missing hydration/body-water data.");
  if (metrics.strengthSignal.current == null) notes.push("Missing strength signal data.");
  if (!metrics.anchorLifts.some((lift) => lift.e1rm != null)) notes.push("Missing anchor-lift data.");

  return notes.length ? notes : ["No major data gaps detected."];
}

export async function buildCoachExportMetrics(): Promise<CoachExportMetrics> {
  const generatedAt = Date.now();
  const currentPhase = await getCurrentPhase();
  const bodyRows = sortedBodyRows(((await db.bodyMetrics.toArray()) ?? []) as BodyMetricEntry[]);

  const bodyComp = {
    weight: buildMetric(bodyRows, getWeightLb),
    waist: buildMetric(bodyRows, getWaistIn),
    bodyFatPct: buildMetric(bodyRows, getBodyFatPctRaw),
    leanMass: buildMetric(bodyRows, getLeanMassLb),
    bodyweightDelta7d: (() => {
      const latest = findLatestValue(bodyRows, getWeightLb);
      const baseline7d = findBaselineValue(bodyRows, getWeightLb, latest.at, 7);
      return latest.value != null && baseline7d != null ? latest.value - baseline7d : null;
    })(),
    bodyweightDelta14d: (() => {
      const latest = findLatestValue(bodyRows, getWeightLb);
      const baseline14d = findBaselineValue(bodyRows, getWeightLb, latest.at, 14);
      return latest.value != null && baseline14d != null ? latest.value - baseline14d : null;
    })(),
  };

  const hydration = buildHydration(bodyRows);
  const strengthSignal = await buildStrengthSignal(generatedAt);
  const sharedStrengthTrend = await computeStrengthTrend(12, 28);
  const computedStrength = computeStrengthDeltaFromStrengthTrend(sharedStrengthTrend, currentPhase);
  const phaseQualityInputs = buildPhaseQualityInputsFromBodyRows(
    bodyRows,
    computedStrength.strengthDelta,
    10,
    hydration.distortionLikely
  );
  const phaseQuality =
    (phaseQualityInputs.sampleCount ?? 0) > 0 ? evaluatePhaseQuality(currentPhase, phaseQualityInputs) : null;
  const anchorLifts = await buildAnchorLifts();
  
   const waistEntryCount = bodyRows.filter((row) => Number.isFinite(getWaistIn(row))).length;
  const exportConfidence = buildExportConfidence({
    bodyComp: {
      weight: bodyComp.weight,
      waist: bodyComp.waist,
    },
    strengthSignal: {
      current: strengthSignal.current,
      delta14d: strengthSignal.delta14d,
      vs90dBestPct: strengthSignal.vs90dBestPct,
    },
    waistEntryCount,
    waistTargetCount: 14,
  }); 
  

  const readinessNotes = buildReadinessNotes({
    phaseQualityStatus: phaseQuality?.finalStatus ?? null,
    phaseQualityDrivers: phaseQuality?.drivers ?? [],
    hydrationNote: hydration.note,
  });

      const metrics: CoachExportMetrics = {
        generatedAt,
        currentPhase,
        bodyComp,
        hydration,
        strengthSignal,
        phaseQuality,
        anchorLifts,
        readinessNotes,
        dataNotes: [],
        exportConfidence,
  };

  metrics.dataNotes = buildDataNotes(metrics);
  return metrics;
}
