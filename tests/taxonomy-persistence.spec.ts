import { expect, test } from '@playwright/test';
import { validatePersistedMovementTaxonomy, taxonomyMergeConflict } from '../src/domain/training/persistedMovementTaxonomy';
import { buildTaxonomyCandidate } from '../src/domain/maintenance/buildTaxonomyCandidate';
import { validateMaintenanceScript } from '../src/domain/maintenance/validateMaintenanceScript';
import { buildDualMovementClassificationDiagnostic } from '../src/domain/training/movementTaxonomyDiagnostic';

const taxonomy = { taxonomyVersion: '1.1.0', disposition: 'pattern', pattern: 'hinge', exerciseLaterality: 'unilateral', provenance: 'reviewed_catalog_mapping' } as const;
test.beforeEach(async ({ page }) => {
  await page.route('**/__taxonomy-fixture', route => route.fulfill({ contentType: 'text/html', body: '<html><body>Isolated synthetic fixture</body></html>' }));
});
test('persisted contract rejects invalid/version/conflict/redundant fields and accepts independent patterns and accessory', () => {
  expect(validatePersistedMovementTaxonomy(taxonomy)).toEqual([]);
  expect(taxonomyMergeConflict({ movementTaxonomy: taxonomy }, {})).toContain('review');
  expect(taxonomyMergeConflict({ movementTaxonomy: taxonomy }, { movementTaxonomy: { ...taxonomy } })).toBeUndefined();
  for (const patch of [{ taxonomyVersion: 'future' }, { pattern: 'single_leg' }, { family: 'lunge' }, { provenance: 'legacy_name_fallback' }, { performedSetLaterality: 'unilateral' }, { exerciseLaterality: '' }]) expect(validatePersistedMovementTaxonomy({ ...taxonomy, ...patch }).length).toBeGreaterThan(0);
  for (const pattern of ['core', 'glute_extension', 'rotation', 'anti_rotation']) expect(validatePersistedMovementTaxonomy({ ...taxonomy, pattern })).toEqual([]);
  expect(validatePersistedMovementTaxonomy({ taxonomyVersion: '1.1.0', disposition: 'accessory', exerciseLaterality: 'unknown', provenance: 'reviewed_catalog_mapping' })).toEqual([]);
  expect(validatePersistedMovementTaxonomy({ taxonomyVersion: '1.1.0', family: 'pull', exerciseLaterality: 'unknown', provenance: 'legacy_broad_metadata' })).toEqual([]);
});

test('candidate targets exact canonical IDs and restricts every operation to taxonomy only', () => {
  const row: any = { id: 'canonical', name: 'Hinge', normalizedName: 'hinge', equipmentTags: [], createdAt: 1 };
  const args: any = { id: 'fixture-candidate', createdAt: '2026-11-28T12:00:00Z', dbName: 'fixture', schemaVersion: 19, sourceBackup: {}, exercises: [row], mappings: [{ canonicalExerciseId: 'canonical', taxonomy }] };
  const candidate = buildTaxonomyCandidate(args);
  expect(validateMaintenanceScript(candidate).valid).toBe(true);
  expect(candidate.taxonomyReview).toBe('candidate');
  expect(() => buildTaxonomyCandidate({ ...args, mappings: [{ canonicalExerciseId: 'missing', taxonomy }] })).toThrow('Missing');
  expect(() => buildTaxonomyCandidate({ ...args, exercises: [{ ...row, mergedIntoExerciseId: 'other' }] })).toThrow('noncanonical');
  expect(() => buildTaxonomyCandidate({ ...args, mappings: [...args.mappings, ...args.mappings] })).toThrow('Duplicate');
  const bad: any = structuredClone(candidate);
  bad.operations[0].set.movementPattern = 'lunge';
  expect(validateMaintenanceScript(bad).valid).toBe(false);
  bad.operations = [{ type: 'repointTrackExercise', trackId: 'track', expectExerciseId: 'old', setExerciseId: 'new' }];
  expect(validateMaintenanceScript(bad).valid).toBe(false);
});

