import { db, type Template } from "../../db";

export const WEEKLY_TRAINING_SCHEDULE_META_KEY = "training.schedule.v1";

export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type ScheduleEntry =
  | { dayOfWeek: Weekday; dayType: "training"; sessionName: string; focus?: string; templateId?: string }
  | { dayOfWeek: Weekday; dayType: "recovery" };

export type WeeklyTrainingSchedule = {
  id: string;
  active: boolean;
  entries: ScheduleEntry[];
  createdAt: number;
  updatedAt: number;
};

export type WeeklyScheduleValidationIssue = {
  code:
    | "schedule_id_required"
    | "seven_days_required"
    | "weekday_invalid"
    | "weekday_duplicate"
    | "day_type_invalid"
    | "session_name_required";
  message: string;
  dayOfWeek?: number;
};

export type WeeklyScheduleReferenceIssue = {
  dayOfWeek: Weekday;
  templateId: string;
  status: "missing" | "archived";
  message: string;
};

export type ResolvedWeeklyScheduleEntry = ScheduleEntry & {
  dayName: string;
  templateName?: string;
  templateStatus?: "available" | "missing" | "archived";
};

export type IntendedWeeklyScheduleContext = {
  status: "unconfigured" | "inactive" | "active";
  trainingDays: number;
  entries: ResolvedWeeklyScheduleEntry[];
  limitations: string[];
};

export const WEEKDAYS: ReadonlyArray<{ dayOfWeek: Weekday; name: string }> = [
  { dayOfWeek: 1, name: "Monday" },
  { dayOfWeek: 2, name: "Tuesday" },
  { dayOfWeek: 3, name: "Wednesday" },
  { dayOfWeek: 4, name: "Thursday" },
  { dayOfWeek: 5, name: "Friday" },
  { dayOfWeek: 6, name: "Saturday" },
  { dayOfWeek: 7, name: "Sunday" },
];

function positiveTimestamp(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function isWeekday(value: unknown): value is Weekday {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 7;
}

function structurallyNormalize(raw: unknown): WeeklyTrainingSchedule | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const id = String(value.id ?? "").trim();
  if (!id || !Array.isArray(value.entries)) return null;
  const entries: ScheduleEntry[] = [];
  const seen = new Set<number>();
  for (const rawEntry of value.entries) {
    if (!rawEntry || typeof rawEntry !== "object") return null;
    const row = rawEntry as Record<string, unknown>;
    const dayOfWeek = Number(row.dayOfWeek);
    if (!isWeekday(dayOfWeek) || seen.has(dayOfWeek)) return null;
    seen.add(dayOfWeek);
    if (row.dayType === "recovery") entries.push({ dayOfWeek, dayType: "recovery" });
    else if (row.dayType === "training") {
      const sessionName = String(row.sessionName ?? "").trim();
      if (!sessionName) return null;
      const focus = String(row.focus ?? "").trim() || undefined;
      const templateId = String(row.templateId ?? "").trim() || undefined;
      entries.push({ dayOfWeek, dayType: "training", sessionName, ...(focus ? { focus } : {}), ...(templateId ? { templateId } : {}) });
    } else return null;
  }
  if (entries.length !== 7 || seen.size !== 7) return null;
  const createdAt = positiveTimestamp(value.createdAt) ?? Date.now();
  return {
    id,
    active: value.active !== false,
    entries: entries.sort((a, b) => a.dayOfWeek - b.dayOfWeek),
    createdAt,
    updatedAt: positiveTimestamp(value.updatedAt) ?? createdAt,
  };
}

