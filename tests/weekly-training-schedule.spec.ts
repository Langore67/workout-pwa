import { expect, test, type Page } from "@playwright/test";
import {
  WEEKDAYS,
  getScheduledEntryForDate,
  isSameLocalCalendarDay,
  localWeekdayForDate,
  resolveIntendedWeeklySchedule,
  validateWeeklyTrainingSchedule,
  type ScheduleEntry,
  type WeeklyTrainingSchedule,
} from "../src/domain/schedule/weeklyTrainingSchedule";
import { formatIntendedWeeklyScheduleForCoach } from "../src/lib/coachReport/formatCoachReportText";
import { resetDexieDb } from "./helpers/dbSeed";

const NOW = Date.UTC(2026, 9, 19, 12);

function completeSchedule(overrides: Partial<Record<number, ScheduleEntry>> = {}, extra: Partial<WeeklyTrainingSchedule> = {}): WeeklyTrainingSchedule {
  return {
    id: "weekly",
    active: true,
    entries: WEEKDAYS.map(({ dayOfWeek }) => overrides[dayOfWeek] ?? { dayOfWeek, dayType: "recovery" }),
    createdAt: NOW,
    updatedAt: NOW,
    ...extra,
  };
}

function template(id: string, name: string, extra = {}) {
  return { id, name, createdAt: NOW, ...extra } as any;
}

async function seedStart(page: Page, options: { todayType?: "training" | "recovery"; active?: boolean; linked?: boolean; missing?: boolean; archived?: boolean; completed?: boolean; unfinished?: boolean } = {}) {
  await resetDexieDb(page);
  await page.evaluate(async (args) => {
    const { db } = await import("/src/db.ts");
    const scheduleModule = await import("/src/domain/schedule/weeklyTrainingSchedule.ts");
    const now = Date.now();
    const day = scheduleModule.localWeekdayForDate(new Date());
    const archivedAt = args.archived ? now - 1000 : undefined;
    if (!args.missing) {
      await db.exercises.add({ id: "exercise-a", name: "Bench Press", normalizedName: "bench press", metricMode: "reps", equipmentTags: [], createdAt: now });
      await db.tracks.add({ id: "track-a", exerciseId: "exercise-a", displayName: "Bench Press", trackType: "strength", trackingMode: "weightedReps", warmupSetsDefault: 0, workingSetsDefault: 1, repMin: 1, repMax: 10, restSecondsDefault: 60, weightJumpDefault: 5, createdAt: now });
      await db.templates.add({ id: "upper-a", name: "Upper A", createdAt: now, ...(archivedAt ? { archivedAt } : {}) });
      await db.templateItems.add({ id: "item-a", templateId: "upper-a", orderIndex: 0, trackId: "track-a", createdAt: now });
    }
    await db.templates.add({ id: "other", name: "Other Workout", createdAt: now });
    if (!args.missing) await db.templateItems.add({ id: "item-other", templateId: "other", orderIndex: 0, trackId: "track-a", createdAt: now });
    const entries = scheduleModule.WEEKDAYS.map(({ dayOfWeek }) =>
      dayOfWeek === day && args.todayType !== "recovery"
        ? { dayOfWeek, dayType: "training" as const, sessionName: "Upper A", focus: "Chest and shoulders", ...((args.linked || args.missing || args.archived) ? { templateId: "upper-a" } : {}) }
        : { dayOfWeek, dayType: "recovery" as const }
    );
    await scheduleModule.setWeeklyTrainingSchedule({ id: "weekly", active: args.active !== false, entries, createdAt: now, updatedAt: now });
    if (args.completed || args.unfinished) {
      await db.sessions.add({ id: args.completed ? "completed" : "unfinished", templateId: "upper-a", templateName: "Upper A", startedAt: now - 60000, ...(args.completed ? { endedAt: now - 30000 } : {}) });
    }
  }, options);
  await page.goto("/", { waitUntil: "domcontentloaded" });
}

