import { expect, test } from "@playwright/test";
import { buildRecentSessionNoteEvidence } from "../src/domain/coaching/recentSessionNotes";
import { buildSessionCoachingSignals } from "../src/domain/coaching/sessionSnapshot";
import { extractHumanSetNoteText } from "../src/domain/sets/performedSetIntent";
import { buildNextWorkoutFocus } from "../src/lib/coachExport/buildNextWorkoutFocus";
import { buildPatternSummary } from "../src/lib/coachExport/buildPatternSummary";
import { buildCoachingMemory } from "../src/lib/coachExport/coachingMemory";
import { buildLeanPreservationComposite } from "../src/lib/coachExport/leanPreservationComposite";
import { buildCoachIntelligence } from "../src/lib/coachExport/coachIntelligence";
import { buildTrainingSignalsFromRecentSessions } from "../src/lib/coachExport/buildCoachExportMetrics";

function signals(sessionNotes: string, trackNames: string[], currentTrackName = trackNames[0] ?? "") {
  const summaries = trackNames.map((displayName) => ({
    displayName,
    trackType: "strength" as const,
    trackingMode: "weightedReps" as const,
    completedSets: ["1 completed set"],
  }));
  return buildSessionCoachingSignals({
    sessionNotes,
    totalExercises: summaries.length,
    completedExercises: summaries.length,
    currentTrack: summaries.find((item) => item.displayName === currentTrackName) ?? null,
    currentRecommendation: null,
    trackSummaries: summaries,
  });
}

function trainingBundle(notes: string) {
  const now = Date.UTC(2026, 10, 24, 12);
  return buildTrainingSignalsFromRecentSessions({
    asOf: now,
    sessions: [{ id: "s1", startedAt: now - 60_000, endedAt: now, notes } as any],
    tracks: [{
      id: "t1",
      exerciseId: "e1",
      displayName: "Barbell Bench Press",
      trackType: "strength",
      trackingMode: "weightedReps",
    } as any],
    sets: [{
      id: "set1",
      sessionId: "s1",
      trackId: "t1",
      setType: "working",
      completedAt: now - 30_000,
      createdAt: now - 30_000,
      reps: 8,
      weight: 135,
    } as any],
  });
}

function downstreamFromNotes(notes: string) {
  const bundle = trainingBundle(notes);
  const patternSummary = buildPatternSummary({
    sessions: bundle.completedSessions,
    trainingSignals: bundle.trainingSignals,
  });
  const coachingMemory = buildCoachingMemory({
    completedSessions: bundle.completedSessions,
    trainingSignals: bundle.trainingSignals,
    patternSummary,
  });
  const nextWorkoutFocus = buildNextWorkoutFocus({
    trainingSignals: bundle.trainingSignals,
    patternSummary,
    phaseQuality: null,
  });
  const leanPreservation = buildLeanPreservationComposite({
    leanMass: { latest: 145, baseline14d: 145, delta14d: 0 },
    weight: { latest: 180, baseline14d: 181, delta14d: -1 },
    waist: { latest: 36, baseline14d: 36.2, delta14d: -0.2 },
    bodyFatPct: { latest: 20, baseline14d: 20.2, delta14d: -0.2 },
    hydration: { confidenceLabel: "High Confidence", distortionLikely: false } as any,
    strengthSignal: { current: 1.2, delta14d: 0, vs90dBestPct: 0 } as any,
    fatigueSignals: bundle.trainingSignals.fatigueReadiness,
    recentPerformanceSignals: [
      ...bundle.trainingSignals.movementQuality,
      ...bundle.trainingSignals.stimulusCoverage,
      ...bundle.trainingSignals.fatigueReadiness,
      ...bundle.trainingSignals.nextWorkoutFocus,
    ],
  });
  const metrics = {
    bodyComp: {
      weight: { latest: 180, delta14d: -1 },
      waist: { latest: 36, delta14d: -0.2 },
      bodyFatPct: { latest: 20, delta14d: -0.2 },
      leanMass: { latest: 145, delta14d: 0 },
      visceralFat: null,
      waistToHeight: null,
    },
    strengthSignal: { current: 1.2, delta14d: 0 },
    phaseQuality: null,
    hydration: { confidenceLabel: "High Confidence", distortionLikely: false },
    bodyConfidence: { hydration: "high" },
    goalProgress: { status: "On Track" },
    leanPreservation,
    trainingSignals: bundle.trainingSignals,
    patternSummary,
    coachingMemory,
  } as any;
  return {
    bundle,
    patternSummary,
    coachingMemory,
    nextWorkoutFocus,
    leanPreservation,
    intelligence: buildCoachIntelligence(metrics),
  };
}

