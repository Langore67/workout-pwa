import { expect, test } from "@playwright/test";
import { buildCoachProgrammingContext } from "../src/lib/coachExport/programmingContext";
import { formatCoachReportText } from "../src/lib/coachReport/formatCoachReportText";

const DAY_MS = 24 * 60 * 60 * 1000;
const AS_OF = Date.UTC(2026, 9, 9, 12);

function metrics(overrides: Record<string, unknown> = {}) {
  return {
    generatedAt: AS_OF,
    strengthSignal: { current: 1.08, delta14d: 0.06, vs90dBestPct: -1 },
    anchorLifts: [
      {
        pattern: "hinge",
        exerciseName: "Trap Bar Deadlift",
        effectiveWeightLb: 315,
        reps: 5,
        e1rm: 354.4,
        ageDays: 31,
        recency: "stale",
      },
    ],
    coachIntelligence: { performanceTrendStatus: "Stable" },
    movementCoverage: {
      volumeWindowDays: 7,
      entries: [
        { family: "hinge", label: "Hinge", status: "covered", effectiveSets7d: 5, controlExposures7d: 0, sessionCount7d: 2, contributingExercises: [
          { exerciseName: "Trap Bar Deadlift", effectiveSets: 3 },
          { exerciseName: "Barbell RDL", effectiveSets: 2 },
        ] },
        { family: "carry", label: "Carry", status: "missing", effectiveSets7d: 0, controlExposures7d: 0, sessionCount7d: 0, contributingExercises: [] },
      ],
    },
    goalProgress: {
      status: "On Track",
      rows: [{ label: "Weight", current: 205, target: 195, remaining: 10, unit: "lb", status: "On Track" }],
    },
    cardioSummary: {
      normalizedWalks: [{ activityType: "walk", conditioningIntent: "fitness", cardioFormat: "continuous" }],
      last7d: { count: 2, totalDurationSeconds: 5400, totalDistanceMeters: 8046.72 },
      last28d: { count: 7, totalDurationSeconds: 18000, totalDistanceMeters: 25000 },
    },
    readinessNotes: ["Recovery evidence is limited."],
    ...overrides,
  } as any;
}

function strengthHistory(names: string[]) {
  const tracks = [{ id: "strength-track", trackType: "strength" }] as any;
  const sessions = names.map((templateName, index) => ({
    id: `session-${index}`,
    templateName,
    startedAt: AS_OF - (index + 1) * 2 * DAY_MS,
    endedAt: AS_OF - (index + 1) * 2 * DAY_MS + 60 * 60 * 1000,
  })) as any;
  const sets = sessions.map((session: any, index: number) => ({
    id: `set-${index}`,
    sessionId: session.id,
    trackId: "strength-track",
    reps: 8,
    weight: 100,
    completedAt: session.endedAt,
  })) as any;
  return { sessions, sets, tracks };
}

const roleExercises = [
  { id: "trap", name: "Trap Bar Deadlift", trainingRole: "primary", equipmentTags: [], createdAt: AS_OF },
  { id: "rdl", name: "Barbell RDL", trainingRole: "accessory", equipmentTags: [], createdAt: AS_OF },
  { id: "tke", name: "TKE", trainingRole: "corrective", equipmentTags: [], createdAt: AS_OF },
  { id: "carry", name: "Farmer Carry", trainingRole: "deprioritized", equipmentTags: [], createdAt: AS_OF },
  { id: "squat", name: "Goblet Squat", equipmentTags: [], createdAt: AS_OF },
] as any;

test("programming context is source-backed, neutral, and split-independent", () => {
  const histories = [
    strengthHistory(["Upper A", "Lower A", "Upper B"]),
    strengthHistory(["Push Day", "Pull Day", "Legs"]),
    strengthHistory(["Full Body 1", "Full Body 2", "Full Body 3"]),
  ];

  const contexts = histories.map((history) => buildCoachProgrammingContext({
    metrics: metrics(),
    ...history,
    exercises: roleExercises,
    asOf: AS_OF,
  }));

  for (const context of contexts) {
    expect(context.consistency).toEqual({
      strengthSessions7d: 3,
      strengthSessions14d: 3,
      daysSinceLastStrengthSession: 1,
    });
    expect(context.strength.anchors[0]).toMatchObject({ exerciseName: "Trap Bar Deadlift", freshness: "stale", ageDays: 31 });
    expect(context.coverage.movementPatterns).toEqual(expect.arrayContaining([
      expect.objectContaining({ family: "hinge", effectiveSets: 5, sessions: 2, roleBreakdown: { primary: 3, accessory: 2 } }),
      expect.objectContaining({ family: "carry", status: "missing", effectiveSets: 0 }),
    ]));
    expect(context.goals.targets[0]).toMatchObject({ label: "Weight", current: 205, target: 195 });
    expect(context.cardio).toMatchObject({ activities7d: 2, activities28d: 7, activityTypes: ["walk"], intents: ["fitness"], formats: ["continuous"] });
    expect(context.constraints).toEqual(expect.arrayContaining([
      "Trap Bar Deadlift benchmark is stale.",
      "Carry coverage is missing in the 7-day window.",
    ]));
    expect(context.trainingRoles).toEqual([
      { role: "primary", exercises: ["Trap Bar Deadlift"], totalExercises: 1 },
      { role: "accessory", exercises: ["Barbell RDL"], totalExercises: 1 },
      { role: "corrective", exercises: ["TKE"], totalExercises: 1 },
      { role: "deprioritized", exercises: ["Farmer Carry"], totalExercises: 1 },
    ]);
    expect(JSON.stringify(context)).not.toMatch(/do bench|add \d+ sets|increase load|take a deload|train legs|reduce volume/i);
  }
  expect(contexts[0]).toEqual(contexts[1]);
  expect(contexts[1]).toEqual(contexts[2]);
});

