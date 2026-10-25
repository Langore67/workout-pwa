import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dryRunMaintenanceScript, type ReadonlyMaintenanceDatabase } from "../src/domain/maintenance/dryRunMaintenanceScript";
import { validateMaintenanceScript } from "../src/domain/maintenance/validateMaintenanceScript";
import type { MaintenanceScriptV1 } from "../src/domain/maintenance/maintenanceTypes";

const uprightId = "32ded081-60ef-4646-9eca-4622c9730bbf";
const rowId = "56eade53-8089-4467-b26e-992f1634ae86";
const archivedAt = 1776789499789;
const mergeNote = "Merged into Barbell Upright Row on 2026-04-21T16:38:19.789Z";
const restore = { type: "restoreMergedExercise", exerciseId: rowId, expectMergedIntoExerciseId: uprightId, expectArchivedAt: archivedAt, expectMergeNote: mergeNote, targetExerciseId: uprightId, expectTargetAliases: ["Barbell Row", "Barbell Bent Over Row"], setTargetAliases: [] };
const repoint = (trackId = "row-track") => ({ type: "repointTrackExercise", trackId, expectExerciseId: uprightId, setExerciseId: rowId });
const script = (operations: any[]): MaintenanceScriptV1 => ({ format: "ironforge-db-maintenance", version: 1, id: "barbell-row-repair", name: "Repair Barbell Row canonical identity and track references", createdAt: "2026-10-25T12:00:00.000Z", operationCount: operations.length, preconditions: { dbName: "workout_mvp_db", dexieSchemaVersion: 19, supportedBackupVersion: 2 }, operations } as MaintenanceScriptV1);
function memoryDb(exercises: Record<string, any>, tracks: Record<string, any>): ReadonlyMaintenanceDatabase {
  const tables: Record<string, Record<string, any>> = { exercises, tracks, sessions: {}, sets: {}, bodyMetrics: {}, bodyMeasurements: {}, app_meta: {} };
  return { name: "workout_mvp_db", verno: 19, table: (name) => ({ get: async (key) => tables[name]?.[key], count: async () => Object.keys(tables[name] ?? {}).length }) };
}

test("typed reference operations validate without allowing generic reference mutation", () => {
  expect(validateMaintenanceScript(script([restore, repoint()])).valid).toBe(true);
  const generic = script([{ type: "updateRecord", table: "tracks", key: "row-track", expect: { exerciseId: uprightId }, set: { exerciseId: rowId } }]);
  expect(validateMaintenanceScript(generic).errors.some((error) => error.path.endsWith("exerciseId"))).toBe(true);
});

test("the shipped Barbell Row repair script is valid and intentionally omits the genuine Upright Row track", () => {
  const shipped = JSON.parse(readFileSync(new URL("../maintenance/ironforge-repair-barbell-row-2026-10-25.json", import.meta.url), "utf8"));
  expect(validateMaintenanceScript(shipped).errors).toEqual([]);
  expect(shipped.operations.map((operation: any) => operation.trackId).filter(Boolean)).toEqual([
    "67287898-2182-41c7-a8a0-10abf5e19716",
    "81c46d80-0e0e-4836-933d-bfda61b32153",
  ]);
  expect(JSON.stringify(shipped)).not.toContain("b3fafd2f-f8c8-4b4e-9766-26339b61f5b1");
});

test("dry run classifies happy path, conflict, not-found, and idempotent state deterministically", async () => {
  const merged = { id: rowId, archivedAt, mergedIntoExerciseId: uprightId, mergeNote };
  const upright = { id: uprightId, aliases: ["Barbell Row", "Barbell Bent Over Row"] };
  const happy = await dryRunMaintenanceScript(memoryDb({ [rowId]: merged, [uprightId]: upright }, { "row-track": { id: "row-track", exerciseId: uprightId } }), script([restore, repoint()]));
  expect(happy.operations.map((row) => row.status)).toEqual(["WOULD_CHANGE", "WOULD_CHANGE"]);
  const conflict = await dryRunMaintenanceScript(memoryDb({ [rowId]: { ...merged, mergedIntoExerciseId: "other" }, [uprightId]: upright }, { "row-track": { id: "row-track", exerciseId: "other" } }), script([restore, repoint()]));
  expect(conflict.operations.map((row) => row.status)).toEqual(["CONFLICT", "CONFLICT"]);
  const absent = await dryRunMaintenanceScript(memoryDb({ [uprightId]: upright }, {}), script([restore, repoint()]));
  expect(absent.operations.map((row) => row.status)).toEqual(["NOT_FOUND", "NOT_FOUND"]);
  const done = await dryRunMaintenanceScript(memoryDb({ [rowId]: { id: rowId }, [uprightId]: { id: uprightId, aliases: [] } }, { "row-track": { id: "row-track", exerciseId: rowId } }), script([restore, repoint()]));
  expect(done.operations.map((row) => row.status)).toEqual(["ALREADY_SATISFIED", "ALREADY_SATISFIED"]);
});

