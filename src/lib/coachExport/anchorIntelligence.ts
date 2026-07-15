import type { Exercise, Session, SetEntry, Track } from "../../db";
import { getCanonicalExerciseNormalizedName } from "../../domain/exercises/exerciseAliasMap";
import type { StrengthPattern } from "../../strength/Strength";
import { selectRecentStrengthBuildingSessions } from "./strengthBuildingSessions";
import type {
  AnchorMovementFamily,
  CoachExportAnchorCurrentMovement,
  CoachExportAnchorLift,
  CoachExportAnchorRelationship,
  CoachExportAnchorStatus,
  PerformanceBenchmarkStatus,
  AnchorMovementStatus,
} from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_WINDOW_DAYS = 28;

type MovementOccurrence = CoachExportAnchorCurrentMovement & {
  canonicalName: string;
  sessionId: string;
};

function normalizeText(value: string | null | undefined) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeLookupKey(value: string | null | undefined) {
  return getCanonicalExerciseNormalizedName(normalizeText(value)) ?? normalizeText(value).toLowerCase();
}

function isAnchorRelevantTrackType(trackType: unknown) {
  const raw = String(trackType ?? "").trim().toLowerCase();
  return raw === "strength" || raw === "hypertrophy" || raw === "technique";
}

function legacyPatternToFamily(pattern: StrengthPattern | null | undefined): AnchorMovementFamily {
  if (pattern === "push") return "horizontal_push";
  if (pattern === "pull") return "vertical_pull";
  if (pattern === "hinge") return "hinge";
  if (pattern === "squat") return "squat";
  return "unknown";
}

export function classifyAnchorMovementFamily(
  exerciseName: string | null | undefined,
  legacyPattern?: StrengthPattern | null
): AnchorMovementFamily {
  const text = normalizeLookupKey(exerciseName);
  if (!text) return legacyPatternToFamily(legacyPattern);

  if (/\b(?:carry|farmer|suitcase)\b/.test(text)) return "carry";
  if (/\b(?:plank|dead bug|pallof|roman chair|cable crunch|anti[-\s]?rotation|core)\b/.test(text)) return "core";
  if (/\b(?:assisted pull up|assisted pull-up|pull up|pull-up|chin up|chin-up|lat pulldown|lat pull down)\b/.test(text)) {
    return "vertical_pull";
  }
  if (/\b(?:mts row|seated row|cable row|chest[-\s]?supported row|db row|3[-\s]?point row|machine row|row)\b/.test(text)) {
    return "horizontal_pull";
  }
  if (/\b(?:bench press|chest press|machine chest press|push[-\s]?up|pushup|incline)\b/.test(text)) {
    return "horizontal_push";
  }
  if (/\b(?:overhead press|shoulder press|military press)\b/.test(text)) {
    return "vertical_push";
  }
  if (/\b(?:glute bridge|hip thrust)\b/.test(text)) return "glute_extension";
  if (
    /\b(?:trap bar deadlift|deadlift|rdl|romanian deadlift|good morning|hip hinge|back extension)\b/.test(text)
  ) {
    return "hinge";
  }
  if (/\b(?:single[-\s]?leg|bulgarian split squat|step[-\s]?up|lunge|split squat)\b/.test(text)) {
    return "single_leg";
  }
  if (/\b(?:leg press|squat|hack squat|leg extension)\b/.test(text)) {
    return "squat";
  }

  return legacyPatternToFamily(legacyPattern);
}

export function formatAnchorMovementFamilyLabel(family: AnchorMovementFamily | null | undefined) {
  switch (family) {
    case "horizontal_push":
      return "Horizontal Push";
    case "vertical_push":
      return "Vertical Push";
    case "horizontal_pull":
      return "Horizontal Pull";
    case "vertical_pull":
      return "Vertical Pull";
    case "hinge":
      return "Hinge";
    case "squat":
      return "Squat";
    case "single_leg":
      return "Single Leg";
    case "glute_extension":
      return "Glute Extension";
    case "carry":
      return "Carry";
    case "core":
      return "Core";
    default:
      return "Unknown";
  }
}

