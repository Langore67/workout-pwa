import type {
  CoachAction,
  CoachProgrammingPriority,
  CoachReportLine,
  CoachReportWeeklyVolumeBalance,
} from "../coachReport/coachReportTypes";

export type CoachDashboardLine = Readonly<Pick<CoachReportLine, "label" | "value">>;

export type CoachDashboardSnapshot = Readonly<{
  status: string;
  confidence: string;
  why: string;
  today: string;
  programmingPriorities: readonly CoachProgrammingPriority[];
}>;

export type CoachDashboardActions = Readonly<{
  primaryFocus?: Readonly<Pick<CoachAction, "objective" | "reason">>;
}>;

export type CoachDashboardBody = Readonly<{
  heading: string;
  values: readonly CoachDashboardLine[];
  note?: string;
  confidenceRows: readonly CoachDashboardLine[];
  confidenceNote: string;
}>;

export type CoachDashboardPerformance = Readonly<{
  trend: string;
  anchorFamilyLabel?: string;
  anchorMovementStatusLabel?: string;
  benchmarkStatusLabel?: string;
  anchorText?: string;
  latestSameExerciseText?: string;
  latestFamilyMovementText?: string;
  relationshipText?: string;
  strengthSignal?: string;
  movementQuality: string;
  read?: string;
}>;

export type CoachDashboardWeeklyVolume = Readonly<{
  note?: string;
  rows: readonly CoachDashboardLine[];
  balanceRows: readonly CoachReportWeeklyVolumeBalance[];
}>;

export type CoachDashboardGoals = Readonly<{
  trajectory: string;
  read?: string;
  targets: readonly CoachDashboardLine[];
}>;

export type CoachDashboardLearnings = Readonly<{
  whatsWorking: readonly string[];
  whatsWorkingEmptyText: string;
  watchNow: readonly string[];
  watchNowEmptyText: string;
}>;

export type CoachDashboardCardio = Readonly<{
  isEmpty: boolean;
  emptyText: string;
  status?: string;
  rows: readonly CoachDashboardLine[];
  note?: string;
}>;

export type CoachDashboardProgrammingPriority = Readonly<{
  id: string;
  title: string;
  category: CoachProgrammingPriority["category"];
  categoryLabel: string;
  priority: CoachProgrammingPriority["priority"];
  priorityLabel: string;
  rationale?: string;
  direction?: string;
  evidence: readonly string[];
  recentAction?: Readonly<{
    status: "not_completed" | "completed_latest_session";
    statusLabel: string;
    completedAt?: string;
    evidence: readonly string[];
  }>;
}>;

export type CoachDashboardProgramming = Readonly<{
  status: string | null;
  summary: string;
  priorities: readonly CoachDashboardProgrammingPriority[];
  detailPriorities: readonly CoachDashboardProgrammingPriority[];
  emptyState: string;
}>;

export type CoachDashboardModel = Readonly<{
  snapshot: CoachDashboardSnapshot;
  body: CoachDashboardBody;
  performance: CoachDashboardPerformance;
  programming: CoachDashboardProgramming;
  weeklyVolume: CoachDashboardWeeklyVolume;
  goals: CoachDashboardGoals;
  learnings: CoachDashboardLearnings;
  cardio: CoachDashboardCardio;
  actions?: CoachDashboardActions;
}>;
