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
    lines.push("", "Antagonistic Balance");
    for (const row of volume.balanceRows) {
      lines.push(`- ${row.label}: ${row.statusLabel}`);
      lines.push(`  - Summary: ${row.summary}`);
      lines.push(`  - Current: ${row.currentText}`);
      lines.push(`  - What it means: ${row.explanation}`);
      lines.push(`  - What to change: ${row.action}`);
      if (row.ratioText) lines.push(`  - ${row.ratioText}`);
    }
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

function renderMovementCoverage(coverage: NonNullable<CoachReport["exportOnly"]>["movementCoverage"]) {
  if (!coverage) return [] as string[];

  const lines: string[] = [coverage.title];
  if (coverage.status) lines.push(`- Status: ${coverage.status}`);
  if (coverage.summary) lines.push(`- Summary: ${coverage.summary}`);
  for (const row of coverage.rows) {
    lines.push(`- ${row.label}: ${row.statusLabel}`);
    lines.push(`  - Current: ${row.current ?? "None"}`);
    if (row.anchor) lines.push(`  - Historical Anchor: ${row.anchor}`);
    if (row.volume) lines.push(`  - Recent Work: ${row.volume}`);
    lines.push(`  - Read: ${row.read}`);
  }
  lines.push("");
  return lines;
}

function renderMovementIntelligence(intelligence: NonNullable<CoachReport["exportOnly"]>["movementIntelligence"]) {
  if (!intelligence?.entries?.length) return [] as string[];

  const lines: string[] = [intelligence.title];
  if (intelligence.status) lines.push(`- Status: ${intelligence.status}`);
  if (intelligence.summary) lines.push(`- Summary: ${intelligence.summary}`);
  for (const entry of intelligence.entries) {
    lines.push("", entry.label);
    lines.push(`- Coverage: ${entry.coverageStatus}`);
    lines.push(`- Movement Family Status: ${entry.movementFamilyStatus}`);
    if (entry.anchorExerciseStatus) lines.push(`- Anchor Exercise Status: ${entry.anchorExerciseStatus}`);
    if (entry.latestSameExercise && entry.latestSameExercise === entry.latestFamilyMovement) {
      lines.push(`- Latest Exercise / Family Movement: ${entry.latestSameExercise}`);
    } else {
      lines.push(`- Latest ${entry.label} Movement: ${entry.latestFamilyMovement ?? "None"}`);
    }
    if (entry.latestSameExercise && entry.latestSameExercise !== entry.latestFamilyMovement) {
      lines.push(`- Latest Same Exercise: ${entry.latestSameExercise}`);
    }
    lines.push(`- Benchmark Status: ${entry.benchmark?.status ?? "None"}`);
    lines.push(`- Performance Benchmark: ${entry.benchmark?.performanceText ?? "None"}`);
    if (entry.recentWork) lines.push(`- Recent Work: ${entry.recentWork}`);
    lines.push(`- Read: ${entry.read}`);
    if (entry.context) lines.push(`- Context: ${entry.context}`);
  }
  lines.push("");
  return lines;
}

