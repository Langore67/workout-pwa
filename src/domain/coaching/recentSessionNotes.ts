import { db, type Exercise, type Session, type SetEntry, type Track } from "../../db";
import { extractHumanSetNoteText } from "../sets/performedSetIntent";

export const RECENT_SESSION_NOTES_DEFAULT_DAYS = 21;
export const DAY_MS = 24 * 60 * 60 * 1000;

export type RecentSessionNoteEvidence = {
  evidenceId: string;
  occurredAt: number;
  sessionId: string;
  sessionName: string;
  sourceKind: "session_note" | "set_note";
  rawText: string;
  trackId?: string;
  exerciseId?: string;
  exerciseName?: string;
  setId?: string;
  setContext?: {
    setType?: SetEntry["setType"];
    setNumber?: number;
    weight?: number;
    reps?: number;
    rir?: number;
    seconds?: number;
    distance?: number;
    distanceUnit?: SetEntry["distanceUnit"];
  };
};

export type RecentSessionNotesSource = {
  sessions: readonly Session[];
  sets: readonly SetEntry[];
  tracks: readonly Track[];
  exercises: readonly Exercise[];
};

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function compareEvidence(a: RecentSessionNoteEvidence, b: RecentSessionNoteEvidence) {
  if (a.occurredAt !== b.occurredAt) return b.occurredAt - a.occurredAt;
  return a.evidenceId.localeCompare(b.evidenceId);
}

/**
 * Builds raw, completed-session note evidence without modifying its inputs.
 * The bounds are inclusive. Session prose is intentionally never linked to an
 * exercise; set evidence only receives relationships present in stored rows.
 */
export function buildRecentSessionNoteEvidence(
  source: RecentSessionNotesSource,
  options: { now?: number; days?: number | null } = {}
): RecentSessionNoteEvidence[] {
  const now = options.now ?? Date.now();
  const days = options.days === undefined ? RECENT_SESSION_NOTES_DEFAULT_DAYS : options.days;
  const cutoff = days === null ? Number.NEGATIVE_INFINITY : now - days * DAY_MS;
  const sessions = source.sessions.filter((session) => {
    const endedAt = Number(session.endedAt);
    return (
      !session.deletedAt &&
      Number.isFinite(endedAt) &&
      endedAt >= cutoff &&
      endedAt <= now
    );
  });
  const sessionById = new Map(sessions.map((session) => [session.id, session]));
  const trackById = new Map(source.tracks.map((track) => [track.id, track]));
  const exerciseById = new Map(source.exercises.map((exercise) => [exercise.id, exercise]));
  const evidence: RecentSessionNoteEvidence[] = [];

  for (const session of sessions) {
    if (!hasText(session.notes)) continue;
    evidence.push({
      evidenceId: `session:${session.id}`,
      occurredAt: session.endedAt as number,
      sessionId: session.id,
      sessionName: session.templateName?.trim() || "Ad-hoc",
      sourceKind: "session_note",
      rawText: session.notes,
    });
  }

  const eligibleSets = source.sets
    .filter((set) => !set.deletedAt && sessionById.has(set.sessionId))
    .slice()
    .sort((a, b) => {
      if (a.sessionId !== b.sessionId) return a.sessionId.localeCompare(b.sessionId);
      if (a.trackId !== b.trackId) return a.trackId.localeCompare(b.trackId);
      if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
      return a.id.localeCompare(b.id);
    });
  const setCountByTrackAndType = new Map<string, number>();

  for (const set of eligibleSets) {
    const ordinalKey = `${set.sessionId}:${set.trackId}:${set.setType}`;
    const setNumber = (setCountByTrackAndType.get(ordinalKey) ?? 0) + 1;
    setCountByTrackAndType.set(ordinalKey, setNumber);
    const humanNote = extractHumanSetNoteText(set.notes);
    if (!humanNote) continue;

    const session = sessionById.get(set.sessionId)!;
    const track = trackById.get(set.trackId);
    const exercise = track ? exerciseById.get(track.exerciseId) : undefined;
    evidence.push({
      evidenceId: `set:${set.id}`,
      occurredAt: session.endedAt as number,
      sessionId: session.id,
      sessionName: session.templateName?.trim() || "Ad-hoc",
      sourceKind: "set_note",
      rawText: humanNote,
      trackId: set.trackId,
      exerciseId: track?.exerciseId,
      exerciseName: exercise?.name || track?.displayName,
      setId: set.id,
      setContext: {
        setType: set.setType,
        setNumber,
        weight: set.weight,
        reps: set.reps,
        rir: set.rir,
        seconds: set.seconds,
        distance: set.distance,
        distanceUnit: set.distanceUnit,
      },
    });
  }

  return evidence.sort(compareEvidence);
}

export async function queryRecentSessionNoteEvidence(
  options: { now?: number; days?: number | null } = {}
): Promise<RecentSessionNoteEvidence[]> {
  const now = options.now ?? Date.now();
  const days = options.days === undefined ? RECENT_SESSION_NOTES_DEFAULT_DAYS : options.days;
  const sessionsInWindow = days === null
    ? await db.sessions.where("endedAt").above(0).toArray()
    : await db.sessions.where("endedAt").between(now - days * DAY_MS, now, true, true).toArray();
  const sessions = sessionsInWindow.filter(
    (session) => Number(session.endedAt) <= now
  ).filter(
    (session) => !session.deletedAt
  );
  const sessionIds = sessions.map((session) => session.id);
  if (!sessionIds.length) {
    return [];
  }

  const sets = (await db.sets.where("sessionId").anyOf(sessionIds).toArray()).filter((set) => !set.deletedAt);
  const trackIds = Array.from(new Set(sets.map((set) => set.trackId).filter(Boolean)));
  const tracks = (await db.tracks.bulkGet(trackIds)).filter(Boolean) as Track[];
  const exerciseIds = Array.from(new Set(tracks.map((track) => track.exerciseId).filter(Boolean)));
  const exercises = (await db.exercises.bulkGet(exerciseIds)).filter(Boolean) as Exercise[];

  return buildRecentSessionNoteEvidence(
    { sessions, sets, tracks, exercises },
    { now, days }
  );
}
