export const CARDIO_FORMATS = ["continuous", "intervals"] as const;

export type CardioFormat = (typeof CARDIO_FORMATS)[number];

export const CARDIO_FORMAT_LABELS: Record<CardioFormat, string> = {
  continuous: "Continuous",
  intervals: "Intervals",
};

export const CARDIO_FORMAT_OPTIONS = CARDIO_FORMATS.map((value) => ({
  value,
  label: CARDIO_FORMAT_LABELS[value],
}));

export function parseCardioFormat(value: string | null | undefined): CardioFormat | undefined {
  const normalized = String(value ?? "").trim().toLowerCase();
  return CARDIO_FORMATS.includes(normalized as CardioFormat) ? (normalized as CardioFormat) : undefined;
}

export function getCardioFormatLabel(format: CardioFormat): string {
  return CARDIO_FORMAT_LABELS[format];
}
