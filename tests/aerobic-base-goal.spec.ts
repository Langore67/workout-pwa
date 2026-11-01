import { expect, test, type Page } from "@playwright/test";
import { buildAerobicBaseContext } from "../src/lib/cardio/aerobicBaseContext";
import {
  MAX_AEROBIC_BASE_WEEKLY_TARGET_MINUTES,
  validateAerobicBaseWeeklyTarget,
} from "../src/lib/cardio/aerobicBaseGoal";
import { buildAerobicBaseGoalProgress } from "../src/lib/cardio/aerobicBaseGoalProgress";
import { buildCardioExportText } from "../src/lib/cardio/buildCardioExportText";
import { buildCoachProgrammingContext } from "../src/lib/coachExport/programmingContext";
import { buildCoachStateFromExportMetrics } from "../src/lib/coachState/buildCoachState";
import { buildCoachReport } from "../src/lib/coachReport/buildCoachReport";
import { formatCoachReportText } from "../src/lib/coachReport/formatCoachReportText";
import { resetDexieDb } from "./helpers/dbSeed";

const AS_OF = new Date(2026, 9, 21, 12).getTime();
const event = (id: string, at: number, zone3?: number) => ({
  sessionId: id, startedAt: at, date: "2026-10-21", name: "Walk", activityType: "walk" as const,
  confidence: "high" as const, provider: "mapmywalk",
  ...(zone3 ? { heartRateZones: { zones: [{ zone: 3, seconds: zone3 }] } } : {}),
});

test("weekly target validation is conservative", () => {
  expect(validateAerobicBaseWeeklyTarget(150)).toEqual({ valid: true, value: 150 });
  for (const value of [0, -1, 1.5, Number.NaN, MAX_AEROBIC_BASE_WEEKLY_TARGET_MINUTES + 1]) {
    expect(validateAerobicBaseWeeklyTarget(value).valid).toBe(false);
  }
});

test("goal progress is factual below, equal, and above target", () => {
  const context = buildAerobicBaseContext([
    event("current", new Date(2026, 9, 20, 8).getTime(), 92 * 60),
    event("missing", new Date(2026, 9, 21, 8).getTime()),
    event("previous", new Date(2026, 9, 14, 8).getTime(), 128 * 60),
  ], { asOf: AS_OF });
  const progress = buildAerobicBaseGoalProgress({ weeklyTargetMinutes: 150, updatedAt: AS_OF }, context)!;
  expect(progress.currentWeek).toMatchObject({ documentedMinutes: 92, remainingDocumentedMinutes: 58, missingUsableZoneEvidenceSessions: 1, status: "in_progress" });
  expect(progress.previousCompleteWeek).toMatchObject({ documentedMinutes: 128, differenceMinutes: -22, status: "complete" });
  expect(buildAerobicBaseGoalProgress(undefined, context)).toBeUndefined();

  const equal = buildAerobicBaseGoalProgress({ weeklyTargetMinutes: 92, updatedAt: AS_OF }, context)!;
  expect(equal.currentWeek.remainingDocumentedMinutes).toBe(0);
  const above = buildAerobicBaseGoalProgress({ weeklyTargetMinutes: 69, updatedAt: AS_OF }, context)!;
  expect(above.currentWeek).toMatchObject({ remainingDocumentedMinutes: 0, documentedAboveTargetMinutes: 23 });
});

test("Cardio Export and Coach reuse goal progress without adequacy language", () => {
  const events = [event("current", new Date(2026, 9, 20, 8).getTime(), 92 * 60)];
  const aerobicBase = buildAerobicBaseContext(events, { asOf: AS_OF });
  const goalProgress = buildAerobicBaseGoalProgress({ weeklyTargetMinutes: 150, updatedAt: AS_OF }, aerobicBase)!;
  const empty = { count: 0, totalDurationSeconds: 0, totalDistanceMeters: 0 };
  const summary: any = { normalizedWalks: events, recentWalks: events, dailySummaries: [], last7d: empty, last28d: empty, dataQuality: { missingDistanceCount: 0, missingDurationCount: 0, suspiciousPaceCount: 0, suspiciousPaceSessionIds: [], notesFieldCoverage: {}, unsupportedSignals: [] } };
  const exportText = buildCardioExportText(summary, { generatedAt: AS_OF, aerobicBaseContext: aerobicBase, aerobicBaseGoalProgress: goalProgress });
  expect(exportText).toContain("Weekly target: 150 min");
  expect(exportText).toContain("Remaining documented amount: 58 min");
  const goalSection = exportText.split("Aerobic Base Goal Progress")[1]?.split("Data Quality")[0] ?? "";
  expect(goalSection).not.toMatch(/on track|off track|behind|excellent|poor|should/i);

  const metrics: any = { generatedAt: AS_OF, currentPhase: "maintenance", bodyComp: { weight: {}, waist: {}, bodyFatPct: {}, leanMass: {}, bodyweightDelta7d: null, bodyweightDelta14d: null }, hydration: {}, strengthSignal: {}, phaseQuality: null, anchorLifts: [], exerciseVocabulary: [], trainingSignals: { movementQuality: [], stimulusCoverage: [], fatigueReadiness: [], nextWorkoutFocus: [], discussWithGaz: [] }, patternSummary: { movementQuality: [], stimulus: [], fatigue: [], constraints: [], progression: [] }, nextWorkoutFocus: { executionPriorities: [], progressionGuardrails: [], adjustmentTriggers: [] }, exportConfidence: {}, readinessNotes: [], dataNotes: [], aerobicBase, aerobicBaseGoalProgress: goalProgress };
  const programming = buildCoachProgrammingContext({ metrics, sessions: [], sets: [], tracks: [], exercises: [], asOf: AS_OF });
  metrics.programmingContext = programming;
  const state = buildCoachStateFromExportMetrics(metrics);
  const report = buildCoachReport({ coachState: state, metrics, generatedAt: AS_OF });
  expect(programming.aerobicBaseGoalProgress).toBe(goalProgress);
  expect(state.aerobicBaseGoalProgress).toBe(goalProgress);
  expect(report.aerobicBaseGoalProgress).toBe(goalProgress);
  expect(formatCoachReportText(report)).toContain("Difference from target: -150 min");
});

async function openProfile(page: Page) {
  await resetDexieDb(page);
  await page.goto("/profile", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("aerobic-base-goal-card")).not.toContainText("Loading aerobic-base goal");
}

test("Profile explicitly saves, updates, reloads, validates, and clears the target", async ({ page }) => {
  await openProfile(page);
  const card = page.getByTestId("aerobic-base-goal-card");
  await expect(card).toContainText("No weekly aerobic-base target set.");
  await page.getByRole("button", { name: "Edit" }).click();
  const input = card.getByLabel("Weekly aerobic-base target minutes");
  await input.fill("0");
  await card.getByRole("button", { name: "Save target" }).click();
  await expect(card).toContainText("greater than 0");
  await input.fill("150");
  await card.getByRole("button", { name: "Save target" }).click();
  await expect(card).toContainText("Weekly target: 150 min");
  await page.reload();
  await expect(card).toContainText("Weekly target: 150 min");
  await page.getByRole("button", { name: "Edit" }).click();
  await card.getByLabel("Weekly aerobic-base target minutes").fill("175");
  await card.getByRole("button", { name: "Save target" }).click();
  await expect(card).toContainText("Weekly target: 175 min");
  await card.getByRole("button", { name: "Clear target" }).click();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(card).toContainText("No weekly aerobic-base target set.");
});
