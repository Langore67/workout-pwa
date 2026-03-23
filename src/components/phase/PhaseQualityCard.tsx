// src/components/phase/PhaseQualityCard.tsx
/* ============================================================================
   PhaseQualityCard.tsx
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-03-19-PHASE-QUALITY-04
   FILE: src/components/phase/PhaseQualityCard.tsx

   Purpose
   - Provide a reusable phase-aware quality card for Cut / Bulk / Maintain
   - Restore the original 2x2 quadrant decision framework
   - Pair direction (weight + waist) with preservation checks
   - Keep a placeholder for the future info framework

   Notes
   - Cut / Maintain strength uses relative strength trend thresholds
   - Bulk strength uses absolute strength trend thresholds
   - This component interprets upstream deltas only
   ============================================================================ */

import React, { useMemo } from "react";

export type PhaseMode = "cut" | "maintain" | "bulk";
type Trend = "up" | "down" | "flat";

export type PhaseQualityCardProps = {
  mode: PhaseMode;
  weightDelta?: number;
  waistDelta?: number;
  correctedLeanDelta?: number;
  correctedBodyFatDelta?: number;
  strengthDelta?: number;
  sampleCount?: number;
};

/* ============================================================================
   Breadcrumb 1 — Threshold helpers
   ============================================================================ */

function isFiniteNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function getTrend(delta: number | undefined, threshold: number): Trend {
  if (!isFiniteNum(delta)) return "flat";
  if (delta > threshold) return "up";
  if (delta < -threshold) return "down";
  return "flat";
}

/* ============================================================================
   Breadcrumb 2 — Quality modifier helpers
   ============================================================================ */

function getLeanCutStatus(delta?: number): "good" | "watch" | "poor" {
  if (!isFiniteNum(delta)) return "watch";
  if (delta >= -0.5) return "good";
  if (delta >= -1.5) return "watch";
  return "poor";
}

function getLeanBulkStatus(delta?: number): "positive" | "flat" | "negative" {
  if (!isFiniteNum(delta)) return "flat";
  if (delta > 0.5) return "positive";
  if (delta < -0.5) return "negative";
  return "flat";
}

function getStrengthStatus(
  delta: number | undefined,
  mode: PhaseMode
): "stable" | "drop" | "significant_drop" | "improving" {
  if (!isFiniteNum(delta)) return "stable";

  if (mode === "cut" || mode === "maintain") {
    if (delta > 0.03) return "improving";
    if (delta >= -0.03) return "stable";
    if (delta >= -0.08) return "drop";
    return "significant_drop";
  }

  if (delta > 8) return "improving";
  if (delta >= -5) return "stable";
  if (delta >= -15) return "drop";
  return "significant_drop";
}

function getBFStatus(delta?: number): "improving" | "flat" | "worsening" {
  if (!isFiniteNum(delta)) return "flat";
  if (delta < -0.3) return "improving";
  if (delta > 0.3) return "worsening";
  return "flat";
}

/* ============================================================================
   Breadcrumb 3 — Cut logic
   ============================================================================ */

function getCutQuadrant(weightTrend: Trend, waistTrend: Trend) {
  if (weightTrend === "down" && waistTrend === "down") return "ideal";
  if (weightTrend === "down" && waistTrend !== "down") return "fast_loss";
  if (weightTrend !== "down" && waistTrend === "down") return "recomp";
  return "poor";
}

function getCutQuadrantLabel(quadrant: string) {
  if (quadrant === "ideal") return "IDEAL CUT";
  if (quadrant === "fast_loss") return "AGGRESSIVE / POSSIBLE";
  if (quadrant === "recomp") return "RECOMP / NOISY DATA";
  return "POOR CUT QUALITY";
}

function getCutQuadrantNote(quadrant: string, sampleCount?: number) {
  const sampleText = isFiniteNum(sampleCount)
    ? `over last ${sampleCount} entries`
    : "over recent entries";

  if (quadrant === "ideal") return `Weight ↓ / Waist ↓ ${sampleText}`;
  if (quadrant === "fast_loss") return `Weight ↓ / Waist ↔ or ↑ ${sampleText}`;
  if (quadrant === "recomp") return `Weight ↔ or ↑ / Waist ↓ ${sampleText}`;
  return `Weight ↔ or ↑ / Waist ↔ or ↑ ${sampleText}`;
}

