import React from "react";
import type { CoachDashboardBody } from "../../lib/coachDashboard/coachDashboardTypes";
import { CoachCardHeader } from "./shared/CoachCardHeader";
import { CoachDashboardCard } from "./shared/CoachDashboardCard";
import { MetricRow } from "./shared/MetricRow";

export function BodyCard({ body }: { body: CoachDashboardBody }) {
  return (
    <CoachDashboardCard testId="coach-dashboard-body" variant="primary">
      <CoachCardHeader title={body.heading} />
      <div style={{ display: "grid", gap: 8, fontSize: 13 }}>
        {body.values.map((line) => (
          <MetricRow key={line.label} label={line.label} value={line.value} emphasis="strong" />
        ))}
        {body.note ? (
          <div className="muted" style={{ fontSize: 12, lineHeight: 1.35, marginTop: 2 }}>
            {body.note}
          </div>
        ) : null}
      </div>

      <div style={{ fontWeight: 800, marginTop: 14, marginBottom: 8, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
        Body Confidence
      </div>
      <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
        {body.confidenceRows.map((line) => (
          <MetricRow key={line.label} label={line.label} value={line.value} emphasis="subtle" />
        ))}
        <div className="muted" style={{ fontSize: 12, lineHeight: 1.35 }}>
          {body.confidenceNote}
        </div>
      </div>
    </CoachDashboardCard>
  );
}
