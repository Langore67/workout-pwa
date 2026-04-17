import { db, normalizeName, type Exercise, type SetEntry, type Track } from "../../db";
import { getCurrentPhase, getStrengthSignalConfig, type CurrentPhase } from "../../config/appConfig";
import { isSetEligibleForStrengthSignal } from "../../domain/strength/strengthSignalFilter";
import { isStrengthTrackType } from "../../domain/trackingMode";
import {
  bodyweightFromRowsAt,
  calcEffectiveStrengthWeightLb,
  computeScoredE1RM,
} from "../Strength";

const DAY_MS = 24 * 60 * 60 * 1000;

export type StrengthSignalV2Confidence = "HIGH" | "MEDIUM" | "LOW";
export type StrengthSignalV2CutMaintainPattern = "push" | "pull" | "hinge" | "squat";
export type StrengthSignalV2BulkPattern =
  | "squat"
  | "hinge"
  | "horizontalPush"
  | "verticalPush"
  | "verticalPull"
  | "horizontalPull"
  | "carry";
export type StrengthSignalV2Pattern =
  | StrengthSignalV2CutMaintainPattern
  | StrengthSignalV2BulkPattern;

export type StrengthSignalV2LatestSet = {
  setId: string | null;
  sessionId: string | null;
  trackId: string | null;
  weight: number | null;
  reps: number | null;
  effectiveWeightLb: number | null;
  completedAt: number | null;
  distance: number | null;
  distanceUnit: string | null;
};

export type StrengthSignalV2AnchorResult = {
  exerciseId: string | null;
  exerciseName: string | null;
  latestSet: StrengthSignalV2LatestSet | null;
  e1RM: number | null;
  lastPerformedAt: number | null;
  dataPoints: number;
  confidence: StrengthSignalV2Confidence;
};

export type StrengthSignalV2Result = {
  phase: CurrentPhase;
  anchors: Partial<Record<StrengthSignalV2Pattern, StrengthSignalV2AnchorResult>>;
  aggregate: {
    averageE1RM: number | null;
    trendDelta14d: number | null;
    confidence: StrengthSignalV2Confidence;
  };
};

type ComputeStrengthSignalV2Options = {
  now?: number;
};

type AnchorDefinition = {
  pattern: StrengthSignalV2Pattern;
  configuredExerciseIds: string[];
  configuredNames: string[];
  fallbackNames: string[];
};

type CandidateSet = {
  set: SetEntry;
  track: Track;
  exercise: Exercise;
  at: number;
  effectiveWeightLb: number;
  e1RM: number;
  matchRank: number;
};

const CUT_MAINTAIN_PATTERNS: StrengthSignalV2CutMaintainPattern[] = ["push", "pull", "hinge", "squat"];
const BULK_PATTERNS: StrengthSignalV2BulkPattern[] = [
  "squat",
  "hinge",
  "horizontalPush",
  "verticalPush",
  "verticalPull",
  "horizontalPull",
  "carry",
];

const FALLBACK_CUT_MAINTAIN_ANCHORS: Record<StrengthSignalV2CutMaintainPattern, string[]> = {
  push: ["barbell bench press", "bench press"],
  pull: ["lat pulldown", "lat pull down"],
  hinge: ["barbell rdl", "romanian deadlift"],
  squat: ["leg press"],
};

const FALLBACK_BULK_ANCHORS: Record<StrengthSignalV2BulkPattern, string[]> = {
  squat: ["barbell back squat", "high bar squat", "high-bar squat", "back squat"],
  hinge: ["trap bar deadlift", "trap-bar deadlift", "high handle trap bar deadlift", "trap bar deadlift high handles"],
  horizontalPush: ["barbell bench press", "bench press"],
  verticalPush: ["standing overhead press", "overhead press", "barbell overhead press"],
  verticalPull: ["pull-ups", "pull up", "pull-up", "pullup"],
  horizontalPull: ["chest-supported row", "chest supported row"],
  carry: ["farmer's carry", "farmers carry", "farmer carry"],
};

function finiteNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function setTime(set: SetEntry): number {
  return finiteNumber(set.completedAt ?? set.createdAt ?? set.updatedAt) ?? NaN;
}

function confidenceScore(confidence: StrengthSignalV2Confidence): number {
  if (confidence === "HIGH") return 3;
  if (confidence === "MEDIUM") return 2;
  return 1;
}

