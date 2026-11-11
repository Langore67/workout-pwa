import { useEffect, useMemo, useRef, useState } from "react";
import { AreaClosed, LinePath } from "@visx/shape";
import { scaleLinear, scalePoint } from "@visx/scale";
import { curveMonotoneX } from "@visx/curve";
import type { BodyMetricEntry } from "../../db";
import { getCorrectedBodyFatPct } from "../../body/bodyCalculations";
import { pickTime } from "../../body/bodySignalModel";
import {
  CHART_TIME_RANGES,
  DEFAULT_CHART_TIME_RANGE,
  type ChartTimeRange,
} from "../charts/chartRange";
import { buildBodyCompositionCorrectedBodyFatRangeChartData } from "../../pages/BodyCompositionPage";
import SelectedPointDetail from "../charts/SelectedPointDetail";
import PeerReferenceStrip from "../charts/PeerReferenceStrip";
import { buildBodyFatPeerReference } from "../../body/bodyFatPeerReference";

type Datum = { label: string; value: number; date?: string; unitStartMs?: number };

const HEIGHT = 268;
const MARGIN = { top: 22, right: 20, bottom: 28, left: 46 };

function displayDate(value?: string | number) {
  if (value == null) return "";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : String(value);
}

function percent(value: number) {
  return `${Number.isInteger(value) ? value : Number(value.toFixed(1))}%`;
}

function localDateFromBucket(datum: Datum): Date | undefined {
  const key = datum.date;
  if (key && /^\d{4}-\d{2}(?:-\d{2})?$/.test(key)) {
    const [year, month, day = "1"] = key.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  if (Number.isFinite(datum.unitStartMs)) return new Date(datum.unitStartMs as number);
  return undefined;
}

function formatBucketLabel(datum: Datum, range: ChartTimeRange, includeYear = false): string {
  const date = localDateFromBucket(datum);
  if (!date || !Number.isFinite(date.getTime())) return datum.label;
  return range === "M"
    ? date.toLocaleDateString(undefined, { month: "short", ...(includeYear ? { year: "2-digit" as const } : {}) })
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(includeYear ? { year: "2-digit" as const } : {}) });
}

function formatDetailDate(datum: Datum, range: ChartTimeRange, reference?: Datum): string {
  const date = localDateFromBucket(datum);
  if (!date || !Number.isFinite(date.getTime())) return datum.label;
  if (range === "M") {
    const referenceDate = reference ? localDateFromBucket(reference) : undefined;
    const includeYear = !referenceDate || date.getFullYear() !== referenceDate.getFullYear();
    return date.toLocaleDateString(undefined, { month: "short", ...(includeYear ? { year: "numeric" as const } : {}) });
  }
  return formatBucketLabel(datum, range, false);
}

function rangeName(range: ChartTimeRange): string {
  return range === "D" ? "Daily" : range === "W" ? "Weekly" : "Monthly";
}

function displayPrecisionDifference(value: number, comparison: number): number {
  return Number((Number(value.toFixed(1)) - Number(comparison.toFixed(1))).toFixed(1));
}

function pointChangeText(value: number, previousValue: number, previousLabel: string): string {
  const displayedDelta = displayPrecisionDifference(value, previousValue);
  if (displayedDelta === 0) return `No change from ${previousLabel}`;
  return `${displayedDelta < 0 ? "Down" : "Up"} ${Math.abs(displayedDelta).toFixed(1)} points from ${previousLabel}`;
}

function goalDifferenceText(value: number, goal: number): string {
  const displayedDelta = displayPrecisionDifference(value, goal);
  if (displayedDelta === 0) return `At ${percent(goal)} goal`;
  return `${Math.abs(displayedDelta).toFixed(1)} points ${displayedDelta > 0 ? "above" : "below"} ${percent(goal)} goal`;
}

function selectXAxisIndexes(data: readonly Datum[], range: ChartTimeRange, plotWidth: number): number[] {
  if (data.length <= 0) return [];
  const [maxLabels, minLabelWidth] = range === "M" ? [8, 42] : range === "W" ? [6, 62] : [6, 56];
  const labelCount = Math.min(maxLabels, Math.max(2, Math.floor(plotWidth / minLabelWidth)));
  if (data.length <= labelCount) return Array.from({ length: data.length }, (_, index) => index);
  return [...new Set(Array.from({ length: labelCount }, (_, index) =>
    Math.round((index * (data.length - 1)) / (labelCount - 1))
  ))];
}

