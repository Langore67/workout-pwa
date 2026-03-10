/* BUILD_ID: 2026-03-10-DASH-IRONFORGE-01 */
/* ============================================================================
   FILE: src/pages/PerformanceDashboardPage.tsx
   PURPOSE: IronForge-native Performance Dashboard mock page
   ----------------------------------------------------------------------------
   Notes
   - Uses IronForge's existing styles.css primitives: card, btn, badge, muted,
     row, grid, container
   - No shadcn/ui
   - No lucide-react
   - No recharts yet (chart panels are placeholders)
   - Keeps the North Star information architecture while matching app styling
   ============================================================================ */

import React, { useMemo, useState } from "react";

/* ============================================================================
   Breadcrumb 1 — Types
   ============================================================================ */

export type DashboardPhase = "CUT" | "MAINTAIN" | "BULK";
export type DashboardRange = "4W" | "8W" | "12W" | "YTD" | "ALL";
export type TrendDirection = "improving" | "stable" | "declining" | "watch";

type AnalysisRow = {
  label: string;
  value: string;
};

type ChartViewModel = {
  id: "strength" | "bodyComp" | "volume";
  title: string;
  subtitle: string;
  direction: TrendDirection;
  analysisRows: AnalysisRow[];
  interpretation: string;
};

type InsightViewModel = {
  id: string;
  title: string;
  status: string;
  confidence: string;
  body: string;
  evidence: string[];
  action?: string;
};

type DashboardViewModel = {
  activePhase: DashboardPhase;
  activeRange: DashboardRange;
  flagshipTitle: string;
  flagshipScore: number;
  flagshipBadge: string;
  heroSummary: string;
  flagshipBody: string;
  heroStats: Array<{ label: string; value: string }>;
  charts: {
    strength: ChartViewModel;
    bodyComp: ChartViewModel;
    volume: ChartViewModel;
  };
  insights: InsightViewModel[];
  actions: string[];
};

/* ============================================================================
   Breadcrumb 2 — Static controls
   ============================================================================ */

const PHASE_TABS: Array<{ phase: DashboardPhase; tone: string }> = [
  { phase: "CUT", tone: "Fat loss with muscle retention" },
  { phase: "MAINTAIN", tone: "Hold body comp and consolidate performance" },
  { phase: "BULK", tone: "Drive growth with controlled waist gain" },
];

const TIME_RANGES: DashboardRange[] = ["4W", "8W", "12W", "YTD", "ALL"];

/* ============================================================================
   Breadcrumb 3 — View-model builder (mock for now)
   Replace with selectors / Dexie-backed logic later.
   ============================================================================ */

