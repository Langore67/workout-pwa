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
