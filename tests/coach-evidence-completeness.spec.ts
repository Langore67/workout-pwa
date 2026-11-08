import { expect, test } from "@playwright/test";
import { formatCoachReportText, formatRecentExerciseProgressionForCoach } from "../src/lib/coachReport/formatCoachReportText";

const snapshot = { status: "Neutral", confidence: "Moderate", why: "Evidence supplied.", today: "—" };

function exposureWindow(kind: "week_to_date" | "previous_complete_week" | "rolling_14_days", overrides: Record<string, unknown> = {}) {
  return {
    kind,
    startAt: 1,
    endAt: 2,
    startLocalDate: "2026-10-19",
    endLocalDate: "2026-10-21",
    isCompleteCalendarPeriod: kind === "previous_complete_week",
    completedStrengthSessions: 2,
    movementPatterns: [{ movementPattern: "push", qualifyingSets: 5, workingSets: 5, dropSets: 0, failureSets: 0, controlExposures: 0, sessionCount: 2, distinctCanonicalExerciseCount: 2, limitations: [] }],
    trainingRoles: [
      { trainingRole: "primary", qualifyingSets: 3, controlExposures: 0, sessionCount: 1, distinctCanonicalExerciseCount: 1 },
      { trainingRole: "untagged", qualifyingSets: 5, controlExposures: 0, sessionCount: 2, distinctCanonicalExerciseCount: 2 },
    ],
    unclassifiedSetCount: 2,
    unclassifiedExerciseCount: 1,
    limitations: [
      "Movement pattern is unavailable for Ambiguous Exercise A.",
      "Movement pattern is unavailable for Ambiguous Exercise B.",
      "2 qualifying sets could not be classified to a movement pattern.",
    ],
    ...overrides,
  };
}

function baseReport(overrides: Record<string, unknown> = {}) {
  return {
    snapshot,
    ...overrides,
  } as any;
}

