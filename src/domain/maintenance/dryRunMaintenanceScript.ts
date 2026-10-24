import { MAINTENANCE_TABLE_REGISTRY, isSupportedMaintenanceTable } from "./maintenanceTableRegistry";
import { SUPPORTED_MAINTENANCE_TABLES, type JsonValue, type MaintenanceDryRunResult, type MaintenanceIssue, type MaintenanceOperationResult, type MaintenanceScriptV1 } from "./maintenanceTypes";
import { validateMaintenanceScript } from "./validateMaintenanceScript";

export type ReadonlyMaintenanceTable = { get(key: string): Promise<unknown>; count(): Promise<number> };
export type ReadonlyMaintenanceDatabase = { name: string; verno: number; table(name: string): ReadonlyMaintenanceTable };
const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);

export function jsonDeepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== typeof right || left === null || right === null) return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => jsonDeepEqual(value, right[index]));
  }
  if (typeof left === "object") {
    const a = left as Record<string, unknown>; const b = right as Record<string, unknown>;
    const aKeys = Object.keys(a).sort(); const bKeys = Object.keys(b).sort();
    return aKeys.length === bKeys.length && aKeys.every((key, index) => key === bKeys[index] && own(b, key) && jsonDeepEqual(a[key], b[key]));
  }
  return false;
}

function fieldsMatch(record: Record<string, unknown>, patch: Record<string, JsonValue>) {
  return Object.entries(patch).every(([field, expected]) => own(record, field) && jsonDeepEqual(record[field], expected));
}
function relevantBefore(record: Record<string, unknown>, fields: string[]) {
  return Object.fromEntries(fields.sort().map((field) => [field, own(record, field) ? record[field] as JsonValue : { missing: true as const }]));
}
function invalidResult(index: number, raw: any, error: string): MaintenanceOperationResult {
  return { index, type: String(raw?.type ?? "unknown"), table: typeof raw?.table === "string" ? raw.table : undefined, key: typeof raw?.key === "string" ? raw.key : undefined, status: "INVALID", changedFields: [], expected: {}, before: {}, after: {}, error };
}

export async function dryRunMaintenanceScript(
  database: ReadonlyMaintenanceDatabase,
  script: MaintenanceScriptV1,
  options: { scriptSha256?: string; origin?: string; buildId?: string; generatedAt?: string } = {}
): Promise<MaintenanceDryRunResult> {
  const validation = validateMaintenanceScript(script);
  const globalErrors = validation.errors.filter((entry) => !/^operations\[\d+\]/.test(entry.path));
  const operationErrors = new Map<number, MaintenanceIssue[]>();
  for (const entry of validation.errors) {
    const match = /^operations\[(\d+)\]/.exec(entry.path);
    if (match) operationErrors.set(Number(match[1]), [...(operationErrors.get(Number(match[1])) ?? []), entry]);
  }
  const preconditionErrors: MaintenanceIssue[] = [...globalErrors];
  if (script?.preconditions?.dbName !== database.name) preconditionErrors.push({ code: "DB_NAME_MISMATCH", path: "preconditions.dbName", message: `Script expects ${script?.preconditions?.dbName}; current database is ${database.name}.` });
  if (script?.preconditions?.dexieSchemaVersion !== database.verno) preconditionErrors.push({ code: "SCHEMA_VERSION_MISMATCH", path: "preconditions.dexieSchemaVersion", message: `Script expects schema ${script?.preconditions?.dexieSchemaVersion}; current schema is ${database.verno}.` });

  const recordCounts: Record<string, number> = {};
  for (const table of SUPPORTED_MAINTENANCE_TABLES) recordCounts[table] = await database.table(table).count();
  const warnings: string[] = [];
  for (const [table, sourceCount] of Object.entries(script.sourceBackup?.recordCounts ?? {})) {
    if (isSupportedMaintenanceTable(table) && recordCounts[table] !== sourceCount) warnings.push(`Source backup ${table} count is ${sourceCount}; current database count is ${recordCounts[table]}.`);
  }

  const operations: MaintenanceOperationResult[] = [];
  for (let index = 0; index < (Array.isArray(script.operations) ? script.operations.length : 0); index += 1) {
    const operation: any = script.operations[index];
    const errors = operationErrors.get(index) ?? [];
    if (preconditionErrors.length || errors.length || operation?.type !== "updateRecord" || !isSupportedMaintenanceTable(operation?.table)) {
      operations.push(invalidResult(index, operation, [...preconditionErrors, ...errors].map((entry) => `${entry.path}: ${entry.message}`).join(" ") || "Invalid operation."));
      continue;
    }
    const record = await database.table(operation.table).get(operation.key) as Record<string, unknown> | undefined;
    if (!record) { operations.push({ index, type: operation.type, table: operation.table, key: operation.key, status: "NOT_FOUND", changedFields: [], expected: operation.expect, before: {}, after: operation.set, error: "Target record was not found." }); continue; }
    const fields = [...new Set([...Object.keys(operation.expect), ...Object.keys(operation.set)])];
    const before = relevantBefore(record, fields);
    const changedFields = Object.keys(operation.set).filter((field) => !own(record, field) || !jsonDeepEqual(record[field], operation.set[field])).sort();
    if (!changedFields.length) { operations.push({ index, type: operation.type, table: operation.table, key: operation.key, status: "ALREADY_SATISFIED", changedFields, expected: operation.expect, before, after: operation.set }); continue; }
    const status = fieldsMatch(record, operation.expect) ? "WOULD_CHANGE" : "CONFLICT";
    operations.push({ index, type: operation.type, table: operation.table, key: operation.key, status, changedFields, expected: operation.expect, before, after: operation.set, ...(status === "CONFLICT" ? { error: "Current values do not match expected values." } : {}) });
  }
  const count = (status: MaintenanceOperationResult["status"]) => operations.filter((operation) => operation.status === status).length;
  return {
    scriptId: String(script.id ?? ""), scriptName: String(script.name ?? ""), scriptSha256: options.scriptSha256,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    database: { name: database.name, schemaVersion: database.verno, origin: options.origin, buildId: options.buildId, recordCounts },
    sourceBackup: script.sourceBackup, warnings, preconditionErrors: preconditionErrors.sort((a, b) => a.path.localeCompare(b.path) || a.code.localeCompare(b.code)),
    operationCount: operations.length, wouldChangeCount: count("WOULD_CHANGE"), alreadySatisfiedCount: count("ALREADY_SATISFIED"),
    conflictCount: count("CONFLICT"), notFoundCount: count("NOT_FOUND"), invalidCount: count("INVALID"), operations, dataModified: false,
  };
}

export function getMaintenancePrimaryKey(table: keyof typeof MAINTENANCE_TABLE_REGISTRY) {
  return MAINTENANCE_TABLE_REGISTRY[table].primaryKey;
}
