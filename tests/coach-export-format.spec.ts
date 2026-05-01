import { expect, test } from "@playwright/test";
import { buildNextWorkoutFocus } from "../src/lib/coachExport/buildNextWorkoutFocus";
import { formatCoachExportText } from "../src/lib/coachExport/formatCoachExportText";
import { buildPatternSummary, type CompletedSession } from "../src/lib/coachExport/buildPatternSummary";
import { buildExerciseVocabulary } from "../src/lib/coachExport/exerciseVocabulary";
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
        "Maintain lat-dominant pulling and protect the setup that reduces early arm takeover.",
        "Improve medial and lateral delt isolation quality before pushing shoulder-isolation progression.",
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
  expect(text).toContain("- Maintain lat-dominant pulling and protect the setup that reduces early arm takeover.");
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
    /lat-dominant pulling|arm takeover/i
  );
  expect(focus.executionPriorities.join(" ")).toMatch(
    /medial|lateral delt isolation/i
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
