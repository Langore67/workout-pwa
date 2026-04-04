import { formatTwoDecimals } from "../../components/charts/chartFormatters";
import type { ChartDatum, ChartSeriesConfig } from "../../components/charts/chartTypes";
import type { PatternScore, StrengthSnapshot, StrengthTrendRow } from "../../strength/Strength";

function fmt1(v: any): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  const s = n.toFixed(1);
  return s.endsWith(".0") ? String(Math.round(n)) : s;
}

function sortTrendRows(trend: StrengthTrendRow[] | null | undefined): StrengthTrendRow[] {
  return (trend ?? []).slice().sort((a, b) => b.weekEndMs - a.weekEndMs);
}

function buildRelativeChartData(trendSorted: StrengthTrendRow[]): ChartDatum[] {
  return trendSorted
    .slice()
    .reverse()
    .map((r, index) => ({
      label: r.label ?? `W${index + 1}`,
      value: Number.isFinite(r.relativeIndex) ? r.relativeIndex : null,
      date: r.label,
      bodyweight: Number.isFinite(r.bodyweight) ? r.bodyweight : null,
      absoluteIndex: Number.isFinite(r.absoluteIndex) ? r.absoluteIndex : null,
    }));
}

function buildStrengthSignalChartData(trendSorted: StrengthTrendRow[]): ChartDatum[] {
  return trendSorted
    .slice()
    .reverse()
    .map((r, index) => ({
      label: r.label ?? `W${index + 1}`,
      value: Number.isFinite(r.normalizedIndex) ? r.normalizedIndex : null,
      date: r.label,
    }));
}

const relativeStrengthSeries: ChartSeriesConfig[] = [
  {
    key: "value",
    label: "Relative Strength",
    shortLabel: "Rel Str",
    formatter: formatTwoDecimals,
    stroke: "var(--accent)",
  },
];

const strengthSignalSeries: ChartSeriesConfig[] = [
  {
    key: "value",
    label: "Strength Signal",
    shortLabel: "Str Sig",
    formatter: formatTwoDecimals,
    stroke: "var(--accent)",
  },
];

export type StrengthPageViewModel = {
  patterns: PatternScore[];
  bwLabel: string;
  trendSorted: StrengthTrendRow[];
  bwSeries: Array<number | null>;
  absSeries: Array<number | null>;
  relativeChartData: ChartDatum[];
  strengthSignalChartData: ChartDatum[];
  relativeStrengthSeries: ChartSeriesConfig[];
  strengthSignalSeries: ChartSeriesConfig[];
  strengthSignalCompactMetaLine: string;
};

export function buildStrengthPageViewModel(
  snapshot: StrengthSnapshot | null | undefined,
): StrengthPageViewModel {
  const result = snapshot?.result ?? null;
  const patterns = Array.isArray(result?.patterns) ? result.patterns : [];
  const trendSorted = sortTrendRows(snapshot?.trend);

  const bwLabel = !result || !Number.isFinite(Number(result.bodyweight))
    ? "—"
    : (() => {
        const n = Number(result.bodyweightDaysUsed);
        const nLabel = Number.isFinite(n) && n > 0 ? ` • n=${n}` : "";
        return `${fmt1(result.bodyweight)} (5-day avg${nLabel})`;
      })();

  const bwSeries = trendSorted.map((r) =>
    Number.isFinite(r.bodyweight) ? r.bodyweight : null,
  );

  const absSeries = trendSorted.map((r) =>
    Number.isFinite(r.absoluteIndex) ? r.absoluteIndex : null,
  );

  const relativeChartData = buildRelativeChartData(trendSorted);
  const strengthSignalChartData = buildStrengthSignalChartData(trendSorted);

  return {
    patterns,
    bwLabel,
    trendSorted,
    bwSeries,
    absSeries,
    relativeChartData,
    strengthSignalChartData,
    relativeStrengthSeries,
    strengthSignalSeries,
    strengthSignalCompactMetaLine: `Strength Signal over last ${strengthSignalChartData.length} snapshots`,
  };
}
