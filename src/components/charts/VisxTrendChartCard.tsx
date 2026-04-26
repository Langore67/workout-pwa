import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { AxisBottom, AxisLeft, AxisRight } from "@visx/axis";
import { GridColumns, GridRows } from "@visx/grid";
import { Group } from "@visx/group";
import { scaleLinear, scalePoint } from "@visx/scale";
import { LinePath } from "@visx/shape";

import ChartViewportSlider from "./ChartViewportSlider";
import {
  getLatestPaneStartIndex,
  getNewerPaneStartIndex,
  getOlderPaneStartIndex,
  getPaneWindow,
} from "./chartPaneModel";
import { getPaddedDomain, getSeriesValues } from "./chartDomain";
import type { ChartDatum, ReadoutMode, TrendChartCardProps } from "./chartTypes";

type HoverPoint = {
  index: number;
  datum: ChartDatum;
  label: string;
  value: number | null;
};

type ChartPoint = {
  index: number;
  datum: ChartDatum;
  label: string;
  value: number | null;
  x: number;
};

type DragState = {
  pointerId: number;
  startClientX: number;
  startWindowStartIndex: number;
  stepWidth: number;
  minShift: number;
  maxShift: number;
  lastClientX: number;
  lastTimestampMs: number;
  velocityPxPerMs: number;
};

type MomentumState = {
  startWindowStartIndex: number;
  stepWidth: number;
  minShift: number;
  maxShift: number;
  velocityPxPerMs: number;
  lastTimestampMs: number;
};

function getInnerPointerX(
  event: ReactPointerEvent<SVGRectElement> | ReactMouseEvent<SVGRectElement>
): number {
  const bounds = event.currentTarget.getBoundingClientRect();
  return event.clientX - bounds.left;
}

function toChartDate(value: unknown): Date | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date;
}

function getChartDatumDate(row: ChartDatum, xKey: string): Date | null {
  return toChartDate(row.date) ?? toChartDate(row[xKey]);
}

function buildVisibleTickValues(data: ChartDatum[], maxTicks: number): number[] {
  if (!data.length) return [];

  const safeMaxTicks = Math.max(2, Math.floor(maxTicks));

  if (data.length <= safeMaxTicks) {
    return data.map((_, index) => index);
  }

  const lastIndex = data.length - 1;
  const tickIndexes = new Set<number>([0]);

  if (safeMaxTicks === 3) {
    tickIndexes.add(Math.round(lastIndex / 2));
  } else if (safeMaxTicks === 4) {
    tickIndexes.add(Math.round(lastIndex / 3));
    tickIndexes.add(Math.round((lastIndex * 2) / 3));
  } else {
    const interiorSlots = Math.max(0, safeMaxTicks - 2);
    for (let slot = 1; slot <= interiorSlots; slot += 1) {
      const ratio = slot / (interiorSlots + 1);
      const index = Math.round(ratio * lastIndex);
      tickIndexes.add(Math.max(0, Math.min(lastIndex, index)));
    }
  }
  tickIndexes.add(lastIndex);

  const tickValues = [...tickIndexes]
    .sort((a, b) => a - b);

  return tickValues;
}

function resolveVisibleTickCount(chartWidth: number): number {
  if (chartWidth > 0 && chartWidth < 360) return 3;
  if (chartWidth > 0 && chartWidth < 560) return 4;
  return 6;
}

