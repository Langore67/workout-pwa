import { expect, test } from "@playwright/test";
import { resetDexieDb } from "./helpers/dbSeed";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173/";
const AS_OF = Date.UTC(2026, 10, 25, 12);
const DAY = 24 * 60 * 60 * 1000;

async function open(page: import("@playwright/test").Page) {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
}

test.describe("Strength comparability evidence foundation", () => {
  test("November 25 synthetic scenario keeps aggregate decline separate from exercise evidence", async ({ page }) => {
    await open(page);
    const result = await page.evaluate(async ({ asOf, day }) => {
      const { buildStrengthComparabilityEvidence } = await import("/src/strength/strengthComparabilityEvidence.ts");
      const pattern = (name: "hinge" | "push", exerciseIds: string[], count: number, score: number) => ({
        pattern: name, exerciseIds, topSet: score, working: score, exposure: Math.min(1, count / 6),
        absolute: score, relative: score / 200, normalized: score / Math.pow(200, 0.67),
        hardSets: count, completedWorkingSets: count,
      });
      const row = (weekEndMs: number, normalizedIndex: number, bodyweight: number, patterns: any[]) => ({
        weekEndMs, label: "synthetic", bodyweight, bodyweightDaysUsed: 5,
        absoluteIndex: normalizedIndex, relativeIndex: normalizedIndex / bodyweight,
        normalizedIndex, windowStartAt: weekEndMs - 28 * day, windowDays: 28, patterns,
      });
      const exercises = [
        { id: "trap", name: "Trap Bar Deadlift", normalizedName: "trap bar deadlift", movementPattern: "hinge", equipmentTags: [], createdAt: asOf },
        { id: "rdl", name: "Romanian Deadlift", normalizedName: "romanian deadlift", movementPattern: "hinge", equipmentTags: [], createdAt: asOf },
        { id: "bench", name: "Barbell Bench Press", normalizedName: "barbell bench press", movementPattern: "push", equipmentTags: [], createdAt: asOf },
        { id: "incline", name: "Incline Barbell Bench Press", normalizedName: "incline barbell bench press", movementPattern: "push", equipmentTags: [], createdAt: asOf },
      ] as any[];
      const tracks = exercises.map((exercise) => ({
        id: "track-" + exercise.id, exerciseId: exercise.id, displayName: exercise.name,
        trackType: "strength", trackingMode: "weightedReps", createdAt: asOf,
      })) as any[];
      const sessions: any[] = [];
      const sets: any[] = [];
      const addObservation = (exerciseId: string, sessionKey: string, ageDays: number, load: number) => {
        const at = asOf - ageDays * day;
        const sessionId = sessionKey + "-session";
        sessions.push({ id: sessionId, startedAt: at - 60_000, endedAt: at });
        sets.push({ id: sessionKey + "-set", sessionId, trackId: "track-" + exerciseId, completedAt: at, setType: "working", weight: load, reps: 8 });
      };
      addObservation("trap", "trap-old", 40, 245);
      addObservation("rdl", "rdl-old", 10, 150);
      addObservation("rdl", "rdl-new", 2, 135);
      addObservation("bench", "bench-old", 9, 185);
      addObservation("bench", "bench-new", 1, 185);
      addObservation("incline", "incline-old", 9, 135);
      addObservation("incline", "incline-new", 1, 145);
      const anchors: any[] = [{
        pattern: "hinge", exerciseId: "trap", exerciseName: "Trap Bar Deadlift",
        benchmarkStatus: "historical", movementStatus: "inactive",
        relationship: "same_family_different_exercise",
        latestFamilyMovement: { exerciseName: "Romanian Deadlift", movementFamily: "hinge" },
        interpretation: "The historical Trap Bar benchmark is inactive; current hinge work uses Romanian Deadlift. This is not direct evidence of Trap Bar regression.",
      }];
      const evidence = buildStrengthComparabilityEvidence({
        trend: [
          row(asOf - 21 * day, 9.83, 200, [pattern("hinge", ["trap"], 6, 245), pattern("push", ["bench"], 4, 185)]),
          row(asOf - 14 * day, 8.4, 198, [pattern("hinge", ["trap"], 3, 245), pattern("push", ["bench"], 4, 185)]),
          row(asOf - 7 * day, 7.2, 197, [pattern("hinge", ["rdl"], 4, 150), pattern("push", ["bench", "incline"], 5, 145)]),
          row(asOf, 6.41, 195, [pattern("hinge", ["rdl"], 5, 135), pattern("push", ["bench", "incline"], 6, 145)]),
        ] as any,
        exercises, tracks, sessions, sets, anchors, asOf,
      });
      return evidence;
    }, { asOf: AS_OF, day: DAY });

    expect(result.aggregate.normalizedDelta).toBeCloseTo(-3.42);
    expect(result.aggregate.baseline.patterns.find((item: any) => item.pattern === "hinge").contributingExerciseIds).toEqual(["trap"]);
    expect(result.populationChange.exercisesEntering).toContain("rdl");
    expect(result.populationChange.exercisesLeaving).toContain("trap");
    expect(result.populationChange.bodyweightDeltaLb).toBe(-5);
    expect(result.exerciseEvidence.find((item: any) => item.canonicalExerciseId === "trap").status).toBe("stale");
    expect(result.exerciseEvidence.find((item: any) => item.canonicalExerciseId === "rdl").direction).toBe("lower");
    expect(result.exerciseEvidence.find((item: any) => item.canonicalExerciseId === "bench").direction).toBe("similar");
    expect(result.exerciseEvidence.find((item: any) => item.canonicalExerciseId === "incline").direction).toBe("higher");
    expect(result.anchorRelationships[0].relationship).toBe("same_family_different_exercise");
    expect(result.limitations.join(" ")).toContain("documents a comparability limitation, not a cause");
  });

  test("captures exposure change without changing same-exercise comparison and respects intent filtering", async ({ page }) => {
    await open(page);
    const result = await page.evaluate(async ({ asOf, day }) => {
      const { buildStrengthComparabilityEvidence } = await import("/src/strength/strengthComparabilityEvidence.ts");
      const exercise = { id: "bench", name: "Barbell Bench Press", normalizedName: "barbell bench press", movementPattern: "push", equipmentTags: [], createdAt: asOf };
      const track = { id: "bench-track", exerciseId: "bench", displayName: exercise.name, trackType: "strength", trackingMode: "weightedReps", createdAt: asOf };
      const at1 = asOf - 5 * day;
      const at2 = asOf - day;
      const sessions = [{ id: "s1", endedAt: at1 }, { id: "s2", endedAt: at2 }];
      const sets = [
        { id: "b1", sessionId: "s1", trackId: track.id, completedAt: at1, setType: "working", weight: 185, reps: 8 },
        { id: "b2", sessionId: "s2", trackId: track.id, completedAt: at2, setType: "working", weight: 185, reps: 8 },
        { id: "probe", sessionId: "s2", trackId: track.id, completedAt: at2, setType: "working", notes: "technique", weight: 300, reps: 8 },
      ];
      const pattern = (count: number) => ({
        pattern: "push", exerciseIds: ["bench"], topSet: 190, working: 180, exposure: count / 6,
        absolute: 180, relative: 0.9, normalized: 5.4, hardSets: count, completedWorkingSets: count,
      });
      return buildStrengthComparabilityEvidence({
        trend: [
          { weekEndMs: asOf - 7 * day, label: "old", bodyweight: 200, bodyweightDaysUsed: 5, absoluteIndex: 5.4, relativeIndex: 0.9, normalizedIndex: 5.4, windowStartAt: asOf - 35 * day, windowDays: 28, patterns: [pattern(1)] },
          { weekEndMs: asOf, label: "new", bodyweight: 200, bodyweightDaysUsed: 5, absoluteIndex: 5.4, relativeIndex: 0.9, normalizedIndex: 5.4, windowStartAt: asOf - 28 * day, windowDays: 28, patterns: [pattern(4)] },
        ] as any,
        exercises: [exercise] as any, tracks: [track] as any, sessions: sessions as any, sets: sets as any, asOf,
      });
    }, { asOf: AS_OF, day: DAY });

    expect(result.populationChange.patternChanges.find((item: any) => item.pattern === "push")).toMatchObject({
      baselineQualifyingWorkingSets: 1, recentQualifyingWorkingSets: 4,
      baselineExposure: 1 / 6, recentExposure: 4 / 6,
    });
    expect(result.exerciseEvidence[0].direction).toBe("similar");
    expect(result.exerciseEvidence[0].observationCount).toBe(2);
  });

  test("distinguishes insufficient recent, stale, and missing exercise evidence", async ({ page }) => {
    await open(page);
    const result = await page.evaluate(async ({ asOf, day }) => {
      const { buildStrengthComparabilityEvidence } = await import("/src/strength/strengthComparabilityEvidence.ts");
      const names = ["One Observation", "Old Observation", "No Observation"];
      const exercises = names.map((name, index) => ({ id: "ex-" + index, name, normalizedName: name.toLowerCase(), equipmentTags: [], createdAt: asOf }));
      const tracks = exercises.map((exercise, index) => ({ id: "t-" + index, exerciseId: exercise.id, displayName: exercise.name, trackType: "strength", trackingMode: "weightedReps", createdAt: asOf }));
      const sessions = [{ id: "one", endedAt: asOf - day }, { id: "old", endedAt: asOf - 45 * day }];
      const sets = [
        { id: "one-set", sessionId: "one", trackId: "t-0", completedAt: asOf - day, setType: "working", weight: 100, reps: 8 },
        { id: "old-set", sessionId: "old", trackId: "t-1", completedAt: asOf - 45 * day, setType: "working", weight: 100, reps: 8 },
      ];
      const pattern = { pattern: "push", exerciseIds: ["ex-0", "ex-1", "ex-2"], topSet: 1, working: 1, exposure: 1, absolute: 1, relative: 1, normalized: 1, hardSets: 1, completedWorkingSets: 1 };
      return buildStrengthComparabilityEvidence({
        trend: [
          { weekEndMs: asOf - day, label: "a", bodyweight: 200, bodyweightDaysUsed: 5, absoluteIndex: 1, relativeIndex: 1, normalizedIndex: 1, windowStartAt: asOf - 29 * day, windowDays: 28, patterns: [pattern] },
          { weekEndMs: asOf, label: "b", bodyweight: 200, bodyweightDaysUsed: 5, absoluteIndex: 1, relativeIndex: 1, normalizedIndex: 1, windowStartAt: asOf - 28 * day, windowDays: 28, patterns: [pattern] },
        ] as any,
        exercises: exercises as any, tracks: tracks as any, sessions: sessions as any, sets: sets as any, asOf,
      }).exerciseEvidence;
    }, { asOf: AS_OF, day: DAY });

    expect(result.find((item: any) => item.canonicalExerciseId === "ex-0").status).toBe("insufficient");
    expect(result.find((item: any) => item.canonicalExerciseId === "ex-1").status).toBe("stale");
    expect(result.find((item: any) => item.canonicalExerciseId === "ex-2").status).toBe("missing");
  });

  test("uses canonical merged exercise identity for direct comparisons", async ({ page }) => {
    await open(page);
    const result = await page.evaluate(async ({ asOf, day }) => {
      const { buildStrengthComparabilityEvidence } = await import("/src/strength/strengthComparabilityEvidence.ts");
      const exercises = [
        { id: "canonical", name: "Barbell Bench Press", normalizedName: "barbell bench press", movementPattern: "push", equipmentTags: [], createdAt: asOf },
        { id: "legacy", name: "Bench Press Old", normalizedName: "bench press old", mergedIntoExerciseId: "canonical", equipmentTags: [], createdAt: asOf - 10 * day },
      ];
      const tracks = [
        { id: "old-track", exerciseId: "legacy", displayName: "Bench Press Old", trackType: "strength", trackingMode: "weightedReps", createdAt: asOf },
        { id: "new-track", exerciseId: "canonical", displayName: "Barbell Bench Press", trackType: "strength", trackingMode: "weightedReps", createdAt: asOf },
      ];
      const sessions = [{ id: "old-session", endedAt: asOf - 5 * day }, { id: "new-session", endedAt: asOf - day }];
      const sets = [
        { id: "old-set", sessionId: "old-session", trackId: "old-track", completedAt: asOf - 5 * day, setType: "working", weight: 185, reps: 8 },
        { id: "new-set", sessionId: "new-session", trackId: "new-track", completedAt: asOf - day, setType: "working", weight: 185, reps: 8 },
      ];
      const pattern = { pattern: "push", exerciseIds: ["canonical"], topSet: 190, working: 190, exposure: 1, absolute: 190, relative: 0.95, normalized: 5, hardSets: 2, completedWorkingSets: 2 };
      const evidence = buildStrengthComparabilityEvidence({
        trend: [
          { weekEndMs: asOf - 7 * day, label: "old", bodyweight: 200, bodyweightDaysUsed: 5, absoluteIndex: 5, relativeIndex: 0.95, normalizedIndex: 5, windowStartAt: asOf - 35 * day, windowDays: 28, patterns: [pattern] },
          { weekEndMs: asOf, label: "new", bodyweight: 200, bodyweightDaysUsed: 5, absoluteIndex: 5, relativeIndex: 0.95, normalizedIndex: 5, windowStartAt: asOf - 28 * day, windowDays: 28, patterns: [pattern] },
        ] as any,
        exercises: exercises as any, tracks: tracks as any, sessions: sessions as any, sets: sets as any, asOf,
      });
      return evidence.exerciseEvidence;
    }, { asOf: AS_OF, day: DAY });

    expect(result).toHaveLength(1);
    expect(result[0].canonicalExerciseId).toBe("canonical");
    expect(result[0].canonicalExerciseName).toBe("Barbell Bench Press");
    expect(result[0].direction).toBe("similar");
    expect(result[0].observationCount).toBe(2);
  });

  test("does not mutate aggregate values while producing evidence", async ({ page }) => {
    await open(page);
    await resetDexieDb(page);
    const result = await page.evaluate(async () => {
      const { db } = await import("/src/db.ts");
      const { computeStrengthIndexAt, computeStrengthTrend } = await import("/src/strength/Strength.ts");
      const { buildStrengthComparabilityEvidence } = await import("/src/strength/strengthComparabilityEvidence.ts");
      const { buildCoachIntelligence } = await import("/src/lib/coachExport/coachIntelligence.ts");
      const now = Date.now();
      const sessionId = "snapshot-session";
      await db.exercises.add({ id: "snapshot-bench", name: "Barbell Bench Press", normalizedName: "barbell bench press", movementPattern: "push", strengthSignalRole: "included", equipmentTags: [], createdAt: now });
      await db.tracks.add({ id: "snapshot-track", exerciseId: "snapshot-bench", displayName: "Barbell Bench Press", trackType: "strength", trackingMode: "weightedReps", createdAt: now });
      await db.sessions.add({ id: sessionId, startedAt: now - 60_000, endedAt: now - 30_000, notes: "Ambiguous note: perhaps the setup changed." });
      await db.sets.add({ id: "snapshot-set", sessionId, trackId: "snapshot-track", completedAt: now - 30_000, setType: "working", weight: 100, reps: 8 });
      const before = await computeStrengthIndexAt(now, 28);
      const trend = await computeStrengthTrend(2, 28);
      const evidence = buildStrengthComparabilityEvidence({
        trend,
        exercises: await db.exercises.toArray(), tracks: await db.tracks.toArray(),
        sessions: await db.sessions.toArray(), sets: await db.sets.toArray(), asOf: now,
      });
      const after = await computeStrengthIndexAt(now, 28);
      const metrics: any = {
        bodyComp: {
          weight: { latest: 195, baseline14d: 198, delta14d: -3 },
          waist: { latest: 35, baseline14d: 35.6, delta14d: -0.6 },
          bodyFatPct: { latest: 16, baseline14d: 16.7, delta14d: -0.7 },
          leanMass: { latest: 152, baseline14d: 154, delta14d: -2 },
        },
        strengthSignal: { current: before.normalizedIndex, delta14d: -3.42, vs90dBestPct: -37.3 },
        hydration: { confidenceLabel: "High", distortionLikely: false },
        bodyConfidence: { overall: "high", hydration: "high", leanMass: "high", bodyFat: "high", cautionFlags: [] },
        leanPreservation: { status: "Poor", confidence: "High", evidence: { positive: [], negative: ["Strength declining"] } },
        trainingSignals: { movementQuality: [], stimulusCoverage: [], fatigueReadiness: [], nextWorkoutFocus: [], discussWithGaz: [] },
        patternSummary: { movementQuality: [], stimulus: [], fatigue: [], constraints: [], progression: [] },
        phaseQuality: { drivers: ["Strength Preservation: Significant Drop"] },
      };
      const classificationsBefore = buildCoachIntelligence(metrics);
      metrics.strengthComparabilityEvidence = evidence;
      metrics.recentSessionNoteEvidence = [{ rawText: "Maybe this felt harder because of setup." }];
      const classificationsAfter = buildCoachIntelligence(metrics);
      return {
        before: before.normalizedIndex,
        after: after.normalizedIndex,
        evidenceValue: evidence.aggregate?.recent.normalizedIndex,
        classificationsBefore,
        classificationsAfter,
      };
    });

    expect(result.after).toBe(result.before);
    expect(result.evidenceValue).toBe(result.before);
    expect(result.classificationsAfter).toEqual(result.classificationsBefore);
  });
});
