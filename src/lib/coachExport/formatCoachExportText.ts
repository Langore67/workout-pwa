import type { CoachExportMetrics } from "./types";
import { buildCoachStateFromExportMetrics } from "../coachState/buildCoachState";
import { buildCoachReport } from "../coachReport/buildCoachReport";
import { formatCoachReportText } from "../coachReport/formatCoachReportText";
import { withCoachStateComparison } from "../coachState/coachExplainability";
import type { PersistedCoachComparisonSnapshot } from "../coachState/coachExplainability";

export function formatCoachExportText(metrics: CoachExportMetrics, prior?: PersistedCoachComparisonSnapshot) {
  const coachState = withCoachStateComparison(buildCoachStateFromExportMetrics(metrics), prior);
  const report = buildCoachReport({
    coachState,
    metrics,
    generatedAt: metrics.generatedAt,
  });
  return formatCoachReportText(report, {
    bodyHeadingOverride: "Body Composition — Coach Trend Values",
  });
}
