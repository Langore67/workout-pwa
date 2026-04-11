import type { Exercise, MetricMode } from "../../db";
import {
  buildExerciseResolverIndex,
  resolveExerciseFromIndex,
} from "../exercises/exerciseResolver";
import { isBodyweightEffectiveLoadExerciseName } from "../../strength/Strength";

export type ExerciseHistoryExportRow = {
  dateLabel?: string;
  templateName?: string;
  totalVolume?: number;
  bestSetLabel?: string;
  bestE1rm?: number;
  maxReps?: number;
  usedBodyweightEffective?: boolean;
  usedAssisted?: boolean;
  completedSetLabels?: string[];
};

export function formatSignedBodyweightToken(weightRaw: unknown): string {
  const weight = Number(weightRaw);
  if (!Number.isFinite(weight) || weight === 0) return "BW";
  return weight > 0 ? `BW+${weight}` : `BW${weight}`;
}

export function formatExerciseHistorySetLabel(params: {
  set: any;
  metricMode: MetricMode;
  isBodyweightEffective: boolean;
}): string | null {
  const { set, metricMode, isBodyweightEffective } = params;
  const weight = Number(set?.weight);
  const reps = Number(set?.reps);
  const rir = Number(set?.rir);
  const seconds = Number((set as any)?.seconds);
  const distance = Number((set as any)?.distance);
  const distanceUnit = (((set as any)?.distanceUnit as string | undefined) ?? "m").trim();

  const loadLabel =
    isBodyweightEffective && (Number.isFinite(weight) || weight === 0)
      ? formatSignedBodyweightToken(weight)
      : Number.isFinite(weight)
        ? `${weight}`
        : null;

  if (metricMode === "time") {
    const mmss =
      Number.isFinite(seconds) && seconds > 0
        ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
        : null;
    if (!mmss) return loadLabel ? `${loadLabel}` : null;
    return loadLabel ? `${loadLabel} • ${mmss}` : mmss;
  }

  if (metricMode === "distance") {
    const distanceLabel = Number.isFinite(distance) && distance > 0 ? `${distance} ${distanceUnit}` : null;
    if (!distanceLabel) return loadLabel ? `${loadLabel}` : null;
    return loadLabel ? `${loadLabel} • ${distanceLabel}` : distanceLabel;
  }

  const parts: string[] = [];
  if (loadLabel) parts.push(loadLabel);
  if (Number.isFinite(reps) && reps > 0) {
    if (parts.length) parts.push(`x ${reps}`);
    else parts.push(`${reps} reps`);
  }
  if (Number.isFinite(rir)) parts.push(`@${rir}`);
  return parts.length ? parts.join(" ") : null;
}

function normalizeMetricMode(v: any): MetricMode {
  return v === "distance" || v === "time" ? v : "reps";
}

function prettyMetricLabel(m: MetricMode): string {
  return m === "distance" ? "Distance" : m === "time" ? "Time" : "Reps";
}

export function buildExerciseHistoryExportText(params: {
  exercise: Exercise;
  historyRows?: ExerciseHistoryExportRow[];
  allExercises: Exercise[];
  generatedAt?: Date;
}) {
  const { exercise, allExercises } = params;
  const metricMode: MetricMode = normalizeMetricMode((exercise as any).metricMode);
  const rows = (params.historyRows ?? []).slice(0, 8);
  const generatedAt = (params.generatedAt ?? new Date()).toLocaleString();
  const resolvedExercise = resolveExerciseFromIndex(
    { rawName: exercise.name, allowAlias: true, followMerged: true },
    buildExerciseResolverIndex(allExercises)
  );
  const exportExerciseName =
    resolvedExercise.canonicalExercise?.name ?? resolvedExercise.exercise?.name ?? exercise.name;
  const usesBodyweightEffective =
    isBodyweightEffectiveLoadExerciseName(exercise.name) ||
    rows.some((row) => row.usedBodyweightEffective);
  const usesAssisted = rows.some((row) => row.usedAssisted);

  const lines: string[] = [];
  lines.push("Exercise History Snapshot");
  lines.push(`Exercise: ${exportExerciseName}`);
  lines.push(`Metric: ${prettyMetricLabel(metricMode)}`);
  if (rows.length) {
    const oldest = rows[rows.length - 1]?.dateLabel;
    const newest = rows[0]?.dateLabel;
    const range = oldest && newest && oldest !== newest ? `${oldest} to ${newest}` : newest;
    lines.push(`Recent range: ${rows.length} completed session${rows.length === 1 ? "" : "s"}${range ? ` (${range})` : ""}`);
  }
  lines.push(`Generated: ${generatedAt}`);

  if (usesBodyweightEffective) {
    lines.push(
      usesAssisted
        ? "Load note: BW-aware effective load. Assisted sets subtract assistance from bodyweight; weighted sets add external load."
        : "Load note: BW-aware effective load. Weighted/bodyweight sets are shown as effective load for coach interpretation."
    );
  }

  lines.push("");
  lines.push("Recent completed sessions:");

  if (!rows.length) {
    lines.push("- No completed history yet for this exercise.");
    return lines.join("\n").trim() + "\n";
  }

  for (const row of rows) {
    const fields: string[] = [];
    if (row.bestSetLabel) {
      fields.push(
        `${usesBodyweightEffective ? "Best set (effective load)" : "Best set"}: ${row.bestSetLabel}`
      );
    }
    if (Number.isFinite(row.bestE1rm)) {
      fields.push(`e1RM: ${Math.round(row.bestE1rm as number)}`);
    }
    if (Number.isFinite(row.totalVolume)) {
      fields.push(`Volume: ${Math.round(row.totalVolume as number)}`);
    }
    if (Number.isFinite(row.maxReps)) {
      fields.push(`Max reps: ${row.maxReps}`);
    }

    const headerBits = [row.dateLabel, row.templateName].filter(Boolean);
    lines.push(`- ${headerBits.join(" • ") || "Session"}`);
    if (fields.length) {
      lines.push(`  ${fields.join(" • ")}`);
    }
    if (Array.isArray(row.completedSetLabels) && row.completedSetLabels.length) {
      lines.push(`  Sets: ${row.completedSetLabels.join(", ")}`);
    }
  }

  lines.push("");
  lines.push("Coach prompt: suggest next working weight/reps based on this recent exercise history.");

  return lines.join("\n").trim() + "\n";
}

