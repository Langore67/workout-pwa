// src/components/charts/TrendChartCard.tsx
/* ============================================================================
   TrendChartCard.tsx — Shared reusable trend chart card
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-03-16-CHARTS-09
   FILE: src/components/charts/TrendChartCard.tsx

   Purpose
   - Provide one shared chart wrapper for Strength, MPS, and future Body Comp
   - Standardize chart card layout, tooltip usage, axis setup, hover behavior,
     paging behavior, and y-domain handling
   - Reduce code drift by centralizing common chart logic in one place

   Current responsibilities
   - Render a consistent card shell for trend charts
   - Show a 12-point visible data window by default
   - Page older/newer through the dataset in fixed windows
   - Compute a stable padded y-axis domain from the full dataset
   - Render one or more line series from config
   - Use a compact stat row for current/hovered single-series values
   - Optionally render a linear trend line for single-series charts
   - Use shared tooltip content for multi-series charts
   - Hide legend automatically when only one series is present
   ============================================================================ */

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import ChartTooltipContent from "./ChartTooltipContent";
import { getPaddedDomain, getSeriesValues } from "./chartDomain";
import type { ChartDatum, TrendChartCardProps } from "./chartTypes";

/* ============================================================================
   Breadcrumb 1 — Compact label helpers
   ============================================================================ */

function getCompactSeriesLabel(label: string): string {
  if (label === "Relative Strength") return "Rel Str";
  if (label === "Absolute Strength") return "Abs Str";
  return label;
}

/* ============================================================================
   Breadcrumb 2 — Hover readout state
   ============================================================================ */

type HoverReadoutState = {
  active: boolean;
  primary: string;
  secondary: string;
};

const EMPTY_HOVER: HoverReadoutState = {
  active: false,
  primary: "",
  secondary: "",
};

/* ============================================================================
   Breadcrumb 3 — Tooltip bridge types
   ============================================================================ */

type TooltipPayloadItem = {
  dataKey?: string;
  value?: number | string | null;
  payload?: ChartDatum;
};

type TooltipBridgeProps = {
  active?: boolean;
  label?: string;
  payload?: TooltipPayloadItem[];
  series: TrendChartCardProps["series"];
  labelFormatter?: TrendChartCardProps["tooltipLabelFormatter"];
  valueFormatter?: TrendChartCardProps["valueFormatter"];
  onHoverChange: (next: HoverReadoutState) => void;
};

/* ============================================================================
   Breadcrumb 4 — Single-series hover bridge
   ============================================================================ */

function SingleSeriesHoverBridge({
  active,
  label,
  payload,
  series,
  labelFormatter,
  valueFormatter,
  onHoverChange,
}: TooltipBridgeProps) {
  useEffect(() => {
    if (!active || !payload?.length || !series.length) {
      onHoverChange(EMPTY_HOVER);
      return;
    }

    const s = series[0];
    const datum = payload[0]?.payload;
    const raw = datum?.[s.key];
    const numeric = typeof raw === "number" ? raw : null;

    const formatted =
      s.formatter?.(numeric) ??
      valueFormatter?.(numeric, s.key) ??
      (numeric == null ? "—" : `${numeric}`);

    const title = labelFormatter ? labelFormatter(label ?? "", datum) : label ?? "";

    onHoverChange({
      active: true,
      primary: `${getCompactSeriesLabel(s.label)} ${formatted}`,
      secondary: title,
    });
  }, [
    active,
    label,
    payload,
    series,
    labelFormatter,
    valueFormatter,
    onHoverChange,
  ]);

  return null;
}

/* ============================================================================
   Breadcrumb 5 — Trend line helpers
   ============================================================================ */

function buildTrendLineData(
  data: ChartDatum[],
  key: string,
  trendKey: string
): ChartDatum[] {
  const points: Array<{ index: number; value: number }> = [];

  data.forEach((row, index) => {
    const raw = row[key];
    if (typeof raw === "number" && Number.isFinite(raw)) {
      points.push({ index, value: raw });
    }
  });

  if (points.length < 2) return data;

  const n = points.length;
  const sumX = points.reduce((acc, p) => acc + p.index, 0);
  const sumY = points.reduce((acc, p) => acc + p.value, 0);
  const sumXY = points.reduce((acc, p) => acc + p.index * p.value, 0);
  const sumXX = points.reduce((acc, p) => acc + p.index * p.index, 0);

  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) return data;

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  return data.map((row, index) => {
    const baseValue = row[key];
    const trendValue =
      typeof baseValue === "number" && Number.isFinite(baseValue)
        ? intercept + slope * index
        : null;

    return {
      ...row,
      [trendKey]: trendValue,
    };
  });
}

/* ============================================================================
   Breadcrumb 6 — Shared trend chart wrapper
   ============================================================================ */

