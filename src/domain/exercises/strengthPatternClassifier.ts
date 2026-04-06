import { normalizeName, type Exercise } from "../../db";

export type StrengthPattern = "squat" | "hinge" | "push" | "pull";

type StrengthPatternMetadataInput = {
  exerciseId?: string;
  exercise?: Pick<Exercise, "name" | "normalizedName" | "aliases"> | null;
  exerciseName?: string;
  trackDisplayName?: string;
};

const STRENGTH_PATTERN_EXERCISE_ID_METADATA: Record<string, StrengthPattern> = {
  // Fill with explicit exercise-id mappings when catalog hygiene work lands.
};

const STRENGTH_PATTERN_NAME_METADATA: Record<string, StrengthPattern> = {
  "bridge machine": "hinge",
};

function normalizePatternKey(value: string | undefined): string {
  return normalizeName(String(value ?? ""));
}

function resolveStrengthPatternFromMetadata(
  input: StrengthPatternMetadataInput
): StrengthPattern | undefined {
  const exerciseId = String(input.exerciseId ?? "").trim();
  if (exerciseId && STRENGTH_PATTERN_EXERCISE_ID_METADATA[exerciseId]) {
    return STRENGTH_PATTERN_EXERCISE_ID_METADATA[exerciseId];
  }

  const candidateKeys = [
    input.exercise?.normalizedName,
    input.exercise?.name,
    input.exerciseName,
    input.trackDisplayName,
    ...(Array.isArray(input.exercise?.aliases) ? input.exercise.aliases : []),
  ]
    .map((value) => normalizePatternKey(value))
    .filter(Boolean);

  for (const key of candidateKeys) {
    const pattern = STRENGTH_PATTERN_NAME_METADATA[key];
    if (pattern) return pattern;
  }

  return undefined;
}

function resolveStrengthPatternFromHeuristics(name: string): StrengthPattern | undefined {
  const n = normalizePatternKey(name);

  if (!n) return undefined;

  if (n.includes("squat") || n.includes("front squat") || n.includes("box squat")) {
    return "squat";
  }

  if (
    n.includes("deadlift") ||
    n.includes("rdl") ||
    n.includes("romanian") ||
    n.includes("glute bridge") ||
    n.includes("bridge machine") ||
    n.includes("hip thrust") ||
    n.includes("good morning") ||
    n.includes("hip hinge")
  ) {
    return "hinge";
  }

  if (
    (n.includes("bench") ||
      n.includes("press") ||
      n.includes("overhead") ||
      n.includes("incline")) &&
    !n.includes("leg press")
  ) {
    return "push";
  }

  if (
    n.includes("row") ||
    n.includes("pulldown") ||
    n.includes("pull down") ||
    n.includes("lat pulldown") ||
    n.includes("lat pull down") ||
    n.includes("pullup") ||
    n.includes("pull-up") ||
    n.includes("pull up") ||
    n.includes("chin") ||
    n.includes("lat pull")
  ) {
    return "pull";
  }

  return undefined;
}

export function classifyStrengthPattern(input: StrengthPatternMetadataInput): StrengthPattern | undefined {
  return (
    resolveStrengthPatternFromMetadata(input) ??
    resolveStrengthPatternFromHeuristics(
      input.exerciseName ??
        input.exercise?.name ??
        input.trackDisplayName ??
        input.exercise?.normalizedName ??
        ""
    )
  );
}

export function classifyStrengthPatternFromExerciseName(
  name: string
): StrengthPattern | undefined {
  return classifyStrengthPattern({ exerciseName: name });
}
