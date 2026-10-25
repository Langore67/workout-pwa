import { MAINTENANCE_FORMAT, MAINTENANCE_LIMITS, MAINTENANCE_VERSION, SUPPORTED_BACKUP_VERSION, type JsonValue, type MaintenanceIssue, type MaintenanceScriptV1 } from "./maintenanceTypes";
import { isSupportedMaintenanceTable, MAINTENANCE_TABLE_REGISTRY, PROTOTYPE_SENSITIVE_FIELDS, validateMaintenanceField } from "./maintenanceTableRegistry";

export type MaintenanceValidationResult = { valid: boolean; errors: MaintenanceIssue[] };
const issue = (code: string, path: string, message: string): MaintenanceIssue => ({ code, path, message });
const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const plainObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

function validateJson(value: unknown, path: string, errors: MaintenanceIssue[]) {
  if (typeof value === "number" && !Number.isFinite(value)) errors.push(issue("NON_FINITE_NUMBER", path, "Numbers must be finite."));
  if (value === undefined || typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") errors.push(issue("INVALID_JSON_VALUE", path, "Value must be JSON-compatible."));
  if (Array.isArray(value)) value.forEach((item, index) => validateJson(item, `${path}[${index}]`, errors));
  else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (PROTOTYPE_SENSITIVE_FIELDS.has(key)) errors.push(issue("PROTOTYPE_FIELD", `${path}.${key}`, "Prototype-sensitive fields are not allowed."));
      validateJson(child, `${path}.${key}`, errors);
    }
  }
}

