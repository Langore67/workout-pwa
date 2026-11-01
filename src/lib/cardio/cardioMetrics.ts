export type CardioDistanceUnit = "mi" | "km";
export type CardioElevationUnit = "ft" | "m";
export type CardioStepsSource = "recorded" | "estimated";

export type CardioHeartRateZone = {
  zone: number;
  seconds: number;
};

export type CardioHeartRateZones = {
  source?: string;
  zones: CardioHeartRateZone[];
};

export type CardioMetrics = {
  distance?: number;
  distanceUnit?: CardioDistanceUnit;
  /** Explicit moving/active workout duration supplied by the source. */
  activeDurationSeconds?: number;
  /** Explicit total elapsed workout duration supplied by the source. */
  elapsedDurationSeconds?: number;
  /** Legacy/general IronForge duration retained for existing records and Duration: imports. */
  durationSeconds?: number;
  avgHrBpm?: number;
  maxHrBpm?: number;
  elevationGain?: number;
  elevationUnit?: CardioElevationUnit;
  routeId?: string;
  routeName?: string;
  source?: string;
  provider?: string;
  providerWorkoutId?: string;
  steps?: number;
  stepsSource?: CardioStepsSource;
  /** Provider/device-estimated energy expenditure, not a laboratory measurement. */
  energyKcal?: number;
  heartRateZones?: CardioHeartRateZones;
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
  if (raw.activeDurationSeconds != null && (!Number.isFinite(raw.activeDurationSeconds) || raw.activeDurationSeconds <= 0)) issues.push("Active Duration must be positive.");
  if (raw.elapsedDurationSeconds != null && (!Number.isFinite(raw.elapsedDurationSeconds) || raw.elapsedDurationSeconds <= 0)) issues.push("Elapsed Duration must be positive.");
  if (raw.durationSeconds != null && (!Number.isFinite(raw.durationSeconds) || raw.durationSeconds <= 0)) issues.push("Duration must be positive.");
  for (const [label, value] of [["Average HR", raw.avgHrBpm], ["Maximum HR", raw.maxHrBpm]] as const) if (value != null && (!Number.isInteger(value) || value < 1 || value > 300)) issues.push(`${label} must be an integer from 1 to 300 bpm.`);
  if (raw.avgHrBpm != null && raw.maxHrBpm != null && raw.maxHrBpm < raw.avgHrBpm) issues.push("Maximum HR cannot be lower than Average HR.");
  if (raw.elevationGain != null && (!Number.isFinite(raw.elevationGain) || raw.elevationGain < 0 || !raw.elevationUnit)) issues.push("Elevation Gain must be non-negative with an explicit ft or m unit.");
  if (raw.provider != null && !raw.provider.trim()) issues.push("Provider cannot be blank.");
  if (raw.providerWorkoutId != null && !raw.providerWorkoutId.trim()) issues.push("Provider Workout ID cannot be blank.");
  if (raw.steps != null && (!Number.isInteger(raw.steps) || raw.steps <= 0)) issues.push("Steps must be a positive whole number.");
  if (raw.stepsSource != null && raw.stepsSource !== "recorded" && raw.stepsSource !== "estimated") issues.push("Steps Source must be recorded or estimated.");
  if (raw.stepsSource != null && raw.steps == null) issues.push("Steps Source requires Steps.");
  if (raw.energyKcal != null && (!Number.isFinite(raw.energyKcal) || raw.energyKcal < 0)) issues.push("Energy must be a non-negative kcal value.");
  if (raw.heartRateZones != null) {
    if (!Array.isArray(raw.heartRateZones.zones) || raw.heartRateZones.zones.length === 0) issues.push("Heart-rate zones require at least one valid zone.");
    const seen = new Set<number>();
    for (const zone of raw.heartRateZones.zones ?? []) {
      if (!Number.isInteger(zone.zone) || zone.zone <= 0) issues.push("HR zone numbers must be positive whole numbers.");
      if (!Number.isFinite(zone.seconds) || zone.seconds <= 0) issues.push(`HR Zone ${zone.zone} duration must be positive.`);
      if (seen.has(zone.zone)) issues.push(`HR Zone ${zone.zone} is duplicated.`);
      seen.add(zone.zone);
    }
    if (raw.heartRateZones.source != null && !raw.heartRateZones.source.trim()) issues.push("HR Zone Source cannot be blank.");
  }
  if (issues.length) return { ok: false, issues };
  return {
    ok: true,
    value: {
      ...raw,
      ...(raw.heartRateZones
        ? {
            heartRateZones: {
              ...(raw.heartRateZones.source ? { source: raw.heartRateZones.source.trim() } : {}),
              zones: raw.heartRateZones.zones
                .map((zone) => ({ ...zone }))
                .sort((a, b) => a.zone - b.zone),
            },
          }
        : {}),
    },
  };
}

