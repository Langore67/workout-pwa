import { expect, test } from "@playwright/test";
import { buildCoachDashboardModel } from "../src/lib/coachDashboard/buildCoachDashboardModel";
import type { CoachReport } from "../src/lib/coachReport/coachReportTypes";

function line(label: string, value: string) {
  return { label, value, text: `- ${label}: ${value}` };
}

function buildReport(overrides: Partial<CoachReport> = {}): CoachReport {
  return {
    generatedAt: "7/6/2026, 9:00:00 AM",
    snapshot: {
      status: "Watch",
      confidence: "High",
      why: "Goal trajectory is moving in the right direction.",
      today: "Keep progression conservative.",
    },
    body: {
      heading: "Body Values",
      note: "Coach trends use rolling 5-entry averages except waist.",
      values: [
        line("Weight", "latest 184.3 lb | 186.1 lb coach avg | -2.3 lb 14d"),
        line("Waist", "36.8 in latest/manual | +0.3 in 14d"),
        line("Body Fat", "latest 21.3% | 20.9% coach avg"),
        line("Lean Mass", "latest 143.1 lb | 144 lb coach avg"),
        line("Fat Mass", "latest 39.3 lb | 38.9 lb coach avg"),
      ],
      confidenceRows: [
        line("Overall confidence", "High confidence"),
        line("Weight trend confidence", "High confidence"),
        line("Waist trend confidence", "High confidence"),
        line("Lean mass confidence", "Moderate confidence"),
        line("Body fat confidence", "Low confidence"),
      ],
    },
    performance: {
      trend: "Mixed",
      strengthSignal: "1.92 | Δ -0.03 | vs best -1.5%",
      movementQuality: "Watch",
      read: "A historical vertical pull benchmark remains useful context.",
      anchor: {
        label: "Anchor",
        text: "Lat Pulldown | 140 lb | 10 reps | e1RM 187 lb | Historical benchmark",
        familyLabel: "Vertical Pull",
        movementStatusLabel: "Inactive",
        benchmarkStatusLabel: "Historical",
        performanceBenchmarkText: "Lat Pulldown | 140 lb | 10 reps | e1RM 187 lb | 22d old",
        latestSameExerciseText: "Lat Pulldown | 22d old",
        latestFamilyMovementText: "Assisted Pull Up | 2d old",
        relationshipText: "Same movement family",
      },
    },
    weeklyVolume: {
      title: "Weekly Volume",
      note: "Recent pulling volume exceeds pressing volume.",
      rows: [line("Chest / Push", "4.5 effective sets | Watch"), line("Back / Pull", "6 effective sets | Target")],
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
    },
    goals: {
      trajectory: "Watch",
      read: "Weight goal is close, but waist/body-fat goals need cleaner confirmation.",
      targets: [
        line("Weight", "184.3 lb -> 180 lb | 4.3 lb remaining • Watch"),
        line("Waist", "36.8 in -> 35 in | 1.8 in remaining • Watch"),
        line("Body Fat", "21.3% -> 15% | 6.3 pts remaining • Watch"),
        line("Extra", "Hidden by dashboard"),
      ],
    },
    learnings: {
      whatsWorking: ["Pull: strong lat stimulus", "Leg Press: breakthrough pattern found"],
      watchNow: ["Trap compensation remains a carry constraint", "Joint feedback appears under higher-fatigue conditions"],
    },
    cardio: {
      status: "Watch",
      rows: [
        line("Last 7 Days", "2 walks | 1 hr 30 min | 4.0 mi"),
        line("Last 28 Days", "4 walks | 3 hrs | 8.0 mi"),
        line("Recent Walk/Cardio", "Jul 3, 2026 | Walk - MapMyWalk | 1 hr | 2.0 mi | 15:00/mi"),
      ],
      note: "2 walks in the last 7 days.",
    },
    programming: {
      overallStatus: "Watch",
      summary: "Programming needs attention.",
      priorities: [
        {
          title: "Strength Signal down",
          priority: "high",
          category: "performance",
          reason: "14d Strength Signal -0.03.",
          evidence: ["Strength Signal"],
          coachAction: "Keep progression conservative.",
        },
        {
          title: "Cardio",
          priority: "low",
          category: "recovery",
          reason: "Cardio base is emerging.",
          evidence: ["Walks"],
          coachAction: "No action.",
        },
      ],
    },
    coachingActions: {
      status: "Watch",
      summary: "One focus.",
      actions: [
        {
          title: "Protect performance",
          category: "performance",
          priority: "high",
          objective: "Hold load jumps today.",
          reason: "Recent strength signal is pressured.",
          expectedBenefit: "Reduce regression risk.",
          constraints: [],
          confidence: "High",
        },
      ],
    },
    ...overrides,
  };
}

