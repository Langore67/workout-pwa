import { expect, test } from "@playwright/test";
import { parseStructuredCardioMetrics, validateCardioMetrics } from "../src/lib/cardio/cardioMetrics";
import { buildCardioWalkSummary } from "../src/lib/cardio/buildCardioWalkSummary";
import { buildCardioExportText } from "../src/lib/cardio/buildCardioExportText";
import { resetDexieDb } from "./helpers/dbSeed";

const CARDIO_TEXT = `IF Workout
Format Version: 1
Session: Suwanee Greenway Walk
Activity Type: Walk
Intent: Fitness
Cardio Format: Continuous
Distance: 4.10 mi
Duration: 1:17:00
Average HR: 112 bpm
Maximum HR: 128 bpm
Elevation Gain: 210 ft
Route ID: suwanee-greenway-standard
Route Name: Suwanee Greenway
Source: MapMyWalk
Date: 2026-10-21

Outdoor Walk
conditioning BWx4.10mi

Session Notes:
- Weather was cool and comfortable.`;

test("structured cardio parser preserves explicit measurements, precision, units, route, and provenance without mutating input", () => {
  const source = { distance: 4.1, distanceUnit: "mi" as const, avgHrBpm: 112, maxHrBpm: 128 };
  expect(validateCardioMetrics(source)).toMatchObject({ ok: true });
  expect(source).toEqual({ distance: 4.1, distanceUnit: "mi", avgHrBpm: 112, maxHrBpm: 128 });
  expect(parseStructuredCardioMetrics(CARDIO_TEXT).metrics).toEqual({ distance: 4.1, distanceUnit: "mi", durationSeconds: 4620, avgHrBpm: 112, maxHrBpm: 128, elevationGain: 210, elevationUnit: "ft", routeId: "suwanee-greenway-standard", routeName: "Suwanee Greenway", source: "MapMyWalk" });
});

test("validation rejects unsafe bounds, contradictions, missing units, and invalid explicit syntax", () => {
  expect(validateCardioMetrics({ avgHrBpm: 301 })).toMatchObject({ ok: false });
  expect(validateCardioMetrics({ avgHrBpm: 140, maxHrBpm: 120 })).toMatchObject({ ok: false, issues: expect.arrayContaining([expect.stringContaining("cannot be lower")]) });
  expect(parseStructuredCardioMetrics("Distance: 4.1\nDuration: zero\nAverage HR: 112\nElevation Gain: -2 ft").issues).toHaveLength(4);
});

test("structured cardio parser distinguishes active, elapsed, and legacy durations", () => {
  expect(parseStructuredCardioMetrics("Active Duration: 57:30\nElapsed Duration: 1:03:15\nDuration: 1:00:00").metrics).toMatchObject({
    activeDurationSeconds: 3450,
    elapsedDurationSeconds: 3795,
    durationSeconds: 3600,
  });
  expect(parseStructuredCardioMetrics("Active Duration: 1:02:15\nElapsed Duration: 45:05").metrics).toEqual({
    activeDurationSeconds: 3735,
    elapsedDurationSeconds: 2705,
  });

  const invalid = parseStructuredCardioMetrics("Active Duration: 00:00\nElapsed Duration: nope");
  expect(invalid.metrics).toBeUndefined();
  expect(invalid.issues).toEqual([
    "Invalid Active Duration. Use MM:SS or HH:MM:SS.",
    "Invalid Elapsed Duration. Use MM:SS or HH:MM:SS.",
  ]);
  expect(validateCardioMetrics({ activeDurationSeconds: 0, elapsedDurationSeconds: -1 })).toMatchObject({ ok: false });
});

