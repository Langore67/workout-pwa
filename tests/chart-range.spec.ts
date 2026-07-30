import { expect, test } from "@playwright/test";
import ChartRangeSelector from "../src/components/charts/ChartRangeSelector";
import {
  buildAverageChartRangeSeries,
  CHART_TIME_RANGES,
  DEFAULT_CHART_TIME_RANGE,
  localDateKeyFromMs,
  WEEK_MONTH_CHART_TIME_RANGES,
} from "../src/components/charts/chartRange";
import {
  buildBodyWaistRangeChartData,
  buildBodyWeightRangeChartData,
} from "../src/pages/BodyPage";
import {
  buildBodyCompositionBodyFatRangeChartData,
  buildBodyCompositionCorrectedBodyFatRangeChartData,
  buildBodyCompositionCorrectedLeanMassRangeChartData,
  buildBodyCompositionFluidRatioRangeChartData,
  buildBodyCompositionFatMassRangeChartData,
  buildBodyCompositionLeanMassRangeChartData,
  buildBodyCompositionTbwRangeChartData,
  buildBodyCompositionWaistRangeChartData,
  buildBodyCompositionWeightRangeChartData,
} from "../src/pages/BodyCompositionPage";
import { buildBodyWeightTimelineTrend } from "../src/pages/PerformanceDashboardPage";
import { buildRelativeStrengthTimelineChartData } from "../src/pages/StrengthPage";

type ElementNode = {
  type?: unknown;
  props?: Record<string, any>;
};

function collectElements(node: unknown, predicate: (node: ElementNode) => boolean): ElementNode[] {
  if (node == null || typeof node === "boolean" || typeof node === "string" || typeof node === "number") {
    return [];
  }
  if (Array.isArray(node)) {
    return node.flatMap((child) => collectElements(child, predicate));
  }
  if (typeof node === "object") {
    const element = node as ElementNode;
    const matches = predicate(element) ? [element] : [];
    return [...matches, ...collectElements(element.props?.children, predicate)];
  }
  return [];
}

function selectorButtons(node: unknown) {
  return collectElements(node, (element) => element.type === "button");
}

function localMs(year: number, monthIndex: number, day: number, hour = 12) {
  return new Date(year, monthIndex, day, hour, 0, 0, 0).getTime();
}

test("ChartRangeSelector renders D/W/M with accessible selected state", () => {
  const changes: string[] = [];
  const tree = ChartRangeSelector({
    value: "W",
    options: CHART_TIME_RANGES,
    onChange: (range) => changes.push(range),
  });

  const buttons = selectorButtons(tree);

  expect(buttons.map((button) => button.props?.children)).toEqual(["D", "W", "M"]);
  expect(buttons.map((button) => button.props?.title)).toEqual(["Daily", "Weekly", "Monthly"]);
  expect(buttons.map((button) => button.props?.["aria-pressed"])).toEqual([false, true, false]);
  expect(buttons.every((button) => button.props?.type === "button")).toBe(true);

  buttons[2].props?.onClick();

  expect(changes).toEqual(["M"]);
});

test("ChartRangeSelector supports W/M only without rendering a disabled D option", () => {
  const changes: string[] = [];
  const tree = ChartRangeSelector({
    value: "M",
    options: WEEK_MONTH_CHART_TIME_RANGES,
    onChange: (range) => changes.push(range),
  });

  const buttons = selectorButtons(tree);

  expect(buttons.map((button) => button.props?.children)).toEqual(["W", "M"]);
  expect(buttons.map((button) => button.props?.["aria-pressed"])).toEqual([false, true]);
  expect(buttons.every((button) => button.props?.type === "button")).toBe(true);

  buttons[0].props?.onClick();

  expect(changes).toEqual(["W"]);
});

