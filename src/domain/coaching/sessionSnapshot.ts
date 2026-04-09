import type { SetEntry, Track, TrackType, TrackingMode } from "../../db";
import type { WorkingRecommendation } from "./nextWorkingRecommendation";

export type SnapshotMetricMode = "reps" | "distance" | "time";

export type SessionSnapshotTrackSummary = {
  displayName: string;
  trackType: TrackType;
  trackingMode: TrackingMode;
  completedSets: string[];
};

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
