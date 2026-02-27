import React, { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { PRHit } from '../prs';
import { formatNum } from '../utils';

export default function SessionCompletePage() {
  const { sessionId } = useParams();
  const nav = useNavigate();

  const session = useLiveQuery(() => sessionId ? db.sessions.get(sessionId) : Promise.resolve(undefined), [sessionId]);
  const sets = useLiveQuery(() => sessionId ? db.sets.where('sessionId').equals(sessionId).toArray() : Promise.resolve([]), [sessionId]);

  const prs: PRHit[] = useMemo(() => {
    try {
      if (!session?.prsJson) return [];
      const parsed = JSON.parse(session.prsJson);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [session?.prsJson]);

  if (!sessionId) return <div className="card"><p className="muted">Missing session id.</p></div>;
  if (!session) return <div className="card"><p className="muted">Loading…</p></div>;

  const durationMin = session.endedAt ? Math.max(1, Math.round((session.endedAt - session.startedAt) / 60000)) : undefined;
  const workingCount = (sets ?? []).filter(s => s.setType === 'working').length;
  const warmupCount = (sets ?? []).filter(s => s.setType === 'warmup').length;

  return (
    <div className="grid">
      <div className="card">
        <h2>Session complete</h2>
        <p className="muted">Quiet summary. No mid-session noise.</p>
        <hr />

        <div className="kv"><span>Template</span><span><b>{session.templateName ?? 'Ad-hoc'}</b></span></div>
        <div className="kv"><span>Started</span><span>{new Date(session.startedAt).toLocaleString()}</span></div>
        {session.endedAt && <div className="kv"><span>Duration</span><span>{durationMin} min</span></div>}
        <div className="kv"><span>Sets</span><span>{warmupCount} warm-up • {workingCount} working</span></div>

        <hr />
        <div className="row">
          <button className="btn primary" onClick={() => nav('/')}>Done</button>
          <button className="btn" onClick={() => nav('/history')}>View history</button>
          <button className="btn" onClick={() => nav('/export')}>Export</button>
        </div>
      </div>

      {prs.length > 0 && (
        <div className="card">
          <h2>PRs (quiet)</h2>
          <p className="muted">Shown only when you hit at least one PR.</p>
          <hr />

          {prs.map(p => (
            <div key={p.trackId} style={{marginBottom:12}}>
              <div style={{display:'flex', justifyContent:'space-between', gap:12, alignItems:'baseline'}}>
                <div><b>{p.trackName}</b></div>
                <div className="badge green">{p.hits.join(' + ')}</div>
              </div>

              <div className="muted" style={{marginTop:6}}>
                {p.volume && <div>Volume: {formatNum(p.volume.weight,0)} × {formatNum(p.volume.reps,0)} = {formatNum(p.volume.value,0)}</div>}
                {p.weight && <div>Weight: {formatNum(p.weight.weight,0)} × {formatNum(p.weight.reps,0)}</div>}
                {p.e1rm && <div>e1RM (cap 12): ~{formatNum(p.e1rm.value,0)} from {formatNum(p.e1rm.weight,0)} × {formatNum(p.e1rm.reps,0)}</div>}
              </div>

              <hr />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
