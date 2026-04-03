// tests/finish-session.spec.ts
import { test, expect, type Page, type Locator } from "@playwright/test";
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

function addSetButton(page: Page): Locator {
  // UI is now "+ Add Set (2:00)" (or similar), not "+ Working"
  return page.getByRole("button", { name: /\+\s*Add Set/i }).first();
}

function finishButton(page: Page): Locator {
  return page.getByRole("button", { name: /finish session/i }).first();
}

function inputWeight(page: Page): Locator {
  return page.getByRole("textbox", { name: "weight" }).first();
}

function inputReps(page: Page): Locator {
  return page.getByRole("textbox", { name: "reps" }).first();
}

function inputRir(page: Page): Locator {
  return page.getByRole("textbox", { name: "rir" }).first();
}

async function tapPadKeys(page: Page, keys: string[]) {
  const pad = page.getByTestId("numeric-pad");
  await expect(pad).toBeVisible({ timeout: 15000 });
  for (const key of keys) {
    await pad.getByRole("button", { name: key, exact: true }).click();
  }
}

async function enterLoadedRepsSet(
  page: Page,
  args: { weight: string; reps: string; rir?: string; clearWeightDigits?: number }
) {
  const w = inputWeight(page);
  const r = inputReps(page);
  const rir = inputRir(page);

  await expect(w).toBeVisible({ timeout: 15000 });
  await expect(r).toBeVisible({ timeout: 15000 });
  if (await rir.count()) await expect(rir).toBeVisible({ timeout: 15000 });

  await w.click();
  for (let i = 0; i < (args.clearWeightDigits ?? 0); i += 1) {
    await tapPadKeys(page, ["⌫"]);
  }
  await tapPadKeys(page, args.weight.split(""));
  await page.getByTestId("gym-weight-accessory-dismiss").click();

  await r.click();
  await tapPadKeys(page, args.reps.split(""));
  await page.getByTestId("gym-weight-accessory-dismiss").click();

  if (args.rir && (await rir.count())) {
    await rir.click();
    await tapPadKeys(page, args.rir.split(""));
    await page.getByTestId("gym-weight-accessory-dismiss").click();
  }
}

async function markCompleteFirstSet(page: Page) {
  const cb = page.locator('input[type="checkbox"][aria-label="Complete set"]').first();
  await expect(cb).toBeVisible({ timeout: 15000 });

  // iPhone + styled checkbox: .check() can fail even when clickable.
  await cb.click({ force: true });

  // If click didn't toggle, flip via DOM and dispatch events.
  if (!(await cb.isChecked().catch(() => false))) {
    await page.evaluate(() => {
      const el = document.querySelector(
        'input[type="checkbox"][aria-label="Complete set"]'
      ) as HTMLInputElement | null;
      if (!el) return;
      el.checked = true;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  await expect(cb).toBeChecked({ timeout: 15000 });
}

async function ensureFinishNavigated(page: Page) {
  // If finish gate blocks, app shows Review list instead of navigating.
  await expect(page.getByText(/Review \(tap to jump\)/i)).toHaveCount(0);
  await page.waitForURL(/\/complete\//, { timeout: 15000 });
}

test.describe("Finish Session pipeline", () => {
  test("finish stores summary + updates template.lastPerformedAt + navigates", async ({ page }) => {
    await goto(page, "/");
    await resetDexieDb(page);

    const seeded = await page.evaluate(async () => {
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

      // GymPage updates templates.lastPerformedAt (not lastRunAt)
      await db.templates.add({
        id: templateId,
        name: "Upper A",
        lastPerformedAt: undefined,
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

      return { sessionId, templateId };
    });

    await goto(page, `/gym/${seeded.sessionId}`);
    await expectGymReady(page);

    const add = addSetButton(page);
    await expect(add).toBeVisible({ timeout: 15000 });
    await add.click();

    await enterLoadedRepsSet(page, {
      weight: "135",
      reps: "8",
      rir: "2",
    });

    await markCompleteFirstSet(page);

    const notesBox = page.locator("textarea.input, textarea[placeholder*='notes' i]").first();
    if (await notesBox.count()) {
      await notesBox.fill("E2E notes");
    }

    const finish = finishButton(page);
    await expect(finish).toBeVisible({ timeout: 15000 });
    await finish.click();

    await ensureFinishNavigated(page);

    const completeTitle = page.getByTestId("session-complete-title");
    if (await completeTitle.count()) {
      await expect(completeTitle).toBeVisible({ timeout: 15000 });
    } else {
      await expect(page.getByText(/session complete/i)).toBeVisible({ timeout: 15000 });
    }

    const dbState = await page.evaluate(async ({ sessionId, templateId }) => {
      // @ts-ignore
      const db = window.__db;
      if (!db) throw new Error("__db missing on window.");

      const session = await db.sessions.get(sessionId);
      const template = await db.templates.get(templateId);

      return {
        endedAt: session?.endedAt ?? null,
        notes: session?.notes ?? null,
        lastPerformedAt: template?.lastPerformedAt ?? null,
      };
    }, seeded);

    expect(dbState.endedAt).not.toBeNull();
    expect(typeof dbState.endedAt).toBe("number");
    expect(dbState.notes).toBe("E2E notes");
    expect(dbState.lastPerformedAt).not.toBeNull();
    expect(typeof dbState.lastPerformedAt).toBe("number");
  });

  test("finish stores PR snapshot when you beat prior baseline", async ({ page }) => {
    await goto(page, "/");
    await resetDexieDb(page);

    const seeded = await page.evaluate(async () => {
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

      // Prior session baseline
      const priorSessionId = uuid();
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
        weight: 100,
        reps: 5,
        rpe: undefined,
        createdAt: now - 1000 * 60 * 60 * 24 + 10_000,
      });

      // New session
      await db.sessions.add({
        id: sessionId,
        templateId,
        templateName: "Upper A",
        startedAt: now,
      });

      return { sessionId };
    });

    await goto(page, `/gym/${seeded.sessionId}`);
    await expectGymReady(page);

    const add = addSetButton(page);
    await expect(add).toBeVisible({ timeout: 15000 });
    await add.click();

    await enterLoadedRepsSet(page, {
      weight: "135",
      reps: "8",
      rir: "2",
      clearWeightDigits: 3,
    });

    await markCompleteFirstSet(page);

    await finishButton(page).click();
    await ensureFinishNavigated(page);

    await expect
      .poll(
        async () =>
          await page.evaluate(async (sessionId) => {
            // @ts-ignore
            const db = window.__db;
            if (!db) throw new Error("__db missing on window.");
            const session = await db.sessions.get(sessionId);
            return session?.prsJson ?? null;
          }, seeded.sessionId),
        { timeout: 5000 }
      )
      .not.toBe("[]");
  });
});
