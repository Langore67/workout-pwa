import type { CardioActivityType } from "./cardioActivityType";
import { getCardioComparisonIdentity } from "./cardioComparisonFamily";
import type { CardioFormat } from "./cardioFormat";
import type { CardioIntent } from "./cardioIntent";
import { getCardioPaceQuality } from "./cardioPaceQuality";
import type { CardioWalkEvent } from "./cardioTypes";

export const SIMILAR_HR_TOLERANCE_BPM = 3;
export const MATERIAL_HR_DIFFERENCE_BPM = 5;
export const CARDIO_PROGRESSION_LOOKBACK_DAYS = 28;
export const MAX_CARDIO_PROGRESSION_OBSERVATIONS = 5;
export const MAX_CARDIO_PROGRESSION_GROUPS = 3;

export type CardioProgressionDirection = "higher" | "lower" | "similar" | "insufficient_context";
export type CardioProgressionSignal = CardioProgressionDirection;
export type CardioComparability = "exact_route" | "same_activity_format_intent" | "route_unknown";

export type CardioProgressionObservation = {
  sessionId: string;
  date: string;
  startedAt: number;
  activityType: CardioActivityType;
  intent?: CardioIntent;
  format: CardioFormat;
  distance?: number;
  distanceUnit?: "mi" | "km";
  distanceMeters?: number;
  durationSeconds?: number;
  paceSecondsPerMile?: number;
  paceSecondsPerKm?: number;
  avgHrBpm?: number;
  maxHrBpm?: number;
  avgHr?: number;
  elevationGain?: number;
  elevationUnit?: "ft" | "m";
  elevationText?: string;
  routeId?: string;
  routeName?: string;
  source?: string;
  provenance?: CardioWalkEvent["metricProvenance"];
};

export type CardioComparableGroup = {
  identity: string;
  label: string;
  activityType: CardioActivityType;
  intent?: CardioIntent;
  cardioFormat: CardioFormat;
  routeFamily: string;
  comparability: CardioComparability;
  observationCount: number;
  observations: number;
  latestObservationAt: number;
  direction: CardioProgressionDirection;
  signal: CardioProgressionDirection;
  bestRecentObservation?: CardioProgressionObservation;
  recent: CardioProgressionObservation;
  prior?: CardioProgressionObservation;
  recentObservations: CardioProgressionObservation[];
  limitations: string[];
  paceDifferenceSecondsPerMile?: number;
  averageHrDifferenceBpm?: number;
};

export type CardioProgressionContext = {
  lookbackDays: number;
  maxObservationsPerGroup: number;
  maxGroups: number;
  groups: CardioComparableGroup[];
  recentComparableGroups: CardioComparableGroup[];
  summary: { comparableSessionCount: number; groupsWithTrend: number };
};

function finite(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }

function elevationMeters(event: CardioWalkEvent) {
  if (!finite(event.elevationGain)) return undefined;
  return event.elevationUnit === "ft" ? event.elevationGain * 0.3048 : event.elevationGain;
}

function observation(event: CardioWalkEvent): CardioProgressionObservation {
  return {
    sessionId: event.sessionId, date: event.date, startedAt: event.startedAt, activityType: event.activityType!, intent: event.conditioningIntent, format: event.cardioFormat!,
    distance: event.distance, distanceUnit: event.distanceUnit, distanceMeters: event.distanceMeters, durationSeconds: event.durationSeconds,
    paceSecondsPerMile: event.paceSecondsPerMile, paceSecondsPerKm: finite(event.paceSecondsPerMile) ? event.paceSecondsPerMile / 1.609344 : undefined,
    avgHrBpm: event.avgHr, maxHrBpm: event.maxHr, avgHr: event.avgHr,
    elevationGain: event.elevationGain, elevationUnit: event.elevationUnit, elevationText: event.elevationText,
    routeId: event.routeId, routeName: event.route, source: event.source, provenance: event.metricProvenance ? { ...event.metricProvenance } : undefined,
  };
}

export function getCardioProgressionSignal(recent: Pick<CardioProgressionObservation, "paceSecondsPerMile">, prior: Pick<CardioProgressionObservation, "paceSecondsPerMile">): CardioProgressionDirection {
  if (!finite(recent.paceSecondsPerMile) || !finite(prior.paceSecondsPerMile)) return "insufficient_context";
  const difference = recent.paceSecondsPerMile - prior.paceSecondsPerMile;
  if (Math.abs(difference) <= Math.max(15, prior.paceSecondsPerMile * 0.02)) return "similar";
  return difference > 0 ? "higher" : "lower";
}

export function getAverageHrDirection(recent?: number, prior?: number): CardioProgressionDirection {
  if (!finite(recent) || !finite(prior)) return "insufficient_context";
  const difference = recent - prior;
  if (Math.abs(difference) <= SIMILAR_HR_TOLERANCE_BPM) return "similar";
  return difference > 0 ? "higher" : "lower";
}

export function describeCardioProgressionSignal(signal: CardioProgressionDirection, recent: CardioProgressionObservation, prior: CardioProgressionObservation): string {
  if (signal === "insufficient_context") return "insufficient comparable pace context";
  const paceDifference = (recent.paceSecondsPerMile ?? 0) - (prior.paceSecondsPerMile ?? 0);
  const fields = [`pace ${signal} by ${Math.round(Math.abs(paceDifference))} sec/mi`];
  if (finite(recent.avgHrBpm) && finite(prior.avgHrBpm)) fields.push(`average HR ${getAverageHrDirection(recent.avgHrBpm, prior.avgHrBpm)} by ${Math.abs(recent.avgHrBpm - prior.avgHrBpm)} bpm`);
  return fields.join("; ");
}

