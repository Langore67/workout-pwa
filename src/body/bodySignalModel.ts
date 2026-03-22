// src/body/bodySignalModel.ts
/* ============================================================================
   bodySignalModel.ts — Shared body signal helpers
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-03-21-BODYSIGNAL-01
   FILE: src/body/bodySignalModel.ts

   Purpose
   - Provide shared body-metric helper functions for Body Composition and MPS
   - Centralize body row field picking and phase signal interpretation
   - Reduce code drift between analytics pages

   Notes
   - This is intentionally a small first extraction
   - MPS-specific interpretation remains in MpsPage.tsx for now
   ============================================================================ */

export type Mode = "cut" | "maintain" | "bulk";

export type BodyMetricRow = {
  id: string;
  takenAt?: number;
  measuredAt?: number;
  date?: number;
  createdAt?: number;

  weightLb?: number;
  weight?: number;

  waistIn?: number;
  waist?: number;

  bodyFatPct?: number;
  bodyFatMassLb?: number;
  leanMassLb?: number;
  skeletalMuscleMassLb?: number;
  visceralFatIndex?: number;
  bodyWaterPct?: number;

  icwLb?: number;
  ecwLb?: number;
  mineralMassLb?: number;
};

export function pickTime(r: BodyMetricRow): number {
  const t = Number(r?.measuredAt ?? r?.takenAt ?? r?.date ?? r?.createdAt);
  return Number.isFinite(t) ? t : 0;
}

export function pickWeightLb(r: BodyMetricRow): number | undefined {
  const bw = (r as any)?.weightLb ?? (r as any)?.weight;
  return typeof bw === "number" && Number.isFinite(bw) && bw > 0 ? bw : undefined;
}

export function pickWaistIn(r: BodyMetricRow): number | undefined {
  const w = (r as any)?.waistIn ?? (r as any)?.waist;
  return typeof w === "number" && Number.isFinite(w) && w > 0 ? w : undefined;
}

export function pickBodyFatPct(r: BodyMetricRow): number | undefined {
  const bf = (r as any)?.bodyFatPct;
  return typeof bf === "number" && Number.isFinite(bf) && bf >= 0 ? bf : undefined;
}

export function average(nums: number[]): number | undefined {
  if (!nums.length) return undefined;
  return nums.reduce((sum, n) => sum + n, 0) / nums.length;
}

export function averagePreviousValues<T>(
  rows: T[],
  getter: (row: T) => number | undefined,
  count = 3
): number | undefined {
  const priorValues = rows
    .slice(1)
    .map(getter)
    .filter((v): v is number => v != null && Number.isFinite(v))
    .slice(0, count);

  return average(priorValues);
}

export function computePhaseSignal(rows: BodyMetricRow[], mode: Mode) {
  const aligned = rows
    .map((r) => ({
      weight: pickWeightLb(r),
      waist: pickWaistIn(r),
      bodyFatPct: pickBodyFatPct(r),
    }))
    .filter(
      (r): r is { weight: number; waist: number; bodyFatPct?: number } =>
        r.weight != null &&
        Number.isFinite(r.weight) &&
        r.waist != null &&
        Number.isFinite(r.waist)
    );

  if (aligned.length < 3) {
    return {
      label: "Current Signal",
      status: "Not enough data",
      note: "Add at least 3 entries that include both weight and waist.",
    };
  }

  const first = aligned[0];
  const last = aligned[aligned.length - 1];

  const weightDelta = last.weight - first.weight;
  const waistDelta = last.waist - first.waist;

  if (mode === "cut") {
    if (weightDelta < 0 && waistDelta < 0) {
      return {
        label: "Current Signal",
        status: "Strong fat-loss signal",
        note: "Weight and waist are both trending down.",
      };
    }

    if (weightDelta < 0 && waistDelta >= 0) {
      return {
        label: "Current Signal",
        status: "Possible water / glycogen loss",
        note: "Weight is down, but waist is flat or up.",
      };
    }

    if (weightDelta >= 0 && waistDelta < 0) {
      return {
        label: "Current Signal",
        status: "Possible recomposition",
        note: "Waist is dropping while scale weight is stable or rising.",
      };
    }

    return {
      label: "Current Signal",
      status: "Fat gain risk",
      note: "Weight and waist are both drifting up during a cut.",
    };
  }

  if (mode === "bulk") {
    if (weightDelta > 0 && waistDelta <= 0) {
      return {
        label: "Current Signal",
        status: "Lean gain signal",
        note: "Weight is rising while waist is stable or down.",
      };
    }

    if (weightDelta > 0 && waistDelta > 0) {
      return {
        label: "Current Signal",
        status: "Possible surplus too aggressive",
        note: "Weight and waist are both rising.",
      };
    }

    if (weightDelta <= 0 && waistDelta <= 0) {
      return {
        label: "Current Signal",
        status: "Undershooting bulk",
        note: "Weight is not climbing enough for a gaining phase.",
      };
    }

    return {
      label: "Current Signal",
      status: "Mixed bulk signal",
      note: "Trend is unclear. Watch the next few check-ins.",
    };
  }

  if (Math.abs(weightDelta) <= 1 && Math.abs(waistDelta) <= 0.5) {
    return {
      label: "Current Signal",
      status: "Stable maintenance signal",
      note: "Weight and waist are both staying in a tight range.",
    };
  }

  if (waistDelta < 0 && weightDelta >= 0) {
    return {
      label: "Current Signal",
      status: "Possible recomp",
      note: "Waist is improving without meaningful weight loss.",
    };
  }

  return {
    label: "Current Signal",
    status: "Maintenance drift",
    note: "Weight and/or waist are moving enough to merit attention.",
  };
}

/* ============================================================================
   End of file: src/body/bodySignalModel.ts
   ============================================================================ */