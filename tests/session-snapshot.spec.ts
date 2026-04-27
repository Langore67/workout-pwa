import { expect, test } from "@playwright/test";
import { buildSessionSnapshotText } from "../src/domain/coaching/sessionSnapshot";

function extractFocusFlags(snapshot: string): string[] {
  const lines = snapshot.split("\n");
  const start = lines.findIndex((line) => line.trim() === "Focus Flags");
  if (start < 0) return [];

  const flags: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim()) break;
    if (!line.startsWith("- ")) break;
    flags.push(line.slice(2).trim());
  }
  return flags;
}

function extractBlock(snapshot: string, heading: string): string[] {
  const lines = snapshot.split("\n");
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start < 0) return [];

  const items: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim()) break;
    if (!line.startsWith("- ")) break;
    items.push(line.slice(2).trim());
  }
  return items;
}

function expectSection(snapshot: string, heading: string) {
  expect(snapshot).toContain(heading);
  return extractBlock(snapshot, heading);
}

test.describe("session snapshot export quality", () => {
  test("explicit carry-forward lines are preferred over fallback heuristics", async () => {
    const snapshot = buildSessionSnapshotText({
      sessionLabel: "Recovery / Check-In",
      startedAt: new Date("2026-04-10T09:00:00-04:00").getTime(),
      sessionNotes:
        "Diagnostic check-in today.\nRight knee unstable on split squat pattern.\nRehab focus with exercise swap instead of loaded work.\nCarry Forward:\nKeep the split squat swap if the knee still feels unstable.\nMonitor knee tracking before adding load.",
      totalExercises: 3,
      completedExercises: 3,
      currentTrack: {
        displayName: "Hip Shift Check",
        trackType: "corrective",
        trackingMode: "repsOnly",
      },
      currentRecentBest: null,
      currentRecommendation: {
        action: "hold",
        targetWeight: null,
        targetReps: null,
        confidence: "low",
        rationale: "Non-strength track — no progression applied",
      },
      trackSummaries: [
        {
          displayName: "Hip Shift Check",
          trackType: "corrective",
          trackingMode: "repsOnly",
          completedSets: ["8 reps"],
        },
      ],
    });

    const carryForward = extractBlock(snapshot, "Carry Forward");
    expect(snapshot).toContain("Carry Forward");
    expect(carryForward).toEqual([
      "Keep the split squat swap if the knee still feels unstable.",
      "Monitor knee tracking before adding load.",
    ]);
    expect(carryForward.length).toBeLessThanOrEqual(3);
    expect(snapshot).not.toContain("Repeat the exercise substitution if the same issue shows up");
    expect(snapshot).not.toContain("Monitor knee stability next session");
  });

  test("fallback carry-forward heuristics stay grounded and compact when explicit lines are absent", async () => {
    const snapshot = buildSessionSnapshotText({
      sessionLabel: "Lower B",
      startedAt: new Date("2026-04-10T08:00:00-04:00").getTime(),
      sessionNotes:
        "Quality-first session. Low back fatigue early.\nCut volume short intentionally.\nStance change helped RDL feel better.",
      totalExercises: 4,
      completedExercises: 4,
      currentTrack: {
        displayName: "Barbell RDL",
        trackType: "strength",
        trackingMode: "weightedReps",
      },
      currentRecentBest: { bestWeight: 155, bestReps: 6 },
      currentRecommendation: {
        action: "hold",
        targetWeight: 155,
        targetReps: 6,
        confidence: "medium",
        rationale: "Holding load after recent top set",
      },
      trackSummaries: [
        {
          displayName: "Barbell RDL",
          trackType: "strength",
          trackingMode: "weightedReps",
          completedSets: ["135 x 8 @2", "155 x 6 @2"],
        },
      ],
    });

    const flags = extractFocusFlags(snapshot);
    const movementQuality = extractBlock(snapshot, "Movement Quality Signals");
    const stimulusCoverage = expectSection(snapshot, "Stimulus / Coverage");
    const fatigueReadiness = expectSection(snapshot, "Fatigue / Readiness");
    const carryForward = extractBlock(snapshot, "Carry Forward");
    const discussWithGaz = expectSection(snapshot, "Discuss with Gaz");
    expect(snapshot).toContain("Readiness: caution");
    expect(snapshot).toContain("Focus Flags");
    expect(snapshot).toContain("Carry Forward");
    expect(flags.length).toBeGreaterThanOrEqual(2);
    expect(flags.length).toBeLessThanOrEqual(4);
    expect(carryForward.length).toBeGreaterThanOrEqual(1);
    expect(carryForward.length).toBeLessThanOrEqual(3);
    expect(flags).toEqual(
      expect.arrayContaining([
        "Low back tolerance",
        "Fatigue or cut-volume constraint",
        "Technique compensation noted",
      ])
    );
    expect(snapshot).not.toContain("Glute emphasis");
    expect(snapshot).not.toContain("Lat emphasis");
    expect(snapshot).not.toContain("Triceps emphasis");
    expect(snapshot).not.toContain("Quality-first execution");
    expect(snapshot).not.toContain("Steady session context");
    expect(movementQuality).toEqual(
      expect.arrayContaining([
        "Movement quality looked solid",
      ])
    );
    expect(stimulusCoverage).toEqual(
      expect.arrayContaining([
        "4/4 exercises produced completed work",
      ])
    );
    expect(fatigueReadiness).toEqual(
      expect.arrayContaining([
        "Fatigue showed up",
      ])
    );
    expect(carryForward).toEqual(
      expect.arrayContaining([
        "Keep the stance adjustment that improved movement quality",
        "Adjust volume early if the same fatigue pattern returns",
      ])
    );
    expect(discussWithGaz).toEqual(
      expect.arrayContaining([
        "Review joint feedback around Barbell RDL",
      ])
    );
    expect(carryForward).not.toEqual(
      expect.arrayContaining([
        "Repeat the exercise substitution if the same issue shows up",
        "Keep the corrective / rehab work in the plan",
      ])
    );
  });

  test("diagnostic or corrective day surfaces high-signal rehab framing", async () => {
    const snapshot = buildSessionSnapshotText({
      sessionLabel: "Recovery / Check-In",
      startedAt: new Date("2026-04-10T09:00:00-04:00").getTime(),
      sessionNotes:
        "Diagnostic check-in today.\nRight knee unstable on split squat pattern.\nRehab focus with exercise swap instead of loaded work.\nCarry Forward:\nKeep the split squat swap if the knee still feels unstable.",
      totalExercises: 3,
      completedExercises: 3,
      currentTrack: {
        displayName: "Hip Shift Check",
        trackType: "corrective",
        trackingMode: "repsOnly",
      },
      currentRecentBest: null,
      currentRecommendation: {
        action: "hold",
        targetWeight: null,
        targetReps: null,
        confidence: "low",
        rationale: "Non-strength track — no progression applied",
      },
      trackSummaries: [
        {
          displayName: "Hip Shift Check",
          trackType: "corrective",
          trackingMode: "repsOnly",
          completedSets: ["8 reps"],
        },
      ],
    });

    const flags = extractFocusFlags(snapshot);
    const movementQuality = extractBlock(snapshot, "Movement Quality Signals");
    const stimulusCoverage = expectSection(snapshot, "Stimulus / Coverage");
    const fatigueReadiness = expectSection(snapshot, "Fatigue / Readiness");
    const carryForward = extractBlock(snapshot, "Carry Forward");
    const discussWithGaz = expectSection(snapshot, "Discuss with Gaz");
    expect(snapshot).toContain("Readiness: caution");
    expect(flags).toEqual(
      expect.arrayContaining([
        "Knee stability/tolerance",
        "Exercise substitution used",
        "Diagnostic check-in",
        "Corrective/rehab work",
      ])
    );
    expect(flags.length).toBeLessThanOrEqual(4);
    expect(movementQuality).toEqual([]);
    expect(stimulusCoverage).toEqual(
      expect.arrayContaining([
        "3/3 exercises produced completed work",
      ])
    );
    expect(fatigueReadiness).toEqual(
      expect.arrayContaining([
        "Knee unstable",
      ])
    );
    expect(snapshot).not.toContain("Steady session context");
    expect(carryForward).toEqual(["Keep the split squat swap if the knee still feels unstable."]);
    expect(discussWithGaz).toEqual(
      expect.arrayContaining([
        "Review joint feedback around Hip Shift Check",
        "Confirm whether the substitution stays in next session",
      ])
    );
  });

  test("note extraction surfaces engagement, load, and form signals for coaching discussion", async () => {
    const snapshot = buildSessionSnapshotText({
      sessionLabel: "Upper A",
      startedAt: new Date("2026-04-12T07:00:00-04:00").getTime(),
      sessionNotes:
        "Lat Pulldown: improved stretch and contraction; arms only at terminal reps.\n3-Point DB Row: breakthrough; lat dominance with no biceps/trap takeover.\nBradford Press: stopped due to shoulder twinge.\nFarmer's Carry: slight trap involvement noted but controlled.\nLateral Raise: medial delt isolation still not clean.",
      totalExercises: 5,
      completedExercises: 5,
      currentTrack: {
        displayName: "Lateral Raise",
        trackType: "strength",
        trackingMode: "repsOnly",
      },
      currentRecentBest: null,
      currentRecommendation: {
        action: "hold",
        targetWeight: null,
        targetReps: null,
        confidence: "medium",
        rationale: "Keep setup stable while isolating the target tissue",
      },
      trackSummaries: [
        {
          displayName: "Lat Pulldown",
          trackType: "strength",
          trackingMode: "weightedReps",
          completedSets: ["120 x 10 @2", "130 x 8 @1"],
        },
        {
          displayName: "3-Point DB Row",
          trackType: "strength",
          trackingMode: "weightedReps",
          completedSets: ["70 x 10 @2", "80 x 8 @1"],
        },
        {
          displayName: "Bradford Press",
          trackType: "strength",
          trackingMode: "weightedReps",
          completedSets: ["65 x 8 @2"],
        },
        {
          displayName: "Farmer's Carry",
          trackType: "conditioning",
          trackingMode: "distanceAndLoad",
          completedSets: ["80 lbs • 40 yd"],
        },
        {
          displayName: "Lateral Raise",
          trackType: "hypertrophy",
          trackingMode: "repsOnly",
          completedSets: ["15 reps", "12 reps"],
        },
      ],
    });

    expect(extractBlock(snapshot, "Movement Quality Signals")).toEqual(
      expect.arrayContaining([
        "Lat Pulldown: improved stretch and contraction",
        "3-Point DB Row: breakthrough pattern found",
        "Bradford Press: stopped due to shoulder twinge",
        "Farmer's Carry: slight trap involvement noted but controlled",
      ])
    );
    expect(extractBlock(snapshot, "Stimulus / Coverage")).toEqual(
      expect.arrayContaining([
        "5/5 exercises produced completed work",
        "Pull: strong lat stimulus",
        "Shoulders: lateral delt isolation needs refinement",
      ])
    );
    expect(extractBlock(snapshot, "Fatigue / Readiness")).toEqual(
      expect.arrayContaining([
        "Lat Pulldown: terminal-rep quality dropped",
        "Bradford Press: stopped due to shoulder twinge",
      ])
    );
    expect(extractBlock(snapshot, "Next Workout Focus")).toEqual(
      expect.arrayContaining([
        "Maintain lat-driven pulling before increasing load",
        "Improve medial delt isolation",
        "Avoid behind-the-neck pressing positions",
      ])
    );
    expect(extractBlock(snapshot, "Discuss with Gaz")).toEqual(
      expect.arrayContaining([
        "Review medial delt isolation setup",
        "Review safe overhead pressing range",
        "Discuss reducing trap compensation during carries",
      ])
    );
  });

  test("thin ordinary notes stay quiet and do not invent carry-forward bullets", async () => {
    const snapshot = buildSessionSnapshotText({
      sessionLabel: "Upper A",
      startedAt: new Date("2026-04-10T07:00:00-04:00").getTime(),
      sessionNotes: "Normal day.",
      totalExercises: 5,
      completedExercises: 5,
      currentTrack: {
        displayName: "Bench Press",
        trackType: "strength",
        trackingMode: "weightedReps",
      },
      currentRecentBest: { bestWeight: 185, bestReps: 5 },
      currentRecommendation: {
        action: "increase",
        targetWeight: 190,
        targetReps: 5,
        confidence: "medium",
        rationale: "Progressing from last best set 185x5",
      },
      trackSummaries: [
        {
          displayName: "Bench Press",
          trackType: "strength",
          trackingMode: "weightedReps",
          completedSets: ["165 x 8 @2", "185 x 5 @1"],
        },
      ],
    });

    const flags = extractFocusFlags(snapshot);
    const movementQuality = extractBlock(snapshot, "Movement Quality Signals");
    const stimulusCoverage = expectSection(snapshot, "Stimulus / Coverage");
    const fatigueReadiness = expectSection(snapshot, "Fatigue / Readiness");
    const carryForward = extractBlock(snapshot, "Carry Forward");
    const discussWithGaz = extractBlock(snapshot, "Discuss with Gaz");
    expect(snapshot).toContain("Readiness: steady");
    expect(flags).toEqual(["Progression opportunity: Bench Press"]);
    expect(movementQuality).toEqual([]);
    expect(stimulusCoverage).toEqual(["5/5 exercises produced completed work"]);
    expect(fatigueReadiness).toEqual(["Readiness looked steady"]);
    expect(discussWithGaz).toEqual([]);
    expect(carryForward).toEqual([]);
    expect(snapshot).not.toContain("Carry Forward\n-");
    expect(flags.length).toBeLessThanOrEqual(4);
    expect(snapshot).not.toContain("Quality-first execution");
    expect(snapshot).not.toContain("Fatigue or cut-volume constraint");
    expect(snapshot).not.toContain("Corrective/rehab work");
    expect(snapshot).not.toContain("Monitor low back tolerance next session");
    expect(snapshot).not.toContain("Adjust volume early if the same fatigue pattern returns");
  });
});
