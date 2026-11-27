/**
 * Versioned movement taxonomy contract for future Training Exposure work.
 *
 * This module is intentionally consumer-neutral. It does not read Exercise
 * records, infer from names, or participate in the legacy Strength Signal or
 * Training Exposure resolvers.
 */

export const MOVEMENT_TAXONOMY_VERSION = "1.0.0" as const;

export const MOVEMENT_TAXONOMY_FAMILIES = [
  "push",
  "pull",
  "squat",
  "hinge",
  "lunge",
  "carry",
] as const;

export type MovementTaxonomyFamily = (typeof MOVEMENT_TAXONOMY_FAMILIES)[number];

export const MOVEMENT_TAXONOMY_PATTERNS = [
  "horizontal_push",
  "vertical_push",
  "horizontal_pull",
  "vertical_pull",
  "squat",
  "hinge",
  "lunge",
  "single_leg",
  "glute_extension",
  "carry",
  "core",
  "rotation",
  "anti_rotation",
] as const;

export type MovementTaxonomyPattern = (typeof MOVEMENT_TAXONOMY_PATTERNS)[number];

export type MovementTaxonomyDisposition =
  | "pattern"
  | "accessory"
  | "unsupported";

export const MOVEMENT_TAXONOMY_EVIDENCE_SOURCES = [
  "explicit_metadata",
  "reviewed_catalog_mapping",
  "legacy_broad_metadata",
  "legacy_name_fallback",
] as const;

export type MovementTaxonomyEvidenceSource =
  (typeof MOVEMENT_TAXONOMY_EVIDENCE_SOURCES)[number];

export type MovementTaxonomyProvenance =
  | MovementTaxonomyEvidenceSource
  | "missing_classification"
  | "invalid_classification"
  | "conflicting_classification";

export type MovementTaxonomyClassificationState =
  | "classified"
  | "broad_only"
  | "accessory"
  | "unsupported"
  | "missing"
  | "invalid"
  | "conflicting";

/**
 * Undefined means that the specific pattern deliberately has no deterministic
 * parent in the preserved legacy family vocabulary. No Strength Signal mapping
 * is implied by this table.
 */
export const MOVEMENT_PATTERN_FAMILY_RELATIONSHIPS: Readonly<
  Record<MovementTaxonomyPattern, MovementTaxonomyFamily | undefined>
> = Object.freeze({
  horizontal_push: "push",
  vertical_push: "push",
  horizontal_pull: "pull",
  vertical_pull: "pull",
  squat: "squat",
  hinge: "hinge",
  lunge: "lunge",
  single_leg: "lunge",
  glute_extension: undefined,
  carry: "carry",
  core: undefined,
  rotation: undefined,
  anti_rotation: undefined,
});

export type MovementTaxonomyResolutionInput = {
  family?: unknown;
  pattern?: unknown;
  disposition?: unknown;
  evidenceSource?: unknown;
};

export type MovementTaxonomyResolution = Readonly<{
  taxonomyVersion: typeof MOVEMENT_TAXONOMY_VERSION;
  state: MovementTaxonomyClassificationState;
  provenance: MovementTaxonomyProvenance;
  disposition?: MovementTaxonomyDisposition;
  family?: MovementTaxonomyFamily;
  pattern?: MovementTaxonomyPattern;
  expectedFamily?: MovementTaxonomyFamily;
  issues: readonly string[];
}>;

