import { db } from "../db";

export const ORPHAN_RDL_EXERCISE_ID = "881d520a-155a-4213-9a48-f000ec5cdefc";
export const ACTIVE_RDL_EXERCISE_ID = "a4decf70-c8ec-4a57-8001-1f15408cb6c3";

export type RdlRepairResult = {
  ok: boolean;
  message: string;
  tracksMoved: number;
  sessionItemsMoved: number;
  setsMoved: number;
};

export async function repairRomanianDeadliftHistory(): Promise<RdlRepairResult> {
  const target = await db.exercises.get(ACTIVE_RDL_EXERCISE_ID);
  if (!target) {
    throw new Error(`Target Romanian Deadlift exercise not found: ${ACTIVE_RDL_EXERCISE_ID}`);
  }

  let tracksMoved = 0;
  let sessionItemsMoved = 0;
  let setsMoved = 0;

  await db.transaction("rw", db.tracks, db.sessionItems, db.sets, async () => {
    const orphanTracks = await db.tracks.where("exerciseId").equals(ORPHAN_RDL_EXERCISE_ID).toArray();
    for (const track of orphanTracks) {
      await db.tracks.update(track.id, { exerciseId: ACTIVE_RDL_EXERCISE_ID });
      tracksMoved += 1;
    }

    const sessionItems = await db.sessionItems.toArray();
    for (const item of sessionItems as any[]) {
      if (item?.exerciseId !== ORPHAN_RDL_EXERCISE_ID || !item?.id) continue;
      await (db.sessionItems as any).update(item.id, { exerciseId: ACTIVE_RDL_EXERCISE_ID });
      sessionItemsMoved += 1;
    }

    const sets = await db.sets.toArray();
    for (const set of sets as any[]) {
      if (set?.exerciseId !== ORPHAN_RDL_EXERCISE_ID || !set?.id) continue;
      await (db.sets as any).update(set.id, { exerciseId: ACTIVE_RDL_EXERCISE_ID });
      setsMoved += 1;
    }
  });

  const totalMoved = tracksMoved + sessionItemsMoved + setsMoved;
  return {
    ok: true,
    message:
      totalMoved > 0
        ? "RDL history repair complete."
        : "No RDL history rows needed repair.",
    tracksMoved,
    sessionItemsMoved,
    setsMoved,
  };
}
