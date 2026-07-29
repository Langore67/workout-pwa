import React from "react";
import type { CoachDashboardGoals } from "../../lib/coachDashboard/coachDashboardTypes";
import { CoachCardHeader } from "./shared/CoachCardHeader";
import { CoachDashboardCard } from "./shared/CoachDashboardCard";
import { MetricRow } from "./shared/MetricRow";

export function GoalsCard({ goals }: { goals: CoachDashboardGoals }) {
  return (
    <CoachDashboardCard testId="coach-dashboard-goals">
      <CoachCardHeader title="Goals" />
      <div style={{ display: "grid", gap: 8, fontSize: 13 }}>
        <MetricRow label="Goal Trajectory" value={goals.trajectory} emphasis="strong" />
        {goals.read ? <MetricRow label="Goal Read" value={goals.read} /> : null}
        {goals.targets.length ? (
          <div style={{ borderTop: "1px solid var(--line)", paddingTop: 8, display: "grid", gap: 6 }}>
            {goals.targets.map((row) => (
              <MetricRow key={row.label} label={row.label} value={row.value} />
            ))}
          </div>
        ) : null}
      </div>
    </CoachDashboardCard>
  );
}
