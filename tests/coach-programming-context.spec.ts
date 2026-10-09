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
        { family: "hinge", label: "Hinge", status: "covered", effectiveSets7d: 5, controlExposures7d: 0, sessionCount7d: 2 },
        { family: "carry", label: "Carry", status: "missing", effectiveSets7d: 0, controlExposures7d: 0, sessionCount7d: 0 },
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

test("programming context is source-backed, neutral, and split-independent", () => {
  const histories = [
    strengthHistory(["Upper A", "Lower A", "Upper B"]),
    strengthHistory(["Push Day", "Pull Day", "Legs"]),
    strengthHistory(["Full Body 1", "Full Body 2", "Full Body 3"]),
  ];

  const contexts = histories.map((history) => buildCoachProgrammingContext({
    metrics: metrics(),
    ...history,
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
      expect.objectContaining({ family: "hinge", effectiveSets: 5, sessions: 2 }),
      expect.objectContaining({ family: "carry", status: "missing", effectiveSets: 0 }),
    ]));
    expect(context.goals.targets[0]).toMatchObject({ label: "Weight", current: 205, target: 195 });
    expect(context.cardio).toMatchObject({ activities7d: 2, activities28d: 7, activityTypes: ["walk"], intents: ["fitness"], formats: ["continuous"] });
    expect(context.constraints).toEqual(expect.arrayContaining([
      "Trap Bar Deadlift benchmark is stale.",
      "Carry coverage is missing in the 7-day window.",
    ]));
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
  expect(text).not.toContain("Cardio Context");
  expect(text).not.toContain("\nGoals\n");
  expect(text).not.toMatch(/Do bench today|Add 3 sets|Increase load|Take a deload|Train legs tomorrow|Reduce volume/i);
});
