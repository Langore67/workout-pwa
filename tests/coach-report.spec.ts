import { expect, test } from "@playwright/test";
import { buildBodyConfidence } from "../src/body/bodyConfidenceEngine";
import { evaluatePhaseQuality } from "../src/body/phaseQualityModel";
import { buildLeanPreservationComposite } from "../src/lib/coachExport/leanPreservationComposite";
import { formatCoachExportText } from "../src/lib/coachExport/formatCoachExportText";
import { buildCoachReport, hasCoachReportDashboardContent } from "../src/lib/coachReport/buildCoachReport";
import { formatCoachReportText } from "../src/lib/coachReport/formatCoachReportText";
import { buildCoachStateFromExportMetrics } from "../src/lib/coachState/buildCoachState";

function buildFixture(overrides: any = {}) {
  const weeklyVolume = {
    windowDays: 7,
    asOf: new Date("2026-07-06T09:00:00-04:00").toISOString(),
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
      {
        bucket: "glute_med_min",
        label: "Glute Med/Min",
        primeCredit: 0,
        supportCredit: 0,
        exposureCount: 2,
        totalCredit: 0.5,
        status: "watch",
        examples: ["Locked Clams"],
      },
    ],
    rollups: [
      {
        id: "chest_push",
        label: "Chest / Push",
        totalCredit: 4.5,
        exposureCount: 0,
        status: "watch",
        parts: [{ bucket: "chest_pressing", label: "Chest Pressing", credit: 3, exposureCount: 0 }],
      },
      {
        id: "back_pull",
        label: "Back / Pull",
        totalCredit: 6,
        exposureCount: 0,
        status: "solid",
        parts: [{ bucket: "lats", label: "Lats", credit: 6, exposureCount: 0 }],
      },
      {
        id: "lower_glutes",
        label: "Lower / Glutes",
        totalCredit: 0.5,
        exposureCount: 2,
        status: "watch",
        parts: [{ bucket: "glute_med_min", label: "Glute Med/Min", credit: 0.5, exposureCount: 2 }],
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
        statusLabel: "Push Behind",
        direction: "right_ahead",
        summary: "Pull volume is ahead of push volume.",
        currentText: "Push: 4.5 effective sets | Pull: 6 effective sets",
        explanation: "Pull volume is about 1.3× push volume over the recent 7-day window.",
        action: "Add 3-5 pushing sets over the next 7 days, or hold pull volume steady.",
        ratioText: "Internal ratio: 0.75",
        isContextuallyAcceptable: false,
        note: "Push is slightly behind pull.",
      },
      {
        id: "glute_max_med_min",
        label: "Glute Max / Med-Min",
        leftLabel: "Glute Max",
        rightLabel: "Glute Med/Min",
        leftValue: 6,
        rightValue: 0.5,
        ratio: 12,
        status: "intervene",
        statusLabel: "Strong Hip-Extension Bias",
        direction: "left_ahead",
        summary: "Glute max volume is ahead of hip-stability work.",
        currentText: "Glute Max: 6 effective sets | Glute Med/Min: 0.5 effective sets",
        explanation: "Glute max volume is about 12× hip-stability volume.",
        action: "Add 2-4 hip-stability sets or corrective exposures.",
        ratioText: "Internal ratio: 12.00",
        note: "Glute med/min exposure is far behind glute max.",
      },
    ],
    unclassified: [{ exerciseName: "Mystery Row", setCount: 1 }],
    status: "watch",
    summary: "Weekly volume is mixed. Push is slightly behind pull.",
  };

  return {
    coachState: {
      generatedAt: Date.UTC(2026, 6, 6, 9, 0, 0, 0),
      snapshot: {
        overallStatus: "watch",
        confidence: "high",
        narrative: "Goal trajectory is moving in the right direction.",
        biggestWin: "Pulling mechanics are improving.",
        biggestRisk: "Cut rate is aggressive.",
        todayFocus: "Keep progression conservative.",
      },
      body: {
        confidence: {
          overall: "high",
          weight: "high",
          waist: "high",
          leanMass: "high",
          bodyFat: "high",
          hydration: "moderate",
        },
        latestWeightLb: 184.3,
        weightDelta14dLb: -2.3,
        latestWaistIn: 36.8,
        waistDelta14dIn: 0.3,
        latestBodyFatPct: 21.3,
        latestLeanMassLb: 143.1,
      },
      strength: {
        performanceTrend: "Mixed",
        movementQuality: "Watch",
        strengthSignalCurrent: 1.92,
        strengthSignalDelta14d: -0.03,
        strengthSignalVsBestPct: -1.5,
        anchors: [
          {
            pattern: "pull",
            exerciseName: "Lat Pulldown",
            trackDisplayName: "Lat Pulldown",
            effectiveWeightLb: 140,
            reps: 10,
            e1rm: 187,
            performedAt: Date.UTC(2026, 5, 14, 9, 0, 0, 0),
            ageDays: 22,
            recency: "historical",
            isStale: true,
            movementFamily: "vertical_pull",
            status: "historical_anchor",
            currentMovement: {
              exerciseName: "Assisted Pull Up",
              movementFamily: "vertical_pull",
              performedAt: Date.UTC(2026, 6, 4, 9, 0, 0, 0),
              ageDays: 2,
            },
            relationship: "same_family_different_exercise",
            interpretation: "Historical vertical pull anchor: Lat Pulldown. Current vertical pull movement: Assisted Pull Up.",
          },
        ],
      },
      cardio: {
        available: true,
        status: "watch",
        note: "2 walks in the last 7 days.",
        recent: {
          sessionId: "walk-recent",
          name: "Walk - MapMyWalk",
          startedAt: Date.UTC(2026, 6, 3, 8, 0, 0, 0),
          durationSeconds: 3600,
          distanceMeters: 3218.688,
          paceSecondsPerMile: 900,
        },
        walkCount7d: 2,
        totalDuration7dSeconds: 5400,
        totalDistance7dMeters: 6437.376,
        walkCount28d: 4,
        totalDuration28dSeconds: 10800,
        totalDistance28dMeters: 12874.752,
        averagePace7dSecondsPerMile: 915,
      },
      goals: {
        trajectoryStatus: "Watch",
        targets: [
          { label: "Weight", current: 184.3, target: 180, remaining: 4.3, unit: "lb", status: "Watch" },
          { label: "Waist", current: 36.8, target: 35, remaining: 1.8, unit: "in", status: "Watch" },
          { label: "Body Fat", current: 21.3, target: 15, remaining: 6.3, unit: "pts", status: "Watch" },
        ],
      },
      learnings: {
        validated: ["Pull: strong lat stimulus", "Leg Press: breakthrough pattern found"],
        watchItems: ["Trap compensation remains a carry constraint", "Joint feedback appears under higher-fatigue conditions"],
        resolved: [],
      },
      trainingVolume: weeklyVolume,
    },
    metrics: {
      generatedAt: Date.UTC(2026, 6, 6, 9, 0, 0, 0),
      bodyTrendInputs: {
        method: "rolling_5_data_points_except_waist",
        weight14d: {
          rawLatest: 184.3,
          rolling5: 186.1,
          baseline14d: 188.4,
          delta14d: -2.3,
          sampleCount: 5,
          latestAt: Date.UTC(2026, 6, 6, 9, 0, 0, 0),
          baselineSampleCount: 5,
        },
        weight7d: {
          rawLatest: 184.3,
          rolling5: 186.1,
          baseline14d: 188.4,
          delta14d: -2.3,
          sampleCount: 5,
          latestAt: Date.UTC(2026, 6, 6, 9, 0, 0, 0),
          baselineSampleCount: 5,
        },
        bodyFatPct: {
          rawLatest: 21.3,
          rolling5: 20.9,
          baseline14d: 21.1,
          delta14d: -0.2,
          sampleCount: 5,
          latestAt: Date.UTC(2026, 6, 6, 9, 0, 0, 0),
          baselineSampleCount: 5,
        },
        leanMass: {
          rawLatest: 143.1,
          rolling5: 144.0,
          baseline14d: 144.6,
          delta14d: -0.6,
          sampleCount: 5,
          latestAt: Date.UTC(2026, 6, 6, 9, 0, 0, 0),
          baselineSampleCount: 5,
        },
        fatMass: {
          rawLatest: 39.3,
          rolling5: 38.9,
          baseline14d: 39.7,
          delta14d: -0.8,
          sampleCount: 5,
          latestAt: Date.UTC(2026, 6, 6, 9, 0, 0, 0),
          baselineSampleCount: 5,
        },
        waist: {
          rawLatest: 36.8,
          baseline14d: 36.5,
          delta14d: 0.3,
          sampleCount: 1,
          latestAt: Date.UTC(2026, 6, 6, 9, 0, 0, 0),
        },
      },
      bodyComp: {
        weight: { latest: 184.3, baseline14d: 188.4, delta14d: -2.3 },
        waist: { latest: 36.8, baseline14d: 36.5, delta14d: 0.3 },
        bodyFatPct: { latest: 21.3, baseline14d: 21.1, delta14d: -0.2 },
        leanMass: { latest: 143.1, baseline14d: 144.6, delta14d: -0.6 },
        visceralFat: { latest: 8.2, baseline14d: 8.4, delta14d: -0.2 },
        waistToHeight: { latest: 0.502, baseline14d: 0.507, delta14d: -0.005, status: "Healthy", healthyWaistTargetIn: 35, distanceToThresholdIn: 1.8 },
        bodyweightDelta7d: -1.1,
        bodyweightDelta14d: -2.3,
      },
      hydration: { latestWaterPct: 57.2, confidenceLabel: "Moderate", confidenceScore: 72, note: "Hydration is stable." },
      strengthSignal: { current: 1.92, delta14d: -0.03, vs90dBestPct: -1.5, currentBodyweight: 184.3, bodyweightDaysUsed: 5 },
      anchorLifts: [],
      trainingSignals: { movementQuality: [], stimulusCoverage: [], fatigueReadiness: [], nextWorkoutFocus: [], discussWithGaz: [] },
      patternSummary: { movementQuality: [], stimulus: [], fatigue: [], constraints: [], progression: [] },
      nextWorkoutFocus: { progressionGuardrails: [], executionPriorities: [], adjustmentTriggers: [] },
      weeklyVolume,
      exportConfidence: { score: 80, label: "Strong", components: { waistReadiness: 80, weightDataReady: 80, strengthDataReady: 80, coherenceScore: 80 } },
      readinessNotes: [],
      dataNotes: [],
    },
    ...overrides,
  };
}