function buildDashboardViewModel(phase: DashboardPhase, range: DashboardRange): DashboardViewModel {
  const flagship = {
    CUT: {
      title: "Muscle Preservation",
      score: 82,
      badge: "Strong",
      summary:
        "CUT mode is active. Success means waist trending down, body weight gradually down, and Strength Signal holding steady or rising.",
      body: "Strength is improving while waist circumference is declining. This is the pattern you want during a fat-loss phase.",
      strength: "6.78",
      weight: "196.9 lb",
      waist: "38.6 in",
    },
    MAINTAIN: {
      title: "Performance Stability",
      score: 78,
      badge: "Stable",
      summary:
        "MAINTAIN mode is active. Success means body weight and waist staying relatively stable while Strength Signal holds steady or rises gradually.",
      body: "Performance is holding steady with controlled body composition. This is the pattern you want while consolidating gains.",
      strength: "6.62",
      weight: "199.8 lb",
      waist: "39.8 in",
    },
    BULK: {
      title: "Growth Quality",
      score: 84,
      badge: "Productive",
      summary:
        "BULK mode is active. Success means body weight rising gradually, waist staying controlled, and Strength Signal trending upward.",
      body: "Strength and training capacity are climbing while waist gain remains controlled. This is the pattern you want during a productive bulk.",
      strength: "7.04",
      weight: "203.1 lb",
      waist: "40.4 in",
    },
  }[phase];

  return {
    activePhase: phase,
    activeRange: range,
    flagshipTitle: flagship.title,
    flagshipScore: flagship.score,
    flagshipBadge: flagship.badge,
    heroSummary: flagship.summary,
    flagshipBody: flagship.body,
    heroStats: [
      { label: "Strength Signal", value: flagship.strength },
      { label: "Body Weight", value: flagship.weight },
      { label: "Waist", value: flagship.waist },
      { label: range === "ALL" ? "All-Time View" : "Range", value: range },
    ],
    charts: {
      strength: {
        id: "strength",
        title: "Strength Signal",
        subtitle: `Weekly trend • ${range}`,
        direction: "improving",
        analysisRows: [
          { label: "Source", value: "Composite strength signal" },
          { label: "Current Value", value: flagship.strength },
          {
            label: "Weeks Measured",
            value: range === "4W" ? "4" : range === "8W" ? "8" : range === "12W" ? "12" : "12+",
          },
        ],
        interpretation:
          phase === "CUT"
            ? "Strength has risen while body composition improves."
            : phase === "MAINTAIN"
              ? "Strength is holding or rising gently, which is what you want during maintenance."
              : "Strength is trending upward, supporting a productive growth phase.",
      },
      bodyComp: {
        id: "bodyComp",
        title: "Body Composition",
        subtitle: `Weight + waist • ${range}`,
        direction: "improving",
        analysisRows: [
          { label: "Weight", value: flagship.weight },
          { label: "Waist", value: flagship.waist },
          {
            label: "Goal Fit",
            value: phase === "BULK" ? "Gain / controlled" : phase === "MAINTAIN" ? "Stable" : "Loss / favorable",
          },
        ],
        interpretation:
          phase === "CUT"
            ? "Waist reduction is outpacing scale change, suggesting favorable recomposition."
            : phase === "MAINTAIN"
              ? "Weight and waist are relatively stable, which fits maintain mode."
              : "Body weight is rising while waist stays relatively controlled, which is ideal for a clean bulk.",
      },
      volume: {
        id: "volume",
        title: "Training Load",
        subtitle: `Weekly volume • ${range}`,
        direction: phase === "BULK" ? "improving" : "stable",
        analysisRows: [
          { label: "Starting Volume", value: "38,100 lb" },
          {
            label: "Current Volume",
            value: phase === "BULK" ? "46,400 lb" : phase === "MAINTAIN" ? "40,600 lb" : "43,400 lb",
          },
          { label: "Spike Risk", value: phase === "BULK" ? "Moderate" : "Low" },
        ],
        interpretation:
          phase === "CUT"
            ? "Training load is climbing without a dramatic spike, which supports productive cutting."
            : phase === "MAINTAIN"
              ? "Load looks controlled and repeatable, which supports stable performance."
              : "Load is climbing more aggressively, which fits a growth phase, but still needs monitoring.",
      },
    },
    insights: [
      {
        id: "insight-topline",
        title: "Top-Line Signal",
        status: phase === "CUT" ? "Strong" : phase === "MAINTAIN" ? "Stable" : "Productive",
        confidence: "High",
        body: "This summarizes the dashboard into a fast coaching read without hiding the analytics.",
        evidence: ["Strength Signal", "Body Weight", "Waist"],
        action:
          phase === "CUT"
            ? "Stay the course."
            : phase === "MAINTAIN"
              ? "Keep the base steady."
              : "Push growth, but keep waist gain controlled.",
      },
      {
        id: "insight-load",
        title: "Training Load",
        status: phase === "BULK" ? "Build" : "Controlled",
        confidence: "Moderate",
        body: "Weekly load is a context layer for how hard the block is pushing.",
        evidence: ["Volume trend", "No sharp spikes"],
        action: "Monitor fatigue while progressing core lifts.",
      },
    ],
    actions: [
      "Lock the v1 Strength Signal formula before wiring Dexie data.",
      "Move phase logic into dedicated rules modules.",
      "Back indicator membership with stable exercise IDs, not labels.",
    ],
  };
}

/* ============================================================================
   Breadcrumb 4 — Small UI helpers
   ============================================================================ */

function iconForTrend(direction: TrendDirection) {
  if (direction === "improving") return "↗";
  if (direction === "stable") return "→";
  if (direction === "declining") return "↘";
  return "!";
}

function badgeClassForTrend(direction: TrendDirection) {
  return direction === "improving" ? "badge green" : "badge";
}

function ChartPlaceholder({ title }: { title: string }) {
  return (
    <div
      className="card"
      style={{
        minHeight: 220,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--muted)",
        borderStyle: "dashed",
        background: "#fafafa",
      }}
    >
      {title} chart placeholder
    </div>
  );
}

function AnalysisRows({ rows }: { rows: AnalysisRow[] }) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {rows.map((row) => (
        <div key={row.label} className="kv">
          <span>{row.label}</span>
          <span style={{ color: "var(--text)", fontWeight: 700 }}>{row.value}</span>
        </div>
      ))}
    </div>
  );
}

function SectionHeader({ title, subtitle, right }: { title: string; subtitle: string; right?: React.ReactNode }) {
  return (
    <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
      <div>
        <h2 style={{ margin: 0 }}>{title}</h2>
        <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{subtitle}</div>
      </div>
      {right}
    </div>
  );
}

