import type { SetEntry, Track, TrackType, TrackingMode } from "../../db";
import type { WorkingRecommendation } from "./nextWorkingRecommendation";

export type SnapshotMetricMode = "reps" | "distance" | "time";

export type SessionSnapshotTrackSummary = {
  displayName: string;
  trackType: TrackType;
  trackingMode: TrackingMode;
  completedSets: string[];
};

type SessionSnapshotDerivation = {
  readiness: string;
  focusFlags: string[];
  carryForward: string[];
};

type SessionNoteSignals = {
  notes: string;
  explicitCarryForward: string[];
  hasFatigueOrReducedCapacity: boolean;
  hasLowBackIssue: boolean;
  hasKneeIssue: boolean;
  hasJointPain: boolean;
  hasCompensationOrBreakdown: boolean;
  hasExerciseSubstitution: boolean;
  hasDiagnosticFraming: boolean;
  hasCorrectiveOrRehabFraming: boolean;
  hasPositiveQualitySignal: boolean;
};

function deriveSessionNoteSignals(sessionNotes?: string): SessionNoteSignals {
  const notesRaw = String(sessionNotes ?? "");
  const notes = notesRaw.toLowerCase();
  const explicitLines = notesRaw.split("\n");
  const explicitStart = explicitLines.findIndex((line) => line.trim().toLowerCase() === "carry forward:");
  const explicitCarryForward: string[] = [];

  if (explicitStart >= 0) {
    for (let i = explicitStart + 1; i < explicitLines.length; i += 1) {
      const raw = explicitLines[i].trim();
      if (!raw) break;
      if (/^(session notes|start state|end verdict|carry forward):$/i.test(raw)) break;
      explicitCarryForward.push(raw.replace(/^[-*]\s*/, ""));
      if (explicitCarryForward.length >= 3) break;
    }
  }

  return {
    notes,
    explicitCarryForward,
    hasFatigueOrReducedCapacity:
      notes.includes("fatigue") ||
      notes.includes("tired") ||
      notes.includes("cut volume") ||
      notes.includes("cut short") ||
      notes.includes("reduced capacity"),
    hasLowBackIssue:
      notes.includes("low back") ||
      notes.includes("back pain") ||
      notes.includes("back fatigue") ||
      notes.includes("back tight"),
    hasKneeIssue:
      notes.includes("knee pain") ||
      notes.includes("knee felt") ||
      notes.includes("knee unstable") ||
      notes.includes("knee instability"),
    hasJointPain:
      notes.includes("elbow pain") ||
      notes.includes("shoulder pain") ||
      notes.includes("hip pain") ||
      notes.includes("wrist pain"),
    hasCompensationOrBreakdown:
      notes.includes("compensation") ||
      notes.includes("shifted") ||
      notes.includes("rotation") ||
      notes.includes("stance change") ||
      notes.includes("form breakdown"),
    hasExerciseSubstitution:
      notes.includes("swap") ||
      notes.includes("substitute") ||
      notes.includes("instead of") ||
      notes.includes("replaced"),
    hasDiagnosticFraming:
      notes.includes("diagnostic") ||
      notes.includes("assessment") ||
      notes.includes("check-in"),
    hasCorrectiveOrRehabFraming:
      notes.includes("corrective") ||
      notes.includes("rehab") ||
      notes.includes("physio"),
    hasPositiveQualitySignal:
      notes.includes("strong") ||
      notes.includes("smooth") ||
      notes.includes("snappy") ||
      notes.includes("good") ||
      notes.includes("better") ||
      notes.includes("ready"),
  };
}

function deriveSessionReadiness(params: {
  noteSignals: SessionNoteSignals;
  totalExercises: number;
  completedExercises: number;
}): string {
  const { noteSignals, totalExercises, completedExercises } = params;

  if (
    noteSignals.hasFatigueOrReducedCapacity ||
    noteSignals.hasLowBackIssue ||
    noteSignals.hasKneeIssue ||
    noteSignals.hasJointPain ||
    noteSignals.hasCorrectiveOrRehabFraming
  ) {
    return "Readiness: caution â€” session notes mention fatigue, pain, or reduced capacity";
  }

  if (noteSignals.hasPositiveQualitySignal) {
    return "Readiness: good â€” session notes indicate solid movement quality or output";
  }

  if (totalExercises > 0 && completedExercises === 0) {
    return "Readiness: unknown â€” no completed work logged yet";
  }

  if (totalExercises > 0 && completedExercises < totalExercises) {
    return "Readiness: mixed â€” session is in progress or only partially completed";
  }

  return "Readiness: steady â€” no strong caution flags detected in current session context";
}

