import { expect, test } from "@playwright/test";
import { buildNextWorkoutFocus } from "../src/lib/coachExport/buildNextWorkoutFocus";
import { formatCoachExportText } from "../src/lib/coachExport/formatCoachExportText";
import { buildPatternSummary, type CompletedSession } from "../src/lib/coachExport/buildPatternSummary";
import { buildExerciseVocabulary } from "../src/lib/coachExport/exerciseVocabulary";
import { isStrengthBuildingSession, selectRecentStrengthBuildingSessions } from "../src/lib/coachExport/strengthBuildingSessions";
import { informationRegistry } from "../src/config/information/informationRegistry";
import type { CoachExportMetrics, CoachExportTrainingSignals } from "../src/lib/coachExport/types";

function getSection(text: string, heading: string, nextHeading?: string) {
  const start = text.indexOf(heading);
  expect(start).toBeGreaterThanOrEqual(0);
  const fromStart = text.slice(start);
  if (!nextHeading) return fromStart;
  const end = fromStart.indexOf(nextHeading);
  return end >= 0 ? fromStart.slice(0, end) : fromStart;
}

function buildMetrics(): CoachExportMetrics {
  return {
    generatedAt: new Date("2026-04-27T09:00:00-04:00").getTime(),
    currentPhase: "cut",
    bodyComp: {
      weight: { latest: 198, baseline14d: 201, delta14d: -3 },
      waist: { latest: 35.5, baseline14d: 36.1, delta14d: -0.6 },
      bodyFatPct: { latest: 16.2, baseline14d: 16.9, delta14d: -0.7 },
      leanMass: { latest: 154.1, baseline14d: 153.6, delta14d: 0.5 },
      bodyweightDelta7d: -1.2,
      bodyweightDelta14d: -3,
    },
    hydration: {
      latestWaterPct: 57.2,
      confidenceLabel: "High",
      confidenceScore: 82,
      note: "Hydration signal is stable.",
      distortionLikely: false,
    },
    strengthSignal: {
      current: 1.92,
      delta14d: 0.04,
      vs90dBestPct: -1.5,
      currentBodyweight: 198,
      bodyweightDaysUsed: 5,
    },
    phaseQuality: null,
    anchorLifts: [
      {
        pattern: "push",
        exerciseId: "bench",
        exerciseName: "Bench Press",
        trackDisplayName: "Bench Press",
        effectiveWeightLb: 225,
        reps: 5,
        e1rm: 262,
        performedAt: new Date("2026-04-24T09:00:00-04:00").getTime(),
      },
    ],
    exerciseVocabulary: ["Bench Press", "Lat Pulldown", "Romanian Deadlift"],
    trainingSignals: {
      movementQuality: [
        "Lat Pulldown: improved stretch and contraction",
        "Bradford Press: stopped due to shoulder twinge",
      ],
      stimulusCoverage: [
        "Pull: strong lat stimulus",
        "Shoulders: lateral delt isolation needs refinement",
      ],
      fatigueReadiness: [
        "Shoulder sensitive in behind-head position",
        "Fatigue mostly appeared at terminal reps",
      ],
      nextWorkoutFocus: [
        "Maintain lat-driven pulling before increasing load",
        "Improve medial delt isolation",
      ],
      discussWithGaz: [
        "Review medial delt isolation setup",
        "Review safe overhead pressing range",
      ],
    },
    patternSummary: {
      movementQuality: [
        "Lat engagement improving across recent pull work",
        "Shoulder sensitivity appears in overhead positions",
      ],
      stimulus: [
        "Pull stimulus consistently strong",
        "Shoulder isolation inconsistent across sessions",
      ],
      fatigue: ["Fatigue consistently appears at terminal reps"],
      constraints: ["Shoulder sensitivity linked to behind-head or overhead positions"],
      progression: ["Pulling movements show improving consistency"],
    },
    nextWorkoutFocus: {
      progressionGuardrails: [
        "Keep progression conservative given current phase-quality risk.",
        "Avoid pushing load on movements that already show joint feedback or shoulder sensitivity.",
      ],
      executionPriorities: [
        "Preserve known pulling setup constraints when selecting or progressing work.",
        "Treat repeated isolation inconsistency as a movement-quality constraint.",
      ],
      adjustmentTriggers: [
        "Reduce volume or progression pressure if later-set fatigue appears earlier than usual.",
        "Stop or modify a movement if shoulder, elbow, or other joint feedback appears.",
      ],
    },
    exportConfidence: {
      score: 82,
      label: "Strong",
      components: {
        waistReadiness: 20,
        weightDataReady: 20,
        strengthDataReady: 20,
        coherenceScore: 22,
      },
    },
    readinessNotes: ["Phase quality: Insufficient Data.", "Hydration signal is stable."],
    dataNotes: ["No major data gaps detected."],
  };
}

test("coach export includes recent training signals section", async () => {
  const text = formatCoachExportText(buildMetrics());

  expect(text).toContain("Training Signals (Recent Sessions)");
  expect(text).toContain("Movement Quality");
  expect(text).toContain("- Lat Pulldown: improved stretch and contraction");
  expect(text).toContain("Stimulus / Coverage");
  expect(text).toContain("- Pull: strong lat stimulus");
  expect(text).toContain("Fatigue / Readiness");
  expect(text).toContain("- Shoulder sensitive in behind-head position");
  expect(text).toContain("Next Workout Focus");
  expect(text).toContain("Progression Guardrails");
  expect(text).toContain("Execution Priorities");
  expect(text).toContain("Adjustment Triggers");
  expect(text).toContain("- Preserve known pulling setup constraints when selecting or progressing work.");
  expect(text).toContain("Discuss with Gaz");
  expect(text).toContain("- Review safe overhead pressing range");
  expect(text).toContain("Recent Patterns (Last 4 Sessions)");
  expect(text).toContain("- Lat engagement improving across recent pull work");
  expect(text).toContain("- Pulling movements show improving consistency");
  expect(text).not.toContain("Upper A");
  expect(text).not.toContain("Lower B");
});

