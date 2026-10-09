import type { Exercise, Session, SetEntry, Track } from "../../db";
import { buildExerciseResolverIndex, resolveExerciseFromIndex } from "../../domain/exercises/exerciseResolver";
import { classifyStrengthPattern } from "../../domain/exercises/strengthPatternClassifier";
import { isSetEligibleForStrengthSignal } from "../../domain/strength/strengthSignalFilter";
import { calcEffectiveStrengthWeightLb, computeScoredE1RM } from "../../strength/Strength";
import type { CardioWalkEvent } from "../cardio/cardioTypes";
import { isStrengthBuildingSession } from "./strengthBuildingSessions";

const HOUR_MS = 60 * 60 * 1000;
export const CARDIO_STRENGTH_PAIRING_WINDOW_HOURS = 24;
export const STRENGTH_PERFORMANCE_SIMILAR_TOLERANCE_PCT = 3;
export const MAX_INTERFERENCE_OBSERVATIONS = 5;
const MAX_BASELINE_OBSERVATIONS = 5;
const MIN_BASELINE_OBSERVATIONS = 2;

export type StrengthPerformanceInterpretation = "higher" | "lower" | "similar" | "insufficient_context";
export type StrengthSessionEmphasis = "upper-body dominant" | "lower-body dominant" | "mixed/full-body" | "unclassified";

export type CardioStrengthInterferenceObservation = {
  cardio: {
    sessionId: string;
    dateTime: string;
    durationMinutes?: number;
    distanceMiles?: number;
    activityType?: CardioWalkEvent["activityType"];
    intent?: CardioWalkEvent["conditioningIntent"];
    cardioFormat?: CardioWalkEvent["cardioFormat"];
    avgHr?: number;
  };
  strength: {
    dateTime: string;
    sessionId: string;
    movementEmphasis: string[];
    classification: StrengthSessionEmphasis;
    performanceSignal?: string;
  };
  gapHours: number;
  comparison: {
    baselineAvailable: boolean;
    exerciseName?: string;
    currentValue?: number;
    baselineValue?: number;
    deltaPct?: number;
    interpretation: StrengthPerformanceInterpretation;
  };
};

export type CardioStrengthInterferenceContext = {
  observations: CardioStrengthInterferenceObservation[];
  summary: {
    pairedObservationCount: number;
    lowerBodyPairs: number;
    upperBodyPairs: number;
  };
};

