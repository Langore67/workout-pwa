import type { Exercise, Session, SetEntry, Track } from "../../db";
import type { CardioWalkEvent } from "../../lib/cardio/cardioTypes";
import { classifyAnchorMovementFamily } from "../../lib/coachExport/anchorIntelligence";
import { buildExerciseResolverIndex, resolveExerciseFromIndex } from "../exercises/exerciseResolver";
import type { IntendedWeeklyScheduleContext } from "../schedule/weeklyTrainingSchedule";
import { parseTrainingRole, type TrainingRole } from "../trainingRole";
import { buildTrainingCalendarBoundaries, buildTrainingCalendarContext, localDateKey, type TrainingCalendarContext } from "./trainingCalendarContext";

export type ExposureTrainingRole = TrainingRole | "untagged";
export type TrainingExposureWindowKind = "week_to_date" | "previous_complete_week" | "rolling_14_days";

export type MovementExposure = {
  movementPattern: string;
  qualifyingSets: number;
  workingSets: number;
  dropSets: number;
  failureSets: number;
  controlExposures: number;
  sessionCount: number;
  distinctCanonicalExerciseCount: number;
  latestExposureAt?: number;
  limitations: string[];
};

export type TrainingRoleExposure = {
  trainingRole: ExposureTrainingRole;
  qualifyingSets: number;
  controlExposures: number;
  sessionCount: number;
  distinctCanonicalExerciseCount: number;
  latestExposureAt?: number;
};

export type TrainingExposureWindow = {
  kind: TrainingExposureWindowKind;
  startAt: number;
  endAt: number;
  startLocalDate: string;
  endLocalDate: string;
  isCompleteCalendarPeriod: boolean;
  completedStrengthSessions: number;
  movementPatterns: MovementExposure[];
  trainingRoles: TrainingRoleExposure[];
  unclassifiedExerciseCount?: number;
  unclassifiedSetCount?: number;
  limitations: string[];
};

export type TrainingExposureContext = {
  generatedAt: number;
  latestCompletedStrengthSessionAt?: number;
  calendar: TrainingCalendarContext;
  windows: {
    currentWeekToDate: TrainingExposureWindow;
    previousCompleteWeek: TrainingExposureWindow;
    rolling14Days: TrainingExposureWindow;
  };
};

type ExposureEvent = {
  at: number;
  sessionId: string;
  canonicalExerciseId?: string;
  sourceExerciseId?: string;
  movementPattern?: string;
  trainingRole: ExposureTrainingRole;
  kind: "working" | "drop" | "failure" | "control";
  limitation?: string;
};

function meaningfulPayload(set: SetEntry) {
  return (typeof set.reps === "number" && Number.isFinite(set.reps) && set.reps > 0)
    || (typeof set.seconds === "number" && Number.isFinite(set.seconds) && set.seconds > 0)
    || (typeof set.weight === "number" && Number.isFinite(set.weight) && set.weight > 0)
    || (typeof set.distance === "number" && Number.isFinite(set.distance) && set.distance > 0);
}

function trackKind(track?: Track): "work" | "control" | undefined {
  const value = String(track?.trackType ?? "").trim().toLowerCase();
  if (value === "strength" || value === "hypertrophy" || value === "technique") return "work";
  if (value === "corrective" || value === "mobility") return "control";
  return undefined;
}

function terminalExercise(source: Exercise | undefined, exercisesById: Map<string, Exercise>) {
  if (!source) return { exercise: undefined as Exercise | undefined, limitation: "Exercise identity could not be resolved." };
  let current = source;
  const seen = new Set<string>();
  while (current.mergedIntoExerciseId) {
    if (seen.has(current.id)) return { exercise: undefined, limitation: `Merged exercise ${source.name} contains a cycle.` };
    seen.add(current.id);
    const next = exercisesById.get(current.mergedIntoExerciseId);
    if (!next) return { exercise: undefined, limitation: `Merged exercise ${source.name} references an unavailable canonical exercise.` };
    current = next;
  }
  return { exercise: current, limitation: undefined };
}

function explicitMovement(exercise?: Exercise) {
  const value = String(exercise?.movementPattern ?? "").trim().toLowerCase();
  return value || undefined;
}

