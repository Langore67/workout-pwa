import { db, Readiness, SessionSummary, StoredPR, UUID } from "./db";
import { getSessionPRs } from "./progression";

/**
 * Finalizes a session (finish-only intelligence):
 * - sets endedAt (if missing)
 * - stores readiness (optional)
 * - computes working-only volume + counts
 * - computes PR hits (post-session only)
 * - stores session.summary + session.prs
 * - updates template.lastRunAt (finish-only)
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

  // PRs (post-session only)
  const prHits = await getSessionPRs(sessionId);
  const prs: StoredPR[] = prHits.map((p) => ({
    trackId: p.trackId,
    prType: p.prType,
    value: p.value,
    prevBest: p.prevBest,
    setEntryId: p.setEntryId as any,
  }));

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
      await db.templates.update(sess.templateId, { lastRunAt: endedAt });
    }
  });

  return { endedAt, summary, prs };
}
