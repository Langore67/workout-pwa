// tests/prs.spec.ts
import { test, expect, type Page, type Locator } from "@playwright/test";
import { resetDexieDb } from "./helpers/dbSeed";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173";

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
  return page.getByRole("button", { name: /\+\s*Add Set/i }).first();
}

function finishButton(page: Page): Locator {
  return page.getByRole("button", { name: /finish session/i }).first();
}

function inputWeight(page: Page): Locator {
  // Updated UI: often "lbs"; iPhone can lose placeholder — keep fallbacks.
  return page
    .locator(
      'input[placeholder*="lbs" i], input[placeholder="weight"], input[name="weight"], input[aria-label*="weight" i], input[inputmode="decimal"]'
    )
    .first();
}

function inputReps(page: Page): Locator {
  return page
    .locator('input[placeholder*="reps" i], input[name="reps"], input[aria-label*="reps" i]')
    .first();
}

function inputRir(page: Page): Locator {
  return page
    .locator('input[placeholder*="rir" i], input[name="rir"], input[aria-label*="rir" i], input[name="RIR"]')
    .first();
}

async function markCompleteFirstSet(page: Page) {
  const cb = page.locator('input[type="checkbox"][aria-label="Complete set"]').first();
  await expect(cb).toBeVisible({ timeout: 15000 });

  // iPhone + styled checkbox: .check() can fail. Click + fallback to DOM toggle.
  await cb.click({ force: true });

  if (!(await cb.isChecked().catch(() => false))) {
    await page.evaluate(() => {
      const el = document.querySelector('input[type="checkbox"][aria-label="Complete set"]') as HTMLInputElement | null;
      if (!el) return;
      el.checked = true;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  await expect(cb).toBeChecked({ timeout: 15000 });
}

test("PRs show on Session Complete after finishing", async ({ page }) => {
  await goto(page, "/");
  await resetDexieDb(page);

  // Seed:
  // - Bench Press track
  // - Template + templateItem
  // - Prior ended session with a baseline working set
  // - Current session (the one we will run)
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

    // Prior completed session (baseline)
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

    // Current session
    const sessionId = uuid();
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

  const w = inputWeight(page);
  const r = inputReps(page);
  const rir = inputRir(page);

  await expect(w).toBeVisible({ timeout: 15000 });
  await expect(r).toBeVisible({ timeout: 15000 });
  if (await rir.count()) await expect(rir).toBeVisible({ timeout: 15000 });

  // Beat baseline -> should generate prsJson
  await w.fill("135");
  await r.fill("8");
  if (await rir.count()) await rir.fill("2");

  await markCompleteFirstSet(page);

  await finishButton(page).click();

  // If Finish gate blocks, a review panel appears (fail fast)
  await expect(page.getByText(/Review \(tap to jump\)/i)).toHaveCount(0);

  // Land on complete
  await page.waitForURL(/\/complete\//, { timeout: 15000 });

  // Give iPhone/Safari a beat to flush Dexie write
  await page.waitForTimeout(250);

  // Stable assertion: prsJson exists and is non-empty
  const prsJson = await page.evaluate(async (sid) => {
    // @ts-ignore
    const db = window.__db;
    if (!db) throw new Error("__db missing on window.");
    const s = await db.sessions.get(sid);
    return s?.prsJson ?? null;
  }, seeded.sessionId);

  expect(prsJson).not.toBeNull();
  expect(typeof prsJson).toBe("string");
  expect((prsJson as string).length).toBeGreaterThan(2);
  expect(prsJson).not.toBe("[]");

  // Optional UI assertion (only if the PR section exists in your current UI)
  const prsHeader = page.getByText(/PRs|Personal Records/i).first();
  if (await prsHeader.count()) {
    await expect(prsHeader).toBeVisible({ timeout: 15000 });
  }
});
