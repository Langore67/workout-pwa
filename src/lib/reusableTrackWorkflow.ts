import { db, type TrackType, type TrackingMode } from "../db";
import { uuid } from "../utils";

type ResolvedExistingExercise =
  | {
      kind: "existing";
      exerciseId: string;
      unarchive?: boolean;
    }
  | {
      kind: "ambiguous";
      message: string;
    }
  | null;

type FindOrCreateExerciseArgs = {
  rawName: string;
  normalizeName: (name: string) => string;
  resolveExisting: (name: string, normalizedName: string) => Promise<ResolvedExistingExercise>;
};

type CreateTrackVariantArgs = {
  exerciseId: string;
  displayName: string;
  trackType: TrackType;
  trackingMode: TrackingMode;
};

type FindOrCreateReusableTrackArgs = {
  exerciseId: string;
  desiredDisplayName: string;
  trackType: TrackType;
  trackingMode: TrackingMode;
  preferExactDisplayName?: boolean;
  normalizeDisplayName?: (name: string) => string;
  shouldRefreshDisplayName?: (existingDisplayName: string, desiredDisplayName: string) => boolean;
};

function buildTrackDefaults(trackType: TrackType) {
  if (trackType === "corrective") {
    return {
      warmupSetsDefault: 0,
      workingSetsDefault: 1,
      repMin: 1,
      repMax: 1,
      restSecondsDefault: 60,
      rirTargetMin: undefined,
      rirTargetMax: undefined,
      weightJumpDefault: 0,
    };
  }

  return {
    warmupSetsDefault: 2,
    workingSetsDefault: 3,
    repMin: trackType === "strength" ? 3 : 8,
    repMax: trackType === "strength" ? 6 : 12,
    restSecondsDefault: trackType === "strength" ? 180 : 120,
    rirTargetMin: 1,
    rirTargetMax: 2,
    weightJumpDefault: 5,
  };
}

export async function findOrCreateExerciseByName(args: FindOrCreateExerciseArgs): Promise<string> {
  const name = args.rawName.trim();
  if (!name) throw new Error("Exercise name is required.");

  const normalizedName = args.normalizeName(name);
  const resolved = await args.resolveExisting(name, normalizedName);

  if (resolved?.kind === "ambiguous") {
    throw new Error(resolved.message);
  }

  if (resolved?.kind === "existing") {
    if (resolved.unarchive) {
      await db.exercises.update(resolved.exerciseId, {
        archivedAt: undefined,
        updatedAt: Date.now(),
      } as any);
    }
    return resolved.exerciseId;
  }

  const now = Date.now();
  const exerciseId = uuid();

  await db.exercises.add({
    id: exerciseId,
    name,
    normalizedName,
    equipmentTags: [],
    createdAt: now,
    updatedAt: now,
  } as any);

  return exerciseId;
}

export async function createTrackVariant(args: CreateTrackVariantArgs): Promise<string> {
  const now = Date.now();
  const trackId = uuid();

  await db.tracks.add({
    id: trackId,
    exerciseId: args.exerciseId,
    trackType: args.trackType,
    displayName: args.displayName,
    trackingMode: args.trackingMode,
    ...buildTrackDefaults(args.trackType),
    createdAt: now,
  } as any);

  return trackId;
}

export async function findOrCreateReusableTrack(
  args: FindOrCreateReusableTrackArgs
): Promise<string> {
  const allForExercise = await db.tracks.where("exerciseId").equals(args.exerciseId).toArray();

  const matches = allForExercise.filter(
    (t: any) => t.trackType === args.trackType && t.trackingMode === args.trackingMode
  );

  if (matches.length) {
    const preferNoVariant = matches.filter((t: any) => t.variantId == null);
    let pool = preferNoVariant.length ? preferNoVariant : matches;

    if (args.preferExactDisplayName && args.normalizeDisplayName) {
      const normWanted = args.normalizeDisplayName(args.desiredDisplayName);
      const exactNameNoVariant = preferNoVariant.filter(
        (t: any) => args.normalizeDisplayName!(String(t.displayName ?? "")) === normWanted
      );
      if (exactNameNoVariant.length) {
        pool = exactNameNoVariant;
      }
    }

    pool.sort((a: any, b: any) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
    const reused = pool[0];

    if (
      reused?.variantId == null &&
      args.shouldRefreshDisplayName?.(String(reused.displayName ?? ""), args.desiredDisplayName)
    ) {
      await db.tracks.update(reused.id, { displayName: args.desiredDisplayName.trim() } as any);
    }

    return reused.id;
  }

  return createTrackVariant({
    exerciseId: args.exerciseId,
    displayName: args.desiredDisplayName,
    trackType: args.trackType,
    trackingMode: args.trackingMode,
  });
}
