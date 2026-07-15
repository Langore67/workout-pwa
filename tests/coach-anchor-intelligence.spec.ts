import { expect, test, type Page } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173";
const DAY_MS = 24 * 60 * 60 * 1000;
const AS_OF = Date.UTC(2026, 6, 14, 9, 0, 0, 0);

function goto(page: Page, path = "/") {
  return page.goto(new URL(path, BASE_URL).toString(), { waitUntil: "domcontentloaded" });
}

test.describe("Anchor Intelligence", () => {
  test("preserves legacy anchor values while adding metadata", async ({ page }) => {
    await goto(page);
    const result = await page.evaluate(async () => {
      const AS_OF = Date.UTC(2026, 6, 14, 9, 0, 0, 0);
      const DAY_MS = 24 * 60 * 60 * 1000;
      const { buildAnchorIntelligence } = await import("/src/lib/coachExport/anchorIntelligence.ts");

      const anchors = buildAnchorIntelligence({
        anchors: [
          {
            pattern: "push",
            exerciseId: "bench-id",
            exerciseName: "Bench Press",
            trackDisplayName: "Bench Press",
            effectiveWeightLb: 225,
            reps: 5,
            e1rm: 262,
            performedAt: AS_OF - 3 * DAY_MS,
            ageDays: 3,
            recency: "recent",
            isStale: false,
          },
        ] as any,
        sessions: [],
        sets: [],
        tracks: [],
        exercises: [],
        asOf: AS_OF,
      });

      return anchors[0];
    });

    expect(result.pattern).toBe("push");
    expect(result.exerciseName).toBe("Bench Press");
    expect(result.effectiveWeightLb).toBe(225);
    expect(result.reps).toBe(5);
    expect(result.e1rm).toBe(262);
    expect(result.movementFamily).toBe("horizontal_push");
    expect(result.status).toBe("current_recent");
  });

  test("marks same-exercise current anchors as current recent", async ({ page }) => {
    await goto(page);
    const result = await page.evaluate(async () => {
      const AS_OF = Date.UTC(2026, 6, 14, 9, 0, 0, 0);
      const DAY_MS = 24 * 60 * 60 * 1000;
      const { buildAnchorIntelligence } = await import("/src/lib/coachExport/anchorIntelligence.ts");

      const completedAt = AS_OF - 2 * DAY_MS;
      const anchors = buildAnchorIntelligence({
        anchors: [
          {
            pattern: "push",
            exerciseId: "exercise-incline-bench",
            exerciseName: "Incline Barbell Bench Press",
            trackDisplayName: "Incline Barbell Bench Press",
            effectiveWeightLb: 180,
            reps: 6,
            e1rm: 216,
            performedAt: completedAt,
            ageDays: 2,
            recency: "recent",
            isStale: false,
          },
        ] as any,
        sessions: [{ id: "session-same-exercise", startedAt: completedAt - 45 * 60 * 1000, endedAt: completedAt }] as any,
        sets: [{ id: "set-1", sessionId: "session-same-exercise", trackId: "track-incline-bench", createdAt: completedAt, completedAt, setType: "working", weight: 100, reps: 8 }] as any,
        tracks: [{ id: "track-incline-bench", exerciseId: "exercise-incline-bench", displayName: "Incline Barbell Bench Press", trackType: "strength", trackingMode: "weightedReps", warmupSetsDefault: 0, workingSetsDefault: 1, repMin: 1, repMax: 15, restSecondsDefault: 90, weightJumpDefault: 5, createdAt: AS_OF }] as any,
        exercises: [{ id: "exercise-incline-bench", name: "Incline Barbell Bench Press", normalizedName: "incline barbell bench press", equipmentTags: [], createdAt: AS_OF }] as any,
        asOf: AS_OF,
      });

      return anchors[0];
    });

    expect(result.status).toBe("current_recent");
    expect(result.relationship).toBe("same_exercise");
    expect(result.currentMovement.exerciseName).toBe("Incline Barbell Bench Press");
    expect(result.interpretation).toContain("Current movement matches the performance anchor");
  });

  test("keeps historical anchors and same-family current movement distinct", async ({ page }) => {
    await goto(page);
    const result = await page.evaluate(async () => {
      const AS_OF = Date.UTC(2026, 6, 14, 9, 0, 0, 0);
      const DAY_MS = 24 * 60 * 60 * 1000;
      const { buildAnchorIntelligence } = await import("/src/lib/coachExport/anchorIntelligence.ts");

      const currentCompletedAt = AS_OF - 2 * DAY_MS;
      const anchors = buildAnchorIntelligence({
        anchors: [
          {
            pattern: "pull",
            exerciseId: "exercise-lat-pulldown",
            exerciseName: "Lat Pulldown",
            trackDisplayName: "Lat Pulldown",
            effectiveWeightLb: 140,
            reps: 10,
            e1rm: 187,
            performedAt: AS_OF - 59 * DAY_MS,
            ageDays: 59,
            recency: "stale",
            isStale: true,
          },
        ] as any,
        sessions: [{ id: "session-current-pull", startedAt: currentCompletedAt - 45 * 60 * 1000, endedAt: currentCompletedAt }] as any,
        sets: [{ id: "set-current", sessionId: "session-current-pull", trackId: "track-assisted-pull-up", createdAt: currentCompletedAt, completedAt: currentCompletedAt, setType: "working", weight: 35, reps: 8 }] as any,
        tracks: [{ id: "track-assisted-pull-up", exerciseId: "exercise-assisted-pull-up", displayName: "Assisted Pull Up", trackType: "strength", trackingMode: "weightedReps", warmupSetsDefault: 0, workingSetsDefault: 1, repMin: 1, repMax: 15, restSecondsDefault: 90, weightJumpDefault: 5, createdAt: AS_OF }] as any,
        exercises: [{ id: "exercise-assisted-pull-up", name: "Assisted Pull Up", normalizedName: "assisted pull up", equipmentTags: [], createdAt: AS_OF }] as any,
        asOf: AS_OF,
      });

      return anchors[0];
    });

    expect(result.status).toBe("stale_anchor");
    expect(result.relationship).toBe("same_family_different_exercise");
    expect(result.movementFamily).toBe("vertical_pull");
    expect(result.currentMovement.exerciseName).toBe("Assisted Pull Up");
    expect(result.interpretation).toContain("Historical vertical pull anchor: Lat Pulldown");
    expect(result.interpretation).toContain("Current vertical pull movement: Assisted Pull Up");
    expect(result.interpretation).not.toContain("replaced");
  });

  test("keeps horizontal pull distinct from vertical pull", async ({ page }) => {
    await goto(page);
    const result = await page.evaluate(async () => {
      const AS_OF = Date.UTC(2026, 6, 14, 9, 0, 0, 0);
      const DAY_MS = 24 * 60 * 60 * 1000;
      const { buildAnchorIntelligence, classifyAnchorMovementFamily } = await import("/src/lib/coachExport/anchorIntelligence.ts");

      const anchors = buildAnchorIntelligence({
        anchors: [
          {
            pattern: "pull",
            exerciseId: "exercise-lat-pulldown",
            exerciseName: "Lat Pulldown",
            trackDisplayName: "Lat Pulldown",
            effectiveWeightLb: 140,
            reps: 10,
            e1rm: 187,
            performedAt: AS_OF - 59 * DAY_MS,
            ageDays: 59,
            recency: "stale",
            isStale: true,
          },
        ] as any,
        sessions: [{ id: "session-horizontal-pull", startedAt: AS_OF - 2 * DAY_MS - 45 * 60 * 1000, endedAt: AS_OF - 2 * DAY_MS }] as any,
        sets: [{ id: "set-horizontal", sessionId: "session-horizontal-pull", trackId: "track-mts-row", createdAt: AS_OF - 2 * DAY_MS, completedAt: AS_OF - 2 * DAY_MS, setType: "working", weight: 100, reps: 8 }] as any,
        tracks: [{ id: "track-mts-row", exerciseId: "exercise-mts-row", displayName: "MTS Row", trackType: "strength", trackingMode: "weightedReps", warmupSetsDefault: 0, workingSetsDefault: 1, repMin: 1, repMax: 15, restSecondsDefault: 90, weightJumpDefault: 5, createdAt: AS_OF }] as any,
        exercises: [{ id: "exercise-mts-row", name: "MTS Row", normalizedName: "mts row", equipmentTags: [], createdAt: AS_OF }] as any,
        asOf: AS_OF,
      });

      return {
        family: classifyAnchorMovementFamily("MTS Row"),
        anchor: anchors[0],
      };
    });

    expect(result.family).toBe("horizontal_pull");
    expect(result.anchor.movementFamily).toBe("vertical_pull");
    expect(result.anchor.currentMovement).toBeUndefined();
    expect(result.anchor.relationship).toBe("unknown");
    expect(result.anchor.interpretation).not.toContain("Current vertical pull movement");
  });

  test("marks missing timestamps conservatively", async ({ page }) => {
    await goto(page);
    const result = await page.evaluate(async () => {
      const AS_OF = Date.UTC(2026, 6, 14, 9, 0, 0, 0);
      const DAY_MS = 24 * 60 * 60 * 1000;
      const { buildAnchorIntelligence } = await import("/src/lib/coachExport/anchorIntelligence.ts");

      const anchors = buildAnchorIntelligence({
        anchors: [
          {
            pattern: "hinge",
            exerciseId: "exercise-trap-bar-deadlift",
            exerciseName: "Trap Bar Deadlift",
            trackDisplayName: "Trap Bar Deadlift",
            effectiveWeightLb: 315,
            reps: 5,
            e1rm: 378,
            performedAt: null,
            ageDays: null,
            recency: undefined,
            isStale: false,
          },
        ] as any,
        sessions: [],
        sets: [],
        tracks: [],
        exercises: [],
        asOf: AS_OF,
      });

      return anchors[0];
    });

    expect(result.status).toBe("missing_date");
    expect(result.interpretation).toBe("Anchor recency could not be confirmed.");
    expect(result.currentMovement).toBeUndefined();
  });

  test("state, report, and export preserve anchor metadata", async ({ page }) => {
    await goto(page);
    const result = await page.evaluate(async () => {
      const AS_OF = Date.UTC(2026, 6, 14, 9, 0, 0, 0);
      const DAY_MS = 24 * 60 * 60 * 1000;
      const { buildCoachStateFromExportMetrics } = await import("/src/lib/coachState/buildCoachState.ts");
      const { buildCoachReport } = await import("/src/lib/coachReport/buildCoachReport.ts");
      const { formatCoachReportText } = await import("/src/lib/coachReport/formatCoachReportText.ts");

      const metrics = {
        generatedAt: AS_OF,
        currentPhase: "cut",
        bodyComp: {
          weight: { latest: null, baseline14d: null, delta14d: null },
          waist: { latest: null, baseline14d: null, delta14d: null },
          bodyFatPct: { latest: null, baseline14d: null, delta14d: null },
          leanMass: { latest: null, baseline14d: null, delta14d: null },
          bodyweightDelta7d: null,
          bodyweightDelta14d: null,
        },
        hydration: { latestWaterPct: null, confidenceLabel: "Unknown", confidenceScore: null, note: "Insufficient Data" },
        strengthSignal: { current: null, delta14d: null, vs90dBestPct: null, currentBodyweight: null, bodyweightDaysUsed: null },
        phaseQuality: null,
        anchorLifts: [
          {
            pattern: "pull",
            exerciseId: "exercise-lat-pulldown",
            exerciseName: "Lat Pulldown",
            trackDisplayName: "Lat Pulldown",
            effectiveWeightLb: 140,
            reps: 10,
            e1rm: 187,
            performedAt: AS_OF - 59 * DAY_MS,
            ageDays: 59,
            recency: "stale",
            isStale: true,
            movementFamily: "vertical_pull",
            status: "stale_anchor",
            currentMovement: {
              exerciseName: "Assisted Pull Up",
              movementFamily: "vertical_pull",
              performedAt: AS_OF - 2 * DAY_MS,
              ageDays: 2,
            },
            relationship: "same_family_different_exercise",
            interpretation: "Historical vertical pull anchor: Lat Pulldown. Current vertical pull movement: Assisted Pull Up.",
          },
        ],
        exerciseVocabulary: [],
        trainingSignals: { movementQuality: [], stimulusCoverage: [], fatigueReadiness: [], nextWorkoutFocus: [], discussWithGaz: [] },
        patternSummary: { movementQuality: [], stimulus: [], fatigue: [], constraints: [], progression: [] },
        nextWorkoutFocus: { progressionGuardrails: [], executionPriorities: [], adjustmentTriggers: [] },
        exportConfidence: { score: 0, label: "Low", components: { waistReadiness: 0, weightDataReady: 0, strengthDataReady: 0, coherenceScore: 0 } },
        readinessNotes: [],
        dataNotes: [],
      } as any;

      const coachState = buildCoachStateFromExportMetrics(metrics);
      const report = buildCoachReport({ coachState, metrics, generatedAt: AS_OF });
      return {
        coachState: coachState.strength.anchors?.[0],
        report: report.performance?.anchor,
        text: formatCoachReportText(report, { bodyHeadingOverride: "Body Composition — Coach Trend Values" }),
      };
    });

    expect(result.coachState.movementFamily).toBe("vertical_pull");
    expect(result.coachState.status).toBe("stale_anchor");
    expect(result.coachState.currentMovement.exerciseName).toBe("Assisted Pull Up");
    expect(result.coachState.relationship).toBe("same_family_different_exercise");

    expect(result.report.familyLabel).toBe("Vertical Pull");
    expect(result.report.statusLabel).toBe("Stale anchor");
    expect(result.report.currentMovementText).toContain("Assisted Pull Up");
    expect(result.report.relationshipText).toBe("Same movement family");
    expect(result.report.read).toContain("Historical vertical pull anchor");

    expect(result.text).toContain("Performance Anchor: Vertical Pull");
    expect(result.text).toContain("Anchor Status: Stale anchor");
    expect(result.text).toContain("Current Movement: Assisted Pull Up");
    expect(result.text).toContain("Relationship: Same movement family");
  });
});
