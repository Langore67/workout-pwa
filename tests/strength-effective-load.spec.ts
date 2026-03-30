import { test, expect, type Page } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173/";

async function goto(page: Page, path: string) {
  await page.goto(new URL(path, BASE_URL).toString(), { waitUntil: "domcontentloaded" });
}

test.describe("shared effective-load helpers", () => {
  test("pull up with negative assistance uses bodyweight plus logged load for e1RM", async ({ page }) => {
    await goto(page, "/");

    const result = await page.evaluate(async () => {
      const strength = await import("/src/strength/Strength.ts");
      const effective = strength.calcEffectiveStrengthWeightLb(-65, "Pull Up", 203);
      const e1rm = strength.computeScoredE1RM(effective, 10);
      return { effective, e1rm };
    });

    expect(result).toEqual({ effective: 138, e1rm: 184 });
  });

  test("explicit assisted names treat positive logged weight as assistance", async ({ page }) => {
    await goto(page, "/");

    const result = await page.evaluate(async () => {
      const strength = await import("/src/strength/Strength.ts");
      return {
        assistedPullUpPositive: strength.calcEffectiveStrengthWeightLb(65, "Assisted Pull Up", 203),
        assistedPullUpNegative: strength.calcEffectiveStrengthWeightLb(-65, "Assisted Pull Up", 203),
        weightedPullUp: strength.calcEffectiveStrengthWeightLb(25, "Pull Up", 203),
      };
    });

    expect(result).toEqual({
      assistedPullUpPositive: 138,
      assistedPullUpNegative: 138,
      weightedPullUp: 228,
    });
  });

  test("bodyweight compound effective load still handles unassisted and non-bodyweight cases", async ({ page }) => {
    await goto(page, "/");

    const result = await page.evaluate(async () => {
      const strength = await import("/src/strength/Strength.ts");
      return {
        unassistedChinUp: strength.calcEffectiveStrengthWeightLb(0, "Chin Up", 203),
        weightedDip: strength.calcEffectiveStrengthWeightLb(45, "Dip", 203),
        normalBench: strength.calcEffectiveStrengthWeightLb(135, "Bench Press", 203),
      };
    });

    expect(result).toEqual({
      unassistedChinUp: 203,
      weightedDip: 248,
      normalBench: 135,
    });
  });
});
