import { expect, test } from "@playwright/test";
import ChartRangeSelector from "../src/components/charts/ChartRangeSelector";
import {
  buildAverageChartRangeSeries,
  CHART_TIME_RANGES,
  DEFAULT_CHART_TIME_RANGE,
  localDateKeyFromMs,
  WEEK_MONTH_CHART_TIME_RANGES,
} from "../src/components/charts/chartRange";
import { buildBodyWeightTimelineTrend } from "../src/pages/PerformanceDashboardPage";

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
