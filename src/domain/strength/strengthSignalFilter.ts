/* ========================================================================== */
/*  strengthSignalFilter.ts                                                   */
/*  Single source of truth for:                                               */
/*  "Should this set count toward Strength Signal?"                           */
/* ========================================================================== */

import { isStrengthTrackType } from "../trackingMode";
import { resolvePerformedSetIntent } from "../sets/performedSetIntent";

export function isSetEligibleForStrengthSignal(args: {
  set: any;
  track: any;
  exercise: any;
}) {
  const { set, track, exercise } = args;
  
  if (!set || !track || !exercise) return false;
  if (!isStrengthTrackType(track.trackType)) return false;
  if (resolvePerformedSetIntent(set, track) !== "working") return false;

  const reps = Number(set?.reps);
  const weight = Number(set?.weight);

  if (!Number.isFinite(reps) || reps <= 0) return false;
  if (!Number.isFinite(weight)) return false;

  const role = String(exercise?.strengthSignalRole ?? "")
    .trim()
    .toLowerCase();

  if (role === "excluded") return false;

  return true;
}
