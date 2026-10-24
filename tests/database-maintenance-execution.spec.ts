import { expect, test } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173";

test.beforeEach(async ({ page }) => {
  await page.goto(new URL("/export", BASE_URL).toString(), { waitUntil: "domcontentloaded" });
  await page.evaluate(async () => {
    const db = (window as any).__db;
    await db.exercises.clear(); await db.sessions.clear();
  });
});

test("clean multi-table execution preserves unrelated fields, verifies, and is idempotent", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const db = (window as any).__db;
    await db.exercises.put({ id: "exercise-1", name: "Elliptical", normalizedName: "elliptical", metricMode: "reps", equipmentTags: [], createdAt: 1, summary: "keep" });
    await db.sessions.put({ id: "session-1", startedAt: 1, endedAt: 2, notes: "before", templateName: "keep" });
    const module = await import("/src/domain/maintenance/executeMaintenanceScript.ts");
    const script = JSON.stringify({ format: "ironforge-db-maintenance", version: 1, id: "phase1-exercise-metadata-2026-10-24", name: "Repair unambiguous exercise metadata", createdAt: "2026-10-24T14:00:00.000Z", operationCount: 2, preconditions: { dbName: db.name, dexieSchemaVersion: db.verno }, operations: [
      { type: "updateRecord", table: "exercises", key: "exercise-1", expect: { metricMode: "reps" }, set: { metricMode: "time" } },
      { type: "updateRecord", table: "sessions", key: "session-1", expect: { notes: "before" }, set: { notes: "after" } },
    ] });
    const adapter = { name: db.name, verno: db.verno, table: (name: string) => ({ get: (key: string) => db.table(name).get(key), count: () => db.table(name).count(), update: (key: string, changes: any) => db.table(name).update(key, changes) }), runReadWriteTransaction: (tables: string[], callback: () => Promise<any>) => db.transaction("rw", ...tables.map((name) => db.table(name)), callback) };
    const options = { dryRunSha256: "fixture-hash", origin: location.origin, hashText: async () => "fixture-hash" };
    const first = await module.executeMaintenanceScript(adapter, script, options);
    const rows = { exercise: await db.exercises.get("exercise-1"), session: await db.sessions.get("session-1") };
    const second = await module.executeMaintenanceScript(adapter, script, options);
    return { first, second, rows };
  });
  expect(result.first).toMatchObject({ committed: true, verified: true, transactionStarted: true, changedCount: 2, alreadySatisfiedCount: 0 });
  expect(result.first.operations.map((row: any) => row.status)).toEqual(["CHANGED", "CHANGED"]);
  expect(result.rows.exercise).toMatchObject({ metricMode: "time", summary: "keep", name: "Elliptical" });
  expect(result.rows.session).toMatchObject({ notes: "after", templateName: "keep" });
  expect(result.second).toMatchObject({ committed: true, verified: true, changedCount: 0, alreadySatisfiedCount: 2 });
});

test("an unexpected later write failure rolls back an earlier update", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const db = (window as any).__db;
    await db.exercises.bulkPut([
      { id: "first", name: "Elliptical", normalizedName: "elliptical", metricMode: "reps", equipmentTags: [], createdAt: 1 },
      { id: "second", name: "Rowing Machine", normalizedName: "rowing machine", metricMode: "reps", equipmentTags: [], createdAt: 1 },
    ]);
    const module = await import("/src/domain/maintenance/executeMaintenanceScript.ts");
    const operations = ["first", "second"].map((key) => ({ type: "updateRecord", table: "exercises", key, expect: { metricMode: "reps" }, set: { metricMode: "time" } }));
    const script = JSON.stringify({ format: "ironforge-db-maintenance", version: 1, id: "rollback-001", name: "Rollback", createdAt: "2026-10-24T14:00:00.000Z", operationCount: 2, preconditions: { dbName: db.name, dexieSchemaVersion: db.verno }, operations });
    const adapter = { name: db.name, verno: db.verno, table: (name: string) => ({ get: (key: string) => db.table(name).get(key), count: () => db.table(name).count(), update: (key: string, changes: any) => key === "second" ? Promise.reject(new Error("Injected update failure")) : db.table(name).update(key, changes) }), runReadWriteTransaction: (tables: string[], callback: () => Promise<any>) => db.transaction("rw", ...tables.map((name) => db.table(name)), callback) };
    const report = await module.executeMaintenanceScript(adapter, script, { dryRunSha256: "hash", origin: location.origin, hashText: async () => "hash" });
    return { report, first: await db.exercises.get("first"), second: await db.exercises.get("second") };
  });
  expect(result.report).toMatchObject({ committed: false, verified: false, transactionStarted: true, changedCount: 0 });
  expect(result.report.operations.map((row: any) => row.status)).toEqual(["ROLLED_BACK", "FAILED"]);
  expect(result.first.metricMode).toBe("reps"); expect(result.second.metricMode).toBe("reps");
});

