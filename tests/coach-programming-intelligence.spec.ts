import { expect, test } from "@playwright/test";
import type { CoachExportMetrics } from "../src/lib/coachExport/types";
import { buildCoachReport } from "../src/lib/coachReport/buildCoachReport";
import { formatCoachReportText } from "../src/lib/coachReport/formatCoachReportText";
import { buildCoachStateFromExportMetrics } from "../src/lib/coachState/buildCoachState";

const AS_OF = Date.UTC(2026, 6, 14, 9, 0, 0, 0);

function coverageEntry(overrides: Record<string, any>) {
  return {
    family: "vertical_push",
    label: "Vertical Push",
    status: "missing",
    relationship: "none",
    effectiveSets7d: 0,
    directEffectiveSets7d: 0,
    supportEffectiveSets7d: 0,
    controlExposures7d: 0,
    sessionCount7d: 0,
    contributingExercises: [],
    summary: "No recent vertical-push work.",
    interpretation: "No recent vertical pressing was found.",
    ...overrides,
  };
}

function baseMetrics(overrides: Partial<CoachExportMetrics> = {}): CoachExportMetrics {
  return {
    generatedAt: AS_OF,
    currentPhase: "cut",
    bodyComp: {
      weight: { latest: 190, baseline14d: 192, delta14d: -2 },
      waist: { latest: 36, baseline14d: 36.3, delta14d: -0.3 },
      bodyFatPct: { latest: 20, baseline14d: 20.3, delta14d: -0.3 },
      leanMass: { latest: 150, baseline14d: 150.2, delta14d: -0.2 },
      bodyweightDelta7d: -1,
      bodyweightDelta14d: -2,
    },
    hydration: { latestWaterPct: 57, confidenceLabel: "High", confidenceScore: 82, note: "Stable.", distortionLikely: false },
    strengthSignal: { current: 1.9, delta14d: 0.01, vs90dBestPct: -1, currentBodyweight: 190, bodyweightDaysUsed: 5 },
    phaseQuality: null,
    anchorLifts: [],
    currentMovementFocus: [],
    movementCoverage: {
      asOf: new Date(AS_OF).toISOString(),
      volumeWindowDays: 7,
      recencyWindowDays: 28,
      status: "solid",
      entries: [],
      missingFamilies: [],
      developingFamilies: [],
      coveredFamilies: [],
      summary: "No gaps.",
    },
    exerciseVocabulary: [],
    trainingSignals: { movementQuality: [], stimulusCoverage: [], fatigueReadiness: [], nextWorkoutFocus: [], discussWithGaz: [] },
    coachingMemory: { validatedLearnings: [], activeWatchItems: [], resolvedItems: [], sourceWindow: { sessionCount: 0 } } as any,
    patternSummary: { movementQuality: [], stimulus: [], fatigue: [], constraints: [], progression: [] },
    nextWorkoutFocus: { progressionGuardrails: [], executionPriorities: [], adjustmentTriggers: [] },
    exportConfidence: { score: 80, label: "Strong", components: { waistReadiness: 80, weightDataReady: 80, strengthDataReady: 80, coherenceScore: 80 } },
    weeklyVolume: {
      windowDays: 7,
      groups: [],
      rollups: [],
      balances: [],
      status: "solid",
      summary: "Balanced.",
    },
    readinessNotes: [],
    dataNotes: [],
    ...overrides,
  } as CoachExportMetrics;
}

function buildProgramming(metrics: CoachExportMetrics, overallStatus: "solid" | "watch" | "intervene" | "not_enough_data" = "watch") {
  const coachState = buildCoachStateFromExportMetrics(metrics);
  coachState.snapshot.overallStatus = overallStatus;
  const report = buildCoachReport({ coachState, metrics, generatedAt: AS_OF });
  return { report, text: formatCoachReportText(report) };
}

