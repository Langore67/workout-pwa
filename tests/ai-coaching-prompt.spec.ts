import { expect, test, type Page } from "@playwright/test";
import { buildAICoachingPrompt, formatAICoachingAthleteContext } from "../src/domain/coaching/aiCoachingPrompt";
import { DEFAULT_AI_COACHING_PROTOCOL_V1_2 } from "../src/domain/coaching/aiCoachingProtocol";
import { ironForgeImportContractV1 } from "../src/domain/coaching/ironForgeImportContractV1";
import { resetDexieDb } from "./helpers/dbSeed";

async function seedContext(page: Page) {
  await resetDexieDb(page);
  await page.evaluate(async () => {
    const { db } = await import("/src/db.ts");
    const goals = await import("/src/domain/goals/strengthGoals.ts");
    const schedule = await import("/src/domain/schedule/weeklyTrainingSchedule.ts");
    const now = Date.now();
    await db.exercises.bulkAdd([
      { id: "bench", name: "Barbell Bench Press", normalizedName: "barbell bench press", metricMode: "reps", equipmentTags: [], createdAt: now },
      { id: "pullup", name: "Pull-Up", normalizedName: "pull up", metricMode: "reps", equipmentTags: [], createdAt: now },
    ]);
    await goals.setStrengthGoals([
      { id: "g1", type: "strength", exerciseId: "bench", targetMetric: "load", targetValue: 200, targetUnit: "lb", active: true, createdAt: now, updatedAt: now },
      { id: "g2", type: "strength", exerciseId: "pullup", targetMetric: "reps", targetValue: 10, targetUnit: "reps", active: false, createdAt: now, updatedAt: now },
    ]);
    await db.app_meta.put({ key: "profile.goals.v1", valueJson: JSON.stringify({ targetWeightLb: 185 }), updatedAt: now });
    await schedule.setWeeklyTrainingSchedule({ id: "weekly", active: true, entries: schedule.WEEKDAYS.map(({ dayOfWeek }) => dayOfWeek === 1 ? { dayOfWeek, dayType: "training", sessionName: "Upper A", focus: "Bench strength and shoulders" } : { dayOfWeek, dayType: "recovery" }), createdAt: now, updatedAt: now });
  });
}

test("pure prompt assembly includes the complete protocol, factual context, and exact import contract once", () => {
  expect(DEFAULT_AI_COACHING_PROTOCOL_V1_2).toContain("DETAILED LIVE COACHING AFTER EVERY SET");
  expect(DEFAULT_AI_COACHING_PROTOCOL_V1_2).toContain("I retain final authority");
  expect(DEFAULT_AI_COACHING_PROTOCOL_V1_2).toContain("October 19 Upper A session");
  const athlete = formatAICoachingAthleteContext({ strengthGoals: [], exercises: [], bodyGoals: {}, schedule: { status: "unconfigured", trainingDays: 0, entries: [], limitations: [] } });
  const output = buildAICoachingPrompt({ coachingProtocol: DEFAULT_AI_COACHING_PROTOCOL_V1_2, athleteContext: athlete, importContract: ironForgeImportContractV1 });
  expect(output).toContain("Format Version: 1");
  expect(output.match(/IRONFORGE WORKOUT IMPORT CONTRACT/g)).toHaveLength(1);
  expect(output).toContain("Use the latest IronForge Coach Export supplied separately");
  expect(output).not.toContain("200 lb");
});

test("expanded prompt uses active goals and active saved schedule without inventing inactive goals", async ({ page }) => {
  await seedContext(page); await page.goto("/", { waitUntil: "domcontentloaded" });
  const card = page.getByTestId("ai-coaching-prompt");
  await expect(card.getByLabel("Generated coaching prompt")).toHaveCount(0);
  await card.getByRole("button", { name: /AI Coaching Prompt/ }).click();
  const preview = card.getByLabel("Generated coaching prompt");
  await expect(preview).toHaveValue(/Barbell Bench Press: 200 lb performed load/);
  await expect(preview).not.toHaveValue(/Pull-Up: 10 reps/);
  await expect(preview).toHaveValue(/Monday: Upper A — Bench strength and shoulders/);
  await expect(preview).toHaveValue(/Tuesday: Recovery/);
});

test("edited instructions persist, survive schedule edits, and reset only after confirmation", async ({ page }) => {
  await seedContext(page); await page.goto("/", { waitUntil: "domcontentloaded" });
  const card = page.getByTestId("ai-coaching-prompt"); await card.getByRole("button", { name: /AI Coaching Prompt/ }).click();
  const editor = card.getByLabel("Coaching instructions");
  await editor.fill("My persisted coaching instructions."); await card.getByRole("button", { name: "Save Instructions" }).click();
  await expect(card.getByRole("status")).toContainText("Instructions saved");
  await page.evaluate(async () => { const m = await import("/src/domain/schedule/weeklyTrainingSchedule.ts"); const stored = await m.getWeeklyTrainingSchedule(); await m.setWeeklyTrainingSchedule({ ...stored!, updatedAt: Date.now() }); });
  await page.reload({ waitUntil: "domcontentloaded" }); await page.getByTestId("ai-coaching-prompt").getByRole("button", { name: /AI Coaching Prompt/ }).click();
  await expect(page.getByLabel("Coaching instructions")).toHaveValue("My persisted coaching instructions.");
  page.once("dialog", (dialog) => dialog.dismiss()); await page.getByRole("button", { name: "Reset to Default" }).click();
  await expect(page.getByLabel("Coaching instructions")).toHaveValue("My persisted coaching instructions.");
  page.once("dialog", (dialog) => dialog.accept()); await page.getByRole("button", { name: "Reset to Default" }).click();
  await expect(page.getByLabel("Coaching instructions")).toHaveValue(/IRONFORGE AI COACHING PROTOCOL/);
});

test("Copy Prompt copies the exact multiline preview", async ({ page }) => {
  await page.addInitScript(() => {
    let copied = "";
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => { copied = text; }, readText: async () => copied } });
  });
  await seedContext(page); await page.goto("/", { waitUntil: "domcontentloaded" });
  const card = page.getByTestId("ai-coaching-prompt"); await card.getByRole("button", { name: /AI Coaching Prompt/ }).click();
  await expect(card.getByLabel("Generated coaching prompt")).toHaveValue(/IRONFORGE AI COACHING PROTOCOL/);
  const preview = await card.getByLabel("Generated coaching prompt").inputValue(); await card.getByRole("button", { name: "Copy Prompt" }).click();
  expect((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, "\n")).toBe(preview.replace(/\r\n/g, "\n"));
  expect(preview.split("\n").length).toBeGreaterThan(40);
});

test("clipboard failure is visible and existing Start actions remain available", async ({ page }) => {
  await seedContext(page); await page.addInitScript(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("denied"); } } }));
  await page.goto("/", { waitUntil: "domcontentloaded" }); const card = page.getByTestId("ai-coaching-prompt"); await card.getByRole("button", { name: /AI Coaching Prompt/ }).click();
  await card.getByRole("button", { name: "Copy Prompt" }).click(); await expect(card.getByRole("alert")).toContainText("Could not copy");
  await expect(page.getByRole("button", { name: "Start Empty Workout" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Paste Workout/i })).toBeVisible();
});
