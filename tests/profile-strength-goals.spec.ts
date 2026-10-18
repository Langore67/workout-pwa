import { expect, test, type Page } from "@playwright/test";
import {
  MAX_STRENGTH_GOALS,
  addStrengthGoal,
  deactivateStrengthGoal,
  reactivateStrengthGoal,
  updateStrengthGoal,
  validateStrengthGoalDraft,
  type StrengthGoal,
} from "../src/domain/goals/strengthGoals";
import { resetDexieDb } from "./helpers/dbSeed";

const NOW = Date.UTC(2026, 9, 18, 12);

function exercise(id: string, name: string, extra = {}) {
  return { id, name, normalizedName: name.toLowerCase(), metricMode: "reps", equipmentTags: [], createdAt: NOW, ...extra } as any;
}

function goal(id: string, exerciseId: string, targetMetric: "load" | "reps", targetValue: number, extra = {}): StrengthGoal {
  return {
    id,
    type: "strength",
    exerciseId,
    targetMetric,
    targetValue,
    targetUnit: targetMetric === "load" ? "lb" : "reps",
    active: true,
    createdAt: NOW,
    updatedAt: NOW,
    ...extra,
  };
}

async function seedProfile(page: Page) {
  await resetDexieDb(page);
  await page.evaluate(async () => {
    const { db } = await import("/src/db.ts");
    const now = Date.now();
    await db.exercises.bulkAdd([
      { id: "bench", name: "Barbell Bench Press", normalizedName: "barbell bench press", metricMode: "reps", equipmentTags: ["barbell"], createdAt: now },
      { id: "pull-up", name: "Pull-Up", normalizedName: "pull-up", metricMode: "reps", equipmentTags: ["bodyweight"], createdAt: now },
      { id: "archived", name: "Archived Press", normalizedName: "archived press", metricMode: "reps", archivedAt: now, equipmentTags: [], createdAt: now },
      { id: "alias", name: "Old Bench Alias", normalizedName: "old bench alias", metricMode: "reps", mergedIntoExerciseId: "bench", archivedAt: now, equipmentTags: [], createdAt: now },
      { id: "run", name: "Outdoor Run", normalizedName: "outdoor run", metricMode: "distance", equipmentTags: [], createdAt: now },
    ] as any);
  });
  await page.goto("/profile", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("strength-goals-card")).not.toContainText("Loading strength goals");
}

async function beginAdd(page: Page) {
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByRole("button", { name: "Add strength goal" }).click();
}

async function fillGoal(page: Page, values: { exercise: string; metric: "load" | "reps"; target: string; label?: string }) {
  const form = page.getByTestId("strength-goal-form");
  await form.getByLabel("Exercise").selectOption(values.exercise);
  await form.getByLabel("Target metric").selectOption(values.metric);
  await form.getByLabel("Target value").fill(values.target);
  if (values.label != null) await form.getByLabel("Label (optional)").fill(values.label);
}

test("Profile renders an empty factual Strength Goals card with canonical compatible exercise options only", async ({ page }) => {
  await seedProfile(page);
  const card = page.getByTestId("strength-goals-card");
  await expect(card).toContainText("No strength goals set.");
  await expect(card).not.toContainText("200 lb");
  await expect(card).not.toContainText("10 reps");

  await beginAdd(page);
  const options = await card.getByLabel("Exercise").locator("option").allTextContents();
  expect(options).toContain("Barbell Bench Press");
  expect(options).toContain("Pull-Up");
  expect(options).not.toContain("Archived Press");
  expect(options).not.toContain("Old Bench Alias");
  expect(options).not.toContain("Outdoor Run");
  expect(options).toEqual(options.slice().sort((a, b) => {
    if (a === "Select…") return -1;
    if (b === "Select…") return 1;
    return a.localeCompare(b);
  }));
  await expect(card).not.toContainText(/\bon track\b|\boff track\b|\bETA\b|\breadiness\b|\bnext weight\b|\brecommend(?:ation)?\b/i);
});

