// src/components/charts/chartTypes.ts
/* ============================================================================
   chartTypes.ts — Shared chart types
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-03-15-CHARTS-03
   FILE: src/components/charts/chartTypes.ts

   Purpose
   - Centralize reusable chart typing for IronForge trend charts
   - Support current Strength charts first
   - Stay flexible for MPS and Body Composition charts later
   ============================================================================ */

export type ChartDatum = {
  label: string;
  [key: string]: string | number | null | undefined;
};

export type SeriesType = "line" | "area";

export type ChartSeriesConfig = {
  key: string;
  label: string;

  /* optional unit for tooltip display */
  unit?: string;

  /* line or area (future expansion) */
  type?: SeriesType;

  /* allow null gaps to be connected */
  connectNulls?: boolean;

  /* value formatter used by tooltip */
  formatter?: (value: number | null | undefined) => string;

  /* optional per-series line color */
  stroke?: string;
};

export type TooltipValueRow = {
  label: string;
  value: string;
};

export type YDomainMode = "auto" | "tight" | "zeroBased";

export type TrendChartCardProps = {
  title: string;
  subtitle?: string;
  data: ChartDatum[];
  series: ChartSeriesConfig[];

  xKey?: string;
  height?: number;
  yDomainMode?: YDomainMode;

  valueFormatter?: (
    value: number | null | undefined,
    seriesKey?: string
  ) => string;

  xLabelFormatter?: (label: string) => string;
  tooltipLabelFormatter?: (label: string, datum?: ChartDatum) => string;

  emptyMessage?: string;
};