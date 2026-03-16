// src/components/charts/chartDomain.ts
/* ============================================================================
   chartDomain.ts — Shared chart domain helpers
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-03-15-CHARTS-02
   FILE: src/components/charts/chartDomain.ts

   Purpose
   - Provide shared helpers for chart value extraction and Y-axis domain
     calculation across IronForge trend charts
   - Keep domain logic centralized so Strength, MPS, and future Body Comp
     charts all scale consistently
   ============================================================================ */

import type { ChartDatum, ChartSeriesConfig, YDomainMode } from "./chartTypes";

/* ============================================================================
   Breadcrumb 1 — Numeric extraction
   ----------------------------------------------------------------------------
   What this section does
   - Pulls numeric values from all configured series across a dataset

   Why this matters
   - Domain calculations must consider every visible series
   - Avoids duplicating extraction logic in individual chart pages
   ============================================================================ */

export function getSeriesValues(
  data: ChartDatum[],
  series: ChartSeriesConfig[]
): number[] {
  const keys = series.map((s) => s.key);
  const values: number[] = [];

  for (const row of data) {
    for (const key of keys) {
      const raw = row[key];

      if (typeof raw === "number" && Number.isFinite(raw)) {
        values.push(raw);
      }
    }
  }

  return values;
}

/* ============================================================================
   Breadcrumb 2 — Domain padding helpers
   ----------------------------------------------------------------------------
   What this section does
   - Computes a padded Y-axis domain from numeric values
   - Supports several padding strategies for different chart styles

   Modes
   - auto      → balanced padding above and below
   - tight     → minimal padding for dense charts
   - zeroBased → always anchor the lower bound at zero

   Why this matters
   - Prevents lines from hugging the chart edges
   - Keeps zoomed or windowed charts readable
   - Ensures multi-series charts scale correctly
   ============================================================================ */

export function getPaddedDomain(
  values: number[],
  mode: YDomainMode = "auto"
): [number, number] {
  if (!values.length) return [0, 10];

  const min = Math.min(...values);
  const max = Math.max(...values);

  if (min === max) {
    const pad = Math.max(1, Math.abs(min) * 0.05 || 1);
    return [min - pad, max + pad];
  }

  if (mode === "zeroBased") {
    const pad = Math.max((max - min) * 0.08, 1);
    return [0, Math.ceil(max + pad)];
  }

  if (mode === "tight") {
    const pad = Math.max((max - min) * 0.04, 0.5);
    return [Math.floor(min - pad), Math.ceil(max + pad)];
  }

  // default auto
  const pad = Math.max((max - min) * 0.08, 0.5);
  return [Math.floor(min - pad), Math.ceil(max + pad)];
}