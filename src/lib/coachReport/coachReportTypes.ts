import type {
  AnchorMovementFamily,
  CoachExportAnchorCurrentMovement,
  CoachExportAnchorRelationship,
  CoachExportAnchorStatus,
  CoachExportOverallStatus,
} from "../coachExport/types";

export type CoachReportLine = {
  label: string;
  value: string;
  text: string;
  latest?: string;
  coachAverage?: string;
  method?: "rolling_5" | "latest_manual" | "raw" | string;
  delta?: string;
};

export type CoachReportSectionBlock = {
  heading: string;
  items: string[];
};

export type CoachReportSection = {
  title: string;
  status?: string;
  confidence?: string;
  rows?: CoachReportLine[];
  bullets?: string[];
  positive?: string[];
  negative?: string[];
  note?: string;
  blocks?: CoachReportSectionBlock[];
};

export type CoachReportAnchor = {
  label: string;
  text: string;
  recency?: string;
  ageText?: string;
  isStale?: boolean;
  movementFamily?: AnchorMovementFamily;
  status?: CoachExportAnchorStatus;
  statusLabel?: string;
  currentMovement?: CoachExportAnchorCurrentMovement | null;
  relationship?: CoachExportAnchorRelationship;
  interpretation?: string | null;
  familyLabel?: string;
  currentMovementText?: string;
  relationshipText?: string;
  read?: string;
};

export type CoachReportSnapshot = {
  status: string;
  confidence: string;
  why: string;
  today: string;
  biggestWin?: string;
  biggestRisk?: string;
};

export type CoachReportBody = {
  heading: string;
  note?: string;
  values: CoachReportLine[];
  confidenceRows: CoachReportLine[];
};

export type CoachReportPerformance = {
  trend?: string;
  strengthSignal?: string;
  movementQuality?: string;
  anchor?: CoachReportAnchor;
  read?: string;
};

export type CoachReportGoals = {
  trajectory?: string;
  read?: string;
  targets: CoachReportLine[];
};

export type CoachReportLearnings = {
  whatsWorking: string[];
  watchNow: string[];
};

export type CoachReportCardio = {
  status?: string;
  rows: CoachReportLine[];
  note?: string;
  isEmpty?: boolean;
};

export type CoachReportWeeklyVolume = {
  title: "Weekly Volume";
  status?: string;
  note?: string;
  rows: CoachReportLine[];
  balanceRows: CoachReportWeeklyVolumeBalance[];
  detailRows?: CoachReportLine[];
  unclassified?: string[];
};

export type CoachReportWeeklyVolumeBalance = {
  id: "push_pull" | "pressing_scapular" | "quad_posterior_chain" | "glute_max_med_min" | "arms" | "core_carry";
  label: string;
  leftLabel: string;
  rightLabel: string;
  leftValue: number;
  rightValue: number;
  ratio: number | null;
  status: string;
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

export type CoachReport = {
  generatedAt?: string;
  snapshot: CoachReportSnapshot;
  body?: CoachReportBody;
  waistToHeight?: CoachReportSection;
  summary?: CoachReportSection;
  hydration?: CoachReportSection;
  trainingSignals?: CoachReportSection;
  readinessNotes?: CoachReportSection;
  dataGaps?: CoachReportSection;
  performance?: CoachReportPerformance;
  weeklyVolume?: CoachReportWeeklyVolume;
  goals?: CoachReportGoals;
  learnings?: CoachReportLearnings;
  cardio?: CoachReportCardio;
  exportOnly?: {
    leanPreservation?: CoachReportSection;
    visceralFat?: CoachReportSection;
    phaseQuality?: CoachReportSection;
    strengthSignalDetails?: CoachReportSection;
    currentMovementFocus?: CoachReportSection;
    nextWorkoutFocus?: CoachReportSection;
    recentPatterns?: CoachReportSection;
  };
};