function deriveSessionFocusFlags(params: {
  noteSignals: SessionNoteSignals;
  totalExercises: number;
  completedExercises: number;
  currentTrack: Pick<Track, "displayName" | "trackType" | "trackingMode"> | null;
  currentRecommendation: WorkingRecommendation | null;
}): string[] {
  const { noteSignals, totalExercises, completedExercises, currentTrack, currentRecommendation } = params;
  const flags: string[] = [];

  if (noteSignals.hasLowBackIssue) flags.push("Low back limitation");
  if (noteSignals.hasKneeIssue) flags.push("Knee stability / tolerance");
  if (noteSignals.hasJointPain) flags.push("Joint pain management");
  if (noteSignals.hasFatigueOrReducedCapacity) flags.push("Fatigue / volume management");
  if (noteSignals.hasCompensationOrBreakdown) flags.push("Compensation / technique watch");
  if (noteSignals.hasExerciseSubstitution) flags.push("Exercise substitution");
  if (noteSignals.hasDiagnosticFraming) flags.push("Diagnostic check");
  if (noteSignals.hasCorrectiveOrRehabFraming) flags.push("Corrective / rehab focus");

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

  if (!flags.length) flags.push("Steady session context");

  return Array.from(new Set(flags)).slice(0, 4);
}

function deriveSessionCarryForward(params: {
  noteSignals: SessionNoteSignals;
}): string[] {
  const { noteSignals } = params;
  if (noteSignals.explicitCarryForward.length) return noteSignals.explicitCarryForward;

  const reminders: string[] = [];
  if (noteSignals.notes.includes("stance change")) {
    reminders.push("Keep the stance adjustment that improved movement quality");
  }
  if (noteSignals.hasExerciseSubstitution) {
    reminders.push("Repeat the exercise substitution if the same issue shows up");
  }
  if (noteSignals.hasKneeIssue) {
    reminders.push("Monitor knee stability next session");
  }
  if (noteSignals.hasLowBackIssue) {
    reminders.push("Monitor low back tolerance next session");
  }
  if (noteSignals.hasCorrectiveOrRehabFraming) {
    reminders.push("Keep the corrective / rehab work in the plan");
  }
  if (noteSignals.hasFatigueOrReducedCapacity) {
    reminders.push("Adjust volume early if the same fatigue pattern returns");
  }

  return Array.from(new Set(reminders)).slice(0, 3);
}

function deriveSessionSnapshot(params: {
  sessionNotes?: string;
  totalExercises: number;
  completedExercises: number;
  currentTrack: Pick<Track, "displayName" | "trackType" | "trackingMode"> | null;
  currentRecommendation: WorkingRecommendation | null;
}): SessionSnapshotDerivation {
  const noteSignals = deriveSessionNoteSignals(params.sessionNotes);
  return {
    readiness: deriveSessionReadiness({
      noteSignals,
      totalExercises: params.totalExercises,
      completedExercises: params.completedExercises,
    }),
    focusFlags: deriveSessionFocusFlags({
      noteSignals,
      totalExercises: params.totalExercises,
      completedExercises: params.completedExercises,
      currentTrack: params.currentTrack,
      currentRecommendation: params.currentRecommendation,
    }),
    carryForward: deriveSessionCarryForward({
      noteSignals,
    }),
  };
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
    if (typeof se.weight === "number" && Number.isFinite(se.weight)) return `${se.weight} lbs â€¢ ${distance} ${unit}`;
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
  const derived = deriveSessionSnapshot({
    sessionNotes,
    totalExercises,
    completedExercises,
    currentTrack,
    currentRecommendation,
  });

  const lines: string[] = [];
  lines.push("Session Snapshot");
  lines.push(`Session: ${sessionLabel}`);
  if (typeof startedAt === "number" && Number.isFinite(startedAt)) {
    lines.push(`Date: ${new Date(startedAt).toLocaleDateString()}`);
  }
  lines.push(`Exercises: ${completedExercises}/${totalExercises} with completed work`);
  lines.push(derived.readiness);
  lines.push("");
  lines.push("Focus Flags");
  for (const flag of derived.focusFlags) {
    lines.push(`- ${flag}`);
  }

  if (derived.carryForward.length) {
    lines.push("");
    lines.push("Carry Forward");
    for (const reminder of derived.carryForward) {
      lines.push(`- ${reminder}`);
    }
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
      lines.push(`${index + 1}. ${summary.displayName} [${summary.trackType} â€¢ ${summary.trackingMode}]`);
      lines.push(
        `   This session: ${summary.completedSets.length ? summary.completedSets.join(", ") : "No completed sets yet"}`
      );
    });
  }

  return lines.join("\n").trim() + "\n";
}
