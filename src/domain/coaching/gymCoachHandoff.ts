export type GymCoachTodayIntent = {
  dayLabel?: string;
  assignment: string;
  focus?: string;
  completed?: boolean;
};

export type BuildGymCoachHandoffInput = {
  coachingInstructions: string;
  todayIntent: GymCoachTodayIntent;
  sessionSpecificNote?: string;
  coachExportText: string;
  workoutReturnInstructions: string;
};

export function formatGymCoachTodayIntent(intent: GymCoachTodayIntent): string {
  const lines = [
    intent.dayLabel ? `Day: ${intent.dayLabel}` : undefined,
    `Scheduled session: ${intent.assignment}`,
    intent.focus ? `Focus: ${intent.focus}` : undefined,
    intent.completed ? "Schedule status: Completed today" : undefined,
  ];
  return lines.filter((line): line is string => Boolean(line)).join("\n");
}

export function buildGymCoachHandoff(input: BuildGymCoachHandoffInput): string {
  const sessionNote = input.sessionSpecificNote?.trim();
  const sections = [
    "IRONFORGE GYM COACH HANDOFF",
    `COACHING INSTRUCTIONS\n${input.coachingInstructions.trim()}`,
    `TODAY\n${formatGymCoachTodayIntent(input.todayIntent)}`,
    sessionNote ? `TODAY-SPECIFIC USER NOTE\nUser-supplied for this session only:\n${sessionNote}` : undefined,
    `COACH CONTEXT\n${input.coachExportText.trim()}`,
    `WORKOUT COMPLETION / RETURN FORMAT\n${input.workoutReturnInstructions.trim()}`,
  ];

  return `${sections.filter((section): section is string => Boolean(section)).join("\n\n---\n\n")}\n`;
}
