import type { CardioActivityType } from "./cardioActivityType";
import { getCardioComparisonIdentity } from "./cardioComparisonFamily";
import type { CardioFormat } from "./cardioFormat";
import type { CardioIntent } from "./cardioIntent";
import { getCardioPaceQuality } from "./cardioPaceQuality";
import type { CardioWalkEvent } from "./cardioTypes";

export const SIMILAR_HR_TOLERANCE_BPM = 3;
export const MATERIAL_HR_DIFFERENCE_BPM = 5;
export const MAX_CARDIO_PROGRESSION_OBSERVATIONS = 5;

export type CardioProgressionSignal =
  | "possible_efficiency_improvement"
  | "higher_effort"
  | "lower_effort"
  | "broadly_similar"
  | "pace_only_improvement"
  | "pace_only_decline"
  | "insufficient_context";

export type CardioProgressionObservation = {
  sessionId: string;
  date: string;
  startedAt: number;
  paceSecondsPerMile?: number;
  avgHr?: number;
  durationSeconds?: number;
  distanceMeters?: number;
  elevationText?: string;
};

export type CardioComparableGroup = {
  identity: string;
  label: string;
  activityType: CardioActivityType;
  intent?: CardioIntent;
  cardioFormat: CardioFormat;
  routeFamily: string;
  observations: number;
  recent: CardioProgressionObservation;
  prior?: CardioProgressionObservation;
  recentObservations: CardioProgressionObservation[];
  signal: CardioProgressionSignal;
};

export type CardioProgressionContext = {
  recentComparableGroups: CardioComparableGroup[];
  summary: {
    comparableSessionCount: number;
    groupsWithTrend: number;
  };
};

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function observation(event: CardioWalkEvent): CardioProgressionObservation {
  return {
    sessionId: event.sessionId,
    date: event.date,
    startedAt: event.startedAt,
    paceSecondsPerMile: event.paceSecondsPerMile,
    avgHr: event.avgHr,
    durationSeconds: event.durationSeconds,
    distanceMeters: event.distanceMeters,
    elevationText: event.elevationText,
  };
}

export function getCardioProgressionSignal(
  recent: Pick<CardioProgressionObservation, "paceSecondsPerMile" | "avgHr">,
  prior: Pick<CardioProgressionObservation, "paceSecondsPerMile" | "avgHr">
): CardioProgressionSignal {
  if (!finite(recent.paceSecondsPerMile) || !finite(prior.paceSecondsPerMile)) return "insufficient_context";
  const paceDifference = recent.paceSecondsPerMile - prior.paceSecondsPerMile;
  const similarPace = Math.abs(paceDifference) <= Math.max(15, prior.paceSecondsPerMile * 0.02);
  if (!finite(recent.avgHr) || !finite(prior.avgHr)) {
    if (paceDifference < 0) return "pace_only_improvement";
    if (paceDifference > 0) return "pace_only_decline";
    return "insufficient_context";
  }

  const hrDifference = recent.avgHr - prior.avgHr;
  if (similarPace && hrDifference <= -MATERIAL_HR_DIFFERENCE_BPM) return "possible_efficiency_improvement";
  if (paceDifference < 0 && hrDifference <= SIMILAR_HR_TOLERANCE_BPM) return "possible_efficiency_improvement";
  if (paceDifference < 0 && hrDifference >= MATERIAL_HR_DIFFERENCE_BPM) return "higher_effort";
  if (paceDifference > 0 && hrDifference <= -MATERIAL_HR_DIFFERENCE_BPM) return "lower_effort";
  if (similarPace && Math.abs(hrDifference) <= SIMILAR_HR_TOLERANCE_BPM) return "broadly_similar";
  return "insufficient_context";
}

export function describeCardioProgressionSignal(
  signal: CardioProgressionSignal,
  recent: CardioProgressionObservation,
  prior: CardioProgressionObservation
): string {
  const paceDifference = (recent.paceSecondsPerMile as number) - (prior.paceSecondsPerMile as number);
  if (signal === "possible_efficiency_improvement") {
    const hrDifference = (recent.avgHr as number) - (prior.avgHr as number);
    const similarPace = Math.abs(paceDifference) <= Math.max(15, (prior.paceSecondsPerMile as number) * 0.02);
    return similarPace && hrDifference <= -MATERIAL_HR_DIFFERENCE_BPM
      ? "similar pace at lower avg HR; possible improved aerobic efficiency signal"
      : "faster pace at similar or lower avg HR; possible improved aerobic efficiency signal";
  }
  if (signal === "higher_effort") return "faster pace at higher effort; efficiency improvement not established";
  if (signal === "lower_effort") return "slower pace at lower effort; improvement not established";
  if (signal === "broadly_similar") return "similar pace with similar avg HR";
  if (signal === "pace_only_improvement") return "faster pace; HR comparison unavailable";
  if (signal === "pace_only_decline") return "slower pace; HR comparison unavailable";
  if (!finite(recent.avgHr) || !finite(prior.avgHr)) return "unchanged pace; HR comparison unavailable";
  const hrDifference = recent.avgHr - prior.avgHr;
  return `${paceDifference < 0 ? "faster" : paceDifference > 0 ? "slower" : "similar"} pace with ${hrDifference < 0 ? "lower" : hrDifference > 0 ? "higher" : "similar"} avg HR`;
}

export function buildCardioProgressionContext(events: CardioWalkEvent[]): CardioProgressionContext {
  const grouped = new Map<string, CardioWalkEvent[]>();
  for (const event of events ?? []) {
    if (!event.activityType || !event.cardioFormat || !finite(event.paceSecondsPerMile)) continue;
    if (getCardioPaceQuality(event) === "suspicious") continue;
    const identity = getCardioComparisonIdentity(event);
    if (!identity) continue;
    const key = [event.activityType, event.cardioFormat, event.conditioningIntent ?? "intent-unknown", identity].join("|");
    const group = grouped.get(key) ?? [];
    group.push(event);
    grouped.set(key, group);
  }

  const recentComparableGroups = Array.from(grouped.entries()).map(([key, eventsInGroup]) => {
    const sorted = eventsInGroup.slice().sort((a, b) => b.startedAt - a.startedAt);
    const observations = sorted.slice(0, MAX_CARDIO_PROGRESSION_OBSERVATIONS).map(observation);
    const recent = observations[0];
    const prior = observations[1];
    return {
      identity: key,
      label: sorted[0].route?.trim() || sorted[0].name.trim() || sorted[0].activityType!,
      activityType: sorted[0].activityType!,
      intent: sorted[0].conditioningIntent,
      cardioFormat: sorted[0].cardioFormat!,
      routeFamily: getCardioComparisonIdentity(sorted[0])!,
      observations: sorted.length,
      recent,
      prior,
      recentObservations: observations,
      signal: prior ? getCardioProgressionSignal(recent, prior) : "insufficient_context",
    } satisfies CardioComparableGroup;
  }).sort((a, b) => b.recent.startedAt - a.recent.startedAt);

  return {
    recentComparableGroups,
    summary: {
      comparableSessionCount: recentComparableGroups.reduce((sum, group) => sum + group.observations, 0),
      groupsWithTrend: recentComparableGroups.filter((group) => group.observations >= 2).length,
    },
  };
}
