import { expect, test, type Page } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173";
const DAY_MS = 24 * 60 * 60 * 1000;
const AS_OF = Date.UTC(2026, 6, 14, 9, 0, 0, 0);

function goto(page: Page, path = "/") {
  return page.goto(new URL(path, BASE_URL).toString(), { waitUntil: "domcontentloaded" });
}

type ScenarioExercise = {
  name: string;
  family?: string;
  daysAgo: number;
  sets: number;
  trackType?: string;
};

function buildScenario(items: ScenarioExercise[]) {
  const sessions: any[] = [];
  const sets: any[] = [];
  const tracks: any[] = [];
  const exercises: any[] = [];

  items.forEach((item, index) => {
    const sessionId = `session-${index}`;
    const exerciseId = `exercise-${index}`;
    const trackId = `track-${index}`;
    const at = AS_OF - item.daysAgo * DAY_MS;
    sessions.push({ id: sessionId, startedAt: at - 45 * 60 * 1000, endedAt: at });
    exercises.push({
      id: exerciseId,
      name: item.name,
      normalizedName: item.name.toLowerCase(),
      equipmentTags: [],
      createdAt: AS_OF,
    });
    tracks.push({
      id: trackId,
      exerciseId,
      displayName: item.name,
      trackType: item.trackType ?? "strength",
      trackingMode: "weightedReps",
      warmupSetsDefault: 0,
      workingSetsDefault: item.sets,
      repMin: 1,
      repMax: 15,
      restSecondsDefault: 90,
      weightJumpDefault: 5,
      createdAt: AS_OF,
    });
    for (let setIndex = 0; setIndex < item.sets; setIndex += 1) {
      sets.push({
        id: `set-${index}-${setIndex}`,
        sessionId,
        trackId,
        createdAt: at + setIndex * 60 * 1000,
        completedAt: at + setIndex * 60 * 1000,
        setType: "working",
        weight: item.trackType === "mobility" || item.trackType === "corrective" ? 0 : 100,
        reps: item.trackType === "mobility" || item.trackType === "corrective" ? undefined : 8,
        seconds: item.trackType === "mobility" || item.trackType === "corrective" ? 30 : undefined,
      });
    }
  });

  return { sessions, sets, tracks, exercises };
}

async function buildCoverage(page: Page, args: { items: ScenarioExercise[]; anchors?: any[]; constraintSignals?: string[] }) {
  await goto(page);
  const scenario = buildScenario(args.items);
  return page.evaluate(
    async ({ scenario, anchors, constraintSignals, asOf }) => {
      const { buildWeeklyVolume } = await import("/src/lib/coachExport/weeklyVolume.ts");
      const { buildAnchorIntelligence } = await import("/src/lib/coachExport/anchorIntelligence.ts");
      const { buildMovementCoverage } = await import("/src/lib/coachExport/movementCoverage.ts");
      const weeklyVolume = buildWeeklyVolume({ ...scenario, asOf, windowDays: 7 });
      const anchorIntelligence = buildAnchorIntelligence({
        anchors,
        ...scenario,
        asOf,
      });
      return {
        weeklyVolume,
        anchors: anchorIntelligence,
        coverage: buildMovementCoverage({
          ...scenario,
          weeklyVolume,
          anchorIntelligence,
          constraintSignals,
          asOf,
        }),
      };
    },
    { scenario, anchors: args.anchors ?? [], constraintSignals: args.constraintSignals ?? [], asOf: AS_OF }
  );
}

function anchor(pattern: string, exerciseName: string, daysAgo: number, e1rm = 200) {
  return {
    pattern,
    exerciseId: `anchor-${exerciseName.toLowerCase().replace(/\s+/g, "-")}`,
    exerciseName,
    trackDisplayName: exerciseName,
    effectiveWeightLb: 180,
    reps: 6,
    e1rm,
    performedAt: AS_OF - daysAgo * DAY_MS,
    ageDays: daysAgo,
    recency: daysAgo > 28 ? "stale" : daysAgo > 21 ? "historical" : "recent",
    isStale: daysAgo > 21,
  };
}

