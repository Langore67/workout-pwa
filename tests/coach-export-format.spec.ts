import { expect, test } from "@playwright/test";
import { resetDexieDb } from "./helpers/dbSeed";
import {
  getLatestAvailableWaistIn,
  waistToHeightRatio,
  waistToHeightStatus,
} from "../src/body/bodyCalculations";
import { buildNextWorkoutFocus } from "../src/lib/coachExport/buildNextWorkoutFocus";
import { buildCoachIntelligence } from "../src/lib/coachExport/coachIntelligence";
import { formatCoachExportText } from "../src/lib/coachExport/formatCoachExportText";
import { buildGoalProgress } from "../src/lib/coachExport/goalEngine";
import { buildBodyConfidence } from "../src/body/bodyConfidenceEngine";
import { buildRollingBodyMetric } from "../src/body/bodyTrendAverages";
import { evaluatePhaseQuality } from "../src/body/phaseQualityModel";
import { buildCurrentMovementFocus } from "../src/lib/coachExport/currentMovementFocus";
import { buildCoachReport } from "../src/lib/coachReport/buildCoachReport";
import { buildLeanPreservationComposite } from "../src/lib/coachExport/leanPreservationComposite";
import { buildPatternSummary, type CompletedSession } from "../src/lib/coachExport/buildPatternSummary";
import { buildExerciseVocabulary } from "../src/lib/coachExport/exerciseVocabulary";
import { isStrengthBuildingSession, selectRecentStrengthBuildingSessions } from "../src/lib/coachExport/strengthBuildingSessions";
import { informationRegistry } from "../src/config/information/informationRegistry";
import type { CoachExportMetrics, CoachExportTrainingSignals } from "../src/lib/coachExport/types";
import { buildCoachStateFromExportMetrics } from "../src/lib/coachState/buildCoachState";
import { formatCoachReportText } from "../src/lib/coachReport/formatCoachReportText";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173";

function getSection(text: string, heading: string, nextHeading?: string) {
  const start = text.indexOf(heading);
  expect(start).toBeGreaterThanOrEqual(0);
  const fromStart = text.slice(start);
  if (!nextHeading) return fromStart;
  const end = fromStart.indexOf(nextHeading);
  return end >= 0 ? fromStart.slice(0, end) : fromStart;
}

async function buildCoachExportTextFromSeededBodyRows(
  page: import("@playwright/test").Page,
  rows: Array<Record<string, unknown>>,
  options: { heightIn?: number } = {}
) {
  await page.goto(new URL("/", BASE_URL).toString(), { waitUntil: "domcontentloaded" });
  await resetDexieDb(page);
  return page.evaluate(async (seedRows) => {
    const { db } = await import("/src/db.ts");
    const { buildCoachExportMetrics } = await import("/src/lib/coachExport/buildCoachExportMetrics.ts");
    const { formatCoachExportText } = await import("/src/lib/coachExport/formatCoachExportText.ts");
    const now = Date.now();

    await db.bodyMetrics.bulkAdd(
      seedRows.rows.map((row, index) => ({
        id: `body-row-${index}-${crypto.randomUUID()}`,
        measuredAt: row.measuredAt ?? now - index * 14 * 24 * 60 * 60 * 1000,
        takenAt: row.takenAt ?? row.measuredAt ?? now - index * 14 * 24 * 60 * 60 * 1000,
        createdAt: row.createdAt ?? row.measuredAt ?? now - index * 14 * 24 * 60 * 60 * 1000,
        ...row,
      })) as any[]
    );
    if (Number.isFinite(seedRows.options.heightIn)) {
      await db.app_meta.put({
        key: "profile.heightIn",
        valueJson: JSON.stringify({ heightIn: seedRows.options.heightIn }),
        updatedAt: now,
      });
    }

    const metrics = await buildCoachExportMetrics();
    return formatCoachExportText(metrics);
  }, { rows, options });
}

function buildMetrics(): CoachExportMetrics {
  return {
    generatedAt: new Date("2026-04-27T09:00:00-04:00").getTime(),
    currentPhase: "cut",
    bodyComp: {
      weight: { latest: 198, baseline14d: 201, delta14d: -3 },
      waist: { latest: 35.5, baseline14d: 36.1, delta14d: -0.6 },
      bodyFatPct: { latest: 16.2, baseline14d: 16.9, delta14d: -0.7 },
      leanMass: { latest: 154.1, baseline14d: 153.6, delta14d: 0.5 },
      bodyweightDelta7d: -1.2,
      bodyweightDelta14d: -3,
    },
    hydration: {
      latestWaterPct: 57.2,
      confidenceLabel: "High",
      confidenceScore: 82,
      note: "Hydration signal is stable.",
      distortionLikely: false,
    },
    bodyConfidence: buildBodyConfidence({
      bodyComp: {
        weight: { latest: 198, baseline14d: 201, delta14d: -3 },
        waist: { latest: 35.5, baseline14d: 36.1, delta14d: -0.6 },
        bodyFatPct: { latest: 16.2, baseline14d: 16.9, delta14d: -0.7 },
        leanMass: { latest: 154.1, baseline14d: 153.6, delta14d: 0.5 },
        visceralFat: { latest: 8.2, baseline14d: 8.4, delta14d: -0.2 },
        bodyweightDelta7d: -1.2,
        bodyweightDelta14d: -3,
      },
      hydration: {
        latestWaterPct: 57.2,
        confidenceLabel: "High Confidence",
        confidenceScore: 82,
        note: "Hydration signal is stable.",
        distortionLikely: false,
      },
    }),
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
      movementQuality: [
        "Lat Pulldown: improved stretch and contraction",
        "Bradford Press: stopped due to shoulder twinge",
      ],
      stimulusCoverage: [
        "Pull: strong lat stimulus",
        "Shoulders: lateral delt isolation needs refinement",
      ],
      fatigueReadiness: [
        "Shoulder sensitive in behind-head position",
        "Fatigue mostly appeared at terminal reps",
      ],
      nextWorkoutFocus: [
        "Maintain lat-driven pulling before increasing load",
        "Improve medial delt isolation",
      ],
      discussWithGaz: [
        "Review medial delt isolation setup",
        "Review safe overhead pressing range",
      ],
    },
    patternSummary: {
      movementQuality: [
        "Lat engagement improving across recent pull work",
        "Shoulder sensitivity appears in overhead positions",
      ],
      stimulus: [
        "Pull stimulus consistently strong",
        "Shoulder isolation inconsistent across sessions",
      ],
      fatigue: ["Fatigue consistently appears at terminal reps"],
      constraints: ["Shoulder sensitivity linked to behind-head or overhead positions"],
      progression: ["Pulling movements show improving consistency"],
    },
    nextWorkoutFocus: {
      progressionGuardrails: [
        "Keep progression conservative given current phase-quality risk.",
        "Avoid pushing load on movements that already show joint feedback or shoulder sensitivity.",
      ],
      executionPriorities: [
        "Preserve known pulling setup constraints when selecting or progressing work.",
        "Treat repeated isolation inconsistency as a movement-quality constraint.",
      ],
      adjustmentTriggers: [
        "Reduce volume or progression pressure if later-set fatigue appears earlier than usual.",
        "Stop or modify a movement if shoulder, elbow, or other joint feedback appears.",
      ],
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
    readinessNotes: ["Phase quality: Insufficient Data.", "Hydration signal is stable."],
    dataNotes: [],
  };
}

function buildMetricsWithCurrentMovementFocus() {
  const metrics = buildMetrics();
  metrics.currentMovementFocus = [
    { label: "Pull", exercises: ["MTS Row", "Assisted Pull Up", "Straight-Arm Cable Pulldown"] },
    { label: "Push", exercises: ["Barbell Bench Press", "DB Chest Fly", "Cable Tricep Pushdown"] },
    { label: "Hinge", exercises: ["Trap Bar Deadlift", "Single-Leg RDL Left", "Single-Leg RDL Right"] },
    { label: "Squat / Legs", exercises: ["Leg Press (Glute Bias)", "Step Up", "Kneeling Leg Curl Left", "Kneeling Leg Curl Right"] },
    { label: "Carry", exercises: ["Farmer Carry"] },
  ];
  return metrics;
}

test("coach export includes recent training signals section", async () => {
  const text = formatCoachExportText(buildMetrics());

  expect(text).toContain("Training Signals (Recent Sessions)");
  expect(text).toContain("Validated Learnings");
  expect(text).toContain("Movement Quality");
  expect(text).toContain("- Lat Pulldown: improved stretch and contraction");
  expect(text).toContain("Stimulus / Coverage");
  expect(text).toContain("- Pull: strong lat stimulus");
  expect(text).toContain("Fatigue / Readiness");
  expect(text).toContain("- Shoulder sensitive in behind-head position");
  expect(text).toContain("Next Workout Focus");
  expect(text).toContain("Progression Guardrails");
  expect(text).toContain("Execution Priorities");
  expect(text).toContain("Adjustment Triggers");
  expect(text).toContain("- Preserve known pulling setup constraints when selecting or progressing work.");
  expect(text).toContain("Discuss with Gaz");
  expect(text).toContain("- Review safe overhead pressing range");
  expect(text).toContain("Recent Patterns (Last 4 Sessions)");
  expect(text).toContain("- Lat engagement improving across recent pull work");
  expect(text).toContain("- Pulling movements show improving consistency");
  expect(text).not.toContain("Upper A");
  expect(text).not.toContain("Lower B");
});

test("coach export weekly volume balance wording uses the larger-over-smaller multiplier and corrected status label", async () => {
  const metrics = buildMetrics();
  metrics.weeklyVolume = {
    windowDays: 7,
    asOf: new Date("2026-07-06T09:00:00-04:00").toISOString(),
    groups: [
      {
        bucket: "chest_pressing",
        label: "Chest Pressing",
        primeCredit: 12.8,
        supportCredit: 0,
        exposureCount: 0,
        totalCredit: 12.8,
        status: "watch",
        examples: ["Bench Press"],
      },
      {
        bucket: "lats",
        label: "Lats",
        primeCredit: 49,
        supportCredit: 0,
        exposureCount: 0,
        totalCredit: 49,
        status: "solid",
        examples: ["Lat Pulldown"],
      },
    ],
    rollups: [],
    balances: [
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
        isContextuallyAcceptable: false,
        note: "Pull volume is ahead of push volume.",
      } as any,
    ],
    unclassified: [],
    status: "watch",
    summary: "Pull volume is ahead of push volume.",
  } as any;

  const text = formatCoachExportText(metrics as any);
  expect(text).toContain("Push / Pull: Push Behind");
  expect(text).toContain("Pull volume is about 3.8× push volume over the recent 7-day window.");
  expect(text).not.toContain("0.3x higher");
  expect(text).not.toContain("0.3× higher");
  expect(text).not.toContain("Infinity");
});

