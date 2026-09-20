import type { CardioActivityType } from "./cardioActivityType";

const MIN_REASONABLE_WALK_PACE_SECONDS_PER_MILE = 10 * 60;
const MAX_REASONABLE_WALK_PACE_SECONDS_PER_MILE = 35 * 60;

export type CardioPaceQuality = "plausible" | "suspicious" | "unavailable";

export function getCardioPaceQuality(args: {
  activityType?: CardioActivityType;
  paceSecondsPerMile?: number;
}): CardioPaceQuality {
  const pace = args.paceSecondsPerMile;
  if (typeof pace !== "number" || !Number.isFinite(pace) || pace <= 0) return "unavailable";

  // Untyped events retain the legacy walking fallback. Other activity types do
  // not inherit walking thresholds without a trustworthy type-specific range.
  if (args.activityType !== undefined && args.activityType !== "walk") return "plausible";

  return pace < MIN_REASONABLE_WALK_PACE_SECONDS_PER_MILE || pace > MAX_REASONABLE_WALK_PACE_SECONDS_PER_MILE
    ? "suspicious"
    : "plausible";
}
