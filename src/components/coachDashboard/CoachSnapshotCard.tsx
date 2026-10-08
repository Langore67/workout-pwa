import React from "react";
import type { CoachDashboardActions, CoachDashboardSnapshot } from "../../lib/coachDashboard/coachDashboardTypes";
import { CoachCardHeader } from "./shared/CoachCardHeader";
import { CoachDashboardCard } from "./shared/CoachDashboardCard";
import { MetricRow } from "./shared/MetricRow";

export function CoachSnapshotCard({
  snapshot,
  actions,
}: {
  snapshot: CoachDashboardSnapshot;
  actions?: CoachDashboardActions;
}) {
  return (
    <CoachDashboardCard testId="coach-dashboard-snapshot" variant="hero">
      <CoachCardHeader title="Coach Snapshot" level={2} />
      <div style={{ display: "grid", gap: 12, fontSize: 13 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(132px, 1fr))", gap: 10 }}>
          <MetricRow label="Status" value={snapshot.status} emphasis="strong" />
          <MetricRow label="Confidence" value={snapshot.confidence} emphasis="strong" />
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          <MetricRow label="Why" value={snapshot.why} emphasis="strong" />
          <MetricRow label="Today" value={snapshot.today} emphasis="strong" />
        </div>
        {snapshot.explanation ? (
          <details data-testid="coach-snapshot-explanation" style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
            <summary style={{ cursor: "pointer", fontWeight: 800 }}>Why? / Details</summary>
            <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
              <ExplanationList heading="Why" items={snapshot.explanation.why} />
              <ExplanationList
                heading="What Changed"
                items={snapshot.explanation.whatChanged}
                emptyText="No prior comparable Coach state is available."
              />
              {snapshot.explanation.evidence.length ? (
                <div>
                  <div className="muted" style={explanationHeadingStyle}>Evidence</div>
                  <div style={{ display: "grid", gap: 5, marginTop: 5 }}>
                    {snapshot.explanation.evidence.map((item) => (
                      <div key={item.id} style={{ fontSize: 12, lineHeight: 1.4 }}>
                        <strong>{item.label}</strong>
                        {item.value ? `: ${item.value}` : ""}
                        {item.freshness ? ` · ${titleCase(item.freshness)}` : ""}
                        {item.confidence ? ` · ${titleCase(item.confidence)} confidence` : ""}
                        {item.note ? <div className="muted">{item.note}</div> : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </details>
        ) : null}
        {snapshot.programmingPriorities.length ? (
          <div style={{ marginTop: 2, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
            <div className="muted" style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Programming Priorities
            </div>
            <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
              {snapshot.programmingPriorities.map((priority) => (
                <div key={`${priority.category}-${priority.title}`} style={{ display: "grid", gap: 2 }}>
                  <div style={{ fontWeight: 800 }}>
                    {priority.priority.charAt(0).toUpperCase() + priority.priority.slice(1)} | {priority.title}
                  </div>
                  <div className="muted" style={{ fontSize: 12, lineHeight: 1.35 }}>
                    {priority.reason}
                  </div>
                  <div style={{ fontSize: 12, lineHeight: 1.35 }}>{priority.coachAction}</div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {actions?.primaryFocus ? (
          <div style={{ marginTop: 2, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
            <div className="muted" style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Today&apos;s Coaching Focus
            </div>
            <div style={{ display: "grid", gap: 3, marginTop: 6 }}>
              <div style={{ fontWeight: 800 }}>{actions.primaryFocus.objective}</div>
              <div className="muted" style={{ fontSize: 12, lineHeight: 1.35 }}>
                {actions.primaryFocus.reason}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </CoachDashboardCard>
  );
}

const explanationHeadingStyle = {
  fontSize: 12,
  fontWeight: 800,
  textTransform: "uppercase" as const,
  letterSpacing: "0.06em",
};

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function ExplanationList({ heading, items, emptyText }: { heading: string; items: readonly string[]; emptyText?: string }) {
  return (
    <div>
      <div className="muted" style={explanationHeadingStyle}>{heading}</div>
      {items.length ? (
        <ul style={{ margin: "5px 0 0", paddingLeft: 18, fontSize: 12, lineHeight: 1.45 }}>
          {items.map((item) => <li key={item}>{item}</li>)}
        </ul>
      ) : emptyText ? <div className="muted" style={{ fontSize: 12, marginTop: 5 }}>{emptyText}</div> : null}
    </div>
  );
}
