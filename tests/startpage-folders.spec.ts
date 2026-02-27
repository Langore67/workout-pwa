// tests/startpage-folders.spec.ts
/* ========================================================================== */
/*  startpage-folders.spec.ts                                                 */
/*  BUILD_ID: 2026-02-20-STF-02                                                */
/* -------------------------------------------------------------------------- */
/*  Notes                                                                      */
/*  - ActionMenu menuitem accessible names include icon text (e.g. "✎ Rename") */
/*    so selectors must not anchor to ^Rename$                                 */
/* ========================================================================== */

import { test, expect } from "@playwright/test";

test("StartPage folders: template appears in folder, chevron toggles, ActionMenu opens", async ({ page, browserName }) => {
  // Stub prompts before app code runs
  await page.addInitScript(() => {
    const originalPrompt = window.prompt.bind(window);

    window.prompt = (msg?: string, defaultValue?: string) => {
      const m = String(msg || "").toLowerCase();

      if (m.includes("new folder name")) return "AM Folder";
      if (m.includes("new template name")) return "AM Template";

      return originalPrompt(msg, defaultValue);
    };
  });

  // Go to app
  await page.goto("/", { waitUntil: "domcontentloaded" });

  // Templates admin
  await page.getByRole("link", { name: "Templates" }).click();

  // Create folder
  await page.getByRole("button", { name: /New Folder/i }).click();

  // Create template (opens editor modal)
  await page.getByRole("button", { name: /New Template/i }).click();

  // Close editor modal (Done)
  const modal = page.locator(".modal-overlay[role='dialog']").first();
  await expect(modal).toBeVisible();
  await page.getByRole("button", { name: /^Done$/ }).click();
  await expect(modal).toBeHidden();

  // Move the template into the folder via the FolderSelect dropdown
  const templateRow = page.locator(".card", { hasText: "AM Template" }).first();
  await expect(templateRow).toBeVisible();

  const folderSelect = templateRow.locator("select").first();
  await expect(folderSelect).toBeVisible();
  await folderSelect.selectOption({ label: "AM Folder" });

  // Back to Start
  await page.getByRole("link", { name: "Start" }).click();

  // Folder header should exist + be clickable
  const folderHeader = page.getByTestId(/start-folder-/).filter({ hasText: "AM Folder" }).first();
  await expect(folderHeader).toBeVisible();

  // Toggle open and confirm template row appears
  await folderHeader.click();
  const startTemplateRow = page.getByTestId(/start-template-/).filter({ hasText: "AM Template" }).first();
  await expect(startTemplateRow).toBeVisible();

  // Open template ActionMenu (kebab lives inside the row)
  const actionsBtn = startTemplateRow.getByRole("button", { name: /Template actions/i }).first();
  await expect(actionsBtn).toBeVisible();

  // Desktop: click. iPhone: tap (tap only in touch context)
  if (browserName === "iphone") {
    await actionsBtn.tap();
  } else {
    await actionsBtn.click();
  }

  // Menu appears + contains expected items
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();

  // IMPORTANT: icons are part of accessible name (e.g. "✎ Rename"), so don't anchor.
  await expect(menu.getByRole("menuitem", { name: /Rename/i })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: /Archive/i })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: /Delete/i })).toBeVisible();

  // Outside click closes
  await page.mouse.click(5, 5);
  await expect(menu).toBeHidden();
});
