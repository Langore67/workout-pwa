import { MOVEMENT_TAXONOMY_VERSION, resolveMovementTaxonomyClassification, isMovementTaxonomyLaterality, type MovementTaxonomyDisposition, type MovementTaxonomyPattern, type MovementTaxonomyFamily, type MovementTaxonomyLaterality } from './movementTaxonomyContract';

/** Optional non-indexed exercise metadata. Family is stored only for broad-only evidence. */
export type PersistedMovementTaxonomy = {
  taxonomyVersion: typeof MOVEMENT_TAXONOMY_VERSION;
  disposition?: MovementTaxonomyDisposition;
  pattern?: MovementTaxonomyPattern;
  family?: MovementTaxonomyFamily;
  exerciseLaterality: MovementTaxonomyLaterality;
  provenance: 'explicit_metadata' | 'reviewed_catalog_mapping' | 'legacy_broad_metadata';
};

export function validatePersistedMovementTaxonomy(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['Taxonomy metadata must be an object.'];
  const row = value as Record<string, unknown>;
  const errors: string[] = [];
  const allowed = ['taxonomyVersion', 'disposition', 'pattern', 'family', 'exerciseLaterality', 'provenance'];
  if (Object.keys(row).some(key => !allowed.includes(key))) errors.push('Unknown taxonomy field.');
  if (row.taxonomyVersion !== MOVEMENT_TAXONOMY_VERSION) errors.push('Unsupported taxonomy version.');
  if (!isMovementTaxonomyLaterality(row.exerciseLaterality)) errors.push('Exercise laterality is required and must be valid.');
  if (!['explicit_metadata', 'reviewed_catalog_mapping', 'legacy_broad_metadata'].includes(String(row.provenance))) errors.push('Explicit provenance is required; name fallback is not authoritative.');
  const result = resolveMovementTaxonomyClassification({ ...row, evidenceSource: row.provenance });
  if (!['classified', 'accessory', 'unsupported', 'broad_only'].includes(result.state)) errors.push(...result.issues);
  if (row.pattern !== undefined && row.disposition !== 'pattern') errors.push('A specific pattern requires pattern disposition.');
  if (row.family !== undefined && (row.pattern !== undefined || row.disposition !== undefined)) errors.push('Family is only persisted for broad-only evidence; specific families are derived.');
  if (row.disposition === 'pattern' && !row.pattern) errors.push('Pattern disposition requires a specific pattern.');
  return errors;
}

/** Merging must not silently abandon a reviewed source classification. */
export function taxonomyMergeConflict(source: { movementTaxonomy?: unknown }, target: { movementTaxonomy?: unknown }): string | undefined {
  if (source.movementTaxonomy == null) return undefined;
  const a = source.movementTaxonomy as Record<string, unknown>;
  const b = target.movementTaxonomy as Record<string, unknown> | undefined;
  if (!b || Object.keys(a).length !== Object.keys(b).length || Object.keys(a).some(key => a[key] !== b[key])) return 'Source and target taxonomy differ; review taxonomy before merging these exercises.';
  return undefined;
}
