import React from "react";

import TrendChartCard from "../charts/TrendChartCard";
import VisxTrendChartCard from "../charts/VisxTrendChartCard";
import type { ChartDatum, ChartSeriesConfig, YAxisSide } from "../charts/chartTypes";
import type { informationRegistry } from "../../config/information/informationRegistry";

type TrendDirection = "improving" | "stable" | "declining" | "watch";

type AnalysisRow = {
  label: string;
  value: string;
};

type DashboardChartViewModel = {
  id: "strength" | "bodyWeight" | "waist" | "volume";
  title: string;
  subtitle: string;
  direction: TrendDirection;
  momentumMessage?: string;
  analysisRows: AnalysisRow[];
  interpretation: string;
  topMovers?: Array<{
    label: string;
    changePct: number;
    score: number;
  }>;
  movementBreakdown?: Array<{
    movement: string;
    score: number;
    exerciseCount: number;
    anchorLabel?: string | null;
    includedExercises: Array<{
      label: string;
      score: number;
    }>;
  }>;
};

function formatSignedPct(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function capitalize(value: string) {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function TrendBadge({ direction }: { direction: TrendDirection }) {
  const label =
    direction === "improving"
      ? "↗ improving"
      : direction === "declining"
        ? "↘ declining"
        : direction === "watch"
          ? "• watch"
          : "→ stable";

  return <span className="badge">{label}</span>;
}

function AnalysisRows({ rows }: { rows: AnalysisRow[] }) {
  return (
    <div className="list">
      {rows.map((row) => (
        <div key={row.label} className="kv">
          <span>{row.label}</span>
          <span style={{ color: "var(--text)", fontWeight: 700 }}>{row.value}</span>
        </div>
      ))}
    </div>
  );
}

function StrengthTopMovers({
  items,
}: {
  items: Array<{
    label: string;
    changePct: number;
    score: number;
  }>;
}) {
  return (
    <div className="list">
      {items.map((item) => (
        <div key={item.label} className="kv">
          <span>{item.label}</span>
          <span style={{ color: "var(--success)", fontWeight: 700 }}>
            {formatSignedPct(item.changePct)} • {item.score.toFixed(2)}
          </span>
        </div>
      ))}
    </div>
  );
}

function getMovementInsight(
  items: Array<{ movement: string; score: number; exerciseCount: number }>
): string {
  if (!items.length) return "";

  const sorted = [...items].sort((a, b) => b.score - a.score);

  const top = sorted[0];
  const bottom = sorted[sorted.length - 1];

  if (!top || !bottom) return "";

  const gap = top.score - bottom.score;

  if (gap < 0.75) {
    return "Movement balance is consistent across patterns.";
  }

  return `${capitalize(top.movement)} is leading while ${capitalize(bottom.movement)} is lagging.`;
}

function getMovementAction(
  items: Array<{ movement: string; score: number; exerciseCount: number }>
): string {
  if (!items.length) {
    return "Keep logging core lifts so the pattern signal can stabilize.";
  }

  const sorted = [...items].sort((a, b) => b.score - a.score);
  const top = sorted[0];
  const bottom = sorted[sorted.length - 1];

  if (!top || !bottom) {
    return "Keep progression steady this week.";
  }

  const gap = top.score - bottom.score;

  if (gap < 0.75) {
    return "Keep current balance and progression steady.";
  }

  if (bottom.movement === "pull") {
    return "Add 1–2 pulling sets this week and keep load progression clean.";
  }

  if (bottom.movement === "push") {
    return "Add 1–2 pressing sets this week and keep reps crisp.";
  }

  if (bottom.movement === "hinge") {
    return "Give hinge work a little more attention this week.";
  }

  if (bottom.movement === "squat") {
    return "Bring squat pattern volume or effort up slightly this week.";
  }

  return `Give ${bottom.movement} a little more attention this week.`;
}

function StrengthMovementBreakdown({
  items,
}: {
  items: Array<{
    movement: string;
    score: number;
    exerciseCount: number;
    anchorLabel?: string | null;
    includedExercises: Array<{
      label: string;
      score: number;
    }>;
  }>;
}) {
  const [expandedMovement, setExpandedMovement] = React.useState<string | null>(null);

  if (!items.length) {
    return <div className="muted">No composite movement data yet.</div>;
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div
        className="muted"
        style={{
          display: "grid",
          gridTemplateColumns: "1.3fr 1fr auto",
          gap: 12,
          fontSize: 12,
          fontWeight: 800,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          paddingBottom: 4,
        }}
      >
        <span>Pattern</span>
        <span>Included</span>
        <span style={{ textAlign: "right" }}>Score</span>
      </div>

      <div className="muted" style={{ fontSize: 12, marginTop: -2, marginBottom: 4 }}>
        Tap a pattern to see which exercises are included.
      </div>

      {items.map((item) => {
        const isExpanded = expandedMovement === item.movement;

        return (
          <div key={item.movement} style={{ display: "grid", gap: 6 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.3fr 1fr auto",
                gap: 12,
                alignItems: "center",
              }}
            >
              <button
                type="button"
                className="btn small"
                onClick={() =>
                  setExpandedMovement((prev) =>
                    prev === item.movement ? null : item.movement
                  )
                }
                style={{
                  justifySelf: "start",
                  padding: 0,
                  border: "none",
                  background: "transparent",
                  color: "var(--text)",
                  fontWeight: 700,
                  textAlign: "left",
                }}
              >
                {capitalize(item.movement)}
              </button>

              <span className="muted" style={{ fontSize: 13 }}>
                {item.exerciseCount} {item.exerciseCount === 1 ? "exercise" : "exercises"}
              </span>

              <span
                style={{
                  fontWeight: 700,
                  color: "var(--text)",
                  textAlign: "right",
                }}
              >
                {item.score.toFixed(2)}
              </span>
            </div>

            {isExpanded ? (
              <div
                className="card"
                style={{
                  padding: 10,
                  marginTop: 2,
                }}
              >
                <div
                  className="muted"
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    marginBottom: 8,
                  }}
                >
                  Included exercises
                </div>
                <div
                  className="muted"
                  style={{ fontSize: 12, lineHeight: 1.45, marginBottom: 8 }}
                >
                  Contribution score (0–10): higher means the exercise is contributing
                  more strongly to this pattern right now.
                </div>

                {item.anchorLabel ? (
                  <div
                    className="muted"
                    style={{ fontSize: 12, lineHeight: 1.45, marginBottom: 8 }}
                  >
                    <strong style={{ color: "var(--text)" }}>Anchor:</strong>{" "}
                    {item.anchorLabel}
                  </div>
                ) : null}

                <div style={{ display: "grid", gap: 6 }}>
                  {item.includedExercises
                    .slice()
                    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
                    .map((exercise) => (
                    <div
                      key={exercise.label}
                      className="kv"
                      style={{ fontSize: 13 }}
                    >
                      <span>{exercise.label}</span>
                      <span style={{ color: "var(--text)", fontWeight: 700 }}>
                        {exercise.score.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        );
      })}

      <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
        <div className="muted" style={{ fontSize: 13, lineHeight: 1.4 }}>
          {getMovementInsight(items)}
        </div>

        <div style={{ fontSize: 13, lineHeight: 1.4 }}>
          <span className="muted">Action: </span>
          <span style={{ color: "var(--text)", fontWeight: 600 }}>
            {getMovementAction(items)}
          </span>
        </div>
      </div>
    </div>
  );
}

type DashboardChartCardProps = {
  chart: DashboardChartViewModel;
  chartData: ChartDatum[];
  series: ChartSeriesConfig[];
  yDomainMode?: "auto" | "tight";
  valueFormatter?: (value: number | null | undefined) => string;
  yAxisTickFormatter?: (value: number) => string;
  emptyMessage?: string;
  chartRenderer?: "recharts" | "visx";
  chartTestIdBase?: string;
  windowSize?: number;
  paneNavigationMode?: "default" | "movingPane";
  dragScrollEnabled?: boolean;
  yAxisSide?: YAxisSide;
  headerControls?: React.ReactNode;
  infoPageKey?: keyof typeof informationRegistry;
  infoKey?: string;
};

export default function DashboardChartCard({
  chart,
  chartData,
  series,
  yDomainMode,
  valueFormatter,
  yAxisTickFormatter,
  emptyMessage,
  chartRenderer = "recharts",
  chartTestIdBase,
  windowSize,
  paneNavigationMode,
  dragScrollEnabled,
  yAxisSide,
  headerControls,
  infoPageKey,
  infoKey,
}: DashboardChartCardProps) {
  const ChartComponent = chartRenderer === "visx" ? VisxTrendChartCard : TrendChartCard;

  return (
    <div className="card">
      <div
        className="row"
        style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}
      >
        <div>
          <h3 style={{ margin: 0 }}>{chart.title}</h3>
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            {chart.subtitle}
          </div>

          {chart.momentumMessage ? (
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              {chart.momentumMessage}
            </div>
          ) : null}

          {headerControls ? <div style={{ marginTop: 8 }}>{headerControls}</div> : null}
        </div>
        <TrendBadge direction={chart.direction} />
      </div>

      <ChartComponent
        title={chart.title}
        subtitle={chart.subtitle}
        data={chartData}
        series={series}
        testIdBase={chartTestIdBase}
        windowSize={windowSize}
        paneNavigationMode={paneNavigationMode}
        dragScrollEnabled={dragScrollEnabled}
        infoPageKey={infoPageKey}
        infoKey={infoKey}
        yDomainMode={yDomainMode}
        yAxisSide={yAxisSide}
        showTrendLine={true}
        valueFormatter={valueFormatter}
        yAxisTickFormatter={yAxisTickFormatter}
        tooltipLabelFormatter={(label, datum) => {
          if (typeof datum?.date === "string" && datum.date.trim()) return datum.date;
          return label;
        }}
        emptyMessage={emptyMessage}
      />

      <div className="grid two dashboard-analysis" style={{ marginTop: 12 }}>
        <div className="card">
          <div
            className="row"
            style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}
          >
            <strong>Analysis</strong>
            <TrendBadge direction={chart.direction} />
          </div>
          <AnalysisRows rows={chart.analysisRows} />
        </div>

        <div className="card">
          <div
            className="row"
            style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}
          >
            <strong>Coach Interpretation</strong>
            <TrendBadge direction={chart.direction} />
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.5 }}>{chart.interpretation}</div>
        </div>
      </div>

      {chart.id === "strength" &&
        ((chart.topMovers?.length ?? 0) > 0 || (chart.movementBreakdown?.length ?? 0) > 0) && (
          <div className="grid two dashboard-analysis" style={{ marginTop: 12 }}>
            <div className="card">
              <div
                className="row"
                style={{
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <strong>Top Movers</strong>
                <span className="badge">Drivers</span>
              </div>

              <StrengthTopMovers items={chart.topMovers ?? []} />
            </div>

            <div className="card">
              <div
                className="row"
                style={{
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <strong>Movement Breakdown</strong>
                <span className="badge">Composites</span>
              </div>

              <StrengthMovementBreakdown items={chart.movementBreakdown ?? []} />
            </div>
          </div>
        )}
    </div>
  );
}
