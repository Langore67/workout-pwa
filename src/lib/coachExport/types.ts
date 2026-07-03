import type { StrengthPattern } from "../../strength/Strength";
import type { PhaseQualityResult } from "../../body/phaseQualityModel";
import type { CurrentPhase } from "../../config/appConfig";
import type { BodyConfidence } from "../../body/bodyConfidenceEngine";
import type { CoachIntelligence } from "./coachIntelligence";
import type { GoalProgress } from "./goalEngine";
import type { LeanPreservationComposite } from "./leanPreservationComposite";

export type CoachExportMetric = {
  latest: number | null;
  baseline14d: number | null;
  delta14d: number | null;
};

export type CoachExportWaistToHeight = CoachExportMetric & {
  status: "Very Lean" | "Healthy" | "Elevated" | "High Risk";
  healthyWaistTargetIn: number;
  distanceToThresholdIn: number | null;
};

export type CoachExportAnchorLift = {
  pattern: StrengthPattern;
  exerciseId?: string | null;
  exerciseName: string | null;
  trackDisplayName: string | null;
  effectiveWeightLb: number | null;
  reps: number | null;
  e1rm: number | null;
  performedAt: number | null;
};

export type CoachExportHydration = {
  latestWaterPct: number | null;
  confidenceLabel: string;
  confidenceScore: number | null;
  note: string;
  distortionLikely?: boolean;
};

export type CoachExportStrengthSignal = {
  current: number | null;
  delta14d: number | null;
  vs90dBestPct: number | null;
  currentBodyweight: number | null;
  bodyweightDaysUsed: number | null;
};

export type CoachExportConfidence = {
  score: number;
  label: "Low" | "Building" | "Moderate" | "Strong";
  components: {
    waistReadiness: number;
    weightDataReady: number;
    strengthDataReady: number;
    coherenceScore: number;
  };
};

export type CoachExportTrainingSignals = {
  movementQuality: string[];
  stimulusCoverage: string[];
  fatigueReadiness: string[];
  nextWorkoutFocus: string[];
  discussWithGaz: string[];
};

export type PatternSummary = {
  movementQuality: string[];
  stimulus: string[];
  fatigue: string[];
  constraints: string[];
  progression: string[];
};

export type CoachingMemoryItem = {
  id: string;
  kind: "validated_learning" | "active_watch" | "resolved";
  label: string;
  sourceType: "session_signal" | "pattern" | "derived";
  sourceSessionId?: string;
  exerciseName?: string;
  pattern?: string;
  confidence: "low" | "moderate" | "high";
  evidenceCount?: number;
  lastSeenAt?: number;
  severity?: "low" | "moderate" | "high";
  status?: "active" | "stale" | "resolved";
  isStale?: boolean;
  decayReason?: string;
  text: string;
};

export type CoachingMemory = {
  validatedLearnings: CoachingMemoryItem[];
  activeWatchItems: CoachingMemoryItem[];
  resolvedItems: CoachingMemoryItem[];
  sourceWindow: {
    sessionCount: number;
    fromDate?: string;
    toDate?: string;
  };
};

export type CoachExportNextWorkoutFocus = {
  progressionGuardrails: string[];
  executionPriorities: string[];
  adjustmentTriggers: string[];
};

export type CoachExportMetrics = {
  generatedAt: number;
  currentPhase: CurrentPhase;
  bodyComp: {
    weight: CoachExportMetric;
    waist: CoachExportMetric;
    bodyFatPct: CoachExportMetric;
    leanMass: CoachExportMetric;
    visceralFat?: CoachExportMetric;
    waistToHeight?: CoachExportWaistToHeight;
    bodyweightDelta7d: number | null;
    bodyweightDelta14d: number | null;
  };
  hydration: CoachExportHydration;
  bodyConfidence?: BodyConfidence;
  coachIntelligence?: CoachIntelligence | null;
  goalProgress?: GoalProgress | null;
  leanPreservation?: LeanPreservationComposite | null;
  strengthSignal: CoachExportStrengthSignal;
  phaseQuality: PhaseQualityResult | null;
  anchorLifts: CoachExportAnchorLift[];
  exerciseVocabulary: string[];
  trainingSignals: CoachExportTrainingSignals;
  coachingMemory?: CoachingMemory;
  patternSummary: PatternSummary;
  nextWorkoutFocus: CoachExportNextWorkoutFocus;
  exportConfidence: CoachExportConfidence;
  readinessNotes: string[];
  dataNotes: string[];
};
