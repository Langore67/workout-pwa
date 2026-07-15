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
    includePreviousBodyEntry?: boolean;
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
    const includePreviousBodyEntry = args.includePreviousBodyEntry ?? true;
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

    await db.bodyMetrics.bulkAdd(
      [
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
        includePreviousBodyEntry
          ? {
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
            }
          : null,
      ].filter(Boolean) as any[]
    );

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

async function seedCoachWeeklyVolumeData(page: Page) {
  await page.evaluate(async () => {
    const db = (window as any).__db;
    if (!db) throw new Error("__db missing on window.");

    const now = Date.now();
    const sessionId = "session-weekly-volume";

    await db.app_meta.put({
      key: "profile.heightIn",
      valueJson: JSON.stringify({ heightIn: 70 }),
      updatedAt: now,
    });

    const exercises = [
      { id: "exercise-bench", name: "Bench Press", trackId: "track-bench", trackType: "strength", displayName: "Bench Press" },
      { id: "exercise-pulldown", name: "Lat Pulldown", trackId: "track-pulldown", trackType: "strength", displayName: "Lat Pulldown" },
      { id: "exercise-rear", name: "Reverse Pec Deck", trackId: "track-rear", trackType: "strength", displayName: "Reverse Pec Deck" },
      { id: "exercise-bridge", name: "Glute Bridge", trackId: "track-bridge", trackType: "strength", displayName: "Glute Bridge" },
      { id: "exercise-wall", name: "Y-Wall Slide", trackId: "track-wall", trackType: "corrective", displayName: "Y-Wall Slide" },
    ];

    for (const exercise of exercises) {
      await db.exercises.put({
        id: exercise.id,
        name: exercise.name,
        normalizedName: exercise.name.toLowerCase(),
        equipmentTags: ["bodyweight"],
        createdAt: now,
      });

      await db.tracks.put({
        id: exercise.trackId,
        exerciseId: exercise.id,
        trackType: exercise.trackType,
        displayName: exercise.displayName,
        trackingMode: exercise.trackType === "corrective" ? "checkbox" : "weightedReps",
        warmupSetsDefault: 0,
        workingSetsDefault: 1,
        repMin: 1,
        repMax: 15,
        restSecondsDefault: 60,
        weightJumpDefault: 5,
        createdAt: now,
      } as any);
    }

    await db.sessions.put({
      id: sessionId,
      templateName: "Weekly Volume",
      startedAt: now - 90 * 60 * 1000,
      endedAt: now - 30 * 60 * 1000,
      notes: "Seeded weekly volume test",
    } as any);

    await db.sets.bulkPut([
      { id: "set-bench-1", sessionId, trackId: "track-bench", createdAt: now - 89 * 60 * 1000, completedAt: now - 89 * 60 * 1000, setType: "working", reps: 8 } as any,
      { id: "set-bench-2", sessionId, trackId: "track-bench", createdAt: now - 88 * 60 * 1000, completedAt: now - 88 * 60 * 1000, setType: "working", reps: 8 } as any,
      { id: "set-bench-3", sessionId, trackId: "track-bench", createdAt: now - 87 * 60 * 1000, completedAt: now - 87 * 60 * 1000, setType: "working", reps: 8 } as any,
      { id: "set-pulldown-1", sessionId, trackId: "track-pulldown", createdAt: now - 86 * 60 * 1000, completedAt: now - 86 * 60 * 1000, setType: "working", reps: 10 } as any,
      { id: "set-pulldown-2", sessionId, trackId: "track-pulldown", createdAt: now - 85 * 60 * 1000, completedAt: now - 85 * 60 * 1000, setType: "working", reps: 10 } as any,
      { id: "set-pulldown-3", sessionId, trackId: "track-pulldown", createdAt: now - 84 * 60 * 1000, completedAt: now - 84 * 60 * 1000, setType: "working", reps: 10 } as any,
      { id: "set-pulldown-4", sessionId, trackId: "track-pulldown", createdAt: now - 83 * 60 * 1000, completedAt: now - 83 * 60 * 1000, setType: "working", reps: 10 } as any,
      { id: "set-rear-1", sessionId, trackId: "track-rear", createdAt: now - 82 * 60 * 1000, completedAt: now - 82 * 60 * 1000, setType: "working", reps: 12 } as any,
      { id: "set-rear-2", sessionId, trackId: "track-rear", createdAt: now - 81 * 60 * 1000, completedAt: now - 81 * 60 * 1000, setType: "working", reps: 12 } as any,
      { id: "set-bridge-1", sessionId, trackId: "track-bridge", createdAt: now - 80 * 60 * 1000, completedAt: now - 80 * 60 * 1000, setType: "working", reps: 12 } as any,
      { id: "set-bridge-2", sessionId, trackId: "track-bridge", createdAt: now - 79 * 60 * 1000, completedAt: now - 79 * 60 * 1000, setType: "working", reps: 12 } as any,
      { id: "set-wall-1", sessionId, trackId: "track-wall", createdAt: now - 78 * 60 * 1000, completedAt: now - 78 * 60 * 1000, setType: "working", reps: 12 } as any,
      { id: "set-wall-2", sessionId, trackId: "track-wall", createdAt: now - 77 * 60 * 1000, completedAt: now - 77 * 60 * 1000, setType: "working", reps: 12 } as any,
    ]);
  });
}

