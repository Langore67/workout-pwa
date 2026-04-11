function toFiniteNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "string" && !value.trim()) return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

export function formatSignedBodyweightToken(weightRaw: unknown): string {
  const weight = toFiniteNumber(weightRaw);
  if (weight == null || weight === 0) return "BW";
  return weight > 0 ? `BW+${weight}` : `BW${weight}`;
}

export function formatCoachSetLoadToken(params: {
  weight: unknown;
  useSignedBodyweightLoad?: boolean;
}): string | null {
  const weight = toFiniteNumber(params.weight);
  if (weight == null) return null;
  return params.useSignedBodyweightLoad ? formatSignedBodyweightToken(weight) : `${weight}`;
}

export function formatWeightedRepsSetDisplay(params: {
  weight?: unknown;
  reps?: unknown;
  rir?: unknown;
  useSignedBodyweightLoad?: boolean;
  requirePositiveReps?: boolean;
  emptyLabel?: string | null;
}): string | null {
  const parts: string[] = [];
  const loadLabel = formatCoachSetLoadToken({
    weight: params.weight,
    useSignedBodyweightLoad: params.useSignedBodyweightLoad,
  });
  if (loadLabel) parts.push(loadLabel);

  const reps = toFiniteNumber(params.reps);
  const hasReps = params.requirePositiveReps
    ? reps != null && reps > 0
    : reps != null;
  if (hasReps) {
    if (parts.length) parts.push(`x ${reps}`);
    else parts.push(`${reps} reps`);
  }

  const rir = toFiniteNumber(params.rir);
  if (rir != null) parts.push(`@${rir}`);

  if (parts.length) return parts.join(" ");
  return params.emptyLabel === undefined ? null : params.emptyLabel;
}