function getCutFinalStatus(args: {
  quadrant: string;
  lean: "good" | "watch" | "poor";
  strength: "stable" | "drop" | "significant_drop" | "improving";
  bf: "improving" | "flat" | "worsening";
}) {
  const { quadrant, lean, strength, bf } = args;

  if (quadrant === "ideal") {
    if (
      lean === "good" &&
      (strength === "stable" || strength === "improving") &&
      bf === "improving"
    ) {
      return "High-Quality Cut";
    }

    if (
      lean === "watch" &&
      (strength === "drop" || strength === "stable") &&
      bf === "improving"
    ) {
      return "Acceptable Cut";
    }

    if (lean === "poor" || strength === "significant_drop") {
      return "Aggressive Cut / Muscle-Risk Cut";
    }

    return "Acceptable Cut";
  }

  if (quadrant === "fast_loss") return "Aggressive Cut / Muscle-Risk Cut";
  if (quadrant === "recomp") return "Recomp-Style Cut";
  return "Mixed / Noisy Cut";
}

/* ============================================================================
   Breadcrumb 4 — Bulk logic
   ============================================================================ */

function getBulkQuadrant(weightTrend: Trend, waistTrend: Trend) {
  if (weightTrend === "up" && waistTrend === "flat") return "quality";
  if (weightTrend === "up" && waistTrend === "up") return "aggressive";
  if (weightTrend !== "up" && waistTrend !== "up") return "undershooting";
  return "mixed";
}

function getBulkQuadrantLabel(quadrant: string) {
  if (quadrant === "quality") return "QUALITY BULK";
  if (quadrant === "aggressive") return "AGGRESSIVE SURPLUS";
  if (quadrant === "undershooting") return "UNDERSHOOTING BULK";
  return "MIXED / RECOMP-LIKE";
}

function getBulkQuadrantNote(quadrant: string, sampleCount?: number) {
  const sampleText = isFiniteNum(sampleCount)
    ? `over last ${sampleCount} entries`
    : "over recent entries";

  if (quadrant === "quality") return `Weight ↑ / Waist ↔ ${sampleText}`;
  if (quadrant === "aggressive") return `Weight ↑ / Waist ↑ ${sampleText}`;
  if (quadrant === "undershooting") return `Weight ↔ or ↓ / Waist ↔ or ↓ ${sampleText}`;
  return `Mixed weight / waist behavior ${sampleText}`;
}

function getBulkFinalStatus(args: {
  quadrant: string;
  lean: "positive" | "flat" | "negative";
  bf: "improving" | "flat" | "worsening";
  strength: "stable" | "drop" | "significant_drop" | "improving";
}) {
  const { quadrant, lean, bf, strength } = args;

  if (quadrant === "quality") {
    if (
      lean === "positive" &&
      bf !== "worsening" &&
      (strength === "stable" || strength === "improving")
    ) {
      return "Lean Gain Phase (High Quality)";
    }
    return "Moderate Bulk";
  }

  if (quadrant === "aggressive") {
    if (bf === "worsening") return "Aggressive Surplus (Fat Gain)";
    return "High Surplus";
  }

  if (quadrant === "undershooting") return "Undershooting Bulk";
  return "Mixed Bulk Signal";
}

/* ============================================================================
   Breadcrumb 5 — Maintain logic
   ============================================================================ */

function getMaintainStatus(args: {
  weightTrend: Trend;
  waistTrend: Trend;
  leanDelta?: number;
  strength: "stable" | "drop" | "significant_drop" | "improving";
}) {
  const { weightTrend, waistTrend, leanDelta, strength } = args;

  if (
    weightTrend === "flat" &&
    waistTrend === "flat" &&
    (!isFiniteNum(leanDelta) || leanDelta >= -0.5) &&
    (strength === "stable" || strength === "improving")
  ) {
    return {
      label: "Stable Maintenance",
      note: "Weight and waist are holding in a tight range.",
    };
  }

  if ((weightTrend === "flat" || weightTrend === "up") && waistTrend === "down") {
    return {
      label: "Recomp Signal",
      note: "Waist is improving without clear bodyweight loss.",
    };
  }

  if (weightTrend === "up" && waistTrend === "up") {
    return {
      label: "Maintenance Drift Up",
      note: "Weight and waist are both drifting upward.",
    };
  }

  if (weightTrend === "down" && waistTrend === "down" && strength === "significant_drop") {
    return {
      label: "Possible Under-Recovery",
      note: "Bodyweight is dropping while strength is falling sharply.",
    };
  }

  return {
    label: "Mixed Maintenance Signal",
    note: "Recent maintenance signals are mixed. Watch the next few entries.",
  };
}

