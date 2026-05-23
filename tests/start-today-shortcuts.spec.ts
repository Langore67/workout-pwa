import { expect, test, type Page } from "@playwright/test";
import { resetDexieDb } from "./helpers/dbSeed";

async function gotoStart(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
}

async function seedSession(
  page: Page,
  args: {
    id: string;
    templateId?: string;
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

async function seedTemplate(
  page: Page,
  args: {
    templateId: string;
    templateName: string;
    trackName?: string;
  }
) {
  await page.evaluate(async ({ templateId, templateName, trackName }) => {
    const db = (window as any).__db;
    if (!db) throw new Error("__db missing on window.");
    const now = Date.now();
    const exerciseId = `${templateId}-exercise`;
    const trackId = `${templateId}-track`;
    await db.exercises.put({
      id: exerciseId,
      name: trackName ?? "Bench Press",
      normalizedName: String(trackName ?? "Bench Press").toLowerCase(),
      equipmentTags: [],
      createdAt: now,
    });
    await db.tracks.put({
      id: trackId,
      exerciseId,
      trackType: "strength",
      displayName: trackName ?? "Bench Press",
      trackingMode: "weightedReps",
      warmupSetsDefault: 0,
      workingSetsDefault: 1,
      repMin: 5,
      repMax: 10,
      restSecondsDefault: 120,
      weightJumpDefault: 5,
      createdAt: now,
    });
    await db.templates.put({
      id: templateId,
      name: templateName,
      createdAt: now,
    });
    await db.templateItems.put({
      id: `${templateId}-item`,
      templateId,
      orderIndex: 0,
      trackId,
      createdAt: now,
    });
  }, args);
}

test.describe("Start Today shortcuts", () => {
  test("shows existing workout/template actions plus Paste Workout and Progress shortcuts", async ({ page }) => {
    await resetDexieDb(page);
    await gotoStart(page);

    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
    await expect(page.getByText("Start, continue, import, or review your latest training.")).toBeVisible();
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

  test("Recent Templates row is hidden when there is no template history", async ({ page }) => {
    await resetDexieDb(page);
    await seedTemplate(page, {
      templateId: "unused-template",
      templateName: "Unused Template",
    });

    await gotoStart(page);

    await expect(page.getByTestId("start-recent-templates")).toHaveCount(0);
    await expect(page.getByTestId("start-template-unused-template")).toBeVisible();
  });

  test("Recent Templates row opens the existing template preview and start flow", async ({ page }) => {
    await resetDexieDb(page);
    const now = Date.now();
    await seedTemplate(page, {
      templateId: "older-template",
      templateName: "Older Template",
      trackName: "Row",
    });
    await seedTemplate(page, {
      templateId: "recent-template",
      templateName: "Recent Template",
      trackName: "Bench Press",
    });
    await seedSession(page, {
      id: "older-template-session",
      templateId: "older-template",
      templateName: "Older Template",
      startedAt: now - 5 * 86400 * 1000,
      endedAt: now - 5 * 86400 * 1000 + 45 * 60 * 1000,
    });
    await seedSession(page, {
      id: "recent-template-session",
      templateId: "recent-template",
      templateName: "Recent Template",
      startedAt: now - 86400 * 1000,
      endedAt: now - 86400 * 1000 + 45 * 60 * 1000,
    });

    await gotoStart(page);

    const recentSection = page.getByTestId("start-recent-templates");
    await expect(recentSection).toBeVisible();
    const recentButtons = recentSection.getByRole("button");
    await expect(recentButtons).toHaveCount(2);
    await expect(recentButtons.nth(0)).toContainText("Recent Template");
    await expect(recentButtons.nth(1)).toContainText("Older Template");

    await page.getByTestId("start-recent-template-recent-template").click();
    const modal = page.locator(".modal-overlay[role='dialog']").first();
    await expect(modal).toBeVisible();
    await expect(modal).toContainText("Recent Template");
    await expect(modal).toContainText("Bench Press");
    await modal.getByRole("button", { name: "Start Workout" }).click();
    await expect(page).toHaveURL(/\/gym\//);
  });
});
