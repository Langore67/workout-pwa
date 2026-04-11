export function normalizeImportNoteText(raw: unknown): string {
  return String(raw || "").trim();
}

export function joinImportNoteFragments(fragments: unknown[]): string | undefined {
  const parts = fragments.map(normalizeImportNoteText).filter(Boolean);
  return parts.length ? parts.join(" | ") : undefined;
}
