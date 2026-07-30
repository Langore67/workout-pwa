import type { ChartDatum } from "./chartTypes";
import { formatTimelineLabel, monthKeyFromMs, type TimelineResolution } from "./timelineLabels";

export type ChartTimeRange = TimelineResolution;
export type ChartTimeRangeOption = ChartTimeRange;

export const CHART_TIME_RANGES = Object.freeze(["D", "W", "M"] as const);
export const WEEK_MONTH_CHART_TIME_RANGES = Object.freeze(["W", "M"] as const);
export const DEFAULT_CHART_TIME_RANGE: ChartTimeRange = "W";

export const CHART_TIME_RANGE_LABELS: Readonly<Record<ChartTimeRange, string>> = Object.freeze({
  D: "D",
  W: "W",
  M: "M",
});

export const CHART_TIME_RANGE_TITLES: Readonly<Record<ChartTimeRange, string>> = Object.freeze({
  D: "Daily",
  W: "Weekly",
  M: "Monthly",
});

export type DatedChartObservation = Readonly<{
  at: number;
  value: number;
}>;

type Bucket = {
  values: number[];
  at: number;
};

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function average(values: readonly number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function weekKeyFromMs(ms: number) {
  const d = new Date(ms);
  const start = new Date(d);
  const day = start.getDay();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - day);
  return start.toISOString().slice(0, 10);
}

export function localDateKeyFromMs(ms: number) {
  const d = new Date(ms);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function keyForRange(at: number, range: ChartTimeRange) {
  if (range === "D") return localDateKeyFromMs(at);
  if (range === "W") return weekKeyFromMs(at);
  return monthKeyFromMs(at);
}

export function buildAverageChartRangeSeries(
  observations: readonly DatedChartObservation[],
  range: ChartTimeRange
): ChartDatum[] {
  const buckets = new Map<string, Bucket>();

  observations
    .filter((entry) => Number.isFinite(entry.at) && entry.at > 0 && Number.isFinite(entry.value))
    .slice()
    .sort((a, b) => a.at - b.at)
    .forEach((entry) => {
      const key = keyForRange(entry.at, range);
      const bucket = buckets.get(key) ?? { values: [], at: entry.at };
      bucket.values.push(entry.value);
      bucket.at = Math.min(bucket.at, entry.at);
      buckets.set(key, bucket);
    });

  return Array.from(buckets.entries())
    .sort((a, b) => a[1].at - b[1].at)
    .map(([key, bucket]) => ({
      label: formatTimelineLabel({
        resolution: range,
        unitStartMs: bucket.at,
        monthKey: range === "M" ? key : undefined,
      }),
      value: round2(average(bucket.values)),
      date: key,
      unitStartMs: bucket.at,
    }));
}
