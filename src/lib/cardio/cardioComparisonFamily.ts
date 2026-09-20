const GENERIC_CARDIO_NAME_WORDS = new Set([
  "walk",
  "walking",
  "hike",
  "hiking",
  "run",
  "running",
  "bike",
  "biking",
  "cycling",
  "row",
  "rowing",
  "cardio",
  "conditioning",
  "continuous",
  "interval",
  "intervals",
  "fitness",
  "recovery",
  "adventure",
  "session",
  "workout",
  "dedicated",
]);

export function normalizeCardioComparisonText(value: string | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getCardioSessionFamily(name: string | undefined): string | undefined {
  const normalized = normalizeCardioComparisonText(name);
  if (!normalized) return undefined;

  if (/\bprp\b/.test(normalized) || /\bpeachtree ridge park\b/.test(normalized)) {
    return "peachtree-ridge-park";
  }
  if (/\btreadmill\b/.test(normalized)) return "treadmill";

  const distinctiveWords = normalized.split(" ").filter((word) => !GENERIC_CARDIO_NAME_WORDS.has(word));
  if (!distinctiveWords.length) return undefined;

  // Outside known aliases, exact normalized names are intentionally the only
  // fallback. This is identity matching, not fuzzy location inference.
  return `name:${normalized}`;
}

export function getCardioComparisonIdentity(input: {
  route?: string;
  name?: string;
}): string | undefined {
  const route = normalizeCardioComparisonText(input.route);
  if (route) return `route:${route}`;

  const family = getCardioSessionFamily(input.name);
  return family ? `family:${family}` : undefined;
}
