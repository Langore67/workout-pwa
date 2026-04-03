import type { BodyMetricEntry, Exercise, SetEntry, SetType, Track } from "../db";
import { bodyweightFromRowsAt, calcEffectiveStrengthWeightLb } from "../strength/Strength";

type SessionTotalLiftedArgs = {
  sets: Array<Pick<SetEntry, "trackId" | "setType" | "weight" | "reps">>;
  sessionAt: number;
  trackById: Map<string, Track>;
  exerciseById: Map<string, Exercise | undefined>;
  bodyMetrics: BodyMetricEntry[];
  includeSetTypes?: SetType[];
  excludeWarmups?: boolean;
};

function getWeightContextName(track?: Track, exercise?: Exercise): string {
  return [exercise?.name, track?.displayName].filter(Boolean).join(" ").trim();
}

/**
 * Canonical "session total lifted" for the app:
 * sum effective load × reps for qualifying session sets.
 */
export function computeSessionTotalLifted({
  sets,
  sessionAt,
  trackById,
  exerciseById,
  bodyMetrics,
  includeSetTypes,
  excludeWarmups = true,
}: SessionTotalLiftedArgs): number {
  const bwAtSession = bodyweightFromRowsAt(bodyMetrics, sessionAt);
  let total = 0;

  for (const set of sets ?? []) {
    if (excludeWarmups && set.setType === "warmup") continue;
    if (includeSetTypes?.length && !includeSetTypes.includes(set.setType)) continue;
    if (typeof set.reps !== "number" || set.reps <= 0) continue;

    const track = trackById.get(set.trackId);
    const exercise = track ? exerciseById.get(track.exerciseId) : undefined;
    const effectiveWeight = calcEffectiveStrengthWeightLb(
      typeof set.weight === "number" ? set.weight : 0,
      getWeightContextName(track, exercise),
      typeof bwAtSession === "number" ? bwAtSession : 0
    );

    if (!Number.isFinite(effectiveWeight) || effectiveWeight <= 0) continue;
    total += effectiveWeight * set.reps;
  }

  return total;
}
