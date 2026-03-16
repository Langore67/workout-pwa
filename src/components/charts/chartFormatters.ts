// src/components/charts/chartFormatters.ts
/* ============================================================================
   chartFormatters.ts — Shared chart formatters
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-03-14-CHARTS-01
   FILE: src/components/charts/chartFormatters.ts
   ============================================================================ */

export function formatDefaultNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value}`;
}

export function formatOneDecimal(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toFixed(1);
}

export function formatTwoDecimals(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toFixed(2);
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}%`;
}

export function formatLbs(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)} lb`;
}

export function formatInches(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)} in`;
}