const styles = `
.if-cbf-v2 { color:var(--text); background:var(--card); border:1px solid var(--line); border-radius:20px; box-shadow:0 12px 34px rgba(15,23,42,.07); padding:clamp(16px,3vw,26px); overflow:hidden; }
.if-cbf-v2 * { box-sizing:border-box; }
.if-cbf-v2-head { display:flex; justify-content:flex-start; align-items:flex-start; }
.if-cbf-v2-metric-row { display:flex; justify-content:space-between; align-items:flex-end; gap:16px; margin-top:13px; }
.if-cbf-v2-title { margin:0; font-size:clamp(16px,2vw,19px); letter-spacing:-.02em; font-weight:700; }
.if-cbf-v2-tag { display:inline-flex; align-items:center; gap:6px; margin-left:9px; padding:4px 8px; border-radius:999px; background:color-mix(in srgb,var(--accent) 11%,transparent); color:var(--accent); font-size:10px; letter-spacing:.08em; text-transform:uppercase; vertical-align:middle; }
.if-cbf-v2-reading { text-align:left; }
.if-cbf-v2-value { font-size:clamp(28px,5vw,40px); line-height:1; letter-spacing:-.055em; font-weight:750; font-variant-numeric:tabular-nums; transition:opacity .24s ease,transform .24s ease; }
.if-cbf-v2-latest { margin-top:7px; color:var(--muted); font-size:12px; }
.if-cbf-v2-controls { display:flex; gap:4px; padding:4px; border:1px solid var(--line); border-radius:999px; background:color-mix(in srgb,var(--text) 3%,var(--card)); }
.if-cbf-v2-range { min-width:38px; height:32px; border:0; border-radius:999px; background:transparent; color:var(--muted); font:600 12px ui-sans-serif,system-ui,sans-serif; cursor:pointer; transition:background .2s ease,color .2s ease,box-shadow .2s ease; touch-action:manipulation; }
.if-cbf-v2-range[aria-pressed=true] { color:var(--text); background:var(--card); box-shadow:0 1px 5px rgba(15,23,42,.13); }
.if-cbf-v2-range:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
.if-cbf-v2-chart { position:relative; margin-top:8px; width:100%; height:${HEIGHT}px; }
.if-cbf-v2-chart svg { display:block; width:100%; height:100%; overflow:visible; }
.if-cbf-v2-axis { fill:var(--muted); font:11px ui-sans-serif,system-ui,sans-serif; }
.if-cbf-v2-guide { stroke:var(--text); stroke-opacity:.13; stroke-width:1; stroke-dasharray:3 5; }
.if-cbf-v2-line { fill:none; stroke:var(--accent); stroke-width:3; stroke-linecap:round; stroke-linejoin:round; filter:drop-shadow(0 3px 5px color-mix(in srgb,var(--accent) 20%,transparent)); }
.if-cbf-v2-area { opacity:.14; }
.if-cbf-v2-point { fill:var(--card); stroke:var(--accent); stroke-width:3; transition:r .18s ease,opacity .18s ease; }
.if-cbf-v2-goal { stroke:var(--muted); stroke-opacity:.46; stroke-width:1.2; stroke-dasharray:4 5; }
.if-cbf-v2-goal-pill { fill:var(--muted); font:600 10px ui-sans-serif,system-ui,sans-serif; }
.if-cbf-v2-tooltip { position:absolute; z-index:2; display:flex; align-items:baseline; flex-wrap:wrap; gap:8px; width:max-content; max-width:calc(100vw - 40px); padding:6px 9px; border:1px solid color-mix(in srgb,var(--line) 82%,transparent); border-radius:12px; background:color-mix(in srgb,var(--card) 94%,transparent); box-shadow:0 8px 24px rgba(15,23,42,.12); backdrop-filter:blur(12px); pointer-events:none; transform:translate(-50%,-100%); animation:if-cbf-v2-in .18s ease-out both; }
.if-cbf-v2-tooltip-date { color:var(--muted); font-size:10px; }
.if-cbf-v2-tooltip-value { font-size:16px; font-weight:700; font-variant-numeric:tabular-nums; }
.if-cbf-v2-empty { display:grid; place-items:center; height:${HEIGHT}px; margin-top:17px; border-radius:14px; color:var(--muted); background:color-mix(in srgb,var(--text) 2%,var(--card)); font-size:14px; text-align:center; }
.if-cbf-v2-draw { stroke-dasharray:1; stroke-dashoffset:1; animation:if-cbf-v2-draw 1s cubic-bezier(.22,.72,.2,1) forwards; }
.if-cbf-v2-area-in { animation:if-cbf-v2-area-in .65s ease-out both; }
@keyframes if-cbf-v2-draw { to { stroke-dashoffset:0; } }
@keyframes if-cbf-v2-area-in { from { opacity:0; } to { opacity:.14; } }
@keyframes if-cbf-v2-in { from { opacity:0; transform:translate(-50%,-94%); } to { opacity:1; transform:translate(-50%,-100%); } }
@media (max-width:520px) { .if-cbf-v2 { border-radius:17px; } .if-cbf-v2-metric-row { gap:10px; } .if-cbf-v2-value { font-size:clamp(28px,8vw,36px); } .if-cbf-v2-controls { flex-shrink:0; } .if-cbf-v2-chart { height:240px; } .if-cbf-v2-empty { height:240px; } .if-cbf-v2-tooltip { gap:6px; padding:6px 8px; } }
@media (max-width:350px) { .if-cbf-v2-metric-row { align-items:flex-start; flex-wrap:wrap; } .if-cbf-v2-controls { margin-left:auto; } }
@media (prefers-reduced-motion:reduce) { .if-cbf-v2 *, .if-cbf-v2 *::before, .if-cbf-v2 *::after { animation-duration:.01ms!important; transition-duration:.01ms!important; } }
`;

