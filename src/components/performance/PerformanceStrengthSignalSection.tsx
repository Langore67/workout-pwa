import React from "react";

import DashboardChartCard from "./DashboardChartCard";
import StrengthSignalDetailsCard, {
  type StrengthSignalDetailsComposite,
  type StrengthSignalDetailsExercise,
} from "./StrengthSignalDetailsCard";
import type { ChartDatum, ChartSeriesConfig } from "../charts/chartTypes";

type TrendDirection = "improving" | "stable" | "declining" | "watch";

type AnalysisRow = {
  label: string;
  value: string;
};

type ChartViewModel = {
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
    includedExercises: Array<{
      label: string;
      score: number;
    }>;
  }>;
};

type PerformanceStrengthSignalSectionProps = {
  chart: ChartViewModel;
  chartData: ChartDatum[];
  series: ChartSeriesConfig[];
  showDebug: boolean;
  setShowDebug: React.Dispatch<React.SetStateAction<boolean>>;
  sourceUsed: string;
  dateWindowUsed: string;
  confidenceLevel: string;
  exercisesIncluded: string;
  currentStrengthSignal: string;
  strongestPattern: string;
  note: string;
  debugComposites: StrengthSignalDetailsComposite[];
  debugTopExercises: StrengthSignalDetailsExercise[];
};

export default function PerformanceStrengthSignalSection({
  chart,
  chartData,
  series,
  showDebug,
  setShowDebug,
  sourceUsed,
  dateWindowUsed,
  confidenceLevel,
  exercisesIncluded,
  currentStrengthSignal,
  strongestPattern,
  note,
  debugComposites,
  debugTopExercises,
}: PerformanceStrengthSignalSectionProps) {
  return (
    <>
      <DashboardChartCard
        chart={chart}
        chartData={chartData}
        series={series}
        chartRenderer="visx"
        yDomainMode="auto"
        valueFormatter={(value) =>
          value == null || !Number.isFinite(value) ? "—" : value.toFixed(2)
        }
        emptyMessage="Not enough strength history yet."
      />

      <StrengthSignalDetailsCard
        showDebug={showDebug}
        setShowDebug={setShowDebug}
        sourceUsed={sourceUsed}
        dateWindowUsed={dateWindowUsed}
        confidenceLevel={confidenceLevel}
        exercisesIncluded={exercisesIncluded}
        currentStrengthSignal={currentStrengthSignal}
        strongestPattern={strongestPattern}
        note={note}
        debugComposites={debugComposites}
        debugTopExercises={debugTopExercises}
      />
    </>
  );
}
