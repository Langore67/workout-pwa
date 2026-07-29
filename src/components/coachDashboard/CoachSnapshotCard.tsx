import React from "react";
import type { CoachDashboardActions, CoachDashboardSnapshot } from "../../lib/coachDashboard/coachDashboardTypes";
import { CoachCardHeader } from "./shared/CoachCardHeader";
import { MetricRow } from "./shared/MetricRow";

export function CoachSnapshotCard({
  snapshot,
  actions,
}: {
  snapshot: CoachDashboardSnapshot;
  actions?: CoachDashboardActions;
}) {
  return (
    <div className="card" data-testid="coach-dashboard-snapshot">
      <CoachCardHeader title="Coach Snapshot" />
      <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
        <MetricRow label="Status" value={snapshot.status} />
        <MetricRow label="Confidence" value={snapshot.confidence} />
        <MetricRow label="Why" value={snapshot.why} />
        <MetricRow label="Today" value={snapshot.today} />
        {snapshot.programmingPriorities.length ? (
          <div style={{ marginTop: 4 }}>
            <div className="muted" style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Programming Priorities
            </div>
            <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
              {snapshot.programmingPriorities.map((priority) => (
                <div key={`${priority.category}-${priority.title}`} style={{ display: "grid", gap: 2 }}>
                  <div style={{ fontWeight: 800 }}>
                    {priority.priority.charAt(0).toUpperCase() + priority.priority.slice(1)} | {priority.title}
                  </div>
                  <div className="muted" style={{ fontSize: 12, lineHeight: 1.35 }}>
                    {priority.reason}
                  </div>
                  <div style={{ fontSize: 12, lineHeight: 1.35 }}>{priority.coachAction}</div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {actions?.primaryFocus ? (
          <div style={{ marginTop: 4 }}>
            <div className="muted" style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Today&apos;s Coaching Focus
            </div>
            <div style={{ display: "grid", gap: 3, marginTop: 6 }}>
              <div style={{ fontWeight: 800 }}>{actions.primaryFocus.objective}</div>
              <div className="muted" style={{ fontSize: 12, lineHeight: 1.35 }}>
                {actions.primaryFocus.reason}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
