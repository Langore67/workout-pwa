import { expect, test } from '@playwright/test';
import { jsonDeepEqual, taxonomyRecordDifferences, taxonomyRecordMatches } from '../src/domain/maintenance/dryRunMaintenanceScript';

test('snapshot equivalence ignores only undefined object properties and reports genuine field differences', () => {
  const expected: any = { id: 'one', createdAt: 1, name: 'Hinge', equipmentTags: ['barbell'], details: { cue: 'brace' } };
  expect(taxonomyRecordMatches({ ...expected, summary: undefined, details: { cue: 'brace', optional: undefined } }, expected)).toBe(true);
  // The shared strict comparator remains unchanged for every other maintenance use.
  expect(jsonDeepEqual({ summary: undefined }, {})).toBe(false);
  for (const patch of [
    { summary: null }, { summary: '' }, { summary: false }, { summary: 0 },
    { metricMode: 'reps' }, { id: 'other' }, { name: 'Other' }, { createdAt: 2 },
    { archivedAt: 1 }, { mergedIntoExerciseId: 'other' }, { aliases: [] },
    { equipmentTags: ['barbell', 'cable'] }, { equipmentTags: [undefined] },
    { details: { cue: 'changed' } }, { movementTaxonomy: null },
    { movementTaxonomy: { pattern: 'squat' } },
  ]) expect(taxonomyRecordMatches({ ...expected, ...patch }, expected)).toBe(false);
  expect(taxonomyRecordMatches({ ...expected, equipmentTags: [undefined] }, { ...expected, equipmentTags: [null] })).toBe(false);
  expect(taxonomyRecordDifferences({ ...expected, details: { cue: 'changed' }, summary: null }, expected)).toEqual([
    { path: 'details.cue', expected: '"brace"', actual: '"changed"' },
    { path: 'summary', expected: '<missing>', actual: 'null' },
  ]);
});

test('IndexedDB preserves undefined keys omitted by JSON backup snapshots', async ({ page }) => {
  await page.route('**/__maintenance-live-records', route => route.fulfill({ contentType: 'text/html', body: '<html></html>' }));
  await page.goto('/__maintenance-live-records');
  const result = await page.evaluate(async () => {
    const { db } = await import('/src/db.ts');
    const { jsonDeepEqual, taxonomyRecordMatches } = await import('/src/domain/maintenance/dryRunMaintenanceScript.ts');
    const rows: any[] = [
      { id: 'thin', name: 'Synthetic accessory', normalizedName: 'synthetic accessory', createdAt: 1, equipmentTags: [], metricMode: undefined, cuesSetup: undefined, cuesExecution: undefined },
      { id: 'rdl', name: 'Synthetic RDL', normalizedName: 'synthetic rdl', createdAt: 1, equipmentTags: [], metricMode: 'reps', cuesSetup: ['brace'], cuesExecution: ['hinge'], summary: undefined },
    ];
    await db.exercises.bulkPut(rows);
    return Promise.all(rows.map(async row => {
      const live = await db.exercises.get(row.id) as any;
      const snapshot = JSON.parse(JSON.stringify(live));
      return { id: row.id, undefinedKeys: Object.keys(live).filter(key => live[key] === undefined), snapshotKeys: Object.keys(snapshot), strictEqual: jsonDeepEqual(live, snapshot), matches: taxonomyRecordMatches(live, snapshot) };
    }));
  });
  expect(result[0].undefinedKeys).toEqual(['metricMode', 'cuesSetup', 'cuesExecution']);
  expect(result[1].undefinedKeys).toEqual(['summary']);
  for (const row of result) {
    expect(row.strictEqual).toBe(false);
    expect(row.matches).toBe(true);
    for (const key of row.undefinedKeys) expect(row.snapshotKeys).not.toContain(key);
  }
});

