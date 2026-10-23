import { expect, test } from "@playwright/test";
import { buildTrainingExposureContext } from "../src/domain/training/trainingExposureContext";
import { buildMovementCoverage } from "../src/lib/coachExport/movementCoverage";

const AS_OF = new Date(2026, 9, 21, 12).getTime();
const DONE = new Date(2026, 9, 20, 12).getTime();

function fixture(unfinished = false) {
  const sessions = [{ id: "done", startedAt: DONE - 3600000, ...(unfinished ? {} : { endedAt: DONE }) }] as any;
  const exercises = [
    { id: "canonical", name: "Bench Press", normalizedName: "bench press", movementPattern: "push", equipmentTags: [], createdAt: DONE },
    { id: "alias", name: "Old Bench", normalizedName: "old bench", mergedIntoExerciseId: "canonical", equipmentTags: [], createdAt: DONE },
  ] as any;
  const tracks = [{ id: "track", exerciseId: "alias", displayName: "Old Bench", trackType: "strength" }] as any;
  const sets = [
    { id: "warmup", sessionId: "done", trackId: "track", setType: "warmup", reps: 10, completedAt: DONE, createdAt: DONE },
    { id: "work", sessionId: "done", trackId: "track", setType: "working", reps: 8, completedAt: DONE, createdAt: DONE },
    { id: "drop", sessionId: "done", trackId: "track", setType: "drop", reps: 10, completedAt: DONE, createdAt: DONE },
    { id: "failure", sessionId: "done", trackId: "track", setType: "failure", reps: 6, completedAt: DONE, createdAt: DONE },
  ] as any;
  return { sessions, sets, tracks, exercises };
}

function build(unfinished = false) {
  const data = fixture(unfinished);
  const exposure = buildTrainingExposureContext({ ...data, asOf: AS_OF });
  const coverage = buildMovementCoverage({ ...data, anchorIntelligence: [], trainingExposure: exposure, asOf: AS_OF });
  return { data, exposure, coverage };
}

test("Movement Coverage is a compatibility projection of shared canonical exposure", () => {
  const { coverage } = build();
  const push = coverage.entries.find((entry) => entry.family === "horizontal_push");
  expect(coverage).toMatchObject({ source: "training_exposure_rolling_14_days", compatibilityOnly: true, volumeWindowDays: 14 });
  expect(push).toMatchObject({ effectiveSets7d: 3, directEffectiveSets7d: 3, supportEffectiveSets7d: 0, sessionCount7d: 1 });
});

test("warmups are excluded while working, drop, and failure sets remain factual exposure", () => {
  const { exposure } = build();
  expect(exposure.windows.rolling14Days.movementPatterns[0]).toMatchObject({ qualifyingSets: 3, workingSets: 1, dropSets: 1, failureSets: 1, distinctCanonicalExerciseCount: 1 });
});

test("unfinished sessions do not affect Movement Coverage", () => {
  const { coverage } = build(true);
  expect(coverage.entries.find((entry) => entry.family === "horizontal_push")).toMatchObject({ effectiveSets7d: 0, sessionCount7d: 0 });
});

test("projection does not mutate source data", () => {
  const data = fixture();
  const before = JSON.stringify(data);
  const exposure = buildTrainingExposureContext({ ...data, asOf: AS_OF });
  buildMovementCoverage({ ...data, anchorIntelligence: [], trainingExposure: exposure, asOf: AS_OF });
  expect(JSON.stringify(data)).toBe(before);
});
