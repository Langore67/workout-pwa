import { expect, test } from "@playwright/test";
import { BodyCard } from "../src/components/coachDashboard/BodyCard";
import { CardioCard } from "../src/components/coachDashboard/CardioCard";
import { CoachSnapshotCard } from "../src/components/coachDashboard/CoachSnapshotCard";
import { GoalsCard } from "../src/components/coachDashboard/GoalsCard";
import { LearningsCard } from "../src/components/coachDashboard/LearningsCard";
import { PerformanceCard } from "../src/components/coachDashboard/PerformanceCard";
import { ProgrammingIntelligenceCard } from "../src/components/coachDashboard/ProgrammingIntelligenceCard";
import { WeeklyVolumeCard } from "../src/components/coachDashboard/WeeklyVolumeCard";
import type {
  CoachDashboardActions,
  CoachDashboardBody,
  CoachDashboardCardio,
  CoachDashboardGoals,
  CoachDashboardLearnings,
  CoachDashboardPerformance,
  CoachDashboardProgramming,
  CoachDashboardSnapshot,
  CoachDashboardWeeklyVolume,
} from "../src/lib/coachDashboard/coachDashboardTypes";

type JsxNode = {
  type?: unknown;
  props?: {
    children?: unknown;
  };
};

function textFrom(node: unknown): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textFrom).join("");
  if (typeof node === "object") {
    const element = node as JsxNode;
    if (typeof element.type === "function") {
      return textFrom(element.type(element.props ?? {}));
    }
    return textFrom(element.props?.children);
  }
  return "";
}

test("CoachSnapshotCard renders snapshot, priorities, and coaching focus", () => {
  const snapshot: CoachDashboardSnapshot = {
    status: "Watch",
    confidence: "High",
    why: "Goal trajectory is moving in the right direction.",
    today: "Keep progression conservative.",
    programmingPriorities: [
      {
        title: "Strength Signal down",
        priority: "high",
        category: "performance",
        reason: "14d Strength Signal -0.03.",
        evidence: ["Strength Signal"],
        coachAction: "Hold load jumps.",
      },
    ],
  };
  const actions: CoachDashboardActions = {
    primaryFocus: {
      objective: "Hold load jumps today.",
      reason: "Recent strength signal is pressured.",
    },
  };

  const text = textFrom(CoachSnapshotCard({ snapshot, actions }));

  expect(text).toContain("Coach Snapshot");
  expect(text).toContain("Watch");
  expect(text).toContain("High");
  expect(text).toContain("Programming Priorities");
  expect(text).toContain("High | Strength Signal down");
  expect(text).toContain("Today's Coaching Focus");
  expect(text).toContain("Hold load jumps today.");
});

test("BodyCard renders values from the dashboard body section", () => {
  const body: CoachDashboardBody = {
    heading: "Body Values",
    values: [
      { label: "Weight", value: "latest 184.3 lb | 186.1 lb coach avg" },
      { label: "Waist", value: "36.8 in latest/manual" },
    ],
    note: "Coach trends use rolling 5-entry averages except waist.",
    confidenceRows: [{ label: "Overall confidence", value: "High confidence" }],
    confidenceNote: "Confidence reflects how much recent data is available, not whether the number is high or low.",
  };

  const text = textFrom(BodyCard({ body }));

  expect(text).toContain("Body Values");
  expect(text).toContain("latest 184.3 lb | 186.1 lb coach avg");
  expect(text).toContain("36.8 in latest/manual");
  expect(text).toContain("Body Confidence");
  expect(text).toContain("High confidence");
});

test("PerformanceCard renders assisted pull-up benchmark text", () => {
  const performance: CoachDashboardPerformance = {
    trend: "Stable",
    benchmarkStatusLabel: "Recent",
    anchorText: "Assisted Pull Up | BW 180.2 lb | Assistance 35 lb | Effective Resistance 145.2 lb | 9 reps",
    strengthSignal: "1.92 | Δ -0.03",
    movementQuality: "Stable",
  };

  const text = textFrom(PerformanceCard({ performance }));

  expect(text).toContain("Performance");
  expect(text).toContain("Assisted Pull Up | BW 180.2 lb | Assistance 35 lb | Effective Resistance 145.2 lb | 9 reps");
  expect(text).not.toMatch(/e1RM|effective 145\.2 lb x 9/i);
});

test("GoalsCard renders progress and statuses", () => {
  const goals: CoachDashboardGoals = {
    trajectory: "Watch",
    read: "Weight goal is close, but waist/body-fat goals need cleaner confirmation.",
    targets: [{ label: "Weight", value: "184.3 lb -> 180 lb | 4.3 lb remaining • Watch" }],
  };

  const text = textFrom(GoalsCard({ goals }));

  expect(text).toContain("Goals");
  expect(text).toContain("Goal Trajectory");
  expect(text).toContain("Weight goal is close");
  expect(text).toContain("184.3 lb -> 180 lb | 4.3 lb remaining • Watch");
});

