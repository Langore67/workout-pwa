import { parseCardioActivityType } from "../../lib/cardio/cardioActivityType";
import { parseCardioFormat } from "../../lib/cardio/cardioFormat";
import { parseCardioIntent } from "../../lib/cardio/cardioIntent";

export const IF_WORKOUT_FORMAT_VERSION = 1 as const;

export type IfWorkoutContract = {
  formatVersion?: typeof IF_WORKOUT_FORMAT_VERSION;
  legacy: boolean;
};

export class IfWorkoutContractError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(issues.join("\n"));
    this.name = "IfWorkoutContractError";
    this.issues = issues;
  }
}

function metadataValue(lines: string[], label: string) {
  const expression = new RegExp(`^${label}\\s*:\\s*(.*)$`, "i");
  const match = lines.map((line) => line.trim()).find((line) => expression.test(line))?.match(expression);
  return match?.[1]?.trim();
}

function validCalendarDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function validClock(value: string) {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  return !!match && Number(match[1]) <= 23 && Number(match[2]) <= 59;
}

export function inspectIfWorkoutContract(text: string): IfWorkoutContract {
  const lines = String(text ?? "").replace(/\r/g, "").split("\n");
  const versionRaw = metadataValue(lines, "Format Version");
  if (versionRaw === undefined) return { legacy: true };

  const issues: string[] = [];
  if (versionRaw !== String(IF_WORKOUT_FORMAT_VERSION)) {
    issues.push(`Unsupported Format Version: ${versionRaw || "missing"}. IronForge supports Format Version: ${IF_WORKOUT_FORMAT_VERSION}.`);
  }
  if (!lines.some((line) => /^IF Workout$/i.test(line.trim()))) issues.push('Format Version: 1 requires the "IF Workout" header.');

  const session = metadataValue(lines, "Session");
  const date = metadataValue(lines, "Date");
  const activityType = metadataValue(lines, "Activity Type");
  const intent = metadataValue(lines, "Intent");
  const cardioFormat = metadataValue(lines, "Cardio Format");
  const start = metadataValue(lines, "Start");
  const end = metadataValue(lines, "End");

  if (!session) issues.push("Missing required Session field.");
  if (!date || !validCalendarDate(date)) issues.push(`Invalid Date${date ? `: ${date}` : ""}. Use YYYY-MM-DD.`);
  if (activityType !== undefined && !parseCardioActivityType(activityType)) issues.push(`Invalid Activity Type: ${activityType || "missing"}.`);
  if (intent !== undefined && !parseCardioIntent(intent)) issues.push(`Invalid Intent: ${intent || "missing"}.`);
  if (cardioFormat !== undefined && !parseCardioFormat(cardioFormat)) issues.push(`Invalid Cardio Format: ${cardioFormat || "missing"}.`);
  if (start !== undefined && !validClock(start)) issues.push(`Invalid Start time: ${start || "missing"}. Use HH:mm.`);
  if (end !== undefined && !validClock(end)) issues.push(`Invalid End time: ${end || "missing"}. Use HH:mm.`);

  if (issues.length) throw new IfWorkoutContractError(issues);
  return { formatVersion: IF_WORKOUT_FORMAT_VERSION, legacy: false };
}
