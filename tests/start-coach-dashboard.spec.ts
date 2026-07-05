import { expect, test, type Page } from "@playwright/test";
import { resetDexieDb } from "./helpers/dbSeed";
import { COACH_DASHBOARD_REFRESH_EVENT } from "../src/lib/coachDashboardEvents";

test.describe.configure({ timeout: 120000 });
test.setTimeout(120000);

async function seedCoachDashboardData(
  page: Page,
  overrides: {
    weightLb?: number;
    waistIn?: number;
    bodyFatPct?: number;
    leanMassLb?: number;
    visceralFatEstimate?: number;
    currentSessionId?: string;
    currentSessionNotes?: string[];
    includeCardio?: boolean;
    currentSessionAgeDaysAgo?: number;
  } = {}
) {
  await page.evaluate(async (args) => {
    const db = (window as any).__db;
    if (!db) throw new Error("__db missing on window.");

    const now = Date.now();
    const twoWeeks = 14 * 24 * 60 * 60 * 1000;
    const weightLb = args.weightLb ?? 198;
    const waistIn = args.waistIn ?? 35.5;
    const bodyFatPct = args.bodyFatPct ?? 16.2;
    const leanMassLb = args.leanMassLb ?? 154.2;
    const visceralFatEstimate = args.visceralFatEstimate ?? 8.2;
    const currentSessionId = args.currentSessionId ?? "session-coach-dashboard";
    const currentSessionAgeDaysAgo = args.currentSessionAgeDaysAgo ?? 0;
    const currentSessionNotes =
      args.currentSessionNotes ?? [
        "MTS Row: chest-supported row reinforced Gaz's cues",
        "Barbell Row: 30-45 degree hinge angle felt super grounded",
        "Pull: strong lat stimulus",
        "MTS Row: rep 15 on final set not counted due to form breakdown",
      ];

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
        weightLb,
        waistIn,
        bodyFatPct,
        leanMassLb,
        visceralFatEstimate,
        bodyWaterPct: 57.4,
      },
      {
        id: "body-prev",
        measuredAt: now - twoWeeks,
        takenAt: now - twoWeeks,
        createdAt: now - twoWeeks,
        weightLb: weightLb + 3,
        waistIn: waistIn + 0.6,
        bodyFatPct: bodyFatPct + 0.7,
        leanMassLb: leanMassLb - 0.6,
        visceralFatEstimate: visceralFatEstimate + 0.3,
        bodyWaterPct: 56.8,
      },
    ] as any[]);

    const exerciseId = "exercise-mts-row";
    const trackId = "track-mts-row";
    const sessionId = currentSessionId;
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
      startedAt: now - currentSessionAgeDaysAgo * 24 * 60 * 60 * 1000 - 90 * 60 * 1000,
      endedAt: now - currentSessionAgeDaysAgo * 24 * 60 * 60 * 1000 - 60 * 60 * 1000,
      notes: currentSessionNotes.join("\n"),
    } as any);

    await db.sets.put({
      id: "set-coach-dashboard-1",
      sessionId,
      trackId,
      createdAt: now - currentSessionAgeDaysAgo * 24 * 60 * 60 * 1000 - 89 * 60 * 1000,
      completedAt: now - currentSessionAgeDaysAgo * 24 * 60 * 60 * 1000 - 88 * 60 * 1000,
      setType: "working",
      weight: 225,
      reps: 5,
    } as any);

    if (args.includeCardio) {
      const cardioExerciseId = "exercise-coach-dashboard-walk";
      const cardioDistanceTrackId = "track-coach-dashboard-walk-distance";
      const cardioDurationTrackId = "track-coach-dashboard-walk-duration";
      const recentWalkId = `${currentSessionId}-walk-recent`;
      const olderWalkId = `${currentSessionId}-walk-older`;

      await db.exercises.put({
        id: cardioExerciseId,
        name: "Walk",
        normalizedName: "walk",
        equipmentTags: ["bodyweight"],
        createdAt: now - 14 * 24 * 60 * 60 * 1000,
      });

      await db.tracks.bulkPut([
        {
          id: cardioDistanceTrackId,
          exerciseId: cardioExerciseId,
          trackType: "conditioning",
          displayName: "Walk",
          trackingMode: "repsOnly",
          warmupSetsDefault: 0,
          workingSetsDefault: 1,
          repMin: 1,
          repMax: 1,
          restSecondsDefault: 0,
          weightJumpDefault: 0,
          createdAt: now - 14 * 24 * 60 * 60 * 1000,
        } as any,
        {
          id: cardioDurationTrackId,
          exerciseId: cardioExerciseId,
          trackType: "conditioning",
          displayName: "Walk",
          trackingMode: "timeSeconds",
          warmupSetsDefault: 0,
          workingSetsDefault: 1,
          repMin: 1,
          repMax: 1,
          restSecondsDefault: 0,
          weightJumpDefault: 0,
          createdAt: now - 14 * 24 * 60 * 60 * 1000,
        } as any,
      ]);

      await db.sessions.bulkPut([
        {
          id: recentWalkId,
          templateName: "Walk - MapMyWalk",
          conditioningIntent: "fitness",
          startedAt: now - 4 * 24 * 60 * 60 * 1000 - 60 * 60 * 1000,
          endedAt: now - 4 * 24 * 60 * 60 * 1000,
          notes: "Source: MapMyWalk screenshot\nRoute: River Loop",
        } as any,
        {
          id: olderWalkId,
          templateName: "Walk - Treadmill",
          conditioningIntent: "recovery",
          startedAt: now - 12 * 24 * 60 * 60 * 1000 - 45 * 60 * 1000,
          endedAt: now - 12 * 24 * 60 * 60 * 1000,
          notes: "Source: treadmill",
        } as any,
      ]);

      await db.sets.bulkPut([
        {
          id: "set-coach-dashboard-walk-distance-recent",
          sessionId: recentWalkId,
          trackId: cardioDistanceTrackId,
          createdAt: now - 4 * 24 * 60 * 60 * 1000 - 59 * 60 * 1000,
          completedAt: now - 4 * 24 * 60 * 60 * 1000 - 59 * 60 * 1000,
          setType: "working",
          distance: 2.4,
          distanceUnit: "miles",
        } as any,
        {
          id: "set-coach-dashboard-walk-duration-recent",
          sessionId: recentWalkId,
          trackId: cardioDurationTrackId,
          createdAt: now - 4 * 24 * 60 * 60 * 1000 - 58 * 60 * 1000,
          completedAt: now - 4 * 24 * 60 * 60 * 1000 - 58 * 60 * 1000,
          setType: "working",
          seconds: 50 * 60,
        } as any,
        {
          id: "set-coach-dashboard-walk-distance-older",
          sessionId: olderWalkId,
          trackId: cardioDistanceTrackId,
          createdAt: now - 12 * 24 * 60 * 60 * 1000 - 44 * 60 * 1000,
          completedAt: now - 12 * 24 * 60 * 60 * 1000 - 44 * 60 * 1000,
          setType: "working",
          distance: 1.8,
          distanceUnit: "miles",
        } as any,
        {
          id: "set-coach-dashboard-walk-duration-older",
          sessionId: olderWalkId,
          trackId: cardioDurationTrackId,
          createdAt: now - 12 * 24 * 60 * 60 * 1000 - 43 * 60 * 1000,
          completedAt: now - 12 * 24 * 60 * 60 * 1000 - 43 * 60 * 1000,
          setType: "working",
          seconds: 42 * 60,
        } as any,
      ]);
    }
  }, overrides);
}

