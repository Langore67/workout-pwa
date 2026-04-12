import { test, expect, type Page } from "@playwright/test";
import { resetDexieDb } from "./helpers/dbSeed";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173/";

async function goto(page: Page, path: string) {
  await page.goto(new URL(path, BASE_URL).toString(), { waitUntil: "domcontentloaded" });
}

test.describe("shared effective-load helpers", () => {
  test("pull up with negative assistance uses bodyweight plus logged load for e1RM", async ({ page }) => {
    await goto(page, "/");

    const result = await page.evaluate(async () => {
      const strength = await import("/src/strength/Strength.ts");
      const effective = strength.calcEffectiveStrengthWeightLb(-65, "Pull Up", 203);
      const e1rm = strength.computeScoredE1RM(effective, 10);
      return { effective, e1rm };
    });

    expect(result).toEqual({ effective: 138, e1rm: 184 });
  });

  test("explicit assisted names use bodyweight plus signed load consistently", async ({ page }) => {
    await goto(page, "/");

    const result = await page.evaluate(async () => {
      const strength = await import("/src/strength/Strength.ts");
      return {
        assistedPullUpPositive: strength.calcEffectiveStrengthWeightLb(65, "Assisted Pull Up", 203),
        assistedPullUpNegative: strength.calcEffectiveStrengthWeightLb(-65, "Assisted Pull Up", 203),
        weightedPullUp: strength.calcEffectiveStrengthWeightLb(25, "Pull Up", 203),
      };
    });

    expect(result).toEqual({
      assistedPullUpPositive: 268,
      assistedPullUpNegative: 138,
      weightedPullUp: 228,
    });
  });

  test("bodyweight compound effective load still handles unassisted and non-bodyweight cases", async ({ page }) => {
    await goto(page, "/");

    const result = await page.evaluate(async () => {
      const strength = await import("/src/strength/Strength.ts");
      return {
        unassistedChinUp: strength.calcEffectiveStrengthWeightLb(0, "Chin Up", 203),
        weightedDip: strength.calcEffectiveStrengthWeightLb(45, "Dip", 203),
        normalBench: strength.calcEffectiveStrengthWeightLb(135, "Bench Press", 203),
      };
    });

    expect(result).toEqual({
      unassistedChinUp: 203,
      weightedDip: 248,
      normalBench: 135,
    });
  });

  test("strength engine excludes technique tracks while normal strength tracks still count", async ({ page }) => {
    await goto(page, "/");
    await resetDexieDb(page);

    const result = await page.evaluate(async () => {
      // @ts-ignore
      const db = window.__db;
      if (!db) throw new Error("__db missing on window.");

      const now = Date.now();
      const sessionId = crypto.randomUUID();
      const techniqueExerciseId = crypto.randomUUID();
      const techniqueTrackId = crypto.randomUUID();
      const strengthExerciseId = crypto.randomUUID();
      const strengthTrackId = crypto.randomUUID();

      await db.sessions.add({
        id: sessionId,
        startedAt: now - 60_000,
        endedAt: now,
        templateName: "Lower B",
      });

      await db.exercises.bulkAdd([
        {
          id: techniqueExerciseId,
          name: "Barbell RDL",
          normalizedName: "barbell rdl",
          equipmentTags: ["barbell"],
          createdAt: now,
          updatedAt: now,
        },
        {
          id: strengthExerciseId,
          name: "Leg Press",
          normalizedName: "leg press",
          equipmentTags: ["machine"],
          createdAt: now,
          updatedAt: now,
        },
      ]);

      await db.tracks.bulkAdd([
        {
          id: techniqueTrackId,
          exerciseId: techniqueExerciseId,
          displayName: "Barbell RDL",
          trackType: "technique",
          trackingMode: "weightedReps",
          warmupSetsDefault: 0,
          workingSetsDefault: 2,
          repMin: 3,
          repMax: 8,
          restSecondsDefault: 90,
          weightJumpDefault: 0,
          createdAt: now,
        },
        {
          id: strengthTrackId,
          exerciseId: strengthExerciseId,
          displayName: "Leg Press",
          trackType: "hypertrophy",
          trackingMode: "weightedReps",
          warmupSetsDefault: 2,
          workingSetsDefault: 3,
          repMin: 8,
          repMax: 12,
          restSecondsDefault: 120,
          weightJumpDefault: 5,
          createdAt: now,
        },
      ]);

      await db.sets.bulkAdd([
        {
          id: crypto.randomUUID(),
          sessionId,
          trackId: techniqueTrackId,
          setType: "working",
          weight: 95,
          reps: 10,
          createdAt: now - 5000,
          completedAt: now - 5000,
        },
        {
          id: crypto.randomUUID(),
          sessionId,
          trackId: strengthTrackId,
          setType: "warmup",
          weight: 90,
          reps: 8,
          createdAt: now - 4000,
          completedAt: now - 4000,
        },
        {
          id: crypto.randomUUID(),
          sessionId,
          trackId: strengthTrackId,
          setType: "working",
          weight: 180,
          reps: 12,
          createdAt: now - 3000,
          completedAt: now - 3000,
        },
      ]);

      const strength = await import("/src/strength/Strength.ts");
      const snapshot = await strength.computeStrengthIndexAt(now, 28);
      const squatPattern = snapshot.patterns.find((pattern: any) => pattern.pattern === "squat");
      const hingePattern = snapshot.patterns.find((pattern: any) => pattern.pattern === "hinge");

      return {
        normalizedIndex: snapshot.normalizedIndex,
        squatWorkingSets: squatPattern?.completedWorkingSets ?? null,
        hingeWorkingSets: hingePattern?.completedWorkingSets ?? null,
      };
    });

    expect(result.normalizedIndex).toBeGreaterThan(0);
    expect(result.squatWorkingSets).toBeGreaterThan(0);
    expect(result.hingeWorkingSets).toBe(0);
  });

  test("hero meta stays low-confidence when weekly rows exist but no meaningful strength work exists", async ({ page }) => {
    await goto(page, "/");

    const result = await page.evaluate(async () => {
      const strength = await import("/src/strength/Strength.ts");
      return strength.buildStrengthHeroMeta(
        {
          absoluteIndex: 0,
          relativeIndex: 0,
          normalizedIndex: 0,
          bodyweight: 200,
          bodyweightDaysUsed: 5,
          patterns: [
            { pattern: "squat", topSet: 0, working: 0, exposure: 0, absolute: 0, relative: 0, normalized: 0, hardSets: 0, completedWorkingSets: 0 },
            { pattern: "hinge", topSet: 0, working: 0, exposure: 0, absolute: 0, relative: 0, normalized: 0, hardSets: 0, completedWorkingSets: 0 },
            { pattern: "push", topSet: 0, working: 0, exposure: 0, absolute: 0, relative: 0, normalized: 0, hardSets: 0, completedWorkingSets: 0 },
            { pattern: "pull", topSet: 0, working: 0, exposure: 0, absolute: 0, relative: 0, normalized: 0, hardSets: 0, completedWorkingSets: 0 },
          ],
        },
        Array.from({ length: 12 }, (_, i) => ({
          weekEndMs: Date.now() - i * 7 * 24 * 60 * 60 * 1000,
          label: `W${i + 1}`,
          bodyweight: 200,
          bodyweightDaysUsed: 5,
          absoluteIndex: 0,
          relativeIndex: 0,
          normalizedIndex: 0,
        }))
      );
    });

    expect(result.trendLabel).toBe("Building");
    expect(result.trendDetail).toContain("Need more completed strength work");
    expect(result.confidence).toBe("Low");
  });
});
test("Lat Pulldown is classified as Pull pattern", async ({ page }) => {
  await goto(page, "/");
  await resetDexieDb(page);

  const result = await page.evaluate(async () => {
    // @ts-ignore
    const db = window.__db;
    if (!db) throw new Error("__db missing on window.");

    const now = Date.now();
    const sessionId = crypto.randomUUID();
    const exerciseId = crypto.randomUUID();
    const trackId = crypto.randomUUID();

    await db.sessions.add({
      id: sessionId,
      startedAt: now - 60_000,
      endedAt: now,
      templateName: "Pull Day",
    });

    await db.exercises.add({
      id: exerciseId,
      name: "Lat Pulldown",
      normalizedName: "lat pulldown",
      equipmentTags: ["cable"],
      bodyPart: "Back",
      createdAt: now,
      updatedAt: now,
    });

    await db.tracks.add({
      id: trackId,
      exerciseId,
      displayName: "Lat Pulldown",
      trackType: "hypertrophy",
      trackingMode: "weightedReps",
      warmupSetsDefault: 1,
      workingSetsDefault: 3,
      repMin: 8,
      repMax: 12,
      restSecondsDefault: 90,
      weightJumpDefault: 5,
      createdAt: now,
    });

    await db.sets.add({
      id: crypto.randomUUID(),
      sessionId,
      trackId,
      setType: "working",
      weight: 120,
      reps: 10,
      createdAt: now - 1000,
      completedAt: now - 1000,
    });

    const strength = await import("/src/strength/Strength.ts");
    const snapshot = await strength.computeStrengthIndexAt(now, 28);
    const pullPattern = snapshot.patterns.find((pattern: any) => pattern.pattern === "pull");
    const pushPattern = snapshot.patterns.find((pattern: any) => pattern.pattern === "push");

    return {
      normalizedIndex: snapshot.normalizedIndex,
      pullWorkingSets: pullPattern?.completedWorkingSets ?? 0,
      pullExposure: pullPattern?.exposure ?? 0,
      pushWorkingSets: pushPattern?.completedWorkingSets ?? 0,
    };
  });

  expect(result.normalizedIndex).toBeGreaterThan(0);
  expect(result.pullWorkingSets).toBeGreaterThan(0);
  expect(result.pullExposure).toBeGreaterThan(0);
  expect(result.pushWorkingSets).toBe(0);
});