test("coach report maps snapshot, body, performance, goals, learnings, and cardio", async () => {
  const fixture = buildFixture();
  const report = buildCoachReport(fixture as any);

  expect(report.snapshot.status).toBe("Watch");
  expect(report.snapshot.confidence).toBe("High");
  expect(report.snapshot.why).toContain("Goal trajectory is moving in the right direction.");
  expect(report.snapshot.today).toContain("Keep progression conservative.");

  expect(report.body?.values.map((line) => line.label)).toEqual(["Weight", "Waist", "Body Fat", "Lean Mass", "Fat Mass"]);
  expect(report.body?.values[0].value).toContain("latest");
  expect(report.body?.values[0].value).toContain("coach avg");
  expect(report.body?.values[1].value).toContain("latest/manual");
  expect(report.body?.note).toContain("rolling 5-entry averages except waist");

  expect(report.performance?.anchor?.text).toContain("Historical anchor");
  expect(report.performance?.anchor?.text).toContain("22d old");
  expect(report.performance?.anchor?.familyLabel).toBe("Vertical Pull");
  expect(report.performance?.anchor?.statusLabel).toBe("Historical anchor");
  expect(report.performance?.anchor?.currentMovementText).toContain("Assisted Pull Up");
  expect(report.performance?.anchor?.relationshipText).toBe("Same movement family");
  expect(report.performance?.anchor?.read).toContain("Historical vertical pull anchor");
  expect(report.performance?.read).toContain("Historical vertical pull anchor remains useful");

  expect(report.goals?.trajectory).toBe("Watch");
  expect(report.goals?.read).toContain("Weight goal is close");

  expect(report.learnings?.whatsWorking).toContain("Pull: strong lat stimulus");
  expect(report.learnings?.watchNow).toContain("Trap compensation remains a carry constraint");

  expect(report.weeklyVolume?.title).toBe("Weekly Volume");
  expect(report.weeklyVolume?.note).toContain("Recent pulling volume exceeds pressing volume.");
  expect(report.weeklyVolume?.rows.map((row) => row.value).join(" ")).toContain("effective sets");
  expect(report.weeklyVolume?.rows.map((row) => row.value).join(" ")).toContain("control exposures");
  expect(report.weeklyVolume?.rows.find((row) => row.label === "Arms")?.value).toContain("indirect support");
  expect(report.weeklyVolume?.balanceRows.find((row) => row.label === "Push / Pull")?.statusLabel).toBe("Push Behind");
  expect(report.weeklyVolume?.balanceRows.find((row) => row.label === "Push / Pull")?.currentText).toContain("Push:");
  expect(report.weeklyVolume?.balanceRows.find((row) => row.label === "Push / Pull")?.currentText).toContain("Pull:");
  expect(report.weeklyVolume?.balanceRows.find((row) => row.label === "Push / Pull")?.action).toContain("pushing sets");
  expect(report.weeklyVolume?.detailRows?.find((row) => row.label === "Chest Pressing")?.value).toContain("Prime");
  expect(report.weeklyVolume?.detailRows?.find((row) => row.label === "Glute Med/Min")?.value).toContain("Exposure");
  expect(report.weeklyVolume?.unclassified).toContain("Mystery Row: 1 set");

  expect(report.cardio?.isEmpty).toBeFalsy();
  expect(report.cardio?.rows.map((line) => line.label)).toContain("Last 7 Days");
  expect(report.cardio?.rows.map((line) => line.label)).toContain("Recent Walk/Cardio");
});

