import test from "node:test";
import assert from "node:assert/strict";
import { decisions } from "./thin-exercise-reviewed-decisions.mjs";
import { audit, createReviewedPlan, simulate } from "./reconcile-thin-exercise-backup.mjs";

const setCounts = new Map([
  ["Seated Hip Abduction", 18], ["Cross-Body Cable Lateral Raise Left", 11], ["Cross-Body Cable Lateral Raise Right", 11],
  ["Leg Press (Quad Bias)", 9], ["Cable Biceps Curl", 7], ["Pull-Ups", 6], ["Push-Ups", 6],
  ["Hammer Strength Iso-Lateral Low Row", 5], ["Hammer Strength Preacher Curl", 4], ["Straight Arm Lat Pulldown", 4],
  ["Cable Lateral Raise - Left", 3], ["Hammer Strength Iso-Lateral Decline Press", 3], ["Matrix Chest Press", 3],
  ["Seated Chest Press Left", 3], ["Seated Chest Press Right", 3], ["Bayesian Cable Biceps Curl Left", 2],
  ["Bayesian Cable Biceps Curl Right", 2], ["Bayesian Cable Curl Left", 2], ["Bayesian Cable Curl Right", 2],
  ["Cable Face Pulls", 2], ["Cable Lateral Raise - Right", 2], ["Cable Serratus Punch - Left", 2],
  ["Cable Serratus Punch - Right", 2], ["Cable Triceps", 2], ["Hammer Strength Iso-Lateral Low Row Left", 2],
  ["Hammer Strength Iso-Lateral Low Row Right", 2], ["Parallel Bar Dip", 2], ["Step-Up Higher Platform - Left", 2],
  ["Step-Up Higher Platform - Right", 2], ["DB Biceps Isometric Hold - Left", 1], ["DB Biceps Isometric Hold - Right", 1],
  ["Leg Curl", 1], ["Scap CAR", 1],
]);
const normal = (name) => name.toLowerCase().replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();
function backup() {
  const exercises = decisions.map((row) => ({ id: row.id, name: row.name, normalizedName: normal(row.name), aliases: [], equipmentTags: [], createdAt: 1 }));
  for (const target of [
    ["130692cb-6cff-4e24-b460-21a29d16a636", "Leg Press - Quad Biased", { movementPattern: "squat", strengthSignalRole: "included", bodyPart: "Legs" }],
    ["f65c6c1f-6d92-40d1-906f-285c4b9be65e", "Pull Up", { movementPattern: "pull", strengthSignalRole: "included", bodyPart: "Back" }],
    ["ae5e18fb-ec02-457b-9198-363c3084f95b", "Push Up", { strengthSignalRole: "excluded", bodyPart: "Chest" }],
    ["58dfbfc1-78cb-4bb6-b6d0-f44ae9a0e641", "Cable Tricep Pushdown", { movementPattern: "push", strengthSignalRole: "secondary", bodyPart: "Arms" }],
    ["d9bb4ba0-efde-4320-8a7f-8c5ab0c12edd", "Scapular CAR", { strengthSignalRole: "excluded" }],
  ]) exercises.push({ id: target[0], name: target[1], normalizedName: normal(target[1]), aliases: [], equipmentTags: [], createdAt: 1, ...target[2] });
  for (let index = 0; index < 386; index += 1) exercises.push({ id: "filler-" + index, name: "Catalog row " + index, normalizedName: "catalog row " + index, strengthSignalRole: "excluded", aliases: [], equipmentTags: [], createdAt: 1 });
  const tracks = []; const sets = []; const sessions = [{ id: "session", startedAt: 1, endedAt: 2 }];
  for (const row of decisions) {
    const trackId = "track-" + row.id; tracks.push({ id: trackId, exerciseId: row.id, trackType: "hypertrophy", trackingMode: "weightedReps" });
    for (let index = 0; index < setCounts.get(row.name); index += 1) sets.push({ id: trackId + "-" + index, sessionId: "session", trackId, reps: 1 });
  }
  return { meta: { backupVersion: 2, exportedAt: "2026-11-23T19:31:08.979Z", dbName: "workout_mvp_db" }, tables: { exercises, tracks, sets, sessions } };
}

test("reviewed plan exactly reproduces all 33 backup candidates without changing input", () => {
  const source = backup(); const before = JSON.stringify(source);
  const report = createReviewedPlan(source, "a".repeat(64));
  assert.deepEqual(report.observed, { activeExercises: 424, thinUsedExercises: 33, performedPayloadSets: 128 });
  assert.equal(report.actions.length, 33);
  assert.equal(JSON.stringify(source), before);
  assert.deepEqual(Object.fromEntries(["MERGE_TO_CANONICAL", "BACKFILL_METADATA", "LEAVE_INTENTIONALLY_UNCLASSIFIED", "MANUAL_REVIEW"].map((action) => [action, report.actions.filter((row) => row.action === action).length])), {
    MERGE_TO_CANONICAL: 5, BACKFILL_METADATA: 20, LEAVE_INTENTIONALLY_UNCLASSIFIED: 4, MANUAL_REVIEW: 4,
  });
});

test("simulation changes only explicit metadata, preserves IDs and set rows, and redirects only reviewed merges", () => {
  const source = backup(); const report = createReviewedPlan(source); const after = simulate(report);
  assert.equal(after.candidates.length, 8);
  assert.equal([...after.useCounts.values()].reduce((sum, count) => sum + count, 0), 15);
  const originalSetIds = source.tables.sets.map((row) => row.id).sort();
  assert.deepEqual(after.sets.map((row) => row.id).sort(), originalSetIds);
  for (const action of report.actions.filter((row) => row.action === "BACKFILL_METADATA")) {
    const updated = after.exercises.find((row) => row.id === action.id);
    assert.equal(updated.name, action.name); assert.equal(updated.id, action.id);
    for (const [field, value] of Object.entries(action.metadata)) assert.equal(updated[field], value);
    assert.deepEqual(Object.keys(action.operation.set).sort(), Object.keys(action.metadata).sort());
  }
  for (const action of report.actions.filter((row) => row.action === "MERGE_TO_CANONICAL")) {
    const sourceExercise = after.exercises.find((row) => row.id === action.id);
    assert.equal(sourceExercise.mergedIntoExerciseId, action.targetId);
    assert.equal(after.tracks.filter((track) => track.exerciseId === action.id).length, 0);
    assert.equal(after.tracks.filter((track) => track.exerciseId === action.targetId).length, action.operation.expectedTrackIds.length);
  }
  for (const action of report.actions.filter((row) => ["LEAVE_INTENTIONALLY_UNCLASSIFIED", "MANUAL_REVIEW"].includes(row.action))) {
    const row = after.exercises.find((exercise) => exercise.id === action.id);
    assert.equal(row.movementPattern, undefined); assert.equal(row.strengthSignalRole, undefined);
  }
});

test("an unlisted similar name is not heuristically modified", () => {
  const source = backup();
  const row = { id: "unlisted-row", name: "Cable Row", normalizedName: "cable row", aliases: [], equipmentTags: [], createdAt: 1 };
  source.tables.exercises.push(row); source.tables.tracks.push({ id: "unlisted-track", exerciseId: row.id, trackType: "hypertrophy" });
  source.tables.sets.push({ id: "unlisted-set", sessionId: "session", trackId: "unlisted-track", reps: 5 });
  assert.throws(() => createReviewedPlan(source), /unlisted IDs/);
  const observed = audit(source);
  assert.equal(observed.candidates.find((candidate) => candidate.exercise.id === row.id).exercise.movementPattern, undefined);
});
