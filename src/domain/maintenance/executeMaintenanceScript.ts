import { dryRunMaintenanceScript, jsonDeepEqual, type ReadonlyMaintenanceDatabase } from "./dryRunMaintenanceScript";
import { parseMaintenanceScript } from "./parseMaintenanceScript";
import { validateMaintenanceScript } from "./validateMaintenanceScript";
import type {
  JsonValue, MaintenanceExecutionError, MaintenanceExecutionOperationResult, MaintenanceExecutionResult,
  MaintenanceScriptV1, SupportedMaintenanceTable,
} from "./maintenanceTypes";

export type WritableMaintenanceTable = {
  get(key: string): Promise<unknown>;
  count(): Promise<number>;
  update(key: string, changes: Record<string, JsonValue>): Promise<number>;
};
export type MaintenanceExecutionDatabase = ReadonlyMaintenanceDatabase & {
  table(name: string): WritableMaintenanceTable;
  runReadWriteTransaction<T>(tables: SupportedMaintenanceTable[], callback: () => Promise<T>): Promise<T>;
};
type DexieLikeMaintenanceDatabase = {
  name: string;
  verno: number;
  table(name: string): { get(key: string): Promise<unknown>; count(): Promise<number>; update(key: string, changes: Record<string, JsonValue>): Promise<number> };
  transaction<T>(mode: "rw", ...tablesAndCallback: unknown[]): Promise<T>;
};
export type ExecuteMaintenanceOptions = {
  dryRunSha256: string;
  origin: string;
  buildId?: string;
  now?: () => Date;
  hashText?: (text: string) => Promise<string>;
};

export function createDexieMaintenanceExecutionDatabase(database: DexieLikeMaintenanceDatabase): MaintenanceExecutionDatabase {
  return {
    name: database.name,
    verno: database.verno,
    table: (name) => ({
      get: (key) => database.table(name).get(key),
      count: () => database.table(name).count(),
      update: (key, changes) => database.table(name).update(key, changes),
    }),
    runReadWriteTransaction: (tables, callback) => database.transaction("rw", ...tables.map((table) => database.table(table)), callback),
  };
}

const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const fieldsMatch = (record: Record<string, unknown>, patch: Record<string, JsonValue>) =>
  Object.entries(patch).every(([field, expected]) => own(record, field) && jsonDeepEqual(record[field], expected));
const beforeValues = (record: Record<string, unknown>, fields: string[]) => Object.fromEntries(
  [...fields].sort().map((field) => [field, own(record, field) ? record[field] as JsonValue : { missing: true as const }]),
);