test("coach report keeps cardio quiet when no summary exists", async () => {
  const fixture = buildFixture({
    coachState: {
      ...buildFixture().coachState,
      cardio: { available: false, status: "not_enough_data" },
    },
    metrics: {
      ...buildFixture().metrics,
    },
  });

  const report = buildCoachReport(fixture as any);

  expect(report.cardio?.isEmpty).toBe(true);
  expect(report.cardio?.note).toContain("Cardio summary not available yet");
  expect(report.cardio?.rows).toEqual([]);
});

test("coach report dashboard visibility is driven by report sections, not raw training-only notes", async () => {
  expect(
    hasCoachReportDashboardContent({
      snapshot: {
        status: "Not Enough Data",
        confidence: "Low",
        why: "Insufficient data.",
        today: "Build more data.",
      },
      trainingSignals: {
        title: "Training Signals (Recent Sessions)",
        blocks: [{ heading: "Fatigue / Readiness", items: ["Bench Press: elbow pain showed up late"] }],
      } as any,
    } as any)
  ).toBeFalsy();

  expect(
    hasCoachReportDashboardContent({
      snapshot: {
        status: "Watch",
        confidence: "High",
        why: "Goal trajectory is moving in the right direction.",
        today: "Keep progression conservative.",
      },
      body: {
        heading: "Body Values",
        values: [
          { label: "Weight", value: "186.1 lb coach avg | latest 184.3 lb", text: "- Weight: 186.1 lb coach avg | latest 184.3 lb" },
        ],
        confidenceRows: [],
      } as any,
    } as any)
  ).toBeTruthy();
});

