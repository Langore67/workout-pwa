import { expect, test } from "@playwright/test";
import {
  MOVEMENT_PATTERN_FAMILY_RELATIONSHIPS,
  MOVEMENT_TAXONOMY_FAMILIES,
  MOVEMENT_TAXONOMY_PATTERNS,
  MOVEMENT_TAXONOMY_LATERALITIES,
  MOVEMENT_TAXONOMY_VERSION,
  getMovementTaxonomyFamily,
  isMovementTaxonomyFamily,
  isMovementTaxonomyPattern,
  isMovementTaxonomyLaterality,
  resolveMovementTaxonomyClassification,
} from "../src/domain/training/movementTaxonomyContract";

test("validates the complete family and specific-pattern vocabularies", () => {
  expect(MOVEMENT_TAXONOMY_VERSION).toBe("1.1.0");
  expect(MOVEMENT_TAXONOMY_FAMILIES).toEqual(["push", "pull", "squat", "hinge", "lunge", "carry"]);
  expect(MOVEMENT_TAXONOMY_PATTERNS).toEqual([
    "horizontal_push", "vertical_push", "horizontal_pull", "vertical_pull",
    "squat", "hinge", "lunge", "glute_extension", "carry",
    "core", "rotation", "anti_rotation",
  ]);
  for (const family of MOVEMENT_TAXONOMY_FAMILIES) expect(isMovementTaxonomyFamily(family)).toBe(true);
  for (const pattern of MOVEMENT_TAXONOMY_PATTERNS) expect(isMovementTaxonomyPattern(pattern)).toBe(true);
  expect(isMovementTaxonomyFamily("vertical_pull")).toBe(false);
  expect(isMovementTaxonomyPattern("pull")).toBe(false);
  expect(isMovementTaxonomyPattern("anything_nonempty")).toBe(false);
  expect(isMovementTaxonomyPattern("single_leg")).toBe(false);
  expect(MOVEMENT_TAXONOMY_LATERALITIES).toEqual(["bilateral", "unilateral", "alternating", "unknown"]);
  for (const laterality of MOVEMENT_TAXONOMY_LATERALITIES) expect(isMovementTaxonomyLaterality(laterality)).toBe(true);
});

test("defines deterministic roll-ups without implying a Strength Signal mapping", () => {
  expect(MOVEMENT_PATTERN_FAMILY_RELATIONSHIPS).toEqual({
    horizontal_push: "push", vertical_push: "push",
    horizontal_pull: "pull", vertical_pull: "pull",
    squat: "squat", hinge: "hinge", lunge: "lunge",
    glute_extension: undefined, carry: "carry", core: undefined,
    rotation: undefined, anti_rotation: undefined,
  });
  expect(getMovementTaxonomyFamily("vertical_pull")).toBe("pull");
  expect(getMovementTaxonomyFamily("core")).toBeUndefined();
});

test("keeps exercise and performed-set laterality independent of movement pattern", () => {
  const hinge = resolveMovementTaxonomyClassification({
    pattern: "hinge", exerciseLaterality: "unilateral", performedSetLaterality: "unknown",
  });
  const squat = resolveMovementTaxonomyClassification({
    pattern: "squat", exerciseLaterality: "unilateral", performedSetLaterality: "unilateral",
  });
  expect(hinge).toMatchObject({ pattern: "hinge", family: "hinge", laterality: { exercise: "unilateral", performedSet: "unknown" } });
  expect(squat).toMatchObject({ pattern: "squat", family: "squat", laterality: { exercise: "unilateral", performedSet: "unilateral" } });
  expect(resolveMovementTaxonomyClassification({ pattern: "single_leg" })).toMatchObject({ state: "invalid" });
  expect(resolveMovementTaxonomyClassification({ pattern: "lunge", exerciseLaterality: "one_side" })).toMatchObject({ state: "invalid" });
});

