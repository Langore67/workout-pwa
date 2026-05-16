import type { Exercise, FitnessTestPain, FitnessTestResult, FitnessTestSide, SetEntry, Session, Track } from "../db";
import { formatCapabilityDate } from "./capabilityTests";

export type HistoryDerivedCapabilityTestResult = FitnessTestResult & {
  source: "history";
  sourceSessionId: string;
  sourceSetId: string;
  sourceTrackId: string;
};

export type DeriveCarryCapabilityResultsInput = {
  sessions: Session[];
  sets: SetEntry[];
  tracks: Track[];
  exercises: Exercise[];
  manualResults?: FitnessTestResult[];
};

type CarryMatch = {
  testName: "Farmer Carry" | "Suitcase Carry - Left" | "Suitcase Carry - Right";
  side: FitnessTestSide;
};

const PAIN_VALUES: FitnessTestPain[] = ["none", "mild", "moderate", "severe"];

function normalizeText(value: string | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function detectCarry(names: string[]): CarryMatch | undefined {
  const normalized = names.map(normalizeText).filter(Boolean);
  const combined = normalized.join(" ");

  if (combined.includes("suitcase") && combined.includes("carry")) {
    const left = /\bleft\b|\bl\b/.test(combined);
    const right = /\bright\b|\br\b/.test(combined);
    if (left && !right) return { testName: "Suitcase Carry - Left", side: "left" };
    if (right && !left) return { testName: "Suitcase Carry - Right", side: "right" };
    return undefined;
  }

  if (combined.includes("farmer") && combined.includes("carry")) {
    return { testName: "Farmer Carry", side: "both" };
  }

  return undefined;
}

function firstFinitePositive(...values: Array<number | undefined>) {
  return values.find((value) => typeof value === "number" && Number.isFinite(value) && value > 0);
}

function resultValueForSet(set: SetEntry): Pick<FitnessTestResult, "resultValue" | "resultUnit"> {
  const distanceMeters = set.distanceUnit === "m" ? firstFinitePositive(set.distance) : undefined;
  if (distanceMeters != null) return { resultValue: distanceMeters, resultUnit: "meters" };

  const seconds = firstFinitePositive(set.seconds);
  if (seconds != null) return { resultValue: seconds, resultUnit: "seconds" };

  const load = firstFinitePositive(set.weight);
  if (load != null) return { resultValue: load, resultUnit: "lb" };

  return {};
}

function parsePain(...notes: Array<string | undefined>): FitnessTestPain | undefined {
  const text = normalizeText(notes.filter(Boolean).join(" "));
  if (!text) return undefined;
  for (const pain of PAIN_VALUES) {
    if (new RegExp(`\\bpain\\s+${pain}\\b`).test(text)) return pain;
  }
  return undefined;
}

function manualDedupeKey(row: Pick<FitnessTestResult, "testName" | "date" | "side">) {
  return [row.testName, formatCapabilityDate(row.date), row.side ?? "none"].join("|");
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}

function buildNotes(args: {
  session: Session;
  track: Track;
  exercise?: Exercise;
  set: SetEntry;
}) {
  const { session, track, exercise, set } = args;
  const parts = [
    "History",
    session.templateName,
    track.displayName || exercise?.name,
    set.distanceUnit === "m" && firstFinitePositive(set.distance) != null
      ? `distance ${formatNumber(set.distance as number)} meters`
      : undefined,
    firstFinitePositive(set.seconds) != null ? `duration ${formatNumber(set.seconds as number)} sec` : undefined,
    firstFinitePositive(set.weight) != null ? `load ${formatNumber(set.weight as number)} lb` : undefined,
    set.notes,
  ].filter(Boolean);
  return parts.join(" | ");
}

function eventDate(session: Session, set: SetEntry) {
  return firstFinitePositive(set.completedAt, session.endedAt, set.createdAt, session.startedAt) ?? Date.now();
}

export function isHistoryDerivedCapabilityTestResult(
  row: FitnessTestResult
): row is HistoryDerivedCapabilityTestResult {
  return (row as Partial<HistoryDerivedCapabilityTestResult>).source === "history";
}

export function deriveCarryCapabilityResultsFromHistory({
  sessions,
  sets,
  tracks,
  exercises,
  manualResults = [],
}: DeriveCarryCapabilityResultsInput): HistoryDerivedCapabilityTestResult[] {
  const sessionsById = new Map(sessions.filter((session) => !session.deletedAt).map((session) => [session.id, session]));
  const tracksById = new Map(tracks.map((track) => [track.id, track]));
  const exercisesById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const manualKeys = new Set(
    manualResults.filter((row) => !row.deletedAt).map((row) => manualDedupeKey(row))
  );
  const derivedKeys = new Set<string>();
  const results: HistoryDerivedCapabilityTestResult[] = [];

  for (const set of sets) {
    if (set.deletedAt) continue;
    const session = sessionsById.get(set.sessionId);
    const track = tracksById.get(set.trackId);
    if (!session || !track) continue;
    const exercise = exercisesById.get(track.exerciseId);
    const match = detectCarry([track.displayName, exercise?.name]);
    if (!match) continue;

    const date = eventDate(session, set);
    const rowKey = manualDedupeKey({ testName: match.testName, date, side: match.side });
    if (manualKeys.has(rowKey)) continue;

    const derivedKey = `${set.id}|${match.testName}|${rowKey}`;
    if (derivedKeys.has(derivedKey)) continue;
    derivedKeys.add(derivedKey);

    results.push({
      id: `history:${session.id}:${set.id}:${match.testName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      testName: match.testName,
      category: "carry",
      date,
      ...resultValueForSet(set),
      side: match.side,
      pain: parsePain(session.notes, set.notes),
      notes: buildNotes({ session, track, exercise, set }),
      updatedAt: date,
      source: "history",
      sourceSessionId: session.id,
      sourceSetId: set.id,
      sourceTrackId: track.id,
    });
  }

  return results.sort((a, b) => b.date - a.date || b.updatedAt - a.updatedAt);
}
