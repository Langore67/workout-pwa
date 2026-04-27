const DAY_MS = 24 * 60 * 60 * 1000;

export type TimelineResolution = "D" | "W" | "M";

export function monthKeyFromMs(ms: number) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabelFromKey(key: string) {
  const [year, month] = key.split("-");
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleDateString(undefined, { month: "short" });
}

export function weekNumberFromMs(ms: number) {
  const d = new Date(ms);
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const diffDays = Math.floor((d.getTime() - yearStart.getTime()) / DAY_MS);
  return Math.floor(diffDays / 7) + 1;
}

export function formatDailyTimelineLabel(ms: number) {
  const d = new Date(ms);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${month}/${day}`;
}

export function formatWeeklyTimelineLabel(ms: number) {
  return `W${weekNumberFromMs(ms)}`;
}

export function formatMonthlyTimelineLabel(key: string) {
  return monthLabelFromKey(key);
}

export function formatTimelineLabel(args: {
  resolution: TimelineResolution;
  unitStartMs: number;
  monthKey?: string;
}) {
  if (args.resolution === "D") {
    return formatDailyTimelineLabel(args.unitStartMs);
  }
  if (args.resolution === "W") {
    return formatWeeklyTimelineLabel(args.unitStartMs);
  }
  const key = args.monthKey ?? monthKeyFromMs(args.unitStartMs);
  return formatMonthlyTimelineLabel(key);
}
