import { expect, test } from "@playwright/test";
import { MAINTENANCE_LIMITS } from "../src/domain/maintenance/maintenanceTypes";
import { parseMaintenanceScript } from "../src/domain/maintenance/parseMaintenanceScript";
import { validateMaintenanceScript } from "../src/domain/maintenance/validateMaintenanceScript";

function validScript() { return { format: "ironforge-db-maintenance", version: 1, id: "script-001", name: "Metadata repair", createdAt: "2026-10-24T14:00:00.000Z", operationCount: 1, preconditions: { dbName: "workout_mvp_db", dexieSchemaVersion: 19, supportedBackupVersion: 2 }, operations: [{ type: "updateRecord", table: "exercises", key: "exercise-1", expect: { movementPattern: null }, set: { movementPattern: "pull" } }] }; }
const codes = (value: unknown) => validateMaintenanceScript(value).errors.map((error) => error.code);

test("parses and validates a version-1 maintenance script", () => {
  const parsed = parseMaintenanceScript(JSON.stringify(validScript()));
  expect(parsed.ok).toBe(true);
  if (parsed.ok) expect(validateMaintenanceScript(parsed.script)).toEqual({ valid: true, errors: [] });
});

test("parser rejects malformed JSON, nonobject roots, format, version, depth, strings, and size", () => {
  expect(parseMaintenanceScript("{")).toMatchObject({ ok: false, errors: [expect.objectContaining({ code: "MALFORMED_JSON" })] });
  expect(parseMaintenanceScript("[]")).toMatchObject({ ok: false, errors: [expect.objectContaining({ code: "INVALID_ROOT" })] });
  expect(parseMaintenanceScript(JSON.stringify({ ...validScript(), format: "other" }))).toMatchObject({ ok: false, errors: expect.arrayContaining([expect.objectContaining({ code: "UNSUPPORTED_FORMAT" })]) });
  expect(parseMaintenanceScript(JSON.stringify({ ...validScript(), version: 2 }))).toMatchObject({ ok: false, errors: expect.arrayContaining([expect.objectContaining({ code: "UNSUPPORTED_VERSION" })]) });
  let deep: any = "value"; for (let index = 0; index < MAINTENANCE_LIMITS.maxDepth + 2; index += 1) deep = { child: deep };
  expect(parseMaintenanceScript(JSON.stringify({ ...validScript(), sourceBackup: { deep } }))).toMatchObject({ ok: false, errors: expect.arrayContaining([expect.objectContaining({ code: "MAX_DEPTH" })]) });
  expect(parseMaintenanceScript(JSON.stringify({ ...validScript(), name: "x".repeat(MAINTENANCE_LIMITS.maxStringLength + 1) }))).toMatchObject({ ok: false, errors: expect.arrayContaining([expect.objectContaining({ code: "MAX_STRING_LENGTH" })]) });
  expect(parseMaintenanceScript(" ".repeat(MAINTENANCE_LIMITS.maxFileBytes + 1))).toMatchObject({ ok: false, errors: [expect.objectContaining({ code: "MAX_FILE_SIZE" })] });
});

test("validation reports missing metadata, dates, counts, tables, operations, and fields deterministically", () => {
  expect(codes({})).toEqual(expect.arrayContaining(["UNSUPPORTED_FORMAT", "UNSUPPORTED_VERSION", "INVALID_ID", "INVALID_NAME", "INVALID_CREATED_AT", "MISSING_OPERATIONS", "MISSING_PRECONDITIONS"]));
  expect(codes({ ...validScript(), createdAt: "nope" })).toContain("INVALID_CREATED_AT");
  expect(codes({ ...validScript(), operationCount: 2 })).toContain("OPERATION_COUNT_MISMATCH");
  const unknownTable = validScript(); (unknownTable.operations[0] as any).table = "templates"; expect(codes(unknownTable)).toContain("UNKNOWN_TABLE");
  const unknownOperation = validScript(); (unknownOperation.operations[0] as any).type = "deleteAll"; expect(codes(unknownOperation)).toContain("UNKNOWN_OPERATION");
  const unknownField = validScript(); (unknownField.operations[0] as any).set = { mystery: 1 }; expect(codes(unknownField)).toContain("INVALID_FIELD");
  const primary = validScript(); (primary.operations[0] as any).set = { id: "new" }; expect(codes(primary)).toContain("PRIMARY_KEY_MUTATION");
  const reference = validScript(); (reference.operations[0] as any).set = { mergedIntoExerciseId: "target" }; expect(codes(reference)).toContain("INVALID_FIELD");
});

test("validation rejects prototype-sensitive fields, invalid enums, backup versions, and excessive operation count", () => {
  const proto = JSON.parse(JSON.stringify(validScript()).replace('"set":{"movementPattern":"pull"}', '"set":{"__proto__":"bad"}'));
  expect(codes(proto)).toContain("PROTOTYPE_FIELD");
  const invalidEnum = validScript(); (invalidEnum.operations[0] as any).set = { movementPattern: "press" }; expect(codes(invalidEnum)).toContain("INVALID_FIELD");
  expect(codes({ ...validScript(), preconditions: { ...validScript().preconditions, supportedBackupVersion: 99 } })).toContain("UNSUPPORTED_BACKUP_VERSION");
  const many = Array.from({ length: MAINTENANCE_LIMITS.maxOperations + 1 }, () => validScript().operations[0]);
  expect(codes({ ...validScript(), operationCount: many.length, operations: many })).toContain("MAX_OPERATIONS");
});
