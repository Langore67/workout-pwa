// src/pages/WalksPage.tsx
/* ============================================================================
   WalksPage.tsx - History-backed walking summary
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-05-13-WALKS-HISTORY-01
   FILE: src/pages/WalksPage.tsx

   Purpose
   - Show walk signals from History session-based conditioning walks
   - Keep /walks aligned with the Progress Walks tile
   - Treat Paste Workout / MapMyWalk screenshot summaries as the primary input
   - Leave legacy manual db.walks data untouched but unused here
   ============================================================================ */

import React, { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate } from "react-router-dom";
import { Page, Section } from "../components/Page.tsx";
import { db } from "../db";
import { buildCardioWalkSummary } from "../lib/cardio/buildCardioWalkSummary";
import type { CardioWalkEvent, CardioWalkSummary } from "../lib/cardio/cardioTypes";
import {
  formatCardioDistanceMeters,
  formatCardioDuration,
  formatCardioPace,
  formatCardioWalkDateTime,
  pluralizeWalk,
} from "../lib/cardio/formatCardioWalk";

function SummaryMetric({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId?: string;
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <div
        className="muted"
        style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em" }}
      >
        {label}
      </div>
      <div data-testid={testId} style={{ marginTop: 2, fontSize: 16, fontWeight: 900 }}>
        {value}
      </div>
    </div>
  );
}

function WalkListRow({ walk }: { walk: CardioWalkEvent }) {
  const meta = [
    formatCardioDuration(walk.durationSeconds),
    formatCardioDistanceMeters(walk.distanceMeters),
    formatCardioPace(walk.paceSecondsPerMile),
    walk.route,
  ].filter(Boolean);

  return (
    <div
      data-testid={`walks-history-row:${walk.sessionId}`}
      style={{
        borderTop: "1px solid rgba(148,163,184,0.28)",
        padding: "11px 0",
        minWidth: 0,
      }}
    >
      <div className="muted" style={{ fontSize: 12, marginBottom: 3 }}>
        {formatCardioWalkDateTime(walk.startedAt)}
      </div>
      <div style={{ fontWeight: 900, lineHeight: 1.25 }}>{walk.name}</div>
      {meta.length ? (
        <div
          data-testid={`walks-history-row-meta:${walk.sessionId}`}
          className="muted"
          style={{ marginTop: 4, fontSize: 13, lineHeight: 1.35 }}
        >
          {meta.join(" · ")}
        </div>
      ) : null}
    </div>
  );
}

function DataQualityNote({ summary }: { summary: CardioWalkSummary }) {
  const notes: string[] = [];
  if (summary.dataQuality.missingDistanceCount) {
    notes.push(
      `${summary.dataQuality.missingDistanceCount} ${summary.dataQuality.missingDistanceCount === 1 ? "walk is" : "walks are"} missing distance.`
    );
  }
  if (summary.dataQuality.missingDurationCount) {
    notes.push(
      `${summary.dataQuality.missingDurationCount} ${summary.dataQuality.missingDurationCount === 1 ? "walk is" : "walks are"} missing duration.`
    );
  }

  return (
    <div data-testid="walks-data-quality" className="muted" style={{ fontSize: 13, lineHeight: 1.45 }}>
      {notes.length ? `${notes.join(" ")} ` : ""}
      Pace is shown only when both distance and duration are available. Route, HR, elevation, and zone trends are not
      tracked yet.
    </div>
  );
}

