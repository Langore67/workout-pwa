import { expect, test } from "@playwright/test";
import {
  buildAerobicBaseContext,
  deriveAerobicBaseObservation,
} from "../src/lib/cardio/aerobicBaseContext";
import { buildCardioExportText } from "../src/lib/cardio/buildCardioExportText";
import type { CardioWalkEvent, CardioWalkSummary } from "../src/lib/cardio/cardioTypes";
import { buildCoachProgrammingContext } from "../src/lib/coachExport/programmingContext";
import { buildCoachStateFromExportMetrics } from "../src/lib/coachState/buildCoachState";
import { buildCoachReport } from "../src/lib/coachReport/buildCoachReport";
import { formatCoachReportText } from "../src/lib/coachReport/formatCoachReportText";

const AS_OF = new Date(2026, 9, 21, 12).getTime(); // Wednesday

function event(args: Partial<CardioWalkEvent> & { sessionId: string; startedAt: number }): CardioWalkEvent {
  return {
    date: "2026-10-21",
    name: "Walk",
    activityType: "walk",
    conditioningIntent: "fitness",
    cardioFormat: "continuous",
    confidence: "high",
    ...args,
  };
}

function zones(zone3?: number, source?: string) {
  return {
    ...(source ? { source } : {}),
    zones: [
      { zone: 1, seconds: 600 },
      { zone: 2, seconds: 480 },
      ...(zone3 ? [{ zone: 3, seconds: zone3 }] : []),
      { zone: 4, seconds: 300 },
    ],
  };
}

test("MapMyWalk Zone 3 is a factual aerobic-base proxy with source precedence", () => {
  const valid = deriveAerobicBaseObservation(event({
    sessionId: "valid", startedAt: AS_OF, provider: "mapmywalk", heartRateZones: zones(1620, "MapMyWalk display"),
  }));
  expect(valid).toMatchObject({ aerobicBaseSeconds: 1620, method: "mapmywalk_zone_3_proxy", hasZoneData: true });

  const providerOnly = deriveAerobicBaseObservation(event({
    sessionId: "provider", startedAt: AS_OF, provider: "mapmyfitness", heartRateZones: zones(900),
  }));
  expect(providerOnly).toMatchObject({ aerobicBaseSeconds: 900, method: "mapmywalk_zone_3_proxy" });

  const explicitUnsupportedSource = deriveAerobicBaseObservation(event({
    sessionId: "unsupported", startedAt: AS_OF, provider: "mapmywalk", heartRateZones: zones(900, "Unrelated Device"),
  }));
  expect(explicitUnsupportedSource).toMatchObject({ method: "unavailable", hasZoneData: true });
  expect(explicitUnsupportedSource.aerobicBaseSeconds).toBeUndefined();
});

test("missing Zone 3 and absent zone data remain unavailable rather than zero", () => {
  const missingZone3 = deriveAerobicBaseObservation(event({
    sessionId: "missing-zone-3", startedAt: AS_OF, provider: "mapmywalk", heartRateZones: zones(undefined, "MapMyWalk display"),
  }));
  const noZones = deriveAerobicBaseObservation(event({ sessionId: "no-zones", startedAt: AS_OF, provider: "mapmywalk" }));
  expect(missingZone3).toMatchObject({ method: "unavailable", hasZoneData: true });
  expect(noZones).toMatchObject({ method: "unavailable", hasZoneData: false });
  expect(missingZone3.aerobicBaseSeconds).toBeUndefined();
  expect(noZones.aerobicBaseSeconds).toBeUndefined();
});

test("weekly windows reuse Monday-local boundaries and preserve missing-evidence counts", () => {
  const context = buildAerobicBaseContext([
    event({ sessionId: "current-known", startedAt: new Date(2026, 9, 20, 8).getTime(), provider: "mapmywalk", heartRateZones: zones(1800, "MapMyWalk display") }),
    event({ sessionId: "current-missing", startedAt: new Date(2026, 9, 21, 8).getTime() }),
    event({ sessionId: "previous-known", startedAt: new Date(2026, 9, 14, 8).getTime(), provider: "mapmyfitness", heartRateZones: zones(2400) }),
    event({ sessionId: "previous-unsupported", startedAt: new Date(2026, 9, 15, 8).getTime(), provider: "other", heartRateZones: zones(1200, "Other Device") }),
    event({ sessionId: "rolling-known", startedAt: new Date(2026, 9, 10, 8).getTime(), provider: "mapmywalk", heartRateZones: zones(600) }),
    event({ sessionId: "outside", startedAt: new Date(2026, 9, 7, 8).getTime(), provider: "mapmywalk", heartRateZones: zones(999) }),
  ], { asOf: AS_OF });

  expect(context.currentWeekToDate).toMatchObject({
    startLocalDate: "2026-10-19", endLocalDate: "2026-10-21", status: "in_progress",
    totalAerobicBaseSeconds: 1800, totalCardioSessions: 2, contributingSessions: 1,
    cardioSessionsWithZoneData: 1, cardioSessionsWithoutZoneData: 1, cardioSessionsWithoutUsableZoneEvidence: 1,
  });
  expect(context.previousCompleteWeek).toMatchObject({
    startLocalDate: "2026-10-12", endLocalDate: "2026-10-18", status: "complete",
    totalAerobicBaseSeconds: 2400, totalCardioSessions: 2, contributingSessions: 1,
    cardioSessionsWithZoneData: 2, cardioSessionsWithoutZoneData: 0, cardioSessionsWithoutUsableZoneEvidence: 1,
  });
  expect(context.rolling14Days).toMatchObject({
    startLocalDate: "2026-10-08", endLocalDate: "2026-10-21", status: "rolling",
    totalAerobicBaseSeconds: 4800, totalCardioSessions: 5, contributingSessions: 3,
    cardioSessionsWithoutUsableZoneEvidence: 2,
  });
});