function limitations(events: CardioWalkEvent[], comparability: CardioComparability) {
  const result: string[] = [];
  if (comparability === "route_unknown") result.push("Route identity is unavailable.");
  if (events.length < 2) result.push("Only one comparable observation is available.");
  if (events.some((event) => !finite(event.avgHr))) result.push("Average HR is unavailable for one or more observations.");
  if (events.some((event) => event.elevationGain == null)) result.push("Structured elevation is unavailable for one or more observations.");
  if (events.some((event) => Object.values(event.metricProvenance ?? {}).includes("legacy_notes"))) result.push("One or more measurements use legacy note-derived data.");
  const provenance = new Set(events.flatMap((event) => Object.values(event.metricProvenance ?? {})));
  if (provenance.size > 1) result.push("Measurements use mixed provenance.");
  if (events.length >= 2) {
    const recentElevation = elevationMeters(events[0]);
    const priorElevation = elevationMeters(events[1]);
    const structuredDifference = finite(recentElevation) && finite(priorElevation)
      && Math.abs(recentElevation - priorElevation) > Math.max(7.62, priorElevation * 0.1);
    const legacyDifference = !finite(recentElevation) && !finite(priorElevation)
      && !!events[0].elevationText && !!events[1].elevationText && events[0].elevationText !== events[1].elevationText;
    if (structuredDifference || legacyDifference) result.push("Elevation differs between the latest observations.");
  }
  return result;
}

export function buildCardioProgressionContext(events: readonly CardioWalkEvent[], options: { asOf?: number; lookbackDays?: number; maxGroups?: number } = {}): CardioProgressionContext {
  const source = events ?? [];
  const asOf = options.asOf ?? (source.reduce((latest, event) => Math.max(latest, event.startedAt), 0) || Date.now());
  const lookbackDays = options.lookbackDays ?? CARDIO_PROGRESSION_LOOKBACK_DAYS;
  const cutoff = asOf - lookbackDays * 86400000;
  const grouped = new Map<string, CardioWalkEvent[]>();
  for (const event of source) {
    if (event.startedAt < cutoff || event.startedAt > asOf || !event.activityType || !event.cardioFormat) continue;
    if (finite(event.paceSecondsPerMile) && getCardioPaceQuality(event) === "suspicious") continue;
    const identity = getCardioComparisonIdentity(event);
    if (!identity) continue;
    const key = [event.activityType, event.cardioFormat, event.conditioningIntent ?? "intent-unknown", identity].join("|");
    grouped.set(key, [...(grouped.get(key) ?? []), event]);
  }
  const allGroups = Array.from(grouped.entries()).map(([identity, members]) => {
    const sorted = members.slice().sort((a, b) => b.startedAt - a.startedAt || a.sessionId.localeCompare(b.sessionId));
    const capped = sorted.slice(0, MAX_CARDIO_PROGRESSION_OBSERVATIONS);
    const observations = capped.map(observation); const recent = observations[0]; const prior = observations[1];
    const routeFamily = getCardioComparisonIdentity(sorted[0])!;
    const comparability: CardioComparability = routeFamily.startsWith("route-id:") ? "exact_route" : sorted[0].route ? "same_activity_format_intent" : "route_unknown";
    const direction = prior ? getCardioProgressionSignal(recent, prior) : "insufficient_context";
    return {
      identity, label: sorted[0].route?.trim() || sorted[0].name.trim() || sorted[0].activityType!, activityType: sorted[0].activityType!, intent: sorted[0].conditioningIntent,
      cardioFormat: sorted[0].cardioFormat!, routeFamily, comparability, observationCount: sorted.length, observations: sorted.length,
      latestObservationAt: recent.startedAt, direction, signal: direction,
      bestRecentObservation: observations.some((row) => finite(row.paceSecondsPerMile))
        ? observations.slice().sort((a, b) => (a.paceSecondsPerMile ?? Infinity) - (b.paceSecondsPerMile ?? Infinity))[0]
        : undefined,
      recent, prior, recentObservations: observations, limitations: limitations(capped, comparability),
      ...(prior ? { paceDifferenceSecondsPerMile: recent.paceSecondsPerMile! - prior.paceSecondsPerMile! } : {}),
      ...(prior && finite(recent.avgHrBpm) && finite(prior.avgHrBpm) ? { averageHrDifferenceBpm: recent.avgHrBpm - prior.avgHrBpm } : {}),
    } satisfies CardioComparableGroup;
  });
  allGroups.sort((a, b) => Number(b.intent === "fitness" && b.observationCount >= 2) - Number(a.intent === "fitness" && a.observationCount >= 2) || Number(b.comparability === "exact_route" && b.observationCount >= 2) - Number(a.comparability === "exact_route" && a.observationCount >= 2) || Number(b.observationCount >= 2) - Number(a.observationCount >= 2) || b.latestObservationAt - a.latestObservationAt || a.identity.localeCompare(b.identity));
  const groups = allGroups.slice(0, options.maxGroups ?? MAX_CARDIO_PROGRESSION_GROUPS);
  return { lookbackDays, maxObservationsPerGroup: MAX_CARDIO_PROGRESSION_OBSERVATIONS, maxGroups: options.maxGroups ?? MAX_CARDIO_PROGRESSION_GROUPS, groups, recentComparableGroups: groups, summary: { comparableSessionCount: groups.reduce((sum, group) => sum + group.observationCount, 0), groupsWithTrend: groups.filter((group) => group.observationCount >= 2).length } };
}
