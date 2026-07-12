import { expect, test } from "@playwright/test";
import { buildCoachReport } from "../src/lib/coachReport/buildCoachReport";
import { formatCoachReportText } from "../src/lib/coachReport/formatCoachReportText";
import { buildCoachStateFromExportMetrics } from "../src/lib/coachState/buildCoachState";
import type { Exercise, Session, SetEntry, Track } from "../src/db";
import { buildWeeklyVolume } from "../src/lib/coachExport/weeklyVolume";

function ms(year: number, month: number, day: number, hour = 9, minute = 0) {
  return new Date(year, month - 1, day, hour, minute, 0, 0).getTime();
}

const AS_OF = ms(2026, 4, 27, 9, 0);

function makeSession(id: string, dayOffset: number): Session {
  const startedAt = AS_OF - dayOffset * 24 * 60 * 60 * 1000;
  return {
    id,
    templateName: "Test",
    startedAt,
    endedAt: startedAt + 45 * 60 * 1000,
  } as Session;
}

function makeExercise(id: string, name: string, bodyPart?: Exercise["bodyPart"]): Exercise {
  return {
    id,
    name,
    normalizedName: name.toLowerCase(),
    bodyPart,
    equipmentTags: [],
    createdAt: AS_OF,
  } as Exercise;
}

function makeTrack(id: string, exerciseId: string, displayName: string, trackType: Track["trackType"] = "strength"): Track {
  return {
    id,
    exerciseId,
    displayName,
    trackType,
    trackingMode: "weightedReps",
    warmupSetsDefault: 0,
    workingSetsDefault: 1,
    repMin: 1,
    repMax: 12,
    restSecondsDefault: 60,
    weightJumpDefault: 5,
    createdAt: AS_OF,
  } as Track;
}

function makeSet(
  id: string,
  sessionId: string,
  trackId: string,
  setType: SetEntry["setType"] = "working",
  payload: Partial<SetEntry> = {}
): SetEntry {
  return {
    id,
    sessionId,
    trackId,
    createdAt: AS_OF,
    setType,
    completedAt: AS_OF,
    ...payload,
  } as SetEntry;
}

function bucket(volume: NonNullable<ReturnType<typeof buildWeeklyVolume>>, bucketName: string) {
  const group = volume.groups.find((item) => item.bucket === bucketName);
  if (!group) throw new Error(`Missing bucket ${bucketName}`);
  return group;
}

function buildVolume(args: {
  sessions: Session[];
  sets: SetEntry[];
  tracks: Track[];
  exercises: Exercise[];
}) {
  const volume = buildWeeklyVolume({
    ...args,
    asOf: AS_OF,
    windowDays: 7,
  });
  if (!volume) throw new Error("Expected weekly volume");
  return volume;
}

test("prime mover and supporting mover credit is split correctly", async () => {
  const exercise = makeExercise("bench", "Bench Press", "Chest");
  const track = makeTrack("bench-track", exercise.id, "Bench Press", "strength");
  const session = makeSession("s1", 1);
  const volume = buildVolume({
    sessions: [session],
    tracks: [track],
    exercises: [exercise],
    sets: [
      makeSet("set1", session.id, track.id),
      makeSet("set2", session.id, track.id),
      makeSet("set3", session.id, track.id),
    ],
  });

  expect(bucket(volume, "chest_pressing").primeCredit).toBe(3);
  expect(bucket(volume, "triceps_press_support").supportCredit).toBe(1.5);
  expect(bucket(volume, "anterior_delts").supportCredit).toBe(1.5);
});

test("back work preserves lat and mid-back granularity", async () => {
  const pulldown = makeExercise("pulldown", "Lat Pulldown", "Back");
  const row = makeExercise("row", "MTS Row", "Back");
  const pulldownTrack = makeTrack("pulldown-track", pulldown.id, "Lat Pulldown", "strength");
  const rowTrack = makeTrack("row-track", row.id, "MTS Row", "strength");
  const session1 = makeSession("s1", 1);
  const session2 = makeSession("s2", 2);
  const volume = buildVolume({
    sessions: [session1, session2],
    tracks: [pulldownTrack, rowTrack],
    exercises: [pulldown, row],
    sets: [
      makeSet("set1", session1.id, pulldownTrack.id),
      makeSet("set2", session1.id, pulldownTrack.id),
      makeSet("set3", session1.id, pulldownTrack.id),
      makeSet("set4", session1.id, pulldownTrack.id),
      makeSet("set5", session2.id, rowTrack.id),
      makeSet("set6", session2.id, rowTrack.id),
      makeSet("set7", session2.id, rowTrack.id),
    ],
  });

  expect(bucket(volume, "lats").primeCredit).toBe(4);
  expect(bucket(volume, "biceps_pull_support").supportCredit).toBe(3.5);
  expect(bucket(volume, "mid_back_rows").primeCredit).toBe(3);
  expect(bucket(volume, "rear_delts").supportCredit).toBe(1.5);
});