test("ChartRangeSelector keyboard activation is delegated to real buttons", () => {
  const tree = ChartRangeSelector({
    value: "D",
    options: CHART_TIME_RANGES,
    onChange: () => {},
  });

  expect(selectorButtons(tree).map((button) => button.props?.type)).toEqual(["button", "button", "button"]);
});

test("localDateKeyFromMs uses the local calendar date for morning and late-evening timestamps", () => {
  expect(localDateKeyFromMs(localMs(2026, 0, 5, 8))).toBe("2026-01-05");
  expect(localDateKeyFromMs(localMs(2026, 0, 5, 20))).toBe("2026-01-05");
});

test("buildAverageChartRangeSeries uses local daily buckets that match visible labels", () => {
  const observations = [
    { at: localMs(2026, 0, 5, 8), value: 180 },
    { at: localMs(2026, 0, 5, 20), value: 182 },
    { at: localMs(2026, 0, 6, 8), value: 181.456 },
  ] as const;

  expect(buildAverageChartRangeSeries(observations, "D")).toEqual([
    {
      label: "01/05",
      value: 181,
      date: "2026-01-05",
      unitStartMs: localMs(2026, 0, 5, 8),
    },
    {
      label: "01/06",
      value: 181.46,
      date: "2026-01-06",
      unitStartMs: localMs(2026, 0, 6, 8),
    },
  ]);
});

test("buildAverageChartRangeSeries preserves weekly and monthly reference behavior", () => {
  const observations = [
    { at: localMs(2026, 0, 5), value: 180 },
    { at: localMs(2026, 0, 10), value: 184 },
    { at: localMs(2026, 0, 12), value: 186 },
    { at: localMs(2026, 1, 2), value: 188 },
  ] as const;

  expect(buildAverageChartRangeSeries(observations, "W").map((point) => ({ label: point.label, value: point.value, date: point.date }))).toEqual([
    { label: "W1", value: 182, date: "2026-01-04" },
    { label: "W2", value: 186, date: "2026-01-11" },
    { label: "W5", value: 188, date: "2026-02-01" },
  ]);

  expect(buildAverageChartRangeSeries(observations, "M").map((point) => ({ label: point.label, value: point.value, date: point.date }))).toEqual([
    { label: "Jan", value: 183.33, date: "2026-01" },
    { label: "Feb", value: 188, date: "2026-02" },
  ]);
});

test("buildAverageChartRangeSeries is deterministic, ordered, safe, and non-mutating", () => {
  const observations = [
    { at: Number.NaN, value: 999 },
    { at: localMs(2026, 2, 3), value: 190 },
    { at: 0, value: 180 },
    { at: localMs(2026, 0, 3), value: 185 },
    { at: localMs(2026, 1, 3), value: Number.POSITIVE_INFINITY },
  ];
  const before = observations.map((entry) => ({ ...entry }));

  const first = buildAverageChartRangeSeries(observations, "M");
  const second = buildAverageChartRangeSeries(observations, "M");

  expect(first).toEqual(second);
  expect(first.map((point) => point.date)).toEqual(["2026-01", "2026-03"]);
  expect(observations).toEqual(before);
  expect(buildAverageChartRangeSeries([], "D")).toEqual([]);
});

test("Performance Body Weight retains weekly default and shared D/W/M behavior", () => {
  const rows = [
    { id: "late", measuredAt: localMs(2026, 0, 10), weightLb: 184 },
    { id: "early", measuredAt: localMs(2026, 0, 5), weightLb: 180 },
    { id: "same-day", measuredAt: localMs(2026, 0, 5, 20), weightLb: 182 },
    { id: "invalid", measuredAt: localMs(2026, 0, 8), weightLb: Number.NaN },
  ] as any[];

  expect(DEFAULT_CHART_TIME_RANGE).toBe("W");
  expect(buildBodyWeightTimelineTrend(rows, "D").map((point) => point.value)).toEqual([181, 184]);
  expect(buildBodyWeightTimelineTrend(rows, "W").map((point) => point.value)).toEqual([182]);
  expect(buildBodyWeightTimelineTrend(rows, "M").map((point) => point.value)).toEqual([182]);
});

