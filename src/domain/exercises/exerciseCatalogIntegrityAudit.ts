import { normalizeName, type Exercise, type Track } from "../../db";

export type ExerciseCatalogIntegrityIssueType =
  | "alias_name_collision"
  | "alias_alias_collision"
  | "merged_missing_target"
  | "merged_archived_target"
  | "chained_redirect"
  | "merged_with_tracks"
  | "missing_strength_signal_role"
  | "missing_movement_pattern"
  | "anchor_metadata_gap";

export type ExerciseCatalogIntegritySeverity = "high" | "medium" | "low";

export type ExerciseCatalogIntegrityFindingRow = {
  exerciseId?: string;
  exerciseName?: string;
  relatedExerciseIds?: string[];
  relatedExerciseNames?: string[];
  key?: string;
  details: string;
};

export type ExerciseCatalogIntegrityFindingGroup = {
  type: ExerciseCatalogIntegrityIssueType;
  title: string;
  severity: ExerciseCatalogIntegritySeverity;
  description: string;
  rows: ExerciseCatalogIntegrityFindingRow[];
};

export type ExerciseCatalogIntegrityAudit = {
  groups: ExerciseCatalogIntegrityFindingGroup[];
  totalFindings: number;
  highFindings: number;
  mediumFindings: number;
  lowFindings: number;
};

const VALID_STRENGTH_SIGNAL_ROLES = new Set(["included", "secondary", "excluded"]);
const VALID_MOVEMENT_PATTERNS = new Set(["push", "pull", "hinge", "squat", "carry", "lunge"]);
const ANCHOR_ELIGIBLE_VALUES = new Set(["primary", "conditional"]);