test("coach export includes exercise vocabulary section and rules", async () => {
  const text = formatCoachExportText(buildMetrics());

  const section = getSection(text, "Exercise Vocabulary", "Next Workout Focus");
  expect(section).toContain("Use these IronForge exercise names exactly when recommending movements:");
  expect(section).toContain("- Bench Press");
  expect(section).toContain("- Lat Pulldown");
  expect(section).toContain("- Prefer exact names from this list.");
  expect(section).toContain("- Do not create new exercise names unless necessary.");
  expect(section).toContain("- If suggesting a variation, label it as a new exercise.");
});

test("coach export preserves the structured coaching loop as plain text", async () => {
  const text = formatCoachExportText(buildMetrics());

  expect(text).toContain("Questions to answer:");
  expect(text).toContain("Next Workout Focus");
  expect(text).toContain("Progression Guardrails");
  expect(text).toContain("Execution Priorities");
  expect(text).toContain("Adjustment Triggers");
  expect(text).toContain("Training Signals (Recent Sessions)");
  expect(text).toContain("Recent Patterns (Last 4 Sessions)");
  expect(text).toContain("Readiness / Confidence Notes");
  expect(text).toContain("Discuss with Gaz");

  expect(text).not.toContain("```");
  expect(text).not.toContain("{");
  expect(text).not.toContain("}");
});

test("information registry includes the coach export and body composition explainer entries", async () => {
  expect(informationRegistry.progress.coachExport.title).toBe("Coach Export");
  expect(informationRegistry.progress.trainingSignals.title).toBe("Training Signals");
  expect(informationRegistry.progress.recentPatterns.title).toBe("Recent Patterns");
  expect(informationRegistry.progress.nextWorkoutFocus.title).toBe("Next Workout Focus");
  expect(informationRegistry.progress.exportConfidence.title).toBe("Export Confidence");
  expect(informationRegistry.progress.anchorLifts.title).toBe("Anchor Lifts");
  expect(informationRegistry.bodyComposition.phaseQuality.title).toBe("Phase Quality");
  expect(informationRegistry.bodyComposition.hydrationConfidence.title).toBe("Hydration Confidence");
});

test("pattern summary uses repeated recent signals and caps subsection bullets", async () => {
  const repeatedSignals: CoachExportTrainingSignals = {
    movementQuality: [
      "Lat Pulldown: improved stretch and contraction",
      "3-Point DB Row: breakthrough pattern found",
      "Lateral Raise: medial delt isolation still not clean",
      "Bradford Press: stopped due to shoulder twinge",
    ],
    stimulusCoverage: [
      "Pull: strong lat stimulus",
      "Shoulders: lateral delt isolation needs refinement",
    ],
    fatigueReadiness: [
      "Fatigue mostly appeared at terminal reps",
      "Bradford Press: shoulder twinge showed up again",
    ],
    nextWorkoutFocus: [
      "Maintain lat-driven pulling before increasing load",
      "Improve medial delt isolation",
      "Avoid behind-the-neck pressing positions",
    ],
    discussWithGaz: [
      "Review safe overhead pressing range",
      "Review medial delt isolation setup",
    ],
  };

  const sessions: CompletedSession[] = [
    {
      id: "s1",
      endedAt: new Date("2026-04-27T09:00:00-04:00").getTime(),
      trainingSignals: repeatedSignals,
    },
    {
      id: "s2",
      endedAt: new Date("2026-04-24T09:00:00-04:00").getTime(),
      trainingSignals: {
        ...repeatedSignals,
        movementQuality: [
          "Lat Pulldown: improved stretch and contraction",
          "Lateral Raise: medial delt isolation still not clean",
          "Bradford Press: stopped due to shoulder twinge",
        ],
      },
    },
    {
      id: "s3",
      endedAt: new Date("2026-04-20T09:00:00-04:00").getTime(),
      trainingSignals: {
        ...repeatedSignals,
        movementQuality: [
          "3-Point DB Row: breakthrough pattern found",
          "Lateral Raise: medial delt isolation still not clean",
        ],
      },
    },
    {
      id: "s4",
      endedAt: new Date("2026-04-16T09:00:00-04:00").getTime(),
      trainingSignals: {
        ...repeatedSignals,
        movementQuality: [
          "Lat Pulldown: improved stretch and contraction",
          "Farmer's Carry: slight trap involvement noted but controlled",
        ],
        fatigueReadiness: ["Fatigue mostly appeared at terminal reps"],
      },
    },
  ];

  const summary = buildPatternSummary({
    sessions,
    trainingSignals: repeatedSignals,
  });

  expect(summary.movementQuality).toContain("Lat engagement improving across recent pull work (4/4)");
  expect(summary.movementQuality).toContain("Shoulder sensitivity appears in overhead or vertical pressing positions (4/4)");
  expect(summary.stimulus).toContain("Pull stimulus remains repeatable across recent sessions (4/4)");
expect(summary.fatigue).toContain("Fatigue shows up at terminal reps across recent working sets (4/4)");
  expect(summary.constraints).toContain(
    "Shoulder sensitivity is linked to behind-head or overhead positions (4/4)"
  );
expect(summary.progression).toContain("Pulling movements show improving consistency (4/4)");
  

  expect(summary.movementQuality.length).toBeLessThanOrEqual(4);
  expect(summary.stimulus.length).toBeLessThanOrEqual(4);
  expect(summary.fatigue.length).toBeLessThanOrEqual(4);
  expect(summary.constraints.length).toBeLessThanOrEqual(4);
  expect(summary.progression.length).toBeLessThanOrEqual(4);
});