test("Programming Context export is concise and omits unavailable goals and cardio", () => {
  const history = strengthHistory(["Anything"]);
  const context = buildCoachProgrammingContext({
    metrics: metrics({ goalProgress: undefined, cardioSummary: undefined }),
    ...history,
    exercises: roleExercises,
    asOf: AS_OF,
  });
  const text = formatCoachReportText({
    generatedAt: "Oct 9, 2026",
    snapshot: { status: "Solid", confidence: "High", why: "Current evidence.", today: "Coach decides." },
    programmingContext: context,
  } as any);

  expect(text).toContain("Programming Context");
  expect(text).toContain("Strength sessions, last 7d: 1");
  expect(text).toContain("Trap Bar Deadlift: 315 lb x 5 reps | e1RM 354.4 lb | stale | 31d old");
  expect(text).toContain("Role breakdown: Primary 3 | Accessory 2");
  expect(text).toContain("Training Priorities / Roles");
  expect(text).toContain("Corrective: TKE");
  expect(text).toContain("Deprioritized: Farmer Carry");
  expect(text).not.toContain("Cardio Context");
  expect(text).not.toContain("\nGoals\n");
  expect(text).not.toMatch(/Do bench today|Add 3 sets|Increase load|Take a deload|Train legs tomorrow|Reduce volume/i);
});

test("Programming Context exposes factual comparable cardio progression without prescriptions", () => {
  const history = strengthHistory(["Anything"]);
  const cardioEvents = [
    { sessionId: "recent", startedAt: AS_OF - DAY_MS, date: "2026-10-08", name: "PRP Walk", activityType: "walk", conditioningIntent: "fitness", cardioFormat: "continuous", paceSecondsPerMile: 1031, avgHr: 112, durationSeconds: 3660, distanceMeters: 5713, confidence: "high" },
    { sessionId: "prior", startedAt: AS_OF - 3 * DAY_MS, date: "2026-10-06", name: "Walk - Peachtree Ridge Park", activityType: "walk", conditioningIntent: "fitness", cardioFormat: "continuous", paceSecondsPerMile: 1044, avgHr: 118, durationSeconds: 3720, distanceMeters: 5680, confidence: "high" },
  ];
  const cardioSummary = {
    normalizedWalks: cardioEvents,
    last7d: { count: 2, totalDurationSeconds: 7380, totalDistanceMeters: 11393 },
    last28d: { count: 2, totalDurationSeconds: 7380, totalDistanceMeters: 11393 },
  };
  const context = buildCoachProgrammingContext({
    metrics: metrics({ cardioSummary }),
    ...history,
    exercises: roleExercises,
    asOf: AS_OF,
  });
  const text = formatCoachReportText({
    generatedAt: "Oct 9, 2026",
    snapshot: { status: "Solid", confidence: "High", why: "Current evidence.", today: "Coach decides." },
    programmingContext: context,
  } as any);

  expect(context.cardio?.progression.summary).toEqual({ comparableSessionCount: 2, groupsWithTrend: 1 });
  expect(context.cardio?.progression.recentComparableGroups[0].recentObservations).toHaveLength(2);
  expect(text).toContain("Cardio Progression");
  expect(text).toContain("2 recent comparable sessions");
  expect(text).toContain("Recent: 2026-10-08 | 17:11/mi | 112 avg HR | 61 min | 3.5 mi");
  expect(text).toContain("Signal: possible efficiency signal");
  expect(text).not.toMatch(/do more cardio|increase cardio|decrease cardio|target HR|add intervals/i);
});

test("Cardio Progression report caps comparable groups at three", () => {
  const events = ["Route A", "Route B", "Route C", "Route D"].flatMap((route, groupIndex) => [
    { sessionId: `${route}-recent`, startedAt: AS_OF - (groupIndex + 1) * DAY_MS, date: `2026-10-0${8 - groupIndex}`, name: `${route} Walk`, route, activityType: "walk", conditioningIntent: "fitness", cardioFormat: "continuous", paceSecondsPerMile: 1000, confidence: "high" },
    { sessionId: `${route}-prior`, startedAt: AS_OF - (groupIndex + 6) * DAY_MS, date: `2026-10-0${3 - groupIndex}`, name: `${route} Walk`, route, activityType: "walk", conditioningIntent: "fitness", cardioFormat: "continuous", paceSecondsPerMile: 1010, confidence: "high" },
  ]);
  const context = buildCoachProgrammingContext({
    metrics: metrics({
      cardioSummary: {
        normalizedWalks: events,
        last7d: { count: 5, totalDurationSeconds: 0, totalDistanceMeters: 0 },
        last28d: { count: 8, totalDurationSeconds: 0, totalDistanceMeters: 0 },
      },
    }),
    ...strengthHistory(["Anything"]),
    asOf: AS_OF,
  });
  const text = formatCoachReportText({
    snapshot: { status: "Solid", confidence: "High", why: "Current evidence.", today: "Coach decides." },
    programmingContext: context,
  } as any);

  expect((text.match(/recent comparable sessions/g) ?? [])).toHaveLength(3);
  expect(text).toContain("Route A / Walk / Fitness / Continuous");
  expect(text).not.toContain("Route D / Walk / Fitness / Continuous");
});