test("Evidence Completeness summarizes only existing factual contexts and omits empty denominators", () => {
  const text = formatCoachReportText(baseReport({
    snapshot: { ...snapshot, explanation: { whatChanged: [], evidence: [{ label: "Body composition", value: "recent body trends", freshness: "fresh", confidence: "high" }] } },
    programmingContext: {
      strength: { anchors: [{ pattern: "squat", freshness: "fresh" }, { pattern: "push", freshness: "stale" }] },
      strengthGoalProgress: [
        ...["fresh", "aging", "unknown"].map((freshness, index) => ({ goalId: `goal-${index}`, exerciseId: `exercise-${index}`, exerciseName: `Exercise ${index}`, targetMetric: "load", targetValue: 100, currentValue: 80, bestValue: 90, freshness, comparability: "direct", observationCount: 1, limitations: [] })),
      ],
      exerciseProgression: [
        ...[2, 1, 3].map((observationCount, index) => ({ exerciseId: `progression-${index}`, exerciseName: `Progression ${index}`, metricMode: "reps", direction: "similar", observationCount, recentObservations: [], limitations: [] })),
      ],
      trainingRoles: [],
      goals: { targets: [] },
      constraints: [],
      trainingExposure: {
        windows: {
          currentWeekToDate: exposureWindow("week_to_date"),
          previousCompleteWeek: exposureWindow("previous_complete_week", { unclassifiedSetCount: undefined, unclassifiedExerciseCount: undefined }),
          rolling14Days: exposureWindow("rolling_14_days"),
        },
        calendar: { localDate: "2026-10-21", dayName: "Wednesday", weekStartLocalDate: "2026-10-19", weekEndLocalDate: "2026-10-25", currentWeekStatus: "in_progress", calendarDaysStarted: 3, calendarDaysRemaining: 4, completedStrengthSessionsWeekToDate: 2, completedDedicatedCardioSessionsWeekToDate: 0, schedule: { status: "unconfigured" } },
      },
      cardio: { activities7d: 0, duration7dSeconds: 0, distance7dMeters: 0, activities28d: 0, activityTypes: [], intents: [], formats: [], progression: { groups: [{ label: "Park", activityType: "walk", intent: "fitness", cardioFormat: "continuous", observationCount: 3, comparability: "exact_route", recent: { date: "2026-10-21" }, direction: "similar", recentObservations: [{ date: "2026-10-21" }], limitations: [] }] }, strengthProximity: { observations: [] } },
    },
    aerobicBase: {
      generatedAt: 2,
      method: "mapmywalk_zone_3_proxy",
      currentWeekToDate: { startAt: 1, endAt: 2, startLocalDate: "2026-10-19", endLocalDate: "2026-10-21", status: "in_progress", totalAerobicBaseSeconds: 3600, totalCardioSessions: 4, contributingSessions: 1, cardioSessionsWithZoneData: 1, cardioSessionsWithoutZoneData: 3, cardioSessionsWithoutUsableZoneEvidence: 3, observations: [], limitations: [] },
      previousCompleteWeek: { startAt: 0, endAt: 1, startLocalDate: "2026-10-12", endLocalDate: "2026-10-18", status: "complete", totalAerobicBaseSeconds: 0, totalCardioSessions: 0, contributingSessions: 0, cardioSessionsWithZoneData: 0, cardioSessionsWithoutZoneData: 0, cardioSessionsWithoutUsableZoneEvidence: 0, observations: [], limitations: [] },
      rolling14Days: { startAt: 0, endAt: 2, startLocalDate: "2026-10-08", endLocalDate: "2026-10-21", status: "rolling", totalAerobicBaseSeconds: 3600, totalCardioSessions: 4, contributingSessions: 1, cardioSessionsWithZoneData: 1, cardioSessionsWithoutZoneData: 3, cardioSessionsWithoutUsableZoneEvidence: 3, observations: [], limitations: [] },
    },
    body: { confidenceRows: [
      { label: "Overall confidence", value: "High confidence", text: "- Overall confidence: High confidence" },
      { label: "Weight trend confidence", value: "Moderate confidence", text: "- Weight trend confidence: Moderate confidence" },
    ], values: [], note: undefined },
  }));

  expect(text).toContain("Evidence Completeness");
  expect(text).toContain("Strength benchmarks: 1 of 3 key goals have fresh comparable evidence");
  expect(text).toContain("Exercise progression: 2 of 3 tracked exercises have at least 2 comparable recent observations");
  expect(text).toContain("Movement classification: 5 of 7 relevant sets classified");
  expect(text).toContain("Training roles: 3 of 8 relevant sets assigned");
  expect(text).toContain("Cardio zone evidence (current week-to-date): 1 of 4 dedicated cardio sessions have usable MapMyWalk zone evidence");
  expect(text).toContain("Cardio comparability: 3 recent observations have known route/type/intent/format context");
  expect(text).toContain("Body composition: High confidence");
  expect(text).not.toContain("Movement classification: 0 of 0");
  expect(text).not.toMatch(/good coverage|poor coverage|needs improvement|coach should|on track/i);
  expect(text.indexOf("Evidence Completeness")).toBeLessThan(text.indexOf("Training Calendar"));
  expect(text).toContain("Body composition: High confidence");
  expect(text).not.toContain("Overall confidence: High confidence");
  expect(text.match(/Body composition:/g)).toHaveLength(1);
  expect(text).toContain("Weight trend confidence: Moderate confidence");
});

test("Training Exposure keeps pattern totals and unclassified counts without repeated exercise-name limitations", () => {
  const text = formatCoachReportText(baseReport({
    trainingExposure: {
      calendar: { localDate: "2026-10-21", dayName: "Wednesday", weekStartLocalDate: "2026-10-19", weekEndLocalDate: "2026-10-25", currentWeekStatus: "in_progress", calendarDaysStarted: 3, calendarDaysRemaining: 4, completedStrengthSessionsWeekToDate: 2, completedDedicatedCardioSessionsWeekToDate: 0, schedule: { status: "unconfigured" } },
      windows: {
        currentWeekToDate: exposureWindow("week_to_date"),
        previousCompleteWeek: exposureWindow("previous_complete_week"),
        rolling14Days: exposureWindow("rolling_14_days"),
      },
    },
  }));

  expect(text).toContain("push: 5 qualifying sets");
  expect(text).toContain("Unclassified: 2 relevant sets | 1 exercise");
  expect(text).not.toContain("Ambiguous Exercise A");
  expect(text).not.toContain("Ambiguous Exercise B");
});

