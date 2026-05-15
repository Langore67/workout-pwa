import type { Exercise, SetEntry, Track } from "../db";

export type ActivityMetricMode = "distance" | "time" | null;

export type SessionActivitySummary = {
  totalDistanceMeters: number;
  totalSteps: number;
  totalDurationSeconds: number;
  hasDistance: boolean;
  hasSteps: boolean;
  hasDuration: boolean;
  distanceLabel?: string;
  durationLabel?: string;
};

export function formatDurationShortFromSeconds(totalSeconds?: number): string {
  if (typeof totalSeconds !== "number" || !Number.isFinite(totalSeconds) || totalSeconds <= 0) return "";
  const mins = Math.round(totalSeconds / 60);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (m <= 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function trimFixed(value: number, digits: number): string {
  return value.toFixed(digits).replace(/\.?0+$/, "");
}

export function formatDistanceLabel(distance?: number, unit?: string): string {
  if (typeof distance !== "number" || !Number.isFinite(distance) || distance <= 0) return "";
  const normalizedUnit = String(unit ?? "m").trim().toLowerCase();
  if (normalizedUnit === "steps") return `${Math.round(distance)} steps`;
  if (normalizedUnit === "km") return `${trimFixed(distance, 2)} km`;
  if (normalizedUnit === "mi") return `${trimFixed(distance, 2)} mi`;
  if (normalizedUnit === "m") {
    if (distance >= 1000) return `${trimFixed(distance / 1000, 2)} km`;
    return `${Math.round(distance)} m`;
  }
  return `${trimFixed(distance, 2)} ${normalizedUnit}`;
}

export function getActivityMetricMode(args: {
  track?: Track;
  exercise?: Exercise;
  set?: Pick<SetEntry, "seconds" | "distance">;
}): ActivityMetricMode {
  if (typeof args.set?.distance === "number" && Number.isFinite(args.set.distance) && args.set.distance > 0) {
    return "distance";
  }

  if (
    args.track?.trackingMode === "timeSeconds" ||
    (typeof args.set?.seconds === "number" && Number.isFinite(args.set.seconds) && args.set.seconds > 0)
  ) {
    return "time";
  }

  const explicitMetric = (args.exercise as any)?.metricMode;
  if (explicitMetric === "distance" || explicitMetric === "time") return explicitMetric;

  return null;
}

export function summarizeSessionActivityMetrics(args: {
  sets: Array<Pick<SetEntry, "trackId" | "setType" | "seconds" | "distance" | "distanceUnit">>;
  trackById: Map<string, Track>;
  exerciseById: Map<string, Exercise | undefined>;
}): SessionActivitySummary {
  let totalDistanceMeters = 0;
  let totalSteps = 0;
  let totalDurationSeconds = 0;
  let hasDistance = false;
  let hasSteps = false;
  let hasDuration = false;

  for (const set of args.sets ?? []) {
    if (set.setType === "warmup") continue;

    const track = args.trackById.get(set.trackId);
    const exercise = track ? args.exerciseById.get(track.exerciseId) : undefined;
    const metricMode = getActivityMetricMode({ track, exercise, set });

    if (metricMode === "distance" && typeof set.distance === "number" && Number.isFinite(set.distance) && set.distance > 0) {
      const unit = ((set as any).distanceUnit as string | undefined) ?? "m";
      if (unit === "steps") {
        hasSteps = true;
        totalSteps += set.distance;
      } else {
        hasDistance = true;
        totalDistanceMeters += set.distance;
      }
    }

    if (metricMode === "time" && typeof set.seconds === "number" && Number.isFinite(set.seconds) && set.seconds > 0) {
      hasDuration = true;
      totalDurationSeconds += set.seconds;
    }
  }

  const distanceLabel = hasDistance
    ? formatDistanceLabel(totalDistanceMeters, "m")
    : hasSteps
      ? formatDistanceLabel(totalSteps, "steps")
      : "";
  const durationLabel = hasDuration ? formatDurationShortFromSeconds(totalDurationSeconds) : "";

  return {
    totalDistanceMeters,
    totalSteps,
    totalDurationSeconds,
    hasDistance,
    hasSteps,
    hasDuration,
    distanceLabel: distanceLabel || undefined,
    durationLabel: durationLabel || undefined,
  };
}
