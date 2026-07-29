import React from "react";
import type { CoachDashboardCardio } from "../../lib/coachDashboard/coachDashboardTypes";
import { CoachCardHeader } from "./shared/CoachCardHeader";
import { CoachDashboardCard } from "./shared/CoachDashboardCard";
import { MetricRow } from "./shared/MetricRow";

export function CardioCard({ cardio }: { cardio: CoachDashboardCardio }) {
  return (
    <CoachDashboardCard testId="coach-dashboard-cardio">
      <CoachCardHeader title="Cardio" />
      <div style={{ display: "grid", gap: 7, fontSize: 13 }}>
        {cardio.isEmpty ? (
          <div className="muted" style={{ lineHeight: 1.35 }}>{cardio.emptyText}</div>
        ) : (
          <>
            {cardio.rows.map((line) => (
              <MetricRow key={line.label} label={line.label} value={line.value} emphasis={line.label === "Last 7 Days" ? "strong" : "normal"} />
            ))}
            {cardio.status ? <MetricRow label="Cardio Status" value={cardio.status} /> : null}
            {cardio.note ? <MetricRow label="Cardio Note" value={cardio.note} /> : null}
          </>
        )}
      </div>
    </CoachDashboardCard>
  );
}