function confidenceFromScore(score: number): StrengthSignalV2Confidence {
  if (score >= 2.5) return "HIGH";
  if (score >= 1.75) return "MEDIUM";
  return "LOW";
}

function anchorConfidence(lastPerformedAt: number | null, dataPoints: number, now: number): StrengthSignalV2Confidence {
  if (!lastPerformedAt || dataPoints < 2) return "LOW";
  const ageDays = (now - lastPerformedAt) / DAY_MS;
  if (ageDays <= 14) return "HIGH";
  if (ageDays <= 30) return "MEDIUM";
  return "LOW";
}

function configValueToTerms(value: unknown): string[] {
  if (!value) return [];

  if (typeof value === "string") return [value];

  if (Array.isArray(value)) {
    return value.flatMap(configValueToTerms);
  }

  if (typeof value === "object") {
    const raw = value as any;
    return [raw.exerciseId, raw.id, raw.exerciseName, raw.name]
      .map((term) => String(term ?? "").trim())
      .filter(Boolean);
  }

  return [];
}

function looksLikeExerciseId(value: string): boolean {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed);
}

function buildAnchorDefinitions(phase: CurrentPhase, config: any): AnchorDefinition[] {
  const patterns = phase === "bulk" ? BULK_PATTERNS : CUT_MAINTAIN_PATTERNS;
  const phaseConfig = config?.v2Anchors?.byPhase?.[phase];
  const modelConfig = phase === "bulk" ? config?.v2Anchors?.bulk : config?.v2Anchors?.cutMaintain;
  const fallbackAnchors = phase === "bulk" ? FALLBACK_BULK_ANCHORS : FALLBACK_CUT_MAINTAIN_ANCHORS;

  return patterns.map((pattern) => {
    const configured = phaseConfig?.[pattern] ?? modelConfig?.[pattern];
    const configuredTerms = configValueToTerms(configured);
    return {
      pattern,
      configuredExerciseIds: configuredTerms.filter(looksLikeExerciseId),
      configuredNames: configuredTerms.filter((term) => !looksLikeExerciseId(term)),
      fallbackNames: fallbackAnchors[pattern],
    };
  });
}

function normalizedExerciseNames(exercise: Exercise, track: Track): string[] {
  return [
    exercise.name,
    exercise.normalizedName,
    track.displayName,
    ...(Array.isArray(exercise.aliases) ? exercise.aliases : []),
  ]
    .map((value) => normalizeName(String(value ?? "")))
    .filter(Boolean);
}

function normalizedPrimaryNames(exercise: Exercise, track: Track): string[] {
  return [exercise.name, exercise.normalizedName, track.displayName]
    .map((value) => normalizeName(String(value ?? "")))
    .filter(Boolean);
}

function exerciseIdsForMatch(exercise: Exercise, track: Track): string[] {
  return [exercise.id, track.exerciseId]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
}

function canonicalExerciseIdsForMatch(exercise: Exercise): string[] {
  return [exercise.mergedIntoExerciseId]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
}

function hasExactNameMatch(terms: string[], names: string[]): boolean {
  const normalizedTerms = terms.map((term) => normalizeName(term)).filter(Boolean);
  return normalizedTerms.some((term) => names.includes(term));
}

function hasControlledFallbackMatch(definition: AnchorDefinition, exercise: Exercise, track: Track): boolean {
  const names = normalizedPrimaryNames(exercise, track);
  const aliases = (Array.isArray(exercise.aliases) ? exercise.aliases : [])
    .map((alias) => normalizeName(String(alias ?? "")))
    .filter(Boolean);

  if (definition.pattern === "squat") {
    // Controlled fallback: allow user variants like "Leg Press - Strength",
    // but avoid broad squat-family drift.
    return names.some((name) => name === "leg press" || name.startsWith("leg press "));
  }

  if (definition.pattern === "pull") {
    // Controlled fallback: true Lat Pulldown only. Do not let
    // "Horizontal Lat Pulldown (kneeling)" win via substring matching.
    return [...names, ...aliases].some((name) => name === "lat pulldown machine");
  }

  return false;
}