test("cardio progression limitations are compact while observations and comparison facts remain", () => {
  const text = formatCoachReportText(baseReport({
    programmingContext: {
      strength: { anchors: [] }, trainingRoles: [], coverage: { windowDays: 0, movementPatterns: [] },
      strengthConsistency: { currentWeekToDateSessions: 0, previousCompleteWeekSessions: 0, rolling14DaySessions: 0 },
      goals: { targets: [] }, constraints: [], trainingRoles: [],
      cardio: {
        activities7d: 2, duration7dSeconds: 3600, distance7dMeters: 5000, activities28d: 2, activityTypes: ["walk"], intents: ["fitness"], formats: ["continuous"],
        progression: { groups: [{ label: "Park", activityType: "walk", intent: "fitness", cardioFormat: "continuous", observationCount: 2, comparability: "route_unknown", direction: "similar", recent: { date: "2026-10-21", paceSecondsPerMile: 1127, avgHrBpm: 112 }, recentObservations: [{ date: "2026-10-21", paceSecondsPerMile: 1127, avgHrBpm: 112, durationSeconds: 3600, provenance: { avgHr: "structured_session" } }, { date: "2026-10-18", paceSecondsPerMile: 1140, durationSeconds: 3700, provenance: { avgHr: "legacy_notes" } }], limitations: ["Route identity is unavailable.", "Average HR is unavailable for one or more observations.", "Structured elevation is unavailable for one or more observations.", "One or more measurements use legacy note-derived data.", "Measurements use mixed provenance."] }] }, strengthProximity: { observations: [] },
      },
    },
  }));

  expect(text).toContain("Comparability: route unknown");
  expect(text).toContain("Data limitations: HR missing in 1 observation; elevation missing in 2 observations; legacy note-derived data in 1 observation; mixed provenance");
  expect(text).toContain("Recent observations:");
  expect(text).toContain("18:47/mi");
  expect(text).not.toContain("Average HR is unavailable for one or more observations.");
});

test("Evidence Completeness omits dimensions with no measurable denominator", () => {
  const emptyWindow = exposureWindow("week_to_date", { movementPatterns: [], trainingRoles: [], unclassifiedSetCount: undefined, unclassifiedExerciseCount: undefined });
  const text = formatCoachReportText(baseReport({
    trainingExposure: {
      calendar: { localDate: "2026-10-21", dayName: "Wednesday", weekStartLocalDate: "2026-10-19", weekEndLocalDate: "2026-10-25", currentWeekStatus: "in_progress", calendarDaysStarted: 3, calendarDaysRemaining: 4, completedStrengthSessionsWeekToDate: 0, completedDedicatedCardioSessionsWeekToDate: 0, schedule: { status: "unconfigured" } },
      windows: { currentWeekToDate: emptyWindow, previousCompleteWeek: emptyWindow, rolling14Days: emptyWindow },
    },
  }));
  const section = text.split("Evidence Completeness")[1]?.split("Training Calendar")[0] ?? "";
  expect(section).not.toContain("Movement classification");
  expect(section).not.toContain("Training roles: 0");
  expect(section).not.toContain("0 of 0");
});

test("identical progression limitations are summarized once with affected exercise names", () => {
  const shared = "No valid capped e1RM is available; direction uses directly comparable max reps.";
  const text = formatRecentExerciseProgressionForCoach([
    { exerciseName: "Cable Curl", exerciseId: "a", metricMode: "reps", direction: "similar", observationCount: 2, recentObservations: [], limitations: [shared] },
    { exerciseName: "Leg Raise", exerciseId: "b", metricMode: "reps", direction: "similar", observationCount: 2, recentObservations: [], limitations: [shared] },
  ] as any).join("\n");
  expect(text.match(/No valid capped e1RM/g)).toHaveLength(1);
  expect(text).toContain("Shared limitation (Cable Curl, Leg Raise)");
});