test("pattern summary can surface broader descriptive lower-body, bracing, stability, and tempo themes", async () => {
  const repeatedSignals: CoachExportTrainingSignals = {
    movementQuality: [
      "Glute Bridge: glutes engaged better",
      "Front Squat: lost brace on final reps",
      "Reverse Lunge: balance limited the last reps",
      "Tempo Squat: controlled descent stayed clean",
    ],
    stimulusCoverage: [
      "Stimulus reached glutes",
      "Quad burn showed up late",
    ],
    fatigueReadiness: [
      "RDL: hamstrings took over",
      "Split Squat: left side less stable",
      "Leg Press: range shortened under fatigue",
      "Press: ribs flared late",
    ],
    nextWorkoutFocus: [],
    discussWithGaz: [],
  };

  const sessions: CompletedSession[] = [
    {
      id: "lb-1",
      endedAt: new Date("2026-04-27T09:00:00-04:00").getTime(),
      trainingSignals: repeatedSignals,
    },
    {
      id: "lb-2",
      endedAt: new Date("2026-04-24T09:00:00-04:00").getTime(),
      trainingSignals: {
        ...repeatedSignals,
        movementQuality: [
          "Glute Bridge: glutes engaged better",
          "Front Squat: lost brace on final reps",
          "Tempo Squat: controlled descent stayed clean",
        ],
        fatigueReadiness: [
          "RDL: hamstrings took over",
          "Split Squat: left side less stable",
          "Leg Press: range shortened under fatigue",
        ],
      },
    },
    {
      id: "lb-3",
      endedAt: new Date("2026-04-20T09:00:00-04:00").getTime(),
      trainingSignals: {
        ...repeatedSignals,
        movementQuality: [
          "Reverse Lunge: balance limited the last reps",
          "Tempo Squat: controlled descent stayed clean",
        ],
        stimulusCoverage: [
          "Stimulus reached glutes",
          "Quad burn showed up late",
        ],
        fatigueReadiness: [
          "Press: ribs flared late",
          "Leg Press: range shortened under fatigue",
        ],
      },
    },
    {
      id: "lb-4",
      endedAt: new Date("2026-04-16T09:00:00-04:00").getTime(),
      trainingSignals: {
        ...repeatedSignals,
        movementQuality: [
          "Glute Bridge: glutes engaged better",
          "Reverse Lunge: balance limited the last reps",
        ],
        fatigueReadiness: [
          "RDL: hamstrings took over",
          "Split Squat: left side less stable",
        ],
      },
    },
  ];

  const summary = buildPatternSummary({
    sessions,
    trainingSignals: repeatedSignals,
  });

  expect(summary.movementQuality.join(" ")).toContain("Glute engagement was noted across lower-body work");
  expect(summary.movementQuality.join(" ")).toContain("Core bracing themes appeared across compound-lift notes");
  expect(summary.movementQuality.join(" ")).toContain("Balance or stability limits appeared in recent unilateral work");
  expect(summary.stimulus.join(" ")).toContain("Glute stimulus was noted across recent lower-body sessions");
  expect(summary.stimulus.join(" ")).toContain("Quad stimulus was noted across recent lower-body sessions");

  expect(summary.fatigue.join(" ")).toContain("Bracing quality changed under fatigue in recent notes");
  expect(summary.fatigue.join(" ")).toContain("Range of motion changed under fatigue in recent notes");

  expect(summary.constraints.join(" ")).toContain("Hamstring dominance appeared in repeated lower-body notes");
  expect(summary.constraints.join(" ")).toContain("Unilateral stability differences appeared in recent notes");

  const combined = [
    ...summary.movementQuality,
    ...summary.stimulus,
    ...summary.fatigue,
    ...summary.constraints,
    ...summary.progression,
  ].join(" ");

  expect(combined).not.toMatch(/\bprioritize\b/i);
  expect(combined).not.toMatch(/\bimprove\b/i);
  expect(combined).not.toMatch(/\bprogress\b/i);
  expect(combined).not.toMatch(/\breduce\b/i);
  expect(combined).not.toMatch(/\badd\b/i);
  expect(combined).not.toMatch(/\breplace\b/i);
});

test("pattern summary can surface descriptive tempo and descent-control themes", async () => {
  const repeatedSignals: CoachExportTrainingSignals = {
    movementQuality: [
      "Tempo Squat: controlled descent stayed clean",
      "Split Squat: controlled descent stayed clean",
    ],
    stimulusCoverage: [],
    fatigueReadiness: [],
    nextWorkoutFocus: [],
    discussWithGaz: [],
  };

  const sessions: CompletedSession[] = [
    {
      id: "tempo-1",
      endedAt: new Date("2026-04-27T09:00:00-04:00").getTime(),
      trainingSignals: repeatedSignals,
    },
    {
      id: "tempo-2",
      endedAt: new Date("2026-04-24T09:00:00-04:00").getTime(),
      trainingSignals: repeatedSignals,
    },
    {
      id: "tempo-3",
      endedAt: new Date("2026-04-20T09:00:00-04:00").getTime(),
      trainingSignals: repeatedSignals,
    },
  ];

  const summary = buildPatternSummary({
    sessions,
    trainingSignals: repeatedSignals,
  });

  expect(summary.movementQuality.join(" ")).toContain("Tempo or descent control was noted across recent sessions");
});

