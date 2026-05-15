import { expect, test } from "@playwright/test";
import { buildCardioWalkSummary } from "../src/lib/cardio/buildCardioWalkSummary";
import type { Exercise, Session, SetEntry, Track } from "../src/db";

function ms(year: number, month: number, day: number, hour: number, minute: number) {
  return new Date(year, month - 1, day, hour, minute, 0, 0).getTime();
}

function session(args: {
  id: string;
  name: string;
  startedAt?: number;
  endedAt?: number;
  notes?: string;
}): Session {
  return {
    id: args.id,
    templateName: args.name,
    startedAt: args.startedAt ?? ms(2026, 5, 13, 7, 30),
    endedAt: args.endedAt,
    notes: args.notes,
  };
}

function exercise(id: string, name: string, metricMode?: Exercise["metricMode"]): Exercise {
  return {
    id,
    name,
    normalizedName: name.toLowerCase(),
    metricMode,
    equipmentTags: [],
    createdAt: ms(2026, 5, 1, 9, 0),
  };
}

function track(args: {
  id: string;
  exerciseId: string;
  displayName: string;
  trackType?: Track["trackType"];
  trackingMode?: Track["trackingMode"];
}): Track {
  return {
    id: args.id,
    exerciseId: args.exerciseId,
    displayName: args.displayName,
    trackType: args.trackType ?? "conditioning",
    trackingMode: args.trackingMode ?? "repsOnly",
    warmupSetsDefault: 0,
    workingSetsDefault: 1,
    repMin: 1,
    repMax: 1,
    restSecondsDefault: 60,
    weightJumpDefault: 0,
    createdAt: ms(2026, 5, 1, 9, 0),
  };
}

function setEntry(args: {
  id: string;
  sessionId: string;
  trackId: string;
  distance?: number;
  distanceUnit?: "m" | "steps";
  seconds?: number;
  weight?: number;
  reps?: number;
}): SetEntry {
  return {
    id: args.id,
    sessionId: args.sessionId,
    trackId: args.trackId,
    createdAt: ms(2026, 5, 13, 7, 31),
    setType: "working",
    distance: args.distance,
    distanceUnit: args.distanceUnit,
    seconds: args.seconds,
    weight: args.weight,
    reps: args.reps,
    completedAt: ms(2026, 5, 13, 7, 31),
  };
}

const walkExercise = exercise("ex-walk", "Walk", "distance");
const walkDistanceTrack = track({
  id: "track-walk-distance",
  exerciseId: walkExercise.id,
  displayName: "Walk",
  trackingMode: "repsOnly",
});
const walkTimeTrack = track({
  id: "track-walk-time",
  exerciseId: walkExercise.id,
  displayName: "Walk",
  trackingMode: "timeSeconds",
});

test("Walk - MapMyWalk with distance and duration is included", () => {
  const summary = buildCardioWalkSummary({
    now: ms(2026, 5, 14, 0, 0),
    sessions: [
      session({
        id: "walk-1",
        name: "Walk - MapMyWalk",
        startedAt: ms(2026, 5, 13, 7, 30),
        endedAt: ms(2026, 5, 13, 8, 12),
      }),
    ],
    sets: [
      setEntry({ id: "set-distance", sessionId: "walk-1", trackId: walkDistanceTrack.id, distance: 5021.15328, distanceUnit: "m" }),
      setEntry({ id: "set-duration", sessionId: "walk-1", trackId: walkTimeTrack.id, seconds: 2520 }),
    ],
    tracks: [walkDistanceTrack, walkTimeTrack],
    exercises: [walkExercise],
  });

  expect(summary.normalizedWalks).toHaveLength(1);
  expect(summary.normalizedWalks[0]).toMatchObject({
    sessionId: "walk-1",
    name: "Walk - MapMyWalk",
    distanceMeters: 5021.15328,
    durationSeconds: 2520,
    confidence: "high",
  });
});

