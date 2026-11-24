import test from "node:test";
import assert from "node:assert/strict";
import { buildExerciseMetadataAudit } from "../scripts/audit-exercise-metadata.mjs";

const base = (overrides = {}) => ({
  id: "e1", name: "Row 1", normalizedName: "row 1", equipmentTags: [], createdAt: 1,
  ...overrides,
});

test("classifies structured strength metadata without inferring from exercise names", () => {
  const audit = buildExerciseMetadataAudit({ tables: { exercises: [
    base({ movementPattern: "pull", strengthSignalRole: "included" }),
    base({ id: "e2", name: "Barbell Row", normalizedName: "barbell row" }),
  ] } });
  assert.deepEqual(audit.counts, {
    total: 2, COMPLETE: 1, MISSING_METADATA: 0, INTENTIONALLY_UNCLASSIFIED: 0, AMBIGUOUS: 1, INCONSISTENT: 0,
  });
  assert.equal(audit.incomplete[0].name, "Barbell Row");
  assert.equal(audit.incomplete[0].status, "AMBIGUOUS");
});

test("flags expected metadata gaps and invalid canonical values", () => {
  const audit = buildExerciseMetadataAudit({ tables: { exercises: [
    base({ category: "Strength", movementPattern: "hinge" }),
    base({ id: "e2", normalizedName: "incorrect", movementPattern: "vertical_pull" }),
  ] } });
  assert.equal(audit.counts.MISSING_METADATA, 1);
  assert.equal(audit.counts.INCONSISTENT, 1);
});

test("recognizes explicit outside-taxonomy metadata and reports source provenance unavailable", () => {
  const audit = buildExerciseMetadataAudit({ tables: { exercises: [
    base({ category: "Mobility" }),
    base({ id: "e2", trainingRole: "accessory" }),
    base({ id: "e3", strengthSignalRole: "excluded" }),
  ] } });
  assert.equal(audit.counts.INTENTIONALLY_UNCLASSIFIED, 3);
  assert.equal(audit.provenance.available, false);
  assert.equal(audit.pasteWorkoutMetrics, null);
});

test("reconciles logged qualifying resistance-set candidates read-only", () => {
  const audit = buildExerciseMetadataAudit({ tables: {
    exercises: [base({ movementPattern: "pull", strengthSignalRole: "included" })],
    tracks: [{ id: "t1", exerciseId: "e1", trackType: "strength" }],
    sessions: [{ id: "s1", endedAt: 100 }],
    sets: [
      { id: "set1", sessionId: "s1", trackId: "t1", setType: "working", reps: 5 },
      { id: "set2", sessionId: "s1", trackId: "t1", setType: "warmup", reps: 5 },
      { id: "set3", sessionId: "s1", trackId: "t1", setType: "working", reps: 5, notes: "technique" },
    ],
  } });
  assert.equal(audit.exposureReconciliation.candidateSetCount, 1);
  assert.equal(audit.exposureReconciliation.candidates[0].name, "Row 1");
});
