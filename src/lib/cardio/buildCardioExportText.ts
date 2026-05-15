import type {
  CardioDailyWalkSummary,
  CardioWalkEvent,
  CardioWalkSummary,
  CardioWalkWindowSummary,
} from "./cardioTypes";
import { formatDistanceMiKm } from "./formatCardioWalk";

export type BuildCardioExportTextOptions = {
  generatedAt?: Date | number | string;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function formatDateKey(value: Date | number | string | undefined): string {
  const date = value == null ? new Date() : new Date(value);
  if (!Number.isFinite(date.getTime())) return formatDateKey(undefined);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDateTime(ms: number): string {
  const date = new Date(ms);
  if (!Number.isFinite(date.getTime())) return "not available";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d} ${h}:${min}`;
}

function formatDuration(seconds?: number): string {
  if (!isFiniteNumber(seconds) || seconds <= 0) return "not available";
  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours} hr ${minutes} min` : `${hours} hr`;
}

function formatDistance(meters?: number): string {
  return formatDistanceMiKm(meters);
}

function formatPace(secondsPerMile?: number): string {
  if (!isFiniteNumber(secondsPerMile) || secondsPerMile <= 0) return "not available";
  const rounded = Math.round(secondsPerMile);
  const minutes = Math.floor(rounded / 60);
  const seconds = rounded % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}/mi`;
}

function pluralizeWalkCount(count: number): string {
  return `${count} ${count === 1 ? "walk" : "walks"}`;
}

function cleanInline(value: string | undefined): string | undefined {
  const cleaned = String(value ?? "")
    .replace(/\r/g, "")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || undefined;
}

function extractNotesText(notes: string | undefined): string | undefined {
  const lines = String(notes ?? "").replace(/\r/g, "").split("\n");
  for (const rawLine of lines) {
    const match = rawLine.trim().match(/^(?:notes?|comment):\s*(.*)$/i);
    const value = cleanInline(match?.[1]);
    if (value) return value;
  }
  return undefined;
}

function formatWindow(title: string, window: CardioWalkWindowSummary): string[] {
  return [
    title,
    `- Walks: ${window.count}`,
    `- Total duration: ${formatDuration(window.totalDurationSeconds)}`,
    `- Total distance: ${formatDistance(window.totalDistanceMeters)}`,
    `- Average duration: ${formatDuration(window.averageDurationSeconds)}`,
    `- Average pace: ${formatPace(window.averagePaceSecondsPerMile)}`,
  ];
}

function formatWalkRow(walk: CardioWalkEvent, suspiciousPaceSessionIds: Set<string>): string {
  const fields = [
    formatDateTime(walk.startedAt),
    cleanInline(walk.name) ?? "Walk",
    formatDuration(walk.durationSeconds),
    formatDistance(walk.distanceMeters),
    formatPace(walk.paceSecondsPerMile),
    suspiciousPaceSessionIds.has(walk.sessionId) ? "Suspicious pace" : undefined,
    cleanInline(walk.route),
    cleanInline(walk.source) ? `Source ${cleanInline(walk.source)}` : undefined,
    cleanInline(walk.elevationText) ? `Elevation ${cleanInline(walk.elevationText)}` : undefined,
    isFiniteNumber(walk.avgHr) ? `Avg HR ${Math.round(walk.avgHr)}` : undefined,
    isFiniteNumber(walk.maxHr) ? `Max HR ${Math.round(walk.maxHr)}` : undefined,
    extractNotesText(walk.notes) ? `Notes ${extractNotesText(walk.notes)}` : undefined,
  ].filter((field): field is string => !!field);

  return `- ${fields.join(" | ")}`;
}

function formatDailyRow(day: CardioDailyWalkSummary): string {
  return `- ${day.date} | ${pluralizeWalkCount(day.count)} | ${formatDuration(day.totalDurationSeconds)} | ${formatDistance(day.totalDistanceMeters)}`;
}

export function buildCardioExportText(
  summary: CardioWalkSummary,
  options: BuildCardioExportTextOptions = {}
): string {
  const lines: string[] = [
    "IronForge Cardio Export",
    `Generated: ${formatDateKey(options.generatedAt)}`,
    "",
    "Questions to answer:",
    "1. Is dedicated walking/cardio volume becoming more consistent?",
    "2. Is walking volume building aerobic base and durability without obvious recovery cost?",
    "3. Are pace, duration, distance, route, HR, or elevation signals worth reviewing?",
    "4. Is there enough data to compare like with like?",
    "",
    "Cardio Summary",
    ...formatWindow("Last 7 Days", summary.last7d),
    "",
    ...formatWindow("Last 28 Days", summary.last28d),
    "",
    "Recent Walks",
  ];

  if (summary.recentWalks.length) {
    const suspiciousPaceSessionIds = new Set(summary.dataQuality.suspiciousPaceSessionIds);
    lines.push(...summary.recentWalks.map((walk) => formatWalkRow(walk, suspiciousPaceSessionIds)));
  } else {
    lines.push("- No imported walk sessions were found in History.");
  }

  lines.push("", "Daily Totals");
  if (summary.dailySummaries.length) {
    lines.push(...summary.dailySummaries.map(formatDailyRow));
  } else {
    lines.push("- No imported walk sessions were found in History.");
  }

  lines.push(
    "",
    "Data Quality",
    `- Missing distance: ${summary.dataQuality.missingDistanceCount}`,
    `- Missing duration: ${summary.dataQuality.missingDurationCount}`,
    `- Suspicious pace: ${summary.dataQuality.suspiciousPaceCount}`,
    "- Pace shown only when distance and duration are available.",
    "- Suspicious rows are shown in Recent Walks but excluded from summary totals and averages.",
    "- Suspicious pace means faster than 10:00/mi or slower than 35:00/mi when pace can be computed.",
    "- Route, elevation, and HR are note-derived fields when present.",
    "- Zone distribution, route trends, and lifting interference are not modeled yet.",
    "",
    "Source Notes",
    "- Walk data comes from History-backed conditioning sessions.",
    "- MapMyWalk screenshots should be converted to IF paste format and imported through Paste Workout.",
    "- Manual legacy db.walks rows are not included in this export."
  );

  return lines.join("\n");
}