export default function CorrectedBodyFatTrendV2({
  rows,
  goal,
}: {
  rows: readonly BodyMetricEntry[];
  goal?: number;
}) {
  const [range, setRange] = useState<ChartTimeRange>(DEFAULT_CHART_TIME_RANGE);
  const [width, setWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const effectiveWidth = width > 0 ? width : Math.max(320, window.innerWidth - 32);
  const data = useMemo<Datum[]>(
    () => buildBodyCompositionCorrectedBodyFatRangeChartData(rows as any, range) as Datum[],
    [rows, range]
  );

  useEffect(() => {
    const element = chartRef.current;
    if (!element) return;
    const update = () => {
      const measuredWidth = element.getBoundingClientRect().width;
      // Mobile browsers can briefly report zero while the lazy Dev-only chunk
      // is mounting. Use the parent viewport width until ResizeObserver has a
      // real measurement, then replace it with the card's exact content width.
      setWidth(measuredWidth || element.parentElement?.getBoundingClientRect().width || window.innerWidth);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => setActiveIndex(null), [range, data]);

  const latest = useMemo(() => {
    const sorted = rows.slice().sort((a, b) => pickTime(b as any) - pickTime(a as any));
    const row = sorted.find((item) => Number.isFinite(getCorrectedBodyFatPct(item as any)));
    const value = row ? getCorrectedBodyFatPct(row as any) : undefined;
    return value == null || !row
      ? undefined
      : { value, at: pickTime(row as any) };
  }, [rows]);

  const chart = useMemo(() => {
    if (!data.length) return null;
    const height = window.matchMedia("(max-width: 520px)").matches ? 240 : HEIGHT;
    const innerWidth = Math.max(1, effectiveWidth - MARGIN.left - MARGIN.right);
    const innerHeight = Math.max(1, height - MARGIN.top - MARGIN.bottom);
    const values = data.map((item) => item.value);
    const low = Math.min(...values, ...(Number.isFinite(goal) ? [goal as number] : []));
    const high = Math.max(...values, ...(Number.isFinite(goal) ? [goal as number] : []));
    const spread = high - low;
    const pad = Math.max(spread * 0.16, 0.35);
    const y = scaleLinear({ domain: [low - pad, high + pad], range: [innerHeight, 0], nice: false });
    const x = scalePoint<number>({ domain: data.map((_, index) => index), range: [0, innerWidth], padding: data.length === 1 ? 0.5 : 0 });
    const years = new Set(data.map((datum) => localDateFromBucket(datum)?.getFullYear()).filter((year) => year != null));
    const includeYear = years.size > 1;
    const points = data.map((datum, index) => ({ ...datum, label: formatBucketLabel(datum, range, includeYear), index, x: x(index) ?? innerWidth / 2, y: y(datum.value) }));
    const active = activeIndex == null ? undefined : points[activeIndex];
    const goalY = Number.isFinite(goal) ? y(goal as number) : undefined;
    const ticks = y.ticks(4);
    const tickIndexes = selectXAxisIndexes(data, range, innerWidth);
    const tooltipX = active ? Math.min(Math.max(active.x + MARGIN.left, 60), effectiveWidth - 60) : 0;
    const tooltipY = active ? Math.max(MARGIN.top + active.y - 6, 55) : 0;
    return { height, innerWidth, innerHeight, x, y, points, active, goalY, ticks, tickIndexes, tooltipX, tooltipY };
  }, [data, effectiveWidth, goal, activeIndex, range]);

  const displayedPoint = chart?.active ?? chart?.points.at(-1);
  const displayedPreviousPoint = displayedPoint && displayedPoint.index > 0
    ? chart?.points[displayedPoint.index - 1]
    : undefined;
  const pointDelta = displayedPoint && displayedPreviousPoint
    ? displayedPoint.value - displayedPreviousPoint.value
    : undefined;
  const goalDelta = displayedPoint && Number.isFinite(goal)
    ? displayedPoint.value - (goal as number)
    : undefined;
  const peerReference = latest ? buildBodyFatPeerReference(latest.value) : undefined;

  const setPointFromPointer = (event: { currentTarget: SVGRectElement; clientX: number }) => {
    if (!chart || !data.length) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const localX = event.clientX - bounds.left;
    const nearest = chart.points.reduce((best, point) =>
      Math.abs(point.x - localX) < Math.abs(chart.points[best].x - localX) ? point.index : best, 0);
    setActiveIndex(nearest);
  };

  return (
    <section className="if-cbf-v2" aria-label="Corrected body fat trend experimental chart" data-testid="corrected-body-fat-v2">
      <style>{styles}</style>
      <div className="if-cbf-v2-head">
        <h3 className="if-cbf-v2-title">Corrected Body Fat % <span className="if-cbf-v2-tag">v2 experiment</span></h3>
      </div>

      <div className="if-cbf-v2-metric-row" data-testid="corrected-bf-v2-metric-row">
        <div className="if-cbf-v2-reading" aria-live="polite">
          <div className="if-cbf-v2-value" data-testid="corrected-bf-v2-latest">{latest ? percent(latest.value) : "—"}</div>
          <div className="if-cbf-v2-latest" data-testid="corrected-bf-v2-latest-date">{latest ? `Latest · ${displayDate(latest.at)}` : "No corrected reading"}</div>
        </div>
        <div className="if-cbf-v2-controls" role="group" aria-label="Corrected body fat chart range">
          {CHART_TIME_RANGES.map((option) => (
            <button key={option} type="button" className="if-cbf-v2-range" aria-pressed={range === option} onClick={() => setRange(option)} data-testid={`corrected-bf-v2-range-${option}`}>
              {option}
            </button>
          ))}
        </div>
      </div>

      {!data.length ? (
        <div className="if-cbf-v2-empty" data-testid="corrected-bf-v2-empty">Not enough corrected body-fat data yet.</div>
      ) : (
        <div className="if-cbf-v2-chart" ref={chartRef} data-testid="corrected-bf-v2-chart">
          {chart && (
            <>
              <svg viewBox={`0 0 ${effectiveWidth} ${chart.height}`} role="img" aria-label={`Corrected body fat percentage trend, ${range} range`}>
                <defs>
                  <linearGradient id="corrected-bf-v2-fill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity=".32" />
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
                  {chart.ticks.map((tick) => {
                    const yTick = chart.y(tick);
                    return <g key={tick}>
                      <line x1={0} x2={chart.innerWidth} y1={yTick} y2={yTick} stroke="var(--line)" strokeOpacity=".44" />
                      <text className="if-cbf-v2-axis" x={-9} y={yTick + 4} textAnchor="end">{percent(tick)}</text>
                    </g>;
                  })}
                  {chart.goalY != null && (
                    <g data-testid="corrected-bf-v2-goal">
                      <line className="if-cbf-v2-goal" x1={0} x2={chart.innerWidth} y1={chart.goalY} y2={chart.goalY} />
                      <text className="if-cbf-v2-goal-pill" x={chart.innerWidth - 3} y={chart.goalY - 7} textAnchor="end">Goal {percent(goal as number)}</text>
                    </g>
                  )}
                  {chart.active && <line className="if-cbf-v2-guide" x1={chart.active.x} x2={chart.active.x} y1={0} y2={chart.innerHeight} />}
                  <AreaClosed
                    key={`area-${range}-${data.length}`}
                    className="if-cbf-v2-area if-cbf-v2-area-in"
                    data={chart.points}
                    x={(point) => point.x}
                    y={(point) => point.y}
                    yScale={scaleLinear({ domain: [0, chart.innerHeight], range: [chart.innerHeight, 0] })}
                    curve={curveMonotoneX}
                    fill="url(#corrected-bf-v2-fill)"
                  />
                  <LinePath
                    key={`line-${range}-${data.length}`}
                    className="if-cbf-v2-line if-cbf-v2-draw"
                    data={chart.points}
                    x={(point) => point.x}
                    y={(point) => point.y}
                    curve={curveMonotoneX}
                    pathLength={1}
                  />
                  {chart.active && <circle className="if-cbf-v2-point" cx={chart.active.x} cy={chart.active.y} r={5} />}
                  {chart.tickIndexes.map((index) => {
                    const point = chart.points[index];
                    return <text key={index} className="if-cbf-v2-axis" data-testid="corrected-bf-v2-x-label" x={point.x} y={chart.innerHeight + 22} textAnchor={index === 0 ? "start" : index === chart.points.length - 1 ? "end" : "middle"}>{point.label}</text>;
                  })}
                  <rect
                    x={0} y={0} width={chart.innerWidth} height={chart.innerHeight}
                    fill="transparent" style={{ cursor: "crosshair", touchAction: "pan-y" }}
                    onPointerMove={setPointFromPointer}
                    onPointerDown={setPointFromPointer}
                    onClick={setPointFromPointer}
                    onPointerLeave={(event) => { if (event.pointerType !== "touch") setActiveIndex(null); }}
                    data-testid="corrected-bf-v2-interaction"
                  />
                </g>
              </svg>
              {chart.active && (
                <div className="if-cbf-v2-tooltip" style={{ left: chart.tooltipX, top: chart.tooltipY }} data-testid="corrected-bf-v2-tooltip" aria-live="polite">
                  <div className="if-cbf-v2-tooltip-value">{percent(chart.active.value)}</div>
                  <div className="if-cbf-v2-tooltip-date">{chart.active.label || displayDate(chart.active.date)}</div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {displayedPoint && (
        <SelectedPointDetail
          testIdBase="corrected-bf-v2"
          pointLabel={formatDetailDate(displayedPoint, range)}
          value={percent(displayedPoint.value)}
          rangeLabel={rangeName(range)}
          deltaText={pointDelta != null && displayedPreviousPoint
            ? pointChangeText(displayedPoint.value, displayedPreviousPoint.value, formatDetailDate(displayedPreviousPoint, range, displayedPoint))
            : undefined}
          goalDistanceText={goalDelta != null ? goalDifferenceText(displayedPoint.value, goal as number) : undefined}
          selected={Boolean(chart?.active)}
          testIds={{
            root: "corrected-bf-v2-detail",
            header: "corrected-bf-v2-detail-header",
            value: "corrected-bf-v2-detail-value",
            range: "corrected-bf-v2-range-name",
            delta: "corrected-bf-v2-point-change",
            goal: "corrected-bf-v2-goal-difference",
          }}
        />
      )}

      {peerReference ? (
        <PeerReferenceStrip
          model={peerReference}
          testIdBase="corrected-bf-v2"
          testIds={{
            root: "corrected-bf-v2-peer-strip",
            toggle: "corrected-bf-v2-peer-toggle",
            summary: "corrected-bf-v2-peer-collapsed-summary",
            content: "corrected-bf-v2-peer-content",
            marker: "corrected-bf-v2-peer-marker",
          }}
        />
      ) : null}
    </section>
  );
}