test("adds load and reps goals explicitly, derives units, and survives reload", async ({ page }) => {
  await seedProfile(page);
  await beginAdd(page);
  await fillGoal(page, { exercise: "bench", metric: "load", target: "200", label: "Competition target" });
  await page.getByRole("button", { name: "Save goal" }).click();
  await expect(page.getByTestId("strength-goals-card")).toContainText("200 lb performed load");

  await page.getByRole("button", { name: "Add strength goal" }).click();
  await fillGoal(page, { exercise: "pull-up", metric: "reps", target: "10" });
  await page.getByRole("button", { name: "Save goal" }).click();
  await expect(page.getByTestId("strength-goals-card")).toContainText("10 reps");

  const stored = await page.evaluate(async () => (await import("/src/domain/goals/strengthGoals.ts")).getStrengthGoals());
  expect(stored.map((row) => [row.targetMetric, row.targetUnit])).toEqual([["load", "lb"], ["reps", "reps"]]);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("strength-goals-card")).toContainText("Competition target");
  await expect(page.getByTestId("strength-goals-card")).toContainText("Pull-Up");
});

test("editing exercise, metric, target, and label preserves createdAt and changes updatedAt", async ({ page }) => {
  await seedProfile(page);
  await page.evaluate(async ({ now }) => {
    const { setStrengthGoals } = await import("/src/domain/goals/strengthGoals.ts");
    await setStrengthGoals([{ id: "g", type: "strength", exerciseId: "bench", targetMetric: "load", targetValue: 200, targetUnit: "lb", active: true, createdAt: now, updatedAt: now }]);
  }, { now: NOW });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByTestId("strength-goal-g").getByRole("button", { name: "Edit" }).click();
  await fillGoal(page, { exercise: "pull-up", metric: "reps", target: "12", label: "Strict reps" });
  await page.getByRole("button", { name: "Save goal" }).click();

  const stored = await page.evaluate(async () => (await import("/src/domain/goals/strengthGoals.ts")).getStrengthGoals());
  expect(stored[0]).toMatchObject({ exerciseId: "pull-up", targetMetric: "reps", targetValue: 12, targetUnit: "reps", label: "Strict reps", createdAt: NOW });
  expect(stored[0].updatedAt).toBeGreaterThan(NOW);
});

