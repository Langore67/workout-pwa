import type {
  CardioDailyWalkSummary,
  CardioWalkEvent,
  CardioWalkSummary,
  CardioWalkWindowSummary,
} from "./cardioTypes";
import { getCardioIntentLabel } from "./cardioIntent";
import { CARDIO_ACTIVITY_TYPES, getCardioActivityTypeLabel } from "./cardioActivityType";
import { isAdventureWalk, isFitnessWalk, isRecoveryWalk } from "./cardioTypes";
import { formatDistanceMiKm } from "./formatCardioWalk";
import { getCardioFormatLabel } from "./cardioFormat";

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

function pluralizeActivityCount(count: number): string {
  return `${count} ${count === 1 ? "activity" : "activities"}`;
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

function formatWalkIntent(walk: CardioWalkEvent): string | undefined {
  if (walk.conditioningIntent) return getCardioIntentLabel(walk.conditioningIntent);
  return undefined;
}

function formatActivityType(walk: CardioWalkEvent): string | undefined {
  if (walk.activityType) return getCardioActivityTypeLabel(walk.activityType);
  return undefined;
}

function formatCardioFormat(walk: CardioWalkEvent): string | undefined {
  if (walk.cardioFormat) return getCardioFormatLabel(walk.cardioFormat);
  return undefined;
}

function formatWindow(title: string, window: CardioWalkWindowSummary): string[] {
  return [
    title,
    `- Activities: ${window.count}`,
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
    formatActivityType(walk),
    formatWalkIntent(walk),
    formatCardioFormat(walk),
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
  return `- ${day.date} | ${pluralizeActivityCount(day.count)} | ${formatDuration(day.totalDurationSeconds)} | ${formatDistance(day.totalDistanceMeters)}`;
}

function sumCardioActivity(walks: CardioWalkEvent[]) {
  return {
    count: walks.length,
    totalDurationSeconds: walks.reduce((sum, walk) => sum + (walk.durationSeconds ?? 0), 0),
    totalDistanceMeters: walks.reduce((sum, walk) => sum + (walk.distanceMeters ?? 0), 0),
  };
}

function formatActivityTotals(label: string, totals: ReturnType<typeof sumCardioActivity>): string {
  return `- ${label}: ${pluralizeActivityCount(totals.count)} | ${formatDuration(totals.totalDurationSeconds)} | ${formatDistance(totals.totalDistanceMeters)}`;
}

function normalizeComparisonText(value: string | undefined): string {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function formatComparisonPoint(label: string, walk: CardioWalkEvent): string {
  const hr = isFiniteNumber(walk.avgHr) ? ` @ ${Math.round(walk.avgHr)} avg HR` : "";
  return `- ${label}: ${formatPace(walk.paceSecondsPerMile)}${hr}`;
}

function describeComparison(recent: CardioWalkEvent, prior: CardioWalkEvent): string {
  const recentPace = recent.paceSecondsPerMile as number;
  const priorPace = prior.paceSecondsPerMile as number;
  const paceDifference = recentPace - priorPace;
  const similarPace = Math.abs(paceDifference) <= Math.max(15, priorPace * 0.02);
  const hasHr = isFiniteNumber(recent.avgHr) && isFiniteNumber(prior.avgHr);
  if (!hasHr) return `${paceDifference < 0 ? "faster" : paceDifference > 0 ? "slower" : "unchanged"} pace; HR comparison unavailable`;

  const hrDifference = recent.avgHr - prior.avgHr;
  if (similarPace && hrDifference <= -5) return "similar pace at lower avg HR; possible improved aerobic efficiency signal";
  if (paceDifference < 0 && hrDifference <= 3) return "faster pace at similar or lower avg HR; possible improved aerobic efficiency signal";
  if (paceDifference < 0 && hrDifference >= 5) return "faster pace with higher avg HR; efficiency improvement not established";
  if (paceDifference > 0 && hrDifference <= -5) return "lower avg HR with slower pace; efficiency improvement not established";
  return `${paceDifference < 0 ? "faster" : paceDifference > 0 ? "slower" : "similar"} pace with ${hrDifference < 0 ? "lower" : hrDifference > 0 ? "higher" : "similar"} avg HR`;
}

function buildLikeForLikeComparisons(
  walks: CardioWalkEvent[],
  suspiciousPaceSessionIds: Set<string>
): string[] {
  const groups = new Map<string, CardioWalkEvent[]>();
  for (const walk of walks) {
    if (!walk.activityType || !walk.cardioFormat || !isFiniteNumber(walk.paceSecondsPerMile)) continue;
    if (suspiciousPaceSessionIds.has(walk.sessionId)) continue;
    const routeKey = normalizeComparisonText(walk.route) || "route-unknown";
    const intentKey = walk.conditioningIntent ?? "intent-unknown";
    const key = [walk.activityType, walk.cardioFormat, intentKey, routeKey].join("|");
    const group = groups.get(key) ?? [];
    group.push(walk);
    groups.set(key, group);
  }

  const lines: string[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => b.startedAt - a.startedAt);
    const [recent, prior] = group;
    const route = cleanInline(recent.route);
    const intent = recent.conditioningIntent ? getCardioIntentLabel(recent.conditioningIntent) : undefined;
    const titleParts = [route ?? cleanInline(recent.name) ?? getCardioActivityTypeLabel(recent.activityType!), intent, getCardioFormatLabel(recent.cardioFormat!)];
    lines.push(titleParts.filter(Boolean).join(" — "));
    lines.push(formatComparisonPoint("Recent", recent));
    lines.push(formatComparisonPoint("Prior comparable", prior));
    lines.push(`- Signal: ${describeComparison(recent, prior)}`);
    if (recent.elevationText && prior.elevationText && recent.elevationText !== prior.elevationText) {
      lines.push(`- Elevation context differs: recent ${cleanInline(recent.elevationText)}; prior ${cleanInline(prior.elevationText)}.`);
    }
  }
  return lines;
}

export function buildCardioExportText(
  summary: CardioWalkSummary,
  options: BuildCardioExportTextOptions = {}
): string {
  const suspiciousPaceSessionIds = new Set(summary.dataQuality.suspiciousPaceSessionIds);
  const fitnessWalks = summary.normalizedWalks.filter(
    (walk) => isFitnessWalk(walk) || (!isRecoveryWalk(walk) && !isAdventureWalk(walk))
  );
  const recoveryWalks = summary.normalizedWalks.filter(isRecoveryWalk);
  const adventureWalks = summary.normalizedWalks.filter(isAdventureWalk);
  const fitnessTotals = sumCardioActivity(fitnessWalks);
  const recoveryTotals = sumCardioActivity(recoveryWalks);
  const adventureTotals = sumCardioActivity(adventureWalks);
  const activityTypeTotals = CARDIO_ACTIVITY_TYPES.map((activityType) => ({
    label: getCardioActivityTypeLabel(activityType),
    totals: sumCardioActivity(summary.normalizedWalks.filter((walk) => walk.activityType === activityType)),
  })).filter(({ totals }) => totals.count > 0);
  const untypedTotals = sumCardioActivity(summary.normalizedWalks.filter((walk) => walk.activityType === undefined));
  const comparisons = buildLikeForLikeComparisons(summary.normalizedWalks, suspiciousPaceSessionIds);

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
    "Recent Cardio",
  ];

  if (summary.recentWalks.length) {
    lines.push(...summary.recentWalks.map((walk) => formatWalkRow(walk, suspiciousPaceSessionIds)));
  } else {
    lines.push("- No imported cardio sessions were found in History.");
  }

  lines.push("", "Daily Totals");
  if (summary.dailySummaries.length) {
    lines.push(...summary.dailySummaries.map(formatDailyRow));
  } else {
    lines.push("- No imported cardio sessions were found in History.");
  }

  lines.push(
    "",
    "Cardio Intent Summary",
    formatActivityTotals("Fitness + untagged", fitnessTotals),
    formatActivityTotals("Recovery", recoveryTotals),
    formatActivityTotals("Adventure", adventureTotals)
  );

  lines.push("", "Activity Type Summary");
  lines.push(...activityTypeTotals.map(({ label, totals }) => formatActivityTotals(label, totals)));
  if (untypedTotals.count > 0) lines.push(formatActivityTotals("Untyped", untypedTotals));
  if (!activityTypeTotals.length && untypedTotals.count === 0) lines.push("- No activity type data available.");

  if (comparisons.length) lines.push("", "Like-for-Like Comparisons", ...comparisons);

  lines.push(
    "",
    "Data Quality",
    `- Missing distance: ${summary.dataQuality.missingDistanceCount}`,
    `- Missing duration: ${summary.dataQuality.missingDurationCount}`,
    `- Suspicious pace: ${summary.dataQuality.suspiciousPaceCount}`,
    "- Pace shown only when distance and duration are available.",
    "- Suspicious rows are shown in Recent Cardio and included in activity counts, duration, and distance totals.",
    "- Suspicious rows are excluded from average pace calculations.",
    "- Walk and legacy untyped pace is suspicious below 10:00/mi or above 35:00/mi; other activity types do not inherit walking thresholds.",
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
