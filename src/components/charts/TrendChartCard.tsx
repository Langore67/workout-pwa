// src/components/charts/TrendChartCard.tsx
/* ============================================================================
   TrendChartCard.tsx — Shared reusable trend chart card
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-03-18-CHARTS-11
   FILE: src/components/charts/TrendChartCard.tsx

   Purpose
   - Provide one shared chart wrapper for Strength, MPS, Body, and Body Comp
   - Standardize chart card layout, tooltip usage, axis setup, hover behavior,
     paging behavior, and y-domain handling
   - Reduce code drift by centralizing common chart logic in one place
   ============================================================================ */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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

import InfoStubButton from "../information/InfoStubButton";
import ChartTooltipContent from "./ChartTooltipContent";
import ChartViewportSlider from "./ChartViewportSlider";
import {
  getLatestPaneStartIndex,
  getNewerPaneStartIndex,
  getOlderPaneStartIndex,
  getPaneWindow,
} from "./chartPaneModel";
import { getPaddedDomain, getSeriesValues } from "./chartDomain";
import type {
  ChartDatum,
  ReadoutMode,
  TrendChartCardProps,
} from "./chartTypes";

/* ============================================================================
   Breadcrumb 1 — Hover readout state
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
   Breadcrumb 2 — Tooltip bridge types
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
   Breadcrumb 3 — Single-series hover bridge
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

    const displayLabel = s.shortLabel || s.label;
    const title = labelFormatter ? labelFormatter(label ?? "", datum) : label ?? "";

    onHoverChange({
      active: true,
      primary: `${displayLabel} ${formatted}`,
      secondary: title,
    });
  }, [active, label, payload, series, labelFormatter, valueFormatter, onHoverChange]);

  return null;
}

/* ============================================================================
   Breadcrumb 4 — Trend line helpers
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
   Breadcrumb 5 — Readout helpers
   ============================================================================ */

function resolveReadoutMode(
  readoutMode: ReadoutMode | undefined,
  isSingleSeries: boolean
): "statRow" | "tooltipOnly" | "none" {
  if (readoutMode === "statRow") return "statRow";
  if (readoutMode === "tooltipOnly") return "tooltipOnly";
  if (readoutMode === "none") return "none";
  return isSingleSeries ? "statRow" : "tooltipOnly";
}

function formatDelta(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value > 0) return `+${value.toFixed(1)}`;
  if (value < 0) return `${value.toFixed(1)}`;
  return "0.0";
}

