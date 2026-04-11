export type ImportSetClass =
  | "warmup"
  | "work"
  | "working"
  | "technique"
  | "mobility"
  | "corrective"
  | "diagnostic"
  | "rehab"
  | "conditioning"
  | "test"
  | "cardio";

const IMPORT_SET_CLASSES = new Set<ImportSetClass>([
  "warmup",
  "work",
  "working",
  "technique",
  "mobility",
  "corrective",
  "diagnostic",
  "rehab",
  "conditioning",
  "test",
  "cardio",
]);

export function normalizeImportSetClass(raw: unknown): ImportSetClass | null {
  const normalized = String(raw ?? "").trim().toLowerCase();
  return IMPORT_SET_CLASSES.has(normalized as ImportSetClass)
    ? (normalized as ImportSetClass)
    : null;
}

export function importSetClassToDbSetType(kind: ImportSetClass | null): "warmup" | "working" {
  return kind === "warmup" ? "warmup" : "working";
}

export function importSetClassToTrackIntentKind(kind: ImportSetClass): string {
  if (kind === "diagnostic" || kind === "rehab") return "corrective";
  if (kind === "working") return "work";
  return kind;
}