test("scapular control and exposure work stays separate from hypertrophy volume", async () => {
  const rearDeltFly = makeExercise("rear", "Reverse Pec Deck", "Shoulders");
  const wallSlide = makeExercise("wall", "Y-Wall Slide", "Shoulders");
  const rearTrack = makeTrack("rear-track", rearDeltFly.id, "Reverse Pec Deck", "strength");
  const wallTrack = makeTrack("wall-track", wallSlide.id, "Y-Wall Slide", "corrective");
  const session1 = makeSession("s1", 1);
  const session2 = makeSession("s2", 2);
  const volume = buildVolume({
    sessions: [session1, session2],
    tracks: [rearTrack, wallTrack],
    exercises: [rearDeltFly, wallSlide],
    sets: [
      makeSet("set1", session1.id, rearTrack.id),
      makeSet("set2", session1.id, rearTrack.id),
      makeSet("set3", session2.id, wallTrack.id, "working", { reps: 12 }),
      makeSet("set4", session2.id, wallTrack.id, "working", { reps: 12 }),
    ],
  });

  expect(bucket(volume, "rear_delts").primeCredit).toBe(2);
  expect(bucket(volume, "lower_traps_scapular_control").supportCredit).toBe(1);
  expect(bucket(volume, "serratus_scapular_control").exposureCount).toBeGreaterThan(0);
});

test("glute and hip buckets split prime work from corrective exposure", async () => {
  const bridge = makeExercise("bridge", "Glute Bridge", "Legs");
  const singleLegRdl = makeExercise("slrdl", "Single-Leg RDL", "Legs");
  const clams = makeExercise("clams", "Locked Clams", "Legs");
  const hipFlexor = makeExercise("hip", "Hip Flexor Stretch", "Other");
  const adductor = makeExercise("adductor", "Adductor Machine", "Legs");
  const bridgeTrack = makeTrack("bridge-track", bridge.id, "Glute Bridge", "strength");
  const singleLegTrack = makeTrack("slrdl-track", singleLegRdl.id, "Single-Leg RDL", "strength");
  const clamsTrack = makeTrack("clams-track", clams.id, "Locked Clams", "corrective");
  const hipTrack = makeTrack("hip-track", hipFlexor.id, "Hip Flexor Stretch", "mobility");
  const adductorTrack = makeTrack("adductor-track", adductor.id, "Adductor Machine", "corrective");
  const session = makeSession("s1", 1);
  const volume = buildVolume({
    sessions: [session],
    tracks: [bridgeTrack, singleLegTrack, clamsTrack, hipTrack, adductorTrack],
    exercises: [bridge, singleLegRdl, clams, hipFlexor, adductor],
    sets: [
      makeSet("set1", session.id, bridgeTrack.id),
      makeSet("set2", session.id, bridgeTrack.id),
      makeSet("set3", session.id, singleLegTrack.id),
      makeSet("set4", session.id, singleLegTrack.id),
      makeSet("set5", session.id, clamsTrack.id, "working", { reps: 15 }),
      makeSet("set6", session.id, clamsTrack.id, "working", { reps: 15 }),
      makeSet("set7", session.id, hipTrack.id, "working", { reps: 30 }),
      makeSet("set8", session.id, adductorTrack.id, "working", { reps: 12 }),
    ],
  });

  expect(bucket(volume, "glute_max").primeCredit).toBe(4);
  expect(bucket(volume, "hamstrings").primeCredit).toBe(2);
  expect(bucket(volume, "glute_med_min").exposureCount).toBe(2);
  expect(bucket(volume, "hip_flexors").exposureCount).toBe(1);
  expect(bucket(volume, "adductors").exposureCount).toBe(1);
});

