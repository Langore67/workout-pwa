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

test.describe("session snapshot export quality", () => {
  test("normal lifting day stays compact and avoids low-signal generic flags", async () => {
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
    expect(snapshot).toContain("Readiness: caution");
    expect(snapshot).toContain("Focus Flags");
    expect(flags.length).toBeGreaterThanOrEqual(2);
    expect(flags.length).toBeLessThanOrEqual(4);
    expect(flags).toEqual(
      expect.arrayContaining([
        "Low back limitation",
        "Fatigue / volume management",
        "Compensation / technique watch",
      ])
    );
    expect(snapshot).not.toContain("Glute emphasis");
    expect(snapshot).not.toContain("Lat emphasis");
    expect(snapshot).not.toContain("Triceps emphasis");
    expect(snapshot).not.toContain("Quality-first execution");
  });

  test("diagnostic or corrective day surfaces high-signal rehab framing", async () => {
    const snapshot = buildSessionSnapshotText({
      sessionLabel: "Recovery / Check-In",
      startedAt: new Date("2026-04-10T09:00:00-04:00").getTime(),
      sessionNotes:
        "Diagnostic check-in today.\nRight knee unstable on split squat pattern.\nRehab focus with exercise swap instead of loaded work.",
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
    expect(snapshot).toContain("Readiness: caution");
    expect(flags).toEqual(
      expect.arrayContaining([
        "Knee stability / tolerance",
        "Exercise substitution",
        "Diagnostic check",
        "Corrective / rehab focus",
      ])
    );
    expect(flags.length).toBeLessThanOrEqual(4);
    expect(snapshot).not.toContain("Steady session context");
  });

  test("sparse-note day stays quiet and does not over-infer flags", async () => {
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
    expect(snapshot).toContain("Readiness: steady");
    expect(flags).toEqual(["Push Bench Press"]);
    expect(flags.length).toBeLessThanOrEqual(4);
    expect(snapshot).not.toContain("Quality-first execution");
    expect(snapshot).not.toContain("Fatigue / volume management");
    expect(snapshot).not.toContain("Corrective / rehab focus");
  });
});