export function formatAnchorStatusLabel(status: CoachExportAnchorStatus | undefined, recency?: string | null) {
  if (status === "missing_date") return "Date unavailable";
  if (status === "current_recent") return "Current";
  if (status === "historical_anchor") return "Historical anchor";
  if (status === "stale_anchor") return "Stale anchor";
  const normalized = String(recency ?? "").trim().toLowerCase();
  if (normalized === "recent") return "Current";
  if (normalized === "historical") return "Historical anchor";
  if (normalized === "stale") return "Stale anchor";
  return "Unknown";
}

export function formatAnchorRelationshipLabel(
  relationship: CoachExportAnchorRelationship | undefined
) {
  switch (relationship) {
    case "same_exercise":
      return "Same exercise";
    case "same_family_different_exercise":
      return "Same movement family";
    case "different_family":
      return "Different family";
    case "benchmark_only":
      return "Benchmark only";
    case "family_only":
      return "Family movement only";
    case "same_exercise_current":
    case "same_exercise_and_family_current":
      return "Same exercise";
    default:
      return "Relationship unknown";
  }
}

function hasMeaningfulWorkPayload(set: SetEntry) {
  if (set.deletedAt) return false;
  const setType = String((set as any)?.setType ?? "").trim().toLowerCase();
  if (setType === "warmup" || setType === "warm-up" || setType === "warm up") return false;
  if (typeof set.weight === "number" && Number.isFinite(set.weight) && set.weight > 0) return true;
  if (typeof set.reps === "number" && Number.isFinite(set.reps) && set.reps > 0) return true;
  if (typeof set.seconds === "number" && Number.isFinite(set.seconds) && set.seconds > 0) return true;
  if (typeof set.distance === "number" && Number.isFinite(set.distance) && set.distance > 0) return true;
  return Number.isFinite(Number(set.completedAt ?? set.createdAt ?? 0));
}

function setTime(set: SetEntry) {
  return Number(set.completedAt ?? set.createdAt ?? 0);
}

function buildRecentMovementLookup(args: {
  sessions: Session[];
  sets: SetEntry[];
  tracks: Track[];
  exercises: Exercise[];
  asOf: number;
}) {
  const recentSessions = selectRecentStrengthBuildingSessions({
    sessions: args.sessions,
    sets: args.sets,
    tracks: args.tracks,
    limit: 8,
    asOf: args.asOf,
    maxAgeDays: RECENT_WINDOW_DAYS,
  });
  const recentSessionIds = new Set(recentSessions.map((session) => session.id));
  const tracksById = new Map((args.tracks ?? []).map((track) => [track.id, track]));
  const exercisesById = new Map((args.exercises ?? []).map((exercise) => [exercise.id, exercise]));
  const byFamily = new Map<AnchorMovementFamily, MovementOccurrence>();
  const byExercise = new Map<string, MovementOccurrence>();

  for (const session of recentSessions) {
    const sessionSets = (args.sets ?? [])
      .filter((set) => !set.deletedAt && recentSessionIds.has(set.sessionId) && set.sessionId === session.id)
      .slice()
      .sort((a, b) => setTime(b) - setTime(a));

    for (const set of sessionSets) {
      if (!hasMeaningfulWorkPayload(set)) continue;
      const track = tracksById.get(set.trackId);
      if (!track || !isAnchorRelevantTrackType(track.trackType)) continue;
      const exercise = track.exerciseId ? exercisesById.get(track.exerciseId) : undefined;
      const exerciseName = normalizeText(exercise?.name ?? track.displayName ?? "");
      if (!exerciseName) continue;

      const movementFamily = classifyAnchorMovementFamily(exerciseName);
      if (movementFamily === "unknown") continue;

      const performedAt = Number(set.completedAt ?? set.createdAt ?? session.endedAt ?? session.startedAt ?? 0);
      if (!Number.isFinite(performedAt) || performedAt <= 0) continue;

      const ageDays = Math.floor(Math.max(0, args.asOf - performedAt) / DAY_MS);
      const candidate: MovementOccurrence = {
        exerciseName,
        movementFamily,
        performedAt,
        ageDays,
        canonicalName: normalizeLookupKey(exerciseName),
        sessionId: session.id,
      };

      const existing = byFamily.get(movementFamily);
      const candidatePerformedAt =
        typeof candidate.performedAt === "number" && Number.isFinite(candidate.performedAt)
          ? candidate.performedAt
          : null;
      const existingPerformedAt =
        typeof existing?.performedAt === "number" && Number.isFinite(existing.performedAt)
          ? existing.performedAt
          : null;
      if (!existing || (candidatePerformedAt != null && (existingPerformedAt == null || candidatePerformedAt > existingPerformedAt))) {
        byFamily.set(movementFamily, candidate);
      }
      const existingExercise = byExercise.get(candidate.canonicalName);
      const existingExerciseAt =
        typeof existingExercise?.performedAt === "number" && Number.isFinite(existingExercise.performedAt)
          ? existingExercise.performedAt
          : null;
      if (!existingExercise || (candidatePerformedAt != null && (existingExerciseAt == null || candidatePerformedAt > existingExerciseAt))) {
        byExercise.set(candidate.canonicalName, candidate);
      }
    }
  }

  return { byFamily, byExercise };
}