test("balance checks flag push-pull and glute imbalance", async () => {
  const bench = makeExercise("bench", "Bench Press", "Chest");
  const bridge = makeExercise("bridge", "Glute Bridge", "Legs");
  const benchTrack = makeTrack("bench-track", bench.id, "Bench Press", "strength");
  const bridgeTrack = makeTrack("bridge-track", bridge.id, "Glute Bridge", "strength");
  const session = makeSession("s1", 1);
  const volume = buildVolume({
    sessions: [session],
    tracks: [benchTrack, bridgeTrack],
    exercises: [bench, bridge],
    sets: [
      makeSet("set1", session.id, benchTrack.id),
      makeSet("set2", session.id, benchTrack.id),
      makeSet("set3", session.id, benchTrack.id),
      makeSet("set4", session.id, benchTrack.id),
      makeSet("set5", session.id, benchTrack.id),
      makeSet("set6", session.id, bridgeTrack.id),
    ],
  });

  expect(volume.balances.find((balance) => balance.id === "push_pull")?.status).toBe("intervene");
  expect(volume.balances.find((balance) => balance.id === "glute_max_med_min")?.status).toBe("watch");
});

test("unknown exercises do not crash and remain unclassified", async () => {
  const mystery = makeExercise("mystery", "Mystery Machine", "Other");
  const mysteryTrack = makeTrack("mystery-track", mystery.id, "Mystery Machine", "strength");
  const session = makeSession("s1", 1);
  const volume = buildVolume({
    sessions: [session],
    tracks: [mysteryTrack],
    exercises: [mystery],
    sets: [makeSet("set1", session.id, mysteryTrack.id)],
  });

  expect(volume.unclassified?.[0].exerciseName).toBe("mystery machine");
});

test("weekly volume maps through coach state and renders into the coach report", async () => {
  const bench = makeExercise("bench", "Bench Press", "Chest");
  const pulldown = makeExercise("pulldown", "Lat Pulldown", "Back");
  const benchTrack = makeTrack("bench-track", bench.id, "Bench Press", "strength");
  const pulldownTrack = makeTrack("pulldown-track", pulldown.id, "Lat Pulldown", "strength");
  const session = makeSession("s1", 1);
  const volume = buildVolume({
    sessions: [session],
    tracks: [benchTrack, pulldownTrack],
    exercises: [bench, pulldown],
    sets: [
      makeSet("set1", session.id, benchTrack.id),
      makeSet("set2", session.id, pulldownTrack.id),
    ],
  });

  const coachState = buildCoachStateFromExportMetrics({
    generatedAt: AS_OF,
    currentPhase: "cut",
    bodyComp: {} as any,
    hydration: { latestWaterPct: null, confidenceLabel: "Low", confidenceScore: 40, note: "Insufficient Data" },
    cardioSummary: undefined as any,
    bodyConfidence: undefined as any,
    strengthSignal: { current: null, delta14d: null, vs90dBestPct: null, currentBodyweight: null, bodyweightDaysUsed: null },
    phaseQuality: null,
    anchorLifts: [],
    currentMovementFocus: [],
    exerciseVocabulary: [],
    trainingSignals: { movementQuality: [], stimulusCoverage: [], fatigueReadiness: [], nextWorkoutFocus: [], discussWithGaz: [] },
    coachingMemory: { validatedLearnings: [], activeWatchItems: [], resolvedItems: [], sourceWindow: { sessionCount: 1 } } as any,
    patternSummary: { movementQuality: [], stimulus: [], fatigue: [], constraints: [], progression: [] },
    nextWorkoutFocus: { progressionGuardrails: [], executionPriorities: [], adjustmentTriggers: [] },
    weeklyVolume: volume,
    exportConfidence: { score: 80, label: "Strong", components: { waistReadiness: 80, weightDataReady: 80, strengthDataReady: 80, coherenceScore: 80 } },
    readinessNotes: [],
    dataNotes: [],
    goalProgress: null,
  } as any);

  expect(coachState.trainingVolume?.status).toBe("intervene");
  const report = {
    generatedAt: new Date(AS_OF).toLocaleString(),
    snapshot: {
      status: "Watch",
      confidence: "Moderate",
      why: "Weekly volume is mixed.",
      today: "Keep progression balanced.",
    },
    weeklyVolume: {
      title: "Weekly Volume",
      status: "Watch",
      note: volume.summary,
      rows: [
        { label: "Chest / Push", value: "Watch — 4.5 credit", text: "- Chest / Push: Watch — 4.5 credit" },
        { label: "Back / Pull", value: "Solid — 6.0 credit", text: "- Back / Pull: Solid — 6.0 credit" },
      ],
      balanceRows: [
        {
          id: "push_pull",
          label: "Push / Pull",
          leftLabel: "Push",
          rightLabel: "Pull",
          leftValue: 4.5,
          rightValue: 6,
          ratio: 0.75,
          status: "solid",
          statusLabel: "Pull Behind",
          direction: "right_ahead",
          summary: "Pull volume is ahead of push volume.",
          currentText: "Push: 4.5 effective sets | Pull: 6 effective sets",
          explanation: "Pull volume is about 0.8x higher than push volume over the recent 7-day window.",
          action: "Add 3-5 pushing sets over the next 7 days, or hold pull volume steady.",
          ratioText: "Internal ratio: 0.75",
          isContextuallyAcceptable: false,
          note: "Pull volume is ahead of push volume.",
        },
      ],
      detailRows: [{ label: "Chest Pressing", value: "Watch | 3.0 prime | 1.5 support | 0 exposures | 4.5 total", text: "- Chest Pressing: Watch | 3.0 prime | 1.5 support | 0 exposures | 4.5 total" }],
      unclassified: ["Mystery Row: 1 set"],
    },
  } as any;

  const text = formatCoachReportText(report);
  expect(text).toContain("Weekly Volume");
  expect(text).toContain("Rollups");
  expect(text).toContain("Antagonistic Balance");
  expect(text).toContain("Current:");
  expect(text).toContain("What it means:");
  expect(text).toContain("What to change:");
  expect(text).toContain("prime");
  expect(text).toContain("support");
});

