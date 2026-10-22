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
  const session: any = { id: "cardio", templateName: "Greenway", activityType: "walk", conditioningIntent: "fitness", cardioFormat: "continuous", startedAt: Date.now() - 1000, endedAt: Date.now(), notes: "Notes: Weather was cool.", cardioMetrics: { distance: 4.1, distanceUnit: "mi", durationSeconds: 4620, avgHrBpm: 112, maxHrBpm: 128, elevationGain: 210, elevationUnit: "ft", routeId: "route-1", routeName: "Suwanee Greenway", source: "MapMyWalk" } };
  const exercise: any = { id: "walk", name: "Outdoor Walk" };
  const track: any = { id: "track", exerciseId: "walk", displayName: "Outdoor Walk", trackType: "conditioning" };
  const set: any = { id: "set", sessionId: "cardio", trackId: "track", setType: "working", distance: 1, distanceUnit: "m", seconds: 1, createdAt: session.startedAt };
  const summary = buildCardioWalkSummary({ sessions: [session], sets: [set], tracks: [track], exercises: [exercise], now: Date.now() });
  const event = summary.normalizedWalks[0];
  expect(event).toMatchObject({ distance: 4.1, distanceUnit: "mi", durationSeconds: 4620, avgHr: 112, maxHr: 128, routeId: "route-1", route: "Suwanee Greenway", source: "MapMyWalk" });
  expect(event.paceSecondsPerMile).toBeCloseTo(4620 / 4.1, 6);
  const exported = buildCardioExportText(summary, { generatedAt: "2026-10-22" });
  expect(exported).toContain("Distance 4.1 mi"); expect(exported).toContain("Average HR 112 bpm"); expect(exported).toContain("Maximum HR 128 bpm"); expect(exported).toContain("Elevation Gain 210 ft"); expect(exported).toContain("Route ID route-1"); expect(exported).toContain("Route Name Suwanee Greenway"); expect(exported).toContain("Source MapMyWalk");
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