test("Route, pace, elevation, avg HR, and max HR are parsed from Session.notes", () => {
  const summary = buildCardioWalkSummary({
    now: ms(2026, 5, 14, 0, 0),
    sessions: [
      session({
        id: "walk-notes",
        name: "Walk - MapMyWalk",
        notes: [
          "Source: MapMyWalk screenshot",
          "Route: Neighborhood Loop",
          "Pace: 13:28/mi",
          "Elevation: 120 ft",
          "Avg HR: 112",
          "Max HR: 138",
          "Notes: optional",
        ].join("\n"),
      }),
    ],
    sets: [setEntry({ id: "set-duration", sessionId: "walk-notes", trackId: walkTimeTrack.id, seconds: 2520 })],
    tracks: [walkTimeTrack],
    exercises: [walkExercise],
  });

  expect(summary.normalizedWalks[0]).toMatchObject({
    source: "MapMyWalk screenshot",
    route: "Neighborhood Loop",
    paceSecondsPerMile: 808,
    elevationText: "120 ft",
    avgHr: 112,
    maxHr: 138,
  });
  expect(summary.normalizedWalks[0].notes).toContain("Notes: optional");
});

test("Pace derives from duration and distance when notes pace is missing", () => {
  const summary = buildCardioWalkSummary({
    now: ms(2026, 5, 14, 0, 0),
    sessions: [session({ id: "walk-derived-pace", name: "Walk - MapMyWalk" })],
    sets: [
      setEntry({ id: "set-distance", sessionId: "walk-derived-pace", trackId: walkDistanceTrack.id, distance: 3 * 1609.344, distanceUnit: "m" }),
      setEntry({ id: "set-duration", sessionId: "walk-derived-pace", trackId: walkTimeTrack.id, seconds: 3600 }),
    ],
    tracks: [walkDistanceTrack, walkTimeTrack],
    exercises: [walkExercise],
  });

  expect(summary.normalizedWalks[0].paceSecondsPerMile).toBe(1200);
});

test("Missing distance and duration stay undefined instead of becoming event zeroes", () => {
  const distanceMissing = buildCardioWalkSummary({
    now: ms(2026, 5, 14, 0, 0),
    sessions: [session({ id: "duration-only", name: "Walk - MapMyWalk" })],
    sets: [setEntry({ id: "set-duration", sessionId: "duration-only", trackId: walkTimeTrack.id, seconds: 1800 })],
    tracks: [walkTimeTrack],
    exercises: [walkExercise],
  });
  expect(distanceMissing.normalizedWalks[0].distanceMeters).toBeUndefined();
  expect(distanceMissing.dataQuality.missingDistanceCount).toBe(1);

  const durationMissing = buildCardioWalkSummary({
    now: ms(2026, 5, 14, 0, 0),
    sessions: [session({ id: "distance-only", name: "Walk - MapMyWalk", endedAt: undefined })],
    sets: [setEntry({ id: "set-distance", sessionId: "distance-only", trackId: walkDistanceTrack.id, distance: 1000, distanceUnit: "m" })],
    tracks: [walkDistanceTrack],
    exercises: [walkExercise],
  });
  expect(durationMissing.normalizedWalks[0].durationSeconds).toBeUndefined();
  expect(durationMissing.dataQuality.missingDurationCount).toBe(1);
});