export default function WalksPage() {
  const navigate = useNavigate();
  const cardioRows = useLiveQuery(
    async () => {
      const [sessions, sets, tracks, exercises] = await Promise.all([
        db.sessions.toArray(),
        db.sets.toArray(),
        db.tracks.toArray(),
        db.exercises.toArray(),
      ]);
      return { sessions, sets, tracks, exercises };
    },
    [],
    undefined
  );
  const summary = useMemo(() => {
    if (!cardioRows) return undefined;
    return buildCardioWalkSummary({ ...cardioRows, recentLimit: 25 });
  }, [cardioRows]);
  const hasWalks = !!summary && summary.normalizedWalks.length > 0;

  return (
    <Page title="Walks" subtitle="History-based walking summary from imported conditioning sessions.">
      <div className="card" style={{ marginBottom: 12, padding: 14 }}>
          <div
            className="muted"
            style={{
              fontSize: 12,
              fontWeight: 700,
              marginBottom: 8,
              cursor: "pointer",
              display: "inline-block",
            }}
            onClick={() => navigate("/progress")}
          >
            Progress / Walks
          </div>

          <h2 style={{ marginTop: 0, marginBottom: 8 }}>Walks</h2>

          <div className="muted" style={{ lineHeight: 1.45 }}>
            Read-only walk totals from History. Paste MapMyWalk screenshot summaries into Paste Workout to add walks.
          </div>
      </div>

      {!summary ? (
        <Section title="Summary" subtitle="Loading History walks">
          <div className="muted">Loading walks...</div>
        </Section>
      ) : !hasWalks ? (
        <Section title="Summary" subtitle="No imported walk sessions found yet.">
          <div data-testid="walks-empty-state" style={{ display: "grid", gap: 8 }}>
            <div style={{ fontWeight: 900 }}>No imported walk sessions found yet.</div>
            <div className="muted" style={{ lineHeight: 1.45 }}>
              Screenshot MapMyWalk, have Coach GPT convert it to IF cardio text, then paste it into Paste Workout.
            </div>
          </div>
        </Section>
      ) : (
        <>
          <Section title="Summary" subtitle={`${pluralizeWalk(summary.last28d.count)} in the last 28 days`}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(135px, 1fr))",
                gap: 14,
              }}
            >
              <SummaryMetric label="Last 7d" value={pluralizeWalk(summary.last7d.count)} testId="walks-last7-count" />
              <SummaryMetric
                label="7d Duration"
                value={formatCardioDuration(summary.last7d.totalDurationSeconds) || "Unavailable"}
                testId="walks-last7-duration"
              />
              {summary.last7d.totalDistanceMeters > 0 ? (
                <SummaryMetric
                  label="7d Distance"
                  value={formatCardioDistanceMeters(summary.last7d.totalDistanceMeters)}
                  testId="walks-last7-distance"
                />
              ) : null}
              <SummaryMetric label="Last 28d" value={pluralizeWalk(summary.last28d.count)} testId="walks-last28-count" />
              <SummaryMetric
                label="28d Duration"
                value={formatCardioDuration(summary.last28d.totalDurationSeconds) || "Unavailable"}
                testId="walks-last28-duration"
              />
              {summary.last28d.totalDistanceMeters > 0 ? (
                <SummaryMetric
                  label="28d Distance"
                  value={formatCardioDistanceMeters(summary.last28d.totalDistanceMeters)}
                  testId="walks-last28-distance"
                />
              ) : null}
              {summary.last7d.averageDurationSeconds != null ? (
                <SummaryMetric
                  label="Avg Duration"
                  value={formatCardioDuration(summary.last7d.averageDurationSeconds)}
                  testId="walks-average-duration"
                />
              ) : null}
              {summary.last7d.averagePaceSecondsPerMile != null ? (
                <SummaryMetric
                  label="Avg Pace"
                  value={formatCardioPace(summary.last7d.averagePaceSecondsPerMile)}
                  testId="walks-average-pace"
                />
              ) : null}
            </div>

            <div style={{ marginTop: 14 }}>
              <DataQualityNote summary={summary} />
            </div>
          </Section>

          <Section title="History Walks" subtitle="Each qualifying History session is listed separately.">
            <div data-testid="walks-history-list">
              {summary.normalizedWalks.map((walk) => (
                <WalkListRow key={walk.sessionId} walk={walk} />
              ))}
            </div>
          </Section>
        </>
      )}
    </Page>
  );
}

/* ============================================================================
   End of file: src/pages/WalksPage.tsx
   ============================================================================ */
