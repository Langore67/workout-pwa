import { expect, test } from "@playwright/test";
import type { CoachExportMetrics } from "../src/lib/coachExport/types";
import { buildCoachStateFromExportMetrics } from "../src/lib/coachState/buildCoachState";
import { buildCoachReport } from "../src/lib/coachReport/buildCoachReport";
import { formatCoachReportText } from "../src/lib/coachReport/formatCoachReportText";

const AS_OF = Date.UTC(2026, 6, 14, 9, 0, 0, 0);

function entry(overrides: Record<string, any>) {
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
    summary: "Missing.",
    interpretation: "No recent movement was found.",
    ...overrides,
  };
}

function baseMetrics(overrides: Partial<CoachExportMetrics> = {}): CoachExportMetrics {
  return {
    generatedAt: AS_OF,
    currentPhase: "cut",
    bodyComp: {
      weight: { latest: 190, baseline14d: 193, delta14d: -3 },
      waist: { latest: 36, baseline14d: 36.5, delta14d: -0.5 },
      bodyFatPct: { latest: 20, baseline14d: 20.5, delta14d: -0.5 },
      leanMass: { latest: 150, baseline14d: 151, delta14d: -1 },
      bodyweightDelta7d: -1.5,
      bodyweightDelta14d: -3,
    },
    hydration: { latestWaterPct: 57, confidenceLabel: "High", confidenceScore: 82, note: "Stable.", distortionLikely: false },
    strengthSignal: { current: 1.9, delta14d: -0.04, vs90dBestPct: -3, currentBodyweight: 190, bodyweightDaysUsed: 5 },
    phaseQuality: null,
    anchorLifts: [],
    currentMovementFocus: [],
    movementCoverage: {
      asOf: new Date(AS_OF).toISOString(),
      volumeWindowDays: 7,
      recencyWindowDays: 28,
      status: "watch",
      entries: [],
      missingFamilies: [],
      developingFamilies: [],
      coveredFamilies: [],
      summary: "Mixed.",
    },
    exerciseVocabulary: [],
    trainingSignals: { movementQuality: [], stimulusCoverage: [], fatigueReadiness: [], nextWorkoutFocus: [], discussWithGaz: [] },
    coachingMemory: { validatedLearnings: [], activeWatchItems: [], resolvedItems: [], sourceWindow: { sessionCount: 0 } } as any,
    patternSummary: { movementQuality: [], stimulus: [], fatigue: [], constraints: [], progression: [] },
    nextWorkoutFocus: { progressionGuardrails: [], executionPriorities: [], adjustmentTriggers: [] },
    exportConfidence: { score: 80, label: "Strong", components: { waistReadiness: 80, weightDataReady: 80, strengthDataReady: 80, coherenceScore: 80 } },
    weeklyVolume: { windowDays: 7, groups: [], rollups: [], balances: [], status: "solid", summary: "Balanced." },
    readinessNotes: [],
    dataNotes: [],
    ...overrides,
  } as CoachExportMetrics;
}

function reportFor(metrics: CoachExportMetrics, overallStatus: "solid" | "watch" | "intervene" | "not_enough_data" = "watch") {
  const coachState = buildCoachStateFromExportMetrics(metrics);
  coachState.snapshot.overallStatus = overallStatus;
  const report = buildCoachReport({ coachState, metrics, generatedAt: AS_OF });
  return { report, text: formatCoachReportText(report) };
}

function section(text: string, start: string, end: string) {
  const startIndex = text.indexOf(start);
  const endIndex = text.indexOf(end, startIndex + start.length);
  return text.slice(startIndex, endIndex > startIndex ? endIndex : undefined);
}

test("vertical push priority transforms into a high-confidence coaching action", () => {
  const metrics = baseMetrics({
    movementCoverage: {
      ...baseMetrics().movementCoverage!,
      entries: [entry({ family: "vertical_push", label: "Vertical Push", context: "This may be intentional while overhead shoulder sensitivity remains active." })],
      missingFamilies: ["Vertical Push"],
    },
    patternSummary: {
      movementQuality: ["Shoulder sensitivity appears in overhead positions"],
      stimulus: [],
      fatigue: [],
      constraints: ["Shoulder sensitivity linked to overhead positions"],
      progression: [],
    },
  });

  const { report } = reportFor(metrics);
  const action = report.coachingActions?.actions[0];

  expect(action).toEqual(expect.objectContaining({
    title: "Vertical Push",
    objective: "Reintroduce vertical pressing.",
    expectedBenefit: "Restore balanced movement coverage.",
    confidence: "High",
  }));
  expect(action?.constraints).toEqual(["Pain-free range of motion.", "Avoid aggravating shoulder sensitivity."]);
});