function pruneTickIndexesForSpacing(
  tickIndexes: number[],
  chartPoints: ChartPoint[],
  minGapPx: number
): number[] {
  if (tickIndexes.length <= 2) return tickIndexes;

  const sorted = [...tickIndexes].sort((a, b) => a - b);
  const kept: number[] = [sorted[0]];

  for (let index = 1; index < sorted.length - 1; index += 1) {
    const candidate = sorted[index];
    const previous = kept[kept.length - 1];
    const previousX = chartPoints[previous]?.x ?? 0;
    const candidateX = chartPoints[candidate]?.x ?? 0;
    if (candidateX - previousX >= minGapPx) {
      kept.push(candidate);
    }
  }

  const last = sorted[sorted.length - 1];
  const previous = kept[kept.length - 1];
  const previousX = chartPoints[previous]?.x ?? 0;
  const lastX = chartPoints[last]?.x ?? 0;

  if (last !== previous) {
    if (lastX - previousX < minGapPx && kept.length > 1) {
      kept.pop();
    }
    kept.push(last);
  }

  return kept;
}

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

  const absText = formatter ? formatter(Math.abs(value)) : Math.abs(value).toFixed(1);

  if (value > 0) return `+${absText}`;
  if (value < 0) return `-${absText}`;
  return absText;
}

function resolveSnappedShift(offsetPx: number, stepWidth: number): number {
  if (!Number.isFinite(stepWidth) || stepWidth <= 0) return 0;
  const direction = offsetPx < 0 ? 1 : -1;
  const distance = Math.abs(offsetPx);
  const wholeSteps = Math.floor(distance / stepWidth);
  const remainder = distance - wholeSteps * stepWidth;
  const thresholdPx = stepWidth * 0.35;
  const shouldAdvanceExtra = remainder >= thresholdPx ? 1 : 0;
  return direction * (wholeSteps + shouldAdvanceExtra);
}