test("Relative Strength range data defaults to weekly semantics and supports D/W/M", () => {
  const trendRows = [
    { label: "Late same day", weekEndMs: localMs(2026, 0, 5, 20), relativeIndex: 1.12 },
    { label: "Next day", weekEndMs: localMs(2026, 0, 6, 8), relativeIndex: 1.2 },
    { label: "Morning same day", weekEndMs: localMs(2026, 0, 5, 8), relativeIndex: 1.1 },
    { label: "Next month", weekEndMs: localMs(2026, 1, 2, 8), relativeIndex: 1.3 },
    { label: "Invalid", weekEndMs: localMs(2026, 1, 3, 8), relativeIndex: Number.NaN },
  ] as any[];
  const before = trendRows.map((row) => ({ ...row }));

  expect(DEFAULT_CHART_TIME_RANGE).toBe("W");
  expect(buildRelativeStrengthTimelineChartData(trendRows, "D").map((point) => ({ value: point.value, date: point.date }))).toEqual([
    { value: 1.11, date: "2026-01-05" },
    { value: 1.2, date: "2026-01-06" },
    { value: 1.3, date: "2026-02-02" },
  ]);
  expect(buildRelativeStrengthTimelineChartData(trendRows, "W").map((point) => point.value)).toEqual([1.14, 1.3]);
  expect(buildRelativeStrengthTimelineChartData(trendRows, "M").map((point) => point.value)).toEqual([1.14, 1.3]);
  expect(trendRows).toEqual(before);
});

test("Body Metrics Weight range data uses local daily, weekly, and monthly averages", () => {
  const rows = [
    { id: "late", measuredAt: localMs(2026, 0, 5, 20), weightLb: 182 },
    { id: "next-day", measuredAt: localMs(2026, 0, 6, 8), weightLb: 184 },
    { id: "morning", measuredAt: localMs(2026, 0, 5, 8), weightLb: 180 },
    { id: "next-month", measuredAt: localMs(2026, 1, 2, 8), weightLb: 186 },
    { id: "invalid", measuredAt: localMs(2026, 1, 3, 8), weightLb: Number.NaN },
  ] as any[];
  const before = rows.map((row) => ({ ...row }));

  expect(buildBodyWeightRangeChartData(rows, "D").map((point) => ({ value: point.value, date: point.date }))).toEqual([
    { value: 181, date: "2026-01-05" },
    { value: 184, date: "2026-01-06" },
    { value: 186, date: "2026-02-02" },
  ]);
  expect(buildBodyWeightRangeChartData(rows, "W").map((point) => point.value)).toEqual([182, 186]);
  expect(buildBodyWeightRangeChartData(rows, "M").map((point) => point.value)).toEqual([182, 186]);
  expect(buildBodyWeightRangeChartData([], "W")).toEqual([]);
  expect(rows).toEqual(before);
});

test("Body Metrics Waist range data keeps sparse manual measurements sparse", () => {
  const rows = [
    { id: "early", measuredAt: localMs(2026, 0, 5, 8), waistIn: 36 },
    { id: "late", measuredAt: localMs(2026, 0, 5, 20), waistIn: 35.8 },
    { id: "gap", measuredAt: localMs(2026, 0, 20, 8), waistIn: 35.2 },
    { id: "missing", measuredAt: localMs(2026, 0, 21, 8), weightLb: 180 },
  ] as any[];
  const before = rows.map((row) => ({ ...row }));

  expect(buildBodyWaistRangeChartData(rows, "D").map((point) => ({ value: point.value, date: point.date }))).toEqual([
    { value: 35.9, date: "2026-01-05" },
    { value: 35.2, date: "2026-01-20" },
  ]);
  expect(buildBodyWaistRangeChartData(rows, "W").map((point) => ({ value: point.value, date: point.date }))).toEqual([
    { value: 35.9, date: "2026-01-04" },
    { value: 35.2, date: "2026-01-18" },
  ]);
  expect(buildBodyWaistRangeChartData(rows, "M").map((point) => point.value)).toEqual([35.67]);
  expect(buildBodyWaistRangeChartData([], "M")).toEqual([]);
  expect(rows).toEqual(before);
});