async function setCoachDashboardTimeoutOverride(page: Page, timeoutMs: number) {
  await page.evaluate((value) => {
    localStorage.setItem("IRONFORGE_COACH_DASHBOARD_TIMEOUT_MS", String(value));
  }, timeoutMs);
}

async function waitForCoachDashboardReady(page: Page) {
  const dashboard = page.getByTestId("coach-dashboard");
  const error = page.getByTestId("coach-dashboard-error");
  const empty = page.getByTestId("coach-dashboard-empty");
  const loading = page.getByTestId("coach-dashboard-loading");

  await Promise.race([
    dashboard.waitFor({ state: "visible", timeout: 15000 }).catch(() => null),
    error.waitFor({ state: "visible", timeout: 15000 }).catch(() => null),
    empty.waitFor({ state: "visible", timeout: 15000 }).catch(() => null),
  ]);
  await expect(loading).toBeHidden({ timeout: 15000 });
}

async function waitForCoachDashboardRefreshReason(page: Page) {
  return page.evaluate((eventName) => {
    return new Promise<string>((resolve) => {
      window.addEventListener(
        eventName,
        (event: Event) => {
          const detail = (event as CustomEvent<{ reason?: string }>).detail;
          resolve(detail?.reason ?? "");
        },
        { once: true }
      );
    });
  }, COACH_DASHBOARD_REFRESH_EVENT);
}

