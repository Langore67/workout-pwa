import type { BodyMeasurementEntry, BodyMetricEntry } from "../db";

type LegacyBodyRow = Partial<BodyMetricEntry> & { date?: number };

function finitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/** Canonical timestamp precedence for sparse body snapshots. */
export function getBodyMetricTimestamp(row: LegacyBodyRow | undefined): number | undefined {
  if (!row) return undefined;
  for (const value of [row.measuredAt, row.takenAt, row.date, row.createdAt]) {
    if (finitePositive(value)) return value;
  }
  return undefined;
}

/** Canonical timestamp precedence for dated body-part measurements. */
export function getBodyMeasurementTimestamp(
  row: Partial<BodyMeasurementEntry> | undefined,
): number | undefined {
  if (!row) return undefined;
  for (const value of [row.measuredAt, row.createdAt]) {
    if (finitePositive(value)) return value;
  }
  return undefined;
}

export function sortBodyMetricHistory<T extends LegacyBodyRow>(rows: readonly T[]): T[] {
  return rows
    .slice()
    .sort((a, b) => {
      const byTime = (getBodyMetricTimestamp(b) ?? 0) - (getBodyMetricTimestamp(a) ?? 0);
      if (byTime !== 0) return byTime;
      return String((a as any).id ?? "").localeCompare(String((b as any).id ?? ""));
    });
}

export function sortBodyMeasurementHistory<T extends Partial<BodyMeasurementEntry>>(
  rows: readonly T[],
): T[] {
  return rows
    .slice()
    .sort((a, b) => {
      const byTime = (getBodyMeasurementTimestamp(b) ?? 0) - (getBodyMeasurementTimestamp(a) ?? 0);
      if (byTime !== 0) return byTime;
      return String((a as any).id ?? "").localeCompare(String((b as any).id ?? ""));
    });
}

export function getLatestBodyMetric<T extends LegacyBodyRow>(rows: readonly T[]): T | undefined {
  return sortBodyMetricHistory(rows).find((row) => getBodyMetricTimestamp(row) != null);
}

export function getLatestBodyMeasurement<T extends Partial<BodyMeasurementEntry>>(
  rows: readonly T[],
): T | undefined {
  return sortBodyMeasurementHistory(rows).find((row) => getBodyMeasurementTimestamp(row) != null);
}

export function buildBodyMetricSeries<T extends LegacyBodyRow>(
  rows: readonly T[],
  getter: (row: T) => number | undefined,
) {
  return sortBodyMetricHistory(rows)
    .map((row) => ({ at: getBodyMetricTimestamp(row), value: getter(row), row }))
    .filter((point): point is { at: number; value: number; row: T } =>
      point.at != null && typeof point.value === "number" && Number.isFinite(point.value),
    );
}

export function buildBodyMeasurementSeries<T extends Partial<BodyMeasurementEntry>>(
  rows: readonly T[],
) {
  return sortBodyMeasurementHistory(rows)
    .map((row) => ({ at: getBodyMeasurementTimestamp(row), value: row.valueIn, row }))
    .filter((point): point is { at: number; value: number; row: T } =>
      point.at != null && typeof point.value === "number" && Number.isFinite(point.value),
    );
}
