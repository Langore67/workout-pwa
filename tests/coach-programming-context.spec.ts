import { expect, test } from "@playwright/test";
import { buildCardioProgressionContext } from "../src/lib/cardio/cardioProgressionContext";
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
      normalizedWalks: [{ startedAt: AS_OF, activityType: "walk", conditioningIntent: "fitness", cardioFormat: "continuous" }],
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
    setType: "working",
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
    expect(context.strengthConsistency).toEqual({
      currentWeekToDateSessions: 2,
      previousCompleteWeekSessions: 1,
      rolling14DaySessions: 3,
      latestCompletedStrengthSessionAt: AS_OF - 2 * DAY_MS + 60 * 60 * 1000,
      daysSinceLastCompletedStrengthSession: 2,
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
  expect(text).toContain("Training Exposure / Schedule");
  expect(text).toContain("Current week-to-date — partial period");
  expect(text).toContain("- Completed strength sessions: 1");
  expect(text).toContain("Previous complete week — complete period");
  expect(text).toContain("- Completed strength sessions: 0");
  expect(text).toContain("Rolling 14 days — rolling period");
  expect(text).not.toContain("Strength sessions, last 7d");
  expect(text).toContain("Trap Bar Deadlift: 315 lb x 5 reps | e1RM 354.4 lb | stale | 31d old");
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
  expect(text).toContain("Recent Cardio Progression");
  expect(text).toContain("Observations: 2");
  expect(text).toContain("2026-10-08 | 17:11/mi | avg HR 112 bpm");
  expect(text).toContain("Direction: similar");
  expect(text).not.toMatch(/do more cardio|increase cardio|decrease cardio|target HR|add intervals/i);
});

test("November 25 cardio context classifications use the same six-observation 28-day population", () => {
  const asOf = Date.UTC(2026, 10, 25, 12);
  const daysAgo = (days: number) => asOf - days * DAY_MS;
  const walks = [
    ...[8, 11, 14, 17, 20].map((days, index) => ({
      sessionId: `park-${index}`, startedAt: daysAgo(days), date: `2026-11-${25 - days}`,
      name: "Peachtree Ridge Park Walk", route: "Peachtree Ridge Park", activityType: "walk",
      conditioningIntent: "fitness", cardioFormat: "continuous", durationSeconds: 1800, distanceMeters: 3000,
      paceSecondsPerMile: 965, confidence: "high",
    })),
    {
      sessionId: "baynes", startedAt: daysAgo(22), date: "2026-11-03", name: "Peachtree Ridge Park Walk",
      route: "Peachtree Ridge Park, Baynes Creek area", activityType: "walk",
      cardioFormat: "continuous", durationSeconds: 1800, distanceMeters: 3000,
      metricProvenance: { route: "legacy_notes", source: "legacy_notes" }, confidence: "medium",
    },
    { sessionId: "old-hike", startedAt: daysAgo(35), name: "Old hike", activityType: "hike", conditioningIntent: "adventure", cardioFormat: "intervals", confidence: "high" },
    { sessionId: "old-run", startedAt: daysAgo(50), name: "Old run", activityType: "run", conditioningIntent: "recovery", cardioFormat: "intervals", confidence: "high" },
  ] as any;
  const context = buildCoachProgrammingContext({
    metrics: metrics({ cardioSummary: {
      normalizedWalks: walks,
      last7d: { count: 0, totalDurationSeconds: 0, totalDistanceMeters: 0 },
      last28d: { count: 6, totalDurationSeconds: 10800, totalDistanceMeters: 18000 },
    } }),
    ...strengthHistory(["Anything"]), asOf,
  });
  const text = formatCoachReportText({
    generatedAt: "Nov 25, 2026",
    snapshot: { status: "Solid", confidence: "High", why: "Current evidence.", today: "Coach decides." },
    programmingContext: context,
  } as any);

  expect(context.cardio).toMatchObject({ activities7d: 0, activities28d: 6, activityTypes: ["walk"], intents: ["fitness", "unknown"], formats: ["continuous"] });
  expect(text).toContain("Last 7d: 0 activities");
  expect(text).toContain("Last 28d: 6 activities");
  expect(text).toContain("Last 28d activity types: Walk");
  expect(text).toContain("Last 28d intents: Fitness, Unknown");
  expect(text).toContain("Last 28d formats: Continuous");
  expect(text).not.toMatch(/Last 28d activity types:.*Hike|Last 28d activity types:.*Run/);
  expect(text).not.toContain("Adventure");
  expect(text).not.toContain("Intervals");
  expect(text).toContain("Recent Cardio Progression (eligible comparable groups, last 28d)");
  expect(context.cardio?.progression.groups.flatMap((group) => group.recentObservations).some((row) => row.provenance?.route === "legacy_notes")).toBe(true);
});

