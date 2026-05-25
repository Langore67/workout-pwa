import { expect, test } from "@playwright/test";
import { formatWeightedRepsSetDisplay } from "../src/domain/coaching/setDisplay";
import { resetDexieDb } from "./helpers/dbSeed";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173";

test("mixed parser/export trust fixture keeps recent parser and export fixes working together", async ({
  page,
}) => {
  await page.goto(new URL("/", BASE_URL).toString(), { waitUntil: "domcontentloaded" });
  await resetDexieDb(page);

  await page.goto(new URL("/paste-workout", BASE_URL).toString(), {
    waitUntil: "domcontentloaded",
  });
  await page.getByRole("textbox").first().fill(`Session: Mixed Parser Export Trust
Date: 2026-05-25
Start: 07:20
End: 09:23

Banded Pull Apart
mobility BWx15
mobility BWx15

Assisted Pull Up
warmup -60x10
work -45x8 @2 RIR
work -40x6 @2 RIR

Barbell Bench Press
warmup 45x10
work 135x8 @2 RIR

Roman Chair Leg Lift
work BWx12

Walk
conditioning 1.25km
conditioning duration 12:30

Avg HR 115
Max HR 144
Steps 1800
Calories 95
Elevation gain 12m
Avg cadence 112 spm
Pace 10:00/km

Session Notes:
- no back pain
- no knee pain
- shoulder stayed quiet
- no traps
- no irritation
- no shoulder pain but elbow irritation on rep 12`);

  await page.getByRole("button", { name: "Parse Preview" }).click();

  await expect(page.getByText(/Exercise has no parsed sets/i)).toHaveCount(0);
  await expect(page.getByText(/Unsupported set format/i)).toHaveCount(0);
  await expect(page.getByText(/Logged as mobility work\. Excluded from strength metrics\./i)).toBeVisible();
  await expect(page.getByText(/Logged as conditioning work\. Excluded from strength metrics\./i)).toBeVisible();

  await page.getByLabel(/Dry run/i).uncheck();
  await page.getByRole("button", { name: "Import Now" }).click();
  await expect(page.getByText(/Imported/i)).toBeVisible();

  const imported = await page.evaluate(async () => {
    // @ts-ignore
    const db = window.__db;
    if (!db) throw new Error("__db missing on window.");

    const session = (await db.sessions.toArray()).find(
      (row: any) => row.templateName === "Mixed Parser Export Trust"
    );
    if (!session) throw new Error("Mixed Parser Export Trust session not found.");

    const sets = await db.sets.where("sessionId").equals(session.id).sortBy("createdAt");
    const tracks = await db.tracks.toArray();
    const exercises = await db.exercises.toArray();

    return {
      sessionNotes: session.notes,
      rows: sets.map((set: any) => {
        const track = tracks.find((row: any) => row.id === set.trackId);
        const exercise = exercises.find((row: any) => row.id === track?.exerciseId);
        return {
          exerciseName: exercise?.name,
          trackName: track?.displayName,
          trackType: track?.trackType,
          trackingMode: track?.trackingMode,
          setType: set.setType,
          weight: set.weight,
          reps: set.reps,
          rir: set.rir,
          seconds: set.seconds,
          distance: set.distance,
          distanceUnit: set.distanceUnit,
          notes: set.notes,
        };
      }),
    };
  });

  const intendedExercises = [
    "Assisted Pull Up",
    "Banded Pull Apart",
    "Barbell Bench Press",
    "Roman Chair Leg Lift",
    "Walk",
  ];
  const trackNames = Array.from(new Set(imported.rows.map((row: any) => row.trackName))).sort();
  expect(trackNames).toEqual(intendedExercises);

  for (const metadataLabel of [
    "Avg HR",
    "Max HR",
    "Steps",
    "Calories",
    "Elevation gain",
    "Avg cadence",
    "Pace",
  ]) {
    expect(trackNames).not.toContain(metadataLabel);
    expect(imported.sessionNotes).toContain(metadataLabel);
  }

  const assistedSets = imported.rows.filter((row: any) => row.trackName === "Assisted Pull Up");
  expect(assistedSets).toEqual([
    expect.objectContaining({ setType: "warmup", weight: -60, reps: 10 }),
    expect.objectContaining({ setType: "working", weight: -45, reps: 8, rir: 2 }),
    expect.objectContaining({ setType: "working", weight: -40, reps: 6, rir: 2 }),
  ]);

  const assistedExportLabels = assistedSets.map((set: any) =>
    formatWeightedRepsSetDisplay({
      weight: set.weight,
      reps: set.reps,
      rir: set.rir,
      useSignedBodyweightLoad: true,
      negativeBodyweightLoadFormat: "external",
    })
  );
  expect(assistedExportLabels).toEqual(["-60x10", "-45x8 @2", "-40x6 @2"]);
  expect(assistedExportLabels.join(" ")).not.toMatch(/BW-45|BWx8/i);

  expect(imported.rows).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        trackName: "Roman Chair Leg Lift",
        weight: 0,
        reps: 12,
        trackingMode: "repsOnly",
      }),
    ])
  );

  expect(imported.rows).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        trackName: "Walk",
        distance: 1250,
        distanceUnit: "m",
        trackType: "conditioning",
      }),
      expect.objectContaining({
        trackName: "Walk",
        seconds: 750,
        trackType: "conditioning",
        trackingMode: "timeSeconds",
      }),
    ])
  );

  const mobilityRows = imported.rows.filter((row: any) => row.trackName === "Banded Pull Apart");
  expect(mobilityRows).toEqual([
    expect.objectContaining({ trackType: "mobility", trackingMode: "repsOnly", weight: 0, reps: 15 }),
    expect.objectContaining({ trackType: "mobility", trackingMode: "repsOnly", weight: 0, reps: 15 }),
  ]);
  const mobilityRecommendation = await page.evaluate(async (rows) => {
    const { getNextWorkingRecommendation } = await import(
      "/src/domain/coaching/nextWorkingRecommendation.ts"
    );
    return getNextWorkingRecommendation({
      trackId: "banded-pull-apart",
      trackType: "mobility",
      trackingMode: "repsOnly",
      recentSets: rows.map((row: any, index: number) => ({
        weight: row.weight,
        reps: row.reps,
        completed: true,
        timestamp: index + 1,
      })),
    });
  }, mobilityRows);
  expect(mobilityRecommendation.action).toBe("hold");
  expect(mobilityRecommendation.rationale).not.toMatch(/weighted set|rebuild/i);

  const signals = await page.evaluate(({ sessionNotes, exerciseNames, rows }) => {
    return import("/src/domain/coaching/sessionSnapshot.ts").then(({ buildSessionCoachingSignals }) =>
      buildSessionCoachingSignals({
        sessionNotes,
        totalExercises: exerciseNames.length,
        completedExercises: exerciseNames.length,
        currentTrack: {
          displayName: "Barbell Bench Press",
          trackType: "strength",
          trackingMode: "weightedReps",
        },
        currentRecommendation: null,
        trackSummaries: exerciseNames.map((name: string) => ({
          displayName: name,
          trackType: name === "Walk" ? "conditioning" : name === "Banded Pull Apart" ? "mobility" : "strength",
          trackingMode:
            name === "Walk"
              ? "timeSeconds"
              : name === "Banded Pull Apart"
                ? "repsOnly"
                : "weightedReps",
          completedSets: rows
            .filter((row: any) => row.trackName === name)
            .map((row: any) => `${row.weight ?? "BW"} x ${row.reps ?? row.seconds ?? row.distance ?? "set"}`),
        })),
      })
    );
  }, {
    sessionNotes: imported.sessionNotes,
    exerciseNames: intendedExercises,
    rows: imported.rows,
  });

  const combinedSignals = [
    signals.readiness,
    ...signals.focusFlags,
    ...signals.fatigueReadiness,
    ...signals.carryForward,
    ...signals.nextWorkoutFocus,
    ...signals.discussWithCoach,
  ].join(" | ");

  expect(combinedSignals).not.toContain("Back pain");
  expect(combinedSignals).not.toContain("Knee pain");
  expect(combinedSignals).not.toContain("Shoulder pain");
  expect(combinedSignals).not.toMatch(/trap compensation|trap takeover/i);
  expect(combinedSignals).toContain("Elbow irritation");
});
