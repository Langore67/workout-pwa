import { expect, test, type Page } from "@playwright/test";
import { buildCardioExportText } from "../src/lib/cardio/buildCardioExportText";
import type { CardioWalkSummary } from "../src/lib/cardio/cardioTypes";
import { resetDexieDb } from "./helpers/dbSeed";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173/";
const DAY_MS = 24 * 60 * 60 * 1000;
const METERS_PER_MILE = 1609.344;

async function goto(page: Page, path: string) {
  await page.goto(new URL(path, BASE_URL).toString(), { waitUntil: "domcontentloaded" });
}

async function installClipboardMock(page: Page) {
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
        readText: async () => clipboardState.text,
      },
      configurable: true,
    });
  });
}

async function readCopiedText(page: Page): Promise<string> {
  return page.evaluate(() => (window as any).__copiedText?.text ?? "");
}

function emptySummary(): CardioWalkSummary {
  return {
    normalizedWalks: [],
    recentWalks: [],
    dailySummaries: [],
    last7d: {
      count: 0,
      totalDurationSeconds: 0,
      totalDistanceMeters: 0,
    },
    last28d: {
      count: 0,
      totalDurationSeconds: 0,
      totalDistanceMeters: 0,
    },
    dataQuality: {
      missingDistanceCount: 0,
      missingDurationCount: 0,
      suspiciousPaceCount: 0,
      suspiciousPaceSessionIds: [],
      notesFieldCoverage: {
        source: 0,
        route: 0,
        pace: 0,
        elevation: 0,
        avgHr: 0,
        maxHr: 0,
        notes: 0,
      },
      unsupportedSignals: ["routeTrend", "zoneDistribution", "liftingInterference"],
    },
  };
}

function populatedSummary(): CardioWalkSummary {
  const day = new Date(2026, 4, 13);
  const morning = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9, 30).getTime();
  const evening = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 17, 30).getTime();
  const walks = [
    {
      sessionId: "walk-evening",
      startedAt: evening,
      date: "2026-05-13",
      name: "Walk - MapMyWalk",
      source: "MapMyWalk screenshot",
      route: "Neighborhood Loop",
      durationSeconds: 3600,
      distanceMeters: 3.12 * METERS_PER_MILE,
      paceSecondsPerMile: 1154,
      elevationText: "120 ft",
      avgHr: 112,
      maxHr: 138,
      notes: "Notes: felt steady",
      confidence: "high" as const,
    },
    {
      sessionId: "walk-morning",
      startedAt: morning,
      date: "2026-05-13",
      name: "Walk - Treadmill",
      durationSeconds: 2520,
      confidence: "high" as const,
    },
  ];

  return {
    normalizedWalks: walks,
    recentWalks: walks,
    dailySummaries: [
      {
        date: "2026-05-13",
        count: 2,
        totalDurationSeconds: 6120,
        totalDistanceMeters: 3.12 * METERS_PER_MILE,
        sessionIds: ["walk-evening", "walk-morning"],
      },
    ],
    last7d: {
      count: 2,
      totalDurationSeconds: 6120,
      totalDistanceMeters: 3.12 * METERS_PER_MILE,
      averageDurationSeconds: 3060,
      averagePaceSecondsPerMile: 1154,
    },
    last28d: {
      count: 2,
      totalDurationSeconds: 6120,
      totalDistanceMeters: 3.12 * METERS_PER_MILE,
      averageDurationSeconds: 3060,
      averagePaceSecondsPerMile: 1154,
    },
    dataQuality: {
      missingDistanceCount: 1,
      missingDurationCount: 0,
      suspiciousPaceCount: 0,
      suspiciousPaceSessionIds: [],
      notesFieldCoverage: {
        source: 1,
        route: 1,
        pace: 1,
        elevation: 1,
        avgHr: 1,
        maxHr: 1,
        notes: 1,
      },
      unsupportedSignals: ["routeTrend", "zoneDistribution", "liftingInterference"],
    },
  };
}