test("structured cardio parser validates aggregate provider, steps, energy, and HR-zone evidence", () => {
  const parsed = parseStructuredCardioMetrics(`Provider: MapMyWalk
Provider Workout ID: 987654321
Steps: 7214
Steps Source: Recorded
Energy: 401 kcal
HR Zone 3: 27:00
HR Zone 1: 18:00
HR Zone 2: 09:00
HR Zone 4: 06:00
HR Zone 5: 00:00
HR Zone Source: MapMyWalk display`);
  expect(parsed.metrics).toEqual({
    provider: "mapmywalk",
    providerWorkoutId: "987654321",
    steps: 7214,
    stepsSource: "recorded",
    energyKcal: 401,
    heartRateZones: {
      source: "MapMyWalk display",
      zones: [
        { zone: 1, seconds: 1080 },
        { zone: 2, seconds: 540 },
        { zone: 3, seconds: 1620 },
        { zone: 4, seconds: 360 },
      ],
    },
  });
  expect(parsed.recognizedLines.size).toBe(11);
  expect(parsed.issues).toContain("Invalid HR Zone 5. Use MM:SS or HH:MM:SS.");
  expect(validateCardioMetrics(parsed.metrics!)).toMatchObject({ ok: true });
  expect(parseStructuredCardioMetrics("Steps: 10\nSteps Source: Estimated").metrics).toMatchObject({ steps: 10, stepsSource: "estimated" });
  expect(parseStructuredCardioMetrics("Calories: 12.5 kcal").metrics).toEqual({ energyKcal: 12.5 });
});

test("invalid aggregate metadata is recognized without creating unsupported evidence", () => {
  const parsed = parseStructuredCardioMetrics(`Steps Source: Guessed
HR Zone 2: bad
HR Zone 2: 10:00
HR Zone 2: 11:00
HR Zone Source: Device`);
  expect(parsed.recognizedLines.size).toBe(5);
  expect(parsed.metrics).toEqual({ heartRateZones: { source: "Device", zones: [{ zone: 2, seconds: 600 }] } });
  expect(parsed.issues).toEqual(expect.arrayContaining([
    "Steps Source must be Recorded or Estimated.",
    "Invalid HR Zone 2. Use MM:SS or HH:MM:SS.",
    "HR Zone 2 is duplicated.",
  ]));
  expect(parseStructuredCardioMetrics("Steps Source: Recorded")).toMatchObject({ metrics: undefined, issues: ["Steps Source requires Steps."] });
  expect(validateCardioMetrics({ steps: 1.5, energyKcal: -1 })).toMatchObject({ ok: false });
});

test("Paste Workout and journal parsing share structured cardio metrics without leaking recognized lines", async ({ page }) => {
  await resetDexieDb(page);
  const text = `IF Workout
Format Version: 1
Session: Test Walk
Activity Type: Walk
Intent: Fitness
Cardio Format: Continuous
Distance: 3.50 mi
Duration: 1:00:00
Active Duration: 57:30
Elapsed Duration: 1:03:15
Average HR: 118 bpm
Maximum HR: 134 bpm
Elevation Gain: 180 ft
Route Name: Test Route
Provider: MapMyWalk
Provider Workout ID: 987654321
Source: MapMyWalk Screenshot
Steps: 7214
Steps Source: Recorded
Energy: 401 kcal
HR Zone 1: 18:00
HR Zone 2: 09:00
HR Zone 3: 27:00
HR Zone 4: 06:00
HR Zone Source: MapMyWalk display
Date: 2026-10-21

Outdoor Walk
conditioning BWx3.50mi

Session Notes:
- Comfortable weather.`;
  const parsed = await page.evaluate(async (source) => {
    const paste = await import("/src/pages/PasteWorkoutPage.tsx");
    const journal = await import("/src/importers/importSession.ts");
    return {
      paste: paste.parseWorkoutText(source),
      journal: journal.parseIfJournalText(source),
    };
  }, text);

  expect(parsed.paste.cardioMetrics).toEqual(parsed.journal.cardioMetrics);
  expect(parsed.paste.cardioMetrics).toMatchObject({
    distance: 3.5,
    distanceUnit: "mi",
    durationSeconds: 3600,
    activeDurationSeconds: 3450,
    elapsedDurationSeconds: 3795,
    avgHrBpm: 118,
    maxHrBpm: 134,
    elevationGain: 180,
    elevationUnit: "ft",
    routeName: "Test Route",
    source: "MapMyWalk Screenshot",
    provider: "mapmywalk",
    providerWorkoutId: "987654321",
    steps: 7214,
    stepsSource: "recorded",
    energyKcal: 401,
    heartRateZones: {
      source: "MapMyWalk display",
      zones: [
        { zone: 1, seconds: 1080 },
        { zone: 2, seconds: 540 },
        { zone: 3, seconds: 1620 },
        { zone: 4, seconds: 360 },
      ],
    },
  });
  expect(parsed.paste).toMatchObject({ activityType: "walk", conditioningIntent: "fitness", cardioFormat: "continuous" });
  expect(parsed.journal).toMatchObject({ activityType: "walk", conditioningIntent: "fitness", cardioFormat: "continuous" });
  expect(parsed.paste.sessionNotes).toBe("- Comfortable weather.");
  expect(parsed.journal.notes).toBe("- Comfortable weather.");
  expect(parsed.paste.exercises.map((entry: any) => entry.exercise)).toEqual(["Outdoor Walk"]);
  expect(parsed.journal.sets.map((entry: any) => entry.exerciseName)).toEqual(["Outdoor Walk"]);
});

