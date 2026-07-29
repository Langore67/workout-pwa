import React from "react";
import type { CoachDashboardProgramming } from "../../lib/coachDashboard/coachDashboardTypes";
import { CoachCardHeader } from "./shared/CoachCardHeader";
import { CoachDashboardCard } from "./shared/CoachDashboardCard";
import { CoachDetailsPanel, openCoachDetailsPanel } from "./shared/CoachDetailsPanel";
import { MetricRow } from "./shared/MetricRow";

const DETAILS_PANEL_ID = "coach-dashboard-programming-details";

export function ProgrammingIntelligenceCard({ programming }: { programming: CoachDashboardProgramming }) {
  const hasDetails = Boolean(programming.status || programming.summary || programming.detailPriorities.length);

  return (
    <CoachDashboardCard testId="coach-dashboard-programming">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
        <CoachCardHeader title="Programming Intelligence" />
        {hasDetails ? (
          <button
            type="button"
            onClick={(event) => openCoachDetailsPanel(DETAILS_PANEL_ID, event.currentTarget)}
            style={{
              border: "1px solid var(--line)",
              background: "var(--card)",
              borderRadius: 10,
              padding: "6px 10px",
              fontSize: 12,
              fontWeight: 800,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            View details
          </button>
        ) : null}
      </div>
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
      {hasDetails ? (
        <CoachDetailsPanel id={DETAILS_PANEL_ID} title="Programming Intelligence" status={programming.status}>
          {programming.summary ? (
            <section style={{ display: "grid", gap: 8 }}>
              <div className="muted" style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Summary
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.5 }}>{programming.summary}</div>
            </section>
          ) : null}

          {programming.detailPriorities.length ? (
            <div style={{ display: "grid", gap: 14 }}>
              {programming.detailPriorities.map((priority, index) => (
                <section key={priority.id} style={{ borderTop: index === 0 ? "0" : "1px solid var(--line)", paddingTop: index === 0 ? 0 : 14, display: "grid", gap: 9 }}>
                  <div>
                    <div className="muted" style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      Priority {index + 1}
                    </div>
                    <div style={{ marginTop: 4, fontSize: 16, fontWeight: 900, lineHeight: 1.25 }}>{priority.title}</div>
                  </div>
                  <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
                    <MetricRow label="Priority" value={priority.priorityLabel} emphasis="strong" />
                    {priority.categoryLabel ? <MetricRow label="Category" value={priority.categoryLabel} /> : null}
                    {priority.rationale ? <MetricRow label="Why" value={priority.rationale} /> : null}
                    {priority.direction ? <MetricRow label="Direction" value={priority.direction} emphasis="strong" /> : null}
                  </div>
                  {priority.evidence.length ? (
                    <div style={{ display: "grid", gap: 7 }}>
                      <div className="muted" style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                        Evidence
                      </div>
                      <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.45 }}>
                        {priority.evidence.map((item) => (
                          <li key={item} style={{ marginBottom: 4 }}>
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </section>
              ))}
            </div>
          ) : (
            <div className="muted" style={{ lineHeight: 1.35 }}>{programming.emptyState}</div>
          )}
        </CoachDetailsPanel>
      ) : null}
    </CoachDashboardCard>
  );
}
