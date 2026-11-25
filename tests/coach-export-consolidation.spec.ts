import { expect, test } from "@playwright/test";
import { formatCoachReportText } from "../src/lib/coachReport/formatCoachReportText";
import { buildTrainingExposureContext } from "../src/domain/training/trainingExposureContext";
import { buildAerobicBaseContext } from "../src/lib/cardio/aerobicBaseContext";

test("canonical Coach Export consolidates repeated structured context without reducing raw observations", () => {
  const now = new Date(2026, 9, 21, 12).getTime();
  const session = (id: string, day: number) => ({ id, startedAt: new Date(2026, 9, day, 10).getTime(), endedAt: new Date(2026, 9, day, 11).getTime(), templateName: "Upper A" });
  const exposure = buildTrainingExposureContext({
    sessions: [session("cur", 20), session("prev", 12)] as any,
    sets: ["cur", "prev"].flatMap((sessionId) => [1, 2].map((i) => ({ id: `${sessionId}-${i}`, sessionId, trackId: "bench-track", setType: "working", reps: 8, createdAt: now, completedAt: now }))) as any,
    tracks: [{ id: "bench-track", exerciseId: "bench", displayName: "Bench Press", trackType: "strength" }] as any,
    exercises: [{ id: "bench", name: "Bench Press", normalizedName: "bench press", movementPattern: "push", trainingRole: "primary", equipmentTags: [], createdAt: now }] as any,
    asOf: now,
  });
  exposure.calendar = { ...exposure.calendar, dayName: "Wednesday", localDate: "2026-10-21", weekStartLocalDate: "2026-10-19", weekEndLocalDate: "2026-10-25", calendarDaysStarted: 3, schedule: { todaySessionName: "Upper A", todayFocus: "Bench strength", todayAssignment: "Upper A", entries: [] } } as any;
  const text = formatCoachReportText({
    generatedAt: "Oct 21, 2026",
    snapshot: { status: "On Track", confidence: "Moderate", why: "Strength is stable; evidence is current.", today: "Upper A · Bench strength", explanation: { whatChanged: ["Strength stable"], evidence: [{ label: "Bench Press", value: "225x5 · 262 e1RM", freshness: "fresh", confidence: "high" }, { label: "Body composition", value: "Moderate", freshness: "fresh" }] } },
    goals: { targets: [{ label: "Weight", value: "198 lb -> 190 lb | 8 lb remaining", text: "- Weight: 198 lb -> 190 lb | 8 lb remaining" }] } as any,
    performance: { strengthSignal: "1.92 · +0.04 over 14d", anchor: { familyLabel: "Push", movementStatusLabel: "Current", latestSameExerciseText: "Bench Press · 225x5", benchmarkStatusLabel: "Recent", performanceBenchmarkText: "Bench Press | effective 225 lb x 5 | e1RM 262 | Oct 20 | 1d old", read: "Bench Press is current and the benchmark is recent." } },
    trainingExposure: exposure,
    programmingContext: { strength: { anchors: [{ pattern: "push", exerciseName: "Bench Press", benchmark: "225x5 · e1RM 262", freshness: "fresh", ageDays: 1 }, { pattern: "hinge", exerciseName: "Trap Bar Deadlift", benchmark: "315x5 · e1RM 354", freshness: "stale", ageDays: 31 }] }, coverage: { windowDays: 14, movementPatterns: [] }, trainingRoles: [], constraints: [], trainingExposure: exposure, intendedWeeklySchedule: { status: "active", entries: [{ dayName: "Monday", dayType: "training", sessionName: "Upper A", focus: "Bench" }, { dayName: "Tuesday", dayType: "recovery" }, { dayName: "Wednesday", dayType: "training", sessionName: "Upper B", focus: "Pull" }] }, cardio: { activities7d: 2, duration7dSeconds: 5400, distance7dMeters: 9656, activities28d: 6, activityTypes: ["Walk"], intents: ["Fitness"], formats: ["Continuous"], progression: { groups: [{ label: "Park loop", activityType: "walk", intent: "fitness", cardioFormat: "continuous", observationCount: 2, comparability: "same_route", recentObservations: [], recent: { date: "2026-10-20", paceSecondsPerMile: 900, avgHrBpm: 120, durationSeconds: 2700, distanceMeters: 4828, source: "MapMyWalk" }, direction: "improving", paceDifferenceSecondsPerMile: -10, averageHrDifferenceBpm: -2, limitations: [] }] }, strengthProximity: { observations: [] } }, exerciseProgression: [{ exerciseId: "bench", exerciseName: "Bench Press", metricMode: "reps", direction: "similar", observationCount: 2, latestObservationAt: now, recentObservations: [{ sessionId: "cur", observedAt: now, load: 225, reps: 5, rir: 2, e1RM: 262 }], bestRecentObservation: { sessionId: "cur", observedAt: now, load: 225, reps: 5, rir: 2, e1RM: 262 }, limitations: [] }], strengthGoalProgress: [{ exerciseId: "bench", exerciseName: "Bench Press", targetMetric: "load", targetValue: 250, currentComparableObservation: { observedAt: now, load: 225, reps: 5, rir: 2, e1RM: 262 }, bestValue: 235, absoluteDistance: 25, direction: "improving", freshness: "fresh", comparability: "similar", limitations: [] }] } as any,
    aerobicBase: buildAerobicBaseContext([{ sessionId: "walk", startedAt: now, endedAt: now, date: "2026-10-20", name: "Park Walk", activityType: "walk", cardioFormat: "continuous", durationSeconds: 2700, distanceMeters: 4828, confidence: "high" }] as any, { asOf: now }),
    cardio: { isEmpty: false, rows: [{ label: "Last 7 Days", value: "2 walks | 90 min | 6.0 mi", text: "- Last 7 Days: 2 walks | 90 min | 6.0 mi" }, { label: "Last 28 Days", value: "6 walks | 270 min | 18.0 mi", text: "- Last 28 Days: 6 walks | 270 min | 18.0 mi" }, { label: "Recent Walk/Cardio", value: "Oct 20, 2026 | Park Walk | 45 min | 3.0 mi", text: "- Recent Walk/Cardio: Oct 20, 2026 | Park Walk | 45 min | 3.0 mi" }] },
    recentSessionObservations: [
      { evidenceId: "n1", occurredAt: new Date(2026, 9, 20, 11).getTime(), sessionId: "s1", sessionName: "Upper A", sourceKind: "set_note", exerciseName: "Bench Press", setContext: "Work set 3 · 225 lb x 5 @2", rawText: "Shoulders felt stable." },
      { evidenceId: "n2", occurredAt: new Date(2026, 9, 20, 11).getTime(), sessionId: "s1", sessionName: "Upper A", sourceKind: "session_note", rawText: "Good session." },
    ],
  } as any);
  const lines = text.split("\n");
  const headings = ["Current Context", "Evidence Quality", "Evidence Completeness", "Goals", "Performance", "Training Exposure / Schedule", "Training Exposure", "Programming Context", "Recent Exercise Progression", "Cardio", "Cardio Context", "Recent Cardio Progression (eligible comparable groups, last 28d)", "Aerobic Base Exposure", "Recent Session Observations"];
  const counts = Object.fromEntries(headings.map((heading) => [heading, lines.filter((line) => line === heading).length]));
  const majorHeadings = ["Current Context", "Evidence Completeness", "Goals", "Performance", "Recent Session Observations", "Cardio", "Training Exposure / Schedule", "Aerobic Base Exposure", "Programming Context", "Methods / Definitions"];
  const sectionCounts = Object.fromEntries(majorHeadings.map((heading, index) => {
    const start = lines.indexOf(heading);
    const nextStarts = majorHeadings.slice(index + 1).map((next) => lines.indexOf(next)).filter((lineIndex) => lineIndex >= 0);
    const end = nextStarts.length ? Math.min(...nextStarts) : lines.length;
    return [heading, start < 0 ? 0 : end - start];
  }));
  expect(lines.length).toBe(109);
  expect(sectionCounts).toEqual({
    "Current Context": 13,
    "Evidence Completeness": 8,
    Goals: 10,
    Performance: 9,
    "Recent Session Observations": 7,
    Cardio: 5,
    "Training Exposure / Schedule": 22,
    "Aerobic Base Exposure": 6,
    "Programming Context": 22,
    "Methods / Definitions": 4,
  });
  expect(counts["Current Context"]).toBe(1);
  expect(counts["Evidence Quality"]).toBe(1);
  expect(counts["Evidence Completeness"]).toBe(1);
  expect(counts.Goals).toBe(1);
  expect(counts.Performance).toBe(1);
  expect(counts.Cardio).toBe(1);
  expect(counts["Training Exposure / Schedule"]).toBe(1);
  expect(counts["Training Exposure"]).toBe(1);
  expect(counts["Programming Context"]).toBe(1);
  expect(counts["Recent Exercise Progression"]).toBe(1);
  expect(counts["Cardio Context"]).toBe(1);
  expect(counts["Recent Cardio Progression (eligible comparable groups, last 28d)"]).toBe(1);
  expect(counts["Aerobic Base Exposure"]).toBe(1);
  expect(counts["Recent Session Observations"]).toBe(1);
  expect(text).not.toContain("Current focus: Upper A · Bench strength");
  expect(text).toContain("Today: Wednesday, Oct 21, 2026 — Upper A (Bench strength)");
  expect(text).toContain("Strength benchmarks: 1 of 1 key goals have fresh comparable evidence");
  expect(text).toContain("Performance Benchmark: Bench Press | effective 225 lb x 5 | e1RM 262");
  expect(text).toContain("Bench Press: Fresh · High confidence");
  expect(text).not.toContain("225x5 · e1RM 262 | fresh | 1d old");
  expect(text).toContain("Trap Bar Deadlift: 315x5 · e1RM 354 | stale | 31d old");
  expect(text).toContain("Current comparable: 225x5 | RIR 2 | scored e1RM 262");
  expect(text).toContain("Bench Press — similar · 2 comparable observations · latest 2026-10-21");
  expect(text).not.toContain("Latest: 2026-10-21 | 225x5 | @2 RIR | scored e1RM 262");
  expect(text).toContain("Last 7 Days: 2 walks | 90 min | 6.0 mi");
  expect(text).toContain("Last 28 Days: 6 walks | 270 min | 18.0 mi");
  expect(text).not.toContain("Last 7d: 2 activities");
  expect(text).not.toContain("Last 28d: 6 activities");
  expect(text).toContain("Last 28d activity types: Walk");
  expect(text).toContain("Last 28d intents: Fitness");
  expect(text).toContain("Last 28d formats: Continuous");
  expect(text).toContain("Comparability: same route");
  expect(text).toContain("Exposure: unquantified current week");
  expect(text.match(/Recent Session Observations/g)).toHaveLength(1);
  const observationSection = text.split("Recent Session Observations")[1]?.split("\nCardio\n")[0] ?? "";
  expect(observationSection).toContain('"Shoulders felt stable."');
  expect(observationSection).toContain('"Good session."');
  expect(observationSection.match(/\n  "/g)).toHaveLength(2);
  expect(text).toContain("Current week-to-date — partial period");
  expect(text).toContain("- Completed strength sessions: 1");
  expect(text).toContain("Previous complete week — complete period");
  expect(text).toContain("- Completed strength sessions: 1");
  expect(text).toContain("Rolling 14 days — rolling period");
  expect(text).toContain("- Completed strength sessions: 2");
  expect(text).toContain("push: 4 qualifying sets | 4 working | 2 sessions | 1 exercise");
});
