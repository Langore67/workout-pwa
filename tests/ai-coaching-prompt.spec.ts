import { expect, test, type Page } from "@playwright/test";
import {
  buildGymCoachHandoff,
  formatGymCoachTodayIntent,
} from "../src/domain/coaching/gymCoachHandoff";
import { DEFAULT_AI_COACHING_PROTOCOL } from "../src/domain/coaching/aiCoachingProtocol";
import { IRONFORGE_HANDOFF_RETURN_INSTRUCTIONS } from "../src/domain/import/ironForgeFormattingHelp";
import { IF_WORKOUT_FORMAT_VERSION } from "../src/domain/import/ifWorkoutContract";
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
    await schedule.setWeeklyTrainingSchedule({
      id: "weekly",
      active: true,
      entries: schedule.WEEKDAYS.map(({ dayOfWeek }) => ({
        dayOfWeek,
        dayType: "training",
        sessionName: "Upper A",
        focus: "Bench strength and shoulders",
      })),
      createdAt: now,
      updatedAt: now,
    });
  });
}

async function openAdvanced(page: Page) {
  const card = page.getByTestId("gym-coach-handoff");
  await card.getByRole("button", { name: "Advanced / Preview" }).click();
  return card;
}

test("pure handoff composition includes Coach Export once without rebuilding its goals or schedule", () => {
  const coachExportText = `IronForge Coach Export\nStrength Goal Progress\n- Bench: 200 lb\nIntended Weekly Schedule\n- Monday: Upper A`;
  const output = buildGymCoachHandoff({
    coachingInstructions: DEFAULT_AI_COACHING_PROTOCOL,
    todayIntent: { dayLabel: "Monday", assignment: "Upper A", focus: "Bench strength and shoulders" },
    coachExportText,
    workoutReturnInstructions: IRONFORGE_HANDOFF_RETURN_INSTRUCTIONS,
  });

  expect(output.match(/IronForge Coach Export/g)).toHaveLength(1);
  expect(output.match(/Strength Goal Progress/g)).toHaveLength(1);
  expect(output.match(/Intended Weekly Schedule/g)).toHaveLength(1);
  expect(output).not.toContain("ATHLETE CONTEXT");
  expect(output).toContain("Scheduled session: Upper A");
  expect(output).toContain("Focus: Bench strength and shoulders");
});

test("temporary user note is optional and labeled as session-specific", () => {
  const base = {
    coachingInstructions: "Coach interactively.",
    todayIntent: { assignment: "Upper A" },
    coachExportText: "IronForge Coach Export\nEvidence",
    workoutReturnInstructions: IRONFORGE_HANDOFF_RETURN_INSTRUCTIONS,
  };
  expect(buildGymCoachHandoff(base)).not.toContain("TODAY-SPECIFIC USER NOTE");
  const withNote = buildGymCoachHandoff({ ...base, sessionSpecificNote: "Only have 50 minutes." });
  expect(withNote).toContain("TODAY-SPECIFIC USER NOTE");
  expect(withNote).toContain("User-supplied for this session only:");
  expect(withNote).toContain("Only have 50 minutes.");
});

test("handoff return instructions use the parser version and completed-workout semantics", () => {
  expect(IRONFORGE_HANDOFF_RETURN_INSTRUCTIONS).toContain(`Format Version: ${IF_WORKOUT_FORMAT_VERSION}`);
  expect(IRONFORGE_HANDOFF_RETURN_INSTRUCTIONS).toContain("represents completed work, not a planned workout");
  expect(IRONFORGE_HANDOFF_RETURN_INSTRUCTIONS).toContain("Only confirmed session results");
  expect(IRONFORGE_HANDOFF_RETURN_INSTRUCTIONS).toContain("already logged directly in IronForge Gym, do not import it again");
});

test("Start shows one compact Gym Coach Handoff with resolved today context", async ({ page }) => {
  await seedContext(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const card = page.getByTestId("gym-coach-handoff");
  await expect(card).toHaveCount(1);
  await expect(card).toContainText("Upper A · Bench strength and shoulders");
  await expect(card.getByRole("button", { name: "Copy Gym Coach Handoff" })).toBeEnabled({ timeout: 15000 });
  await expect(card.getByLabel("Gym Coach Handoff preview")).toHaveCount(0);
  await expect(page.getByText("AI Coaching Prompt", { exact: true })).toHaveCount(0);

  await card.getByRole("button", { name: "Advanced / Preview" }).click();
  const preview = await card.getByLabel("Gym Coach Handoff preview").inputValue();
  expect(preview.match(/IronForge Coach Export/g)).toHaveLength(1);
  expect(preview.match(/Training Exposure \/ Schedule/g)).toHaveLength(1);
  expect(preview).not.toContain("ATHLETE CONTEXT");
});

test("persistent instructions survive reload while today's note does not", async ({ page }) => {
  await seedContext(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  let card = await openAdvanced(page);
  const editor = card.getByLabel("Coaching instructions");
  await editor.fill("My persisted coaching instructions.");
  await card.getByRole("button", { name: "Save Instructions" }).click();
  await expect(card.getByRole("status")).toContainText("Instructions saved");
  await card.getByLabel("Today's session note").fill("Knee feels stiff today.");

  await page.reload({ waitUntil: "domcontentloaded" });
  card = await openAdvanced(page);
  await expect(card.getByLabel("Coaching instructions")).toHaveValue("My persisted coaching instructions.");
  await expect(card.getByLabel("Today's session note")).toHaveValue("");

  page.once("dialog", (dialog) => dialog.accept());
  await card.getByRole("button", { name: "Reset to Default" }).click();
  await expect(card.getByLabel("Coaching instructions")).toHaveValue(DEFAULT_AI_COACHING_PROTOCOL);
});

test("Copy Gym Coach Handoff copies the exact preview", async ({ page }) => {
  await page.addInitScript(() => {
    let copied = "";
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (text: string) => { copied = text; }, readText: async () => copied },
    });
  });
  await seedContext(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const card = await openAdvanced(page);
  await card.getByLabel("Today's session note").fill("No cable station available.");
  const preview = card.getByLabel("Gym Coach Handoff preview");
  await expect(preview).toHaveValue(/IRONFORGE GYM COACH HANDOFF/);
  await expect(preview).toHaveValue(/No cable station available/);
  await card.getByRole("button", { name: "Copy Gym Coach Handoff" }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied.replace(/\r\n/g, "\n")).toBe((await preview.inputValue()).replace(/\r\n/g, "\n"));
  await expect(card.getByRole("status")).toContainText("Gym Coach Handoff copied");
});

test("clipboard and fallback failure reveals the selectable handoff preview", async ({ page }) => {
  await seedContext(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async () => { throw new Error("denied"); } },
    });
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: () => false,
    });
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const card = page.getByTestId("gym-coach-handoff");
  await expect(card.getByRole("button", { name: "Copy Gym Coach Handoff" })).toBeEnabled({ timeout: 15000 });
  await card.getByRole("button", { name: "Copy Gym Coach Handoff" }).click();
  await expect(card.getByRole("alert")).toContainText("Select the preview and copy it manually");
  await expect(card.getByLabel("Gym Coach Handoff preview")).toBeVisible();
});

test("today formatter keeps session relevance ahead of the export", () => {
  expect(formatGymCoachTodayIntent({ dayLabel: "Friday", assignment: "Lower A", focus: "Squat strength" }))
    .toBe("Day: Friday\nScheduled session: Lower A\nFocus: Squat strength");
});
