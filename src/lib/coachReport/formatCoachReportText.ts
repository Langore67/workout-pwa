import type { CoachReport } from "./coachReportTypes";

export function formatCoachReportText(
  report: CoachReport,
  options: {
    bodyHeadingOverride?: string;
  } = {}
) {
  const body = report.body;
  const performance = report.performance;
  const goals = report.goals;
  const learnings = report.learnings;
  const cardio = report.cardio;
  const bodyHeading = options.bodyHeadingOverride ?? body?.heading ?? "Body Values";

  const lines = [
    "IronForge Coach Export",
    report.generatedAt ? `Generated: ${report.generatedAt}` : "Generated: Unknown",
    "",
    `Coach Snapshot`,
    `- Status: ${report.snapshot.status}`,
    `- Confidence: ${report.snapshot.confidence}`,
    `- Why: ${report.snapshot.why}`,
    `- Today: ${report.snapshot.today}`,
    ...(report.snapshot.biggestWin ? ["", "Biggest Win", `- ${report.snapshot.biggestWin}`] : []),
    ...(report.snapshot.biggestRisk ? ["", "Biggest Risk", `- ${report.snapshot.biggestRisk}`] : []),
    "",
    ...(body
      ? [
          bodyHeading,
          ...(body.values.length ? body.values.map((line) => line.text) : ["- No body trend values available."]),
          ...(body.note ? ["", `- ${body.note}`] : []),
          ...(body.confidenceRows.length
            ? ["", "Body Confidence", ...body.confidenceRows.map((line) => line.text)]
            : []),
          "",
        ]
      : []),
    ...(performance
      ? [
          "Performance",
          `- Performance Trend: ${performance.trend ?? "—"}`,
          ...(performance.strengthSignal ? [`- Strength Signal: ${performance.strengthSignal}`] : []),
          ...(performance.anchor ? [`- ${performance.anchor.label}: ${performance.anchor.text}`] : []),
          `- Movement Quality: ${performance.movementQuality ?? "—"}`,
          ...(performance.read ? [`- Performance Read: ${performance.read}`] : []),
          "",
        ]
      : []),
    ...(goals
      ? [
          "Goals",
          `- Goal Trajectory: ${goals.trajectory ?? "—"}`,
          ...(goals.read ? [`- Goal Read: ${goals.read}`] : []),
          ...(goals.targets.length ? goals.targets.map((line) => line.text) : []),
          "",
        ]
      : []),
    ...(learnings
      ? [
          "Learnings",
          "What's Working",
          ...(learnings.whatsWorking.length
            ? learnings.whatsWorking.map((item) => `- ${item}`)
            : ["- No validated learnings yet."]),
          "",
          "Watch Now",
          ...(learnings.watchNow.length ? learnings.watchNow.map((item) => `- ${item}`) : ["- No active watch items."]),
          "",
        ]
      : []),
    ...(cardio
      ? cardio.isEmpty
        ? ["Cardio", cardio.note ?? "Cardio summary not available yet.", ""]
        : [
            "Cardio",
            ...(cardio.status ? [`- Cardio Status: ${cardio.status}`] : []),
            ...cardio.rows.map((line) => line.text),
            ...(cardio.note ? [`- Cardio Note: ${cardio.note}`] : []),
            "",
          ]
      : []),
  ];

  return lines.join("\n");
}
