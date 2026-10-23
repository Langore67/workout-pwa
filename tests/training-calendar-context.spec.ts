import { expect, test } from "@playwright/test";
import { buildTrainingCalendarBoundaries, buildTrainingCalendarContext } from "../src/domain/training/trainingCalendarContext";
import type { IntendedWeeklyScheduleContext } from "../src/domain/schedule/weeklyTrainingSchedule";

function at(year: number, month: number, day: number, hour = 12) {
  return new Date(year, month - 1, day, hour, 0, 0, 0).getTime();
}

function activeSchedule(today: 1 | 2 | 3 | 4 | 5 | 6 | 7): IntendedWeeklyScheduleContext {
  const names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  return {
    status: "active",
    trainingDays: 5,
    limitations: [],
    entries: names.map((dayName, index) => {
      const dayOfWeek = (index + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
      return dayOfWeek <= 5
        ? { dayOfWeek, dayName, dayType: "training" as const, sessionName: dayOfWeek === today ? "Upper A" : `Session ${dayOfWeek}`, ...(dayOfWeek === today ? { focus: "Bench strength" } : {}) }
        : { dayOfWeek, dayName, dayType: "recovery" as const };
    }),
  };
}

for (const [label, date, weekday, started, remaining] of [
  ["Monday", [2026, 10, 19], 1, 1, 6],
  ["Wednesday", [2026, 10, 21], 3, 3, 4],
  ["Saturday", [2026, 10, 24], 6, 6, 1],
  ["Sunday", [2026, 10, 25], 7, 7, 0],
] as const) {
  test(`${label} uses a Monday-start local week and remains in progress`, () => {
    const context = buildTrainingCalendarContext({ asOf: at(...date) });
    expect(context).toMatchObject({ dayOfWeek: weekday, dayName: label, weekStartLocalDate: "2026-10-19", weekEndLocalDate: "2026-10-25", calendarDaysStarted: started, calendarDaysRemaining: remaining, currentWeekStatus: "in_progress" });
  });
}

test("month and year boundaries preserve the previous complete Monday-Sunday week", () => {
  const month = buildTrainingCalendarContext({ asOf: at(2026, 6, 1) });
  expect(month).toMatchObject({ weekStartLocalDate: "2026-06-01", previousWeekStartLocalDate: "2026-05-25", previousWeekEndLocalDate: "2026-05-31" });
  const year = buildTrainingCalendarContext({ asOf: at(2027, 1, 1) });
  expect(year).toMatchObject({ weekStartLocalDate: "2026-12-28", weekEndLocalDate: "2027-01-03", previousWeekStartLocalDate: "2026-12-21", previousWeekEndLocalDate: "2026-12-27" });
});

test("local midnight and DST weeks use local calendar dates rather than fixed UTC boundaries", () => {
  const beforeMidnight = buildTrainingCalendarContext({ asOf: new Date(2026, 9, 21, 23, 59).getTime() });
  const afterMidnight = buildTrainingCalendarContext({ asOf: new Date(2026, 9, 22, 0, 1).getTime() });
  expect(beforeMidnight.localDate).toBe("2026-10-21");
  expect(afterMidnight.localDate).toBe("2026-10-22");
  const dst = buildTrainingCalendarBoundaries(at(2026, 3, 11));
  expect(dst.weekStartLocalDate).toBe("2026-03-09");
  expect(dst.weekEndLocalDate).toBe("2026-03-15");
  expect(dst.rolling14DaysStartLocalDate).toBe("2026-02-26");
});

test("active schedule exposes generic planned-day facts and today's assignment", () => {
  const context = buildTrainingCalendarContext({ asOf: at(2026, 10, 21), intendedWeeklySchedule: activeSchedule(3) });
  expect(context.schedule).toEqual({ status: "active", plannedTrainingDays: 5, plannedTrainingDaysStarted: 3, plannedTrainingDaysRemaining: 2, todayAssignment: "training", todaySessionName: "Upper A", todayFocus: "Bench strength" });
  const recovery = buildTrainingCalendarContext({ asOf: at(2026, 10, 25), intendedWeeklySchedule: activeSchedule(3) });
  expect(recovery.schedule.todayAssignment).toBe("recovery");
});

test("inactive and unconfigured schedules do not become zero planned days", () => {
  const inactive = buildTrainingCalendarContext({ asOf: at(2026, 10, 21), intendedWeeklySchedule: { ...activeSchedule(3), status: "inactive" } });
  const unconfigured = buildTrainingCalendarContext({ asOf: at(2026, 10, 21) });
  expect(inactive.schedule).toEqual({ status: "inactive" });
  expect(unconfigured.schedule).toEqual({ status: "unconfigured" });
});

