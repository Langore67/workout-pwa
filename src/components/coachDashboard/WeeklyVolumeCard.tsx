import React from "react";
import type { CoachDashboardWeeklyVolume } from "../../lib/coachDashboard/coachDashboardTypes";
import { CoachCardHeader } from "./shared/CoachCardHeader";
import { CoachDashboardCard } from "./shared/CoachDashboardCard";
import { MetricRow } from "./shared/MetricRow";

export function WeeklyVolumeCard({ weeklyVolume }: { weeklyVolume: CoachDashboardWeeklyVolume }) {
  return (
    <CoachDashboardCard testId="coach-dashboard-volume">
      <CoachCardHeader title="Weekly Volume" />
      {weeklyVolume.note ? (
        <div className="muted" style={{ marginBottom: 8, fontSize: 12, lineHeight: 1.35 }}>
          {weeklyVolume.note}
        </div>
      ) : null}
      <div style={{ display: "grid", gap: 7, fontSize: 13 }}>
        {weeklyVolume.rows.map((row) => (
          <MetricRow key={row.label} label={row.label} value={row.value} />
        ))}
        {weeklyVolume.balanceRows.length ? (
          <div style={{ marginTop: 4 }}>
            <div className="muted" style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Balance
            </div>
            <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
              {weeklyVolume.balanceRows.map((row) => (
                <details
                  key={row.label}
                  data-testid={`coach-volume-balance-${row.id}`}
                  style={{ borderTop: "1px solid var(--border)", paddingTop: 6 }}
                >
                  <summary
                    style={{
                      listStyle: "none",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      fontWeight: 700,
                    }}
                  >
                    <span>{row.label}</span>
                    <span className="muted" style={{ fontWeight: 700 }}>
                      {row.statusLabel}
                    </span>
                  </summary>
                  <div style={{ display: "grid", gap: 4, marginTop: 6, paddingLeft: 10, fontSize: 12, lineHeight: 1.35 }}>
                    <div>
                      <span className="muted">Summary: </span>
                      <span>{row.summary}</span>
                    </div>
                    <div>
                      <span className="muted">Current: </span>
                      <span>{row.currentText}</span>
                    </div>
                    <div>
                      <span className="muted">What it means: </span>
                      <span>{row.explanation}</span>
                    </div>
                    <div>
                      <span className="muted">What to change: </span>
                      <span>{row.action}</span>
                    </div>
                  </div>
                </details>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </CoachDashboardCard>
  );
}