test('legacy residual and accessory comparisons count each eligible set exactly once', () => {
  const events: any[] = [
    { setId: 'bucket', canonicalExerciseId: 'curl', movementPattern: 'pull' },
    { setId: 'exempt', canonicalExerciseId: 'hip', movementPatternExempt: true },
    { setId: 'unknown', canonicalExerciseId: 'unknown' },
    { setId: 'orphan' },
    { setId: 'control', canonicalExerciseId: 'hip', kind: 'control' },
  ].map(e => ({ at: 1000, sessionId: 'session', kind: 'working', unilateralSide: false, trainingRole: 'untagged', ...e }));
  const mappings: any[] = ['curl', 'hip'].map(canonicalExerciseId => ({ canonicalExerciseId, disposition: 'accessory', provenance: 'reviewed_catalog_mapping', reviewStatus: 'candidate' }));
  const period = buildDualMovementClassificationDiagnostic({ events, candidateMappings: mappings, asOf: 2000 }).periods.find(p => p.kind === 'all_history')!;
  expect(period.legacyAccounting).toEqual({ classified: 1, accessory_residual: 1, unclassified: 1, unresolved_identity: 1 });
  expect(period.accessoryComparison).toEqual({ total: 2, inLegacyCompoundBuckets: 1, outsideLegacyCompoundBuckets: 1 });
  expect(Object.values(period.accounting).reduce((a, b) => a + b, 0)).toBe(4);
  expect(period.compoundFamilyRollups).toEqual({});
  expect(period.controlExposureCount).toBe(1);
});

test('isolated candidate refusal, approved synthetic apply, idempotence, changed identity conflicts and transactional rollback', async ({ page }) => {
  await page.goto('/__taxonomy-fixture');
  const result = await page.evaluate(async () => {
    const { db } = await import('/src/db.ts');
    const { buildTaxonomyCandidate } = await import('/src/domain/maintenance/buildTaxonomyCandidate.ts');
    const { dryRunMaintenanceScript } = await import('/src/domain/maintenance/dryRunMaintenanceScript.ts');
    const { executeMaintenanceScript, createDexieMaintenanceExecutionDatabase, sha256MaintenanceText } = await import('/src/domain/maintenance/executeMaintenanceScript.ts');
    const taxonomy: any = { taxonomyVersion: '1.1.0', disposition: 'pattern', pattern: 'hinge', exerciseLaterality: 'unilateral', provenance: 'reviewed_catalog_mapping' };
    const rows: any[] = ['one', 'two'].map(id => ({ id, name: id, normalizedName: id, createdAt: 1, equipmentTags: [], movementPattern: 'hinge' }));
    await db.exercises.clear(); await db.exercises.bulkPut(rows);
    const script = buildTaxonomyCandidate({ id: 'synthetic-fixture', createdAt: '2026-11-28T12:00:00Z', dbName: db.name, schemaVersion: db.verno, sourceBackup: {}, exercises: rows, mappings: rows.map(row => ({ canonicalExerciseId: row.id, taxonomy })) });
    const adapter = createDexieMaintenanceExecutionDatabase(db);
    const run = async (value: any, target = adapter) => { const text = JSON.stringify(value); return executeMaintenanceScript(target, text, { dryRunSha256: await sha256MaintenanceText(text), origin: location.origin }); };
    const before = await db.exercises.toArray();
    const dry = await dryRunMaintenanceScript(adapter, script);
    const refused = await run(script);
    const immutable = JSON.stringify(before) === JSON.stringify(await db.exercises.toArray());
    // Synthetic fixture approval only; never generates an approved production artifact.
    const approved: any = { ...script, taxonomyReview: 'approved' };
    const applied = await run(approved);
    const repeated = await run(approved);
    await db.exercises.update('one', { mergedIntoExerciseId: 'two' });
    const identityConflict = await dryRunMaintenanceScript(adapter, approved);
    await db.exercises.clear(); await db.exercises.bulkPut(rows);
    const failureAdapter = { ...adapter, table: (name: any) => ({ ...adapter.table(name), update: async (key: string, changes: any) => { if (key === 'two') throw new Error('injected failure'); return adapter.table(name).update(key, changes); } }) };
    const rolledBack = await run(approved, failureAdapter);
    const recovered = JSON.stringify(before) === JSON.stringify(await db.exercises.toArray());
    await db.exercises.delete('two');
    const missing = await dryRunMaintenanceScript(adapter, approved);
    await db.exercises.update('one', { strengthSignalRole: 'excluded' });
    const changed = await dryRunMaintenanceScript(adapter, approved);
    return { dry, refused, immutable, applied, repeated, identityConflict, rolledBack, recovered, missing, changed };
  });
  expect(result.dry.wouldChangeCount).toBe(2);
  expect(result.immutable).toBe(true);
  expect(result.refused).toMatchObject({ committed: false, transactionStarted: false });
  expect(result.applied).toMatchObject({ committed: true, verified: true, changedCount: 2 });
  expect(result.repeated.alreadySatisfiedCount).toBe(2);
  expect(result.identityConflict.conflictCount).toBe(1);
  expect(result.rolledBack).toMatchObject({ committed: false, changedCount: 0 });
  expect(result.recovered).toBe(true);
  expect(result.missing.notFoundCount).toBe(1);
  expect(result.changed.conflictCount).toBe(1);
});