function buildWindow(args: {
  kind: TrainingExposureWindowKind;
  startAt: number;
  endAt: number;
  endExclusive?: boolean;
  complete: boolean;
  events: ExposureEvent[];
  completedStrengthSessions: Array<{ id: string; endedAt: number }>;
}): TrainingExposureWindow {
  const inRange = (at: number) => at >= args.startAt && (args.endExclusive ? at < args.endAt : at <= args.endAt);
  const events = args.events.filter((event) => inRange(event.at));
  const movement = new Map<string, ExposureEvent[]>();
  const roles = new Map<ExposureTrainingRole, ExposureEvent[]>();
  for (const event of events) {
    if (event.movementPattern) movement.set(event.movementPattern, [...(movement.get(event.movementPattern) ?? []), event]);
    roles.set(event.trainingRole, [...(roles.get(event.trainingRole) ?? []), event]);
  }
  const unclassified = events.filter((event) => !event.movementPattern);
  const limitations = [...new Set(events.map((event) => event.limitation).filter((value): value is string => !!value))].sort();
  if (unclassified.length) limitations.push(`${unclassified.length} qualifying set${unclassified.length === 1 ? "" : "s"} could not be classified to a movement pattern.`);
  const movementPatterns = Array.from(movement.entries()).map<MovementExposure>(([movementPattern, rows]) => {
    const work = rows.filter((row) => row.kind !== "control");
    return {
      movementPattern,
      qualifyingSets: work.length,
      workingSets: work.filter((row) => row.kind === "working").length,
      dropSets: work.filter((row) => row.kind === "drop").length,
      failureSets: work.filter((row) => row.kind === "failure").length,
      controlExposures: rows.filter((row) => row.kind === "control").length,
      sessionCount: new Set(rows.map((row) => row.sessionId)).size,
      distinctCanonicalExerciseCount: new Set(rows.map((row) => row.canonicalExerciseId).filter(Boolean)).size,
      latestExposureAt: Math.max(...rows.map((row) => row.at)),
      limitations: [...new Set(rows.map((row) => row.limitation).filter((value): value is string => !!value))].sort(),
    };
  }).sort((a, b) => a.movementPattern.localeCompare(b.movementPattern));
  const roleOrder: ExposureTrainingRole[] = ["primary", "accessory", "corrective", "deprioritized", "untagged"];
  const trainingRoles = Array.from(roles.entries()).map<TrainingRoleExposure>(([trainingRole, rows]) => ({
    trainingRole,
    qualifyingSets: rows.filter((row) => row.kind !== "control").length,
    controlExposures: rows.filter((row) => row.kind === "control").length,
    sessionCount: new Set(rows.map((row) => row.sessionId)).size,
    distinctCanonicalExerciseCount: new Set(rows.map((row) => row.canonicalExerciseId).filter(Boolean)).size,
    latestExposureAt: Math.max(...rows.map((row) => row.at)),
  })).sort((a, b) => roleOrder.indexOf(a.trainingRole) - roleOrder.indexOf(b.trainingRole));
  return {
    kind: args.kind,
    startAt: args.startAt,
    endAt: args.endAt,
    startLocalDate: localDateKey(new Date(args.startAt)),
    endLocalDate: localDateKey(new Date(args.endExclusive ? args.endAt - 1 : args.endAt)),
    isCompleteCalendarPeriod: args.complete,
    completedStrengthSessions: args.completedStrengthSessions.filter((session) => inRange(session.endedAt)).length,
    movementPatterns,
    trainingRoles,
    ...(unclassified.length ? {
      unclassifiedExerciseCount: new Set(unclassified.map((row) => row.canonicalExerciseId ?? row.sourceExerciseId ?? `${row.sessionId}:${row.limitation ?? "unresolved"}`)).size,
      unclassifiedSetCount: unclassified.length,
    } : {}),
    limitations,
  };
}

