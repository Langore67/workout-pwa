import React from "react";
import type { CoachDashboardProgramming } from "../../lib/coachDashboard/coachDashboardTypes";
import { CoachCardHeader } from "./shared/CoachCardHeader";
import { CoachDashboardCard } from "./shared/CoachDashboardCard";
import { MetricRow } from "./shared/MetricRow";

export function ProgrammingIntelligenceCard({ programming }: { programming: CoachDashboardProgramming }) {
  return (
    <CoachDashboardCard testId="coach-dashboard-programming">
      <CoachCardHeader title="Programming Intelligence" />
      <div style={{ display: "grid", gap: 10, fontSize: 13 }}>
        {programming.status ? <MetricRow label="Status" value={programming.status} emphasis="strong" /> : null}
        {programming.summary ? <MetricRow label="Summary" value={programming.summary} /> : null}
        {programming.priorities.length ? (
          <div style={{ display: "grid", gap: 10, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
            {programming.priorities.map((priority) => (
              <div key={priority.id} style={{ display: "grid", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                  <div style={{ fontWeight: 850, lineHeight: 1.25 }}>{priority.title}</div>
                  <div className="muted" style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    {priority.priorityLabel}
                  </div>
                </div>
                {priority.rationale ? <MetricRow label="Why" value={priority.rationale} /> : null}
                {priority.direction ? <MetricRow label="Direction" value={priority.direction} emphasis="strong" /> : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="muted" style={{ lineHeight: 1.35 }}>
            {programming.emptyState}
          </div>
        )}
      </div>
    </CoachDashboardCard>
  );
}
