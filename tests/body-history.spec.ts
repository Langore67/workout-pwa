import { expect, test } from "@playwright/test";
import {
  buildBodyMeasurementSeries,
  buildBodyMetricSeries,
  getBodyMeasurementTimestamp,
  getBodyMetricTimestamp,
  getLatestBodyMetric,
  sortBodyMetricHistory,
} from "../src/body/bodyHistory";

test("body history uses measuredAt, then legacy fallbacks, deterministically", () => {
  const rows = [
    { id: "created", createdAt: 100, weightLb: 180 },
    { id: "taken", takenAt: 200, createdAt: 50, weightLb: 181 },
    { id: "measured", measuredAt: 300, takenAt: 10, weightLb: 182 },
    { id: "legacy", date: 250, createdAt: 1, weightLb: 183 },
    { id: "invalid", measuredAt: Number.NaN, createdAt: 0, weightLb: 999 },
  ] as any[];

  expect(getBodyMetricTimestamp(rows[2])).toBe(300);
  expect(getBodyMetricTimestamp(rows[1])).toBe(200);
  expect(getBodyMetricTimestamp(rows[0])).toBe(100);
  expect(getBodyMetricTimestamp(rows[4])).toBeUndefined();
  expect(sortBodyMetricHistory(rows).map((row) => row.id)).toEqual([
    "measured",
    "legacy",
    "taken",
    "created",
    "invalid",
  ]);
  expect(getLatestBodyMetric(rows)?.id).toBe("measured");
  expect(buildBodyMetricSeries(rows, (row) => row.weightLb).map((point) => point.value)).toEqual([
    182,
    183,
    181,
    180,
  ]);
});

test("body-part history uses measuredAt before createdAt and keeps duplicate timestamps", () => {
  const rows = [
    { id: "a", measurementKey: "chest", measuredAt: 100, createdAt: 90, valueIn: 40 },
    { id: "b", measurementKey: "chest", measuredAt: 100, createdAt: 91, valueIn: 41 },
    { id: "c", measurementKey: "chest", createdAt: 80, valueIn: 39 },
  ] as any[];

  expect(getBodyMeasurementTimestamp(rows[0])).toBe(100);
  expect(getBodyMeasurementTimestamp(rows[2])).toBe(80);
  expect(buildBodyMeasurementSeries(rows).map((point) => point.row.id)).toEqual(["a", "b", "c"]);
  expect(buildBodyMeasurementSeries(rows)).toHaveLength(3);
});
