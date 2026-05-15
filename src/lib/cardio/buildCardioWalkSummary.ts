import type { Exercise, Session, SetEntry, Track } from "../../db";
import {
  type BuildCardioWalkSummaryInput,
  type CardioDailyWalkSummary,
  type CardioWalkConfidence,
  type CardioWalkDataQuality,
  type CardioWalkEvent,
  type CardioWalkSummary,
  type CardioWalkWindowSummary,
} from "./cardioTypes";
import { parseCardioSessionNotes } from "./parseCardioSessionNotes";

const DAY_MS = 24 * 60 * 60 * 1000;
const METERS_PER_MILE = 1609.344;

const EXCLUDED_NAME_PATTERNS = [
  /\bfarmer'?s?\s+walk\b/i,
  /\bwalking\s+lunge\b/i,
  /\bwalkout\b/i,
  /\bbody\s*balance\b/i,
  /\byoga\b/i,
  /\bcore\b/i,
  /\bmobility\b/i,
  /\bclass\b/i,
  /\bcarry\b/i,
] as const;

const STRENGTH_TRACK_TYPES = new Set(["strength", "hypertrophy", "technique"]);

function normalizeLabel(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function localDateKey(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function hasExcludedWalkName(value: string): boolean {
  return EXCLUDED_NAME_PATTERNS.some((pattern) => pattern.test(value));
}

function hasWalkLikeName(value: string): boolean {
  const normalized = normalizeLabel(value);
  if (!normalized || hasExcludedWalkName(normalized)) return false;
  return (
    /\btreadmill\s+walk\b/i.test(normalized) ||
    /\bincline\s+walk\b/i.test(normalized) ||
    /\bwalking\b/i.test(normalized) ||
    /\bwalk\b/i.test(normalized)
  );
}

function convertDistanceToMeters(distance?: number, unit?: string): number | undefined {
  if (typeof distance !== "number" || !Number.isFinite(distance) || distance <= 0) return undefined;
  const normalizedUnit = String(unit ?? "m").trim().toLowerCase();
  if (normalizedUnit === "steps") return undefined;
  if (normalizedUnit === "mi" || normalizedUnit === "mile" || normalizedUnit === "miles") return distance * METERS_PER_MILE;
  if (normalizedUnit === "km" || normalizedUnit === "kilometer" || normalizedUnit === "kilometers") return distance * 1000;
  return distance;
}

function getSessionDurationSeconds(session: Session): number | undefined {
  const startedAt = Number(session.startedAt);
  const endedAt = Number(session.endedAt);
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt <= startedAt) return undefined;
  return Math.round((endedAt - startedAt) / 1000);
}

function classifyWalkSession(args: {
  session: Session;
  sets: SetEntry[];
  trackById: Map<string, Track>;
  exerciseById: Map<string, Exercise>;
}): CardioWalkConfidence | null {
  const sessionName = String(args.session.templateName ?? "");
  const sessionNameWalkLike = hasWalkLikeName(sessionName);
  if (hasExcludedWalkName(sessionName)) return null;

  let hasConditioningEvidence = false;
  let hasWalkLikeConditioningName = false;
  let hasStrengthEvidence = false;

  for (const set of args.sets) {
    const track = args.trackById.get(set.trackId);
    if (!track) continue;
    const exercise = args.exerciseById.get(track.exerciseId);
    const trackType = String(track.trackType ?? "").trim().toLowerCase();
    const combinedName = [track.displayName, exercise?.name].filter(Boolean).join(" ");

    if (STRENGTH_TRACK_TYPES.has(trackType)) hasStrengthEvidence = true;
    if (trackType === "conditioning") {
      hasConditioningEvidence = true;
      if (hasWalkLikeName(combinedName)) hasWalkLikeConditioningName = true;
      if (hasExcludedWalkName(combinedName)) return null;
    }
  }

  if (hasStrengthEvidence && !hasConditioningEvidence) return null;
  if (sessionNameWalkLike && hasConditioningEvidence) return "high";
  if (hasWalkLikeConditioningName) return sessionNameWalkLike ? "high" : "medium";
  return null;
}

function buildWindowSummary(walks: CardioWalkEvent[], now: number, days: number): CardioWalkWindowSummary {
  const start = now - days * DAY_MS;
  const windowWalks = walks.filter((walk) => walk.startedAt >= start && walk.startedAt <= now);
  const durationWalks = windowWalks.filter((walk) => typeof walk.durationSeconds === "number");
  const distanceWalks = windowWalks.filter((walk) => typeof walk.distanceMeters === "number");
  const paceWalks = windowWalks.filter(
    (walk) =>
      typeof walk.durationSeconds === "number" &&
      typeof walk.distanceMeters === "number" &&
      walk.distanceMeters > 0
  );

  const totalDurationSeconds = durationWalks.reduce((sum, walk) => sum + (walk.durationSeconds ?? 0), 0);
  const totalDistanceMeters = distanceWalks.reduce((sum, walk) => sum + (walk.distanceMeters ?? 0), 0);
  const paceDurationSeconds = paceWalks.reduce((sum, walk) => sum + (walk.durationSeconds ?? 0), 0);
  const paceDistanceMeters = paceWalks.reduce((sum, walk) => sum + (walk.distanceMeters ?? 0), 0);

  return {
    count: windowWalks.length,
    totalDurationSeconds,
    totalDistanceMeters,
    averageDurationSeconds: durationWalks.length ? totalDurationSeconds / durationWalks.length : undefined,
    averagePaceSecondsPerMile:
      paceDistanceMeters > 0 ? paceDurationSeconds / (paceDistanceMeters / METERS_PER_MILE) : undefined,
  };
}

function buildDailySummaries(walks: CardioWalkEvent[]): CardioDailyWalkSummary[] {
  const byDate = new Map<string, CardioDailyWalkSummary>();

  for (const walk of walks) {
    const current =
      byDate.get(walk.date) ??
      ({
        date: walk.date,
        count: 0,
        totalDurationSeconds: 0,
        totalDistanceMeters: 0,
        sessionIds: [],
      } satisfies CardioDailyWalkSummary);

    current.count += 1;
    current.totalDurationSeconds += walk.durationSeconds ?? 0;
    current.totalDistanceMeters += walk.distanceMeters ?? 0;
    current.sessionIds.push(walk.sessionId);
    byDate.set(walk.date, current);
  }

  return Array.from(byDate.values()).sort((a, b) => b.date.localeCompare(a.date));
}

function buildDataQuality(walks: CardioWalkEvent[]): CardioWalkDataQuality {
  const coverage = {
    source: 0,
    route: 0,
    pace: 0,
    elevation: 0,
    avgHr: 0,
    maxHr: 0,
    notes: 0,
  };

  for (const walk of walks) {
    if (walk.source) coverage.source += 1;
    if (walk.route) coverage.route += 1;
    if (walk.paceSecondsPerMile != null) coverage.pace += 1;
    if (walk.elevationText) coverage.elevation += 1;
    if (walk.avgHr != null) coverage.avgHr += 1;
    if (walk.maxHr != null) coverage.maxHr += 1;
    if (walk.notes) coverage.notes += 1;
  }

  return {
    missingDistanceCount: walks.filter((walk) => walk.distanceMeters == null).length,
    missingDurationCount: walks.filter((walk) => walk.durationSeconds == null).length,
    notesFieldCoverage: coverage,
    unsupportedSignals: ["routeTrend", "zoneDistribution", "liftingInterference"],
  };
}

export function buildCardioWalkSummary(input: BuildCardioWalkSummaryInput): CardioWalkSummary {
  const setsBySessionId = new Map<string, SetEntry[]>();
  const trackById = new Map((input.tracks ?? []).map((track) => [track.id, track]));
  const exerciseById = new Map((input.exercises ?? []).map((exercise) => [exercise.id, exercise]));
  const now = input.now ?? Date.now();
  const recentLimit = Math.max(0, Math.floor(input.recentLimit ?? 10));

  for (const set of input.sets ?? []) {
    if (set.deletedAt) continue;
    const bucket = setsBySessionId.get(set.sessionId) ?? [];
    bucket.push(set);
    setsBySessionId.set(set.sessionId, bucket);
  }

  const normalizedWalks = (input.sessions ?? [])
    .filter((session) => !session.deletedAt)
    .map((session): CardioWalkEvent | null => {
      const sessionSets = setsBySessionId.get(session.id) ?? [];
      const confidence = classifyWalkSession({
        session,
        sets: sessionSets,
        trackById,
        exerciseById,
      });
      if (!confidence) return null;

      let totalDistanceMeters = 0;
      let hasDistance = false;
      let totalDurationSeconds = 0;
      let hasDuration = false;

      for (const set of sessionSets) {
        const track = trackById.get(set.trackId);
        if (track?.trackType !== "conditioning") continue;

        const distanceMeters = convertDistanceToMeters(set.distance, (set as any).distanceUnit);
        if (distanceMeters != null) {
          hasDistance = true;
          totalDistanceMeters += distanceMeters;
        }

        if (typeof set.seconds === "number" && Number.isFinite(set.seconds) && set.seconds > 0) {
          hasDuration = true;
          totalDurationSeconds += set.seconds;
        }
      }

      const fallbackDurationSeconds = hasDuration ? undefined : getSessionDurationSeconds(session);
      const durationSeconds = hasDuration ? totalDurationSeconds : fallbackDurationSeconds;
      const distanceMeters = hasDistance ? totalDistanceMeters : undefined;
      const parsedNotes = parseCardioSessionNotes(session.notes);
      const derivedPace =
        parsedNotes.paceSecondsPerMile ??
        (durationSeconds != null && distanceMeters != null && distanceMeters > 0
          ? durationSeconds / (distanceMeters / METERS_PER_MILE)
          : undefined);

      return {
        sessionId: session.id,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        date: localDateKey(session.startedAt),
        name: session.templateName ?? "Walk",
        source: parsedNotes.source,
        route: parsedNotes.route,
        durationSeconds,
        distanceMeters,
        paceSecondsPerMile: derivedPace,
        elevationText: parsedNotes.elevationText,
        avgHr: parsedNotes.avgHr,
        maxHr: parsedNotes.maxHr,
        notes: session.notes,
        confidence,
      };
    })
    .filter((walk): walk is CardioWalkEvent => walk != null)
    .sort((a, b) => b.startedAt - a.startedAt);

  return {
    normalizedWalks,
    recentWalks: normalizedWalks.slice(0, recentLimit),
    dailySummaries: buildDailySummaries(normalizedWalks),
    last7d: buildWindowSummary(normalizedWalks, now, 7),
    last28d: buildWindowSummary(normalizedWalks, now, 28),
    dataQuality: buildDataQuality(normalizedWalks),
  };
}
