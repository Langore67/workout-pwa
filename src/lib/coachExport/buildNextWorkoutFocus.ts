import type {
  CoachExportNextWorkoutFocus,
  CoachExportTrainingSignals,
  PatternSummary,
} from "./types";
import type { PhaseQualityResult } from "../../body/phaseQualityModel";

function uniqueCompact(values: Array<string | null | undefined>, limit = 3): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const value = String(raw ?? "").replace(/\s+/g, " ").trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= limit) break;
  }
  return out;
}

function collectSignalText(args: {
  trainingSignals: CoachExportTrainingSignals;
  patternSummary: PatternSummary;
  phaseQuality: PhaseQualityResult | null;
}) {
  const phaseStatus = String(args.phaseQuality?.finalStatus ?? "");
  const phaseDrivers = args.phaseQuality?.drivers ?? [];
  const signalText = [
    ...args.trainingSignals.movementQuality,
    ...args.trainingSignals.stimulusCoverage,
    ...args.trainingSignals.fatigueReadiness,
    ...args.trainingSignals.nextWorkoutFocus,
    ...args.trainingSignals.discussWithGaz,
    ...args.patternSummary.movementQuality,
    ...args.patternSummary.stimulus,
    ...args.patternSummary.fatigue,
    ...args.patternSummary.constraints,
    ...args.patternSummary.progression,
    phaseStatus,
    ...phaseDrivers,
  ]
    .join(" | ")
    .toLowerCase();

  return { phaseStatus, phaseDrivers, signalText };
}

export function buildNextWorkoutFocus(args: {
  trainingSignals: CoachExportTrainingSignals;
  patternSummary: PatternSummary;
  phaseQuality: PhaseQualityResult | null;
}): CoachExportNextWorkoutFocus {
  const { phaseStatus, phaseDrivers, signalText } = collectSignalText(args);
  const progressionGuardrails: string[] = [];
  const executionPriorities: string[] = [];
  const adjustmentTriggers: string[] = [];

  const hasAggressiveCutRisk =
    /aggressive cut|muscle-risk cut/i.test(phaseStatus) ||
    phaseDrivers.some((driver) => /aggressive cut|muscle-risk cut/i.test(driver));

  const hasLaterSetFatigue =
    /fatigue consistently appears at terminal reps|terminal reps|terminal-rep quality|reduced capacity|later sets/i.test(
      signalText
    );

  const hasJointFeedback =
    /shoulder sensitivity|shoulder twinge|joint feedback|elbow pain|pain|twinge/i.test(
      signalText
    );

  if (hasAggressiveCutRisk || hasLaterSetFatigue) {
    progressionGuardrails.push(
      hasAggressiveCutRisk && hasLaterSetFatigue
        ? "Keep progression conservative given aggressive-cut risk and recent later-set fatigue."
        : hasAggressiveCutRisk
          ? "Keep progression conservative given aggressive-cut risk."
          : "Keep progression conservative given recent later-set fatigue."
    );
  }

  if (hasJointFeedback) {
    progressionGuardrails.push(
      "Avoid increasing load on movements that already show joint feedback or shoulder sensitivity."
    );
    adjustmentTriggers.push(
      "Stop or modify a movement if shoulder, elbow, or other joint feedback appears."
    );
  }

  if (hasLaterSetFatigue) {
    adjustmentTriggers.push(
      "Reduce volume if later-set fatigue or terminal-rep quality drop appears early."
    );
  }

  if (/lat dominance|lat engagement improving|pulling movements show improving consistency|pull stimulus/i.test(signalText)) {
    executionPriorities.push(
      "Preserve known pulling setup constraints when selecting or progressing work."
    );
  }

  if (
    /medial delt|lateral delt|shoulder isolation inconsistent|isolation movements are not yet stable|isolation movements are not yet repeatable/i.test(
      signalText
    )
  ) {
    executionPriorities.push(
      "Treat repeated isolation inconsistency as a movement-quality constraint."
    );
  }

  if (/trap compensation|trap involvement/i.test(signalText)) {
    executionPriorities.push(
      "Treat trap compensation as a carry or upper-back execution constraint."
    );
  }

  return {
    progressionGuardrails: uniqueCompact(progressionGuardrails, 3),
    executionPriorities: uniqueCompact(executionPriorities, 3),
    adjustmentTriggers: uniqueCompact(adjustmentTriggers, 3),
  };
}
