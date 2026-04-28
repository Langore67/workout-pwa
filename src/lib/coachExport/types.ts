import type { StrengthPattern } from "../../strength/Strength";
import type { PhaseQualityResult } from "../../body/phaseQualityModel";
import type { CurrentPhase } from "../../config/appConfig";

export type CoachExportMetric = {
  latest: number | null;
  baseline14d: number | null;
  delta14d: number | null;
};

export type CoachExportAnchorLift = {
  pattern: StrengthPattern;
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
    bodyweightDelta7d: number | null;
    bodyweightDelta14d: number | null;
  };
  hydration: CoachExportHydration;
  strengthSignal: CoachExportStrengthSignal;
  phaseQuality: PhaseQualityResult | null;
  anchorLifts: CoachExportAnchorLift[];
  trainingSignals: CoachExportTrainingSignals;
  patternSummary: PatternSummary;
  nextWorkoutFocus: CoachExportNextWorkoutFocus;
  exportConfidence: CoachExportConfidence;
  readinessNotes: string[];
  dataNotes: string[];
};