test.describe("Start Coach Dashboard", () => {
  test("renders the dashboard shell and keeps Today actions visible with no data", async ({ page }) => {
    await resetDexieDb(page);
    await page.evaluate(() => {
      localStorage.clear();
    });
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await waitForCoachDashboardReady(page);
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
    await seedCoachDashboardData(page, { includeCardio: true });
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await waitForCoachDashboardReady(page);
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
    await expect(body).toContainText("Overall confidence");
    await expect(body).toContainText("Weight trend confidence");
    await expect(body).toContainText("Waist trend confidence");
    await expect(body).toContainText("Lean mass confidence");
    await expect(body).toContainText("Body fat confidence");
    await expect(body).toContainText("Hydration confidence");
    await expect(body).toContainText("High confidence");
    await expect(body).toContainText("Confidence reflects how much recent data is available");
    await expect(body).toContainText("198");

    const performance = page.getByTestId("coach-dashboard-performance");
    await expect(performance).toContainText("Performance Trend");
    await expect(performance).toContainText("Movement Quality");
    await expect(performance).toContainText("Strength Signal");
    await expect(performance).toContainText("historical anchor");

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
    await expect(cardio).toContainText("Cardio Status");
    await expect(cardio).toContainText("Last 7 Days");
    await expect(cardio).toContainText("Last 28 Days");
    await expect(cardio).toContainText("Recent Walk/Cardio");
    await expect(cardio).toContainText("Cardio Note");
    await expect(cardio).toContainText("Walk - MapMyWalk");
    await expect(cardio).toContainText("2 walks");
  });

  test("labels stale performance anchors as historical context", async ({ page }) => {
    await resetDexieDb(page);
    await seedCoachDashboardData(page, {
      currentSessionId: "session-coach-dashboard-old-anchor",
      currentSessionAgeDaysAgo: 60,
    });
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await waitForCoachDashboardReady(page);
    const performance = page.getByTestId("coach-dashboard-performance");
    await expect(performance).toContainText("Anchor");
    await expect(performance).toContainText("historical anchor");
  });

  test("refreshes the dashboard after body data changes without reload", async ({ page }) => {
    await resetDexieDb(page);
    await seedCoachDashboardData(page, { weightLb: 200, currentSessionId: "session-coach-dashboard-refresh" });
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await waitForCoachDashboardReady(page);
    const body = page.getByTestId("coach-dashboard-body");
    await expect(body).toContainText("200");
    await expect(body).not.toContainText("194");

    await page.evaluate(async () => {
      const db = (window as any).__db;
      if (!db) throw new Error("__db missing on window.");

      const now = Date.now();
      await db.bodyMetrics.where("id").equals("body-now").modify({
        weightLb: 194,
        waistIn: 34.9,
      });
      await db.bodyMetrics.where("id").equals("body-prev").modify({
        weightLb: 197,
        waistIn: 35.5,
      });
      await db.sessions.where("id").equals("session-coach-dashboard-refresh").modify({
        notes: [
          "MTS Row: chest-supported row reinforced Gaz's cues",
          "Barbell Row: 30-45 degree hinge angle felt super grounded",
          "Pull: strong lat stimulus",
          `Updated at ${now}`,
        ].join("\n"),
      });

      window.dispatchEvent(new CustomEvent("ironforge:coach-dashboard-refresh"));
    });

    await expect(body).toContainText("194");
    await expect(body).not.toContainText("200");
    await expect(page).toHaveURL(/\/$/);
  });

  test("refreshes cardio content after a walk mutation without reload", async ({ page }) => {
    await resetDexieDb(page);
    await seedCoachDashboardData(page, {
      includeCardio: true,
      currentSessionId: "session-coach-dashboard-cardio-refresh",
    });
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await waitForCoachDashboardReady(page);
    const cardio = page.getByTestId("coach-dashboard-cardio");
    await expect(cardio).toContainText("2 walks");

    await page.evaluate(async () => {
      const db = (window as any).__db;
      if (!db) throw new Error("__db missing on window.");

      const now = Date.now();
      const sessionId = "session-coach-dashboard-cardio-refresh-walk-new";
      const walkExercise = await db.exercises.where("normalizedName").equals("walk").first();
      if (!walkExercise) throw new Error("walk exercise missing on window.");

      const walkTracks = await db.tracks.where("exerciseId").equals(walkExercise.id).toArray();
      const distanceTrack = walkTracks.find((track: any) => track.trackingMode === "repsOnly") ?? walkTracks[0];
      const durationTrack = walkTracks.find((track: any) => track.trackingMode === "timeSeconds") ?? walkTracks[0];
      if (!distanceTrack || !durationTrack) throw new Error("walk tracks missing on window.");

      await db.sessions.put({
        id: sessionId,
        templateName: "Walk - MapMyWalk",
        conditioningIntent: "fitness",
        startedAt: now - 90 * 60 * 1000,
        endedAt: now - 40 * 60 * 1000,
        notes: "Source: MapMyWalk screenshot\nRoute: Added in test",
      } as any);

      await db.sets.bulkPut([
        {
          id: "set-coach-dashboard-cardio-refresh-distance",
          sessionId,
          trackId: distanceTrack.id,
          createdAt: now - 89 * 60 * 1000,
          completedAt: now - 89 * 60 * 1000,
          setType: "working",
          distance: 2.1,
          distanceUnit: "miles",
        } as any,
        {
          id: "set-coach-dashboard-cardio-refresh-duration",
          sessionId,
          trackId: durationTrack.id,
          createdAt: now - 88 * 60 * 1000,
          completedAt: now - 88 * 60 * 1000,
          setType: "working",
          seconds: 48 * 60,
        } as any,
      ]);

      window.dispatchEvent(new CustomEvent("ironforge:coach-dashboard-refresh"));
    });

    await expect(cardio).toContainText("3 walks");
  });

  test("falls back to unavailable when the dashboard build stalls", async ({ page }) => {
    await resetDexieDb(page);
    await page.evaluate(() => {
      localStorage.clear();
    });
    await setCoachDashboardTimeoutOverride(page, 1);
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await expect(page.getByTestId("coach-dashboard-error")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("coach-dashboard-loading")).toBeHidden({ timeout: 10000 });
    await expect(page.getByText("Coach dashboard unavailable.", { exact: false })).toBeVisible();
  });

  test("dispatches a refresh after body metric add and delete mutations", async ({ page }) => {
    await resetDexieDb(page);
    await page.goto("/body", { waitUntil: "domcontentloaded" });

    const addReasonPromise = waitForCoachDashboardRefreshReason(page);
    const addCard = page.locator("div.card").filter({ hasText: "Add entry" }).first();
    await addCard.locator('input[placeholder="200"]').fill("204");
    await addCard.getByRole("button", { name: /^Save$/ }).click();
    await expect(addReasonPromise).resolves.toBe("body:add");

    const deleteReasonPromise = waitForCoachDashboardRefreshReason(page);
    page.once("dialog", async (dialog) => {
      await dialog.accept();
    });
    await expect(page.getByTitle("Delete entry").first()).toBeVisible();
    await page.getByTitle("Delete entry").first().click();
    await expect(deleteReasonPromise).resolves.toBe("body:delete");
  });

  test("dispatches a refresh after a session edit mutation", async ({ page }) => {
    await resetDexieDb(page);
    await page.evaluate(async () => {
      const db = (window as any).__db;
      if (!db) throw new Error("__db missing on window.");

      const now = Date.now();
      await db.sessions.add({
        id: "session-edit-refresh",
        startedAt: now - 30 * 60 * 1000,
        endedAt: now - 20 * 60 * 1000,
        templateName: "Ad-hoc",
        conditioningIntent: undefined,
      });
    });

    await page.goto("/session/session-edit-refresh", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("session-detail")).toBeVisible({ timeout: 15000 });

    const refreshReasonPromise = waitForCoachDashboardRefreshReason(page);
    await page.getByTestId("session-conditioning-intent").selectOption("fitness");
    await expect(refreshReasonPromise).resolves.toBe("session:update");
  });

  test("dispatches a refresh after starting an empty workout from Start", async ({ page }) => {
    await resetDexieDb(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const refreshReasonPromise = waitForCoachDashboardRefreshReason(page);
    await page.getByRole("button", { name: /Start Empty Workout/i }).click();
    await expect(refreshReasonPromise).resolves.toBe("session:add");
    await expect(page).toHaveURL(/\/gym\//);
  });
});
