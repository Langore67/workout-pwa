import type { SetEntry, Track } from "../../db";

export type PerformedSetIntent = "warmup" | "working" | "drop" | "failure" | "technique" | "control" | "conditioning" | "test" | "unknown";

const NOTE_INTENTS: Record<string, PerformedSetIntent> = {
  technique: "technique", "set_type=technique": "technique",
  mobility: "control", "set_type=mobility": "control",
  corrective: "control", "set_type=corrective": "control",
  diagnostic: "control", "set_type=diagnostic": "control",
  rehab: "control", "set_type=rehab": "control",
  conditioning: "conditioning", "set_type=conditioning": "conditioning",
  test: "test", "set_type=test": "test",
};

function machineNoteIntent(notes: unknown): PerformedSetIntent | undefined {
  if (typeof notes !== "string") return undefined;
  for (const fragment of notes.split(/\s*\|\s*/)) {
    const intent = NOTE_INTENTS[fragment.trim().toLowerCase()];
    if (intent) return intent;
  }
  return undefined;
}

export function resolvePerformedSetIntent(set: Pick<SetEntry, "setType" | "notes"> | null | undefined, track?: Pick<Track, "trackType"> | null): PerformedSetIntent {
  if (!set) return "unknown";
  if (set.setType === "warmup" || set.setType === "drop" || set.setType === "failure") return set.setType;
  if (set.setType && set.setType !== "working") return "unknown";
  const noteIntent = machineNoteIntent(set.notes);
  if (noteIntent) return noteIntent;
  const trackType = String(track?.trackType ?? "").trim().toLowerCase();
  if (trackType === "technique") return "technique";
  if (trackType === "mobility" || trackType === "corrective") return "control";
  if (trackType === "conditioning") return "conditioning";
  if (trackType === "strength" || trackType === "hypertrophy") return "working";
  // Legacy strength tracks may predate trackType. An explicit working set stays
  // work unless exact import provenance or a known non-strength track overrides it.
  return "working";
}