test("coach export promotes validated learnings and keeps watch items visible", async () => {
  const metrics = buildMetrics();
  metrics.trainingSignals = {
    movementQuality: [
      "MTS Row: rep 15 on final set not counted due to form breakdown",
      "MTS Row: chest-supported row reinforced Gaz's cues",
      "Barbell Row: grounded hinge felt stable",
    ],
    stimulusCoverage: ["Pull: strong lat stimulus"],
    fatigueReadiness: ["MTS Row: terminal-rep quality dropped"],
    nextWorkoutFocus: [],
    discussWithGaz: [
      "Confirm whether the substitution stays in next session",
      "Review form breakdown before adding load",
    ],
  };

  const trainingSection = getSection(
    formatCoachExportText(metrics),
    "Training Signals (Recent Sessions)",
    "Recent Patterns (Last 4 Sessions)"
  );
  const validatedSection = getSection(trainingSection, "Validated Learnings", "Movement Quality");
  const movementSection = getSection(trainingSection, "Movement Quality", "Fatigue / Readiness");

  expect(validatedSection).toContain("- MTS Row: chest-supported row reinforced Gaz's cues");
  expect(validatedSection).toContain("- Barbell Row: grounded hinge felt stable");
  expect(validatedSection).toContain("- Pull: strong lat stimulus");
  expect((trainingSection.match(/MTS Row: chest-supported row reinforced Gaz's cues/g) ?? [])).toHaveLength(1);
  expect(movementSection).toContain("- MTS Row: rep 15 on final set not counted due to form breakdown");
  expect(trainingSection).toContain("- MTS Row: terminal-rep quality dropped");
  expect(trainingSection).not.toContain("Confirm whether the substitution stays in next session");
  expect(trainingSection).toContain("- Review form breakdown before adding load");
});

test("coach export suppresses empty validated learnings section", async () => {
  const metrics = buildMetrics();
  metrics.trainingSignals = {
    movementQuality: ["MTS Row: rep 15 on final set not counted due to form breakdown"],
    stimulusCoverage: [],
    fatigueReadiness: ["MTS Row: terminal-rep quality dropped"],
    nextWorkoutFocus: [],
    discussWithGaz: [],
  };

  const trainingSection = getSection(
    formatCoachExportText(metrics),
    "Training Signals (Recent Sessions)",
    "Recent Patterns (Last 4 Sessions)"
  );

  expect(trainingSection).not.toContain("Validated Learnings");
  expect(trainingSection).toContain("- MTS Row: rep 15 on final set not counted due to form breakdown");
  expect(trainingSection).toContain("- MTS Row: terminal-rep quality dropped");
});

test("rolling body metric uses the latest five valid points and ignores missing values", async () => {
  const now = Date.UTC(2026, 6, 6, 9, 0, 0, 0);
  const rows = [
    { measuredAt: now, weightLb: 208 },
    { measuredAt: now - 1 * 24 * 60 * 60 * 1000, weightLb: 201 },
    { measuredAt: now - 2 * 24 * 60 * 60 * 1000, weightLb: undefined },
    { measuredAt: now - 3 * 24 * 60 * 60 * 1000, weightLb: 200 },
    { measuredAt: now - 4 * 24 * 60 * 60 * 1000, weightLb: 199 },
    { measuredAt: now - 5 * 24 * 60 * 60 * 1000, weightLb: 198 },
    { measuredAt: now - 18 * 24 * 60 * 60 * 1000, weightLb: 194 },
  ] as any[];

  const metric = buildRollingBodyMetric(rows, (row) => row.weightLb, 14);

  expect(metric.rawLatest).toBe(208);
  expect(metric.sampleCount).toBe(5);
  expect(metric.rolling5).toBeCloseTo((208 + 201 + 200 + 199 + 198) / 5, 10);
  expect(metric.baseline14d).toBe(194);
  expect(metric.delta14d).toBeCloseTo(((208 + 201 + 200 + 199 + 198) / 5) - 194, 10);
});

test("coach export body composition shows raw latest and coach average while keeping waist raw", async ({ page }) => {
  const text = await buildCoachExportTextFromSeededBodyRows(
    page,
    [
      { measuredAt: Date.UTC(2026, 6, 6, 9, 0, 0, 0), weightLb: 208, waistIn: 35.5, bodyFatPct: 16.2, leanMassLb: 154.1, bodyWaterPct: 57.3 },
      { measuredAt: Date.UTC(2026, 6, 5, 9, 0, 0, 0), weightLb: 201, waistIn: 35.6, bodyFatPct: 16.2, leanMassLb: 154.0, bodyWaterPct: 57.2 },
      { measuredAt: Date.UTC(2026, 6, 4, 9, 0, 0, 0), weightLb: 200, waistIn: 35.7, bodyFatPct: 16.3, leanMassLb: 153.9, bodyWaterPct: 57.1 },
      { measuredAt: Date.UTC(2026, 6, 3, 9, 0, 0, 0), weightLb: 199, waistIn: 35.8, bodyFatPct: 16.2, leanMassLb: 154.2, bodyWaterPct: 57.0 },
      { measuredAt: Date.UTC(2026, 6, 2, 9, 0, 0, 0), weightLb: 198, waistIn: 35.9, bodyFatPct: 16.1, leanMassLb: 154.3, bodyWaterPct: 56.9 },
      { measuredAt: Date.UTC(2026, 5, 18, 9, 0, 0, 0), weightLb: 194, waistIn: 36.1, bodyFatPct: 16.0, leanMassLb: 154.5, bodyWaterPct: 56.8 },
    ],
    { heightIn: 70 }
  );

  const bodySection = getSection(text, "Body Composition — Coach Trend Values", "Waist-to-Height Ratio");

  expect(bodySection).toContain("rolling 5-entry average");
  expect(bodySection).toContain("except waist");
  expect(bodySection).toContain("Weight:");
  expect(bodySection).toContain("coach avg");
  expect(bodySection).toContain("208 lb latest");
  expect(bodySection).toContain("201.2 lb");
  expect(bodySection).toContain("Waist:");
  expect(bodySection).toContain("latest/manual");
  expect(bodySection).toContain("Fat Mass:");
});

test("coach export body composition stays compact with a single body entry", async ({ page }) => {
  const text = await buildCoachExportTextFromSeededBodyRows(
    page,
    [{ measuredAt: Date.UTC(2026, 6, 6, 9, 0, 0, 0), weightLb: 208, waistIn: 35.5, bodyFatPct: 16.2, leanMassLb: 154.1, bodyWaterPct: 57.3 }],
    { heightIn: 70 }
  );

  const bodySection = getSection(text, "Body Composition — Coach Trend Values", "Waist-to-Height Ratio");

  expect(bodySection).toContain("Weight:");
  expect(bodySection).toContain("latest/manual");
  expect(bodySection).not.toContain("coach avg | latest");
  expect(bodySection).not.toContain("latest 208");
});

test("coach body smoothing softens a one-day lean mass outlier", async () => {
  const now = Date.UTC(2026, 6, 6, 9, 0, 0, 0);
  const leanRows = [
    { measuredAt: now, leanMassLb: 140, weightLb: 180, bodyFatPct: 22.0, waistIn: 36.2 },
    { measuredAt: now - 1 * 24 * 60 * 60 * 1000, leanMassLb: 153, weightLb: 198, bodyFatPct: 16.2, waistIn: 35.6 },
    { measuredAt: now - 2 * 24 * 60 * 60 * 1000, leanMassLb: 153, weightLb: 198, bodyFatPct: 16.1, waistIn: 35.6 },
    { measuredAt: now - 3 * 24 * 60 * 60 * 1000, leanMassLb: 153, weightLb: 198, bodyFatPct: 16.1, waistIn: 35.6 },
    { measuredAt: now - 4 * 24 * 60 * 60 * 1000, leanMassLb: 153, weightLb: 198, bodyFatPct: 16.1, waistIn: 35.6 },
    { measuredAt: now - 18 * 24 * 60 * 60 * 1000, leanMassLb: 154, weightLb: 200, bodyFatPct: 16.0, waistIn: 35.8 },
  ] as any[];

  const leanMetric = buildRollingBodyMetric(leanRows, (row) => row.leanMassLb, 14);
  const weightMetric = buildRollingBodyMetric(leanRows, (row) => row.weightLb, 14);
  const bodyFatMetric = buildRollingBodyMetric(leanRows, (row) => row.bodyFatPct, 14);
  const hydration = {
    latestWaterPct: 57.2,
    confidenceLabel: "High Confidence",
    confidenceScore: 82,
    note: "Hydration signal is stable.",
    distortionLikely: false,
  };
  const bodyConfidence = buildBodyConfidence({
    bodyComp: {
      weight: { latest: weightMetric.rolling5, baseline14d: weightMetric.baseline14d, delta14d: weightMetric.delta14d },
      waist: { latest: 35.6, baseline14d: 35.8, delta14d: -0.2 },
      bodyFatPct: { latest: bodyFatMetric.rolling5, baseline14d: bodyFatMetric.baseline14d, delta14d: bodyFatMetric.delta14d },
      leanMass: { latest: leanMetric.rolling5, baseline14d: leanMetric.baseline14d, delta14d: leanMetric.delta14d },
      bodyweightDelta7d: -1.2,
      bodyweightDelta14d: weightMetric.delta14d,
    },
    hydration,
  });
  const leanPreservation = buildLeanPreservationComposite({
    leanMass: { latest: leanMetric.rolling5, baseline14d: leanMetric.baseline14d, delta14d: leanMetric.delta14d },
    weight: { latest: weightMetric.rolling5, baseline14d: weightMetric.baseline14d, delta14d: weightMetric.delta14d },
    waist: { latest: 35.6, baseline14d: 35.8, delta14d: -0.2 },
    bodyFatPct: { latest: bodyFatMetric.rolling5, baseline14d: bodyFatMetric.baseline14d, delta14d: bodyFatMetric.delta14d },
    hydration,
    bodyConfidence,
    strengthSignal: {
      current: 1.92,
      delta14d: -0.01,
      vs90dBestPct: -1.5,
      currentBodyweight: weightMetric.rolling5,
      bodyweightDaysUsed: 5,
    },
    recentPerformanceSignals: ["MTS Row: chest-supported row reinforced Gaz's cues"],
  });

  expect(leanMetric.rawLatest).toBe(140);
  expect(leanMetric.rolling5).toBeGreaterThan(150);
  expect(leanPreservation?.status).not.toBe("Poor");
});

test("coach export low hydration lean preservation cap is driven by body confidence", async () => {
  const metrics = buildMetrics();
  metrics.bodyComp.leanMass = { latest: 145, baseline14d: 147, delta14d: -2 };
  metrics.bodyComp.weight = { latest: 198, baseline14d: 202, delta14d: -4 };
  metrics.bodyComp.waist = { latest: 35.6, baseline14d: 36.2, delta14d: -0.6 };
  metrics.bodyComp.bodyFatPct = { latest: 17.1, baseline14d: 16.7, delta14d: 0.4 };
  metrics.hydration = {
    latestWaterPct: 49.8,
    confidenceLabel: "Low Confidence",
    confidenceScore: 32,
    note: "Hydration signal is unstable.",
    distortionLikely: true,
  };
  metrics.bodyConfidence = buildBodyConfidence({
    bodyComp: {
      weight: metrics.bodyComp.weight,
      waist: metrics.bodyComp.waist,
      bodyFatPct: metrics.bodyComp.bodyFatPct,
      leanMass: metrics.bodyComp.leanMass,
      bodyweightDelta7d: -2.8,
      bodyweightDelta14d: -4,
    },
    hydration: metrics.hydration,
  });
  metrics.leanPreservation = buildLeanPreservationComposite({
    leanMass: metrics.bodyComp.leanMass,
    weight: metrics.bodyComp.weight,
    waist: metrics.bodyComp.waist,
    bodyFatPct: metrics.bodyComp.bodyFatPct,
    hydration: metrics.hydration,
    bodyConfidence: metrics.bodyConfidence,
    strengthSignal: metrics.strengthSignal,
    recentPerformanceSignals: ["Lat Pulldown: improved stretch and contraction"],
  });
  metrics.coachIntelligence = buildCoachIntelligence(metrics);

  const summarySection = getSection(formatCoachExportText(metrics), "Coach Summary", "Hydration");
  const leanSection = getSection(formatCoachExportText(metrics), "Lean Preservation", "Strength Signal");

  expect(metrics.bodyConfidence?.overall).toBe("moderate");
  expect(leanSection).toContain("- Composite: Watch");
  expect(leanSection).toContain("Hydration confidence low");
  expect(summarySection).toContain("- Overall: Watch");
});

test("coach export phase quality hydration caveat uses body confidence", async () => {
  const metrics = buildMetrics();
  metrics.bodyComp.weight = { latest: 198, baseline14d: 202, delta14d: -4 };
  metrics.bodyComp.waist = { latest: 35.4, baseline14d: 36, delta14d: -0.6 };
  metrics.bodyComp.leanMass = { latest: 152.5, baseline14d: 154.7, delta14d: -2.2 };
  metrics.bodyComp.bodyFatPct = { latest: 17.5, baseline14d: 16.7, delta14d: 0.8 };
  metrics.hydration = {
    latestWaterPct: 50.4,
    confidenceLabel: "Moderate Confidence",
    confidenceScore: 62,
    note: "Hydration signal is mixed.",
    distortionLikely: true,
  };
  metrics.bodyConfidence = buildBodyConfidence({
    bodyComp: {
      weight: metrics.bodyComp.weight,
      waist: metrics.bodyComp.waist,
      bodyFatPct: metrics.bodyComp.bodyFatPct,
      leanMass: metrics.bodyComp.leanMass,
      bodyweightDelta7d: -2.6,
      bodyweightDelta14d: -4,
    },
    hydration: metrics.hydration,
  });
  metrics.phaseQuality = evaluatePhaseQuality("cut", {
    weightDelta: -4,
    waistDelta: -0.6,
    correctedLeanDelta: -2.2,
    correctedBodyFatDelta: 0.8,
    strengthDelta: -0.1,
    sampleCount: 4,
    bodyConfidence: metrics.bodyConfidence,
  });

  const phaseSection = getSection(formatCoachExportText(metrics), "Cut / Phase Quality", "Hydration");

  expect(phaseSection).toContain("Rapid bodyweight loss may distort impedance-derived metrics.");
  expect(phaseSection).toContain("- Confidence: Low");
});

test("coach export renders validated learnings from coaching memory", async () => {
  const metrics = buildMetrics();
  metrics.trainingSignals = {
    movementQuality: ["MTS Row: rep 15 on final set not counted due to form breakdown"],
    stimulusCoverage: [],
    fatigueReadiness: [],
    nextWorkoutFocus: [],
    discussWithGaz: [],
  };
  metrics.coachingMemory = {
    validatedLearnings: [
      {
        id: "validated_learning:memory-only",
        kind: "validated_learning",
        label: "Memory",
        sourceType: "derived",
        confidence: "moderate",
        evidenceCount: 2,
        text: "Memory model: replacement pattern is now repeatable",
      },
    ],
    activeWatchItems: [],
    resolvedItems: [],
    sourceWindow: { sessionCount: 4 },
  };

  const trainingSection = getSection(
    formatCoachExportText(metrics),
    "Training Signals (Recent Sessions)",
    "Recent Patterns (Last 4 Sessions)"
  );

  expect(trainingSection).toContain("Validated Learnings");
  expect(trainingSection).toContain("- Memory model: replacement pattern is now repeatable");
});

test("coach export suppresses stale coaching memory watch items but keeps active watches", async () => {
  const metrics = buildMetrics();
  metrics.trainingSignals = {
    movementQuality: [
      "MTS Row: old rep not counted due to form breakdown",
      "Bench Press: terminal-rep quality dropped",
    ],
    stimulusCoverage: [],
    fatigueReadiness: ["MTS Row: old terminal-rep quality dropped"],
    nextWorkoutFocus: [],
    discussWithGaz: [],
  };
  metrics.coachingMemory = {
    validatedLearnings: [],
    activeWatchItems: [
      {
        id: "active_watch:bench-press-terminal-rep-quality-dropped",
        kind: "active_watch",
        label: "Bench Press",
        sourceType: "session_signal",
        confidence: "low",
        severity: "moderate",
        status: "active",
        text: "Bench Press: terminal-rep quality dropped",
      },
    ],
    resolvedItems: [],
    sourceWindow: { sessionCount: 4 },
  };

  const trainingSection = getSection(
    formatCoachExportText(metrics),
    "Training Signals (Recent Sessions)",
    "Recent Patterns (Last 4 Sessions)"
  );

  expect(trainingSection).not.toContain("MTS Row: old rep not counted due to form breakdown");
  expect(trainingSection).not.toContain("MTS Row: old terminal-rep quality dropped");
  expect(trainingSection).toContain("- Bench Press: terminal-rep quality dropped");
});

test("coach export suppresses empty no-op export lines", async () => {
  const metrics = buildMetrics();
  metrics.trainingSignals = {
    movementQuality: [],
    stimulusCoverage: [],
    fatigueReadiness: [],
    nextWorkoutFocus: [],
    discussWithGaz: [],
  };
  metrics.patternSummary = {
    movementQuality: [],
    stimulus: [],
    fatigue: [],
    constraints: [],
    progression: [],
  };
  metrics.nextWorkoutFocus = {
    progressionGuardrails: [],
    executionPriorities: [],
    adjustmentTriggers: [],
  };
  metrics.readinessNotes = ["Phase quality: Insufficient Data.", "Hydration signal is stable."];
  metrics.dataNotes = [];

  const text = formatCoachExportText(metrics);

  expect(text).not.toContain("No repeated movement-quality pattern yet.");
  expect(text).not.toContain("No repeated stimulus pattern yet.");
  expect(text).not.toContain("No repeated fatigue pattern yet.");
  expect(text).not.toContain("No repeated constraint pattern yet.");
  expect(text).not.toContain("No repeated progression pattern yet.");
  expect(text).not.toContain("No major data gaps detected.");
  expect(text).not.toContain("No additional readiness notes.");
  expect(text).not.toContain("No recent movement-quality notes.");
  expect(text).not.toContain("No recent stimulus notes.");
  expect(text).not.toContain("No recent fatigue notes.");
  expect(text).not.toContain("No coach discussion flags from recent sessions.");
  expect(text).not.toContain("Recent Patterns (Last 4 Sessions)");
  expect(text).not.toContain("- No repeated patterns detected.");
  expect(text).not.toContain("Data Gaps");
  expect(text).not.toContain("Readiness / Confidence Notes");
});

test("coach export keeps meaningful recent patterns and data gaps", async () => {
  const metrics = buildMetrics();
  metrics.patternSummary = {
    movementQuality: [],
    stimulus: ["Pull stimulus remains repeatable across recent sessions"],
    fatigue: [],
    constraints: [],
    progression: ["Pulling movements show improving consistency"],
  };
  metrics.dataNotes = ["Missing waist data."];

  const text = formatCoachExportText(metrics);
  const patterns = getSection(text, "Recent Patterns (Last 4 Sessions)", "Coach Summary");

  expect(patterns).toContain("Stimulus");
  expect(patterns).toContain("- Pull stimulus remains repeatable across recent sessions");
  expect(patterns).toContain("Progression");
  expect(patterns).toContain("- Pulling movements show improving consistency");
  expect(patterns).not.toContain("Movement Quality");
  expect(patterns).not.toContain("No repeated");
  expect(text).toContain("Data Gaps");
  expect(text).toContain("- Missing waist data.");
});

test("coach export includes visceral fat section when estimate data exists", async () => {
  const metrics = buildMetrics();
  metrics.bodyComp.visceralFat = { latest: 7, baseline14d: 8, delta14d: -1 };

  const text = formatCoachExportText(metrics);
  const section = getSection(text, "Visceral Fat", "Cut / Phase Quality");

  expect(section).toContain("- Latest estimate: 7");
  expect(section).toContain("- 14d trend: -1");
  expect(section).toContain("- Direction: Improving");
  expect(section).toContain("- Confidence: Moderate");
  expect(section).toContain(
    "- Note: Hume visceral fat is an estimate. Use trend alongside waist circumference rather than as an absolute measurement."
  );
});

test("coach export omits visceral fat section when estimate data is missing", async () => {
  const metrics = buildMetrics();
  metrics.bodyComp.visceralFat = { latest: null, baseline14d: null, delta14d: null };

  const text = formatCoachExportText(metrics);

  expect(text).not.toContain("Visceral Fat");
});

test("coach export visceral fat direction supports flat and worsening trends", async () => {
  const flatMetrics = buildMetrics();
  flatMetrics.bodyComp.visceralFat = { latest: 7, baseline14d: 7, delta14d: 0 };
  const flatSection = getSection(formatCoachExportText(flatMetrics), "Visceral Fat", "Cut / Phase Quality");
  expect(flatSection).toContain("- Direction: Flat");
  expect(flatSection).toContain("- 14d trend: 0");

  const worseningMetrics = buildMetrics();
  worseningMetrics.bodyComp.visceralFat = { latest: 9, baseline14d: 7, delta14d: 2 };
  const worseningSection = getSection(formatCoachExportText(worseningMetrics), "Visceral Fat", "Cut / Phase Quality");
  expect(worseningSection).toContain("- Direction: Worsening");
  expect(worseningSection).toContain("- 14d trend: +2");
});

test("waist-to-height helpers calculate ratio and classify status", async () => {
  expect(waistToHeightRatio(36.5, 71.75)).toBeCloseTo(0.509, 3);
  expect(waistToHeightStatus(0.399)).toBe("Very Lean");
  expect(waistToHeightStatus(0.4)).toBe("Healthy");
  expect(waistToHeightStatus(0.499)).toBe("Healthy");
  expect(waistToHeightStatus(0.5)).toBe("Elevated");
  expect(waistToHeightStatus(0.599)).toBe("Elevated");
  expect(waistToHeightStatus(0.6)).toBe("High Risk");
});

test("latest available waist helper skips rows without waist", async () => {
  const now = Date.now();
  const latest = getLatestAvailableWaistIn([
    { id: "latest", measuredAt: now, createdAt: now, weightLb: 188.6 },
    {
      id: "prior",
      measuredAt: now - 24 * 60 * 60 * 1000,
      createdAt: now - 24 * 60 * 60 * 1000,
      waistIn: 36.5,
    },
  ]);

  expect(latest).toEqual({
    waistIn: 36.5,
    measuredAt: now - 24 * 60 * 60 * 1000,
  });
});

test("latest available waist helper returns undefined when no waist exists", async () => {
  const now = Date.now();

  expect(
    getLatestAvailableWaistIn([
      { id: "latest", measuredAt: now, createdAt: now, weightLb: 188.6 },
      {
        id: "prior",
        measuredAt: now - 24 * 60 * 60 * 1000,
        createdAt: now - 24 * 60 * 60 * 1000,
        bodyFatPct: 20.6,
      },
    ])
  ).toBeUndefined();
});

test("coach export omits waist-to-height ratio when height is missing", async ({ page }) => {
  const text = await buildCoachExportTextFromSeededBodyRows(page, [
    { measuredAt: Date.now(), weightLb: 188.6, waistIn: 36.5, bodyFatPct: 20.6 },
  ]);

  expect(text).not.toContain("Waist-to-Height Ratio");
});

test("coach export includes waist-to-height ratio when height and waist exist", async ({ page }) => {
  const now = Date.now();
  const text = await buildCoachExportTextFromSeededBodyRows(
    page,
    [
      { measuredAt: now, weightLb: 188.6, waistIn: 36.5, bodyFatPct: 20.6 },
      { measuredAt: now - 14 * 24 * 60 * 60 * 1000, weightLb: 190.2, waistIn: 37.3, bodyFatPct: 21.1 },
    ],
    { heightIn: 71.75 }
  );
  const section = getSection(text, "Waist-to-Height Ratio", "Coach Summary");

  expect(section).toContain("- Current: 0.509");
  expect(section).toContain("- 14d trend: -0.011");
  expect(section).toContain("- Status: Elevated");
  expect(section).toContain("- Healthy threshold: < 0.500");
  expect(section).toContain("- Waist needed for threshold: 35.9 in");
  expect(section).toContain("- Distance to threshold: 0.6 in");
});

test("coach export uses prior available waist when latest body row has no waist", async ({ page }) => {
  const now = Date.now();
  const text = await buildCoachExportTextFromSeededBodyRows(
    page,
    [
      { measuredAt: now, weightLb: 188.6, bodyFatPct: 20.6 },
      { measuredAt: now - 24 * 60 * 60 * 1000, weightLb: 189.1, waistIn: 36.5, bodyFatPct: 20.7 },
      { measuredAt: now - 15 * 24 * 60 * 60 * 1000, weightLb: 190.2, waistIn: 37.3, bodyFatPct: 21.1 },
    ],
    { heightIn: 71.75 }
  );
  const section = getSection(text, "Waist-to-Height Ratio", "Coach Summary");
  const goals = getSection(text, "Goal Trajectory", "Lean Preservation");

  expect(section).toContain("- Current: 0.509");
  expect(section).toContain("- 14d trend: -0.011");
  expect(section).toContain("- Status: Elevated");
  expect(goals).toContain("- Waist-to-Height Ratio: 0.509 -> < 0.500 | 0.009 remaining");
});

test("coach export omits waist-to-height ratio when latest row lacks waist and no prior waist exists", async ({ page }) => {
  const text = await buildCoachExportTextFromSeededBodyRows(
    page,
    [{ measuredAt: Date.now(), weightLb: 188.6, bodyFatPct: 20.6 }],
    { heightIn: 71.75 }
  );

  expect(text).not.toContain("Waist-to-Height Ratio");
});

test("coach export omits waist-to-height trend when sparse waist baseline is unavailable", async ({ page }) => {
  const now = Date.now();
  const text = await buildCoachExportTextFromSeededBodyRows(
    page,
    [
      { measuredAt: now, weightLb: 188.6, bodyFatPct: 20.6 },
      { measuredAt: now - 24 * 60 * 60 * 1000, weightLb: 189.1, waistIn: 36.5, bodyFatPct: 20.7 },
    ],
    { heightIn: 71.75 }
  );
  const section = getSection(text, "Waist-to-Height Ratio", "Coach Summary");

  expect(section).toContain("- Current: 0.509");
  expect(section).not.toContain("- 14d trend:");
});

test("coach export includes visceral fat when only visceralFatEstimate exists", async ({ page }) => {
  const now = Date.now();
  const text = await buildCoachExportTextFromSeededBodyRows(page, [
    { measuredAt: now, visceralFatEstimate: 7, weightLb: 198, waistIn: 35.5 },
    { measuredAt: now - 14 * 24 * 60 * 60 * 1000, visceralFatEstimate: 8, weightLb: 201, waistIn: 36.1 },
  ]);
  const section = getSection(text, "Visceral Fat", "Cut / Phase Quality");

  expect(section).toContain("- Latest estimate: 7");
  expect(section).toContain("- 14d trend: -1");
  expect(section).toContain("- Direction: Improving");
});

test("coach export includes visceral fat when only legacy visceralFatIndex exists", async ({ page }) => {
  const now = Date.now();
  const text = await buildCoachExportTextFromSeededBodyRows(page, [
    { measuredAt: now, visceralFatIndex: 9, weightLb: 198, waistIn: 35.5 },
    { measuredAt: now - 14 * 24 * 60 * 60 * 1000, visceralFatIndex: 7, weightLb: 201, waistIn: 36.1 },
  ]);
  const section = getSection(text, "Visceral Fat", "Cut / Phase Quality");

  expect(section).toContain("- Latest estimate: 9");
  expect(section).toContain("- 14d trend: +2");
  expect(section).toContain("- Direction: Worsening");
});

test("lean preservation composite is acceptable when lean mass is down but strength and waist improve", async () => {
  const composite = buildLeanPreservationComposite({
    leanMass: { latest: 146.7, baseline14d: 147.7, delta14d: -1 },
    weight: { latest: 198, baseline14d: 201, delta14d: -3 },
    waist: { latest: 35.5, baseline14d: 36.1, delta14d: -0.6 },
    bodyFatPct: { latest: 16.2, baseline14d: 16.9, delta14d: -0.7 },
    hydration: { latestWaterPct: 57, confidenceLabel: "High", confidenceScore: 82, note: "Stable" },
    strengthSignal: { current: 1.92, delta14d: 0.04, vs90dBestPct: -1, currentBodyweight: 198, bodyweightDaysUsed: 5 },
  });

  expect(composite?.status).toBe("Acceptable");
  expect(composite?.confidence).toBe("High");
  expect(composite?.evidence.positive).toEqual(
    expect.arrayContaining(["Strength improving", "Waist decreasing", "BF trend improving", "Hydration confidence high"])
  );
  expect(composite?.evidence.negative).toContain("Lean mass estimate down 1.0 lb");
});

test("lean preservation composite is poor only with lean decline plus performance decline and waist not improving", async () => {
  const composite = buildLeanPreservationComposite({
    leanMass: { latest: 145, baseline14d: 147, delta14d: -2 },
    weight: { latest: 198, baseline14d: 200, delta14d: -2 },
    waist: { latest: 36, baseline14d: 36, delta14d: 0 },
    bodyFatPct: { latest: 17, baseline14d: 17, delta14d: 0 },
    hydration: { latestWaterPct: 56, confidenceLabel: "High", confidenceScore: 80, note: "Stable" },
    strengthSignal: { current: 1.8, delta14d: -0.1, vs90dBestPct: -8, currentBodyweight: 198, bodyweightDaysUsed: 5 },
  });

  expect(composite?.status).toBe("Poor");
  expect(composite?.evidence.negative).toEqual(
    expect.arrayContaining(["Lean mass estimate down 2.0 lb", "Strength declining"])
  );
});

test("lean preservation composite is strong when lean mass is flat and strength improves", async () => {
  const composite = buildLeanPreservationComposite({
    leanMass: { latest: 148, baseline14d: 148.2, delta14d: -0.2 },
    weight: { latest: 198, baseline14d: 199, delta14d: -1 },
    waist: { latest: 35.8, baseline14d: 36, delta14d: -0.2 },
    bodyFatPct: { latest: 16.5, baseline14d: 16.7, delta14d: -0.2 },
    hydration: { latestWaterPct: 57, confidenceLabel: "High", confidenceScore: 82, note: "Stable" },
    strengthSignal: { current: 1.95, delta14d: 0.05, vs90dBestPct: 0, currentBodyweight: 198, bodyweightDaysUsed: 5 },
  });

  expect(composite?.status).toBe("Strong");
});

test("lean preservation composite keeps classification but reduces confidence when hydration confidence is low", async () => {
  const highHydration = buildLeanPreservationComposite({
    leanMass: { latest: 146.7, baseline14d: 147.7, delta14d: -1 },
    weight: { latest: 198, baseline14d: 201, delta14d: -3 },
    waist: { latest: 35.5, baseline14d: 36.1, delta14d: -0.6 },
    bodyFatPct: { latest: 16.2, baseline14d: 16.9, delta14d: -0.7 },
    hydration: { latestWaterPct: 57, confidenceLabel: "High", confidenceScore: 82, note: "Stable" },
    strengthSignal: { current: 1.92, delta14d: 0.04, vs90dBestPct: -1, currentBodyweight: 198, bodyweightDaysUsed: 5 },
  });
  const lowHydration = buildLeanPreservationComposite({
    leanMass: { latest: 146.7, baseline14d: 147.7, delta14d: -1 },
    weight: { latest: 198, baseline14d: 201, delta14d: -3 },
    waist: { latest: 35.5, baseline14d: 36.1, delta14d: -0.6 },
    bodyFatPct: { latest: 16.2, baseline14d: 16.9, delta14d: -0.7 },
    hydration: { latestWaterPct: 50, confidenceLabel: "Low", confidenceScore: 30, note: "Distorted", distortionLikely: true },
    strengthSignal: { current: 1.92, delta14d: 0.04, vs90dBestPct: -1, currentBodyweight: 198, bodyweightDaysUsed: 5 },
  });

  expect(lowHydration?.status).toBe("Watch");
  expect(lowHydration?.confidence).toBe("Moderate");
});

test("lean preservation caps poor to watch when low hydration makes lean mass decline inconclusive", async () => {
  const composite = buildLeanPreservationComposite({
    leanMass: { latest: 145, baseline14d: 147, delta14d: -2 },
    weight: { latest: 198, baseline14d: 200, delta14d: -2 },
    waist: { latest: 36, baseline14d: 36, delta14d: 0 },
    bodyFatPct: { latest: 17, baseline14d: 17, delta14d: 0 },
    hydration: {
      latestWaterPct: 49,
      confidenceLabel: "Low",
      confidenceScore: 25,
      note: "Hydration confidence is low.",
      distortionLikely: true,
    },
    strengthSignal: { current: 1.8, delta14d: -0.1, vs90dBestPct: -8, currentBodyweight: 198, bodyweightDaysUsed: 5 },
    recentPerformanceSignals: ["Lat Pulldown: improved stretch and contraction"],
  });

  expect(composite?.status).toBe("Watch");
  expect(composite?.evidence.negative).toContain("Lean mass estimate down 2.0 lb");
  expect(composite?.evidence.negative).toContain("Hydration confidence low");
  expect(composite?.coachInterpretation).toContain("low hydration confidence makes the lean-mass drop less conclusive");
});

test("lean preservation can remain poor when low hydration and performance both deteriorate", async () => {
  const composite = buildLeanPreservationComposite({
    leanMass: { latest: 145, baseline14d: 147, delta14d: -2 },
    weight: { latest: 198, baseline14d: 200, delta14d: -2 },
    waist: { latest: 36, baseline14d: 36, delta14d: 0 },
    bodyFatPct: { latest: 17, baseline14d: 17, delta14d: 0 },
    hydration: {
      latestWaterPct: 49,
      confidenceLabel: "Low",
      confidenceScore: 25,
      note: "Hydration confidence is low.",
      distortionLikely: true,
    },
    strengthSignal: { current: 1.8, delta14d: -0.1, vs90dBestPct: -8, currentBodyweight: 198, bodyweightDaysUsed: 5 },
    recentPerformanceSignals: [
      "Bench Press: form breakdown under fatigue",
      "Lat Pulldown: reduced capacity",
    ],
  });

  expect(composite?.status).toBe("Poor");
  expect(composite?.coachInterpretation).toContain("performance evidence is also deteriorating");
});

test("lean preservation includes positive recent performance evidence when global strength is pressured", async () => {
  const composite = buildLeanPreservationComposite({
    leanMass: { latest: 145.4, baseline14d: 147, delta14d: -1.6 },
    weight: { latest: 198, baseline14d: 200, delta14d: -2 },
    waist: { latest: 36, baseline14d: 36, delta14d: 0 },
    bodyFatPct: { latest: 17, baseline14d: 17, delta14d: 0 },
    hydration: { latestWaterPct: 57, confidenceLabel: "High", confidenceScore: 80, note: "Stable" },
    strengthSignal: { current: 1.8, delta14d: -0.1, vs90dBestPct: -8, currentBodyweight: 198, bodyweightDaysUsed: 5 },
    recentPerformanceSignals: [
      "3-Point DB Row: breakthrough pattern found",
      "Lat Pulldown: improved stretch and contraction",
    ],
  });

  expect(composite?.evidence.positive.join(" ")).toContain(
    "Strength is pressured globally, but recent session performance includes positive evidence"
  );
  expect(composite?.evidence.positive).not.toHaveLength(0);
});

test("lean preservation export suppresses duplicate hydration confidence evidence", async () => {
  const metrics = buildMetrics();
  metrics.bodyComp.leanMass = { latest: 145, baseline14d: 147, delta14d: -2 };
  metrics.bodyComp.waist = { latest: 36, baseline14d: 36, delta14d: 0 };
  metrics.bodyComp.bodyFatPct = { latest: 17, baseline14d: 17, delta14d: 0 };
  metrics.bodyComp.visceralFat = { latest: 8, baseline14d: 8, delta14d: 0 };
  metrics.strengthSignal.delta14d = -0.1;
  metrics.hydration = {
    latestWaterPct: 49,
    confidenceLabel: "Low",
    confidenceScore: 25,
    note: "Hydration confidence is low.",
    distortionLikely: true,
  };
  metrics.leanPreservation = buildLeanPreservationComposite({
    leanMass: metrics.bodyComp.leanMass,
    weight: metrics.bodyComp.weight,
    waist: metrics.bodyComp.waist,
    bodyFatPct: metrics.bodyComp.bodyFatPct,
    hydration: metrics.hydration,
    strengthSignal: metrics.strengthSignal,
    recentPerformanceSignals: ["Bench Press: form breakdown under fatigue"],
  });

  const section = getSection(formatCoachExportText(metrics), "Lean Preservation", "Visceral Fat");

  expect(section.match(/Hydration confidence(?: is)? low/g) ?? []).toHaveLength(1);
});

test("coach export lean preservation composite replaces single-factor lean preservation driver and preserves muscle-risk status", async () => {
  const metrics = buildMetrics();
  metrics.bodyComp.leanMass = { latest: 146.7, baseline14d: 147.7, delta14d: -1 };
  metrics.bodyComp.weight = { latest: 198, baseline14d: 202, delta14d: -4 };
  metrics.bodyComp.waist = { latest: 35.5, baseline14d: 36.1, delta14d: -0.6 };
  metrics.bodyComp.bodyFatPct = { latest: 16.2, baseline14d: 16.9, delta14d: -0.7 };
  metrics.strengthSignal.delta14d = 0.04;
  metrics.hydration.confidenceLabel = "High";
  metrics.phaseQuality = {
    title: "CUT QUALITY",
    quadrant: "fast_loss",
    quadrantLabel: "AGGRESSIVE / POSSIBLE",
    quadrantNote: "Weight down / Waist flat or up over last 10 entries",
    finalStatus: "Aggressive Cut / Muscle-Risk Cut",
    confidence: "High",
    tone: "watch",
    cells: [],
    metricCards: [],
    drivers: [
      "Weight down / Waist flat or up over last 10 entries",
      "Lean Preservation: Poor",
      "Strength Preservation: Improving",
      "Status: Aggressive Cut / Muscle-Risk Cut",
    ],
  };
  metrics.leanPreservation = buildLeanPreservationComposite({
    leanMass: metrics.bodyComp.leanMass,
    weight: metrics.bodyComp.weight,
    waist: metrics.bodyComp.waist,
    bodyFatPct: metrics.bodyComp.bodyFatPct,
    hydration: metrics.hydration,
    strengthSignal: metrics.strengthSignal,
  });

  const text = formatCoachExportText(metrics);
  const section = getSection(text, "Lean Preservation", "Visceral Fat");

  expect(section).toContain("Raw Metrics");
  expect(section).toContain("- Raw Metrics: Lean Mass: 146.7 lb (14d -1 lb)");
  expect(section).toContain("Composite");
  expect(section).toContain("- Composite: Acceptable");
  expect(section).toContain("- Confidence: High");
  expect(section).toContain("✓ Strength improving");
  expect(section).toContain("✓ Waist decreasing");
  expect(section).toContain("Lean mass estimate down 1.0 lb");
  expect(section).toContain("Aggressive rate of weight loss");
  expect(section).toContain("Bioimpedance lean-mass estimates can fluctuate with hydration");
  expect(text).toContain("- Status: Aggressive Cut / Muscle-Risk Cut");
  expect(text).not.toContain("- Lean Preservation: Poor");
});

test("coach intelligence summary removes strength and lean-preservation contradictions", async () => {
  const metrics = buildMetrics();
  metrics.bodyComp.weight = { latest: 198, baseline14d: 202, delta14d: -4 };
  metrics.bodyComp.waist = { latest: 35.5, baseline14d: 36.1, delta14d: -0.6 };
  metrics.bodyComp.bodyFatPct = { latest: 16.2, baseline14d: 16.9, delta14d: -0.7 };
  metrics.bodyComp.leanMass = { latest: 146.7, baseline14d: 147.7, delta14d: -1 };
  metrics.bodyComp.visceralFat = { latest: 7, baseline14d: 8, delta14d: -1 };
  metrics.strengthSignal.delta14d = -0.05;
  metrics.phaseQuality = {
    title: "CUT QUALITY",
    quadrant: "fast_loss",
    quadrantLabel: "AGGRESSIVE / POSSIBLE",
    quadrantNote: "Weight down / Waist flat or up over last 10 entries",
    finalStatus: "Aggressive Cut / Muscle-Risk Cut",
    confidence: "High",
    tone: "watch",
    cells: [],
    metricCards: [],
    drivers: [
      "Weight down / Waist flat or up over last 10 entries",
      "Lean Preservation: Poor",
      "Strength Preservation: Improving",
      "Status: Aggressive Cut / Muscle-Risk Cut",
    ],
  };
  metrics.readinessNotes = [
    "Phase quality: Aggressive Cut / Muscle-Risk Cut.",
    "Lean Preservation: Poor",
    "Hydration signal is stable.",
  ];
  metrics.leanPreservation = buildLeanPreservationComposite({
    leanMass: metrics.bodyComp.leanMass,
    weight: metrics.bodyComp.weight,
    waist: metrics.bodyComp.waist,
    bodyFatPct: metrics.bodyComp.bodyFatPct,
    hydration: metrics.hydration,
    strengthSignal: metrics.strengthSignal,
  });

  const text = formatCoachExportText(metrics);
  const summary = getSection(text, "Coach Summary", "Lean Preservation");

  expect(summary).toContain("Fat Loss");
  expect(summary).toContain("- On Track");
  expect(summary).toContain("Muscle Preservation");
  expect(summary).toMatch(/- (Acceptable|Watch)/);
  expect(text).toContain("Strength evidence is mixed");
  expect(text).not.toContain("Strength declining");
  expect(text).not.toContain("Lean Preservation: Poor");
  expect(text).not.toContain("Phase quality:");
});

test("coach export suppresses readiness notes that repeat phase, hydration, lean, and strength ownership", async () => {
  const metrics = buildMetrics();
  const hydrationCaveat = "Hydration context may be distorting impedance-derived lean mass and body-fat changes.";
  metrics.bodyComp.leanMass = { latest: 145, baseline14d: 147, delta14d: -2 };
  metrics.bodyComp.waist = { latest: 36, baseline14d: 36, delta14d: 0 };
  metrics.strengthSignal.delta14d = -0.1;
  metrics.hydration = {
    latestWaterPct: 49,
    confidenceLabel: "Low",
    confidenceScore: 28,
    note: hydrationCaveat,
    distortionLikely: true,
  };
  metrics.phaseQuality = {
    title: "CUT QUALITY",
    quadrant: "fast_loss",
    quadrantLabel: "AGGRESSIVE / POSSIBLE",
    quadrantNote: "Weight down / Waist flat or up over last 10 entries",
    finalStatus: "Aggressive Cut / Muscle-Risk Cut",
    confidence: "High",
    tone: "watch",
    cells: [],
    metricCards: [],
    drivers: [
      "Weight down / Waist flat or up over last 10 entries",
      "Strength Preservation: Significant Drop",
      hydrationCaveat,
      "Status: Aggressive Cut / Muscle-Risk Cut",
    ],
  };
  metrics.readinessNotes = [
    "Phase quality: Aggressive Cut / Muscle-Risk Cut.",
    "Weight down / Waist flat or up over last 10 entries",
    "Strength Preservation: Significant Drop",
    hydrationCaveat,
    "Lean Preservation: Poor",
    "Hydration confidence low",
  ];
  metrics.leanPreservation = buildLeanPreservationComposite({
    leanMass: metrics.bodyComp.leanMass,
    weight: metrics.bodyComp.weight,
    waist: metrics.bodyComp.waist,
    bodyFatPct: metrics.bodyComp.bodyFatPct,
    hydration: metrics.hydration,
    strengthSignal: metrics.strengthSignal,
  });

  const text = formatCoachExportText(metrics);

  expect(text).not.toContain("Readiness / Confidence Notes");
  expect(text.match(/Hydration context may be distorting impedance-derived lean mass and body-fat changes\./g) ?? []).toHaveLength(1);
  expect(text.match(/Strength Preservation: Significant Drop/g) ?? []).toHaveLength(1);
  expect(text).not.toContain("Lean Preservation: Poor");
  expect(text).toContain("Coach Summary");
  expect(text).toContain("Muscle Preservation");
});

test("coach export keeps unique readiness notes after duplicate narrative suppression", async () => {
  const metrics = buildMetrics();
  metrics.phaseQuality = {
    title: "CUT QUALITY",
    quadrant: "fast_loss",
    quadrantLabel: "AGGRESSIVE / POSSIBLE",
    quadrantNote: "Weight down / Waist flat or up over last 10 entries",
    finalStatus: "Aggressive Cut / Muscle-Risk Cut",
    confidence: "High",
    tone: "watch",
    cells: [],
    metricCards: [],
    drivers: [
      "Weight down / Waist flat or up over last 10 entries",
      "Strength Preservation: Significant Drop",
    ],
  };
  metrics.readinessNotes = [
    "Phase quality: Aggressive Cut / Muscle-Risk Cut.",
    "Strength Preservation: Significant Drop",
    "Sleep disrupted.",
    "Recovery improved.",
  ];

  const section = getSection(formatCoachExportText(metrics), "Readiness / Confidence Notes", "Goals");

  expect(section).toContain("- Sleep disrupted.");
  expect(section).toContain("- Recovery improved.");
  expect(section).not.toContain("Strength Preservation: Significant Drop");
  expect(section).not.toContain("Phase quality:");
});

test("coach intelligence treats near-threshold improving WHtR as supportive instead of negative", async () => {
  const metrics = buildMetrics();
  metrics.bodyComp.weight = { latest: 198, baseline14d: 201, delta14d: -3 };
  metrics.bodyComp.waist = { latest: 35.5, baseline14d: 36, delta14d: -0.5 };
  metrics.bodyComp.waistToHeight = {
    latest: 0.51,
    baseline14d: 0.516,
    delta14d: -0.006,
    status: "Elevated",
    healthyWaistTargetIn: 35.875,
    distanceToThresholdIn: 0.625,
  };

  const intelligence = buildCoachIntelligence(metrics);

  expect(intelligence.positives).toContain("Waist-to-height ratio is near the healthy threshold and improving");
  expect(intelligence.watchItems.join(" ")).not.toMatch(/near the healthy threshold/i);
  expect(intelligence.overallStatus).not.toBe("Intervene");
});

test("coach intelligence keeps near-threshold flat WHtR neutral and high WHtR as watch context", async () => {
  const nearMetrics = buildMetrics();
  nearMetrics.bodyComp.waistToHeight = {
    latest: 0.51,
    baseline14d: 0.51,
    delta14d: 0,
    status: "Elevated",
    healthyWaistTargetIn: 35.875,
    distanceToThresholdIn: 0.625,
  };

  const near = buildCoachIntelligence(nearMetrics);
  expect(near.watchItems.join(" ")).not.toMatch(/near the healthy threshold/i);

  const highMetrics = buildMetrics();
  highMetrics.bodyComp.waistToHeight = {
    latest: 0.54,
    baseline14d: 0.54,
    delta14d: 0,
    status: "High Risk",
    healthyWaistTargetIn: 35.875,
    distanceToThresholdIn: 2.875,
  };

  const high = buildCoachIntelligence(highMetrics);
  expect(high.watchItems).toContain("Waist-to-height ratio remains elevated");
});

test("coach summary splits weak performance trend from positive movement quality", async () => {
  const metrics = buildMetrics();
  metrics.strengthSignal.delta14d = -0.1;
  metrics.trainingSignals.movementQuality = [
    "Lat Pulldown: breakthrough pattern found",
    "3-Point DB Row: improved stretch and contraction",
  ];
  metrics.trainingSignals.stimulusCoverage = ["Pull: strong lat stimulus"];
  metrics.trainingSignals.fatigueReadiness = [];
  metrics.trainingSignals.discussWithGaz = [];
  metrics.patternSummary.movementQuality = [];
  metrics.patternSummary.fatigue = [];
  metrics.patternSummary.constraints = [];

  const text = formatCoachExportText(metrics);
  const summary = getSection(text, "Coach Summary", "Lean Preservation");

  expect(summary).toContain("- Performance Trend: Mixed");
  expect(summary).toContain("- Movement Quality: Improving");
  expect(summary).not.toContain("Training: Regressing");
  expect(summary).not.toContain("- Regressing");
  expect(text).toContain("Lat Pulldown: breakthrough pattern found");
});

test("coach summary allows improving performance with movement quality watch", async () => {
  const metrics = buildMetrics();
  metrics.strengthSignal.delta14d = 0.06;
  metrics.trainingSignals.movementQuality = ["Bench Press: movement quality looked solid"];
  metrics.trainingSignals.fatigueReadiness = ["Bench Press: elbow pain showed up late"];
  metrics.patternSummary.fatigue = [];

  const summary = getSection(formatCoachExportText(metrics), "Coach Summary", "Lean Preservation");

  expect(summary).toContain("- Performance Trend: Improving");
  expect(summary).toContain("- Movement Quality: Watch");
  expect(summary).not.toContain("Training: Regressing");
});

test("coach intelligence suppresses old single-factor lean preservation lines when composite exists", async () => {
  const metrics = buildMetrics();
  metrics.bodyComp.leanMass = { latest: 145, baseline14d: 147, delta14d: -2 };
  metrics.bodyComp.waist = { latest: 36, baseline14d: 36, delta14d: 0 };
  metrics.strengthSignal.delta14d = -0.1;
  metrics.phaseQuality = {
    title: "CUT QUALITY",
    quadrant: "fast_loss",
    quadrantLabel: "AGGRESSIVE / POSSIBLE",
    quadrantNote: "Weight down / Waist flat or up over last 10 entries",
    finalStatus: "Aggressive Cut / Muscle-Risk Cut",
    confidence: "High",
    tone: "watch",
    cells: [],
    metricCards: [],
    drivers: ["Lean Preservation: Poor", "Status: Aggressive Cut / Muscle-Risk Cut"],
  };
  metrics.readinessNotes = ["Lean Preservation: Poor", "Hydration signal is stable."];
  metrics.leanPreservation = buildLeanPreservationComposite({
    leanMass: metrics.bodyComp.leanMass,
    weight: metrics.bodyComp.weight,
    waist: metrics.bodyComp.waist,
    bodyFatPct: metrics.bodyComp.bodyFatPct,
    hydration: metrics.hydration,
    strengthSignal: metrics.strengthSignal,
  });

  const text = formatCoachExportText(metrics);

  expect(text).toContain("Lean Preservation");
  expect(text).toContain("Composite");
  expect(text).not.toContain("Lean Preservation: Poor");
});

test("coach intelligence avoids duplicate phase status lines", async () => {
  const metrics = buildMetrics();
  metrics.phaseQuality = {
    title: "CUT QUALITY",
    quadrant: "fast_loss",
    quadrantLabel: "AGGRESSIVE / POSSIBLE",
    quadrantNote: "Weight down / Waist flat or up over last 10 entries",
    finalStatus: "Aggressive Cut / Muscle-Risk Cut",
    confidence: "High",
    tone: "watch",
    cells: [],
    metricCards: [],
    drivers: [
      "Status: Aggressive Cut / Muscle-Risk Cut",
      "Strength Preservation: Improving",
    ],
  };

  const section = getSection(formatCoachExportText(metrics), "Cut / Phase Quality", "Hydration");

  expect(section.match(/Aggressive Cut \/ Muscle-Risk Cut/g) ?? []).toHaveLength(1);
});

test("coach intelligence clarifies technique probe rejection instead of generic load wording", async () => {
  const metrics = buildMetrics();
  metrics.trainingSignals.movementQuality = ["Lat Pulldown technique probe rejected: Load looked too heavy"];
  metrics.trainingSignals.discussWithGaz = ["Review technique probe rejected: Load looked too heavy"];

  const text = formatCoachExportText(metrics);

  expect(text).toContain("Technique/probe variation was rejected");
  expect(text).not.toContain("Load looked too heavy");
});

test("coach intelligence clarifies later-set pressing fatigue instead of generic load wording", async () => {
  const metrics = buildMetrics();
  metrics.trainingSignals.movementQuality = ["Bench Press: Load looked too heavy on later sets"];
  metrics.trainingSignals.discussWithGaz = ["Review Bench Press: Load looked too heavy"];

  const text = formatCoachExportText(metrics);

  expect(text).toContain("Pressing endurance limited later sets");
  expect(text).not.toContain("Load looked too heavy");
});

test("coach export includes goal progress when profile targets exist", async () => {
  const metrics = buildMetrics();
  metrics.bodyComp.weight = { latest: 188.6, baseline14d: 190.2, delta14d: -1.6 };
  metrics.bodyComp.bodyFatPct = { latest: 20.6, baseline14d: 21.1, delta14d: -0.5 };
  metrics.bodyComp.waist = { latest: 36.5, baseline14d: 36.9, delta14d: -0.4 };
  metrics.bodyComp.visceralFat = { latest: 7, baseline14d: 8, delta14d: -1 };
  metrics.bodyComp.waistToHeight = {
    latest: 36.5 / 71.75,
    baseline14d: 36.9 / 71.75,
    delta14d: 36.5 / 71.75 - 36.9 / 71.75,
    status: "Elevated",
    healthyWaistTargetIn: 35.875,
    distanceToThresholdIn: 0.625,
  };
  metrics.goalProgress = buildGoalProgress({
    goals: {
      targetWeightLb: 180,
      targetBodyFatPct: 18,
      targetWaistIn: 35.9,
      targetVisceralFatEstimate: 6,
    },
    bodyComp: metrics.bodyComp,
  });

  const text = formatCoachExportText(metrics);
  const section = getSection(text, "Goal Trajectory", "Lean Preservation");

  expect(section).toContain("- Weight: 188.6 lb -> 180.0 lb | 8.6 lb remaining");
  expect(section).toContain("- Body Fat: 20.6% -> 18.0% | 2.6 pts remaining");
  expect(section).toContain("- Waist: 36.5 in -> 35.9 in | 0.6 in remaining");
  expect(section).toContain("- Visceral Fat: 7 -> 6 | 1 remaining");
  expect(section).toContain("- Waist-to-Height Ratio: 0.509 -> < 0.500 | 0.009 remaining");
  expect(section).toContain("Goal Trajectory: On Track");
  expect(text).not.toContain("Goal Progress");
});

test("coach intelligence includes waist-to-height improvement evidence", async () => {
  const metrics = buildMetrics();
  metrics.bodyComp.waistToHeight = {
    latest: 0.509,
    baseline14d: 0.52,
    delta14d: -0.011,
    status: "Elevated",
    healthyWaistTargetIn: 35.9,
    distanceToThresholdIn: 0.6,
  };

  const intelligence = buildCoachIntelligence(metrics);

  expect(intelligence.positives).toContain("Waist-to-height ratio is near the healthy threshold and improving");
  expect(intelligence.watchItems.join(" ")).not.toMatch(/near the healthy threshold/i);
});

test("coach export omits missing goal targets cleanly", async () => {
  const metrics = buildMetrics();
  metrics.bodyComp.weight = { latest: 188.6, baseline14d: 190.2, delta14d: -1.6 };
  metrics.bodyComp.waist = { latest: 36.5, baseline14d: 36.9, delta14d: -0.4 };
  metrics.goalProgress = buildGoalProgress({
    goals: {
      targetWeightLb: 180,
    },
    bodyComp: metrics.bodyComp,
  });

  const section = getSection(formatCoachExportText(metrics), "Goal Trajectory", "Lean Preservation");

  expect(section).toContain("- Weight: 188.6 lb -> 180.0 lb | 8.6 lb remaining");
  expect(section).not.toContain("Body Fat:");
  expect(section).not.toContain("Waist:");
  expect(section).not.toContain("Visceral Fat:");
});

test("goal progress status is on track when weight and waist are down", async () => {
  const metrics = buildMetrics();
  metrics.bodyComp.weight = { latest: 188.6, baseline14d: 190.2, delta14d: -1.6 };
  metrics.bodyComp.waist = { latest: 36.5, baseline14d: 36.9, delta14d: -0.4 };
  metrics.goalProgress = buildGoalProgress({
    goals: { targetWeightLb: 180, targetWaistIn: 35.9 },
    bodyComp: metrics.bodyComp,
  });

  expect(metrics.goalProgress.status).toBe("On Track");
});

test("goal progress status is watch when weight is down but waist is flat or up", async () => {
  const metrics = buildMetrics();
  metrics.bodyComp.weight = { latest: 188.6, baseline14d: 190.2, delta14d: -1.6 };
  metrics.bodyComp.waist = { latest: 36.9, baseline14d: 36.5, delta14d: 0.4 };
  metrics.goalProgress = buildGoalProgress({
    goals: { targetWeightLb: 180, targetWaistIn: 35.9 },
    bodyComp: metrics.bodyComp,
  });

  expect(metrics.goalProgress.status).toBe("Watch");
});

test("coach export goal progress uses bodyMetrics current values, not profile current fields", async ({ page }) => {
  await page.goto(new URL("/", BASE_URL).toString(), { waitUntil: "domcontentloaded" });
  await resetDexieDb(page);

  const text = await page.evaluate(async () => {
    localStorage.setItem(
      "workout_pwa_profile_v1",
      JSON.stringify({
        currentWeightLb: "999",
        currentBodyFatPct: "99",
        targetWeightLb: "180",
        targetBodyFatPct: "18",
      })
    );

    const { db } = await import("/src/db.ts");
    const { buildCoachExportMetrics } = await import("/src/lib/coachExport/buildCoachExportMetrics.ts");
    const { formatCoachExportText } = await import("/src/lib/coachExport/formatCoachExportText.ts");
    const now = Date.now();
    await db.app_meta.put({
      key: "profile.heightIn",
      valueJson: JSON.stringify({ heightIn: 71.75 }),
      updatedAt: now,
    });

    await db.bodyMetrics.bulkAdd([
      {
        id: crypto.randomUUID(),
        measuredAt: now,
        takenAt: now,
        createdAt: now,
        weightLb: 188.6,
        waistIn: 36.5,
        bodyFatPct: 20.6,
        visceralFatEstimate: 7,
      },
      {
        id: crypto.randomUUID(),
        measuredAt: now - 14 * 24 * 60 * 60 * 1000,
        takenAt: now - 14 * 24 * 60 * 60 * 1000,
        createdAt: now - 14 * 24 * 60 * 60 * 1000,
        weightLb: 190.2,
        waistIn: 36.9,
        bodyFatPct: 21.1,
        visceralFatEstimate: 8,
      },
    ]);

    const metrics = await buildCoachExportMetrics();
    return formatCoachExportText(metrics);
  });

  const section = getSection(text, "Goal Trajectory", "Visceral Fat");

  expect(section).toContain("- Weight: 189.4 lb -> 180.0 lb | 9.4 lb remaining");
  expect(section).toContain("- Body Fat: 20.9% -> 18.0% | 2.9 pts remaining");
  expect(section).toContain("- Waist-to-Height Ratio: 0.509 -> < 0.500 | 0.009 remaining");
  expect(section).not.toContain("999");
  expect(section).not.toContain("99.0%");
});

test("coach export hides exercise vocabulary from the main narrative", async () => {
  const text = formatCoachExportText(buildMetrics());

  expect(text).not.toContain("Exercise Vocabulary");
  expect(text).toContain("Performance Anchors");
});

test("coach export renames anchor lifts to performance anchors and renders current movement focus", async () => {
  const metrics = buildMetricsWithCurrentMovementFocus();
  const text = formatCoachExportText(metrics);

  const anchors = getSection(text, "Performance Anchors", "Current Movement Focus");
  const focus = getSection(text, "Current Movement Focus", "Next Workout Focus");

  expect(text).toContain("Performance Anchors");
  expect(text).not.toContain("Anchor Lifts");
  expect(anchors).toContain("- push: Bench Press | effective 225 lb x 5 | e1RM 262 | Apr 24, 2026 | 3d old | recent anchor");
  expect(text).toContain("Current Movement Focus");
  expect(focus).toContain("- Pull: MTS Row; Assisted Pull Up; Straight-Arm Cable Pulldown");
  expect(focus).toContain("- Push: Barbell Bench Press; DB Chest Fly; Cable Tricep Pushdown");
  expect(focus).toContain("- Hinge: Trap Bar Deadlift; Single-Leg RDL Left; Single-Leg RDL Right");
  expect(focus).toContain("- Squat / Legs: Leg Press (Glute Bias); Step Up; Kneeling Leg Curl Left; Kneeling Leg Curl Right");
  expect(focus).toContain("- Carry: Farmer Carry");
});

test("coach export labels stale performance anchors without treating them as current evidence", async () => {
  const metrics = buildMetrics();
  metrics.anchorLifts = [
    {
      pattern: "pull",
      exerciseId: "lat",
      exerciseName: "Lat Pulldown",
      trackDisplayName: "Lat Pulldown",
      effectiveWeightLb: 140,
      reps: 10,
      e1rm: 187,
      performedAt: new Date("2026-03-01T09:00:00-04:00").getTime(),
      ageDays: 57,
      recency: "stale",
      isStale: true,
    },
  ];
  metrics.currentMovementFocus = [];

  const text = formatCoachExportText(metrics);
  const anchors = getSection(text, "Performance Anchors", "Current Movement Focus");

  expect(anchors).toContain("57d old | stale anchor");
  expect(anchors).toContain("Lat Pulldown");
  expect(text).not.toContain("Current Movement Focus");
});

test("current movement focus groups recent exercises by movement family", async () => {
  const now = Date.now();
  const sessions = [
    { id: "s-old", startedAt: now - 40 * 24 * 60 * 60 * 1000, endedAt: now - 40 * 24 * 60 * 60 * 1000 + 45 * 60 * 1000 } as any,
    { id: "s1", startedAt: now - 2 * 24 * 60 * 60 * 1000, endedAt: now - 2 * 24 * 60 * 60 * 1000 + 45 * 60 * 1000 } as any,
    { id: "s2", startedAt: now - 24 * 60 * 60 * 1000, endedAt: now - 24 * 60 * 60 * 1000 + 45 * 60 * 1000 } as any,
  ];
  const tracks = [
    { id: "t-old", exerciseId: "e-old", trackType: "strength" } as any,
    { id: "t1", exerciseId: "e1", trackType: "strength" } as any,
    { id: "t2", exerciseId: "e2", trackType: "strength" } as any,
    { id: "t3", exerciseId: "e3", trackType: "strength" } as any,
    { id: "t4", exerciseId: "e4", trackType: "strength" } as any,
    { id: "t5", exerciseId: "e5", trackType: "strength" } as any,
  ];
  const exercises = [
    { id: "e-old", name: "Lat Pulldown" } as any,
    { id: "e1", name: "MTS Row" } as any,
    { id: "e2", name: "Assisted Pull Up" } as any,
    { id: "e3", name: "Trap Bar Deadlift" } as any,
    { id: "e4", name: "Barbell Bench Press" } as any,
    { id: "e5", name: "Farmer Carry" } as any,
  ];
  const sets = [
    { id: "set-old", sessionId: "s-old", trackId: "t-old", createdAt: sessions[0].startedAt + 1, completedAt: sessions[0].startedAt + 2, weight: 140, reps: 10 } as any,
    { id: "set1", sessionId: "s1", trackId: "t1", createdAt: sessions[0].startedAt + 1, completedAt: sessions[0].startedAt + 2, weight: 100, reps: 10 } as any,
    { id: "set2", sessionId: "s1", trackId: "t3", createdAt: sessions[0].startedAt + 3, completedAt: sessions[0].startedAt + 4, weight: 200, reps: 6 } as any,
    { id: "set3", sessionId: "s2", trackId: "t2", createdAt: sessions[1].startedAt + 1, completedAt: sessions[1].startedAt + 2, weight: 0, reps: 6 } as any,
    { id: "set4", sessionId: "s2", trackId: "t4", createdAt: sessions[1].startedAt + 3, completedAt: sessions[1].startedAt + 4, weight: 180, reps: 5 } as any,
    { id: "set5", sessionId: "s2", trackId: "t5", createdAt: sessions[1].startedAt + 5, completedAt: sessions[1].startedAt + 6, weight: 90, reps: 40 } as any,
  ];

  const focus = buildCurrentMovementFocus({
    sessions,
    sets,
    tracks,
    exercises,
    exerciseVocabulary: ["MTS Row", "Assisted Pull Up", "Trap Bar Deadlift", "Barbell Bench Press", "Farmer Carry"],
    coachingMemory: {
      validatedLearnings: [
        {
          id: "valid-1",
          kind: "validated_learning",
          label: "MTS Row",
          sourceType: "session_signal",
          confidence: "moderate",
          text: "MTS Row: improved stretch and contraction",
          exerciseName: "MTS Row",
        },
      ],
      activeWatchItems: [],
      resolvedItems: [],
      sourceWindow: { sessionCount: 2 },
    },
    anchorLifts: [
      {
        pattern: "pull",
        exerciseId: "lat",
        exerciseName: "Lat Pulldown",
        trackDisplayName: "Lat Pulldown",
        effectiveWeightLb: 140,
        reps: 10,
        e1rm: 187,
        performedAt: now - 10 * 24 * 60 * 60 * 1000,
      },
    ],
  });

  expect(focus).toEqual([
    { label: "Pull", exercises: ["Assisted Pull Up", "MTS Row"] },
    { label: "Push", exercises: ["Barbell Bench Press"] },
    { label: "Hinge", exercises: ["Trap Bar Deadlift"] },
    { label: "Carry", exercises: ["Farmer Carry"] },
  ]);
  expect(focus.flatMap((group) => group.exercises)).not.toContain("Lat Pulldown");
});

test("coach export suppresses empty current movement focus section", async () => {
  const metrics = buildMetrics();
  const text = formatCoachExportText(metrics);

  expect(text).toContain("Performance Anchors");
  expect(text).not.toContain("Current Movement Focus");
});

test("coach export includes a short narrative summary and biggest win or risk", async () => {
  const metrics = buildMetrics();
  metrics.goalProgress = {
    rows: [
      {
        label: "Weight",
        current: 198,
        target: 180,
        remaining: 18,
        unit: "lb",
      } as any,
    ],
    status: "On Track",
  } as any;
  metrics.coachingMemory = {
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
    activeWatchItems: [],
    resolvedItems: [],
    sourceWindow: { sessionCount: 4 },
  };
  metrics.leanPreservation = {
    status: "Watch",
    confidence: "Moderate",
    rawMetrics: { leanMassLatest: 145, leanMassDelta14d: -2 },
    evidence: {
      positive: ["Hydration confidence high"],
      negative: ["Lean mass estimate down 2.0 lb"],
    },
    coachInterpretation: "Lean-preservation risk is elevated.",
  } as any;
  metrics.trainingSignals = {
    movementQuality: [],
    stimulusCoverage: [],
    fatigueReadiness: [],
    nextWorkoutFocus: [],
    discussWithGaz: [],
  };
  metrics.patternSummary = {
    movementQuality: [],
    stimulus: [],
    fatigue: [],
    constraints: [],
    progression: [],
  };
  metrics.coachIntelligence = undefined;

  const summary = getSection(formatCoachExportText(metrics), "Coach Summary", "Fat Loss");

  expect(summary).toContain("Summary");
  expect(summary).toContain("Biggest Win");
  expect(summary).toContain("Biggest Risk");
  expect(summary).toContain("Goal trajectory is moving in the right direction");
  expect(summary).toContain("MTS Row: chest-supported row reinforced Gaz's cues");
});

test("coach export delegates fully to coach report rendering", async () => {
  const metrics = buildMetrics();
  const coachState = buildCoachStateFromExportMetrics(metrics);
  const report = buildCoachReport({
    coachState,
    metrics,
    generatedAt: metrics.generatedAt,
  });

  expect(formatCoachExportText(metrics)).toBe(
    formatCoachReportText(report, { bodyHeadingOverride: "Body Composition — Coach Trend Values" })
  );
});

test("coach export preserves the structured coaching loop as plain text", async () => {
  const text = formatCoachExportText(buildMetrics());

  expect(text).not.toContain("Questions to answer:");
  expect(text).toContain("Next Workout Focus");
  expect(text).toContain("Progression Guardrails");
  expect(text).toContain("Execution Priorities");
  expect(text).toContain("Adjustment Triggers");
  expect(text).toContain("Training Signals (Recent Sessions)");
  expect(text).toContain("Recent Patterns (Last 4 Sessions)");
  expect(text).toContain("Discuss with Gaz");
  expect(text).not.toContain("No additional readiness notes.");
  expect(text).not.toContain("Exercise Vocabulary");

  expect(text).not.toContain("```");
  expect(text).not.toContain("{");
  expect(text).not.toContain("}");
});

test("information registry includes the coach export and body composition explainer entries", async () => {
  expect(informationRegistry.progress.coachExport.title).toBe("Coach Export");
  expect(informationRegistry.progress.trainingSignals.title).toBe("Training Signals");
  expect(informationRegistry.progress.recentPatterns.title).toBe("Recent Patterns");
  expect(informationRegistry.progress.nextWorkoutFocus.title).toBe("Next Workout Focus");
  expect(informationRegistry.progress.exportConfidence.title).toBe("Export Confidence");
  expect(informationRegistry.progress.anchorLifts.title).toBe("Anchor Lifts");
  expect(informationRegistry.bodyComposition.phaseQuality.title).toBe("Phase Quality");
  expect(informationRegistry.bodyComposition.hydrationConfidence.title).toBe("Hydration Confidence");
});

test("pattern summary uses repeated recent signals and caps subsection bullets", async () => {
  const repeatedSignals: CoachExportTrainingSignals = {
    movementQuality: [
      "Lat Pulldown: improved stretch and contraction",
      "3-Point DB Row: breakthrough pattern found",
      "Lateral Raise: medial delt isolation still not clean",
      "Bradford Press: stopped due to shoulder twinge",
    ],
    stimulusCoverage: [
      "Pull: strong lat stimulus",
      "Shoulders: lateral delt isolation needs refinement",
    ],
    fatigueReadiness: [
      "Fatigue mostly appeared at terminal reps",
      "Bradford Press: shoulder twinge showed up again",
    ],
    nextWorkoutFocus: [
      "Maintain lat-driven pulling before increasing load",
      "Improve medial delt isolation",
      "Avoid behind-the-neck pressing positions",
    ],
    discussWithGaz: [
      "Review safe overhead pressing range",
      "Review medial delt isolation setup",
    ],
  };

  const sessions: CompletedSession[] = [
    {
      id: "s1",
      endedAt: new Date("2026-04-27T09:00:00-04:00").getTime(),
      trainingSignals: repeatedSignals,
    },
    {
      id: "s2",
      endedAt: new Date("2026-04-24T09:00:00-04:00").getTime(),
      trainingSignals: {
        ...repeatedSignals,
        movementQuality: [
          "Lat Pulldown: improved stretch and contraction",
          "Lateral Raise: medial delt isolation still not clean",
          "Bradford Press: stopped due to shoulder twinge",
        ],
      },
    },
    {
      id: "s3",
      endedAt: new Date("2026-04-20T09:00:00-04:00").getTime(),
      trainingSignals: {
        ...repeatedSignals,
        movementQuality: [
          "3-Point DB Row: breakthrough pattern found",
          "Lateral Raise: medial delt isolation still not clean",
        ],
      },
    },
    {
      id: "s4",
      endedAt: new Date("2026-04-16T09:00:00-04:00").getTime(),
      trainingSignals: {
        ...repeatedSignals,
        movementQuality: [
          "Lat Pulldown: improved stretch and contraction",
          "Farmer's Carry: slight trap involvement noted but controlled",
        ],
        fatigueReadiness: ["Fatigue mostly appeared at terminal reps"],
      },
    },
  ];

  const summary = buildPatternSummary({
    sessions,
    trainingSignals: repeatedSignals,
  });

  expect(summary.movementQuality).toContain("Lat engagement improving across recent pull work (4/4)");
  expect(summary.movementQuality).toContain("Shoulder sensitivity appears in overhead or vertical pressing positions (4/4)");
  expect(summary.stimulus).toContain("Pull stimulus remains repeatable across recent sessions (4/4)");
expect(summary.fatigue).toContain("Fatigue shows up at terminal reps across recent working sets (4/4)");
  expect(summary.constraints).toContain(
    "Shoulder sensitivity is linked to behind-head or overhead positions (4/4)"
  );
expect(summary.progression).toContain("Pulling movements show improving consistency (4/4)");
  

  expect(summary.movementQuality.length).toBeLessThanOrEqual(4);
  expect(summary.stimulus.length).toBeLessThanOrEqual(4);
  expect(summary.fatigue.length).toBeLessThanOrEqual(4);
  expect(summary.constraints.length).toBeLessThanOrEqual(4);
  expect(summary.progression.length).toBeLessThanOrEqual(4);
});

test("pattern summary can surface broader descriptive lower-body, bracing, stability, and tempo themes", async () => {
  const repeatedSignals: CoachExportTrainingSignals = {
    movementQuality: [
      "Glute Bridge: glutes engaged better",
      "Front Squat: lost brace on final reps",
      "Reverse Lunge: balance limited the last reps",
      "Tempo Squat: controlled descent stayed clean",
    ],
    stimulusCoverage: [
      "Stimulus reached glutes",
      "Quad burn showed up late",
    ],
    fatigueReadiness: [
      "RDL: hamstrings took over",
      "Split Squat: left side less stable",
      "Leg Press: range shortened under fatigue",
      "Press: ribs flared late",
    ],
    nextWorkoutFocus: [],
    discussWithGaz: [],
  };

  const sessions: CompletedSession[] = [
    {
      id: "lb-1",
      endedAt: new Date("2026-04-27T09:00:00-04:00").getTime(),
      trainingSignals: repeatedSignals,
    },
    {
      id: "lb-2",
      endedAt: new Date("2026-04-24T09:00:00-04:00").getTime(),
      trainingSignals: {
        ...repeatedSignals,
        movementQuality: [
          "Glute Bridge: glutes engaged better",
          "Front Squat: lost brace on final reps",
          "Tempo Squat: controlled descent stayed clean",
        ],
        fatigueReadiness: [
          "RDL: hamstrings took over",
          "Split Squat: left side less stable",
          "Leg Press: range shortened under fatigue",
        ],
      },
    },
    {
      id: "lb-3",
      endedAt: new Date("2026-04-20T09:00:00-04:00").getTime(),
      trainingSignals: {
        ...repeatedSignals,
        movementQuality: [
          "Reverse Lunge: balance limited the last reps",
          "Tempo Squat: controlled descent stayed clean",
        ],
        stimulusCoverage: [
          "Stimulus reached glutes",
          "Quad burn showed up late",
        ],
        fatigueReadiness: [
          "Press: ribs flared late",
          "Leg Press: range shortened under fatigue",
        ],
      },
    },
    {
      id: "lb-4",
      endedAt: new Date("2026-04-16T09:00:00-04:00").getTime(),
      trainingSignals: {
        ...repeatedSignals,
        movementQuality: [
          "Glute Bridge: glutes engaged better",
          "Reverse Lunge: balance limited the last reps",
        ],
        fatigueReadiness: [
          "RDL: hamstrings took over",
          "Split Squat: left side less stable",
        ],
      },
    },
  ];

  const summary = buildPatternSummary({
    sessions,
    trainingSignals: repeatedSignals,
  });

  expect(summary.movementQuality.join(" ")).toContain("Glute engagement was noted across lower-body work");
  expect(summary.movementQuality.join(" ")).toContain("Core bracing themes appeared across compound-lift notes");
  expect(summary.movementQuality.join(" ")).toContain("Balance or stability limits appeared in recent unilateral work");
  expect(summary.stimulus.join(" ")).toContain("Glute stimulus was noted across recent lower-body sessions");
  expect(summary.stimulus.join(" ")).toContain("Quad stimulus was noted across recent lower-body sessions");

  expect(summary.fatigue.join(" ")).toContain("Bracing quality changed under fatigue in recent notes");
  expect(summary.fatigue.join(" ")).toContain("Range of motion changed under fatigue in recent notes");

  expect(summary.constraints.join(" ")).toContain("Hamstring dominance appeared in repeated lower-body notes");
  expect(summary.constraints.join(" ")).toContain("Unilateral stability differences appeared in recent notes");

  const combined = [
    ...summary.movementQuality,
    ...summary.stimulus,
    ...summary.fatigue,
    ...summary.constraints,
    ...summary.progression,
  ].join(" ");

  expect(combined).not.toMatch(/\bprioritize\b/i);
  expect(combined).not.toMatch(/\bimprove\b/i);
  expect(combined).not.toMatch(/\bprogress\b/i);
  expect(combined).not.toMatch(/\breduce\b/i);
  expect(combined).not.toMatch(/\badd\b/i);
  expect(combined).not.toMatch(/\breplace\b/i);
});

test("pattern summary can surface descriptive tempo and descent-control themes", async () => {
  const repeatedSignals: CoachExportTrainingSignals = {
    movementQuality: [
      "Tempo Squat: controlled descent stayed clean",
      "Split Squat: controlled descent stayed clean",
    ],
    stimulusCoverage: [],
    fatigueReadiness: [],
    nextWorkoutFocus: [],
    discussWithGaz: [],
  };

  const sessions: CompletedSession[] = [
    {
      id: "tempo-1",
      endedAt: new Date("2026-04-27T09:00:00-04:00").getTime(),
      trainingSignals: repeatedSignals,
    },
    {
      id: "tempo-2",
      endedAt: new Date("2026-04-24T09:00:00-04:00").getTime(),
      trainingSignals: repeatedSignals,
    },
    {
      id: "tempo-3",
      endedAt: new Date("2026-04-20T09:00:00-04:00").getTime(),
      trainingSignals: repeatedSignals,
    },
  ];

  const summary = buildPatternSummary({
    sessions,
    trainingSignals: repeatedSignals,
  });

  expect(summary.movementQuality.join(" ")).toContain("Tempo or descent control was noted across recent sessions");
});

test("exercise vocabulary uses active canonical names, dedupes, and caps the list", async () => {
  const now = new Date("2026-04-27T09:00:00-04:00").getTime();
  const recentSessions = Array.from({ length: 5 }, (_, index) => ({
    id: `session-${index + 1}`,
    startedAt: now - (index + 1) * 60_000,
    endedAt: now - index * 86_400_000,
  }));

  const vocabulary = buildExerciseVocabulary({
    sessions: recentSessions,
    sets: [
      ...Array.from({ length: 30 }, (_, index) => ({
        id: `set-${index + 1}`,
        sessionId: recentSessions[index < 25 ? 0 : 4].id,
        trackId: `track-${index + 1}`,
        createdAt: now,
        setType: "working" as const,
        completedAt: now,
      })),
      {
        id: "set-duplicate",
        sessionId: recentSessions[1].id,
        trackId: "track-duplicate",
        createdAt: now,
        setType: "working" as const,
        completedAt: now,
      },
    ],
    tracks: [
      ...Array.from({ length: 30 }, (_, index) => ({
        id: `track-${index + 1}`,
        exerciseId: `exercise-${index + 1}`,
        trackType: "strength" as const,
        displayName: `Alias ${index + 1}`,
        trackingMode: "weightedReps" as const,
        warmupSetsDefault: 0,
        workingSetsDefault: 3,
        repMin: 5,
        repMax: 8,
        restSecondsDefault: 120,
        weightJumpDefault: 5,
        createdAt: now,
      })),
      {
        id: "track-duplicate",
        exerciseId: "exercise-1",
        trackType: "strength" as const,
        displayName: "Bench Alias",
        trackingMode: "weightedReps" as const,
        warmupSetsDefault: 0,
        workingSetsDefault: 3,
        repMin: 5,
        repMax: 8,
        restSecondsDefault: 120,
        weightJumpDefault: 5,
        createdAt: now,
      },
    ],
    exercises: [
      ...Array.from({ length: 30 }, (_, index) => ({
        id: `exercise-${index + 1}`,
        name: index === 0 ? "Bench Press" : `Exercise ${index + 1}`,
        normalizedName: index === 0 ? "bench press" : `exercise ${index + 1}`,
        equipmentTags: [],
        createdAt: now,
        ...(index === 27 ? { archivedAt: now } : null),
        ...(index === 28 ? { mergedIntoExerciseId: "exercise-1" } : null),
      })),
    ],
    anchorLifts: [
      {
        pattern: "push",
        exerciseId: "exercise-1",
        exerciseName: "Bench Press",
        trackDisplayName: "Bench Press",
        effectiveWeightLb: 225,
        reps: 5,
        e1rm: 262,
        performedAt: now,
      },
    ],
    limit: 25,
  });

  expect(vocabulary[0]).toBe("Bench Press");
  expect(vocabulary).not.toContain("Exercise 28");
  expect(vocabulary).not.toContain("Exercise 29");
  expect(vocabulary.length).toBe(25);
  expect(vocabulary.filter((name) => name === "Bench Press")).toHaveLength(1);
  expect(vocabulary).not.toContain("Exercise 30");
});

test("strength-building session windows exclude cardio-only and class-only sessions", async () => {
  const now = new Date("2026-05-04T09:00:00-04:00").getTime();
  const sessions = [
    { id: "walk", templateName: "Walking", startedAt: now - 9 * 86_400_000, endedAt: now - 9 * 86_400_000 + 1 },
    { id: "body-core", templateName: "Body Core", startedAt: now - 8 * 86_400_000, endedAt: now - 8 * 86_400_000 + 1 },
    { id: "upper-a", templateName: "Upper A", startedAt: now - 7 * 86_400_000, endedAt: now - 7 * 86_400_000 + 1 },
    { id: "lower-a", templateName: "Lower A", startedAt: now - 6 * 86_400_000, endedAt: now - 6 * 86_400_000 + 1 },
    { id: "body-core-strength", templateName: "Body Core", startedAt: now - 5 * 86_400_000, endedAt: now - 5 * 86_400_000 + 1 },
    { id: "upper-b", templateName: "Upper B", startedAt: now - 4 * 86_400_000, endedAt: now - 4 * 86_400_000 + 1 },
    { id: "lower-b", templateName: "Lower B", startedAt: now - 3 * 86_400_000, endedAt: now - 3 * 86_400_000 + 1 },
    { id: "upper-c", templateName: "Upper C", startedAt: now - 2 * 86_400_000, endedAt: now - 2 * 86_400_000 + 1 },
    { id: "lower-c", templateName: "Lower C", startedAt: now - 1 * 86_400_000, endedAt: now - 1 * 86_400_000 + 1 },
  ];

  const tracks = [
    {
      id: "track-walk",
      exerciseId: "exercise-walk",
      trackType: "conditioning" as const,
      displayName: "Walk",
      trackingMode: "timeSeconds" as const,
      warmupSetsDefault: 0,
      workingSetsDefault: 1,
      repMin: 1,
      repMax: 1,
      restSecondsDefault: 60,
      weightJumpDefault: 0,
      createdAt: now,
    },
    {
      id: "track-body-core-only",
      exerciseId: "exercise-body-core-only",
      trackType: "mobility" as const,
      displayName: "Box Breathing",
      trackingMode: "repsOnly" as const,
      warmupSetsDefault: 0,
      workingSetsDefault: 1,
      repMin: 1,
      repMax: 1,
      restSecondsDefault: 60,
      weightJumpDefault: 0,
      createdAt: now,
    },
    ...["upper-a", "lower-a", "body-core-strength", "upper-b", "lower-b", "upper-c", "lower-c"].map((id, index) => ({
      id: `track-${id}`,
      exerciseId: `exercise-${id}`,
      trackType: index === 2 ? ("technique" as const) : ("strength" as const),
      displayName: `Exercise ${id}`,
      trackingMode: "weightedReps" as const,
      warmupSetsDefault: 0,
      workingSetsDefault: 3,
      repMin: 5,
      repMax: 8,
      restSecondsDefault: 120,
      weightJumpDefault: 5,
      createdAt: now,
    })),
  ];

  const sets = [
    {
      id: "set-walk",
      sessionId: "walk",
      trackId: "track-walk",
      createdAt: now,
      completedAt: now,
      setType: "working" as const,
      seconds: 1800,
    },
    {
      id: "set-body-core-only",
      sessionId: "body-core",
      trackId: "track-body-core-only",
      createdAt: now,
      completedAt: now,
      setType: "working" as const,
      reps: 5,
    },
    ...["upper-a", "lower-a", "body-core-strength", "upper-b", "lower-b", "upper-c", "lower-c"].map((id) => ({
      id: `set-${id}`,
      sessionId: id,
      trackId: `track-${id}`,
      createdAt: now,
      completedAt: now,
      setType: "working" as const,
      reps: 8,
      weight: 100,
    })),
  ];

  const signalSessions = selectRecentStrengthBuildingSessions({
    sessions: sessions as any,
    sets: sets as any,
    tracks: tracks as any,
    limit: 4,
  });
  const vocabularySessions = selectRecentStrengthBuildingSessions({
    sessions: sessions as any,
    sets: sets as any,
    tracks: tracks as any,
    limit: 8,
  });

  expect(signalSessions.map((session) => session.id)).toEqual([
    "lower-c",
    "upper-c",
    "lower-b",
    "upper-b",
  ]);
  expect(vocabularySessions.map((session) => session.id)).toEqual([
    "lower-c",
    "upper-c",
    "lower-b",
    "upper-b",
    "body-core-strength",
    "lower-a",
    "upper-a",
  ]);
  expect(vocabularySessions.map((session) => session.id)).not.toContain("walk");
  expect(vocabularySessions.map((session) => session.id)).not.toContain("body-core");
});

test("imported completed strength sessions still qualify without set.completedAt when meaningful work data exists", async () => {
  const now = new Date("2026-05-04T09:00:00-04:00").getTime();
  const session = {
    id: "imported-strength",
    templateName: "Imported Upper",
    startedAt: now - 86_400_000,
    endedAt: now - 86_300_000,
  };
  const tracksById = new Map([
    [
      "strength-track",
      {
        id: "strength-track",
        exerciseId: "exercise-1",
        trackType: "strength" as const,
        displayName: "Bench Press",
        trackingMode: "weightedReps" as const,
        warmupSetsDefault: 0,
        workingSetsDefault: 3,
        repMin: 5,
        repMax: 8,
        restSecondsDefault: 120,
        weightJumpDefault: 5,
        createdAt: now,
      },
    ],
    [
      "conditioning-track",
      {
        id: "conditioning-track",
        exerciseId: "exercise-2",
        trackType: "conditioning" as const,
        displayName: "Walking",
        trackingMode: "timeSeconds" as const,
        warmupSetsDefault: 0,
        workingSetsDefault: 1,
        repMin: 1,
        repMax: 1,
        restSecondsDefault: 60,
        weightJumpDefault: 0,
        createdAt: now,
      },
    ],
  ]);

  expect(
    isStrengthBuildingSession({
      session: session as any,
      tracksById: new Map([["strength-track", tracksById.get("strength-track")!]]),
      sets: [
        {
          id: "set-strength",
          sessionId: "imported-strength",
          trackId: "strength-track",
          createdAt: now,
          setType: "working" as const,
          reps: 8,
          weight: 135,
        },
      ] as any,
    })
  ).toBe(true);

  expect(
    isStrengthBuildingSession({
      session: session as any,
      tracksById: new Map([["conditioning-track", tracksById.get("conditioning-track")!]]),
      sets: [
        {
          id: "set-conditioning",
          sessionId: "imported-strength",
          trackId: "conditioning-track",
          createdAt: now,
          setType: "working" as const,
          seconds: 1800,
        },
      ] as any,
    })
  ).toBe(false);

  expect(
    isStrengthBuildingSession({
      session: session as any,
      tracksById: new Map([["strength-track", tracksById.get("strength-track")!]]),
      sets: [
        {
          id: "set-empty",
          sessionId: "imported-strength",
          trackId: "strength-track",
          createdAt: now,
          setType: "working" as const,
        },
      ] as any,
    })
  ).toBe(false);
});

test("exercise vocabulary uses the last 8 strength-building sessions and preserves side-specific names", async () => {
  const now = new Date("2026-05-04T09:00:00-04:00").getTime();
  const sessions = Array.from({ length: 10 }, (_, index) => ({
    id: `session-${index + 1}`,
    templateName: index === 8 ? "Walking" : index === 9 ? "Body Core" : `Strength ${index + 1}`,
    startedAt: now - (10 - index) * 10_000,
    endedAt: now - (10 - index) * 10_000 + 1,
  }));

  const exercises = [
    "Bench Press",
    "Single-Leg DB RDL Left",
    "Single-Leg DB RDL Right",
    "Bulgarian Split Squat Left",
    "Bulgarian Split Squat Right",
    "Copenhagen Plank Left",
    "Copenhagen Plank Right",
    "90/90 Hip Lift",
    "Walking",
    "Box Breathing",
  ].map((name, index) => ({
    id: `exercise-${index + 1}`,
    name,
    normalizedName: name.toLowerCase(),
    equipmentTags: [],
    createdAt: now,
  }));

  const tracks = [
    {
      id: "track-1",
      exerciseId: "exercise-1",
      trackType: "strength" as const,
      displayName: "Bench Press",
      trackingMode: "weightedReps" as const,
      warmupSetsDefault: 0,
      workingSetsDefault: 3,
      repMin: 5,
      repMax: 8,
      restSecondsDefault: 120,
      weightJumpDefault: 5,
      createdAt: now,
    },
    {
      id: "track-2",
      exerciseId: "exercise-2",
      trackType: "strength" as const,
      displayName: "Single-Leg DB RDL Left",
      trackingMode: "weightedReps" as const,
      warmupSetsDefault: 0,
      workingSetsDefault: 3,
      repMin: 5,
      repMax: 8,
      restSecondsDefault: 120,
      weightJumpDefault: 5,
      createdAt: now,
    },
    {
      id: "track-3",
      exerciseId: "exercise-3",
      trackType: "strength" as const,
      displayName: "Single-Leg DB RDL Right",
      trackingMode: "weightedReps" as const,
      warmupSetsDefault: 0,
      workingSetsDefault: 3,
      repMin: 5,
      repMax: 8,
      restSecondsDefault: 120,
      weightJumpDefault: 5,
      createdAt: now,
    },
    {
      id: "track-4",
      exerciseId: "exercise-4",
      trackType: "strength" as const,
      displayName: "Bulgarian Split Squat Left",
      trackingMode: "weightedReps" as const,
      warmupSetsDefault: 0,
      workingSetsDefault: 3,
      repMin: 5,
      repMax: 8,
      restSecondsDefault: 120,
      weightJumpDefault: 5,
      createdAt: now,
    },
    {
      id: "track-5",
      exerciseId: "exercise-5",
      trackType: "strength" as const,
      displayName: "Bulgarian Split Squat Right",
      trackingMode: "weightedReps" as const,
      warmupSetsDefault: 0,
      workingSetsDefault: 3,
      repMin: 5,
      repMax: 8,
      restSecondsDefault: 120,
      weightJumpDefault: 5,
      createdAt: now,
    },
    {
      id: "track-6",
      exerciseId: "exercise-6",
      trackType: "corrective" as const,
      displayName: "Copenhagen Plank Left",
      trackingMode: "repsOnly" as const,
      warmupSetsDefault: 0,
      workingSetsDefault: 1,
      repMin: 1,
      repMax: 1,
      restSecondsDefault: 60,
      weightJumpDefault: 0,
      createdAt: now,
    },
    {
      id: "track-7",
      exerciseId: "exercise-7",
      trackType: "corrective" as const,
      displayName: "Copenhagen Plank Right",
      trackingMode: "repsOnly" as const,
      warmupSetsDefault: 0,
      workingSetsDefault: 1,
      repMin: 1,
      repMax: 1,
      restSecondsDefault: 60,
      weightJumpDefault: 0,
      createdAt: now,
    },
    {
      id: "track-8",
      exerciseId: "exercise-8",
      trackType: "mobility" as const,
      displayName: "90/90 Hip Lift",
      trackingMode: "repsOnly" as const,
      warmupSetsDefault: 0,
      workingSetsDefault: 1,
      repMin: 1,
      repMax: 1,
      restSecondsDefault: 60,
      weightJumpDefault: 0,
      createdAt: now,
    },
    {
      id: "track-9",
      exerciseId: "exercise-9",
      trackType: "conditioning" as const,
      displayName: "Walking",
      trackingMode: "timeSeconds" as const,
      warmupSetsDefault: 0,
      workingSetsDefault: 1,
      repMin: 1,
      repMax: 1,
      restSecondsDefault: 60,
      weightJumpDefault: 0,
      createdAt: now,
    },
    {
      id: "track-10",
      exerciseId: "exercise-10",
      trackType: "mobility" as const,
      displayName: "Box Breathing",
      trackingMode: "repsOnly" as const,
      warmupSetsDefault: 0,
      workingSetsDefault: 1,
      repMin: 1,
      repMax: 1,
      restSecondsDefault: 60,
      weightJumpDefault: 0,
      createdAt: now,
    },
  ];

  const sets = [
    { id: "set-1", sessionId: "session-1", trackId: "track-1", createdAt: now, completedAt: now, setType: "working" as const, reps: 6, weight: 185 },
    { id: "set-2", sessionId: "session-2", trackId: "track-2", createdAt: now, completedAt: now, setType: "working" as const, reps: 8, weight: 55 },
    { id: "set-3", sessionId: "session-3", trackId: "track-3", createdAt: now, completedAt: now, setType: "working" as const, reps: 8, weight: 55 },
    { id: "set-4", sessionId: "session-4", trackId: "track-4", createdAt: now, completedAt: now, setType: "working" as const, reps: 10, weight: 45 },
    { id: "set-5", sessionId: "session-5", trackId: "track-5", createdAt: now, completedAt: now, setType: "working" as const, reps: 10, weight: 45 },
    { id: "set-6", sessionId: "session-5", trackId: "track-6", createdAt: now, completedAt: now, setType: "working" as const, reps: 1 },
    { id: "set-7", sessionId: "session-6", trackId: "track-1", createdAt: now, completedAt: now, setType: "working" as const, reps: 5, weight: 185 },
    { id: "set-8", sessionId: "session-6", trackId: "track-7", createdAt: now, completedAt: now, setType: "working" as const, reps: 1 },
    { id: "set-9", sessionId: "session-6", trackId: "track-8", createdAt: now, completedAt: now, setType: "warmup" as const, reps: 5 },
    { id: "set-10", sessionId: "session-7", trackId: "track-1", createdAt: now, completedAt: now, setType: "working" as const, reps: 5, weight: 185 },
    { id: "set-11", sessionId: "session-8", trackId: "track-1", createdAt: now, completedAt: now, setType: "working" as const, reps: 5, weight: 185 },
    { id: "set-12", sessionId: "session-9", trackId: "track-9", createdAt: now, completedAt: now, setType: "working" as const, seconds: 1800 },
    { id: "set-13", sessionId: "session-10", trackId: "track-10", createdAt: now, completedAt: now, setType: "working" as const, reps: 5 },
  ];

  const vocabulary = buildExerciseVocabulary({
    sessions: sessions as any,
    sets: sets as any,
    tracks: tracks as any,
    exercises: exercises as any,
    anchorLifts: [],
    limit: 25,
  });

  expect(vocabulary).toEqual(
    expect.arrayContaining([
      "Bench Press",
      "Single-Leg DB RDL Left",
      "Single-Leg DB RDL Right",
      "Bulgarian Split Squat Left",
      "Bulgarian Split Squat Right",
      "Copenhagen Plank Left",
      "Copenhagen Plank Right",
      "90/90 Hip Lift",
    ])
  );
  expect(vocabulary).not.toContain("Walking");
  expect(vocabulary).not.toContain("Box Breathing");
  expect(vocabulary.filter((name) => name.includes("Left")).length).toBeGreaterThan(0);
  expect(vocabulary.filter((name) => name.includes("Right")).length).toBeGreaterThan(0);
});

test("exercise vocabulary cap keeps the most recent names inside the 8-session window", async () => {
  const now = new Date("2026-05-04T09:00:00-04:00").getTime();
  const sessions = Array.from({ length: 8 }, (_, index) => ({
    id: `session-${index + 1}`,
    templateName: `Strength ${index + 1}`,
    startedAt: now - index * 10_000,
    endedAt: now - index * 10_000 + 1,
  }));

  const namesBySession = [
    ["Recent A1", "Recent A2", "Recent A3", "Recent A4"],
    ["Recent B1", "Recent B2", "Recent B3", "Recent B4"],
    ["Recent C1", "Recent C2", "Recent C3", "Recent C4"],
    ["Recent D1", "Recent D2", "Recent D3", "Recent D4"],
    ["Recent E1", "Recent E2", "Recent E3", "Recent E4"],
    ["Recent F1", "Recent F2", "Recent F3", "Recent F4"],
    ["Older G1", "Older G2", "Older G3", "Older G4"],
    ["Older H1", "Older H2", "Older H3", "Older H4"],
  ];

  const exercises: any[] = [];
  const tracks: any[] = [];
  const sets: any[] = [];
  let counter = 1;
  for (const [sessionIndex, session] of sessions.entries()) {
    for (const name of namesBySession[sessionIndex]) {
      const exerciseId = `exercise-${counter}`;
      const trackId = `track-${counter}`;
      exercises.push({
        id: exerciseId,
        name,
        normalizedName: name.toLowerCase(),
        equipmentTags: [],
        createdAt: now,
      });
      tracks.push({
        id: trackId,
        exerciseId,
        trackType: "strength",
        displayName: name,
        trackingMode: "weightedReps",
        warmupSetsDefault: 0,
        workingSetsDefault: 3,
        repMin: 5,
        repMax: 8,
        restSecondsDefault: 120,
        weightJumpDefault: 5,
        createdAt: now,
      });
      sets.push({
        id: `set-${counter}`,
        sessionId: session.id,
        trackId,
        createdAt: now + counter,
        completedAt: now + counter,
        setType: "working",
        reps: 8,
        weight: 100,
      });
      counter += 1;
    }
  }

  const vocabulary = buildExerciseVocabulary({
    sessions: sessions as any,
    sets,
    tracks,
    exercises,
    anchorLifts: [],
    limit: 25,
  });

  expect(vocabulary).toHaveLength(25);
  expect(vocabulary).toEqual(
    expect.arrayContaining([
      "Recent A1",
      "Recent F4",
      "Older G1",
    ])
  );
  expect(vocabulary).not.toContain("Older H4");
  expect(vocabulary.indexOf("Recent A1")).toBeLessThan(vocabulary.indexOf("Older G1"));
});

test("next workout focus builds constraint and trigger guidance without split-specific language", async () => {
  const focus = buildNextWorkoutFocus({
    trainingSignals: {
      movementQuality: [
        "Lat Pulldown: improved stretch and contraction",
        "Lateral Raise: medial delt isolation still not clean",
      ],
      stimulusCoverage: [
        "Pull: strong lat stimulus",
        "Shoulders: lateral delt isolation needs refinement",
      ],
      fatigueReadiness: [
        "Fatigue mostly appeared at terminal reps",
        "Shoulder sensitive in behind-head position",
        "Elbow pain showed up late",
      ],
      nextWorkoutFocus: [
        "Maintain lat-driven pulling before increasing load",
        "Improve medial delt isolation",
        "Avoid behind-the-neck pressing positions",
      ],
      discussWithGaz: [
        "Review safe overhead pressing range",
      ],
    },
    patternSummary: {
      movementQuality: [
        "Lat engagement improving across recent pull work",
        "Shoulder sensitivity appears in overhead positions",
      ],
      stimulus: ["Pull stimulus consistently strong"],
      fatigue: ["Fatigue consistently appears at terminal reps"],
      constraints: ["Shoulder sensitivity linked to behind-head or overhead positions"],
      progression: ["Pulling movements show improving consistency"],
    },
    phaseQuality: {
      finalStatus: "Aggressive Cut",
      confidence: "High",
      drivers: ["Muscle-risk cut risk remains elevated."],
    } as any,
  });

  expect(focus.progressionGuardrails.join(" ")).toMatch(
    /keep progression conservative/i
  );
  expect(focus.progressionGuardrails.join(" ")).toMatch(
    /joint feedback|shoulder sensitivity/i
  );
  expect(focus.executionPriorities.join(" ")).toMatch(
    /pulling setup constraints|selecting or progressing work/i
  );
  expect(focus.executionPriorities.join(" ")).toMatch(
    /isolation inconsistency|movement-quality constraint/i
  );
  expect(focus.adjustmentTriggers.join(" ")).toMatch(
    /later-set fatigue|terminal-rep/i
  );
  expect(focus.adjustmentTriggers.join(" ")).toMatch(
    /stop or modify|joint feedback|shoulder|elbow/i
  );
  expect(focus.progressionGuardrails.length).toBeLessThanOrEqual(3);
  expect(focus.executionPriorities.length).toBeLessThanOrEqual(3);
  expect(focus.adjustmentTriggers.length).toBeLessThanOrEqual(3);
  expect(focus.progressionGuardrails.join(" ")).not.toMatch(/upper|lower|next workout type/i);
  expect(focus.executionPriorities.join(" ")).not.toMatch(/upper|lower|next workout type/i);
  expect(focus.adjustmentTriggers.join(" ")).not.toMatch(/upper|lower|next workout type/i);
  expect(focus.executionPriorities.join(" ")).not.toMatch(/\bprioritize\b/i);
  expect(focus.executionPriorities.join(" ")).not.toMatch(/\bimprove\b/i);
  expect(focus.executionPriorities.join(" ")).not.toMatch(/\bprogress\b/i);
  expect(focus.executionPriorities.join(" ")).not.toMatch(/\bbuild\b/i);
  expect(focus.executionPriorities.join(" ")).not.toMatch(/\badd\b/i);
  expect(focus.executionPriorities.join(" ")).not.toMatch(/\breplace\b/i);
  expect(focus.executionPriorities.join(" ")).not.toMatch(/\bprescribe\b/i);
  expect(focus.executionPriorities.join(" ")).not.toMatch(/\bdo\s+[a-z]/i);
});

test("next workout focus section avoids split prediction and exact programming prescriptions", async () => {
  const text = formatCoachExportText(buildMetrics());
  const focusSection = getSection(text, "Next Workout Focus", "Training Signals (Recent Sessions)");

  expect(focusSection).not.toMatch(/next workout:\s*(upper|lower)/i);
  expect(focusSection).not.toMatch(/\bdo\s+(upper|lower)\b/i);
  expect(focusSection).not.toMatch(/next session should be/i);

  expect(focusSection).not.toMatch(/\badd\s+\d+\s+sets?\b/i);
  expect(focusSection).not.toMatch(/\bdo\s+\d+\s+sets?\s+of\b/i);
  expect(focusSection).not.toMatch(/\bincrease by\s+\d+\s*(lb|lbs|kg)?\b/i);
  expect(focusSection).not.toMatch(/\bperform\s+\d+\s*-\s*\d+\s+reps?\b/i);
  expect(focusSection).not.toMatch(/\bprioritize\b/i);
  expect(focusSection).not.toMatch(/\bimprove\b/i);
  expect(focusSection).not.toMatch(/\bbuild\b/i);
  expect(focusSection).not.toMatch(/\breplace\b/i);
  expect(focusSection).not.toMatch(/\bprescribe\b/i);
});

test("next workout focus omits empty subsection headings when no bullets exist", async () => {
  const metrics = buildMetrics();
  metrics.nextWorkoutFocus = {
    progressionGuardrails: [
      "Keep progression conservative given current phase-quality risk.",
    ],
    executionPriorities: [],
    adjustmentTriggers: [],
  };

  const text = formatCoachExportText(metrics);
  const focusSection = getSection(text, "Next Workout Focus", "Training Signals (Recent Sessions)");

  expect(focusSection).toContain("Progression Guardrails");
  expect(focusSection).not.toContain("Execution Priorities");
  expect(focusSection).not.toContain("Adjustment Triggers");
});