test("false-positive walk-like strength, class, and generic conditioning sessions are excluded", () => {
  const strengthExercise = exercise("ex-strength", "Farmer's Walk");
  const lungeExercise = exercise("ex-lunge", "Walking Lunge");
  const walkoutExercise = exercise("ex-walkout", "Hamstring Walkouts");
  const airBikeExercise = exercise("ex-air-bike", "Air Bike", "time");
  const yogaExercise = exercise("ex-yoga", "Yoga Flow", "time");
  const falseTracks = [
    track({ id: "track-farmer", exerciseId: strengthExercise.id, displayName: "Farmer's Walk", trackType: "strength", trackingMode: "weightedReps" }),
    track({ id: "track-lunge", exerciseId: lungeExercise.id, displayName: "Walking Lunge", trackType: "conditioning", trackingMode: "timeSeconds" }),
    track({ id: "track-walkout", exerciseId: walkoutExercise.id, displayName: "Hamstring Walkouts", trackType: "conditioning", trackingMode: "timeSeconds" }),
    track({ id: "track-air-bike", exerciseId: airBikeExercise.id, displayName: "Air Bike", trackType: "conditioning", trackingMode: "timeSeconds" }),
    track({ id: "track-yoga", exerciseId: yogaExercise.id, displayName: "Yoga Flow", trackType: "mobility", trackingMode: "timeSeconds" }),
  ];
  const summary = buildCardioWalkSummary({
    now: ms(2026, 5, 14, 0, 0),
    sessions: [
      session({ id: "farmer", name: "Farmer's Walk" }),
      session({ id: "lunge", name: "Walking Lunge" }),
      session({ id: "walkout", name: "Walkout Mobility" }),
      session({ id: "bodybalance", name: "BodyBalance" }),
      session({ id: "yoga", name: "Yoga" }),
      session({ id: "core", name: "Core Class" }),
      session({ id: "generic", name: "Conditioning" }),
    ],
    sets: [
      setEntry({ id: "set-farmer", sessionId: "farmer", trackId: "track-farmer", weight: 50, reps: 40 }),
      setEntry({ id: "set-lunge", sessionId: "lunge", trackId: "track-lunge", seconds: 600 }),
      setEntry({ id: "set-walkout", sessionId: "walkout", trackId: "track-walkout", seconds: 600 }),
      setEntry({ id: "set-bodybalance", sessionId: "bodybalance", trackId: "track-yoga", seconds: 3600 }),
      setEntry({ id: "set-yoga", sessionId: "yoga", trackId: "track-yoga", seconds: 3600 }),
      setEntry({ id: "set-core", sessionId: "core", trackId: "track-yoga", seconds: 1800 }),
      setEntry({ id: "set-generic", sessionId: "generic", trackId: "track-air-bike", seconds: 1200 }),
    ],
    tracks: falseTracks,
    exercises: [strengthExercise, lungeExercise, walkoutExercise, airBikeExercise, yogaExercise],
  });

  expect(summary.normalizedWalks).toHaveLength(0);
});

test("multiple same-day walks remain separate events and roll up only in daily/window summaries", () => {
  const sessions = [
    session({
      id: "walk-treadmill",
      name: "Walk - Treadmill",
      startedAt: ms(2026, 5, 13, 9, 30),
      endedAt: ms(2026, 5, 13, 9, 50),
    }),
    session({
      id: "walk-park",
      name: "Walk - Park",
      startedAt: ms(2026, 5, 13, 13, 0),
      endedAt: ms(2026, 5, 13, 14, 0),
    }),
    session({
      id: "walk-mapmywalk",
      name: "Walk - MapMyWalk",
      startedAt: ms(2026, 5, 13, 17, 30),
      endedAt: ms(2026, 5, 13, 18, 30),
    }),
  ];
  const summary = buildCardioWalkSummary({
    now: ms(2026, 5, 14, 0, 0),
    recentLimit: 10,
    sessions,
    sets: [
      setEntry({ id: "set-treadmill-duration", sessionId: "walk-treadmill", trackId: walkTimeTrack.id, seconds: 1200 }),
      setEntry({ id: "set-park-duration", sessionId: "walk-park", trackId: walkTimeTrack.id, seconds: 3600 }),
      setEntry({ id: "set-map-distance", sessionId: "walk-mapmywalk", trackId: walkDistanceTrack.id, distance: 3 * 1609.344, distanceUnit: "m" }),
      setEntry({ id: "set-map-duration", sessionId: "walk-mapmywalk", trackId: walkTimeTrack.id, seconds: 3600 }),
    ],
    tracks: [walkDistanceTrack, walkTimeTrack],
    exercises: [walkExercise],
  });

  expect(summary.normalizedWalks).toHaveLength(3);
  expect(summary.recentWalks.map((walk) => walk.sessionId)).toEqual([
    "walk-mapmywalk",
    "walk-park",
    "walk-treadmill",
  ]);

  const day = summary.dailySummaries.find((row) => row.date === "2026-05-13");
  expect(day).toMatchObject({
    count: 3,
    totalDurationSeconds: 8400,
    totalDistanceMeters: 3 * 1609.344,
    sessionIds: expect.arrayContaining(["walk-treadmill", "walk-park", "walk-mapmywalk"]),
  });

  expect(summary.last7d.count).toBe(3);
  expect(summary.last7d.totalDurationSeconds).toBe(8400);
  expect(summary.last28d.count).toBe(3);
  expect(summary.last28d.totalDurationSeconds).toBe(8400);
});