test('real backup export and restore preserve optional taxonomy and old backups; edits and merges preserve target metadata', async ({ page }) => {
  await page.goto('/__taxonomy-fixture');
  await page.evaluate(async () => {
    const { db } = await import('/src/db.ts');
    const { createExerciseRecord } = await import('/src/domain/exercises/createExercise.ts');
    await db.exercises.clear();
    const row = createExerciseRecord({ name: 'Synthetic Target', knownMetadata: { movementTaxonomy: { taxonomyVersion: '1.1.0', disposition: 'accessory', exerciseLaterality: 'unknown', provenance: 'explicit_metadata' } } });
    await db.exercises.add({ ...row, id: 'target' });
    await db.exercises.add({ ...createExerciseRecord({ name: 'Synthetic Old' }), id: 'old' });
    await db.exercises.update('target', { summary: 'edited without replacing taxonomy' });
  });
  const downloadPromise = page.waitForEvent('download');
  await page.evaluate(async () => { const { backupDbToDownload } = await import('/src/dbBackup.ts'); await backupDbToDownload(); });
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = []; for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const text = Buffer.concat(chunks).toString('utf8');
  const result = await page.evaluate(async (text) => {
    const { db } = await import('/src/db.ts');
    const { restoreDbFromJsonText } = await import('/src/dbBackup.ts');
    const saved = JSON.parse(text).tables.exercises;
    await db.exercises.clear(); await restoreDbFromJsonText(text);
    const emptyRestore = await db.exercises.toArray();
    await db.exercises.update('target', { summary: 'overwrite on restore is existing semantics' });
    await restoreDbFromJsonText(text);
    const existingRestore = await db.exercises.toArray();
    const { resolveExerciseToCanonicalAlias } = await import('/src/domain/exercises/exerciseResolver.ts');
    await resolveExerciseToCanonicalAlias({ sourceExerciseId: 'old', canonicalExerciseId: 'target' });
    return { saved, emptyRestore, existingRestore, target: await db.exercises.get('target'), source: await db.exercises.get('old') };
  }, text);
  expect(result.emptyRestore).toEqual(result.saved);
  expect(result.existingRestore).toEqual(result.saved);
  expect(result.target?.movementTaxonomy?.disposition).toBe('accessory');
  expect(result.source?.mergedIntoExerciseId).toBe('target');
  expect(result.source?.movementTaxonomy).toBeUndefined();
});