test("Body Composition Weight and Waist use shared D/W/M buckets", () => {
  const rows = [
    { id: "a", measuredAt: localMs(2026, 0, 5, 8), weightLb: 180, waistIn: 36 },
    { id: "b", measuredAt: localMs(2026, 0, 5, 20), weightLb: 182, waistIn: 35.8 },
    { id: "c", measuredAt: localMs(2026, 0, 20, 8), weightLb: 178, waistIn: 35.2 },
  ] as any[];
  const before = rows.map((row) => ({ ...row }));

  expect(buildBodyCompositionWeightRangeChartData(rows, "D").map((point) => ({ value: point.value, date: point.date }))).toEqual([
    { value: 181, date: "2026-01-05" },
    { value: 178, date: "2026-01-20" },
  ]);
  expect(buildBodyCompositionWaistRangeChartData(rows, "W").map((point) => ({ value: point.value, date: point.date }))).toEqual([
    { value: 35.9, date: "2026-01-04" },
    { value: 35.2, date: "2026-01-18" },
  ]);
  expect(buildBodyCompositionWeightRangeChartData(rows, "M").map((point) => point.value)).toEqual([180]);
  expect(rows).toEqual(before);
});

test("Body Composition raw and corrected body fat remain distinct through range aggregation", () => {
  const rows = [
    { id: "a", measuredAt: localMs(2026, 0, 5, 8), weightLb: 180, bodyFatPct: 20, icwLb: 50, ecwLb: 34 },
    { id: "b", measuredAt: localMs(2026, 0, 5, 20), weightLb: 182, bodyFatPct: 22, icwLb: 50, ecwLb: 34 },
    { id: "c", measuredAt: localMs(2026, 1, 2, 8), weightLb: 178, bodyFatPct: 19, icwLb: 55, ecwLb: 30 },
  ] as any[];

  expect(buildBodyCompositionBodyFatRangeChartData(rows, "D").map((point) => ({ value: point.value, date: point.date }))).toEqual([
    { value: 21, date: "2026-01-05" },
    { value: 19, date: "2026-02-02" },
  ]);
  expect(buildBodyCompositionCorrectedBodyFatRangeChartData(rows, "D").map((point) => ({ value: point.value, date: point.date }))).toEqual([
    { value: 22.48, date: "2026-01-05" },
    { value: 19, date: "2026-02-02" },
  ]);
  expect(buildBodyCompositionBodyFatRangeChartData([], "W")).toEqual([]);
  expect(buildBodyCompositionCorrectedBodyFatRangeChartData([{ id: "raw-only", measuredAt: localMs(2026, 0, 7), weightLb: 180 } as any], "W")).toEqual([]);
});

test("Body Composition Fat Mass uses shared D/W/M buckets", () => {
  const rows = [
    { id: "a", measuredAt: localMs(2026, 0, 5, 8), bodyFatMassLb: 36 },
    { id: "b", measuredAt: localMs(2026, 0, 5, 20), bodyFatMassLb: 38 },
    { id: "c", measuredAt: localMs(2026, 0, 20, 8), weightLb: 178, bodyFatPct: 20 },
    { id: "invalid", measuredAt: localMs(2026, 0, 21, 8), bodyFatMassLb: Number.NaN },
  ] as any[];
  const before = rows.map((row) => ({ ...row }));

  expect(buildBodyCompositionFatMassRangeChartData(rows, "D").map((point) => ({ value: point.value, date: point.date }))).toEqual([
    { value: 37, date: "2026-01-05" },
    { value: 35.6, date: "2026-01-20" },
  ]);
  expect(buildBodyCompositionFatMassRangeChartData(rows, "W").map((point) => ({ value: point.value, date: point.date }))).toEqual([
    { value: 37, date: "2026-01-04" },
    { value: 35.6, date: "2026-01-18" },
  ]);
  expect(buildBodyCompositionFatMassRangeChartData(rows, "M").map((point) => point.value)).toEqual([36.53]);
  expect(buildBodyCompositionFatMassRangeChartData([], "W")).toEqual([]);
  expect(rows).toEqual(before);
});

