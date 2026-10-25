export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export const MAINTENANCE_FORMAT = "ironforge-db-maintenance" as const;
export const MAINTENANCE_VERSION = 1 as const;
export const SUPPORTED_BACKUP_VERSION = 2 as const;

export const MAINTENANCE_LIMITS = Object.freeze({
  maxFileBytes: 1_000_000,
  maxOperations: 500,
  maxDepth: 12,
  maxStringLength: 20_000,
  maxPatchFields: 50,
  maxPatchBytes: 64_000,
});

export const SUPPORTED_MAINTENANCE_TABLES = [
  "exercises", "sessions", "tracks", "sets", "bodyMetrics", "bodyMeasurements", "app_meta",
] as const;
export type SupportedMaintenanceTable = typeof SUPPORTED_MAINTENANCE_TABLES[number];

export type UpdateRecordOperation = {
  type: "updateRecord";
  table: SupportedMaintenanceTable;
  key: string;
  expect: Record<string, JsonValue>;
  set: Record<string, JsonValue>;
};

export type RestoreMergedExerciseOperation = {
  type: "restoreMergedExercise";
  exerciseId: string;
  expectMergedIntoExerciseId: string;
  expectArchivedAt: JsonValue;
  expectMergeNote: string;
  targetExerciseId?: string;
  expectTargetAliases?: JsonValue[];
  setTargetAliases?: JsonValue[];
};

export type RepointTrackExerciseOperation = {
  type: "repointTrackExercise";
  trackId: string;
  expectExerciseId: string;
  setExerciseId: string;
};

export type MaintenanceOperation = UpdateRecordOperation | RestoreMergedExerciseOperation | RepointTrackExerciseOperation;

export type MaintenanceScriptV1 = {
  format: typeof MAINTENANCE_FORMAT;
  version: typeof MAINTENANCE_VERSION;
  id: string;
  name: string;
  createdAt: string;
  operationCount: number;
  preconditions: {
    dbName: string;
    dexieSchemaVersion: number;
    supportedBackupVersion?: number;
  };
  sourceBackup?: {
    exportedAt?: string;
    sha256?: string;
    recordCounts?: Partial<Record<SupportedMaintenanceTable, number>>;
  };
  operations: MaintenanceOperation[];
};

export type MaintenanceIssue = { code: string; path: string; message: string };
export type MaintenanceOperationStatus = "WOULD_CHANGE" | "ALREADY_SATISFIED" | "CONFLICT" | "NOT_FOUND" | "INVALID";
export type MaintenanceOperationResult = {
  index: number;
  type: string;
  table?: string;
  key?: string;
  status: MaintenanceOperationStatus;
  changedFields: string[];
  expected: Record<string, JsonValue>;
  before: Record<string, JsonValue | { missing: true }>;
  after: Record<string, JsonValue>;
  error?: string;
  limitation?: string;
};

export type MaintenanceDryRunResult = {
  scriptId: string;
  scriptName: string;
  scriptSha256?: string;
  generatedAt: string;
  database: { name: string; schemaVersion: number; origin?: string; buildId?: string; recordCounts: Record<string, number> };
  sourceBackup?: MaintenanceScriptV1["sourceBackup"];
  warnings: string[];
  preconditionErrors: MaintenanceIssue[];
  operationCount: number;
  wouldChangeCount: number;
  alreadySatisfiedCount: number;
  conflictCount: number;
  notFoundCount: number;
  invalidCount: number;
  operations: MaintenanceOperationResult[];
  dataModified: false;
};

export type MaintenanceExecutionOperationStatus = "CHANGED" | "ALREADY_SATISFIED" | "REFUSED" | "FAILED" | "ROLLED_BACK";
export type MaintenanceExecutionOperationResult = {
  index: number;
  type: MaintenanceOperation["type"];
  table: SupportedMaintenanceTable;
  key: string;
  status: MaintenanceExecutionOperationStatus;
  changedFields: string[];
  before: Record<string, JsonValue | { missing: true }>;
  after: Record<string, JsonValue>;
  error?: string;
};
export type MaintenanceExecutionError = {
  phase: "refused" | "transaction" | "verification";
  message: string;
  operationIndex?: number;
};
export type MaintenanceExecutionResult = {
  scriptId: string;
  scriptName: string;
  scriptSha256: string;
  startedAt: string;
  completedAt: string;
  database: { name: string; schemaVersion: number; origin: string; buildId?: string };
  operationCount: number;
  changedCount: number;
  alreadySatisfiedCount: number;
  committed: boolean;
  verified: boolean;
  transactionStarted: boolean;
  errors: MaintenanceExecutionError[];
  operations: MaintenanceExecutionOperationResult[];
};
