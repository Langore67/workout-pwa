import type { BodyMetricEntry } from "../db";
import { pickTime } from "./bodySignalModel";

const DAY_MS = 24 * 60 * 60 * 1000;

export type RollingBodyMetric = {
  rawLatest: number | null;
  rolling5: number | null;
  baseline14d: number | null;
  delta14d: number | null;
  sampleCount: number;
  latestAt: number | null;
  baselineSampleCount: number;
};

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

type BodyMetricGetter = (row: BodyMetricEntry) => number | undefined;

export function buildRollingBodyMetric(
  rows: BodyMetricEntry[],
  getter: BodyMetricGetter,
  baselineDays = 14
): RollingBodyMetric {
  const valid = (rows ?? [])
    .map((row) => {
      const value = getter(row);
      const at = pickTime(row as any);
      return { value, at };
    })
    .filter((entry): entry is { value: number; at: number } => finite(entry.value) && finite(entry.at) && entry.at > 0)
    .sort((a, b) => b.at - a.at);

  const currentWindow = valid.slice(0, 5);
  const currentAverage = average(currentWindow.map((entry) => entry.value));
  const latest = valid[0] ?? null;
  const cutoff = latest ? latest.at - baselineDays * DAY_MS : null;
  const baselineWindow =
    cutoff == null
      ? []
      : valid.filter((entry) => entry.at <= cutoff).slice(0, 5);
  const baselineAverage = average(baselineWindow.map((entry) => entry.value));

  return {
    rawLatest: latest?.value ?? null,
    rolling5: currentAverage,
    baseline14d: baselineAverage,
    delta14d:
      currentAverage != null && baselineAverage != null ? currentAverage - baselineAverage : null,
    sampleCount: currentWindow.length,
    latestAt: latest?.at ?? null,
    baselineSampleCount: baselineWindow.length,
  };
}