test("exercise vocabulary uses active canonical names, dedupes, and caps the list", async () => {
  const now = new Date("2026-04-27T09:00:00-04:00").getTime();
  const recentSessions = Array.from({ length: 5 }, (_, index) => ({
    id: `session-${index + 1}`,
    startedAt: now - (index + 1) * 60_000,
    endedAt: now - index * 86_400_000,
  }));

  const vocabulary = buildExerciseVocabulary({
    sessions: recentSessions,
    sets: [
      ...Array.from({ length: 30 }, (_, index) => ({
        id: `set-${index + 1}`,
        sessionId: recentSessions[index < 25 ? 0 : 4].id,
        trackId: `track-${index + 1}`,
        createdAt: now,
        setType: "working" as const,
        completedAt: now,
      })),
      {
        id: "set-duplicate",
        sessionId: recentSessions[1].id,
        trackId: "track-duplicate",
        createdAt: now,
        setType: "working" as const,
        completedAt: now,
      },
    ],
    tracks: [
      ...Array.from({ length: 30 }, (_, index) => ({
        id: `track-${index + 1}`,
        exerciseId: `exercise-${index + 1}`,
        trackType: "strength" as const,
        displayName: `Alias ${index + 1}`,
        trackingMode: "weightedReps" as const,
        warmupSetsDefault: 0,
        workingSetsDefault: 3,
        repMin: 5,
        repMax: 8,
        restSecondsDefault: 120,
        weightJumpDefault: 5,
        createdAt: now,
      })),
      {
        id: "track-duplicate",
        exerciseId: "exercise-1",
        trackType: "strength" as const,
        displayName: "Bench Alias",
        trackingMode: "weightedReps" as const,
        warmupSetsDefault: 0,
        workingSetsDefault: 3,
        repMin: 5,
        repMax: 8,
        restSecondsDefault: 120,
        weightJumpDefault: 5,
        createdAt: now,
      },
    ],
    exercises: [
      ...Array.from({ length: 30 }, (_, index) => ({
        id: `exercise-${index + 1}`,
        name: index === 0 ? "Bench Press" : `Exercise ${index + 1}`,
        normalizedName: index === 0 ? "bench press" : `exercise ${index + 1}`,
        equipmentTags: [],
        createdAt: now,
        ...(index === 27 ? { archivedAt: now } : null),
        ...(index === 28 ? { mergedIntoExerciseId: "exercise-1" } : null),
      })),
    ],
    anchorLifts: [
      {
        pattern: "push",
        exerciseId: "exercise-1",
        exerciseName: "Bench Press",
        trackDisplayName: "Bench Press",
        effectiveWeightLb: 225,
        reps: 5,
        e1rm: 262,
        performedAt: now,
      },
    ],
    limit: 25,
  });

  expect(vocabulary[0]).toBe("Bench Press");
  expect(vocabulary).not.toContain("Exercise 28");
  expect(vocabulary).not.toContain("Exercise 29");
  expect(vocabulary.length).toBe(25);
  expect(vocabulary.filter((name) => name === "Bench Press")).toHaveLength(1);
  expect(vocabulary).not.toContain("Exercise 30");
});

