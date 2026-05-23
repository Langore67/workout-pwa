import { expect, test, type Page } from "@playwright/test";
import { resetDexieDb } from "./helpers/dbSeed";

async function gotoStart(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
}

async function seedSession(
  page: Page,
  args: {
    id: string;
    templateName: string;
    startedAt: number;
    endedAt?: number;
  }
) {
  await page.evaluate(async (session) => {
    const db = (window as any).__db;
    if (!db) throw new Error("__db missing on window.");
    await db.sessions.put(session);
  }, args);
}

test.describe("Start Today shortcuts", () => {
  test("shows existing workout/template actions plus Paste Workout and Progress shortcuts", async ({ page }) => {
    await resetDexieDb(page);
    await gotoStart(page);

    await expect(page.getByRole("button", { name: /Start Empty Workout/i })).toBeVisible();
    await expect(page.getByText("Manage Templates", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Paste Workout/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Progress/i })).toBeVisible();

    await page.getByRole("button", { name: /Paste Workout/i }).click();
    await expect(page).toHaveURL(/\/paste-workout$/);

    await gotoStart(page);
    await page.getByRole("button", { name: /Progress/i }).click();
    await expect(page).toHaveURL(/\/progress$/);
  });

  test("Last Session opens the most recent completed session detail", async ({ page }) => {
    await resetDexieDb(page);
    const now = Date.now();
    await seedSession(page, {
      id: "older-completed-session",
      templateName: "Upper A",
      startedAt: now - 3 * 86400 * 1000,
      endedAt: now - 3 * 86400 * 1000 + 60 * 60 * 1000,
    });
    await seedSession(page, {
      id: "latest-completed-session",
      templateName: "Lower B",
      startedAt: now - 86400 * 1000,
      endedAt: now - 86400 * 1000 + 75 * 60 * 1000,
    });

    await gotoStart(page);

    const lastSession = page.getByRole("button", { name: /Last Session/i });
    await expect(lastSession).toContainText("Lower B");
    await lastSession.click();
    await expect(page).toHaveURL(/\/session\/latest-completed-session$/);
  });

  test("Last Session does not point to an active session", async ({ page }) => {
    await resetDexieDb(page);
    await seedSession(page, {
      id: "active-session",
      templateName: "Active Upper",
      startedAt: Date.now() - 5 * 60 * 1000,
    });

    await gotoStart(page);

    await expect(page.getByRole("button", { name: /Continue Session/i })).toContainText("Active Upper");
    const lastSession = page.getByRole("button", { name: /Last Session/i });
    await expect(lastSession).toContainText("No completed sessions yet");
    await lastSession.click();
    await expect(page).toHaveURL(/\/history$/);
  });
});
