import { test, expect, type Page } from "@playwright/test";
import { resetDexieDb } from "./helpers/dbSeed";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173/";

async function goto(page: Page, path: string) {
  await page.goto(new URL(path, BASE_URL).toString(), { waitUntil: "domcontentloaded" });
}

async function expectGymReady(page: Page) {
  const gymReady = page.getByTestId("gym-ready");
  if (await gymReady.count()) {
    await expect(gymReady).toBeVisible({ timeout: 15000 });
  } else {
    await expect(page.getByText("Gym Mode")).toBeVisible({ timeout: 15000 });
  }
}

async function seedSingleExerciseSession(page: Page, args: { exerciseName: string; trackDisplayName?: string }) {
  return await page.evaluate(async ({ exerciseName, trackDisplayName }) => {
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
      name: exerciseName,
      equipmentTags: ["bodyweight"],
      createdAt: now,
    });

    await db.tracks.add({
      id: trackId,
      exerciseId,
      trackType: "hypertrophy",
      displayName: trackDisplayName ?? exerciseName,
      trackingMode: "weightedReps",
      warmupSetsDefault: 2,
      workingSetsDefault: 3,
      repMin: 6,
      repMax: 10,
      restSecondsDefault: 120,
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

    return { sessionId };
  }, args);
}

async function addSetAndGetWeightInput(page: Page) {
  await page.getByRole("button", { name: /\+\s*Add Set/i }).first().click();
  const weight = page.getByRole("textbox", { name: "weight" }).first();
  await expect(weight).toBeVisible({ timeout: 15000 });
  return weight;
}

async function latestSetWeight(page: Page, sessionId: string) {
  return await page.evaluate(async (sid) => {
    // @ts-ignore
    const db = window.__db;
    const sets = await db.sets.where("sessionId").equals(sid).sortBy("createdAt");
    return sets.at(-1)?.weight ?? null;
  }, sessionId);
}

test.describe("Gym assisted weight entry", () => {
  test.beforeEach(async ({ page }) => {
    await goto(page, "/");
    await resetDexieDb(page);
  });

  test("allows negative weight entry for assisted pull ups", async ({ page }) => {
    const seeded = await seedSingleExerciseSession(page, { exerciseName: "Pull Up" });

    await goto(page, `/gym/${seeded.sessionId}`);
    await expectGymReady(page);

    const weight = await addSetAndGetWeightInput(page);
    await weight.fill("-65");
    await weight.press("Tab");

    await expect.poll(async () => await latestSetWeight(page, seeded.sessionId)).toBe(-65);
  });

  test("keeps normal positive entry and still blocks negative bench entry", async ({ page }) => {
    const seeded = await seedSingleExerciseSession(page, { exerciseName: "Bench Press" });

    await goto(page, `/gym/${seeded.sessionId}`);
    await expectGymReady(page);

    const weight = await addSetAndGetWeightInput(page);

    await weight.fill("135");
    await weight.press("Tab");
    await expect.poll(async () => await latestSetWeight(page, seeded.sessionId)).toBe(135);

    await weight.fill("-65");
    await weight.press("Tab");
    await expect.poll(async () => await latestSetWeight(page, seeded.sessionId)).toBe(0);
  });
});
