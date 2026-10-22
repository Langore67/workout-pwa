import { expect, test } from "@playwright/test";
import {
  buildCardioProgressionContext,
  getAverageHrDirection,
  getCardioProgressionSignal,
  MAX_CARDIO_PROGRESSION_GROUPS,
  MAX_CARDIO_PROGRESSION_OBSERVATIONS,
} from "../src/lib/cardio/cardioProgressionContext";
import type { CardioWalkEvent } from "../src/lib/cardio/cardioTypes";

const DAY_MS = 24 * 60 * 60 * 1000;
const BASE = Date.UTC(2026, 8, 20, 12);

function event(id: string, daysAgo: number, overrides: Partial<CardioWalkEvent> = {}): CardioWalkEvent {
  const startedAt = BASE - daysAgo * DAY_MS;
  return {
    sessionId: id,
    startedAt,
    date: new Date(startedAt).toISOString().slice(0, 10),
    name: "PRP Walk",
    activityType: "walk",
    conditioningIntent: "fitness",
    cardioFormat: "continuous",
    paceSecondsPerMile: 1050 + daysAgo,
    durationSeconds: 3600,
    distanceMeters: 5600,
    confidence: "high",
    ...overrides,
  };
}

test("comparison groups preserve route, family, type, intent, and format isolation", () => {
  const context = buildCardioProgressionContext([
    event("prp-1", 1, { name: "PRP Fitness Walk" }),
    event("prp-2", 2, { name: "Walk - Peachtree Ridge Park" }),
    event("treadmill-1", 1, { name: "Treadmill Walk" }),
    event("treadmill-2", 2, { name: "Treadmill Recovery Walk", conditioningIntent: "recovery" }),
    event("park-city", 3, { name: "Park City Out-and-Back Hike", activityType: "hike", conditioningIntent: "adventure" }),
    event("west-rim", 4, { name: "West Rim Loop", activityType: "hike", conditioningIntent: "adventure" }),
    event("route-a", 5, { name: "Different Name A", route: "River Loop" }),
    event("route-b", 6, { name: "Different Name B", route: " river-loop " }),
    event("one-route", 7, { name: "PRP Walk", route: "PRP Outer Loop" }),
    event("no-route", 8, { name: "PRP Walk" }),
    event("interval", 9, { cardioFormat: "intervals" }),
    event("recovery", 10, { conditioningIntent: "recovery" }),
    event("run", 11, { activityType: "run" }),
  ]);

  const trended = context.recentComparableGroups.filter((group) => group.observations >= 2);
  expect(trended).toHaveLength(2);
  expect(trended.map((group) => group.routeFamily)).toEqual(expect.arrayContaining([
    "family:peachtree-ridge-park",
    "route:river loop",
  ]));
  expect(trended.flatMap((group) => group.recentObservations.map((row) => row.sessionId))).not.toEqual(
    expect.arrayContaining(["treadmill-1", "park-city", "west-rim", "one-route", "interval", "recovery", "run"])
  );
});

test("HR and pace directions use conservative shared thresholds", () => {
  const signal = (recentPace: number, priorPace: number, recentHr?: number, priorHr?: number) =>
    getCardioProgressionSignal(
      { paceSecondsPerMile: recentPace, avgHr: recentHr },
      { paceSecondsPerMile: priorPace, avgHr: priorHr }
    );

  expect(signal(700, 730, 130, 130)).toBe("lower");
  expect(signal(705, 700, 124, 130)).toBe("similar");
  expect(signal(730, 700, 124, 130)).toBe("higher");
  expect(signal(700, 700, 132, 130)).toBe("similar");
  expect(getAverageHrDirection(133, 130)).toBe("similar");
  expect(getAverageHrDirection(135, 130)).toBe("higher");
  expect(getAverageHrDirection(125, 130)).toBe("lower");
  expect(getAverageHrDirection(undefined, 130)).toBe("insufficient_context");
});

test("uses exact route identity, keeps structured facts, bounds lookback and groups, and does not mutate input", () => {
  const source = [
    event("exact-new", 1, { routeId: "greenway", route: "Suwanee Greenway", distance: 4.1, distanceUnit: "mi", avgHr: 112, maxHr: 128, elevationGain: 210, elevationUnit: "ft", source: "MapMyWalk" }),
    event("exact-old", 2, { routeId: "greenway", route: "Renamed display", avgHr: 116, elevationGain: 100, elevationUnit: "ft" }),
    event("stale", 29, { routeId: "greenway" }),
    ...["a", "b", "c", "d"].flatMap((route, index) => [event(`${route}-1`, index + 3, { routeId: route }), event(`${route}-2`, index + 8, { routeId: route })]),
  ];
  const snapshot = JSON.stringify(source);
  const context = buildCardioProgressionContext(source, { asOf: BASE });
  const exact = context.groups.find((group) => group.routeFamily === "route-id:greenway")!;

  expect(context.groups).toHaveLength(MAX_CARDIO_PROGRESSION_GROUPS);
  expect(exact.comparability).toBe("exact_route");
  expect(exact.observationCount).toBe(2);
  expect(exact.recent).toMatchObject({ distance: 4.1, distanceUnit: "mi", avgHrBpm: 112, maxHrBpm: 128, elevationGain: 210, elevationUnit: "ft", source: "MapMyWalk" });
  expect(exact.recentObservations.map((row) => row.sessionId)).toEqual(["exact-new", "exact-old"]);
  expect(exact.limitations).toContain("Elevation differs between the latest observations.");
  expect(JSON.stringify(source)).toBe(snapshot);
});

test("history is newest-first, capped, and excludes suspicious pace without altering source events", () => {
  const valid = Array.from({ length: 6 }, (_, index) => event(`valid-${index}`, index + 1));
  const suspicious = event("suspicious", 0, { paceSecondsPerMile: 40 * 60 });
  const source = [suspicious, ...valid];
  const context = buildCardioProgressionContext(source);
  const group = context.recentComparableGroups.find((row) => row.routeFamily === "family:peachtree-ridge-park")!;

  expect(group.observations).toBe(6);
  expect(group.recentObservations).toHaveLength(MAX_CARDIO_PROGRESSION_OBSERVATIONS);
  expect(group.recentObservations.map((row) => row.sessionId)).toEqual([
    "valid-0", "valid-1", "valid-2", "valid-3", "valid-4",
  ]);
  expect(source).toHaveLength(7);
  expect(source[0].sessionId).toBe("suspicious");
});

test("single observations and whole-session intervals remain factual without invented structure", () => {
  const context = buildCardioProgressionContext([
    event("continuous", 1),
    event("interval-1", 2, { name: "PRP Run/Walk Intervals", activityType: "run", cardioFormat: "intervals" }),
    event("interval-2", 3, { name: "PRP Run/Walk Intervals", activityType: "run", cardioFormat: "intervals" }),
  ]);
  const continuous = context.recentComparableGroups.find((group) => group.cardioFormat === "continuous")!;
  const intervals = context.recentComparableGroups.find((group) => group.cardioFormat === "intervals")!;

  expect(continuous.observations).toBe(1);
  expect(continuous.signal).toBe("insufficient_context");
  expect(intervals.observations).toBe(2);
  expect(intervals.recent).not.toHaveProperty("repeats");
  expect(intervals.recent).not.toHaveProperty("workInterval");
  expect(intervals.recent).not.toHaveProperty("recoveryInterval");
});
