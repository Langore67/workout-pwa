import type { StrengthSignalV2Result } from "../../strength/v2/computeStrengthSignalV2";

export type AnchorDiagnosticsRow = {
  pattern: string;
  selectionLabel: string | null;
  reason: string | null;
  selectionSummary: string | null;
  configuredExerciseName: string | null;
  unresolvedReason: string | null;
};

function capitalize(value: string) {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatAnchorPatternLabel(value: string) {
  switch (value) {
    case "horizontalPush":
      return "Horizontal Push";
    case "verticalPush":
      return "Vertical Push";
    case "horizontalPull":
      return "Horizontal Pull";
    case "verticalPull":
      return "Vertical Pull";
    default:
      return capitalize(value);
  }
}

function formatAnchorPatternNeed(value: string) {
  switch (value) {
    case "horizontalPush":
      return "horizontal push";
    case "verticalPush":
      return "vertical push";
    case "horizontalPull":
      return "horizontal pull";
    case "verticalPull":
      return "vertical pull";
    default:
      return value.toLowerCase();
  }
}

function formatAnchorReason(value: string | null | undefined) {
  switch (value) {
    case "configured_match":
      return "Selected from your configured anchor";
    case "primary_auto_selected":
      return "Selected from your recent performance";
    case "conditional_auto_selected":
      return "Selected from recent matching work";
    default:
      return null;
  }
}

function formatAnchorSelectionSummary(
  selectionSource: "CONFIGURED" | "AUTO_SELECTED" | null | undefined,
  confidence: string | null | undefined
) {
  const sourceLabel =
    selectionSource === "CONFIGURED"
      ? "Configured"
      : selectionSource === "AUTO_SELECTED"
        ? "Auto"
        : null;
  const confidenceLabel = confidence ? `${capitalize(confidence.toLowerCase())} confidence` : null;

  if (sourceLabel && confidenceLabel) return `${sourceLabel} • ${confidenceLabel}`;
  return sourceLabel ?? confidenceLabel;
}

export function buildAnchorDiagnosticsRows(
  result: StrengthSignalV2Result | null | undefined
): AnchorDiagnosticsRow[] {
  if (!result) return [];

  const patterns =
    result.phase === "bulk"
      ? [
          "squat",
          "hinge",
          "horizontalPush",
          "verticalPush",
          "horizontalPull",
          "verticalPull",
          "carry",
        ]
      : ["push", "pull", "hinge", "squat"];

  return patterns.map((pattern) => {
    const anchor = result.anchors[pattern as keyof typeof result.anchors];
    return {
      pattern: formatAnchorPatternLabel(pattern),
      selectionLabel: anchor?.exerciseName ?? null,
      reason: formatAnchorReason(anchor?.reason),
      selectionSummary: formatAnchorSelectionSummary(anchor?.selectionSource, anchor?.confidence),
      configuredExerciseName: anchor?.configuredExerciseName ?? null,
      unresolvedReason:
        anchor?.exerciseName || anchor?.reason
          ? null
          : `Needs recent matching ${formatAnchorPatternNeed(pattern)} work`,
    };
  });
}
