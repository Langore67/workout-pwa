import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { dryRunMaintenanceScript, type ReadonlyMaintenanceDatabase } from "../src/domain/maintenance/dryRunMaintenanceScript";
import type { MaintenanceScriptV1 } from "../src/domain/maintenance/maintenanceTypes";

const script = JSON.parse(readFileSync(new URL("../maintenance/reconcile-thin-exercises-2026-11-24.json", import.meta.url), "utf8")) as MaintenanceScriptV1;

function fixtureDatabase(): ReadonlyMaintenanceDatabase {
  const backupPath = process.env.IRONFORGE_MAINTENANCE_BACKUP;
  const backup = backupPath ? JSON.parse(readFileSync(backupPath, "utf8")) : undefined;
  const sourceTables = backup?.tables ?? backup;
  const names = ["exercises", "sessions", "tracks", "sets", "bodyMetrics", "bodyMeasurements", "app_meta"];
  const tables: Record<string, Record<string, unknown>> = Object.fromEntries(names.map((name) => {
    const rows = sourceTables?.[name] as Array<Record<string, unknown>> | undefined;
    const sourceRows = rows
      ? Object.fromEntries(rows.map((row) => [String(row.id), row]))
      : Object.fromEntries(script.operations.map((operation: any) => [operation.key, { id: operation.key, name: operation.key, ...operation.expect }]));
    return [name, sourceRows];
  }));
  return {
    name: "workout_mvp_db",
    verno: 19,
    table: (name) => ({
      get: async (key) => tables[name]?.[key],
      count: async () => Object.keys(tables[name] ?? {}).length,
    }),
  };
}

test("remaining thin-exercise artifact dry-runs exactly eight guarded metadata updates", async () => {
  const before = JSON.stringify(script);
  expect(script.operationCount).toBe(8);
  expect(script.operations).toHaveLength(8);
  expect(script.operations.every((operation) => operation.type === "updateRecord" && operation.table === "exercises")).toBe(true);

  const byId = new Map(script.operations.map((operation: any) => [operation.key, operation]));
  expect([...byId.keys()].sort()).toEqual([
    "120eecb8-e367-434f-9ab7-e35147a6f50e",
    "2b29b58b-5b58-4fa1-8e68-b6662696139d",
    "31decbee-38ae-4a33-9cca-f19196b5fc0e",
    "4b926423-3c7e-4c94-9de0-d599831ed5f2",
    "8e19cba2-5d60-4e2f-89da-8a64f7797722",
    "b14e4220-af0a-4703-a5b4-679cfb43f5ef",
    "d7345fd4-00bc-4bb9-b74d-717d0acc0500",
    "f34a6716-2637-4bf5-8f3c-1341b07171ff",
  ]);
  expect((byId.get("d7345fd4-00bc-4bb9-b74d-717d0acc0500") as any).set).toEqual({ movementPattern: "pull", strengthSignalRole: "secondary", bodyPart: "Back", focusArea: "Lats" });
  expect((byId.get("8e19cba2-5d60-4e2f-89da-8a64f7797722") as any).set).toEqual({ movementPattern: "pull", strengthSignalRole: "secondary", bodyPart: "Shoulders", focusArea: "Rear Delts" });
  expect((byId.get("120eecb8-e367-434f-9ab7-e35147a6f50e") as any).set).toEqual({ movementPattern: "push", strengthSignalRole: "secondary", bodyPart: "Arms", focusArea: "Triceps" });
  expect((byId.get("4b926423-3c7e-4c94-9de0-d599831ed5f2") as any).set).toEqual({ strengthSignalRole: "secondary", bodyPart: "Legs", focusArea: "Hamstrings" });
  for (const id of [
    "d7345fd4-00bc-4bb9-b74d-717d0acc0500",
    "8e19cba2-5d60-4e2f-89da-8a64f7797722",
    "120eecb8-e367-434f-9ab7-e35147a6f50e",
    "4b926423-3c7e-4c94-9de0-d599831ed5f2",
    "2b29b58b-5b58-4fa1-8e68-b6662696139d",
    "31decbee-38ae-4a33-9cca-f19196b5fc0e",
    "f34a6716-2637-4bf5-8f3c-1341b07171ff",
    "b14e4220-af0a-4703-a5b4-679cfb43f5ef",
  ]) {
    const operation = byId.get(id) as any;
    expect(operation.expectUnsetFields).toEqual(Object.keys(operation.set));
  }
  expect((byId.get("2b29b58b-5b58-4fa1-8e68-b6662696139d") as any).set.strengthSignalRole).toBeUndefined();
  expect((byId.get("31decbee-38ae-4a33-9cca-f19196b5fc0e") as any).set.strengthSignalRole).toBeUndefined();
  expect((byId.get("f34a6716-2637-4bf5-8f3c-1341b07171ff") as any).set.strengthSignalRole).toBeUndefined();
  expect((byId.get("b14e4220-af0a-4703-a5b4-679cfb43f5ef") as any).set.strengthSignalRole).toBeUndefined();

  const result = await dryRunMaintenanceScript(fixtureDatabase(), script, { generatedAt: "2026-11-24T12:00:00.000Z" });
  expect(result).toMatchObject({ operationCount: 8, wouldChangeCount: 8, conflictCount: 0, notFoundCount: 0, invalidCount: 0, dataModified: false });
  console.info("Reviewed thin-exercise dry-run:", JSON.stringify({ operations: result.operationCount, wouldChange: result.wouldChangeCount, conflicts: result.conflictCount, notFound: result.notFoundCount, invalid: result.invalidCount, dataModified: result.dataModified }));
  expect(JSON.stringify(script)).toBe(before);
});
