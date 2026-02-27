import React, { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { getSessionPRs, prTypeLabel, PRHit } from "../progression";

function fmtNumber(n: number) {
  if (!Number.isFinite(n)) return "—";
  return Math.round(n).toString();
}

function fmtDelta(delta: number) {
  if (!Number.isFinite(delta)) return "";
  const d = Math.round(delta);
  return d > 0 ? `+${d}` : `${d}`;
}

type Row = {
  hit: PRHit;
  trackName: string;
  weight?: number;
  reps?: number;
};

export function SessionPRs({ sessionId }: { sessionId: string }) {
  const hits = useLiveQuery(() => getSessionPRs(sessionId), [sessionId]);

  const rows = useLiveQuery(async () => {
    if (!hits) return null;
    if (hits.length === 0) return [];

    const trackIds = Array.from(new Set(hits.map((h) => h.trackId)));
    const setIds = Array.from(new Set(hits.map((h) => h.setEntryId)));

    const [tracks, sets] = await Promise.all([db.tracks.bulkGet(trackIds), db.sets.bulkGet(setIds)]);

    const trackById = new Map(tracks.filter(Boolean).map((t) => [t!.id, t!]));
    const setById = new Map(sets.filter(Boolean).map((s) => [s!.id, s!]));

    const out: Row[] = [];
    for (const hit of hits) {
      const t = trackById.get(hit.trackId);
      const s = setById.get(hit.setEntryId);
      if (!t) continue;

      out.push({
        hit,
        trackName: t.displayName,
        weight: s?.weight,
        reps: s?.reps,
      });
    }

    return out;
  }, [hits?.length, sessionId]);

  const grouped = useMemo(() => {
    if (!rows) return null;
    const m = new Map<string, Row[]>();
    for (const r of rows) {
      const arr = m.get(r.trackName) ?? [];
      arr.push(r);
      m.set(r.trackName, arr);
    }
    for (const [k, arr] of m.entries()) {
      arr.sort((a, b) => prTypeLabel(a.hit.prType).localeCompare(prTypeLabel(b.hit.prType)));
      m.set(k, arr);
    }
    return m;
  }, [rows]);

  if (!hits || !rows || !grouped) return null;

  return (
    <div className="card" data-testid="session-prs-card">
      {/* Make the title a real heading so role-based locators work too */}
      <h3 className="cardTitle" style={{ marginTop: 0 }} data-testid="session-prs-title">
        Personal Records
      </h3>

      {hits.length === 0 ? (
        <div className="muted" data-testid="session-prs-empty">
          No PRs this session.
        </div>
      ) : (
        <div className="stack" data-testid="session-prs-list">
          {Array.from(grouped.entries()).map(([trackName, items]) => (
            <div key={trackName} className="prGroup" data-testid="session-prs-group">
              <div className="strong">{trackName}</div>

              <div className="prList">
                {items.map(({ hit, weight, reps }) => {
                  const delta = hit.prevBest != null ? hit.value - hit.prevBest : undefined;

                  return (
                    <div key={hit.prType} className="prRow" data-testid="session-prs-row">
                      <div className="prLeft">
                        <div className="muted">{prTypeLabel(hit.prType)}</div>
                        <div className="small">
                          {typeof weight === "number" ? weight : "—"} x {typeof reps === "number" ? reps : "—"}
                        </div>
                      </div>

                      <div className="prRight">
                        <div className="strong">{fmtNumber(hit.value)}</div>
                        {typeof delta === "number" ? <div className="muted">{fmtDelta(delta)}</div> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