test("schedule persistence saves seven days, reloads, updates a weekday, permits repeated templates, and preserves unavailable references", async ({ page }) => {
  await resetDexieDb(page);
  const result = await page.evaluate(async ({ now }) => {
    const { db } = await import("/src/db.ts");
    const module = await import("/src/domain/schedule/weeklyTrainingSchedule.ts");
    await db.templates.add({ id: "upper", name: "Upper", createdAt: now });
    const entries = module.WEEKDAYS.map(({ dayOfWeek }) => dayOfWeek <= 2
      ? { dayOfWeek, dayType: "training" as const, sessionName: `Upper ${dayOfWeek}`, templateId: "upper" }
      : dayOfWeek === 3
        ? { dayOfWeek, dayType: "training" as const, sessionName: "Back Day", templateId: "missing-template" }
        : { dayOfWeek, dayType: "recovery" as const });
    const saved = await module.setWeeklyTrainingSchedule({ id: "weekly", active: true, entries, createdAt: now, updatedAt: now }, await db.templates.toArray());
    const loaded = await module.getWeeklyTrainingSchedule();
    const updated = { ...loaded!, entries: loaded!.entries.map((entry) => entry.dayOfWeek === 7 ? { dayOfWeek: 7 as const, dayType: "training" as const, sessionName: "Optional Sunday", templateId: "upper" } : entry), updatedAt: now + 1 };
    await module.setWeeklyTrainingSchedule(updated, await db.templates.toArray());
    return { saved, loaded, final: await module.getWeeklyTrainingSchedule(), raw: await db.app_meta.get(module.WEEKLY_TRAINING_SCHEDULE_META_KEY) };
  }, { now: NOW });
  expect(result.saved.entries).toHaveLength(7);
  expect(result.loaded?.entries.filter((entry) => entry.dayType === "training" && entry.templateId === "upper")).toHaveLength(2);
  expect(result.final?.entries.find((entry) => entry.dayOfWeek === 7)).toMatchObject({ dayType: "training", templateId: "upper" });
  expect(result.final?.entries.find((entry) => entry.dayOfWeek === 3)).toMatchObject({ dayType: "training", templateId: "missing-template" });
  expect(result.raw?.key).toBe("training.schedule.v1");
});

test("absence stays unconfigured and structural validation rejects duplicate or incomplete weekdays", async ({ page }) => {
  await resetDexieDb(page);
  expect(await page.evaluate(async () => (await import("/src/domain/schedule/weeklyTrainingSchedule.ts")).getWeeklyTrainingSchedule())).toBeNull();
  const duplicate = completeSchedule();
  duplicate.entries[6] = { dayOfWeek: 1, dayType: "recovery" };
  expect(validateWeeklyTrainingSchedule(duplicate)).toMatchObject({ ok: false, issues: expect.arrayContaining([expect.objectContaining({ code: "weekday_duplicate" })]) });
  expect(validateWeeklyTrainingSchedule({ ...completeSchedule(), entries: completeSchedule().entries.slice(0, 6) })).toMatchObject({ ok: false, issues: expect.arrayContaining([expect.objectContaining({ code: "seven_days_required" })]) });
  const missingName = completeSchedule({ 1: { dayOfWeek: 1, dayType: "training", sessionName: "" } });
  expect(validateWeeklyTrainingSchedule(missingName)).toMatchObject({ ok: false, issues: expect.arrayContaining([expect.objectContaining({ code: "session_name_required" })]) });
});

test("local date helpers resolve weekdays and day equality without UTC conversion", () => {
  const lateMonday = new Date(2026, 9, 19, 23, 59, 59);
  const earlyTuesday = new Date(2026, 9, 20, 0, 0, 1);
  expect(localWeekdayForDate(lateMonday)).toBe(1);
  expect(localWeekdayForDate(earlyTuesday)).toBe(2);
  const schedule = completeSchedule({ 1: { dayOfWeek: 1, dayType: "training", sessionName: "Monday", templateId: "monday" }, 2: { dayOfWeek: 2, dayType: "training", sessionName: "Tuesday", templateId: "tuesday" } });
  expect(getScheduledEntryForDate(schedule, lateMonday)).toMatchObject({ templateId: "monday" });
  expect(getScheduledEntryForDate(schedule, earlyTuesday)).toMatchObject({ templateId: "tuesday" });
  expect(isSameLocalCalendarDay(lateMonday.getTime(), lateMonday)).toBe(true);
  expect(isSameLocalCalendarDay(lateMonday.getTime(), earlyTuesday)).toBe(false);
});