test("resolves explicit, reviewed, legacy fallback, and broad-only provenance", () => {
  expect(resolveMovementTaxonomyClassification({ pattern: "vertical_pull", evidenceSource: "explicit_metadata" })).toMatchObject({
    state: "classified", pattern: "vertical_pull", family: "pull", provenance: "explicit_metadata",
  });
  expect(resolveMovementTaxonomyClassification({ pattern: "horizontal_push", evidenceSource: "reviewed_catalog_mapping" })).toMatchObject({
    state: "classified", family: "push", provenance: "reviewed_catalog_mapping",
  });
  expect(resolveMovementTaxonomyClassification({ pattern: "horizontal_push", evidenceSource: "legacy_name_fallback" })).toMatchObject({
    state: "classified", provenance: "legacy_name_fallback",
  });
  expect(resolveMovementTaxonomyClassification({ family: "pull" })).toMatchObject({
    state: "broad_only", family: "pull", provenance: "legacy_broad_metadata",
  });
});

test("reports missing and invalid inputs without repairing them", () => {
  expect(resolveMovementTaxonomyClassification({})).toMatchObject({ state: "missing", provenance: "missing_classification" });
  expect(resolveMovementTaxonomyClassification({ family: " pull " })).toMatchObject({ state: "invalid", provenance: "invalid_classification" });
  expect(resolveMovementTaxonomyClassification({ pattern: "diagonal_pull" })).toMatchObject({ state: "invalid" });
  expect(resolveMovementTaxonomyClassification({ disposition: "compound" })).toMatchObject({ state: "invalid" });
});

test("preserves conflicts instead of silently choosing family or pattern", () => {
  expect(resolveMovementTaxonomyClassification({ family: "push", pattern: "vertical_pull" })).toMatchObject({
    state: "conflicting", family: "push", pattern: "vertical_pull", expectedFamily: "pull",
    provenance: "conflicting_classification",
  });
  expect(resolveMovementTaxonomyClassification({ family: "hinge", pattern: "glute_extension" })).toMatchObject({
    state: "conflicting", family: "hinge", pattern: "glute_extension",
  });
});

test("represents accessory and unsupported work without forced compound exposure", () => {
  const curl = resolveMovementTaxonomyClassification({ disposition: "accessory", evidenceSource: "reviewed_catalog_mapping" });
  const externalRotation = resolveMovementTaxonomyClassification({ disposition: "unsupported", evidenceSource: "explicit_metadata" });
  expect(curl).toMatchObject({ state: "accessory", disposition: "accessory", provenance: "reviewed_catalog_mapping" });
  expect(curl.pattern).toBeUndefined();
  expect(curl.family).toBeUndefined();
  expect(externalRotation).toMatchObject({ state: "unsupported", disposition: "unsupported" });
  expect(resolveMovementTaxonomyClassification({ disposition: "accessory", pattern: "horizontal_pull" })).toMatchObject({ state: "conflicting" });
});

test("unmapped patterns remain valid without a forced family", () => {
  for (const pattern of ["glute_extension", "core", "rotation", "anti_rotation"] as const) {
    const result = resolveMovementTaxonomyClassification({ pattern });
    expect(result).toMatchObject({ state: "classified", pattern });
    expect(result.family).toBeUndefined();
  }
});

test("resolution is deterministic, immutable, and represents one observation rather than duplicate accounting", () => {
  const input = { family: "pull", pattern: "vertical_pull", evidenceSource: "explicit_metadata" } as const;
  const first = resolveMovementTaxonomyClassification(input);
  const second = resolveMovementTaxonomyClassification(input);
  expect(first).toEqual(second);
  expect(Object.isFrozen(first)).toBe(true);
  expect(Object.isFrozen(first.issues)).toBe(true);
  expect(first).toMatchObject({ state: "classified", family: "pull", pattern: "vertical_pull" });
  expect(Array.isArray(first)).toBe(false);
});

