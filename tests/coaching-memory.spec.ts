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

function completedSession(id: string, daysAgo: number, trainingSignals: Partial<CoachExportTrainingSignals>): CompletedSession {
  return {
    id,
    endedAt: new Date(Date.UTC(2026, 0, 20 - daysAgo, 12)).getTime(),
    trainingSignals: signals(trainingSignals),
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

test("coaching memory decays one-off older equipment issues", async () => {
  const memory = buildCoachingMemory({
    completedSessions: [
      completedSession("new", 0, { movementQuality: ["Pull: strong lat stimulus"] }),
      completedSession("middle", 2, { movementQuality: ["Lat Pulldown: improved stretch and contraction"] }),
      completedSession("old", 4, { movementQuality: ["Cable Row: equipment issue identified"] }),
    ],
    trainingSignals: signals(),
  });

  expect(memory.activeWatchItems.map((item) => item.text)).not.toContain("Cable Row: equipment issue identified");
});

test("coaching memory keeps repeated equipment issues active", async () => {
  const memory = buildCoachingMemory({
    completedSessions: [
      completedSession("new", 0, { movementQuality: ["Cable Row: equipment issue identified"] }),
      completedSession("old", 4, { movementQuality: ["Cable Row: equipment issue identified"] }),
    ],
    trainingSignals: signals(),
  });

  const item = memory.activeWatchItems.find((watch) => watch.text === "Cable Row: equipment issue identified");
  expect(item?.evidenceCount).toBe(2);
  expect(item?.status).toBe("active");
});

test("coaching memory decays one older form breakdown but keeps recent form breakdown active", async () => {
  const stale = buildCoachingMemory({
    completedSessions: [
      completedSession("new", 0, { movementQuality: ["Pull: strong lat stimulus"] }),
      completedSession("middle", 2, { movementQuality: ["Lat Pulldown: improved stretch and contraction"] }),
      completedSession("old", 4, { movementQuality: ["MTS Row: rep 15 not counted due to form breakdown"] }),
    ],
    trainingSignals: signals(),
  });
  const active = buildCoachingMemory({
    completedSessions: [
      completedSession("new", 0, { movementQuality: ["MTS Row: rep 15 not counted due to form breakdown"] }),
      completedSession("old", 4, { movementQuality: ["Pull: strong lat stimulus"] }),
    ],
    trainingSignals: signals(),
  });

  expect(stale.activeWatchItems.map((item) => item.text)).not.toContain("MTS Row: rep 15 not counted due to form breakdown");
  expect(active.activeWatchItems.map((item) => item.text)).toContain("MTS Row: rep 15 not counted due to form breakdown");
});

test("coaching memory keeps repeated terminal-rep quality active", async () => {
  const memory = buildCoachingMemory({
    completedSessions: [
      completedSession("new", 0, { fatigueReadiness: ["MTS Row: terminal-rep quality dropped"] }),
      completedSession("mid", 2, { movementQuality: ["Pull: strong lat stimulus"] }),
      completedSession("old", 4, { fatigueReadiness: ["MTS Row: terminal-rep quality dropped"] }),
    ],
    trainingSignals: signals(),
  });

  const item = memory.activeWatchItems.find((watch) => watch.text === "MTS Row: terminal-rep quality dropped");
  expect(item?.evidenceCount).toBeGreaterThanOrEqual(2);
});

test("coaching memory suppresses pain watch after later same-exercise resolution", async () => {
  const memory = buildCoachingMemory({
    completedSessions: [
      completedSession("new", 0, { movementQuality: ["Bradford Press: shoulder quiet and pain-free"] }),
      completedSession("old", 4, { movementQuality: ["Bradford Press: shoulder pain showed up late"] }),
    ],
    trainingSignals: signals(),
  });

  expect(memory.activeWatchItems.map((item) => item.text)).not.toContain("Bradford Press: shoulder pain showed up late");
  expect(memory.resolvedItems.map((item) => item.text)).toContain("Bradford Press: shoulder quiet and pain-free");
});

test("coaching memory keeps severe pain active without explicit resolution", async () => {
  const memory = buildCoachingMemory({
    completedSessions: [
      completedSession("new", 0, { movementQuality: ["Pull: strong lat stimulus"] }),
      completedSession("old", 4, { movementQuality: ["Bradford Press: sharp pain stopped the set"] }),
    ],
    trainingSignals: signals(),
  });

  const item = memory.activeWatchItems.find((watch) => watch.text === "Bradford Press: sharp pain stopped the set");
  expect(item?.severity).toBe("high");
  expect(item?.status).toBe("active");
});

test("coaching memory suppresses rejected variation after successful replacement", async () => {
  const memory = buildCoachingMemory({
    completedSessions: [
      completedSession("new", 0, { movementQuality: ["Straight-Arm Cable Pulldown: validated replacement for lat isolation"] }),
      completedSession("old", 4, { movementQuality: ["Lat Pulldown: probe failed and variation did not work"] }),
    ],
    trainingSignals: signals(),
  });

  expect(memory.activeWatchItems.map((item) => item.text)).not.toContain("Lat Pulldown: probe failed and variation did not work");
  expect(memory.validatedLearnings.map((item) => item.text)).toContain("Straight-Arm Cable Pulldown: validated replacement for lat isolation");
});

test("coaching memory keeps validated learnings durable within source window", async () => {
  const memory = buildCoachingMemory({
    completedSessions: [
      completedSession("new", 0, { movementQuality: ["MTS Row: rep 15 not counted due to form breakdown"] }),
      completedSession("old", 4, { movementQuality: ["Barbell Row: grounded hinge felt stable"] }),
    ],
    trainingSignals: signals(),
  });

  expect(memory.validatedLearnings.map((item) => item.text)).toContain("Barbell Row: grounded hinge felt stable");
});