function resolveBenchmarkStatus(ageDays: number | null | undefined): PerformanceBenchmarkStatus {
  if (!Number.isFinite(ageDays as number)) return "missing_date";
  const days = Math.max(0, Math.floor(Number(ageDays)));
  if (days <= 21) return "recent";
  if (days <= 28) return "historical";
  return "stale";
}

function legacyStatusFromBenchmarkStatus(status: PerformanceBenchmarkStatus): CoachExportAnchorStatus {
  if (status === "missing_date") return "missing_date";
  if (status === "recent") return "current_recent";
  if (status === "historical") return "historical_anchor";
  return "stale_anchor";
}

function movementStatusFromSameExercise(latestSameExercise?: MovementOccurrence | null): AnchorMovementStatus {
  if (!latestSameExercise) return "inactive";
  const days = Number(latestSameExercise.ageDays);
  if (!Number.isFinite(days)) return "unknown";
  if (days <= 7) return "current";
  if (days <= RECENT_WINDOW_DAYS) return "recent";
  return "inactive";
}

function relationshipForAnchor(args: {
  anchorName: string | null | undefined;
  currentMovement?: MovementOccurrence | null;
  movementFamily: AnchorMovementFamily;
}) {
  if (!args.currentMovement) return "unknown" as const;
  const anchorCanonical = normalizeLookupKey(args.anchorName);
  if (anchorCanonical && anchorCanonical === args.currentMovement.canonicalName) return "same_exercise" as const;
  if (args.currentMovement.movementFamily === args.movementFamily) return "same_family_different_exercise" as const;
  return "different_family" as const;
}

