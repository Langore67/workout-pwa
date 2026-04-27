import type { SetEntry, Track, TrackType, TrackingMode } from "../../db";
import type { WorkingRecommendation } from "./nextWorkingRecommendation";
import { formatWeightedRepsSetDisplay } from "./setDisplay";

export type SnapshotMetricMode = "reps" | "distance" | "time";

export type SessionSnapshotTrackSummary = {
  displayName: string;
  trackType: TrackType;
  trackingMode: TrackingMode;
  completedSets: string[];
};

export type SessionCoachingSignals = {
  readiness: string;
  focusFlags: string[];
  movementQualitySignals: string[];
  stimulusCoverage: string[];
  fatigueReadiness: string[];
  carryForward: string[];
  nextWorkoutFocus: string[];
  discussWithCoach: string[];
};

type SessionSnapshotDerivation = {
  readiness: string;
  focusFlags: string[];
  movementQualitySignals: string[];
  stimulusCoverage: string[];
  fatigueReadiness: string[];
  carryForward: string[];
  nextWorkoutFocus: string[];
  discussWithCoach: string[];
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
  engagementSignals: string[];
  loadSignals: string[];
  fatigueSignals: string[];
  jointSignals: string[];
  qualitySignals: string[];
  exerciseSignals: SessionExerciseSignal[];
};

type SessionExerciseSignal = {
  exercise: string;
  raw: string;
  movementQuality: string[];
  stimulus: string[];
  fatigue: string[];
  nextWorkout: string[];
  discuss: string[];
};

function normalizeBulletText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function uniqueCompact(values: Array<string | null | undefined>, limit = 4): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const value = normalizeBulletText(String(raw ?? ""));
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= limit) break;
  }
  return out;
}

function splitSessionNoteThoughts(notesRaw: string): string[] {
  return notesRaw
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) =>
      line
        .split(/(?<=[.!?])\s+/)
        .map((part) => part.trim())
        .filter(Boolean)
    );
}

function cleanExerciseObservation(value: string): string {
  return normalizeBulletText(value)
    .replace(/[.]+$/g, "")
    .replace(/\s*;\s*/g, "; ");
}

