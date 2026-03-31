import type { StrengthPattern } from "../../strength/Strength";
import type { PhaseQualityResult } from "../../body/phaseQualityModel";

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

export type CoachExportMetrics = {
  generatedAt: number;
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
  readinessNotes: string[];
  dataNotes: string[];
};
