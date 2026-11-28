import type { Exercise } from '../../db';
import { MOVEMENT_TAXONOMY_VERSION } from '../training/movementTaxonomyContract';
import { validatePersistedMovementTaxonomy, type PersistedMovementTaxonomy } from '../training/persistedMovementTaxonomy';
import type { JsonValue, MaintenanceScriptV1 } from './maintenanceTypes';

/** Produces a non-executable candidate; approval and activation are a separate review step. */
export function buildTaxonomyCandidate(args: {
  id: string; createdAt: string; dbName: string; schemaVersion: number;
  sourceBackup: NonNullable<MaintenanceScriptV1['sourceBackup']>;
  exercises: readonly Exercise[];
  mappings: readonly { canonicalExerciseId: string; taxonomy: PersistedMovementTaxonomy }[];
}): MaintenanceScriptV1 {
  const byId = new Map(args.exercises.map(row => [row.id, row]));
  if (new Set(args.mappings.map(row => row.canonicalExerciseId)).size !== args.mappings.length) throw new Error('Duplicate canonical candidate ID.');
  const operations = args.mappings.map(mapping => {
    const exercise = byId.get(mapping.canonicalExerciseId);
    if (!exercise || exercise.mergedIntoExerciseId || exercise.archivedAt) throw new Error(`Missing or noncanonical target: ${mapping.canonicalExerciseId}`);
    const errors = validatePersistedMovementTaxonomy(mapping.taxonomy);
    if (errors.length) throw new Error(errors.join(' '));
    const record = JSON.parse(JSON.stringify(exercise)) as Record<string, JsonValue>;
    return {
      type: 'updateRecord' as const, table: 'exercises' as const, key: exercise.id,
      expect: { createdAt: exercise.createdAt, ...(exercise.movementTaxonomy ? { movementTaxonomy: record.movementTaxonomy } : {}) },
      ...(!exercise.movementTaxonomy ? { expectUnsetFields: ['movementTaxonomy'] } : {}),
      expectExerciseRecord: record,
      set: { movementTaxonomy: JSON.parse(JSON.stringify(mapping.taxonomy)) as JsonValue },
    };
  });
  return {
    format: 'ironforge-db-maintenance', version: 1, taxonomyReview: 'candidate',
    id: args.id, name: `Candidate movement taxonomy ${MOVEMENT_TAXONOMY_VERSION} — explicit approval required`,
    createdAt: args.createdAt, operationCount: operations.length,
    preconditions: { dbName: args.dbName, dexieSchemaVersion: args.schemaVersion, supportedBackupVersion: 2 },
    sourceBackup: args.sourceBackup, operations,
  };
}
