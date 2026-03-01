// src/wipeHistoryOnly.ts
/* ============================================================================
   wipeHistoryOnly.ts — Clear workout history while keeping catalog/templates
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-02-27-WIPEHISTORY-01

   Clears (if present)
   - sessions
   - sets
   - prs (derived)
   - walks (optional; included here)

   Keeps
   - exercises
   - tracks
   - templates
   - templateItems
   - folders (and other catalog/config tables)
   ============================================================================ */

import { db } from "./db";

async function clearTableIfExists(name: string): Promise<void> {
  const t = db.tables.find((x) => x.name === name);
  if (!t) return;
  await (t as any).clear();
}

/**
 * Wipes ALL workout history while keeping your exercise catalog + templates.
 */
export async function wipeWorkoutHistoryOnly(): Promise<void> {
  await db.transaction("rw", db.tables, async () => {
    // Core history
    await clearTableIfExists("sets");
    await clearTableIfExists("sessions");

    // Optional history (comment out if you want to keep walks)
    await clearTableIfExists("walks");

    // Derived / cached tables (if your app uses them)
    await clearTableIfExists("prs");
  });
}