test("weekly volume report uses effective volume and coach-language balance labels", async () => {
  const bench = makeExercise("bench", "Bench Press", "Chest");
  const pulldown = makeExercise("pulldown", "Lat Pulldown", "Back");
  const hammer = makeExercise("hammer", "Hammer Curl", "Arms");
  const wallSlide = makeExercise("wall", "Wall Slide With Lift", "Shoulders");
  const benchTrack = makeTrack("bench-track", bench.id, "Bench Press", "strength");
  const pulldownTrack = makeTrack("pulldown-track", pulldown.id, "Lat Pulldown", "strength");
  const hammerTrack = makeTrack("hammer-track", hammer.id, "Hammer Curl", "strength");
  const wallTrack = makeTrack("wall-track", wallSlide.id, "Wall Slide With Lift", "corrective");
  const session = makeSession("s1", 1);
  const volume = buildVolume({
    sessions: [session],
    tracks: [benchTrack, pulldownTrack, hammerTrack, wallTrack],
    exercises: [bench, pulldown, hammer, wallSlide],
    sets: [
      makeSet("set1", session.id, benchTrack.id),
      makeSet("set2", session.id, pulldownTrack.id),
      makeSet("set3", session.id, hammerTrack.id),
      makeSet("set4", session.id, wallTrack.id, "working", { reps: 12 }),
    ],
  });

  const metrics = {
    generatedAt: AS_OF,
    currentPhase: "cut",
    bodyComp: {} as any,
    hydration: { latestWaterPct: null, confidenceLabel: "Low", confidenceScore: 40, note: "Insufficient Data" },
    cardioSummary: undefined as any,
    bodyConfidence: undefined as any,
    coachIntelligence: {
      overallStatus: "Watch",
      confidence: "Moderate",
      summary: "Weekly volume is mixed.",
      biggestWin: "Pulling volume is ahead of pressing volume.",
      biggestRisk: "Hip stability work could improve.",
      fatLossStatus: "Watch",
      musclePreservationStatus: "Watch",
      performanceTrendStatus: "Watch",
      movementQualityStatus: "Watch",
      recommendations: ["Keep progression balanced."],
      narrative: [
        "Fat Loss: Evidence is incomplete.",
        "Muscle Preservation: Evidence is incomplete.",
        "Performance Trend: Evidence is incomplete.",
        "Movement Quality: Evidence is incomplete.",
      ],
      watchItems: [],
    } as any,
    goalProgress: null,
    leanPreservation: null,
    strengthSignal: { current: null, delta14d: null, vs90dBestPct: null, currentBodyweight: null, bodyweightDaysUsed: null },
    phaseQuality: null,
    anchorLifts: [],
    currentMovementFocus: [],
    exerciseVocabulary: [],
    trainingSignals: { movementQuality: [], stimulusCoverage: [], fatigueReadiness: [], nextWorkoutFocus: [], discussWithGaz: [] },
    coachingMemory: { validatedLearnings: [], activeWatchItems: [], resolvedItems: [], sourceWindow: { sessionCount: 1 } } as any,
    patternSummary: { movementQuality: [], stimulus: [], fatigue: [], constraints: [], progression: [] },
    nextWorkoutFocus: { progressionGuardrails: [], executionPriorities: [], adjustmentTriggers: [] },
    weeklyVolume: volume,
    exportConfidence: { score: 80, label: "Strong", components: { waistReadiness: 80, weightDataReady: 80, strengthDataReady: 80, coherenceScore: 80 } },
    readinessNotes: [],
    dataNotes: [],
  } as any;

  const coachState = buildCoachStateFromExportMetrics(metrics);
  const report = buildCoachReport({ coachState, metrics });

  expect(report.weeklyVolume?.rows.find((row) => row.label === "Chest / Push")?.value).toContain("effective set");
  expect(report.weeklyVolume?.rows.find((row) => row.label === "Chest / Push")?.value).toContain("effective set");
  expect(report.weeklyVolume?.rows.find((row) => row.label === "Back / Pull")?.value).toContain("effective set");
  expect(report.weeklyVolume?.rows.find((row) => row.label === "Arms")?.value).toContain("direct");
  expect(report.weeklyVolume?.rows.find((row) => row.label === "Arms")?.value).toContain("indirect support");
  expect(report.weeklyVolume?.rows.find((row) => row.label === "Shoulders / Scapula")?.value).toContain("control exposure");
  expect(report.weeklyVolume?.balanceRows.find((row) => row.label === "Push / Pull")?.statusLabel).toBe("Pull Behind");
  expect(report.weeklyVolume?.balanceRows.find((row) => row.label === "Push / Pull")?.currentText).toContain("Push:");
  expect(report.weeklyVolume?.balanceRows.find((row) => row.label === "Push / Pull")?.currentText).toContain("Pull:");
  expect(report.weeklyVolume?.balanceRows.find((row) => row.label === "Push / Pull")?.explanation).toContain("recent 7-day window");
  expect(report.weeklyVolume?.balanceRows.find((row) => row.label === "Push / Pull")?.action).toContain("pushing sets");

  const text = formatCoachReportText(report);
  expect(text).toContain("effective set");
  expect(text).toContain("Prime");
  expect(text).toContain("Support");
  expect(text).toContain("Effective");
  expect(text).toContain("Exposure");
  expect(text).toContain("Antagonistic Balance");
  expect(text).toContain("Current:");
  expect(text).toContain("What it means:");
  expect(text).toContain("What to change:");
});

test("mobility and exposure-style movements stay out of unclassified volume", async () => {
  const wallSlide = makeExercise("wall", "Wall Slide With Lift", "Shoulders");
  const walk = makeExercise("walk", "Treadmill Walk", "Other");
  const wallTrack = makeTrack("wall-track", wallSlide.id, "Wall Slide With Lift", "corrective");
  const walkTrack = makeTrack("walk-track", walk.id, "Treadmill Walk", "mobility");
  const session = makeSession("s1", 1);
  const volume = buildVolume({
    sessions: [session],
    tracks: [wallTrack, walkTrack],
    exercises: [wallSlide, walk],
    sets: [
      makeSet("set1", session.id, wallTrack.id, "working", { reps: 12 }),
      makeSet("set2", session.id, walkTrack.id, "working", { reps: 30 }),
    ],
  });

  expect(volume.unclassified ?? []).toHaveLength(0);
  expect(volume.groups.find((group) => group.bucket === "serratus_scapular_control")?.exposureCount).toBeGreaterThan(0);
  expect(volume.groups.find((group) => group.bucket === "hip_flexors")?.exposureCount).toBeGreaterThan(0);
});