test("empty and all-unknown periods distinguish undocumented evidence from documented exposure", () => {
  const empty = buildAerobicBaseContext([], { asOf: AS_OF });
  expect(empty.currentWeekToDate).toMatchObject({ totalCardioSessions: 0, contributingSessions: 0, cardioSessionsWithoutUsableZoneEvidence: 0 });
  expect(empty.currentWeekToDate.limitations[0]).toContain("No dedicated cardio sessions");

  const unknown = buildAerobicBaseContext([
    event({ sessionId: "a", startedAt: new Date(2026, 9, 20, 8).getTime() }),
    event({ sessionId: "b", startedAt: new Date(2026, 9, 21, 8).getTime(), provider: "other", heartRateZones: zones(600, "Other") }),
  ], { asOf: AS_OF });
  expect(unknown.currentWeekToDate).toMatchObject({ totalAerobicBaseSeconds: 0, totalCardioSessions: 2, contributingSessions: 0, cardioSessionsWithoutUsableZoneEvidence: 2 });
  expect(unknown.currentWeekToDate.limitations[0]).toContain("does not estimate that work");
});

function minimalMetrics(aerobicBase: ReturnType<typeof buildAerobicBaseContext>) {
  return {
    generatedAt: AS_OF,
    currentPhase: "maintenance",
    bodyComp: { weight: {}, waist: {}, bodyFatPct: {}, leanMass: {}, bodyweightDelta7d: null, bodyweightDelta14d: null },
    hydration: {}, strengthSignal: {}, phaseQuality: null, anchorLifts: [], exerciseVocabulary: [],
    trainingSignals: { movementQuality: [], stimulusCoverage: [], fatigueReadiness: [], nextWorkoutFocus: [], discussWithGaz: [] },
    patternSummary: { movementQuality: [], stimulus: [], fatigue: [], constraints: [], progression: [] },
    nextWorkoutFocus: { executionPriorities: [], progressionGuardrails: [], adjustmentTriggers: [] },
    exportConfidence: {}, readinessNotes: [], dataNotes: [], aerobicBase,
  } as any;
}

test("Coach layers reuse the same context and render only factual partial-period exposure", () => {
  const aerobicBase = buildAerobicBaseContext([
    event({ sessionId: "known", startedAt: new Date(2026, 9, 20, 8).getTime(), provider: "mapmywalk", heartRateZones: zones(4380) }),
    event({ sessionId: "unknown", startedAt: new Date(2026, 9, 21, 8).getTime() }),
  ], { asOf: AS_OF });
  const metrics = minimalMetrics(aerobicBase);
  const programming = buildCoachProgrammingContext({ metrics, sessions: [], sets: [], tracks: [], exercises: [], asOf: AS_OF });
  metrics.programmingContext = programming;
  const state = buildCoachStateFromExportMetrics(metrics);
  const report = buildCoachReport({ coachState: state, metrics, generatedAt: AS_OF });
  const text = formatCoachReportText(report);
  expect(programming.aerobicBase).toBe(aerobicBase);
  expect(state.aerobicBase).toBe(aerobicBase);
  expect(report.aerobicBase).toBe(aerobicBase);
  expect(text).toContain("Aerobic Base Exposure");
  expect(text).toContain("Current week-to-date — partial period");
  expect(text).toContain("Documented aerobic-base proxy exposure: 73 min");
  expect(text).toContain("Cardio sessions missing usable zone evidence: 1");
  const section = text.split("Aerobic Base Exposure")[1]?.split("Programming Context")[0] ?? "";
  expect(section).not.toMatch(/below goal|needs more cardio|on track|insufficient fitness|remaining minutes|recommend/i);
});

test("Cardio Export renders the shared weekly context without goal or compliance language", () => {
  const events = [event({ sessionId: "known", startedAt: new Date(2026, 9, 20, 8).getTime(), provider: "mapmywalk", heartRateZones: zones(1620) })];
  const aerobicBase = buildAerobicBaseContext(events, { asOf: AS_OF });
  const emptyWindow = { count: 0, totalDurationSeconds: 0, totalDistanceMeters: 0 };
  const summary: CardioWalkSummary = {
    normalizedWalks: events, recentWalks: events, dailySummaries: [], last7d: emptyWindow, last28d: emptyWindow,
    dataQuality: { missingDistanceCount: 1, missingDurationCount: 1, suspiciousPaceCount: 0, suspiciousPaceSessionIds: [], notesFieldCoverage: { source: 0, route: 0, pace: 0, elevation: 0, avgHr: 0, maxHr: 0, notes: 0 }, unsupportedSignals: [] },
  };
  const text = buildCardioExportText(summary, { generatedAt: AS_OF, aerobicBaseContext: aerobicBase });
  expect(text).toContain("Current week-to-date — partial period");
  expect(text).toContain("Documented aerobic-base proxy exposure: 27 min");
  expect(text).toContain("Contributing sessions: 1");
  expect(text).toContain("MapMyWalk/MapMyFitness Zone 3 proxy");
  const section = text.split("Aerobic Base Exposure")[1]?.split("Data Quality")[0] ?? "";
  expect(section).not.toMatch(/goal|compliance|on track|below goal|remaining/i);
});