export async function sha256MaintenanceText(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

class MaintenanceAbort extends Error {
  constructor(public operationIndex: number, message: string) { super(message); }
}

function refusedResult(script: Partial<MaintenanceScriptV1>, hash: string, startedAt: string, completedAt: string, database: MaintenanceExecutionDatabase, options: ExecuteMaintenanceOptions, errors: MaintenanceExecutionError[]): MaintenanceExecutionResult {
  const operations: MaintenanceExecutionOperationResult[] = Array.isArray(script.operations) ? script.operations.map((operation: any, index) => ({
    index, type: operation.type, table: operation.type === "updateRecord" ? operation.table : operation.type === "repointTrackExercise" ? "tracks" : "exercises", key: operation.key ?? operation.trackId ?? operation.exerciseId, status: "REFUSED", changedFields: [], before: {}, after: operation.set ?? (operation.type === "repointTrackExercise" ? { exerciseId: operation.setExerciseId } : { archived: false, ...(operation.setTargetAliases ? { targetAliases: operation.setTargetAliases } : {}) }),
    error: errors[0]?.message ?? "Execution was refused before the transaction began.",
  })) : [];
  return {
    scriptId: String(script.id ?? ""), scriptName: String(script.name ?? ""), scriptSha256: hash, startedAt, completedAt,
    database: { name: database.name, schemaVersion: database.verno, origin: options.origin, buildId: options.buildId },
    operationCount: Array.isArray(script.operations) ? script.operations.length : 0, changedCount: 0, alreadySatisfiedCount: 0,
    committed: false, verified: false, transactionStarted: false, errors, operations,
  };
}

export async function executeMaintenanceScript(database: MaintenanceExecutionDatabase, scriptText: string, options: ExecuteMaintenanceOptions): Promise<MaintenanceExecutionResult> {
  const now = options.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const hash = await (options.hashText ?? sha256MaintenanceText)(scriptText);
  const parsed = parseMaintenanceScript(scriptText);
  if (!parsed.ok) return refusedResult({}, hash, startedAt, now().toISOString(), database, options, [{ phase: "refused", message: parsed.errors.map((error) => `${error.path}: ${error.message}`).join(" ") }]);
  const script = parsed.script;
  const validation = validateMaintenanceScript(script);
  if (!validation.valid) return refusedResult(script, hash, startedAt, now().toISOString(), database, options, [{ phase: "refused", message: validation.errors.map((error) => `${error.path}: ${error.message}`).join(" ") }]);
  if (hash !== options.dryRunSha256) return refusedResult(script, hash, startedAt, now().toISOString(), database, options, [{ phase: "refused", message: "Uploaded script SHA-256 no longer matches the successful dry run." }]);

  const fresh = await dryRunMaintenanceScript(database, script, { scriptSha256: hash, origin: options.origin, buildId: options.buildId });
  const clean = fresh.preconditionErrors.length === 0 && fresh.conflictCount === 0 && fresh.notFoundCount === 0 && fresh.invalidCount === 0 &&
    fresh.operationCount === script.operations.length && fresh.operations.every((operation) => operation.status === "WOULD_CHANGE" || operation.status === "ALREADY_SATISFIED");
  if (!clean) return refusedResult(script, hash, startedAt, now().toISOString(), database, options, [{ phase: "refused", message: "Fresh database checks no longer match the eligible dry run. Run a new dry check." }]);

  const operations: MaintenanceExecutionOperationResult[] = [];
  const affectedTables = [...new Set(script.operations.flatMap((operation: any) => operation.type === "updateRecord" ? [operation.table] : operation.type === "repointTrackExercise" ? ["tracks", "exercises"] : ["exercises"]))] as SupportedMaintenanceTable[];
  let transactionStarted = false;
  try {
    await database.runReadWriteTransaction(affectedTables, async () => {
      transactionStarted = true;
      for (let index = 0; index < script.operations.length; index += 1) {
        const operation: any = script.operations[index];
        if (operation.type === "restoreMergedExercise") {
          const exercise = await database.table("exercises").get(operation.exerciseId) as Record<string, unknown> | undefined;
          const target = operation.targetExerciseId ? await database.table("exercises").get(operation.targetExerciseId) as Record<string, unknown> | undefined : undefined;
          if (!exercise || (operation.targetExerciseId && !target)) throw new MaintenanceAbort(index, "Exercise was not found inside the transaction.");
          const sourceAlready = !own(exercise, "archivedAt") && !own(exercise, "mergedIntoExerciseId") && !own(exercise, "mergeNote");
          const aliasesAlready = !target || jsonDeepEqual(target.aliases, operation.setTargetAliases);
          const before = { archivedAt: own(exercise, "archivedAt") ? exercise.archivedAt as JsonValue : { missing: true as const }, mergedIntoExerciseId: own(exercise, "mergedIntoExerciseId") ? exercise.mergedIntoExerciseId as JsonValue : { missing: true as const }, mergeNote: own(exercise, "mergeNote") ? exercise.mergeNote as JsonValue : { missing: true as const }, ...(target ? { targetAliases: target.aliases as JsonValue } : {}) };
          const after = { archived: false, ...(target ? { targetAliases: operation.setTargetAliases } : {}) };
          if (sourceAlready && aliasesAlready) { operations.push({ index, type: operation.type, table: "exercises", key: operation.exerciseId, status: "ALREADY_SATISFIED", changedFields: [], before, after }); continue; }
          if (!jsonDeepEqual(exercise.archivedAt, operation.expectArchivedAt) || !jsonDeepEqual(exercise.mergedIntoExerciseId, operation.expectMergedIntoExerciseId) || !jsonDeepEqual(exercise.mergeNote, operation.expectMergeNote) || (target && !jsonDeepEqual(target.aliases, operation.expectTargetAliases))) throw new MaintenanceAbort(index, "Merge state or target aliases no longer match expected values inside the transaction.");
          const changedFields = ["archivedAt", "mergedIntoExerciseId", "mergeNote", ...(target ? ["target.aliases"] : [])].sort();
          const restored = await database.table("exercises").update(operation.exerciseId, { archivedAt: undefined, mergedIntoExerciseId: undefined, mergeNote: undefined } as any);
          if (restored !== 1) throw new MaintenanceAbort(index, "Restore did not modify exactly one exercise.");
          if (target && await database.table("exercises").update(operation.targetExerciseId, { aliases: operation.setTargetAliases }) !== 1) throw new MaintenanceAbort(index, "Alias repair did not modify exactly one exercise.");
          operations.push({ index, type: operation.type, table: "exercises", key: operation.exerciseId, status: "CHANGED", changedFields, before, after }); continue;
        }
        if (operation.type === "repointTrackExercise") {
          const track = await database.table("tracks").get(operation.trackId) as Record<string, unknown> | undefined;
          const destination = await database.table("exercises").get(operation.setExerciseId);
          if (!track || !destination) throw new MaintenanceAbort(index, "Track or destination exercise was not found inside the transaction.");
          const before = beforeValues(track, ["exerciseId"]); const after = { exerciseId: operation.setExerciseId };
          if (jsonDeepEqual(track.exerciseId, operation.setExerciseId)) { operations.push({ index, type: operation.type, table: "tracks", key: operation.trackId, status: "ALREADY_SATISFIED", changedFields: [], before, after }); continue; }
          if (!jsonDeepEqual(track.exerciseId, operation.expectExerciseId)) throw new MaintenanceAbort(index, "Track exerciseId no longer matches the expected value inside the transaction.");
          if (await database.table("tracks").update(operation.trackId, after) !== 1) throw new MaintenanceAbort(index, "Track repoint did not modify exactly one track.");
          operations.push({ index, type: operation.type, table: "tracks", key: operation.trackId, status: "CHANGED", changedFields: ["exerciseId"], before, after }); continue;
        }
        const record = await database.table(operation.table).get(operation.key) as Record<string, unknown> | undefined;
        if (!record) throw new MaintenanceAbort(index, "Target record was not found inside the transaction.");
        const fields = [...new Set([...Object.keys(operation.expect), ...Object.keys(operation.set)])];
        const before = beforeValues(record, fields);
        const changedFields = Object.keys(operation.set).filter((field) => !own(record, field) || !jsonDeepEqual(record[field], operation.set[field])).sort();
        if (!changedFields.length) {
          operations.push({ index, type: "updateRecord", table: operation.table, key: operation.key, status: "ALREADY_SATISFIED", changedFields: [], before, after: operation.set });
          continue;
        }
        if (!fieldsMatch(record, operation.expect)) throw new MaintenanceAbort(index, "Current values no longer match expected values inside the transaction.");
        const updated = await database.table(operation.table).update(operation.key, operation.set);
        if (updated !== 1) throw new MaintenanceAbort(index, "Field-level update did not modify exactly one record.");
        operations.push({ index, type: "updateRecord", table: operation.table, key: operation.key, status: "CHANGED", changedFields, before, after: operation.set });
      }
    });
  } catch (error) {
    const failedIndex = error instanceof MaintenanceAbort ? error.operationIndex : operations.length;
    const message = error instanceof Error ? error.message : String(error);
    const rolledBack = operations.map((operation) => operation.status === "CHANGED" ? { ...operation, status: "ROLLED_BACK" as const, error: "Transaction aborted; this update was rolled back." } : operation);
    const failedOperation: any = script.operations[failedIndex];
    const operationIdentity = (operation: any) => ({ type: operation.type, table: operation.type === "updateRecord" ? operation.table : operation.type === "repointTrackExercise" ? "tracks" : "exercises", key: operation.key ?? operation.trackId ?? operation.exerciseId, after: operation.set ?? (operation.type === "repointTrackExercise" ? { exerciseId: operation.setExerciseId } : { archived: false, ...(operation.setTargetAliases ? { targetAliases: operation.setTargetAliases } : {}) }) });
    if (failedOperation && !rolledBack.some((operation) => operation.index === failedIndex)) rolledBack.push({ index: failedIndex, ...operationIdentity(failedOperation), status: "FAILED", changedFields: [], before: {}, error: message });
    for (let index = failedIndex + 1; index < script.operations.length; index += 1) {
      const operation: any = script.operations[index];
      rolledBack.push({ index, ...operationIdentity(operation), status: "REFUSED", changedFields: [], before: {}, error: "Not attempted because the transaction aborted." });
    }
    return {
      scriptId: script.id, scriptName: script.name, scriptSha256: hash, startedAt, completedAt: now().toISOString(),
      database: { name: database.name, schemaVersion: database.verno, origin: options.origin, buildId: options.buildId }, operationCount: script.operations.length,
      changedCount: 0, alreadySatisfiedCount: rolledBack.filter((operation) => operation.status === "ALREADY_SATISFIED").length,
      committed: false, verified: false, transactionStarted, errors: [{ phase: "transaction", message, operationIndex: failedIndex }], operations: rolledBack.sort((a, b) => a.index - b.index),
    };
  }

  const verificationErrors: MaintenanceExecutionError[] = [];
  for (let index = 0; index < script.operations.length; index += 1) {
    const operation: any = script.operations[index];
    try {
      if (operation.type === "restoreMergedExercise") {
        const record = await database.table("exercises").get(operation.exerciseId) as Record<string, unknown> | undefined;
        const target = operation.targetExerciseId ? await database.table("exercises").get(operation.targetExerciseId) as Record<string, unknown> | undefined : undefined;
        if (!record || own(record, "archivedAt") || own(record, "mergedIntoExerciseId") || own(record, "mergeNote") || (operation.targetExerciseId && (!target || !jsonDeepEqual(target.aliases, operation.setTargetAliases)))) verificationErrors.push({ phase: "verification", operationIndex: index, message: `Post-commit verification failed for restored exercise ${operation.exerciseId}.` });
      } else {
        const table = operation.type === "repointTrackExercise" ? "tracks" : operation.table; const key = operation.trackId ?? operation.key; const set = operation.type === "repointTrackExercise" ? { exerciseId: operation.setExerciseId } : operation.set;
        const record = await database.table(table).get(key) as Record<string, unknown> | undefined;
        if (!record || !fieldsMatch(record, set)) verificationErrors.push({ phase: "verification", operationIndex: index, message: `Post-commit verification failed for ${table} ${key}.` });
      }
    } catch (error) {
      verificationErrors.push({ phase: "verification", operationIndex: index, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return {
    scriptId: script.id, scriptName: script.name, scriptSha256: hash, startedAt, completedAt: now().toISOString(),
    database: { name: database.name, schemaVersion: database.verno, origin: options.origin, buildId: options.buildId }, operationCount: script.operations.length,
    changedCount: operations.filter((operation) => operation.status === "CHANGED").length,
    alreadySatisfiedCount: operations.filter((operation) => operation.status === "ALREADY_SATISFIED").length,
    committed: true, verified: verificationErrors.length === 0, transactionStarted: true, errors: verificationErrors, operations,
  };
}
