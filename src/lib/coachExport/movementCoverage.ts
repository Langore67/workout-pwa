import type { Exercise, Session, SetEntry, Track } from "../../db";
import { buildTrainingExposureContext, type MovementExposure, type TrainingExposureContext } from "../../domain/training/trainingExposureContext";
import { formatAnchorMovementFamilyLabel } from "./anchorIntelligence";
import type { CoachExportAnchorLift, CoachExportWeeklyVolume, MovementCoverageEntry, MovementCoverageFamily, MovementCoverageStatus, MovementCoverageSummary } from "./types";

const FAMILIES: MovementCoverageFamily[] = ["horizontal_push", "vertical_push", "horizontal_pull", "vertical_pull", "squat", "hinge", "single_leg", "glute_extension", "hip_stability", "carry", "core"];
const familyLabel = (family: MovementCoverageFamily) => family === "hip_stability" ? "Hip Stability" : formatAnchorMovementFamilyLabel(family);
function compatibleFamily(pattern: string): MovementCoverageFamily | undefined {
  const value = pattern.trim().toLowerCase().replace(/[ -]+/g, "_");
  if (FAMILIES.includes(value as MovementCoverageFamily)) return value as MovementCoverageFamily;
  if (value === "push") return "horizontal_push";
  if (value === "pull") return "vertical_pull";
  if (value === "lunge") return "single_leg";
  return undefined;
}
function statusFor(row?: MovementExposure): MovementCoverageStatus {
  if (!row || (!row.qualifyingSets && !row.controlExposures)) return "missing";
  if (row.qualifyingSets >= 9 && row.sessionCount >= 2) return "strong";
  if (row.qualifyingSets >= 4 || row.controlExposures >= 2 || row.sessionCount >= 2) return "covered";
  return "developing";
}

/** Compatibility projection over shared factual rolling-14-day exposure. */
export function buildMovementCoverage(args: {
  sessions: Session[]; sets: SetEntry[]; tracks: Track[]; exercises: Exercise[];
  weeklyVolume?: CoachExportWeeklyVolume; anchorIntelligence: CoachExportAnchorLift[];
  constraintSignals?: string[]; trainingExposure?: TrainingExposureContext; asOf: number;
}): MovementCoverageSummary {
  void args.weeklyVolume; void args.constraintSignals;
  const exposure = args.trainingExposure ?? buildTrainingExposureContext({ sessions: args.sessions, sets: args.sets, tracks: args.tracks, exercises: args.exercises, asOf: args.asOf });
  const window = exposure.windows.rolling14Days;
  const rows = new Map<MovementCoverageFamily, MovementExposure>();
  for (const item of window.movementPatterns) {
    const family = compatibleFamily(item.movementPattern);
    if (!family) continue;
    const old = rows.get(family);
    rows.set(family, old ? { movementPattern: family, qualifyingSets: old.qualifyingSets + item.qualifyingSets, workingSets: old.workingSets + item.workingSets, dropSets: old.dropSets + item.dropSets, failureSets: old.failureSets + item.failureSets, controlExposures: old.controlExposures + item.controlExposures, sessionCount: Math.max(old.sessionCount, item.sessionCount), distinctCanonicalExerciseCount: old.distinctCanonicalExerciseCount + item.distinctCanonicalExerciseCount, latestExposureAt: Math.max(old.latestExposureAt ?? 0, item.latestExposureAt ?? 0), limitations: [...new Set([...old.limitations, ...item.limitations])] } : item);
  }
  const entries: MovementCoverageEntry[] = FAMILIES.map((family) => {
    const row = rows.get(family); const anchor = args.anchorIntelligence.find((item) => item.movementFamily === family && item.exerciseName);
    const count = row?.qualifyingSets ?? 0; const controls = row?.controlExposures ?? 0;
    return { family, label: familyLabel(family), status: statusFor(row), lastPerformedDate: row?.latestExposureAt ? new Date(row.latestExposureAt).toISOString() : undefined, ageDays: row?.latestExposureAt ? Math.floor(Math.max(0, exposure.generatedAt - row.latestExposureAt) / 86400000) : undefined, performanceAnchor: anchor?.exerciseName ? { legacyCategory: anchor.pattern, exerciseName: anchor.exerciseName, date: anchor.performedAt != null ? new Date(anchor.performedAt).toISOString() : undefined, ageDays: anchor.ageDays ?? undefined, status: anchor.benchmarkStatus, e1rm: anchor.e1rm ?? undefined } : undefined, relationship: anchor?.exerciseName ? "anchor_only" : "none", effectiveSets7d: count, directEffectiveSets7d: count, supportEffectiveSets7d: 0, controlExposures7d: controls, sessionCount7d: row?.sessionCount ?? 0, contributingExercises: [], summary: `${familyLabel(family)}: ${count} qualifying set${count === 1 ? "" : "s"} and ${controls} control exposure${controls === 1 ? "" : "s"} in the rolling 14-day compatibility window.`, interpretation: "Compatibility-only status projected from shared factual Training Exposure.", context: row?.limitations.length ? row.limitations.join(" ") : undefined };
  });
  const missingFamilies = entries.filter((x) => x.status === "missing").map((x) => x.label);
  const developingFamilies = entries.filter((x) => x.status === "developing").map((x) => x.label);
  const coveredFamilies = entries.filter((x) => x.status === "covered" || x.status === "strong").map((x) => x.label);
  return { asOf: new Date(exposure.generatedAt).toISOString(), volumeWindowDays: 14, recencyWindowDays: 14, status: entries.every((x) => x.status === "missing") ? "not_enough_data" : "watch", entries, missingFamilies, developingFamilies, coveredFamilies, summary: "Compatibility-only movement statuses projected from the shared rolling 14-day Training Exposure context.", source: "training_exposure_rolling_14_days", compatibilityOnly: true, periodKind: "rolling_14_days", isCompleteCalendarPeriod: false };
}
