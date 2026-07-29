import React from "react";

export function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "110px minmax(0, 1fr)", gap: 8, alignItems: "start" }}>
      <div className="muted" style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </div>
      <div style={{ minWidth: 0, wordBreak: "break-word" }}>{value}</div>
    </div>
  );
}
