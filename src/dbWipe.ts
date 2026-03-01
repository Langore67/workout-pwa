// src/dbWipe.ts
/* ============================================================================
   dbWipe.ts — DEV DB wipe helpers
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-02-27-DBWIPE-01

   Purpose
   ✅ Clear all tables for a clean import (DEV/staging workflow)
   ============================================================================ */

import { db } from "./db";

export async function wipeAllTables(): Promise<void> {
  await db.transaction("rw", db.tables, async () => {
    for (const t of db.tables) {
      await (t as any).clear();
    }
  });
}