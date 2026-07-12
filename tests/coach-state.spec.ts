import { expect, test } from "@playwright/test";
import { buildBodyConfidence } from "../src/body/bodyConfidenceEngine";
import { buildCardioWalkSummary } from "../src/lib/cardio/buildCardioWalkSummary";
import { buildCoachStateFromExportMetrics } from "../src/lib/coachState/buildCoachState";
import { buildGoalProgress } from "../src/lib/coachExport/goalEngine";
import type { CoachExportMetrics } from "../src/lib/coachExport/types";
import type { Exercise, Session, SetEntry, Track } from "../src/db";

function ms(year: number, month: number, day: number, hour: number, minute: number) {
  return new Date(year, month - 1, day, hour, minute, 0, 0).getTime();
}

function makeSession(id: string, name: string, startedAt: number, endedAt: number): Session {
  return {
    id,
    templateName: name,
    startedAt,
    endedAt,
  } as Session;
}

function makeExercise(id: string, name: string): Exercise {
  return {
    id,
    name,
    normalizedName: name.toLowerCase(),
    equipmentTags: [],
    createdAt: ms(2026, 4, 1, 9, 0),
  } as Exercise;
}

function makeTrack(id: string, exerciseId: string, displayName: string): Track {
  return {
    id,
    exerciseId,
    displayName,
    trackType: "conditioning",
    trackingMode: "timeSeconds",
    warmupSetsDefault: 0,
    workingSetsDefault: 1,
    repMin: 1,
    repMax: 1,
    restSecondsDefault: 0,
    weightJumpDefault: 0,
    createdAt: ms(2026, 4, 1, 9, 0),
  } as Track;
}

function makeSet(
  id: string,
  sessionId: string,
  trackId: string,
  options: { distanceMiles?: number; seconds?: number }
): SetEntry {
  return {
    id,
    sessionId,
    trackId,
    createdAt: ms(2026, 4, 1, 9, 0),
    setType: "working",
    ...(options.distanceMiles != null
      ? { distance: options.distanceMiles * 1609.344, distanceUnit: "m" }
      : null),
    ...(options.seconds != null ? { seconds: options.seconds } : null),
    completedAt: ms(2026, 4, 1, 9, 0),
  } as SetEntry;
}

function buildCardioSummary() {
  const exercise = makeExercise("cardio-walk", "Walk");
  const trackDistance = makeTrack("cardio-walk-distance", exercise.id, "Walk");
  const trackDuration = makeTrack("cardio-walk-duration", exercise.id, "Walk");
  const sessions = [
    makeSession(
      "walk-recent",
      "Walk - MapMyWalk",
      ms(2026, 4, 26, 7, 30),
      ms(2026, 4, 26, 8, 20)
    ),
    makeSession(
      "walk-mid",
      "Walk - Treadmill",
      ms(2026, 4, 18, 7, 30),
      ms(2026, 4, 18, 8, 15)
    ),
    makeSession(
      "walk-old",
      "Walk - Park",
      ms(2026, 4, 12, 7, 30),
      ms(2026, 4, 12, 8, 10)
    ),
  ];

  const sets = [
    makeSet("set-recent-distance", "walk-recent", trackDistance.id, { distanceMiles: 2.3 }),
    makeSet("set-mid-distance", "walk-mid", trackDistance.id, { distanceMiles: 1.8 }),
    makeSet("set-old-distance", "walk-old", trackDistance.id, { distanceMiles: 1.5 }),
    makeSet("set-recent-duration", "walk-recent", trackDuration.id, { seconds: 50 * 60 }),
    makeSet("set-mid-duration", "walk-mid", trackDuration.id, { seconds: 45 * 60 }),
    makeSet("set-old-duration", "walk-old", trackDuration.id, { seconds: 40 * 60 }),
  ];

  return buildCardioWalkSummary({
    now: ms(2026, 4, 27, 9, 0),
    sessions,
    sets,
    tracks: [trackDistance, trackDuration],
    exercises: [exercise],
    recentLimit: 5,
  });
}

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
  const cardioSummary = buildCardioSummary();

  return {
    generatedAt: new Date("2026-04-27T09:00:00-04:00").getTime(),
    currentPhase: "cut",
    bodyComp,
    hydration,
    cardioSummary,
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
        ageDays: 3,
        recency: "recent",
        isStale: false,
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
    weeklyVolume: {
      windowDays: 7,
      asOf: new Date("2026-04-27T09:00:00-04:00").toISOString(),
      groups: [
        {
          bucket: "chest_pressing",
          label: "Chest Pressing",
          primeCredit: 3,
          supportCredit: 1.5,
          exposureCount: 0,
          totalCredit: 4.5,
          status: "watch",
          examples: ["Bench Press"],
        },
        {
          bucket: "lats",
          label: "Lats",
          primeCredit: 4,
          supportCredit: 2,
          exposureCount: 0,
          totalCredit: 6,
          status: "solid",
          examples: ["Lat Pulldown"],
        },
      ],
      rollups: [
        {
          id: "chest_push",
          label: "Chest / Push",
          totalCredit: 4.5,
          exposureCount: 0,
          status: "watch",
          parts: [
            { bucket: "chest_pressing", label: "Chest Pressing", credit: 3, exposureCount: 0 },
          ],
        },
        {
          id: "back_pull",
          label: "Back / Pull",
          totalCredit: 6,
          exposureCount: 0,
          status: "solid",
          parts: [
            { bucket: "lats", label: "Lats", credit: 6, exposureCount: 0 },
          ],
        },
      ],
      balances: [
        {
          id: "push_pull",
          label: "Push / Pull",
          leftLabel: "Push",
          rightLabel: "Pull",
          leftValue: 4.5,
          rightValue: 6,
          ratio: 0.75,
          status: "solid",
          statusLabel: "Pull Behind",
          direction: "right_ahead",
          summary: "Pull volume is ahead of push volume.",
          currentText: "Push: 4.5 effective sets | Pull: 6 effective sets",
          explanation: "Pull volume is about 0.8x higher than push volume over the recent 7-day window.",
          action: "Add 3-5 pushing sets over the next 7 days, or hold pull volume steady.",
          ratioText: "Internal ratio: 0.75",
          note: "Push is slightly behind pull.",
        },
      ],
      unclassified: [{ exerciseName: "Mystery Row", setCount: 1 }],
      status: "watch",
      summary: "Weekly volume is mixed. Push is slightly behind pull.",
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
  expect(state.strength.anchors?.[0].ageDays).toBe(3);
  expect(state.strength.anchors?.[0].recency).toBe("recent");
  expect(state.strength.anchors?.[0].isStale).toBe(false);
});

