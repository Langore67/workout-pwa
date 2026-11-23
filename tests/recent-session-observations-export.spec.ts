import { expect, test } from "@playwright/test";
import {
  buildRecentSessionObservationsReport,
} from "../src/lib/coachReport/buildCoachReport";
import { formatCoachReportText } from "../src/lib/coachReport/formatCoachReportText";
import { buildGymCoachHandoff } from "../src/domain/coaching/gymCoachHandoff";
import type { RecentSessionNoteEvidence } from "../src/domain/coaching/recentSessionNotes";
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

  expect(report.map((item) => item.evidenceId)).toEqual([
    "session:session-a",
    "set:set-2",
    "session:older",
  ]);
  expect(report[1]).toMatchObject({
    exerciseName: "Pull Up",
    setId: "set-2",
    setContext: "Work set 3 · BW x 3 @1",
  });
  expect(report[0].exerciseName).toBeUndefined();

  const text = formatObservations(report);
  expect(text).toContain("Recent Session Observations");
  expect(text).toContain("- Pull Up · Work set 3 · BW x 3 @1");
  expect(text).toContain('"Form broke down on final rep."');
  expect(text).toContain('- Session note\n  "shoulder kinda tight"');
  expect(text.indexOf("Upper B")).toBeLessThan(text.indexOf("Upper A"));
});

test("exports every observation without a cap, duplicate suppression, or remainder line", () => {
  const rows = Array.from({ length: 11 }, (_, index) =>
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

  expect(report).toHaveLength(12);
  expect(text.match(/Raw observation 0/g)).toHaveLength(2);
  expect(text).not.toContain("additional recent observation");
});

test("uses neutral chronological ordering rather than today's workout relevance", () => {
  const report = buildRecentSessionObservationsReport([
    evidence({ evidenceId: "unrelated-new", sessionId: "new", occurredAt: Date.UTC(2026, 10, 18), sourceKind: "set_note", exerciseName: "Back Squat", rawText: "New unrelated note" }),
    evidence({ evidenceId: "pull-up-old", sessionId: "old", occurredAt: Date.UTC(2026, 10, 12), sourceKind: "set_note", exerciseName: "Pull Up", rawText: "Older Pull Up note" }),
  ])!;

  expect(report.map((item) => item.evidenceId)).toEqual(["unrelated-new", "pull-up-old"]);
});

test("orders notes within each session by source, set number, then stable evidence id", () => {
  const report = buildRecentSessionObservationsReport([
    evidence({ evidenceId: "set-2", sourceKind: "set_note", setContext: { setType: "working", setNumber: 2 }, rawText: "Second set" }),
    evidence({ evidenceId: "set-1-z", sourceKind: "set_note", setContext: { setType: "working", setNumber: 1 }, rawText: "First set z" }),
    evidence({ evidenceId: "session-note", sourceKind: "session_note", rawText: "Session-level" }),
    evidence({ evidenceId: "set-1-a", sourceKind: "set_note", setContext: { setType: "working", setNumber: 1 }, rawText: "First set a" }),
  ])!;
  expect(report.map((item) => item.evidenceId)).toEqual(["session-note", "set-1-a", "set-1-z", "set-2"]);
  expect(report[0].exerciseName).toBeUndefined();
});

test("preserves long session-note wording without truncation or fabricated exercise provenance", () => {
  const longNote = "A detailed raw observation. ".repeat(80).trim();
  const report = buildRecentSessionObservationsReport([
    evidence({ evidenceId: "long-session-note", sourceKind: "session_note", rawText: longNote }),
  ])!;
  const text = formatObservations(report);
  expect(report[0].rawText).toBe(longNote);
  expect(text).toContain(`  "${longNote}"`);
  expect(report[0].exerciseName).toBeUndefined();
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
    const additionalRecentSessions = Array.from({ length: 10 }, (_, index) => ({
      id: `recent-extra-${index}`,
      templateName: `Extra Session ${index}`,
      startedAt: now - (index + 2) * DAY_MS,
      endedAt: now - (index + 2) * DAY_MS,
      notes: `Additional human observation ${index}.`,
    }));
    await db.sessions.bulkAdd([
      { id: "recent", templateName: "Upper B", startedAt: now - DAY_MS, endedAt: now - DAY_MS, notes: "Recent exact note." },
      { id: "old", templateName: "Upper A", startedAt: now - 22 * DAY_MS, endedAt: now - 22 * DAY_MS, notes: "Outside window." },
      ...additionalRecentSessions,
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
  for (let index = 0; index < 10; index += 1) {
    expect(result.coachExport).toContain(`Additional human observation ${index}.`);
  }
  expect(result.coachExport).not.toContain("corrective");
  expect(result.coachExport).not.toContain("set_type=conditioning");
  expect(result.coachExport).not.toContain("Outside window.");
  expect(result.handoff.match(/Recent Session Observations/g)).toHaveLength(1);
  expect(result.handoff.match(/Recent exact note\./g)).toHaveLength(1);
  expect(result.handoff).toContain("grip gave out first");
  for (let index = 0; index < 10; index += 1) {
    expect(result.handoff).toContain(`Additional human observation ${index}.`);
  }
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
