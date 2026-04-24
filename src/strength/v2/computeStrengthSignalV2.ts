import { db, type Exercise, type SetEntry, type Track } from "../../db";
import { getCurrentPhase, getStrengthSignalConfig, type CurrentPhase } from "../../config/appConfig";
import { isSetEligibleForStrengthSignal } from "../../domain/strength/strengthSignalFilter";
import { isStrengthTrackType } from "../../domain/trackingMode";
import {
  bodyweightFromRowsAt,
  calcEffectiveStrengthWeightLb,
  computeScoredE1RM,
} from "../Strength";
import {
  anchorMatchRank,
  buildAnchorDefinitions,
  type AnchorDefinition,
} from "./anchorResolver";

const DAY_MS = 24 * 60 * 60 * 1000;
const CAPACITY_WINDOW_DAYS = 90;
const STATE_WINDOW_DAYS = 28;

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

export type StrengthSignalV2AnchorMeasurement = {
  e1RM: number | null;
  bestSetText: string | null;
  lastPerformedAt: string | null;
  completedSetsConsidered: number;
  confidence: StrengthSignalV2Confidence;
};

export type StrengthSignalV2AnchorResult = {
  exerciseId: string | null;
  exerciseName: string | null;
  latestSet: StrengthSignalV2LatestSet | null;
  capacity: StrengthSignalV2AnchorMeasurement;
  state: StrengthSignalV2AnchorMeasurement;
  // Legacy top-line fields currently mirror capacity for compatibility with existing consumers.
  e1RM: number | null;
  lastPerformedAt: number | null;
  dataPoints: number;
  confidence: StrengthSignalV2Confidence;
  selectionSource: "CONFIGURED" | "AUTO_SELECTED";
  configuredExerciseName: string | null;
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

type CandidateSet = {
  set: SetEntry;
  track: Track;
  exercise: Exercise;
  at: number;
  effectiveWeightLb: number;
  e1RM: number;
  matchRank: number;
};

export type SelectedAnchorCandidate = {
  anchorId: string;
  exerciseId: string;
  reason?: string;
  matchRank: number;
  occurredAt: number;
};

export type SelectedAnchorCandidateResult = {
  anchorId: string;
  exerciseId: string;
  reason?: string;
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

function isoDate(value: number | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function bestSetText(candidate: CandidateSet | null): string | null {
  if (!candidate) return null;
  const weight = finiteNumber(candidate.set.weight);
  const reps = finiteNumber(candidate.set.reps);
  if (weight == null || reps == null) return null;
  const weightText = Number.isInteger(weight) ? String(weight) : weight.toFixed(1);
  const repsText = Number.isInteger(reps) ? String(reps) : reps.toFixed(1);
  return `${weightText} x ${repsText}`;
}

function emptyAnchorMeasurement(): StrengthSignalV2AnchorMeasurement {
  return {
    e1RM: null,
    bestSetText: null,
    lastPerformedAt: null,
    completedSetsConsidered: 0,
    confidence: "LOW",
  };
}

function buildAnchorMeasurement(
  candidates: CandidateSet[],
  now: number,
  windowDays: number,
  supportsE1RM: boolean
): StrengthSignalV2AnchorMeasurement {
  const cutoff = now - windowDays * DAY_MS;
  const windowCandidates = candidates.filter((candidate) => candidate.at >= cutoff && candidate.at <= now);
  if (!windowCandidates.length) return emptyAnchorMeasurement();

  const latest = windowCandidates.slice().sort((a, b) => b.at - a.at)[0];
  const best = supportsE1RM
    ? windowCandidates.reduce(
        (winner, candidate) => (candidate.e1RM > winner.e1RM ? candidate : winner),
        windowCandidates[0]
      )
    : null;

  return {
    e1RM: supportsE1RM && best ? best.e1RM : null,
    bestSetText: bestSetText(best ?? latest),
    lastPerformedAt: isoDate(latest.at),
    completedSetsConsidered: windowCandidates.length,
    confidence: anchorConfidence(latest.at, windowCandidates.length, now),
  };
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

function sameSelectedExercise(candidate: CandidateSet, selected: CandidateSet): boolean {
  return candidate.exercise.id === selected.exercise.id || candidate.track.exerciseId === selected.track.exerciseId;
}

function selectedAnchorReason(matchRank: number): string {
  if (matchRank === 1) return "configured_match";
  if (matchRank === 2) return "primary_auto_selected";
  return "conditional_auto_selected";
}

export function selectBestAnchor(
  candidates: SelectedAnchorCandidate[]
): SelectedAnchorCandidateResult | null {
  if (!candidates.length) return null;

  const bestRank = Math.min(...candidates.map((candidate) => candidate.matchRank));
  const rankedCandidates = candidates.filter((candidate) => candidate.matchRank === bestRank);
  const latest = rankedCandidates.slice().sort((a, b) => b.occurredAt - a.occurredAt)[0];

  if (!latest) return null;

  return {
    anchorId: latest.anchorId,
    exerciseId: latest.exerciseId,
    reason: latest.reason,
  };
}

function findLatestSelectedCandidate(
  candidates: CandidateSet[],
  selected: SelectedAnchorCandidateResult
): CandidateSet | null {
  const matchingCandidates = candidates.filter(
    (candidate) =>
      candidate.track.exerciseId === selected.anchorId &&
      candidate.exercise.id === selected.exerciseId
  );
  if (!matchingCandidates.length) return null;

  return matchingCandidates.slice().sort((a, b) => b.at - a.at)[0] ?? null;
}

function emptyAnchorResult(): StrengthSignalV2AnchorResult {
  const emptyMeasurement = emptyAnchorMeasurement();
  return {
    exerciseId: null,
    exerciseName: null,
    latestSet: null,
    capacity: emptyMeasurement,
    state: emptyMeasurement,
    e1RM: null,
    lastPerformedAt: null,
    dataPoints: 0,
    confidence: "LOW",
    selectionSource: "AUTO_SELECTED",
    configuredExerciseName: null,
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

  const selected = selectBestAnchor(
    candidates.map((candidate) => ({
      anchorId: candidate.track.exerciseId,
      exerciseId: candidate.exercise.id,
      reason: selectedAnchorReason(candidate.matchRank),
      matchRank: candidate.matchRank,
      occurredAt: candidate.at,
    }))
  );
  if (!selected) return emptyAnchorResult();

  const latest = findLatestSelectedCandidate(candidates, selected);
  if (!latest) return emptyAnchorResult();

  const selectionSource = latest.matchRank === 1 ? "CONFIGURED" : "AUTO_SELECTED";
  const selectedExerciseCandidates = candidates.filter((candidate) => sameSelectedExercise(candidate, latest));
  // Slice 5A separates long-memory capacity (90d) from short-memory current state (28d)
  // while leaving the existing slot-level fields wired to capacity for compatibility.
  const capacity = buildAnchorMeasurement(selectedExerciseCandidates, now, CAPACITY_WINDOW_DAYS, true);
  const state = buildAnchorMeasurement(selectedExerciseCandidates, now, STATE_WINDOW_DAYS, true);

  return {
    exerciseId: latest.exercise.id,
    exerciseName: latest.exercise.name,
    latestSet: latestSetPayload(latest),
    capacity,
    state,
    e1RM: capacity.e1RM,
    lastPerformedAt: capacity.lastPerformedAt ? Date.parse(capacity.lastPerformedAt) : null,
    dataPoints: capacity.completedSetsConsidered,
    confidence: capacity.confidence,
    selectionSource,
    configuredExerciseName: selectionSource === "CONFIGURED" ? latest.exercise.name : null,
  };
}

function buildCarryAnchorResult(
  definition: AnchorDefinition,
  sets: SetEntry[],
  trackById: Map<string, Track>,
  exerciseById: Map<string, Exercise>,
  now: number
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

  const selected = selectBestAnchor(
    candidates.map((candidate) => ({
      anchorId: candidate.track.exerciseId,
      exerciseId: candidate.exercise.id,
      reason: selectedAnchorReason(candidate.matchRank),
      matchRank: candidate.matchRank,
      occurredAt: candidate.at,
    }))
  );
  if (!selected) return emptyAnchorResult();

  const latest = findLatestSelectedCandidate(candidates, selected);
  if (!latest) return emptyAnchorResult();

  const rankedCandidates = candidates.filter((candidate) => candidate.matchRank === latest.matchRank);
  const selectionSource = latest.matchRank === 1 ? "CONFIGURED" : "AUTO_SELECTED";
  const selectedExerciseCandidates = rankedCandidates.filter((candidate) => sameSelectedExercise(candidate, latest));
  const capacity = buildAnchorMeasurement(selectedExerciseCandidates, now, CAPACITY_WINDOW_DAYS, false);
  const state = buildAnchorMeasurement(selectedExerciseCandidates, now, STATE_WINDOW_DAYS, false);
  return {
    exerciseId: latest.exercise.id,
    exerciseName: latest.exercise.name,
    latestSet: latestSetPayload(latest),
    capacity,
    state,
    e1RM: capacity.e1RM,
    lastPerformedAt: capacity.lastPerformedAt ? Date.parse(capacity.lastPerformedAt) : null,
    dataPoints: capacity.completedSetsConsidered,
    confidence: capacity.confidence,
    selectionSource,
    configuredExerciseName: selectionSource === "CONFIGURED" ? latest.exercise.name : null,
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

function formatDebugMeasurement(label: string, measurement: StrengthSignalV2AnchorMeasurement | undefined): string {
  return [
    `  ${label}: e1RM ${measurement?.e1RM?.toFixed(0) ?? "Unknown"}`,
    `best ${measurement?.bestSetText ?? "Unknown"}`,
    `last ${measurement?.lastPerformedAt ?? "Unknown"}`,
    `confidence ${measurement?.confidence ?? "LOW"}`,
    `sets ${measurement?.completedSetsConsidered ?? 0}`,
  ].join(" | ");
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
        ? buildCarryAnchorResult(definition, sets, trackById, exerciseById, now)
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
    const source = anchor?.selectionSource ?? "AUTO_SELECTED";
    const configured = anchor?.configuredExerciseName ? ` | configured ${anchor.configuredExerciseName}` : "";
    lines.push(
      `${pattern}: ${anchor?.exerciseName ?? "Unresolved"} | ${source}${configured}`,
      formatDebugMeasurement("Capacity", anchor?.capacity),
      formatDebugMeasurement("State", anchor?.state)
    );
  }

  return lines.join("\n");
}
