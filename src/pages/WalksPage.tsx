// src/pages/WalksPage.tsx
/* ============================================================================
   WalksPage.tsx — Walking log and history
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-03-14-WALKS-02
   FILE: src/pages/WalksPage.tsx

   Purpose
   - Track walking / conditioning volume inside the Progress system
   - Support simple manual walk logging
   - Keep history lightweight and easy to manage
   - Leave room for future MapMyWalk or external integrations

   Changes (WALKS-02)
   ✅ Add Progress-system breadcrumb header
   ✅ Add page title + subtitle for analytics-suite consistency
   ✅ Preserve existing Add Walk modal flow
   ✅ Preserve walk history table and delete actions
   ============================================================================ */

import React, { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, WalkEntry } from "../db";
import { uuid } from "../utils";
import { Page, Section } from "../components/Page.tsx";

/* ============================================================================
   Breadcrumb 1 — Page
   ============================================================================ */

export default function WalksPage() {
  const walks = useLiveQuery(() => db.walks.orderBy("date").reverse().toArray(), []);
  const [show, setShow] = useState(false);

  return (
    <Page
      title="Walks"
      subtitle="Manual log for now. (MapMyWalk integration can come later.)"
      right={
        <button className="btn primary" onClick={() => setShow(true)}>
          + Add walk
        </button>
      }
    >
      {/* ======================================================================
          Breadcrumb 1A — Progress-system page header
         ==================================================================== */}
      <Section>
        <div className="card" style={{ marginBottom: 12, padding: 14 }}>
          <div
            className="muted"
            style={{
              fontSize: 12,
              fontWeight: 700,
              marginBottom: 8,
            }}
          >
            Progress / Walks
          </div>

          <h2 style={{ marginTop: 0, marginBottom: 8 }}>Walks</h2>

          <div className="muted" style={{ lineHeight: 1.45 }}>
            Daily steps, distance, and conditioning volume.
          </div>
        </div>
      </Section>

      {/* ======================================================================
          Breadcrumb 1B — Walks content
         ==================================================================== */}
      <div className="sections-two">
        <Section
          title="Log"
          subtitle="Default: 30 min • Distance/steps optional • Notes optional"
        >
          <div className="kv">
            <div>Duration</div>
            <div>Required</div>
          </div>
          <div className="kv" style={{ marginTop: 6 }}>
            <div>Distance (miles)</div>
            <div>Optional</div>
          </div>
          <div className="kv" style={{ marginTop: 6 }}>
            <div>Steps</div>
            <div>Optional</div>
          </div>
          <div className="kv" style={{ marginTop: 6 }}>
            <div>Notes</div>
            <div>Optional</div>
          </div>

          <hr />
          <p className="muted" style={{ margin: 0 }}>
            Use the <b>+ Add walk</b> button above to log a new entry.
          </p>
        </Section>

        <Section
          title="History"
          subtitle={walks && walks.length ? `${walks.length} walk(s)` : "No walks yet."}
        >
          {walks && walks.length ? (
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Duration</th>
                  <th>Distance</th>
                  <th>Steps</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {walks.map((w) => (
                  <tr key={w.id}>
                    <td>{new Date(w.date).toLocaleString()}</td>
                    <td>{Math.round(w.durationSeconds / 60)} min</td>
                    <td>{w.distanceMiles ?? "—"}</td>
                    <td>{w.steps ?? "—"}</td>
                    <td>
                      <button
                        className="btn small danger"
                        onClick={() => db.walks.delete(w.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </Section>
      </div>

      {show && <AddWalkModal onClose={() => setShow(false)} />}
    </Page>
  );
}

/* ============================================================================
   Breadcrumb 2 — Add Walk modal
   ============================================================================ */

function AddWalkModal({ onClose }: { onClose: () => void }) {
  const [durationMin, setDurationMin] = useState(30);
  const [hasDistance, setHasDistance] = useState(false);
  const [distanceMiles, setDistanceMiles] = useState<number>(0);
  const [hasSteps, setHasSteps] = useState(false);
  const [steps, setSteps] = useState<number>(0);
  const [notes, setNotes] = useState("");

  async function save() {
    const w: WalkEntry = {
      id: uuid(),
      date: Date.now(),
      durationSeconds: Math.max(0, durationMin) * 60,
      distanceMiles: hasDistance ? distanceMiles : undefined,
      steps: hasSteps ? steps : undefined,
      notes: notes.trim() || undefined,
    };
    await db.walks.add(w);
    onClose();
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="card modal-card">
        <h2 style={{ margin: 0 }}>Add walk</h2>
        <p className="muted" style={{ marginTop: 8 }}>
          Enter duration; optionally add distance/steps/notes.
        </p>

        <hr />

        <label>Minutes</label>
        <input
          className="input"
          type="number"
          inputMode="numeric"
          value={durationMin}
          onChange={(e) => setDurationMin(Number(e.target.value))}
        />

        <hr />

        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={hasDistance}
            onChange={(e) => setHasDistance(e.target.checked)}
          />
          Include distance (miles)
        </label>
        {hasDistance && (
          <input
            className="input"
            type="number"
            inputMode="decimal"
            value={distanceMiles}
            onChange={(e) => setDistanceMiles(Number(e.target.value))}
          />
        )}

        <hr />

        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={hasSteps}
            onChange={(e) => setHasSteps(e.target.checked)}
          />
          Include steps
        </label>
        {hasSteps && (
          <input
            className="input"
            type="number"
            inputMode="numeric"
            value={steps}
            onChange={(e) => setSteps(Number(e.target.value))}
          />
        )}

        <hr />

        <label>Notes</label>
        <textarea
          className="input"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        <hr />

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={save}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   End of file: src/pages/WalksPage.tsx
   ============================================================================ */