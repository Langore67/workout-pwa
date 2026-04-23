// src/strength/performanceAnchorContext.ts
/* ============================================================================
   BUILD_ID: 2026-04-22-PERF-ANCHOR-CONTEXT-01
   FILE: src/strength/performanceAnchorContext.ts

   Purpose
   - Resolve Performance-page anchor IDs and labels from Strength Signal v2 output
   - Keep Performance anchor logic out of PerformanceDashboardPage.tsx

   Notes
   - Anchor identity comes from computeStrengthSignalV2(), not raw config.
   ============================================================================ */

import type { Exercise } from "../db";
import type {
  StrengthSignalV2AnchorResult,
  StrengthSignalV2Result,
} from "./v2/computeStrengthSignalV2";

/* ============================================================================
   Breadcrumb 1 — Types
   ============================================================================ */

export type PerformanceAnchorMovement = "push" | "pull" | "squat" | "hinge";
type PerformanceAnchorIdValue = string | string[] | null;

type AnchorExerciseSource = {
  exercises?: Array<Pick<Exercise, "id" | "name">>;
} | null;

/* ============================================================================
   Breadcrumb 2 — Small helpers
   ============================================================================ */

function cleanResolvedAnchorId(anchor: StrengthSignalV2AnchorResult | null | undefined): string | null {
  const id = String(anchor?.exerciseId ?? "").trim();
  return id || null;
}

function anchorIds(...anchors: Array<StrengthSignalV2AnchorResult | null | undefined>): PerformanceAnchorIdValue {
  const ids = anchors.map(cleanResolvedAnchorId).filter((id): id is string => !!id);
  if (!ids.length) return null;
  return ids.length === 1 ? ids[0] : ids;
}

/* ============================================================================
   Breadcrumb 3 — Public helpers
   ============================================================================ */

export function getPerformanceAnchorIdsFromStrengthSignalV2(
  result: StrengthSignalV2Result | null | undefined
): Partial<Record<PerformanceAnchorMovement, PerformanceAnchorIdValue>> {
  const anchors = result?.anchors ?? {};

  if (result?.phase === "bulk") {
    return {
      push: anchorIds(
        anchors.horizontalPush ?? null,
        anchors.verticalPush ?? null
      ),
      pull: anchorIds(
        anchors.horizontalPull ?? null,
        anchors.verticalPull ?? null
      ),
      squat: anchorIds(anchors.squat ?? null),
      hinge: anchorIds(anchors.hinge ?? null),
    };
  }

  return {
    push: anchorIds(anchors.push ?? null),
    pull: anchorIds(anchors.pull ?? null),
    squat: anchorIds(anchors.squat ?? null),
    hinge: anchorIds(anchors.hinge ?? null),
  };
}

export function getSelectedAnchorLabelsByPattern(
  source: AnchorExerciseSource,
  selectedAnchorIdsByPattern?: Partial<Record<PerformanceAnchorMovement, PerformanceAnchorIdValue>>,
  options: {
    formatLabel?: (value: string) => string;
  } = {}
): Partial<Record<PerformanceAnchorMovement, string | null>> {
  const empty: Partial<Record<PerformanceAnchorMovement, string | null>> = {
    push: null,
    pull: null,
    squat: null,
    hinge: null,
  };

  if (!source?.exercises?.length || !selectedAnchorIdsByPattern) return empty;

  const formatLabel = options.formatLabel ?? ((value: string) => value);
  const exerciseById = new Map(
    source.exercises.map((exercise) => [exercise.id, exercise] as const)
  );

  const labelFor = (value: PerformanceAnchorIdValue): string | null => {
    const ids = Array.isArray(value) ? value : value ? [value] : [];
    const labels = ids
      .map((id) => formatLabel(exerciseById.get(id)?.name ?? ""))
      .filter(Boolean);

    return labels.length ? labels.join(" / ") : null;
  };

  return {
    push: labelFor(selectedAnchorIdsByPattern.push ?? null),
    pull: labelFor(selectedAnchorIdsByPattern.pull ?? null),
    squat: labelFor(selectedAnchorIdsByPattern.squat ?? null),
    hinge: labelFor(selectedAnchorIdsByPattern.hinge ?? null),
  };
}

/* ============================================================================
   FOOTER COMMENT
   FILE: src/strength/performanceAnchorContext.ts
   ============================================================================ */