test("Body Composition raw and corrected lean mass remain distinct through range aggregation", () => {
  const rows = [
    { id: "a", measuredAt: localMs(2026, 0, 5, 8), weightLb: 180, bodyFatPct: 20, icwLb: 50, ecwLb: 34 },
    { id: "b", measuredAt: localMs(2026, 0, 5, 20), weightLb: 182, bodyFatPct: 22, icwLb: 50, ecwLb: 34 },
    { id: "c", measuredAt: localMs(2026, 1, 2, 8), weightLb: 178, bodyFatPct: 19, icwLb: 55, ecwLb: 30 },
  ] as any[];

  expect(buildBodyCompositionLeanMassRangeChartData(rows, "D").map((point) => ({ value: point.value, date: point.date }))).toEqual([
    { value: 142.98, date: "2026-01-05" },
    { value: 144.18, date: "2026-02-02" },
  ]);
  expect(buildBodyCompositionCorrectedLeanMassRangeChartData(rows, "D").map((point) => ({ value: point.value, date: point.date }))).toEqual([
    { value: 140.31, date: "2026-01-05" },
    { value: 144.18, date: "2026-02-02" },
  ]);
  expect(buildBodyCompositionLeanMassRangeChartData([], "M")).toEqual([]);
  expect(buildBodyCompositionCorrectedLeanMassRangeChartData([{ id: "raw-only", measuredAt: localMs(2026, 0, 7), weightLb: 180 } as any], "M")).toEqual([]);
});

test("Body Composition TBW and Fluid Ratio use W/M-only range data", () => {
  const rows = [
    { id: "a", measuredAt: localMs(2026, 0, 5, 8), icwLb: 50, ecwLb: 34 },
    { id: "b", measuredAt: localMs(2026, 0, 5, 20), icwLb: 52, ecwLb: 32 },
    { id: "c", measuredAt: localMs(2026, 1, 2, 8), icwLb: 55, ecwLb: 30 },
    { id: "invalid", measuredAt: localMs(2026, 1, 3, 8), icwLb: 50 },
  ] as any[];
  const before = rows.map((row) => ({ ...row }));

  expect(WEEK_MONTH_CHART_TIME_RANGES).toEqual(["W", "M"]);
  expect(buildBodyCompositionTbwRangeChartData(rows, "W").map((point) => ({ value: point.value, date: point.date }))).toEqual([
    { value: 84, date: "2026-01-04" },
    { value: 85, date: "2026-02-01" },
  ]);
  expect(buildBodyCompositionTbwRangeChartData(rows, "M").map((point) => point.value)).toEqual([84, 85]);
  expect(buildBodyCompositionFluidRatioRangeChartData(rows, "W").map((point) => ({ value: point.value, date: point.date }))).toEqual([
    { value: 0.39, date: "2026-01-04" },
    { value: 0.35, date: "2026-02-01" },
  ]);
  expect(buildBodyCompositionFluidRatioRangeChartData(rows, "M").map((point) => point.value)).toEqual([0.39, 0.35]);
  expect(buildBodyCompositionTbwRangeChartData([], "W")).toEqual([]);
  expect(buildBodyCompositionFluidRatioRangeChartData([], "M")).toEqual([]);
  expect(rows).toEqual(before);
});
