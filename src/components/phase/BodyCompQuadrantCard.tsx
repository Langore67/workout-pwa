// src/components/phase/BodyCompQuadrantCard.tsx
/* ============================================================================
   BodyCompQuadrantCard.tsx
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-03-19-BODYCOMP-QUAD-01
   FILE: src/components/phase/BodyCompQuadrantCard.tsx

   Purpose
   - Provide a simple visual quadrant map for body composition direction
   - Plot current weight/waist delta position
   - Pair the visual with the existing primary/secondary phase signal
   - Reserve a placeholder for the future info-modal framework

   Design notes
   - This component is VISUAL only
   - It does not decide the coaching meaning of the quadrant
   - Meaning should come from the existing computePhaseSignal() logic
   ============================================================================ */

import React from "react";

type Mode = "cut" | "maintain" | "bulk";

type Props = {
  mode: Mode;
  weightDelta?: number;
  waistDelta?: number;
  primaryLabel: string;
  secondaryLabel: string;
};

function isFiniteNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function formatSigned(value?: number, digits = 1) {
  if (!isFiniteNum(value)) return "—";
  const abs = Math.abs(value).toFixed(digits);
  if (value > 0) return `+${abs}`;
  if (value < 0) return `-${abs}`;
  return abs;
}

function toneFromMode(mode: Mode) {
  if (mode === "cut") return "var(--accent)";
  if (mode === "bulk") return "var(--text)";
  return "var(--accent)";
}

function getQuadrantTitle(mode: Mode, weightDelta?: number, waistDelta?: number) {
  const w = isFiniteNum(weightDelta) ? weightDelta : 0;
  const ws = isFiniteNum(waistDelta) ? waistDelta : 0;

  if (mode === "cut") {
    if (w < 0 && ws < 0) return "Fat loss";
    if (w < 0 && ws >= 0) return "Water loss / noisy";
    if (w >= 0 && ws < 0) return "Recomp";
    return "Poor cut direction";
  }

  if (mode === "bulk") {
    if (w > 0 && ws <= 0) return "Lean gain";
    if (w > 0 && ws > 0) return "Aggressive surplus";
    if (w <= 0 && ws <= 0) return "Undershooting";
    return "Mixed bulk";
  }

  if (Math.abs(w) <= 1 && Math.abs(ws) <= 0.5) return "Stable maintain";
  if (ws < 0 && w >= 0) return "Recomp";
  if (w > 0 && ws > 0) return "Drift up";
  if (w < 0 && ws < 0) return "Drift down";
  return "Mixed maintain";
}

