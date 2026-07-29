import React from "react";
import type { CoachDashboardGoals } from "../../lib/coachDashboard/coachDashboardTypes";
import { CoachCardHeader } from "./shared/CoachCardHeader";
import { MetricRow } from "./shared/MetricRow";

export function GoalsCard({ goals }: { goals: CoachDashboardGoals }) {
  return (
    <div className="card" data-testid="coach-dashboard-goals">
      <CoachCardHeader title="Goals" />
      <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
        <MetricRow label="Goal Trajectory" value={goals.trajectory} />
        {goals.read ? <MetricRow label="Goal Read" value={goals.read} /> : null}
        {goals.targets.map((row) => (
          <MetricRow key={row.label} label={row.label} value={row.value} />
        ))}
      </div>
    </div>
  );
}
