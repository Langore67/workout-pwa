import { test, expect } from "@playwright/test";
import { resetDexieDb } from "./helpers/dbSeed";

test("app loads and can open a seeded gym session", async ({ page }) => {
  await page.goto("http://127.0.0.1:5173/", { waitUntil: "domcontentloaded" });

  // Clear DB
  await resetDexieDb(page);

  // Seed minimal data + create a session, then return sessionId
  const sessionId = await page.evaluate(async () => {
    // @ts-ignore
    const db = window.__db;
    if (!db) throw new Error("__db missing on window.");

    const now = Date.now();
    const uuid = () => crypto.randomUUID();

    const exerciseId = uuid();
    const trackId = uuid();
    const templateId = uuid();
    const templateItemId = uuid();
    const sessionId = uuid();

    await db.exercises.add({
      id: exerciseId,
      name: "Bench Press",
      equipmentTags: ["barbell"],
      createdAt: now,
    });

    await db.tracks.add({
      id: trackId,
      exerciseId,
      trackType: "strength",
      displayName: "Bench Press — Strength",
      trackingMode: "weightedReps",
      warmupSetsDefault: 2,
      workingSetsDefault: 3,
      repMin: 3,
      repMax: 6,
      restSecondsDefault: 180,
      rirTargetMin: 1,
      rirTargetMax: 2,
      weightJumpDefault: 5,
      createdAt: now,
    });

    await db.templates.add({
      id: templateId,
      name: "Upper A",
      createdAt: now,
    });

    await db.templateItems.add({
      id: templateItemId,
      templateId,
      orderIndex: 0,
      trackId,
      createdAt: now,
    });

    await db.sessions.add({
      id: sessionId,
      templateId,
      templateName: "Upper A",
      startedAt: now,
    });

    return sessionId;
  });

  // Go straight to Gym page
  await page.goto(`http://127.0.0.1:5173/gym/${sessionId}`, { waitUntil: "domcontentloaded" });

  // Confirm Gym Mode loads (some builds also expose a "gym-ready" test id)
  const gymReady = page.getByTestId("gym-ready");
  if (await gymReady.count()) {
    await expect(gymReady).toBeVisible({ timeout: 15000 });
  } else {
    await expect(page.getByText("Gym Mode")).toBeVisible({ timeout: 15000 });
  }
});
