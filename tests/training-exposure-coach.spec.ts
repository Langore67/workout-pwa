import { expect, test } from "@playwright/test";
import { buildCoachProgrammingContext } from "../src/lib/coachExport/programmingContext";
import { buildCoachStateFromExportMetrics } from "../src/lib/coachState/buildCoachState";
import { buildCoachReport } from "../src/lib/coachReport/buildCoachReport";
import { formatCoachReportText } from "../src/lib/coachReport/formatCoachReportText";
import { buildTrainingExposureContext } from "../src/domain/training/trainingExposureContext";

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
  expect(state.trainingExposure).toBe(trainingExposure);
  expect(report.trainingExposure).toBe(trainingExposure);
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

