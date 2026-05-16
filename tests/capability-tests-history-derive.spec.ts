import { expect, test } from "@playwright/test";
import type { Exercise, FitnessTestResult, SetEntry, Session, Track } from "../src/db";
import {
  deriveCarryCapabilityResultsFromHistory,
  isHistoryDerivedCapabilityTestResult,
} from "../src/lib/deriveCapabilityTestsFromHistory";

const MAY_16 = new Date(2026, 4, 16, 12, 0, 0, 0).getTime();

function exercise(id: string, name: string): Exercise {
  return {
    id,
    name,
    normalizedName: name.toLowerCase(),
    equipmentTags: [],
    createdAt: MAY_16,
  } as Exercise;
}

function track(id: string, exerciseId: string, displayName: string): Track {
  return {
    id,
    exerciseId,
    trackType: "strength",
    displayName,
    trackingMode: "weightedReps",
    warmupSetsDefault: 0,
    workingSetsDefault: 1,
    repMin: 1,
    repMax: 1,
    restSecondsDefault: 60,
    weightJumpDefault: 5,
    createdAt: MAY_16,
  };
}

function session(id: string, patch: Partial<Session> = {}): Session {
  return {
    id,
    templateName: "Lower B",
    startedAt: MAY_16,
    endedAt: MAY_16 + 60 * 60 * 1000,
    ...patch,
  };
}

function setEntry(id: string, sessionId: string, trackId: string, patch: Partial<SetEntry> = {}): SetEntry {
  return {
    id,
    sessionId,
    trackId,
    createdAt: MAY_16,
    setType: "working",
    ...patch,
  };
}

test("derives Farmer Carry from history and prefers distance over duration and load", () => {
  const rows = deriveCarryCapabilityResultsFromHistory({
    sessions: [session("session-1", { notes: "Pain: mild after session" })],
    exercises: [exercise("exercise-1", "Farmer's Carry")],
    tracks: [track("track-1", "exercise-1", "Farmer's Carry")],
    sets: [
      setEntry("set-1", "session-1", "track-1", {
        distance: 40,
        distanceUnit: "m",
        seconds: 60,
        weight: 90,
      }),
    ],
  });

  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    testName: "Farmer Carry",
    category: "carry",
    resultValue: 40,
    resultUnit: "meters",
    side: "both",
    pain: "mild",
    source: "history",
    sourceSessionId: "session-1",
    sourceSetId: "set-1",
  });
  expect(rows[0].notes).toContain("History | Lower B | Farmer's Carry");
  expect(rows[0].notes).toContain("distance 40 meters");
  expect(rows[0].notes).toContain("duration 60 sec");
  expect(rows[0].notes).toContain("load 90 lb");
  expect(isHistoryDerivedCapabilityTestResult(rows[0])).toBe(true);
});

test("derives left and right suitcase carries from explicit history names", () => {
  const rows = deriveCarryCapabilityResultsFromHistory({
    sessions: [session("session-1")],
    exercises: [exercise("exercise-1", "Suitcase Carry")],
    tracks: [
      track("track-left", "exercise-1", "Suitcase Carry - Left"),
      track("track-right", "exercise-1", "Suitcase Carry - Right"),
    ],
    sets: [
      setEntry("set-left", "session-1", "track-left", { seconds: 45, weight: 55 }),
      setEntry("set-right", "session-1", "track-right", { weight: 60 }),
    ],
  });

  expect(rows.map((row) => row.testName).sort()).toEqual(["Suitcase Carry - Left", "Suitcase Carry - Right"]);
  expect(rows.find((row) => row.side === "left")).toMatchObject({
    resultValue: 45,
    resultUnit: "seconds",
  });
  expect(rows.find((row) => row.side === "right")).toMatchObject({
    resultValue: 60,
    resultUnit: "lb",
  });
});

test("does not harvest generic suitcase carries without a side", () => {
  const rows = deriveCarryCapabilityResultsFromHistory({
    sessions: [session("session-1")],
    exercises: [exercise("exercise-1", "Suitcase Carry")],
    tracks: [track("track-1", "exercise-1", "Suitcase Carry")],
    sets: [setEntry("set-1", "session-1", "track-1", { seconds: 60, weight: 55 })],
  });

  expect(rows).toEqual([]);
});

test("manual rows on the same date suppress matching history-derived rows", () => {
  const manual: FitnessTestResult = {
    id: "manual-1",
    testName: "Suitcase Carry - Left",
    category: "carry",
    date: new Date(2026, 4, 16).getTime(),
    resultValue: 45,
    resultUnit: "lb",
    side: "left",
    updatedAt: MAY_16,
  };

  const rows = deriveCarryCapabilityResultsFromHistory({
    sessions: [session("session-1")],
    exercises: [exercise("exercise-1", "Suitcase Carry")],
    tracks: [track("track-left", "exercise-1", "Suitcase Carry - Left")],
    sets: [setEntry("set-left", "session-1", "track-left", { seconds: 45, weight: 55 })],
    manualResults: [manual],
  });

  expect(rows).toEqual([]);
});

test("helper remains read-only", () => {
  const input = {
    sessions: [session("session-1")],
    exercises: [exercise("exercise-1", "Farmer Carry")],
    tracks: [track("track-1", "exercise-1", "Farmer Carry")],
    sets: [setEntry("set-1", "session-1", "track-1", { weight: 90 })],
  };
  const before = JSON.stringify(input);

  deriveCarryCapabilityResultsFromHistory(input);

  expect(JSON.stringify(input)).toBe(before);
});
