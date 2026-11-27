import { expect, test } from "@playwright/test";
import { buildDualMovementClassificationDiagnostic, type CandidateMovementTaxonomyMapping } from "../src/domain/training/movementTaxonomyDiagnostic";
import { buildTrainingExposureContext, buildTrainingExposureEventSource } from "../src/domain/training/trainingExposureContext";
import type { Exercise, Session, SetEntry, Track } from "../src/db";

const AS_OF = new Date(2026, 10, 27, 13, 51).getTime();
const exercise = (id: string, name: string, movementPattern?: Exercise["movementPattern"]): Exercise => ({ id, name, normalizedName: name.toLowerCase(), movementPattern, equipmentTags: [], createdAt: AS_OF } as Exercise);
const track = (id: string, exerciseId: string, trackType: Track["trackType"] = "strength"): Track => ({ id, exerciseId, displayName: id, trackType, trackingMode: "weightedReps", warmupSetsDefault: 0, workingSetsDefault: 1, repMin: 1, repMax: 20, restSecondsDefault: 60, weightJumpDefault: 5, createdAt: AS_OF } as Track);
const session = (id: string, endedAt = AS_OF - 3600000): Session => ({ id, startedAt: endedAt - 3600000, endedAt } as Session);
const set = (id: string, sessionId: string, trackId: string, setType: SetEntry["setType"] = "working"): SetEntry => ({ id, sessionId, trackId, setType, reps: 8, completedAt: AS_OF - 3600000, createdAt: AS_OF } as SetEntry);

function fixture() {
  const exercises = [
    exercise("bench", "Barbell Bench Press", "push"),
    exercise("pullup", "Pull Up", "pull"),
    exercise("curl", "Cable Curl", "pull"),
    exercise("pallof", "Pallof Press", "carry"),
    exercise("bridge", "Glute Bridge", "hinge"),
    exercise("single-rdl", "Single-Leg Romanian Deadlift", "hinge"),
    exercise("single-press", "Single-Leg Press", "squat"),
    exercise("scap", "Scapular Pull-Up"),
  ];
  const tracks = exercises.map((row) => track(`${row.id}-track`, row.id, row.id === "scap" ? "corrective" : "strength"));
  const done = session("done");
  const sets = tracks.map((row) => set(`${row.exerciseId}-set`, done.id, row.id));
  const mappings: CandidateMovementTaxonomyMapping[] = [
    { canonicalExerciseId: "bench", disposition: "pattern", pattern: "horizontal_push", provenance: "reviewed_catalog_mapping", reviewStatus: "candidate" },
    { canonicalExerciseId: "pullup", disposition: "pattern", pattern: "vertical_pull", provenance: "reviewed_catalog_mapping", reviewStatus: "candidate" },
    { canonicalExerciseId: "curl", disposition: "accessory", family: "pull", provenance: "reviewed_catalog_mapping", reviewStatus: "candidate" },
    { canonicalExerciseId: "pallof", disposition: "pattern", pattern: "anti_rotation", provenance: "reviewed_catalog_mapping", reviewStatus: "candidate" },
    { canonicalExerciseId: "bridge", disposition: "pattern", pattern: "glute_extension", provenance: "reviewed_catalog_mapping", reviewStatus: "candidate" },
    { canonicalExerciseId: "single-rdl", disposition: "pattern", pattern: "hinge", exerciseLaterality: "unilateral", provenance: "reviewed_catalog_mapping", reviewStatus: "candidate" },
    { canonicalExerciseId: "single-press", disposition: "pattern", pattern: "squat", exerciseLaterality: "unilateral", provenance: "reviewed_catalog_mapping", reviewStatus: "candidate" },
    { canonicalExerciseId: "scap", disposition: "pattern", pattern: "vertical_pull", provenance: "reviewed_catalog_mapping", reviewStatus: "candidate" },
  ];
  return { exercises, tracks, sessions: [done], sets, mappings };
}

test("dual classification reuses eligible events, isolates controls, and reconciles every set once", () => {
  const data = fixture();
  const before = buildTrainingExposureContext({ ...data, asOf: AS_OF });
  const source = buildTrainingExposureEventSource({ ...data, asOf: AS_OF });
  const diagnostic = buildDualMovementClassificationDiagnostic({ events: source.events, candidateMappings: data.mappings, asOf: AS_OF });
  const after = buildTrainingExposureContext({ ...data, asOf: AS_OF });
  const period = diagnostic.periods.find((row) => row.kind === "current_week_to_date")!;
  expect(after).toEqual(before);
  expect(period.qualifyingSetCount).toBe(7);
  expect(period.controlExposureCount).toBe(1);
  expect(Object.values(period.accounting).reduce((sum, value) => sum + value, 0)).toBe(7);
  expect(Object.values(period.controlAccounting).reduce((sum, value) => sum + value, 0)).toBe(1);
  expect(period.specificPatternQualifying).toEqual({ horizontal_push: 1, vertical_pull: 1, anti_rotation: 1, glute_extension: 1, hinge: 1, squat: 1 });
  expect(period.specificPatternControls).toEqual({ vertical_pull: 1 });
  expect(period.compoundFamilyRollups).toEqual({ push: 1, pull: 1, hinge: 1, squat: 1 });
  expect(period.accounting.accessory).toBe(1);
});

test("keeps broad-only, unsupported, unmapped, invalid, conflicting, and unresolved accounting distinct", () => {
  const base = fixture();
  const unresolvedTrack = track("orphan-track", "absent");
  const mappings: CandidateMovementTaxonomyMapping[] = [
    { canonicalExerciseId: "bench", family: "push", provenance: "legacy_broad_metadata", reviewStatus: "candidate" },
    { canonicalExerciseId: "pullup", disposition: "unsupported", provenance: "reviewed_catalog_mapping", reviewStatus: "manual_review" },
    { canonicalExerciseId: "curl", disposition: "pattern", pattern: "horizontal_push", family: "pull", provenance: "reviewed_catalog_mapping", reviewStatus: "manual_review" },
  ];
  const source = buildTrainingExposureEventSource({
    sessions: base.sessions, exercises: base.exercises, tracks: [...base.tracks, unresolvedTrack],
    sets: [...base.sets, set("orphan-set", "done", unresolvedTrack.id)], asOf: AS_OF,
  });
  const period = buildDualMovementClassificationDiagnostic({ events: source.events, candidateMappings: mappings, asOf: AS_OF }).periods[0];
  expect(period.accounting).toMatchObject({ broad_only: 1, unsupported: 1, conflicting: 1, unmapped: 4, unresolved_identity: 1 });
});