function normalizeExerciseNameForMatch(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function inferMovementFamily(exerciseName: string): "Pull" | "Push" | "Shoulders" | "Carry" | "Other" {
  const name = exerciseName.toLowerCase();
  if (
    name.includes("pulldown") ||
    name.includes("pull down") ||
    name.includes("row") ||
    name.includes("pull-up") ||
    name.includes("pullup") ||
    name.includes("chin")
  ) {
    return "Pull";
  }
  if (name.includes("carry") || name.includes("farmer")) return "Carry";
  if (
    name.includes("press") ||
    name.includes("bench") ||
    name.includes("push")
  ) {
    if (name.includes("bradford") || name.includes("overhead") || name.includes("shoulder")) {
      return "Shoulders";
    }
    return "Push";
  }
  if (name.includes("delt") || name.includes("lateral raise") || name.includes("upright row")) {
    return "Shoulders";
  }
  return "Other";
}

function summarizeExerciseObservation(exercise: string, rawObservation: string): SessionExerciseSignal {
  const raw = cleanExerciseObservation(rawObservation);
  const text = raw.toLowerCase();
  const movementQuality: string[] = [];
  const stimulus: string[] = [];
  const fatigue: string[] = [];
  const nextWorkout: string[] = [];
  const discuss: string[] = [];
  const family = inferMovementFamily(exercise);

  if (text.includes("breakthrough")) {
    movementQuality.push(`${exercise}: breakthrough pattern found`);
  }
  if (text.includes("improved stretch") || text.includes("improved contraction")) {
    movementQuality.push(`${exercise}: improved stretch and contraction`);
  }
  if (text.includes("lat dominance")) {
    movementQuality.push(`${exercise}: lat dominance achieved`);
    stimulus.push("Pull: strong lat stimulus");
    nextWorkout.push("Maintain lat-driven pulling before increasing load");
  }
  if (text.includes("no biceps") || text.includes("no trap takeover") || text.includes("no biceps/trap takeover")) {
    movementQuality.push(`${exercise}: no biceps/trap takeover`);
    nextWorkout.push("Keep the same pulling setup that reduced arm and trap takeover");
  }
  if (text.includes("arms only at terminal reps")) {
    movementQuality.push(`${exercise}: arms only at terminal reps`);
    fatigue.push("Fatigue mostly appeared at terminal reps");
  }
  if (text.includes("slight trap involvement")) {
    movementQuality.push(`${exercise}: slight trap involvement noted but controlled`);
    discuss.push("Discuss reducing trap compensation during carries");
  }
  if (text.includes("stopped due to") || text.includes("stopped because of")) {
    movementQuality.push(`${exercise}: ${raw}`);
  }
  if (text.includes("twinge") || text.includes("pain") || text.includes("sensitive")) {
    fatigue.push(`${exercise}: ${raw}`);
    if (text.includes("shoulder")) {
      nextWorkout.push("Avoid behind-the-neck pressing positions");
      discuss.push("Review safe overhead pressing range");
      if (family === "Shoulders") {
        stimulus.push("Shoulders: vertical pressing safe range needs review");
      }
    }
  }
  if (text.includes("too light")) {
    movementQuality.push(`${exercise}: load looked too light`);
    nextWorkout.push("Increase load only if mechanics stay clean");
  }
  if (text.includes("too heavy")) {
    movementQuality.push(`${exercise}: load looked too heavy`);
    nextWorkout.push("Keep pressing progression controlled");
  }
  if (
    text.includes("form breaking") ||
    text.includes("form breakdown") ||
    text.includes("weakening") ||
    text.includes("terminal reps")
  ) {
    fatigue.push(`${exercise}: terminal-rep quality dropped`);
  }
  if (text.includes("safe substitute") || text.includes("substitute") || text.includes("swap")) {
    nextWorkout.push(`Keep ${exercise} on the safer variation that worked today`);
  }

  if (!movementQuality.length) {
    movementQuality.push(`${exercise}: ${raw}`);
  }

  const hasLateralDeltRefinementSignal =
    text.includes("medial delt") || text.includes("lateral delt");

  if (!stimulus.length) {
    if (family === "Pull" && (text.includes("lat") || text.includes("stretch") || text.includes("contraction"))) {
      stimulus.push("Pull: strong lat stimulus");
    } else if (family === "Push" && (text.includes("chest") || text.includes("pressing"))) {
      stimulus.push("Push: chest-dominant pressing with stable mechanics");
    } else if (
      family === "Shoulders" &&
      !hasLateralDeltRefinementSignal &&
      (text.includes("delt") || text.includes("shoulder"))
    ) {
      stimulus.push("Shoulders: pressing pattern needs tighter isolation and setup");
    }
  }

  if (hasLateralDeltRefinementSignal) {
    nextWorkout.push("Improve medial delt isolation");
    discuss.push("Review medial delt isolation setup");
    stimulus.push("Shoulders: lateral delt isolation needs refinement");
  }

  return {
    exercise,
    raw,
    movementQuality: uniqueCompact(movementQuality, 2),
    stimulus: uniqueCompact(stimulus, 2),
    fatigue: uniqueCompact(fatigue, 2),
    nextWorkout: uniqueCompact(nextWorkout, 3),
    discuss: uniqueCompact(discuss, 3),
  };
}

function deriveExerciseSignals(
  sessionNotes: string,
  trackSummaries: SessionSnapshotTrackSummary[]
): SessionExerciseSignal[] {
  const thoughts = splitSessionNoteThoughts(sessionNotes);
  const knownExercises = trackSummaries.map((summary) => ({
    name: summary.displayName,
    key: normalizeExerciseNameForMatch(summary.displayName),
  }));
  const signals: SessionExerciseSignal[] = [];

  for (const thought of thoughts) {
    if (/^(carry forward|session notes|start state|end verdict):/i.test(thought)) continue;
    const colonIndex = thought.indexOf(":");
    if (colonIndex <= 0) continue;

    const rawExercise = thought.slice(0, colonIndex).trim();
    const rawObservation = thought.slice(colonIndex + 1).trim();
    if (!rawExercise || !rawObservation) continue;

    const exerciseKey = normalizeExerciseNameForMatch(rawExercise);
    const matched =
      knownExercises.find((candidate) => exerciseKey === candidate.key) ??
      knownExercises.find((candidate) => exerciseKey.includes(candidate.key) || candidate.key.includes(exerciseKey));

    if (!matched) continue;
    signals.push(summarizeExerciseObservation(matched.name, rawObservation));
  }

  return signals;
}

function pushRegexMatches(
  target: string[],
  notesRaw: string,
  regex: RegExp,
  formatter: (match: RegExpExecArray) => string | null
) {
  for (const match of notesRaw.matchAll(regex)) {
    const next = formatter(match as RegExpExecArray);
    if (next) target.push(next);
  }
}

function deriveSessionNoteSignals(sessionNotes?: string): SessionNoteSignals {
  const notesRaw = String(sessionNotes ?? "");
  const notes = notesRaw.toLowerCase();
  const explicitLines = notesRaw.split("\n");
  const explicitStart = explicitLines.findIndex((line) => line.trim().toLowerCase() === "carry forward:");
  const explicitCarryForward: string[] = [];
  const engagementSignals: string[] = [];
  const loadSignals: string[] = [];
  const fatigueSignals: string[] = [];
  const jointSignals: string[] = [];
  const qualitySignals: string[] = [];

  if (explicitStart >= 0) {
    for (let i = explicitStart + 1; i < explicitLines.length; i += 1) {
      const raw = explicitLines[i].trim();
      if (!raw) break;
      if (/^(session notes|start state|end verdict|carry forward):$/i.test(raw)) break;
      explicitCarryForward.push(raw.replace(/^[-*]\s*/, ""));
      if (explicitCarryForward.length >= 3) break;
    }
  }

  pushRegexMatches(
    engagementSignals,
    notesRaw,
    /(?<!not\s)\bfelt in ([a-z0-9 /-]+)/gi,
    (match) => {
      const area = normalizeBulletText(match[1]).replace(/[.,;:!?]+$/, "");
      return area ? `Good engagement in ${area}` : null;
    }
  );

  pushRegexMatches(
    engagementSignals,
    notesRaw,
    /\b(?:not felt in|didn't feel in|did not feel in) ([a-z0-9 /-]+)/gi,
    (match) => {
      const area = normalizeBulletText(match[1]).replace(/[.,;:!?]+$/, "");
      return area ? `Poor engagement in ${area}` : null;
    }
  );

  pushRegexMatches(
    qualitySignals,
    notesRaw,
    /\b(form (?:breaking|breakdown|weakening)|technique (?:breaking|breaking down|slipping)|lost position)\b/gi,
    (match) => {
      const phrase = normalizeBulletText(match[1]).replace(/[.,;:!?]+$/, "");
      return phrase ? `${phrase[0].toUpperCase()}${phrase.slice(1)}` : null;
    }
  );

  pushRegexMatches(
    fatigueSignals,
    notesRaw,
    /\b(fatigue|fatigued|gassed|tired|exhausted|reduced capacity|cut volume|cut short)\b/gi,
    (match) => {
      const phrase = normalizeBulletText(match[1]).replace(/[.,;:!?]+$/, "");
      return phrase ? `${phrase[0].toUpperCase()}${phrase.slice(1)} showed up` : null;
    }
  );

  pushRegexMatches(
    loadSignals,
    notesRaw,
    /\btoo light\b/gi,
    () => "Load looked too light"
  );
  pushRegexMatches(
    loadSignals,
    notesRaw,
    /\btoo heavy\b/gi,
    () => "Load looked too heavy"
  );

  pushRegexMatches(
    jointSignals,
    notesRaw,
    /\b(knee|elbow|shoulder|hip|wrist|ankle|low back|back)\s+(pain|felt|feedback|tight|tightness|unstable|instability|irritated|fatigue)\b/gi,
    (match) => {
      const joint = normalizeBulletText(match[1]);
      const feedback = normalizeBulletText(match[2]);
      if (!joint || !feedback) return null;
      return `${joint[0].toUpperCase()}${joint.slice(1)} ${feedback}`;
    }
  );

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
    engagementSignals: uniqueCompact(engagementSignals, 4),
    loadSignals: uniqueCompact(loadSignals, 3),
    fatigueSignals: uniqueCompact(fatigueSignals, 4),
    jointSignals: uniqueCompact(jointSignals, 4),
    qualitySignals: uniqueCompact(qualitySignals, 4),
    exerciseSignals: [],
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

  if (noteSignals.hasLowBackIssue) flags.push("Low back tolerance");
  if (noteSignals.hasKneeIssue) flags.push("Knee stability/tolerance");
  if (noteSignals.hasJointPain) flags.push("Joint pain noted");
  if (noteSignals.hasFatigueOrReducedCapacity) flags.push("Fatigue or cut-volume constraint");
  if (noteSignals.hasCompensationOrBreakdown) flags.push("Technique compensation noted");
  if (noteSignals.hasExerciseSubstitution) flags.push("Exercise substitution used");
  if (noteSignals.hasDiagnosticFraming) flags.push("Diagnostic check-in");
  if (noteSignals.hasCorrectiveOrRehabFraming) flags.push("Corrective/rehab work");

  if (currentTrack && currentRecommendation?.action && flags.length < 4 && flags.length === 0) {
    if (currentRecommendation.action === "reduce") flags.push(`Load reduction suggested: ${currentTrack.displayName}`);
    else if (currentRecommendation.action === "increase") flags.push(`Progression opportunity: ${currentTrack.displayName}`);
    else if (currentRecommendation.action === "rebuild") flags.push(`Rebuild baseline: ${currentTrack.displayName}`);
  }

  if (flags.length < 4 && totalExercises > 0 && completedExercises === 0) {
    flags.push("No completed work yet");
  } else if (flags.length < 4 && totalExercises > 0 && completedExercises < totalExercises) {
    flags.push("Session still in progress");
  }

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

function deriveMovementQualitySignals(params: {
  noteSignals: SessionNoteSignals;
}): string[] {
  const { noteSignals } = params;
  if (noteSignals.exerciseSignals.length) {
    const primary = noteSignals.exerciseSignals
      .map((signal) => signal.movementQuality[0])
      .filter(Boolean);
    const secondary = noteSignals.exerciseSignals.flatMap((signal) => signal.movementQuality.slice(1));
    return uniqueCompact([...primary, ...secondary], 4);
  }
  const bullets = [
    ...noteSignals.engagementSignals,
    ...noteSignals.qualitySignals,
  ];

  if (!bullets.length && noteSignals.hasPositiveQualitySignal) {
    bullets.push("Movement quality looked solid");
  }

  return uniqueCompact(bullets, 4);
}

function deriveStimulusCoverage(params: {
  noteSignals: SessionNoteSignals;
  totalExercises: number;
  completedExercises: number;
}): string[] {
  const { noteSignals, totalExercises, completedExercises } = params;
  const bullets: string[] = [];

  bullets.push(
    totalExercises > 0
      ? `${completedExercises}/${totalExercises} exercises produced completed work`
      : "No completed exercise coverage yet"
  );

  if (noteSignals.exerciseSignals.length) {
    bullets.push(...noteSignals.exerciseSignals.flatMap((signal) => signal.stimulus));
  } else {
    bullets.push(...noteSignals.engagementSignals.map((signal) =>
      signal.startsWith("Good engagement in ")
        ? signal.replace("Good engagement in ", "Stimulus reached ")
        : signal.startsWith("Poor engagement in ")
          ? signal.replace("Poor engagement in ", "Stimulus missed ")
          : signal
    ));
  }

  bullets.push(...noteSignals.loadSignals);

  return uniqueCompact(bullets, 4);
}

function deriveFatigueReadinessBullets(params: {
  noteSignals: SessionNoteSignals;
  readiness: string;
}): string[] {
  const { noteSignals, readiness } = params;
  const bullets = [
    ...noteSignals.exerciseSignals.flatMap((signal) => signal.fatigue),
    ...noteSignals.fatigueSignals,
    ...noteSignals.jointSignals,
  ];

  if (!bullets.length) {
    if (readiness.startsWith("Readiness: good")) bullets.push("Readiness looked solid");
    else if (readiness.startsWith("Readiness: steady")) bullets.push("Readiness looked steady");
    else if (readiness.startsWith("Readiness: unknown")) bullets.push("Readiness is still building");
  }

  return uniqueCompact(bullets, 4);
}

function deriveDiscussWithCoach(params: {
  noteSignals: SessionNoteSignals;
  currentTrack: Pick<Track, "displayName" | "trackType" | "trackingMode"> | null;
}): string[] {
  const { noteSignals, currentTrack } = params;
  const bullets: string[] = [...noteSignals.exerciseSignals.flatMap((signal) => signal.discuss)];

  if (noteSignals.jointSignals.length) {
    bullets.push(`Review joint feedback around ${currentTrack?.displayName ?? "today's main work"}`);
  }
  if (noteSignals.qualitySignals.length) {
    bullets.push("Review form breakdown before adding load");
  }
  if (noteSignals.loadSignals.includes("Load looked too heavy")) {
    bullets.push("Discuss a lighter entry load or rep target");
  }
  if (noteSignals.loadSignals.includes("Load looked too light")) {
    bullets.push("Discuss a faster progression step");
  }
  if (noteSignals.engagementSignals.some((signal) => signal.startsWith("Poor engagement in "))) {
    bullets.push("Review setup cues to improve target-muscle coverage");
  }
  if (noteSignals.hasExerciseSubstitution) {
    bullets.push("Confirm whether the substitution stays in next session");
  }

  return uniqueCompact(bullets, 3);
}

function deriveNextWorkoutFocus(params: {
  noteSignals: SessionNoteSignals;
}): string[] {
  const { noteSignals } = params;
  const bullets = noteSignals.exerciseSignals.length
    ? [
        ...noteSignals.exerciseSignals
          .map((signal) => signal.nextWorkout[0])
          .filter(Boolean),
        ...noteSignals.exerciseSignals.flatMap((signal) => signal.nextWorkout.slice(1)),
      ]
    : [];

  if (!bullets.length) {
    if (noteSignals.hasFatigueOrReducedCapacity) {
      bullets.push("Keep progression conservative if fatigue returns early");
    }
    if (noteSignals.hasExerciseSubstitution) {
      bullets.push("Start with the safer exercise option that already worked");
    }
    if (noteSignals.hasCompensationOrBreakdown) {
      bullets.push("Clean up technique before increasing load");
    }
  }

  return uniqueCompact(bullets, 3);
}

function deriveSessionSnapshot(params: {
  sessionNotes?: string;
  totalExercises: number;
  completedExercises: number;
  currentTrack: Pick<Track, "displayName" | "trackType" | "trackingMode"> | null;
  currentRecommendation: WorkingRecommendation | null;
  trackSummaries: SessionSnapshotTrackSummary[];
}): SessionSnapshotDerivation {
  const noteSignals = deriveSessionNoteSignals(params.sessionNotes);
  noteSignals.exerciseSignals = deriveExerciseSignals(
    String(params.sessionNotes ?? ""),
    params.trackSummaries
  );
  const readiness = deriveSessionReadiness({
    noteSignals,
    totalExercises: params.totalExercises,
    completedExercises: params.completedExercises,
  });
  return {
    readiness,
    focusFlags: deriveSessionFocusFlags({
      noteSignals,
      totalExercises: params.totalExercises,
      completedExercises: params.completedExercises,
      currentTrack: params.currentTrack,
      currentRecommendation: params.currentRecommendation,
    }),
    movementQualitySignals: deriveMovementQualitySignals({
      noteSignals,
    }),
    stimulusCoverage: deriveStimulusCoverage({
      noteSignals,
      totalExercises: params.totalExercises,
      completedExercises: params.completedExercises,
    }),
    fatigueReadiness: deriveFatigueReadinessBullets({
      noteSignals,
      readiness,
    }),
    carryForward: deriveSessionCarryForward({
      noteSignals,
    }),
    nextWorkoutFocus: deriveNextWorkoutFocus({
      noteSignals,
    }),
    discussWithCoach: deriveDiscussWithCoach({
      noteSignals,
      currentTrack: params.currentTrack,
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
    return formatWeightedRepsSetDisplay({
      weight: se.weight,
      reps: se.reps,
      rir: se.rir,
      emptyLabel: "completed set",
    });
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
    trackSummaries,
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

  if (derived.movementQualitySignals.length) {
    lines.push("");
    lines.push("Movement Quality Signals");
    for (const item of derived.movementQualitySignals) {
      lines.push(`- ${item}`);
    }
  }

  if (derived.stimulusCoverage.length) {
    lines.push("");
    lines.push("Stimulus / Coverage");
    for (const item of derived.stimulusCoverage) {
      lines.push(`- ${item}`);
    }
  }

  if (derived.fatigueReadiness.length) {
    lines.push("");
    lines.push("Fatigue / Readiness");
    for (const item of derived.fatigueReadiness) {
      lines.push(`- ${item}`);
    }
  }

  if (derived.carryForward.length) {
    lines.push("");
    lines.push("Carry Forward");
    for (const reminder of derived.carryForward) {
      lines.push(`- ${reminder}`);
    }
  }

  if (derived.nextWorkoutFocus.length) {
    lines.push("");
    lines.push("Next Workout Focus");
    for (const item of derived.nextWorkoutFocus) {
      lines.push(`- ${item}`);
    }
  }

  if (derived.discussWithCoach.length) {
    lines.push("");
    lines.push("Discuss with Gaz");
    for (const item of derived.discussWithCoach) {
      lines.push(`- ${item}`);
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

export function buildSessionCoachingSignals(params: {
  sessionNotes?: string;
  totalExercises: number;
  completedExercises: number;
  currentTrack: Pick<Track, "displayName" | "trackType" | "trackingMode"> | null;
  currentRecommendation: WorkingRecommendation | null;
  trackSummaries: SessionSnapshotTrackSummary[];
}): SessionCoachingSignals {
  return deriveSessionSnapshot(params);
}
