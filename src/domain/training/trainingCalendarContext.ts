import type { IntendedWeeklyScheduleContext, Weekday } from "../schedule/weeklyTrainingSchedule";
import { localWeekdayForDate, weekdayName } from "../schedule/weeklyTrainingSchedule";

export type TrainingCalendarScheduleContext = {
  status: "unconfigured" | "inactive" | "active";
  plannedTrainingDays?: number;
  plannedTrainingDaysStarted?: number;
  plannedTrainingDaysRemaining?: number;
  todayAssignment?: "training" | "recovery";
  todaySessionName?: string;
  todayFocus?: string;
};

export type TrainingCalendarContext = {
  localDate: string;
  dayOfWeek: Weekday;
  dayName: string;
  weekStartLocalDate: string;
  weekEndLocalDate: string;
  previousWeekStartLocalDate: string;
  previousWeekEndLocalDate: string;
  calendarDaysStarted: number;
  calendarDaysRemaining: number;
  currentWeekStatus: "in_progress";
  completedStrengthSessionsWeekToDate: number;
  completedDedicatedCardioSessionsWeekToDate: number;
  schedule: TrainingCalendarScheduleContext;
};

export type TrainingCalendarBoundaries = {
  currentWeekStartAt: number;
  nextWeekStartAt: number;
  previousWeekStartAt: number;
  rolling14DaysStartAt: number;
  weekStartLocalDate: string;
  weekEndLocalDate: string;
  previousWeekStartLocalDate: string;
  previousWeekEndLocalDate: string;
  rolling14DaysStartLocalDate: string;
};

export function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Whole local-calendar dates between two timestamps; DST-safe. */
export function localCalendarDayDifference(laterAt: number, earlierAt: number) {
  const later = new Date(laterAt);
  const earlier = new Date(earlierAt);
  const laterDay = Date.UTC(later.getFullYear(), later.getMonth(), later.getDate());
  const earlierDay = Date.UTC(earlier.getFullYear(), earlier.getMonth(), earlier.getDate());
  return Math.max(0, Math.round((laterDay - earlierDay) / (24 * 60 * 60 * 1000)));
}

function localStartOfDay(date: Date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function addLocalDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function buildTrainingCalendarBoundaries(asOf: number): TrainingCalendarBoundaries {
  const today = localStartOfDay(new Date(asOf));
  const weekday = localWeekdayForDate(today);
  const currentWeekStart = addLocalDays(today, -(weekday - 1));
  const nextWeekStart = addLocalDays(currentWeekStart, 7);
  const previousWeekStart = addLocalDays(currentWeekStart, -7);
  const weekEnd = addLocalDays(currentWeekStart, 6);
  const previousWeekEnd = addLocalDays(currentWeekStart, -1);
  const rolling14DaysStart = addLocalDays(today, -13);
  return {
    currentWeekStartAt: currentWeekStart.getTime(),
    nextWeekStartAt: nextWeekStart.getTime(),
    previousWeekStartAt: previousWeekStart.getTime(),
    rolling14DaysStartAt: rolling14DaysStart.getTime(),
    weekStartLocalDate: localDateKey(currentWeekStart),
    weekEndLocalDate: localDateKey(weekEnd),
    previousWeekStartLocalDate: localDateKey(previousWeekStart),
    previousWeekEndLocalDate: localDateKey(previousWeekEnd),
    rolling14DaysStartLocalDate: localDateKey(rolling14DaysStart),
  };
}

function countInWeek(timestamps: readonly number[], startAt: number, asOf: number) {
  return timestamps.filter((at) => Number.isFinite(at) && at >= startAt && at <= asOf).length;
}

export function buildTrainingCalendarContext(args: {
  asOf: number;
  completedStrengthSessionTimestamps?: readonly number[];
  completedDedicatedCardioSessionTimestamps?: readonly number[];
  intendedWeeklySchedule?: IntendedWeeklyScheduleContext;
}): TrainingCalendarContext {
  const asOf = Number.isFinite(args.asOf) ? args.asOf : Date.now();
  const date = new Date(asOf);
  const dayOfWeek = localWeekdayForDate(date);
  const boundaries = buildTrainingCalendarBoundaries(asOf);
  const intended = args.intendedWeeklySchedule;
  const schedule: TrainingCalendarScheduleContext = { status: intended?.status ?? "unconfigured" };
  if (intended?.status === "active") {
    const trainingEntries = intended.entries.filter((entry) => entry.dayType === "training");
    const today = intended.entries.find((entry) => entry.dayOfWeek === dayOfWeek);
    schedule.plannedTrainingDays = trainingEntries.length;
    schedule.plannedTrainingDaysStarted = trainingEntries.filter((entry) => entry.dayOfWeek <= dayOfWeek).length;
    schedule.plannedTrainingDaysRemaining = trainingEntries.filter((entry) => entry.dayOfWeek > dayOfWeek).length;
    if (today) {
      schedule.todayAssignment = today.dayType;
      if (today.dayType === "training") {
        schedule.todaySessionName = today.sessionName;
        schedule.todayFocus = today.focus;
      }
    }
  }
  return {
    localDate: localDateKey(date),
    dayOfWeek,
    dayName: weekdayName(dayOfWeek),
    weekStartLocalDate: boundaries.weekStartLocalDate,
    weekEndLocalDate: boundaries.weekEndLocalDate,
    previousWeekStartLocalDate: boundaries.previousWeekStartLocalDate,
    previousWeekEndLocalDate: boundaries.previousWeekEndLocalDate,
    calendarDaysStarted: dayOfWeek,
    calendarDaysRemaining: 7 - dayOfWeek,
    currentWeekStatus: "in_progress",
    completedStrengthSessionsWeekToDate: countInWeek(args.completedStrengthSessionTimestamps ?? [], boundaries.currentWeekStartAt, asOf),
    completedDedicatedCardioSessionsWeekToDate: countInWeek(args.completedDedicatedCardioSessionTimestamps ?? [], boundaries.currentWeekStartAt, asOf),
    schedule,
  };
}