function anchorMatchRank(definition: AnchorDefinition, exercise: Exercise, track: Track): number | null {
  const configuredIds = definition.configuredExerciseIds;
  const ids = exerciseIdsForMatch(exercise, track);
  const canonicalIds = canonicalExerciseIdsForMatch(exercise);
  const allNames = normalizedExerciseNames(exercise, track);
  const primaryNames = normalizedPrimaryNames(exercise, track);

  // 1. Exact configured exerciseId match.
  if (configuredIds.length && configuredIds.some((id) => ids.includes(id))) return 1;

  // 2. Canonical exerciseId match for redirected/merged exercise rows.
  if (configuredIds.length && configuredIds.some((id) => canonicalIds.includes(id))) return 2;

  // 3. Strict exact-name match against configured names or approved fallback names.
  if (hasExactNameMatch(definition.configuredNames, allNames)) return 3;
  if (hasExactNameMatch(definition.fallbackNames, primaryNames)) return 3;

  // 4. Controlled alias/fallback match only where the anchor is unambiguous.
  if (hasControlledFallbackMatch(definition, exercise, track)) return 4;

  return null;
}

function latestSetPayload(candidate: CandidateSet): StrengthSignalV2LatestSet {
  return {
    setId: candidate.set.id ?? null,
    sessionId: candidate.set.sessionId ?? null,
    trackId: candidate.set.trackId ?? null,
    weight: finiteNumber(candidate.set.weight),
    reps: finiteNumber(candidate.set.reps),
    effectiveWeightLb: candidate.effectiveWeightLb,
    completedAt: candidate.at,
    distance: finiteNumber(candidate.set.distance),
    distanceUnit: candidate.set.distanceUnit ?? null,
  };
}

function emptyAnchorResult(): StrengthSignalV2AnchorResult {
  return {
    exerciseId: null,
    exerciseName: null,
    latestSet: null,
    e1RM: null,
    lastPerformedAt: null,
    dataPoints: 0,
    confidence: "LOW",
  };
}

function buildScoredAnchorResult(
  definition: AnchorDefinition,
  sets: SetEntry[],
  trackById: Map<string, Track>,
  exerciseById: Map<string, Exercise>,
  bodyRows: any[],
  now: number
): StrengthSignalV2AnchorResult {
  const candidates: CandidateSet[] = [];

  for (const set of sets) {
    const track = trackById.get(set.trackId);
    if (!track || !isStrengthTrackType(track.trackType)) continue;

    const exercise = exerciseById.get(track.exerciseId);
    if (!exercise) continue;
    const matchRank = anchorMatchRank(definition, exercise, track);
    if (matchRank == null) continue;
    if (!isSetEligibleForStrengthSignal({ set, track, exercise })) continue;

    const at = setTime(set);
    const reps = finiteNumber(set.reps);
    const weight = finiteNumber(set.weight);
    if (!Number.isFinite(at) || reps == null || weight == null) continue;

    const bodyweight = bodyweightFromRowsAt(bodyRows, at) ?? 0;
    const effectiveWeightLb = calcEffectiveStrengthWeightLb(weight, exercise.name, bodyweight);
    const e1RM = computeScoredE1RM(effectiveWeightLb, reps);
    if (!Number.isFinite(e1RM) || e1RM <= 0) continue;

    candidates.push({ set, track, exercise, at, effectiveWeightLb, e1RM, matchRank });
  }

  if (!candidates.length) return emptyAnchorResult();

  const bestRank = Math.min(...candidates.map((candidate) => candidate.matchRank));
  const rankedCandidates = candidates.filter((candidate) => candidate.matchRank === bestRank);
  const latest = rankedCandidates.slice().sort((a, b) => b.at - a.at)[0];
  const best = rankedCandidates.reduce((winner, candidate) => (candidate.e1RM > winner.e1RM ? candidate : winner), rankedCandidates[0]);

  return {
    exerciseId: latest.exercise.id,
    exerciseName: latest.exercise.name,
    latestSet: latestSetPayload(latest),
    e1RM: best.e1RM,
    lastPerformedAt: latest.at,
    dataPoints: rankedCandidates.length,
    confidence: anchorConfidence(latest.at, rankedCandidates.length, now),
  };
}

