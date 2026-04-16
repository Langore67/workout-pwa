/* ========================================================================== */
/*  strengthSignalFilter.ts                                                   */
/*  Single source of truth for:                                               */
/*  "Should this set count toward Strength Signal?"                           */
/* ========================================================================== */

import { isStrengthTrackType } from "../trackingMode";

export function isSetEligibleForStrengthSignal(args: {
  set: any;
  track: any;
  exercise: any;
}) {
  const { set, exercise } = args;

  if (!set || !exercise) return false;

  const reps = Number(set?.reps);
  const weight = Number(set?.weight);

  if (!Number.isFinite(reps) || reps <= 0) return false;
  if (!Number.isFinite(weight)) return false;

  const setType = String(set?.setType ?? set?.type ?? "")
    .trim()
    .toLowerCase();

  if (
    setType === "warmup" ||
    setType === "warm-up" ||
    setType === "warm up" ||
    setType === "wu" ||
    setType === "drop" ||
    setType === "dropset" ||
    setType === "drop set"
  ) {
    return false;
  }

  const role = String(exercise?.strengthSignalRole ?? "")
    .trim()
    .toLowerCase();

  if (role === "excluded") return false;

  return true;
}