/* ============================================================================
   Breadcrumb 6 — UI helpers
   ============================================================================ */

function toneColor(tone: "good" | "watch" | "bad" | "neutral") {
  if (tone === "good") return "var(--accent)";
  if (tone === "bad") return "var(--danger)";
  return "var(--muted)";
}

function quadrantTone(
  mode: PhaseMode,
  quadrant: string
): "good" | "watch" | "bad" | "neutral" {
  if (mode === "cut") {
    if (quadrant === "ideal") return "good";
    if (quadrant === "recomp" || quadrant === "fast_loss") return "watch";
    return "bad";
  }

  if (mode === "bulk") {
    if (quadrant === "quality") return "good";
    if (quadrant === "mixed" || quadrant === "undershooting") return "watch";
    return "bad";
  }

  return "good";
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
/* ============================================================================
   Breadcrumb 7 — Component
   ============================================================================ */

export default function PhaseQualityCard({
  mode,
  weightDelta,
  waistDelta,
  correctedLeanDelta,
  correctedBodyFatDelta,
  strengthDelta,
  sampleCount = 10,
}: PhaseQualityCardProps) {
  const weightTrend = getTrend(weightDelta, 0.5);
  const waistTrend = getTrend(waistDelta, 0.25);

  const cutLean = getLeanCutStatus(correctedLeanDelta);
  const bulkLean = getLeanBulkStatus(correctedLeanDelta);
  const strength = getStrengthStatus(strengthDelta, mode);
  const bf = getBFStatus(correctedBodyFatDelta);

  const derived = useMemo(() => {
    if (mode === "cut") {
      const quadrant = getCutQuadrant(weightTrend, waistTrend);

      return {
        title: "CUT QUALITY",
        infoKey: "cut_quality",
        quadrant,
        quadrantLabel: getCutQuadrantLabel(quadrant),
        quadrantNote: getCutQuadrantNote(quadrant, sampleCount),
        finalStatus: getCutFinalStatus({
          quadrant,
          lean: cutLean,
          strength,
          bf,
        }),
        cells: [
          {
            key: "ideal",
            title: "IDEAL CUT",
            subtitle: "fat loss signal",
            tone: "good" as const,
          },
          {
            key: "fast_loss",
            title: "AGGRESSIVE / POSSIBLE",
            subtitle: "water loss / muscle loss",
            tone: "watch" as const,
          },
          {
            key: "recomp",
            title: "RECOMP / NOISY DATA",
            subtitle: "or temporary mismatch",
            tone: "watch" as const,
          },
          {
            key: "poor",
            title: "POOR CUT QUALITY",
            subtitle: "likely off-plan",
            tone: "bad" as const,
          },
        ],
        metricCards: [
          {
            label: "Lean Preservation",
            value:
              cutLean === "good"
                ? "Good"
                : cutLean === "watch"
                  ? "Watch"
                  : "Poor",
            tone:
              cutLean === "good"
                ? ("good" as const)
                : cutLean === "watch"
                  ? ("watch" as const)
                  : ("bad" as const),
          },
          {
            label: "Strength Preservation",
            value:
              strength === "stable"
                ? "Stable"
                : strength === "improving"
                  ? "Improving"
                  : strength === "drop"
                    ? "Slight Drop"
                    : "Significant Drop",
            tone:
              strength === "stable" || strength === "improving"
                ? ("good" as const)
                : strength === "drop"
                  ? ("watch" as const)
                  : ("bad" as const),
          },
          {
            label: "BF Trend",
            value:
              bf === "improving"
                ? "Improving"
                : bf === "flat"
                  ? "Flat"
                  : "Worsening",
            tone:
              bf === "improving"
                ? ("good" as const)
                : bf === "flat"
                  ? ("watch" as const)
                  : ("bad" as const),
          },
        ],
      };
    }

    if (mode === "bulk") {
      const quadrant = getBulkQuadrant(weightTrend, waistTrend);

      return {
        title: "BULK QUALITY",
        infoKey: "bulk_quality",
        quadrant,
        quadrantLabel: getBulkQuadrantLabel(quadrant),
        quadrantNote: getBulkQuadrantNote(quadrant, sampleCount),
        finalStatus: getBulkFinalStatus({
          quadrant,
          lean: bulkLean,
          bf,
          strength,
        }),
        cells: [
          {
            key: "quality",
            title: "QUALITY BULK",
            subtitle: "controlled gain",
            tone: "good" as const,
          },
          {
            key: "aggressive",
            title: "AGGRESSIVE SURPLUS",
            subtitle: "fat gain risk",
            tone: "bad" as const,
          },
          {
            key: "undershooting",
            title: "UNDERSHOOTING BULK",
            subtitle: "not enough gain",
            tone: "watch" as const,
          },
          {
            key: "mixed",
            title: "MIXED / RECOMP-LIKE",
            subtitle: "unclear direction",
            tone: "watch" as const,
          },
        ],
        metricCards: [
          {
            label: "Lean Gain",
            value:
              bulkLean === "positive"
                ? "Positive"
                : bulkLean === "flat"
                  ? "Flat"
                  : "Negative",
            tone:
              bulkLean === "positive"
                ? ("good" as const)
                : bulkLean === "flat"
                  ? ("watch" as const)
                  : ("bad" as const),
          },
          {
            label: "BF Trend",
            value:
              bf === "improving"
                ? "Controlled"
                : bf === "flat"
                  ? "Stable"
                  : "Worsening",
            tone:
              bf === "improving" || bf === "flat"
                ? ("good" as const)
                : ("bad" as const),
          },
          {
            label: "Strength Signal",
            value:
              strength === "stable"
                ? "Stable"
                : strength === "improving"
                  ? "Improving"
                  : strength === "drop"
                    ? "Slight Drop"
                    : "Significant Drop",
            tone:
              strength === "stable" || strength === "improving"
                ? ("good" as const)
                : strength === "drop"
                  ? ("watch" as const)
                  : ("bad" as const),
          },
        ],
      };
    }

    const maintain = getMaintainStatus({
      weightTrend,
      waistTrend,
      leanDelta: correctedLeanDelta,
      strength,
    });

    return {
      title: "MAINTENANCE QUALITY",
      infoKey: "maintain_quality",
      quadrant: "maintain",
      quadrantLabel: maintain.label,
      quadrantNote: maintain.note,
      finalStatus: maintain.label,
      cells: [] as Array<{
        key: string;
        title: string;
        subtitle?: string;
        tone: "good" | "watch" | "bad" | "neutral";
      }>,
      metricCards: [
        {
          label: "Weight Trend",
          value:
            weightTrend === "flat"
              ? "Stable"
              : weightTrend === "down"
                ? "Down"
                : "Up",
          tone: weightTrend === "flat" ? ("good" as const) : ("watch" as const),
        },
        {
          label: "Waist Trend",
          value:
            waistTrend === "flat"
              ? "Stable"
              : waistTrend === "down"
                ? "Down"
                : "Up",
          tone:
            waistTrend === "flat"
              ? ("good" as const)
              : waistTrend === "down"
                ? ("good" as const)
                : ("watch" as const),
        },
        {
          label: "Strength Signal",
          value:
            strength === "stable"
              ? "Stable"
              : strength === "improving"
                ? "Improving"
                : strength === "drop"
                  ? "Slight Drop"
                  : "Significant Drop",
          tone:
            strength === "stable" || strength === "improving"
              ? ("good" as const)
              : strength === "drop"
                ? ("watch" as const)
                : ("bad" as const),
        },
      ],
    };
  }, [
    mode,
    weightTrend,
    waistTrend,
    cutLean,
    bulkLean,
    strength,
    bf,
    correctedLeanDelta,
    sampleCount,
  ]);

  const activeTone = quadrantTone(mode, derived.quadrant);

  return (
    <div className="card" style={{ padding: 14, marginBottom: 12 }}>
      
      {/* =====================================================================
          Breadcrumb 7B — Quadrant / maintain block
         ================================================================== */}
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

      {/* =====================================================================
          Breadcrumb 7C — Current state
         ================================================================== */}
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

      {/* =====================================================================
          Breadcrumb 7D — Modifier cards
         ================================================================== */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 8,
          marginBottom: 12,
        }}
      >
        {derived.metricCards.map((m) => (
          <StatusChip
            key={m.label}
            label={m.label}
            value={m.value}
            tone={m.tone}
          />
        ))}
      </div>

      {/* =====================================================================
          Breadcrumb 7E — Final status
         ================================================================== */}
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

/* ============================================================================
   End of file: src/components/phase/PhaseQualityCard.tsx
   ============================================================================ */