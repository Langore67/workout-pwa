import type { Exercise, Session, SetEntry, Track } from "../../db";
import type { CoachExportAnchorLift } from "./types";
import { selectRecentStrengthBuildingSessions } from "./strengthBuildingSessions";

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
  const recentSessions = selectRecentStrengthBuildingSessions({
    sessions: args.sessions,
    sets: args.sets,
    tracks: args.tracks,
    limit: 8,
  });
  const recentSessionIds = new Set(recentSessions.map((session) => session.id));
  const setsBySessionId = new Map<string, SetEntry[]>();

  for (const set of args.sets ?? []) {
    if (set.deletedAt || !recentSessionIds.has(set.sessionId)) continue;
    const bucket = setsBySessionId.get(set.sessionId) ?? [];
    bucket.push(set);
    setsBySessionId.set(set.sessionId, bucket);
  }

  for (const session of recentSessions) {
    if (out.length >= limit) break;
    const orderedSets = (setsBySessionId.get(session.id) ?? []).slice().sort((a, b) => {
      const aTime = Number(a.createdAt ?? a.completedAt ?? 0);
      const bTime = Number(b.createdAt ?? b.completedAt ?? 0);
      return aTime - bTime;
    });

    for (const set of orderedSets) {
      if (out.length >= limit) break;
      const track = tracksById.get(set.trackId);
      if (!track?.exerciseId) continue;
      const canonicalName = activeCanonicalExerciseName(exercisesById.get(track.exerciseId));
      if (!canonicalName) continue;
      pushUniqueName(out, seen, canonicalName, limit);
    }
  }

  return out.slice(0, limit);
}
