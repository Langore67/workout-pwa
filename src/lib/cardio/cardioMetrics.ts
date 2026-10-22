export type CardioDistanceUnit = "mi" | "km";
export type CardioElevationUnit = "ft" | "m";

export type CardioMetrics = {
  distance?: number;
  distanceUnit?: CardioDistanceUnit;
  durationSeconds?: number;
  avgHrBpm?: number;
  maxHrBpm?: number;
  elevationGain?: number;
  elevationUnit?: CardioElevationUnit;
  routeId?: string;
  routeName?: string;
  source?: string;
};

export type CardioMetricsParseResult = { metrics?: CardioMetrics; issues: string[]; recognizedLines: Set<number> };

function durationSeconds(raw: string): number | undefined {
  const match = raw.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
  if (!match) return undefined;
  const hours = Number(match[1] ?? 0), minutes = Number(match[2]), seconds = Number(match[3]);
  if (minutes > 59 || seconds > 59) return undefined;
  const total = hours * 3600 + minutes * 60 + seconds;
  return total > 0 ? total : undefined;
}

export function validateCardioMetrics(raw: CardioMetrics): { ok: true; value: CardioMetrics } | { ok: false; issues: string[] } {
  const issues: string[] = [];
  if (raw.distance != null && (!Number.isFinite(raw.distance) || raw.distance <= 0 || !raw.distanceUnit)) issues.push("Distance must be a positive value with an explicit mi or km unit.");
  if (raw.durationSeconds != null && (!Number.isFinite(raw.durationSeconds) || raw.durationSeconds <= 0)) issues.push("Duration must be positive.");
  for (const [label, value] of [["Average HR", raw.avgHrBpm], ["Maximum HR", raw.maxHrBpm]] as const) if (value != null && (!Number.isInteger(value) || value < 1 || value > 300)) issues.push(`${label} must be an integer from 1 to 300 bpm.`);
  if (raw.avgHrBpm != null && raw.maxHrBpm != null && raw.maxHrBpm < raw.avgHrBpm) issues.push("Maximum HR cannot be lower than Average HR.");
  if (raw.elevationGain != null && (!Number.isFinite(raw.elevationGain) || raw.elevationGain < 0 || !raw.elevationUnit)) issues.push("Elevation Gain must be non-negative with an explicit ft or m unit.");
  if (issues.length) return { ok: false, issues };
  return { ok: true, value: { ...raw } };
}

export function parseStructuredCardioMetrics(text: string): CardioMetricsParseResult {
  const metrics: CardioMetrics = {};
  const issues: string[] = [];
  const recognizedLines = new Set<number>();
  const lines = String(text ?? "").replace(/\r/g, "").split("\n");
  let inNotes = false;
  lines.forEach((raw, index) => {
    const line = raw.trim();
    if (/^Session Notes\s*:/i.test(line)) { inNotes = true; return; }
    if (inNotes || !line) return;
    let match = line.match(/^Distance\s*:\s*(\d+(?:\.\d+)?)\s*(mi|km)\s*$/i);
    if (match) { metrics.distance = Number(match[1]); metrics.distanceUnit = match[2].toLowerCase() as CardioDistanceUnit; recognizedLines.add(index); return; }
    if (/^Distance\s*:/i.test(line)) { issues.push("Invalid Distance. Use a positive value with mi or km."); recognizedLines.add(index); return; }
    match = line.match(/^Duration\s*:\s*(.+)$/i);
    if (match) { const parsed = durationSeconds(match[1]); if (parsed == null) issues.push("Invalid Duration. Use MM:SS or HH:MM:SS."); else metrics.durationSeconds = parsed; recognizedLines.add(index); return; }
    match = line.match(/^(Average|Avg|Maximum|Max) HR\s*:\s*(.+)$/i);
    if (match) { const valueMatch = match[2].match(/^(\d+)\s*bpm$/i); const value = valueMatch ? Number(valueMatch[1]) : undefined; const key = /^(Average|Avg)$/i.test(match[1]) ? "avgHrBpm" : "maxHrBpm"; if (value == null) issues.push(`${key === "avgHrBpm" ? "Average" : "Maximum"} HR must include an integer bpm value.`); else metrics[key] = value; recognizedLines.add(index); return; }
    match = line.match(/^Elevation Gain\s*:\s*(\d+(?:\.\d+)?)\s*(ft|m)\s*$/i);
    if (match) { metrics.elevationGain = Number(match[1]); metrics.elevationUnit = match[2].toLowerCase() as CardioElevationUnit; recognizedLines.add(index); return; }
    if (/^Elevation Gain\s*:/i.test(line)) { issues.push("Invalid Elevation Gain. Use a non-negative value with ft or m."); recognizedLines.add(index); return; }
    match = line.match(/^Route ID\s*:\s*(.+)$/i); if (match) { metrics.routeId = match[1].trim() || undefined; recognizedLines.add(index); return; }
    match = line.match(/^Route Name\s*:\s*(.+)$/i); if (match) { metrics.routeName = match[1].trim() || undefined; recognizedLines.add(index); return; }
    match = line.match(/^Source\s*:\s*(.+)$/i); if (match) { metrics.source = match[1].trim() || undefined; recognizedLines.add(index); }
  });
  const validated = validateCardioMetrics(metrics);
  if (!validated.ok) issues.push(...validated.issues);
  return { metrics: Object.keys(metrics).length ? metrics : undefined, issues: [...new Set(issues)], recognizedLines };
}

export function cardioDistanceMeters(metrics?: CardioMetrics): number | undefined {
  if (!metrics?.distance || !metrics.distanceUnit) return undefined;
  return metrics.distance * (metrics.distanceUnit === "mi" ? 1609.344 : 1000);
}
