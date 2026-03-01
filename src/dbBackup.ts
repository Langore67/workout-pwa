// src/dbBackup.ts
// Dexie IndexedDB Backup/Restore (JSON) for DEV safety.
// - Backup downloads a JSON file of all tables.
// - Restore wipes DB and imports that JSON.
//
// Notes:
// - This is NOT meant for huge DBs (it’s JSON in memory).
// - Perfect for “gym-ready” safety + CSV import workflows.

import { db } from "./db";

type BackupPayload = {
  meta: {
    app: string;
    version: string;
    exportedAt: string;
  };
  tables: Record<string, any[]>;
};

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
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function backupDbToDownload() {
  // db.tables are Dexie Table objects; each has .name and .toArray()
  const tables: Record<string, any[]> = {};
  for (const t of db.tables) {
    // @ts-ignore Dexie typing sometimes hides toArray
    tables[t.name] = await (t as any).toArray();
  }

  const payload: BackupPayload = {
    meta: {
      app: "WorkOut App",
      version: "1",
      exportedAt: new Date().toISOString(),
    },
    tables,
  };

  const filename = `workoutapp_backup_${isoStamp()}.json`;
  downloadText(filename, JSON.stringify(payload, null, 2));
  return filename;
}

export async function restoreDbFromJsonText(jsonText: string) {
  let payload: BackupPayload;
  try {
    payload = JSON.parse(jsonText);
  } catch {
    throw new Error("Invalid JSON file.");
  }
  if (!payload?.tables || typeof payload.tables !== "object") {
    throw new Error("Backup JSON missing tables.");
  }

  // Restore is destructive: wipe then import in a single transaction
  await db.transaction("rw", db.tables, async () => {
    for (const t of db.tables) {
      await (t as any).clear();
    }

    for (const t of db.tables) {
      const rows = payload.tables[t.name];
      if (Array.isArray(rows) && rows.length) {
        await (t as any).bulkAdd(rows);
      }
    }
  });

  return true;
}