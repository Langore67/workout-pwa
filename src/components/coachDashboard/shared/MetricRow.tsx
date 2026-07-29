import React from "react";

export function MetricRow({
  label,
  value,
  emphasis = "normal",
}: {
  label: string;
  value: string;
  emphasis?: "normal" | "strong" | "subtle";
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(96px, 118px) minmax(0, 1fr)",
        gap: 10,
        alignItems: "start",
      }}
    >
      <div className="muted" style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </div>
      <div
        style={{
          minWidth: 0,
          wordBreak: "break-word",
          fontWeight: emphasis === "strong" ? 800 : 500,
          color: emphasis === "subtle" ? "var(--muted)" : "var(--text)",
          lineHeight: 1.35,
        }}
      >
        {value}
      </div>
    </div>
  );
}
