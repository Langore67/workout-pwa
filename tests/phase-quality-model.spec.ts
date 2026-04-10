import { test, expect } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173/";

test.describe("phase quality confidence", () => {
  test("hydration distortion downgrades phase quality confidence by one level", async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });

    const result = await page.evaluate(async () => {
      const model = await import("/src/body/phaseQualityModel.ts");
      const stable = model.evaluatePhaseQuality("cut", {
        weightDelta: -3,
        waistDelta: -1,
        correctedLeanDelta: -0.2,
        correctedBodyFatDelta: -0.8,
        strengthDelta: 0,
        sampleCount: 6,
        hydrationDistortionLikely: false,
      });
      const distorted = model.evaluatePhaseQuality("cut", {
        weightDelta: -3,
        waistDelta: -1,
        correctedLeanDelta: -0.2,
        correctedBodyFatDelta: -0.8,
        strengthDelta: 0,
        sampleCount: 6,
        hydrationDistortionLikely: true,
      });

      return {
        stableConfidence: stable.confidence,
        distortedConfidence: distorted.confidence,
        distortedDrivers: distorted.drivers,
      };
    });

    expect(result.stableConfidence).toBe("High");
    expect(result.distortedConfidence).toBe("Moderate");
    expect(result.distortedDrivers).toContain(
      "Hydration context may be distorting impedance-derived lean mass and body-fat changes."
    );
  });
});