export function validateWeeklyTrainingSchedule(
  schedule: unknown,
  templates: readonly Template[] = []
): { ok: true; schedule: WeeklyTrainingSchedule; referenceIssues: WeeklyScheduleReferenceIssue[] } | { ok: false; issues: WeeklyScheduleValidationIssue[] } {
  const value = schedule && typeof schedule === "object" ? (schedule as Record<string, unknown>) : {};
  const issues: WeeklyScheduleValidationIssue[] = [];
  if (!String(value.id ?? "").trim()) issues.push({ code: "schedule_id_required", message: "Schedule ID is required." });
  const rows = Array.isArray(value.entries) ? value.entries : [];
  if (rows.length !== 7) issues.push({ code: "seven_days_required", message: "Assign all seven days before saving." });
  const seen = new Set<number>();
  for (const rawEntry of rows) {
    const row = rawEntry && typeof rawEntry === "object" ? (rawEntry as Record<string, unknown>) : {};
    const dayOfWeek = Number(row.dayOfWeek);
    if (!isWeekday(dayOfWeek)) {
      issues.push({ code: "weekday_invalid", message: "Weekday must be between 1 and 7.", dayOfWeek });
      continue;
    }
    if (seen.has(dayOfWeek)) issues.push({ code: "weekday_duplicate", message: `${weekdayName(dayOfWeek)} is assigned more than once.`, dayOfWeek });
    seen.add(dayOfWeek);
    if (row.dayType !== "training" && row.dayType !== "recovery") {
      issues.push({ code: "day_type_invalid", message: `Choose training or recovery for ${weekdayName(dayOfWeek)}.`, dayOfWeek });
    } else if (row.dayType === "training" && !String(row.sessionName ?? "").trim()) {
      issues.push({ code: "session_name_required", message: `Enter a session name for ${weekdayName(dayOfWeek)}.`, dayOfWeek });
    }
  }
  if (issues.length) return { ok: false, issues };
  const normalized = structurallyNormalize(schedule);
  if (!normalized) return { ok: false, issues: [{ code: "seven_days_required", message: "Assign all seven days before saving." }] };
  const templatesById = new Map(templates.map((template) => [template.id, template]));
  const referenceIssues = normalized.entries.flatMap<WeeklyScheduleReferenceIssue>((entry) => {
    if (entry.dayType !== "training") return [];
    if (!entry.templateId) return [];
    const template = templatesById.get(entry.templateId);
    if (!template) return [{ dayOfWeek: entry.dayOfWeek, templateId: entry.templateId, status: "missing", message: `${weekdayName(entry.dayOfWeek)} references a missing template.` }];
    if (template.archivedAt) return [{ dayOfWeek: entry.dayOfWeek, templateId: entry.templateId, status: "archived", message: `${weekdayName(entry.dayOfWeek)} references an archived template.` }];
    return [];
  });
  return { ok: true, schedule: normalized, referenceIssues };
}

export async function getWeeklyTrainingSchedule(): Promise<WeeklyTrainingSchedule | null> {
  try {
    const row = await db.app_meta.get(WEEKLY_TRAINING_SCHEDULE_META_KEY);
    return structurallyNormalize(row?.valueJson ? JSON.parse(row.valueJson) : undefined);
  } catch {
    return null;
  }
}

export async function setWeeklyTrainingSchedule(
  schedule: WeeklyTrainingSchedule,
  templates: readonly Template[] = []
): Promise<WeeklyTrainingSchedule> {
  const validated = validateWeeklyTrainingSchedule(schedule, templates);
  if (!validated.ok) throw new Error(validated.issues[0]?.message ?? "Weekly schedule is invalid.");
  await db.app_meta.put({
    key: WEEKLY_TRAINING_SCHEDULE_META_KEY,
    valueJson: JSON.stringify(validated.schedule),
    updatedAt: validated.schedule.updatedAt,
  });
  return validated.schedule;
}

export function localWeekdayForDate(date: Date): Weekday {
  const day = date.getDay();
  return (day === 0 ? 7 : day) as Weekday;
}

export function getScheduledEntryForDate(
  schedule: WeeklyTrainingSchedule | null | undefined,
  date: Date
): ScheduleEntry | undefined {
  if (!schedule?.active) return undefined;
  return schedule.entries.find((entry) => entry.dayOfWeek === localWeekdayForDate(date));
}

export function isSameLocalCalendarDay(timestamp: number, date: Date) {
  const candidate = new Date(timestamp);
  return candidate.getFullYear() === date.getFullYear()
    && candidate.getMonth() === date.getMonth()
    && candidate.getDate() === date.getDate();
}

export function weekdayName(dayOfWeek: Weekday | number) {
  return WEEKDAYS.find((day) => day.dayOfWeek === dayOfWeek)?.name ?? `Day ${dayOfWeek}`;
}

export function resolveIntendedWeeklySchedule(
  schedule: WeeklyTrainingSchedule | null | undefined,
  templates: readonly Template[]
): IntendedWeeklyScheduleContext {
  if (!schedule) return { status: "unconfigured", trainingDays: 0, entries: [], limitations: [] };
  const templatesById = new Map(templates.map((template) => [template.id, template]));
  const limitations: string[] = [];
  const entries = schedule.entries.map<ResolvedWeeklyScheduleEntry>((entry) => {
    const dayName = weekdayName(entry.dayOfWeek);
    if (entry.dayType === "recovery") return { ...entry, dayName };
    if (!entry.templateId) return { ...entry, dayName };
    const template = templatesById.get(entry.templateId);
    if (!template) {
      limitations.push(`${dayName} references missing template ${entry.templateId}.`);
      return { ...entry, dayName, templateStatus: "missing" };
    }
    if (template.archivedAt) {
      limitations.push(`${dayName} references archived template ${template.name}.`);
      return { ...entry, dayName, templateName: template.name, templateStatus: "archived" };
    }
    return { ...entry, dayName, templateName: template.name, templateStatus: "available" };
  });
  return {
    status: schedule.active ? "active" : "inactive",
    trainingDays: entries.filter((entry) => entry.dayType === "training").length,
    entries,
    limitations,
  };
}
