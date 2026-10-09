import { expect, test } from "@playwright/test";
import {
  buildCardioStrengthInterferenceContext,
  CARDIO_STRENGTH_PAIRING_WINDOW_HOURS,
  MAX_INTERFERENCE_OBSERVATIONS,
} from "../src/lib/coachExport/cardioStrengthInterferenceContext";

const HOUR = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 9, 12);

const exercises = [
  { id: "bench", name: "Bench Press", normalizedName: "bench press", movementPattern: "push", equipmentTags: [], createdAt: 1 },
  { id: "row", name: "Cable Row", normalizedName: "cable row", movementPattern: "pull", equipmentTags: [], createdAt: 1 },
  { id: "deadlift", name: "Trap Bar Deadlift", normalizedName: "trap bar deadlift", movementPattern: "hinge", equipmentTags: [], createdAt: 1 },
  { id: "squat", name: "Goblet Squat", normalizedName: "goblet squat", movementPattern: "squat", equipmentTags: [], createdAt: 1 },
] as any;
const tracks = exercises.map((exercise: any) => ({ id: `${exercise.id}-track`, exerciseId: exercise.id, displayName: exercise.name, trackType: "strength" })) as any;

function cardio(id: string, hoursBeforeNow: number, overrides: Record<string, unknown> = {}) {
  const startedAt = NOW - hoursBeforeNow * HOUR;
  return {
    sessionId: id,
    startedAt,
    endedAt: startedAt + HOUR,
    date: new Date(startedAt).toISOString().slice(0, 10),
    name: "PRP Walk",
    activityType: "walk",
    conditioningIntent: "fitness",
    cardioFormat: "continuous",
    durationSeconds: 3600,
    distanceMeters: 5600,
    avgHr: 112,
    confidence: "high",
    ...overrides,
  } as any;
}

function strengthSession(id: string, hoursBeforeNow: number, exerciseIds: string[], weight: number) {
  const endedAt = NOW - hoursBeforeNow * HOUR;
  return {
    session: { id, startedAt: endedAt - HOUR, endedAt },
    sets: exerciseIds.map((exerciseId, index) => ({
      id: `${id}-${exerciseId}`,
      sessionId: id,
      trackId: `${exerciseId}-track`,
      setType: "working",
      weight,
      reps: 5,
      completedAt: endedAt - index * 1000,
      createdAt: endedAt - index * 1000,
    })),
  };
}

function build(strengthRows: ReturnType<typeof strengthSession>[], cardioEvents: any[]) {
  return buildCardioStrengthInterferenceContext({
    sessions: strengthRows.map((row) => row.session) as any,
    sets: strengthRows.flatMap((row) => row.sets) as any,
    tracks,
    exercises,
    cardioEvents,
    asOf: NOW,
    bodyweightLb: 200,
  });
}

test("pairs only the closest preceding dedicated cardio within 24 hours", () => {
  const result = build(
    [strengthSession("strength", 1, ["deadlift"], 300)],
    [cardio("older-close", 20), cardio("closest", 10), cardio("too-old", 32)]
  );
  expect(CARDIO_STRENGTH_PAIRING_WINDOW_HOURS).toBe(24);
  expect(result.observations).toHaveLength(1);
  expect(result.observations[0].cardio.sessionId).toBe("closest");
  expect(result.observations[0].gapHours).toBe(7);
  expect(result.observations[0].cardio).toMatchObject({ durationMinutes: 60, activityType: "walk", intent: "fitness", cardioFormat: "continuous", avgHr: 112 });
});

test("does not pair cardio outside the window or with an unusable timestamp", () => {
  expect(build([strengthSession("strength", 1, ["deadlift"], 300)], [cardio("old", 32)]).observations).toHaveLength(0);
  expect(build([strengthSession("strength", 1, ["deadlift"], 300)], [{ ...cardio("bad", 2), startedAt: Number.NaN, endedAt: undefined }]).observations).toHaveLength(0);
});

test("classifies upper, lower, and mixed sessions from movement structure rather than names", () => {
  const rows = [
    strengthSession("Legs by name but upper work", 1, ["bench", "row"], 100),
    strengthSession("Upper by name but lower work", 5, ["deadlift", "squat"], 100),
    strengthSession("Anything", 9, ["bench", "deadlift"], 100),
  ];
  const result = build(rows, [cardio("c1", 3), cardio("c2", 7), cardio("c3", 11)]);
  const byId = new Map(result.observations.map((item) => [item.strength.sessionId, item]));
  expect(byId.get("Legs by name but upper work")?.strength.classification).toBe("upper-body dominant");
  expect(byId.get("Upper by name but lower work")?.strength.classification).toBe("lower-body dominant");
  expect(byId.get("Anything")?.strength.classification).toBe("mixed/full-body");
});

test("compares exact-exercise e1RM with the median of prior comparable sessions", () => {
  const rows = [
    strengthSession("prior-1", 100, ["deadlift"], 300),
    strengthSession("prior-2", 76, ["deadlift"], 300),
    strengthSession("lower", 52, ["deadlift"], 270),
    strengthSession("similar", 28, ["deadlift"], 300),
    strengthSession("higher", 4, ["deadlift"], 330),
  ];
  const result = build(rows, [cardio("c-lower", 60), cardio("c-similar", 36), cardio("c-higher", 12)]);
  const byId = new Map(result.observations.map((item) => [item.strength.sessionId, item]));
  expect(byId.get("lower")?.comparison).toMatchObject({ exerciseName: "Trap Bar Deadlift", baselineAvailable: true, interpretation: "lower" });
  expect(byId.get("similar")?.comparison.interpretation).toBe("similar");
  expect(byId.get("higher")?.comparison.interpretation).toBe("higher");
  expect(byId.get("higher")?.strength.performanceSignal).toBe("Performance was higher than recent comparable sessions");
});

test("does not substitute unrelated exercise history and keeps sparse baselines insufficient", () => {
  const result = build([
    strengthSession("bench-1", 76, ["bench"], 150),
    strengthSession("bench-2", 52, ["bench"], 150),
    strengthSession("deadlift-current", 4, ["deadlift"], 300),
  ], [cardio("cardio", 12, { paceSecondsPerMile: 99999 })]);
  expect(result.observations[0].comparison).toMatchObject({ baselineAvailable: false, interpretation: "insufficient_context" });
  expect(result.observations[0].strength.performanceSignal).toBe("Insufficient comparable strength history");
});

test("caps rendered observations without losing the factual pair count", () => {
  const rows = Array.from({ length: 7 }, (_, index) => strengthSession(`s-${index}`, 2 + index * 25, ["bench"], 150));
  const cardioEvents = Array.from({ length: 7 }, (_, index) => cardio(`c-${index}`, 10 + index * 25));
  const result = build(rows, cardioEvents);
  expect(result.observations).toHaveLength(MAX_INTERFERENCE_OBSERVATIONS);
  expect(result.summary.pairedObservationCount).toBe(7);
});