export default function TrendChartCard({
  title,
  subtitle,
  data,
  series,
  xKey = "label",
  height = 280,
  yDomainMode = "auto",
  showTrendLine = false,
  valueFormatter,
  xLabelFormatter,
  tooltipLabelFormatter,
  emptyMessage = "Not enough data yet.",
}: TrendChartCardProps) {
  void title;
  void subtitle;

  const WINDOW_SIZE = 12;

  const [windowEndIndex, setWindowEndIndex] = useState(
    Math.max(0, data.length - 1)
  );

  useEffect(() => {
    setWindowEndIndex(data.length ? data.length - 1 : 0);
  }, [data.length]);

  const [hover, setHover] = useState<HoverReadoutState>(EMPTY_HOVER);

  const setHoverSafe = (next: HoverReadoutState) => {
    setHover((prev) => {
      if (
        prev.active === next.active &&
        prev.primary === next.primary &&
        prev.secondary === next.secondary
      ) {
        return prev;
      }
      return next;
    });
  };

  const windowStartIndex = Math.max(0, windowEndIndex - (WINDOW_SIZE - 1));

  const visibleData = useMemo(() => {
    return data.slice(windowStartIndex, windowEndIndex + 1);
  }, [data, windowStartIndex, windowEndIndex]);

  const canPageOlder = windowStartIndex > 0;
  const canPageNewer = windowEndIndex < data.length - 1;
  const isSingleSeries = series.length === 1;

  const yDomain = useMemo(() => {
    const values = getSeriesValues(data, series);
    return getPaddedDomain(values, yDomainMode);
  }, [data, series, yDomainMode]);

  const trendKey = isSingleSeries ? `__trend_${series[0].key}` : "__trend";

  const chartData = useMemo(() => {
    if (!showTrendLine || !isSingleSeries) return visibleData;
    return buildTrendLineData(visibleData, series[0].key, trendKey);
  }, [showTrendLine, isSingleSeries, visibleData, series, trendKey]);

  const latestDatum = data.length ? data[data.length - 1] : undefined;
  const latestSeries = series[0];

  const latestNumeric =
    latestDatum && latestSeries
      ? typeof latestDatum[latestSeries.key] === "number"
        ? (latestDatum[latestSeries.key] as number)
        : null
      : null;

  const latestFormatted =
    latestSeries?.formatter?.(latestNumeric) ??
    valueFormatter?.(latestNumeric, latestSeries?.key) ??
    (latestNumeric == null ? "—" : `${latestNumeric}`);

  const latestLabel = latestDatum
    ? tooltipLabelFormatter?.(String(latestDatum[xKey] ?? ""), latestDatum) ??
      String(latestDatum[xKey] ?? "")
    : "";

  const statPrimary =
    isSingleSeries && latestSeries
      ? hover.active
        ? hover.primary
        : `${getCompactSeriesLabel(latestSeries.label)} ${latestFormatted}`
      : "";

  const statSecondary =
    isSingleSeries
      ? hover.active
        ? hover.secondary
        : latestLabel
      : "";

  if (!data.length) {
    return (
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 shadow-sm">
        <div className="text-sm text-[var(--muted)]">{emptyMessage}</div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 shadow-sm">
      {isSingleSeries ? (
        <div className="mb-2 flex items-baseline justify-between">
          <div className="text-sm font-semibold text-[var(--text)]">{statPrimary}</div>
          <div className="text-xs text-[var(--muted)]">{statSecondary}</div>
        </div>
      ) : null}

      <div
        style={{
          width: "100%",
          height,
          minHeight: height,
          position: "relative",
        }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 8, right: 20, left: 0, bottom: 12 }}
          >
            <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
            <XAxis
              dataKey={xKey}
              tickFormatter={xLabelFormatter}
              minTickGap={24}
            />
            <YAxis domain={yDomain} width={44} />

            {isSingleSeries ? (
              <Tooltip
                offset={0}
                allowEscapeViewBox={{ x: true, y: true }}
                cursor={{ stroke: "var(--line2)", strokeWidth: 1 }}
                content={
                  <SingleSeriesHoverBridge
                    series={series}
                    labelFormatter={tooltipLabelFormatter}
                    valueFormatter={valueFormatter}
                    onHoverChange={setHoverSafe}
                  />
                }
              />
            ) : (
              <Tooltip
                offset={18}
                allowEscapeViewBox={{ x: true, y: true }}
                cursor={{ stroke: "var(--line2)", strokeWidth: 1 }}
                wrapperStyle={{ zIndex: 20, pointerEvents: "none", maxWidth: 120 }}
                content={
                  <ChartTooltipContent
                    series={series}
                    labelFormatter={tooltipLabelFormatter}
                    valueFormatter={valueFormatter}
                  />
                }
              />
            )}

            {series.length > 1 ? <Legend /> : null}

            {showTrendLine && isSingleSeries ? (
              <Line
                type="linear"
                dataKey={trendKey}
                name="Trend"
                stroke="var(--muted)"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={false}
                activeDot={false}
                connectNulls
                isAnimationActive={false}
              />
            ) : null}

            {series.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                strokeWidth={3}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
                connectNulls={s.connectNulls ?? true}
                stroke={s.stroke ?? "var(--accent)"}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {data.length > WINDOW_SIZE ? (
        <div className="mt-2 flex items-center justify-end gap-2">
          <button
            type="button"
            aria-label="Show older data"
            onClick={() =>
              setWindowEndIndex((prev) =>
                Math.max(WINDOW_SIZE - 1, prev - WINDOW_SIZE)
              )
            }
            disabled={!canPageOlder}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--line)] text-sm text-[var(--text)] transition hover:bg-[var(--bg)] disabled:opacity-35 disabled:hover:bg-transparent"
          >
            ‹
          </button>

          <button
            type="button"
            aria-label="Show newer data"
            onClick={() =>
              setWindowEndIndex((prev) =>
                Math.min(data.length - 1, prev + WINDOW_SIZE)
              )
            }
            disabled={!canPageNewer}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--line)] text-sm text-[var(--text)] transition hover:bg-[var(--bg)] disabled:opacity-35 disabled:hover:bg-transparent"
          >
            ›
          </button>
        </div>
      ) : null}
    </div>
  );
}

/* ================================================================
   FOOTER COMMENT
   FILE: src/components/charts/TrendChartCard.tsx
   ============================================================== */