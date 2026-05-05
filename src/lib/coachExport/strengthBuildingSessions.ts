import type { Session, SetEntry, Track } from "../../db";

function sortRecentCompletedSessions(sessions: Session[]) {
  return (sessions ?? [])
    .filter((session) => !session.deletedAt && Number.isFinite(session.endedAt ?? session.startedAt))
    .slice()
    .sort(
      (a, b) => Number(b.endedAt ?? b.startedAt ?? 0) - Number(a.endedAt ?? a.startedAt ?? 0)
    );
}

function isStrengthBuildingTrackType(trackType: unknown) {
  const raw = String(trackType ?? "").trim().toLowerCase();
  return raw === "strength" || raw === "hypertrophy" || raw === "technique";
}

function hasMeaningfulCompletedWorkData(set: SetEntry) {
  if (set.completedAt && Number.isFinite(set.completedAt)) return true;
  if (typeof set.reps === "number" && Number.isFinite(set.reps) && set.reps > 0) return true;
  if (typeof set.seconds === "number" && Number.isFinite(set.seconds) && set.seconds > 0) return true;
  if (typeof set.weight === "number" && Number.isFinite(set.weight) && set.weight > 0) return true;
  if (typeof set.distance === "number" && Number.isFinite(set.distance) && set.distance > 0) return true;
  return false;
}

export function isStrengthBuildingSession(args: {
  session: Session;
  sets: SetEntry[];
  tracksById: Map<string, Track>;
}) {
  const { session, sets, tracksById } = args;
  return (sets ?? []).some((set) => {
    if (set.deletedAt) return false;
    if (set.sessionId !== session.id) return false;
    if (!hasMeaningfulCompletedWorkData(set)) return false;
    const track = tracksById.get(set.trackId);
    if (!track) return false;
    return isStrengthBuildingTrackType(track.trackType);
  });
}

export function selectRecentStrengthBuildingSessions(args: {
  sessions: Session[];
  sets: SetEntry[];
  tracks: Track[];
  limit: number;
}) {
  const tracksById = new Map((args.tracks ?? []).map((track) => [track.id, track]));
  return sortRecentCompletedSessions(args.sessions)
    .filter((session) =>
      isStrengthBuildingSession({
        session,
        sets: args.sets,
        tracksById,
      })
    )
    .slice(0, Math.max(0, Math.floor(args.limit)));
}
