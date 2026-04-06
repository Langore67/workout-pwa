// src/components/charts/chartTypes.ts
/* ============================================================================
   chartTypes.ts — Shared chart types
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-03-17-CHARTS-04
   FILE: src/components/charts/chartTypes.ts

   Purpose
   - Centralize reusable chart typing for IronForge trend charts
   - Support Strength, MPS, Body, and Body Composition charts
   - Keep the shared chart shell flexible without overcomplicating the API
   ============================================================================ */

export type ChartDatum = {
  label: string;
  [key: string]: string | number | null | undefined;
};

export type SeriesType = "line" | "area";

export type ChartSeriesConfig = {
  key: string;
  label: string;

  /* optional shorter label for compact readouts */
  shortLabel?: string;

  /* optional unit for tooltip display */
  unit?: string;

  /* line or area (future expansion) */
  type?: SeriesType;

  /* allow null gaps to be connected */
  connectNulls?: boolean;

  /* value formatter used by tooltip/readout */
  formatter?: (value: number | null | undefined) => string;

  /* optional per-series stroke color */
  stroke?: string;
};

export type TooltipValueRow = {
  label: string;
  value: string;
};

export type YDomainMode = "auto" | "tight" | "zeroBased";

export type ReadoutMode = "auto" | "statRow" | "tooltipOnly" | "none";

export type HeaderBadgeMode = "auto" | "hidden";
export type PaneNavigationMode = "default" | "movingPane";

export type TrendChartCardProps = {
  title: string;
  subtitle?: string;
  data: ChartDatum[];
  series: ChartSeriesConfig[];

  xKey?: string;
  height?: number;

  /* number of visible points in the chart viewport */
  windowSize?: number;

  /* opt-in shared slider viewport navigation */
  paneNavigationMode?: PaneNavigationMode;

  yDomainMode?: YDomainMode;

  /* optional single-series linear trend overlay */
  showTrendLine?: boolean;

  /* controls single-series stat strip vs tooltip-only behavior */
  readoutMode?: ReadoutMode;

  /* optional header badge override; defaults to visible window info */
  headerBadgeText?: string;

  /* hide the top-right header badge entirely */
  hideHeaderBadge?: boolean;

  /* hide the auto "Window: start -> end" summary row */
  hideWindowSummary?: boolean;

  /* hide the auto delta summary row */
  hideDeltaSummary?: boolean;

  /* optional single-series helper line above the stat row */
  compactMetaLineText?: string;

  valueFormatter?: (
    value: number | null | undefined,
    seriesKey?: string
  ) => string;

  xLabelFormatter?: (label: string) => string;
  tooltipLabelFormatter?: (label: string, datum?: ChartDatum) => string;

  emptyMessage?: string;
};

/* ================================================================
   FOOTER COMMENT
   FILE: src/components/charts/chartTypes.ts
   ============================================================== */
