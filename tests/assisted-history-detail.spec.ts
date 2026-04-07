import { test, expect, type Page } from "@playwright/test";
import { resetDexieDb } from "./helpers/dbSeed";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173/";

async function goto(page: Page, path: string) {
  await page.goto(new URL(path, BASE_URL).toString(), { waitUntil: "domcontentloaded" });
}

async function seedAssistedHistorySession(page: Page) {
  return await page.evaluate(async () => {
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
    const setId = uuid();
    const bodyMetricId = uuid();

    await db.exercises.add({
      id: exerciseId,
      name: "Pull Up",
      equipment: "Bodyweight",
      equipmentTags: ["bodyweight"],
      createdAt: now,
    });

    await db.tracks.add({
      id: trackId,
      exerciseId,
      trackType: "hypertrophy",
      displayName: "Assisted Pull Up",
      trackingMode: "weightedReps",
      warmupSetsDefault: 0,
      workingSetsDefault: 3,
      repMin: 8,
      repMax: 12,
      restSecondsDefault: 120,
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

    await db.bodyMetrics.add({
      id: bodyMetricId,
      weightLb: 203,
      takenAt: now - 1000,
      createdAt: now - 1000,
    });

    await db.sessions.add({
      id: sessionId,
      templateId,
      templateName: "Upper A",
      startedAt: now - 60_000,
      endedAt: now,
    });

    await db.sets.add({
      id: setId,
      sessionId,
      trackId,
      setType: "working",
      weight: -65,
      reps: 10,
      rir: 2,
      completedAt: now - 10_000,
      createdAt: now - 10_000,
    });

    return { sessionId, setId };
  });
}

test.describe("assisted history and session detail", () => {
  test.beforeEach(async ({ page }) => {
    await goto(page, "/");
    await resetDexieDb(page);
  });

  test("session detail and exercise history recognize assisted pull up sets", async ({ page }) => {
    const seeded = await seedAssistedHistorySession(page);

    await goto(page, `/session/${seeded.sessionId}`);
    await expect(page.getByTestId(`set-weight:${seeded.setId}`)).toHaveText("-65");
    await expect(page.getByTestId("session-total-lifted")).toContainText("1380");

    await goto(page, "/exercises");
    await page.getByRole("button", { name: /Pull Up/i }).first().click();

    await expect(page.getByText("Recent sessions")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Best set:\s*138 x 10/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/e1RM:\s*184/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Volume:\s*1380/i)).toBeVisible({ timeout: 15000 });
  });

  test("exercise history copy export formats assisted bodyweight context clearly", async ({
    page,
    context,
  }) => {
    await seedAssistedHistorySession(page);
    let useClipboardStub = false;
    try {
      await context.grantPermissions(["clipboard-read", "clipboard-write"], {
        origin: BASE_URL,
      });
    } catch {
      useClipboardStub = true;
    }

    await goto(page, "/exercises");
    if (useClipboardStub) {
      await page.evaluate(() => {
        const clipboardState = { lastText: "" };
        // @ts-ignore
        window.__copiedText = clipboardState;
        const clipboard = {
          writeText: async (text: string) => {
            clipboardState.lastText = text;
          },
        };
        Object.defineProperty(navigator, "clipboard", {
          value: clipboard,
          configurable: true,
        });
        /*
         * No readText needed in the app path for this test; the copied value is
         * read back from window.__copiedText when the shim is active.
         */
        Object.defineProperty(navigator.clipboard, "writeText", {
          value: async (text: string) => {
            clipboardState.lastText = text;
          },
          configurable: true,
        });
      });
    }
    await page.getByRole("button", { name: /Pull Up/i }).first().click();
    await expect(page.getByText("Recent sessions")).toBeVisible({ timeout: 15000 });

    page.on("dialog", async (dialog) => {
      await dialog.dismiss();
    });

    await page.getByRole("button", { name: "Copy Export" }).click();

    const copiedText = await page.evaluate(async (useStub) => {
      if (useStub) {
        // @ts-ignore
        return window.__copiedText?.lastText ?? "";
      }
      return await navigator.clipboard.readText();
    }, useClipboardStub);

    expect(copiedText).toContain("IronForge Exercise Export");
    expect(copiedText).toContain("Exercise: Pull Up");
    expect(copiedText).toContain("Best set (effective load): 138 x 10");
    expect(copiedText).toContain(
      "Assisted sets subtract assistance from bodyweight"
    );
    expect(copiedText).toContain(
      "Coach prompt: suggest next working weight/reps based on these sessions."
    );
  });
});
