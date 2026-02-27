import { Page } from "@playwright/test";

export async function resetDexieDb(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.evaluate(async () => {
    // @ts-ignore
    const db = window.__db;
    if (!db) throw new Error("__db missing. Ensure db.ts exposes window.__db.");
    await db.delete();
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
}

export async function seedTemplateSession(
  page: Page,
  opts?: { withPriorPrBaseline?: boolean }
): Promise<{ sessionId: string; templateId: string; trackId: string }> {
  return page.evaluate(async (args) => {
    // @ts-ignore
    const db = window.__db;
    if (!db) throw new Error("__db missing.");

    const now = Date.now();
    const uuid = () => crypto.randomUUID();

    const exerciseId = uuid();
    const trackId = uuid();
    const templateId = uuid();
    const templateItemId = uuid();
    const sessionId = uuid();

    await db.exercises.add({
      id: exerciseId,
      name: "RDL",
      equipmentTags: ["barbell"],
      createdAt: now - 10_000,
    });

    await db.tracks.add({
      id: trackId,
      exerciseId,
      trackType: "strength",
      displayName: "RDL",
      trackingMode: "weightedReps",
      warmupSetsDefault: 0,
      workingSetsDefault: 1,
      repMin: 5,
      repMax: 10,
      restSecondsDefault: 120,
      weightJumpDefault: 10,
      createdAt: now - 9_000,
    });

    await db.templates.add({
      id: templateId,
      name: "Lower A",
      createdAt: now - 8_000,
      folderId: undefined,
    });

    await db.templateItems.add({
      id: templateItemId,
      templateId,
      orderIndex: 0,
      trackId,
      notes: "Hinge focus",
      createdAt: now - 7_000,
    });

    if (args?.withPriorPrBaseline) {
      const prevSessionId = uuid();

      await db.sessions.add({
        id: prevSessionId,
        templateId,
        templateName: "Lower A",
        startedAt: now - 10 * 86400 * 1000,
        endedAt: now - 10 * 86400 * 1000 + 35 * 60 * 1000,
        notes: "older baseline",
        readiness: "Normal",
      });

      await db.sets.add({
        id: uuid(),
        sessionId: prevSessionId,
        trackId,
        createdAt: now - 10 * 86400 * 1000 + 1000,
        setType: "working",
        weight: 90,
        reps: 5,
        rpe: 7,
      });
    }

    await db.sessions.add({
      id: sessionId,
      templateId,
      templateName: "Lower A",
      startedAt: now - 2 * 60 * 1000,
      notes: "",
      readiness: "Normal",
    });

    return { sessionId, templateId, trackId };
  }, opts ?? {});
}
