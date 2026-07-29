import React from "react";
import type { CoachDashboardCardio } from "../../lib/coachDashboard/coachDashboardTypes";
import { CoachCardHeader } from "./shared/CoachCardHeader";
import { MetricRow } from "./shared/MetricRow";

export function CardioCard({ cardio }: { cardio: CoachDashboardCardio }) {
  return (
    <div className="card" data-testid="coach-dashboard-cardio">
      <CoachCardHeader title="Cardio" />
      <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
        {cardio.isEmpty ? (
          <div className="muted">{cardio.emptyText}</div>
        ) : (
          <>
            {cardio.status ? <MetricRow label="Cardio Status" value={cardio.status} /> : null}
            {cardio.rows.map((line) => (
              <MetricRow key={line.label} label={line.label} value={line.value} />
            ))}
            {cardio.note ? <MetricRow label="Cardio Note" value={cardio.note} /> : null}
          </>
        )}
      </div>
    </div>
  );
}