test("aggressive cut and carry priorities transform without exercise or workout prescription", () => {
  const metrics = baseMetrics({
    leanPreservation: {
      status: "Watch",
      confidence: "Moderate",
      rawMetrics: { leanMassLatest: 150, leanMassDelta14d: -1 },
      evidence: { positive: [], negative: ["Strength is down."] },
    },
    movementCoverage: {
      ...baseMetrics().movementCoverage!,
      entries: [entry({ family: "carry", label: "Carry" })],
      missingFamilies: ["Carry"],
    },
  });

  const { report, text } = reportFor(metrics, "intervene");
  const actions = report.coachingActions?.actions ?? [];

  expect(actions.map((action) => action.title)).toEqual(["Recovery & Performance Preservation", "Carry"]);
  expect(actions[0]).toEqual(expect.objectContaining({
    objective: "Protect lean mass.",
    expectedBenefit: "Improve recovery and preserve strength.",
    confidence: "High",
  }));
  expect(actions[1]).toEqual(expect.objectContaining({
    objective: "Restore loaded carry exposure.",
    expectedBenefit: "Improve grip, trunk, and scapular integration.",
    confidence: "High",
  }));
  expect(actions[1].constraints).toEqual([]);
  expect(text).toContain("Coaching Actions");
  expect(section(text, "Coaching Actions", "Lean Preservation")).not.toMatch(/workout|schedule|sets|reps|farmer|suitcase/i);
});

test("carry action constraints come only from actual trap-compensation evidence", () => {
  const metrics = baseMetrics({
    strengthSignal: { current: 1.9, delta14d: 0.01, vs90dBestPct: -1, currentBodyweight: 190, bodyweightDaysUsed: 5 },
    movementCoverage: {
      ...baseMetrics().movementCoverage!,
      entries: [entry({ family: "carry", label: "Carry" })],
      missingFamilies: ["Carry"],
    },
    patternSummary: {
      movementQuality: ["Trap compensation shows up under fatigue."],
      stimulus: [],
      fatigue: [],
      constraints: ["Trap compensation remains active."],
      progression: [],
    },
  });

  const { report } = reportFor(metrics);
  const carry = report.coachingActions?.actions.find((action) => action.title === "Carry");

  expect(carry?.constraints).toEqual(["Avoid trap compensation."]);
});

test("push volume and hip stability actions are medium-confidence principle targets", () => {
  const metrics = baseMetrics({
    strengthSignal: { current: 1.9, delta14d: 0.01, vs90dBestPct: -1, currentBodyweight: 190, bodyweightDaysUsed: 5 },
    movementCoverage: {
      ...baseMetrics().movementCoverage!,
      entries: [
        entry({ family: "hip_stability", label: "Hip Stability", status: "covered", directEffectiveSets7d: 0, effectiveSets7d: 2, supportEffectiveSets7d: 2, controlExposures7d: 3 }),
      ],
    },
    weeklyVolume: {
      ...baseMetrics().weeklyVolume!,
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

  const { report } = reportFor(metrics);
  const actions = report.coachingActions?.actions ?? [];

  expect(actions.map((action) => action.title)).toEqual(["Push Volume", "Hip Stability"]);
  expect(actions[0]).toEqual(expect.objectContaining({
    objective: "Restore push/pull balance.",
    expectedBenefit: "Reduce weekly imbalance.",
    confidence: "Medium",
  }));
  expect(actions[1]).toEqual(expect.objectContaining({
    objective: "Increase direct stability work.",
    expectedBenefit: "Improve frontal-plane control.",
    confidence: "Medium",
  }));
  expect(actions[0].objective).not.toMatch(/\d|sets|reps/i);
  expect(actions[0].constraints).toEqual([]);
});

test("actions preserve programming order and remove duplicate transformed titles", () => {
  const metrics = baseMetrics({
    leanPreservation: {
      status: "Watch",
      confidence: "Moderate",
      rawMetrics: { leanMassLatest: 150, leanMassDelta14d: -1 },
      evidence: { positive: [], negative: ["Strength is down."] },
    },
    movementCoverage: {
      ...baseMetrics().movementCoverage!,
      entries: [
        entry({ family: "vertical_push", label: "Vertical Push" }),
        entry({ family: "hip_stability", label: "Hip Stability", status: "developing", directEffectiveSets7d: 0, effectiveSets7d: 1, supportEffectiveSets7d: 1, controlExposures7d: 1 }),
      ],
      missingFamilies: ["Vertical Push"],
      developingFamilies: ["Hip Stability"],
    },
  });

  const { report } = reportFor(metrics, "intervene");

  const expectedOrder = [
    "Vertical Push",
    "Recovery & Performance Preservation",
    "Hip Stability",
  ];
  expect(report.programming?.priorities.map((priority) => priority.title)).toEqual(expectedOrder);
  expect(report.coachingActions?.actions.map((action) => action.title)).toEqual(expectedOrder);
});
