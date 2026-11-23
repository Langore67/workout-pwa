import { expect, test } from "@playwright/test";
import { extractHumanSetNoteText, resolvePerformedSetIntent } from "../src/domain/sets/performedSetIntent";
import { buildExerciseProgressionContext } from "../src/domain/progression/exerciseProgressionContext";
import { buildTrainingExposureContext } from "../src/domain/training/trainingExposureContext";

const NOW = Date.UTC(2026, 10, 17, 12);
const exercise = { id: "rdl", name: "Romanian Deadlift", normalizedName: "romanian deadlift", metricMode: "reps", equipmentTags: [], movementPattern: "hinge", createdAt: NOW } as any;
const track = { id: "rdl-track", exerciseId: exercise.id, displayName: exercise.name, trackType: "strength", trackingMode: "weightedReps", createdAt: NOW } as any;
const session = { id: "session", startedAt: NOW - 3_600_000, endedAt: NOW - 1_000 } as any;

function set(id: string, setType: "warmup" | "working", weight: number, reps: number, notes?: string) {
  return { id, sessionId: session.id, trackId: track.id, setType, weight, reps, rir: 3, notes, createdAt: NOW - 2_000, completedAt: NOW - 2_000 } as any;
}

test("mixed RDL import preserves work evidence and treats exact technique provenance as control", () => {
  const sets = [
    set("warmup", "warmup", 95, 10),
    set("work-115", "working", 115, 10),
    set("work-135", "working", 135, 12),
    set("technique-135", "working", 135, 12, "technique"),
    set("technique-95", "working", 95, 10, "technique | hinge cue"),
  ];

  expect(sets.map((row) => resolvePerformedSetIntent(row, track))).toEqual([
    "warmup", "working", "working", "technique", "technique",
  ]);
  expect(resolvePerformedSetIntent(set("prose", "working", 95, 10, "technique felt better"), track)).toBe("working");

  const progression = buildExerciseProgressionContext({ exerciseId: exercise.id, exercises: [exercise], tracks: [track], sessions: [session], sets, asOf: NOW });
  expect(progression.observationCount).toBe(1);
  expect(progression.recentObservations[0]?.bestWorkingSet?.load).toBe(135);
  expect(progression.recentObservations[0]?.volume).toBe(115 * 10 + 135 * 12);

  const exposure = buildTrainingExposureContext({ exercises: [exercise], tracks: [track], sessions: [session], sets, asOf: NOW });
  const hinge = exposure.windows.rolling14Days.movementPatterns.find((row) => row.movementPattern === "hinge");
  expect(hinge).toMatchObject({ qualifyingSets: 2, workingSets: 2, controlExposures: 2 });
});

test("exact intent tokens are removed from human evidence without changing intent or human prose", () => {
  const cases = [
    ["technique", "technique"],
    ["mobility", "control"],
    ["corrective", "control"],
    ["diagnostic", "control"],
    ["rehab", "control"],
    ["conditioning", "conditioning"],
    ["test", "test"],
    ["set_type=technique", "technique"],
    ["set_type=mobility", "control"],
    ["set_type=corrective", "control"],
    ["set_type=diagnostic", "control"],
    ["set_type=rehab", "control"],
    ["set_type=conditioning", "conditioning"],
    ["set_type=test", "test"],
  ] as const;
  for (const [token, expectedIntent] of cases) {
    expect(resolvePerformedSetIntent(set(`intent-${token}`, "working", 0, 1, token), track)).toBe(expectedIntent);
    expect(extractHumanSetNoteText(token)).toBeUndefined();
  }

  expect(extractHumanSetNoteText("technique felt better today")).toBe("technique felt better today");
  expect(extractHumanSetNoteText("conditioning was harder than expected")).toBe("conditioning was harder than expected");
  expect(extractHumanSetNoteText("corrective work reduced shoulder irritation")).toBe("corrective work reduced shoulder irritation");
  expect(extractHumanSetNoteText("mobility felt limited on right")).toBe("mobility felt limited on right");
  expect(extractHumanSetNoteText("technique | lost hamstring tension on final reps")).toBe("lost hamstring tension on final reps");
  expect(extractHumanSetNoteText("set_type=conditioning | grip gave out first")).toBe("grip gave out first");
  expect(resolvePerformedSetIntent(set("human-prose", "working", 0, 1, "technique felt better"), track)).toBe("working");
});