test('live-style records use the same safe snapshot semantics in dry run, transaction and verification', async ({ page }) => {
  await page.route('**/__maintenance-live-records', route => route.fulfill({ contentType: 'text/html', body: '<html></html>' }));
  await page.goto('/__maintenance-live-records');
  const result = await page.evaluate(async () => {
    const { db } = await import('/src/db.ts');
    const { buildTaxonomyCandidate } = await import('/src/domain/maintenance/buildTaxonomyCandidate.ts');
    const { dryRunMaintenanceScript } = await import('/src/domain/maintenance/dryRunMaintenanceScript.ts');
    const { executeMaintenanceScript, createDexieMaintenanceExecutionDatabase, sha256MaintenanceText } = await import('/src/domain/maintenance/executeMaintenanceScript.ts');
    const taxonomy: any = { taxonomyVersion: '1.1.0', disposition: 'pattern', pattern: 'hinge', exerciseLaterality: 'bilateral', provenance: 'reviewed_catalog_mapping' };
    const live: any = { id: 'live', name: 'Synthetic hinge', normalizedName: 'synthetic hinge', createdAt: 1, equipmentTags: [], metricMode: 'reps', cuesSetup: ['brace'], cuesExecution: ['hinge'], summary: undefined };
    await db.exercises.clear(); await db.exercises.put(live);
    const snapshot = JSON.parse(JSON.stringify(live));
    const script: any = { ...buildTaxonomyCandidate({ id: 'live-fixture', createdAt: '2026-11-28T12:00:00Z', dbName: db.name, schemaVersion: db.verno, sourceBackup: {}, exercises: [snapshot], mappings: [{ canonicalExerciseId: 'live', taxonomy }] }), taxonomyReview: 'approved' };
    const adapter = createDexieMaintenanceExecutionDatabase(db);
    const text = JSON.stringify(script); const options = { dryRunSha256: await sha256MaintenanceText(text), origin: location.origin };
    const dry = await dryRunMaintenanceScript(adapter, script);
    const afterDry: any = await db.exercises.get('live');
    const immutable = Object.hasOwn(afterDry, 'summary') && afterDry.summary === undefined && !Object.hasOwn(afterDry, 'movementTaxonomy');
    const applied = await executeMaintenanceScript(adapter, text, options);
    const repeated = await dryRunMaintenanceScript(adapter, script);
    const afterApply: any = await db.exercises.get('live');
    await db.exercises.put({ ...live, summary: null });
    const conflict = await dryRunMaintenanceScript(adapter, script);
    const refused = await executeMaintenanceScript(adapter, text, options);
    await db.exercises.put(live);
    // A defined change after the executor's fresh dry run must still abort inside its transaction.
    const raceAdapter = { ...adapter, runReadWriteTransaction: (tables: any, callback: any) => adapter.runReadWriteTransaction(tables, async () => {
      await db.exercises.put({ ...live, summary: null });
      return callback();
    }) };
    const race = await executeMaintenanceScript(raceAdapter, text, options);
    const recovered: any = await db.exercises.get('live');
    return { dry, immutable, applied, repeated, preservedUndefined: Object.hasOwn(afterApply, 'summary') && afterApply.summary === undefined, conflict, refused, race, recoveredUndefined: Object.hasOwn(recovered, 'summary') && recovered.summary === undefined && !Object.hasOwn(recovered, 'movementTaxonomy') };
  });
  expect(result.dry.wouldChangeCount).toBe(1);
  expect(result.immutable).toBe(true);
  expect(result.applied).toMatchObject({ committed: true, verified: true, changedCount: 1 });
  expect(result.repeated.alreadySatisfiedCount).toBe(1);
  expect(result.preservedUndefined).toBe(true);
  expect(result.conflict.conflictCount).toBe(1);
  expect(result.conflict.operations[0].snapshotDifferences).toEqual([{ path: 'summary', expected: '<missing>', actual: 'null' }]);
  expect(result.refused).toMatchObject({ committed: false, transactionStarted: false });
  expect(result.race).toMatchObject({ committed: false, transactionStarted: true });
  expect(result.race.errors[0].message).toContain('summary: expected <missing>; actual null');
  expect(result.recoveredUndefined).toBe(true);
});
