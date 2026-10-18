import { expect, test } from "@playwright/test";
import {
  buildExerciseProgressionContext,
  EXERCISE_PROGRESSION_LOOKBACK_DAYS,
  MAX_EXERCISE_PROGRESSION_OBSERVATIONS,
} from "../src/domain/progression/exerciseProgressionContext";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 18, 12);

function exercise(id: string, name: string, metricMode: "reps" | "time" | "distance" = "reps", extra = {}) {
  return { id, name, normalizedName: name.toLowerCase(), metricMode, equipmentTags: [], createdAt: NOW, ...extra } as any;
}

function track(id: string, exerciseId: string, trackingMode = "weightedReps") {
  return { id, exerciseId, displayName: id, trackingMode, trackType: "strength", warmupSetsDefault: 0, workingSetsDefault: 1, repMin: 1, repMax: 20, restSecondsDefault: 60, weightJumpDefault: 5, createdAt: NOW } as any;
}

function session(id: string, daysAgo: number, extra = {}) {
  return { id, startedAt: NOW - daysAgo * DAY - 3600, endedAt: NOW - daysAgo * DAY, ...extra } as any;
}

function set(id: string, sessionId: string, trackId: string, values: Record<string, unknown>, setType = "working") {
  return { id, sessionId, trackId, setType, createdAt: NOW, completedAt: NOW, ...values } as any;
}

function build(overrides: Record<string, unknown> = {}) {
  return buildExerciseProgressionContext({
    exerciseId: "bench",
    exercises: [exercise("bench", "Barbell Bench Press")],
    tracks: [track("bench-track", "bench")],
    sessions: [session("latest", 1), session("prior", 8)],
    sets: [
      set("latest-set", "latest", "bench-track", { weight: 110, reps: 6, rir: 2 }),
      set("prior-set", "prior", "bench-track", { weight: 100, reps: 6, rir: 3 }),
    ],
    asOf: NOW,
    ...overrides,
  } as any);
}

test("same canonical exercise and merged aliases compare while different exercises do not", () => {
  const source = {
    exercises: [
      exercise("bench", "Barbell Bench Press"),
      exercise("old-bench", "Bench Press", "reps", { mergedIntoExerciseId: "bench", archivedAt: NOW - DAY }),
      exercise("db-bench", "Dumbbell Bench Press"),
    ],
    tracks: [track("bench-track", "bench"), track("old-track", "old-bench"), track("db-track", "db-bench")],
    sessions: [session("latest", 1), session("prior", 8), session("other", 2)],
    sets: [
      set("latest-set", "latest", "old-track", { weight: 110, reps: 6 }),
      set("prior-set", "prior", "bench-track", { weight: 100, reps: 6 }),
      set("other-set", "other", "db-track", { weight: 200, reps: 10 }),
    ],
  };
  const context = build({ exerciseId: "old-bench", ...source })!;

  expect(context.exerciseId).toBe("bench");
  expect(context.exerciseName).toBe("Barbell Bench Press");
  expect(context.recentObservations.map((row) => row.sessionId)).toEqual(["latest", "prior"]);
  expect(context.direction).toBe("higher");
});

test("only completed sessions and exact working setType drive observations", () => {
  const context = build({
    sessions: [session("latest", 1), session("prior", 8), session("open", 0, { endedAt: undefined })],
    sets: [
      set("warmup", "latest", "bench-track", { weight: 300, reps: 10 }, "warmup"),
      set("drop", "latest", "bench-track", { weight: 250, reps: 10 }, "drop"),
      set("working", "latest", "bench-track", { weight: 100, reps: 5, rir: 1 }),
      set("prior", "prior", "bench-track", { weight: 100, reps: 5 }),
      set("open", "open", "bench-track", { weight: 400, reps: 5 }),
    ],
  })!;

  expect(context.observationCount).toBe(2);
  expect(context.recentObservations[0].load).toBe(100);
  expect(context.recentObservations[0].rir).toBe(1);
  expect(context.recentObservations[0].bestWorkingSet?.rir).toBe(1);
});

test("e1RM directions use the three-percent similar tolerance", () => {
  expect(build()!.direction).toBe("higher");
  expect(build({ sets: [set("a", "latest", "bench-track", { weight: 90, reps: 6 }), set("b", "prior", "bench-track", { weight: 100, reps: 6 })] })!.direction).toBe("lower");
  expect(build({ sets: [set("a", "latest", "bench-track", { weight: 102, reps: 6 }), set("b", "prior", "bench-track", { weight: 100, reps: 6 })] })!.direction).toBe("similar");
  expect(build({ sessions: [session("latest", 1)], sets: [set("a", "latest", "bench-track", { weight: 100, reps: 6 })] })!.direction).toBe("insufficient_context");
});

test("reps-only observations compare max reps without forcing e1RM", () => {
  const context = build({
    exercises: [exercise("bench", "Push Up")],
    tracks: [track("bench-track", "bench", "repsOnly")],
    sets: [set("a", "latest", "bench-track", { reps: 15 }), set("b", "prior", "bench-track", { reps: 12 })],
  })!;
  expect(context.metricMode).toBe("reps");
  expect(context.recentObservations[0]).toMatchObject({ maxReps: 15 });
  expect(context.recentObservations[0].e1RM).toBeUndefined();
  expect(context.direction).toBe("higher");
});

test("time and distance modes use only their direct compatible metrics", () => {
  const timed = build({
    exercises: [exercise("bench", "Plank", "time")],
    tracks: [track("bench-track", "bench", "timeSeconds")],
    sets: [set("a", "latest", "bench-track", { seconds: 70, weight: 500, reps: 10 }), set("b", "prior", "bench-track", { seconds: 60 })],
  })!;
  expect(timed.direction).toBe("higher");
  expect(timed.recentObservations[0]).toMatchObject({ time: 70 });
  expect(timed.recentObservations[0].e1RM).toBeUndefined();

  const distance = build({
    exercises: [exercise("bench", "Carry", "distance")],
    sets: [set("a", "latest", "bench-track", { distance: 80, distanceUnit: "m" }), set("b", "prior", "bench-track", { distance: 100, distanceUnit: "m" })],
  })!;
  expect(distance.direction).toBe("lower");
  expect(distance.recentObservations[0]).toMatchObject({ distance: 80, distanceUnit: "m" });

  const incompatibleUnits = build({
    exercises: [exercise("bench", "Carry", "distance")],
    sets: [set("a", "latest", "bench-track", { distance: 80, distanceUnit: "m" }), set("b", "prior", "bench-track", { distance: 100, distanceUnit: "steps" })],
  })!;
  expect(incompatibleUnits.direction).toBe("insufficient_context");
});

test("lookback and display count are bounded and source inputs are not mutated", () => {
  const sessions = Array.from({ length: 7 }, (_, index) => session(`s${index}`, index + 1));
  sessions.push(session("old", EXERCISE_PROGRESSION_LOOKBACK_DAYS + 1));
  const sets = sessions.map((row, index) => set(`set-${row.id}`, row.id, "bench-track", { weight: 100 + index, reps: 5 }));
  const beforeSessions = JSON.stringify(sessions);
  const beforeSets = JSON.stringify(sets);
  const context = build({ sessions, sets })!;

  expect(context.observationCount).toBe(7);
  expect(context.recentObservations).toHaveLength(MAX_EXERCISE_PROGRESSION_OBSERVATIONS);
  expect(JSON.stringify(sessions)).toBe(beforeSessions);
  expect(JSON.stringify(sets)).toBe(beforeSets);
});
