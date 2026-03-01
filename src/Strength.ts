// src/strength/strength.ts
import { db } from "../db";

export type StrengthPattern = "squat" | "hinge" | "push" | "pull";

export interface PatternScore {
  pattern: StrengthPattern;
  absolute: number; // raw e1RM
  relative: number; // e1RM / bodyweight
}

export interface StrengthIndexResult {
  absoluteIndex: number;
  relativeIndex: number;
  patterns: PatternScore[];
  bodyweight: number;
}

// --- Basic Epley ---
export function computeE1RM(weight: number, reps: number) {
  return weight * (1 + reps / 30);
}

// --- Hardcoded exercise → pattern mapping (v1) ---
// NOTE: these keys must match your Track.exerciseId values.
const patternMap: Record<string, StrengthPattern> = {
  squat: "squat",
  box_squat: "squat",
  rdl: "hinge",
  deadlift: "hinge",
  bench: "push",
  incline_bench: "push",
  row: "pull",
  lat_pulldown: "pull",
};

function getPattern(exerciseId: string): StrengthPattern | undefined {
  return patternMap[exerciseId];
}

export async function computeStrengthIndex(windowDays = 28): Promise<StrengthIndexResult> {
  const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;

  // Sessions in window (endedAt is indexed per your schema)
  const sessions = await db.sessions.where("endedAt").above(cutoff).toArray();
  const sessionIds = sessions.map((s) => s.id);
  if (sessionIds.length === 0) {
    const bodyweight = await getLatestBodyweightFallback();
    return {
      absoluteIndex: 0,
      relativeIndex: 0,
      patterns: [
        { pattern: "squat", absolute: 0, relative: 0 },
        { pattern: "hinge", absolute: 0, relative: 0 },
        { pattern: "push", absolute: 0, relative: 0 },
        { pattern: "pull", absolute: 0, relative: 0 },
      ],
      bodyweight,
    };
  }

  // Pull all sets for those sessions
  const sets = await db.sets.where("sessionId").anyOf(sessionIds).toArray();

  // Filter to completed working sets w/ weight+reps
  const working = sets.filter(
    (s: any) =>
      typeof s?.completedAt === "number" &&
      s.completedAt > 0 &&
      s.setType === "working" &&
      typeof s.weight === "number" &&
      typeof s.reps === "number"
  );

  const bestByPattern: Record<StrengthPattern, number> = {
    squat: 0,
    hinge: 0,
    push: 0,
    pull: 0,
  };

  if (working.length > 0) {
    // Avoid N+1 DB calls: bulk get tracks
    const trackIds = Array.from(new Set(working.map((s: any) => s.trackId)));
    const tracks = await db.tracks.bulkGet(trackIds);

    const trackById = new Map<string, any>();
    for (const t of tracks) if (t?.id) trackById.set(t.id, t);

    for (const s of working) {
      const track = trackById.get(s.trackId);
      if (!track) continue;

      const pattern = getPattern(track.exerciseId);
      if (!pattern) continue;

      const e1rm = computeE1RM(s.weight, s.reps);
      if (e1rm > bestByPattern[pattern]) bestByPattern[pattern] = e1rm;
    }
  }

  // Bodyweight from bodyMetrics (measuredAt indexed)
  const bodyweight = await getLatestBodyweightFallback();

  const patterns: PatternScore[] = (Object.keys(bestByPattern) as StrengthPattern[]).map((p) => ({
    pattern: p,
    absolute: bestByPattern[p],
    relative: bodyweight > 0 ? bestByPattern[p] / bodyweight : 0,
  }));

  const absoluteIndex = patterns.reduce((sum, p) => sum + p.absolute, 0) / patterns.length;
  const relativeIndex = patterns.reduce((sum, p) => sum + p.relative, 0) / patterns.length;

  return { absoluteIndex, relativeIndex, patterns, bodyweight };
}

async function getLatestBodyweightFallback(): Promise<number> {
  // bodyMetrics has: measuredAt, weightLb
  try {
    const latest = await db.bodyMetrics.orderBy("measuredAt").reverse().first();
    const bw = latest?.weightLb;
    return typeof bw === "number" && Number.isFinite(bw) && bw > 0 ? bw : 200;
  } catch {
    return 200;
  }
}