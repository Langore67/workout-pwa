import { db, type BodyMetricEntry, type Session, type SetEntry, type Track } from "../../db";
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
import {
  buildSessionCoachingSignals,
  type SessionSnapshotTrackSummary,
} from "../../domain/coaching/sessionSnapshot";
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

function uniqueCompact(values: Array<string | null | undefined>, limit = 4): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const value = String(raw ?? "").replace(/\s+/g, " ").trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= limit) break;
  }
  return out;
}

type ScoredSignalInput = {
  text: string;
  sessionIndex: number;
};

function normalizeSignalKey(value: string) {
  return value
    .toLowerCase()
    .replace(/\b(lat pulldown|3-point db row|bradford press|farmer'?s carry|lateral raise|bench press|incline press)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function canonicalizeSignal(value: string) {
  const text = value.toLowerCase();
  if (/medial delt|lateral delt/.test(text)) return "shoulder-delt-isolation";
  if (/behind-the-neck|overhead pressing range|shoulder twinge|vertical pressing/.test(text)) {
    return "shoulder-overhead-safety";
  }
  if (/trap compensation|trap involvement/.test(text)) return "carry-trap-compensation";
  if (/lat-driven pulling|lat stimulus|lat dominance/.test(text)) return "pull-lat-pattern";
  if (/terminal reps|terminal-rep quality/.test(text)) return "terminal-rep-fatigue";
  if (/joint feedback/.test(text)) return "joint-feedback";
  if (/form breakdown|adding load/.test(text)) return "form-before-load";
  if (/stopped due to/.test(text)) return "stopped-movement";
  if (/improved stretch and contraction/.test(text)) return "improved-stretch-contraction";
  if (/breakthrough/.test(text)) return "breakthrough-pattern";
  return normalizeSignalKey(value) || text;
}

function signalBaseScore(value: string) {
  const text = value.toLowerCase();
  let score = 0;

  if (/pain|twinge|stopped due to|avoid /.test(text)) score += 12;
  if (/compensation|takeover|trap involvement|joint feedback/.test(text)) score += 10;
  if (/breakthrough|lat dominance|strong lat stimulus|safe overhead pressing range/.test(text)) score += 8;
  if (/improved stretch and contraction|medial delt isolation|lateral delt isolation/.test(text)) score += 7;
  if (/terminal reps|fatigue/.test(text)) score += 6;
  if (/movement quality looked solid|readiness looked|exercises produced completed work/.test(text)) score -= 6;
  if (value.includes(":")) score += 3;

  return score;
}

function rankRecentSignals(
  values: ScoredSignalInput[],
  options?: {
    limit?: number;
    dropPatterns?: RegExp[];
  }
) {
  const limit = options?.limit ?? 4;
  const dropPatterns = options?.dropPatterns ?? [];
  const filtered = values
    .filter(({ text }) => {
      const trimmed = String(text ?? "").trim();
      if (!trimmed) return false;
      return !dropPatterns.some((pattern) => pattern.test(trimmed));
    });

  const byCanonical = new Map<
    string,
    {
      bestText: string;
      bestSpecificity: number;
      score: number;
      seenSessionIndexes: Set<number>;
    }
  >();

  for (const item of filtered) {
    const canonical = canonicalizeSignal(item.text);
    const recencyWeight = Math.max(1, 4 - item.sessionIndex);
    const specificity = item.text.includes(":") ? 2 : 1;
    const score = signalBaseScore(item.text) + recencyWeight;
    const current =
      byCanonical.get(canonical) ??
      {
        bestText: item.text,
        bestSpecificity: specificity,
        score: 0,
        seenSessionIndexes: new Set<number>(),
      };

    current.score += score;
    current.seenSessionIndexes.add(item.sessionIndex);

    if (
      specificity > current.bestSpecificity ||
      (specificity === current.bestSpecificity &&
        signalBaseScore(item.text) > signalBaseScore(current.bestText))
    ) {
      current.bestText = item.text;
      current.bestSpecificity = specificity;
    }

    byCanonical.set(canonical, current);
  }

  return Array.from(byCanonical.values())
    .map((entry) => ({
      text: entry.bestText,
      score: entry.score + Math.max(0, entry.seenSessionIndexes.size - 1) * 4,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.text);
}

function sortRecentSessions(sessions: Session[]) {
  return (sessions ?? [])
    .filter((session) => !session.deletedAt && Number.isFinite(session.endedAt ?? session.startedAt))
    .slice()
    .sort(
      (a, b) =>
        Number(b.endedAt ?? b.startedAt ?? 0) - Number(a.endedAt ?? a.startedAt ?? 0)
    );
}

function buildSessionTrackSummariesForExport(args: {
  session: Session;
  sets: SetEntry[];
  tracksById: Map<string, Track>;
}): SessionSnapshotTrackSummary[] {
  const { session, sets, tracksById } = args;
  const byTrackId = new Map<string, SetEntry[]>();

  for (const set of sets) {
    if (set.deletedAt) continue;
    if (set.sessionId !== session.id) continue;
    const bucket = byTrackId.get(set.trackId) ?? [];
    bucket.push(set);
    byTrackId.set(set.trackId, bucket);
  }

  return Array.from(byTrackId.entries())
    .map(([trackId, trackSets]) => {
      const track = tracksById.get(trackId);
      if (!track) return null;
      const completedCount = trackSets.filter((set) => !!set.completedAt && !set.deletedAt).length;
      return {
        displayName: track.displayName,
        trackType: track.trackType,
        trackingMode: track.trackingMode,
        completedSets: completedCount ? [`${completedCount} completed set${completedCount === 1 ? "" : "s"}`] : [],
      } satisfies SessionSnapshotTrackSummary;
    })
    .filter((value): value is SessionSnapshotTrackSummary => value != null);
}

function buildTrainingSignalsFromRecentSessions(args: {
  sessions: Session[];
  sets: SetEntry[];
  tracks: Track[];
}) {
  const tracksById = new Map((args.tracks ?? []).map((track) => [track.id, track]));
  const recentSessions = sortRecentSessions(args.sessions).slice(0, 4);
  const aggregated = {
    movementQuality: [] as string[],
    stimulusCoverage: [] as string[],
    fatigueReadiness: [] as string[],
    nextWorkoutFocus: [] as string[],
    discussWithGaz: [] as string[],
  };

  for (const [sessionIndex, session] of recentSessions.entries()) {
    const trackSummaries = buildSessionTrackSummariesForExport({
      session,
      sets: args.sets,
      tracksById,
    });
    const completedExercises = trackSummaries.filter((summary) => summary.completedSets.length > 0).length;
    const totalExercises = trackSummaries.length;
    if (!session.notes?.trim() && completedExercises === 0) continue;

    const signals = buildSessionCoachingSignals({
      sessionNotes: session.notes,
      totalExercises,
      completedExercises,
      currentTrack: trackSummaries[0]
        ? {
            displayName: trackSummaries[0].displayName,
            trackType: trackSummaries[0].trackType,
            trackingMode: trackSummaries[0].trackingMode,
          }
        : null,
      currentRecommendation: null,
      trackSummaries,
    });

    aggregated.movementQuality.push(
      ...signals.movementQualitySignals.map((bullet) => `${sessionIndex}::${bullet}`)
    );
    aggregated.stimulusCoverage.push(
      ...signals.stimulusCoverage.map((bullet) => `${sessionIndex}::${bullet}`)
    );
    aggregated.fatigueReadiness.push(
      ...signals.fatigueReadiness.map((bullet) => `${sessionIndex}::${bullet}`)
    );
    aggregated.nextWorkoutFocus.push(
      ...signals.nextWorkoutFocus.map((bullet) => `${sessionIndex}::${bullet}`),
      ...signals.carryForward.map((bullet) => `${sessionIndex}::${bullet}`)
    );
    aggregated.discussWithGaz.push(
      ...signals.discussWithCoach.map((bullet) => `${sessionIndex}::${bullet}`)
    );
  }

  const unpack = (values: string[]) =>
    values.map((value) => {
      const splitIndex = value.indexOf("::");
      return {
        sessionIndex: splitIndex >= 0 ? Number(value.slice(0, splitIndex)) : 0,
        text: splitIndex >= 0 ? value.slice(splitIndex + 2) : value,
      };
    });

  return {
    movementQuality: rankRecentSignals(
      unpack(aggregated.movementQuality),
      {
        limit: 4,
        dropPatterns: [/^Movement quality looked solid$/i],
      }
    ),
    stimulusCoverage: rankRecentSignals(
      unpack(aggregated.stimulusCoverage),
      {
        limit: 4,
        dropPatterns: [/^\d+\/\d+ exercises produced completed work$/i],
      }
    ),
    fatigueReadiness: rankRecentSignals(
      unpack(aggregated.fatigueReadiness),
      {
        limit: 4,
        dropPatterns: [/^Readiness looked /i, /^Fatigue showed up$/i],
      }
    ),
    nextWorkoutFocus: rankRecentSignals(
      unpack(aggregated.nextWorkoutFocus),
      { limit: 4 }
    ),
    discussWithGaz: rankRecentSignals(
      unpack(aggregated.discussWithGaz),
      { limit: 4 }
    ),
  };
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
  const [sessions, sets, tracks] = await Promise.all([
    db.sessions.toArray(),
    db.sets.toArray(),
    db.tracks.toArray(),
  ]);
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
  const trainingSignals = buildTrainingSignalsFromRecentSessions({
    sessions: sessions ?? [],
    sets: sets ?? [],
    tracks: tracks ?? [],
  });
  
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
        trainingSignals,
        readinessNotes,
        dataNotes: [],
        exportConfidence,
  };

  metrics.dataNotes = buildDataNotes(metrics);
  return metrics;
}