function interpretationForAnchor(args: {
  anchor: CoachExportAnchorLift;
  familyLabel: string;
  status: CoachExportAnchorStatus;
  benchmarkStatus: PerformanceBenchmarkStatus;
  movementStatus: AnchorMovementStatus;
  latestSameExercise?: MovementOccurrence | null;
  latestFamilyMovement?: MovementOccurrence | null;
  relationship: CoachExportAnchorRelationship;
}) {
  const anchorName = normalizeText(args.anchor.exerciseName ?? args.anchor.trackDisplayName ?? "Unknown");
  const familyName = args.familyLabel.toLowerCase();
  const benchmarkText =
    args.benchmarkStatus === "stale"
      ? "stale"
      : args.benchmarkStatus === "historical"
        ? "historical"
        : args.benchmarkStatus === "recent"
          ? "recent"
          : "date-unconfirmed";
  if (args.benchmarkStatus === "missing_date") {
    return "Performance benchmark recency could not be confirmed.";
  }
  if (args.latestSameExercise && args.latestFamilyMovement && args.latestSameExercise.exerciseName !== args.latestFamilyMovement.exerciseName) {
    return `${anchorName} remains ${args.movementStatus === "current" ? "current" : "recently trained"}. ${args.latestFamilyMovement.exerciseName} is the latest ${familyName} variation. The recorded performance benchmark is ${benchmarkText}.`;
  }
  if (args.latestSameExercise) {
    return `${anchorName} is ${args.movementStatus === "current" ? "current" : "recently trained"}, while the recorded performance benchmark is ${benchmarkText}.`;
  }
  if (args.latestFamilyMovement) {
    return `The ${benchmarkText} benchmark is ${anchorName}. Current ${familyName} work uses ${args.latestFamilyMovement.exerciseName}.`;
  }
  return `The performance benchmark is ${benchmarkText}, and no recent movement in this family was found.`;
}

export function buildAnchorIntelligence(args: {
  anchors: CoachExportAnchorLift[];
  sessions: Session[];
  sets: SetEntry[];
  tracks: Track[];
  exercises: Exercise[];
  asOf: number;
}): CoachExportAnchorLift[] {
  const currentMovements = buildRecentMovementLookup(args);

  return (args.anchors ?? []).map((anchor) => {
    const movementFamily = classifyAnchorMovementFamily(anchor.exerciseName ?? anchor.trackDisplayName ?? "", anchor.pattern);
    const benchmarkStatus = resolveBenchmarkStatus(anchor.ageDays);
    const status = legacyStatusFromBenchmarkStatus(benchmarkStatus);
    const latestFamilyMovement = currentMovements.byFamily.get(movementFamily) ?? null;
    const latestSameExercise = currentMovements.byExercise.get(normalizeLookupKey(anchor.exerciseName ?? anchor.trackDisplayName)) ?? null;
    const movementStatus = movementStatusFromSameExercise(latestSameExercise);
    const currentMovement = latestFamilyMovement;
    const relationship = relationshipForAnchor({
      anchorName: anchor.exerciseName ?? anchor.trackDisplayName,
      currentMovement: latestFamilyMovement,
      movementFamily,
    });
    const familyLabel = formatAnchorMovementFamilyLabel(movementFamily);

    return {
      ...anchor,
      movementFamily,
      status,
      benchmarkStatus,
      movementStatus,
      latestSameExercise:
        latestSameExercise
          ? {
              exerciseName: latestSameExercise.exerciseName,
              movementFamily: latestSameExercise.movementFamily,
              performedAt: latestSameExercise.performedAt,
              ageDays: latestSameExercise.ageDays,
            }
          : undefined,
      latestFamilyMovement:
        latestFamilyMovement
          ? {
              exerciseName: latestFamilyMovement.exerciseName,
              movementFamily: latestFamilyMovement.movementFamily,
              performedAt: latestFamilyMovement.performedAt,
              ageDays: latestFamilyMovement.ageDays,
            }
          : undefined,
      currentMovement:
        currentMovement && relationship !== "unknown"
          ? {
              exerciseName: currentMovement.exerciseName,
              movementFamily: currentMovement.movementFamily,
              performedAt: currentMovement.performedAt,
              ageDays: currentMovement.ageDays,
            }
          : undefined,
      relationship,
      interpretation: interpretationForAnchor({
        anchor,
        familyLabel,
        status,
        benchmarkStatus,
        movementStatus,
        latestSameExercise,
        latestFamilyMovement,
        relationship,
      }),
    };
  });
}