async function seedCoachAnchorTransitionData(page: Page) {
  await page.evaluate(async () => {
    const db = (window as any).__db;
    if (!db) throw new Error("__db missing on window.");

    const { setCurrentPhase, setStrengthSignalConfig } = await import("/src/config/appConfig.ts");
    const now = Date.now();
    const oldAnchorSessionId = "session-anchor-old-pull";
    const recentMovementSessionId = "session-anchor-current-pull";
    const oldAnchorExerciseId = "exercise-anchor-lat-pulldown";
    const currentExerciseId = "exercise-anchor-assisted-pull-up";
    const oldAnchorTrackId = "track-anchor-lat-pulldown";
    const currentTrackId = "track-anchor-assisted-pull-up";

    await setCurrentPhase("cut");
    await setStrengthSignalConfig({
      activeVersion: "v2",
      strengthSignalV2Config: {
        phases: {
          cut: {
            pull: oldAnchorExerciseId,
          },
        },
      },
    });

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

    await db.bodyMetrics.put({
      id: "body-anchor-now",
      measuredAt: now,
      takenAt: now,
      createdAt: now,
      weightLb: 198,
      waistIn: 35.5,
      bodyFatPct: 16.2,
      leanMassLb: 154.2,
      visceralFatEstimate: 8.2,
      bodyWaterPct: 57.4,
    } as any);

    await db.exercises.bulkPut([
      {
        id: oldAnchorExerciseId,
        name: "Lat Pulldown",
        normalizedName: "lat pulldown",
        equipmentTags: ["machine"],
        anchorEligibility: "conditional",
        anchorSubtypes: ["verticalPull"],
        createdAt: now - 60 * 24 * 60 * 60 * 1000,
      },
      {
        id: currentExerciseId,
        name: "Assisted Pull Up",
        normalizedName: "assisted pull up",
        equipmentTags: ["bodyweight"],
        anchorEligibility: "conditional",
        anchorSubtypes: ["verticalPull"],
        createdAt: now,
      },
    ] as any[]);

    await db.tracks.bulkPut([
      {
        id: oldAnchorTrackId,
        exerciseId: oldAnchorExerciseId,
        trackType: "strength",
        displayName: "Lat Pulldown",
        trackingMode: "weightedReps",
        warmupSetsDefault: 0,
        workingSetsDefault: 1,
        repMin: 6,
        repMax: 12,
        restSecondsDefault: 90,
        weightJumpDefault: 5,
        createdAt: now - 60 * 24 * 60 * 60 * 1000,
      },
      {
        id: currentTrackId,
        exerciseId: currentExerciseId,
        trackType: "strength",
        displayName: "Assisted Pull Up",
        trackingMode: "weightedReps",
        warmupSetsDefault: 0,
        workingSetsDefault: 1,
        repMin: 6,
        repMax: 12,
        restSecondsDefault: 90,
        weightJumpDefault: 5,
        createdAt: now,
      },
    ] as any[]);

    await db.sessions.bulkPut([
      {
        id: oldAnchorSessionId,
        templateName: "Pull A",
        startedAt: now - 59 * 24 * 60 * 60 * 1000 - 90 * 60 * 1000,
        endedAt: now - 59 * 24 * 60 * 60 * 1000 - 60 * 60 * 1000,
      } as any,
      {
        id: recentMovementSessionId,
        templateName: "Pull B",
        startedAt: now - 2 * 24 * 60 * 60 * 1000 - 90 * 60 * 1000,
        endedAt: now - 2 * 24 * 60 * 60 * 1000 - 60 * 60 * 1000,
      } as any,
    ]);

    await db.sets.bulkPut([
      {
        id: "set-old-anchor",
        sessionId: oldAnchorSessionId,
        trackId: oldAnchorTrackId,
        createdAt: now - 59 * 24 * 60 * 60 * 1000 - 88 * 60 * 1000,
        completedAt: now - 59 * 24 * 60 * 60 * 1000 - 88 * 60 * 1000,
        setType: "working",
        weight: 140,
        reps: 10,
      } as any,
      {
        id: "set-recent-current",
        sessionId: recentMovementSessionId,
        trackId: currentTrackId,
        createdAt: now - 2 * 24 * 60 * 60 * 1000 - 88 * 60 * 1000,
        completedAt: now - 2 * 24 * 60 * 60 * 1000 - 88 * 60 * 1000,
        setType: "working",
        weight: 35,
        reps: 8,
      } as any,
    ]);

    window.dispatchEvent(new CustomEvent("ironforge:coach-dashboard-refresh", { detail: { reason: "anchor:test" } }));
  });
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
    await expect(snapshot).toContainText("Status");
    await expect(snapshot).toContainText("Confidence");
    await expect(snapshot).toContainText("Why");
    await expect(snapshot).toContainText("Today");

    const body = page.getByTestId("coach-dashboard-body");
    await expect(body).toContainText("Body Values");
    await expect(body).toContainText("Body Confidence");
    await expect(body).toContainText("Overall confidence");
    await expect(body).toContainText("Weight trend confidence");
    await expect(body).toContainText("Waist trend confidence");
    await expect(body).toContainText("Lean mass confidence");
    await expect(body).toContainText("Body fat confidence");
    await expect(body).toContainText("Hydration confidence");
    await expect(body).toContainText("High confidence");
    await expect(body).toContainText("Confidence reflects how much recent data is available");
    await expect(body).toContainText("Coach trends use rolling 5-entry averages except waist");
    await expect(body).toContainText("Latest is today's/raw reading");
    await expect(body).toContainText("Weight");
    await expect(body).toContainText("latest");
    await expect(body).toContainText("coach avg");
    await expect(body).toContainText("Waist");
    await expect(body).toContainText("latest/manual");
    await expect(body).toContainText("Body Fat");
    await expect(body).toContainText("Lean Mass");

      const performance = page.getByTestId("coach-dashboard-performance");
      await expect(performance).toContainText("Performance Trend");
      await expect(performance).toContainText("Strength Signal");
      await expect(performance).toContainText("Date unavailable");
      await expect(performance).toContainText("Anchor recency could not be confirmed.");
      await expect(performance).toContainText("Movement Quality");
      await expect(performance).toContainText("Performance Read");

      const volume = page.getByTestId("coach-dashboard-volume");
      await expect(volume).toContainText("Weekly Volume");
      await expect(volume).toContainText("Back / Pull");
      await expect(volume).toContainText("effective sets");
      await expect(volume).toContainText("Scapular control work");
      await expect(volume).toContainText("Balance");

      const goals = page.getByTestId("coach-dashboard-goals");
      await expect(goals).toContainText("Goal Trajectory");
      await expect(goals).toContainText("Goal Read");
    await expect(goals).toContainText("Weight");
    await expect(goals).toContainText("Waist");

    const learnings = page.getByTestId("coach-dashboard-learnings");
    await expect(learnings).toContainText("What's Working");
    await expect(learnings).toContainText("Watch Now");
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

  test("renders the weekly volume card from recent strength sessions", async ({ page }) => {
    await resetDexieDb(page);
    await seedCoachWeeklyVolumeData(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await waitForCoachDashboardReady(page);
    const volume = page.getByTestId("coach-dashboard-volume");
    await expect(volume).toBeVisible();
    await expect(volume).toContainText("Weekly Volume");
    await expect(volume).toContainText("Chest / Push");
    await expect(volume).toContainText("Back / Pull");
    await expect(volume).toContainText("Shoulders / Scapula");
    await expect(volume).toContainText("Lower / Glutes");
    await expect(volume).toContainText("effective sets");
    await expect(volume).toContainText("control exposure");
    await expect(volume).toContainText("Balance");

    const pushPull = volume.getByTestId("coach-volume-balance-push_pull");
    const gluteBalance = volume.getByTestId("coach-volume-balance-glute_max_med_min");

    await expect(pushPull).toContainText("Push / Pull");
    await expect(pushPull).toContainText(/Balanced|Push Behind|Pull Behind|Strong Push Bias|Strong Pull Bias/);
    await expect(pushPull).not.toHaveAttribute("open", "");
    await pushPull.locator("summary").click();
    await expect(pushPull).toHaveAttribute("open", "");
    await expect(pushPull.getByText("Current:")).toBeVisible();
    await expect(pushPull.getByText("What it means:")).toBeVisible();
    await expect(pushPull.getByText("What to change:")).toBeVisible();
    await expect(pushPull).toContainText("×");
    await expect(pushPull).not.toContainText(/ratio\s+\d/i);
    await pushPull.locator("summary").click();
    await expect(pushPull).not.toHaveAttribute("open", "");

    await expect(gluteBalance).toContainText("Glute Max / Med-Min");
    await expect(gluteBalance).not.toHaveAttribute("open", "");
    await gluteBalance.locator("summary").click();
    await expect(gluteBalance).toHaveAttribute("open", "");
    await expect(gluteBalance.getByText("Current:")).toBeVisible();
    await expect(gluteBalance.getByText("What it means:")).toBeVisible();
    await expect(gluteBalance.getByText("What to change:")).toBeVisible();
    await expect(gluteBalance).toContainText("no recent hip-stability work was recorded");
    await gluteBalance.locator("summary").click();
    await expect(gluteBalance).not.toHaveAttribute("open", "");
  });

  test("renders a clean single-entry body card without duplicate coach average copy", async ({ page }) => {
    await resetDexieDb(page);
    await seedCoachDashboardData(page, {
      includePreviousBodyEntry: false,
      currentSessionId: "session-coach-dashboard-single-body",
    });
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await waitForCoachDashboardReady(page);
    const body = page.getByTestId("coach-dashboard-body");
    await expect(body).toContainText("Body Values");
    await expect(body).toContainText("Weight");
    await expect(body).toContainText("latest/manual");
    await expect(body).toContainText("Body Confidence");
    await expect(body).not.toContainText("coach avg · latest");
    await expect(body).not.toContainText("latest · coach avg");
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
    await expect(performance).toContainText("Date unavailable");
    await expect(performance).toContainText("Anchor recency could not be confirmed.");
  });

  test("shows historical anchors alongside the current movement family", async ({ page }) => {
    await resetDexieDb(page);
    await seedCoachAnchorTransitionData(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await waitForCoachDashboardReady(page);
    const performance = page.getByTestId("coach-dashboard-performance");
    await expect(performance).toContainText("Performance Anchor");
    await expect(performance).toContainText("Vertical Pull");
    await expect(performance).toContainText("Stale anchor");
    await expect(performance).toContainText("Lat Pulldown");
    await expect(performance).toContainText("Current Movement");
    await expect(performance).toContainText("Assisted Pull Up");
    await expect(performance).toContainText("Same movement family");
    await expect(performance).not.toContainText("replaced");
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