function formatPriorityLabel(priority: string) {
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function renderExplanation(explanation: CoachReport["snapshot"]["explanation"]) {
  if (!explanation) return [] as string[];
  const lines = explanation.why.length
    ? ["Why This Status", ...explanation.why.map((item) => `- ${item}`)]
    : [];
  if (explanation.whatChanged.length) {
    lines.push("", "What Changed", ...explanation.whatChanged.map((item) => `- ${item}`));
  }
  if (explanation.evidence.length) {
    lines.push("", "Evidence Quality");
    for (const item of explanation.evidence) {
      const quality = [
        item.freshness ? titleCase(item.freshness) : undefined,
        item.confidence ? `${titleCase(item.confidence)} confidence` : undefined,
      ].filter(Boolean).join(" · ");
      lines.push(`- ${item.label}: ${[item.value, quality].filter(Boolean).join(" · ")}`);
    }
  }
  return [...lines, ""];
}

function renderProgrammingIntelligence(programming: CoachReport["programming"]) {
  if (!programming) return [] as string[];

  const lines: string[] = [
    "Programming Intelligence",
    `- Status: ${programming.overallStatus}`,
    `- Summary: ${programming.summary}`,
  ];
  programming.priorities.forEach((priority, index) => {
    lines.push("", `${index + 1}. ${priority.title}`);
    lines.push(`- Priority: ${formatPriorityLabel(priority.priority)}`);
    lines.push(`- Why: ${priority.reason}`);
    if (priority.evidence.length) {
      lines.push("- Evidence", ...priority.evidence.map((item) => `  - ${item}`));
    }
    if (priority.recentAction) {
      lines.push(
        `- Recent Action: ${
          priority.recentAction.status === "completed_latest_session" ? "Completed in latest session" : "Not completed"
        }`
      );
      if (priority.recentAction.completedAt) lines.push(`- Completed At: ${priority.recentAction.completedAt}`);
      if (priority.recentAction.evidence.length) {
        lines.push("- Recent Action Evidence", ...priority.recentAction.evidence.map((item) => `  - ${item}`));
      }
    }
    lines.push(`- Coach Action: ${priority.coachAction}`);
  });
  lines.push("");
  return lines;
}

function renderProgrammingContext(context: CoachReport["programmingContext"]) {
  if (!context) return [] as string[];
  const number = (value: number) => Number(value.toFixed(3)).toString();
  const lines = ["Programming Context", "", "Strength"];
  if (typeof context.strength.strengthSignal === "number") {
    const delta = typeof context.strength.strengthSignalDelta14d === "number"
      ? ` | 14d ${context.strength.strengthSignalDelta14d >= 0 ? "+" : ""}${context.strength.strengthSignalDelta14d.toFixed(2)}`
      : "";
    lines.push(`- Strength Signal: ${context.strength.strengthSignal.toFixed(2)}${delta}`);
  }
  if (context.strength.performanceTrend) lines.push(`- Performance Trend: ${context.strength.performanceTrend}`);
  for (const anchor of context.strength.anchors) {
    lines.push(`- ${anchor.exerciseName ?? anchor.pattern}: ${anchor.benchmark ?? "Benchmark unavailable"} | ${anchor.freshness}${anchor.ageDays != null ? ` | ${anchor.ageDays}d old` : ""}`);
  }

  if (context.coverage.movementPatterns.length) {
    lines.push("", `Movement Coverage (${context.coverage.windowDays}d)`);
    for (const pattern of context.coverage.movementPatterns) {
      lines.push(`- ${pattern.label}: ${pattern.status} | ${pattern.effectiveSets} effective sets | ${pattern.controlExposures} control exposures | ${pattern.sessions} sessions`);
    }
  }

  lines.push("", "Consistency");
  lines.push(`- Strength sessions, last 7d: ${context.consistency.strengthSessions7d}`);
  lines.push(`- Strength sessions, last 14d: ${context.consistency.strengthSessions14d}`);
  if (context.consistency.daysSinceLastStrengthSession != null) lines.push(`- Days since last strength session: ${context.consistency.daysSinceLastStrengthSession}`);

  if (context.goals.targets.length || context.goals.trajectory) {
    lines.push("", "Goals");
    if (context.goals.trajectory) lines.push(`- Trajectory: ${context.goals.trajectory}`);
    for (const target of context.goals.targets) lines.push(`- ${target.label}: ${number(target.current)}${target.unit ? ` ${target.unit}` : ""} current | ${number(target.target)}${target.unit ? ` ${target.unit}` : ""} target`);
  }
  if (context.constraints.length) lines.push("", "Constraints / Data Quality", ...context.constraints.map((item) => `- ${item}`));

  if (context.cardio) {
    const cardio = context.cardio;
    lines.push("", "Cardio Context");
    lines.push(`- Last 7d: ${cardio.activities7d} activities | ${Math.round(cardio.duration7dSeconds / 60)} min${cardio.distance7dMeters > 0 ? ` | ${(cardio.distance7dMeters / 1609.344).toFixed(1)} mi` : ""}`);
    lines.push(`- Last 28d: ${cardio.activities28d} activities`);
    if (cardio.activityTypes.length) lines.push(`- Activity types: ${cardio.activityTypes.join(", ")}`);
    if (cardio.intents.length) lines.push(`- Intents: ${cardio.intents.join(", ")}`);
    if (cardio.formats.length) lines.push(`- Formats: ${cardio.formats.join(", ")}`);
  }
  lines.push("");
  return lines;
}

function renderCoachingActions(actions: CoachReport["coachingActions"]) {
  if (!actions) return [] as string[];

  const lines: string[] = [
    "Coaching Actions",
    `- Status: ${actions.status}`,
    `- Summary: ${actions.summary}`,
  ];
  actions.actions.forEach((action, index) => {
    lines.push("", `Action ${index + 1}: ${action.title}`);
    lines.push(`- Objective: ${action.objective}`);
    lines.push(`- Reason: ${action.reason}`);
    lines.push(`- Expected Benefit: ${action.expectedBenefit}`);
    if (action.constraints.length) {
      lines.push("- Constraints", ...action.constraints.map((constraint) => `  - ${constraint}`));
    }
    lines.push(`- Confidence: ${action.confidence}`);
  });
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
    ...renderExplanation(report.snapshot.explanation),
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
          ...(performance.anchor
            ? [
                `- Performance Anchor: ${performance.anchor.familyLabel ?? performance.anchor.label}`,
                ...(performance.anchor.movementStatusLabel ? [`- Anchor Exercise Status: ${performance.anchor.movementStatusLabel}`] : []),
                ...(performance.anchor.latestSameExerciseText ? [`- Latest Same Exercise: ${performance.anchor.latestSameExerciseText}`] : []),
                ...(performance.anchor.latestFamilyMovementText && performance.anchor.latestFamilyMovementText !== performance.anchor.latestSameExerciseText
                  ? [`- Current Family Movement: ${performance.anchor.latestFamilyMovementText}`]
                  : []),
                ...(performance.anchor.benchmarkStatusLabel ? [`- Benchmark Status: ${performance.anchor.benchmarkStatusLabel}`] : []),
                `- Performance Benchmark: ${performance.anchor.performanceBenchmarkText ?? performance.anchor.text}`,
                ...(performance.anchor.relationshipText ? [`- Relationship: ${performance.anchor.relationshipText}`] : []),
                ...(performance.anchor.read ? [`- Read: ${performance.anchor.read}`] : []),
              ]
            : []),
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
    ...renderProgrammingContext(report.programmingContext),
    ...renderProgrammingIntelligence(report.programming),
    ...renderCoachingActions(report.coachingActions),
    ...(exportOnly
      ? [
          ...renderSection(exportOnly.leanPreservation),
          ...renderSection(exportOnly.visceralFat),
          ...renderSection(exportOnly.phaseQuality),
          ...renderSection(exportOnly.strengthSignalDetails),
          ...renderMovementIntelligence(exportOnly.movementIntelligence),
          ...(exportOnly.movementIntelligence?.entries?.length ? [] : renderMovementCoverage(exportOnly.movementCoverage)),
          ...(exportOnly.movementIntelligence?.entries?.length ? [] : renderSection(exportOnly.currentMovementFocus)),
          ...renderSection(exportOnly.nextWorkoutFocus),
          ...renderSection(exportOnly.recentPatterns),
        ]
      : []),
  ];

  return lines.join("\n");
}
