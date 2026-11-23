import { expect, test } from "@playwright/test";
import {
  buildRecentSessionObservationsReport,
  MAX_COACH_RECENT_OBSERVATIONS,
} from "../src/lib/coachReport/buildCoachReport";
import { formatCoachReportText } from "../src/lib/coachReport/formatCoachReportText";
import { buildGymCoachHandoff } from "../src/domain/coaching/gymCoachHandoff";
import type { RecentSessionNoteEvidence } from "../src/domain/coaching/recentSessionNotes";
import { buildTodayObservationContext, type TodayObservationContext } from "../src/lib/coachExport/todayObservationContext";
import { localWeekdayForDate, type WeeklyTrainingSchedule } from "../src/domain/schedule/weeklyTrainingSchedule";
import { resetDexieDb } from "./helpers/dbSeed";

function evidence(overrides: Partial<RecentSessionNoteEvidence> = {}): RecentSessionNoteEvidence {
  return {
    evidenceId: "session:session-a",
    occurredAt: Date.UTC(2026, 10, 12, 18),
    sessionId: "session-a",
    sessionName: "Upper B",
    sourceKind: "session_note",
    rawText: "shoulder kinda tight",
    ...overrides,
  };
}

function formatObservations(observations: ReturnType<typeof buildRecentSessionObservationsReport>) {
  return formatCoachReportText({
    generatedAt: "Nov 13, 2026",
    snapshot: {
      status: "On Track",
      confidence: "High",
      why: "Current evidence is available.",
      today: "Upper B",
    },
    recentSessionObservations: observations,
  } as any);
}

test("adapts raw observations with deterministic provenance, ordering, and no fake exercise", () => {
  const report = buildRecentSessionObservationsReport([
    evidence(),
    evidence({
      evidenceId: "set:set-2",
      sourceKind: "set_note",
      rawText: "Form broke down on final rep.",
      exerciseName: "Pull Up",
      setId: "set-2",
      setContext: { setType: "working", setNumber: 3, weight: 0, reps: 3, rir: 1 },
    }),
    evidence({
      evidenceId: "session:older",
      occurredAt: Date.UTC(2026, 10, 9, 18),
      sessionId: "older",
      sessionName: "Upper A",
      rawText: "Slower reps felt better.",
    }),
  ])!;

  expect(report.observations.map((item) => item.evidenceId)).toEqual([
    "set:set-2",
    "session:session-a",
    "session:older",
  ]);
  expect(report.observations[0]).toMatchObject({
    exerciseName: "Pull Up",
    setId: "set-2",
    setContext: "Work set 3 · BW x 3 @1",
  });
  expect(report.observations[1].exerciseName).toBeUndefined();

  const text = formatObservations(report);
  expect(text).toContain("Recent Session Observations");
  expect(text).toContain("- Pull Up · Work set 3 · BW x 3 @1");
  expect(text).toContain('"Form broke down on final rep."');
  expect(text).toContain('- Session note\n  "shoulder kinda tight"');
  expect(text.indexOf("Upper B")).toBeLessThan(text.indexOf("Upper A"));
});

test("caps unique rendered observations, reports the remainder, and omits duplicates", () => {
  const rows = Array.from({ length: MAX_COACH_RECENT_OBSERVATIONS + 2 }, (_, index) =>
    evidence({
      evidenceId: `session:${index}`,
      occurredAt: Date.UTC(2026, 10, 12 - index, 18),
      sessionId: `session-${index}`,
      sessionName: `Session ${index}`,
      rawText: `Raw observation ${index}`,
    })
  );
  rows.splice(1, 0, evidence({ evidenceId: "session:duplicate", rawText: "Raw observation 0" }));
  const report = buildRecentSessionObservationsReport(rows)!;
  const text = formatObservations(report);

  expect(report.observations).toHaveLength(MAX_COACH_RECENT_OBSERVATIONS);
  expect(report.additionalCount).toBe(3);
  expect(text.match(/Raw observation 0/g)).toHaveLength(1);
  expect(text).toContain("3 additional recent observations available in IronForge.");
});

