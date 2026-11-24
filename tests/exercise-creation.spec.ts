import { expect, test } from "@playwright/test";
import { createExerciseRecord } from "../src/domain/exercises/createExercise";

test("canonical exercise creation initializes identity, safe defaults, and timestamps", () => {
  const exercise = createExerciseRecord({ name: "  Cable-Row  ", now: 1234 });

  expect(exercise.id).toMatch(/^[0-9a-f-]{36}$/i);
  expect(exercise.name).toBe("Cable-Row");
  expect(exercise.normalizedName).toBe("cable row");
  expect(exercise.aliases).toEqual([]);
  expect(exercise.equipmentTags).toEqual([]);
  expect(exercise.createdAt).toBe(1234);
  expect(exercise.updatedAt).toBe(1234);
  expect(exercise.metricMode).toBeUndefined();
});

test("canonical exercise creation preserves explicit metric mode and trusted metadata only", () => {
  const exercise = createExerciseRecord({
    name: "Cable Row",
    metricMode: "time",
    now: 5678,
    knownMetadata: {
      movementPattern: "pull",
      strengthSignalRole: "included",
      category: "Strength",
      bodyPart: "Back",
      equipment: "Cable",
      aliases: ["Seated Cable Row"],
      equipmentTags: ["cable"],
    },
  });

  expect(exercise.metricMode).toBe("time");
  expect(exercise.movementPattern).toBe("pull");
  expect(exercise.strengthSignalRole).toBe("included");
  expect(exercise.category).toBe("Strength");
  expect(exercise.bodyPart).toBe("Back");
  expect(exercise.equipment).toBe("Cable");
  expect(exercise.aliases).toEqual(["Seated Cable Row"]);
  expect(exercise.equipmentTags).toEqual(["cable"]);
});

test("canonical exercise creation does not infer taxonomy from its name", () => {
  const exercise = createExerciseRecord({ name: "Cable Row", now: 1 });

  expect(exercise.movementPattern).toBeUndefined();
  expect(exercise.strengthSignalRole).toBeUndefined();
  expect(exercise.trainingRole).toBeUndefined();
  expect(exercise.category).toBeUndefined();
  expect(exercise.equipment).toBeUndefined();
  expect(exercise.bodyPart).toBeUndefined();
  expect(exercise.anchorEligibility).toBeUndefined();
  expect(exercise.anchorSubtypes).toBeUndefined();
});

test("canonical exercise creation rejects a blank name", () => {
  expect(() => createExerciseRecord({ name: "   " })).toThrow("Exercise name is required.");
});