test("Profile configures seven explicit days, derives frequency, and persists across reload", async ({ page }) => {
  await resetDexieDb(page);
  await page.goto("/profile", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Edit" }).click();
  const card = page.getByTestId("weekly-training-schedule-card");
  await card.getByRole("button", { name: "Configure schedule" }).click();
  for (const [index, day] of WEEKDAYS.entries()) {
    await card.getByLabel(`${day.name} assignment`).selectOption(index < 5 ? "training" : "recovery");
    if (index < 5) {
      await card.getByLabel(`${day.name} session name`).fill(["Upper A", "Lower A", "Back / Lats / Delts", "Upper B", "Lower B"][index]);
      if (index === 0) await card.getByLabel(`${day.name} focus`).fill("Chest and shoulders");
    }
  }
  await card.getByRole("button", { name: "Save schedule" }).click();
  await expect(card).toContainText("5 training days per week");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("weekly-training-schedule-card")).toContainText("MondayUpper A");
  await expect(page.getByTestId("weekly-training-schedule-card")).toContainText("Chest and shoulders");
  await expect(page.getByText("TRAINING PROFILE", { exact: true }).locator("..")).toContainText("5 (from weekly schedule)");
});

test("Profile preserves and warns about missing or archived assignments", async ({ page }) => {
  await resetDexieDb(page);
  await page.evaluate(async ({ now }) => {
    const { db } = await import("/src/db.ts");
    const module = await import("/src/domain/schedule/weeklyTrainingSchedule.ts");
    await db.templates.add({ id: "archived", name: "Old Upper", archivedAt: now, createdAt: now });
    const entries = module.WEEKDAYS.map(({ dayOfWeek }) => dayOfWeek === 1
      ? { dayOfWeek, dayType: "training" as const, sessionName: "Upper A", templateId: "missing" }
      : dayOfWeek === 2
        ? { dayOfWeek, dayType: "training" as const, sessionName: "Lower A", templateId: "archived" }
        : { dayOfWeek, dayType: "recovery" as const });
    await module.setWeeklyTrainingSchedule({ id: "weekly", active: true, entries, createdAt: now, updatedAt: now });
  }, { now: NOW });
  await page.goto("/profile", { waitUntil: "domcontentloaded" });
  const card = page.getByTestId("weekly-training-schedule-card");
  await expect(card).toContainText("Linked template is unavailable (missing)");
  await expect(card).toContainText("Linked template is archived (Old Upper)");
  expect(await page.evaluate(async () => (await import("/src/domain/schedule/weeklyTrainingSchedule.ts")).getWeeklyTrainingSchedule().then((schedule) => schedule?.entries.slice(0, 2)))).toEqual([
    { dayOfWeek: 1, dayType: "training", sessionName: "Upper A", templateId: "missing" },
    { dayOfWeek: 2, dayType: "training", sessionName: "Lower A", templateId: "archived" },
  ]);
});