export default function BodyCompQuadrantCard({
  mode,
  weightDelta,
  waistDelta,
  primaryLabel,
  secondaryLabel,
}: Props) {
  const hasPoint = isFiniteNum(weightDelta) && isFiniteNum(waistDelta);

  // Normalize into a square quadrant view.
  // These are display bounds, not coaching thresholds.
  const maxAbsWeight = Math.max(3, Math.abs(weightDelta ?? 0), 3);
  const maxAbsWaist = Math.max(1.5, Math.abs(waistDelta ?? 0), 1.5);

  const xNorm = hasPoint ? clamp((weightDelta as number) / maxAbsWeight, -1, 1) : 0;
  const yNorm = hasPoint ? clamp((waistDelta as number) / maxAbsWaist, -1, 1) : 0;

  const dotLeft = 50 + xNorm * 40; // percent
  const dotTop = 50 - yNorm * 40;  // percent

  const quadrantTitle = getQuadrantTitle(mode, weightDelta, waistDelta);
  const accent = toneFromMode(mode);

  return (
    <div className="card" style={{ padding: 14, marginBottom: 12 }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          marginBottom: 10,
        }}
      >
        <div
          className="muted"
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 0.5,
          }}
        >
          BODY COMP QUADRANT
        </div>

        {/* Placeholder for future info framework */}
        <button
          type="button"
          aria-label="Open info for body comp quadrant"
          onClick={() => {
            // TODO: Hook into InfoModal / info framework later
            // Example future call:
            // openInfo("body_comp_quadrant");
            console.log("Open info:", "body_comp_quadrant");
          }}
          style={{
            border: "1px solid var(--line)",
            background: "transparent",
            borderRadius: 999,
            width: 24,
            height: 24,
            fontSize: 12,
            fontWeight: 700,
            color: "var(--muted)",
            cursor: "pointer",
          }}
        >
          i
        </button>
      </div>

      {/* Grid + labels */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "56px minmax(0, 1fr)",
          gap: 10,
          alignItems: "stretch",
          marginBottom: 12,
        }}
      >
        {/* Y axis label */}
        <div
          className="muted"
          style={{
            writingMode: "vertical-rl",
            transform: "rotate(180deg)",
            textAlign: "center",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 0.3,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            userSelect: "none",
          }}
        >
          Waist change
        </div>

        <div>
          {/* Quadrant square */}
          <div
            style={{
              position: "relative",
              aspectRatio: "1 / 1",
              width: "100%",
              border: "1px solid var(--line)",
              borderRadius: 12,
              overflow: "hidden",
              background:
                "linear-gradient(to right, rgba(0,0,0,0.015) 0 50%, rgba(0,0,0,0.03) 50% 100%)",
            }}
          >
            {/* Horizontal half tint */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "linear-gradient(to bottom, rgba(0,0,0,0.015) 0 50%, rgba(0,0,0,0.03) 50% 100%)",
                pointerEvents: "none",
              }}
            />

            {/* Crosshairs */}
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: 0,
                bottom: 0,
                width: 1,
                background: "var(--line)",
              }}
            />
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: 0,
                right: 0,
                height: 1,
                background: "var(--line)",
              }}
            />

            {/* Quadrant labels */}
            <div
              className="muted"
              style={{
                position: "absolute",
                top: 10,
                left: 10,
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              {mode === "cut" ? "Weight- / Waist+" : mode === "bulk" ? "Weight+ / Waist+" : "Weight+ / Waist+"}
            </div>
            <div
              className="muted"
              style={{
                position: "absolute",
                top: 10,
                right: 10,
                fontSize: 11,
                fontWeight: 700,
                textAlign: "right",
              }}
            >
              {mode === "cut" ? "Weight+ / Waist+" : mode === "bulk" ? "Weight+ / Waist-" : "Weight- / Waist+"}
            </div>
            <div
              className="muted"
              style={{
                position: "absolute",
                bottom: 10,
                left: 10,
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              {mode === "cut" ? "Weight- / Waist-" : mode === "bulk" ? "Weight- / Waist+" : "Weight+ / Waist-"}
            </div>
            <div
              className="muted"
              style={{
                position: "absolute",
                bottom: 10,
                right: 10,
                fontSize: 11,
                fontWeight: 700,
                textAlign: "right",
              }}
            >
              {mode === "cut" ? "Weight+ / Waist-" : mode === "bulk" ? "Weight- / Waist-" : "Weight- / Waist-"}
            </div>

            {/* Dot */}
            {hasPoint ? (
              <>
                <div
                  style={{
                    position: "absolute",
                    left: `${dotLeft}%`,
                    top: `${dotTop}%`,
                    transform: "translate(-50%, -50%)",
                    width: 16,
                    height: 16,
                    borderRadius: "999px",
                    background: accent,
                    border: "2px solid var(--card)",
                    boxShadow: "0 0 0 2px rgba(0,0,0,0.08)",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: `${dotLeft}%`,
                    top: `${dotTop}%`,
                    transform: "translate(-50%, calc(-100% - 10px))",
                    background: "var(--card)",
                    border: "1px solid var(--line)",
                    borderRadius: 8,
                    padding: "4px 6px",
                    fontSize: 11,
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                  }}
                >
                  Wt {formatSigned(weightDelta)} • Waist {formatSigned(waistDelta)}
                </div>
              </>
            ) : (
              <div
                className="muted"
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                Add more data to place the current point
              </div>
            )}
          </div>

          {/* X axis label */}
          <div
            className="muted"
            style={{
              marginTop: 8,
              textAlign: "center",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 0.3,
              userSelect: "none",
            }}
          >
            Weight change
          </div>
        </div>
      </div>

      {/* Signal text from existing computePhaseSignal */}
      <div style={{ marginBottom: 8 }}>
        <div
          style={{
            fontWeight: 900,
            fontSize: 18,
            marginBottom: 4,
            color: accent,
          }}
        >
          {primaryLabel || quadrantTitle}
        </div>

        <div className="muted" style={{ lineHeight: 1.4 }}>
          {secondaryLabel || quadrantTitle}
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   End of file: src/components/phase/BodyCompQuadrantCard.tsx
   ============================================================================ */