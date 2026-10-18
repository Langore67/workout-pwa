import { expect, test } from "@playwright/test";
import {
  buildStrengthGoalProgressContexts,
  type StrengthGoalProgressContext,
} from "../src/domain/goals/strengthGoalProgress";
import {
  STRENGTH_GOALS_META_KEY,
  type StrengthGoal,
} from "../src/domain/goals/strengthGoals";
import { buildCoachProgrammingContext } from "../src/lib/coachExport/programmingContext";
import { buildCoachStateFromExportMetrics } from "../src/lib/coachState/buildCoachState";
import { formatStrengthGoalProgressForCoach } from "../src/lib/coachReport/formatCoachReportText";
import { resetDexieDb } from "./helpers/dbSeed";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 18, 12);

function exercise(id: string, name: string, extra = {}) {
  return { id, name, normalizedName: name.toLowerCase(), metricMode: "reps", equipmentTags: [], createdAt: NOW, ...extra } as any;
}

function track(id: string, exerciseId: string, trackingMode = "weightedReps") {
  return { id, exerciseId, displayName: id, trackingMode, trackType: "strength", warmupSetsDefault: 0, workingSetsDefault: 1, repMin: 1, repMax: 20, restSecondsDefault: 60, weightJumpDefault: 5, createdAt: NOW } as any;
}

function session(id: string, daysAgo: number) {
  return { id, startedAt: NOW - daysAgo * DAY - 1000, endedAt: NOW - daysAgo * DAY } as any;
}

function working(id: string, sessionId: string, trackId: string, values: Record<string, unknown>) {
  return { id, sessionId, trackId, setType: "working", createdAt: NOW, completedAt: NOW, ...values } as any;
}

function goal(id: string, exerciseId: string, targetMetric: "load" | "reps", targetValue: number, extra = {}): StrengthGoal {
  return { id, type: "strength", exerciseId, targetMetric, targetValue, targetUnit: targetMetric === "load" ? "lb" : "reps", active: true, createdAt: NOW, updatedAt: NOW, ...extra };
}

function build(overrides: Record<string, unknown> = {}) {
  return buildStrengthGoalProgressContexts({
    goals: [goal("bench-goal", "bench", "load", 200)],
    exercises: [exercise("bench", "Barbell Bench Press"), exercise("db-bench", "Dumbbell Bench Press")],
    tracks: [track("bench-track", "bench"), track("db-track", "db-bench")],
    sessions: [session("latest", 1), session("prior", 8), session("old-best", 60)],
    sets: [
      working("latest", "latest", "bench-track", { weight: 145, reps: 8, rir: 1 }),
      working("latest-heavy", "latest", "bench-track", { weight: 150, reps: 1, rir: 2 }),
      working("prior", "prior", "bench-track", { weight: 140, reps: 8, rir: 1.5 }),
      working("old", "old-best", "bench-track", { weight: 155, reps: 3, rir: 1 }),
      working("different", "latest", "db-track", { weight: 200, reps: 10 }),
    ],
    asOf: NOW,
    ...overrides,
  } as any);
}

test("load goals keep performed load separate from supporting scored e1RM and preserve current versus best", () => {
  const context = build()[0];
  expect(context).toMatchObject({
    exerciseId: "bench",
    targetMetric: "load",
    targetValue: 200,
    currentValue: 150,
    bestValue: 155,
    absoluteDistance: 50,
    percentOfGoal: 75,
    direction: "higher",
    freshness: "fresh",
    comparability: "direct",
  });
  expect(context.supportingScoredE1RM).toBeCloseTo(183.67, 1);
  expect(context.currentComparableObservation).toMatchObject({ load: 145, reps: 8, maxLoad: 150 });
  expect(context.currentValue).not.toBe(context.supportingScoredE1RM);
});

test("canonical merge history counts while different variants do not satisfy the goal", () => {
  const exercises = [
    exercise("bench", "Barbell Bench Press"),
    exercise("old-bench", "Bench Press Old", { mergedIntoExerciseId: "bench", archivedAt: NOW - DAY }),
    exercise("smith", "Smith Machine Bench Press"),
  ];
  const contexts = build({
    goals: [goal("merged-goal", "old-bench", "load", 200)],
    exercises,
    tracks: [track("bench-track", "bench"), track("old-track", "old-bench"), track("smith-track", "smith")],
    sessions: [session("latest", 1), session("prior", 8)],
    sets: [
      working("alias", "latest", "old-track", { weight: 145, reps: 5 }),
      working("canonical", "prior", "bench-track", { weight: 140, reps: 5 }),
      working("smith", "latest", "smith-track", { weight: 225, reps: 5 }),
    ],
  });
  expect(contexts[0]).toMatchObject({ exerciseId: "bench", currentValue: 145, bestValue: 145 });
});

