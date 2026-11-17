import type { RecentSessionNoteEvidence } from "./recentSessionNotes";

export type RecentNotesHandoffWindow = "21d" | "90d" | "all";

export type RecentNotesHandoffOptions = {
  window: RecentNotesHandoffWindow;
  generatedAt?: number;
  timeZone?: string;
};

export type RecentNotesHandoffResult = {
  markdown: string;
  filename: string;
  sessionCount: number;
  noteCount: number;
  oldestEvidenceAt?: number;
  newestEvidenceAt?: number;
};

export const RECENT_NOTES_HANDOFF_WINDOWS: ReadonlyArray<{
  value: RecentNotesHandoffWindow;
  label: string;
}> = [
  { value: "21d", label: "21 days" },
  { value: "90d", label: "90 days" },
  { value: "all", label: "All" },
];

export function getRecentNotesHandoffDays(window: RecentNotesHandoffWindow): number | null {
  if (window === "21d") return 21;
  if (window === "90d") return 90;
  return null;
}

function windowLabel(window: RecentNotesHandoffWindow) {
  if (window === "21d") return "Last 21 days";
  if (window === "90d") return "Last 90 days";
  return "All history";
}

function filenameWindow(window: RecentNotesHandoffWindow) {
  return window === "all" ? "all" : window;
}

function formatTimestamp(value: number, timeZone?: string) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  }).format(new Date(value));
}

function formatSessionDate(value: number, timeZone?: string) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone,
  }).format(new Date(value));
}

function setTypeLabel(value: string | undefined) {
  if (!value) return "Set";
  if (value === "working") return "Work set";
  return `${value[0].toUpperCase()}${value.slice(1)} set`;
}

function formatSetHeading(note: RecentSessionNoteEvidence) {
  const context = note.setContext;
  const ordinal = context?.setNumber ? ` ${context.setNumber}` : "";
  return [note.exerciseName, `${setTypeLabel(context?.setType)}${ordinal}`]
    .filter(Boolean)
    .join(" — ");
}

function formatPerformanceLines(note: RecentSessionNoteEvidence) {
  const context = note.setContext;
  if (!context) return [];
  const lines: string[] = [];
  if (typeof context.weight === "number" && typeof context.reps === "number") {
    lines.push(`- Performance: ${context.weight === 0 ? "BW" : context.weight} × ${context.reps}`);
  } else if (typeof context.reps === "number") {
    lines.push(`- Reps: ${context.reps}`);
  }
  if (typeof context.rir === "number") lines.push(`- RIR: ${context.rir}`);
  if (typeof context.seconds === "number") lines.push(`- Duration: ${context.seconds}s`);
  if (typeof context.distance === "number") {
    lines.push(`- Distance: ${context.distance} ${context.distanceUnit ?? "m"}`);
  }
  return lines;
}

function groupBySession(evidence: readonly RecentSessionNoteEvidence[]) {
  const sorted = evidence.slice().sort((a, b) => {
    if (a.occurredAt !== b.occurredAt) return b.occurredAt - a.occurredAt;
    return a.evidenceId.localeCompare(b.evidenceId);
  });
  const groups: Array<{
    sessionId: string;
    sessionName: string;
    occurredAt: number;
    notes: RecentSessionNoteEvidence[];
  }> = [];
  const bySession = new Map<string, (typeof groups)[number]>();
  for (const note of sorted) {
    let group = bySession.get(note.sessionId);
    if (!group) {
      group = {
        sessionId: note.sessionId,
        sessionName: note.sessionName,
        occurredAt: note.occurredAt,
        notes: [],
      };
      bySession.set(note.sessionId, group);
      groups.push(group);
    }
    group.notes.push(note);
  }
  return groups;
}

export function buildRecentNotesHandoff(
  evidence: readonly RecentSessionNoteEvidence[],
  options: RecentNotesHandoffOptions
): RecentNotesHandoffResult {
  const generatedAt = options.generatedAt ?? Date.now();
  const groups = groupBySession(evidence);
  const lines = [
    "# IronForge Recent Notes Handoff",
    "",
    `Generated: ${formatTimestamp(generatedAt, options.timeZone)}`,
    `Window: ${windowLabel(options.window)}`,
    `Sessions: ${groups.length}`,
    `Notes: ${evidence.length}`,
    "",
    "This packet contains raw session and set notes from completed IronForge workouts.",
    "Notes have not been summarized, classified, or rewritten. Missing context should not be inferred.",
  ];

  for (const group of groups) {
    lines.push(
      "",
      `## ${formatSessionDate(group.occurredAt, options.timeZone)} — ${group.sessionName}`,
      "",
      `Session ID: \`${group.sessionId}\``
    );
    for (const note of group.notes) {
      if (note.sourceKind === "session_note") {
        lines.push("", "### Session note", "", note.rawText);
        continue;
      }
      lines.push("", `### ${formatSetHeading(note) || "Set note"}`);
      if (note.setId) lines.push("", `- Set ID: \`${note.setId}\``);
      lines.push(...formatPerformanceLines(note), "", note.rawText);
    }
  }

  const times = evidence.map((note) => note.occurredAt).filter(Number.isFinite);
  const date = new Date(generatedAt).toISOString().slice(0, 10);
  return {
    markdown: `${lines.join("\n")}\n`,
    filename: `ironforge-recent-notes-${filenameWindow(options.window)}-${date}.md`,
    sessionCount: groups.length,
    noteCount: evidence.length,
    oldestEvidenceAt: times.length ? Math.min(...times) : undefined,
    newestEvidenceAt: times.length ? Math.max(...times) : undefined,
  };
}
