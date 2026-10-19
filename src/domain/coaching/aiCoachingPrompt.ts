import { db, type Exercise, type Template } from "../../db";
import { getStrengthGoals, type StrengthGoal } from "../goals/strengthGoals";
import { getWeeklyTrainingSchedule, resolveIntendedWeeklySchedule, type IntendedWeeklyScheduleContext } from "../schedule/weeklyTrainingSchedule";
import { getProfileGoals, type ProfileGoalsV1 } from "../../profile/profileGoals";

export type AICoachingAthleteContext = { strengthGoals: StrengthGoal[]; exercises: Exercise[]; bodyGoals: ProfileGoalsV1; schedule: IntendedWeeklyScheduleContext };

export function formatAICoachingAthleteContext(context: AICoachingAthleteContext): string {
  const lines = ["ATHLETE CONTEXT — IRONFORGE"];
  const exercises = new Map(context.exercises.map((exercise) => [exercise.id, exercise.name]));
  const activeGoals = context.strengthGoals.filter((goal) => goal.active);
  lines.push("", "Active Strength Goals:");
  if (!activeGoals.length) lines.push("- None configured.");
  else for (const goal of activeGoals) lines.push(`- ${exercises.get(goal.exerciseId) ?? `Exercise ${goal.exerciseId}`}: ${goal.targetValue} ${goal.targetMetric === "load" ? (goal.targetUnit ?? "lb") + " performed load" : "reps"}${goal.label ? ` — ${goal.label}` : ""}`);

  const body = context.bodyGoals;
  const bodyLines = [
    body.targetWeightLb != null ? `- Target weight: ${body.targetWeightLb} lb` : undefined,
    body.targetBodyFatPct != null ? `- Target body fat: ${body.targetBodyFatPct}%` : undefined,
    body.targetWaistIn != null ? `- Target waist: ${body.targetWaistIn} in` : undefined,
    body.targetVisceralFatEstimate != null ? `- Target visceral fat estimate: ${body.targetVisceralFatEstimate}` : undefined,
  ].filter((line): line is string => !!line);
  if (bodyLines.length) lines.push("", "Body-Composition Goals:", ...bodyLines);
  lines.push("", "Intended Weekly Schedule:");
  if (context.schedule.status !== "active") lines.push(context.schedule.status === "inactive" ? "- Configured but inactive." : "- Not configured.");
  else for (const entry of context.schedule.entries) lines.push(entry.dayType === "recovery" ? `- ${entry.dayName}: Recovery` : `- ${entry.dayName}: ${entry.sessionName}${entry.focus ? ` — ${entry.focus}` : ""}`);
  lines.push("", "Performance History:", "Use the latest IronForge Coach Export supplied separately. Do not infer historical performance from goals or this schedule.");
  return lines.join("\n");
}

export function buildAICoachingPrompt(args: { coachingProtocol: string; athleteContext: string; importContract: string }): string {
  return [args.coachingProtocol.trim(), args.athleteContext.trim(), "SOURCE-OF-TRUTH REMINDER\nThe athlete may paste the latest IronForge Coach Export separately. Treat it as historical evidence, while current explicit results and corrections remain highest authority. Do not claim it was supplied when it was not.", args.importContract.trim()].join("\n\n---\n\n") + "\n";
}

export async function loadAICoachingAthleteContext(): Promise<AICoachingAthleteContext> {
  const [strengthGoals, exercises, bodyGoals, schedule, templates] = await Promise.all([
    getStrengthGoals(), db.exercises.toArray(), getProfileGoals(), getWeeklyTrainingSchedule(), db.templates.toArray(),
  ]);
  return { strengthGoals, exercises, bodyGoals, schedule: resolveIntendedWeeklySchedule(schedule, templates as Template[]) };
}
