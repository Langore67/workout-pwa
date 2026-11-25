import { expect, test } from "@playwright/test";
import { formatWeightedRepsSetDisplay } from "../src/domain/coaching/setDisplay";
import { buildSessionCoachingSignals, buildSessionSnapshotText } from "../src/domain/coaching/sessionSnapshot";

function buildSignals(sessionNotes: string) {
  return buildSessionCoachingSignals({
    sessionNotes,
    totalExercises: 1,
    completedExercises: 1,
    currentTrack: { displayName: "Bench Press", trackType: "strength", trackingMode: "weightedReps" },
    currentRecommendation: null,
    trackSummaries: [{
      displayName: "Bench Press",
      trackType: "strength",
      trackingMode: "weightedReps",
      completedSets: ["135 x 8"],
    }],
  });
}

test("session coaching signals do not interpret arbitrary free-text notes", () => {
  const notes = [
    "No shoulder pain, but elbow irritation.",
    "Bench Press: technique broke down and fatigue showed up.",
    "Pull-Up: two complete 1-2-3 ladders.",
  ];
  for (const note of notes) {
    const result = buildSignals(note);
    expect(result.readiness).toBe("");
    expect(result.focusFlags).toEqual([]);
    expect(result.movementQualitySignals).toEqual([]);
    expect(result.fatigueReadiness).toEqual([]);
    expect(result.nextWorkoutFocus).toEqual([]);
    expect(result.discussWithCoach).toEqual([]);
    expect(result.carryForward).toEqual([]);
  }
});

test("explicit Carry Forward is retained while raw notes stay in the snapshot", () => {
  const raw = "Carry Forward:\n- Keep the pain-free overhead range next session.\n\nRight shoulder rotated forward on the last rep.";
  const result = buildSignals(raw);
  expect(result.carryForward).toEqual(["Keep the pain-free overhead range next session."]);
  expect(result.movementQualitySignals).toEqual([]);

  const snapshot = buildSessionSnapshotText({
    sessionLabel: "Upper A",
    sessionNotes: raw,
    totalExercises: 1,
    completedExercises: 1,
    currentTrack: null,
    currentRecentBest: null,
    currentRecommendation: null,
    trackSummaries: [],
  });
  expect(snapshot).toContain("Carry Forward\n- Keep the pain-free overhead range next session.");
  expect(snapshot).toContain(raw);
  expect(snapshot).not.toContain("Movement Quality Signals");
  expect(snapshot).not.toContain("Discuss with Gaz");
  expect(snapshot).not.toContain("Readiness:");
});

test("snapshot keeps objective work counts and does not add empty interpretation headings", () => {
  const snapshot = buildSessionSnapshotText({
    sessionLabel: "Lower B",
    sessionNotes: "Leg Press: Quad burn began around. First set RIR not recorded.",
    totalExercises: 4,
    completedExercises: 3,
    currentTrack: null,
    currentRecentBest: null,
    currentRecommendation: null,
    trackSummaries: [],
  });

  expect(snapshot).toContain("Exercises: 3/4 with completed work");
  expect(snapshot).toContain("3/4 exercises produced completed work");
  expect(snapshot).toContain("Leg Press: Quad burn began around. First set RIR not recorded.");
  expect(snapshot).not.toContain("Focus Flags");
  expect(snapshot).not.toContain("Movement Quality Signals");
  expect(snapshot).not.toContain("Fatigue / Readiness");
  expect(snapshot).not.toContain("Next Workout Focus");
  expect(snapshot).not.toContain("Discuss with Gaz");
});

test("assisted bodyweight display retains external negative loads", () => {
  expect(formatWeightedRepsSetDisplay({
    weight: -45,
    reps: 8,
    rir: 2,
    useSignedBodyweightLoad: true,
    negativeBodyweightLoadFormat: "external",
  })).toBe("-45x8 @2");
});
