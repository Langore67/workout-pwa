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

export function isStrengthTrackType(raw: unknown): boolean {
  return raw === "strength" || raw === "hypertrophy";
}

export function isNonStrengthTrackType(raw: unknown): boolean {
  return (
    raw === "technique" ||
    raw === "mobility" ||
    raw === "corrective" ||
    raw === "conditioning"
  );
}

export const TRACK_INTENT_OPTIONS: Array<{ value: TrackType; label: string }> = [
  { value: "strength", label: "Strength" },
  { value: "technique", label: "Technique" },
  { value: "mobility", label: "Mobility" },
  { value: "corrective", label: "Corrective" },
  { value: "conditioning", label: "Conditioning" },
];

export function defaultTrackingModeForTrackIntent(trackIntent: TrackType): TrackingMode {
  switch (trackIntent) {
    case "mobility":
    case "corrective":
      return "repsOnly";
    case "conditioning":
      return "timeSeconds";
    case "technique":
    case "strength":
    default:
      return "weightedReps";
  }
}

export function buildTrackDisplayNameForIntent(
  baseExerciseName: string,
  trackIntent: TrackType
): string {
  const base = String(baseExerciseName ?? "").trim();
  if (!base) return "";

  if (trackIntent === "strength" || trackIntent === "hypertrophy") {
    return base;
  }

  return `${base} - ${trackIntent}`;
}

type DefaultTrackTypeOptions = {
  extraCorrectiveTerms?: string[];
  enableCardioTerms?: boolean;
};

export function inferTrackTypeFromParsedSetKinds(
  exerciseName: string,
  rawKinds: unknown[],
  options: DefaultTrackTypeOptions = {}
): TrackType {
  const kinds = (rawKinds ?? [])
    .map((value) => String(value ?? "").trim().toLowerCase())
    .filter(Boolean);

  const hasStrengthLikeIntent = kinds.some((kind) => kind === "work" || kind === "test");
  const nonStrengthKinds = kinds.filter((kind) =>
    kind === "technique" ||
    kind === "mobility" ||
    kind === "corrective" ||
    kind === "conditioning" ||
    kind === "cardio"
  );

  if (!hasStrengthLikeIntent && nonStrengthKinds.length) {
    if (nonStrengthKinds.every((kind) => kind === "technique")) return "technique";
    if (nonStrengthKinds.every((kind) => kind === "mobility")) return "mobility";
    if (nonStrengthKinds.every((kind) => kind === "corrective")) return "corrective";
    if (nonStrengthKinds.every((kind) => kind === "conditioning" || kind === "cardio")) {
      return "conditioning";
    }
  }

  return defaultTrackTypeFromExerciseName(exerciseName, options);
}

export function defaultTrackTypeFromExerciseName(
  exerciseName: string,
  options: DefaultTrackTypeOptions = {}
): TrackType {
  const s = String(exerciseName || "").toLowerCase();
  const mobilityTerms = [
    "mobility",
    "stretch",
    "knee to wall",
    "90/90",
    "hip rotation",
    ...(options.extraCorrectiveTerms ?? []).filter((term) =>
      /stretch|mobility|rotation|knee to wall/i.test(term)
    ),
  ];
  const correctiveTerms = [
    "breathing",
    "reset",
    ...(options.extraCorrectiveTerms ?? []),
  ];

  if (mobilityTerms.some((term) => s.includes(term))) {
    return "mobility";
  }

  if (correctiveTerms.some((term) => s.includes(term))) {
    return "corrective";
  }

  if (options.enableCardioTerms) {
    const cardioTerms = ["walk", "bike", "cardio", "treadmill", "hang"];
    if (cardioTerms.some((term) => s.includes(term))) {
      return "conditioning";
    }
  }

  return "hypertrophy";
}