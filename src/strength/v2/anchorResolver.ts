/* ============================================================================
   anchorResolver.ts
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-04-23-ANCHOR-RESOLVER-02
   FILE: src/strength/v2/anchorResolver.ts

   Purpose
   - Centralize anchor definition, matching, and ranking logic
   - Prepare for shared anchor resolution engine
   - Non-breaking extraction from computeStrengthSignalV2

   Notes
   - This helper owns slot definitions and anchor match ranking
   - It does not select sets or compute e1RM
   ============================================================================ */

import type { CurrentPhase } from "../../config/appConfig";
import { normalizeName, type Exercise, type Track } from "../../db";
import type { StrengthSignalV2Pattern } from "./computeStrengthSignalV2";
import { getStrengthSignalV2AnchorDefinitions } from "./strengthSignalV2AnchorConfig";

export type AnchorDefinition = {
  pattern: StrengthSignalV2Pattern;
  allowedSubtypes: string[];
  configuredExerciseIds: string[];
};

function configValueToTerms(value: unknown): string[] {
  if (!value) return [];

  if (typeof value === "string") return [value];

  if (Array.isArray(value)) {
    return value.flatMap(configValueToTerms);
  }

  if (typeof value === "object") {
    const raw = value as any;
    return [raw.exerciseId, raw.id, raw.exerciseName, raw.name]
      .map((term) => String(term ?? "").trim())
      .filter(Boolean);
  }

  return [];
}

function getPhaseSlotOverride(
  config: any,
  phase: CurrentPhase,
  pattern: StrengthSignalV2Pattern
): unknown {
  const phaseConfig = config?.strengthSignalV2Config?.phases?.[phase];
  if (phaseConfig && Object.prototype.hasOwnProperty.call(phaseConfig, pattern)) {
    return phaseConfig[pattern];
  }

  const legacyPhaseConfig = config?.v2Anchors?.byPhase?.[phase];
  if (legacyPhaseConfig && Object.prototype.hasOwnProperty.call(legacyPhaseConfig, pattern)) {
    return legacyPhaseConfig[pattern];
  }

  if (phase === "bulk") return config?.v2Anchors?.bulk?.[pattern];
  return config?.v2Anchors?.cutMaintain?.[pattern];
}

export function buildAnchorDefinitions(
  phase: CurrentPhase,
  config: any
): AnchorDefinition[] {
  return getStrengthSignalV2AnchorDefinitions(phase).map((definition) => {
    const configured = getPhaseSlotOverride(config, phase, definition.pattern);
    const configuredTerms = configValueToTerms(configured);

    return {
      pattern: definition.pattern,
      allowedSubtypes: definition.allowedSubtypes,
      configuredExerciseIds: configuredTerms,
    };
  });
}

export function exerciseIdsForMatch(exercise: Exercise, track: Track): string[] {
  return [exercise.id, track.exerciseId]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
}

export function exerciseNamesForMatch(exercise: Exercise, track: Track): string[] {
  return [
    exercise.normalizedName,
    exercise.name,
    track.displayName,
  ]
    .map((value) => normalizeName(String(value ?? "")))
    .filter(Boolean);
}

export function anchorMatchRank(
  definition: AnchorDefinition,
  exercise: Exercise,
  track: Track
): number | null {
  const configuredIds = definition.configuredExerciseIds;
  const ids = exerciseIdsForMatch(exercise, track);
  const configuredNames = configuredIds.map((value) => normalizeName(value)).filter(Boolean);
  const names = exerciseNamesForMatch(exercise, track);

  const eligibility = String((exercise as any)?.anchorEligibility ?? "")
    .trim()
    .toLowerCase();

  if (eligibility !== "primary" && eligibility !== "conditional") return null;

  const subtypes = Array.isArray((exercise as any)?.anchorSubtypes)
    ? (exercise as any).anchorSubtypes
        .map((value: unknown) => String(value ?? "").trim())
        .filter(Boolean)
    : [];

  if (!subtypes.some((subtype: string) => definition.allowedSubtypes.includes(subtype))) {
    return null;
  }

  if (configuredIds.length && configuredIds.some((id) => ids.includes(id))) {
    return 1;
  }

  if (configuredNames.length && configuredNames.some((name) => names.includes(name))) {
    return 1;
  }

  if (eligibility === "primary") return 2;

  return 3;
}

/* ============================================================================
   FOOTER
   FILE: src/strength/v2/anchorResolver.ts
   ============================================================================ */