test("LearningsCard renders grouped learnings", () => {
  const learnings: CoachDashboardLearnings = {
    whatsWorking: ["Pull: strong lat stimulus"],
    whatsWorkingEmptyText: "No validated learnings yet.",
    watchNow: ["Trap compensation remains a carry constraint"],
    watchNowEmptyText: "No active watch items.",
  };

  const text = textFrom(LearningsCard({ learnings }));

  expect(text).toContain("What's Working");
  expect(text).toContain("- Pull: strong lat stimulus");
  expect(text).toContain("Watch Now");
  expect(text).toContain("- Trap compensation remains a carry constraint");
});

test("CardioCard renders summaries and empty state", () => {
  const cardio: CoachDashboardCardio = {
    isEmpty: false,
    emptyText: "Cardio summary not available yet.",
    status: "Watch",
    rows: [
      { label: "Last 7 Days", value: "2 walks | 1 hr 30 min | 4.0 mi" },
      { label: "Last 28 Days", value: "4 walks | 3 hrs | 8.0 mi" },
      { label: "Recent Walk/Cardio", value: "Jul 3, 2026 | Walk - MapMyWalk | 1 hr | 2.0 mi" },
    ],
    note: "2 walks in the last 7 days.",
  };
  const emptyCardio: CoachDashboardCardio = {
    isEmpty: true,
    emptyText: "Cardio summary not available yet.",
    rows: [],
  };

  expect(textFrom(CardioCard({ cardio }))).toContain("Recent Walk/Cardio");
  expect(textFrom(CardioCard({ cardio: emptyCardio }))).toContain("Cardio summary not available yet.");
});

test("WeeklyVolumeCard renders rows and balance details", () => {
  const weeklyVolume: CoachDashboardWeeklyVolume = {
    note: "Recent pulling volume exceeds pressing volume.",
    rows: [{ label: "Chest / Push", value: "4.5 effective sets | Watch" }],
    balanceRows: [
      {
        id: "push_pull",
        label: "Push / Pull",
        leftLabel: "Push",
        rightLabel: "Pull",
        leftValue: 4.5,
        rightValue: 6,
        ratio: 0.75,
        status: "solid",
        statusLabel: "Push Behind",
        direction: "right_ahead",
        summary: "Pull volume is ahead of push volume.",
        currentText: "Push: 4.5 effective sets | Pull: 6 effective sets",
        explanation: "Pull volume is about 1.3x push volume.",
        action: "Add 3-5 pushing sets.",
        note: "Push is slightly behind pull.",
      },
    ],
  };

  const text = textFrom(WeeklyVolumeCard({ weeklyVolume }));

  expect(text).toContain("Weekly Volume");
  expect(text).toContain("Chest / Push");
  expect(text).toContain("Balance");
  expect(text).toContain("Push Behind");
  expect(text).toContain("What to change:");
});

test("ProgrammingIntelligenceCard renders status, summary, priority, rationale, and direction", () => {
  const programming: CoachDashboardProgramming = {
    status: "High Focus",
    summary: "Coach identified the highest-impact coaching priority.",
    emptyState: "No programming changes are currently recommended.",
    priorities: [
      {
        id: "1-performance-high-performance-pressure",
        title: "Performance Pressure",
        category: "performance",
        categoryLabel: "Performance",
        priority: "high",
        priorityLabel: "High",
        rationale: "Strength Signal is trending down.",
        direction: "Keep progression conservative until performance stabilizes.",
        evidence: ["14d Strength Signal -0.03"],
      },
    ],
    detailPriorities: [
      {
        id: "1-performance-high-performance-pressure",
        title: "Performance Pressure",
        category: "performance",
        categoryLabel: "Performance",
        priority: "high",
        priorityLabel: "High",
        rationale: "Strength Signal is trending down.",
        direction: "Keep progression conservative until performance stabilizes.",
        evidence: ["14d Strength Signal -0.03"],
      },
    ],
  };

  const text = textFrom(ProgrammingIntelligenceCard({ programming }));

  expect(text).toContain("Programming Intelligence");
  expect(text).toContain("High Focus");
  expect(text).toContain("Coach identified the highest-impact coaching priority.");
  expect(text).toContain("Performance Pressure");
  expect(text).toContain("High");
  expect(text).toContain("Why");
  expect(text).toContain("Strength Signal is trending down.");
  expect(text).toContain("Direction");
  expect(text).toContain("Keep progression conservative until performance stabilizes.");
  expect(text).toContain("Evidence");
  expect(text).toContain("14d Strength Signal -0.03");
});

