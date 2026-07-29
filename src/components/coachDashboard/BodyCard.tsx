import React from "react";
import type { CoachDashboardBody } from "../../lib/coachDashboard/coachDashboardTypes";
import { CoachCardHeader } from "./shared/CoachCardHeader";
import { MetricRow } from "./shared/MetricRow";

export function BodyCard({ body }: { body: CoachDashboardBody }) {
  return (
    <div className="card" data-testid="coach-dashboard-body">
      <CoachCardHeader title={body.heading} />
      <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
        {body.values.map((line) => (
          <MetricRow key={line.label} label={line.label} value={line.value} />
        ))}
        {body.note ? (
          <div className="muted" style={{ fontSize: 12, lineHeight: 1.35 }}>
            {body.note}
          </div>
        ) : null}
      </div>

      <div style={{ fontWeight: 800, marginTop: 12, marginBottom: 8 }}>Body Confidence</div>
      <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
        {body.confidenceRows.map((line) => (
          <MetricRow key={line.label} label={line.label} value={line.value} />
        ))}
        <div className="muted" style={{ fontSize: 12, lineHeight: 1.35 }}>
          {body.confidenceNote}
        </div>
      </div>
    </div>
  );
}