test.describe("Movement Coverage", () => {
  test("horizontal push can be strong with a same-family historical anchor", async ({ page }) => {
    const result = await buildCoverage(page, {
      items: [
        { name: "Plate Loaded Chest Press", daysAgo: 2, sets: 5 },
        { name: "Plate Loaded Chest Press", daysAgo: 5, sets: 4 },
      ],
      anchors: [anchor("push", "Barbell Bench Press", 23, 260)],
    });
    const row = result.coverage.entries.find((entry: any) => entry.family === "horizontal_push");
    expect(row.status).toBe("strong");
    expect(row.currentMovement.exerciseName).toBe("Plate Loaded Chest Press");
    expect(row.performanceAnchor.exerciseName).toBe("Barbell Bench Press");
    expect(row.relationship).toBe("same_family_different_exercise");
    expect(row.interpretation).not.toContain("replaced");
  });

  test("same-exercise vertical pull coverage is based on recent work, not anchor age alone", async ({ page }) => {
    const result = await buildCoverage(page, {
      items: [{ name: "Assisted Pull-Up", daysAgo: 1, sets: 4 }],
      anchors: [anchor("pull", "Assisted Pull-Up", 35, 185)],
    });
    const row = result.coverage.entries.find((entry: any) => entry.family === "vertical_pull");
    expect(row.relationship).toBe("same_exercise");
    expect(row.status).toBe("covered");
    expect(row.performanceAnchor.status).toBe("Stale benchmark");
    expect(row.interpretation).toContain("historical performance benchmark");
  });

  test("vertical push is missing when no recent vertical pressing exists", async ({ page }) => {
    const result = await buildCoverage(page, {
      items: [{ name: "MTS Row", daysAgo: 1, sets: 4 }],
    });
    const row = result.coverage.entries.find((entry: any) => entry.family === "vertical_push");
    expect(row.status).toBe("missing");
    expect(row.currentMovement).toBeUndefined();
    expect(row.effectiveSets7d).toBe(0);
    expect(row.interpretation).toContain("absent");
  });

  test("horizontal pull and vertical pull remain distinct", async ({ page }) => {
    const result = await buildCoverage(page, {
      items: [
        { name: "MTS Row", daysAgo: 1, sets: 4 },
        { name: "Assisted Pull-Up", daysAgo: 2, sets: 4 },
      ],
    });
    const row = result.coverage.entries.find((entry: any) => entry.family === "horizontal_pull");
    const pull = result.coverage.entries.find((entry: any) => entry.family === "vertical_pull");
    expect(row.currentMovement.exerciseName).toBe("MTS Row");
    expect(pull.currentMovement.exerciseName).toBe("Assisted Pull-Up");
    expect(row.contributingExercises.map((item: any) => item.exerciseName)).not.toContain("Assisted Pull-Up");
  });

  test("current hinge variation can cover a stale hinge anchor without replacing it", async ({ page }) => {
    const result = await buildCoverage(page, {
      items: [{ name: "Single-Leg RDL", daysAgo: 1, sets: 4 }],
      anchors: [anchor("hinge", "Trap Bar Deadlift", 60, 380)],
    });
    const row = result.coverage.entries.find((entry: any) => entry.family === "hinge");
    expect(row.status).toBe("covered");
    expect(row.currentMovement.exerciseName).toBe("Single-Leg RDL");
    expect(row.performanceAnchor.exerciseName).toBe("Trap Bar Deadlift");
    expect(row.relationship).toBe("same_family_different_exercise");
    expect(row.interpretation).not.toContain("replaced");
  });

  test("anchor-only families are not treated as currently covered", async ({ page }) => {
    const result = await buildCoverage(page, {
      items: [],
      anchors: [anchor("push", "Barbell Bench Press", 60, 260)],
    });
    const row = result.coverage.entries.find((entry: any) => entry.family === "horizontal_push");
    expect(row.status).toBe("missing");
    expect(row.relationship).toBe("anchor_only");
    expect(row.performanceAnchor.exerciseName).toBe("Barbell Bench Press");
    expect(row.interpretation).toContain("historical performance benchmark");
  });

  test("glute-extension coverage requires direct glute-extension movement", async ({ page }) => {
    const result = await buildCoverage(page, {
      items: [
        { name: "RDL", daysAgo: 1, sets: 6 },
        { name: "Leg Press", daysAgo: 2, sets: 4 },
        { name: "Glute Bridge", daysAgo: 17, sets: 3 },
      ],
    });
    const row = result.coverage.entries.find((entry: any) => entry.family === "glute_extension");
    expect(row.currentMovement.exerciseName).toBe("Glute Bridge");
    expect(row.currentMovement.ageDays).toBeGreaterThanOrEqual(16);
    expect(row.currentMovement.ageDays).toBeLessThanOrEqual(17);
    expect(row.directEffectiveSets7d).toBe(0);
    expect(row.supportEffectiveSets7d).toBeGreaterThan(0);
    expect(row.status).toBe("developing");
    expect(row.interpretation).toContain("no direct glute-extension movement was recorded in the last 7 days");
  });

  test("carry coverage requires actual loaded carry work", async ({ page }) => {
    const result = await buildCoverage(page, {
      items: [{ name: "Trap Bar Deadlift", daysAgo: 1, sets: 4 }],
    });
    const row = result.coverage.entries.find((entry: any) => entry.family === "carry");
    expect(row.currentMovement).toBeUndefined();
    expect(row.directEffectiveSets7d).toBe(0);
    expect(row.supportEffectiveSets7d).toBeGreaterThan(0);
    expect(row.status).toBe("missing");
    expect(row.interpretation).toContain("no recent loaded carry was recorded");
  });

  test("current-only carry can be developing without a calculated anchor", async ({ page }) => {
    const result = await buildCoverage(page, {
      items: [{ name: "Farmer Carry", daysAgo: 1, sets: 1 }],
    });
    const row = result.coverage.entries.find((entry: any) => entry.family === "carry");
    expect(row.relationship).toBe("current_only");
    expect(row.status).toBe("developing");
    expect(row.currentMovement.exerciseName).toBe("Farmer Carry");
  });

  test("hip stability develops from direct control work and support alone cannot make it strong", async ({ page }) => {
    const developing = await buildCoverage(page, {
      items: [
        { name: "Single-Leg RDL", daysAgo: 1, sets: 3 },
        { name: "Locked Clam", daysAgo: 1, sets: 1, trackType: "corrective" },
      ],
    });
    const developingRow = developing.coverage.entries.find((entry: any) => entry.family === "hip_stability");
    expect(developingRow.status).toBe("developing");
    expect(developingRow.contributingExercises.map((item: any) => item.exerciseName)).toContain("Locked Clam");

    const covered = await buildCoverage(page, {
      items: [
        { name: "Locked Clam", daysAgo: 1, sets: 2, trackType: "corrective" },
        { name: "Side-Lying Hip Abduction", daysAgo: 3, sets: 2, trackType: "corrective" },
      ],
    });
    const coveredRow = covered.coverage.entries.find((entry: any) => entry.family === "hip_stability");
    expect(coveredRow.status).toBe("covered");
    expect(coveredRow.interpretation).toContain("adequately covered");
    expect(coveredRow.interpretation).not.toContain("developing");
  });

  test("vertical-push missing context can reflect shoulder constraints without changing status", async ({ page }) => {
    const result = await buildCoverage(page, {
      items: [{ name: "Plate Loaded Chest Press", daysAgo: 1, sets: 4 }],
      constraintSignals: ["Shoulder sensitivity reported with overhead pressing"],
    });
    const row = result.coverage.entries.find((entry: any) => entry.family === "vertical_push");
    expect(row.status).toBe("missing");
    expect(row.context).toContain("overhead shoulder sensitivity");
    expect(row.isContextuallyAcceptable).toBe(true);
    expect(row.interpretation).toContain("absent");
  });

  test("movement coverage summary counts adequate, developing, and missing families", async ({ page }) => {
    const result = await buildCoverage(page, {
      items: [
        { name: "Plate Loaded Chest Press", daysAgo: 1, sets: 4 },
        { name: "Farmer Carry", daysAgo: 1, sets: 1 },
      ],
    });
    expect(result.coverage.coveredFamilies).toContain("Horizontal Push");
    expect(result.coverage.developingFamilies).toContain("Carry");
    expect(result.coverage.missingFamilies).toContain("Vertical Push");
    expect(result.coverage.summary).toContain(`${result.coverage.coveredFamilies.length} of 11 movement families have adequate recent coverage.`);
  });

  test("core coverage and unknown exercises are handled conservatively", async ({ page }) => {
    const result = await buildCoverage(page, {
      items: [
        { name: "Roman Chair", daysAgo: 1, sets: 2 },
        { name: "Roman Chair", daysAgo: 4, sets: 2 },
        { name: "Mystery Machine", daysAgo: 1, sets: 3 },
      ],
    });
    const core = result.coverage.entries.find((entry: any) => entry.family === "core");
    expect(core.status).toBe("covered");
    expect(core.sessionCount7d).toBe(2);
    expect(result.coverage.entries.find((entry: any) => entry.family === "unknown")).toBeUndefined();
  });

  test("state, report, and export render movement coverage without replacement language", async ({ page }) => {
    await goto(page);
    const result = await page.evaluate(async ({ asOf }) => {
      const { buildCoachStateFromExportMetrics } = await import("/src/lib/coachState/buildCoachState.ts");
      const { buildCoachReport } = await import("/src/lib/coachReport/buildCoachReport.ts");
      const { formatCoachReportText } = await import("/src/lib/coachReport/formatCoachReportText.ts");
      const movementCoverage = {
        asOf: new Date(asOf).toISOString(),
        volumeWindowDays: 7,
        recencyWindowDays: 28,
        status: "watch",
        summary: "1 movement families covered; Vertical Push missing.",
        missingFamilies: ["Vertical Push"],
        developingFamilies: [],
        coveredFamilies: ["Horizontal Push"],
        entries: [
          {
            family: "horizontal_push",
            label: "Horizontal Push",
            status: "covered",
            currentMovement: { exerciseName: "Plate Loaded Chest Press", performedAt: new Date(asOf).toISOString(), ageDays: 0 },
            performanceAnchor: { legacyCategory: "push", exerciseName: "Barbell Bench Press", ageDays: 23, status: "Historical anchor", e1rm: 260 },
            relationship: "same_family_different_exercise",
            effectiveSets7d: 6,
            controlExposures7d: 0,
            sessionCount7d: 2,
            contributingExercises: [{ exerciseName: "Plate Loaded Chest Press", effectiveSets: 6, controlExposures: 0 }],
            summary: "Horizontal Push: Covered.",
            interpretation: "Recent horizontal-push work is covered by a current movement in the same family as the historical anchor.",
          },
          {
            family: "vertical_push",
            label: "Vertical Push",
            status: "missing",
            relationship: "none",
            effectiveSets7d: 0,
            controlExposures7d: 0,
            sessionCount7d: 0,
            contributingExercises: [],
            summary: "Vertical Push: Missing.",
            interpretation: "Vertical Push is currently absent from the recent training window.",
          },
        ],
      };
      const metrics = {
        generatedAt: asOf,
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
            pattern: "push",
            exerciseName: "Barbell Bench Press",
            trackDisplayName: "Barbell Bench Press",
            effectiveWeightLb: 180,
            reps: 6,
            e1rm: 260,
            performedAt: asOf - 23 * 24 * 60 * 60 * 1000,
            ageDays: 23,
            recency: "historical",
            isStale: true,
            movementFamily: "horizontal_push",
            status: "historical_anchor",
          },
        ],
        currentMovementFocus: [{ label: "Push", exercises: ["Plate Loaded Chest Press"] }],
        movementCoverage,
        exerciseVocabulary: [],
        trainingSignals: { movementQuality: [], stimulusCoverage: [], fatigueReadiness: [], nextWorkoutFocus: [], discussWithGaz: [] },
        patternSummary: { movementQuality: [], stimulus: [], fatigue: [], constraints: [], progression: [] },
        nextWorkoutFocus: { progressionGuardrails: [], executionPriorities: [], adjustmentTriggers: [] },
        exportConfidence: { score: 0, label: "Low", components: { waistReadiness: 0, weightDataReady: 0, strengthDataReady: 0, coherenceScore: 0 } },
        readinessNotes: [],
        dataNotes: [],
      } as any;
      const coachState = buildCoachStateFromExportMetrics(metrics);
      const report = buildCoachReport({ coachState, metrics, generatedAt: asOf });
      return {
        state: coachState.movementCoverage,
        report: report.exportOnly?.movementCoverage,
        text: formatCoachReportText(report),
      };
    }, { asOf: AS_OF });

    expect(result.state.entries[0].label).toBe("Horizontal Push");
    expect(result.report.rows[0].current).toContain("Plate Loaded Chest Press");
    expect(result.text).toContain("Movement Coverage");
    expect(result.text.indexOf("Movement Coverage")).toBeGreaterThan(result.text.indexOf("Performance Anchors"));
    expect(result.text.indexOf("Movement Coverage")).toBeLessThan(result.text.indexOf("Current Movement Focus"));
    expect(result.text).toContain("Vertical Push: Missing");
    expect(result.text).not.toContain("replacement");
  });

  test("movement coverage does not mutate anchor intelligence, weekly volume, or Start dashboard layout", async ({ page }) => {
    const result = await buildCoverage(page, {
      items: [{ name: "Plate Loaded Chest Press", daysAgo: 1, sets: 4 }],
      anchors: [anchor("push", "Barbell Bench Press", 23, 260)],
    });
    const anchorRow = result.anchors[0];
    expect(anchorRow.exerciseName).toBe("Barbell Bench Press");
    expect(anchorRow.effectiveWeightLb).toBe(180);
    expect(anchorRow.reps).toBe(6);
    expect(anchorRow.e1rm).toBe(260);
    expect(anchorRow.ageDays).toBe(23);
    const chest = result.weeklyVolume.groups.find((group: any) => group.bucket === "chest_pressing");
    expect(chest.totalCredit).toBeGreaterThanOrEqual(4);

    await goto(page);
    await expect(page.locator("body")).not.toContainText("Movement Coverage");
  });
});
