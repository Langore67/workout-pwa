import { test, expect, type Page } from "@playwright/test";
import { resetDexieDb } from "./helpers/dbSeed";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173/";

async function goto(page: Page, path: string) {
  await page.goto(new URL(path, BASE_URL).toString(), { waitUntil: "domcontentloaded" });
}

test.describe("Strength Signal v2 anchor resolver", () => {
  test.beforeEach(async ({ page }) => {
    await goto(page, "/");
    await resetDexieDb(page);
  });

  test("exact configured exerciseId match wins over non-configured eligible candidates", async ({ page }) => {
    await goto(page, "/");

    const result = await page.evaluate(async () => {
      const resolver = await import("/src/strength/v2/anchorResolver.ts");

      const definition = {
        pattern: "hinge",
        allowedSubtypes: ["hinge"],
        configuredExerciseIds: ["configured-exercise-id"],
      };

      const configuredExercise = {
        id: "configured-exercise-id",
        name: "Barbell RDL",
        anchorEligibility: "conditional",
        anchorSubtypes: ["hinge"],
      };

      const configuredTrack = {
        id: "configured-track-id",
        exerciseId: "configured-exercise-id",
      };

      const primaryExercise = {
        id: "primary-exercise-id",
        name: "Conventional Deadlift",
        anchorEligibility: "primary",
        anchorSubtypes: ["hinge"],
      };

      const primaryTrack = {
        id: "primary-track-id",
        exerciseId: "primary-exercise-id",
      };

      return {
        configuredRank: resolver.anchorMatchRank(definition as any, configuredExercise as any, configuredTrack as any),
        primaryRank: resolver.anchorMatchRank(definition as any, primaryExercise as any, primaryTrack as any),
      };
    });

    expect(result).toEqual({
      configuredRank: 1,
      primaryRank: 2,
    });
  });

  test("configured canonical exerciseId match works through track.exerciseId even when exercise row id differs", async ({ page }) => {
    await goto(page, "/");

    const result = await page.evaluate(async () => {
      const resolver = await import("/src/strength/v2/anchorResolver.ts");

      const definition = {
        pattern: "push",
        allowedSubtypes: ["horizontalPush", "verticalPush"],
        configuredExerciseIds: ["canonical-bench-id"],
      };

      const exercise = {
        id: "merged-source-row-id",
        name: "DB Bench Press",
        anchorEligibility: "conditional",
        anchorSubtypes: ["horizontalPush"],
      };

      const track = {
        id: "track-id",
        exerciseId: "canonical-bench-id",
      };

      return {
        idsForMatch: resolver.exerciseIdsForMatch(exercise as any, track as any),
        rank: resolver.anchorMatchRank(definition as any, exercise as any, track as any),
      };
    });

    expect(result.idsForMatch).toEqual(["merged-source-row-id", "canonical-bench-id"]);
    expect(result.rank).toBe(1);
  });

  test("exact configured exercise name fallback works, but broad substring matching is not allowed", async ({ page }) => {
    await goto(page, "/");

    const result = await page.evaluate(async () => {
      const resolver = await import("/src/strength/v2/anchorResolver.ts");

      const definition = resolver.buildAnchorDefinitions(
        "cut",
        {
          strengthSignalV2Config: {
            phases: {
              cut: {
                hinge: {
                  exerciseName: "Romanian Deadlift",
                },
              },
            },
          },
        }
      ).find((row) => row.pattern === "hinge");

      if (!definition) {
        throw new Error("Expected hinge anchor definition.");
      }

      const exactNameExercise = {
        id: "romanian-deadlift-id",
        name: "Romanian Deadlift",
        anchorEligibility: "conditional",
        anchorSubtypes: ["hinge"],
      };

      const substringExercise = {
        id: "romanian-deadlift-variation-id",
        name: "Romanian Deadlift Variation",
        anchorEligibility: "conditional",
        anchorSubtypes: ["hinge"],
      };

      const nonMatchingTrack = {
        id: "track-id",
        exerciseId: "different-id",
      };

      return {
        configuredTerms: definition.configuredExerciseIds,
        exactNameRank: resolver.anchorMatchRank(definition as any, exactNameExercise as any, nonMatchingTrack as any),
        substringRank: resolver.anchorMatchRank(definition as any, substringExercise as any, nonMatchingTrack as any),
      };
    });

    expect(result.configuredTerms).toEqual(["Romanian Deadlift"]);
    expect(result.exactNameRank).toBe(1);
    expect(result.substringRank).toBe(3);
  });

  test("unresolved anchors fail safely when exercise is not eligible or subtype does not match", async ({ page }) => {
    await goto(page, "/");

    const result = await page.evaluate(async () => {
      const resolver = await import("/src/strength/v2/anchorResolver.ts");

      const definition = {
        pattern: "squat",
        allowedSubtypes: ["squat"],
        configuredExerciseIds: ["front-squat-id"],
      };

      const ineligibleExercise = {
        id: "front-squat-id",
        name: "Front Squat",
        anchorEligibility: "none",
        anchorSubtypes: ["squat"],
      };

      const wrongSubtypeExercise = {
        id: "good-morning-id",
        name: "Good Morning",
        anchorEligibility: "primary",
        anchorSubtypes: ["hinge"],
      };

      const track = {
        id: "track-id",
        exerciseId: "front-squat-id",
      };

      return {
        ineligibleRank: resolver.anchorMatchRank(definition as any, ineligibleExercise as any, track as any),
        wrongSubtypeRank: resolver.anchorMatchRank(definition as any, wrongSubtypeExercise as any, track as any),
      };
    });

    expect(result).toEqual({
      ineligibleRank: null,
      wrongSubtypeRank: null,
    });
  });

  test("CUT and MAINTAIN use the current 4-anchor model", async ({ page }) => {
    await goto(page, "/");

    const result = await page.evaluate(async () => {
      const config = await import("/src/strength/v2/strengthSignalV2AnchorConfig.ts");

      return {
        cut: config.getStrengthSignalV2AnchorDefinitions("cut").map((row) => row.pattern),
        maintain: config.getStrengthSignalV2AnchorDefinitions("maintain").map((row) => row.pattern),
      };
    });

    expect(result.cut).toEqual(["push", "pull", "hinge", "squat"]);
    expect(result.maintain).toEqual(["push", "pull", "hinge", "squat"]);
  });

  test("BULK uses the current broader anchor model", async ({ page }) => {
    await goto(page, "/");

    const result = await page.evaluate(async () => {
      const config = await import("/src/strength/v2/strengthSignalV2AnchorConfig.ts");
      return config.getStrengthSignalV2AnchorDefinitions("bulk").map((row) => ({
        pattern: row.pattern,
        allowedSubtypes: row.allowedSubtypes,
      }));
    });

    expect(result).toEqual([
      { pattern: "squat", allowedSubtypes: ["squat"] },
      { pattern: "hinge", allowedSubtypes: ["hinge"] },
      { pattern: "horizontalPush", allowedSubtypes: ["horizontalPush"] },
      { pattern: "verticalPush", allowedSubtypes: ["verticalPush"] },
      { pattern: "verticalPull", allowedSubtypes: ["verticalPull"] },
      { pattern: "horizontalPull", allowedSubtypes: ["horizontalPull"] },
      { pattern: "carry", allowedSubtypes: ["carry"] },
    ]);
  });

  test("invalid phase falls back to the current non-bulk anchor model", async ({ page }) => {
    await goto(page, "/");

    const result = await page.evaluate(async () => {
      const config = await import("/src/strength/v2/strengthSignalV2AnchorConfig.ts");
      return config.getStrengthSignalV2AnchorDefinitions("not-a-real-phase").map((row) => row.pattern);
    });

    expect(result).toEqual(["push", "pull", "hinge", "squat"]);
  });

  test("selectBestAnchor chooses the latest candidate among the highest-ranked matches", async ({ page }) => {
    await goto(page, "/");

    const result = await page.evaluate(async () => {
      const strengthV2 = await import("/src/strength/v2/computeStrengthSignalV2.ts");

      return strengthV2.selectBestAnchor([
        {
          anchorId: "older-configured-anchor-id",
          exerciseId: "older-configured-exercise-id",
          reason: "configured_match",
          matchRank: 1,
          occurredAt: 1_000,
        },
        {
          anchorId: "newer-configured-anchor-id",
          exerciseId: "newer-configured-exercise-id",
          reason: "configured_match",
          matchRank: 1,
          occurredAt: 2_000,
        },
        {
          anchorId: "primary-anchor-id",
          exerciseId: "primary-exercise-id",
          reason: "primary_auto_selected",
          matchRank: 2,
          occurredAt: 9_000,
        },
      ]);
    });

    expect(result).toEqual({
      anchorId: "newer-configured-anchor-id",
      exerciseId: "newer-configured-exercise-id",
      reason: "configured_match",
    });
  });

  test("selectBestAnchor returns null when no valid match exists", async ({ page }) => {
    await goto(page, "/");

    const result = await page.evaluate(async () => {
      const strengthV2 = await import("/src/strength/v2/computeStrengthSignalV2.ts");
      return strengthV2.selectBestAnchor([]);
    });

    expect(result).toBeNull();
  });

  test("computeStrengthSignalV2 selects the configured anchor when valid data exists", async ({ page }) => {
    const result = await page.evaluate(async () => {
      // @ts-ignore
      const db = window.__db;
      if (!db) throw new Error("__db missing on window.");

      const { setCurrentPhase, setStrengthSignalConfig } = await import("/src/config/appConfig.ts");
      const strengthV2 = await import("/src/strength/v2/computeStrengthSignalV2.ts");

      const now = Date.now();
      const sessionId = crypto.randomUUID();
      const configuredExerciseId = "configured-hinge-id";
      const fallbackExerciseId = "fallback-hinge-id";
      const configuredTrackId = crypto.randomUUID();
      const fallbackTrackId = crypto.randomUUID();

      await setCurrentPhase("cut");
      await setStrengthSignalConfig({
        activeVersion: "v2",
        strengthSignalV2Config: {
          phases: {
            cut: {
              hinge: configuredExerciseId,
            },
          },
        },
      });

      await db.sessions.add({
        id: sessionId,
        startedAt: now - 60_000,
        endedAt: now,
      });

      await db.exercises.bulkAdd([
        {
          id: configuredExerciseId,
          name: "Barbell RDL",
          normalizedName: "barbell rdl",
          anchorEligibility: "conditional",
          anchorSubtypes: ["hinge"],
          equipmentTags: ["barbell"],
          createdAt: now,
          updatedAt: now,
        },
        {
          id: fallbackExerciseId,
          name: "Conventional Deadlift",
          normalizedName: "conventional deadlift",
          anchorEligibility: "primary",
          anchorSubtypes: ["hinge"],
          equipmentTags: ["barbell"],
          createdAt: now,
          updatedAt: now,
        },
      ]);

      await db.tracks.bulkAdd([
        {
          id: configuredTrackId,
          exerciseId: configuredExerciseId,
          displayName: "Barbell RDL",
          trackType: "hypertrophy",
          trackingMode: "weightedReps",
          warmupSetsDefault: 0,
          workingSetsDefault: 2,
          repMin: 6,
          repMax: 10,
          restSecondsDefault: 120,
          weightJumpDefault: 5,
          createdAt: now,
        },
        {
          id: fallbackTrackId,
          exerciseId: fallbackExerciseId,
          displayName: "Conventional Deadlift",
          trackType: "hypertrophy",
          trackingMode: "weightedReps",
          warmupSetsDefault: 0,
          workingSetsDefault: 2,
          repMin: 3,
          repMax: 8,
          restSecondsDefault: 120,
          weightJumpDefault: 10,
          createdAt: now,
        },
      ]);

      await db.sets.bulkAdd([
        {
          id: crypto.randomUUID(),
          sessionId,
          trackId: configuredTrackId,
          setType: "working",
          weight: 225,
          reps: 8,
          createdAt: now - 5_000,
          completedAt: now - 5_000,
        },
        {
          id: crypto.randomUUID(),
          sessionId,
          trackId: fallbackTrackId,
          setType: "working",
          weight: 315,
          reps: 5,
          createdAt: now - 1_000,
          completedAt: now - 1_000,
        },
      ]);

      const signal = await strengthV2.computeStrengthSignalV2({ now });
      const anchor = signal.anchors.hinge ?? null;

      return {
        exerciseId: anchor?.exerciseId ?? null,
        exerciseName: anchor?.exerciseName ?? null,
        selectionSource: anchor?.selectionSource ?? null,
      };
    });

    expect(result).toEqual({
      exerciseId: "configured-hinge-id",
      exerciseName: "Barbell RDL",
      selectionSource: "CONFIGURED",
    });
  });

  test("computeStrengthSignalV2 selects the exact fallback-name anchor when configured id is unavailable", async ({ page }) => {
    const result = await page.evaluate(async () => {
      // @ts-ignore
      const db = window.__db;
      if (!db) throw new Error("__db missing on window.");

      const { setCurrentPhase, setStrengthSignalConfig } = await import("/src/config/appConfig.ts");
      const strengthV2 = await import("/src/strength/v2/computeStrengthSignalV2.ts");

      const now = Date.now();
      const sessionId = crypto.randomUUID();
      const namedExerciseId = crypto.randomUUID();
      const otherExerciseId = crypto.randomUUID();
      const namedTrackId = crypto.randomUUID();
      const otherTrackId = crypto.randomUUID();

      await setCurrentPhase("cut");
      await setStrengthSignalConfig({
        activeVersion: "v2",
        strengthSignalV2Config: {
          phases: {
            cut: {
              hinge: {
                exerciseName: "Romanian Deadlift",
              },
            },
          },
        },
      });

      await db.sessions.add({
        id: sessionId,
        startedAt: now - 60_000,
        endedAt: now,
      });

      await db.exercises.bulkAdd([
        {
          id: namedExerciseId,
          name: "Romanian Deadlift",
          normalizedName: "romanian deadlift",
          anchorEligibility: "conditional",
          anchorSubtypes: ["hinge"],
          equipmentTags: ["barbell"],
          createdAt: now,
          updatedAt: now,
        },
        {
          id: otherExerciseId,
          name: "Good Morning",
          normalizedName: "good morning",
          anchorEligibility: "primary",
          anchorSubtypes: ["hinge"],
          equipmentTags: ["barbell"],
          createdAt: now,
          updatedAt: now,
        },
      ]);

      await db.tracks.bulkAdd([
        {
          id: namedTrackId,
          exerciseId: namedExerciseId,
          displayName: "Romanian Deadlift",
          trackType: "hypertrophy",
          trackingMode: "weightedReps",
          warmupSetsDefault: 0,
          workingSetsDefault: 2,
          repMin: 6,
          repMax: 10,
          restSecondsDefault: 120,
          weightJumpDefault: 5,
          createdAt: now,
        },
        {
          id: otherTrackId,
          exerciseId: otherExerciseId,
          displayName: "Good Morning",
          trackType: "hypertrophy",
          trackingMode: "weightedReps",
          warmupSetsDefault: 0,
          workingSetsDefault: 2,
          repMin: 6,
          repMax: 10,
          restSecondsDefault: 120,
          weightJumpDefault: 5,
          createdAt: now,
        },
      ]);

      await db.sets.bulkAdd([
        {
          id: crypto.randomUUID(),
          sessionId,
          trackId: namedTrackId,
          setType: "working",
          weight: 205,
          reps: 8,
          createdAt: now - 5_000,
          completedAt: now - 5_000,
        },
        {
          id: crypto.randomUUID(),
          sessionId,
          trackId: otherTrackId,
          setType: "working",
          weight: 185,
          reps: 10,
          createdAt: now - 1_000,
          completedAt: now - 1_000,
        },
      ]);

      const signal = await strengthV2.computeStrengthSignalV2({ now });
      const anchor = signal.anchors.hinge ?? null;

      return {
        exerciseName: anchor?.exerciseName ?? null,
        selectionSource: anchor?.selectionSource ?? null,
      };
    });

    expect(result).toEqual({
      exerciseName: "Romanian Deadlift",
      selectionSource: "CONFIGURED",
    });
  });

  test("computeStrengthSignalV2 leaves the anchor unresolved when no valid candidate exists", async ({ page }) => {
    const result = await page.evaluate(async () => {
      // @ts-ignore
      const db = window.__db;
      if (!db) throw new Error("__db missing on window.");

      const { setCurrentPhase, setStrengthSignalConfig } = await import("/src/config/appConfig.ts");
      const strengthV2 = await import("/src/strength/v2/computeStrengthSignalV2.ts");

      const now = Date.now();
      const sessionId = crypto.randomUUID();
      const exerciseId = crypto.randomUUID();
      const trackId = crypto.randomUUID();

      await setCurrentPhase("cut");
      await setStrengthSignalConfig({
        activeVersion: "v2",
        strengthSignalV2Config: {
          phases: {
            cut: {
              hinge: {
                exerciseName: "Romanian Deadlift",
              },
            },
          },
        },
      });

      await db.sessions.add({
        id: sessionId,
        startedAt: now - 60_000,
        endedAt: now,
      });

      await db.exercises.add({
        id: exerciseId,
        name: "Romanian Deadlift",
        normalizedName: "romanian deadlift",
        anchorEligibility: "none",
        anchorSubtypes: ["hinge"],
        equipmentTags: ["barbell"],
        createdAt: now,
        updatedAt: now,
      });

      await db.tracks.add({
        id: trackId,
        exerciseId,
        displayName: "Romanian Deadlift",
        trackType: "hypertrophy",
        trackingMode: "weightedReps",
        warmupSetsDefault: 0,
        workingSetsDefault: 2,
        repMin: 6,
        repMax: 10,
        restSecondsDefault: 120,
        weightJumpDefault: 5,
        createdAt: now,
      });

      await db.sets.add({
        id: crypto.randomUUID(),
        sessionId,
        trackId,
        setType: "working",
        weight: 205,
        reps: 8,
        createdAt: now - 1_000,
        completedAt: now - 1_000,
      });

      const signal = await strengthV2.computeStrengthSignalV2({ now });
      const anchor = signal.anchors.hinge ?? null;

      return {
        exerciseId: anchor?.exerciseId ?? null,
        exerciseName: anchor?.exerciseName ?? null,
        dataPoints: anchor?.dataPoints ?? null,
        selectionSource: anchor?.selectionSource ?? null,
      };
    });

    expect(result).toEqual({
      exerciseId: null,
      exerciseName: null,
      dataPoints: 0,
      selectionSource: "AUTO_SELECTED",
    });
  });

  test("computeStrengthSignalV2 resolves only the 4-anchor model in CUT and MAINTAIN", async ({ page }) => {
    const result = await page.evaluate(async () => {
      // @ts-ignore
      const db = window.__db;
      if (!db) throw new Error("__db missing on window.");

      const { setCurrentPhase, setStrengthSignalConfig } = await import("/src/config/appConfig.ts");
      const strengthV2 = await import("/src/strength/v2/computeStrengthSignalV2.ts");

      const now = Date.now();
      const sessionId = crypto.randomUUID();
      const patterns = [
        { id: "push-id", name: "Bench Press", subtype: "horizontalPush", weight: 205, reps: 8 },
        { id: "pull-id", name: "Pull Up", subtype: "verticalPull", weight: 25, reps: 6 },
        { id: "hinge-id", name: "Romanian Deadlift", subtype: "hinge", weight: 275, reps: 8 },
        { id: "squat-id", name: "Front Squat", subtype: "squat", weight: 225, reps: 6 },
        { id: "carry-id", name: "Farmer Carry", subtype: "carry", weight: 90, reps: 1 },
      ];

      await setStrengthSignalConfig({
        activeVersion: "v2",
        strengthSignalV2Config: { phases: {} },
      });

      await db.sessions.add({
        id: sessionId,
        startedAt: now - 60_000,
        endedAt: now,
      });

      await db.exercises.bulkAdd(
        patterns.map((pattern) => ({
          id: pattern.id,
          name: pattern.name,
          normalizedName: pattern.name.toLowerCase(),
          anchorEligibility: "primary",
          anchorSubtypes: [pattern.subtype],
          equipmentTags: ["test"],
          createdAt: now,
          updatedAt: now,
        }))
      );

      await db.tracks.bulkAdd(
        patterns.map((pattern) => ({
          id: `${pattern.id}-track`,
          exerciseId: pattern.id,
          displayName: pattern.name,
          trackType: "hypertrophy",
          trackingMode: "weightedReps",
          warmupSetsDefault: 0,
          workingSetsDefault: 2,
          repMin: 1,
          repMax: 10,
          restSecondsDefault: 120,
          weightJumpDefault: 5,
          createdAt: now,
        }))
      );

      await db.sets.bulkAdd(
        patterns.map((pattern, index) => ({
          id: crypto.randomUUID(),
          sessionId,
          trackId: `${pattern.id}-track`,
          setType: "working",
          weight: pattern.weight,
          reps: pattern.reps,
          createdAt: now - (index + 1) * 1_000,
          completedAt: now - (index + 1) * 1_000,
        }))
      );

      await setCurrentPhase("cut");
      const cut = await strengthV2.computeStrengthSignalV2({ now });

      await setCurrentPhase("maintain");
      const maintain = await strengthV2.computeStrengthSignalV2({ now });

      return {
        cutKeys: Object.keys(cut.anchors).sort(),
        maintainKeys: Object.keys(maintain.anchors).sort(),
        cutCarry: cut.anchors.carry?.exerciseName ?? null,
        maintainCarry: maintain.anchors.carry?.exerciseName ?? null,
      };
    });

    expect(result.cutKeys).toEqual(["hinge", "pull", "push", "squat"]);
    expect(result.maintainKeys).toEqual(["hinge", "pull", "push", "squat"]);
    expect(result.cutCarry).toBeNull();
    expect(result.maintainCarry).toBeNull();
  });

  test("computeStrengthSignalV2 resolves the broader BULK anchor model", async ({ page }) => {
    const result = await page.evaluate(async () => {
      // @ts-ignore
      const db = window.__db;
      if (!db) throw new Error("__db missing on window.");

      const { setCurrentPhase, setStrengthSignalConfig } = await import("/src/config/appConfig.ts");
      const strengthV2 = await import("/src/strength/v2/computeStrengthSignalV2.ts");

      const now = Date.now();
      const sessionId = crypto.randomUUID();
      const patterns = [
        { id: "squat-id", name: "Front Squat", subtype: "squat", weight: 225, reps: 6 },
        { id: "hinge-id", name: "Romanian Deadlift", subtype: "hinge", weight: 275, reps: 8 },
        { id: "hpush-id", name: "Bench Press", subtype: "horizontalPush", weight: 205, reps: 8 },
        { id: "vpush-id", name: "Overhead Press", subtype: "verticalPush", weight: 135, reps: 6 },
        { id: "vpull-id", name: "Pull Up", subtype: "verticalPull", weight: 25, reps: 6 },
        { id: "hpull-id", name: "Barbell Row", subtype: "horizontalPull", weight: 185, reps: 8 },
        { id: "carry-id", name: "Farmer Carry", subtype: "carry", weight: 90, reps: 1 },
      ];

      await setStrengthSignalConfig({
        activeVersion: "v2",
        strengthSignalV2Config: { phases: {} },
      });
      await setCurrentPhase("bulk");

      await db.sessions.add({
        id: sessionId,
        startedAt: now - 60_000,
        endedAt: now,
      });

      await db.exercises.bulkAdd(
        patterns.map((pattern) => ({
          id: pattern.id,
          name: pattern.name,
          normalizedName: pattern.name.toLowerCase(),
          anchorEligibility: "primary",
          anchorSubtypes: [pattern.subtype],
          equipmentTags: ["test"],
          createdAt: now,
          updatedAt: now,
        }))
      );

      await db.tracks.bulkAdd(
        patterns.map((pattern) => ({
          id: `${pattern.id}-track`,
          exerciseId: pattern.id,
          displayName: pattern.name,
          trackType: "hypertrophy",
          trackingMode: "weightedReps",
          warmupSetsDefault: 0,
          workingSetsDefault: 2,
          repMin: 1,
          repMax: 10,
          restSecondsDefault: 120,
          weightJumpDefault: 5,
          createdAt: now,
        }))
      );

      await db.sets.bulkAdd(
        patterns.map((pattern, index) => ({
          id: crypto.randomUUID(),
          sessionId,
          trackId: `${pattern.id}-track`,
          setType: "working",
          weight: pattern.weight,
          reps: pattern.reps,
          createdAt: now - (index + 1) * 1_000,
          completedAt: now - (index + 1) * 1_000,
        }))
      );

      const bulk = await strengthV2.computeStrengthSignalV2({ now });

      return {
        bulkKeys: Object.keys(bulk.anchors).sort(),
        carryName: bulk.anchors.carry?.exerciseName ?? null,
      };
    });

    expect(result.bulkKeys).toEqual([
      "carry",
      "hinge",
      "horizontalPull",
      "horizontalPush",
      "squat",
      "verticalPull",
      "verticalPush",
    ]);
    expect(result.carryName).toBe("Farmer Carry");
  });

  test("a BULK-only anchor does not appear in CUT or MAINTAIN full-path results", async ({ page }) => {
    const result = await page.evaluate(async () => {
      // @ts-ignore
      const db = window.__db;
      if (!db) throw new Error("__db missing on window.");

      const { setCurrentPhase, setStrengthSignalConfig } = await import("/src/config/appConfig.ts");
      const strengthV2 = await import("/src/strength/v2/computeStrengthSignalV2.ts");

      const now = Date.now();
      const sessionId = crypto.randomUUID();

      await setStrengthSignalConfig({
        activeVersion: "v2",
        strengthSignalV2Config: { phases: {} },
      });

      await db.sessions.add({
        id: sessionId,
        startedAt: now - 60_000,
        endedAt: now,
      });

      await db.exercises.add({
        id: "carry-id",
        name: "Farmer Carry",
        normalizedName: "farmer carry",
        anchorEligibility: "primary",
        anchorSubtypes: ["carry"],
        equipmentTags: ["test"],
        createdAt: now,
        updatedAt: now,
      });

      await db.tracks.add({
        id: "carry-track",
        exerciseId: "carry-id",
        displayName: "Farmer Carry",
        trackType: "hypertrophy",
        trackingMode: "weightedReps",
        warmupSetsDefault: 0,
        workingSetsDefault: 2,
        repMin: 1,
        repMax: 10,
        restSecondsDefault: 120,
        weightJumpDefault: 5,
        createdAt: now,
      });

      await db.sets.add({
        id: crypto.randomUUID(),
        sessionId,
        trackId: "carry-track",
        setType: "working",
        weight: 90,
        reps: 1,
        createdAt: now - 1_000,
        completedAt: now - 1_000,
      });

      await setCurrentPhase("cut");
      const cut = await strengthV2.computeStrengthSignalV2({ now });

      await setCurrentPhase("maintain");
      const maintain = await strengthV2.computeStrengthSignalV2({ now });

      return {
        cutHasCarryKey: Object.prototype.hasOwnProperty.call(cut.anchors, "carry"),
        maintainHasCarryKey: Object.prototype.hasOwnProperty.call(maintain.anchors, "carry"),
        cutCarryName: cut.anchors.carry?.exerciseName ?? null,
        maintainCarryName: maintain.anchors.carry?.exerciseName ?? null,
      };
    });

    expect(result).toEqual({
      cutHasCarryKey: false,
      maintainHasCarryKey: false,
      cutCarryName: null,
      maintainCarryName: null,
    });
  });
});
