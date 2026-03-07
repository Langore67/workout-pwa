// src/dbWipe.ts
/* ============================================================================
   dbWipe.ts — DEV DB wipe helpers
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-03-07-DBWIPE-02

   Purpose
   ✅ Clear all tables for a clean import (DEV/staging workflow)
   ============================================================================ */

import { db } from "./db";
import { addAppLog } from "./appLog";

export async function wipeAllTables(): Promise<void> {
  await db.transaction("rw", db.tables, async () => {
    for (const t of db.tables) {
      await (t as any).clear();
    }
  });

  // Log AFTER wipe so the new DB starts with this entry
  await addAppLog({
    type: "wipe",
    level: "warn",
    message: "Full database wipe executed",
  });
}