import { expect, test } from "@playwright/test";
import { resetDexieDb } from "./helpers/dbSeed";
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

test("measurement entry saves two rounds as separate rows across reload", async ({ page }) => {
  await resetDexieDb(page);
  await page.goto("/body", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Measurements" }).click();

  const round = async (date: string, values: Record<string, string>) => {
    for (const [label, value] of Object.entries(values)) {
      await page.getByTitle(`Add ${label} measurement`).click();
      const composer = page.locator("div.card").filter({ hasText: `Add ${label}` }).last();
      await composer.locator("input").first().fill(value);
      await composer.locator('input[type="date"]').fill(date);
      await composer.getByRole("button", { name: "Save measurement" }).click();
    }
  };

  const firstRound = {
    Chest: "41",
    "Right biceps": "14.5",
    "Left biceps": "14.25",
    "Right quad": "22",
    "Left quad": "21.75",
    "Right calf": "14.75",
    "Left calf": "14.5",
  };
  const secondRound = {
    Chest: "41.25",
    "Right biceps": "14.75",
    "Left biceps": "14.5",
    "Right quad": "22.25",
    "Left quad": "22",
    "Right calf": "15",
    "Left calf": "14.75",
  };

  await round("2026-09-23", firstRound);
  await round("2026-09-30", secondRound);

  const readRows = () =>
    page.evaluate(async () => (window as any).__db.bodyMeasurements.toArray());
  const rowsAfterSave = await readRows();
  expect(rowsAfterSave).toHaveLength(14);
  expect(new Set(rowsAfterSave.map((row: any) => row.id)).size).toBe(14);
  expect(new Set(rowsAfterSave.map((row: any) => row.measurementKey)).size).toBe(7);
  expect(new Set(rowsAfterSave.map((row: any) => new Date(row.measuredAt).toISOString().slice(0, 10)))).toEqual(
    new Set(["2026-09-23", "2026-09-30"]),
  );

  await page.reload({ waitUntil: "domcontentloaded" });
  const rowsAfterReload = await readRows();
  expect(rowsAfterReload).toHaveLength(14);
});
