import type { Exercise, Session, SetEntry, Track } from "../../db";
import type { CardioActivityType } from "./cardioActivityType";
import type { CardioIntent } from "./cardioIntent";
import type { CardioFormat } from "./cardioFormat";
import {
  isAdventureCardioIntent,
  isFitnessCardioIntent,
  isRecoveryCardioIntent,
} from "./cardioIntent";

export type CardioWalkConfidence = "high" | "medium";
export type CardioWalkIntent = CardioIntent;

export type CardioWalkEvent = {
  sessionId: string;
  startedAt: number;
  endedAt?: number;
  date: string;
  name: string;
  activityType?: CardioActivityType;
  conditioningIntent?: CardioWalkIntent;
  cardioFormat?: CardioFormat;
  source?: string;
  route?: string;
  durationSeconds?: number;
  distanceMeters?: number;
  paceSecondsPerMile?: number;
  elevationText?: string;
  avgHr?: number;
  maxHr?: number;
  notes?: string;
  confidence: CardioWalkConfidence;
};

export type CardioDailyWalkSummary = {
  date: string;
  count: number;
  totalDurationSeconds: number;
  totalDistanceMeters: number;
  sessionIds: string[];
};

export type CardioWalkWindowSummary = {
  count: number;
  totalDurationSeconds: number;
  totalDistanceMeters: number;
  averageDurationSeconds?: number;
  averagePaceSecondsPerMile?: number;
};

export type CardioWalkDataQuality = {
  missingDistanceCount: number;
  missingDurationCount: number;
  suspiciousPaceCount: number;
  suspiciousPaceSessionIds: string[];
  notesFieldCoverage: {
    source: number;
    route: number;
    pace: number;
    elevation: number;
    avgHr: number;
    maxHr: number;
    notes: number;
  };
  unsupportedSignals: Array<"routeTrend" | "zoneDistribution" | "liftingInterference">;
};

export type CardioWalkSummary = {
  normalizedWalks: CardioWalkEvent[];
  recentWalks: CardioWalkEvent[];
  dailySummaries: CardioDailyWalkSummary[];
  last7d: CardioWalkWindowSummary;
  last28d: CardioWalkWindowSummary;
  dataQuality: CardioWalkDataQuality;
};

export type BuildCardioWalkSummaryInput = {
  sessions: Session[];
  sets: SetEntry[];
  tracks: Track[];
  exercises: Exercise[];
  now?: number;
  recentLimit?: number;
};

export function isFitnessWalk(event: Pick<CardioWalkEvent, "conditioningIntent">): boolean {
  return isFitnessCardioIntent(event.conditioningIntent);
}

export function isRecoveryWalk(event: Pick<CardioWalkEvent, "conditioningIntent">): boolean {
  return isRecoveryCardioIntent(event.conditioningIntent);
}

export function isAdventureWalk(event: Pick<CardioWalkEvent, "conditioningIntent">): boolean {
  return isAdventureCardioIntent(event.conditioningIntent);
}
