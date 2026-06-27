import { test, expect, type Page } from "@playwright/test";
import { resetDexieDb } from "./helpers/dbSeed";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173";

async function goto(page: Page, path = "/") {
  await page.goto(new URL(path, BASE_URL).toString(), { waitUntil: "domcontentloaded" });
}

async function seedAndComputePrs(
  page: Page,
  args: {
    trackType?: "strength" | "hypertrophy" | "technique" | "mobility" | "corrective" | "conditioning";
    displayName?: string;
    priorBest?: boolean;
    sets: Array<{
      setType: "warmup" | "working" | "drop" | "failure";
      weight?: number;
      reps?: number;
      rir?: number;
      notes?: string;
      createdAtOffset?: number;
    }>;
  }
) {
  return page.evaluate(async (input) => {
    const { db } = await import("/src/db.ts");
    const { computeAndStorePRsForSession } = await import("/src/prs.ts");

    const now = Date.now();
    const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
    const exerciseId = id("exercise");
    const trackId = id("track");
    const sessionId = id("session");
    const displayName = input.displayName ?? "Test Lift";

    await db.exercises.add({
      id: exerciseId,
      name: displayName,
      normalizedName: displayName.toLowerCase(),
      equipmentTags: [],
      createdAt: now,
      updatedAt: now,
    } as any);

    await db.tracks.add({
      id: trackId,
      exerciseId,
      trackType: input.trackType ?? "strength",
      displayName,
      trackingMode: "weightedReps",
      warmupSetsDefault: 0,
      workingSetsDefault: 3,
      repMin: 3,
      repMax: 12,
      restSecondsDefault: 180,
      weightJumpDefault: 5,
      createdAt: now,
    } as any);

    await db.sessions.add({
      id: sessionId,
      templateName: "PR Detection Test",
      startedAt: now,
      endedAt: now + 60_000,
    } as any);

    if (input.priorBest) {
      await db.trackPrs.put({
        trackId,
        updatedAt: now - 10_000,
        bestVolumeValue: 1_000,
        bestVolumeWeight: 100,
        bestVolumeReps: 10,
        bestVolumeAt: now - 10_000,
        bestVolumeSessionId: id("prior-session"),
        bestWeightValue: 100,
        bestWeightReps: 10,
        bestWeightAt: now - 10_000,
        bestWeightSessionId: id("prior-session"),
        bestE1RMValue: 120,
        bestE1RMWeight: 100,
        bestE1RMReps: 6,
        bestE1RMAt: now - 10_000,
        bestE1RMSessionId: id("prior-session"),
      } as any);
    }

    await db.sets.bulkAdd(
      input.sets.map((set, index) => {
        const createdAt = now + (set.createdAtOffset ?? index + 1) * 1_000;
        return {
          id: id("set"),
          sessionId,
          trackId,
          setType: set.setType,
          weight: set.weight,
          reps: set.reps,
          rir: set.rir,
          notes: set.notes,
          createdAt,
          completedAt: createdAt,
          updatedAt: createdAt,
        };
      }) as any[]
    );

    const hits = await computeAndStorePRsForSession(sessionId);
    const stored = await db.trackPrs.get(trackId);
    return { hits, stored, sessionId, trackId };
  }, args);
}