test("missing vertical push with shoulder sensitivity becomes a high movement priority", () => {
  const metrics = baseMetrics({
    movementCoverage: {
      ...baseMetrics().movementCoverage!,
      status: "watch",
      entries: [coverageEntry({ context: "This may be intentional while overhead shoulder sensitivity remains active." })],
      missingFamilies: ["Vertical Push"],
      summary: "Vertical Push missing.",
    },
    patternSummary: {
      movementQuality: ["Shoulder sensitivity appears in overhead positions"],
      stimulus: [],
      fatigue: [],
      constraints: ["Shoulder sensitivity linked to behind-head or overhead positions"],
      progression: [],
    },
  });

  const { report } = buildProgramming(metrics);
  const verticalPush = report.programming?.priorities.find((priority) => priority.title === "Vertical Push");

  expect(verticalPush?.priority).toBe("high");
  expect(verticalPush?.category).toBe("movement");
  expect(verticalPush?.evidence).toContain("Vertical Push Missing");
  expect(verticalPush?.evidence).toContain("Shoulder sensitivity remains active.");
  expect(verticalPush?.evidence.filter((item) => /shoulder/i.test(item))).toHaveLength(1);
  expect(verticalPush?.coachAction).toBe("Resume vertical pressing only within pain-free range.");
});

test("missing carry is medium priority and does not choose a specific exercise", () => {
  const metrics = baseMetrics({
    movementCoverage: {
      ...baseMetrics().movementCoverage!,
      status: "watch",
      entries: [coverageEntry({ family: "carry", label: "Carry", summary: "No recent carry work.", interpretation: "No recent loaded carry was recorded." })],
      missingFamilies: ["Carry"],
      summary: "Carry missing.",
    },
  });

  const { report } = buildProgramming(metrics);
  const carry = report.programming?.priorities[0];

  expect(carry?.title).toBe("Carry");
  expect(carry?.priority).toBe("medium");
  expect(carry?.coachAction).toBe("Add one loaded-carry exposure.");
  expect(carry?.coachAction).not.toContain("Farmer");
  expect(carry?.coachAction).not.toContain("Suitcase");
});

test("recovery and performance pressure merge while push-behind volume remains ranked", () => {
  const metrics = baseMetrics({
    strengthSignal: { current: 1.9, delta14d: -0.04, vs90dBestPct: -4, currentBodyweight: 190, bodyweightDaysUsed: 5 },
    leanPreservation: {
      status: "Watch",
      confidence: "Moderate",
      rawMetrics: { leanMassLatest: 150, leanMassDelta14d: -1 },
      evidence: { positive: [], negative: ["Strength is down."] },
      coachInterpretation: "Muscle preservation needs monitoring.",
    },
    weeklyVolume: {
      ...baseMetrics().weeklyVolume!,
      status: "watch",
      summary: "Push is behind pull.",
      balances: [
        {
          id: "push_pull",
          label: "Push / Pull",
          leftLabel: "Push",
          rightLabel: "Pull",
          leftValue: 8,
          rightValue: 20,
          ratio: 0.4,
          status: "watch",
          statusLabel: "Push Behind",
          direction: "right_ahead",
          summary: "Pull exceeds push.",
          currentText: "Push: 8 effective sets | Pull: 20 effective sets",
          explanation: "Pull volume is ahead.",
          action: "Add 3-5 pushing sets this week.",
          note: "Pull exceeds push.",
        },
      ],
    },
  });

  const { report } = buildProgramming(metrics, "intervene");
  const titles = report.programming?.priorities.map((priority) => priority.title);

  expect(report.programming?.overallStatus).toBe("High Focus");
  expect(titles).toEqual(["Recovery & Performance Preservation", "Push Behind"]);
  const merged = report.programming?.priorities.find((priority) => priority.title === "Recovery & Performance Preservation");
  expect(merged?.priority).toBe("high");
  expect(merged?.evidence).toEqual([
    "Coach Snapshot Intervene",
    "Lean Preservation Watch",
    "Strength Signal down",
    "14d Strength Signal -0.04",
  ]);
  expect(report.programming?.priorities.find((priority) => priority.title === "Push Behind")?.coachAction).toBe("Add 3-5 pushing sets this week.");
});