export function parseStructuredCardioMetrics(text: string): CardioMetricsParseResult {
  const metrics: CardioMetrics = {};
  const issues: string[] = [];
  const recognizedLines = new Set<number>();
  const heartRateZones: CardioHeartRateZone[] = [];
  const seenHeartRateZones = new Set<number>();
  let heartRateZoneSource: string | undefined;
  const lines = String(text ?? "").replace(/\r/g, "").split("\n");
  let inNotes = false;
  lines.forEach((raw, index) => {
    const line = raw.trim();
    if (/^Session Notes\s*:/i.test(line)) { inNotes = true; return; }
    if (inNotes || !line) return;
    let match = line.match(/^Distance\s*:\s*(\d+(?:\.\d+)?)\s*(mi|km)\s*$/i);
    if (match) { metrics.distance = Number(match[1]); metrics.distanceUnit = match[2].toLowerCase() as CardioDistanceUnit; recognizedLines.add(index); return; }
    if (/^Distance\s*:/i.test(line)) { issues.push("Invalid Distance. Use a positive value with mi or km."); recognizedLines.add(index); return; }
    match = line.match(/^(Active Duration|Elapsed Duration|Duration)\s*:\s*(.+)$/i);
    if (match) {
      const parsed = durationSeconds(match[2]);
      const label = match[1].toLowerCase();
      if (parsed == null) issues.push(`Invalid ${match[1]}. Use MM:SS or HH:MM:SS.`);
      else if (label === "active duration") metrics.activeDurationSeconds = parsed;
      else if (label === "elapsed duration") metrics.elapsedDurationSeconds = parsed;
      else metrics.durationSeconds = parsed;
      recognizedLines.add(index);
      return;
    }
    match = line.match(/^(Average|Avg|Maximum|Max) HR\s*:\s*(.+)$/i);
    if (match) { const valueMatch = match[2].match(/^(\d+)\s*bpm$/i); const value = valueMatch ? Number(valueMatch[1]) : undefined; const key = /^(Average|Avg)$/i.test(match[1]) ? "avgHrBpm" : "maxHrBpm"; if (value == null) issues.push(`${key === "avgHrBpm" ? "Average" : "Maximum"} HR must include an integer bpm value.`); else metrics[key] = value; recognizedLines.add(index); return; }
    match = line.match(/^Elevation Gain\s*:\s*(\d+(?:\.\d+)?)\s*(ft|m)\s*$/i);
    if (match) { metrics.elevationGain = Number(match[1]); metrics.elevationUnit = match[2].toLowerCase() as CardioElevationUnit; recognizedLines.add(index); return; }
    if (/^Elevation Gain\s*:/i.test(line)) { issues.push("Invalid Elevation Gain. Use a non-negative value with ft or m."); recognizedLines.add(index); return; }
    match = line.match(/^Route ID\s*:\s*(.+)$/i); if (match) { metrics.routeId = match[1].trim() || undefined; recognizedLines.add(index); return; }
    match = line.match(/^Route Name\s*:\s*(.+)$/i); if (match) { metrics.routeName = match[1].trim() || undefined; recognizedLines.add(index); return; }
    match = line.match(/^Provider Workout ID\s*:\s*(.*)$/i);
    if (match) { const value = match[1].trim(); if (!value) issues.push("Provider Workout ID cannot be blank."); else metrics.providerWorkoutId = value; recognizedLines.add(index); return; }
    match = line.match(/^Provider\s*:\s*(.*)$/i);
    if (match) { const value = match[1].trim(); if (!value) issues.push("Provider cannot be blank."); else metrics.provider = value.toLowerCase().replace(/[\s_-]+/g, ""); recognizedLines.add(index); return; }
    match = line.match(/^Steps\s*:\s*(.*)$/i);
    if (match) { const value = match[1].trim(); if (!/^\d+$/.test(value) || Number(value) <= 0) issues.push("Steps must be a positive whole number."); else metrics.steps = Number(value); recognizedLines.add(index); return; }
    match = line.match(/^Steps Source\s*:\s*(.*)$/i);
    if (match) { const value = match[1].trim().toLowerCase(); if (value !== "recorded" && value !== "estimated") issues.push("Steps Source must be Recorded or Estimated."); else metrics.stepsSource = value; recognizedLines.add(index); return; }
    match = line.match(/^(Energy|Calories)\s*:\s*(.*)$/i);
    if (match) { const value = match[2].trim().match(/^(\d+(?:\.\d+)?)\s*kcal$/i); if (!value) issues.push("Energy must be a non-negative value in kcal."); else metrics.energyKcal = Number(value[1]); recognizedLines.add(index); return; }
    match = line.match(/^HR Zone Source\s*:\s*(.*)$/i);
    if (match) { const value = match[1].trim(); if (!value) issues.push("HR Zone Source cannot be blank."); else heartRateZoneSource = value; recognizedLines.add(index); return; }
    match = line.match(/^HR Zone\s+(\d+)\s*:\s*(.*)$/i);
    if (match) {
      const zone = Number(match[1]);
      const seconds = durationSeconds(match[2]);
      if (!Number.isInteger(zone) || zone <= 0) issues.push("HR zone numbers must be positive whole numbers.");
      else if (seenHeartRateZones.has(zone)) issues.push(`HR Zone ${zone} is duplicated.`);
      else if (seconds == null) issues.push(`Invalid HR Zone ${zone}. Use MM:SS or HH:MM:SS.`);
      else { seenHeartRateZones.add(zone); heartRateZones.push({ zone, seconds }); }
      recognizedLines.add(index);
      return;
    }
    match = line.match(/^Source\s*:\s*(.+)$/i); if (match) { metrics.source = match[1].trim() || undefined; recognizedLines.add(index); }
  });
  if (metrics.stepsSource != null && metrics.steps == null) {
    issues.push("Steps Source requires Steps.");
    delete metrics.stepsSource;
  }
  if (heartRateZones.length) {
    metrics.heartRateZones = {
      ...(heartRateZoneSource ? { source: heartRateZoneSource } : {}),
      zones: heartRateZones.sort((a, b) => a.zone - b.zone),
    };
  } else if (heartRateZoneSource) {
    issues.push("HR Zone Source requires at least one valid HR Zone.");
  }
  const validated = validateCardioMetrics(metrics);
  if (!validated.ok) issues.push(...validated.issues);
  return { metrics: Object.keys(metrics).length ? (validated.ok ? validated.value : metrics) : undefined, issues: [...new Set(issues)], recognizedLines };
}

export function cardioDistanceMeters(metrics?: CardioMetrics): number | undefined {
  if (!metrics?.distance || !metrics.distanceUnit) return undefined;
  return metrics.distance * (metrics.distanceUnit === "mi" ? 1609.344 : 1000);
}
