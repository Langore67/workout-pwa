import type { BodyConfidence } from "../../body/bodyConfidenceEngine";
import type { CardioWalkSummary } from "../cardio/cardioTypes";
import type { CoachIntelligence } from "../coachExport/coachIntelligence";
import type {
  CoachExportAnchorLift,
  CoachExportOverallStatus,
  CoachExportMetrics,
  CoachExportWaistToHeight,
  CoachExportWeeklyVolume,
} from "../coachExport/types";
import type { GoalProgressRow } from "../coachExport/goalEngine";

export type CoachStateOverallStatus = CoachExportOverallStatus;
export type CoachStateConfidence = "low" | "moderate" | "high";

export type CoachStateSnapshot = {
  overallStatus: CoachStateOverallStatus;
  confidence: CoachStateConfidence;
  narrative?: string;
  biggestWin?: string;
  biggestRisk?: string;
  todayFocus?: string;
};

export type CoachStateBody = {
  confidence?: BodyConfidence;
  latestWeightLb?: number;
  weightDelta14dLb?: number;
  latestWaistIn?: number;
  waistDelta14dIn?: number;
  latestBodyFatPct?: number;
  latestLeanMassLb?: number;
  whtr?: {
    current?: number;
    status?: CoachExportWaistToHeight["status"] | string;
    distanceToThresholdIn?: number;
  };
};

export type CoachStateStrengthAnchor = Pick<
  CoachExportAnchorLift,
  | "pattern"
  | "exerciseName"
  | "trackDisplayName"
  | "effectiveWeightLb"
  | "reps"
  | "e1rm"
  | "performedAt"
  | "ageDays"
  | "recency"
  | "isStale"
>;

export type CoachStateStrength = {
  performanceTrend?: CoachIntelligence["performanceTrendStatus"];
  movementQuality?: CoachIntelligence["movementQualityStatus"];
  strengthSignalCurrent?: number;
  strengthSignalDelta14d?: number;
  strengthSignalVsBestPct?: number;
  anchors?: CoachStateStrengthAnchor[];
};

export type CoachStateCardio = {
  available: boolean;
  status: CoachStateOverallStatus;
  note?: string;
  recent?: {
    sessionId: string;
    name: string;
    startedAt: number;
    durationSeconds?: number;
    distanceMeters?: number;
    paceSecondsPerMile?: number;
  };
  walkCount7d?: number;
  totalDuration7dSeconds?: number;
  totalDistance7dMeters?: number;
  walkCount28d?: number;
  totalDuration28dSeconds?: number;
  totalDistance28dMeters?: number;
  averagePace7dSecondsPerMile?: number;
};

export type CoachStateGoalTarget = GoalProgressRow;

export type CoachStateGoals = {
  trajectoryStatus?: string;
  targets?: CoachStateGoalTarget[];
};

export type CoachStateLearnings = {
  validated: string[];
  watchItems: string[];
  resolved: string[];
};

export type CoachStateTrainingVolume = CoachExportWeeklyVolume;

export type CoachStateExport = {
  available: boolean;
  sourceMetrics?: CoachExportMetrics;
};

export type CoachState = {
  generatedAt: number | string;
  snapshot: CoachStateSnapshot;
  body: CoachStateBody;
  strength: CoachStateStrength;
  cardio: CoachStateCardio;
  goals: CoachStateGoals;
  learnings: CoachStateLearnings;
  trainingVolume?: CoachStateTrainingVolume;
  export: CoachStateExport;
};
