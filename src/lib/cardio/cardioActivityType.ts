export const CARDIO_ACTIVITY_TYPES = ["walk", "hike", "run", "bike", "row", "other"] as const;

export type CardioActivityType = (typeof CARDIO_ACTIVITY_TYPES)[number];

export const CARDIO_ACTIVITY_TYPE_LABELS: Record<CardioActivityType, string> = {
  walk: "Walk",
  hike: "Hike",
  run: "Run",
  bike: "Bike",
  row: "Row",
  other: "Other",
};

export const CARDIO_ACTIVITY_TYPE_OPTIONS = CARDIO_ACTIVITY_TYPES.map((value) => ({
  value,
  label: CARDIO_ACTIVITY_TYPE_LABELS[value],
}));

export function parseCardioActivityType(value: string | null | undefined): CardioActivityType | undefined {
  const normalized = String(value ?? "").trim().toLowerCase();
  return CARDIO_ACTIVITY_TYPES.includes(normalized as CardioActivityType)
    ? (normalized as CardioActivityType)
    : undefined;
}

export function getCardioActivityTypeLabel(activityType: CardioActivityType): string {
  return CARDIO_ACTIVITY_TYPE_LABELS[activityType];
}

function normalizeActivityText(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasAnyWord(text: string, words: readonly string[]): boolean {
  const padded = ` ${text} `;
  return words.some((word) => padded.includes(` ${word} `));
}

function hasFalsePositiveWalkPhrase(text: string): boolean {
  return (
    /\bfarmers?\s+walk\b/.test(text) ||
    /\bwalking\s+lunge\b/.test(text) ||
    /\bwalkout\b/.test(text) ||
    /\bwalk\s*out\b/.test(text) ||
    /\bcarry\b/.test(text)
  );
}

function classifyExplicitActivityText(value: string | null | undefined): CardioActivityType | undefined {
  const text = normalizeActivityText(value);
  if (!text) return undefined;

  if (!hasFalsePositiveWalkPhrase(text) && hasAnyWord(text, ["walk", "walking"])) return "walk";
  if (hasAnyWord(text, ["hike", "hiking"])) return "hike";
  if (hasAnyWord(text, ["run", "running"])) return "run";
  if (hasAnyWord(text, ["bike", "biking", "cycling"])) return "bike";
  if (hasAnyWord(text, ["row", "rowing"])) return "row";
  if (hasAnyWord(text, ["cardio", "conditioning"])) return "other";

  return undefined;
}

export function inferCardioActivityType(input: {
  sessionName?: string;
  exerciseName?: string;
  sourceText?: string;
}): CardioActivityType | undefined {
  return (
    classifyExplicitActivityText(input.sessionName) ??
    classifyExplicitActivityText(input.exerciseName) ??
    classifyExplicitActivityText(input.sourceText)
  );
}
