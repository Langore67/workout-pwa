import type { CoachExportMetrics } from "./types";
import { buildCoachStateFromExportMetrics } from "../coachState/buildCoachState";
import { buildCoachReport } from "../coachReport/buildCoachReport";
import { formatCoachReportText } from "../coachReport/formatCoachReportText";

export function formatCoachExportText(metrics: CoachExportMetrics) {
  const coachState = buildCoachStateFromExportMetrics(metrics);
  const report = buildCoachReport({
    coachState,
    metrics,
    generatedAt: metrics.generatedAt,
  });
  return formatCoachReportText(report, {
    bodyHeadingOverride: "Body Composition — Coach Trend Values",
  });
}