test("cardio normalization uses active, legacy, set, elapsed, then timestamp duration precedence", () => {
  const startedAt = new Date(2026, 9, 21, 8, 0).getTime();
  const endedAt = startedAt + 5000 * 1000;
  const exercise: any = { id: "walk", name: "Outdoor Walk" };
  const track: any = { id: "track", exerciseId: "walk", displayName: "Outdoor Walk", trackType: "conditioning" };
  const build = (id: string, cardioMetrics: any, setSeconds?: number) => buildCardioWalkSummary({
    sessions: [{ id, templateName: "Walk", activityType: "walk", cardioFormat: "continuous", startedAt, endedAt, cardioMetrics } as any],
    sets: [{ id: `set-${id}`, sessionId: id, trackId: "track", setType: "working", distance: 1609.344, distanceUnit: "m", seconds: setSeconds, createdAt: startedAt } as any],
    tracks: [track],
    exercises: [exercise],
    now: endedAt,
  }).normalizedWalks[0];

  expect(build("active", { activeDurationSeconds: 3000, durationSeconds: 3200, elapsedDurationSeconds: 3600 }, 3400)).toMatchObject({ durationSeconds: 3000, elapsedDurationSeconds: 3600, paceSecondsPerMile: 3000, metricProvenance: { duration: "session_structured" } });
  expect(build("legacy", { durationSeconds: 3200, elapsedDurationSeconds: 3600 }, 3400).durationSeconds).toBe(3200);
  expect(build("set", { elapsedDurationSeconds: 3600 }, 3400).durationSeconds).toBe(3400);
  expect(build("elapsed", { elapsedDurationSeconds: 3600 }).durationSeconds).toBe(3600);
  expect(build("timestamp", undefined).durationSeconds).toBe(5000);
});

test("IF import persists structured metrics separately while retaining notes and existing session fields", async ({ page }) => {
  await resetDexieDb(page);
  const result = await page.evaluate(async (text) => {
    const importer = await import("/src/importers/importSession.ts");
    const parsed = importer.parseIfJournalText(text);
    const imported = await importer.importSessionFromJournal({ text });
    const session = await window.__db.sessions.get(imported.sessionId);
    return { parsed, session };
  }, CARDIO_TEXT);
  expect(result.parsed).toMatchObject({ activityType: "walk", conditioningIntent: "fitness", cardioFormat: "continuous" });
  expect(result.session?.cardioMetrics).toMatchObject({ distance: 4.1, distanceUnit: "mi", durationSeconds: 4620, avgHrBpm: 112, maxHrBpm: 128, elevationGain: 210, elevationUnit: "ft", routeId: "suwanee-greenway-standard", routeName: "Suwanee Greenway", source: "MapMyWalk" });
  expect(result.session?.notes).toContain("Weather was cool and comfortable.");
  expect(result.session?.notes).not.toContain("Average HR:");
});

