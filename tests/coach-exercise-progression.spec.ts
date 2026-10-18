import { expect, test } from "@playwright/test";
import { buildCoachProgrammingContext } from "../src/lib/coachExport/programmingContext";
import {
  buildRecentExerciseProgressionPacket,
  MAX_COACH_PROGRESSION_EXERCISES,
} from "../src/lib/coachExport/recentExerciseProgression";
import { formatRecentExerciseProgressionForCoach } from "../src/lib/coachReport/formatCoachReportText";
import { buildCoachStateFromExportMetrics } from "../src/lib/coachState/buildCoachState";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 18, 12);

function exercise(id: string, options: Record<string, unknown> = {}) {
  const name = String(options.name ?? id);
  return { id, name, normalizedName: name.toLowerCase(), metricMode: "reps", equipmentTags: [], createdAt: NOW, ...options } as any;
}

function track(exerciseId: string, trackingMode = "weightedReps") {
  return { id: `track-${exerciseId}`, exerciseId, displayName: exerciseId, trackingMode, trackType: "strength", warmupSetsDefault: 0, workingSetsDefault: 1, repMin: 1, repMax: 20, restSecondsDefault: 60, weightJumpDefault: 5, createdAt: NOW } as any;
}

function session(id: string, daysAgo: number) {
  return { id, startedAt: NOW - daysAgo * DAY - 1000, endedAt: NOW - daysAgo * DAY } as any;
}

function working(exerciseId: string, sessionId: string, values: Record<string, unknown> = {}) {
  return { id: `${exerciseId}-${sessionId}`, sessionId, trackId: `track-${exerciseId}`, setType: "working", createdAt: NOW, completedAt: NOW, ...values } as any;
}

function packet(args: { exercises: any[]; sessions?: any[]; sets?: any[]; anchors?: any[]; limit?: number }) {
  return buildRecentExerciseProgressionPacket({
    exercises: args.exercises,
    tracks: args.exercises.map((row) => track(row.id, row.metricMode === "time" ? "timeSeconds" : "weightedReps")),
    sessions: args.sessions ?? [session("recent", 1), session("prior", 8)],
    sets: args.sets ?? args.exercises.flatMap((row) => [
      working(row.id, "recent", { weight: 110, reps: 6 }),
      working(row.id, "prior", { weight: 100, reps: 6 }),
    ]),
    anchorLifts: args.anchors ?? [],
    asOf: NOW,
    limit: args.limit,
  });
}

test("selection prioritizes anchors, then included, secondary, comparable history, recency, and id", () => {
  const exercises = [
    exercise("secondary", { strengthSignalRole: "secondary" }),
    exercise("included-z", { strengthSignalRole: "included" }),
    exercise("included-a", { strengthSignalRole: "included" }),
    exercise("anchor", { strengthSignalRole: "excluded" }),
  ];
  const contexts = packet({ exercises, anchors: [{ exerciseId: "anchor" }] as any });
  expect(contexts.map((row) => row.exerciseId)).toEqual(["anchor", "included-a", "included-z", "secondary"]);

  const oneOff = packet({
    exercises: [exercise("one", { strengthSignalRole: "included" }), exercise("two", { strengthSignalRole: "included" })],
    sessions: [session("recent", 1), session("prior", 8)],
    sets: [working("one", "recent", { weight: 100, reps: 5 }), working("two", "recent", { weight: 90, reps: 5 }), working("two", "prior", { weight: 80, reps: 5 })],
  });
  expect(oneOff.map((row) => row.exerciseId)).toEqual(["two", "one"]);
});

test("merged aliases collapse, excluded rows stay out, cap holds, and observations stay newest-first", () => {
  const active = Array.from({ length: 16 }, (_, index) => exercise(`e-${String(index).padStart(2, "0")}`, { strengthSignalRole: "included" }));
  const canonical = active[0];
  const merged = exercise("merged", { mergedIntoExerciseId: canonical.id, archivedAt: NOW - DAY });
  const excluded = exercise("excluded", { strengthSignalRole: "excluded" });
  const exercises = [...active, merged, excluded];
  const sessions = [session("recent", 1), session("prior", 8)];
  const sets = exercises.flatMap((row) => [working(row.id, "recent", { weight: 100, reps: 6 }), working(row.id, "prior", { weight: 90, reps: 6 })]);
  const tracks = exercises.map((row) => track(row.id));
  const before = JSON.stringify({ exercises, sessions, sets, tracks });
  const contexts = buildRecentExerciseProgressionPacket({ exercises, tracks, sessions, sets, asOf: NOW });

  expect(contexts).toHaveLength(MAX_COACH_PROGRESSION_EXERCISES);
  expect(contexts.some((row) => row.exerciseId === "merged")).toBe(false);
  expect(contexts.some((row) => row.exerciseId === "excluded")).toBe(false);
  expect(contexts[0].recentObservations.map((row) => row.sessionId)).toEqual(["recent", "prior"]);
  expect(JSON.stringify({ exercises, sessions, sets, tracks })).toBe(before);
});

test("one-off insufficient context and reps, time, and distance evidence survive Coach formatting", () => {
  const exercises = [
    exercise("push-up", { name: "Push Up" }),
    exercise("plank", { name: "Plank", metricMode: "time" }),
    exercise("carry", { name: "Carry", metricMode: "distance" }),
  ];
  const sessions = [session("recent", 1)];
  const sets = [
    working("push-up", "recent", { reps: 15, weight: -30, rir: 2 }),
    working("plank", "recent", { seconds: 75 }),
    working("carry", "recent", { distance: 80, distanceUnit: "m" }),
  ];
  const contexts = packet({ exercises, sessions, sets });
  const text = formatRecentExerciseProgressionForCoach(contexts).join("\n");

  expect(contexts.every((row) => row.direction === "insufficient_context")).toBe(true);
  expect(text).toContain("Push Up [push-up]");
  expect(text).toContain("-30x15 | RIR 2");
  expect(text).not.toContain("scored e1RM");
  expect(text).toContain("75 sec");
  expect(text).toContain("80 m");
  expect(text).toContain("Fewer than two comparable observations");
});

test("Programming Context reuses the already-built progression packet", () => {
  const contexts = packet({ exercises: [exercise("bench", { strengthSignalRole: "included" })] });
  const context = buildCoachProgrammingContext({
    metrics: {
      anchorLifts: [],
      recentExerciseProgression: contexts,
      strengthSignal: {},
      readinessNotes: [],
    } as any,
    sessions: [],
    sets: [],
    tracks: [],
    exercises: [],
    asOf: NOW,
  });
  expect(context.exerciseProgression).toBe(contexts);
  const state = buildCoachStateFromExportMetrics({
    generatedAt: NOW,
    bodyComp: {},
    strengthSignal: {},
    anchorLifts: [],
    recentExerciseProgression: contexts,
  } as any);
  expect(state.recentExerciseProgression).toBe(contexts);
});
