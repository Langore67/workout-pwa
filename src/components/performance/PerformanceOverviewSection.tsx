import React from "react";

type DashboardPhase = "CUT" | "MAINTAIN" | "BULK";

type HeroStat = {
  label: string;
  value: string;
};

type InsightViewModel = {
  evidence: string[];
};

type PerformanceOverviewSectionProps = {
  activePhase: DashboardPhase;
  setActivePhase: React.Dispatch<React.SetStateAction<DashboardPhase>>;
  heroSummary: string;
  heroStats: HeroStat[];
  flagshipTitle: string;
  flagshipScore: number;
  flagshipBadge: string;
  flagshipBody: string;
  firstInsight?: InsightViewModel;
};

const PHASE_TABS: Array<{ phase: DashboardPhase; tone: string }> = [
  { phase: "CUT", tone: "Fat loss with muscle retention" },
  { phase: "MAINTAIN", tone: "Hold body comp and consolidate performance" },
  { phase: "BULK", tone: "Drive growth with controlled waist gain" },
];

function PhaseControl({
  activePhase,
  onChange,
}: {
  activePhase: DashboardPhase;
  onChange: (phase: DashboardPhase) => void;
}) {
  return (
    <div className="row">
      {PHASE_TABS.map((tab) => {
        const active = tab.phase === activePhase;
        return (
          <button
            key={tab.phase}
            type="button"
            className={`btn ${active ? "primary" : ""}`}
            onClick={() => onChange(tab.phase)}
            title={tab.tone}
          >
            {tab.phase}
          </button>
        );
      })}
    </div>
  );
}

export default function PerformanceOverviewSection({
  activePhase,
  setActivePhase,
  heroSummary,
  heroStats,
  flagshipTitle,
  flagshipScore,
  flagshipBadge,
  flagshipBody,
  firstInsight,
}: PerformanceOverviewSectionProps) {
  return (
    <div className="dashboard-hero">
      <div className="card">
        <div
          className="row"
          style={{ justifyContent: "space-between", alignItems: "flex-start" }}
        >
          <div>
            <div
              className="muted"
              style={{
                fontSize: 12,
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginBottom: 2,
              }}
            >
              Overview
            </div>

            <h2 style={{ marginTop: 6, marginBottom: 6 }}>Dashboard Overview</h2>

            <div className="muted" style={{ fontSize: 14, lineHeight: 1.45 }}>
              Flagship signals, charts, and coaching insights.
            </div>
          </div>

          <span className="badge">Preview</span>
        </div>

        <hr />

        <label>Current Phase</label>

        <div style={{ marginTop: 8 }}>
          <PhaseControl activePhase={activePhase} onChange={setActivePhase} />
        </div>

        <div className="card" style={{ marginTop: 10 }}>
          <div style={{ fontSize: 14, lineHeight: 1.5 }}>{heroSummary}</div>
        </div>

        <div className="grid two dashboard-hero-stats" style={{ marginTop: 12 }}>
          {heroStats.map((stat) => (
            <div
              key={stat.label}
              className="card dashboard-stat"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div
                className="muted dashboard-stat-label"
                style={{ marginBottom: 0 }}
              >
                {stat.label}
              </div>

              <div
                className="dashboard-stat-value"
                style={{
                  textAlign: "right",
                  whiteSpace: "nowrap",
                }}
              >
                {stat.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div
          className="card"
          style={{
            borderColor: "rgba(34, 197, 94, 0.22)",
            background: "rgba(34, 197, 94, 0.035)",
          }}
        >
          <div
            className="row"
            style={{
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 12,
            }}
          >
            <div>
              <div className="row" style={{ alignItems: "center", gap: 10 }}>
                <span className="badge green">✓ flagship</span>
                <div
                  className="muted"
                  style={{
                    fontSize: 12,
                    textTransform: "uppercase",
                    fontWeight: 700,
                  }}
                >
                  Flagship Signal
                </div>
              </div>

              <h2 style={{ marginTop: 10, marginBottom: 0 }}>{flagshipTitle}</h2>
            </div>

            <span
              className={
                flagshipBadge === "Strong" || flagshipBadge === "Productive"
                  ? "badge green"
                  : "badge"
              }
            >
              {flagshipBadge}
            </span>
          </div>

          <div
            className="row"
            style={{
              justifyContent: "space-between",
              alignItems: "flex-end",
              marginTop: 16,
            }}
          >
            <div>
              <div className="dashboard-flagship-score">{flagshipScore}</div>
              <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                out of 100
              </div>
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <div
              style={{
                width: "100%",
                height: 10,
                background: "#e5e7eb",
                borderRadius: 999,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${flagshipScore}%`,
                  height: "100%",
                  background: "var(--accent)",
                  borderRadius: 999,
                }}
              />
            </div>
          </div>

          <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
            {firstInsight?.evidence?.slice(0, 3).map((bullet) => {
              let icon = "✓";
              let color = "var(--accent)";

              const text = bullet.toLowerCase();

              if (text.includes("rising during cut") || text.includes("building")) {
                icon = "⚠";
                color = "#f59e0b";
              }

              if (text.includes("needs correction") || text.includes("declining")) {
                icon = "✕";
                color = "#ef4444";
              }

              return (
                <div
                  key={bullet}
                  className="row"
                  style={{ alignItems: "center", gap: 10 }}
                >
                  <span
                    style={{
                      color,
                      fontSize: 16,
                      lineHeight: 1,
                      fontWeight: 700,
                    }}
                  >
                    {icon}
                  </span>

                  <span style={{ fontSize: 14, lineHeight: 1.4 }}>{bullet}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card" style={{ marginTop: 12 }}>
          <div style={{ fontSize: 14, lineHeight: 1.5 }}>{flagshipBody}</div>
        </div>
      </div>
    </div>
  );
}