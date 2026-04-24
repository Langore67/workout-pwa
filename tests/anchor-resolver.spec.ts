import { test, expect, type Page } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173/";

async function goto(page: Page, path: string) {
  await page.goto(new URL(path, BASE_URL).toString(), { waitUntil: "domcontentloaded" });
}

test.describe("Strength Signal v2 anchor resolver", () => {
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
});
