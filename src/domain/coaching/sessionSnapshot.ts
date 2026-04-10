import type { SetEntry, Track, TrackType, TrackingMode } from "../../db";
import type { WorkingRecommendation } from "./nextWorkingRecommendation";

export type SnapshotMetricMode = "reps" | "distance" | "time";

export type SessionSnapshotTrackSummary = {
  displayName: string;
  trackType: TrackType;
  trackingMode: TrackingMode;
  completedSets: string[];
};

function buildSessionReadinessLine(params: {
  sessionNotes?: string;
  totalExercises: number;
  completedExercises: number;
}): string {
  const { sessionNotes, totalExercises, completedExercises } = params;
  const notes = String(sessionNotes ?? "").toLowerCase();

  const cautionTerms = [
    "fatigue",
    "tired",
    "low back",
    "pain",
    "unstable",
    "tight",
    "cut volume",
    "cut short",
    "rehab",
  ];
  const positiveTerms = [
    "strong",
    "smooth",
    "snappy",
    "good",
    "better",
    "ready",
  ];

  if (cautionTerms.some((term) => notes.includes(term))) {
    return "Readiness: caution — session notes mention fatigue, pain, or reduced capacity";
  }

  if (positiveTerms.some((term) => notes.includes(term))) {
    return "Readiness: good — session notes indicate solid movement quality or output";
  }

  if (totalExercises > 0 && completedExercises === 0) {
    return "Readiness: unknown — no completed work logged yet";
  }

  if (totalExercises > 0 && completedExercises < totalExercises) {
    return "Readiness: mixed — session is in progress or only partially completed";
  }

  return "Readiness: steady — no strong caution flags detected in current session context";
}

function buildSessionFocusFlags(params: {
  sessionNotes?: string;
  totalExercises: number;
  completedExercises: number;
  currentTrack: Pick<Track, "displayName" | "trackType" | "trackingMode"> | null;
  currentRecommendation: WorkingRecommendation | null;
}): string[] {
  const { sessionNotes, totalExercises, completedExercises, currentTrack, currentRecommendation } = params;
  const notes = String(sessionNotes ?? "").toLowerCase();
  const flags: string[] = [];

  if (notes.includes("low back")) flags.push("Low back management");
  if (notes.includes("knee")) flags.push("Knee tolerance");
  if (notes.includes("fatigue") || notes.includes("tired") || notes.includes("cut volume") || notes.includes("cut short")) {
    flags.push("Fatigue / volume management");
  }
  if (notes.includes("stance")) flags.push("Technique adjustment");
  if (notes.includes("glute")) flags.push("Glute emphasis");
  if (notes.includes("lat")) flags.push("Lat emphasis");
  if (notes.includes("tricep")) flags.push("Triceps emphasis");
  if (notes.includes("quality")) flags.push("Quality-first execution");
  if (notes.includes("rehab")) flags.push("Rehab focus");

  if (currentTrack && currentRecommendation?.action && flags.length < 4) {
    if (currentRecommendation.action === "reduce") flags.push(`Reduce load on ${currentTrack.displayName}`);
    else if (currentRecommendation.action === "hold") flags.push(`Hold target on ${currentTrack.displayName}`);
    else if (currentRecommendation.action === "increase") flags.push(`Push ${currentTrack.displayName}`);
    else if (currentRecommendation.action === "rebuild") flags.push(`Rebuild baseline on ${currentTrack.displayName}`);
  }

  if (flags.length < 4 && totalExercises > 0 && completedExercises === 0) {
    flags.push("No completed work yet");
  } else if (flags.length < 4 && totalExercises > 0 && completedExercises < totalExercises) {
    flags.push("Session still in progress");
  }

  if (!flags.length) {
    flags.push("Steady session context");
  }

  return Array.from(new Set(flags)).slice(0, 4);
}