async function seedCardioExportWalks(page: Page) {
  return page.evaluate(
    async ({ dayMs, metersPerMile }) => {
      const db = (window as any).__db;
      if (!db) throw new Error("__db missing on window.");

      const uuid = () => crypto.randomUUID();
      const now = Date.now();
      const base = new Date(now - dayMs);
      const at = (hour: number, minute: number) =>
        new Date(base.getFullYear(), base.getMonth(), base.getDate(), hour, minute).getTime();

      const exerciseId = uuid();
      const strengthExerciseId = uuid();
      const timeTrackId = uuid();
      const distanceTrackId = uuid();
      const strengthTrackId = uuid();
      const treadmillSessionId = uuid();
      const mapMyWalkSessionId = uuid();
      const lowerBSessionId = uuid();

      await db.exercises.add({
        id: exerciseId,
        name: "Walk",
        normalizedName: "walk",
        category: "Cardio",
        metricMode: "distance",
        equipmentTags: ["bodyweight"],
        createdAt: at(8, 0),
      });
      await db.exercises.add({
        id: strengthExerciseId,
        name: "Squat",
        normalizedName: "squat",
        category: "Strength",
        metricMode: "reps",
        equipmentTags: ["barbell"],
        createdAt: at(8, 0),
      });

      await db.tracks.bulkAdd([
        {
          id: timeTrackId,
          exerciseId,
          trackType: "conditioning",
          displayName: "Walk",
          trackingMode: "timeSeconds",
          warmupSetsDefault: 0,
          workingSetsDefault: 1,
          repMin: 1,
          repMax: 1,
          restSecondsDefault: 0,
          weightJumpDefault: 0,
          createdAt: at(8, 1),
        },
        {
          id: distanceTrackId,
          exerciseId,
          trackType: "conditioning",
          displayName: "Walk",
          trackingMode: "repsOnly",
          warmupSetsDefault: 0,
          workingSetsDefault: 1,
          repMin: 1,
          repMax: 1,
          restSecondsDefault: 0,
          weightJumpDefault: 0,
          createdAt: at(8, 2),
        },
        {
          id: strengthTrackId,
          exerciseId: strengthExerciseId,
          trackType: "strength",
          displayName: "Squat",
          trackingMode: "weightedReps",
          warmupSetsDefault: 0,
          workingSetsDefault: 1,
          repMin: 1,
          repMax: 10,
          restSecondsDefault: 120,
          weightJumpDefault: 5,
          createdAt: at(8, 3),
        },
      ]);

      await db.sessions.bulkAdd([
        {
          id: treadmillSessionId,
          templateName: "Walk - Treadmill",
          startedAt: at(9, 30),
          endedAt: at(10, 12),
          notes: "",
        },
        {
          id: mapMyWalkSessionId,
          templateName: "Walk - MapMyWalk",
          startedAt: at(17, 30),
          endedAt: at(18, 30),
          notes: [
            "Source: MapMyWalk screenshot",
            "Route: Neighborhood Loop",
            "Pace: 19:14/mi",
            "Elevation: 120 ft",
            "Avg HR: 112",
            "Max HR: 138",
            "Notes: felt steady",
          ].join("\n"),
        },
        {
          id: lowerBSessionId,
          templateName: "Lower B",
          startedAt: at(19, 0),
          endedAt: at(20, 15),
          notes: "Strength session with a treadmill warmup",
        },
      ]);

      await db.sets.bulkAdd([
        {
          id: uuid(),
          sessionId: treadmillSessionId,
          trackId: timeTrackId,
          createdAt: at(9, 31),
          setType: "working",
          seconds: 42 * 60,
        },
        {
          id: uuid(),
          sessionId: mapMyWalkSessionId,
          trackId: distanceTrackId,
          createdAt: at(17, 31),
          setType: "working",
          distance: 3.12 * metersPerMile,
          distanceUnit: "m",
        },
        {
          id: uuid(),
          sessionId: mapMyWalkSessionId,
          trackId: timeTrackId,
          createdAt: at(17, 32),
          setType: "working",
          seconds: 60 * 60,
        },
        {
          id: uuid(),
          sessionId: lowerBSessionId,
          trackId: strengthTrackId,
          createdAt: at(19, 5),
          setType: "working",
          weight: 185,
          reps: 5,
        },
        {
          id: uuid(),
          sessionId: lowerBSessionId,
          trackId: timeTrackId,
          createdAt: at(19, 1),
          setType: "working",
          seconds: 10 * 60,
        },
      ]);

      await db.walks.add({
        id: uuid(),
        date: now,
        durationSeconds: 1800,
        distanceMiles: 9.99,
        notes: "Legacy manual walk should not export",
      });

      return { treadmillSessionId, mapMyWalkSessionId, lowerBSessionId };
    },
    { dayMs: DAY_MS, metersPerMile: METERS_PER_MILE }
  );
}