test("cardio context retains mixed structured values and reports unknown dimensions without inference", () => {
  const events = [
    { sessionId: "walk", startedAt: AS_OF - DAY_MS, name: "Walk", activityType: "walk", conditioningIntent: "fitness", cardioFormat: "continuous", confidence: "high" },
    { sessionId: "bike", startedAt: AS_OF - 2 * DAY_MS, name: "Bike", activityType: "bike", cardioFormat: "intervals", confidence: "high" },
    { sessionId: "unknown", startedAt: AS_OF - 3 * DAY_MS, name: "Cardio", activityType: "elliptical", conditioningIntent: "relaxation", cardioFormat: "tempo", confidence: "medium" },
  ] as any;
  const context = buildCoachProgrammingContext({
    metrics: metrics({ cardioSummary: { normalizedWalks: events, last7d: { count: 3, totalDurationSeconds: 0, totalDistanceMeters: 0 }, last28d: { count: 3, totalDurationSeconds: 0, totalDistanceMeters: 0 } } }),
    ...strengthHistory(["Anything"]), asOf: AS_OF,
  });
  const text = formatCoachReportText({ snapshot: { status: "Solid", confidence: "High", why: "Evidence.", today: "Coach decides." }, programmingContext: context } as any);
  expect(context.cardio).toMatchObject({ activityTypes: ["bike", "unknown", "walk"], intents: ["fitness", "unknown"], formats: ["continuous", "intervals", "unknown"] });
  expect(text).toContain("Last 28d activity types: Bike, Unknown, Walk");
  expect(text).toContain("Last 28d intents: Fitness, Unknown");
  expect(text).toContain("Last 28d formats: Continuous, Intervals, Unknown");
});

test("cardio classification window includes the exact 28-day boundary and excludes older or future records", () => {
  const cutoff = AS_OF - 28 * DAY_MS;
  const events = [
    { sessionId: "boundary", startedAt: cutoff, activityType: "walk", conditioningIntent: "recovery", cardioFormat: "continuous" },
    { sessionId: "inside", startedAt: cutoff + 1, activityType: "run", conditioningIntent: "fitness", cardioFormat: "intervals" },
    { sessionId: "old", startedAt: cutoff - 1, activityType: "hike", conditioningIntent: "adventure", cardioFormat: "intervals" },
    { sessionId: "future", startedAt: AS_OF + 1, activityType: "bike", conditioningIntent: "fitness", cardioFormat: "continuous" },
  ] as any;
  const context = buildCoachProgrammingContext({
    metrics: metrics({ cardioSummary: { normalizedWalks: events, last7d: { count: 0, totalDurationSeconds: 0, totalDistanceMeters: 0 }, last28d: { count: 2, totalDurationSeconds: 0, totalDistanceMeters: 0 } } }),
    ...strengthHistory(["Anything"]), asOf: AS_OF,
  });
  expect(context.cardio).toMatchObject({ activities28d: 2, activityTypes: ["run", "walk"], intents: ["fitness", "recovery"], formats: ["continuous", "intervals"] });
});

test("empty cardio observation population adds no invented classifications", () => {
  const context = buildCoachProgrammingContext({
    metrics: metrics({ cardioSummary: { normalizedWalks: [], last7d: { count: 0, totalDurationSeconds: 0, totalDistanceMeters: 0 }, last28d: { count: 0, totalDurationSeconds: 0, totalDistanceMeters: 0 } } }),
    ...strengthHistory(["Anything"]), asOf: AS_OF,
  });
  expect(context.cardio).toBeUndefined();
});

