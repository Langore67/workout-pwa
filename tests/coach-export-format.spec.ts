import { expect, test } from "@playwright/test";
import { formatCoachExportText } from "../src/lib/coachExport/formatCoachExportText";
import { buildPatternSummary, type CompletedSession } from "../src/lib/coachExport/buildPatternSummary";
import type { CoachExportMetrics, CoachExportTrainingSignals } from "../src/lib/coachExport/types";

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
        exerciseName: "Bench Press",
        trackDisplayName: "Bench Press",
        effectiveWeightLb: 225,
        reps: 5,
        e1rm: 262,
        performedAt: new Date("2026-04-24T09:00:00-04:00").getTime(),
      },
    ],
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
  expect(text).toContain("- Improve medial delt isolation");
  expect(text).toContain("Discuss with Gaz");
  expect(text).toContain("- Review safe overhead pressing range");
  expect(text).toContain("Recent Patterns (Last 4 Sessions)");
  expect(text).toContain("- Lat engagement improving across recent pull work");
  expect(text).toContain("- Pulling movements show improving consistency");
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
