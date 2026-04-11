export type ParsedImportLoad = {
  weight: number;
  isBodyweight: boolean;
};

export function parseImportLoadToken(loadRaw: unknown): ParsedImportLoad | null {
  if (loadRaw === null || loadRaw === undefined) return null;

  const raw = String(loadRaw).trim();
  if (!raw || raw.toLowerCase() === "nan") return null;

  const normalized = raw.toLowerCase();
  if (normalized === "bar") return { weight: 45, isBodyweight: false };
  if (normalized === "bw" || normalized === "bodyweight") {
    return { weight: 0, isBodyweight: true };
  }

  const bodyweightLoadMatch = normalized.match(/^bw\s*([+-]\s*\d+(?:\.\d+)?)$/i);
  if (bodyweightLoadMatch) {
    const signedLoad = Number(bodyweightLoadMatch[1].replace(/\s+/g, ""));
    return Number.isFinite(signedLoad)
      ? { weight: signedLoad, isBodyweight: true }
      : null;
  }

  const dumbbellMatch = normalized.match(/^(\d+(\.\d+)?)s$/i);
  if (dumbbellMatch) return { weight: Number(dumbbellMatch[1]), isBodyweight: false };

  const trailingAssistMatch = normalized.match(/^(-?\d+(\.\d+)?)\s*assist(?:ance)?$/i);
  if (trailingAssistMatch) {
    return { weight: -Math.abs(Number(trailingAssistMatch[1])), isBodyweight: false };
  }

  const leadingAssistMatch = normalized.match(/^assist(?:ance)?\s*(-?\d+(\.\d+)?)$/i);
  if (leadingAssistMatch) {
    return { weight: -Math.abs(Number(leadingAssistMatch[1])), isBodyweight: false };
  }

  const totalMatch = normalized.match(/\((\d+(\.\d+)?)\s*total\)/i);
  if (totalMatch) return { weight: Number(totalMatch[1]), isBodyweight: false };

  const n = Number(normalized);
  return Number.isFinite(n) ? { weight: n, isBodyweight: false } : null;
}