function isMissing(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

export function isMovementTaxonomyFamily(value: unknown): value is MovementTaxonomyFamily {
  return typeof value === "string"
    && (MOVEMENT_TAXONOMY_FAMILIES as readonly string[]).includes(value);
}

export function isMovementTaxonomyPattern(value: unknown): value is MovementTaxonomyPattern {
  return typeof value === "string"
    && (MOVEMENT_TAXONOMY_PATTERNS as readonly string[]).includes(value);
}

export function isMovementTaxonomyDisposition(value: unknown): value is MovementTaxonomyDisposition {
  return value === "pattern" || value === "accessory" || value === "unsupported";
}

export function isMovementTaxonomyEvidenceSource(value: unknown): value is MovementTaxonomyEvidenceSource {
  return typeof value === "string"
    && (MOVEMENT_TAXONOMY_EVIDENCE_SOURCES as readonly string[]).includes(value);
}

export function getMovementTaxonomyFamily(
  pattern: MovementTaxonomyPattern
): MovementTaxonomyFamily | undefined {
  return MOVEMENT_PATTERN_FAMILY_RELATIONSHIPS[pattern];
}

function freezeResolution(
  value: Omit<MovementTaxonomyResolution, "taxonomyVersion" | "issues"> & { issues?: string[] }
): MovementTaxonomyResolution {
  return Object.freeze({
    taxonomyVersion: MOVEMENT_TAXONOMY_VERSION,
    ...value,
    issues: Object.freeze([...(value.issues ?? [])]),
  });
}

/**
 * Validates only supplied structured evidence. It never repairs values, reads
 * exercise names, or infers from notes.
 */
export function resolveMovementTaxonomyClassification(
  input: MovementTaxonomyResolutionInput
): MovementTaxonomyResolution {
  const invalidFields: string[] = [];
  if (!isMissing(input.family) && !isMovementTaxonomyFamily(input.family)) invalidFields.push("family");
  if (!isMissing(input.pattern) && !isMovementTaxonomyPattern(input.pattern)) invalidFields.push("pattern");
  if (!isMissing(input.disposition) && !isMovementTaxonomyDisposition(input.disposition)) invalidFields.push("disposition");
  if (!isMissing(input.evidenceSource) && !isMovementTaxonomyEvidenceSource(input.evidenceSource)) invalidFields.push("evidenceSource");

  if (invalidFields.length) {
    return freezeResolution({
      state: "invalid",
      provenance: "invalid_classification",
      issues: invalidFields.map((field) => `Invalid movement taxonomy ${field}.`),
    });
  }

  const family = isMovementTaxonomyFamily(input.family) ? input.family : undefined;
  const pattern = isMovementTaxonomyPattern(input.pattern) ? input.pattern : undefined;
  const disposition = isMovementTaxonomyDisposition(input.disposition)
    ? input.disposition
    : pattern
      ? "pattern"
      : undefined;
  const source = isMovementTaxonomyEvidenceSource(input.evidenceSource)
    ? input.evidenceSource
    : family && !pattern
      ? "legacy_broad_metadata"
      : undefined;

  if (disposition === "accessory" || disposition === "unsupported") {
    if (pattern) {
      return freezeResolution({
        state: "conflicting",
        provenance: "conflicting_classification",
        disposition,
        ...(family ? { family } : {}),
        pattern,
        issues: [`${disposition} disposition cannot assert compound-pattern exposure.`],
      });
    }
    return freezeResolution({
      state: disposition,
      provenance: source ?? "missing_classification",
      disposition,
      ...(family ? { family } : {}),
    });
  }

  if (pattern) {
    const expectedFamily = getMovementTaxonomyFamily(pattern);
    if (family && family !== expectedFamily) {
      return freezeResolution({
        state: "conflicting",
        provenance: "conflicting_classification",
        disposition: "pattern",
        family,
        pattern,
        ...(expectedFamily ? { expectedFamily } : {}),
        issues: expectedFamily
          ? [`Pattern ${pattern} rolls up to ${expectedFamily}, not ${family}.`]
          : [`Pattern ${pattern} has no family relationship but family ${family} was supplied.`],
      });
    }
    return freezeResolution({
      state: "classified",
      provenance: source ?? "explicit_metadata",
      disposition: "pattern",
      ...(expectedFamily ? { family: expectedFamily, expectedFamily } : {}),
      pattern,
    });
  }

  if (family) {
    return freezeResolution({
      state: "broad_only",
      provenance: source ?? "legacy_broad_metadata",
      family,
      issues: ["A validated broad family is available without a specific movement pattern."],
    });
  }

  return freezeResolution({
    state: "missing",
    provenance: "missing_classification",
    issues: ["No movement taxonomy classification was supplied."],
  });
}

