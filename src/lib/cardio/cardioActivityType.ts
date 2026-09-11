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
