import { test, expect } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173/";

test.describe("next working recommendation", () => {
  test("assisted bodyweight history stays recommendation-eligible and increases by reducing assistance", async ({
    page,
  }) => {
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });

    const result = await page.evaluate(async () => {
      const recs = await import("/src/domain/coaching/nextWorkingRecommendation.ts");
      return recs.getNextWorkingRecommendation({
        trackId: "track-assisted-pullup",
        trackType: "strength",
        trackingMode: "weightedReps",
        repMin: 8,
        repMax: 10,
        weightJump: 5,
        roundingStep: 5,
        recentSets: [
          { weight: -65, reps: 10, completed: true, timestamp: 3 },
          { weight: -70, reps: 8, completed: true, timestamp: 2 },
        ],
      });
    });

    expect(result).toMatchObject({
      action: "increase",
      confidence: "medium",
      targetWeight: -60,
      targetReps: 8,
    });
    expect(result.rationale).toContain("Progressing from last best set -65x10");
  });

  test("assisted bodyweight under-range recommendation reduces effective load by adding assistance", async ({
    page,
  }) => {
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });

    const result = await page.evaluate(async () => {
      const recs = await import("/src/domain/coaching/nextWorkingRecommendation.ts");
      return recs.getNextWorkingRecommendation({
        trackId: "track-assisted-pullup-low",
        trackType: "strength",
        trackingMode: "weightedReps",
        repMin: 8,
        repMax: 10,
        weightJump: 5,
        roundingStep: 5,
        recentSets: [{ weight: -65, reps: 5, completed: true, timestamp: 4 }],
      });
    });

    expect(result).toMatchObject({
      action: "reduce",
      confidence: "medium",
      targetWeight: -70,
      targetReps: 8,
    });
    expect(result.rationale).toContain("below the target rep range");
  });
});