export default function VisxTrendChartCard({
  title,
  subtitle,
  data,
  series,
  testIdBase,
  xKey = "label",
  height = 280,
  windowSize = 12,
  paneNavigationMode = "default",
  dragScrollEnabled = false,
  yDomainMode = "auto",
  yAxisSide = "left",
  showTrendLine = false,
  readoutMode = "auto",
  headerBadgeText,
  hideHeaderBadge = false,
  hideWindowSummary = false,
  hideDeltaSummary = false,
  compactMetaLineText,
  valueFormatter,
  yAxisTickFormatter,
  xLabelFormatter,
  tooltipLabelFormatter,
  emptyMessage = "Not enough data yet.",
}: TrendChartCardProps) {
  const resolvedTestIdBase = testIdBase || title;
  const safeWindowSize = Math.max(1, windowSize);
  const safeHeight = Number.isFinite(height) && height > 0 ? height : 280;
  const [windowStartIndex, setWindowStartIndex] = useState(
    getLatestPaneStartIndex(data.length, safeWindowSize)
  );
  const [hoverPoint, setHoverPoint] = useState<HoverPoint | null>(null);
  const [dragOffsetPx, setDragOffsetPx] = useState(0);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const dragOffsetPxRef = useRef(0);
  const dragRafIdRef = useRef<number | null>(null);
  const momentumRafIdRef = useRef<number | null>(null);
  const momentumStateRef = useRef<MomentumState | null>(null);
  const removeDragListenersRef = useRef<(() => void) | null>(null);
  const [hostSize, setHostSize] = useState({ width: 0, height: 0 });
  const [canRender, setCanRender] = useState(false);

  useEffect(() => {
    setWindowStartIndex(getLatestPaneStartIndex(data.length, safeWindowSize));
  }, [data.length, safeWindowSize]);

  const paneWindow = useMemo(
    () => getPaneWindow(windowStartIndex, data.length, safeWindowSize),
    [windowStartIndex, data.length, safeWindowSize]
  );

  const currentWindowEndIndex = paneWindow.endIndex;

  const visibleData = useMemo(
    () => data.slice(windowStartIndex, currentWindowEndIndex + 1),
    [data, windowStartIndex, currentWindowEndIndex]
  );

  useLayoutEffect(() => {
    const node = hostRef.current;
    if (!node) return;

    let frameId = 0;

    const updateSize = () => {
      const nextWidth = node.clientWidth || 0;
      const nextHeight = node.clientHeight || 0;

      setHostSize((prev) => {
        if (prev.width === nextWidth && prev.height === nextHeight) return prev;
        return { width: nextWidth, height: nextHeight };
      });

      if (nextWidth > 0 && nextHeight > 0) {
        frameId = window.requestAnimationFrame(() => setCanRender(true));
      } else {
        setCanRender(false);
      }
    };

    updateSize();

    const observer = new ResizeObserver(() => updateSize());
    observer.observe(node);

    return () => {
      observer.disconnect();
      if (frameId) window.cancelAnimationFrame(frameId);
    };
  }, [safeHeight, data.length, windowStartIndex, currentWindowEndIndex]);

  useEffect(() => {
    setHoverPoint(null);
    setDragOffsetPx(0);
    dragOffsetPxRef.current = 0;
    if (dragRafIdRef.current != null) {
      window.cancelAnimationFrame(dragRafIdRef.current);
      dragRafIdRef.current = null;
    }
    if (momentumRafIdRef.current != null) {
      window.cancelAnimationFrame(momentumRafIdRef.current);
      momentumRafIdRef.current = null;
    }
    removeDragListenersRef.current?.();
    removeDragListenersRef.current = null;
    dragStateRef.current = null;
    momentumStateRef.current = null;
  }, [windowStartIndex, currentWindowEndIndex, data.length]);

  useEffect(() => {
    return () => {
      if (dragRafIdRef.current != null) {
        window.cancelAnimationFrame(dragRafIdRef.current);
        dragRafIdRef.current = null;
      }
      if (momentumRafIdRef.current != null) {
        window.cancelAnimationFrame(momentumRafIdRef.current);
        momentumRafIdRef.current = null;
      }
      removeDragListenersRef.current?.();
      removeDragListenersRef.current = null;
      momentumStateRef.current = null;
    };
  }, []);

  const scheduleDragOffsetRender = () => {
    if (dragRafIdRef.current != null) return;

    dragRafIdRef.current = window.requestAnimationFrame(() => {
      dragRafIdRef.current = null;
      setDragOffsetPx(dragOffsetPxRef.current);
    });
  };

  const isSingleSeries = series.length === 1;
  const resolvedReadoutMode = resolveReadoutMode(readoutMode, isSingleSeries);
  const canPageOlder = windowStartIndex > 0;
  const canPageNewer = currentWindowEndIndex < data.length - 1;
  const canDragScroll =
    dragScrollEnabled &&
    paneNavigationMode === "movingPane" &&
    data.length > safeWindowSize;
  const dragInteractionEnabled = canDragScroll && visibleData.length > 1;
  const showRenderedTrendLine = showTrendLine && !dragInteractionEnabled;
  const trendKey = isSingleSeries ? `__trend_${series[0].key}` : "__trend";

  const chartData = useMemo(() => {
    if (!showRenderedTrendLine || !isSingleSeries) return visibleData;
    return buildTrendLineData(visibleData, series[0].key, trendKey);
  }, [showRenderedTrendLine, isSingleSeries, visibleData, series, trendKey]);

  const yDomain = useMemo(() => {
    const values = getSeriesValues(chartData, series);
    if (showRenderedTrendLine && isSingleSeries) {
      const trendValues = chartData
        .map((row) => row[trendKey])
        .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
      return getPaddedDomain([...values, ...trendValues], yDomainMode);
    }
    return getPaddedDomain(values, yDomainMode);
  }, [chartData, isSingleSeries, series, showRenderedTrendLine, trendKey, yDomainMode]);

  const latestDatum = data.length ? data[data.length - 1] : undefined;
  const latestSeries = series[0];
  const latestNumeric =
    latestDatum && latestSeries && typeof latestDatum[latestSeries.key] === "number"
      ? (latestDatum[latestSeries.key] as number)
      : null;

  const firstVisibleDatum = visibleData.length ? visibleData[0] : undefined;
  const lastVisibleDatum = visibleData.length ? visibleData[visibleData.length - 1] : undefined;
  const firstVisibleNumeric =
    firstVisibleDatum && latestSeries && typeof firstVisibleDatum[latestSeries.key] === "number"
      ? (firstVisibleDatum[latestSeries.key] as number)
      : null;
  const lastVisibleNumeric =
    lastVisibleDatum && latestSeries && typeof lastVisibleDatum[latestSeries.key] === "number"
      ? (lastVisibleDatum[latestSeries.key] as number)
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

  const latestDisplayLabel = latestSeries ? latestSeries.shortLabel || latestSeries.label : "";

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
      ? formatSignedLikeBase(visibleDelta, (value) => valueFormatter(value, latestSeries?.key))
      : formatDelta(visibleDelta);

  const deltaSummary = isSingleSeries
    ? `Delta: ${visibleDelta == null || !Number.isFinite(visibleDelta) ? "—" : deltaFormatted}`
    : "";

  const visibleCount = visibleData.length;
  const totalCount = data.length;

  const autoWindowBadgeText =
    totalCount > safeWindowSize
      ? `${visibleCount} pts • ${windowStartIndex + 1}-${currentWindowEndIndex + 1} of ${totalCount}`
      : `${visibleCount} pts`;

  const resolvedHeaderBadgeText = headerBadgeText ?? autoWindowBadgeText;

  const statNumeric = hoverPoint?.value ?? latestNumeric;
  const statFormatted =
    latestSeries?.formatter?.(statNumeric) ??
    valueFormatter?.(statNumeric, latestSeries?.key) ??
    (statNumeric == null ? "—" : `${statNumeric}`);
  const statLabel = hoverPoint?.label ?? latestLabel;

  if (!data.length) {
    return (
      <div className="min-w-0 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 shadow-sm">
        <div className="mb-3">
          <div className="text-base font-semibold text-[var(--text)]">{title}</div>
          {subtitle ? <div className="mt-0.5 text-sm text-[var(--muted)]">{subtitle}</div> : null}
        </div>

        <div
          className="flex items-center justify-center rounded-xl border border-dashed border-[var(--line)] bg-[var(--bg)]/40 px-4 text-center"
          style={{ width: "100%", height: safeHeight, minHeight: safeHeight }}
        >
          <div style={{ maxWidth: 320 }}>
            <div className="text-sm font-semibold text-[var(--text)]" style={{ marginBottom: 6 }}>
              No chart data yet
            </div>
            <div className="text-sm text-[var(--muted)]">{emptyMessage}</div>
          </div>
        </div>
      </div>
    );
  }

  const isNarrowChart = hostSize.width > 0 && hostSize.width < 420;
  const margin = {
    top: 8,
    right: yAxisSide === "right" ? (isNarrowChart ? 44 : 56) : isNarrowChart ? 12 : 20,
    bottom: 32,
    left: yAxisSide === "right" ? (isNarrowChart ? 12 : 20) : isNarrowChart ? 44 : 56,
  };
  const chartWidth = Math.max(hostSize.width, 0);
  const chartHeight = Math.max(hostSize.height, safeHeight);
  const innerWidth = Math.max(0, chartWidth - margin.left - margin.right);
  const innerHeight = Math.max(0, chartHeight - margin.top - margin.bottom);
  const xDomain = chartData.map((_, index) => index);
  const indexScale = scalePoint<number>({
    domain: xDomain,
    range: [0, innerWidth],
    padding: 0.5,
  });
  const yScale = scaleLinear<number>({
    domain: yDomain,
    range: [innerHeight, 0],
    nice: false,
  });
  const baseTickIndexes = buildVisibleTickValues(chartData, resolveVisibleTickCount(hostSize.width));
  const chartPoints: ChartPoint[] = chartData.map((datum, index) => {
    const raw = datum[latestSeries?.key ?? ""];
    const value = typeof raw === "number" && Number.isFinite(raw) ? raw : null;
    const label = tooltipLabelFormatter
      ? tooltipLabelFormatter(String(datum[xKey] ?? ""), datum)
      : String(datum[xKey] ?? "");

    return {
      index,
      datum,
      label,
      value,
      x: indexScale(index) ?? 0,
    };
  });
  const minTickGapPx = hostSize.width > 0 && hostSize.width < 420 ? 56 : 44;
  const xTickValues = canDragScroll
    ? chartData.map((_, index) => index)
    : pruneTickIndexesForSpacing(baseTickIndexes, chartPoints, minTickGapPx);
  const firstTickIndex = xTickValues[0] ?? 0;
  const lastTickIndex = xTickValues[xTickValues.length - 1] ?? firstTickIndex;
  const trendPoints =
    showRenderedTrendLine && isSingleSeries
      ? chartPoints.filter(
          (point) =>
            typeof point.datum[trendKey] === "number" &&
            Number.isFinite(point.datum[trendKey] as number)
        )
      : [];
  const resolveTickLabelProps = (pointIndex: number) => ({
    "data-testid": `${resolvedTestIdBase}:x-tick`,
    fill: "var(--muted)",
    fontSize: 11,
    textAnchor:
      pointIndex === firstTickIndex
        ? ("start" as const)
        : pointIndex === lastTickIndex
          ? ("end" as const)
          : ("middle" as const),
  });

  const handlePointerMove = (
    event: ReactPointerEvent<SVGRectElement> | ReactMouseEvent<SVGRectElement>
  ) => {
    if (!chartPoints.length || !innerWidth) return;
    if (momentumStateRef.current) return;
    const dragState = dragStateRef.current;
    if (
      dragState &&
      "pointerId" in event &&
      event.pointerId === dragState.pointerId
    ) {
      const rawOffsetPx = event.clientX - dragState.startClientX;
      const minOffsetPx = -dragState.maxShift * dragState.stepWidth;
      const maxOffsetPx = -dragState.minShift * dragState.stepWidth;
      const nextOffsetPx = Math.max(minOffsetPx, Math.min(maxOffsetPx, rawOffsetPx));
      dragOffsetPxRef.current = nextOffsetPx;
      scheduleDragOffsetRender();
      return;
    }
    const x = getInnerPointerX(event);
    const nearest = chartPoints.reduce((best, candidate) => {
      if (!best) return candidate;
      return Math.abs(candidate.x - x) < Math.abs(best.x - x) ? candidate : best;
    }, chartPoints[0]);

    setHoverPoint(
      nearest
        ? {
            index: nearest.index,
            datum: nearest.datum,
            label: nearest.label,
            value: nearest.value,
          }
        : null
    );
  };

  const handlePointerDown = (event: ReactPointerEvent<SVGRectElement>) => {
    if (!dragInteractionEnabled) return;

    if (momentumRafIdRef.current != null) {
      window.cancelAnimationFrame(momentumRafIdRef.current);
      momentumRafIdRef.current = null;
    }
    momentumStateRef.current = null;

    const stepWidth = innerWidth / Math.max(1, safeWindowSize - 1);
    if (!Number.isFinite(stepWidth) || stepWidth <= 0) return;

    const maxStartIndex = Math.max(0, data.length - safeWindowSize);
    dragStateRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startWindowStartIndex: windowStartIndex,
      stepWidth,
      minShift: -windowStartIndex,
      maxShift: maxStartIndex - windowStartIndex,
      lastClientX: event.clientX,
      lastTimestampMs: performance.now(),
      velocityPxPerMs: 0,
    };
    setHoverPoint(null);
    dragOffsetPxRef.current = 0;
    setDragOffsetPx(0);

    const handleWindowPointerMove = (nextEvent: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState || nextEvent.pointerId !== dragState.pointerId) return;
      const nowMs = performance.now();
      const elapsedMs = Math.max(1, nowMs - dragState.lastTimestampMs);
      const deltaX = nextEvent.clientX - dragState.lastClientX;
      const rawOffsetPx = nextEvent.clientX - dragState.startClientX;
      const minOffsetPx = -dragState.maxShift * dragState.stepWidth;
      const maxOffsetPx = -dragState.minShift * dragState.stepWidth;
      const nextOffsetPx = Math.max(minOffsetPx, Math.min(maxOffsetPx, rawOffsetPx));
      const instantVelocity = deltaX / elapsedMs;
      dragState.velocityPxPerMs = dragState.velocityPxPerMs * 0.75 + instantVelocity * 0.25;
      dragState.lastClientX = nextEvent.clientX;
      dragState.lastTimestampMs = nowMs;
      dragOffsetPxRef.current = nextOffsetPx;
      scheduleDragOffsetRender();
    };

    const finishWindowDrag = (nextEvent: PointerEvent, cancelled = false) => {
      const dragState = dragStateRef.current;
      if (!dragState || nextEvent.pointerId !== dragState.pointerId) return;

      const initialVelocity = dragState.velocityPxPerMs;

      removeDragListenersRef.current?.();
      removeDragListenersRef.current = null;
      dragStateRef.current = null;

      const completeSnap = (baseState: {
        startWindowStartIndex: number;
        stepWidth: number;
        minShift: number;
        maxShift: number;
      }) => {
        const snappedShift = Math.max(
          baseState.minShift,
          Math.min(
            baseState.maxShift,
            resolveSnappedShift(dragOffsetPxRef.current, baseState.stepWidth)
          )
        );
        setWindowStartIndex(baseState.startWindowStartIndex + snappedShift);
        dragOffsetPxRef.current = 0;
        setDragOffsetPx(0);
        setHoverPoint(null);
      };

      if (dragRafIdRef.current != null) {
        window.cancelAnimationFrame(dragRafIdRef.current);
        dragRafIdRef.current = null;
      }

      if (cancelled || Math.abs(initialVelocity) < 0.02) {
        completeSnap(dragState);
        return;
      }

      momentumStateRef.current = {
        startWindowStartIndex: dragState.startWindowStartIndex,
        stepWidth: dragState.stepWidth,
        minShift: dragState.minShift,
        maxShift: dragState.maxShift,
        velocityPxPerMs: initialVelocity,
        lastTimestampMs: performance.now(),
      };

      const runMomentum = () => {
        const momentumState = momentumStateRef.current;
        if (!momentumState) return;

        const nowMs = performance.now();
        const dtMs = Math.max(1, nowMs - momentumState.lastTimestampMs);
        momentumState.lastTimestampMs = nowMs;

        const nextOffsetPx = dragOffsetPxRef.current + momentumState.velocityPxPerMs * dtMs;
        const minOffsetPx = -momentumState.maxShift * momentumState.stepWidth;
        const maxOffsetPx = -momentumState.minShift * momentumState.stepWidth;
        const clampedOffsetPx = Math.max(minOffsetPx, Math.min(maxOffsetPx, nextOffsetPx));

        dragOffsetPxRef.current = clampedOffsetPx;
        scheduleDragOffsetRender();

        const decelPerMs = 0.004;
        const nextSpeed = Math.max(
          0,
          Math.abs(momentumState.velocityPxPerMs) - decelPerMs * dtMs
        );
        momentumState.velocityPxPerMs =
          Math.sign(momentumState.velocityPxPerMs) * nextSpeed;

        const hitBound =
          clampedOffsetPx === minOffsetPx || clampedOffsetPx === maxOffsetPx;

        if (hitBound || nextSpeed < 0.02) {
          if (momentumRafIdRef.current != null) {
            window.cancelAnimationFrame(momentumRafIdRef.current);
            momentumRafIdRef.current = null;
          }
          momentumStateRef.current = null;
          completeSnap(momentumState);
          return;
        }

        momentumRafIdRef.current = window.requestAnimationFrame(runMomentum);
      };

      momentumRafIdRef.current = window.requestAnimationFrame(runMomentum);
    };

    const cancelWindowDrag = (nextEvent: PointerEvent) => finishWindowDrag(nextEvent, true);

    window.addEventListener("pointermove", handleWindowPointerMove);
    window.addEventListener("pointerup", finishWindowDrag);
    window.addEventListener("pointercancel", cancelWindowDrag);
    removeDragListenersRef.current = () => {
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", finishWindowDrag);
      window.removeEventListener("pointercancel", cancelWindowDrag);
    };
  };

  return (
    <div
      className="min-w-0 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 shadow-sm"
      data-testid={`${resolvedTestIdBase}:card`}
    >
      <div className="mb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div
              className="text-[18px] font-black text-[var(--text)]"
              style={{ letterSpacing: -0.2 }}
            >
              {title}
            </div>
            {subtitle ? (
              <div className="mt-0.5 text-[13px] font-medium text-[var(--muted)]">{subtitle}</div>
            ) : null}
          </div>

          {!hideHeaderBadge && series.length > 1 ? (
            <div
              className="shrink-0 rounded-full border border-[var(--line)] px-2.5 py-1 text-xs text-[var(--muted)]"
              title="Visible chart window"
            >
              {resolvedHeaderBadgeText}
            </div>
          ) : null}
        </div>
      </div>

      {resolvedReadoutMode === "statRow" ? (
        <div className="mb-3">
          {compactMetaLineText ? (
            <div className="mt-1 mb-2 text-[10px] text-[var(--muted)] opacity-80">
              {compactMetaLineText}
            </div>
          ) : null}

          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span
              data-testid={`${resolvedTestIdBase}:readout-value`}
              className="text-[26px] font-semibold text-[var(--text)] leading-none"
              style={{ letterSpacing: -0.3 }}
            >
              {statFormatted}
            </span>

            <span
              data-testid={`${resolvedTestIdBase}:readout-label`}
              className="min-w-0 text-[13px] text-[var(--muted)] opacity-75 leading-none"
            >
              {statLabel}
            </span>
          </div>

          {!hideWindowSummary || !hideDeltaSummary ? (
            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-[var(--muted)]">
              {!hideWindowSummary && firstVisibleLabel && lastVisibleLabel ? (
                <span className="rounded-full border border-[var(--line)] px-2 py-0.5">
                  {`${firstVisibleLabel} → ${lastVisibleLabel}`}
                </span>
              ) : null}
              {!hideDeltaSummary && deltaSummary ? (
                <span className="rounded-full border border-[var(--line)] px-2 py-0.5">
                  {deltaSummary}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div
        ref={hostRef}
        className="mt-2"
        data-testid={`${resolvedTestIdBase}:host`}
        style={{
          width: "100%",
          minWidth: 0,
          height: safeHeight,
          minHeight: safeHeight,
          position: "relative",
        }}
      >
        {canRender && innerWidth > 0 && innerHeight > 0 ? (
          <svg
            width={chartWidth}
            height={chartHeight}
            role="img"
            aria-label={title}
            data-testid={`${resolvedTestIdBase}:svg`}
          >
            <Group left={margin.left} top={margin.top}>
              <GridRows
                scale={yScale}
                width={innerWidth}
                numTicks={5}
                stroke="var(--line)"
                strokeOpacity={0.25}
              />

              {yAxisSide === "right" ? (
                <AxisRight
                  left={innerWidth}
                  scale={yScale}
                  numTicks={5}
                  tickFormat={(value) => yAxisTickFormatter?.(Number(value)) ?? String(value)}
                  stroke="var(--line2)"
                  tickStroke="var(--line2)"
                  tickLabelProps={() => ({
                    fill: "var(--muted)",
                    fontSize: 11,
                    textAnchor: "start",
                    dx: "0.33em",
                    dy: "0.33em",
                  })}
                />
              ) : (
                <AxisLeft
                  scale={yScale}
                  numTicks={5}
                  tickFormat={(value) => yAxisTickFormatter?.(Number(value)) ?? String(value)}
                  stroke="var(--line2)"
                  tickStroke="var(--line2)"
                  tickLabelProps={() => ({
                    fill: "var(--muted)",
                    fontSize: 11,
                    textAnchor: "end",
                    dy: "0.33em",
                  })}
                />
              )}

              <Group left={dragOffsetPx}>
                <GridColumns
                  scale={indexScale}
                  height={innerHeight}
                  tickValues={xTickValues}
                  stroke="var(--line)"
                  strokeOpacity={0.12}
                />

                <AxisBottom
                  top={innerHeight}
                  scale={indexScale}
                  tickValues={xTickValues}
                  stroke="var(--line2)"
                  tickStroke="var(--line2)"
                  tickFormat={(value) => {
                    const label = String(chartData[Number(value)]?.[xKey] ?? "");
                    return xLabelFormatter ? xLabelFormatter(label) : label;
                  }}
                  tickLabelProps={(value) => resolveTickLabelProps(Number(value))}
                />

                {showRenderedTrendLine && isSingleSeries ? (
                  <LinePath<ChartPoint>
                    data={trendPoints}
                    x={(point) => point.x}
                    y={(point) => yScale(point.datum[trendKey] as number)}
                    stroke="var(--muted)"
                    strokeOpacity={0.55}
                    strokeWidth={1.5}
                    strokeDasharray="3 4"
                  />
                ) : null}

                {series.map((item) => {
                  const seriesPoints = chartPoints.filter(
                    (point) =>
                      typeof point.datum[item.key] === "number" &&
                      Number.isFinite(point.datum[item.key] as number)
                  );
                  const stroke = item.stroke ?? "var(--accent)";

                  return (
                    <g key={item.key}>
                      <LinePath<ChartPoint>
                        data={seriesPoints}
                        x={(point) => point.x}
                        y={(point) => yScale(point.datum[item.key] as number)}
                        stroke={stroke}
                        strokeWidth={3}
                      />
                      {seriesPoints.map((point) => (
                        <circle
                          key={`${item.key}-${String(point.datum[xKey] ?? "")}-${point.index}`}
                          data-testid={`${resolvedTestIdBase}:point`}
                          data-point-index={point.index}
                          cx={point.x}
                          cy={yScale(point.datum[item.key] as number)}
                          r={4}
                          fill={stroke}
                          stroke="var(--card)"
                          strokeWidth={1.25}
                        />
                      ))}
                    </g>
                  );
                })}

                {hoverPoint ? (
                  <>
                    <line
                      x1={chartPoints[hoverPoint.index]?.x ?? 0}
                      x2={chartPoints[hoverPoint.index]?.x ?? 0}
                      y1={0}
                      y2={innerHeight}
                      stroke="var(--line2)"
                      strokeWidth={1}
                    />
                    {hoverPoint.value != null ? (
                      <circle
                        data-testid={`${resolvedTestIdBase}:active-point`}
                        cx={chartPoints[hoverPoint.index]?.x ?? 0}
                        cy={yScale(hoverPoint.value)}
                        r={5}
                        fill={latestSeries?.stroke ?? "var(--accent)"}
                        stroke="var(--card)"
                        strokeWidth={1.5}
                      />
                    ) : null}
                  </>
                ) : null}
              </Group>

              <rect
                data-testid={`${resolvedTestIdBase}:overlay`}
                x={0}
                y={0}
                width={innerWidth}
                height={innerHeight}
                fill="transparent"
                style={{
                  cursor: dragInteractionEnabled
                    ? dragStateRef.current
                      ? "grabbing"
                      : "grab"
                    : "crosshair",
                  touchAction: dragInteractionEnabled ? "none" : "auto",
                }}
                onPointerDown={handlePointerDown}
                onMouseMove={handlePointerMove}
                onPointerMove={handlePointerMove}
                onMouseLeave={() => {
                  if (!dragStateRef.current) setHoverPoint(null);
                }}
                onPointerLeave={() => {
                  if (!dragStateRef.current) setHoverPoint(null);
                }}
              />
            </Group>
          </svg>
        ) : (
          <div aria-hidden="true" style={{ width: "100%", height: "100%", minHeight: safeHeight }} />
        )}
      </div>

      {data.length > safeWindowSize && !dragInteractionEnabled ? (
        paneNavigationMode === "movingPane" ? (
          <ChartViewportSlider
            totalCount={data.length}
            windowSize={safeWindowSize}
            startIndex={windowStartIndex}
            onStartIndexChange={setWindowStartIndex}
            ariaLabel={`${title} viewport`}
            testIdBase={resolvedTestIdBase}
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
