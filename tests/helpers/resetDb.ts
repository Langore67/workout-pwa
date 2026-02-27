import type { Page } from "@playwright/test";

export async function resetDb(page: Page) {
  // must run before the app loads
  await page.addInitScript(() => {
    indexedDB.deleteDatabase("workout_mvp_db");
  });
}
