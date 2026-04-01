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

async function seedSingleExerciseSession(
  page: Page,
  args: { exerciseName: string; trackDisplayName?: string; priorWeight?: number }
) {
  return await page.evaluate(async ({ exerciseName, trackDisplayName, priorWeight }) => {
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
    const priorSessionId = uuid();

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

    if (typeof priorWeight === "number") {
      await db.sessions.add({
        id: priorSessionId,
        templateId,
        templateName: "Upper A",
        startedAt: now - 1000 * 60 * 60 * 24,
        endedAt: now - 1000 * 60 * 60 * 24 + 60_000,
      });

      await db.sets.add({
        id: uuid(),
        sessionId: priorSessionId,
        trackId,
        setType: "working",
        weight: priorWeight,
        reps: 8,
        createdAt: now - 1000 * 60 * 60 * 24 + 10_000,
      });
    }

    return { sessionId };
  }, args);
}

async function seedRepsOnlySession(page: Page) {
  return await page.evaluate(async () => {
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
      name: "Crunch",
      equipmentTags: [],
      createdAt: now,
    });

    await db.tracks.add({
      id: trackId,
      exerciseId,
      trackType: "hypertrophy",
      displayName: "Crunch",
      trackingMode: "repsOnly",
      warmupSetsDefault: 0,
      workingSetsDefault: 3,
      repMin: 10,
      repMax: 20,
      restSecondsDefault: 60,
      weightJumpDefault: 0,
      createdAt: now,
    });

    await db.templates.add({
      id: templateId,
      name: "Abs",
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
      templateName: "Abs",
      startedAt: now,
    });

    return { sessionId };
  });
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

async function latestSetReps(page: Page, sessionId: string) {
  return await page.evaluate(async (sid) => {
    // @ts-ignore
    const db = window.__db;
    const sets = await db.sets.where("sessionId").equals(sid).sortBy("createdAt");
    return sets.at(-1)?.reps ?? null;
  }, sessionId);
}

async function latestSetRir(page: Page, sessionId: string) {
  return await page.evaluate(async (sid) => {
    // @ts-ignore
    const db = window.__db;
    const sets = await db.sets.where("sessionId").equals(sid).sortBy("createdAt");
    return sets.at(-1)?.rir ?? null;
  }, sessionId);
}

async function seedExtraSets(page: Page, sessionId: string, count: number) {
  await page.evaluate(async ({ sid, count }) => {
    // @ts-ignore
    const db = window.__db;
    if (!db) throw new Error("__db missing on window.");

    const session = await db.sessions.get(sid);
    if (!session) throw new Error("session missing");

    const trackId = (await db.templateItems.where("templateId").equals(session.templateId).first())?.trackId;
    if (!trackId) throw new Error("track missing");

    const now = Date.now();
    for (let i = 0; i < count; i += 1) {
      await db.sets.add({
        id: crypto.randomUUID(),
        sessionId: sid,
        trackId,
        setType: "working",
        weight: 45,
        reps: 8,
        createdAt: now + i,
      });
    }
  }, { sid: sessionId, count });
}

async function activeElementName(page: Page) {
  return await page.evaluate(() => {
    const el = document.activeElement as HTMLInputElement | null;
    return el?.getAttribute("name") ?? el?.getAttribute("aria-label") ?? "";
  });
}

async function tapPadKeys(page: Page, keys: string[]) {
  const pad = page.getByTestId("numeric-pad");
  for (const key of keys) {
    await pad.getByRole("button", { name: key, exact: true }).click();
  }
}

