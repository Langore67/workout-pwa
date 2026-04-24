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
export type PerformanceAnchorSelection = {
  anchorId: string;
  reason: string | null;
};

type PerformanceAnchorSelectionValue = PerformanceAnchorSelection | PerformanceAnchorSelection[] | null;
type PerformanceAnchorIdValue = string | string[] | null;

type AnchorExerciseSource = {
  exercises?: Array<Pick<Exercise, "id" | "name">>;
} | null;

/* ============================================================================
   Breadcrumb 2 — Small helpers
   ============================================================================ */

function cleanResolvedAnchorSelection(
  anchor: StrengthSignalV2AnchorResult | null | undefined
): PerformanceAnchorSelection | null {
  const anchorId = String(anchor?.anchorId ?? "").trim();
  if (!anchorId) return null;
  return {
    anchorId,
    reason: anchor?.reason ?? null,
  };
}

function anchorSelections(
  ...anchors: Array<StrengthSignalV2AnchorResult | null | undefined>
): PerformanceAnchorSelectionValue {
  const selections = anchors
    .map(cleanResolvedAnchorSelection)
    .filter((selection): selection is PerformanceAnchorSelection => !!selection);
  if (!selections.length) return null;
  return selections.length === 1 ? selections[0] : selections;
}

function cleanResolvedAnchorId(value: PerformanceAnchorSelectionValue): PerformanceAnchorIdValue {
  if (!value) return null;
  if (Array.isArray(value)) {
    const ids = value
      .map((selection) => String(selection.anchorId ?? "").trim())
      .filter((id): id is string => !!id);
    if (!ids.length) return null;
    return ids.length === 1 ? ids[0] : ids;
  }

  const id = String(value.anchorId ?? "").trim();
  return id || null;
}

/* ============================================================================
   Breadcrumb 3 — Public helpers
   ============================================================================ */

export function getPerformanceAnchorSelectionsFromStrengthSignalV2(
  result: StrengthSignalV2Result | null | undefined
): Partial<Record<PerformanceAnchorMovement, PerformanceAnchorSelectionValue>> {
  const anchors = result?.anchors ?? {};

  if (result?.phase === "bulk") {
    return {
      push: anchorSelections(
        anchors.horizontalPush ?? null,
        anchors.verticalPush ?? null
      ),
      pull: anchorSelections(
        anchors.horizontalPull ?? null,
        anchors.verticalPull ?? null
      ),
      squat: anchorSelections(anchors.squat ?? null),
      hinge: anchorSelections(anchors.hinge ?? null),
    };
  }

  return {
    push: anchorSelections(anchors.push ?? null),
    pull: anchorSelections(anchors.pull ?? null),
    squat: anchorSelections(anchors.squat ?? null),
    hinge: anchorSelections(anchors.hinge ?? null),
  };
}

export function getPerformanceAnchorIdsFromStrengthSignalV2(
  result: StrengthSignalV2Result | null | undefined
): Partial<Record<PerformanceAnchorMovement, PerformanceAnchorIdValue>> {
  const selections = getPerformanceAnchorSelectionsFromStrengthSignalV2(result);
  return {
    push: cleanResolvedAnchorId(selections.push ?? null),
    pull: cleanResolvedAnchorId(selections.pull ?? null),
    squat: cleanResolvedAnchorId(selections.squat ?? null),
    hinge: cleanResolvedAnchorId(selections.hinge ?? null),
  };
}

export function getSelectedAnchorLabelsByPattern(
  source: AnchorExerciseSource,
  selectedAnchorsByPattern?: Partial<Record<PerformanceAnchorMovement, PerformanceAnchorSelectionValue>>,
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

  if (!source?.exercises?.length || !selectedAnchorsByPattern) return empty;

  const formatLabel = options.formatLabel ?? ((value: string) => value);
  const exerciseById = new Map(
    source.exercises.map((exercise) => [exercise.id, exercise] as const)
  );

  const labelFor = (value: PerformanceAnchorSelectionValue): string | null => {
    const anchorIds = cleanResolvedAnchorId(value);
    const ids = Array.isArray(anchorIds) ? anchorIds : anchorIds ? [anchorIds] : [];
    const labels = ids
      .map((id) => formatLabel(exerciseById.get(id)?.name ?? ""))
      .filter(Boolean);

    return labels.length ? labels.join(" / ") : null;
  };

  return {
    push: labelFor(selectedAnchorsByPattern.push ?? null),
    pull: labelFor(selectedAnchorsByPattern.pull ?? null),
    squat: labelFor(selectedAnchorsByPattern.squat ?? null),
    hinge: labelFor(selectedAnchorsByPattern.hinge ?? null),
  };
}

/* ============================================================================
   FOOTER COMMENT
   FILE: src/strength/performanceAnchorContext.ts
   ============================================================================ */
