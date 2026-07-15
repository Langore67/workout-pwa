import type { StrengthPattern } from "../../strength/Strength";
import type { PhaseQualityResult } from "../../body/phaseQualityModel";
import type { CurrentPhase } from "../../config/appConfig";
import type { BodyConfidence } from "../../body/bodyConfidenceEngine";
import type { CardioWalkSummary } from "../cardio/cardioTypes";
import type { CoachIntelligence } from "./coachIntelligence";
import type { GoalProgress } from "./goalEngine";
import type { LeanPreservationComposite } from "./leanPreservationComposite";

export type CoachExportMetric = {
  latest: number | null;
  baseline14d: number | null;
  delta14d: number | null;
};

export type CoachExportBodyTrendMetric = {
  rawLatest: number | null;
  rolling5: number | null;
  baseline14d: number | null;
  delta14d: number | null;
  sampleCount: number;
  latestAt: number | null;
  baselineSampleCount: number;
};

export type CoachExportBodyTrendInputs = {
  method: "rolling_5_data_points_except_waist";
  weight7d: CoachExportBodyTrendMetric;
  weight14d: CoachExportBodyTrendMetric;
  bodyFatPct: CoachExportBodyTrendMetric;
  leanMass: CoachExportBodyTrendMetric;
  fatMass: CoachExportBodyTrendMetric;
  bodyWaterPct?: CoachExportBodyTrendMetric | null;
  waist: {
    rawLatest: number | null;
    baseline14d: number | null;
    delta14d: number | null;
    sampleCount: number;
    latestAt: number | null;
  };
};

export type CoachExportRecency = "recent" | "historical" | "stale";

export type AnchorMovementFamily =
  | "horizontal_push"
  | "vertical_push"
  | "horizontal_pull"
  | "vertical_pull"
  | "hinge"
  | "squat"
  | "single_leg"
  | "glute_extension"
  | "carry"
  | "core"
  | "unknown";

export type CoachExportAnchorStatus =
  | "current_recent"
  | "historical_anchor"
  | "stale_anchor"
  | "missing_date";

export type CoachExportAnchorRelationship =
  | "same_exercise"
  | "same_family_different_exercise"
  | "different_family"
  | "unknown";

export type CoachExportAnchorCurrentMovement = {
  exerciseName: string;
  movementFamily: AnchorMovementFamily;
  performedAt?: number | null;
  ageDays?: number | null;
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
  ageDays?: number | null;
  recency?: CoachExportRecency;
  isStale?: boolean;
  movementFamily?: AnchorMovementFamily;
  status?: CoachExportAnchorStatus;
  currentMovement?: CoachExportAnchorCurrentMovement | null;
  relationship?: CoachExportAnchorRelationship;
  interpretation?: string | null;
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

export type CoachExportOverallStatus = "solid" | "watch" | "intervene" | "not_enough_data";

export type CoachExportMovementFocusGroup = {
  label: "Pull" | "Push" | "Hinge" | "Squat / Legs" | "Carry" | "Core";
  exercises: string[];
};

export type CoachExportCurrentMovementFocus = CoachExportMovementFocusGroup[];

export type CoachExportNextWorkoutFocus = {
  progressionGuardrails: string[];
  executionPriorities: string[];
  adjustmentTriggers: string[];
};

export type VolumeCreditKind = "prime" | "support" | "exposure";

export type VolumeBucket =
  | "chest_pressing"
  | "upper_chest"
  | "chest_isolation"
  | "lats"
  | "mid_back_rows"
  | "rear_delts"
  | "upper_traps"
  | "lower_traps_scapular_control"
  | "spinal_erectors"
  | "serratus_scapular_control"
  | "anterior_delts"
  | "lateral_delts"
  | "rotator_cuff_external_rotation"
  | "biceps_pull_support"
  | "biceps_curl_supinated"
  | "biceps_hammer_brachialis"
  | "triceps_press_support"
  | "triceps_isolation"
  | "triceps_overhead_long_head"
  | "quads"
  | "hamstrings"
  | "glute_max"
  | "glute_med_min"
  | "adductors"
  | "hip_flexors"
  | "calves"
  | "tibialis_anterior"
  | "anterior_core"
  | "lateral_core"
  | "anti_rotation_core"
  | "carry_grip";

export type ExerciseVolumeContribution = {
  prime?: VolumeBucket[];
  support?: VolumeBucket[];
  exposure?: VolumeBucket[];
};

export type CoachExportWeeklyVolumeGroup = {
  bucket: VolumeBucket;
  label: string;
  primeCredit: number;
  supportCredit: number;
  exposureCount: number;
  totalCredit: number;
  status: CoachExportOverallStatus;
  examples: string[];
};

export type CoachExportWeeklyVolumeRollupPart = {
  bucket: VolumeBucket;
  label: string;
  credit: number;
  exposureCount?: number;
};

export type CoachExportWeeklyVolumeRollup = {
  id: string;
  label: string;
  totalCredit: number;
  exposureCount?: number;
  status: CoachExportOverallStatus;
  parts: CoachExportWeeklyVolumeRollupPart[];
  note?: string;
};

export type CoachExportWeeklyVolumeBalance = {
  id: "push_pull" | "pressing_scapular" | "quad_posterior_chain" | "glute_max_med_min" | "arms" | "core_carry";
  label: string;
  leftLabel: string;
  rightLabel: string;
  leftValue: number;
  rightValue: number;
  ratio: number | null;
  status: CoachExportOverallStatus;
  statusLabel: string;
  direction: "balanced" | "left_ahead" | "right_ahead" | "not_enough_data";
  summary: string;
  currentText: string;
  explanation: string;
  action: string;
  ratioText?: string;
  isContextuallyAcceptable?: boolean;
  note: string;
};

export type CoachExportWeeklyVolume = {
  windowDays: number;
  asOf?: string;
  groups: CoachExportWeeklyVolumeGroup[];
  rollups: CoachExportWeeklyVolumeRollup[];
  balances: CoachExportWeeklyVolumeBalance[];
  unclassified?: Array<{
    exerciseName: string;
    setCount: number;
  }>;
  status: CoachExportOverallStatus;
  summary: string;
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
  bodyTrendInputs?: CoachExportBodyTrendInputs;
  hydration: CoachExportHydration;
  cardioSummary?: CardioWalkSummary;
  bodyConfidence?: BodyConfidence;
  coachIntelligence?: CoachIntelligence | null;
  goalProgress?: GoalProgress | null;
  leanPreservation?: LeanPreservationComposite | null;
  strengthSignal: CoachExportStrengthSignal;
  phaseQuality: PhaseQualityResult | null;
  anchorLifts: CoachExportAnchorLift[];
  currentMovementFocus?: CoachExportCurrentMovementFocus;
  exerciseVocabulary: string[];
  trainingSignals: CoachExportTrainingSignals;
  coachingMemory?: CoachingMemory;
  patternSummary: PatternSummary;
  nextWorkoutFocus: CoachExportNextWorkoutFocus;
  exportConfidence: CoachExportConfidence;
  weeklyVolume?: CoachExportWeeklyVolume;
  readinessNotes: string[];
  dataNotes: string[];
};
