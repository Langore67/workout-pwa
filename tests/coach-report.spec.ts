import { expect, test } from "@playwright/test";
import { buildCoachReport } from "../src/lib/coachReport/buildCoachReport";

function buildFixture(overrides: any = {}) {
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

  expect(report.performance?.anchor?.text).toContain("historical anchor");
  expect(report.performance?.anchor?.text).toContain("22d old");
  expect(report.performance?.read).toContain("Historical anchors remain useful");

  expect(report.goals?.trajectory).toBe("Watch");
  expect(report.goals?.read).toContain("Weight goal is close");

  expect(report.learnings?.whatsWorking).toContain("Pull: strong lat stimulus");
  expect(report.learnings?.watchNow).toContain("Trap compensation remains a carry constraint");

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
