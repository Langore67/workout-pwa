import { expect, test } from "@playwright/test";
import { buildCoachingMemory } from "../src/lib/coachExport/coachingMemory";
import type { CompletedSession } from "../src/lib/coachExport/buildPatternSummary";
import type { CoachExportTrainingSignals } from "../src/lib/coachExport/types";

function signals(overrides: Partial<CoachExportTrainingSignals> = {}): CoachExportTrainingSignals {
  return {
    movementQuality: [],
    stimulusCoverage: [],
    fatigueReadiness: [],
    nextWorkoutFocus: [],
    discussWithGaz: [],
    ...overrides,
  };
}

test("coaching memory derives validated learnings from cue, grounded setup, and stimulus signals", async () => {
  const memory = buildCoachingMemory({
    trainingSignals: signals({
      movementQuality: [
        "MTS Row: chest-supported row reinforced Gaz's cues",
        "Barbell Row: grounded hinge felt stable",
      ],
      stimulusCoverage: ["Pull: strong lat stimulus"],
    }),
  });

  expect(memory.validatedLearnings.map((item) => item.text)).toEqual([
    "MTS Row: chest-supported row reinforced Gaz's cues",
    "Barbell Row: grounded hinge felt stable",
    "Pull: strong lat stimulus",
  ]);
});

test("coaching memory excludes negative signals from validated learnings", async () => {
  const memory = buildCoachingMemory({
    trainingSignals: signals({
      movementQuality: [
        "MTS Row: rep 15 not counted due to form breakdown",
        "Bench Press: elbow pain showed up late",
        "Cable Row: equipment issue identified",
      ],
      fatigueReadiness: ["MTS Row: terminal-rep quality dropped"],
    }),
  });

  expect(memory.validatedLearnings).toHaveLength(0);
});

test("coaching memory dedupes repeated positive learnings and counts evidence", async () => {
  const memory = buildCoachingMemory({
    trainingSignals: signals({
      movementQuality: [
        "MTS Row: chest-supported row reinforced Gaz's cues",
        "MTS Row: chest-supported row reinforced Gaz's cues.",
      ],
    }),
  });

  expect(memory.validatedLearnings).toHaveLength(1);
  expect(memory.validatedLearnings[0].evidenceCount).toBe(2);
  expect(memory.validatedLearnings[0].confidence).toBe("moderate");
});

test("coaching memory derives active watch items and suppresses generic substitution prompts", async () => {
  const memory = buildCoachingMemory({
    trainingSignals: signals({
      movementQuality: ["MTS Row: rep 15 not counted due to form breakdown"],
      fatigueReadiness: ["MTS Row: terminal-rep quality dropped"],
      discussWithGaz: [
        "Confirm whether the substitution stays in next session",
        "Review form breakdown before adding load",
      ],
    }),
  });

  const watchText = memory.activeWatchItems.map((item) => item.text);
  expect(watchText).toContain("MTS Row: rep 15 not counted due to form breakdown");
  expect(watchText).toContain("MTS Row: terminal-rep quality dropped");
  expect(watchText).toContain("Review form breakdown before adding load");
  expect(watchText).not.toContain("Confirm whether the substitution stays in next session");
});

test("coaching memory only derives resolved items from explicit resolution language", async () => {
  const unresolved = buildCoachingMemory({
    trainingSignals: signals({
      movementQuality: ["Bench Press: elbow pain showed up late"],
      fatigueReadiness: ["Bench Press: terminal-rep quality dropped"],
    }),
  });
  const resolved = buildCoachingMemory({
    trainingSignals: signals({
      movementQuality: ["Bench Press: elbow pain resolved and stayed pain-free"],
    }),
  });

  expect(unresolved.resolvedItems).toHaveLength(0);
  expect(resolved.resolvedItems.map((item) => item.text)).toContain(
    "Bench Press: elbow pain resolved and stayed pain-free"
  );
});

test("coaching memory reports source window count and date range", async () => {
  const completedSessions: CompletedSession[] = [
    {
      id: "old",
      endedAt: new Date("2026-01-01T12:00:00.000Z").getTime(),
      trainingSignals: signals({ movementQuality: ["Pull: strong lat stimulus"] }),
    },
    {
      id: "new",
      endedAt: new Date("2026-01-15T12:00:00.000Z").getTime(),
      trainingSignals: signals({ movementQuality: ["Barbell Row: grounded hinge felt stable"] }),
    },
  ];

  const memory = buildCoachingMemory({
    completedSessions,
    trainingSignals: signals(),
  });

  expect(memory.sourceWindow.sessionCount).toBe(2);
  expect(memory.sourceWindow.fromDate).toBe("2026-01-01T12:00:00.000Z");
  expect(memory.sourceWindow.toDate).toBe("2026-01-15T12:00:00.000Z");
});
