import { normalizeName } from "../../db";

const EXERCISE_ALIAS_TO_CANONICAL_NAME_MAP: Record<string, string> = {
  "db bench press": "dumbbell bench press",
  "flat db bench": "dumbbell bench press",
  pullup: "pull up",
  chinup: "chin up",
  "lat pulldown machine": "lat pulldown",
};

export function getCanonicalExerciseNormalizedName(
  rawName: string | undefined
): string | undefined {
  const normalized = normalizeName(String(rawName ?? ""));
  if (!normalized) return undefined;
  return EXERCISE_ALIAS_TO_CANONICAL_NAME_MAP[normalized] ?? normalized;
}

export function isMappedExerciseAlias(rawName: string | undefined): boolean {
  const normalized = normalizeName(String(rawName ?? ""));
  if (!normalized) return false;
  const canonical = EXERCISE_ALIAS_TO_CANONICAL_NAME_MAP[normalized];
  return Boolean(canonical && canonical !== normalized);
}
