import { expect, test, type Page } from "@playwright/test";
import { resetDexieDb } from "./helpers/dbSeed";

async function seedCoachDashboardData(page: Page) {
  await page.evaluate(async () => {
    const db = (window as any).__db;
    if (!db) throw new Error("__db missing on window.");

    const now = Date.now();
    const twoWeeks = 14 * 24 * 60 * 60 * 1000;

    await db.app_meta.put({
      key: "profile.heightIn",
      valueJson: JSON.stringify({ heightIn: 70 }),
      updatedAt: now,
    });

    await db.app_meta.put({
      key: "profile.goals.v1",
      valueJson: JSON.stringify({
        targetWeightLb: 180,
        targetBodyFatPct: 15,
        targetWaistIn: 35,
        targetVisceralFatEstimate: 7,
      }),
      updatedAt: now,
    });

    await db.bodyMetrics.bulkAdd([
      {
        id: "body-now",
        measuredAt: now,
        takenAt: now,
        createdAt: now,
        weightLb: 198,
        waistIn: 35.5,
        bodyFatPct: 16.2,
        leanMassLb: 154.2,
        visceralFatEstimate: 8.2,
        bodyWaterPct: 57.4,
      },
      {
        id: "body-prev",
        measuredAt: now - twoWeeks,
        takenAt: now - twoWeeks,
        createdAt: now - twoWeeks,
        weightLb: 201,
        waistIn: 36.1,
        bodyFatPct: 16.9,
        leanMassLb: 153.6,
        visceralFatEstimate: 8.5,
        bodyWaterPct: 56.8,
      },
    ] as any[]);

    const exerciseId = "exercise-mts-row";
    const trackId = "track-mts-row";
    const sessionId = "session-coach-dashboard";
    const templateId = "template-coach-dashboard";

    await db.exercises.put({
      id: exerciseId,
      name: "MTS Row",
      normalizedName: "mts row",
      equipmentTags: ["machine"],
      createdAt: now,
    });

    await db.tracks.put({
      id: trackId,
      exerciseId,
      trackType: "strength",
      displayName: "MTS Row",
      trackingMode: "weightedReps",
      warmupSetsDefault: 0,
      workingSetsDefault: 1,
      repMin: 8,
      repMax: 12,
      restSecondsDefault: 90,
      weightJumpDefault: 5,
      createdAt: now,
    });

    await db.templates.put({
      id: templateId,
      name: "Coach Dashboard Template",
      createdAt: now,
    });

    await db.templateItems.put({
      id: "template-item-coach-dashboard",
      templateId,
      orderIndex: 0,
      trackId,
      createdAt: now,
    });

    await db.sessions.put({
      id: sessionId,
      templateId,
      templateName: "Coach Dashboard Template",
      startedAt: now - 90 * 60 * 1000,
      endedAt: now - 60 * 60 * 1000,
      notes: [
        "MTS Row: chest-supported row reinforced Gaz's cues",
        "Barbell Row: 30-45 degree hinge angle felt super grounded",
        "Pull: strong lat stimulus",
        "MTS Row: rep 15 on final set not counted due to form breakdown",
      ].join("\n"),
    } as any);

    await db.sets.put({
      id: "set-coach-dashboard-1",
      sessionId,
      trackId,
      createdAt: now - 89 * 60 * 1000,
      completedAt: now - 88 * 60 * 1000,
      setType: "working",
      weight: 225,
      reps: 5,
    } as any);
  });
}

test.describe("Start Coach Dashboard", () => {
  test("renders the dashboard shell and keeps Today actions visible with no data", async ({ page }) => {
    await resetDexieDb(page);
    await page.evaluate(() => {
      localStorage.clear();
    });
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await expect(page.getByText("Coach Dashboard", { exact: true })).toBeVisible();
    await expect(page.getByTestId("coach-dashboard-empty")).toBeVisible();
    await expect(page.getByText("Not enough coaching data yet.")).toBeVisible();

    const todayActions = page.getByTestId("start-today-actions");
    await expect(todayActions.getByRole("button", { name: /Start Empty Workout/i })).toBeVisible();
    await expect(todayActions.getByRole("button", { name: /Paste Workout/i })).toBeVisible();
    await expect(todayActions.getByRole("button", { name: /Last Session/i })).toBeVisible();
    await expect(todayActions.getByRole("button", { name: /Progress/i })).toBeVisible();
  });

  test("renders CoachState cards from live export metrics", async ({ page }) => {
    await resetDexieDb(page);
    await seedCoachDashboardData(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const dashboard = page.getByTestId("coach-dashboard");
    await expect(dashboard).toBeVisible();

    const snapshot = page.getByTestId("coach-dashboard-snapshot");
    await expect(snapshot).toContainText("Coach Snapshot");
    await expect(snapshot).toContainText("Overall");
    await expect(snapshot).toContainText("Confidence");
    await expect(snapshot).toContainText("Narrative");
    await expect(snapshot).toContainText("Biggest Win");
    await expect(snapshot).toContainText("Biggest Risk");
    await expect(snapshot).toContainText("Today's Focus");

    const body = page.getByTestId("coach-dashboard-body");
    await expect(body).toContainText("Body");
    await expect(body).toContainText("Overall");
    await expect(body).toContainText("Weight");
    await expect(body).toContainText("Waist");
    await expect(body).toContainText("198");

    const performance = page.getByTestId("coach-dashboard-performance");
    await expect(performance).toContainText("Performance Trend");
    await expect(performance).toContainText("Movement Quality");
    await expect(performance).toContainText("Strength Signal");

    const goals = page.getByTestId("coach-dashboard-goals");
    await expect(goals).toContainText("Goal Trajectory");
    await expect(goals).toContainText("Weight");
    await expect(goals).toContainText("Waist");

    const learnings = page.getByTestId("coach-dashboard-learnings");
    await expect(learnings).toContainText("Validated Learnings");
    await expect(learnings).toContainText("Active Watch Items");
    await expect(learnings).toContainText("reinforced Gaz's cues");
    await expect(learnings).toContainText("form breakdown");

    const cardio = page.getByTestId("coach-dashboard-cardio");
    await expect(cardio).toContainText("Cardio summary not available yet.");
  });
});
