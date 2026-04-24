/* ============================================================================
   strengthSignalV2AnchorConfig.ts
   ----------------------------------------------------------------------------
   Purpose
   - Expose the hardcoded Strength Signal v2 phase anchor model as inspectable config
   - Keep phase-specific anchor definitions centralized and testable
   - Preserve current CUT / MAINTAIN / BULK behavior exactly
   ============================================================================ */

import type { CurrentPhase } from "../../config/appConfig";
import type {
  StrengthSignalV2BulkPattern,
  StrengthSignalV2CutMaintainPattern,
  StrengthSignalV2Pattern,
} from "./computeStrengthSignalV2";

export type StrengthSignalV2AnchorDefinitionConfig = {
  pattern: StrengthSignalV2Pattern;
  allowedSubtypes: string[];
};

const CUT_MAINTAIN_PATTERNS: StrengthSignalV2CutMaintainPattern[] = [
  "push",
  "pull",
  "hinge",
  "squat",
];

const BULK_PATTERNS: StrengthSignalV2BulkPattern[] = [
  "squat",
  "hinge",
  "horizontalPush",
  "verticalPush",
  "verticalPull",
  "horizontalPull",
  "carry",
];

const SLOT_SUBTYPES: Record<StrengthSignalV2Pattern, string[]> = {
  push: ["horizontalPush", "verticalPush"],
  pull: ["horizontalPull", "verticalPull"],
  hinge: ["hinge"],
  squat: ["squat"],
  horizontalPush: ["horizontalPush"],
  verticalPush: ["verticalPush"],
  verticalPull: ["verticalPull"],
  horizontalPull: ["horizontalPull"],
  carry: ["carry"],
};

export function getStrengthSignalV2AnchorDefinitions(
  phaseRaw: CurrentPhase | unknown
): StrengthSignalV2AnchorDefinitionConfig[] {
  const phase = phaseRaw === "bulk" ? "bulk" : "cut";
  const patterns = phase === "bulk" ? BULK_PATTERNS : CUT_MAINTAIN_PATTERNS;

  return patterns.map((pattern) => ({
    pattern,
    allowedSubtypes: SLOT_SUBTYPES[pattern],
  }));
}

/* ============================================================================
   FOOTER
   FILE: src/strength/v2/strengthSignalV2AnchorConfig.ts
   ============================================================================ */