test("Start recommends and starts today's active scheduled template through the existing workflow", async ({ page }) => {
  await seedStart(page, { todayType: "training", linked: true });
  const card = page.getByTestId("today-scheduled-workout");
  await expect(card).toContainText("Upper A");
  await expect(card).toContainText("Scheduled workout");
  await card.getByRole("button", { name: "Start From Template" }).click();
  await expect(page).toHaveURL(/\/gym\//);
  const session = await page.evaluate(async () => (await window.__db.sessions.orderBy("startedAt").last()));
  expect(session).toMatchObject({ templateId: "upper-a", templateName: "Upper A" });
});

test("Start displays an unlinked scheduled session and focus without requiring a template", async ({ page }) => {
  await seedStart(page, { todayType: "training" });
  const card = page.getByTestId("today-scheduled-workout");
  await expect(card).toContainText("Upper A");
  await expect(card).toContainText("Chest and shoulders");
  await expect(card.getByRole("button", { name: "Start From Template" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Start Empty Workout" })).toBeVisible();
});

test("Start shows recovery while retaining manual workout actions", async ({ page }) => {
  await seedStart(page, { todayType: "recovery" });
  await expect(page.getByTestId("today-scheduled-workout")).toContainText("Recovery Day");
  await expect(page.getByRole("button", { name: "Start Empty Workout" })).toBeVisible();
});

test("Start retains baseline behavior for absent and inactive schedules", async ({ page }) => {
  await resetDexieDb(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("today-scheduled-workout")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Start Empty Workout" })).toBeVisible();
  await seedStart(page, { active: false });
  await expect(page.getByTestId("today-scheduled-workout")).toHaveCount(0);
});

test("Start reports missing and archived scheduled templates without a start action", async ({ page }) => {
  await seedStart(page, { missing: true });
  await expect(page.getByTestId("today-scheduled-workout")).toContainText("Linked template is missing");
  await expect(page.getByTestId("today-scheduled-workout").getByRole("button", { name: "Start From Template" })).toHaveCount(0);
  await seedStart(page, { archived: true });
  await expect(page.getByTestId("today-scheduled-workout")).toContainText("Linked template is archived");
});

test("Start distinguishes completed scheduled work from unfinished work", async ({ page }) => {
  await seedStart(page, { completed: true });
  await expect(page.getByTestId("today-scheduled-workout")).toContainText("Completed today");
  await seedStart(page, { unfinished: true });
  await expect(page.getByTestId("today-scheduled-workout")).not.toContainText("Completed today");
});

test("starting a different template does not modify the persisted schedule", async ({ page }) => {
  await seedStart(page);
  const before = await page.evaluate(async () => (await import("/src/domain/schedule/weeklyTrainingSchedule.ts")).getWeeklyTrainingSchedule());
  await page.getByTestId("start-template-other").click();
  await page.getByRole("dialog").getByRole("button", { name: "Start Workout" }).click();
  const after = await page.evaluate(async () => (await import("/src/domain/schedule/weeklyTrainingSchedule.ts")).getWeeklyTrainingSchedule());
  expect(after).toEqual(before);
});

test("Coach schedule formatting uses saved names and reports focus, recovery, linked-reference warnings, inactive, and absent states", () => {
  const schedule = completeSchedule({
    1: { dayOfWeek: 1, dayType: "training", sessionName: "Upper A", focus: "Chest and shoulders", templateId: "upper" },
    2: { dayOfWeek: 2, dayType: "training", sessionName: "Lower A", templateId: "missing" },
    3: { dayOfWeek: 3, dayType: "training", sessionName: "Back Day", templateId: "archived" },
  });
  const templates = [template("upper", "Upper A Renamed"), template("archived", "Old Lower", { archivedAt: NOW })];
  const text = formatIntendedWeeklyScheduleForCoach(resolveIntendedWeeklySchedule(schedule, templates)).join("\n");
  expect(text).toContain("Intended Weekly Schedule");
  expect(text).toContain("Monday: Upper A — Chest and shoulders");
  expect(text).toContain("Tuesday: Lower A [linked template unavailable: missing]");
  expect(text).toContain("Wednesday: Back Day [linked template archived: Old Lower]");
  expect(text).toContain("Saturday: Recovery");
  expect(formatIntendedWeeklyScheduleForCoach(resolveIntendedWeeklySchedule({ ...schedule, active: false }, templates)).join("\n")).toContain("Intended Weekly Schedule (Inactive)");
  expect(formatIntendedWeeklyScheduleForCoach(resolveIntendedWeeklySchedule(null, templates)).join("\n")).toContain("Not configured.");
});

test("Coach export reads the persisted schedule without changing training metrics", async ({ page }) => {
  await seedStart(page);
  const result = await page.evaluate(async () => {
    const { buildCoachExportMetrics } = await import("/src/lib/coachExport/buildCoachExportMetrics.ts");
    const { formatCoachExportText } = await import("/src/lib/coachExport/formatCoachExportText.ts");
    const scheduleModule = await import("/src/domain/schedule/weeklyTrainingSchedule.ts");
    const schedule = await scheduleModule.getWeeklyTrainingSchedule();
    await window.__db.app_meta.delete(scheduleModule.WEEKLY_TRAINING_SCHEDULE_META_KEY);
    const before = await buildCoachExportMetrics();
    await scheduleModule.setWeeklyTrainingSchedule(schedule!);
    const metrics = await buildCoachExportMetrics();
    return {
      schedule: metrics.programmingContext?.intendedWeeklySchedule,
      text: formatCoachExportText(metrics),
      strengthUnchanged: JSON.stringify(before.strengthSignal) === JSON.stringify(metrics.strengthSignal),
      volumeUnchanged: JSON.stringify(before.weeklyVolume) === JSON.stringify(metrics.weeklyVolume),
    };
  });
  expect(result.schedule?.status).toBe("active");
  expect(result.text).toContain("Intended Weekly Schedule");
  expect(result.text).toContain("Upper A");
  expect(result.strengthUnchanged).toBe(true);
  expect(result.volumeUnchanged).toBe(true);
});