test("strength-building session windows exclude cardio-only and class-only sessions", async () => {
  const now = new Date("2026-05-04T09:00:00-04:00").getTime();
  const sessions = [
    { id: "walk", templateName: "Walking", startedAt: now - 9 * 86_400_000, endedAt: now - 9 * 86_400_000 + 1 },
    { id: "body-core", templateName: "Body Core", startedAt: now - 8 * 86_400_000, endedAt: now - 8 * 86_400_000 + 1 },
    { id: "upper-a", templateName: "Upper A", startedAt: now - 7 * 86_400_000, endedAt: now - 7 * 86_400_000 + 1 },
    { id: "lower-a", templateName: "Lower A", startedAt: now - 6 * 86_400_000, endedAt: now - 6 * 86_400_000 + 1 },
    { id: "body-core-strength", templateName: "Body Core", startedAt: now - 5 * 86_400_000, endedAt: now - 5 * 86_400_000 + 1 },
    { id: "upper-b", templateName: "Upper B", startedAt: now - 4 * 86_400_000, endedAt: now - 4 * 86_400_000 + 1 },
    { id: "lower-b", templateName: "Lower B", startedAt: now - 3 * 86_400_000, endedAt: now - 3 * 86_400_000 + 1 },
    { id: "upper-c", templateName: "Upper C", startedAt: now - 2 * 86_400_000, endedAt: now - 2 * 86_400_000 + 1 },
    { id: "lower-c", templateName: "Lower C", startedAt: now - 1 * 86_400_000, endedAt: now - 1 * 86_400_000 + 1 },
  ];

  const tracks = [
    {
      id: "track-walk",
      exerciseId: "exercise-walk",
      trackType: "conditioning" as const,
      displayName: "Walk",
      trackingMode: "timeSeconds" as const,
      warmupSetsDefault: 0,
      workingSetsDefault: 1,
      repMin: 1,
      repMax: 1,
      restSecondsDefault: 60,
      weightJumpDefault: 0,
      createdAt: now,
    },
    {
      id: "track-body-core-only",
      exerciseId: "exercise-body-core-only",
      trackType: "mobility" as const,
      displayName: "Box Breathing",
      trackingMode: "repsOnly" as const,
      warmupSetsDefault: 0,
      workingSetsDefault: 1,
      repMin: 1,
      repMax: 1,
      restSecondsDefault: 60,
      weightJumpDefault: 0,
      createdAt: now,
    },
    ...["upper-a", "lower-a", "body-core-strength", "upper-b", "lower-b", "upper-c", "lower-c"].map((id, index) => ({
      id: `track-${id}`,
      exerciseId: `exercise-${id}`,
      trackType: index === 2 ? ("technique" as const) : ("strength" as const),
      displayName: `Exercise ${id}`,
      trackingMode: "weightedReps" as const,
      warmupSetsDefault: 0,
      workingSetsDefault: 3,
      repMin: 5,
      repMax: 8,
      restSecondsDefault: 120,
      weightJumpDefault: 5,
      createdAt: now,
    })),
  ];

  const sets = [
    {
      id: "set-walk",
      sessionId: "walk",
      trackId: "track-walk",
      createdAt: now,
      completedAt: now,
      setType: "working" as const,
      seconds: 1800,
    },
    {
      id: "set-body-core-only",
      sessionId: "body-core",
      trackId: "track-body-core-only",
      createdAt: now,
      completedAt: now,
      setType: "working" as const,
      reps: 5,
    },
    ...["upper-a", "lower-a", "body-core-strength", "upper-b", "lower-b", "upper-c", "lower-c"].map((id) => ({
      id: `set-${id}`,
      sessionId: id,
      trackId: `track-${id}`,
      createdAt: now,
      completedAt: now,
      setType: "working" as const,
      reps: 8,
      weight: 100,
    })),
  ];

  const signalSessions = selectRecentStrengthBuildingSessions({
    sessions: sessions as any,
    sets: sets as any,
    tracks: tracks as any,
    limit: 4,
  });
  const vocabularySessions = selectRecentStrengthBuildingSessions({
    sessions: sessions as any,
    sets: sets as any,
    tracks: tracks as any,
    limit: 8,
  });

  expect(signalSessions.map((session) => session.id)).toEqual([
    "lower-c",
    "upper-c",
    "lower-b",
    "upper-b",
  ]);
  expect(vocabularySessions.map((session) => session.id)).toEqual([
    "lower-c",
    "upper-c",
    "lower-b",
    "upper-b",
    "body-core-strength",
    "lower-a",
    "upper-a",
  ]);
  expect(vocabularySessions.map((session) => session.id)).not.toContain("walk");
  expect(vocabularySessions.map((session) => session.id)).not.toContain("body-core");
});

test("imported completed strength sessions still qualify without set.completedAt when meaningful work data exists", async () => {
  const now = new Date("2026-05-04T09:00:00-04:00").getTime();
  const session = {
    id: "imported-strength",
    templateName: "Imported Upper",
    startedAt: now - 86_400_000,
    endedAt: now - 86_300_000,
  };
  const tracksById = new Map([
    [
      "strength-track",
      {
        id: "strength-track",
        exerciseId: "exercise-1",
        trackType: "strength" as const,
        displayName: "Bench Press",
        trackingMode: "weightedReps" as const,
        warmupSetsDefault: 0,
        workingSetsDefault: 3,
        repMin: 5,
        repMax: 8,
        restSecondsDefault: 120,
        weightJumpDefault: 5,
        createdAt: now,
      },
    ],
    [
      "conditioning-track",
      {
        id: "conditioning-track",
        exerciseId: "exercise-2",
        trackType: "conditioning" as const,
        displayName: "Walking",
        trackingMode: "timeSeconds" as const,
        warmupSetsDefault: 0,
        workingSetsDefault: 1,
        repMin: 1,
        repMax: 1,
        restSecondsDefault: 60,
        weightJumpDefault: 0,
        createdAt: now,
      },
    ],
  ]);

  expect(
    isStrengthBuildingSession({
      session: session as any,
      tracksById: new Map([["strength-track", tracksById.get("strength-track")!]]),
      sets: [
        {
          id: "set-strength",
          sessionId: "imported-strength",
          trackId: "strength-track",
          createdAt: now,
          setType: "working" as const,
          reps: 8,
          weight: 135,
        },
      ] as any,
    })
  ).toBe(true);

  expect(
    isStrengthBuildingSession({
      session: session as any,
      tracksById: new Map([["conditioning-track", tracksById.get("conditioning-track")!]]),
      sets: [
        {
          id: "set-conditioning",
          sessionId: "imported-strength",
          trackId: "conditioning-track",
          createdAt: now,
          setType: "working" as const,
          seconds: 1800,
        },
      ] as any,
    })
  ).toBe(false);

  expect(
    isStrengthBuildingSession({
      session: session as any,
      tracksById: new Map([["strength-track", tracksById.get("strength-track")!]]),
      sets: [
        {
          id: "set-empty",
          sessionId: "imported-strength",
          trackId: "strength-track",
          createdAt: now,
          setType: "working" as const,
        },
      ] as any,
    })
  ).toBe(false);
});

