import { db, SetEntry, TrackPRs, Track } from './db';
import { computeE1RM, computeScoredE1RM } from "./strength/Strength";

export type PRType = 'volume' | 'weight' | 'e1rm';

export interface PRHit {
  trackId: string;
  trackName: string;
  hits: PRType[];
  volume?: { weight: number; reps: number; value: number };
  weight?: { weight: number; reps: number };
  e1rm?: { weight: number; reps: number; value: number };
}

function epleyE1RM(weight: number, reps: number): number {
  return computeE1RM(weight, reps);
}

function prOrder(t: PRType): number {
  // Priority: volume, then weight, then e1rm
  if (t === 'volume') return 0;
  if (t === 'weight') return 1;
  return 2;
}

export async function computeAndStorePRsForSession(sessionId: string): Promise<PRHit[]> {
  const sets = await db.sets.where('sessionId').equals(sessionId).toArray();
  if (!sets.length) return [];

  const working = sets.filter(
    s => s.setType === 'working' && typeof s.weight === 'number' && typeof s.reps === 'number'
  );
  if (!working.length) return [];

  const trackIds = Array.from(new Set(working.map(s => s.trackId)));
  const tracks = (await db.tracks.bulkGet(trackIds)).filter(Boolean) as Track[];
  const trackById = new Map(tracks.map(t => [t.id, t]));

  const hits: PRHit[] = [];

  for (const trackId of trackIds) {
    const track = trackById.get(trackId);
    if (!track) continue;
    if (track.trackingMode !== 'weightedReps') continue;

    const rows = working.filter(s => s.trackId === trackId) as SetEntry[];

    let bestVol: { weight: number; reps: number; value: number; at: number } | null = null;
    let bestWt: { weight: number; reps: number; at: number } | null = null;
    let bestE: { weight: number; reps: number; value: number; at: number } | null = null;

    for (const s of rows) {
      const w = s.weight as number;
      const r = s.reps as number;
      const at = s.createdAt;

      const vol = w * r;
      if (!bestVol || vol > bestVol.value) bestVol = { weight: w, reps: r, value: vol, at };

      if (!bestWt || w > bestWt.weight || (w === bestWt.weight && r > bestWt.reps)) bestWt = { weight: w, reps: r, at };

      const e = computeScoredE1RM(w, r);
      if (e > 0 && (!bestE || e > bestE.value)) {
        bestE = { weight: w, reps: r, value: e, at };
      }
    }

    const existing = await db.trackPrs.get(trackId);
    const updated: TrackPRs = existing ?? { trackId, updatedAt: Date.now() };

    const curHit: PRHit = { trackId, trackName: track.displayName, hits: [] };

    // Volume PR (single set)
    if (bestVol) {
      const isBetter = (updated.bestVolumeValue ?? -Infinity) < bestVol.value;
      if (isBetter) {
        updated.bestVolumeValue = bestVol.value;
        updated.bestVolumeWeight = bestVol.weight;
        updated.bestVolumeReps = bestVol.reps;
        updated.bestVolumeAt = bestVol.at;
        updated.bestVolumeSessionId = sessionId;
        curHit.hits.push('volume');
      }
      curHit.volume = { weight: bestVol.weight, reps: bestVol.reps, value: bestVol.value };
    }

    // Weight PR
    if (bestWt) {
      const prevW = updated.bestWeightValue ?? -Infinity;
      const prevR = updated.bestWeightReps ?? -Infinity;
      const isBetter = bestWt.weight > prevW || (bestWt.weight === prevW && bestWt.reps > prevR);
      if (isBetter) {
        updated.bestWeightValue = bestWt.weight;
        updated.bestWeightReps = bestWt.reps;
        updated.bestWeightAt = bestWt.at;
        updated.bestWeightSessionId = sessionId;
        curHit.hits.push('weight');
      }
      curHit.weight = { weight: bestWt.weight, reps: bestWt.reps };
    }

    // e1RM PR (Epley, reps <= 12)
    if (bestE) {
      const isBetter = (updated.bestE1RMValue ?? -Infinity) < bestE.value;
      if (isBetter) {
        updated.bestE1RMValue = bestE.value;
        updated.bestE1RMWeight = bestE.weight;
        updated.bestE1RMReps = bestE.reps;
        updated.bestE1RMAt = bestE.at;
        updated.bestE1RMSessionId = sessionId;
        curHit.hits.push('e1rm');
      }
      curHit.e1rm = { weight: bestE.weight, reps: bestE.reps, value: bestE.value };
    }

    if (curHit.hits.length > 0) {
      updated.updatedAt = Date.now();
      await db.trackPrs.put(updated);
      hits.push(curHit);
    }
  }

  hits.sort((a, b) => {
    const ao = Math.min(...a.hits.map(prOrder));
    const bo = Math.min(...b.hits.map(prOrder));
    return ao - bo;
  });

  return hits;
}
