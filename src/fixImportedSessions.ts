// src/fixImportedSessions.ts
/* ============================================================================
   fixImportedSessions.ts — Link sessions to templates + mark complete
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-02-27-FIX-SESSIONS-01
   ============================================================================ */

import { db } from "./db";

export async function fixImportedSessions(): Promise<{ updated: number; linked: number; completed: number }> {
  const [templates, sessions] = await Promise.all([db.templates.toArray(), db.sessions.toArray()]);

  const templateIdByName = new Map<string, string>();
  for (const t of templates) {
    const k = (t.name ?? "").trim().toLowerCase();
    if (k) templateIdByName.set(k, t.id);
  }

  let updated = 0;
  let linked = 0;
  let completed = 0;

  const patched = sessions.map((s: any) => {
    let changed = false;

    // Link template if possible
    if (!s.templateId) {
      const key = (s.templateName ?? "").trim().toLowerCase();
      const tid = templateIdByName.get(key);
      if (tid) {
        s.templateId = tid;
        linked++;
        changed = true;
      }
    }

    // Mark complete if missing endedAt
    if (typeof s.endedAt !== "number" || !Number.isFinite(s.endedAt) || s.endedAt <= 0) {
      s.endedAt = (s.startedAt ?? Date.now()) + 60_000; // +1 min
      completed++;
      changed = true;
    }

    if (changed) updated++;
    return s;
  });

  await db.transaction("rw", db.sessions, async () => {
    await (db.sessions as any).bulkPut(patched);
  });

  return { updated, linked, completed };
}