test("exercise vocabulary uses the last 8 strength-building sessions and preserves side-specific names", async () => {
  const now = new Date("2026-05-04T09:00:00-04:00").getTime();
  const sessions = Array.from({ length: 10 }, (_, index) => ({
    id: `session-${index + 1}`,
    templateName: index === 8 ? "Walking" : index === 9 ? "Body Core" : `Strength ${index + 1}`,
    startedAt: now - (10 - index) * 10_000,
    endedAt: now - (10 - index) * 10_000 + 1,
  }));

  const exercises = [
    "Bench Press",
    "Single-Leg DB RDL Left",
    "Single-Leg DB RDL Right",
    "Bulgarian Split Squat Left",
    "Bulgarian Split Squat Right",
    "Copenhagen Plank Left",
    "Copenhagen Plank Right",
    "90/90 Hip Lift",
    "Walking",
    "Box Breathing",
  ].map((name, index) => ({
    id: `exercise-${index + 1}`,
    name,
    normalizedName: name.toLowerCase(),
    equipmentTags: [],
    createdAt: now,
  }));

  const tracks = [
    {
      id: "track-1",
      exerciseId: "exercise-1",
      trackType: "strength" as const,
      displayName: "Bench Press",
      trackingMode: "weightedReps" as const,
      warmupSetsDefault: 0,
      workingSetsDefault: 3,
      repMin: 5,
      repMax: 8,
      restSecondsDefault: 120,
      weightJumpDefault: 5,
      createdAt: now,
    },
    {
      id: "track-2",
      exerciseId: "exercise-2",
      trackType: "strength" as const,
      displayName: "Single-Leg DB RDL Left",
      trackingMode: "weightedReps" as const,
      warmupSetsDefault: 0,
      workingSetsDefault: 3,
      repMin: 5,
      repMax: 8,
      restSecondsDefault: 120,
      weightJumpDefault: 5,
      createdAt: now,
    },
    {
      id: "track-3",
      exerciseId: "exercise-3",
      trackType: "strength" as const,
      displayName: "Single-Leg DB RDL Right",
      trackingMode: "weightedReps" as const,
      warmupSetsDefault: 0,
      workingSetsDefault: 3,
      repMin: 5,
      repMax: 8,
      restSecondsDefault: 120,
      weightJumpDefault: 5,
      createdAt: now,
    },
    {
      id: "track-4",
      exerciseId: "exercise-4",
      trackType: "strength" as const,
      displayName: "Bulgarian Split Squat Left",
      trackingMode: "weightedReps" as const,
      warmupSetsDefault: 0,
      workingSetsDefault: 3,
      repMin: 5,
      repMax: 8,
      restSecondsDefault: 120,
      weightJumpDefault: 5,
      createdAt: now,
    },
    {
      id: "track-5",
      exerciseId: "exercise-5",
      trackType: "strength" as const,
      displayName: "Bulgarian Split Squat Right",
      trackingMode: "weightedReps" as const,
      warmupSetsDefault: 0,
      workingSetsDefault: 3,
      repMin: 5,
      repMax: 8,
      restSecondsDefault: 120,
      weightJumpDefault: 5,
      createdAt: now,
    },
    {
      id: "track-6",
      exerciseId: "exercise-6",
      trackType: "corrective" as const,
      displayName: "Copenhagen Plank Left",
      trackingMode: "repsOnly" as const,
      warmupSetsDefault: 0,
      workingSetsDefault: 1,
      repMin: 1,
      repMax: 1,
      restSecondsDefault: 60,
      weightJumpDefault: 0,
      createdAt: now,
    },
    {
      id: "track-7",
      exerciseId: "exercise-7",
      trackType: "corrective" as const,
      displayName: "Copenhagen Plank Right",
      trackingMode: "repsOnly" as const,
      warmupSetsDefault: 0,
      workingSetsDefault: 1,
      repMin: 1,
      repMax: 1,
      restSecondsDefault: 60,
      weightJumpDefault: 0,
      createdAt: now,
    },
    {
      id: "track-8",
      exerciseId: "exercise-8",
      trackType: "mobility" as const,
      displayName: "90/90 Hip Lift",
      trackingMode: "repsOnly" as const,
      warmupSetsDefault: 0,
      workingSetsDefault: 1,
      repMin: 1,
      repMax: 1,
      restSecondsDefault: 60,
      weightJumpDefault: 0,
      createdAt: now,
    },
    {
      id: "track-9",
      exerciseId: "exercise-9",
      trackType: "conditioning" as const,
      displayName: "Walking",
      trackingMode: "timeSeconds" as const,
      warmupSetsDefault: 0,
      workingSetsDefault: 1,
      repMin: 1,
      repMax: 1,
      restSecondsDefault: 60,
      weightJumpDefault: 0,
      createdAt: now,
    },
    {
      id: "track-10",
      exerciseId: "exercise-10",
      trackType: "mobility" as const,
      displayName: "Box Breathing",
      trackingMode: "repsOnly" as const,
      warmupSetsDefault: 0,
      workingSetsDefault: 1,
      repMin: 1,
      repMax: 1,
      restSecondsDefault: 60,
      weightJumpDefault: 0,
      createdAt: now,
    },
  ];

  const sets = [
    { id: "set-1", sessionId: "session-1", trackId: "track-1", createdAt: now, completedAt: now, setType: "working" as const, reps: 6, weight: 185 },
    { id: "set-2", sessionId: "session-2", trackId: "track-2", createdAt: now, completedAt: now, setType: "working" as const, reps: 8, weight: 55 },
    { id: "set-3", sessionId: "session-3", trackId: "track-3", createdAt: now, completedAt: now, setType: "working" as const, reps: 8, weight: 55 },
    { id: "set-4", sessionId: "session-4", trackId: "track-4", createdAt: now, completedAt: now, setType: "working" as const, reps: 10, weight: 45 },
    { id: "set-5", sessionId: "session-5", trackId: "track-5", createdAt: now, completedAt: now, setType: "working" as const, reps: 10, weight: 45 },
    { id: "set-6", sessionId: "session-5", trackId: "track-6", createdAt: now, completedAt: now, setType: "working" as const, reps: 1 },
    { id: "set-7", sessionId: "session-6", trackId: "track-1", createdAt: now, completedAt: now, setType: "working" as const, reps: 5, weight: 185 },
    { id: "set-8", sessionId: "session-6", trackId: "track-7", createdAt: now, completedAt: now, setType: "working" as const, reps: 1 },
    { id: "set-9", sessionId: "session-6", trackId: "track-8", createdAt: now, completedAt: now, setType: "warmup" as const, reps: 5 },
    { id: "set-10", sessionId: "session-7", trackId: "track-1", createdAt: now, completedAt: now, setType: "working" as const, reps: 5, weight: 185 },
    { id: "set-11", sessionId: "session-8", trackId: "track-1", createdAt: now, completedAt: now, setType: "working" as const, reps: 5, weight: 185 },
    { id: "set-12", sessionId: "session-9", trackId: "track-9", createdAt: now, completedAt: now, setType: "working" as const, seconds: 1800 },
    { id: "set-13", sessionId: "session-10", trackId: "track-10", createdAt: now, completedAt: now, setType: "working" as const, reps: 5 },
  ];

  const vocabulary = buildExerciseVocabulary({
    sessions: sessions as any,
    sets: sets as any,
    tracks: tracks as any,
    exercises: exercises as any,
    anchorLifts: [],
    limit: 25,
  });

  expect(vocabulary).toEqual(
    expect.arrayContaining([
      "Bench Press",
      "Single-Leg DB RDL Left",
      "Single-Leg DB RDL Right",
      "Bulgarian Split Squat Left",
      "Bulgarian Split Squat Right",
      "Copenhagen Plank Left",
      "Copenhagen Plank Right",
      "90/90 Hip Lift",
    ])
  );
  expect(vocabulary).not.toContain("Walking");
  expect(vocabulary).not.toContain("Box Breathing");
  expect(vocabulary.filter((name) => name.includes("Left")).length).toBeGreaterThan(0);
  expect(vocabulary.filter((name) => name.includes("Right")).length).toBeGreaterThan(0);
});