test("ranks exact scheduled exercises ahead of newer unrelated observations", () => {
  const context: TodayObservationContext = {
    status: "training",
    sessionName: "Upper A",
    templateId: "upper-a",
    matchingSessionIds: [],
    trackIds: ["bench-track"],
    exerciseIds: ["bench"],
    exerciseNameKeys: ["bench press"],
  };
  const report = buildRecentSessionObservationsReport([
    evidence({ evidenceId: "leg-note", sessionId: "leg-session", occurredAt: Date.UTC(2026, 10, 18), sourceKind: "set_note", trackId: "squat-track", exerciseId: "squat", exerciseName: "Back Squat", rawText: "Unrelated newer note" }),
    evidence({ evidenceId: "bench-note", sessionId: "bench-session", occurredAt: Date.UTC(2026, 10, 12), sourceKind: "set_note", trackId: "bench-track", exerciseId: "bench", exerciseName: "Bench Press", rawText: "Relevant older note" }),
    evidence({ evidenceId: "alias-note", sessionId: "other-session", occurredAt: Date.UTC(2026, 10, 13), sourceKind: "set_note", trackId: "other-track", exerciseId: "different-id", exerciseName: "Bench Press", rawText: "Canonical name note" }),
  ], MAX_COACH_RECENT_OBSERVATIONS, context)!;

  expect(report.observations.map((item) => item.evidenceId)).toEqual(["bench-note", "alias-note", "leg-note"]);
  expect(report.observations[0].rawText).toBe("Relevant older note");
});

test("prioritizes notes from multiple scheduled exercises and same-template session notes without adding fake linkage", () => {
  const context: TodayObservationContext = {
    status: "training",
    sessionName: "Upper A",
    templateId: "upper-a",
    matchingSessionIds: ["prior-upper-a"],
    trackIds: ["bench-track", "pull-track"],
    exerciseIds: ["bench", "pull"],
    exerciseNameKeys: ["bench press", "pull up"],
  };
  const report = buildRecentSessionObservationsReport([
    evidence({ evidenceId: "session-note", sessionId: "prior-upper-a", sourceKind: "session_note", rawText: "General session observation" }),
    evidence({ evidenceId: "pull-note", sessionId: "other", sourceKind: "set_note", trackId: "pull-track", exerciseId: "pull", exerciseName: "Pull Up", rawText: "Pull note" }),
    evidence({ evidenceId: "bench-note", sessionId: "other", sourceKind: "set_note", trackId: "bench-track", exerciseId: "bench", exerciseName: "Bench Press", rawText: "Bench note" }),
  ], MAX_COACH_RECENT_OBSERVATIONS, context)!;

  expect(report.observations.map((item) => item.evidenceId)).toEqual(["bench-note", "pull-note", "session-note"]);
  expect(report.observations[2].exerciseName).toBeUndefined();
});