test.describe("buildCardioExportText", () => {
  test("formats an empty summary with source and data-quality notes", () => {
    const text = buildCardioExportText(emptySummary(), { generatedAt: new Date(2026, 4, 15, 12) });

    expect(text).toContain("IronForge Cardio Export");
    expect(text).toContain("Generated: 2026-05-15");
    expect(text).toContain("Last 7 Days");
    expect(text).toContain("- No imported walk sessions were found in History.");
    expect(text).toContain("- Missing distance: 0");
    expect(text).toContain("- Suspicious pace: 0");
    expect(text).toContain("- Suspicious rows are shown in Recent Walks but excluded from summary totals and averages.");
    expect(text).toContain("- Manual legacy db.walks rows are not included in this export.");
    expect(text).not.toMatch(/\b(undefined|null|NaN)\b/);
  });

  test("keeps multiple walks separate while daily totals aggregate them", () => {
    const text = buildCardioExportText(populatedSummary(), { generatedAt: new Date(2026, 4, 15, 12) });

    expect(text).toContain("- Walks: 2");
    expect(text).toContain("- Total duration: 1 hr 42 min");
    expect(text).toContain("- Total distance: 3.12 mi / 5.02 km");
    expect(text).toContain("- Average duration: 51 min");
    expect(text).toContain("- Average pace: 19:14/mi");
    expect(text).toContain("Walk - MapMyWalk | 1 hr | 3.12 mi / 5.02 km | 19:14/mi | Neighborhood Loop");
    expect(text).toContain("Source MapMyWalk screenshot");
    expect(text).toContain("Elevation 120 ft");
    expect(text).toContain("Avg HR 112");
    expect(text).toContain("Max HR 138");
    expect(text).toContain("Notes felt steady");
    expect(text).toContain("Walk - Treadmill | 42 min | not available | not available");
    expect(text).toContain("2026-05-13 | 2 walks | 1 hr 42 min | 3.12 mi / 5.02 km");
  });

  test("explains suspicious pace exclusion while still showing the row", () => {
    const summary = populatedSummary();
    const suspiciousStartedAt = new Date(2026, 4, 13, 20, 0).getTime();
    summary.normalizedWalks.unshift({
      sessionId: "walk-suspicious",
      startedAt: suspiciousStartedAt,
      date: "2026-05-13",
      name: "Walk - Suspicious",
      durationSeconds: 5 * 3600 + 29 * 60,
      distanceMeters: 5.29 * METERS_PER_MILE,
      paceSecondsPerMile: 3729,
      confidence: "high",
    });
    summary.recentWalks.unshift(summary.normalizedWalks[0]);
    summary.dataQuality.suspiciousPaceCount = 1;
    summary.dataQuality.suspiciousPaceSessionIds = ["walk-suspicious"];

    const text = buildCardioExportText(summary, { generatedAt: new Date(2026, 4, 15, 12) });

    expect(text).toContain("Walk - Suspicious | 5 hr 29 min | 5.29 mi / 8.51 km | 62:09/mi | Suspicious pace");
    expect(text).toContain("- Suspicious pace: 1");
    expect(text).toContain("- Suspicious rows are shown in Recent Walks but excluded from summary totals and averages.");
    expect(text).toContain("- Total distance: 3.12 mi / 5.02 km");
    expect(text).toContain("2026-05-13 | 2 walks | 1 hr 42 min | 3.12 mi / 5.02 km");
  });
});