type ExercisePerformance = { exerciseId: string; exerciseName: string; value: number };

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function median(values: number[]) {
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function performanceSignal(interpretation: StrengthPerformanceInterpretation) {
  if (interpretation === "higher") return "Performance was higher than recent comparable sessions";
  if (interpretation === "lower") return "Performance was lower than recent comparable sessions";
  if (interpretation === "similar") return "Performance was similar to recent comparable sessions";
  return "Insufficient comparable strength history";
}

export function buildCardioStrengthInterferenceContext(args: {
  sessions: Session[];
  sets: SetEntry[];
  tracks: Track[];
  exercises: Exercise[];
  cardioEvents: CardioWalkEvent[];
  asOf: number;
  bodyweightLb?: number;
}): CardioStrengthInterferenceContext {
  const tracksById = new Map((args.tracks ?? []).map((track) => [track.id, track]));
  const exercisesById = new Map((args.exercises ?? []).map((exercise) => [exercise.id, exercise]));
  const resolver = buildExerciseResolverIndex(args.exercises ?? []);
  const setsBySession = new Map<string, SetEntry[]>();
  for (const set of args.sets ?? []) {
    if (set.deletedAt) continue;
    const bucket = setsBySession.get(set.sessionId) ?? [];
    bucket.push(set);
    setsBySession.set(set.sessionId, bucket);
  }

  const sessionRows = (args.sessions ?? []).filter((session) => {
    const at = Number(session.startedAt);
    return !session.deletedAt && finite(at) && at <= args.asOf && isStrengthBuildingSession({ session, sets: args.sets, tracksById });
  }).map((session) => {
    const at = Number(session.startedAt);
    const patterns = new Set<string>();
    const byExercise = new Map<string, ExercisePerformance>();
    for (const set of setsBySession.get(session.id) ?? []) {
      const track = tracksById.get(set.trackId);
      const exercise = track ? exercisesById.get(track.exerciseId) : undefined;
      if (!track || !exercise) continue;
      const resolved = resolveExerciseFromIndex({ rawName: exercise.name || track.displayName, allowAlias: true, followMerged: true }, resolver);
      const canonical = resolved.canonicalExercise ?? resolved.exercise ?? exercise;
      const pattern = canonical.movementPattern ?? classifyStrengthPattern({ exerciseId: canonical.id, exercise: canonical, exerciseName: canonical.name, trackDisplayName: track.displayName });
      if (pattern) patterns.add(pattern);
      if (!isSetEligibleForStrengthSignal({ set, track, exercise: canonical })) continue;
      const effectiveWeight = calcEffectiveStrengthWeightLb(Number(set.weight), canonical.name, Number(args.bodyweightLb ?? 0));
      const value = computeScoredE1RM(effectiveWeight, Number(set.reps));
      if (!(value > 0)) continue;
      const current = byExercise.get(canonical.id);
      if (!current || value > current.value) byExercise.set(canonical.id, { exerciseId: canonical.id, exerciseName: canonical.name, value });
    }
    const upper = ["push", "pull"].filter((pattern) => patterns.has(pattern));
    const lower = ["squat", "hinge", "lunge"].filter((pattern) => patterns.has(pattern));
    const classification: StrengthSessionEmphasis = upper.length && lower.length ? "mixed/full-body" : lower.length ? "lower-body dominant" : upper.length ? "upper-body dominant" : "unclassified";
    return { session, at, patterns: [...patterns].sort(), classification, performances: [...byExercise.values()] };
  }).sort((a, b) => a.at - b.at);

  const historyByExercise = new Map<string, Array<{ at: number; value: number }>>();
  const observations: CardioStrengthInterferenceObservation[] = [];
  const cardio = (args.cardioEvents ?? []).filter((event) => finite(event.endedAt ?? event.startedAt)).slice().sort((a, b) => b.startedAt - a.startedAt);

  for (const row of sessionRows) {
    const priorCardio = cardio
      .filter((event) => Number(event.endedAt ?? event.startedAt) <= row.at)
      .map((event) => ({ event, at: Number(event.endedAt ?? event.startedAt) }))
      .filter(({ at }) => row.at - at <= CARDIO_STRENGTH_PAIRING_WINDOW_HOURS * HOUR_MS)
      .sort((a, b) => b.at - a.at)[0];

    let selected: ExercisePerformance | undefined;
    let baseline: number | undefined;
    for (const current of row.performances) {
      const prior = (historyByExercise.get(current.exerciseId) ?? []).slice(-MAX_BASELINE_OBSERVATIONS);
      if (prior.length < MIN_BASELINE_OBSERVATIONS) continue;
      if (!selected || prior.length > (historyByExercise.get(selected.exerciseId)?.length ?? 0) || current.value > selected.value) {
        selected = current;
        baseline = median(prior.map((item) => item.value));
      }
    }
    const deltaPct = selected && baseline && baseline > 0 ? ((selected.value - baseline) / baseline) * 100 : undefined;
    const interpretation: StrengthPerformanceInterpretation = !finite(deltaPct)
      ? "insufficient_context"
      : deltaPct > STRENGTH_PERFORMANCE_SIMILAR_TOLERANCE_PCT ? "higher"
      : deltaPct < -STRENGTH_PERFORMANCE_SIMILAR_TOLERANCE_PCT ? "lower"
      : "similar";

    if (priorCardio) {
      const event = priorCardio.event;
      observations.push({
        cardio: {
          sessionId: event.sessionId,
          dateTime: new Date(event.startedAt).toISOString(),
          ...(finite(event.durationSeconds) ? { durationMinutes: event.durationSeconds / 60 } : {}),
          ...(finite(event.distanceMeters) ? { distanceMiles: event.distanceMeters / 1609.344 } : {}),
          ...(event.activityType ? { activityType: event.activityType } : {}),
          ...(event.conditioningIntent ? { intent: event.conditioningIntent } : {}),
          ...(event.cardioFormat ? { cardioFormat: event.cardioFormat } : {}),
          ...(finite(event.avgHr) ? { avgHr: event.avgHr } : {}),
        },
        strength: {
          dateTime: new Date(row.at).toISOString(),
          sessionId: row.session.id,
          movementEmphasis: row.patterns,
          classification: row.classification,
          performanceSignal: performanceSignal(interpretation),
        },
        gapHours: (row.at - priorCardio.at) / HOUR_MS,
        comparison: {
          baselineAvailable: interpretation !== "insufficient_context",
          ...(selected ? { exerciseName: selected.exerciseName, currentValue: selected.value } : {}),
          ...(finite(baseline) ? { baselineValue: baseline } : {}),
          ...(finite(deltaPct) ? { deltaPct } : {}),
          interpretation,
        },
      });
    }

    for (const current of row.performances) {
      const history = historyByExercise.get(current.exerciseId) ?? [];
      history.push({ at: row.at, value: current.value });
      historyByExercise.set(current.exerciseId, history);
    }
  }

  const capped = observations.sort((a, b) => b.strength.dateTime.localeCompare(a.strength.dateTime)).slice(0, MAX_INTERFERENCE_OBSERVATIONS);
  return {
    observations: capped,
    summary: {
      pairedObservationCount: observations.length,
      lowerBodyPairs: observations.filter((item) => item.strength.classification === "lower-body dominant").length,
      upperBodyPairs: observations.filter((item) => item.strength.classification === "upper-body dominant").length,
    },
  };
}
