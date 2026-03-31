import type { TrackType, TrackingMode } from "../db";

export type CanonTrackingMode = TrackingMode | "unknown";

export function normalizeTrackingMode(raw: unknown): CanonTrackingMode {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

  if (
    s === "weightedreps" ||
    s === "weight_reps" ||
    s === "weightreps" ||
    s === "weight-reps" ||
    s === "weighted_reps"
  ) {
    return "weightedReps";
  }

  if (s === "repsonly" || s === "reps_only" || s === "reps") {
    return "repsOnly";
  }

  if (
    s === "timeseconds" ||
    s === "time_seconds" ||
    s === "seconds" ||
    s === "time"
  ) {
    return "timeSeconds";
  }

  if (s === "breaths") return "breaths";
  if (s === "checkbox" || s === "check" || s === "bool") return "checkbox";

  return "unknown";
}

export function isWeightedOrRepsTrackingMode(raw: unknown): boolean {
  const mode = normalizeTrackingMode(raw);
  return mode === "weightedReps" || mode === "repsOnly";
}

type InferTrackingModeOptions = {
  hasWeight?: boolean;
  hasReps?: boolean;
  treatHangAsTime?: boolean;
};

export function inferTrackingModeFromExerciseName(
  exerciseName: string,
  options: InferTrackingModeOptions = {}
): TrackingMode {
  const s = String(exerciseName || "").toLowerCase();

  if (
    s.includes("plank") ||
    s.includes("hold") ||
    (options.treatHangAsTime && s.includes("hang"))
  ) {
    return "timeSeconds";
  }

  if (options.hasWeight === false && options.hasReps === true) {
    return "repsOnly";
  }

  if (s.includes("band") || s.includes("pull-apart") || s.includes("pull apart")) {
    return "repsOnly";
  }

  return "weightedReps";
}

export function inferTrackingModeFromSetSignals(
  exerciseName: string,
  signals: {
    hasWeightedLoad: boolean;
    hasReps: boolean;
    hasSeconds: boolean;
  },
  options: Pick<InferTrackingModeOptions, "treatHangAsTime"> = {}
): TrackingMode {
  if (signals.hasWeightedLoad && signals.hasReps) return "weightedReps";
  if (!signals.hasWeightedLoad && signals.hasReps) return "repsOnly";
  if (signals.hasSeconds) return "timeSeconds";

  return inferTrackingModeFromExerciseName(exerciseName, {
    hasWeight: signals.hasWeightedLoad,
    hasReps: signals.hasReps,
    treatHangAsTime: options.treatHangAsTime,
  });
}

type DefaultTrackTypeOptions = {
  extraCorrectiveTerms?: string[];
  enableCardioTerms?: boolean;
};

export function defaultTrackTypeFromExerciseName(
  exerciseName: string,
  options: DefaultTrackTypeOptions = {}
): TrackType {
  const s = String(exerciseName || "").toLowerCase();
  const correctiveTerms = [
    "breathing",
    "reset",
    "mobility",
    ...(options.extraCorrectiveTerms ?? []),
  ];

  if (correctiveTerms.some((term) => s.includes(term))) {
    return "corrective";
  }

  if (options.enableCardioTerms) {
    const cardioTerms = ["walk", "bike", "cardio", "treadmill", "hang"];
    if (cardioTerms.some((term) => s.includes(term))) {
      return "cardio";
    }
  }

  return "hypertrophy";
}