test("coach state learnings and goals map from export metrics", async () => {
  const state = buildCoachStateFromExportMetrics(buildMetrics());

  expect(state.goals.trajectoryStatus).toBe("On Track");
  expect(state.goals.targets?.[0].label).toBe("Weight");
  expect(state.learnings.validated).toContain("MTS Row: chest-supported row reinforced Gaz's cues");
  expect(state.learnings.watchItems).toContain("Bradford Press: stopped due to shoulder twinge");
  expect(state.learnings.resolved).toContain("Substitution worked");
  expect(state.trainingVolume?.status).toBe("watch");
  expect(state.trainingVolume?.rollups?.[0].label).toBe("Chest / Push");
  expect(state.trainingVolume?.balances?.[0].label).toBe("Push / Pull");
});

test("coach state cardio section maps cardio summary windows and recent walk", async () => {
  const state = buildCoachStateFromExportMetrics(buildMetrics());

  expect(state.cardio.available).toBe(true);
  expect(state.cardio.status).toBe("watch");
  expect(state.cardio.walkCount7d).toBe(1);
  expect(state.cardio.totalDuration7dSeconds).toBe(50 * 60);
  expect(state.cardio.totalDistance7dMeters).toBeCloseTo(2.3 * 1609.344, 3);
  expect(state.cardio.walkCount28d).toBe(3);
  expect(state.cardio.totalDuration28dSeconds).toBe(135 * 60);
  expect(state.cardio.totalDistance28dMeters).toBeCloseTo((2.3 + 1.8 + 1.5) * 1609.344, 3);
  expect(state.cardio.averagePace7dSecondsPerMile).toBeGreaterThan(0);
  expect(state.cardio.recent?.sessionId).toBe("walk-recent");
  expect(state.cardio.recent?.name).toBe("Walk - MapMyWalk");
  expect(state.cardio.note).toContain("walk in the last 7 days");
});

test("coach state remains read-only and keeps safe defaults when data is missing", async () => {
  const emptyInput: any = undefined;
  const state = buildCoachStateFromExportMetrics(emptyInput);

  expect(state.export.available).toBe(false);
  expect(state.snapshot.overallStatus).toBe("not_enough_data");
  expect(state.snapshot.confidence).toBe("low");
  expect(state.body.latestWeightLb).toBeUndefined();
  expect(state.cardio.available).toBe(false);
  expect(state.cardio.status).toBe("not_enough_data");
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