test("mixed reference repair commits atomically, leaves sets and upright track untouched, and reruns idempotently", async ({ page }) => {
  await page.goto("/export", { waitUntil: "domcontentloaded" });
  const result = await page.evaluate(async ({ uprightId, rowId, archivedAt, mergeNote }) => {
    const db = (window as any).__db;
    await db.exercises.clear(); await db.tracks.clear(); await db.sets.clear();
    await db.exercises.bulkPut([{ id: rowId, name: "Barbell Row", normalizedName: "barbell row", aliases: [], equipmentTags: [], createdAt: 1, archivedAt, mergedIntoExerciseId: uprightId, mergeNote }, { id: uprightId, name: "Barbell Upright Row", normalizedName: "barbell upright row", aliases: ["Barbell Row", "Barbell Bent Over Row"], equipmentTags: [], createdAt: 1 }]);
    await db.tracks.bulkPut([{ id: "row-track", displayName: "Barbell Row", exerciseId: uprightId }, { id: "upright-track", displayName: "Barbell Upright Row", exerciseId: uprightId }]);
    await db.sets.put({ id: "set-1", sessionId: "session", trackId: "row-track", createdAt: 1 });
    const module = await import("/src/domain/maintenance/executeMaintenanceScript.ts");
    const source = JSON.stringify({ format: "ironforge-db-maintenance", version: 1, id: "barbell-row-repair", name: "Repair", createdAt: "2026-10-25T12:00:00.000Z", operationCount: 2, preconditions: { dbName: db.name, dexieSchemaVersion: db.verno }, operations: [{ type: "restoreMergedExercise", exerciseId: rowId, expectMergedIntoExerciseId: uprightId, expectArchivedAt: archivedAt, expectMergeNote: mergeNote, targetExerciseId: uprightId, expectTargetAliases: ["Barbell Row", "Barbell Bent Over Row"], setTargetAliases: [] }, { type: "repointTrackExercise", trackId: "row-track", expectExerciseId: uprightId, setExerciseId: rowId }] });
    const adapter = module.createDexieMaintenanceExecutionDatabase(db); const options = { dryRunSha256: "hash", origin: location.origin, hashText: async () => "hash" };
    const first = await module.executeMaintenanceScript(adapter, source, options); const second = await module.executeMaintenanceScript(adapter, source, options);
    return { first, second, row: await db.exercises.get(rowId), upright: await db.exercises.get(uprightId), rowTrack: await db.tracks.get("row-track"), uprightTrack: await db.tracks.get("upright-track"), set: await db.sets.get("set-1") };
  }, { uprightId, rowId, archivedAt, mergeNote });
  expect(result.first).toMatchObject({ committed: true, verified: true, changedCount: 2 });
  expect(result.row).not.toHaveProperty("archivedAt"); expect(result.row).not.toHaveProperty("mergedIntoExerciseId"); expect(result.row).not.toHaveProperty("mergeNote");
  expect(result.upright.aliases).toEqual([]); expect(result.rowTrack.exerciseId).toBe(rowId); expect(result.uprightTrack.exerciseId).toBe(uprightId); expect(result.set.trackId).toBe("row-track");
  expect(result.second).toMatchObject({ committed: true, verified: true, changedCount: 0, alreadySatisfiedCount: 2 });
});

test("a later typed-operation failure rolls back an earlier restore", async ({ page }) => {
  await page.goto("/export", { waitUntil: "domcontentloaded" });
  const result = await page.evaluate(async ({ uprightId, rowId, archivedAt, mergeNote }) => {
    const db = (window as any).__db; await db.exercises.clear(); await db.tracks.clear();
    await db.exercises.bulkPut([{ id: rowId, name: "Barbell Row", normalizedName: "barbell row", aliases: [], equipmentTags: [], createdAt: 1, archivedAt, mergedIntoExerciseId: uprightId, mergeNote }, { id: uprightId, name: "Barbell Upright Row", normalizedName: "barbell upright row", aliases: ["Barbell Row", "Barbell Bent Over Row"], equipmentTags: [], createdAt: 1 }]);
    await db.tracks.put({ id: "row-track", displayName: "Barbell Row", exerciseId: uprightId });
    const module = await import("/src/domain/maintenance/executeMaintenanceScript.ts");
    const source = JSON.stringify({ format: "ironforge-db-maintenance", version: 1, id: "barbell-row-rollback", name: "Repair", createdAt: "2026-10-25T12:00:00.000Z", operationCount: 2, preconditions: { dbName: db.name, dexieSchemaVersion: db.verno }, operations: [{ type: "restoreMergedExercise", exerciseId: rowId, expectMergedIntoExerciseId: uprightId, expectArchivedAt: archivedAt, expectMergeNote: mergeNote }, { type: "repointTrackExercise", trackId: "row-track", expectExerciseId: uprightId, setExerciseId: rowId }] });
    const base = module.createDexieMaintenanceExecutionDatabase(db); const adapter = { ...base, table: (name: string) => ({ ...base.table(name), update: (key: string, changes: any) => name === "tracks" ? Promise.reject(new Error("Injected failure")) : base.table(name).update(key, changes) }) };
    const report = await module.executeMaintenanceScript(adapter, source, { dryRunSha256: "hash", origin: location.origin, hashText: async () => "hash" });
    return { report, row: await db.exercises.get(rowId), track: await db.tracks.get("row-track") };
  }, { uprightId, rowId, archivedAt, mergeNote });
  expect(result.report).toMatchObject({ committed: false, verified: false, changedCount: 0 });
  expect(result.report.operations.map((row: any) => row.status)).toEqual(["ROLLED_BACK", "FAILED"]);
  expect(result.row).toMatchObject({ archivedAt, mergedIntoExerciseId: uprightId, mergeNote }); expect(result.track.exerciseId).toBe(uprightId);
});
