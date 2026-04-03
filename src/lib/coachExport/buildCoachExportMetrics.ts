import { db, type BodyMetricEntry } from "../../db";
import {
  bodyweightFromRowsAt,
  computeStrengthIndexAt,
  computeStrengthTrend,
  computeScoredE1RM,
  calcEffectiveStrengthWeightLb,
  classifyStrengthPatternFromExerciseName,
  type StrengthPattern,
} from "../../strength/Strength";
import {
  getBodyFatPctRaw,
  getLeanMassLb,
  getWeightLb,
  getWaistIn,
} from "../../body/bodyCalculations";
import { computeHydrationConfidenceFromBodyRows } from "../../body/hydrationConfidence";
import { pickTime } from "../../body/bodySignalModel";
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

function classifyPattern(exerciseName: string, trackDisplayName: string): StrengthPattern | undefined {
  return (
    classifyStrengthPatternFromExerciseName(exerciseName) ??
    classifyStrengthPatternFromExerciseName(trackDisplayName)
  );
}

async function buildAnchorLifts(
  bodyRows: BodyMetricEntry[]
): Promise<CoachExportAnchorLift[]> {
  const now = Date.now();
  const cutoff = now - 120 * DAY_MS;
  const sessions = await db.sessions.where("endedAt").between(cutoff, now, true, true).toArray();
  const sessionIds = sessions.map((session: any) => session.id).filter(Boolean);
  const empty: CoachExportAnchorLift[] = ["hinge", "push", "pull", "squat"].map((pattern) => ({
    pattern: pattern as StrengthPattern,
    exerciseName: null,
    trackDisplayName: null,
    effectiveWeightLb: null,
    reps: null,
    e1rm: null,
    performedAt: null,
  }));

  if (!sessionIds.length) return empty;

  const [sets, tracks] = await Promise.all([
    db.sets.where("sessionId").anyOf(sessionIds).toArray(),
    db.tracks.toArray(),
  ]);
  const trackById = new Map((tracks ?? []).map((track: any) => [track.id, track]));
  const exerciseIds = Array.from(new Set((tracks ?? []).map((track: any) => track?.exerciseId).filter(Boolean)));
  const exercises = await db.exercises.bulkGet(exerciseIds as any);
  const exerciseById = new Map((exercises ?? []).filter(Boolean).map((exercise: any) => [exercise.id, exercise]));

  const bestByPattern = new Map<StrengthPattern, CoachExportAnchorLift>();

  for (const setRow of sets as any[]) {
    if (!setRow?.completedAt || setRow?.setType !== "working") continue;
    if (typeof setRow.weight !== "number" || typeof setRow.reps !== "number") continue;

    const track = trackById.get(setRow.trackId);
    if (!track) continue;
    const exercise = exerciseById.get(track.exerciseId);
    const exerciseName = String(exercise?.name ?? "").trim();
    const trackDisplayName = String(track?.displayName ?? "").trim();
    const pattern = classifyPattern(exerciseName, trackDisplayName);
    if (!pattern) continue;
    const performedAt = cleanNumber(setRow.completedAt ?? setRow.createdAt);
    const bodyweightAtSet =
      performedAt != null ? bodyweightFromRowsAt(bodyRows, performedAt) ?? null : null;

    const effectiveWeight = calcEffectiveStrengthWeightLb(
      setRow.weight,
      exerciseName || trackDisplayName,
      bodyweightAtSet ?? 0
    );
    const e1rm = computeScoredE1RM(effectiveWeight, setRow.reps);
    if (!Number.isFinite(e1rm) || e1rm <= 0) continue;

    const current = bestByPattern.get(pattern);
    if (current?.e1rm != null && current.e1rm >= e1rm) continue;

    bestByPattern.set(pattern, {
      pattern,
      exerciseName: exerciseName || null,
      trackDisplayName: trackDisplayName || null,
      effectiveWeightLb: effectiveWeight,
      reps: setRow.reps,
      e1rm,
      performedAt,
    });
  }

  return empty.map((row) => bestByPattern.get(row.pattern) ?? row);
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
  const computedStrength = computeStrengthDeltaFromStrengthTrend(sharedStrengthTrend, "cut");
  const phaseQualityInputs = buildPhaseQualityInputsFromBodyRows(
    bodyRows,
    computedStrength.strengthDelta,
    10,
    hydration.distortionLikely
  );
  const phaseQuality =
    (phaseQualityInputs.sampleCount ?? 0) > 0 ? evaluatePhaseQuality("cut", phaseQualityInputs) : null;
  const anchorLifts = await buildAnchorLifts(bodyRows);

  const readinessNotes = buildReadinessNotes({
    phaseQualityStatus: phaseQuality?.finalStatus ?? null,
    phaseQualityDrivers: phaseQuality?.drivers ?? [],
    hydrationNote: hydration.note,
  });

  const metrics: CoachExportMetrics = {
    generatedAt,
    bodyComp,
    hydration,
    strengthSignal,
    phaseQuality,
    anchorLifts,
    readinessNotes,
    dataNotes: [],
  };

  metrics.dataNotes = buildDataNotes(metrics);
  return metrics;
}