function normalized(value: unknown): string {
  return normalizeName(String(value ?? ""));
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function isActiveExercise(exercise: Exercise): boolean {
  return !exercise.archivedAt && !(exercise as any).mergedIntoExerciseId;
}

function roleOf(exercise: Exercise): string {
  return text((exercise as any).strengthSignalRole).toLowerCase();
}

function movementOf(exercise: Exercise): string {
  return text((exercise as any).movementPattern).toLowerCase();
}

function anchorEligibilityOf(exercise: Exercise): string {
  return text((exercise as any).anchorEligibility).toLowerCase();
}

function hasAnchorSubtypes(exercise: Exercise): boolean {
  const subtypes = (exercise as any).anchorSubtypes;
  return Array.isArray(subtypes) && subtypes.some((value) => text(value));
}

function isLikelyStrengthRelevant(exercise: Exercise): boolean {
  const role = roleOf(exercise);
  const anchorEligibility = anchorEligibilityOf(exercise);
  return (
    role === "included" ||
    role === "secondary" ||
    ANCHOR_ELIGIBLE_VALUES.has(anchorEligibility)
  );
}

function makeGroup(
  type: ExerciseCatalogIntegrityIssueType,
  title: string,
  severity: ExerciseCatalogIntegritySeverity,
  description: string,
  rows: ExerciseCatalogIntegrityFindingRow[]
): ExerciseCatalogIntegrityFindingGroup | null {
  if (!rows.length) return null;
  return {
    type,
    title,
    severity,
    description,
    rows,
  };
}

export function buildExerciseCatalogIntegrityAudit(args: {
  exercises: Exercise[];
  tracks: Track[];
}): ExerciseCatalogIntegrityAudit {
  const exercises = Array.isArray(args.exercises) ? args.exercises.filter(Boolean) : [];
  const tracks = Array.isArray(args.tracks) ? args.tracks.filter(Boolean) : [];

  const exerciseById = new Map<string, Exercise>();
  const activeExercises: Exercise[] = [];
  const mergedExercises: Exercise[] = [];

  for (const exercise of exercises) {
    if (!exercise?.id) continue;
    exerciseById.set(exercise.id, exercise);
    if ((exercise as any).mergedIntoExerciseId) mergedExercises.push(exercise);
    else if (isActiveExercise(exercise)) activeExercises.push(exercise);
  }

  const activeNamesByKey = new Map<string, Exercise[]>();
  const activeAliasesByKey = new Map<string, Exercise[]>();

  for (const exercise of activeExercises) {
    const nameKey = normalized(exercise.normalizedName || exercise.name);
    if (nameKey) {
      const rows = activeNamesByKey.get(nameKey) ?? [];
      rows.push(exercise);
      activeNamesByKey.set(nameKey, rows);
    }

    const aliases = Array.isArray((exercise as any).aliases) ? (exercise as any).aliases : [];
    const seenAliasKeys = new Set<string>();
    for (const alias of aliases) {
      const aliasKey = normalized(alias);
      if (!aliasKey || seenAliasKeys.has(aliasKey)) continue;
      seenAliasKeys.add(aliasKey);
      const rows = activeAliasesByKey.get(aliasKey) ?? [];
      rows.push(exercise);
      activeAliasesByKey.set(aliasKey, rows);
    }
  }

  const aliasNameCollisionRows: ExerciseCatalogIntegrityFindingRow[] = [];
  for (const [key, aliasOwners] of activeAliasesByKey.entries()) {
    const nameOwners = (activeNamesByKey.get(key) ?? []).filter(
      (nameOwner) => !aliasOwners.some((aliasOwner) => aliasOwner.id === nameOwner.id)
    );
    if (!nameOwners.length) continue;
    aliasNameCollisionRows.push({
      key,
      relatedExerciseIds: [...aliasOwners, ...nameOwners].map((exercise) => exercise.id),
      relatedExerciseNames: [...aliasOwners, ...nameOwners].map((exercise) => exercise.name),
      details: `Alias "${key}" also matches active exercise name(s): ${nameOwners
        .map((exercise) => exercise.name)
        .join(", ")}.`,
    });
  }

  const aliasAliasCollisionRows: ExerciseCatalogIntegrityFindingRow[] = [];
  for (const [key, aliasOwners] of activeAliasesByKey.entries()) {
    if (aliasOwners.length <= 1) continue;
    aliasAliasCollisionRows.push({
      key,
      relatedExerciseIds: aliasOwners.map((exercise) => exercise.id),
      relatedExerciseNames: aliasOwners.map((exercise) => exercise.name),
      details: `Alias "${key}" appears on multiple active exercises: ${aliasOwners
        .map((exercise) => exercise.name)
        .join(", ")}.`,
    });
  }

  const missingTargetRows: ExerciseCatalogIntegrityFindingRow[] = [];
  const archivedTargetRows: ExerciseCatalogIntegrityFindingRow[] = [];
  const chainedRedirectRows: ExerciseCatalogIntegrityFindingRow[] = [];

  for (const exercise of mergedExercises) {
    const targetId = text((exercise as any).mergedIntoExerciseId);
    const target = targetId ? exerciseById.get(targetId) : undefined;
    if (!target) {
      missingTargetRows.push({
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        details: `Merged exercise points to missing canonical id "${targetId || "unknown"}".`,
      });
      continue;
    }

    if (target.archivedAt) {
      archivedTargetRows.push({
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        relatedExerciseIds: [target.id],
        relatedExerciseNames: [target.name],
        details: `Merged exercise redirects to archived canonical "${target.name}".`,
      });
    }

    const nextTargetId = text((target as any).mergedIntoExerciseId);
    if (nextTargetId) {
      const nextTarget = exerciseById.get(nextTargetId);
      chainedRedirectRows.push({
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        relatedExerciseIds: nextTarget ? [target.id, nextTarget.id] : [target.id],
        relatedExerciseNames: nextTarget ? [target.name, nextTarget.name] : [target.name],
        details: `Merged exercise redirects to "${target.name}", which redirects again${
          nextTarget ? ` to "${nextTarget.name}"` : ""
        }.`,
      });
    }
  }

  const trackCountByExerciseId = new Map<string, number>();
  for (const track of tracks) {
    const exerciseId = text((track as any).exerciseId);
    if (!exerciseId) continue;
    trackCountByExerciseId.set(exerciseId, (trackCountByExerciseId.get(exerciseId) ?? 0) + 1);
  }

  const mergedWithTracksRows = mergedExercises
    .map((exercise) => ({
      exercise,
      trackCount: trackCountByExerciseId.get(exercise.id) ?? 0,
    }))
    .filter((row) => row.trackCount > 0)
    .map(({ exercise, trackCount }) => ({
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      details: `Merged exercise still has ${trackCount} directly attached track(s).`,
    }));

  const missingRoleRows = activeExercises
    .filter((exercise) => !VALID_STRENGTH_SIGNAL_ROLES.has(roleOf(exercise)))
    .map((exercise) => ({
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      details: "Active exercise is missing a valid strengthSignalRole.",
    }));

  const missingMovementRows = activeExercises
    .filter((exercise) => isLikelyStrengthRelevant(exercise))
    .filter((exercise) => !VALID_MOVEMENT_PATTERNS.has(movementOf(exercise)))
    .map((exercise) => ({
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      details: "Likely strength-relevant active exercise is missing a valid movementPattern.",
    }));

  const anchorMetadataGapRows = activeExercises
    .filter((exercise) => ANCHOR_ELIGIBLE_VALUES.has(anchorEligibilityOf(exercise)))
    .filter((exercise) => !hasAnchorSubtypes(exercise))
    .map((exercise) => ({
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      details: "Anchor-eligible exercise has no anchorSubtypes.",
    }));

  const groups = [
    makeGroup(
      "alias_name_collision",
      "Alias Matches Active Name",
      "high",
      "An alias on one active exercise matches another active exercise name.",
      aliasNameCollisionRows
    ),
    makeGroup(
      "alias_alias_collision",
      "Alias Used By Multiple Exercises",
      "high",
      "The same alias is attached to more than one active exercise.",
      aliasAliasCollisionRows
    ),
    makeGroup(
      "merged_missing_target",
      "Merged Redirect Missing Target",
      "high",
      "A merged exercise points to a canonical exercise id that no longer exists.",
      missingTargetRows
    ),
    makeGroup(
      "merged_archived_target",
      "Merged Redirect To Archived Target",
      "high",
      "A merged exercise points to a canonical exercise that is archived.",
      archivedTargetRows
    ),
    makeGroup(
      "chained_redirect",
      "Chained Redirect",
      "medium",
      "A merged exercise points to another merged exercise instead of a final canonical exercise.",
      chainedRedirectRows
    ),
    makeGroup(
      "merged_with_tracks",
      "Merged Exercise Still Has Tracks",
      "high",
      "A merged exercise still has tracks directly attached, which can fragment history.",
      mergedWithTracksRows
    ),
    makeGroup(
      "missing_strength_signal_role",
      "Missing Strength Signal Role",
      "medium",
      "An active exercise is missing explicit strength contribution authority.",
      missingRoleRows
    ),
    makeGroup(
      "missing_movement_pattern",
      "Missing Movement Pattern",
      "medium",
      "A conservatively detected strength-relevant exercise is missing movement pattern metadata.",
      missingMovementRows
    ),
    makeGroup(
      "anchor_metadata_gap",
      "Anchor Metadata Gap",
      "low",
      "An anchor-eligible exercise is missing anchor subtype metadata.",
      anchorMetadataGapRows
    ),
  ].filter((group): group is ExerciseCatalogIntegrityFindingGroup => !!group);

  const totalFindings = groups.reduce((sum, group) => sum + group.rows.length, 0);

  return {
    groups,
    totalFindings,
    highFindings: groups
      .filter((group) => group.severity === "high")
      .reduce((sum, group) => sum + group.rows.length, 0),
    mediumFindings: groups
      .filter((group) => group.severity === "medium")
      .reduce((sum, group) => sum + group.rows.length, 0),
    lowFindings: groups
      .filter((group) => group.severity === "low")
      .reduce((sum, group) => sum + group.rows.length, 0),
  };
}