test("exercise vocabulary cap keeps the most recent names inside the 8-session window", async () => {
  const now = new Date("2026-05-04T09:00:00-04:00").getTime();
  const sessions = Array.from({ length: 8 }, (_, index) => ({
    id: `session-${index + 1}`,
    templateName: `Strength ${index + 1}`,
    startedAt: now - index * 10_000,
    endedAt: now - index * 10_000 + 1,
  }));

  const namesBySession = [
    ["Recent A1", "Recent A2", "Recent A3", "Recent A4"],
    ["Recent B1", "Recent B2", "Recent B3", "Recent B4"],
    ["Recent C1", "Recent C2", "Recent C3", "Recent C4"],
    ["Recent D1", "Recent D2", "Recent D3", "Recent D4"],
    ["Recent E1", "Recent E2", "Recent E3", "Recent E4"],
    ["Recent F1", "Recent F2", "Recent F3", "Recent F4"],
    ["Older G1", "Older G2", "Older G3", "Older G4"],
    ["Older H1", "Older H2", "Older H3", "Older H4"],
  ];

  const exercises: any[] = [];
  const tracks: any[] = [];
  const sets: any[] = [];
  let counter = 1;
  for (const [sessionIndex, session] of sessions.entries()) {
    for (const name of namesBySession[sessionIndex]) {
      const exerciseId = `exercise-${counter}`;
      const trackId = `track-${counter}`;
      exercises.push({
        id: exerciseId,
        name,
        normalizedName: name.toLowerCase(),
        equipmentTags: [],
        createdAt: now,
      });
      tracks.push({
        id: trackId,
        exerciseId,
        trackType: "strength",
        displayName: name,
        trackingMode: "weightedReps",
        warmupSetsDefault: 0,
        workingSetsDefault: 3,
        repMin: 5,
        repMax: 8,
        restSecondsDefault: 120,
        weightJumpDefault: 5,
        createdAt: now,
      });
      sets.push({
        id: `set-${counter}`,
        sessionId: session.id,
        trackId,
        createdAt: now + counter,
        completedAt: now + counter,
        setType: "working",
        reps: 8,
        weight: 100,
      });
      counter += 1;
    }
  }

  const vocabulary = buildExerciseVocabulary({
    sessions: sessions as any,
    sets,
    tracks,
    exercises,
    anchorLifts: [],
    limit: 25,
  });

  expect(vocabulary).toHaveLength(25);
  expect(vocabulary).toEqual(
    expect.arrayContaining([
      "Recent A1",
      "Recent F4",
      "Older G1",
    ])
  );
  expect(vocabulary).not.toContain("Older H4");
  expect(vocabulary.indexOf("Recent A1")).toBeLessThan(vocabulary.indexOf("Older G1"));
});

