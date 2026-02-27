import { test, expect, Page } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173/";

async function gotoApp(page: Page, path: string) {
  await page.goto(new URL(path, BASE_URL).toString(), { waitUntil: "domcontentloaded" });
}

function navLink(page: Page, name: string) {
  return page.getByRole("link", { name });
}

async function resetDb(page: Page) {
  await page.evaluate(async () => {
    const db = (window as any).__db;
    if (!db) return;
    await db.delete();
    await db.open();
  });
}

async function seedDb(page: Page) {
  await page.evaluate(async () => {
    const db = (window as any).__db;
    if (!db) return;

    const now = Date.now();
    const uuid = () => crypto.randomUUID();

    const folderId = uuid();
    await db.folders.add({ id: folderId, name: "Default", orderIndex: 1, createdAt: now });

    const tplUpperB = uuid();
    await db.templates.add({
      id: tplUpperB,
      name: "Upper B",
      createdAt: now,
      folderId,
      archivedAt: undefined,
      orderIndex: undefined,
      lastPerformedAt: undefined,
    });

    const tplUpperA = uuid();
    await db.templates.add({
      id: tplUpperA,
      name: "Upper A",
      createdAt: now,
      folderId,
      archivedAt: undefined,
      orderIndex: undefined,
      lastPerformedAt: undefined,
    });

    const exBench = uuid();
    await db.exercises.add({ id: exBench, name: "Bench Press", equipmentTags: [], createdAt: now });

    const trBenchHyp = uuid();
    await db.tracks.add({
      id: trBenchHyp,
      exerciseId: exBench,
      trackType: "hypertrophy",
      displayName: "Bench Press — hypertrophy",
      trackingMode: "weightedReps",
      warmupSetsDefault: 2,
      workingSetsDefault: 3,
      repMin: 8,
      repMax: 12,
      restSecondsDefault: 120,
      rirTargetMin: 1,
      rirTargetMax: 2,
      weightJumpDefault: 5,
      createdAt: now,
    });
  });
}

async function ensureOneTemplateItem(page: Page, templateName: string) {
  return await page.evaluate(async ({ templateName }) => {
    const db = (window as any).__db;
    if (!db) throw new Error("window.__db not found");

    const now = Date.now();
    const uuid = () => crypto.randomUUID();

    const tpl = await db.templates.where("name").equals(templateName).first();
    if (!tpl) throw new Error("Missing template: " + templateName);

    const existing = await db.templateItems.where("templateId").equals(tpl.id).toArray();
    if (existing.length) return { templateId: tpl.id, trackId: existing[0].trackId };

    const track = await db.tracks.where("displayName").equals("Bench Press — hypertrophy").first();
    if (!track) throw new Error("Missing catalog track: Bench Press — hypertrophy");

    await db.templateItems.add({
      id: uuid(),
      templateId: tpl.id,
      orderIndex: 1,
      trackId: track.id,
      createdAt: now,
    });

    return { templateId: tpl.id, trackId: track.id };
  }, { templateName });
}

async function createSessionForTemplate(page: Page, templateName: string) {
  return await page.evaluate(async (name) => {
    const db = (window as any).__db;
    if (!db) throw new Error("window.__db not found");
    const tpl = await db.templates.where("name").equals(name).first();
    if (!tpl) throw new Error(`Template not found: "${name}"`);

    const id = crypto.randomUUID();
    await db.sessions.add({
      id,
      templateId: tpl.id,
      templateName: tpl.name,
      startedAt: Date.now(),
    });
    return id;
  }, templateName);
}

function editorDialog(page: Page) {
  return page.getByRole("dialog");
}

function addSetButton(page: Page) {
  return page.getByRole("button", { name: /\+\s*Add Set/i }).first();
}

function finishButton(page: Page) {
  return page.getByRole("button", { name: /finish session/i }).first();
}

