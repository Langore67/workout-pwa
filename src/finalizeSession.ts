import { db, Readiness, SessionSummary, StoredPR, UUID } from "./db";
import { computeAndStorePRsForSession } from "./prs";

/**
 * Shared helper for Gym's current live finalize write contract.
 *
 * This intentionally preserves Gym's existing runtime behavior:
 * - sets endedAt
 * - stores trimmed notes
 * - stores prsJson using the current Gym PR engine
 * - updates template.lastPerformedAt
 *
 * It does not adopt the richer finalizeSession() payload contract yet.
 */
export async function finalizeGymSessionWrites(
  sessionId: UUID,
  opts?: { notes?: string }
): Promise<{ endedAt: number; prsJson: string }> {
  const sess = await db.sessions.get(sessionId);
  if (!sess) throw new Error("finalizeGymSessionWrites: session not found");

  const endedAt = Date.now();
  const notes = (opts?.notes ?? sess.notes ?? "").trim() || undefined;

  await db.sessions.update(sessionId, {
    notes,
    endedAt,
  });

  const hits = await computeAndStorePRsForSession(sessionId);
  const prsJson = JSON.stringify(hits ?? []);
  await db.sessions.update(sessionId, { prsJson });

  if (sess.templateId) {
    await db.templates.update(sess.templateId, { lastPerformedAt: endedAt } as any);
  }

  return { endedAt, prsJson };
}

/**
 * Finalizes a session (finish-only intelligence):
 * - sets endedAt (if missing)
 * - stores readiness (optional)
 * - computes working-only volume + counts
 * - computes PR hits (post-session only)
 * - stores session.summary + session.prs
 * - updates template.lastPerformedAt (finish-only)
 */
export async function finalizeSession(
  sessionId: UUID,
  opts?: { notes?: string; readiness?: Readiness }
): Promise<{ endedAt: number; summary: SessionSummary; prs: StoredPR[] }> {
  const sess = await db.sessions.get(sessionId);
  if (!sess) throw new Error("finalizeSession: session not found");

  const endedAt = sess.endedAt ?? Date.now();
  const readiness = opts?.readiness ?? sess.readiness ?? "Normal";
  const notes = (opts?.notes ?? sess.notes ?? "").trim() || undefined;

  // Load session items for exercise count
  const sessionItems = await db.sessionItems.where("sessionId").equals(sessionId).toArray();
  const exerciseCount =
    sessionItems.length > 0
      ? sessionItems.length
      : (await db.sets.where("sessionId").equals(sessionId).toArray()).reduce((acc, s) => {
          acc.add(s.trackId);
          return acc;
        }, new Set<string>()).size;

  // Load working sets
  const working = await db.sets
    .where("sessionId")
    .equals(sessionId)
    .and((s) => s.setType === "working")
    .toArray();

  const isCompletedWorking = (s: any) =>
    (typeof s.reps === "number" && s.reps > 0) ||
    (typeof s.seconds === "number" && s.seconds > 0) ||
    typeof s.weight === "number";

  const completedWorking = working.filter(isCompletedWorking);

  // Volume = Σ(weight * reps), working only
  const totalVolume = completedWorking.reduce((sum, s) => {
    const w = typeof s.weight === "number" ? s.weight : 0;
    const r = typeof s.reps === "number" ? s.reps : 0;
    if (!(w > 0) || !(r > 0)) return sum;
    return sum + w * r;
  }, 0);

  const durationSeconds =
    endedAt && sess.startedAt ? Math.max(0, Math.round((endedAt - sess.startedAt) / 1000)) : undefined;

  // Legacy richer finalize path: approximate StoredPR rows from the current PR engine.
  const prHits = await computeAndStorePRsForSession(sessionId);
  const prs: StoredPR[] = [];
  for (const hit of prHits) {
    if (hit.hits.includes("volume") && hit.volume) {
      prs.push({
        trackId: hit.trackId,
        prType: "volume" as any,
        value: hit.volume.value,
        prevBest: undefined,
        setEntryId: undefined as any,
      });
    }
    if (hit.hits.includes("weight") && hit.weight) {
      prs.push({
        trackId: hit.trackId,
        prType: "weight" as any,
        value: hit.weight.weight,
        prevBest: undefined,
        setEntryId: undefined as any,
      });
    }
    if (hit.hits.includes("e1rm") && hit.e1rm) {
      prs.push({
        trackId: hit.trackId,
        prType: "e1rm" as any,
        value: hit.e1rm.value,
        prevBest: undefined,
        setEntryId: undefined as any,
      });
    }
  }

  const summary: SessionSummary = {
    durationSeconds,
    exerciseCount,
    workingSetCount: completedWorking.length,
    totalVolume: Math.round(totalVolume),
    prCount: prs.length,
    // prExerciseNames filled later (we’ll do it in SessionCompletePage using track names)
  };

  await db.transaction("rw", db.sessions, db.templates, async () => {
    await db.sessions.update(sessionId, {
      endedAt,
      readiness,
      notes,
      summary,
      prs,
    });

    if (sess.templateId) {
      await db.templates.update(sess.templateId, { lastPerformedAt: endedAt });
    }
  });

  return { endedAt, summary, prs };
}
