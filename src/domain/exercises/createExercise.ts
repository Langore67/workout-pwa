import { normalizeName, type Exercise, type MetricMode } from "../../db";
import { uuid } from "../../utils";

/** Structured metadata supplied by a trusted caller; never inferred from name. */
export type ExerciseCreationMetadata = Partial<
  Omit<
    Exercise,
    | "id"
    | "name"
    | "normalizedName"
    | "createdAt"
    | "updatedAt"
    | "archivedAt"
    | "mergedIntoExerciseId"
    | "mergeNote"
  >
> & {
  /** Existing optional Exercises-catalog extension, retained for callers. */
  focusArea?: string;
};

export type CreateExerciseRecordInput = {
  name: string;
  metricMode?: MetricMode;
  /** Metadata from an explicit, trusted structured source only. */
  knownMetadata?: ExerciseCreationMetadata;
  /** Optional shared import timestamp; defaults to the current time. */
  now?: number;
};

/**
 * Builds a new, structurally initialized Exercise without assigning semantic
 * classification from its display name. Persistence remains the caller's job.
 */
export function createExerciseRecord(input: CreateExerciseRecordInput): Exercise {
  const name = String(input.name ?? "").trim();
  const normalizedName = normalizeName(name);
  if (!name || !normalizedName) throw new Error("Exercise name is required.");

  const metadata = input.knownMetadata ?? {};
  const metricMode = input.metricMode ?? metadata.metricMode;
  const now = input.now ?? Date.now();

  return {
    ...metadata,
    id: uuid(),
    name,
    normalizedName,
    aliases: metadata.aliases ? [...metadata.aliases] : [],
    equipmentTags: metadata.equipmentTags ? [...metadata.equipmentTags] : [],
    ...(metricMode ? { metricMode } : {}),
    ...(metadata.anchorSubtypes ? { anchorSubtypes: [...metadata.anchorSubtypes] } : {}),
    ...(metadata.cuesSetup ? { cuesSetup: [...metadata.cuesSetup] } : {}),
    ...(metadata.cuesExecution ? { cuesExecution: [...metadata.cuesExecution] } : {}),
    ...(metadata.cues ? { cues: [...metadata.cues] } : {}),
    ...(metadata.commonMistakes ? { commonMistakes: [...metadata.commonMistakes] } : {}),
    createdAt: now,
    updatedAt: now,
  };
}
