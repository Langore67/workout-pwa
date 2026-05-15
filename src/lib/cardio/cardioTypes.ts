import type { Exercise, Session, SetEntry, Track } from "../../db";

export type CardioWalkConfidence = "high" | "medium";

export type CardioWalkEvent = {
  sessionId: string;
  startedAt: number;
  endedAt?: number;
  date: string;
  name: string;
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
