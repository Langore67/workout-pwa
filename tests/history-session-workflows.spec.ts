import { expect, test, type Page } from "@playwright/test";
import { resetDexieDb } from "./helpers/dbSeed";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173/";

async function goto(page: Page, path: string) {
  await page.goto(new URL(path, BASE_URL).toString(), { waitUntil: "domcontentloaded" });
}

function getSection(text: string, heading: string, nextHeading?: string) {
  const start = text.indexOf(heading);
  expect(start).toBeGreaterThanOrEqual(0);
  const fromStart = text.slice(start);
  if (!nextHeading) return fromStart;
  const end = fromStart.indexOf(nextHeading);
  return end >= 0 ? fromStart.slice(0, end) : fromStart;
}

test.describe("history and ad hoc session workflows", () => {
  test("session detail copies the completed session snapshot", async ({ page }) => {
    await page.addInitScript(() => {
      const clipboardState = { text: "" };
      Object.defineProperty(window, "__copiedText", {
        value: clipboardState,
        configurable: true,
      });
      Object.defineProperty(navigator, "clipboard", {
        value: {
          writeText: async (text: string) => {
            clipboardState.text = text;
          },
        },
        configurable: true,
      });
    });

    await goto(page, "/");
    await resetDexieDb(page);

    const seeded = await page.evaluate(async () => {
      const db = (window as any).__db;
      if (!db) throw new Error("__db missing on window.");

      const now = Date.now();
      const uuid = () => crypto.randomUUID();

      const exerciseId = uuid();
      const trackId = uuid();
      const sessionId = uuid();
      const sessionItemId = uuid();

      await db.exercises.add({
        id: exerciseId,
        name: "Barbell RDL",
        normalizedName: "barbell rdl",
        equipmentTags: ["barbell"],
        createdAt: now - 10_000,
      });

      await db.tracks.add({
        id: trackId,
        exerciseId,
        trackType: "strength",
        displayName: "Barbell RDL",
        trackingMode: "weightedReps",
        warmupSetsDefault: 0,
        workingSetsDefault: 1,
        repMin: 6,
        repMax: 8,
        restSecondsDefault: 180,
        weightJumpDefault: 5,
        createdAt: now - 9_000,
      });

      await db.sessions.add({
        id: sessionId,
        templateName: "Lower B",
        startedAt: now - 30 * 60 * 1000,
        endedAt: now - 5 * 60 * 1000,
        notes: "Coach summary line 1\nCoach summary line 2",
      });

      await db.sessionItems.add({
        id: sessionItemId,
        sessionId,
        trackId,
        orderIndex: 0,
        createdAt: now - 29 * 60 * 1000,
      });

      await db.sets.add({
        id: uuid(),
        sessionId,
        trackId,
        createdAt: now - 28 * 60 * 1000,
        setType: "working",
        weight: 155,
        reps: 6,
        rir: 2,
        completedAt: now - 28 * 60 * 1000 + 5_000,
      });

      return { sessionId };
    });

    await goto(page, `/session/${seeded.sessionId}`);
    await expect(page.getByTestId("session-detail")).toBeVisible({ timeout: 15000 });
    await page.getByTestId("copy-session-snapshot").click();
    await expect(page.getByTestId("copy-session-snapshot")).toHaveText("Copied");

    const copiedText = await page.evaluate(() => (window as any).__copiedText.text);
    expect(copiedText).toContain("Session Snapshot");
    expect(copiedText).toContain("Session: Lower B");
    expect(copiedText).toContain("Readiness:");
    expect(copiedText).toContain("Focus Flags");
    expect(copiedText).toContain("Session Notes");
    expect(copiedText).toContain("Barbell RDL");
    expect(copiedText).toContain("Current Recommendation");
  });

  test("deleting a completed workout from History removes it and cleans up related rows", async ({ page }) => {
    await goto(page, "/");
    await resetDexieDb(page);

    const seeded = await page.evaluate(async () => {
      const db = (window as any).__db;
      if (!db) throw new Error("__db missing on window.");

      const now = Date.now();
      const uuid = () => crypto.randomUUID();

      const exerciseId = uuid();
      const trackId = uuid();
      const sessionId = uuid();
      const sessionItemId = uuid();

      await db.exercises.add({
        id: exerciseId,
        name: "Bench Press",
        equipmentTags: ["barbell"],
        createdAt: now - 10_000,
      });

      await db.tracks.add({
        id: trackId,
        exerciseId,
        trackType: "strength",
        displayName: "Bench Press",
        trackingMode: "weightedReps",
        warmupSetsDefault: 0,
        workingSetsDefault: 1,
        repMin: 5,
        repMax: 8,
        restSecondsDefault: 180,
        weightJumpDefault: 5,
        createdAt: now - 9_000,
      });

      await db.sessions.add({
        id: sessionId,
        templateName: "Upper A",
        startedAt: now - 30 * 60 * 1000,
        endedAt: now - 5 * 60 * 1000,
      });

      await db.sessionItems.add({
        id: sessionItemId,
        sessionId,
        trackId,
        orderIndex: 0,
        createdAt: now - 29 * 60 * 1000,
      });

      await db.sets.add({
        id: uuid(),
        sessionId,
        trackId,
        createdAt: now - 28 * 60 * 1000,
        setType: "working",
        weight: 135,
        reps: 8,
        completedAt: now - 28 * 60 * 1000 + 5_000,
      });

      return { sessionId };
    });

    await goto(page, "/history");

    const card = page.getByTestId(`history-completed-card:${seeded.sessionId}`);
    await expect(card).toBeVisible({ timeout: 15000 });

    page.once("dialog", (dialog) => dialog.accept());
    await card.getByRole("button", { name: /open session actions/i }).click();
    await page.getByRole("menuitem", { name: /delete/i }).click();

    await expect(card).toHaveCount(0);
    await expect(page.getByTestId("history-completed-count")).toHaveText("0");

    const dbState = await page.evaluate(async ({ sessionId }) => {
      const db = (window as any).__db;
      if (!db) throw new Error("__db missing on window.");

      return {
        session: await db.sessions.get(sessionId),
        setCount: await db.sets.where("sessionId").equals(sessionId).count(),
        sessionItemCount: await db.sessionItems.where("sessionId").equals(sessionId).count(),
      };
    }, seeded);

    expect(dbState.session).toBeUndefined();
    expect(dbState.setCount).toBe(0);
    expect(dbState.sessionItemCount).toBe(0);
  });

  test("leaving an empty ad hoc workout does not leave a stale in-progress session", async ({ page }) => {
    await goto(page, "/");
    await resetDexieDb(page);

    await goto(page, "/");
    await page.getByRole("button", { name: /start empty workout/i }).click();
    await expect(page).toHaveURL(/\/gym\/[^/]+$/);
    await expect(page.getByText("Gym Mode")).toBeVisible({ timeout: 15000 });

    const sessionId = page.url().split("/gym/")[1];
    expect(sessionId).toBeTruthy();

    await page.getByRole("button", { name: /back to history/i }).first().click();
    await expect(page).toHaveURL(/\/history$/);

    await expect(page.getByTestId(`history-inprogress-card:${sessionId}`)).toHaveCount(0);
    await expect(page.getByTestId("history-inprogress-count")).toHaveText("0");
    await expect(page.getByText("Ad-hoc")).toHaveCount(0);
  });

  test("history and session detail use the same effective-load total lifted math", async ({ page }) => {
    await goto(page, "/");
    await resetDexieDb(page);

    const seeded = await page.evaluate(async () => {
      const db = (window as any).__db;
      if (!db) throw new Error("__db missing on window.");

      const now = Date.now();
      const uuid = () => crypto.randomUUID();

      const exerciseId = uuid();
      const trackId = uuid();
      const sessionId = uuid();

      await db.exercises.add({
        id: exerciseId,
        name: "Assisted Pull Up",
        normalizedName: "assisted pull up",
        category: "Bodyweight",
        equipment: "Bodyweight",
        equipmentTags: [],
        createdAt: now - 20_000,
      });

      await db.tracks.add({
        id: trackId,
        exerciseId,
        trackType: "strength",
        displayName: "Assisted Pull Up",
        trackingMode: "weightedReps",
        warmupSetsDefault: 0,
        workingSetsDefault: 1,
        repMin: 6,
        repMax: 10,
        restSecondsDefault: 120,
        weightJumpDefault: 5,
        createdAt: now - 19_000,
      });

      await db.bodyMetrics.add({
        id: uuid(),
        measuredAt: now - 60_000,
        weightLb: 180,
        createdAt: now - 60_000,
      });

      await db.sessions.add({
        id: sessionId,
        templateName: "Pull Day",
        startedAt: now - 30 * 60 * 1000,
        endedAt: now - 10 * 60 * 1000,
      });

      await db.sets.add({
        id: uuid(),
        sessionId,
        trackId,
        createdAt: now - 25 * 60 * 1000,
        setType: "working",
        weight: 30,
        reps: 10,
        completedAt: now - 25 * 60 * 1000 + 5_000,
      });

      return { sessionId };
    });

    await goto(page, "/history");
    await expect(page.getByTestId(`history-completed-card:${seeded.sessionId}`)).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId(`history-total:${seeded.sessionId}`)).toContainText("2100 lb");

    await goto(page, `/session/${seeded.sessionId}`);
    await expect(page.getByTestId("session-detail")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("session-total-lifted")).toContainText("2100 lb");
  });

  test("history to coach export copies the structured coaching loop without workout prediction", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const clipboardState = { text: "" };
      Object.defineProperty(window, "__copiedText", {
        value: clipboardState,
        configurable: true,
      });
      Object.defineProperty(navigator, "clipboard", {
        value: {
          writeText: async (text: string) => {
            clipboardState.text = text;
          },
        },
        configurable: true,
      });
    });

    await goto(page, "/");
    await resetDexieDb(page);

    const seeded = await page.evaluate(async () => {
      const db = (window as any).__db;
      if (!db) throw new Error("__db missing on window.");

      const now = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;
      const uuid = () => crypto.randomUUID();

      const exerciseRows = [
        { name: "Lat Pulldown", category: "Machine", equipment: "Cable" },
        { name: "3-Point DB Row", category: "Dumbbell", equipment: "Dumbbell" },
        { name: "Bradford Press", category: "Barbell", equipment: "Barbell" },
        { name: "Lateral Raise", category: "Dumbbell", equipment: "Dumbbell" },
      ];

      const tracks = [];
      for (const [index, exercise] of exerciseRows.entries()) {
        const exerciseId = uuid();
        const trackId = uuid();

        await db.exercises.add({
          id: exerciseId,
          name: exercise.name,
          normalizedName: exercise.name.toLowerCase(),
          category: exercise.category,
          equipment: exercise.equipment,
          equipmentTags: [exercise.category.toLowerCase()],
          createdAt: now - (40 + index) * dayMs,
        });

        await db.tracks.add({
          id: trackId,
          exerciseId,
          trackType: "strength",
          displayName: exercise.name,
          trackingMode: "weightedReps",
          warmupSetsDefault: 0,
          workingSetsDefault: 1,
          repMin: 6,
          repMax: 12,
          restSecondsDefault: 120,
          weightJumpDefault: 5,
          createdAt: now - (40 + index) * dayMs,
        });

        tracks.push({ ...exercise, trackId });
      }

      await db.bodyMetrics.bulkAdd(
        Array.from({ length: 18 }, (_, index) => {
          const measuredAt = now - (17 - index) * 7 * dayMs;
          return {
            id: uuid(),
            weightLb: 204 - index * 0.4,
            waistIn: 36.8 - index * 0.05,
            bodyFatPct: 18.2 - index * 0.08,
            bodyWaterPct: 57 + ((index % 3) - 1) * 0.2,
            measuredAt,
            takenAt: measuredAt,
            createdAt: measuredAt,
          };
        })
      );

      const sessionNotes = [
        [
          "Lat Pulldown: improved stretch and contraction; arms only at terminal reps.",
          "3-Point DB Row: breakthrough; lat dominance with no biceps/trap takeover.",
          "Bradford Press: stopped due to shoulder twinge.",
          "Lateral Raise: medial delt isolation still not clean.",
        ].join("\n"),
        [
          "Lat Pulldown: improved stretch and contraction.",
          "Bradford Press: shoulder sensitive in behind-head position.",
          "Lateral Raise: medial delt isolation still not clean.",
        ].join("\n"),
        [
          "3-Point DB Row: breakthrough pattern still holds.",
          "Bradford Press: shoulder twinge showed up again.",
          "Lateral Raise: medial delt isolation still not clean.",
          "Farmer's Carry: slight trap involvement noted but controlled.",
        ].join("\n"),
        [
          "Lat Pulldown: improved stretch and contraction; arms only at terminal reps.",
          "Bradford Press: stopped due to shoulder twinge.",
          "Lateral Raise: medial delt isolation still not clean.",
        ].join("\n"),
      ];

      let newestSessionId = "";

      for (let sessionIndex = 0; sessionIndex < 4; sessionIndex += 1) {
        const sessionId = uuid();
        if (sessionIndex === 0) newestSessionId = sessionId;
        const startedAt = now - (sessionIndex + 1) * 7 * dayMs;

        await db.sessions.add({
          id: sessionId,
          templateName: `Upper ${String.fromCharCode(65 + sessionIndex)}`,
          startedAt,
          endedAt: startedAt + 45 * 60 * 1000,
          notes: sessionNotes[sessionIndex],
        });

        for (const [trackIndex, track] of tracks.entries()) {
          await db.sets.add({
            id: uuid(),
            sessionId,
            trackId: track.trackId,
            createdAt: startedAt + trackIndex * 60_000,
            setType: "working",
            weight: 100 + sessionIndex * 5 + trackIndex * 10,
            reps: track.name === "Lat Pulldown" ? 10 : 8,
            rir: 2,
            completedAt: startedAt + trackIndex * 60_000 + 5_000,
          });
        }
      }

      return { newestSessionId };
    });

    await goto(page, "/history");
    await expect(page.getByTestId("history-completed-count")).toContainText("4");
    await expect(page.getByTestId(`history-completed-card:${seeded.newestSessionId}`)).toBeVisible({
      timeout: 15000,
    });

    await goto(page, `/session/${seeded.newestSessionId}`);
    await expect(page.getByTestId("session-detail")).toBeVisible({ timeout: 15000 });

    await goto(page, "/progress");
    await expect(page.getByRole("button", { name: /copy coach export/i })).toBeVisible({
      timeout: 15000,
    });
    await page.getByRole("button", { name: /copy coach export/i }).click();

    const copiedText = await page.evaluate(() => (window as any).__copiedText.text);
    expect(copiedText).toContain("Questions to answer:");
    expect(copiedText).toContain("Next Workout Focus");
    expect(copiedText).toContain("Progression Guardrails");
    expect(copiedText).toContain("Execution Priorities");
    expect(copiedText).toContain("Adjustment Triggers");
    expect(copiedText).toContain("Training Signals (Recent Sessions)");
    expect(copiedText).toContain("Recent Patterns (Last 4 Sessions)");
    expect(copiedText).not.toContain("Readiness / Confidence Notes");
    expect(copiedText).not.toContain("No additional readiness notes.");
    expect(copiedText).toContain("Discuss with Gaz");

    const focusSection = getSection(copiedText, "Next Workout Focus", "Training Signals (Recent Sessions)");
    expect(focusSection).not.toMatch(/next workout:\s*(upper|lower)/i);
    expect(focusSection).not.toMatch(/\bdo\s+(upper|lower)\b/i);
    expect(focusSection).not.toMatch(/next session should be/i);
    expect(focusSection).not.toMatch(/\badd\s+\d+\s+sets?\b/i);
    expect(focusSection).not.toMatch(/\bdo\s+\d+\s+sets?\s+of\b/i);
    expect(focusSection).not.toMatch(/\bincrease by\s+\d+\s*(lb|lbs|kg)?\b/i);
    expect(focusSection).not.toMatch(/\bperform\s+\d+\s*-\s*\d+\s+reps?\b/i);
  });

  test("History Walks filter uses the conservative Cardio walk classifier", async ({ page }) => {
    await goto(page, "/");
    await resetDexieDb(page);

    const seeded = await page.evaluate(async () => {
      const db = (window as any).__db;
      if (!db) throw new Error("__db missing on window.");

      const uuid = () => crypto.randomUUID();
      const base = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const at = (hour: number, minute: number) =>
        new Date(base.getFullYear(), base.getMonth(), base.getDate(), hour, minute).getTime();

      async function createTrack(name: string, trackType: "conditioning" | "strength" = "conditioning") {
        const exerciseId = uuid();
        const trackId = uuid();
        await db.exercises.add({
          id: exerciseId,
          name,
          normalizedName: name.toLowerCase(),
          category: trackType === "conditioning" ? "Cardio" : "Strength",
          metricMode: trackType === "conditioning" ? "time" : "reps",
          equipmentTags: trackType === "conditioning" ? ["bodyweight"] : ["barbell"],
          createdAt: at(7, 0),
        });
        await db.tracks.add({
          id: trackId,
          exerciseId,
          trackType,
          displayName: name,
          trackingMode: trackType === "conditioning" ? "timeSeconds" : "weightedReps",
          warmupSetsDefault: 0,
          workingSetsDefault: 1,
          repMin: 1,
          repMax: 1,
          restSecondsDefault: 0,
          weightJumpDefault: 0,
          createdAt: at(7, 1),
        });
        return trackId;
      }

      async function createSession(args: {
        name: string;
        hour: number;
        minute: number;
        trackId: string;
        seconds?: number;
        distanceMeters?: number;
        strength?: boolean;
      }) {
        const sessionId = uuid();
        const startedAt = at(args.hour, args.minute);
        await db.sessions.add({
          id: sessionId,
          templateName: args.name,
          startedAt,
          endedAt: startedAt + (args.seconds ?? 30 * 60) * 1000,
          notes: args.name === "Walk - MapMyWalk" ? "Route: Neighborhood Loop\nPace: 20:00/mi" : "",
        });
        await db.sets.add({
          id: uuid(),
          sessionId,
          trackId: args.trackId,
          createdAt: startedAt + 60_000,
          setType: "working",
          seconds: args.strength ? undefined : args.seconds ?? 30 * 60,
          distance: args.distanceMeters,
          distanceUnit: args.distanceMeters ? "m" : undefined,
          weight: args.strength ? 135 : undefined,
          reps: args.strength ? 8 : undefined,
        });
        return sessionId;
      }

      const walkTrackId = await createTrack("Walk");
      const bodyBalanceTrackId = await createTrack("BodyBalance");
      const yogaTrackId = await createTrack("Yoga");
      const coreMobilityTrackId = await createTrack("Core Mobility");
      const walkingLungeTrackId = await createTrack("Walking Lunge");
      const farmerTrackId = await createTrack("Farmer's Walk", "strength");
      const benchTrackId = await createTrack("Bench Press", "strength");

      const treadmillWalkId = await createSession({
        name: "Walk - Treadmill",
        hour: 9,
        minute: 30,
        trackId: walkTrackId,
        seconds: 20 * 60,
      });
      const parkWalkId = await createSession({
        name: "Walk - Park",
        hour: 13,
        minute: 0,
        trackId: walkTrackId,
        seconds: 60 * 60,
      });
      const mapMyWalkId = await createSession({
        name: "Walk - MapMyWalk",
        hour: 17,
        minute: 30,
        trackId: walkTrackId,
        seconds: 60 * 60,
        distanceMeters: 3 * 1609.344,
      });
      const bodyBalanceId = await createSession({
        name: "BodyBalance",
        hour: 8,
        minute: 0,
        trackId: bodyBalanceTrackId,
      });
      const yogaId = await createSession({
        name: "Yoga",
        hour: 8,
        minute: 45,
        trackId: yogaTrackId,
      });
      const coreMobilityId = await createSession({
        name: "Core Mobility",
        hour: 10,
        minute: 30,
        trackId: coreMobilityTrackId,
      });
      const walkingLungeId = await createSession({
        name: "Walking Lunge",
        hour: 11,
        minute: 30,
        trackId: walkingLungeTrackId,
      });
      const farmerWalkId = await createSession({
        name: "Farmer's Walk",
        hour: 12,
        minute: 30,
        trackId: farmerTrackId,
        strength: true,
      });
      const upperWorkoutId = await createSession({
        name: "Upper A",
        hour: 15,
        minute: 0,
        trackId: benchTrackId,
        strength: true,
      });
      const lowerWorkoutId = await createSession({
        name: "Lower B",
        hour: 16,
        minute: 0,
        trackId: benchTrackId,
        strength: true,
      });
      await db.sets.add({
        id: uuid(),
        sessionId: lowerWorkoutId,
        trackId: walkTrackId,
        createdAt: at(16, 1),
        setType: "working",
        seconds: 10 * 60,
      });

      return {
        treadmillWalkId,
        parkWalkId,
        mapMyWalkId,
        bodyBalanceId,
        yogaId,
        coreMobilityId,
        walkingLungeId,
        farmerWalkId,
        upperWorkoutId,
        lowerWorkoutId,
      };
    });

    await goto(page, "/history");
    await expect(page.getByTestId("history-ready")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("history-completed-count")).toHaveText("10");

    await page.getByTestId("history-filter:walks").click();
    await expect(page).toHaveURL(/\/history\?kind=walks$/);
    await expect(page.getByTestId("history-filter:walks")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("history-completed-count")).toHaveText("3");
    await expect(page.getByTestId(`history-completed-card:${seeded.treadmillWalkId}`)).toBeVisible();
    await expect(page.getByTestId(`history-completed-card:${seeded.parkWalkId}`)).toBeVisible();
    await expect(page.getByTestId(`history-completed-card:${seeded.mapMyWalkId}`)).toBeVisible();
    await expect(page.getByTestId(`history-completed-card:${seeded.bodyBalanceId}`)).toHaveCount(0);
    await expect(page.getByTestId(`history-completed-card:${seeded.yogaId}`)).toHaveCount(0);
    await expect(page.getByTestId(`history-completed-card:${seeded.coreMobilityId}`)).toHaveCount(0);
    await expect(page.getByTestId(`history-completed-card:${seeded.walkingLungeId}`)).toHaveCount(0);
    await expect(page.getByTestId(`history-completed-card:${seeded.farmerWalkId}`)).toHaveCount(0);
    await expect(page.getByTestId(`history-completed-card:${seeded.lowerWorkoutId}`)).toHaveCount(0);

    await page.getByTestId(`history-completed-card:${seeded.mapMyWalkId}`).click();
    await expect(page).toHaveURL(new RegExp(`/session/${seeded.mapMyWalkId}$`));
    await expect(page.getByTestId("session-detail")).toBeVisible({ timeout: 15000 });
    await page.goBack();
    await expect(page).toHaveURL(/\/history\?kind=walks$/);
    await expect(page.getByTestId("history-filter:walks")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("history-completed-count")).toHaveText("3");
    await expect(page.getByTestId(`history-completed-card:${seeded.mapMyWalkId}`)).toBeVisible();
    await expect(page.getByTestId(`history-completed-card:${seeded.lowerWorkoutId}`)).toHaveCount(0);

    await page.getByTestId(`history-completed-card:${seeded.mapMyWalkId}`).click();
    await expect(page).toHaveURL(new RegExp(`/session/${seeded.mapMyWalkId}$`));
    await expect(page.getByTestId("session-detail")).toBeVisible({ timeout: 15000 });
    await page.getByTestId("back-to-history").click();
    await expect(page).toHaveURL(/\/history\?kind=walks$/);
    await expect(page.getByTestId("history-filter:walks")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("history-completed-count")).toHaveText("3");
    await expect(page.getByTestId(`history-completed-card:${seeded.mapMyWalkId}`)).toBeVisible();
    await expect(page.getByTestId(`history-completed-card:${seeded.lowerWorkoutId}`)).toHaveCount(0);

    await page.getByTestId("history-filter:classes").click();
    await expect(page).toHaveURL(/\/history\?kind=classes$/);
    await expect(page.getByTestId("history-completed-count")).toHaveText("1");
    await expect(page.getByTestId(`history-completed-card:${seeded.yogaId}`)).toBeVisible();

    await page.getByTestId("history-filter:workouts").click();
    await expect(page).toHaveURL(/\/history\?kind=workouts$/);
    await expect(page.getByTestId("history-completed-count")).toHaveText("6");
    await expect(page.getByTestId(`history-completed-card:${seeded.upperWorkoutId}`)).toBeVisible();
    await expect(page.getByTestId(`history-completed-card:${seeded.lowerWorkoutId}`)).toBeVisible();
    await expect(page.getByTestId(`history-completed-card:${seeded.farmerWalkId}`)).toBeVisible();
    await expect(page.getByTestId(`history-completed-card:${seeded.walkingLungeId}`)).toBeVisible();
    await expect(page.getByTestId(`history-completed-card:${seeded.coreMobilityId}`)).toBeVisible();
    await expect(page.getByTestId(`history-completed-card:${seeded.bodyBalanceId}`)).toBeVisible();

    await page.getByTestId("history-filter:all").click();
    await expect(page).toHaveURL(/\/history\?kind=all$/);
    await expect(page.getByTestId("history-completed-count")).toHaveText("10");

    await goto(page, "/history?kind=bogus");
    await expect(page.getByTestId("history-ready")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("history-filter:all")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("history-completed-count")).toHaveText("10");
  });
});
