import { expect, test, type Page } from "@playwright/test";
import { resetDexieDb } from "./helpers/dbSeed";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173/";

async function goto(page: Page, path: string) {
  await page.goto(new URL(path, BASE_URL).toString(), { waitUntil: "domcontentloaded" });
}

async function installClipboardMock(page: Page) {
  await page.addInitScript(() => {
    const clipboardState = { text: "" };
    Object.defineProperty(window, "__copiedText", {
      value: clipboardState,
      configurable: true,
    });
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async (text: string) => {
          clipboardState.text = text;
        },
        readText: async () => clipboardState.text,
      },
      configurable: true,
    });
  });
}

async function addCapabilityResult(
  page: Page,
  args: {
    testName: string;
    date: string;
    resultValue?: string;
    resultUnit?: string;
    status?: string;
    pain?: string;
    notes?: string;
  }
) {
  await page.getByLabel("Test name").selectOption({ label: args.testName });
  await page.getByLabel("Date").fill(args.date);
  if (args.resultValue != null) await page.getByLabel("Result value").fill(args.resultValue);
  if (args.resultUnit) await page.getByLabel("Result unit").selectOption(args.resultUnit);
  if (args.status) await page.getByLabel("Status").selectOption(args.status);
  if (args.pain) await page.getByLabel("Pain").selectOption(args.pain);
  if (args.notes) await page.getByLabel("Notes").fill(args.notes);
  await page.getByRole("button", { name: "Add Result" }).click();
}