test("priority list is deterministic, deduped, and capped at five", () => {
  const metrics = baseMetrics({
    strengthSignal: { current: 1.9, delta14d: -0.09, vs90dBestPct: -6, currentBodyweight: 190, bodyweightDaysUsed: 5 },
    leanPreservation: {
      status: "Watch",
      confidence: "Moderate",
      rawMetrics: { leanMassLatest: 150, leanMassDelta14d: -1 },
      evidence: { positive: [], negative: ["Lean preservation watch."] },
    },
    movementCoverage: {
      ...baseMetrics().movementCoverage!,
      status: "watch",
      entries: [
        coverageEntry({ family: "vertical_push", label: "Vertical Push" }),
        coverageEntry({ family: "carry", label: "Carry" }),
        coverageEntry({ family: "glute_extension", label: "Glute Extension", status: "developing", effectiveSets7d: 2, directEffectiveSets7d: 2, summary: "Developing.", interpretation: "Glute extension is developing." }),
        coverageEntry({ family: "hip_stability", label: "Hip Stability", status: "covered", effectiveSets7d: 2, directEffectiveSets7d: 0, supportEffectiveSets7d: 2, controlExposures7d: 3, summary: "Support only.", interpretation: "Hip stability is supported." }),
      ],
      missingFamilies: ["Vertical Push", "Carry"],
      developingFamilies: ["Glute Extension"],
      summary: "Mixed.",
    },
    weeklyVolume: {
      ...baseMetrics().weeklyVolume!,
      status: "watch",
      balances: [
        {
          id: "push_pull",
          label: "Push / Pull",
          leftLabel: "Push",
          rightLabel: "Pull",
          leftValue: 8,
          rightValue: 20,
          ratio: 0.4,
          status: "watch",
          statusLabel: "Push Behind",
          direction: "right_ahead",
          summary: "Pull exceeds push.",
          currentText: "Push: 8 effective sets | Pull: 20 effective sets",
          explanation: "Pull volume is ahead.",
          action: "Add 3-5 pushing sets this week.",
          note: "Pull exceeds push.",
        },
      ],
    },
    goalProgress: { status: "Watch", read: "Body-fat target still needs progress.", targets: [] },
  });

  const { report } = buildProgramming(metrics, "intervene");

  expect(report.programming?.priorities).toHaveLength(5);
  expect(report.programming?.priorities.map((priority) => priority.title)).toEqual([
    "Vertical Push",
    "Recovery & Performance Preservation",
    "Push Behind",
    "Carry",
    "Goal Trajectory",
  ]);
  expect(report.programming?.priorities.map((priority) => priority.title)).not.toContain("Glute Extension");
});

test("balanced athlete produces low focus with no action", () => {
  const metrics = baseMetrics({
    cardioSummary: {
      normalizedWalks: [],
      recentWalks: [],
      dailySummaries: [],
      last7d: { walkCount: 2, totalDurationSeconds: 2400, totalDistanceMeters: 3000 } as any,
      last28d: { walkCount: 8, totalDurationSeconds: 9600, totalDistanceMeters: 12000 } as any,
      dataQuality: { unsupportedSignals: [] } as any,
    },
  });

  const { report } = buildProgramming(metrics, "solid");

  expect(report.programming?.overallStatus).toBe("Low Focus");
  expect(report.programming?.priorities).toEqual([
    expect.objectContaining({ title: "Cardio", priority: "low", coachAction: "No action." }),
  ]);
});

test("export renders Programming Intelligence with evidence and coach action", () => {
  const metrics = baseMetrics({
    movementCoverage: {
      ...baseMetrics().movementCoverage!,
      status: "watch",
      entries: [coverageEntry({ family: "carry", label: "Carry" })],
      missingFamilies: ["Carry"],
      summary: "Carry missing.",
    },
  });

  const { text } = buildProgramming(metrics);
  const programmingIndex = text.indexOf("Programming Intelligence");

  expect(programmingIndex).toBeGreaterThan(-1);
  expect(text).toContain("Status: Medium Focus");
  expect(text).toContain("Coach identified the 1 highest-impact coaching priority based on current training, recovery, and movement data.");
  expect(text).toContain("1. Carry");
  expect(text).toContain("Priority: Medium");
  expect(text).toContain("Evidence");
  expect(text).toContain("Coach Action: Add one loaded-carry exposure.");
  expect(text).not.toContain("Generate workout");
});
