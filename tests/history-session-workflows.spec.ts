import { expect, test, type Page } from "@playwright/test";
import { resetDexieDb } from "./helpers/dbSeed";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173/";

async function goto(page: Page, path: string) {
  await page.goto(new URL(path, BASE_URL).toString(), { waitUntil: "domcontentloaded" });
}

test.describe("history and ad hoc session workflows", () => {
  test("deleting a completed workout from History removes it and cleans up related rows", async ({ page }) => {
    await goto(page, "/");
    await resetDexieDb(page);

    const seeded = await page.evaluate(async () => {
      const db = (window as any).__db;
      if (!db) throw new Error("__db missing on window.");

      const now = Date.now();
      const uuid = () => crypto.randomUUID();

      const exerciseId = uuid();
      const trackId = uuid();
      const sessionId = uuid();
      const sessionItemId = uuid();

      await db.exercises.add({
        id: exerciseId,
        name: "Bench Press",
        equipmentTags: ["barbell"],
        createdAt: now - 10_000,
      });

      await db.tracks.add({
        id: trackId,
        exerciseId,
        trackType: "strength",
        displayName: "Bench Press",
        trackingMode: "weightedReps",
        warmupSetsDefault: 0,
        workingSetsDefault: 1,
        repMin: 5,
        repMax: 8,
        restSecondsDefault: 180,
        weightJumpDefault: 5,
        createdAt: now - 9_000,
      });

      await db.sessions.add({
        id: sessionId,
        templateName: "Upper A",
        startedAt: now - 30 * 60 * 1000,
        endedAt: now - 5 * 60 * 1000,
      });

      await db.sessionItems.add({
        id: sessionItemId,
        sessionId,
        trackId,
        orderIndex: 0,
        createdAt: now - 29 * 60 * 1000,
      });

      await db.sets.add({
        id: uuid(),
        sessionId,
        trackId,
        createdAt: now - 28 * 60 * 1000,
        setType: "working",
        weight: 135,
        reps: 8,
        completedAt: now - 28 * 60 * 1000 + 5_000,
      });

      return { sessionId };
    });

    await goto(page, "/history");

    const card = page.getByTestId(`history-completed-card:${seeded.sessionId}`);
    await expect(card).toBeVisible({ timeout: 15000 });

    page.once("dialog", (dialog) => dialog.accept());
    await card.getByRole("button", { name: /open session actions/i }).click();
    await page.getByRole("menuitem", { name: /delete/i }).click();

    await expect(card).toHaveCount(0);
    await expect(page.getByTestId("history-completed-count")).toHaveText("0");

    const dbState = await page.evaluate(async ({ sessionId }) => {
      const db = (window as any).__db;
      if (!db) throw new Error("__db missing on window.");

      return {
        session: await db.sessions.get(sessionId),
        setCount: await db.sets.where("sessionId").equals(sessionId).count(),
        sessionItemCount: await db.sessionItems.where("sessionId").equals(sessionId).count(),
      };
    }, seeded);

    expect(dbState.session).toBeUndefined();
    expect(dbState.setCount).toBe(0);
    expect(dbState.sessionItemCount).toBe(0);
  });

  test("leaving an empty ad hoc workout does not leave a stale in-progress session", async ({ page }) => {
    await goto(page, "/");
    await resetDexieDb(page);

    await goto(page, "/");
    await page.getByRole("button", { name: /start empty workout/i }).click();
    await expect(page).toHaveURL(/\/gym\/[^/]+$/);
    await expect(page.getByText("Gym Mode")).toBeVisible({ timeout: 15000 });

    const sessionId = page.url().split("/gym/")[1];
    expect(sessionId).toBeTruthy();

    await page.getByRole("button", { name: /back to history/i }).first().click();
    await expect(page).toHaveURL(/\/history$/);

    await expect(page.getByTestId(`history-inprogress-card:${sessionId}`)).toHaveCount(0);
    await expect(page.getByTestId("history-inprogress-count")).toHaveText("0");
    await expect(page.getByText("Ad-hoc")).toHaveCount(0);
  });
});