export function buildTrainingExposureContext(args: {
  sessions: readonly Session[];
  sets: readonly SetEntry[];
  tracks: readonly Track[];
  exercises: readonly Exercise[];
  dedicatedCardioObservations?: readonly CardioWalkEvent[];
  intendedWeeklySchedule?: IntendedWeeklyScheduleContext;
  asOf: number;
}): TrainingExposureContext {
  const asOf = Number.isFinite(args.asOf) ? args.asOf : Date.now();
  const boundaries = buildTrainingCalendarBoundaries(asOf);
  const completedSessions = (args.sessions ?? []).filter((session) => !session.deletedAt && Number.isFinite(session.endedAt) && Number(session.endedAt) <= asOf);
  const sessionsById = new Map(completedSessions.map((session) => [session.id, session]));
  const tracksById = new Map((args.tracks ?? []).map((track) => [track.id, track]));
  const exercises = (args.exercises ?? []).slice();
  const exercisesById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const resolverIndex = buildExerciseResolverIndex(exercises);
  const events: ExposureEvent[] = [];
  const strengthSessionIds = new Set<string>();

  for (const set of args.sets ?? []) {
    const session = sessionsById.get(set.sessionId);
    if (!session || set.deletedAt || set.setType === "warmup" || !meaningfulPayload(set)) continue;
    const track = tracksById.get(set.trackId);
    const kind = trackKind(track);
    if (!track || !kind) continue;
    if (kind === "work" && set.setType !== "working" && set.setType !== "drop" && set.setType !== "failure") continue;
    const source = track.exerciseId ? exercisesById.get(track.exerciseId) : undefined;
    let resolved = terminalExercise(source, exercisesById);
    if (!source && track.displayName) {
      const byName = resolveExerciseFromIndex({ rawName: track.displayName, allowAlias: true, followMerged: true, includeArchived: true }, resolverIndex);
      resolved = { exercise: byName.canonicalExercise ?? byName.exercise, limitation: byName.warnings[0] };
    }
    const canonical = resolved.exercise;
    const fallback = canonical ? classifyAnchorMovementFamily(canonical.name) : "unknown";
    const movementPattern = explicitMovement(canonical) ?? (fallback !== "unknown" ? fallback : undefined);
    const role = parseTrainingRole(canonical?.trainingRole) ?? "untagged";
    const at = Number(set.completedAt ?? session.endedAt);
    if (!Number.isFinite(at) || at > asOf) continue;
    events.push({
      at,
      sessionId: session.id,
      canonicalExerciseId: canonical?.id,
      sourceExerciseId: source?.id,
      movementPattern,
      trainingRole: role,
      kind: kind === "control" ? "control" : set.setType as "working" | "drop" | "failure",
      limitation: resolved.limitation ?? (!movementPattern ? `Movement pattern is unavailable for ${canonical?.name ?? track.displayName ?? "an unresolved exercise"}.` : undefined),
    });
    if (kind === "work") strengthSessionIds.add(session.id);
  }

  const completedStrengthSessions = completedSessions
    .filter((session) => strengthSessionIds.has(session.id))
    .map((session) => ({ id: session.id, endedAt: Number(session.endedAt) }));
  const cardioTimestamps = (args.dedicatedCardioObservations ?? [])
    .map((event) => event.endedAt)
    .filter((at): at is number => Number.isFinite(at) && Number(at) <= asOf);
  const calendar = buildTrainingCalendarContext({
    asOf,
    completedStrengthSessionTimestamps: completedStrengthSessions.map((session) => session.endedAt),
    completedDedicatedCardioSessionTimestamps: cardioTimestamps,
    intendedWeeklySchedule: args.intendedWeeklySchedule,
  });
  return {
    generatedAt: asOf,
    ...(completedStrengthSessions.length
      ? { latestCompletedStrengthSessionAt: Math.max(...completedStrengthSessions.map((session) => session.endedAt)) }
      : {}),
    calendar,
    windows: {
      currentWeekToDate: buildWindow({ kind: "week_to_date", startAt: boundaries.currentWeekStartAt, endAt: asOf, complete: false, events, completedStrengthSessions }),
      previousCompleteWeek: buildWindow({ kind: "previous_complete_week", startAt: boundaries.previousWeekStartAt, endAt: boundaries.currentWeekStartAt, endExclusive: true, complete: true, events, completedStrengthSessions }),
      rolling14Days: buildWindow({ kind: "rolling_14_days", startAt: boundaries.rolling14DaysStartAt, endAt: asOf, complete: false, events, completedStrengthSessions }),
    },
  };
}
