import type { TemplateItem, Track } from "../db";

export type SetKind = "warmup" | "working" | "drop" | "failure";

export type ExerciseSpec = {
  id: string;

  // How the header should label / badge this lift
  header?: (ctx: { track: Track; item: TemplateItem; repMin: number; repMax: number; warmupTarget: number; workingTarget: number }) => {
    subtitle?: string;
    badgeText?: string;
    showTargetsBadge?: boolean;
  };

  // Rest defaults per lift (Bench might be 150s, accessories 90s, etc.)
  defaultRestSec?: number;

  // Previous column strategy (you’re using working-index right now; keep it)
  previousMode?: "byWorkingIndex" | "none";

  // Set type policy
  allowSetTypes?: SetKind[]; // bench may allow warmup/working/drop/failure, others might restrict
  autoRirForFailure?: boolean;

  // Optional: tweak addSet behavior for this lift
  addSetClonePolicy?: "cloneLastNonWarmup" | "cloneLastAny";
};

export function pickExerciseSpec(track: Track): ExerciseSpec {
  const name = (track.displayName ?? "").toLowerCase();

  // Bench spec (start here)
  if (name.includes("bench") && name.includes("barbell")) {
    return {
      id: "bench_barbell",
      defaultRestSec: 150,
      previousMode: "byWorkingIndex",
      allowSetTypes: ["warmup", "working", "drop", "failure"],
      autoRirForFailure: true,
      addSetClonePolicy: "cloneLastNonWarmup",
      header: ({ repMin, repMax, warmupTarget, workingTarget }) => ({
        subtitle: `Rep range ${repMin}–${repMax} • targets WU ${warmupTarget} / WK ${workingTarget}`,
        badgeText: "primary",
        showTargetsBadge: true,
      }),
    };
  }

  // Default spec
  return {
    id: "default",
    defaultRestSec: 120,
    previousMode: "byWorkingIndex",
    allowSetTypes: ["warmup", "working", "drop", "failure"],
    autoRirForFailure: true,
    addSetClonePolicy: "cloneLastNonWarmup",
  };
}
