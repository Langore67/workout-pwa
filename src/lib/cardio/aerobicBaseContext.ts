import { buildTrainingCalendarBoundaries, localDateKey } from "../../domain/training/trainingCalendarContext";
import type { CardioActivityType } from "./cardioActivityType";
import type { CardioFormat } from "./cardioFormat";
import type { CardioIntent } from "./cardioIntent";
import type { CardioWalkEvent } from "./cardioTypes";

export type AerobicBaseDerivationMethod = "mapmywalk_zone_3_proxy" | "unavailable";

export type AerobicBaseObservation = {
  sessionId: string;
  startedAt: number;
  activityType?: CardioActivityType;
  intent?: CardioIntent;
  format?: CardioFormat;
  aerobicBaseSeconds?: number;
  method: AerobicBaseDerivationMethod;
  source?: string;
  provider?: string;
  zoneSource?: string;
  hasZoneData: boolean;
  limitations: string[];
};

export type AerobicBaseWindowStatus = "in_progress" | "complete" | "rolling";

export type AerobicBaseWindow = {
  startAt: number;
  endAt: number;
  startLocalDate: string;
  endLocalDate: string;
  status: AerobicBaseWindowStatus;
  totalAerobicBaseSeconds: number;
  totalCardioSessions: number;
  contributingSessions: number;
  cardioSessionsWithZoneData: number;
  cardioSessionsWithoutZoneData: number;
  cardioSessionsWithoutUsableZoneEvidence: number;
  observations: AerobicBaseObservation[];
  limitations: string[];
};

export type AerobicBaseContext = {
  generatedAt: number;
  method: "mapmywalk_zone_3_proxy";
  currentWeekToDate: AerobicBaseWindow;
  previousCompleteWeek: AerobicBaseWindow;
  rolling14Days: AerobicBaseWindow;
};

function normalizedSource(value: string | undefined) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function isMapMyWalkZoneEvidence(event: Pick<CardioWalkEvent, "provider" | "heartRateZones">) {
  const zoneSource = normalizedSource(event.heartRateZones?.source);
  const provider = normalizedSource(event.provider);
  const candidate = zoneSource || provider;
  return candidate.includes("mapmywalk") || candidate.includes("mapmyfitness");
}

export function deriveAerobicBaseObservation(event: CardioWalkEvent): AerobicBaseObservation {
  const zones = event.heartRateZones?.zones ?? [];
  const base = {
    sessionId: event.sessionId,
    startedAt: event.startedAt,
    ...(event.activityType ? { activityType: event.activityType } : {}),
    ...(event.conditioningIntent ? { intent: event.conditioningIntent } : {}),
    ...(event.cardioFormat ? { format: event.cardioFormat } : {}),
    ...(event.source ? { source: event.source } : {}),
    ...(event.provider ? { provider: event.provider } : {}),
    ...(event.heartRateZones?.source ? { zoneSource: event.heartRateZones.source } : {}),
    hasZoneData: zones.length > 0,
  };
  if (!zones.length) return { ...base, method: "unavailable", limitations: ["HR-zone evidence is unavailable."] };
  if (!isMapMyWalkZoneEvidence(event)) {
    return { ...base, method: "unavailable", limitations: ["HR-zone evidence is not identified as MapMyWalk or MapMyFitness zones."] };
  }
  const zone3 = zones.find((zone) => zone.zone === 3 && Number.isFinite(zone.seconds) && zone.seconds > 0);
  if (!zone3) return { ...base, method: "unavailable", limitations: ["MapMyWalk-compatible HR-zone evidence does not include Zone 3."] };
  return {
    ...base,
    aerobicBaseSeconds: zone3.seconds,
    method: "mapmywalk_zone_3_proxy",
    limitations: ["Aerobic-base exposure uses the MapMyWalk Zone 3 proxy; it is not a physiological zone classification."],
  };
}

function buildWindow(args: {
  observations: AerobicBaseObservation[];
  startAt: number;
  endAt: number;
  endExclusive?: boolean;
  status: AerobicBaseWindowStatus;
  observationLimit: number;
}): AerobicBaseWindow {
  const inRange = (at: number) => at >= args.startAt && (args.endExclusive ? at < args.endAt : at <= args.endAt);
  const observations = args.observations.filter((observation) => inRange(observation.startedAt));
  const contributing = observations.filter((observation) => observation.method === "mapmywalk_zone_3_proxy" && observation.aerobicBaseSeconds != null);
  const withZoneData = observations.filter((observation) => observation.hasZoneData).length;
  const withoutUsable = observations.length - contributing.length;
  const limitations: string[] = [];
  if (!observations.length) limitations.push("No dedicated cardio sessions are documented in this period.");
  else if (withoutUsable) limitations.push(`${withoutUsable} cardio session${withoutUsable === 1 ? "" : "s"} ${withoutUsable === 1 ? "lacks" : "lack"} usable MapMyWalk Zone 3 proxy evidence; documented exposure does not estimate that work.`);
  return {
    startAt: args.startAt,
    endAt: args.endAt,
    startLocalDate: localDateKey(new Date(args.startAt)),
    endLocalDate: localDateKey(new Date(args.endExclusive ? args.endAt - 1 : args.endAt)),
    status: args.status,
    totalAerobicBaseSeconds: contributing.reduce((sum, observation) => sum + (observation.aerobicBaseSeconds ?? 0), 0),
    totalCardioSessions: observations.length,
    contributingSessions: contributing.length,
    cardioSessionsWithZoneData: withZoneData,
    cardioSessionsWithoutZoneData: observations.length - withZoneData,
    cardioSessionsWithoutUsableZoneEvidence: withoutUsable,
    observations: observations.slice(0, args.observationLimit),
    limitations,
  };
}

export function buildAerobicBaseContext(
  events: readonly CardioWalkEvent[],
  options: { asOf?: number; observationLimit?: number } = {}
): AerobicBaseContext {
  const generatedAt = Number.isFinite(options.asOf) ? Number(options.asOf) : Date.now();
  const observationLimit = Math.max(0, Math.floor(options.observationLimit ?? 5));
  const boundaries = buildTrainingCalendarBoundaries(generatedAt);
  const observations = events
    .filter((event) => Number.isFinite(event.startedAt) && event.startedAt <= generatedAt)
    .map(deriveAerobicBaseObservation)
    .sort((a, b) => b.startedAt - a.startedAt);
  return {
    generatedAt,
    method: "mapmywalk_zone_3_proxy",
    currentWeekToDate: buildWindow({ observations, startAt: boundaries.currentWeekStartAt, endAt: generatedAt, status: "in_progress", observationLimit }),
    previousCompleteWeek: buildWindow({ observations, startAt: boundaries.previousWeekStartAt, endAt: boundaries.currentWeekStartAt, endExclusive: true, status: "complete", observationLimit }),
    rolling14Days: buildWindow({ observations, startAt: boundaries.rolling14DaysStartAt, endAt: generatedAt, status: "rolling", observationLimit }),
  };
}