test("ambiguous and misattributed note examples produce no derived coaching signals", () => {
  const rightShoulder = signals(
    "Seated Single-Arm DB Overhead Press Left: Right shoulder began rotating forward on rep 12. Left arm completed 12 reps without issues.",
    ["Seated Single-Arm DB Overhead Press Left"]
  );
  const overheadPress = signals(
    "Standing Barbell Overhead Press: Shoulder pinching occurred when the bar traveled too far backward. GAZ FOLLOW-UP: Review standing barbell OHP bar path.",
    ["Barbell Bench Press", "Standing Barbell Overhead Press"],
    "Barbell Bench Press"
  );
  const fragments = [
    signals("Leg Press: Quad burn began around", ["Leg Press"]),
    signals("Step-Up Higher Platform - Right: First set RIR not recorded", ["Step-Up Higher Platform - Right"]),
    signals("Pull-Up: Two complete 1-2-3 ladders", ["Pull-Up"]),
  ];

  for (const result of [rightShoulder, overheadPress, ...fragments]) {
    expect(result.movementQualitySignals).toEqual([]);
    expect(result.fatigueReadiness).toEqual([]);
    expect(result.nextWorkoutFocus).toEqual([]);
    expect(result.discussWithCoach).toEqual([]);
  }
});

test("session-level observations never receive an inferred exercise association", () => {
  const result = signals(
    "Shoulder pinching occurred during overhead work. Bench Press was pain-free.",
    ["Barbell Bench Press", "Standing Barbell Overhead Press"]
  );

  expect(result.movementQualitySignals).toEqual([]);
  expect(result.discussWithCoach).toEqual([]);
  expect(result.fatigueReadiness).toEqual([]);
});

test("free-text changes cannot alter Coach classifications through the removed heuristic path", () => {
  const first = downstreamFromNotes(
    "Standing Barbell Overhead Press: shoulder pinching; felt fatigued. Carry Forward:\n- Avoid heavy overhead work."
  );
  const second = downstreamFromNotes(
    "Barbell Bench Press: no pain. Strong session. Pull-Up: two ladders completed."
  );

  expect(first.bundle.trainingSignals).toEqual(second.bundle.trainingSignals);
  expect(first.bundle.completedSessions).toEqual(second.bundle.completedSessions);
  expect(first.patternSummary).toEqual(second.patternSummary);
  expect(first.coachingMemory).toEqual(second.coachingMemory);
  expect(first.nextWorkoutFocus).toEqual(second.nextWorkoutFocus);
  expect(first.leanPreservation).toEqual(second.leanPreservation);
  expect(first.intelligence).toEqual(second.intelligence);
  expect(first.bundle.trainingSignals).toMatchObject({
    movementQuality: [],
    stimulusCoverage: ["1/1 exercises produced completed work"],
    fatigueReadiness: [],
    nextWorkoutFocus: [],
    discussWithGaz: [],
  });
});

test("raw session observations remain verbatim with source provenance and machine-token hygiene", () => {
  const rawSessionNote = "Right shoulder began rotating forward on rep 12.\nLeft arm completed the set without issues.";
  const sessionId = "session-note-integrity";
  const trackId = "track-note-integrity";
  const rawSetNote = "set_type=technique | lost hamstring tension on final reps";
  const evidence = buildRecentSessionNoteEvidence({
    sessions: [{ id: sessionId, startedAt: 1, endedAt: 10, templateName: "Upper A", notes: rawSessionNote } as any],
    sets: [
      { id: "set-machine", sessionId, trackId, createdAt: 2, setType: "working", notes: "set_type=technique" } as any,
      { id: "set-human", sessionId, trackId, createdAt: 3, setType: "working", setNumber: 3, weight: 25, reps: 12, rir: 2, notes: rawSetNote } as any,
    ],
    tracks: [{ id: trackId, exerciseId: "exercise-note-integrity", displayName: "Press" } as any],
    exercises: [{ id: "exercise-note-integrity", name: "Press", normalizedName: "press", createdAt: 1 } as any],
  }, { now: 10 });

  expect(evidence).toHaveLength(2);
  expect(evidence.find((item) => item.sourceKind === "session_note")).toMatchObject({
    rawText: rawSessionNote,
    sessionName: "Upper A",
  });
  expect(evidence.find((item) => item.sourceKind === "set_note")).toMatchObject({
    rawText: "lost hamstring tension on final reps",
    exerciseName: "Press",
    setContext: { setType: "working", setNumber: 2, weight: 25, reps: 12, rir: 2 },
  });
  expect(extractHumanSetNoteText("set_type=technique")).toBeUndefined();
  expect(extractHumanSetNoteText("technique | lost hamstring tension on final reps")).toBe("lost hamstring tension on final reps");
  expect(rawSetNote).toBe("set_type=technique | lost hamstring tension on final reps");
});

test("explicit Carry Forward remains available and raw note evidence stays canonical", () => {
  const raw = "Carry Forward:\n- Keep the pain-free overhead range next session.";
  const result = signals(raw, ["Standing Barbell Overhead Press"]);
  expect(result.carryForward).toEqual(["Keep the pain-free overhead range next session."]);
  expect(result.movementQualitySignals).toEqual([]);

  const evidence = buildRecentSessionNoteEvidence({
    sessions: [{ id: "carry-session", endedAt: 10, notes: raw } as any],
    sets: [],
    tracks: [],
    exercises: [],
  }, { now: 10 });
  expect(evidence).toHaveLength(1);
  expect(evidence[0].rawText).toBe(raw);
});
