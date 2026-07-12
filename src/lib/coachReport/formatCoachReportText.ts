import type { CoachReport, CoachReportSection } from "./coachReportTypes";

function renderSection(section: CoachReportSection | undefined) {
  if (!section) return [] as string[];

  const lines: string[] = [section.title];
  if (section.status) lines.push(`- Status: ${section.status}`);
  if (section.confidence) lines.push(`- Confidence: ${section.confidence}`);
  if (section.rows?.length) {
    lines.push(...section.rows.map((row) => row.text));
  }
  if (section.positive?.length || section.negative?.length) {
    lines.push("", "Evidence");
    if (section.positive?.length) {
      lines.push("", "Positive", ...section.positive.map((item) => `- ${item}`));
    }
    if (section.negative?.length) {
      lines.push("", "Negative", ...section.negative.map((item) => `- ${item}`));
    }
  }
  if (section.blocks?.length) {
    for (const block of section.blocks) {
      lines.push("", block.heading, ...block.items.map((item) => `- ${item}`));
    }
  }
  if (section.bullets?.length) {
    lines.push(...section.bullets.map((item) => `- ${item}`));
  }
  if (section.note) {
    lines.push("", `- Note: ${section.note}`);
  }
  lines.push("");
  return lines;
}

function renderWeeklyVolume(volume: CoachReport["weeklyVolume"]) {
  if (!volume) return [] as string[];

  const lines: string[] = [volume.title];
  if (volume.status) lines.push(`- Status: ${volume.status}`);
  if (volume.note) lines.push(`- Note: ${volume.note}`);
  if (volume.rows?.length) {
    lines.push("", "Rollups", ...volume.rows.map((row) => row.text));
  }
  if (volume.balanceRows?.length) {
    lines.push("", "Balance", ...volume.balanceRows.map((row) => row.text));
  }
  if (volume.detailRows?.length) {
    lines.push("", "Detailed Buckets", ...volume.detailRows.map((row) => row.text));
  }
  if (volume.unclassified?.length) {
    lines.push("", "Unclassified Exercises", ...volume.unclassified.map((item) => `- ${item}`));
  }
  lines.push("");
  return lines;
}

export function formatCoachReportText(
  report: CoachReport,
  options: {
    bodyHeadingOverride?: string;
  } = {}
) {
  const body = report.body;
  const waistToHeight = report.waistToHeight;
  const summary = report.summary;
  const hydration = report.hydration;
  const trainingSignals = report.trainingSignals;
  const readinessNotes = report.readinessNotes;
  const dataGaps = report.dataGaps;
  const performance = report.performance;
  const weeklyVolume = report.weeklyVolume;
  const goals = report.goals;
  const learnings = report.learnings;
  const cardio = report.cardio;
  const exportOnly = report.exportOnly;
  const bodyHeading = options.bodyHeadingOverride ?? body?.heading ?? "Body Values";

  const lines = [
    "IronForge Coach Export",
    report.generatedAt ? `Generated: ${report.generatedAt}` : "Generated: Unknown",
    "",
    "Coach Snapshot",
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
          ...(body.confidenceRows.length ? ["", "Body Confidence", ...body.confidenceRows.map((line) => line.text)] : []),
          "",
        ]
      : []),
    ...(waistToHeight ? [...renderSection(waistToHeight)] : []),
    ...(summary ? [...renderSection(summary)] : []),
    ...(hydration ? [...renderSection(hydration)] : []),
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
    ...(weeklyVolume ? [...renderWeeklyVolume(weeklyVolume)] : []),
    ...(trainingSignals ? [...renderSection(trainingSignals)] : []),
    ...(readinessNotes ? [...renderSection(readinessNotes)] : []),
    ...(dataGaps ? [...renderSection(dataGaps)] : []),
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
          ...(learnings.whatsWorking.length ? learnings.whatsWorking.map((item) => `- ${item}`) : ["- No validated learnings yet."]),
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
    ...(exportOnly
      ? [
          ...renderSection(exportOnly.leanPreservation),
          ...renderSection(exportOnly.visceralFat),
          ...renderSection(exportOnly.phaseQuality),
          ...renderSection(exportOnly.strengthSignalDetails),
          ...renderSection(exportOnly.currentMovementFocus),
          ...renderSection(exportOnly.nextWorkoutFocus),
          ...renderSection(exportOnly.recentPatterns),
        ]
      : []),
  ];

  return lines.join("\n");
}