test("bodyweight rep goals exclude assisted identity and loaded observations", () => {
  const exercises = [
    exercise("pull-up", "Pull-Up", { equipment: "Bodyweight" }),
    exercise("assisted", "Assisted Pull-Up", { equipment: "Machine" }),
  ];
  const context = build({
    goals: [goal("pull-goal", "pull-up", "reps", 10)],
    exercises,
    tracks: [track("pull-track", "pull-up", "repsOnly"), track("assisted-track", "assisted")],
    sessions: [session("latest", 1), session("prior", 8), session("older", 40)],
    sets: [
      working("pull-latest", "latest", "pull-track", { weight: 0, reps: 4 }),
      working("pull-prior", "prior", "pull-track", { weight: 0, reps: 4 }),
      working("pull-old", "older", "pull-track", { weight: 0, reps: 6 }),
      working("assisted", "latest", "assisted-track", { weight: -50, reps: 12 }),
    ],
  })[0];
  expect(context).toMatchObject({ currentValue: 4, bestValue: 6, absoluteDistance: 6, direction: "similar" });
  expect(context.supportingScoredE1RM).toBeUndefined();
});

test("missing and stale evidence remain factual, and inactive goals are excluded", () => {
  const none = build({ goals: [goal("none", "bench", "load", 200)], sessions: [], sets: [] });
  expect(none[0]).toMatchObject({ observationCount: 0, direction: "insufficient_context", freshness: "unknown", comparability: "unavailable" });
  expect(none[0].currentValue).toBeUndefined();

  const stale = build({
    sessions: [session("stale", 40)],
    sets: [working("stale", "stale", "bench-track", { weight: 135, reps: 5 })],
  })[0];
  expect(stale).toMatchObject({ currentValue: 135, observationCount: 0, direction: "insufficient_context", freshness: "stale", comparability: "direct" });

  const aging = build({
    sessions: [session("aging", 24)],
    sets: [working("aging", "aging", "bench-track", { weight: 140, reps: 5 })],
  })[0];
  expect(aging.freshness).toBe("aging");

  expect(build({ goals: [goal("inactive", "bench", "load", 200, { active: false })] })).toEqual([]);
});

test("goal progress is read-only and Coach layers reuse the same object", () => {
  const goals = [goal("bench-goal", "bench", "load", 200)];
  const source = {
    goals,
    exercises: [exercise("bench", "Barbell Bench Press")],
    tracks: [track("bench-track", "bench")],
    sessions: [session("latest", 1)],
    sets: [working("latest", "latest", "bench-track", { weight: 145, reps: 8 })],
    asOf: NOW,
  };
  const before = JSON.stringify(source);
  const progress = buildStrengthGoalProgressContexts(source);
  expect(JSON.stringify(source)).toBe(before);

  const metrics = { anchorLifts: [], strengthSignal: {}, readinessNotes: [], strengthGoalProgress: progress } as any;
  const programming = buildCoachProgrammingContext({ metrics, sessions: [], sets: [], tracks: [], exercises: [], asOf: NOW });
  expect(programming.strengthGoalProgress).toBe(progress);
  const state = buildCoachStateFromExportMetrics({ ...metrics, generatedAt: NOW, bodyComp: {} } as any);
  expect(state.strengthGoalProgress).toBe(progress);
  const text = formatStrengthGoalProgressForCoach(progress).join("\n");
  expect(text).toContain("Goal: 200 lb performed load");
  expect(text).toContain("Current performed load: 145 lb");
  expect(text).toContain("Distance to goal: 55 lb");
  expect(text).not.toMatch(/next weight|deload|plateau|increase load/i);
});

test("strength goals persist only when explicitly stored and have no hard-coded defaults", async ({ page }) => {
  await page.goto("/");
  await resetDexieDb(page);
  expect(await page.evaluate(async () => (await import("/src/domain/goals/strengthGoals.ts")).getStrengthGoals())).toEqual([]);

  const stored = await page.evaluate(async ({ now }) => {
    const module = await import("/src/domain/goals/strengthGoals.ts");
    await module.setStrengthGoals([{ id: "g", type: "strength", exerciseId: "bench", targetMetric: "load", targetValue: 200, targetUnit: "lb", active: true, createdAt: now, updatedAt: now }]);
    // @ts-ignore
    const row = await window.__db.app_meta.get(module.STRENGTH_GOALS_META_KEY);
    return { goals: await module.getStrengthGoals(), key: row?.key };
  }, { now: NOW });
  expect(stored.key).toBe(STRENGTH_GOALS_META_KEY);
  expect(stored.goals).toEqual([goal("g", "bench", "load", 200)]);
});
