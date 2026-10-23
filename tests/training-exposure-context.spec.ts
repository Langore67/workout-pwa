import { expect, test } from "@playwright/test";
import { buildTrainingExposureContext } from "../src/domain/training/trainingExposureContext";
import type { Exercise, Session, SetEntry, Track } from "../src/db";

function at(year: number, month: number, day: number, hour = 12) { return new Date(year, month - 1, day, hour).getTime(); }
const AS_OF = at(2026, 10, 21);
const exercise = (id: string, patch: Partial<Exercise> = {}): Exercise => ({ id, name: id, normalizedName: id, equipmentTags: [], createdAt: AS_OF, ...patch } as Exercise);
const track = (id: string, exerciseId: string, trackType: Track["trackType"] = "strength"): Track => ({ id, exerciseId, displayName: id, trackType, trackingMode: "weightedReps", warmupSetsDefault: 0, workingSetsDefault: 1, repMin: 1, repMax: 20, restSecondsDefault: 60, weightJumpDefault: 5, createdAt: AS_OF } as Track);
const session = (id: string, endedAt?: number): Session => ({ id, startedAt: (endedAt ?? AS_OF) - 3600000, ...(endedAt ? { endedAt } : {}) } as Session);
const set = (id: string, sessionId: string, trackId: string, setType: SetEntry["setType"], patch: Partial<SetEntry> = {}): SetEntry => ({ id, sessionId, trackId, setType, createdAt: AS_OF, reps: 8, ...patch } as SetEntry);

test("counts completed performed set types, imported payloads, and excludes warmup, empty, and unfinished work", () => {
  const ex = exercise("Bench Press", { movementPattern: "push", trainingRole: "primary" });
  const tr = track("bench-track", ex.id);
  const done = session("done", at(2026, 10, 20));
  const unfinished = session("unfinished");
  const sourceSets = [
    set("working", done.id, tr.id, "working", { completedAt: done.endedAt }),
    set("drop", done.id, tr.id, "drop", { completedAt: done.endedAt }),
    set("failure", done.id, tr.id, "failure", { completedAt: done.endedAt }),
    set("warmup", done.id, tr.id, "warmup", { completedAt: done.endedAt }),
    set("imported", done.id, tr.id, "working", { completedAt: undefined, reps: 6 }),
    set("empty", done.id, tr.id, "working", { completedAt: done.endedAt, reps: undefined, weight: undefined }),
    set("unfinished", unfinished.id, tr.id, "working", { completedAt: AS_OF }),
  ];
  const snapshot = JSON.stringify(sourceSets);
  const context = buildTrainingExposureContext({ sessions: [done, unfinished], sets: sourceSets, tracks: [tr], exercises: [ex], asOf: AS_OF });
  const push = context.windows.currentWeekToDate.movementPatterns[0];
  expect(push).toMatchObject({ movementPattern: "push", qualifyingSets: 4, workingSets: 2, dropSets: 1, failureSets: 1, controlExposures: 0, sessionCount: 1, distinctCanonicalExerciseCount: 1 });
  expect(push.latestExposureAt).toBe(done.endedAt);
  expect(context.windows.currentWeekToDate.completedStrengthSessions).toBe(1);
  expect(JSON.stringify(sourceSets)).toBe(snapshot);
});

test("calendar counts only completed dedicated cardio observations", () => {
  const context = buildTrainingExposureContext({
    sessions: [], sets: [], tracks: [], exercises: [], asOf: AS_OF,
    dedicatedCardioObservations: [
      { sessionId: "done", startedAt: at(2026, 10, 20, 8), endedAt: at(2026, 10, 20, 9), date: "2026-10-20", name: "Walk", activityType: "walk", cardioFormat: "continuous", confidence: "high" },
      { sessionId: "open", startedAt: at(2026, 10, 21, 8), date: "2026-10-21", name: "Walk", activityType: "walk", cardioFormat: "continuous", confidence: "high" },
    ] as any,
  });
  expect(context.calendar.completedDedicatedCardioSessionsWeekToDate).toBe(1);
});

test("corrective and mobility work becomes control exposure with explicit and untagged roles", () => {
  const corrective = exercise("Wall Slide", { movementPattern: "push", trainingRole: "corrective" });
  const mobility = exercise("Pallof Press", { trainingRole: undefined });
  const rows = [track("wall", corrective.id, "corrective"), track("pallof", mobility.id, "mobility")];
  const done = session("done", at(2026, 10, 20));
  const context = buildTrainingExposureContext({ sessions: [done], sets: [set("a", done.id, "wall", "working", { seconds: 30, reps: undefined }), set("b", done.id, "pallof", "working")], tracks: rows, exercises: [corrective, mobility], asOf: AS_OF });
  expect(context.windows.currentWeekToDate.movementPatterns.find((row) => row.movementPattern === "push")?.controlExposures).toBe(1);
  expect(context.windows.currentWeekToDate.movementPatterns.find((row) => row.movementPattern === "core")?.controlExposures).toBe(1);
  expect(context.windows.currentWeekToDate.trainingRoles).toEqual(expect.arrayContaining([
    expect.objectContaining({ trainingRole: "corrective", controlExposures: 1 }),
    expect.objectContaining({ trainingRole: "untagged", controlExposures: 1 }),
  ]));
});