test.describe("Progress Copy Cardio Export", () => {
  test.beforeEach(async ({ page }) => {
    await installClipboardMock(page);
  });

  test("button appears near Copy Coach Export", async ({ page }) => {
    await resetDexieDb(page);
    await goto(page, "/progress");

    const coach = page.getByRole("button", { name: /Copy Coach Export|Preparing Export/ });
    const cardio = page.getByRole("button", { name: "Copy Cardio Export" });
    await expect(coach).toBeVisible({ timeout: 15000 });
    await expect(cardio).toBeVisible();

    const coachBox = await coach.boundingBox();
    const cardioBox = await cardio.boundingBox();
    expect(coachBox).not.toBeNull();
    expect(cardioBox).not.toBeNull();
    expect(Math.abs((coachBox?.y ?? 0) - (cardioBox?.y ?? 0))).toBeLessThan(80);
  });

  test("empty state export works and ignores legacy manual walks", async ({ page }) => {
    await resetDexieDb(page);
    await page.evaluate(async () => {
      const db = (window as any).__db;
      if (!db) throw new Error("__db missing on window.");
      await db.walks.add({
        id: crypto.randomUUID(),
        date: Date.now(),
        durationSeconds: 1800,
        distanceMiles: 9.99,
        notes: "Legacy manual walk should not export",
      });
    });

    await goto(page, "/progress");
    await page.getByRole("button", { name: "Copy Cardio Export" }).click();
    const text = await readCopiedText(page);

    expect(text).toContain("IronForge Cardio Export");
    expect(text).toContain("Last 7 Days");
    expect(text).toContain("Last 28 Days");
    expect(text).toContain("- No imported walk sessions were found in History.");
    expect(text).toContain("- Manual legacy db.walks rows are not included in this export.");
    expect(text).not.toContain("Legacy manual walk should not export");
    expect(text).not.toContain("9.99 mi");
  });

  test("exports History-backed recent walks, same-day aggregation, note fields, and unsupported-signal boundaries", async ({
    page,
  }) => {
    await resetDexieDb(page);
    await seedCardioExportWalks(page);

    await goto(page, "/progress");
    await page.getByRole("button", { name: "Copy Cardio Export" }).click();
    const text = await readCopiedText(page);

    expect(text).toContain("Questions to answer:");
    expect(text).toContain("Cardio Summary");
    expect(text).toContain("Last 7 Days");
    expect(text).toContain("Last 28 Days");
    expect(text).toContain("- Walks: 2");
    expect(text).toContain("- Total duration: 1 hr 42 min");
    expect(text).toContain("- Total distance: 3.12 mi / 5.02 km");
    expect(text).toContain("- Average duration: 51 min");
    expect(text).toContain("- Average pace: 19:14/mi");

    const recentWalks = text.slice(text.indexOf("Recent Walks"), text.indexOf("Daily Totals"));
    expect(recentWalks).toContain("Walk - MapMyWalk | 1 hr | 3.12 mi / 5.02 km | 19:14/mi | Neighborhood Loop");
    expect(recentWalks).toContain("Source MapMyWalk screenshot");
    expect(recentWalks).toContain("Elevation 120 ft");
    expect(recentWalks).toContain("Avg HR 112");
    expect(recentWalks).toContain("Max HR 138");
    expect(recentWalks).toContain("Notes felt steady");
    expect(recentWalks).toContain("Walk - Treadmill | 42 min | not available | not available");
    expect((recentWalks.match(/^-/gm) ?? [])).toHaveLength(2);

    const dailyTotals = text.slice(text.indexOf("Daily Totals"), text.indexOf("Data Quality"));
    expect(dailyTotals).toContain("| 2 walks | 1 hr 42 min | 3.12 mi / 5.02 km");
    expect((dailyTotals.match(/^-/gm) ?? [])).toHaveLength(1);

    expect(text).toContain("- Missing distance: 1");
    expect(text).toContain("- Missing duration: 0");
    expect(text).toContain("- Suspicious pace: 0");
    expect(text).toContain("Suspicious rows are shown in Recent Walks but excluded from summary totals and averages.");
    expect(text).toContain("- Pace shown only when distance and duration are available.");
    expect(text).not.toMatch(/\b(readiness|strain|HRV|sleep|calories|prescription|prescriptions)\b/i);
    expect(text).not.toMatch(/\b(undefined|null|NaN)\b/);
    expect(text).not.toContain("Legacy manual walk should not export");
    expect(text).not.toContain("Lower B");
  });

  test("exports distance and pace from simple conditioning distance and duration imports", async ({ page }) => {
    await resetDexieDb(page);
    await page.evaluate(async () => {
      const { importSessionFromJournal } = await import("/src/importers/importSession.ts");
      await importSessionFromJournal({
        text: `Session: Walk - Peachtree Ridge Park
Date: 2026-05-23
Start: 19:04
End: 20:09

Walk
conditioning 6.10km
conditioning duration 1:05:31

Session Notes:
- Avg pace 10:43/km
- Avg HR 115`,
      });
    });

    await goto(page, "/progress");
    await page.getByRole("button", { name: "Copy Cardio Export" }).click();
    const text = await readCopiedText(page);

    expect(text).toContain("Walk - Peachtree Ridge Park | 1 hr 6 min | 3.79 mi / 6.10 km | 17:17/mi");
    expect(text).toContain("- Total distance: 3.79 mi / 6.10 km");
    expect(text).toContain("- Average pace: 17:17/mi");
    expect(text).toContain("- Missing distance: 0");
    expect(text).not.toContain("Walk - Peachtree Ridge Park | 1 hr 6 min | not available");
  });
});
