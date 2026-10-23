import { expect, test } from "@playwright/test";
import { buildCoachProgrammingContext } from "../src/lib/coachExport/programmingContext";
import { buildCoachStateFromExportMetrics } from "../src/lib/coachState/buildCoachState";
import { buildCoachReport } from "../src/lib/coachReport/buildCoachReport";
import { formatCoachReportText } from "../src/lib/coachReport/formatCoachReportText";
import { buildTrainingExposureContext } from "../src/domain/training/trainingExposureContext";
import { buildMovementCoverage } from "../src/lib/coachExport/movementCoverage";

const AS_OF = new Date(2026, 9, 21, 12).getTime();

function context() {
  const endedAt = new Date(2026, 9, 20, 10).getTime();
  return buildTrainingExposureContext({
    sessions: [{ id: "session", startedAt: endedAt - 3600000, endedAt }] as any,
    sets: [{ id: "set", sessionId: "session", trackId: "track", setType: "working", reps: 8, createdAt: endedAt, completedAt: endedAt }] as any,
    tracks: [{ id: "track", exerciseId: "bench", displayName: "Bench Press", trackType: "strength" }] as any,
    exercises: [{ id: "bench", name: "Bench Press", normalizedName: "bench press", movementPattern: "push", trainingRole: "primary", equipmentTags: [], createdAt: endedAt }] as any,
    dedicatedCardioObservations: [{ sessionId: "cardio", startedAt: new Date(2026, 9, 21, 8).getTime(), endedAt: new Date(2026, 9, 21, 9).getTime(), date: "2026-10-21", name: "Walk", activityType: "walk", cardioFormat: "continuous", confidence: "high" }] as any,
    asOf: AS_OF,
  });
}

function metrics(trainingExposure: ReturnType<typeof context>) {
  return {
    generatedAt: AS_OF,
    currentPhase: "maintenance",
    bodyComp: { weight: {}, waist: {}, bodyFatPct: {}, leanMass: {}, bodyweightDelta7d: null, bodyweightDelta14d: null },
    hydration: {}, strengthSignal: {}, phaseQuality: null, anchorLifts: [], exerciseVocabulary: [],
    trainingSignals: { movementQuality: [], stimulusCoverage: [], fatigueReadiness: [], nextWorkoutFocus: [], discussWithGaz: [] },
    patternSummary: { movementQuality: [], stimulus: [], fatigue: [], constraints: [], progression: [] },
    nextWorkoutFocus: { executionPriorities: [], progressionGuardrails: [], adjustmentTriggers: [] },
    exportConfidence: {}, readinessNotes: [], dataNotes: [], trainingExposure,
  } as any;
}

test("Coach Programming Context, CoachState, and CoachReport reuse the same exposure object", () => {
  const trainingExposure = context();
  const source = metrics(trainingExposure);
  const programmingContext = buildCoachProgrammingContext({ metrics: source, sessions: [], sets: [], tracks: [], exercises: [], asOf: AS_OF });
  source.programmingContext = programmingContext;
  const state = buildCoachStateFromExportMetrics(source);
  const report = buildCoachReport({ coachState: state, metrics: source, generatedAt: AS_OF });
  expect(programmingContext.trainingExposure).toBe(trainingExposure);
  expect(programmingContext.strengthConsistency).toEqual({
    currentWeekToDateSessions: 1,
    previousCompleteWeekSessions: 0,
    rolling14DaySessions: 1,
    latestCompletedStrengthSessionAt: new Date(2026, 9, 20, 10).getTime(),
    daysSinceLastCompletedStrengthSession: 1,
  });
  expect(state.trainingExposure).toBe(trainingExposure);
  expect(report.trainingExposure).toBe(trainingExposure);
});

test("Programming Context does not recount raw sessions when shared exposure exists", () => {
  const trainingExposure = context();
  const source = metrics(trainingExposure);
  const rawOnlySession = { id: "raw", startedAt: AS_OF - 1000, endedAt: AS_OF } as any;
  const result = buildCoachProgrammingContext({
    metrics: source,
    sessions: [rawOnlySession],
    sets: [{ id: "raw-set", sessionId: "raw", trackId: "raw-track", setType: "working", reps: 10, completedAt: AS_OF }] as any,
    tracks: [{ id: "raw-track", trackType: "strength" }] as any,
    exercises: [], asOf: AS_OF,
  });
  expect(result.trainingExposure).toBe(trainingExposure);
  expect(result.strengthConsistency.rolling14DaySessions).toBe(1);
  expect(result.strengthConsistency.latestCompletedStrengthSessionAt).toBe(new Date(2026, 9, 20, 10).getTime());
});

test("Coach text preserves partial, complete, and rolling labels without exposure conclusions", () => {
  const trainingExposure = context();
  const text = formatCoachReportText({
    snapshot: { status: "Not Enough Data", confidence: "Low", why: "Factual context only.", today: "—" },
    trainingExposure,
  } as any);
  expect(text).toContain("Training Calendar");
  expect(text).toContain("Current-week status: in progress");
  expect(text).toContain("Current week-to-date — partial period");
  expect(text).toContain("Previous complete week — complete period");
  expect(text).toContain("Rolling 14 days — rolling period");
  expect(text).toContain("Completed dedicated cardio sessions: 1");
  expect(text).toContain("push: 1 qualifying sets | 1 working | 1 sessions | 1 exercises");
  expect(text).not.toMatch(/behind|ahead|lagging|on track|undertrained|overtrained|recommend|add sets|remove sets/i);
});

test("legacy Movement Coverage projects the shared rolling exposure without raw recounting", () => {
  const trainingExposure = context();
  const coverage = buildMovementCoverage({
    sessions: [], sets: [], tracks: [], exercises: [], anchorIntelligence: [],
    trainingExposure, asOf: AS_OF,
  });
  const push = coverage.entries.find((entry) => entry.family === "horizontal_push");
  expect(coverage).toMatchObject({
    source: "training_exposure_rolling_14_days",
    compatibilityOnly: true,
    periodKind: "rolling_14_days",
    volumeWindowDays: 14,
  });
  expect(push).toMatchObject({ effectiveSets7d: 1, directEffectiveSets7d: 1, supportEffectiveSets7d: 0, sessionCount7d: 1 });
});

test("Coach text suppresses legacy movement/volume prescriptions when factual exposure exists", () => {
  const text = formatCoachReportText({
    snapshot: { status: "Not Enough Data", confidence: "Low", why: "Factual context only.", today: "â€”" },
    trainingExposure: context(),
    weeklyVolume: { title: "Rolling 7-Day Volume", rows: [], balanceRows: [{ id: "push_pull", label: "Push / Pull", leftLabel: "Push", rightLabel: "Pull", leftValue: 1, rightValue: 5, ratio: 0.2, status: "watch", statusLabel: "Push Behind", direction: "right_ahead", summary: "Pull ahead.", currentText: "Push 1", explanation: "Behind.", action: "Add sets.", note: "" }] },
    programming: { overallStatus: "Watch", summary: "Movement missing.", priorities: [{ title: "Add push", priority: "high", category: "movement", reason: "Behind", evidence: [], coachAction: "Add sets" }] },
    coachingActions: { status: "Watch", summary: "Act", actions: [{ title: "Add push", category: "volume", priority: "high", objective: "Add sets", reason: "Behind", expectedBenefit: "Balance", constraints: [], confidence: "Low" }] },
  } as any);
  expect(text).not.toMatch(/What to change|Add sets|Push Behind|Movement Coverage|Rolling 7-Day Volume/i);
});

