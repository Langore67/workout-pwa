import { expect, test } from "@playwright/test";
import { buildBodyConfidence } from "../src/body/bodyConfidenceEngine";
import { buildCoachStateFromExportMetrics } from "../src/lib/coachState/buildCoachState";
import { buildGoalProgress } from "../src/lib/coachExport/goalEngine";
import type { CoachExportMetrics } from "../src/lib/coachExport/types";

function buildMetrics(): CoachExportMetrics {
  const bodyComp = {
    weight: { latest: 198, baseline14d: 201, delta14d: -3 },
    waist: { latest: 35.5, baseline14d: 36.1, delta14d: -0.6 },
    bodyFatPct: { latest: 16.2, baseline14d: 16.9, delta14d: -0.7 },
    leanMass: { latest: 154.1, baseline14d: 153.6, delta14d: 0.5 },
    visceralFat: { latest: 8.2, baseline14d: 8.4, delta14d: -0.2 },
    waistToHeight: {
      latest: 0.495,
      baseline14d: 0.507,
      delta14d: -0.012,
      status: "Healthy" as const,
      healthyWaistTargetIn: 35.8,
      distanceToThresholdIn: -0.4,
    },
    bodyweightDelta7d: -1.2,
    bodyweightDelta14d: -3,
  };
  const hydration = {
    latestWaterPct: 57.2,
    confidenceLabel: "High Confidence",
    confidenceScore: 82,
    note: "Hydration signal is stable.",
    distortionLikely: false,
  };
  const bodyConfidence = buildBodyConfidence({
    bodyComp: {
      weight: bodyComp.weight,
      waist: bodyComp.waist,
      bodyFatPct: bodyComp.bodyFatPct,
      leanMass: bodyComp.leanMass,
      visceralFat: bodyComp.visceralFat,
      bodyweightDelta7d: bodyComp.bodyweightDelta7d,
      bodyweightDelta14d: bodyComp.bodyweightDelta14d,
    },
    hydration,
  });
  const goalProgress = buildGoalProgress({
    goals: {
      targetWeightLb: 180,
      targetBodyFatPct: 15,
      targetWaistIn: 35,
      targetVisceralFatEstimate: 7,
    } as any,
    bodyComp,
  });

  return {
    generatedAt: new Date("2026-04-27T09:00:00-04:00").getTime(),
    currentPhase: "cut",
    bodyComp,
    hydration,
    bodyConfidence,
    strengthSignal: {
      current: 1.92,
      delta14d: 0.04,
      vs90dBestPct: -1.5,
      currentBodyweight: 198,
      bodyweightDaysUsed: 5,
    },
    phaseQuality: null,
    anchorLifts: [
      {
        pattern: "push",
        exerciseId: "bench",
        exerciseName: "Bench Press",
        trackDisplayName: "Bench Press",
        effectiveWeightLb: 225,
        reps: 5,
        e1rm: 262,
        performedAt: new Date("2026-04-24T09:00:00-04:00").getTime(),
      },
    ],
    exerciseVocabulary: ["Bench Press", "Lat Pulldown", "Romanian Deadlift"],
    trainingSignals: {
      movementQuality: ["Lat Pulldown: improved stretch and contraction"],
      stimulusCoverage: ["Pull: strong lat stimulus"],
      fatigueReadiness: ["Fatigue mostly appeared at terminal reps"],
      nextWorkoutFocus: ["Maintain lat-driven pulling before increasing load"],
      discussWithGaz: ["Review safe overhead pressing range"],
    },
    patternSummary: {
      movementQuality: ["Lat engagement improving across recent pull work"],
      stimulus: ["Pull stimulus consistently strong"],
      fatigue: ["Fatigue consistently appears at terminal reps"],
      constraints: ["Shoulder sensitivity linked to behind-head or overhead positions"],
      progression: ["Pulling movements show improving consistency"],
    },
    nextWorkoutFocus: {
      progressionGuardrails: ["Keep progression conservative given current phase-quality risk."],
      executionPriorities: ["Preserve known pulling setup constraints when selecting or progressing work."],
      adjustmentTriggers: ["Reduce volume or progression pressure if later-set fatigue appears earlier than usual."],
    },
    exportConfidence: {
      score: 82,
      label: "Strong",
      components: {
        waistReadiness: 20,
        weightDataReady: 20,
        strengthDataReady: 20,
        coherenceScore: 22,
      },
    },
    readinessNotes: ["Phase quality: Insufficient Data."],
    dataNotes: [],
    goalProgress,
    leanPreservation: {
      status: "Watch",
      confidence: "Moderate",
      rawMetrics: {
        leanMassLatest: 154.1,
        leanMassDelta14d: 0.5,
      },
      evidence: {
        positive: ["Hydration confidence high"],
        negative: ["Lean mass estimate down 0.5 lb"],
      },
      coachInterpretation: "Lean-preservation risk is elevated.",
    } as any,
    coachingMemory: {
      validatedLearnings: [
        {
          id: "win-1",
          kind: "validated_learning",
          label: "Pull",
          sourceType: "session_signal",
          confidence: "high",
          text: "MTS Row: chest-supported row reinforced Gaz's cues",
          exerciseName: "MTS Row",
        },
      ],
      activeWatchItems: [
        {
          id: "watch-1",
          kind: "active_watch",
          label: "Press",
          sourceType: "session_signal",
          confidence: "moderate",
          text: "Bradford Press: stopped due to shoulder twinge",
        },
      ],
      resolvedItems: [
        {
          id: "resolved-1",
          kind: "resolved",
          label: "Pull",
          sourceType: "derived",
          confidence: "moderate",
          text: "Substitution worked",
        },
      ],
      sourceWindow: { sessionCount: 4 },
    },
    coachIntelligence: {
      fatLossStatus: "On Track",
      musclePreservationStatus: "Watch",
      trainingStatus: "Mixed",
      performanceTrendStatus: "Improving",
      movementQualityStatus: "Watch",
      recoveryStatus: "Good",
      overallStatus: "Watch",
      confidence: "Moderate",
      summary: "Goal trajectory is moving in the right direction.",
      biggestWin: "MTS Row: chest-supported row reinforced Gaz's cues",
      biggestRisk: "The current rate of weight loss may outpace the muscle-preservation margin if fatigue or strength pressure worsens.",
      positives: ["Body weight is decreasing"],
      watchItems: ["Terminal-rep quality dropped under fatigue"],
      recommendations: ["Keep progression conservative while the cut rate is aggressive."],
      narrative: ["Fat Loss: Weight and waist are moving in the intended direction."],
    } as any,
    currentMovementFocus: [
      { label: "Pull", exercises: ["MTS Row", "Assisted Pull Up"] },
    ],
  } as CoachExportMetrics;
}

