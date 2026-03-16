// src/components/charts/ChartTooltipContent.tsx
/* ============================================================================
   ChartTooltipContent.tsx — Shared tooltip content for IronForge charts
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-03-15-CHARTS-04
   FILE: src/components/charts/ChartTooltipContent.tsx

   Purpose
   - Render one shared tooltip body for IronForge charts
   - Support compact single-series formatting for Strength charts
   - Snap tooltip placement left/right when the active point is near chart edges

   Behavior
   - Single-series charts render:
       1.19 Rel Str
       Mar 8
   - Multi-series charts keep the stacked row format
   - Tooltip attempts to sit under the active vertical hover line
   - Tooltip shifts inward near chart boundaries to avoid clipping

   Notes
   - This is an MVP edge-aware tooltip improvement
   - Uses coordinate + viewBox values supplied by Recharts Tooltip internals
   ============================================================================ */

import type { ChartDatum, ChartSeriesConfig } from "./chartTypes";

type TooltipPayloadItem = {
  dataKey?: string;
  value?: number | string | null;
  payload?: ChartDatum;
};

type TooltipCoordinate = {
  x?: number;
  y?: number;
};

type TooltipViewBox = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

type ChartTooltipContentProps = {
  active?: boolean;
  label?: string;
  payload?: TooltipPayloadItem[];
  series: ChartSeriesConfig[];
  labelFormatter?: (label: string, datum?: ChartDatum) => string;
  valueFormatter?: (value: number | null | undefined, seriesKey?: string) => string;

  /* Recharts-injected positioning props */
  coordinate?: TooltipCoordinate;
  viewBox?: TooltipViewBox;
};

/* ============================================================================
   Breadcrumb 1 — Label shortening
   ----------------------------------------------------------------------------
   What this section does
   - Converts long series names into compact chart-friendly labels

   Why this matters
   - Shorter labels reduce clutter in tight chart spaces
   - Strength hover labels read much better in compact form
   ============================================================================ */

function getShortSeriesLabel(label: string): string {
  if (label === "Relative Strength") return "Rel Str";
  if (label === "Absolute Strength") return "Abs Str";
  return label;
}

/* ============================================================================
   Breadcrumb 2 — Edge-aware positioning
   ----------------------------------------------------------------------------
   What this section does
   - Computes a tooltip wrapper position relative to the active point
   - Snaps left/right more aggressively when near chart edges
   - Keeps the label visually tied to the hover line

   Why this matters
   - Prevents clipping at the far left / far right edges
   - Produces a much cleaner hover experience than default clamping
   ============================================================================ */

function getTooltipPosition(
  coordinate?: TooltipCoordinate,
  viewBox?: TooltipViewBox
): React.CSSProperties {
  const x = coordinate?.x ?? 0;
  const y = coordinate?.y ?? 0;

  const boxX = viewBox?.x ?? 0;
  const boxWidth = viewBox?.width ?? 0;

  /* Compact tooltip footprint for MVP */
  const tooltipWidth = 92;
  const tooltipHeight = 34;

  /* Default: center under the hover line */
  let left = x - tooltipWidth / 2;
  let top = y + 14;

  const minLeft = boxX + 8;
  const maxLeft = boxX + boxWidth - tooltipWidth - 8;

  if (boxWidth > 0) {
    /* Stronger edge snapping */
    if (x < boxX + 40) {
      left = boxX + 8;
    } else if (x > boxX + boxWidth - 40) {
      left = boxX + boxWidth - tooltipWidth - 8;
    } else {
      if (left < minLeft) left = minLeft;
      if (left > maxLeft) left = maxLeft;
    }
  }

  return {
    position: "absolute",
    left,
    top,
    width: tooltipWidth,
    minHeight: tooltipHeight,
    pointerEvents: "none",
    zIndex: 20,
  };
}

/* ============================================================================
   Breadcrumb 3 — Shared tooltip component
   ----------------------------------------------------------------------------
   What this section does
   - Renders compact single-series tooltip content
   - Falls back to stacked multi-series layout when more than one series exists

   Why this matters
   - Keeps all chart hover formatting centralized
   - Makes future chart polish much easier
   ============================================================================ */

export default function ChartTooltipContent({
  active,
  label,
  payload,
  series,
  labelFormatter,
  valueFormatter,
  coordinate,
  viewBox,
}: ChartTooltipContentProps) {
  if (!active || !payload?.length) return null;

  const datum = payload[0]?.payload;
  const title = labelFormatter ? labelFormatter(label ?? "", datum) : label ?? "";
  const wrapperStyle = getTooltipPosition(coordinate, viewBox);

  /* ==========================================================================
     Breadcrumb 4 — Compact single-series tooltip
     --------------------------------------------------------------------------
     What this section does
     - Uses a compact two-line layout for single-series charts

     Example
     - 1.19 Rel Str
     - Mar 8
     ========================================================================== */

  if (series.length === 1) {
    const s = series[0];
    const raw = datum?.[s.key];
    const numeric = typeof raw === "number" ? raw : null;

    const formatted =
      s.formatter?.(numeric) ??
      valueFormatter?.(numeric, s.key) ??
      (numeric == null ? "—" : `${numeric}`);

    const shortLabel = getShortSeriesLabel(s.label);

    return (
      <div style={wrapperStyle}>
        <div className="rounded-lg border border-[var(--line)] bg-[var(--card)] px-2 py-1 shadow-md">
          <div className="text-[10px] font-semibold leading-tight text-[var(--text)]">
            {formatted} {shortLabel}
          </div>
          <div className="mt-0.5 text-[10px] leading-tight text-[var(--muted)]">
            {title}
          </div>
        </div>
      </div>
    );
  }

  /* ==========================================================================
     Breadcrumb 5 — Multi-series tooltip
     --------------------------------------------------------------------------
     What this section does
     - Preserves the stacked row layout for charts with multiple series

     Why this matters
     - Future Weight/Waist and ICW/ECW charts need row clarity
     ========================================================================== */

  return (
    <div style={wrapperStyle}>
      <div className="rounded-lg border border-[var(--line)] bg-[var(--card)] px-2 py-1 shadow-md">
        <div className="mb-1 text-[10px] font-semibold text-[var(--text)]">{title}</div>

        <div className="space-y-0.5">
          {series.map((s) => {
            const raw = datum?.[s.key];
            const numeric = typeof raw === "number" ? raw : null;

            const formatted =
              s.formatter?.(numeric) ??
              valueFormatter?.(numeric, s.key) ??
              (numeric == null ? "—" : `${numeric}`);

            return (
              <div key={s.key} className="flex items-center justify-between gap-3 text-[10px]">
                <span className="text-[var(--muted)]">{getShortSeriesLabel(s.label)}</span>
                <span className="font-medium text-[var(--text)]">{formatted}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   FOOTER COMMENT
   FILE: src/components/charts/ChartTooltipContent.tsx
   ============================================================== */