test("coach dashboard model is deterministic", () => {
  const report = buildReport();

  expect(buildCoachDashboardModel(report)).toEqual(buildCoachDashboardModel(report));
});

test("maps snapshot, programming focus, and coaching focus", () => {
  const model = buildCoachDashboardModel(buildReport());

  expect(model.snapshot.status).toBe("Watch");
  expect(model.snapshot.confidence).toBe("High");
  expect(model.snapshot.why).toBe("Goal trajectory is moving in the right direction.");
  expect(model.snapshot.today).toBe("Keep progression conservative.");
  expect(model.snapshot.programmingPriorities.map((row) => row.title)).toEqual(["Strength Signal down", "Cardio"]);
  expect(model.actions?.primaryFocus?.objective).toBe("Hold load jumps today.");
  expect(model.actions?.primaryFocus?.reason).toBe("Recent strength signal is pressured.");
});

test("maps programming section from CoachReport programming intelligence", () => {
  const model = buildCoachDashboardModel(buildReport());

  expect(model.programming.status).toBe("Watch");
  expect(model.programming.summary).toBe("Programming needs attention.");
  expect(model.programming.emptyState).toBe("No programming changes are currently recommended.");
  expect(model.programming.priorities[0]).toEqual({
    id: "1-performance-high-strength-signal-down",
    title: "Strength Signal down",
    priority: "high",
    priorityLabel: "High",
    rationale: "14d Strength Signal -0.03.",
    direction: "Keep progression conservative.",
  });
});

test("programming priorities preserve report order and limit to three", () => {
  const report = buildReport({
    programming: {
      overallStatus: "High Focus",
      summary: "Coach identified priorities.",
      priorities: [
        {
          title: "First",
          priority: "medium",
          category: "movement",
          reason: "First reason.",
          evidence: [],
          coachAction: "First action.",
        },
        {
          title: "Second",
          priority: "critical",
          category: "recovery",
          reason: "Second reason.",
          evidence: [],
          coachAction: "Second action.",
        },
        {
          title: "Third",
          priority: "low",
          category: "goals",
          reason: "Third reason.",
          evidence: [],
          coachAction: "Third action.",
        },
        {
          title: "Fourth",
          priority: "high",
          category: "volume",
          reason: "Fourth reason.",
          evidence: [],
          coachAction: "Fourth action.",
        },
      ],
    },
  });

  const model = buildCoachDashboardModel(report);

  expect(model.programming.priorities.map((priority) => priority.title)).toEqual(["First", "Second", "Third"]);
  expect(model.programming.priorities.map((priority) => priority.priorityLabel)).toEqual(["Medium", "Critical", "Low"]);
});

test("missing programming intelligence returns a safe empty state", () => {
  const model = buildCoachDashboardModel(buildReport({ programming: undefined }));

  expect(model.programming.status).toBeNull();
  expect(model.programming.summary).toBe("");
  expect(model.programming.priorities).toEqual([]);
  expect(model.programming.emptyState).toBe("No programming changes are currently recommended.");
});

test("partial programming priorities omit unavailable rationale and direction", () => {
  const model = buildCoachDashboardModel(
    buildReport({
      programming: {
        overallStatus: "Medium Focus",
        summary: "Partial programming data.",
        priorities: [
          {
            title: "Partial",
            priority: "medium",
            category: "movement",
            reason: "",
            evidence: [],
            coachAction: "",
          },
        ],
      },
    })
  );

  expect(model.programming.priorities[0]).toEqual({
    id: "1-movement-medium-partial",
    title: "Partial",
    priority: "medium",
    priorityLabel: "Medium",
    rationale: undefined,
    direction: undefined,
  });
});

test("programming model is deterministic and frozen", () => {
  const report = buildReport();
  const first = buildCoachDashboardModel(report).programming;
  const second = buildCoachDashboardModel(report).programming;

  expect(first).toEqual(second);
  expect(Object.isFrozen(first)).toBe(true);
  expect(Object.isFrozen(first.priorities)).toBe(true);
  expect(Object.isFrozen(first.priorities[0])).toBe(true);
});

test("maps body latest values, coach averages, trends, and confidence", () => {
  const model = buildCoachDashboardModel(buildReport());

  expect(model.body.heading).toBe("Body Values");
  expect(model.body.values.map((row) => row.label)).toEqual(["Weight", "Waist", "Body Fat", "Lean Mass"]);
  expect(model.body.values[0].value).toContain("latest 184.3 lb");
  expect(model.body.values[0].value).toContain("coach avg");
  expect(model.body.values[1].value).toContain("latest/manual");
  expect(model.body.confidenceRows.map((row) => row.value)).toEqual(
    expect.arrayContaining(["High confidence", "Moderate confidence", "Low confidence"])
  );
  expect(model.body.confidenceNote).toContain("recent data");
});