function buildCarryAnchorResult(
  definition: AnchorDefinition,
  sets: SetEntry[],
  trackById: Map<string, Track>,
  exerciseById: Map<string, Exercise>
): StrengthSignalV2AnchorResult {
  const candidates: CandidateSet[] = [];

  for (const set of sets) {
    const track = trackById.get(set.trackId);
    if (!track) continue;

    const exercise = exerciseById.get(track.exerciseId);
    if (!exercise) continue;
    const matchRank = anchorMatchRank(definition, exercise, track);
    if (matchRank == null) continue;

    const at = setTime(set);
    const weight = finiteNumber(set.weight);
    if (!Number.isFinite(at) || weight == null) continue;

    candidates.push({
      set,
      track,
      exercise,
      at,
      effectiveWeightLb: Math.max(0, weight),
      e1RM: 0,
      matchRank,
    });
  }

  if (!candidates.length) return emptyAnchorResult();

  const bestRank = Math.min(...candidates.map((candidate) => candidate.matchRank));
  const latest = candidates
    .filter((candidate) => candidate.matchRank === bestRank)
    .slice()
    .sort((a, b) => b.at - a.at)[0];
  return {
    exerciseId: latest.exercise.id,
    exerciseName: latest.exercise.name,
    latestSet: latestSetPayload(latest),
    e1RM: null,
    lastPerformedAt: latest.at,
    dataPoints: candidates.length,
    confidence: "LOW",
  };
}

function buildAggregate(anchors: Partial<Record<StrengthSignalV2Pattern, StrengthSignalV2AnchorResult>>) {
  const anchorRows = Object.values(anchors);
  const e1RMs = anchorRows
    .map((anchor) => finiteNumber(anchor?.e1RM))
    .filter((value): value is number => value != null && value > 0);
  const averageE1RM = e1RMs.length ? e1RMs.reduce((sum, value) => sum + value, 0) / e1RMs.length : null;
  const averageConfidence = anchorRows.length
    ? anchorRows.reduce((sum, anchor) => sum + confidenceScore(anchor?.confidence ?? "LOW"), 0) / anchorRows.length
    : 1;

  return {
    averageE1RM,
    trendDelta14d: null,
    confidence: confidenceFromScore(averageConfidence),
  };
}

export async function computeStrengthSignalV2(
  options: ComputeStrengthSignalV2Options = {}
): Promise<StrengthSignalV2Result> {
  const now = finiteNumber(options.now) ?? Date.now();
  const [phase, config, sets, tracks, exercises, bodyRows] = await Promise.all([
    getCurrentPhase(),
    getStrengthSignalConfig(),
    db.sets.toArray(),
    db.tracks.toArray(),
    db.exercises.toArray(),
    db.bodyMetrics.toArray(),
  ]);

  const trackById = new Map((tracks ?? []).map((track) => [track.id, track]));
  const exerciseById = new Map((exercises ?? []).map((exercise) => [exercise.id, exercise]));
  const anchorDefinitions = buildAnchorDefinitions(phase, config as any);
  const anchors: Partial<Record<StrengthSignalV2Pattern, StrengthSignalV2AnchorResult>> = {};

  for (const definition of anchorDefinitions) {
    anchors[definition.pattern] =
      definition.pattern === "carry"
        ? buildCarryAnchorResult(definition, sets, trackById, exerciseById)
        : buildScoredAnchorResult(definition, sets, trackById, exerciseById, bodyRows, now);
  }

  return {
    phase,
    anchors,
    aggregate: buildAggregate(anchors),
  };
}

export async function getStrengthSignalV2Debug(): Promise<string> {
  const result = await computeStrengthSignalV2();
  const lines = [
    `Strength Signal v2 (${result.phase})`,
    `Aggregate: averageE1RM=${result.aggregate.averageE1RM?.toFixed(1) ?? "Unknown"} confidence=${result.aggregate.confidence}`,
  ];

  for (const [pattern, anchor] of Object.entries(result.anchors)) {
    lines.push(
      `${pattern}: ${anchor?.exerciseName ?? "Unresolved"} | e1RM=${anchor?.e1RM?.toFixed(1) ?? "Unknown"} | dataPoints=${anchor?.dataPoints ?? 0} | confidence=${anchor?.confidence ?? "LOW"} | last=${anchor?.lastPerformedAt ? new Date(anchor.lastPerformedAt).toISOString() : "Unknown"}`
    );
  }

  return lines.join("\n");
}
