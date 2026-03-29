import React from "react";

type InsightViewModel = {
  id: string;
  title: string;
  status: string;
  confidence: string;
  body: string;
  evidence: string[];
  action?: string;
};

type PerformanceInsightsSectionProps = {
  insights: InsightViewModel[];
  actions: string[];
};

export default function PerformanceInsightsSection({
  insights,
  actions,
}: PerformanceInsightsSectionProps) {
  return (
    <div className="list">
      <div className="card">
        <div style={{ display: "grid", gap: 8, marginBottom: 4 }}>
          <div>
            <h2 style={{ margin: 0 }}>Coaching Insights</h2>
            <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
              Phase-aware outputs from the selector / rules layer.
            </div>
          </div>
        </div>
      </div>

      {insights.map((item) => (
        <div key={item.id} className="card dashboard-insight">
          <div
            className="row"
            style={{
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <h3 style={{ margin: 0 }}>{item.title}</h3>
            <div className="row">
              <span
                className={
                  item.status === "Strong" || item.status === "Productive"
                    ? "badge green"
                    : "badge"
                }
              >
                {item.status}
              </span>
              <span className="badge">{item.confidence}</span>
            </div>
          </div>

          <div style={{ fontSize: 14, lineHeight: 1.5 }}>{item.body}</div>

          <div className="list" style={{ marginTop: 10 }}>
            {item.evidence.map((evidenceItem) => (
              <div key={evidenceItem} className="card">
                {evidenceItem}
              </div>
            ))}
          </div>

          {item.action ? (
            <div className="card" style={{ marginTop: 10, fontWeight: 700 }}>
              {item.action}
            </div>
          ) : null}
        </div>
      ))}

      <div className="card">
        <h3>Build Priorities</h3>
        <div className="list">
          {actions.map((action) => (
            <div key={action} className="card dashboard-priority">
              {action}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}