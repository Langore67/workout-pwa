export type ParsedCardioSessionNotes = {
  source?: string;
  route?: string;
  paceText?: string;
  paceSecondsPerMile?: number;
  elevationText?: string;
  avgHr?: number;
  maxHr?: number;
  notesText?: string;
};

function parseHeartRate(value: string): number | undefined {
  const match = value.trim().match(/^(\d{1,3})(?:\s*bpm)?$/i);
  if (!match) return undefined;
  const parsed = Number(match[1]);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 300 ? parsed : undefined;
}

export function parsePaceSecondsPerMile(value: string | undefined): number | undefined {
  const text = String(value ?? "").trim();
  if (!text) return undefined;

  const match = text.match(/\b(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(?:\/|per\s*)\s*mi(?:le)?s?\b/i);
  if (!match) return undefined;

  const first = Number(match[1]);
  const second = Number(match[2]);
  const third = match[3] == null ? undefined : Number(match[3]);
  if (!Number.isFinite(first) || !Number.isFinite(second)) return undefined;

  if (third != null) {
    if (!Number.isFinite(third)) return undefined;
    return first * 3600 + second * 60 + third;
  }

  return first * 60 + second;
}

export function parseCardioSessionNotes(notes?: string): ParsedCardioSessionNotes {
  const parsed: ParsedCardioSessionNotes = {};
  const lines = String(notes ?? "").replace(/\r/g, "").split("\n");

  for (const rawLine of lines) {
    const line = rawLine.trim().replace(/^[-*]\s*/, "");
    if (!line) continue;
    const heartRateMatch = line.match(/^(avg|average|max|maximum)\s+hr\s*:?\s*(.+)$/i);
    if (heartRateMatch) {
      const heartRate = parseHeartRate(heartRateMatch[2]);
      if (heartRate == null) continue;
      if (/^(avg|average)$/i.test(heartRateMatch[1])) parsed.avgHr = heartRate;
      else parsed.maxHr = heartRate;
      continue;
    }
    const match = line.match(/^([A-Za-z ]+):\s*(.*)$/);
    if (!match) continue;

    const label = match[1].trim().toLowerCase().replace(/\s+/g, " ");
    const value = match[2].trim();
    if (!value) continue;

    if (label === "source") parsed.source = value;
    else if (label === "route") parsed.route = value;
    else if (label === "pace") {
      parsed.paceText = value;
      parsed.paceSecondsPerMile = parsePaceSecondsPerMile(value);
    } else if (label === "elevation") parsed.elevationText = value;
    else if (label === "notes" || label === "note") parsed.notesText = value;
  }

  return parsed;
}