test("maps performance anchor, benchmark status, movement quality, Strength Signal, and read", () => {
  const model = buildCoachDashboardModel(buildReport());

  expect(model.performance.anchorFamilyLabel).toBe("Vertical Pull");
  expect(model.performance.benchmarkStatusLabel).toBe("Historical");
  expect(model.performance.anchorMovementStatusLabel).toBe("Inactive");
  expect(model.performance.anchorText).toContain("Lat Pulldown");
  expect(model.performance.latestFamilyMovementText).toContain("Assisted Pull Up");
  expect(model.performance.relationshipText).toBe("Same movement family");
  expect(model.performance.strengthSignal).toBe("1.92 | Δ -0.03 | vs best -1.5%");
  expect(model.performance.movementQuality).toBe("Watch");
  expect(model.performance.read).toContain("historical vertical pull benchmark");
});

test("preserves assisted pull-up benchmark text without exposing e1RM", () => {
  const model = buildCoachDashboardModel(
    buildReport({
      performance: {
        trend: "Stable",
        movementQuality: "Stable",
        anchor: {
          label: "Anchor",
          text: "Assisted Pull Up | BW 180.2 lb | Assistance 35 lb | Effective Resistance 145.2 lb | 9 reps",
          benchmarkStatusLabel: "Recent",
          performanceBenchmarkText:
            "Assisted Pull Up | BW 180.2 lb | Assistance 35 lb | Effective Resistance 145.2 lb | 9 reps",
        },
      },
    })
  );

  expect(model.performance.anchorText).toBe(
    "Assisted Pull Up | BW 180.2 lb | Assistance 35 lb | Effective Resistance 145.2 lb | 9 reps"
  );
  expect(model.performance.anchorText).toContain("Effective Resistance 145.2 lb");
  expect(model.performance.anchorText).not.toMatch(/e1RM|effective 145\.2 lb x 9/i);
});

test("maps goals trajectory, read, current value, target, remaining amount, and status", () => {
  const model = buildCoachDashboardModel(buildReport());

  expect(model.goals.trajectory).toBe("Watch");
  expect(model.goals.read).toContain("Weight goal is close");
  expect(model.goals.targets).toHaveLength(3);
  expect(model.goals.targets[0]).toEqual({
    label: "Weight",
    value: "184.3 lb -> 180 lb | 4.3 lb remaining • Watch",
  });
});

test("maps learnings groups", () => {
  const model = buildCoachDashboardModel(buildReport());

  expect(model.learnings.whatsWorking).toEqual(["Pull: strong lat stimulus", "Leg Press: breakthrough pattern found"]);
  expect(model.learnings.watchNow).toEqual([
    "Trap compensation remains a carry constraint",
    "Joint feedback appears under higher-fatigue conditions",
  ]);
});

test("maps cardio status, summaries, recent activity, and note", () => {
  const model = buildCoachDashboardModel(buildReport());

  expect(model.cardio.status).toBe("Watch");
  expect(model.cardio.rows.map((row) => row.label)).toEqual(["Last 7 Days", "Last 28 Days", "Recent Walk/Cardio"]);
  expect(model.cardio.rows[0].value).toContain("2 walks");
  expect(model.cardio.rows[1].value).toContain("4 walks");
  expect(model.cardio.rows[2].value).toContain("Walk - MapMyWalk");
  expect(model.cardio.note).toBe("2 walks in the last 7 days.");
});

test("missing sections return presentation-ready empty states", () => {
  const model = buildCoachDashboardModel({
    snapshot: {
      status: "Not Enough Data",
      confidence: "Low",
      why: "Insufficient data.",
      today: "Build more data.",
    },
  } as CoachReport);

  expect(model.snapshot.status).toBe("Not Enough Data");
  expect(model.body.heading).toBe("Body Values");
  expect(model.body.values).toEqual([]);
  expect(model.performance.trend).toBe("—");
  expect(model.performance.movementQuality).toBe("—");
  expect(model.programming.status).toBeNull();
  expect(model.programming.priorities).toEqual([]);
  expect(model.weeklyVolume.rows).toEqual([]);
  expect(model.goals.trajectory).toBe("—");
  expect(model.learnings.whatsWorkingEmptyText).toBe("No validated learnings yet.");
  expect(model.cardio.emptyText).toBe("Cardio summary not available yet.");
  expect(model.actions).toBeUndefined();
});