test("coach report includes structured export-only sections", async () => {
  const fixture = buildFixture();
  const leanConfidence = buildBodyConfidence({
    bodyComp: {
      weight: fixture.metrics.bodyComp.weight,
      waist: fixture.metrics.bodyComp.waist,
      bodyFatPct: fixture.metrics.bodyComp.bodyFatPct,
      leanMass: fixture.metrics.bodyComp.leanMass,
      bodyweightDelta7d: fixture.metrics.bodyComp.bodyweightDelta7d,
      bodyweightDelta14d: fixture.metrics.bodyComp.bodyweightDelta14d,
    },
    hydration: fixture.metrics.hydration,
  });

  fixture.metrics.leanPreservation = buildLeanPreservationComposite({
    leanMass: fixture.metrics.bodyComp.leanMass,
    weight: fixture.metrics.bodyComp.weight,
    waist: fixture.metrics.bodyComp.waist,
    bodyFatPct: fixture.metrics.bodyComp.bodyFatPct,
    hydration: fixture.metrics.hydration,
    bodyConfidence: leanConfidence,
    strengthSignal: fixture.metrics.strengthSignal,
    recentPerformanceSignals: ["Pull: strong lat stimulus"],
  });
  fixture.metrics.bodyConfidence = leanConfidence;
  fixture.metrics.phaseQuality = evaluatePhaseQuality("cut", {
    weightDelta: fixture.metrics.bodyComp.weight.delta14d ?? undefined,
    waistDelta: fixture.metrics.bodyComp.waist.delta14d ?? undefined,
    correctedLeanDelta: fixture.metrics.bodyComp.leanMass.delta14d ?? undefined,
    correctedBodyFatDelta: fixture.metrics.bodyComp.bodyFatPct.delta14d ?? undefined,
    strengthDelta: fixture.metrics.strengthSignal.delta14d ?? undefined,
    sampleCount: 4,
    bodyConfidence: leanConfidence,
  });
  fixture.metrics.currentMovementFocus = [
    { label: "Pull", exercises: ["MTS Row", "Assisted Pull Up"] },
    { label: "Hinge", exercises: ["Trap Bar Deadlift"] },
  ];
  fixture.metrics.anchorLifts = [
    {
      pattern: "pull",
      exerciseName: "Lat Pulldown",
      trackDisplayName: "Lat Pulldown",
      effectiveWeightLb: 140,
      reps: 10,
      e1rm: 187,
      performedAt: Date.UTC(2026, 5, 14, 9, 0, 0, 0),
      ageDays: 22,
      recency: "historical",
      isStale: true,
    },
  ];
  fixture.metrics.nextWorkoutFocus = {
    progressionGuardrails: ["Keep progression conservative given current phase-quality risk."],
    executionPriorities: ["Preserve known pulling setup constraints when selecting or progressing work."],
    adjustmentTriggers: ["Reduce volume if later-set fatigue or terminal-rep quality drop appears early."],
  };
  fixture.metrics.trainingSignals = {
    movementQuality: ["MTS Row: improved stretch and contraction"],
    stimulusCoverage: ["Pull: strong lat stimulus"],
    fatigueReadiness: ["Terminal-rep quality dropped"],
    nextWorkoutFocus: [],
    discussWithGaz: [],
  };
  fixture.metrics.coachingMemory = {
    validatedLearnings: [
      {
        id: "learn-1",
        kind: "validated_learning",
        label: "MTS Row",
        sourceType: "session_signal",
        confidence: "moderate",
        text: "MTS Row: chest-supported row reinforced Gaz's cues",
        exerciseName: "MTS Row",
      },
    ],
    activeWatchItems: [],
    resolvedItems: [],
    sourceWindow: { sessionCount: 4 },
  } as any;
  fixture.metrics.patternSummary = {
    movementQuality: ["Lat engagement improving across recent pull work"],
    stimulus: ["Pull stimulus remains repeatable across recent sessions"],
    fatigue: ["Fatigue shows up at terminal reps across recent working sets"],
    constraints: ["Trap compensation remains a carry constraint"],
    progression: ["Pulling movements show improving consistency"],
  };
  fixture.metrics.readinessNotes = ["Sleep disrupted."];
  fixture.metrics.dataNotes = ["Waist history is sparse.", "No major data gaps detected."];

  const report = buildCoachReport(fixture as any);

  expect(report.exportOnly?.leanPreservation?.title).toBe("Lean Preservation");
  expect(report.exportOnly?.leanPreservation?.rows?.map((row) => row.text ?? "")).toEqual(
    expect.arrayContaining([expect.stringContaining("Raw Metrics"), expect.stringContaining("Composite")])
  );
  expect(report.exportOnly?.leanPreservation?.positive?.join(" ")).toContain("Strength");
  expect(report.exportOnly?.visceralFat?.title).toBe("Visceral Fat");
  expect(report.exportOnly?.phaseQuality?.title).toBe("Cut / Phase Quality");
  expect(report.exportOnly?.phaseQuality?.blocks?.[0].heading).toBe("Drivers");
  expect(report.exportOnly?.strengthSignalDetails?.title).toBe("Strength Signal");
  expect(report.exportOnly?.strengthSignalDetails?.blocks?.[0].heading).toBe("Performance Anchors");
  expect(report.exportOnly?.currentMovementFocus?.rows?.map((row) => row.text)).toEqual(
    expect.arrayContaining(["- Pull: MTS Row; Assisted Pull Up", "- Hinge: Trap Bar Deadlift"])
  );
  expect(report.exportOnly?.nextWorkoutFocus?.blocks?.map((block) => block.heading)).toEqual(
    expect.arrayContaining(["Progression Guardrails", "Execution Priorities", "Adjustment Triggers"])
  );
  expect(report.exportOnly?.recentPatterns?.blocks?.map((block) => block.heading)).toEqual(
    expect.arrayContaining(["Movement Quality", "Stimulus", "Fatigue / Readiness", "Constraints", "Progression"])
  );
  expect(report.waistToHeight?.title).toBe("Waist-to-Height Ratio");
  expect(report.summary?.title).toBe("Coach Summary");
  expect(report.summary?.blocks?.map((block) => block.heading)).toEqual(
    expect.arrayContaining(["Summary", "Biggest Win", "Biggest Risk", "Fat Loss", "Muscle Preservation", "Training", "Recommendations"])
  );
  expect(report.hydration?.title).toBe("Hydration");
  expect(report.trainingSignals?.title).toBe("Training Signals (Recent Sessions)");
  expect(report.readinessNotes?.title).toBe("Readiness / Confidence Notes");
  expect(report.dataGaps?.title).toBe("Data Gaps");
  expect(report.trainingSignals?.blocks?.map((block) => block.heading)).toEqual(
    expect.arrayContaining(["Validated Learnings", "Movement Quality", "Stimulus / Coverage"])
  );
});