test("preserves every explicit training role without inference", () => {
  const roles = ["primary", "accessory", "corrective", "deprioritized"] as const;
  const exercises = roles.map((role) => exercise(role, { movementPattern: "pull", trainingRole: role }));
  const tracks = exercises.map((row) => track(`${row.id}-track`, row.id));
  const done = session("done", at(2026, 10, 20));
  const context = buildTrainingExposureContext({ sessions: [done], sets: tracks.map((row, index) => set(`s${index}`, done.id, row.id, "working")), tracks, exercises, asOf: AS_OF });
  expect(context.windows.currentWeekToDate.trainingRoles.map((row) => row.trainingRole)).toEqual(roles);
});

test("canonicalizes merged aliases, retains archived terminals, and preserves left/right identities within one movement", () => {
  const canonical = exercise("row", { name: "Cable Row", movementPattern: "pull", trainingRole: "accessory" });
  const alias = exercise("old-row", { name: "Old Row", mergedIntoExerciseId: canonical.id });
  const archived = exercise("archived", { name: "Archived Row", movementPattern: "pull", archivedAt: 1 });
  const left = exercise("left", { name: "Left Row", movementPattern: "pull" });
  const right = exercise("right", { name: "Right Row", movementPattern: "pull" });
  const exercises = [canonical, alias, archived, left, right];
  const tracks = exercises.slice(1).map((row) => track(`${row.id}-track`, row.id));
  const done = session("done", at(2026, 10, 20));
  const context = buildTrainingExposureContext({ sessions: [done], sets: tracks.map((row, index) => set(`s${index}`, done.id, row.id, "working")), tracks, exercises, asOf: AS_OF });
  expect(context.windows.currentWeekToDate.movementPatterns[0]).toMatchObject({ movementPattern: "pull", qualifyingSets: 4, distinctCanonicalExerciseCount: 4 });
});

test("explicit movement wins, existing fallback is used, and broken/unclassified work remains visible", () => {
  const explicit = exercise("bench", { name: "Bench Press", movementPattern: "hinge" });
  const fallback = exercise("pulldown", { name: "Lat Pulldown" });
  const broken = exercise("broken", { name: "Broken Alias", mergedIntoExerciseId: "absent" });
  const unknown = exercise("unknown", { name: "Mystery Movement" });
  const exercises = [explicit, fallback, broken, unknown];
  const tracks = exercises.map((row) => track(`${row.id}-track`, row.id));
  const done = session("done", at(2026, 10, 20));
  const context = buildTrainingExposureContext({ sessions: [done], sets: tracks.map((row, index) => set(`s${index}`, done.id, row.id, "working")), tracks, exercises, asOf: AS_OF });
  const window = context.windows.currentWeekToDate;
  expect(window.movementPatterns.map((row) => row.movementPattern)).toEqual(["hinge", "vertical_pull"]);
  expect(window.unclassifiedSetCount).toBe(2);
  expect(window.limitations.join(" ")).toContain("unavailable canonical exercise");
});

test("uses week-to-date, previous complete week, and rolling local 14-day windows", () => {
  const ex = exercise("squat", { movementPattern: "squat" });
  const tr = track("squat-track", ex.id);
  const sessions = [session("current", at(2026, 10, 20)), session("prior", at(2026, 10, 15)), session("rolling", at(2026, 10, 8)), session("old", at(2026, 10, 7))];
  const sets = sessions.map((row) => set(`set-${row.id}`, row.id, tr.id, "working", { completedAt: row.endedAt }));
  const context = buildTrainingExposureContext({ sessions, sets, tracks: [tr], exercises: [ex], asOf: AS_OF });
  expect(context.windows.currentWeekToDate.movementPatterns[0].qualifyingSets).toBe(1);
  expect(context.windows.previousCompleteWeek.movementPatterns[0].qualifyingSets).toBe(1);
  expect(context.windows.previousCompleteWeek.isCompleteCalendarPeriod).toBe(true);
  expect(context.windows.rolling14Days.movementPatterns[0].qualifyingSets).toBe(3);
  expect(context.windows.rolling14Days.startLocalDate).toBe("2026-10-08");
});