test.describe("Progress Capability Tests", () => {
  test.beforeEach(async ({ page }) => {
    await installClipboardMock(page);
  });

  test("Progress page shows Capability Tests card and empty summary", async ({ page }) => {
    await resetDexieDb(page);
    await goto(page, "/progress");

    await expect(page.getByTestId("progress-capability-tests-card")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("progress-capability-tests-card")).toContainText("Capability Tests");
    await expect(page.getByTestId("progress-capability-overall")).toHaveText("Overall: Not Tested");
    await expect(page.getByTestId("progress-capability-explanation")).toHaveText("No capability tests logged yet.");
    await expect(page.getByTestId("progress-capability-suggested-starts")).toContainText("Floor Get-Up");
    await expect(page.getByTestId("progress-capability-suggested-starts")).toContainText("Single-Leg Balance");
    await expect(page.getByTestId("progress-capability-suggested-starts")).toContainText("Suitcase Carry");
    await expect(page.getByTestId("progress-capability-status-mix")).toHaveCount(0);
    await expect(page.getByTestId("progress-capability-stale")).toHaveCount(0);
    await page.getByRole("button", { name: "View Capability Tests" }).click();
    await expect(page).toHaveURL(/\/capability-tests$/);
  });

  test("Capability Tests page shows empty state", async ({ page }) => {
    await resetDexieDb(page);
    await goto(page, "/capability-tests");

    await expect(page.getByRole("heading", { name: "Capability Tests" })).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("capability-summary-panel")).toBeVisible();
    await expect(page.getByTestId("capability-summary-overall")).toHaveText("Overall: Not Tested");
    await expect(page.getByTestId("capability-summary-explanation")).toHaveText("No capability tests logged yet.");
    await expect(page.getByTestId("capability-summary-suggested-starts")).toContainText("Floor Get-Up");
    await expect(page.getByTestId("capability-summary-suggested-starts")).toContainText("Single-Leg Balance");
    await expect(page.getByTestId("capability-summary-suggested-starts")).toContainText("Suitcase Carry");
    await expect(page.getByTestId("capability-summary-status-mix")).toHaveCount(0);
    await expect(page.getByTestId("capability-summary-stale")).toHaveCount(0);
    await expect(page.getByTestId("capability-summary-not-tested")).toHaveCount(0);
    await expect(page.getByTestId("capability-summary-latest-categories")).toHaveCount(0);
    await expect(page.getByTestId("capability-empty-state")).toContainText("No capability tests logged yet.");
    await expect(page.getByTestId("capability-empty-state")).toContainText(
      "Start with Floor Get-Up, Single-Leg Balance, or Suitcase Carry."
    );
  });

  test("user can add Floor Get-Up and Suitcase Carry results, newest first", async ({ page }) => {
    await resetDexieDb(page);
    await goto(page, "/capability-tests");

    await addCapabilityResult(page, {
      testName: "Floor Get-Up",
      date: "2026-05-15",
      status: "yellow",
      pain: "none",
      notes: "needed right hand support",
    });

    await addCapabilityResult(page, {
      testName: "Suitcase Carry - Left",
      date: "2026-05-16",
      resultValue: "45",
      resultUnit: "lb",
      status: "green",
      pain: "none",
      notes: "smooth left side",
    });

    const rows = page.getByTestId("capability-results-list").getByTestId(/^capability-result-text:/);
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("2026-05-16 | Suitcase Carry - Left | Carry | 45 lb | side left | status green | pain none | smooth left side");
    await expect(rows.nth(1)).toContainText("2026-05-15 | Floor Get-Up | Ground | status yellow | pain none | needed right hand support");
    await expect(page.getByTestId("capability-summary-overall")).toHaveText("Overall: Developing");
    await expect(page.getByTestId("capability-summary-explanation")).toHaveText(
      "Some categories are missing, stale, or mostly yellow."
    );
    await expect(page.getByTestId("capability-summary-status-mix")).toContainText(
      "green 1 | yellow 1 | red 0 | not tested 3"
    );
    await expect(page.getByTestId("capability-summary-stale")).toBeVisible();
    await expect(page.getByTestId("capability-summary-latest-categories")).toContainText(
      "Ground: Floor Get-Up | yellow | pain none | 2026-05-15"
    );
    await expect(page.getByTestId("capability-summary-latest-categories")).toContainText(
      "Carry: Suitcase Carry - Left | green | pain none | 2026-05-16"
    );
    await expect(page.getByTestId("capability-summary-not-tested")).toContainText(
      "Terrain, Single-Leg, Agility"
    );

    await goto(page, "/progress");
    await expect(page.getByTestId("progress-capability-count")).toHaveText("2 logged tests");
    await expect(page.getByTestId("progress-capability-latest")).toHaveText("Latest: 2026-05-16");
    await expect(page.getByTestId("progress-capability-status-mix")).toContainText("green 1 | yellow 1 | red 0");
    await expect(page.getByTestId("progress-capability-explanation")).toHaveText(
      "Some categories are missing, stale, or mostly yellow."
    );
  });

  test("user can edit and soft-delete a result", async ({ page }) => {
    await resetDexieDb(page);
    await goto(page, "/capability-tests");

    await addCapabilityResult(page, {
      testName: "Lateral Line Step-Over",
      date: "2026-05-16",
      resultValue: "30",
      resultUnit: "reps",
      status: "yellow",
      pain: "mild",
      notes: "tentative first round",
    });

    await expect(page.getByTestId("capability-results-list")).toContainText("30 reps");
    await expect(page.getByTestId("capability-summary-pain-flags")).toHaveText("pain flags 1");
    await expect(page.getByTestId("capability-summary-latest-categories")).toContainText(
      "Agility: Lateral Line Step-Over | yellow | pain mild | 2026-05-16"
    );
    await page.getByRole("button", { name: "Edit" }).click();
    await page.getByLabel("Notes").fill("cleaner after warmup");
    await page.getByRole("button", { name: "Save Result" }).click();
    await expect(page.getByTestId("capability-results-list")).toContainText("cleaner after warmup");
    await expect(page.getByTestId("capability-results-list")).not.toContainText("tentative first round");

    await page.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByTestId("capability-empty-state")).toBeVisible();
    await expect(page.getByTestId("capability-summary-overall")).toHaveText("Overall: Not Tested");
    await expect(page.getByTestId("capability-summary-explanation")).toHaveText("No capability tests logged yet.");
    await expect(page.getByTestId("capability-summary-pain-flags")).toHaveCount(0);
    await expect(page.getByTestId("capability-summary-latest-categories")).toHaveCount(0);

    const liveCount = await page.evaluate(async () => {
      const db = (window as any).__db;
      const rows = await db.fitnessTestResults.toArray();
      return rows.filter((row: any) => !row.deletedAt).length;
    });
    expect(liveCount).toBe(0);
  });

  test("summary panel uses newest result per category and shows pain flags", async ({ page }) => {
    await resetDexieDb(page);
    await page.evaluate(async () => {
      const db = (window as any).__db;
      if (!db) throw new Error("__db missing on window.");
      const at = (dateKey: string) => new Date(`${dateKey}T12:00:00`).getTime();
      const now = Date.now();
      await db.fitnessTestResults.bulkAdd([
        {
          id: crypto.randomUUID(),
          testName: "Floor Get-Up",
          category: "ground",
          date: at("2026-05-15"),
          status: "red",
          pain: "none",
          notes: "older result",
          updatedAt: now - 1000,
        },
        {
          id: crypto.randomUUID(),
          testName: "Floor Get-Up",
          category: "ground",
          date: at("2026-05-16"),
          status: "yellow",
          pain: "mild",
          notes: "newer result",
          updatedAt: now,
        },
        {
          id: crypto.randomUUID(),
          testName: "Suitcase Carry - Left",
          category: "carry",
          date: at("2026-05-16"),
          status: "green",
          pain: "none",
          updatedAt: now,
        },
      ]);
    });

    await goto(page, "/capability-tests");

    await expect(page.getByTestId("capability-summary-overall")).toHaveText("Overall: Developing");
    await expect(page.getByTestId("capability-summary-explanation")).toHaveText(
      "Some categories are missing, stale, or mostly yellow."
    );
    await expect(page.getByTestId("capability-summary-status-mix")).toContainText(
      "green 1 | yellow 1 | red 0 | not tested 3"
    );
    await expect(page.getByTestId("capability-summary-pain-flags")).toHaveText("pain flags 1");
    await expect(page.getByTestId("capability-summary-latest-categories")).toContainText(
      "Ground: Floor Get-Up | yellow | pain mild | 2026-05-16"
    );
    await expect(page.getByTestId("capability-summary-latest-categories")).not.toContainText(
      "Ground: Floor Get-Up | red"
    );
  });

  test("capability data does not affect cardio summaries or coach/cardio exports", async ({ page }) => {
    await resetDexieDb(page);
    await goto(page, "/capability-tests");

    await addCapabilityResult(page, {
      testName: "Floor Get-Up",
      date: "2026-05-16",
      status: "red",
      pain: "moderate",
      notes: "capability-only record",
    });

    await goto(page, "/progress");
    await expect(page.getByTestId("progress-walks-empty")).toContainText("No imported walk sessions found yet.");

    await page.getByRole("button", { name: "Copy Cardio Export" }).click();
    const cardioText = await page.evaluate(() => (window as any).__copiedText.text);
    expect(cardioText).toContain("IronForge Cardio Export");
    expect(cardioText).not.toContain("Floor Get-Up");
    expect(cardioText).not.toContain("capability-only record");

    await expect(page.getByRole("button", { name: /Copy Coach Export|Preparing Export/ })).toBeEnabled({
      timeout: 15000,
    });
    await page.getByRole("button", { name: "Copy Coach Export" }).click();
    const coachText = await page.evaluate(() => (window as any).__copiedText.text);
    expect(coachText).toContain("IronForge Coach Export");
    expect(coachText).not.toContain("Floor Get-Up");
    expect(coachText).not.toContain("capability-only record");
  });
});