test("ProgrammingIntelligenceCard renders multiple priorities in model order", () => {
  const programming: CoachDashboardProgramming = {
    status: "Medium Focus",
    summary: "Multiple priorities.",
    emptyState: "No programming changes are currently recommended.",
    priorities: [
      {
        id: "1-movement-medium-carry",
        title: "Carry",
        category: "movement",
        categoryLabel: "Movement",
        priority: "medium",
        priorityLabel: "Medium",
        rationale: "Movement family missing.",
        direction: "Add one loaded-carry exposure.",
        evidence: ["Carry Missing"],
      },
      {
        id: "2-volume-medium-push-behind",
        title: "Push Behind",
        category: "volume",
        categoryLabel: "Volume",
        priority: "medium",
        priorityLabel: "Medium",
        rationale: "Pull volume is ahead of push volume.",
        direction: "Add 3-5 pushing sets this week.",
        evidence: ["Push Behind"],
      },
    ],
    detailPriorities: [
      {
        id: "1-movement-medium-carry",
        title: "Carry",
        category: "movement",
        categoryLabel: "Movement",
        priority: "medium",
        priorityLabel: "Medium",
        rationale: "Movement family missing.",
        direction: "Add one loaded-carry exposure.",
        evidence: ["Carry Missing"],
      },
      {
        id: "2-volume-medium-push-behind",
        title: "Push Behind",
        category: "volume",
        categoryLabel: "Volume",
        priority: "medium",
        priorityLabel: "Medium",
        rationale: "Pull volume is ahead of push volume.",
        direction: "Add 3-5 pushing sets this week.",
        evidence: ["Push Behind"],
      },
    ],
  };

  const text = textFrom(ProgrammingIntelligenceCard({ programming }));

  expect(text.indexOf("Carry")).toBeLessThan(text.indexOf("Push Behind"));
});

test("ProgrammingIntelligenceCard renders recent-action acknowledgement and evidence", () => {
  const programming: CoachDashboardProgramming = {
    status: "Medium Focus",
    summary: "Carry balance still needs monitoring.",
    emptyState: "No programming changes are currently recommended.",
    priorities: [
      {
        id: "1-volume-medium-core-ahead",
        title: "Core Ahead",
        category: "volume",
        categoryLabel: "Volume",
        priority: "medium",
        priorityLabel: "Medium",
        rationale: "Core work remains ahead of loaded carry exposure.",
        direction:
          "Carry exposure was completed in the latest session. Allow the rolling 7-day balance to update before adding more solely to correct this ratio.",
        evidence: ["Core: 8 effective sets | Carry: 0 effective sets"],
        recentAction: {
          status: "completed_latest_session",
          statusLabel: "Addressed in latest session",
          completedAt: "2026-07-06T13:00:00.000Z",
          evidence: ["Farmer Carry: 2 direct carry sets"],
        },
      },
    ],
    detailPriorities: [
      {
        id: "1-volume-medium-core-ahead",
        title: "Core Ahead",
        category: "volume",
        categoryLabel: "Volume",
        priority: "medium",
        priorityLabel: "Medium",
        rationale: "Core work remains ahead of loaded carry exposure.",
        direction:
          "Carry exposure was completed in the latest session. Allow the rolling 7-day balance to update before adding more solely to correct this ratio.",
        evidence: ["Core: 8 effective sets | Carry: 0 effective sets"],
        recentAction: {
          status: "completed_latest_session",
          statusLabel: "Addressed in latest session",
          completedAt: "2026-07-06T13:00:00.000Z",
          evidence: ["Farmer Carry: 2 direct carry sets"],
        },
      },
    ],
  };

  const text = textFrom(ProgrammingIntelligenceCard({ programming }));

  expect(text).toContain("Recent Action");
  expect(text).toContain("Addressed in latest session");
  expect(text).toContain("Recent Action Evidence");
  expect(text).toContain("Farmer Carry: 2 direct carry sets");
});

test("ProgrammingIntelligenceCard renders empty and partial states cleanly", () => {
  const empty: CoachDashboardProgramming = {
    status: null,
    summary: "",
    priorities: [],
    detailPriorities: [],
    emptyState: "No programming changes are currently recommended.",
  };
  const partial: CoachDashboardProgramming = {
    status: "Low Focus",
    summary: "Partial data.",
    emptyState: "No programming changes are currently recommended.",
    priorities: [
      {
        id: "1-recovery-low-cardio",
        title: "Cardio",
        category: "recovery",
        categoryLabel: "Recovery",
        priority: "low",
        priorityLabel: "Low",
        evidence: [],
      },
    ],
    detailPriorities: [
      {
        id: "1-recovery-low-cardio",
        title: "Cardio",
        category: "recovery",
        categoryLabel: "Recovery",
        priority: "low",
        priorityLabel: "Low",
        evidence: [],
      },
    ],
  };

  const emptyText = textFrom(ProgrammingIntelligenceCard({ programming: empty }));
  const partialText = textFrom(ProgrammingIntelligenceCard({ programming: partial }));

  expect(emptyText).toContain("No programming changes are currently recommended.");
  expect(partialText).toContain("Cardio");
  expect(partialText).not.toContain("Why");
  expect(partialText).not.toContain("Direction");
  expect(partialText).not.toContain("undefined");
  expect(partialText).not.toContain("null");
});
