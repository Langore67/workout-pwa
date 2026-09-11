export const CARDIO_INTENTS = ["fitness", "recovery", "adventure"] as const;

export type CardioIntent = (typeof CARDIO_INTENTS)[number];

export const CARDIO_INTENT_LABELS: Record<CardioIntent, string> = {
  fitness: "Fitness",
  recovery: "Recovery",
  adventure: "Adventure",
};

export const CARDIO_INTENT_OPTIONS = CARDIO_INTENTS.map((value) => ({
  value,
  label: CARDIO_INTENT_LABELS[value],
}));

export function parseCardioIntent(value: string | null | undefined): CardioIntent | undefined {
  const normalized = String(value ?? "").trim().toLowerCase();
  return CARDIO_INTENTS.includes(normalized as CardioIntent) ? (normalized as CardioIntent) : undefined;
}

export function getCardioIntentLabel(intent: CardioIntent): string {
  return CARDIO_INTENT_LABELS[intent];
}

export function isFitnessCardioIntent(intent: CardioIntent | undefined): boolean {
  return intent === "fitness";
}

export function isRecoveryCardioIntent(intent: CardioIntent | undefined): boolean {
  return intent === "recovery";
}

export function isAdventureCardioIntent(intent: CardioIntent | undefined): boolean {
  return intent === "adventure";
}