function formatSecondsToMMSS(totalSeconds?: number): string {
  if (typeof totalSeconds !== "number" || !Number.isFinite(totalSeconds) || totalSeconds < 0) return "";
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function formatCompletedSetForSessionSnapshot(
  se: SetEntry,
  track: Pick<Track, "trackingMode">,
  metricMode: SnapshotMetricMode
): string | null {
  if (!se.completedAt) return null;

  if (track.trackingMode === "weightedReps") {
    const parts: string[] = [];
    if (typeof se.weight === "number" && Number.isFinite(se.weight)) parts.push(String(se.weight));
    if (typeof se.reps === "number" && Number.isFinite(se.reps)) {
      if (parts.length) parts.push(`x ${se.reps}`);
      else parts.push(`${se.reps} reps`);
    }
    if (typeof se.rir === "number" && Number.isFinite(se.rir)) parts.push(`@${se.rir}`);
    return parts.length ? parts.join(" ") : "completed set";
  }

  if (track.trackingMode === "timeSeconds") {
    const timeText = formatSecondsToMMSS(se.seconds);
    return timeText ? `${timeText}` : "completed interval";
  }

  if (track.trackingMode === "breaths") {
    return typeof se.reps === "number" && Number.isFinite(se.reps)
      ? `${se.reps} breaths`
      : "completed breathing set";
  }

  if (track.trackingMode === "checkbox") {
    return (se.reps ?? 0) === 1 ? "completed" : null;
  }

  if (metricMode === "time") {
    const timeText = formatSecondsToMMSS(se.seconds);
    return timeText ? `${timeText}` : "completed interval";
  }

  if (metricMode === "distance") {
    const distance = typeof se.distance === "number" && Number.isFinite(se.distance) ? se.distance : undefined;
    if (distance === undefined) return "completed distance set";
    const unit = ((se as any).distanceUnit as string | undefined) ?? "mi";
    if (typeof se.weight === "number" && Number.isFinite(se.weight)) return `${se.weight} lbs • ${distance} ${unit}`;
    return `${distance} ${unit}`;
  }

  const reps = typeof se.reps === "number" && Number.isFinite(se.reps) ? se.reps : undefined;
  if (reps === undefined) return "completed set";
  return `${reps} reps`;
}

export function buildSessionSnapshotText(params: {
  sessionLabel: string;
  startedAt?: number;
  sessionNotes?: string;
  totalExercises: number;
  completedExercises: number;
  currentTrack: Pick<Track, "displayName" | "trackType" | "trackingMode"> | null;
  currentRecentBest:
    | {
        bestWeight?: number;
        bestReps?: number;
      }
    | null;
  currentRecommendation: WorkingRecommendation | null;
  trackSummaries: SessionSnapshotTrackSummary[];
}) {
  const {
    sessionLabel,
    startedAt,
    sessionNotes,
    totalExercises,
    completedExercises,
    currentTrack,
    currentRecentBest,
    currentRecommendation,
    trackSummaries,
  } = params;

  const lines: string[] = [];
  lines.push("Session Snapshot");
  lines.push(`Session: ${sessionLabel}`);
  if (typeof startedAt === "number" && Number.isFinite(startedAt)) {
    lines.push(`Date: ${new Date(startedAt).toLocaleDateString()}`);
  }
  lines.push(`Exercises: ${completedExercises}/${totalExercises} with completed work`);
  lines.push(
    buildSessionReadinessLine({
      sessionNotes,
      totalExercises,
      completedExercises,
    })
  );
  lines.push("");
  lines.push("Focus Flags");
  for (const flag of buildSessionFocusFlags({
    sessionNotes,
    totalExercises,
    completedExercises,
    currentTrack,
    currentRecommendation,
  })) {
    lines.push(`- ${flag}`);
  }

  if (sessionNotes?.trim()) {
    lines.push("");
    lines.push("Session Notes");
    lines.push(sessionNotes.trim());
  }

  if (currentTrack) {
    lines.push(`Current Exercise: ${currentTrack.displayName}`);
  }

  if (currentTrack && currentRecommendation) {
    lines.push("");
    lines.push("Current Recommendation");
    lines.push(`- Exercise: ${currentTrack.displayName}`);
    lines.push(`- Intent: ${currentTrack.trackType}`);
    lines.push(`- Mode: ${currentTrack.trackingMode}`);
    lines.push(`- Action: ${currentRecommendation.action}`);
    if (
      typeof currentRecommendation.targetWeight === "number" &&
      Number.isFinite(currentRecommendation.targetWeight) &&
      typeof currentRecommendation.targetReps === "number" &&
      Number.isFinite(currentRecommendation.targetReps)
    ) {
      lines.push(`- Target: ${currentRecommendation.targetWeight} x ${currentRecommendation.targetReps}`);
    } else if (
      typeof currentRecommendation.targetWeight === "number" &&
      Number.isFinite(currentRecommendation.targetWeight)
    ) {
      lines.push(`- Target weight: ${currentRecommendation.targetWeight}`);
    } else if (
      typeof currentRecommendation.targetReps === "number" &&
      Number.isFinite(currentRecommendation.targetReps)
    ) {
      lines.push(`- Target reps: ${currentRecommendation.targetReps}`);
    }
    lines.push(`- Confidence: ${currentRecommendation.confidence}`);
    lines.push(`- Why: ${currentRecommendation.rationale}`);
    if (
      currentRecentBest &&
      typeof currentRecentBest.bestWeight === "number" &&
      typeof currentRecentBest.bestReps === "number"
    ) {
      lines.push(`- Recent best: ${currentRecentBest.bestWeight} x ${currentRecentBest.bestReps}`);
    }
  }

  lines.push("");
  lines.push("Exercises");

  if (!trackSummaries.length) {
    lines.push("- No exercises in session");
  } else {
    trackSummaries.forEach((summary, index) => {
      lines.push(`${index + 1}. ${summary.displayName} [${summary.trackType} • ${summary.trackingMode}]`);
      lines.push(
        `   This session: ${summary.completedSets.length ? summary.completedSets.join(", ") : "No completed sets yet"}`
      );
    });
  }

  return lines.join("\n").trim() + "\n";
}
