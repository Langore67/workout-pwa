import type { Exercise, Session, SetEntry, Track } from "../../db";
import type { CoachExportCurrentMovementFocus } from "./types";
import { selectRecentStrengthBuildingSessions } from "./strengthBuildingSessions";

type CandidateSource = "recent_session";

type Candidate = {
  name: string;
  source: CandidateSource;
  sourceSessionId?: string;
  lastSeenAt?: number;
};

const CATEGORY_ORDER = ["Pull", "Push", "Hinge", "Squat / Legs", "Carry", "Core"] as const;
type MovementFocusCategory = (typeof CATEGORY_ORDER)[number];

function normalizedName(value: string) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function isBroadLabel(name: string) {
  return /^(pull|push|hinge|squat|legs|carry|core|movement|mobility|corrective)$/i.test(normalizedName(name));
}

function isMeaningfulMovementName(name: string) {
  const text = normalizedName(name).toLowerCase();
  if (!text || isBroadLabel(text)) return false;
  if (/\b(?:warm ?up|mobility|corrective|activation|prep|stretch|cool ?down|breathing)\b/i.test(text)) return false;
  return true;
}

function classifyMovementCategory(name: string): MovementFocusCategory | null {
  const text = normalizedName(name).toLowerCase();
  if (!text || !isMeaningfulMovementName(text)) return null;
  if (/\b(?:carry|farmer|suitcase)\b/i.test(text)) return "Carry";
  if (/\b(?:deadlift|single[-\s]?leg rdl|romanian deadlift|rdl|hip hinge|hinge|good morning|back extension|glute bridge|hip thrust|trap bar deadlift)\b/i.test(text)) {
    return "Hinge";
  }
  if (/\b(?:bench|press|fly|pushdown|tricep|overhead|incline|push[-\s]?up|pushup|chest press)\b/i.test(text)) {
    return "Push";
  }
  if (/\b(?:squat|leg press|lunge|step up|step[-\s]?up|leg curl|calf|adductor|leg extension|split squat|bulgarian)\b/i.test(text)) {
    return "Squat / Legs";
  }
  if (/\b(?:plank|dead bug|pallof|roman chair|ab wheel|crunch|rotation|anti[-\s]?rotation|core)\b/i.test(text)) {
    return "Core";
  }
  if (/\b(?:row|pull[-\s]?up|pulldown|pullover|lat|reverse pec deck|face pull|high row|cable row|machine row|chest[-\s]?supported row|mts row)\b/i.test(text)) {
    return "Pull";
  }
  return null;
}

function pushUniqueCandidate(list: Candidate[], seen: Map<string, Candidate>, candidate: Candidate) {
  const name = normalizedName(candidate.name);
  if (!name || !isMeaningfulMovementName(name)) return;
  const key = name.toLowerCase();
  const existing = seen.get(key);
  if (existing) {
    const existingPriority = sourcePriority(existing.source);
    const incomingPriority = sourcePriority(candidate.source);
    const existingSeenAt = existing.lastSeenAt ?? -Infinity;
    const incomingSeenAt = candidate.lastSeenAt ?? -Infinity;
    if (
      incomingPriority > existingPriority ||
      (incomingPriority === existingPriority && incomingSeenAt > existingSeenAt)
    ) {
      existing.source = candidate.source;
      existing.sourceSessionId = candidate.sourceSessionId ?? existing.sourceSessionId;
      existing.lastSeenAt = candidate.lastSeenAt ?? existing.lastSeenAt;
    }
    return;
  }

  const entry = { ...candidate, name };
  list.push(entry);
  seen.set(key, entry);
}

function exerciseNameForTrack(exercisesById: Map<string, Exercise>, track: Track): string | null {
  if (!track?.exerciseId) return null;
  const exercise = exercisesById.get(track.exerciseId);
  if (!exercise || exercise.archivedAt || exercise.mergedIntoExerciseId) return null;
  const name = normalizedName(exercise.name);
  return name || null;
}

function collectCandidates(args: {
  sessions: Session[];
  sets: SetEntry[];
  tracks: Track[];
  exercises: Exercise[];
  asOf?: number;
}) {
  const tracksById = new Map((args.tracks ?? []).map((track) => [track.id, track]));
  const exercisesById = new Map((args.exercises ?? []).map((exercise) => [exercise.id, exercise]));
  const recentSessions = selectRecentStrengthBuildingSessions({
    sessions: args.sessions,
    sets: args.sets,
    tracks: args.tracks,
    limit: 6,
    asOf: args.asOf,
    maxAgeDays: 28,
  });

  const candidatesByCategory = new Map<MovementFocusCategory, Candidate[]>(
    CATEGORY_ORDER.map((category) => [category, []])
  );

  const seenByCategory = new Map<MovementFocusCategory, Map<string, Candidate>>(
    CATEGORY_ORDER.map((category) => [category, new Map<string, Candidate>()])
  );

  function addCandidate(category: MovementFocusCategory | null, candidate: Candidate) {
    if (!category) return;
    const bucket = candidatesByCategory.get(category);
    const seen = seenByCategory.get(category);
    if (!bucket || !seen) return;
    pushUniqueCandidate(bucket, seen, candidate);
  }

  for (const session of recentSessions) {
    const sessionSets = (args.sets ?? [])
      .filter((set) => !set.deletedAt && set.sessionId === session.id)
      .slice()
      .sort((a, b) => Number(a.createdAt ?? a.completedAt ?? 0) - Number(b.createdAt ?? b.completedAt ?? 0));

    for (const set of sessionSets) {
      const track = tracksById.get(set.trackId);
      if (!track) continue;
      const name = exerciseNameForTrack(exercisesById, track);
      if (!name) continue;
      addCandidate(classifyMovementCategory(name), {
        name,
        source: "recent_session",
        sourceSessionId: session.id,
        lastSeenAt: session.endedAt ?? session.startedAt ?? undefined,
      });
    }
  }

  return candidatesByCategory;
}

function sourcePriority(source: CandidateSource) {
  if (source === "coaching_memory") return 3;
  if (source === "recent_session") return 2;
  if (source === "exercise_vocabulary") return 1;
  return 0;
}

export function buildCurrentMovementFocus(args: {
  sessions: Session[];
  sets: SetEntry[];
  tracks: Track[];
  exercises: Exercise[];
  exerciseVocabulary: string[];
  coachingMemory?: unknown;
  anchorLifts: unknown[];
  asOf?: number;
}): CoachExportCurrentMovementFocus {
  void args.exerciseVocabulary;
  void args.coachingMemory;
  void args.anchorLifts;
  const candidatesByCategory = collectCandidates(args);

  return CATEGORY_ORDER.flatMap((category) => {
    const values = candidatesByCategory.get(category) ?? [];
    if (!values.length) return [];
    const sorted = values
      .slice()
      .sort((a, b) => {
        const sourceDelta = sourcePriority(b.source) - sourcePriority(a.source);
        if (sourceDelta) return sourceDelta;
        const dateDelta = (b.lastSeenAt ?? -Infinity) - (a.lastSeenAt ?? -Infinity);
        if (dateDelta) return dateDelta;
        return a.name.localeCompare(b.name);
      })
      .slice(0, 5);
    return [
      {
        label: category,
        exercises: sorted.map((item) => item.name),
      },
    ];
  });
}
