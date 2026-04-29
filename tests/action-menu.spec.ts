import { test, expect } from "@playwright/test";

test("Templates ActionMenu opens and closes (diagnostic)", async ({ page }) => {
  // 🔎 Sanity marker so we KNOW this file is the one being executed
  // 1) Stub prompt BEFORE the app code runs (so createTemplate() gets a name)
  await page.addInitScript(() => {
    const originalPrompt = window.prompt.bind(window);
    window.prompt = (msg?: string, defaultValue?: string) => {
      const m = String(msg || "").toLowerCase();
      if (m.includes("new template name")) return "AM Test Template";
      return originalPrompt(msg, defaultValue);
    };
  });

  // 2) Prefer deep-link (no navbar assumptions)
  await page.goto("/templates", { waitUntil: "domcontentloaded" });

  // Helper: are we actually on Templates page?
  const newTemplateBtn = page.getByRole("button", { name: /New Template/i });

  // 2b) Fallback: if /templates isn't your route, go home and click "Templates" by TEXT (any role)
  if (!(await newTemplateBtn.isVisible().catch(() => false))) {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    // Click the nav item by visible text, regardless of link/button semantics
    const templatesNav = page
      .locator("a,button,[role='link'],[role='button'],div,span")
      .filter({ hasText: /^Templates$/ })
      .first();

    await expect(templatesNav).toBeVisible();
    await templatesNav.click();

    await expect(newTemplateBtn).toBeVisible();
  }

  // 3) Create a template (this WILL open the editor modal)
  await newTemplateBtn.click();

  // 4) Close the editor modal so it can't intercept pointer events
  const modal = page.locator(".modal-overlay[role='dialog']").first();
  await expect(modal).toBeVisible();

  await page.getByRole("button", { name: /^Done$/ }).click();
  await expect(modal).toBeHidden();

  // 5) Template row should exist
  const templateRowButton = page.getByRole("button", { name: /^AM Test Template$/ }).first();
  await expect(templateRowButton).toBeVisible();

  // 6) Scope to that row card
  const rowCard = page.locator(".card", { has: templateRowButton }).first();
  await expect(rowCard).toBeVisible();

  // 7) ActionMenu trigger
  // Your new ActionMenu defaults to ariaLabel="Actions" unless overridden.
  // We'll accept either "Actions" or "More actions".
  const actionsBtn = rowCard.getByRole("button", { name: /^(Actions|More actions)$/i }).first();
  await expect(actionsBtn).toBeVisible();

  // 8) Open menu (click works on Desktop + iPhone project)
  await actionsBtn.click();

  await expect(actionsBtn).toHaveAttribute("aria-expanded", /true/i);

  // Menu is portaled to document.body with role="menu"
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();

  // Confirm at least one item exists
  await expect(menu.getByRole("menuitem", { name: /Edit/i })).toBeVisible();

  // 9) Outside click closes
  await page.mouse.click(5, 5);
  await expect(menu).toBeHidden();
  await expect(actionsBtn).toHaveAttribute("aria-expanded", /false/i);
});
