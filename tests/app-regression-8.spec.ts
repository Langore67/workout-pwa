/**
 * OFFICIAL REGRESSION BASELINE
 * If this fails, treat as a release blocker unless a deliberate UI flow change was made.
 */

import { test, expect, type Page, type Locator } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173/";

/** ----------------------------
 * Helpers
 * -----------------------------*/
async function gotoApp(page: Page, path: string) {
  await page.goto(new URL(path, BASE_URL).toString(), { waitUntil: "domcontentloaded" });
}

function navLink(page: Page, name: string) {
  return page.getByRole("link", { name });
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** ----------------------------
 * DB helpers (window.__db)
 * -----------------------------*/
async function resetDb(page: Page) {
  await page.evaluate(async () => {
    const db = (window as any).__db;
    if (!db) return;
    await db.delete();
    await db.open();
  });
}

/**
 * Seed:
 * - Folder
 * - Templates: Upper B, Upper A
 * - Catalog: Bench Press exercise + Bench Press — hypertrophy track
 *
 * IMPORTANT: no templateItems and no sessions seeded.
 */
async function seedDb(page: Page) {
  await page.evaluate(async () => {
    const db = (window as any).__db;
    if (!db) return;

    const now = Date.now();
    const uuid = () => crypto.randomUUID();

    // Folder
    const folderId = uuid();
    await db.folders.add({ id: folderId, name: "Default", orderIndex: 1, createdAt: now });

    // Templates
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

    // Catalog: Exercise + Track
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

/**
 * Deterministically add exactly ONE TemplateItem to an existing template.
 * Uses an existing catalog track if present (Bench Press — hypertrophy), otherwise creates it.
 * Returns the trackId used.
 */
async function ensureOneTemplateItem(page: Page, templateName: string) {
  return await page.evaluate(
    async ({ templateName }) => {
      const db = (window as any).__db;
      if (!db) throw new Error("window.__db not found");

      const now = Date.now();
      const uuid = () => crypto.randomUUID();

      const tpl = await db.templates.where("name").equals(templateName).first();
      if (!tpl) throw new Error("Missing template: " + templateName);

      // Idempotent
      const existing = await db.templateItems.where("templateId").equals(tpl.id).toArray();
      if (existing.length) return existing[0].trackId;

      // Prefer existing catalog track
      let track = await db.tracks.where("displayName").equals("Bench Press — hypertrophy").first();

      // If missing for any reason, create Exercise + Track
      if (!track) {
        const exId = uuid();
        await db.exercises.add({ id: exId, name: "Bench Press", equipmentTags: [], createdAt: now });

        const trId = uuid();
        await db.tracks.add({
          id: trId,
          exerciseId: exId,
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

        track = await db.tracks.get(trId);
      }

      // Create TemplateItem
      await db.templateItems.add({
        id: uuid(),
        templateId: tpl.id,
        orderIndex: 1,
        trackId: track!.id,
        createdAt: now,
      });

      return track!.id;
    },
    { templateName }
  );
}

/**
 * Create a Session directly (bypasses StartPage UI flakiness while Start is being rebuilt).
 * Returns sessionId.
 */
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

/** ----------------------------
 * UI locators/helpers
 * -----------------------------*/
function editorDialog(page: Page) {
  return page.getByRole("dialog");
}

function addSetButton(page: Page): Locator {
  return page.getByRole("button", { name: /\+\s*Add Set/i }).first();
}

function finishButton(page: Page): Locator {
  return page.getByRole("button", { name: /finish session/i }).first();
}

function inputWeight(page: Page): Locator {
  return page
    .locator(
      'input[placeholder*="lbs" i], input[placeholder="weight"], input[name="weight"], input[aria-label*="weight" i], input[inputmode="decimal"]'
    )
    .first();
}

function inputReps(page: Page): Locator {
  return page.locator('input[placeholder*="reps" i], input[name="reps"], input[aria-label*="reps" i]').first();
}

function inputRir(page: Page): Locator {
  return page
    .locator('input[placeholder*="rir" i], input[name="rir"], input[aria-label*="rir" i], input[name="RIR"]')
    .first();
}

/**
 * The checkbox in Gym Mode is sometimes a custom control (wrapper gets the click, input is just for a11y).
 * This helper tries:
 *  - clicking label wrapper (best for WebKit)
 *  - clicking role=button wrapper
 *  - clicking the input itself
 *  - finally DOM event dispatch
 */
async function markCompleteFirstSet(page: Page) {
  const input = page.locator('input[type="checkbox"][aria-label="Complete set"]').first();
  await expect(input).toBeVisible({ timeout: 15000 });
  await input.scrollIntoViewIfNeeded().catch(() => {});

  const labelWrapper = page.locator('label:has(input[type="checkbox"][aria-label="Complete set"])').first();
  const ariaWrapper = page.locator('[aria-label="Complete set"]').first(); // could be the input OR a button/div
  const roleButtonWrapper = page.locator('[role="button"][aria-label="Complete set"]').first();

  // WebKit: label click is usually the most reliable
  if (await labelWrapper.count()) {
    await labelWrapper.click({ force: true }).catch(() => {});
  }

  // If there is a non-input control with the same aria-label, click it too
  if (await roleButtonWrapper.count()) {
    await roleButtonWrapper.click({ force: true }).catch(() => {});
  } else if (await ariaWrapper.count()) {
    // Might resolve to input; still fine
    await ariaWrapper.click({ force: true }).catch(() => {});
  }

  // Try native input check/click
  try {
    await input.check({ force: true, timeout: 1500 });
  } catch {
    /* ignore */
  }
  try {
    await input.click({ force: true, timeout: 1500 });
  } catch {
    /* ignore */
  }

  // Last resort: DOM click + dispatch events
  if (!(await input.isChecked().catch(() => false))) {
    await page.evaluate(() => {
      const el = document.querySelector('input[type="checkbox"][aria-label="Complete set"]') as HTMLInputElement | null;
      if (!el) return;
      try {
        el.click();
      } catch {
        /* noop */
      }
      el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  await expect
    .poll(async () => input.isChecked().catch(() => false), { timeout: 15000 })
    .toBeTruthy();
}

/**
 * Find the Catalog section container robustly:
 * - Use the *exact* heading "Catalog" to avoid strict-mode collisions with helper text.
 */
function catalogSection(dlg: Locator): Locator {
  const heading = dlg.getByText("Catalog", { exact: true });
  // Pick a reasonable container: nearest enclosing div of the heading
  return heading.locator("xpath=ancestor::div[1]");
}

/**
 * Click Bench Press in the catalog and add it to the template.
 * IMPORTANT: Do NOT press Enter in the quick-add field for this flow,
 * because Enter will quick-add top match and then the catalog hides duplicates.
 */
async function clickCatalogBenchPressAdd(dlg: Locator) {
  const catalog = catalogSection(dlg);
  await expect(dlg.getByText("Catalog", { exact: true })).toBeVisible({ timeout: 15000 });

  // Wait until there is any "Bench Press" visible somewhere in the dialog.
  // (Catalog rendering can be async / debounced.)
  await expect
    .poll(async () => dlg.getByText(/\bBench Press\b/i).count(), { timeout: 15000 })
    .toBeGreaterThan(0);

  // Prefer a row/card inside the Catalog container (avoid the "Exercises in this template" section)
  const benchCard = catalog
    .locator("button, [role='button'], li, div")
    .filter({ hasText: /\bBench Press\b/i })
    .first();

  await expect(benchCard).toBeVisible({ timeout: 15000 });
  await benchCard.scrollIntoViewIfNeeded().catch(() => {});

  // Prefer "+" button inside the card (some UIs use icon-only buttons)
  const plusText = benchCard.locator("button").filter({ hasText: /^\+$/ }).first();
  if (await plusText.count()) {
    await plusText.click({ force: true });
    return;
  }

  // Icon button fallback: look for the right-most button in the card
  const anyBtn = benchCard.locator("button").last();
  if (await anyBtn.count()) {
    await anyBtn.click({ force: true });
    return;
  }

  // Fallback: click the card itself
  await benchCard.click({ force: true });
}

/**
 * The iPhone flow can show a "Review (tap to jump)" gate if any working set isn't checked.
 * We handle it by:
 * - clicking Finish
 * - if the gate appears, click the first review item to jump
 * - re-mark the first set complete
 * - retry a few times
 */
async function finishSessionEnsuringNoGate(page: Page) {
  const finish = finishButton(page);
  const reviewHeader = page.getByText(/Review \(tap to jump\)/i);

  for (let attempt = 0; attempt < 4; attempt++) {
    await expect(finish).toBeVisible({ timeout: 15000 });
    await finish.click({ force: true });

    const gateVisible = await reviewHeader.isVisible().catch(() => false);
    if (!gateVisible) return;

    const reviewItem = page
      .locator("button, [role='button'], a, div")
      .filter({ hasText: /Bench Press/i })
      .first();

    if (await reviewItem.count()) {
      await reviewItem.click({ force: true }).catch(() => {});
    }

    await markCompleteFirstSet(page);
    await page.waitForTimeout(150);
  }

  await expect(reviewHeader).toHaveCount(0, { timeout: 1000 });
}

test.describe("App Regression (8) — refactored seed strategy", () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page, "/");
    await resetDb(page);
    await seedDb(page);
    await gotoApp(page, "/");
  });

  test("1) Routing sanity: nav Start works + /start redirects to /", async ({ page }) => {
    await navLink(page, "Start").click();
    await expect(page).toHaveURL(/\/$/);

    await gotoApp(page, "/start");
    await expect(page).toHaveURL(/\/$/);

    await expect(navLink(page, "Templates")).toBeVisible();
  });

  test("2) Templates page loads + shows seeded template", async ({ page }) => {
    await navLink(page, "Templates").click();
    await expect(page).toHaveURL(/\/templates$/);

    await expect(page.getByText("Manage Templates")).toBeVisible();
    await expect(page.getByRole("button", { name: "Upper B" })).toBeVisible();
  });

  test("3) Create template flow (prompt) adds a new template row", async ({ page }) => {
    await navLink(page, "Templates").click();

    page.once("dialog", async (d) => {
      await d.accept("Lower A");
    });

    await page.getByRole("button", { name: "New Template" }).click();
    await expect(page.getByRole("button", { name: "Lower A" })).toBeVisible();
  });

  test("4) Open editor + quick add creates new track and adds to template", async ({ page }) => {
    await navLink(page, "Templates").click();

    // Open editor
    await page.getByRole("button", { name: "Upper B" }).click();

    const dlg = editorDialog(page);
    await expect(dlg).toBeVisible();
    await expect(dlg.getByText(/Edit:\s*Upper B/i)).toBeVisible();

    const quick = dlg.getByPlaceholder(/Type to search|Search catalog/i).first();
    await expect(quick).toBeVisible();

    await quick.fill("Seated Cable Row");
    await quick.press("Enter");

    await expect(dlg.getByText("Exercises in this template", { exact: true })).toBeVisible();

    // wait for DB write (avoid racing React/Dexie)
    await expect
      .poll(async () => {
        return await page.evaluate(async () => {
          const db = (window as any).__db;
          if (!db) return 0;
          return await db.tracks.where("displayName").startsWith("Seated Cable Row").count();
        });
      })
      .toBeGreaterThan(0);

    await expect(dlg.getByText(/Seated Cable Row\s+—\s+hypertrophy/i)).toBeVisible();

    await dlg.getByRole("button", { name: "Done" }).click();
    await expect(dlg).toBeHidden();
  });

  test("5) Editor catalog click adds an existing track to template", async ({ page }) => {
    await navLink(page, "Templates").click();
    await page.getByRole("button", { name: "Upper B" }).click();

    const dlg = editorDialog(page);
    await expect(dlg.getByText(/Edit:\s*Upper B/i)).toBeVisible();

    const quick = dlg.getByPlaceholder(/Type to search|Search catalog/i).first();
    await expect(quick).toBeVisible();

    // KEY FIX:
    // Do NOT press Enter here. Enter is quick-add (adds top match) and then catalog hides duplicates.
    await quick.fill("bench");

    // Wait until catalog shows the bench card (or at least bench appears somewhere in the dialog)
    await expect
      .poll(async () => dlg.getByText(/\bBench Press\b/i).count(), { timeout: 15000 })
      .toBeGreaterThan(0);

    await clickCatalogBenchPressAdd(dlg);

    // Confirm it appears in the template list area
    await expect(dlg.getByText("Bench Press — hypertrophy").first()).toBeVisible({ timeout: 15000 });

    await dlg.getByRole("button", { name: "Done" }).click();
    await expect(dlg).toBeHidden();
  });

  test("6) Start page loads and shows template(s) (smoke only)", async ({ page }) => {
    await navLink(page, "Start").click();
    await expect(page).toHaveURL(/\/$/);

    await expect(page.getByText("Start Workout", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Manage" })).toBeVisible();

    const upperBTile = page.locator(".template-tile", { hasText: /Upper B/i }).first();

    // Expand "Default" if the tile isn't visible yet.
    if (!(await upperBTile.isVisible().catch(() => false))) {
      const defaultFolderRow = page.getByRole("button", { name: /Default/i }).first();
      if (await defaultFolderRow.count()) {
        await defaultFolderRow.click();
      }
    }

    await expect(upperBTile).toBeVisible({ timeout: 15000 });
  });

  test("7) Gym: add a working set + finish -> /complete/:sessionId and stores prsJson", async ({ page }) => {
    await ensureOneTemplateItem(page, "Upper B");

    const sessionId = await createSessionForTemplate(page, "Upper B");
    await gotoApp(page, `/gym/${sessionId}`);

    await expect(page.getByText("Gym Mode")).toBeVisible({ timeout: 15000 });

    const add = addSetButton(page);
    await expect(add).toBeVisible({ timeout: 15000 });
    await add.click();

    const w = inputWeight(page);
    const r = inputReps(page);
    const rir = inputRir(page);

    await expect(w).toBeVisible({ timeout: 15000 });
    await expect(r).toBeVisible({ timeout: 15000 });
    if (await rir.count()) await expect(rir).toBeVisible({ timeout: 15000 });

    await w.fill("135");
    await r.fill("10");
    if (await rir.count()) await rir.fill("2");

    await markCompleteFirstSet(page);
    await finishSessionEnsuringNoGate(page);

    await expect(page).toHaveURL(new RegExp(`/complete/${escapeRegExp(sessionId)}$`), { timeout: 15000 });

    // Give iPhone/Safari a beat to flush writes
    await page.waitForTimeout(250);

    const prsJson = await page.evaluate(async (sid) => {
      const db = (window as any).__db;
      const s = await db.sessions.get(sid);
      return s?.prsJson ?? null;
    }, sessionId);

    expect(prsJson).not.toBeNull();
    expect(typeof prsJson).toBe("string");
    expect((prsJson as string).length).toBeGreaterThan(2);
  });

  test("8) History shows the completed session", async ({ page }) => {
    await ensureOneTemplateItem(page, "Upper B");

    const sessionId = await createSessionForTemplate(page, "Upper B");
    await gotoApp(page, `/gym/${sessionId}`);

    const add = addSetButton(page);
    await expect(add).toBeVisible({ timeout: 15000 });
    await add.click();

    const w = inputWeight(page);
    const r = inputReps(page);
    const rir = inputRir(page);

    await expect(w).toBeVisible({ timeout: 15000 });
    await expect(r).toBeVisible({ timeout: 15000 });
    if (await rir.count()) await expect(rir).toBeVisible({ timeout: 15000 });

    await w.fill("95");
    await r.fill("10");
    if (await rir.count()) await rir.fill("2");

    await markCompleteFirstSet(page);
    await finishSessionEnsuringNoGate(page);

    await expect(page).toHaveURL(new RegExp(`/complete/${escapeRegExp(sessionId)}$`), { timeout: 15000 });

    await navLink(page, "History").click();
    await expect(page).toHaveURL(/\/history$/);

    await expect(page.getByText("Upper B")).toBeVisible();
  });
});
