/* ============================================================================
   PhaseQualityCard.tsx
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-03-19-PHASE-QUALITY-04
   FILE: src/components/phase/PhaseQualityCard.tsx

   Purpose
   - Provide a reusable phase-aware quality card for Cut / Bulk / Maintain
   - Render the shared phase-quality truth layer
   - Keep presentation separate from decision rules
   ============================================================================ */

import React, { useMemo } from "react";
import {
  evaluatePhaseQuality,
  type PhaseMode,
} from "../../body/phaseQualityModel";

export type PhaseQualityCardProps = {
  mode: PhaseMode;
  weightDelta?: number;
  waistDelta?: number;
  correctedLeanDelta?: number;
  correctedBodyFatDelta?: number;
  strengthDelta?: number;
  sampleCount?: number;
};

function toneColor(tone: "good" | "watch" | "bad" | "neutral") {
  if (tone === "good") return "var(--accent)";
  if (tone === "bad") return "var(--danger)";
  return "var(--muted)";
}

function QuadrantCell({
  title,
  subtitle,
  active,
  tone,
}: {
  title: string;
  subtitle?: string;
  active: boolean;
  tone: "good" | "watch" | "bad" | "neutral";
}) {
  const activeBorder =
    tone === "good"
      ? "rgba(22, 163, 74, 0.55)"
      : tone === "watch"
        ? "rgba(245, 158, 11, 0.55)"
        : tone === "bad"
          ? "rgba(239, 68, 68, 0.75)"
          : "var(--line)";

  const activeBg =
    tone === "good"
      ? "rgba(22, 163, 74, 0.06)"
      : tone === "watch"
        ? "rgba(245, 158, 11, 0.06)"
        : tone === "bad"
          ? "rgba(239, 68, 68, 0.05)"
          : "rgba(0,0,0,0.02)";

  return (
    <div
      style={{
        border: `1px solid ${active ? activeBorder : "var(--line)"}`,
        background: active ? activeBg : "transparent",
        borderRadius: 10,
        padding: 12,
        minHeight: 84,
        boxShadow: active ? "0 1px 4px rgba(0,0,0,0.05)" : "none",
      }}
    >
      <div
        style={{
          fontWeight: active ? 900 : 700,
          fontSize: 14,
          lineHeight: 1.15,
          marginBottom: subtitle ? 6 : 0,
          color: active ? "var(--text)" : "var(--muted)",
          whiteSpace: "pre-line",
        }}
      >
        {title}
      </div>

      {subtitle ? (
        <div
          className="muted"
          style={{
            fontSize: 12,
            lineHeight: 1.25,
            whiteSpace: "pre-line",
            opacity: active ? 0.95 : 0.9,
          }}
        >
          {subtitle}
        </div>
      ) : null}
    </div>
  );
}

function StatusChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "good" | "watch" | "bad" | "neutral";
}) {
  return (
    <div
      className="card"
      style={{
        padding: 10,
        minHeight: 72,
        border: "1px solid var(--line)",
        boxShadow: "none",
      }}
    >
      <div
        className="muted"
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 0.4,
          marginBottom: 6,
          lineHeight: 1.15,
          minHeight: 30,
          display: "flex",
          alignItems: "flex-start",
        }}
      >
        {label}
      </div>

      <div
        style={{
          fontWeight: 900,
          fontSize: 15,
          lineHeight: 1.15,
          color: toneColor(tone),
        }}
      >
        {value}
      </div>
    </div>
  );
}

export default function PhaseQualityCard({
  mode,
  weightDelta,
  waistDelta,
  correctedLeanDelta,
  correctedBodyFatDelta,
  strengthDelta,
  sampleCount = 10,
}: PhaseQualityCardProps) {
  const derived = useMemo(
    () =>
      evaluatePhaseQuality(mode, {
        weightDelta,
        waistDelta,
        correctedLeanDelta,
        correctedBodyFatDelta,
        strengthDelta,
        sampleCount,
      }),
    [
      mode,
      weightDelta,
      waistDelta,
      correctedLeanDelta,
      correctedBodyFatDelta,
      strengthDelta,
      sampleCount,
    ]
  );

  const activeTone = derived.tone;

  return (
    <div className="card" style={{ padding: 14, marginBottom: 12 }}>
      {mode === "cut" || mode === "bulk" ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
            marginTop: 4,
            marginBottom: 10,
          }}
        >
          {derived.cells.map((cell) => (
            <QuadrantCell
              key={cell.key}
              title={cell.title}
              subtitle={cell.subtitle}
              active={cell.key === derived.quadrant}
              tone={cell.tone}
            />
          ))}
        </div>
      ) : (
        <div
          style={{
            border: "1px solid var(--line)",
            borderRadius: 10,
            padding: 12,
            marginBottom: 12,
          }}
        >
          <div
            style={{
              fontWeight: 900,
              fontSize: 18,
              marginBottom: 6,
              color: toneColor(activeTone),
            }}
          >
            {derived.quadrantLabel}
          </div>
          <div className="muted" style={{ lineHeight: 1.4 }}>
            {derived.quadrantNote}
          </div>
        </div>
      )}

      <div
        style={{
          border: "1px solid var(--line)",
          borderRadius: 10,
          padding: 12,
          marginTop: 6,
        }}
      >
        <div
          className="muted"
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.5,
            marginBottom: 6,
          }}
        >
          Current
        </div>

        <div
          style={{
            fontWeight: 900,
            fontSize: 18,
            lineHeight: 1.15,
            marginBottom: 6,
            color: toneColor(activeTone),
          }}
        >
          {derived.quadrantLabel}
        </div>

        <div className="muted" style={{ lineHeight: 1.35 }}>
          {derived.quadrantNote}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 8,
          marginBottom: 12,
        }}
      >
        {derived.metricCards.map((metric) => (
          <StatusChip
            key={metric.label}
            label={metric.label}
            value={metric.value}
            tone={metric.tone}
          />
        ))}
      </div>

      <div
        style={{
          borderTop: "1px solid var(--line)",
          paddingTop: 12,
          marginTop: 2,
        }}
      >
        <div
          className="muted"
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.5,
            marginBottom: 6,
          }}
        >
          STATUS
        </div>

        <div
          style={{
            fontWeight: 900,
            fontSize: 20,
            lineHeight: 1.15,
            color: toneColor(activeTone),
          }}
        >
          {derived.finalStatus}
        </div>
      </div>
    </div>
  );
}
