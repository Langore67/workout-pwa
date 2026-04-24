import React, { useMemo, useState } from "react";

export type AnchorDiagnosticsRow = {
  pattern: string;
  selectionLabel: string | null;
  reason: string | null;
  selectionSummary: string | null;
  configuredExerciseName: string | null;
  unresolvedReason: string | null;
};

type AnchorDiagnosticsCardProps = {
  phase?: string | null;
  rows: AnchorDiagnosticsRow[];
};

export default function AnchorDiagnosticsCard({
  phase,
  rows,
}: AnchorDiagnosticsCardProps) {
  const [showAnchorDiagnostics, setShowAnchorDiagnostics] = useState(false);

  const summary = useMemo(() => {
    const selected = rows.filter((row) => !!row.selectionLabel).length;
    return {
      selected,
      unresolved: Math.max(0, rows.length - selected),
    };
  }, [rows]);

  return (
    <div className="card">
      <div style={{ display: "grid", gap: 12 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "flex-start",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: 16 }}>Anchor Diagnostics</h3>
            <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
              Current shared v2 anchor selections for Performance.
            </div>
          </div>

          <button
            type="button"
            className="btn small"
            onClick={() => setShowAnchorDiagnostics((value) => !value)}
            aria-expanded={showAnchorDiagnostics}
          >
            {showAnchorDiagnostics ? "Hide" : "Show"}
          </button>
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            fontSize: 13,
          }}
        >
          <span className="chip">Phase {phase ?? "Unknown"}</span>
          <span className="chip">Anchors {rows.length || 0}</span>
          <span className="chip">
            {summary.selected} selected • {summary.unresolved} unresolved
          </span>
        </div>

        {showAnchorDiagnostics ? (
          <div style={{ display: "grid", gap: 8 }}>
            {rows.length ? (
              rows.map((row) => (
                <div
                  key={row.pattern}
                  style={{
                    display: "grid",
                    gap: 6,
                    padding: "10px 12px",
                    border: "1px solid color-mix(in srgb, var(--border) 70%, transparent)",
                    borderRadius: 8,
                    background: "color-mix(in srgb, var(--panel) 92%, white 8%)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 8,
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <strong style={{ fontSize: 13, lineHeight: 1.2 }}>{row.pattern}</strong>
                    {row.selectionSummary ? (
                      <span className="chip" style={{ fontSize: 11 }}>
                        {row.selectionSummary}
                      </span>
                    ) : null}
                  </div>

                  <div style={{ fontSize: 13, lineHeight: 1.35 }}>
                    {row.selectionLabel ?? "No anchor selected"}
                  </div>

                  {row.configuredExerciseName &&
                  row.configuredExerciseName !== row.selectionLabel ? (
                    <div className="muted" style={{ fontSize: 12 }}>
                      Configured {row.configuredExerciseName}
                    </div>
                  ) : null}

                  <div className="muted" style={{ fontSize: 12, lineHeight: 1.35 }}>
                    {row.reason ?? row.unresolvedReason ?? "Unresolved"}
                  </div>
                </div>
              ))
            ) : (
              <div className="muted" style={{ fontSize: 13 }}>
                Anchor diagnostics are unavailable.
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
