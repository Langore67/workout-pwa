import type { ProfileGoalsV1 } from "../../profile/profileGoals";
import type { CoachExportMetric, CoachExportWaistToHeight } from "./types";

export type GoalProgressStatus = "Reached" | "On Track" | "Watch" | "Not Available";

export type GoalProgressRow = {
  label: "Weight" | "Body Fat" | "Waist" | "Visceral Fat" | "Waist-to-Height Ratio";
  current: number;
  target: number;
  remaining: number;
  unit: "lb" | "pts" | "in" | "" | "ratio";
  status: GoalProgressStatus;
};

export type GoalProgress = {
  rows: GoalProgressRow[];
  status: GoalProgressStatus;
};

type GoalProgressInput = {
  goals: ProfileGoalsV1;
  bodyComp: {
    weight: CoachExportMetric;
    waist: CoachExportMetric;
    bodyFatPct: CoachExportMetric;
    visceralFat?: CoachExportMetric;
    waistToHeight?: CoachExportWaistToHeight;
  };
};

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function buildRow(
  label: GoalProgressRow["label"],
  current: number | null | undefined,
  target: number | null | undefined,
  unit: GoalProgressRow["unit"]
): GoalProgressRow | null {
  if (!finite(current) || !finite(target)) return null;
  const remaining = current - target;

  return {
    label,
    current,
    target,
    remaining,
    unit,
    status: remaining <= 0 ? "Reached" : "On Track",
  };
}

function buildStatus(input: GoalProgressInput, rows: GoalProgressRow[]): GoalProgressStatus {
  if (!rows.length) return "Not Available";
  if (rows.every((row) => row.status === "Reached")) return "Reached";

  const weightDelta = input.bodyComp.weight.delta14d;
  const waistDelta = input.bodyComp.waist.delta14d;
  const visceralDelta = input.bodyComp.visceralFat?.delta14d;

  if (finite(weightDelta) && weightDelta < 0) {
    if (finite(waistDelta)) return waistDelta < 0 ? "On Track" : "Watch";
    if (finite(visceralDelta) && visceralDelta < 0) return "On Track";
    return "On Track";
  }

  return "Watch";
}

export function buildGoalProgress(input: GoalProgressInput): GoalProgress {
  const rows = [
    buildRow("Weight", input.bodyComp.weight.latest, input.goals.targetWeightLb, "lb"),
    buildRow("Body Fat", input.bodyComp.bodyFatPct.latest, input.goals.targetBodyFatPct, "pts"),
    buildRow("Waist", input.bodyComp.waist.latest, input.goals.targetWaistIn, "in"),
    buildRow(
      "Visceral Fat",
      input.bodyComp.visceralFat?.latest,
      input.goals.targetVisceralFatEstimate,
      ""
    ),
    buildRow(
      "Waist-to-Height Ratio",
      input.bodyComp.waistToHeight?.latest,
      input.bodyComp.waistToHeight ? 0.5 : undefined,
      "ratio"
    ),
  ].filter((row): row is GoalProgressRow => row != null);

  return {
    rows,
    status: buildStatus(input, rows),
  };
}
