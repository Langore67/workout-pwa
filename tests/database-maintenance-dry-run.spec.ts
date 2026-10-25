import { expect, test } from "@playwright/test";
import { dryRunMaintenanceScript, jsonDeepEqual, type ReadonlyMaintenanceDatabase } from "../src/domain/maintenance/dryRunMaintenanceScript";
import type { MaintenanceScriptV1 } from "../src/domain/maintenance/maintenanceTypes";

function script(operations: any[], preconditions: any = {}) { return { format: "ironforge-db-maintenance", version: 1, id: "dry-run-001", name: "Dry run", createdAt: "2026-10-24T14:00:00.000Z", operationCount: operations.length, preconditions: { dbName: "workout_mvp_db", dexieSchemaVersion: 19, ...preconditions }, operations } as MaintenanceScriptV1; }
function operation(key: string, expectValue: any, setValue: any) { return { type: "updateRecord", table: "exercises", key, expect: expectValue, set: setValue }; }
function memoryDb(rows: Record<string, any>): ReadonlyMaintenanceDatabase {
  const tables: Record<string, Record<string, any>> = { exercises: rows, sessions: {}, tracks: {}, sets: {}, bodyMetrics: {}, bodyMeasurements: {}, app_meta: {} };
  return { name: "workout_mvp_db", verno: 19, table: (name) => ({ get: async (key) => tables[name]?.[key], count: async () => Object.keys(tables[name] ?? {}).length }) };
}

test("dry run classifies would-change, already-satisfied, conflict, and not-found in source order", async () => {
  const db = memoryDb({ change: { id: "change", movementPattern: null }, satisfied: { id: "satisfied", movementPattern: "pull" }, conflict: { id: "conflict", movementPattern: "push" } });
  const result = await dryRunMaintenanceScript(db, script([
    operation("change", { movementPattern: null }, { movementPattern: "pull" }), operation("satisfied", { movementPattern: null }, { movementPattern: "pull" }),
    operation("conflict", { movementPattern: null }, { movementPattern: "pull" }), operation("absent", { movementPattern: null }, { movementPattern: "pull" }),
  ]), { generatedAt: "2026-10-24T15:00:00.000Z" });
  expect(result.operations.map((row) => row.status)).toEqual(["WOULD_CHANGE", "ALREADY_SATISFIED", "CONFLICT", "NOT_FOUND"]);
  expect(result).toMatchObject({ wouldChangeCount: 1, alreadySatisfiedCount: 1, conflictCount: 1, notFoundCount: 1, invalidCount: 0, dataModified: false });
});

test("missing properties differ from null and nested arrays use strict deterministic equality", async () => {
  expect(jsonDeepEqual([1, { a: null }], [1, { a: null }])).toBe(true);
  expect(jsonDeepEqual([1], { 0: 1 })).toBe(false);
  const db = memoryDb({ missing: { id: "missing" }, nested: { id: "nested", aliases: ["A", "B"] } });
  const result = await dryRunMaintenanceScript(db, script([
    operation("missing", { movementPattern: null }, { movementPattern: "pull" }),
    operation("nested", { aliases: ["A", "B"] }, { aliases: ["A", "B"] }),
  ]));
  expect(result.operations.map((row) => row.status)).toEqual(["CONFLICT", "ALREADY_SATISFIED"]);
  expect(result.operations[0].before.movementPattern).toEqual({ missing: true });
});

test("runtime preconditions and invalid operations are factual INVALID results", async () => {
  const db = memoryDb({ row: { id: "row", movementPattern: null } });
  const mismatch = await dryRunMaintenanceScript(db, script([operation("row", { movementPattern: null }, { movementPattern: "pull" })], { dbName: "wrong", dexieSchemaVersion: 18 }));
  expect(mismatch.invalidCount).toBe(1); expect(mismatch.preconditionErrors.map((error) => error.code)).toEqual(["DB_NAME_MISMATCH", "SCHEMA_VERSION_MISMATCH"]);
  const invalid = await dryRunMaintenanceScript(db, script([{ ...operation("row", { movementPattern: null }, { movementPattern: "pull" }), table: "templates" } as any]));
  expect(invalid.operations[0].status).toBe("INVALID");
});

test("source counts are provenance warnings and dry run performs zero writes or input mutation", async () => {
  const records = { row: { id: "row", movementPattern: null, unrelated: "preserved" } };
  const before = JSON.stringify(records);
  const source = script([operation("row", { movementPattern: null }, { movementPattern: "pull" })]) as any;
  source.sourceBackup = { exportedAt: "2026-10-23T12:00:00.000Z", recordCounts: { exercises: 9 } };
  const sourceBefore = JSON.stringify(source);
  const db = memoryDb(records);
  const result = await dryRunMaintenanceScript(db, source);
  expect(result.warnings).toContain("Source backup exercises count is 9; current database count is 1.");
  expect(JSON.stringify(records)).toBe(before); expect(JSON.stringify(source)).toBe(sourceBefore); expect(records.row.unrelated).toBe("preserved");
  expect(Object.keys(db.table("exercises")).sort()).toEqual(["count", "get"]);
});

test("focusArea uses unchanged would-change, already-satisfied, and conflict semantics", async () => {
  const records = {
    change: { id: "change", focusArea: null },
    satisfied: { id: "satisfied", focusArea: "Upper Back" },
    conflict: { id: "conflict", focusArea: "Lats" },
  };
  const before = JSON.stringify(records);
  const result = await dryRunMaintenanceScript(memoryDb(records), script([
    operation("change", { focusArea: null }, { focusArea: "Upper Back" }),
    operation("satisfied", { focusArea: null }, { focusArea: "Upper Back" }),
    operation("conflict", { focusArea: null }, { focusArea: "Upper Back" }),
  ]));

  expect(result.operations.map((row) => row.status)).toEqual(["WOULD_CHANGE", "ALREADY_SATISFIED", "CONFLICT"]);
  expect(result.operations[0].changedFields).toEqual(["focusArea"]);
  expect(result.operations[1].changedFields).toEqual([]);
  expect(result.operations[2].changedFields).toEqual(["focusArea"]);
  expect(JSON.stringify(records)).toBe(before);
});