test.describe("PR detection and flagging", () => {
  test.beforeEach(async ({ page }) => {
    await goto(page);
    await resetDexieDb(page);
  });

  test("technique/probe sets do not create strength PR flags", async ({ page }) => {
    const result = await seedAndComputePrs(page, {
      trackType: "technique",
      displayName: "Lat Pulldown",
      sets: [{ setType: "working", weight: 85, reps: 10, notes: "technique probe" }],
    });

    expect(result.hits).toEqual([]);
    expect(result.stored).toBeUndefined();
  });

  test("warmup sets do not create strength PR flags", async ({ page }) => {
    const result = await seedAndComputePrs(page, {
      trackType: "strength",
      sets: [{ setType: "warmup", weight: 225, reps: 5 }],
    });

    expect(result.hits).toEqual([]);
    expect(result.stored).toBeUndefined();
  });

  test("working sets create PR flags when they exceed prior bests", async ({ page }) => {
    const result = await seedAndComputePrs(page, {
      trackType: "strength",
      priorBest: true,
      sets: [{ setType: "working", weight: 135, reps: 10, rir: 2 }],
    });

    expect(result.hits).toHaveLength(1);
    expect(result.hits[0].hits).toEqual(["volume", "weight", "e1rm"]);
    expect(result.stored.bestWeightValue).toBe(135);
    expect(result.stored.bestWeightReps).toBe(10);
  });

  test("low-RIR high-quality working sets count normally", async ({ page }) => {
    const result = await seedAndComputePrs(page, {
      trackType: "strength",
      priorBest: true,
      sets: [{ setType: "working", weight: 135, reps: 8, rir: 1, notes: "clean reps" }],
    });

    expect(result.hits).toHaveLength(1);
    expect(result.hits[0].weight).toEqual({ weight: 135, reps: 8 });
  });

  test("later fatigue sets do not override a better earlier working set", async ({ page }) => {
    const result = await seedAndComputePrs(page, {
      trackType: "strength",
      priorBest: true,
      displayName: "Barbell Bench Press",
      sets: [
        { setType: "working", weight: 145, reps: 8, rir: 1, createdAtOffset: 1 },
        { setType: "working", weight: 145, reps: 4, rir: 0, notes: "fatigue", createdAtOffset: 2 },
      ],
    });

    expect(result.hits).toHaveLength(1);
    expect(result.hits[0].weight).toEqual({ weight: 145, reps: 8 });
    expect(result.hits[0].e1rm?.reps).toBe(8);
    expect(result.hits[0].volume?.reps).toBe(8);
  });

  test("Lat Pulldown 85x10 technique probe does not flag over 120x12 work", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { db } = await import("/src/db.ts");
      const { computeAndStorePRsForSession } = await import("/src/prs.ts");

      const now = Date.now();
      const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
      const exerciseId = id("exercise");
      const workTrackId = id("work-track");
      const techniqueTrackId = id("tech-track");
      const workSessionId = id("work-session");
      const techniqueSessionId = id("tech-session");

      await db.exercises.add({
        id: exerciseId,
        name: "Lat Pulldown",
        normalizedName: "lat pulldown",
        equipmentTags: [],
        createdAt: now,
        updatedAt: now,
      } as any);

      for (const track of [
        { id: workTrackId, trackType: "strength", displayName: "Lat Pulldown" },
        { id: techniqueTrackId, trackType: "technique", displayName: "Lat Pulldown - technique" },
      ]) {
        await db.tracks.add({
          id: track.id,
          exerciseId,
          trackType: track.trackType,
          displayName: track.displayName,
          trackingMode: "weightedReps",
          warmupSetsDefault: 0,
          workingSetsDefault: 3,
          repMin: 3,
          repMax: 12,
          restSecondsDefault: 180,
          weightJumpDefault: 5,
          createdAt: now,
        } as any);
      }

      await db.sessions.bulkAdd([
        { id: workSessionId, templateName: "Work", startedAt: now, endedAt: now + 60_000 },
        { id: techniqueSessionId, templateName: "Technique", startedAt: now + 120_000, endedAt: now + 180_000 },
      ] as any[]);
      await db.sets.bulkAdd([
        {
          id: id("set"),
          sessionId: workSessionId,
          trackId: workTrackId,
          setType: "working",
          weight: 120,
          reps: 12,
          createdAt: now + 1_000,
          completedAt: now + 1_000,
        },
        {
          id: id("set"),
          sessionId: techniqueSessionId,
          trackId: techniqueTrackId,
          setType: "working",
          weight: 85,
          reps: 10,
          notes: "technique probe",
          createdAt: now + 121_000,
          completedAt: now + 121_000,
        },
      ] as any[]);

      const workHits = await computeAndStorePRsForSession(workSessionId);
      const techniqueHits = await computeAndStorePRsForSession(techniqueSessionId);
      const workPrs = await db.trackPrs.get(workTrackId);
      const techniquePrs = await db.trackPrs.get(techniqueTrackId);
      return { workHits, techniqueHits, workPrs, techniquePrs };
    });

    expect(result.workHits).toHaveLength(1);
    expect(result.workPrs.bestWeightValue).toBe(120);
    expect(result.workPrs.bestWeightReps).toBe(12);
    expect(result.techniqueHits).toEqual([]);
    expect(result.techniquePrs).toBeUndefined();
  });

  test("imported and live-created completed workouts store PR flags through the same engine", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { db } = await import("/src/db.ts");
      const { importSessionFromJournal } = await import("/src/importers/importSession.ts");
      const { finalizeGymSessionWrites } = await import("/src/finalizeSession.ts");

      const now = Date.now();
      const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

      const imported = await importSessionFromJournal({
        dateISO: "2026-06-01",
        templateName: "Imported Upper",
        start: "09:00",
        end: "10:00",
        sets: [
          {
            exerciseName: "Imported Bench Press",
            trackType: "strength",
            trackingMode: "weightedReps",
            setType: "working",
            weight: 135,
            reps: 8,
            rir: 2,
          },
        ],
      });
      const importedSession = await db.sessions.get(imported.sessionId);

      const exerciseId = id("exercise");
      const trackId = id("track");
      const sessionId = id("session");
      await db.exercises.add({
        id: exerciseId,
        name: "Live Bench Press",
        normalizedName: "live bench press",
        equipmentTags: [],
        createdAt: now,
        updatedAt: now,
      } as any);
      await db.tracks.add({
        id: trackId,
        exerciseId,
        trackType: "strength",
        displayName: "Live Bench Press",
        trackingMode: "weightedReps",
        warmupSetsDefault: 0,
        workingSetsDefault: 3,
        repMin: 3,
        repMax: 12,
        restSecondsDefault: 180,
        weightJumpDefault: 5,
        createdAt: now,
      } as any);
      await db.sessions.add({ id: sessionId, templateName: "Live Upper", startedAt: now } as any);
      await db.sets.add({
        id: id("set"),
        sessionId,
        trackId,
        setType: "working",
        weight: 135,
        reps: 8,
        rir: 2,
        createdAt: now + 1_000,
        completedAt: now + 1_000,
      } as any);

      await finalizeGymSessionWrites(sessionId);
      const liveSession = await db.sessions.get(sessionId);

      return {
        importedPrs: JSON.parse(importedSession?.prsJson ?? "[]"),
        livePrs: JSON.parse(liveSession?.prsJson ?? "[]"),
      };
    });

    expect(result.importedPrs).toHaveLength(1);
    expect(result.importedPrs[0].hits).toEqual(["volume", "weight", "e1rm"]);
    expect(result.livePrs).toHaveLength(1);
    expect(result.livePrs[0].hits).toEqual(["volume", "weight", "e1rm"]);
  });
});