test("next workout focus builds constraint and trigger guidance without split-specific language", async () => {
  const focus = buildNextWorkoutFocus({
    trainingSignals: {
      movementQuality: [
        "Lat Pulldown: improved stretch and contraction",
        "Lateral Raise: medial delt isolation still not clean",
      ],
      stimulusCoverage: [
        "Pull: strong lat stimulus",
        "Shoulders: lateral delt isolation needs refinement",
      ],
      fatigueReadiness: [
        "Fatigue mostly appeared at terminal reps",
        "Shoulder sensitive in behind-head position",
        "Elbow pain showed up late",
      ],
      nextWorkoutFocus: [
        "Maintain lat-driven pulling before increasing load",
        "Improve medial delt isolation",
        "Avoid behind-the-neck pressing positions",
      ],
      discussWithGaz: [
        "Review safe overhead pressing range",
      ],
    },
    patternSummary: {
      movementQuality: [
        "Lat engagement improving across recent pull work",
        "Shoulder sensitivity appears in overhead positions",
      ],
      stimulus: ["Pull stimulus consistently strong"],
      fatigue: ["Fatigue consistently appears at terminal reps"],
      constraints: ["Shoulder sensitivity linked to behind-head or overhead positions"],
      progression: ["Pulling movements show improving consistency"],
    },
    phaseQuality: {
      finalStatus: "Aggressive Cut",
      confidence: "High",
      drivers: ["Muscle-risk cut risk remains elevated."],
    } as any,
  });

  expect(focus.progressionGuardrails.join(" ")).toMatch(
    /keep progression conservative/i
  );
  expect(focus.progressionGuardrails.join(" ")).toMatch(
    /joint feedback|shoulder sensitivity/i
  );
  expect(focus.executionPriorities.join(" ")).toMatch(
    /pulling setup constraints|selecting or progressing work/i
  );
  expect(focus.executionPriorities.join(" ")).toMatch(
    /isolation inconsistency|movement-quality constraint/i
  );
  expect(focus.adjustmentTriggers.join(" ")).toMatch(
    /later-set fatigue|terminal-rep/i
  );
  expect(focus.adjustmentTriggers.join(" ")).toMatch(
    /stop or modify|joint feedback|shoulder|elbow/i
  );
  expect(focus.progressionGuardrails.length).toBeLessThanOrEqual(3);
  expect(focus.executionPriorities.length).toBeLessThanOrEqual(3);
  expect(focus.adjustmentTriggers.length).toBeLessThanOrEqual(3);
  expect(focus.progressionGuardrails.join(" ")).not.toMatch(/upper|lower|next workout type/i);
  expect(focus.executionPriorities.join(" ")).not.toMatch(/upper|lower|next workout type/i);
  expect(focus.adjustmentTriggers.join(" ")).not.toMatch(/upper|lower|next workout type/i);
  expect(focus.executionPriorities.join(" ")).not.toMatch(/\bprioritize\b/i);
  expect(focus.executionPriorities.join(" ")).not.toMatch(/\bimprove\b/i);
  expect(focus.executionPriorities.join(" ")).not.toMatch(/\bprogress\b/i);
  expect(focus.executionPriorities.join(" ")).not.toMatch(/\bbuild\b/i);
  expect(focus.executionPriorities.join(" ")).not.toMatch(/\badd\b/i);
  expect(focus.executionPriorities.join(" ")).not.toMatch(/\breplace\b/i);
  expect(focus.executionPriorities.join(" ")).not.toMatch(/\bprescribe\b/i);
  expect(focus.executionPriorities.join(" ")).not.toMatch(/\bdo\s+[a-z]/i);
});

test("next workout focus section avoids split prediction and exact programming prescriptions", async () => {
  const text = formatCoachExportText(buildMetrics());
  const focusSection = getSection(text, "Next Workout Focus", "Training Signals (Recent Sessions)");

  expect(focusSection).not.toMatch(/next workout:\s*(upper|lower)/i);
  expect(focusSection).not.toMatch(/\bdo\s+(upper|lower)\b/i);
  expect(focusSection).not.toMatch(/next session should be/i);

  expect(focusSection).not.toMatch(/\badd\s+\d+\s+sets?\b/i);
  expect(focusSection).not.toMatch(/\bdo\s+\d+\s+sets?\s+of\b/i);
  expect(focusSection).not.toMatch(/\bincrease by\s+\d+\s*(lb|lbs|kg)?\b/i);
  expect(focusSection).not.toMatch(/\bperform\s+\d+\s*-\s*\d+\s+reps?\b/i);
  expect(focusSection).not.toMatch(/\bprioritize\b/i);
  expect(focusSection).not.toMatch(/\bimprove\b/i);
  expect(focusSection).not.toMatch(/\bbuild\b/i);
  expect(focusSection).not.toMatch(/\breplace\b/i);
  expect(focusSection).not.toMatch(/\bprescribe\b/i);
});

test("next workout focus omits empty subsection headings when no bullets exist", async () => {
  const metrics = buildMetrics();
  metrics.nextWorkoutFocus = {
    progressionGuardrails: [
      "Keep progression conservative given current phase-quality risk.",
    ],
    executionPriorities: [],
    adjustmentTriggers: [],
  };

  const text = formatCoachExportText(metrics);
  const focusSection = getSection(text, "Next Workout Focus", "Training Signals (Recent Sessions)");

  expect(focusSection).toContain("Progression Guardrails");
  expect(focusSection).not.toContain("Execution Priorities");
  expect(focusSection).not.toContain("Adjustment Triggers");
});