test("summary and Cardio Export prefer structured facts, derive pace, and emit only available fields", () => {
  const session: any = {
    id: "cardio", templateName: "Greenway", activityType: "walk", conditioningIntent: "fitness", cardioFormat: "continuous",
    startedAt: Date.now() - 1000, endedAt: Date.now(), notes: "Notes: Weather was cool.",
    cardioMetrics: {
      distance: 4.1, distanceUnit: "mi", activeDurationSeconds: 4620, elapsedDurationSeconds: 4800,
      avgHrBpm: 112, maxHrBpm: 128, elevationGain: 210, elevationUnit: "ft", routeId: "route-1",
      routeName: "Suwanee Greenway", source: "MapMyWalk", provider: "mapmywalk", providerWorkoutId: "workout-1",
      steps: 7214, stepsSource: "recorded", energyKcal: 401,
      heartRateZones: { source: "MapMyWalk display", zones: [{ zone: 1, seconds: 1080 }, { zone: 2, seconds: 540 }] },
    },
  };
  const exercise: any = { id: "walk", name: "Outdoor Walk" };
  const track: any = { id: "track", exerciseId: "walk", displayName: "Outdoor Walk", trackType: "conditioning" };
  const set: any = { id: "set", sessionId: "cardio", trackId: "track", setType: "working", distance: 1, distanceUnit: "m", seconds: 1, createdAt: session.startedAt };
  const summary = buildCardioWalkSummary({ sessions: [session], sets: [set], tracks: [track], exercises: [exercise], now: Date.now() });
  const event = summary.normalizedWalks[0];
  expect(event).toMatchObject({
    distance: 4.1, distanceUnit: "mi", durationSeconds: 4620, elapsedDurationSeconds: 4800,
    avgHr: 112, maxHr: 128, routeId: "route-1", route: "Suwanee Greenway", source: "MapMyWalk",
    provider: "mapmywalk", providerWorkoutId: "workout-1", steps: 7214, stepsSource: "recorded", energyKcal: 401,
    heartRateZones: { source: "MapMyWalk display", zones: [{ zone: 1, seconds: 1080 }, { zone: 2, seconds: 540 }] },
  });
  expect(event.paceSecondsPerMile).toBeCloseTo(4620 / 4.1, 6);
  const exported = buildCardioExportText(summary, { generatedAt: "2026-10-22" });
  expect(exported).toContain("Distance 4.1 mi"); expect(exported).toContain("Average HR 112 bpm"); expect(exported).toContain("Maximum HR 128 bpm"); expect(exported).toContain("Elevation Gain 210 ft"); expect(exported).toContain("Route ID route-1"); expect(exported).toContain("Route Name Suwanee Greenway"); expect(exported).toContain("Source MapMyWalk");
  expect(exported).toContain("Provider: mapmywalk"); expect(exported).toContain("Provider Workout ID: workout-1"); expect(exported).toContain("Steps: 7214"); expect(exported).toContain("Steps Source: Recorded"); expect(exported).toContain("Energy: 401 kcal"); expect(exported).toContain("HR Zone 1: 18:00"); expect(exported).toContain("HR Zone 2: 9:00"); expect(exported).toContain("HR Zone Source: MapMyWalk display");
  expect(exported).not.toContain("HR Zone 3:");
});

test("legacy note-only cardio remains valid and absent structured fields infer no intent, format, or route", () => {
  const parsed = parseStructuredCardioMetrics("Source notes only\nSession Notes:\n- Route: do not promote this prose");
  expect(parsed.metrics).toBeUndefined();
  const session: any = { id: "legacy", templateName: "Walk", activityType: "walk", startedAt: Date.now(), endedAt: Date.now() + 3600000, notes: "Avg HR: 101 bpm\nRoute: Legacy Loop" };
  const track: any = { id: "t", exerciseId: "e", displayName: "Walk", trackType: "conditioning" };
  const summary = buildCardioWalkSummary({ sessions: [session], sets: [{ id: "s", sessionId: "legacy", trackId: "t", setType: "working", distance: 1609.344, distanceUnit: "m", createdAt: session.startedAt } as any], tracks: [track], exercises: [{ id: "e", name: "Walk" } as any] });
  expect(summary.normalizedWalks[0]).toMatchObject({ avgHr: 101, route: "Legacy Loop" });
  expect(summary.normalizedWalks[0].conditioningIntent).toBeUndefined(); expect(summary.normalizedWalks[0].cardioFormat).toBeUndefined();
});

test("structured metrics do not promote embedded treadmill warmups into dedicated cardio", () => {
  const session: any = { id: "mixed", templateName: "Upper A", activityType: "walk", startedAt: Date.now(), cardioMetrics: { durationSeconds: 600, avgHrBpm: 105 } };
  const tracks: any[] = [{ id: "strength", exerciseId: "bench", displayName: "Bench", trackType: "strength" }, { id: "treadmill", exerciseId: "walk", displayName: "Treadmill Walk", trackType: "conditioning" }];
  const sets: any[] = [{ id: "a", sessionId: "mixed", trackId: "strength", setType: "working", reps: 8 }, { id: "b", sessionId: "mixed", trackId: "treadmill", setType: "warmup", seconds: 600 }];
  const summary = buildCardioWalkSummary({ sessions: [session], sets, tracks, exercises: [{ id: "bench", name: "Bench" }, { id: "walk", name: "Treadmill Walk" }] as any });
  expect(summary.normalizedWalks).toEqual([]);
});