test("last-moment missing data refuses the transaction and post-commit verification failures are distinct", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const db = (window as any).__db;
    await db.exercises.put({ id: "row", name: "Stationary Bike", normalizedName: "stationary bike", metricMode: "reps", equipmentTags: [], createdAt: 1 });
    const module = await import("/src/domain/maintenance/executeMaintenanceScript.ts");
    const script = JSON.stringify({ format: "ironforge-db-maintenance", version: 1, id: "verify-001", name: "Verify", createdAt: "2026-10-24T14:00:00.000Z", operationCount: 1, preconditions: { dbName: db.name, dexieSchemaVersion: db.verno }, operations: [{ type: "updateRecord", table: "exercises", key: "row", expect: { metricMode: "reps" }, set: { metricMode: "time" } }] });
    let committed = false;
    const verifyAdapter = { name: db.name, verno: db.verno, table: (name: string) => ({ get: async (key: string) => committed ? { ...(await db.table(name).get(key)), metricMode: "wrong" } : db.table(name).get(key), count: () => db.table(name).count(), update: (key: string, changes: any) => db.table(name).update(key, changes) }), runReadWriteTransaction: async (tables: string[], callback: () => Promise<any>) => { const value = await db.transaction("rw", ...tables.map((name) => db.table(name)), callback); committed = true; return value; } };
    const verification = await module.executeMaintenanceScript(verifyAdapter, script, { dryRunSha256: "hash", origin: location.origin, hashText: async () => "hash" });
    await db.exercises.update("row", { metricMode: "reps" });
    const missingAdapter = { name: db.name, verno: db.verno, table: (name: string) => ({ get: (key: string) => db.table(name).get(key), count: () => db.table(name).count(), update: (key: string, changes: any) => db.table(name).update(key, changes) }), runReadWriteTransaction: async (tables: string[], callback: () => Promise<any>) => { await db.exercises.delete("row"); return db.transaction("rw", ...tables.map((name) => db.table(name)), callback); } };
    const missing = await module.executeMaintenanceScript(missingAdapter, script, { dryRunSha256: "hash", origin: location.origin, hashText: async () => "hash" });
    return { verification, missing };
  });
  expect(result.verification).toMatchObject({ committed: true, verified: false, changedCount: 1 });
  expect(result.verification.errors[0].phase).toBe("verification");
  expect(result.missing).toMatchObject({ committed: false, verified: false, transactionStarted: true });
  expect(result.missing.operations[0].status).toBe("FAILED");
});

test("hash mismatch and changed database are refused before a transaction begins", async ({ page }) => {
  const results = await page.evaluate(async () => {
    const db = (window as any).__db;
    await db.exercises.put({ id: "row", name: "Stair Climber", normalizedName: "stair climber", metricMode: "reps", equipmentTags: [], createdAt: 1 });
    const module = await import("/src/domain/maintenance/executeMaintenanceScript.ts");
    const script = JSON.stringify({ format: "ironforge-db-maintenance", version: 1, id: "refuse-001", name: "Refuse", createdAt: "2026-10-24T14:00:00.000Z", operationCount: 1, preconditions: { dbName: db.name, dexieSchemaVersion: db.verno }, operations: [{ type: "updateRecord", table: "exercises", key: "row", expect: { metricMode: "reps" }, set: { metricMode: "time" } }] });
    let transactions = 0;
    const adapter = { name: db.name, verno: db.verno, table: (name: string) => ({ get: (key: string) => db.table(name).get(key), count: () => db.table(name).count(), update: (key: string, changes: any) => db.table(name).update(key, changes) }), runReadWriteTransaction: async () => { transactions += 1; } };
    const hash = await module.executeMaintenanceScript(adapter, script, { dryRunSha256: "expected", origin: location.origin, hashText: async () => "different" });
    await db.exercises.update("row", { metricMode: "distance" });
    const changed = await module.executeMaintenanceScript(adapter, script, { dryRunSha256: "expected", origin: location.origin, hashText: async () => "expected" });
    return { hash, changed, transactions };
  });
  expect(results.transactions).toBe(0);
  expect(results.hash).toMatchObject({ committed: false, transactionStarted: false });
  expect(results.changed).toMatchObject({ committed: false, transactionStarted: false });
});

test("a last-moment expectation conflict aborts before any maintenance update", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const db = (window as any).__db;
    await db.exercises.put({ id: "row", name: "Incline Treadmill Walk", normalizedName: "incline treadmill walk", metricMode: "reps", equipmentTags: [], createdAt: 1 });
    const module = await import("/src/domain/maintenance/executeMaintenanceScript.ts");
    const script = JSON.stringify({ format: "ironforge-db-maintenance", version: 1, id: "conflict-001", name: "Conflict", createdAt: "2026-10-24T14:00:00.000Z", operationCount: 1, preconditions: { dbName: db.name, dexieSchemaVersion: db.verno }, operations: [{ type: "updateRecord", table: "exercises", key: "row", expect: { metricMode: "reps" }, set: { metricMode: "time" } }] });
    let maintenanceUpdateCalls = 0;
    const adapter = { name: db.name, verno: db.verno, table: (name: string) => ({ get: (key: string) => db.table(name).get(key), count: () => db.table(name).count(), update: (key: string, changes: any) => { maintenanceUpdateCalls += 1; return db.table(name).update(key, changes); } }), runReadWriteTransaction: async (tables: string[], callback: () => Promise<any>) => { await db.exercises.update("row", { metricMode: "distance" }); return db.transaction("rw", ...tables.map((name) => db.table(name)), callback); } };
    const report = await module.executeMaintenanceScript(adapter, script, { dryRunSha256: "hash", origin: location.origin, hashText: async () => "hash" });
    return { report, maintenanceUpdateCalls, row: await db.exercises.get("row") };
  });
  expect(result.report).toMatchObject({ committed: false, transactionStarted: true, changedCount: 0 });
  expect(result.report.operations[0].status).toBe("FAILED"); expect(result.maintenanceUpdateCalls).toBe(0);
  expect(result.row.metricMode).toBe("distance");
});
