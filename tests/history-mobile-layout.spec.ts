import { expect, test, type Page } from "@playwright/test";
import { resetDexieDb } from "./helpers/dbSeed";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173/";

async function openHistory(page: Page) {
  await page.goto(new URL("/history", BASE_URL).toString(), { waitUntil: "domcontentloaded" });
}

test.describe("History mobile completed-card layout", () => {
  test("completed cards, long titles, and open menus stay within the viewport", async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await resetDexieDb(page);

    const seeded = await page.evaluate(async () => {
      const db = (window as any).__db;
      const now = Date.now();
      const workoutId = crypto.randomUUID();
      const walkId = crypto.randomUUID();
      const conditioningId = crypto.randomUUID();
      const exerciseId = crypto.randomUUID();
      const trackId = crypto.randomUUID();
      const conditioningExerciseId = crypto.randomUUID();
      const conditioningTrackId = crypto.randomUUID();

      await db.exercises.add({
        id: exerciseId,
        name: "Barbell Bench Press",
        normalizedName: "barbell bench press",
        category: "Strength",
        metricMode: "reps",
        equipmentTags: ["barbell"],
        createdAt: now - 1000,
      });
      await db.tracks.add({
        id: trackId,
        exerciseId,
        displayName: "Barbell Bench Press",
        trackType: "strength",
        trackingMode: "weightedReps",
        createdAt: now - 900,
      });
      await db.exercises.add({
        id: conditioningExerciseId,
        name: "Treadmill Run",
        normalizedName: "treadmill run",
        category: "Cardio",
        metricMode: "time",
        equipmentTags: ["treadmill"],
        createdAt: now - 800,
      });
      await db.tracks.add({
        id: conditioningTrackId,
        exerciseId: conditioningExerciseId,
        displayName: "Treadmill Run",
        trackType: "conditioning",
        trackingMode: "timeSeconds",
        createdAt: now - 700,
      });
      await db.sessions.bulkAdd([
        {
          id: workoutId,
          templateName: "Evening Upper Body - Ladders & Shoulder Work",
          startedAt: now - 2 * 60 * 60 * 1000,
          endedAt: now - 60 * 60 * 1000,
          prsJson: JSON.stringify([{ trackName: "Barbell Bench Press", weight: { weight: 185, reps: 8 } }]),
        },
        {
          id: conditioningId,
          templateName: "Upper B",
          activityType: "run",
          conditioningIntent: "fitness",
          cardioFormat: "intervals",
          startedAt: now - 3 * 24 * 60 * 60 * 1000,
          endedAt: now - 3 * 24 * 60 * 60 * 1000 + 45 * 60 * 1000,
        },
        {
          id: walkId,
          templateName: "Peachtree Ridge Park walk with multiple activity details",
          activityType: "walk",
          conditioningIntent: "recovery",
          cardioFormat: "continuous",
          startedAt: now - 26 * 60 * 60 * 1000,
          endedAt: now - 25 * 60 * 60 * 1000,
        },
      ]);
      await db.sets.add({
        id: crypto.randomUUID(),
        sessionId: workoutId,
        trackId,
        setType: "working",
        weight: 185,
        reps: 8,
        completedAt: now - 90 * 60 * 1000,
      });
      await db.sets.add({
        id: crypto.randomUUID(),
        sessionId: conditioningId,
        trackId: conditioningTrackId,
        setType: "working",
        seconds: 10 * 60,
        completedAt: now - 3 * 24 * 60 * 60 * 1000 + 30 * 60 * 1000,
      });
      return { workoutId, walkId, conditioningId };
    });

    await openHistory(page);
    const completed = page.getByTestId("history-completed");
    const list = page.getByTestId("history-completed-list");
    const longCard = page.getByTestId(`history-completed-card:${seeded.workoutId}`);
    const longTitle = page.getByTestId(`history-template:${seeded.workoutId}`);
    const actionButton = longCard.getByRole("button", { name: "Open session actions" });
    await expect(longCard).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId(`history-completed-card:${seeded.walkId}`)).toBeVisible();
    await expect(page.getByTestId(`history-completed-card:${seeded.conditioningId}`)).toBeVisible();
    await expect(longCard.getByText("Done")).toBeVisible();
    await expect(longCard.getByText("1 PR")).toBeVisible();

    for (const width of [320, 375, 390, 414, 430, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      const dimensions = await page.evaluate(() => {
        const get = (selector: string) => {
          const element = document.querySelector(selector);
          if (!element) throw new Error(`Missing ${selector}`);
          const rect = element.getBoundingClientRect();
          return { left: rect.left, right: rect.right, width: rect.width, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth };
        };
        const cardElement = document.querySelector('[data-testid^="history-completed-card:"]');
        if (!cardElement) throw new Error("Missing completed session card");
        const cardRect = cardElement.getBoundingClientRect();
        return {
          viewport: document.documentElement.clientWidth,
          document: document.documentElement.scrollWidth,
          completed: get('[data-testid="history-completed"]'),
          inProgress: get('[data-testid="history-inprogress"]'),
          recentNotes: get('[data-testid="recent-notes"]'),
          list: get('[data-testid="history-completed-list"]'),
          card: { left: cardRect.left, right: cardRect.right, width: cardRect.width },
          cards: Array.from(document.querySelectorAll('[data-testid^="history-completed-card:"]')).map((element) => {
            const rect = element.getBoundingClientRect();
            return { left: rect.left, right: rect.right };
          }),
          overflowers: Array.from(document.querySelectorAll("body *"))
            .map((element) => ({ element, rect: element.getBoundingClientRect() }))
            .filter(({ rect }) => rect.right > document.documentElement.clientWidth + 1)
            .slice(0, 12)
            .map(({ element, rect }) => ({ tag: element.tagName, testId: (element as HTMLElement).dataset.testid, className: (element as HTMLElement).className, left: rect.left, right: rect.right, width: rect.width })),
        };
      });

      expect(dimensions.document, `document width at ${width}px; ${JSON.stringify(dimensions.overflowers)}`).toBeLessThanOrEqual(dimensions.viewport);
      expect(dimensions.completed.left, `completed left alignment at ${width}px`).toBeCloseTo(dimensions.inProgress.left, 1);
      expect(dimensions.completed.left, `notes left alignment at ${width}px`).toBeCloseTo(dimensions.recentNotes.left, 1);
      expect(dimensions.completed.right, `completed right alignment at ${width}px`).toBeCloseTo(dimensions.inProgress.right, 1);
      expect(dimensions.completed.right, `notes right alignment at ${width}px`).toBeCloseTo(dimensions.recentNotes.right, 1);
      expect(dimensions.list.right, `list right edge at ${width}px`).toBeLessThanOrEqual(dimensions.completed.right + 0.5);
      expect(dimensions.card.right, `card right edge at ${width}px`).toBeLessThanOrEqual(dimensions.list.right + 0.5);
      for (const card of dimensions.cards) {
        expect(card.left, `card left edge at ${width}px`).toBeGreaterThanOrEqual(dimensions.completed.left);
        expect(card.right, `card right edge at ${width}px`).toBeLessThanOrEqual(dimensions.completed.right + 0.5);
      }

      if (width === 320) {
        const titleMetrics = await longTitle.evaluate((element) => ({
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          textOverflow: getComputedStyle(element).textOverflow,
          whiteSpace: getComputedStyle(element).whiteSpace,
        }));
        expect(titleMetrics.scrollWidth).toBeGreaterThan(titleMetrics.clientWidth);
        expect(titleMetrics.textOverflow).toBe("ellipsis");
        expect(titleMetrics.whiteSpace).toBe("nowrap");
        await page.screenshot({ path: "test-results/history-mobile-layout-after-320.png", fullPage: true });
      }

      await expect(actionButton).toBeVisible();
      expect((await actionButton.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(32);
      await actionButton.click();
      await expect(page.getByText("View details", { exact: true }).last()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await page.keyboard.press("Escape");
    }

    await expect(page.getByTestId("history-filter:walks")).toBeVisible();
    await page.getByTestId("history-filter:walks").click();
    await expect(page.getByTestId(`history-completed-card:${seeded.walkId}`)).toBeVisible();
    await expect(page.getByTestId(`history-completed-card:${seeded.workoutId}`)).toHaveCount(0);
  });
});
