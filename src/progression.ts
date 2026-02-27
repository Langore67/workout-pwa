// /src/progression.ts
import { db } from "./db";
import type { Track, SetEntry } from "./db";

type SetKind = "warmup" | "working" | "drop" | "failure";

export type BestSessionResult = {
  trackId: string;
  sessionId: string;
  endedAt?: number;
  bestWeight?: number;
  bestReps?: number;
  bestE1RM?: number;
  totalWorkingSets?: number;
};

function isFiniteNum(x: any): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function roundToStep(w: number, step: number) {
  if (!isFiniteNum(w) || !isFiniteNum(step) || step <= 0) return w;
  return Math.round(w / step) * step;
}

function getSetKind(s: any): SetKind {
  const raw = String(s?.setType ?? "working");
  return raw === "warmup" || raw === "working" || raw === "drop" || raw === "failure" ? (raw as SetKind) : "working";
}

function epleyE1RM(weight: number, reps: number) {
  // Common simple estimator; stable and “good enough” for suggestions.
  // If reps=1, e1RM ~= weight.
  return weight * (1 + reps / 30);
}

function defaultWeightJump(track: Track): number {
  const jump = (track as any).weightJumpDefault;
  if (isFiniteNum(jump) && jump > 0) return jump;
  return 5; // sane default
}

function defaultPlateStep(track: Track): number {
  // If you later add track.roundingIncrement or plateIncrement, this will use it.
  const inc = (track as any).roundingIncrement ?? (track as any).plateIncrement;
  if (isFiniteNum(inc) && inc > 0) return inc;
  return 5; // default to 5 lb rounding for simplicity
}

/**
 * Finds the best recent session for a given track in the last N days.
 * "Best" = highest e1RM among WORKING sets with weight+reps.
 */
export async function getBestSessionLastNDays(trackId: string, days: number): Promise<BestSessionResult | null> {
  if (!trackId) return null;

  const now = Date.now();
  const windowMs = Math.max(1, days) * 24 * 60 * 60 * 1000;
  const cutoff = now - windowMs;

  // Pull recent sets for this track, then filter to sessions ended in window.
  // Dexie queries vary by schema; this approach is stable if you have an index on trackId.
  const allTrackSets = (await db.sets.where("trackId").equals(trackId).reverse().sortBy("createdAt")) as (SetEntry & {
    setType?: string;
    completedAt?: number;
  })[];

  if (!allTrackSets?.length) return null;

  // Find candidate sessions (exclude current/in-progress: endedAt must exist)
  const sessionIds = Array.from(new Set(allTrackSets.map((s) => s.sessionId).filter(Boolean))).slice(0, 60);
  const sessions = (await db.sessions.bulkGet(sessionIds)).filter(Boolean) as any[];

  const endedSessionsInWindow = new Set<string>(
    sessions
      .filter((s) => isFiniteNum(s?.endedAt) && (s.endedAt as number) >= cutoff)
      .map((s) => String(s.id))
  );

  if (endedSessionsInWindow.size === 0) return null;

  const candidateSets = allTrackSets
    .filter((s) => endedSessionsInWindow.has(String(s.sessionId)))
    .filter((s) => getSetKind(s) === "working");

  // Compute best by e1RM
  let best: BestSessionResult | null = null;

  for (const s of candidateSets) {
    const weight = (s as any).weight;
    const reps = (s as any).reps;

    if (!isFiniteNum(weight) || !isFiniteNum(reps) || reps <= 0 || weight < 0) continue;

    const e1 = epleyE1RM(weight, reps);

    if (!best || (best.bestE1RM ?? 0) < e1) {
      const sess = sessions.find((x) => String(x.id) === String(s.sessionId));
      best = {
        trackId,
        sessionId: String(s.sessionId),
        endedAt: isFiniteNum(sess?.endedAt) ? (sess.endedAt as number) : undefined,
        bestWeight: weight,
        bestReps: reps,
        bestE1RM: e1,
        totalWorkingSets: candidateSets.filter((x) => String(x.sessionId) === String(s.sessionId)).length,
      };
    }
  }

  return best;
}

/**
 * Produces UI strings + a prefill weight for GymPage.
 */
export function suggestionFromBest(
  track: Track,
  repMin: number,
  repMax: number,
  workingTarget: number,
  best: BestSessionResult | null
): { summary: string; suggestion: string; prefillWeight?: number } {
  // Correctives or non-weighted modes: keep it simple.
  const trackingMode = String((track as any).trackingMode ?? "");
  const trackType = String((track as any).trackType ?? "");
  const isCorrective = trackType === "corrective";

  // If not weightedReps, don't try to prefill weight.
  const isWeighted = trackingMode === "weightedReps";

  const jump = defaultWeightJump(track);
  const step = defaultPlateStep(track);
  const rirTargetMin = (track as any).rirTargetMin;

  const repLo = isFiniteNum(repMin) ? repMin : 8;
  const repHi = isFiniteNum(repMax) ? repMax : repLo;

  if (isCorrective || !isWeighted) {
    const summary = best?.bestReps
      ? `Last best: ${best.bestReps} reps`
      : `No recent baseline found.`;
    const suggestion = isCorrective
      ? `Complete the corrective with clean form.`
      : `Log ${workingTarget} set(s) within ${repLo}–${repHi} reps.`;
    return { summary, suggestion };
  }

  // WeightedReps suggestions
  if (!best || !isFiniteNum(best.bestWeight) || !isFiniteNum(best.bestReps)) {
    const summary = `No recent baseline found.`;
    const suggestion = `Start conservative. Aim ${repLo}–${repHi} reps for ${workingTarget} working set(s).`;
    return { summary, suggestion, prefillWeight: undefined };
  }

  const lastW = best.bestWeight!;
  const lastR = best.bestReps!;

  // Decide next target weight:
  // - If you hit or exceeded repMax last time -> add jump
  // - If below repMin -> reduce jump
  // - Else keep weight (try to add reps)
  let nextW = lastW;
  let planText = "";

  if (lastR >= repHi) {
    nextW = lastW + jump;
    planText = `You topped the range last time (${lastW} x ${lastR}). Add ${jump} lb and stay in ${repLo}–${repHi}.`;
  } else if (lastR < repLo) {
    nextW = Math.max(0, lastW - jump);
    planText = `You were under range last time (${lastW} x ${lastR}). Drop ${jump} lb and rebuild into ${repLo}–${repHi}.`;
  } else {
    nextW = lastW;
    planText = `Keep ${lastW} lb and try to add reps toward ${repHi} while staying >= ${repLo}.`;
  }

  nextW = roundToStep(nextW, step);

  const endedTxt = best.endedAt ? ` on ${new Date(best.endedAt).toLocaleDateString()}` : "";
  const summary = `Best in last sessions: ${lastW} x ${lastR}${endedTxt}.`;
  const rirHint =
    isFiniteNum(rirTargetMin) ? ` Target RIR >= ${clamp(rirTargetMin, 0, 6)}.` : "";

  const suggestion = `${planText}${rirHint ? " " + rirHint : ""}`;

  return { summary, suggestion, prefillWeight: nextW };
}
