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
const patternMap: Record<string, StrengthPattern> = {
  // replace with your real exerciseIds
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

// --- Main computation ---
export async function computeStrengthIndex(windowDays = 28): Promise<StrengthIndexResult> {
  const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;

  const sessions = await db.sessions
    .where("endedAt")
    .above(cutoff)
    .toArray();

  const sessionIds = sessions.map((s) => s.id);

  const sets = await db.sets
    .where("sessionId")
    .anyOf(sessionIds)
    .toArray();

  const working = sets.filter(
    (s: any) =>
      s.completedAt &&
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

  for (const s of working) {
    const track = await db.tracks.get(s.trackId);
    if (!track) continue;

    const pattern = getPattern(track.exerciseId);
    if (!pattern) continue;

    const e1rm = computeE1RM(s.weight, s.reps);
    if (e1rm > bestByPattern[pattern]) {
      bestByPattern[pattern] = e1rm;
    }
  }

  // --- bodyweight ---
  const latestBody = await db.bodyLogs
    .orderBy("date")
    .reverse()
    .first();

  const bodyweight = latestBody?.weight ?? 200;

  const patterns: PatternScore[] = (Object.keys(bestByPattern) as StrengthPattern[]).map(
    (p) => ({
      pattern: p,
      absolute: bestByPattern[p],
      relative: bestByPattern[p] / bodyweight,
    })
  );

  const absoluteIndex =
    patterns.reduce((sum, p) => sum + p.absolute, 0) / patterns.length;

  const relativeIndex =
    patterns.reduce((sum, p) => sum + p.relative, 0) / patterns.length;

  return {
    absoluteIndex,
    relativeIndex,
    patterns,
    bodyweight,
  };
}