test.describe("Gym assisted weight entry", () => {
  test.beforeEach(async ({ page }) => {
    await goto(page, "/");
    await resetDexieDb(page);
  });

  test("weight field uses NumericPad-driven flow", async ({ page }) => {
    const seeded = await seedSingleExerciseSession(page, { exerciseName: "Pull Up" });

    await goto(page, `/gym/${seeded.sessionId}`);
    await expectGymReady(page);

    const weight = await addSetAndGetWeightInput(page);
    await weight.click();

    await expect(page.getByTestId("numeric-pad")).toBeVisible();
  });

  test("reps field uses the same NumericPad system", async ({ page }) => {
    const seeded = await seedSingleExerciseSession(page, { exerciseName: "Pull Up" });

    await goto(page, `/gym/${seeded.sessionId}`);
    await expectGymReady(page);

    await addSetAndGetWeightInput(page);
    const reps = page.getByRole("textbox", { name: "reps" }).first();
    await reps.click();

    await expect(page.getByTestId("numeric-pad")).toBeVisible();
    await expect(page.getByTestId("gym-weight-accessory-sign")).toHaveCount(0);
    await expect(page.getByTestId("gym-weight-accessory-sign-disabled")).toBeDisabled();

    await tapPadKeys(page, ["1", "0"]);
    await page.getByTestId("gym-weight-accessory-dismiss").click();
    await expect.poll(async () => await latestSetReps(page, seeded.sessionId)).toBe(10);
  });

  test("rir field uses the same NumericPad system", async ({ page }) => {
    const seeded = await seedSingleExerciseSession(page, { exerciseName: "Pull Up" });

    await goto(page, `/gym/${seeded.sessionId}`);
    await expectGymReady(page);

    await addSetAndGetWeightInput(page);
    const rir = page.getByRole("textbox", { name: "rir" }).first();
    await rir.click();

    await expect(page.getByTestId("numeric-pad")).toBeVisible();
    await expect(page.getByTestId("gym-weight-accessory-sign")).toHaveCount(0);
    await expect(page.getByTestId("gym-weight-accessory-sign-disabled")).toBeDisabled();

    await tapPadKeys(page, ["1", ".", "5"]);
    await page.getByTestId("gym-weight-accessory-dismiss").click();
    await expect.poll(async () => await latestSetRir(page, seeded.sessionId)).toBe(1.5);
  });

  test("reps-only rows use the same NumericPad system", async ({ page }) => {
    const seeded = await seedRepsOnlySession(page);

    await goto(page, `/gym/${seeded.sessionId}`);
    await expectGymReady(page);

    await page.getByRole("button", { name: /\+\s*Add Set/i }).first().click();
    const reps = page.getByRole("textbox", { name: "reps" }).first();
    await reps.click();

    await expect(page.getByTestId("numeric-pad")).toBeVisible();
    await tapPadKeys(page, ["1", "2"]);
    await page.getByTestId("gym-weight-accessory-dismiss").click();
    await expect.poll(async () => await latestSetReps(page, seeded.sessionId)).toBe(12);
  });

  test("assisted weight sign toggle still works", async ({ page }) => {
    const seeded = await seedSingleExerciseSession(page, { exerciseName: "Assisted Pull Up" });

    await goto(page, `/gym/${seeded.sessionId}`);
    await expectGymReady(page);

    const weight = await addSetAndGetWeightInput(page);
    await weight.click();

    const pad = page.getByTestId("numeric-pad");
    const sign = page.getByTestId("gym-weight-accessory-sign");

    await expect(pad).toBeVisible();
    await expect(sign).toHaveText("-/+ +");

    await tapPadKeys(page, ["6", "5"]);
    await sign.click();
    await expect(sign).toHaveText("-/+ -");
    await page.getByTestId("gym-weight-accessory-dismiss").click();

    await expect.poll(async () => await latestSetWeight(page, seeded.sessionId)).toBe(-65);
  });

  test("non-assisted rows still do not get active sign behavior", async ({ page }) => {
    const seeded = await seedSingleExerciseSession(page, { exerciseName: "Bench Press" });

    await goto(page, `/gym/${seeded.sessionId}`);
    await expectGymReady(page);

    const weight = await addSetAndGetWeightInput(page);
    await weight.click();

    await expect(page.getByTestId("numeric-pad")).toBeVisible();
    await expect(page.getByTestId("gym-weight-accessory-sign")).toHaveCount(0);
    await expect(page.getByTestId("gym-weight-accessory-sign-disabled")).toBeDisabled();

    await tapPadKeys(page, ["1", "3", "5"]);
    await page.getByTestId("gym-weight-accessory-dismiss").click();
    await expect.poll(async () => await latestSetWeight(page, seeded.sessionId)).toBe(135);
  });

  test("Hide dismisses the active input", async ({ page }) => {
    const seeded = await seedSingleExerciseSession(page, { exerciseName: "Pull Up" });

    await goto(page, `/gym/${seeded.sessionId}`);
    await expectGymReady(page);

    const weight = await addSetAndGetWeightInput(page);
    await weight.click();

    await expect(page.getByTestId("numeric-pad")).toBeVisible();
    await page.getByTestId("gym-weight-accessory-dismiss").click();
    await expect(page.getByTestId("numeric-pad")).toHaveCount(0);
    await expect.poll(async () => await activeElementName(page)).not.toBe("weight");
  });

  test("Next advances focus sensibly", async ({ page }) => {
    const seeded = await seedSingleExerciseSession(page, { exerciseName: "Pull Up" });

    await goto(page, `/gym/${seeded.sessionId}`);
    await expectGymReady(page);

    const weight = await addSetAndGetWeightInput(page);
    await weight.click();

    await tapPadKeys(page, ["6", "5"]);
    await page.getByTestId("gym-weight-accessory-next").click();
    await expect.poll(async () => await activeElementName(page)).toBe("reps");
    await expect.poll(async () => await latestSetWeight(page, seeded.sessionId)).toBe(65);
  });

  test("Next advances from reps to RIR on loaded-reps rows", async ({ page }) => {
    const seeded = await seedSingleExerciseSession(page, { exerciseName: "Pull Up" });

    await goto(page, `/gym/${seeded.sessionId}`);
    await expectGymReady(page);

    await addSetAndGetWeightInput(page);
    const reps = page.getByRole("textbox", { name: "reps" }).first();
    await reps.click();

    await tapPadKeys(page, ["8"]);
    await page.getByTestId("gym-weight-accessory-next").click();
    await expect.poll(async () => await activeElementName(page)).toBe("rir");
    await expect.poll(async () => await latestSetReps(page, seeded.sessionId)).toBe(8);
  });

  test("page can scroll while docked NumericPad is open and active input stays above it", async ({ page }) => {
    const seeded = await seedSingleExerciseSession(page, { exerciseName: "Pull Up" });
    await seedExtraSets(page, seeded.sessionId, 14);

    await goto(page, `/gym/${seeded.sessionId}`);
    await expectGymReady(page);

    const firstWeight = page.getByRole("textbox", { name: "weight" }).first();
    await firstWeight.click();
    await expect(page.getByTestId("numeric-pad")).toBeVisible();

    const scrollBefore = await page.evaluate(() => window.scrollY);
    await page.evaluate(() => window.scrollBy(0, 500));
    await expect.poll(async () => await page.evaluate(() => window.scrollY)).toBeGreaterThan(scrollBefore);

    const lastWeight = page.getByRole("textbox", { name: "weight" }).last();
    await lastWeight.click();

    const padBox = await page.getByTestId("numeric-pad").boundingBox();
    const inputBox = await lastWeight.boundingBox();
    expect(padBox).not.toBeNull();
    expect(inputBox).not.toBeNull();
    expect(inputBox!.y + inputBox!.height).toBeLessThan(padBox!.y);
  });

  test("existing assisted negative-save workflow is not broken", async ({ page }) => {
    const seeded = await seedSingleExerciseSession(page, {
      exerciseName: "Pull Up",
      trackDisplayName: "Upper A Assistance",
      priorWeight: 45,
    });

    await goto(page, `/gym/${seeded.sessionId}`);
    await expectGymReady(page);

    const weight = await addSetAndGetWeightInput(page);
    await expect(weight).toHaveValue("45");

    await weight.click();
    await tapPadKeys(page, ["⌫", "⌫", "6", "5"]);
    await page.getByTestId("gym-weight-accessory-sign").click();
    await page.getByTestId("gym-weight-accessory-dismiss").click();

    await expect.poll(async () => await latestSetWeight(page, seeded.sessionId)).toBe(-65);
  });
});
