import { expect, test } from "@playwright/test";
import {
  IRONFORGE_EXPANDED_WALK_EXAMPLE,
  IRONFORGE_FORMATTING_HELP_PROMPT,
  IRONFORGE_MINIMAL_WALK_EXAMPLE,
} from "../src/domain/import/ironForgeFormattingHelp";
import { parseStructuredCardioMetrics } from "../src/lib/cardio/cardioMetrics";
import { parseWorkoutText } from "../src/pages/PasteWorkoutPage";

test("the exact minimal walk example is accepted by the Paste Workout parser", () => {
  const parsed = parseWorkoutText(IRONFORGE_MINIMAL_WALK_EXAMPLE);
  expect(parsed).toMatchObject({
    formatVersion: 1,
    programDay: "MapMyWalk Walk",
    activityType: "walk",
    conditioningIntent: "fitness",
    cardioFormat: "continuous",
    date: "2026-10-24",
    exercises: [],
    failedLines: [],
    cardioMetrics: {
      distance: 3.42,
      distanceUnit: "mi",
      activeDurationSeconds: 3600,
      avgHrBpm: 118,
      maxHrBpm: 136,
      source: "MapMyWalk",
    },
  });
  expect(parsed.sessionNotes).toBeUndefined();
});

test("the exact expanded walk example preserves every documented optional field", () => {
  const parsed = parseWorkoutText(IRONFORGE_EXPANDED_WALK_EXAMPLE);
  expect(parsed).toMatchObject({
    activityType: "walk",
    conditioningIntent: "fitness",
    cardioFormat: "continuous",
    exercises: [],
    failedLines: [],
    cardioMetrics: {
      distance: 3.42,
      distanceUnit: "mi",
      activeDurationSeconds: 3600,
      elapsedDurationSeconds: 3794,
      avgHrBpm: 118,
      maxHrBpm: 136,
      elevationGain: 185,
      elevationUnit: "ft",
      routeName: "Peachtree Ridge Park",
      provider: "mapmywalk",
      providerWorkoutId: "987654321",
      source: "MapMyWalk Screenshot",
      steps: 7214,
      stepsSource: "recorded",
      energyKcal: 401,
      heartRateZones: {
        source: "MapMyWalk display",
        zones: [
          { zone: 1, seconds: 1080 },
          { zone: 2, seconds: 540 },
          { zone: 3, seconds: 1620 },
          { zone: 4, seconds: 360 },
        ],
      },
    },
  });
  expect(parsed.sessionNotes).toBeUndefined();
});

test("help distinguishes canonical labels from accepted compatibility aliases", () => {
  expect(IRONFORGE_FORMATTING_HELP_PROMPT).toContain("Active Duration is actual moving/active workout time");
  expect(IRONFORGE_FORMATTING_HELP_PROMPT).toContain("Duration is the legacy/general compatibility label");
  expect(IRONFORGE_FORMATTING_HELP_PROMPT).toContain("If only percentages are visible");
  expect(IRONFORGE_FORMATTING_HELP_PROMPT).toContain("omit HR Zone rows");

  const aliases = parseStructuredCardioMetrics("Duration: 45:00\nAvg HR: 118 bpm\nMax HR: 136 bpm\nCalories: 401 kcal");
  expect(aliases.metrics).toMatchObject({ durationSeconds: 2700, avgHrBpm: 118, maxHrBpm: 136, energyKcal: 401 });
  const unsupported = parseStructuredCardioMetrics("Moving Time: 45:00");
  expect(unsupported.metrics).toBeUndefined();
  expect(unsupported.recognizedLines.size).toBe(0);
});

test("Paste Workout help renders and copies the shared parser-backed contract", async ({ page }) => {
  await page.goto("/paste-workout", { waitUntil: "domcontentloaded" });
  await page.getByText("Need help formatting a workout?").click();
  const help = page.locator("details");
  await expect(help).toContainText("Minimal walk/cardio example:");
  await expect(help).toContainText("Expanded walk/cardio example");
  await expect(help).toContainText("HR Zone 3: 27:00");
  await expect(help).toContainText("Do not rename labels or invent synonyms");
});