function PhaseControl({ activePhase, onChange }: { activePhase: DashboardPhase; onChange: (phase: DashboardPhase) => void }) {
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

function TimeRangeControl({ activeRange, onChange }: { activeRange: DashboardRange; onChange: (range: DashboardRange) => void }) {
  return (
    <div className="row">
      {TIME_RANGES.map((range) => {
        const active = range === activeRange;
        return (
          <button
            key={range}
            type="button"
            className={`btn small ${active ? "primary" : ""}`}
            onClick={() => onChange(range)}
          >
            {range}
          </button>
        );
      })}
    </div>
  );
}

function TrendBadge({ direction }: { direction: TrendDirection }) {
  return <span className={badgeClassForTrend(direction)}>{iconForTrend(direction)} {direction}</span>;
}

function ChartCard({ chart }: { chart: ChartViewModel }) {
  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div>
          <h3 style={{ margin: 0 }}>{chart.title}</h3>
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{chart.subtitle}</div>
        </div>
        <TrendBadge direction={chart.direction} />
      </div>

      <ChartPlaceholder title={chart.title} />

      <div className="grid two" style={{ marginTop: 12 }}>
        <div className="card">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <strong>Analysis</strong>
            <TrendBadge direction={chart.direction} />
          </div>
          <AnalysisRows rows={chart.analysisRows} />
        </div>

        <div className="card">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <strong>Coach Interpretation</strong>
            <TrendBadge direction={chart.direction} />
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.5 }}>{chart.interpretation}</div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   Breadcrumb 5 — Main page
   ============================================================================ */

export default function PerformanceDashboardPage() {
  const [activePhase, setActivePhase] = useState<DashboardPhase>("CUT");
  const [activeRange, setActiveRange] = useState<DashboardRange>("8W");

  const vm = useMemo(() => buildDashboardViewModel(activePhase, activeRange), [activePhase, activeRange]);

  return (
    <div className="list">
      <div className="grid two">
        <div className="card">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div className="muted" style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5 }}>
                IronForge
              </div>
              <h2 style={{ marginTop: 6 }}>Performance Dashboard</h2>
              <div className="muted" style={{ fontSize: 14 }}>
                Analytics first, with coaching layered in.
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
            <div style={{ fontSize: 14, lineHeight: 1.5 }}>{vm.heroSummary}</div>
          </div>

          <div className="grid two dashboard-hero-stats" style={{ marginTop: 12 }}>
	    {vm.heroStats.map((stat) => (
	      <div key={stat.label} className="card dashboard-stat">
	        <div className="muted dashboard-stat-label">
	          {stat.label}
	        </div>
	  
	        <div className="dashboard-stat-value">
	          {stat.value}
	        </div>
	      </div>
	    ))}
</div>
        </div>

        <div className="card">
          <div className="row" style={{ alignItems: "center", gap: 10 }}>
            <span className="badge green">✓ flagship</span>
            <div>
              <div className="muted" style={{ fontSize: 12, textTransform: "uppercase", fontWeight: 700 }}>
                Flagship Signal
              </div>
              <h2 style={{ marginTop: 6 }}>{vm.flagshipTitle}</h2>
            </div>
          </div>

          <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end", marginTop: 14 }}>
            <div>
              <div className="dashboard-flagship-score">{vm.flagshipScore}</div>
              <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>out of 100</div>
            </div>
            <span className={vm.flagshipBadge === "Strong" || vm.flagshipBadge === "Productive" ? "badge green" : "badge"}>
              {vm.flagshipBadge}
            </span>
          </div>

          <div style={{ marginTop: 14 }}>
            <div style={{ width: "100%", height: 10, background: "#e5e7eb", borderRadius: 999 }}>
              <div
                style={{
                  width: `${vm.flagshipScore}%`,
                  height: "100%",
                  background: "var(--accent)",
                  borderRadius: 999,
                }}
              />
            </div>
          </div>

          <div className="card" style={{ marginTop: 12 }}>
            <div style={{ fontSize: 14, lineHeight: 1.5 }}>{vm.flagshipBody}</div>
          </div>
        </div>
      </div>

      <div className="grid two" style={{ alignItems: "start" }}>
        <div className="list">
          <div className="card">
            <SectionHeader
              title="Trend Charts"
              subtitle="Pattern recognition, quick analysis, and interpretation."
              right={<TimeRangeControl activeRange={activeRange} onChange={setActiveRange} />}
            />
          </div>

          <ChartCard chart={vm.charts.strength} />
          <ChartCard chart={vm.charts.bodyComp} />
          <ChartCard chart={vm.charts.volume} />
        </div>

        <div className="list">
          <div className="card">
            <SectionHeader
              title="Coaching Insights"
              subtitle="Phase-aware outputs from the selector / rules layer."
            />
          </div>

          {vm.insights.map((item) => (
            <div key={item.id} className="card">
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <h3 style={{ margin: 0 }}>{item.title}</h3>
                <div className="row">
                  <span className={item.status === "Strong" || item.status === "Productive" ? "badge green" : "badge"}>
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
              {vm.actions.map((action) => (
                <div key={action} className="card">
                  {action}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   FOOTER COMMENT
   FILE: src/pages/PerformanceDashboardPage.tsx
   ============================================================================ */
