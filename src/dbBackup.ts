// src/dbBackup.ts
// Dexie IndexedDB Backup/Restore (JSON) for IronForge / WorkOut App
// Hardened version:
// - exports all tables
// - includes backup metadata
// - validates payload before destructive restore
// - restores in explicit order
// - uses bulkPut for safer idempotent restore

import { db } from "./db";
import { addAppLog } from "./appLog";

type BackupMeta = {
  app: string;
  backupVersion: number;
  exportedAt: string;
  dbName: string;
  tableNames: string[];
};

type BackupPayload = {
  meta: BackupMeta;
  tables: Record<string, any[]>;
};

const BACKUP_APP_NAME = "WorkOut App";
const BACKUP_VERSION = 2;

// Keep this aligned with your real Dexie DB name from db.ts
const DB_NAME = "workout_mvp_db";

// Explicit restore order: parent-ish tables first, dependent tables later
const PREFERRED_RESTORE_ORDER = [
  "folders",
  "exercises",
  "exerciseVariants",
  "tracks",
  "templates",
  "templateItems",
  "sessions",
  "sets",
  "walks",
  "trackPrs",
] as const;

function isoStamp() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    d.getFullYear() +
    "-" +
    pad(d.getMonth() + 1) +
    "-" +
    pad(d.getDate()) +
    "_" +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

function getAllLiveTableNames(): string[] {
  return db.tables.map((t) => t.name);
}

function validateBackupPayload(payload: any): asserts payload is BackupPayload {
  if (!payload || typeof payload !== "object") {
    throw new Error("Backup file is not a valid object.");
  }

  if (!payload.meta || typeof payload.meta !== "object") {
    throw new Error("Backup JSON missing meta.");
  }

  if (payload.meta.app !== BACKUP_APP_NAME) {
    throw new Error(
      `Backup app mismatch. Expected "${BACKUP_APP_NAME}", got "${payload.meta.app ?? "unknown"}".`
    );
  }

  if (!payload.tables || typeof payload.tables !== "object") {
    throw new Error("Backup JSON missing tables.");
  }

  const coreTables = ["exercises", "tracks", "sessions", "sets"];
  const hasAnyCoreTable = coreTables.some((name) => Array.isArray(payload.tables[name]));

  if (!hasAnyCoreTable) {
    throw new Error("Backup JSON does not contain expected core tables.");
  }
}

function buildRestoreOrder(payloadTableNames: string[]): string[] {
  const liveTableNames = getAllLiveTableNames();

  const preferred = PREFERRED_RESTORE_ORDER.filter(
    (name) => liveTableNames.includes(name) && payloadTableNames.includes(name)
  );

  const remaining = liveTableNames.filter(
    (name) => !preferred.includes(name as any) && payloadTableNames.includes(name)
  );

  return [...preferred, ...remaining];
}

export async function backupDbToDownload() {
  const tables: Record<string, any[]> = {};

  for (const t of db.tables) {
    tables[t.name] = await (t as any).toArray();
  }

  const payload: BackupPayload = {
    meta: {
      app: BACKUP_APP_NAME,
      backupVersion: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      dbName: DB_NAME,
      tableNames: Object.keys(tables),
    },
    tables,
  };

  const filename = `workoutapp_backup_${isoStamp()}.json`;
  downloadText(filename, JSON.stringify(payload, null, 2));
  await addAppLog({
      type: "export",
      level: "info",
      message: "Created DB backup",
      detailsJson: JSON.stringify({
        filename,
        tableCount: Object.keys(tables).length,
      }),
  });
  
  return filename;
}

export async function restoreDbFromJsonText(jsonText: string) {
  let payload: BackupPayload;

  try {
    payload = JSON.parse(jsonText);
  } catch {
    throw new Error("Invalid JSON file.");
  }

  validateBackupPayload(payload);

  const payloadTableNames = Object.keys(payload.tables);
  const restoreOrder = buildRestoreOrder(payloadTableNames);

   await db.transaction("rw", db.tables, async () => {
     // Clear only live tables in the current DB
     for (const t of db.tables) {
       await (t as any).clear();
     }
 
     // Restore in explicit order first
     for (const tableName of restoreOrder) {
       const table = db.table(tableName);
       const rows = payload.tables[tableName];
 
       if (Array.isArray(rows) && rows.length) {
         await (table as any).bulkPut(rows);
       }
     }
   });
 
   await addAppLog({
     type: "restore",
     level: "info",
     message: "Restored DB from backup JSON",
     detailsJson: JSON.stringify({
       tableCount: restoreOrder.length,
       backupVersion: payload.meta?.backupVersion ?? null,
       exportedAt: payload.meta?.exportedAt ?? null,
     }),
   });
 
   return true;
}