test("deactivate/reactivate persists visibility and controls existing Coach progress consumption", async ({ page }) => {
  await seedProfile(page);
  await page.evaluate(async () => {
    const { db } = await import("/src/db.ts");
    const { setStrengthGoals } = await import("/src/domain/goals/strengthGoals.ts");
    const now = Date.now();
    await setStrengthGoals([{ id: "g", type: "strength", exerciseId: "bench", targetMetric: "load", targetValue: 200, targetUnit: "lb", active: true, createdAt: now - 1000, updatedAt: now - 1000 }]);
    await db.tracks.add({ id: "bench-track", exerciseId: "bench", displayName: "Bench", trackType: "strength", trackingMode: "weightedReps", warmupSetsDefault: 0, workingSetsDefault: 1, repMin: 1, repMax: 10, restSecondsDefault: 60, weightJumpDefault: 5, createdAt: now });
    await db.sessions.add({ id: "session", startedAt: now - 10000, endedAt: now - 5000 });
    await db.sets.add({ id: "set", sessionId: "session", trackId: "bench-track", setType: "working", weight: 150, reps: 5, createdAt: now - 9000, completedAt: now - 8000 });
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Edit" }).click();
  const row = page.getByTestId("strength-goal-g");
  await row.getByRole("button", { name: "Deactivate" }).click();
  await expect(row).toContainText("Inactive");
  expect(await page.evaluate(async () => (await import("/src/lib/coachExport/buildCoachExportMetrics.ts")).buildCoachExportMetrics().then((m) => m.strengthGoalProgress))).toEqual([]);

  await row.getByRole("button", { name: "Reactivate" }).click();
  await expect(row).toContainText("Active");
  const progress = await page.evaluate(async () => (await import("/src/lib/coachExport/buildCoachExportMetrics.ts")).buildCoachExportMetrics().then((m) => m.strengthGoalProgress));
  expect(progress).toHaveLength(1);
  expect(progress?.[0]).toMatchObject({ goalId: "g", currentValue: 150 });
});

test("draft validation rejects missing and invalid targets, duplicates, and Cancel performs no write", async ({ page }) => {
  await seedProfile(page);
  await beginAdd(page);
  await page.getByRole("button", { name: "Save goal" }).click();
  await expect(page.getByRole("alert")).toHaveText("Choose an exercise.");
  await fillGoal(page, { exercise: "bench", metric: "load", target: "" });
  await page.getByRole("button", { name: "Save goal" }).click();
  await expect(page.getByRole("alert")).toHaveText("Enter a target value.");
  for (const invalid of ["0", "-5", "words"]) {
    await page.getByLabel("Target value").fill(invalid);
    await page.getByRole("button", { name: "Save goal" }).click();
    await expect(page.getByRole("alert")).toHaveText("Enter a load greater than 0.");
  }
  await page.getByLabel("Target metric").selectOption("reps");
  await page.getByLabel("Target value").fill("4.5");
  await page.getByRole("button", { name: "Save goal" }).click();
  await expect(page.getByRole("alert")).toHaveText("Reps must be a positive whole number.");
  await page.getByRole("button", { name: "Cancel" }).click();
  expect(await page.evaluate(async () => (await import("/src/domain/goals/strengthGoals.ts")).getStrengthGoals())).toEqual([]);

  await page.getByRole("button", { name: "Add strength goal" }).click();
  await fillGoal(page, { exercise: "bench", metric: "load", target: "200" });
  await page.getByRole("button", { name: "Save goal" }).click();
  await page.getByRole("button", { name: "Add strength goal" }).click();
  await fillGoal(page, { exercise: "bench", metric: "load", target: "225" });
  await page.getByRole("button", { name: "Save goal" }).click();
  await expect(page.getByRole("alert")).toHaveText("An active performed-load goal already exists for this exercise.");
});

test("domain helpers enforce canonical, compatible, duplicate, inactive-reactivation, cap, timestamp, and immutability rules", () => {
  const exercises = [exercise("bench", "Bench"), exercise("archived", "Archived", { archivedAt: NOW }), exercise("alias", "Alias", { mergedIntoExerciseId: "bench" }), exercise("run", "Run", { metricMode: "distance" })];
  expect(validateStrengthGoalDraft({ draft: { exerciseId: "missing", targetMetric: "load", targetValue: 100 }, goals: [], exercises })).toMatchObject({ ok: false, error: { code: "exercise_not_found" } });
  expect(validateStrengthGoalDraft({ draft: { exerciseId: "archived", targetMetric: "load", targetValue: 100 }, goals: [], exercises })).toMatchObject({ ok: false, error: { code: "exercise_not_canonical" } });
  expect(validateStrengthGoalDraft({ draft: { exerciseId: "alias", targetMetric: "reps", targetValue: 5 }, goals: [], exercises })).toMatchObject({ ok: false, error: { code: "exercise_not_canonical" } });
  expect(validateStrengthGoalDraft({ draft: { exerciseId: "run", targetMetric: "reps", targetValue: 5 }, goals: [], exercises })).toMatchObject({ ok: false, error: { code: "exercise_metric_incompatible" } });

  const active = goal("active", "bench", "load", 200);
  const inactive = goal("inactive", "bench", "load", 225, { active: false });
  const source = [active, inactive];
  const before = JSON.stringify(source);
  expect(addStrengthGoal({ goals: source, exercises, draft: { exerciseId: "bench", targetMetric: "load", targetValue: 250 }, id: "new" })).toMatchObject({ ok: false, error: { code: "duplicate_active" } });
  expect(reactivateStrengthGoal({ goals: source, exercises, goalId: "inactive" })).toMatchObject({ ok: false, error: { code: "duplicate_active" } });
  const deactivated = deactivateStrengthGoal({ goals: source, exercises, goalId: "active", now: NOW + 1 });
  expect(deactivated).toMatchObject({ ok: true, goal: { active: false, updatedAt: NOW + 1 } });
  expect(JSON.stringify(source)).toBe(before);

  const updated = updateStrengthGoal({ goals: [active], exercises, goalId: "active", draft: { exerciseId: "bench", targetMetric: "reps", targetValue: 10, label: "  Clean reps  " }, now: NOW + 2 });
  expect(updated).toMatchObject({ ok: true, goal: { createdAt: NOW, updatedAt: NOW + 2, targetUnit: "reps", label: "Clean reps" } });
  expect(addStrengthGoal({ goals: Array.from({ length: MAX_STRENGTH_GOALS }, (_, index) => goal(`g${index}`, "bench", "reps", index + 1, { active: false })), exercises, draft: { exerciseId: "bench", targetMetric: "reps", targetValue: 30 }, id: "overflow" })).toMatchObject({ ok: false, error: { code: "goal_limit" } });
});

test("a persistence failure remains visible and does not replace existing goals", async ({ page }) => {
  await seedProfile(page);
  await page.evaluate(async ({ now }) => {
    const { setStrengthGoals } = await import("/src/domain/goals/strengthGoals.ts");
    await setStrengthGoals([{ id: "existing", type: "strength", exerciseId: "bench", targetMetric: "load", targetValue: 200, targetUnit: "lb", active: true, createdAt: now, updatedAt: now }]);
  }, { now: NOW });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByRole("button", { name: "Add strength goal" }).click();
  await fillGoal(page, { exercise: "pull-up", metric: "reps", target: "10" });
  await page.evaluate(() => {
    // @ts-ignore deliberate failure injection for the explicit persistence path
    window.__originalStrengthGoalPut = window.__db.app_meta.put.bind(window.__db.app_meta);
    // @ts-ignore
    window.__db.app_meta.put = async () => { throw new Error("Storage unavailable."); };
  });
  await page.getByRole("button", { name: "Save goal" }).click();
  await expect(page.getByRole("alert")).toHaveText("Storage unavailable.");
  await expect(page.getByTestId("strength-goal-existing")).toContainText("200 lb performed load");
  await expect(page.getByTestId("strength-goal-form")).toBeVisible();
});

test("the Profile card reports and enforces the persisted goal cap", async ({ page }) => {
  await seedProfile(page);
  await page.evaluate(async ({ now, cap }) => {
    const { setStrengthGoals } = await import("/src/domain/goals/strengthGoals.ts");
    await setStrengthGoals(Array.from({ length: cap }, (_, index) => ({
      id: `goal-${index}`,
      type: "strength" as const,
      exerciseId: "bench",
      targetMetric: "load" as const,
      targetValue: index + 1,
      targetUnit: "lb" as const,
      active: false,
      createdAt: now + index,
      updatedAt: now + index,
    })));
  }, { now: NOW, cap: MAX_STRENGTH_GOALS });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("button", { name: "Add strength goal" })).toBeDisabled();
  await expect(page.getByTestId("strength-goals-card")).toContainText(`The strength-goal limit of ${MAX_STRENGTH_GOALS} has been reached.`);
});

test("existing Body Targets editing remains app_meta-backed", async ({ page }) => {
  await seedProfile(page);
  await page.getByRole("button", { name: "Edit" }).click();
  const bodyTargets = page.locator(".card").filter({ hasText: "BODY TARGETS" });
  await bodyTargets.getByRole("textbox").nth(0).fill("182");
  await page.getByRole("button", { name: "Done" }).click();
  await expect.poll(() => page.evaluate(async () => {
    const row = await window.__db.app_meta.get("profile.goals.v1");
    return row?.valueJson ? JSON.parse(row.valueJson).targetWeightLb : null;
  })).toBe(182);
});
