import React from "react";
import type { CoachDashboardPerformance } from "../../lib/coachDashboard/coachDashboardTypes";
import { CoachCardHeader } from "./shared/CoachCardHeader";
import { CoachDashboardCard } from "./shared/CoachDashboardCard";
import { MetricRow } from "./shared/MetricRow";

export function PerformanceCard({ performance }: { performance: CoachDashboardPerformance }) {
  return (
    <CoachDashboardCard testId="coach-dashboard-performance" variant="primary">
      <CoachCardHeader title="Performance" />
      <div style={{ display: "grid", gap: 8, fontSize: 13 }}>
        <MetricRow label="Performance Trend" value={performance.trend} emphasis="strong" />
        {performance.anchorText ? <MetricRow label="Anchor" value={performance.anchorText} emphasis="strong" /> : null}
        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 10, display: "grid", gap: 6 }}>
          {performance.anchorFamilyLabel ? <MetricRow label="Performance Anchor" value={performance.anchorFamilyLabel} /> : null}
          {performance.anchorMovementStatusLabel ? <MetricRow label="Anchor Exercise" value={performance.anchorMovementStatusLabel} /> : null}
          {performance.benchmarkStatusLabel ? <MetricRow label="Benchmark" value={performance.benchmarkStatusLabel} /> : null}
          {performance.latestSameExerciseText ? <MetricRow label="Same Exercise" value={performance.latestSameExerciseText} /> : null}
          {performance.latestFamilyMovementText ? <MetricRow label="Current Family Movement" value={performance.latestFamilyMovementText} /> : null}
          {performance.relationshipText ? <MetricRow label="Relationship" value={performance.relationshipText} /> : null}
          {performance.strengthSignal ? <MetricRow label="Strength Signal" value={performance.strengthSignal} emphasis="strong" /> : null}
          <MetricRow label="Movement Quality" value={performance.movementQuality} />
          {performance.read ? <MetricRow label="Performance Read" value={performance.read} /> : null}
        </div>
      </div>
    </CoachDashboardCard>
  );
}