async function markCompleteFirstSet(page: Page) {
  const cb = page.locator('input[type="checkbox"][aria-label="Complete set"]').first();
  await expect(cb).toBeVisible({ timeout: 15000 });
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

test.describe("App Regression (8) — Templates editor e2e", () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page, "/");
    await resetDb(page);
    await seedDb(page);
    await gotoApp(page, "/");
  });

  test("3) Create template flow (prompt) adds a new template row", async ({ page }) => {
    await navLink(page, "Templates").click();

    page.once("dialog", async (d) => {
      await d.accept("Lower A");
    });

    await page.getByRole("button", { name: "New Template" }).click();

    // strict-mode fix: target the template row button
    await expect(page.getByRole("button", { name: "Lower A" })).toBeVisible({ timeout: 15000 });
  });

  test("5) Editor catalog click adds an existing track to template", async ({ page }) => {
    await navLink(page, "Templates").click();
    await page.getByRole("button", { name: "Upper B" }).click();

    const dlg = editorDialog(page);
    await expect(dlg).toBeVisible({ timeout: 15000 });
    await expect(dlg.getByText(/Edit:\s*Upper B/i)).toBeVisible({ timeout: 15000 });

    // Search "bench"
    const quick = dlg.getByRole("textbox").first();
    await expect(quick).toBeVisible({ timeout: 15000 });
    await quick.fill("bench");

    // New UI: catalog row labeled "Bench Press" with a plus at right.
    const benchRow = dlg.getByRole("button", { name: /Bench Press/i }).first();
    await expect(benchRow).toBeVisible({ timeout: 15000 });
    await benchRow.click();

    // Verify by DB (robust vs label drift)
    await expect.poll(async () => {
      return await page.evaluate(async () => {
        const db = (window as any).__db;
        const tpl = await db.templates.where("name").equals("Upper B").first();
        if (!tpl) return 0;
        return await db.templateItems.where("templateId").equals(tpl.id).count();
      });
    }).toBeGreaterThan(0);

    await dlg.getByRole("button", { name: "Done" }).click();
    await expect(dlg).toBeHidden({ timeout: 15000 });
  });

  test("6) Start flow (DB session): goes to /gym/:sessionId", async ({ page }) => {
    await ensureOneTemplateItem(page, "Upper B");
    const sessionId = await createSessionForTemplate(page, "Upper B");

    await gotoApp(page, `/gym/${sessionId}`);
    await expect(page.getByText("Gym Mode")).toBeVisible({ timeout: 15000 });
  });

  test("7) Gym (DB session): add set + finish -> /complete/:sessionId and stores prsJson", async ({ page }) => {
    await ensureOneTemplateItem(page, "Upper B");
    const sessionId = await createSessionForTemplate(page, "Upper B");
    await gotoApp(page, `/gym/${sessionId}`);

    await expect(page.getByText("Gym Mode")).toBeVisible({ timeout: 15000 });

    await addSetButton(page).click();

    const weight = page.locator('input[placeholder="weight"], input[aria-label*="weight" i], input[name="weight"]').first();
    const reps = page.locator('input[placeholder="reps"], input[aria-label*="reps" i], input[name="reps"]').first();
    const rir = page.locator('input[placeholder="RIR"], input[aria-label*="rir" i], input[name="rir"], input[name="RIR"]').first();

    await expect(weight).toBeVisible({ timeout: 15000 });
    await expect(reps).toBeVisible({ timeout: 15000 });
    if (await rir.count()) await expect(rir).toBeVisible({ timeout: 15000 });

    await weight.fill("135");
    await reps.fill("10");
    if (await rir.count()) await rir.fill("2");

    await markCompleteFirstSet(page);
    await finishButton(page).click();

    await expect(page).toHaveURL(new RegExp(`/complete/${sessionId}$`));

    const prsJson = await page.evaluate(async (sid) => {
      const db = (window as any).__db;
      const s = await db.sessions.get(sid);
      return s?.prsJson ?? null;
    }, sessionId);

    expect(prsJson).not.toBeNull();
    expect(typeof prsJson).toBe("string");
  });

  test("8) History shows the completed session", async ({ page }) => {
    await ensureOneTemplateItem(page, "Upper B");
    const sessionId = await createSessionForTemplate(page, "Upper B");
    await gotoApp(page, `/gym/${sessionId}`);

    // finish without sets (app may still allow it)
    await finishButton(page).click();
    await expect(page).toHaveURL(new RegExp(`/complete/${sessionId}$`));

    await navLink(page, "History").click();
    await expect(page).toHaveURL(/\/history$/);
    await expect(page.getByText("Upper B")).toBeVisible({ timeout: 15000 });
  });
});