test("coach state snapshot maps summary, confidence, and risk signals", async () => {
  const state = buildCoachStateFromExportMetrics(buildMetrics());

  expect(state.snapshot.overallStatus).toBe("watch");
  expect(state.snapshot.confidence).toBe("moderate");
  expect(state.snapshot.narrative).toContain("Goal trajectory is moving in the right direction.");
  expect(state.snapshot.biggestWin).toContain("MTS Row: chest-supported row reinforced Gaz's cues");
  expect(state.snapshot.biggestRisk).toContain("muscle-preservation margin");
  expect(state.snapshot.todayFocus).toContain("Keep progression conservative");
});

test("coach state body section maps body confidence and body metrics", async () => {
  const state = buildCoachStateFromExportMetrics(buildMetrics());

  expect(state.body.confidence?.overall).toBe("high");
  expect(state.body.latestWeightLb).toBe(198);
  expect(state.body.weightDelta14dLb).toBe(-3);
  expect(state.body.latestWaistIn).toBe(35.5);
  expect(state.body.waistDelta14dIn).toBe(-0.6);
  expect(state.body.latestBodyFatPct).toBe(16.2);
  expect(state.body.latestLeanMassLb).toBe(154.1);
  expect(state.body.whtr?.current).toBe(0.495);
  expect(state.body.whtr?.status).toBe("Healthy");
});

test("coach state strength section maps trend, signal, and anchors", async () => {
  const state = buildCoachStateFromExportMetrics(buildMetrics());

  expect(state.strength.performanceTrend).toBe("Improving");
  expect(state.strength.movementQuality).toBe("Watch");
  expect(state.strength.strengthSignalCurrent).toBe(1.92);
  expect(state.strength.strengthSignalDelta14d).toBe(0.04);
  expect(state.strength.strengthSignalVsBestPct).toBe(-1.5);
  expect(state.strength.anchors?.[0].pattern).toBe("push");
  expect(state.strength.anchors?.[0].exerciseName).toBe("Bench Press");
});

test("coach state learnings and goals map from export metrics", async () => {
  const state = buildCoachStateFromExportMetrics(buildMetrics());

  expect(state.goals.trajectoryStatus).toBe("On Track");
  expect(state.goals.targets?.[0].label).toBe("Weight");
  expect(state.learnings.validated).toContain("MTS Row: chest-supported row reinforced Gaz's cues");
  expect(state.learnings.watchItems).toContain("Bradford Press: stopped due to shoulder twinge");
  expect(state.learnings.resolved).toContain("Substitution worked");
});

test("coach state remains read-only and keeps safe defaults when data is missing", async () => {
  const emptyInput: any = undefined;
  const state = buildCoachStateFromExportMetrics(emptyInput);

  expect(state.export.available).toBe(false);
  expect(state.snapshot.overallStatus).toBe("not_enough_data");
  expect(state.snapshot.confidence).toBe("low");
  expect(state.body.latestWeightLb).toBeUndefined();
  expect(state.cardio.available).toBe(false);
  expect(state.goals.targets).toEqual([]);
  expect(state.learnings.validated).toEqual([]);
  expect(state.learnings.watchItems).toEqual([]);
  expect(state.learnings.resolved).toEqual([]);
});

test("coach state builder does not mutate the export metrics input", async () => {
  const metrics = buildMetrics();
  const before = structuredClone(metrics);

  buildCoachStateFromExportMetrics(metrics);

  expect(metrics).toEqual(before);
});