test("resolves today's linked template to structural track and canonical exercise identities", () => {
  const asOf = Date.now();
  const day = localWeekdayForDate(new Date(asOf));
  const schedule: WeeklyTrainingSchedule = {
    id: "schedule",
    active: true,
    createdAt: asOf,
    updatedAt: asOf,
    entries: Array.from({ length: 7 }, (_, index) => index + 1 === day
      ? { dayOfWeek: day, dayType: "training" as const, sessionName: "Upper A", templateId: "upper-a" }
      : { dayOfWeek: (index + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7, dayType: "recovery" as const }),
  };
  const context = buildTodayObservationContext({
    schedule,
    templates: [{ id: "upper-a", name: "Upper A", createdAt: asOf }],
    templateItems: [{ id: "ti-bench", templateId: "upper-a", orderIndex: 0, trackId: "bench-track", createdAt: asOf }],
    tracks: [{ id: "bench-track", exerciseId: "old-bench", displayName: "Bench Press", trackType: "strength", trackingMode: "weightedReps", warmupSetsDefault: 0, workingSetsDefault: 3, repMin: 5, repMax: 8, restSecondsDefault: 120, weightJumpDefault: 5, createdAt: asOf }],
    exercises: [
      { id: "old-bench", name: "Old Bench Name", normalizedName: "old bench name", mergedIntoExerciseId: "bench", equipmentTags: [], createdAt: asOf },
      { id: "bench", name: "Bench Press", normalizedName: "bench press", aliases: ["Barbell Bench"], equipmentTags: [], createdAt: asOf },
    ],
    sessions: [{ id: "prior-upper-a", templateId: "upper-a", templateName: "Upper A", startedAt: asOf - 1, endedAt: asOf - 1 }],
    asOf,
  });

  expect(context).toMatchObject({ status: "training", sessionName: "Upper A", templateId: "upper-a" });
  expect(context.matchingSessionIds).toContain("prior-upper-a");
  expect(context.trackIds).toEqual(["bench-track"]);
  expect(context.exerciseIds).toContain("old-bench");
  expect(context.exerciseIds).toContain("bench");
  expect(context.exerciseNameKeys).toContain("barbell bench");
});

test("no schedule, recovery, and unresolved schedules retain the existing recent ordering", () => {
  const asOf = Date.now();
  const day = localWeekdayForDate(new Date(asOf));
  const schedule = (entry: WeeklyTrainingSchedule["entries"][number]): WeeklyTrainingSchedule => ({
    id: "schedule", active: true, createdAt: asOf, updatedAt: asOf,
    entries: Array.from({ length: 7 }, (_, index) => index + 1 === day
      ? entry
      : { dayOfWeek: (index + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7, dayType: "recovery" as const }),
  });
  const baseArgs = {
    templates: [], templateItems: [], tracks: [], exercises: [], sessions: [], asOf,
  };
  const recovery = buildTodayObservationContext({ ...baseArgs, schedule: schedule({ dayOfWeek: day, dayType: "recovery" }) });
  const unresolved = buildTodayObservationContext({ ...baseArgs, schedule: schedule({ dayOfWeek: day, dayType: "training", sessionName: "Unresolved", templateId: "missing" }) });
  const sameNameButUnlinked = buildTodayObservationContext({
    ...baseArgs,
    sessions: [{ id: "same-name", templateName: "Upper A", startedAt: asOf - 1, endedAt: asOf - 1 }],
    schedule: schedule({ dayOfWeek: day, dayType: "training", sessionName: "Upper A" }),
  });
  const evidenceRows = [
    evidence({ evidenceId: "older-set", occurredAt: 10, sessionId: "a", sourceKind: "set_note", rawText: "Older set" }),
    evidence({ evidenceId: "newer-session", occurredAt: 20, sessionId: "b", sourceKind: "session_note", rawText: "Newer session" }),
  ];

  expect(recovery.status).toBe("recovery");
  expect(unresolved.status).toBe("unresolved");
  expect(sameNameButUnlinked.status).toBe("unresolved");
  expect(sameNameButUnlinked.matchingSessionIds).toEqual([]);
  expect(buildRecentSessionObservationsReport(evidenceRows)?.observations.map((item) => item.evidenceId)).toEqual(["newer-session", "older-set"]);
  expect(buildRecentSessionObservationsReport(evidenceRows, MAX_COACH_RECENT_OBSERVATIONS, recovery)?.observations.map((item) => item.evidenceId)).toEqual(["newer-session", "older-set"]);
  expect(buildRecentSessionObservationsReport(evidenceRows, MAX_COACH_RECENT_OBSERVATIONS, unresolved)?.observations.map((item) => item.evidenceId)).toEqual(["newer-session", "older-set"]);
});

test("today relevance fills the unchanged eight slots before general observations", () => {
  const rows = Array.from({ length: 9 }, (_, index) => evidence({
    evidenceId: `general-${index}`, sessionId: `general-session-${index}`,
    occurredAt: Date.UTC(2026, 10, 18 - index), sourceKind: "set_note",
    trackId: `other-track-${index}`, exerciseId: `other-exercise-${index}`,
    exerciseName: `Other ${index}`, rawText: `General ${index}`,
  }));
  rows.push(evidence({
    evidenceId: "today-relevant-old", sessionId: "today-session", occurredAt: Date.UTC(2026, 10, 1),
    sourceKind: "set_note", trackId: "today-track", exerciseId: "today-exercise",
    exerciseName: "Bench Press", rawText: "Today-relevant observation",
  }));
  const context: TodayObservationContext = {
    status: "training", matchingSessionIds: [], trackIds: ["today-track"],
    exerciseIds: ["today-exercise"], exerciseNameKeys: ["bench press"],
  };
  const report = buildRecentSessionObservationsReport(rows, MAX_COACH_RECENT_OBSERVATIONS, context)!;
  expect(report.observations).toHaveLength(8);
  expect(report.observations[0].evidenceId).toBe("today-relevant-old");
  expect(report.additionalCount).toBe(2);
});

test("omits the section when the canonical model has no observations", () => {
  expect(buildRecentSessionObservationsReport([])).toBeUndefined();
  expect(formatObservations(undefined)).not.toContain("Recent Session Observations");
});

test("canonical Coach Export and Gym Coach Handoff contain recent observations exactly once", async ({ page }) => {
  await page.goto("/");
  await resetDexieDb(page);
  const result = await page.evaluate(async () => {
    const { db } = await import("/src/db.ts");
    const { DAY_MS } = await import("/src/domain/coaching/recentSessionNotes.ts");
    const { buildCoachExportMetrics } = await import("/src/lib/coachExport/buildCoachExportMetrics.ts");
    const { formatCoachExportText } = await import("/src/lib/coachExport/formatCoachExportText.ts");
    const { buildGymCoachHandoff } = await import("/src/domain/coaching/gymCoachHandoff.ts");
    const now = Date.now();
    await db.exercises.add({ id: "pull-up", name: "Pull Up", normalizedName: "pull up", equipmentTags: [], createdAt: now });
    await db.tracks.add({
      id: "pull-up-track", exerciseId: "pull-up", trackType: "strength", displayName: "Pull Up",
      trackingMode: "weightedReps", warmupSetsDefault: 0, workingSetsDefault: 1, repMin: 3, repMax: 8,
      restSecondsDefault: 120, weightJumpDefault: 5, createdAt: now,
    });
    await db.sessions.bulkAdd([
      { id: "recent", templateName: "Upper B", startedAt: now - DAY_MS, endedAt: now - DAY_MS, notes: "Recent exact note." },
      { id: "old", templateName: "Upper A", startedAt: now - 22 * DAY_MS, endedAt: now - 22 * DAY_MS, notes: "Outside window." },
    ]);
    await db.sets.add({
      id: "recent-set", sessionId: "recent", trackId: "pull-up-track", createdAt: now - DAY_MS,
      completedAt: now - DAY_MS, setType: "working", weight: 0, reps: 3, rir: 1, notes: "Set exact note.",
    });
    await db.sets.add({
      id: "machine-only-set", sessionId: "recent", trackId: "pull-up-track", createdAt: now - DAY_MS + 1,
      completedAt: now - DAY_MS + 1, setType: "working", reps: 3, notes: "corrective",
    });
    await db.sets.add({
      id: "mixed-set", sessionId: "recent", trackId: "pull-up-track", createdAt: now - DAY_MS + 2,
      completedAt: now - DAY_MS + 2, setType: "working", reps: 3, notes: "set_type=conditioning | grip gave out first",
    });
    const metrics = await buildCoachExportMetrics();
    const coachExport = formatCoachExportText(metrics);
    const handoff = buildGymCoachHandoff({
      coachingInstructions: "Coach interactively.",
      todayIntent: { assignment: "Upper B" },
      coachExportText: coachExport,
      workoutReturnInstructions: "Return completed work only.",
    });
    return {
      coachExport,
      handoff,
      evidence: metrics.recentSessionNoteEvidence,
      storedMachineOnly: (await db.sets.get("machine-only-set"))?.notes,
      storedMixed: (await db.sets.get("mixed-set"))?.notes,
    };
  });

  expect(result.evidence?.map((item) => item.rawText)).toContain("Recent exact note.");
  expect(result.evidence?.map((item) => item.rawText)).toContain("Set exact note.");
  expect(result.evidence?.map((item) => item.rawText)).toContain("grip gave out first");
  expect(result.evidence?.map((item) => item.rawText)).not.toContain("corrective");
  expect(result.evidence?.map((item) => item.rawText)).not.toContain("set_type=conditioning");
  expect(result.coachExport.match(/Recent Session Observations/g)).toHaveLength(1);
  expect(result.coachExport).toContain("Recent exact note.");
  expect(result.coachExport).toContain("Set exact note.");
  expect(result.coachExport).toContain("grip gave out first");
  expect(result.coachExport).not.toContain("corrective");
  expect(result.coachExport).not.toContain("set_type=conditioning");
  expect(result.coachExport).not.toContain("Outside window.");
  expect(result.handoff.match(/Recent Session Observations/g)).toHaveLength(1);
  expect(result.handoff.match(/Recent exact note\./g)).toHaveLength(1);
  expect(result.handoff).toContain("grip gave out first");
  expect(result.handoff).not.toContain("corrective");
  expect(result.handoff).not.toContain("set_type=conditioning");
  expect(result.storedMachineOnly).toBe("corrective");
  expect(result.storedMixed).toBe("set_type=conditioning | grip gave out first");
});

test("pure handoff remains a wrapper around one canonical Coach Export", () => {
  const coachExportText = "IronForge Coach Export\nRecent Session Observations\nRaw evidence";
  const handoff = buildGymCoachHandoff({
    coachingInstructions: "Coach interactively.",
    todayIntent: { assignment: "Upper B" },
    coachExportText,
    workoutReturnInstructions: "Return completed work only.",
  });
  expect(handoff.match(/Recent Session Observations/g)).toHaveLength(1);
  expect(handoff.match(/IronForge Coach Export/g)).toHaveLength(1);
});