function formatSignedLikeBase(
  value: number | null,
  formatter?: (value: number | null | undefined) => string
): string {
  if (value == null || !Number.isFinite(value)) return "—";

  const absText = formatter
    ? formatter(Math.abs(value))
    : Math.abs(value).toFixed(1);

  if (value > 0) return `+${absText}`;
  if (value < 0) return `-${absText}`;
  return absText;
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
  windowSize = 12,
  paneNavigationMode = "default",
  yDomainMode = "auto",
  showTrendLine = false,
  readoutMode = "auto",
  headerBadgeText,
  headerStatus,
  headerControls,
  headerMetaText,
  hideHeaderBadge = false,
  hideChartHeader = false,
  infoPageKey,
  infoKey,
  hideWindowSummary = false,
  hideDeltaSummary = false,
  compactMetaLineText,
  valueFormatter,
  xLabelFormatter,
  tooltipLabelFormatter,
  emptyMessage = "Not enough data yet.",
}: TrendChartCardProps) {
  const safeWindowSize = Math.max(1, windowSize);
  const safeHeight = Number.isFinite(height) && height > 0 ? height : 280;

    const [windowStartIndex, setWindowStartIndex] = useState(
      getLatestPaneStartIndex(data.length, safeWindowSize)
    );
    const [hover, setHover] = useState<HoverReadoutState>(EMPTY_HOVER);
    const [hasUserInteracted, setHasUserInteracted] = useState(false);
  
      const chartHostRef = useRef<HTMLDivElement | null>(null);
      const [chartHostSize, setChartHostSize] = useState({ width: 0, height: 0 });
      const [chartCanRender, setChartCanRender] = useState(false);

  useEffect(() => {
    setWindowStartIndex(getLatestPaneStartIndex(data.length, safeWindowSize));
  }, [data.length, safeWindowSize]);

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

  const paneWindow = useMemo(
    () => getPaneWindow(windowStartIndex, data.length, safeWindowSize),
    [windowStartIndex, data.length, safeWindowSize]
  );

  const currentWindowEndIndex = paneWindow.endIndex;

  const visibleData = useMemo(() => {
    return data.slice(windowStartIndex, currentWindowEndIndex + 1);
  }, [data, windowStartIndex, currentWindowEndIndex]);
  
    useLayoutEffect(() => {
      const node = chartHostRef.current;
      if (!node) return;
  
      let frameId = 0;
  
      const updateSize = () => {
        const nextWidth = node.clientWidth || 0;
        const nextHeight = node.clientHeight || 0;
  
        setChartHostSize((prev) => {
          if (prev.width === nextWidth && prev.height === nextHeight) {
            return prev;
          }
          return { width: nextWidth, height: nextHeight };
        });
  
        if (nextWidth > 0 && nextHeight > 0) {
          frameId = window.requestAnimationFrame(() => {
            setChartCanRender(true);
          });
        } else {
          setChartCanRender(false);
        }
      };
  
      updateSize();
  
      const observer = new ResizeObserver(() => {
        updateSize();
      });
  
      observer.observe(node);
  
      return () => {
        observer.disconnect();
        if (frameId) window.cancelAnimationFrame(frameId);
      };
  }, [safeHeight, data.length, windowStartIndex, currentWindowEndIndex]);
  

  useEffect(() => {
    setHover(EMPTY_HOVER);
    setHasUserInteracted(false);
  }, [windowStartIndex, currentWindowEndIndex, data.length]);

  const isSingleSeries = series.length === 1;
  const resolvedReadoutMode = resolveReadoutMode(readoutMode, isSingleSeries);

  const canPageOlder = windowStartIndex > 0;
  const canPageNewer = currentWindowEndIndex < data.length - 1;

  const trendKey = isSingleSeries ? `__trend_${series[0].key}` : "__trend";

  const chartData = useMemo(() => {
    if (!showTrendLine || !isSingleSeries) return visibleData;
    return buildTrendLineData(visibleData, series[0].key, trendKey);
  }, [showTrendLine, isSingleSeries, visibleData, series, trendKey]);

  const yDomain = useMemo(() => {
    const values = getSeriesValues(visibleData, series);
    return getPaddedDomain(values, yDomainMode);
  }, [visibleData, series, yDomainMode]);

  const latestDatum = data.length ? data[data.length - 1] : undefined;
  const latestSeries = series[0];

  const latestNumeric =
    latestDatum && latestSeries
      ? typeof latestDatum[latestSeries.key] === "number"
        ? (latestDatum[latestSeries.key] as number)
        : null
      : null;

  const firstVisibleDatum = visibleData.length ? visibleData[0] : undefined;
  const lastVisibleDatum = visibleData.length
    ? visibleData[visibleData.length - 1]
    : undefined;

  const firstVisibleNumeric =
    firstVisibleDatum && latestSeries
      ? typeof firstVisibleDatum[latestSeries.key] === "number"
        ? (firstVisibleDatum[latestSeries.key] as number)
        : null
      : null;

  const lastVisibleNumeric =
    lastVisibleDatum && latestSeries
      ? typeof lastVisibleDatum[latestSeries.key] === "number"
        ? (lastVisibleDatum[latestSeries.key] as number)
        : null
      : null;

  const visibleDelta =
    firstVisibleNumeric != null &&
    lastVisibleNumeric != null &&
    Number.isFinite(firstVisibleNumeric) &&
    Number.isFinite(lastVisibleNumeric)
      ? lastVisibleNumeric - firstVisibleNumeric
      : null;

  const latestFormatted =
    latestSeries?.formatter?.(latestNumeric) ??
    valueFormatter?.(latestNumeric, latestSeries?.key) ??
    (latestNumeric == null ? "—" : `${latestNumeric}`);

  const latestLabel = latestDatum
    ? tooltipLabelFormatter?.(String(latestDatum[xKey] ?? ""), latestDatum) ??
      String(latestDatum[xKey] ?? "")
    : "";

  const latestDisplayLabel = latestSeries
    ? latestSeries.shortLabel || latestSeries.label
    : "";

  const firstVisibleLabel = firstVisibleDatum
    ? tooltipLabelFormatter?.(String(firstVisibleDatum[xKey] ?? ""), firstVisibleDatum) ??
      String(firstVisibleDatum[xKey] ?? "")
    : "";

  const lastVisibleLabel = lastVisibleDatum
    ? tooltipLabelFormatter?.(String(lastVisibleDatum[xKey] ?? ""), lastVisibleDatum) ??
      String(lastVisibleDatum[xKey] ?? "")
    : "";

  const deltaFormatted = latestSeries?.formatter
    ? formatSignedLikeBase(visibleDelta, latestSeries.formatter)
    : valueFormatter
      ? formatSignedLikeBase(visibleDelta, (v) => valueFormatter(v, latestSeries?.key))
      : formatDelta(visibleDelta);

  const deltaSummary =
    isSingleSeries
      ? `Delta: ${
          visibleDelta == null || !Number.isFinite(visibleDelta) ? "—" : deltaFormatted
        }`
      : "";

  const visibleCount = visibleData.length;
  const totalCount = data.length;

  const autoWindowBadgeText =
    totalCount > safeWindowSize
      ? `${visibleCount} pts • ${windowStartIndex + 1}–${currentWindowEndIndex + 1} of ${totalCount}`
      : `${visibleCount} pts`;

  const resolvedHeaderBadgeText = headerBadgeText ?? autoWindowBadgeText;
  const showHeaderBadge = !hideHeaderBadge && series.length > 1;
  const showHeaderRight = showHeaderBadge || infoKey || headerStatus;
  const showHeaderControls = Boolean(headerControls);
  const showHeaderMetaText = Boolean(headerMetaText?.trim());

  const compactMetaParts: string[] = [];
  if (visibleCount > 0) compactMetaParts.push(`${visibleCount} pts`);
  if (!hideWindowSummary && firstVisibleLabel && lastVisibleLabel) {
    compactMetaParts.push(`${firstVisibleLabel} → ${lastVisibleLabel}`);
  }
  if (!hideDeltaSummary && deltaSummary) {
    compactMetaParts.push(deltaSummary.replace(/^Delta:\s*/i, "Δ "));
  }

    const showHoverReadout =
      hasUserInteracted && hover.active && !!hover.primary;
  
    const chartReady =
      chartCanRender && chartHostSize.width > 0 && chartHostSize.height > 0;

  const statPrimary =
    isSingleSeries && latestSeries
      ? showHoverReadout
        ? hover.primary.replace(new RegExp(`^${latestDisplayLabel}\\s+`), "")
        : `${latestFormatted}`
      : "";

  const statSecondary =
    isSingleSeries
      ? showHoverReadout
        ? ` ${hover.secondary}`
        : ` ${latestLabel}`
    : "";

  const compactMetaLine = (() => {
    if (typeof compactMetaLineText === "string") return compactMetaLineText;
    if (!isSingleSeries || !data?.length) return "";
  
    const first = data[0]?.value;
    const last = data[data.length - 1]?.value;
  
    if (first == null || last == null) return "";
  
    const delta = last - first;
    const sign = delta > 0 ? "+" : "";
    const absDelta = Math.abs(delta).toFixed(1);
  
    const direction =
      delta > 0.5 ? "↑" :
      delta < -0.5 ? "↓" :
      "→";
  
    return `Weight ${direction} ${sign}${absDelta} lb over last ${data.length} check-ins`;
})();

  if (!data.length) {
    return (
      <div className="min-w-0 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 shadow-sm">
        {!hideChartHeader ? (
          <div className="mb-4 grid gap-2">
            <div className="flex w-full flex-nowrap items-start justify-between gap-3">
              <h3
                className="min-w-0 flex-1 text-[18px] font-black text-[var(--text)]"
                style={{ letterSpacing: -0.2, margin: 0 }}
              >
                {title}
              </h3>

              {showHeaderRight ? (
                <div className="ml-auto flex shrink-0 items-center gap-2 self-start">
                  {infoKey ? (
                    <InfoStubButton
                      pageKey={infoPageKey}
                      infoKey={infoKey}
                    />
                  ) : null}

                  {headerStatus}

                  {showHeaderBadge ? (
                    <div
                      className="shrink-0 rounded-full border border-[var(--line)] px-2.5 py-1 text-xs text-[var(--muted)]"
                      title="Visible chart window"
                    >
                      {resolvedHeaderBadgeText}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            {subtitle ? (
              <div className="text-[13px] font-medium leading-5 text-[var(--muted)]">{subtitle}</div>
            ) : null}

            {showHeaderControls ? <div>{headerControls}</div> : null}

            {showHeaderMetaText ? (
              <div className="text-[12px] leading-5 text-[var(--muted)]">{headerMetaText}</div>
            ) : null}
          </div>
        ) : null}

        <div
          className="flex items-center justify-center rounded-xl border border-dashed border-[var(--line)] bg-[var(--bg)]/40 px-4 text-center"
          style={{
            width: "100%",
            height: safeHeight,
            minHeight: safeHeight,
          }}
        >
          <div style={{ maxWidth: 320 }}>
            <div
              className="text-sm font-semibold text-[var(--text)]"
              style={{ marginBottom: 6 }}
            >
              No chart data yet
            </div>
            <div className="text-sm text-[var(--muted)]">{emptyMessage}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 shadow-sm">
      {!hideChartHeader ? (
        <div className="mb-4 grid gap-2">
          <div className="flex w-full flex-nowrap items-start justify-between gap-3">
            <h3
              className="min-w-0 flex-1 text-[18px] font-black text-[var(--text)]"
              style={{ letterSpacing: -0.2, margin: 0 }}
            >
              {title}
            </h3>
  
            {showHeaderRight ? (
              <div className="ml-auto flex shrink-0 items-center gap-2 self-start">
                {infoKey ? (
                  <InfoStubButton
                    pageKey={infoPageKey}
                    infoKey={infoKey}
                  />
                ) : null}

                {headerStatus}

                {showHeaderBadge ? (
                  <div
                    className="shrink-0 rounded-full border border-[var(--line)] px-2.5 py-1 text-xs text-[var(--muted)]"
                    title="Visible chart window"
                  >
                    {resolvedHeaderBadgeText}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {subtitle ? (
            <div className="text-[13px] font-medium leading-5 text-[var(--muted)]">{subtitle}</div>
          ) : null}

          {showHeaderControls ? <div>{headerControls}</div> : null}

          {showHeaderMetaText ? (
            <div className="text-[12px] leading-5 text-[var(--muted)]">{headerMetaText}</div>
          ) : null}
        </div>
      ) : null}
  
      {resolvedReadoutMode === "statRow" ? (
        <div className="mb-4 grid gap-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {latestDisplayLabel ? (
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                {latestDisplayLabel}
              </span>
            ) : null}

            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 min-w-0">
              <span
                className="text-[26px] font-semibold text-[var(--text)] leading-none"
                style={{ letterSpacing: -0.3 }}
              >
                {statPrimary}
              </span>

              {statSecondary.trim() ? (
                <span className="inline-flex items-center rounded-full border border-[var(--line)] px-2.5 py-1 text-[11px] font-medium text-[var(--muted)] leading-none whitespace-nowrap">
                  {statSecondary.trim()}
                </span>
              ) : null}
            </div>
          </div>

          {compactMetaLine ? (
            <div className="text-[12px] leading-5 text-[var(--muted)] opacity-85">
              {compactMetaLine}
            </div>
          ) : null}
        </div>
    ) : null}

	  <div
	    ref={chartHostRef}
	    className="mt-2"
	    style={{
	      width: "100%",
	      minWidth: 0,
	      height: safeHeight,
	      minHeight: safeHeight,
	      position: "relative",
	    }}
      >
                {chartReady ? (
	          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={safeHeight}>
		    	            <LineChart
		    	              data={chartData}
		    	              margin={{ top: 8, right: 20, left: 10, bottom: 12 }}
		    	              accessibilityLayer={false}
		    	              onMouseMove={() => setHasUserInteracted(true)}
		    	              onMouseEnter={() => setHasUserInteracted(true)}
		    	              onClick={() => setHasUserInteracted(true)}
		    	              onMouseLeave={() => {
		    	                setHoverSafe(EMPTY_HOVER);
		    	                setHasUserInteracted(false);
		    	              }}
	            >
	              <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
	
	              <XAxis
	                dataKey={xKey}
	                tickFormatter={xLabelFormatter}
	                minTickGap={24}
	              />
	
	              <YAxis domain={yDomain} width={60} />
	
	              	              {resolvedReadoutMode === "statRow" ? (
		      	                <Tooltip
		      	                  offset={0}
		      	                  allowEscapeViewBox={{ x: true, y: true }}
		      	                  cursor={{ stroke: "var(--line2)", strokeWidth: 1 }}
		      	                  wrapperStyle={{ visibility: "hidden", pointerEvents: "none" }}
		      	                  contentStyle={{ display: "none" }}
		      	                  content={
		      	                    <SingleSeriesHoverBridge
		      	                      series={series}
		      	                      labelFormatter={tooltipLabelFormatter}
		      	                      valueFormatter={valueFormatter}
		      	                      onHoverChange={setHoverSafe}
		      	                    />
		      	                  }
	                />
	              ) : resolvedReadoutMode === "none" ? null : (
	                <Tooltip
	                  offset={18}
	                  allowEscapeViewBox={{ x: true, y: true }}
	                  cursor={{ stroke: "var(--line2)", strokeWidth: 1 }}
	                  wrapperStyle={{ zIndex: 20, pointerEvents: "none", maxWidth: 140 }}
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
					  dot={{
					    r: 4,
					    fill: s.stroke ?? "var(--accent)",
					    stroke: s.stroke ?? "var(--accent)",
					    strokeWidth: 0,
					    tabIndex: -1,
					  }}
					  activeDot={{
					    r: 6,
					    fill: s.stroke ?? "var(--accent)",
					    stroke: s.stroke ?? "var(--accent)",
					    strokeWidth: 0,
					    tabIndex: -1,
	                  }}
		      	                  connectNulls={s.connectNulls ?? true}
		      	                  stroke={s.stroke ?? "var(--accent)"}
		      	                />
	              ))}
	            </LineChart>
	          </ResponsiveContainer>
	        ) : (
	          <div
	            aria-hidden="true"
	            style={{
	              width: "100%",
	              height: "100%",
	              minHeight: safeHeight,
	            }}
	          />
        )}
      </div>

      {data.length > safeWindowSize ? (
        paneNavigationMode === "movingPane" ? (
          <ChartViewportSlider
            totalCount={data.length}
            windowSize={safeWindowSize}
            startIndex={windowStartIndex}
            onStartIndexChange={setWindowStartIndex}
            ariaLabel={`${title} viewport`}
          />
        ) : (
          <div className="mt-2 flex items-center justify-end gap-2">
          <button
            type="button"
            aria-label="Show older data"
            onClick={() =>
              setWindowStartIndex((prev) =>
                getOlderPaneStartIndex(prev, data.length, safeWindowSize)
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
              setWindowStartIndex((prev) =>
                getNewerPaneStartIndex(prev, data.length, safeWindowSize)
              )
            }
            disabled={!canPageNewer}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--line)] text-sm text-[var(--text)] transition hover:bg-[var(--bg)] disabled:opacity-35 disabled:hover:bg-transparent"
          >
            ›
          </button>
          </div>
        )
      ) : null}
    </div>
  );
}

/* ================================================================
   FOOTER COMMENT
   FILE: src/components/charts/TrendChartCard.tsx
   ============================================================== */

