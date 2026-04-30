import type { Exercise, Session, SetEntry, Track } from "../../db";
import type { CoachExportAnchorLift } from "./types";

function activeCanonicalExerciseName(exercise: Exercise | null | undefined): string | null {
  if (!exercise || exercise.archivedAt || exercise.mergedIntoExerciseId) return null;
  const name = String(exercise.name ?? "").replace(/\s+/g, " ").trim();
  return name || null;
}

function pushUniqueName(
  values: string[],
  seen: Set<string>,
  rawName: string | null | undefined,
  limit: number
) {
  const name = String(rawName ?? "").replace(/\s+/g, " ").trim();
  if (!name) return;
  const key = name.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  values.push(name);
  if (values.length > limit) values.length = limit;
}

function sortRecentCompletedSessions(sessions: Session[]) {
  return (sessions ?? [])
    .filter((session) => !session.deletedAt && Number.isFinite(session.endedAt))
    .slice()
    .sort((a, b) => Number(b.endedAt ?? 0) - Number(a.endedAt ?? 0));
}

export function buildExerciseVocabulary(args: {
  sessions: Session[];
  sets: SetEntry[];
  tracks: Track[];
  exercises: Exercise[];
  anchorLifts: CoachExportAnchorLift[];
  limit?: number;
}): string[] {
  const limit = Math.max(1, Math.floor(args.limit ?? 25));
  const out: string[] = [];
  const seen = new Set<string>();
  const tracksById = new Map((args.tracks ?? []).map((track) => [track.id, track]));
  const exercisesById = new Map((args.exercises ?? []).map((exercise) => [exercise.id, exercise]));
  const recentSessionIds = new Set(
    sortRecentCompletedSessions(args.sessions)
      .slice(0, 4)
      .map((session) => session.id)
  );

  for (const set of args.sets ?? []) {
    if (out.length >= limit) break;
    if (set.deletedAt || !set.completedAt || !recentSessionIds.has(set.sessionId)) continue;
    const track = tracksById.get(set.trackId);
    if (!track?.exerciseId) continue;
    const canonicalName = activeCanonicalExerciseName(exercisesById.get(track.exerciseId));
    if (!canonicalName) continue;
    pushUniqueName(out, seen, canonicalName, limit);
  }

  for (const anchorLift of args.anchorLifts ?? []) {
    if (out.length >= limit) break;
    const canonicalName =
      activeCanonicalExerciseName(
        anchorLift.exerciseId ? exercisesById.get(anchorLift.exerciseId) : undefined
      ) ?? anchorLift.exerciseName;
    pushUniqueName(out, seen, canonicalName, limit);
  }

  return out.slice(0, limit);
}