test("coach report weekly volume balances use corrected direction labels and multipliers", async () => {
  const report = {
    generatedAt: new Date(Date.UTC(2026, 6, 6, 9, 0, 0, 0)).toLocaleString(),
    snapshot: {
      status: "Watch",
      confidence: "Moderate",
      why: "Weekly volume is mixed.",
      today: "Keep progression balanced.",
    },
    weeklyVolume: {
      title: "Weekly Volume",
      status: "Watch",
      note: "Weekly volume is mixed.",
      rows: [],
      balanceRows: [
        {
          id: "push_pull",
          label: "Push / Pull",
          leftLabel: "Push",
          rightLabel: "Pull",
          leftValue: 12.8,
          rightValue: 49,
          ratio: 0.26,
          status: "watch",
          statusLabel: "Push Behind",
          direction: "right_ahead",
          summary: "Pull volume is ahead of push volume.",
          currentText: "Push: 12.8 effective sets | Pull: 49 effective sets",
          explanation: "Pull volume is about 3.8× push volume over the recent 7-day window.",
          action: "Add 3-5 pushing sets over the next 7 days, or hold pull volume steady.",
          ratioText: "Internal ratio: 0.26",
          note: "Pull volume is ahead of push volume.",
        },
        {
          id: "pressing_scapular",
          label: "Pressing / Scapular",
          leftLabel: "Pressing",
          rightLabel: "Scapular Support",
          leftValue: 8.8,
          rightValue: 25,
          ratio: 0.35,
          status: "watch",
          statusLabel: "Scapular Support Ahead",
          direction: "right_ahead",
          summary: "Scapular support is ahead of pressing volume.",
          currentText: "Pressing: 8.8 effective sets | Scapular Support: 25 effective sets",
          explanation: "Scapular-support volume is about 2.8× pressing volume over the recent 7-day window.",
          action: "No immediate change needed. Maintain the current emphasis for now.",
          ratioText: "Internal ratio: 0.35",
          isContextuallyAcceptable: true,
          note: "Scapular support is ahead of pressing volume.",
        },
        {
          id: "quad_posterior_chain",
          label: "Quads / Posterior Chain",
          leftLabel: "Quads",
          rightLabel: "Posterior Chain",
          leftValue: 7,
          rightValue: 10.9,
          ratio: 0.64,
          status: "watch",
          statusLabel: "Posterior Chain Ahead",
          direction: "right_ahead",
          summary: "Posterior-chain work is ahead of quad volume.",
          currentText: "Quads: 7 effective sets | Posterior Chain: 10.9 effective sets",
          explanation: "Posterior-chain volume is about 1.6× quad volume over the recent 7-day window.",
          action: "Add one quad-focused exercise or 2-4 quad sets.",
          ratioText: "Internal ratio: 0.64",
          note: "Posterior-chain work is ahead of quad volume.",
        },
        {
          id: "glute_max_med_min",
          label: "Glute Max / Med-Min",
          leftLabel: "Glute Max",
          rightLabel: "Glute Med/Min",
          leftValue: 6.4,
          rightValue: 0.3,
          ratio: 21.33,
          status: "intervene",
          statusLabel: "Strong Hip-Extension Bias",
          direction: "left_ahead",
          summary: "Glute max volume is ahead of hip-stability work.",
          currentText: "Glute Max: 6.4 effective sets | Glute Med/Min: 0.3 effective sets",
          explanation: "Glute-max volume is about 21.3× hip-stability volume.",
          action: "Add 2-4 hip-stability sets or corrective exposures.",
          ratioText: "Internal ratio: 21.33",
          note: "Glute med/min exposure is far behind glute max.",
        },
        {
          id: "core_carry",
          label: "Core / Carry",
          leftLabel: "Core",
          rightLabel: "Carry",
          leftValue: 3,
          rightValue: 0,
          ratio: null,
          status: "watch",
          statusLabel: "Core Ahead",
          direction: "left_ahead",
          summary: "Core work is ahead of carry exposure.",
          currentText: "Core: 3 effective sets | Carry: 0 effective sets",
          explanation: "Core work is present, while no recent carry exposure was recorded.",
          action: "Add one carry exposure in the next session.",
          note: "Core work is ahead of carry exposure.",
        },
      ],
    },
  } as any;

  const text = formatCoachReportText(report as any);
  expect(text).toContain("Push / Pull: Push Behind");
  expect(text).toContain("Pull volume is about 3.8× push volume over the recent 7-day window.");
  expect(text).toContain("Pressing / Scapular: Scapular Support Ahead");
  expect(text).toContain("Scapular-support volume is about 2.8× pressing volume over the recent 7-day window.");
  expect(text).toContain("Quads / Posterior Chain: Posterior Chain Ahead");
  expect(text).toContain("Posterior-chain volume is about 1.6× quad volume over the recent 7-day window.");
  expect(text).toContain("Glute Max / Med-Min: Strong Hip-Extension Bias");
  expect(text).toContain("Glute-max volume is about 21.3× hip-stability volume.");
  expect(text).toContain("Core / Carry: Core Ahead");
  expect(text).toContain("Core work is present, while no recent carry exposure was recorded.");
  expect(text).toContain("No immediate change needed. Maintain the current emphasis for now.");
  expect((text.match(/No immediate change needed\. Maintain the current emphasis for now\./g) ?? [])).toHaveLength(1);
  expect(text).not.toContain("0.3x higher");
  expect(text).not.toContain("0.4x higher");
  expect(text).not.toContain("0.6x higher");
  expect(text).not.toContain("Infinity");
});

test("coach export formatter delegates to coach report rendering", async () => {
  const fixture = buildFixture();
  const coachState = buildCoachStateFromExportMetrics(fixture.metrics as any);
  const report = buildCoachReport({
    coachState,
    metrics: fixture.metrics as any,
    generatedAt: fixture.metrics.generatedAt,
  });

  expect(formatCoachExportText(fixture.metrics as any)).toBe(
    formatCoachReportText(report, { bodyHeadingOverride: "Body Composition — Coach Trend Values" })
  );
});