export function validateMaintenanceScript(script: unknown): MaintenanceValidationResult {
  const errors: MaintenanceIssue[] = [];
  if (!plainObject(script)) return { valid: false, errors: [issue("INVALID_SCRIPT", "$", "Script must be an object.")] };
  if (script.format !== MAINTENANCE_FORMAT) errors.push(issue("UNSUPPORTED_FORMAT", "format", `Expected ${MAINTENANCE_FORMAT}.`));
  if (script.version !== MAINTENANCE_VERSION) errors.push(issue("UNSUPPORTED_VERSION", "version", `Only version ${MAINTENANCE_VERSION} is supported.`));
  if (typeof script.id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/.test(script.id)) errors.push(issue("INVALID_ID", "id", "Script ID must be 3-128 safe identifier characters."));
  if (typeof script.name !== "string" || !script.name.trim()) errors.push(issue("INVALID_NAME", "name", "Script name is required."));
  if (typeof script.createdAt !== "string" || !Number.isFinite(Date.parse(script.createdAt))) errors.push(issue("INVALID_CREATED_AT", "createdAt", "createdAt must be a valid ISO-compatible date."));
  if (!Array.isArray(script.operations)) errors.push(issue("MISSING_OPERATIONS", "operations", "operations must be an array."));
  const operations = Array.isArray(script.operations) ? script.operations : [];
  if (operations.length > MAINTENANCE_LIMITS.maxOperations) errors.push(issue("MAX_OPERATIONS", "operations", `Maximum operation count is ${MAINTENANCE_LIMITS.maxOperations}.`));
  if (!Number.isInteger(script.operationCount) || script.operationCount !== operations.length) errors.push(issue("OPERATION_COUNT_MISMATCH", "operationCount", "operationCount must equal operations.length."));
  if (!plainObject(script.preconditions)) errors.push(issue("MISSING_PRECONDITIONS", "preconditions", "Database preconditions are required."));
  else {
    if (typeof script.preconditions.dbName !== "string" || !script.preconditions.dbName.trim()) errors.push(issue("INVALID_DB_NAME", "preconditions.dbName", "Database name is required."));
    if (!Number.isInteger(script.preconditions.dexieSchemaVersion) || Number(script.preconditions.dexieSchemaVersion) <= 0) errors.push(issue("INVALID_SCHEMA_VERSION", "preconditions.dexieSchemaVersion", "Dexie schema version must be a positive integer."));
    if (own(script.preconditions, "supportedBackupVersion") && script.preconditions.supportedBackupVersion !== SUPPORTED_BACKUP_VERSION) errors.push(issue("UNSUPPORTED_BACKUP_VERSION", "preconditions.supportedBackupVersion", `Only source backup version ${SUPPORTED_BACKUP_VERSION} is supported.`));
  }
  operations.forEach((raw, index) => {
    const base = `operations[${index}]`;
    if (!plainObject(raw)) { errors.push(issue("INVALID_OPERATION", base, "Operation must be an object.")); return; }
    if (!(["updateRecord", "restoreMergedExercise", "repointTrackExercise"] as unknown[]).includes(raw.type)) {
      errors.push(issue("UNKNOWN_OPERATION", `${base}.type`, "Operation type is not supported.")); return;
    }
    const requireId = (field: string) => {
      if (typeof raw[field] !== "string" || !(raw[field] as string).trim()) errors.push(issue("INVALID_KEY", `${base}.${field}`, `${field} is required.`));
    };
    if (raw.type === "restoreMergedExercise") {
      requireId("exerciseId"); requireId("expectMergedIntoExerciseId"); requireId("expectMergeNote");
      if (!own(raw, "expectArchivedAt") || raw.expectArchivedAt === null) errors.push(issue("INVALID_EXPECTATION", `${base}.expectArchivedAt`, "expectArchivedAt is required and must be non-null."));
      const aliasFields = ["targetExerciseId", "expectTargetAliases", "setTargetAliases"];
      const aliasCount = aliasFields.filter((field) => own(raw, field)).length;
      if (aliasCount !== 0 && aliasCount !== aliasFields.length) errors.push(issue("INCOMPLETE_ALIAS_REPAIR", base, "Target exercise ID and both exact alias arrays must be supplied together."));
      if (aliasCount === aliasFields.length) {
        requireId("targetExerciseId");
        for (const field of ["expectTargetAliases", "setTargetAliases"]) {
          if (!Array.isArray(raw[field]) || !(raw[field] as unknown[]).every((value) => typeof value === "string")) errors.push(issue("INVALID_ALIASES", `${base}.${field}`, `${field} must be an array of strings.`));
        }
      }
      validateJson(raw, base, errors); return;
    }
    if (raw.type === "repointTrackExercise") {
      requireId("trackId"); requireId("expectExerciseId"); requireId("setExerciseId");
      if (raw.expectExerciseId === raw.setExerciseId) errors.push(issue("NO_OP_REFERENCE", `${base}.setExerciseId`, "The old and new exercise IDs must differ."));
      validateJson(raw, base, errors); return;
    }
    if (!isSupportedMaintenanceTable(raw.table)) { errors.push(issue("UNKNOWN_TABLE", `${base}.table`, "Table is not allowlisted.")); return; }
    if (typeof raw.key !== "string" || !raw.key.trim()) errors.push(issue("INVALID_KEY", `${base}.key`, "Record key is required."));
    for (const patchName of ["expect", "set"] as const) {
      const patch = raw[patchName]; const path = `${base}.${patchName}`;
      if (!plainObject(patch) || !Object.keys(patch).length) { errors.push(issue("EMPTY_PATCH", path, `${patchName} must be a nonempty object.`)); continue; }
      if (Object.keys(patch).length > MAINTENANCE_LIMITS.maxPatchFields || JSON.stringify(patch).length > MAINTENANCE_LIMITS.maxPatchBytes) errors.push(issue("PATCH_LIMIT", path, "Patch exceeds the field or byte limit."));
      for (const [field, value] of Object.entries(patch)) {
        const message = validateMaintenanceField(raw.table, field, value as JsonValue);
        if (message) errors.push(issue(field === MAINTENANCE_TABLE_REGISTRY[raw.table].primaryKey ? "PRIMARY_KEY_MUTATION" : PROTOTYPE_SENSITIVE_FIELDS.has(field) ? "PROTOTYPE_FIELD" : "INVALID_FIELD", `${path}.${field}`, message));
        validateJson(value, `${path}.${field}`, errors);
      }
    }
  });
  if (own(script, "sourceBackup") && !plainObject(script.sourceBackup)) errors.push(issue("INVALID_SOURCE_BACKUP", "sourceBackup", "sourceBackup must be an object."));
  if (plainObject(script.sourceBackup)) {
    if (own(script.sourceBackup, "exportedAt") && (typeof script.sourceBackup.exportedAt !== "string" || !Number.isFinite(Date.parse(script.sourceBackup.exportedAt)))) errors.push(issue("INVALID_SOURCE_EXPORTED_AT", "sourceBackup.exportedAt", "Source exportedAt must be a valid date."));
    if (own(script.sourceBackup, "sha256") && (typeof script.sourceBackup.sha256 !== "string" || !/^[a-fA-F0-9]{64}$/.test(script.sourceBackup.sha256))) errors.push(issue("INVALID_SOURCE_HASH", "sourceBackup.sha256", "Source SHA-256 must contain 64 hexadecimal characters."));
    if (own(script.sourceBackup, "recordCounts") && !plainObject(script.sourceBackup.recordCounts)) errors.push(issue("INVALID_SOURCE_COUNTS", "sourceBackup.recordCounts", "Source recordCounts must be an object."));
    if (plainObject(script.sourceBackup.recordCounts)) for (const [table, count] of Object.entries(script.sourceBackup.recordCounts)) {
      if (!isSupportedMaintenanceTable(table)) errors.push(issue("UNKNOWN_SOURCE_COUNT_TABLE", `sourceBackup.recordCounts.${table}`, "Source record-count table is not supported."));
      if (!Number.isInteger(count) || Number(count) < 0) errors.push(issue("INVALID_SOURCE_COUNT", `sourceBackup.recordCounts.${table}`, "Source record count must be a non-negative integer."));
    }
  }
  validateJson(script, "$", errors);
  return { valid: errors.length === 0, errors: errors.sort((a, b) => a.path.localeCompare(b.path) || a.code.localeCompare(b.code)) };
}

export function assertMaintenanceScript(script: unknown): asserts script is MaintenanceScriptV1 {
  const result = validateMaintenanceScript(script);
  if (!result.valid) throw new Error(result.errors.map((entry) => `${entry.path}: ${entry.message}`).join("\n"));
}
