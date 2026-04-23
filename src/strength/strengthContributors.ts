/* ============================================================================
   strengthContributors.ts
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-04-23-STRENGTH-CONTRIBUTORS-01
   FILE: src/strength/strengthContributors.ts

   Purpose
   - Centralize Performance movement contributor scoring without behavior change
   - Preserve existing 28-day working-set contributor math
   - Preserve current secondary-role weighting and fallback movement classification
   - Return the same by-movement contributor shape currently consumed by Performance

   Notes
   - This is a pure extraction from PerformanceDashboardPage.tsx
   - No math changes intended in this slice
   - Keep helper self-contained so page-level business logic can be reduced safely
   ============================================================================ */

import {
  calcEffectiveStrengthWeightLb,
  computeScoredE1RM,
} from "./Strength";
import { classifyStrengthPattern } from "../domain/exercises/strengthPatternClassifier";
import {
  buildExerciseResolverIndex,
  resolveExerciseFromIndex,
} from "../domain/exercises/exerciseResolver";
import {
  type Exercise,
  type Session,
  type SetEntry,
  type Track,
} from "../db";

const DAY_MS = 24 * 60 * 60 * 1000;
const SECONDARY_STRENGTH_WORKING_MULTIPLIER = 0.6;

export type StrengthContributorMovement = "push" | "pull" | "squat" | "hinge";

export type StrengthContributorItem = {
  label: string;
  score: number;
};

export type StrengthContributorMap = Record<
  StrengthContributorMovement,
  StrengthContributorItem[]
>;

export type StrengthContributorSource = {
  sessions: Session[];
  sets: SetEntry[];
  tracks: Track[];
  exercises: Exercise[];
};

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function avgTopN(values: number[], count: number) {
  const clean = values
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => b - a)
    .slice(0, count);

  if (!clean.length) return 0;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function defaultFormatLabel(value: string) {
  if (!value) return "";

  return value
    .replace(/\s+[—-]\s*hypertrophy\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildStrengthPatternContributors(
  source: StrengthContributorSource | null,
  bodyweight: number,
  options?: {
    nowMs?: number;
    formatLabel?: (value: string) => string;
  }
): StrengthContributorMap {
  const empty: StrengthContributorMap = {
    squat: [],
    hinge: [],
    push: [],
    pull: [],
  };

  if (!source) return empty;

  const now = Number(options?.nowMs ?? Date.now());
  const cutoff = now - 28 * DAY_MS;
  const formatLabel = options?.formatLabel ?? defaultFormatLabel;

  const sessionIds = new Set(
    (source.sessions ?? [])
      .filter((session) => {
        const endedAt = Number(session.endedAt);
        return Number.isFinite(endedAt) && endedAt >= cutoff && endedAt <= now;
      })
      .map((session) => session.id)
  );

  if (!sessionIds.size) return empty;

  const trackById = new Map((source.tracks ?? []).map((track) => [track.id, track]));
  const exerciseById = new Map(
    (source.exercises ?? []).map((exercise) => [exercise.id, exercise])
  );
  const resolverIndex = buildExerciseResolverIndex(source.exercises ?? []);

  const contributors = new Map<
    string,
    {
      label: string;
      movement: StrengthContributorMovement;
      top: number;
      working: number[];
      completedWorkingSets: number;
    }
  >();

  for (const set of source.sets ?? []) {
    if (!sessionIds.has(set.sessionId)) continue;
    if (set.setType !== "working") continue;
    if (!set.completedAt || Number(set.completedAt) > now) continue;
    if (typeof set.weight !== "number" || typeof set.reps !== "number") continue;

    const track = trackById.get(set.trackId);
    if (!track?.exerciseId) continue;

    const exercise = exerciseById.get(track.exerciseId);
    const exerciseName = String(
      exercise?.name ?? track.displayName ?? exercise?.normalizedName ?? ""
    ).trim();

    const resolvedExercise = resolveExerciseFromIndex(
      {
        rawName: exerciseName || track.displayName || "",
        allowAlias: true,
        followMerged: true,
      },
      resolverIndex
    );

    const canonicalExercise =
      resolvedExercise.canonicalExercise ?? resolvedExercise.exercise ?? exercise ?? null;

    const canonicalLabel = String(
      canonicalExercise?.name ??
        canonicalExercise?.normalizedName ??
        exerciseName ??
        track.displayName ??
        "Unknown Exercise"
    ).trim();

    const strengthSignalRole = String((canonicalExercise as any)?.strengthSignalRole ?? "")
      .trim()
      .toLowerCase();

    if (strengthSignalRole === "excluded") continue;

    const explicitMovement = String((canonicalExercise as any)?.movementPattern ?? "")
      .trim()
      .toLowerCase();

    const movement =
      explicitMovement === "push" ||
      explicitMovement === "pull" ||
      explicitMovement === "squat" ||
      explicitMovement === "hinge"
        ? (explicitMovement as StrengthContributorMovement)
        : classifyStrengthPattern({
            exerciseId: canonicalExercise?.id ?? track.exerciseId,
            exercise: canonicalExercise ?? null,
            exerciseName: canonicalLabel,
            trackDisplayName: track.displayName,
          });

    if (!movement) continue;

    const effectiveWeight = calcEffectiveStrengthWeightLb(set.weight, exerciseName, bodyweight);
    const scored = computeScoredE1RM(effectiveWeight, set.reps);
    if (!Number.isFinite(scored) || scored <= 0) continue;

    const contributorKey = String(canonicalExercise?.id ?? track.exerciseId);
    const current =
      contributors.get(contributorKey) ??
      {
        label: canonicalLabel,
        movement,
        top: 0,
        working: [],
        completedWorkingSets: 0,
      };

    current.top = Math.max(current.top, scored);
    current.working.push(
      strengthSignalRole === "secondary"
        ? scored * SECONDARY_STRENGTH_WORKING_MULTIPLIER
        : scored
    );
    current.completedWorkingSets += 1;
    contributors.set(contributorKey, current);
  }

  for (const movement of Object.keys(empty) as StrengthContributorMovement[]) {
    empty[movement] = Array.from(contributors.values())
      .filter((contributor) => contributor.movement === movement)
      .map((contributor) => {
        const working = avgTopN(contributor.working, 3);
        const exposure = Math.max(0, Math.min(1, contributor.completedWorkingSets / 6));
        const absolute =
          contributor.top * 0.55 +
          working * 0.3 +
          contributor.top * exposure * 0.15;

        const score =
          Number.isFinite(bodyweight) && bodyweight > 0
            ? round2(absolute / Math.pow(bodyweight, 0.67))
            : 0;

        return {
          label: formatLabel(contributor.label),
          score,
        };
      })
      .filter((item) => Number.isFinite(item.score) && item.score > 0)
      .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  }

  return empty;
}

/* ============================================================================
   FOOTER COMMENT
   FILE: src/strength/strengthContributors.ts
   ============================================================================ */