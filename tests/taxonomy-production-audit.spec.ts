import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

// Opt-in private audit: input and outputs must be outside the repository.
test.use({ timezoneId: 'America/New_York', trace: 'off', video: 'off', screenshot: 'off' });
test('private backup candidate dry run and historical invariance', async ({ page }, testInfo) => {
  test.skip(!process.env.IRONFORGE_AUDIT_BACKUP || !process.env.IRONFORGE_AUDIT_DIRECTORY, 'Requires explicit private audit paths.');
  test.setTimeout(600000);
  const backupPath = path.resolve(process.env.IRONFORGE_AUDIT_BACKUP!);
  const directory = path.resolve(process.env.IRONFORGE_AUDIT_DIRECTORY!);
  const repo = path.resolve('.');
  for (const target of [backupPath, directory]) expect(path.relative(repo, target).startsWith('..')).toBe(true);
  const backupText = fs.readFileSync(backupPath, 'utf8');
  const hash = createHash('sha256').update(backupText).digest('hex').toUpperCase();
  expect(hash).toBe(process.env.IRONFORGE_AUDIT_HASH);
  const backup = JSON.parse(backupText);
  expect(backup.meta.exportedAt).toBe('2026-11-27T14:56:26.037Z');
  const selections = JSON.parse(fs.readFileSync(path.join(directory, 'candidate-selections.json'), 'utf8')).selections;
  expect(selections).toHaveLength(34);
  page.on('console', message => { if (message.text().startsWith('AUDIT_STAGE')) console.log(message.text()); });
  await page.route('**/__taxonomy-audit', route => route.fulfill({ contentType: 'text/html', body: '<html><body>Isolated taxonomy audit</body></html>' }));
  await page.goto('/__taxonomy-audit');
  const result = await page.evaluate(async ({ backup, selections, hash }) => {
    const { db } = await import('/src/db.ts');
    const { buildTaxonomyCandidate } = await import('/src/domain/maintenance/buildTaxonomyCandidate.ts');
    const { dryRunMaintenanceScript } = await import('/src/domain/maintenance/dryRunMaintenanceScript.ts');
    const { executeMaintenanceScript, createDexieMaintenanceExecutionDatabase, sha256MaintenanceText } = await import('/src/domain/maintenance/executeMaintenanceScript.ts');
    const { buildTrainingExposureEventSource } = await import('/src/domain/training/trainingExposureContext.ts');
    const { buildDualMovementClassificationDiagnostic } = await import('/src/domain/training/movementTaxonomyDiagnostic.ts');
    const { getMovementTaxonomyFamily } = await import('/src/domain/training/movementTaxonomyContract.ts');
    const { computeStrengthTrend, computeStrengthIndexAt } = await import('/src/strength/Strength.ts');
    const { buildCoachExportMetrics } = await import('/src/lib/coachExport/buildCoachExportMetrics.ts');
    const { formatCoachExportText } = await import('/src/lib/coachExport/formatCoachExportText.ts');
    const asOf = Date.parse('2026-11-27T13:51:00.000Z');
    const originalNow = Date.now;
    Date.now = () => asOf;
    try {
      console.log('AUDIT_STAGE restore');
      // This Playwright context has its own disposable IndexedDB, never the user's browser profile.
      await db.transaction('rw', db.tables, async () => {
        for (const table of db.tables) {
          console.log(`AUDIT_STAGE restore ${table.name}`);
          await table.clear();
          const rows = backup.tables[table.name] ?? [];
          for (let offset = 0; offset < rows.length; offset += 200) await table.bulkPut(rows.slice(offset, offset + 200));
        }
      });
      const records = async () => Object.fromEntries(await Promise.all(db.tables.map(async table => [table.name, await table.toArray()])));
      const beforeRecords = await records();
      console.log('AUDIT_STAGE restored');
      const mappings = selections.map(([canonicalExerciseId, group, pattern, exerciseLaterality]: string[]) => ({
        canonicalExerciseId, group,
        taxonomy: { taxonomyVersion: '1.1.0', disposition: pattern === 'accessory' ? 'accessory' : 'pattern', ...(pattern !== 'accessory' ? { pattern } : {}), exerciseLaterality, provenance: 'reviewed_catalog_mapping' },
      }));
      const candidate = buildTaxonomyCandidate({ id: 'training-taxonomy-e1-candidate-2026-11-28', createdAt: '2026-11-28T12:00:00.000Z', dbName: db.name, schemaVersion: db.verno, sourceBackup: { sha256: hash, exportedAt: backup.meta.exportedAt }, exercises: backup.tables.exercises, mappings });
      const source = buildTrainingExposureEventSource({ ...backup.tables, asOf });
      const diagnosticMappings = mappings.map((m: any) => ({ canonicalExerciseId: m.canonicalExerciseId, ...m.taxonomy, reviewStatus: 'candidate' }));
      const diagnostic = buildDualMovementClassificationDiagnostic({ events: source.events, candidateMappings: diagnosticMappings, asOf });
      const inventory = mappings.map((mapping: any) => {
        const exercise = backup.tables.exercises.find((row: any) => row.id === mapping.canonicalExerciseId);
        const frequencies = Object.fromEntries(diagnostic.periods.map((period: any) => [period.kind, source.events.filter((e: any) => e.canonicalExerciseId === exercise.id && e.kind !== 'control' && e.at >= (period.startAt ?? -Infinity) && (period.kind === 'previous_complete_week' ? e.at < period.endAt : e.at <= period.endAt)).length]));
        return { ...mapping, exercise, family: mapping.taxonomy.pattern ? getMovementTaxonomyFamily(mapping.taxonomy.pattern) ?? null : null, frequencies, reviewStatus: 'candidate', rationale: mapping.group === 'C' ? 'Reviewed isolation/accessory identity; compound-pattern exposure is inappropriate.' : mapping.group === 'D' ? 'Reviewed scapular pull-up identity; vertical-pull classification does not assign set intent.' : 'Reviewed canonical exercise identity; existing structured metadata is corroboration, not automatic classification approval.', expectedCurrentMetadata: candidate.operations.find((op: any) => op.key === exercise.id) };
      });
      const adapter = createDexieMaintenanceExecutionDatabase(db);
      const candidateText = JSON.stringify(candidate);
      const dryRun = await dryRunMaintenanceScript(adapter, candidate);
      const refused = await executeMaintenanceScript(adapter, candidateText, { origin: location.origin, dryRunSha256: await sha256MaintenanceText(candidateText) });
      const afterRecords = await records();
      const capture = async () => {
        console.log('AUDIT_STAGE metrics');
        const metrics = await buildCoachExportMetrics();
        console.log('AUDIT_STAGE historical trend');
        return { trend: await computeStrengthTrend(52, 28), current: await computeStrengthIndexAt(asOf, 28), prior: await computeStrengthIndexAt(asOf - 14 * 86400000, 28), metrics, exportText: formatCoachExportText(metrics) };
      };
      const before = await capture();
      console.log('AUDIT_STAGE before capture complete');
      const beforeApplication = await records();
      await db.transaction('rw', db.exercises, async () => {
        for (const mapping of mappings) await db.exercises.update(mapping.canonicalExerciseId, { movementTaxonomy: mapping.taxonomy });
      });
      const afterApplication = await records();
      const withoutTaxonomy = (tables: any) => ({ ...tables, exercises: tables.exercises.map(({ movementTaxonomy, ...exercise }: any) => exercise) });
      const onlyTaxonomyChanged = JSON.stringify(withoutTaxonomy(beforeApplication)) === JSON.stringify(withoutTaxonomy(afterApplication));
      buildDualMovementClassificationDiagnostic({ events: source.events, candidateMappings: diagnosticMappings, asOf });
      const after = await capture();
      await db.transaction('rw', db.exercises, async () => { for (const mapping of mappings) await db.exercises.put(beforeApplication.exercises.find((e: any) => e.id === mapping.canonicalExerciseId)); });
      const recoveryRecordsExact = JSON.stringify(beforeApplication) === JSON.stringify(await records());
      console.log('AUDIT_STAGE recovered');
      return { candidate, inventory, diagnostic, dryRun, refused, onlyTaxonomyChanged, recoveryRecordsExact, recordsUnchanged: JSON.stringify(beforeRecords) === JSON.stringify(afterRecords), invariant: JSON.stringify(before) === JSON.stringify(after), baseline: before, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone };
    } finally { Date.now = originalNow; }
  }, { backup, selections, hash });
  expect(result.recordsUnchanged).toBe(true);
  expect(result.invariant).toBe(true);
  expect(result.onlyTaxonomyChanged).toBe(true);
  expect(result.recoveryRecordsExact).toBe(true);
  expect(result.dryRun).toMatchObject({ wouldChangeCount: 34, alreadySatisfiedCount: 0, conflictCount: 0, notFoundCount: 0, invalidCount: 0 });
  expect(result.refused).toMatchObject({ transactionStarted: false, committed: false });
  const prefix = testInfo.project.name;
  fs.writeFileSync(path.join(directory, `${prefix}-audit.json`), JSON.stringify(result, null, 2));
  fs.writeFileSync(path.join(directory, 'candidate-maintenance.json'), JSON.stringify(result.candidate, null, 2));
  fs.writeFileSync(path.join(directory, 'mapping-inventory.json'), JSON.stringify(result.inventory, null, 2));
  console.log(JSON.stringify({ project: prefix, invariant: result.invariant, dryRun: { applicable: result.dryRun.wouldChangeCount }, periods: result.diagnostic.periods.map((p: any) => ({ period: p.kind, total: p.qualifyingSetCount, legacy: p.legacyAccounting, accessory: p.accessoryComparison })) }));
});
