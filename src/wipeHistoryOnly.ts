// src/wipeHistoryOnly.ts
/* ============================================================================
   wipeHistoryOnly.ts — Clear workout history while keeping catalog/templates
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-03-06-WIPEHISTORY-03

   Clears (if present)
   - sessions
   - sets
   - walks
   - trackPrs
   - prs (legacy fallback, if present)

   Keeps
   - exercises
   - exerciseVariants
   - tracks
   - templates
   - templateItems
   - folders
   - and other catalog/config tables
   ============================================================================ */

import { db } from "./db";
import { addAppLog } from "./appLog";

async function clearTableIfExists(name: string): Promise<void> {
  const t = db.tables.find((x) => x.name === name);
  if (!t) return;
  await (t as any).clear();
}

/**
 * Wipes workout history while keeping the catalog/templates intact.
 */
export async function wipeWorkoutHistoryOnly(): Promise<void> {
  await db.transaction("rw", db.tables, async () => {
    // Core training history
    await clearTableIfExists("sets");
    await clearTableIfExists("sessions");

    // Optional history
    await clearTableIfExists("walks");

    // Derived / cached PR tables
    await clearTableIfExists("trackPrs");
    await clearTableIfExists("prs"); // legacy fallback if older table still exists
  });

  await addAppLog({
    type: "wipe",
    level: "info",
    message: "Wiped workout history only",
  });
}