test("Programming Context reuses the prebuilt CoachExportMetrics cardio progression object", () => {
  const cardioEvents = [
    { sessionId: "recent", startedAt: AS_OF - DAY_MS, date: "2026-10-08", name: "PRP Walk", activityType: "walk", conditioningIntent: "fitness", cardioFormat: "continuous", paceSecondsPerMile: 1031, confidence: "high" },
    { sessionId: "prior", startedAt: AS_OF - 3 * DAY_MS, date: "2026-10-06", name: "PRP Walk", activityType: "walk", conditioningIntent: "fitness", cardioFormat: "continuous", paceSecondsPerMile: 1060, confidence: "high" },
  ] as any;
  const progression = buildCardioProgressionContext(cardioEvents, { asOf: AS_OF });
  const context = buildCoachProgrammingContext({
    metrics: metrics({
      cardioSummary: { normalizedWalks: cardioEvents, last7d: { count: 2, totalDurationSeconds: 0, totalDistanceMeters: 0 }, last28d: { count: 2, totalDurationSeconds: 0, totalDistanceMeters: 0 } },
      cardioProgression: progression,
    }),
    ...strengthHistory(["Anything"]),
    asOf: AS_OF,
  });

  expect(context.cardio?.progression).toBe(progression);
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

  expect((text.match(/  - Observations: 2/g) ?? [])).toHaveLength(3);
  expect(text).toContain("Route A / Walk / Fitness / Continuous");
  expect(text).not.toContain("Route D / Walk / Fitness / Continuous");
});

test("Programming Context renders factual cardio/strength proximity without causal or prescriptive language", () => {
  const endedAt = AS_OF - 2 * 60 * 60 * 1000;
  const sessions = [
    { id: "prior-1", startedAt: AS_OF - 6 * DAY_MS, endedAt: AS_OF - 6 * DAY_MS + 60 * 60 * 1000 },
    { id: "prior-2", startedAt: AS_OF - 4 * DAY_MS, endedAt: AS_OF - 4 * DAY_MS + 60 * 60 * 1000 },
    { id: "current", templateName: "Anything", startedAt: endedAt - 60 * 60 * 1000, endedAt },
  ] as any;
  const tracks = [{ id: "deadlift-track", exerciseId: "trap", displayName: "Trap Bar Deadlift", trackType: "strength" }] as any;
  const sets = sessions.map((session: any) => ({ id: `set-${session.id}`, sessionId: session.id, trackId: "deadlift-track", setType: "working", weight: session.id === "current" ? 285 : 300, reps: 5, completedAt: session.endedAt, createdAt: session.endedAt })) as any;
  const cardioEvent = { sessionId: "cardio", startedAt: AS_OF - 20 * 60 * 60 * 1000, endedAt: AS_OF - 19 * 60 * 60 * 1000, date: "2026-10-08", name: "PRP Walk", activityType: "walk", conditioningIntent: "fitness", cardioFormat: "continuous", durationSeconds: 3600, distanceMeters: 5600, avgHr: 112, confidence: "high" };
  const context = buildCoachProgrammingContext({
    metrics: metrics({ cardioSummary: { normalizedWalks: [cardioEvent], last7d: { count: 1, totalDurationSeconds: 3600, totalDistanceMeters: 5600 }, last28d: { count: 1, totalDurationSeconds: 3600, totalDistanceMeters: 5600 } } }),
    sessions,
    sets,
    tracks,
    exercises: roleExercises,
    asOf: AS_OF,
  });
  const text = formatCoachReportText({ snapshot: { status: "Solid", confidence: "High", why: "Current evidence.", today: "Coach decides." }, programmingContext: context } as any);

  expect(context.cardio?.strengthProximity.observations[0]).toMatchObject({
    strength: { sessionId: "current", classification: "lower-body dominant" },
    comparison: { interpretation: "lower", exerciseName: "Trap Bar Deadlift" },
  });
  expect(text).toContain("Cardio / Strength Proximity");
  expect(text).toContain("lower-body dominant strength 16h later");
  expect(text).toContain("Trap Bar Deadlift: Performance was lower than recent comparable sessions");
  expect(text).not.toMatch(/caused|impaired|reduce cardio|recovery was poor|fatigue score/i);
});
