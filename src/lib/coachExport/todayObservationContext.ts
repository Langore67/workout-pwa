import { normalizeName, type Exercise, type Session, type Template, type TemplateItem, type Track } from "../../db";
import { buildExerciseResolverIndex, resolveExerciseFromIndex } from "../../domain/exercises/exerciseResolver";
import { getScheduledEntryForDate, type WeeklyTrainingSchedule } from "../../domain/schedule/weeklyTrainingSchedule";

export type TodayObservationContext = {
  status: "unconfigured" | "inactive" | "recovery" | "unresolved" | "training";
  sessionName?: string;
  templateId?: string;
  matchingSessionIds: string[];
  trackIds: string[];
  exerciseIds: string[];
  exerciseNameKeys: string[];
};

const EMPTY_CONTEXT = (status: TodayObservationContext["status"]): TodayObservationContext => ({
  status,
  matchingSessionIds: [],
  trackIds: [],
  exerciseIds: [],
  exerciseNameKeys: [],
});

/** Resolve only explicit schedule/template structure; never infer from freeform focus text. */
export function buildTodayObservationContext(args: {
  schedule: WeeklyTrainingSchedule | null | undefined;
  templates: readonly Template[];
  templateItems: readonly TemplateItem[];
  tracks: readonly Track[];
  exercises: readonly Exercise[];
  sessions: readonly Session[];
  asOf: number;
}): TodayObservationContext {
  if (!args.schedule) return EMPTY_CONTEXT("unconfigured");
  if (!args.schedule.active) return EMPTY_CONTEXT("inactive");
  const entry = getScheduledEntryForDate(args.schedule, new Date(args.asOf));
  if (!entry) return EMPTY_CONTEXT("unresolved");
  if (entry.dayType === "recovery") return EMPTY_CONTEXT("recovery");

  const normalizedSessionName = normalizeName(entry.sessionName);
  let template: Template | undefined;
  if (entry.templateId) {
    template = args.templates.find((row) => row.id === entry.templateId && !row.archivedAt);
    if (!template) return { ...EMPTY_CONTEXT("unresolved"), sessionName: entry.sessionName };
  } else {
    const exactNameMatches = args.templates.filter(
      (row) => !row.archivedAt && normalizeName(row.name) === normalizedSessionName
    );
    if (exactNameMatches.length > 1) {
      return { ...EMPTY_CONTEXT("unresolved"), sessionName: entry.sessionName };
    }
    template = exactNameMatches[0];
  }

  if (!template) {
    // A schedule label without a canonical template cannot safely establish
    // exercise or historical-session relevance, even if text happens to match.
    return { ...EMPTY_CONTEXT("unresolved"), sessionName: entry.sessionName };
  }

  const matchingSessions = args.sessions.filter((session) => {
    if (session.deletedAt) return false;
    return session.templateId === template.id ||
      (!session.templateId && normalizeName(session.templateName ?? "") === normalizeName(template.name));
  });

  const trackById = new Map(args.tracks.map((track) => [track.id, track]));
  const exerciseIndex = buildExerciseResolverIndex([...args.exercises]);
  const trackIds = new Set<string>();
  const exerciseIds = new Set<string>();
  const exerciseNameKeys = new Set<string>();
  for (const item of args.templateItems) {
    if (item.templateId !== template.id) continue;
    trackIds.add(item.trackId);
    const track = trackById.get(item.trackId);
    if (!track?.exerciseId) continue;
    exerciseIds.add(track.exerciseId);
    const exercise = args.exercises.find((row) => row.id === track.exerciseId);
    if (exercise) {
      const resolved = resolveExerciseFromIndex({ rawName: exercise.name, followMerged: true }, exerciseIndex);
      const canonicalId = resolved.canonicalExercise?.id ?? resolved.exercise?.id;
      if (canonicalId) exerciseIds.add(canonicalId);
    }
  }

  for (const exercise of args.exercises) {
    const resolved = resolveExerciseFromIndex({ rawName: exercise.name, followMerged: true }, exerciseIndex);
    const canonicalId = resolved.canonicalExercise?.id ?? resolved.exercise?.id;
    if (!canonicalId || !exerciseIds.has(canonicalId)) continue;
    for (const candidate of [exercise.name, exercise.normalizedName, ...(exercise.aliases ?? [])]) {
      const key = normalizeName(candidate);
      if (key) exerciseNameKeys.add(key);
    }
  }

  return {
    status: "training",
    sessionName: entry.sessionName,
    templateId: template.id,
    matchingSessionIds: matchingSessions.map((session) => session.id),
    trackIds: [...trackIds].sort(),
    exerciseIds: [...exerciseIds].sort(),
    exerciseNameKeys: [...exerciseNameKeys].sort(),
  };
}
