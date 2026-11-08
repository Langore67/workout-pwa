import type { CoachReport, CoachReportSection } from "./coachReportTypes";
import { getTrainingRoleLabel, type TrainingRole } from "../../domain/trainingRole";
import { getCardioActivityTypeLabel } from "../cardio/cardioActivityType";
import { getCardioIntentLabel } from "../cardio/cardioIntent";
import { getCardioFormatLabel } from "../cardio/cardioFormat";
import type { CardioProgressionContext, CardioProgressionObservation } from "../cardio/cardioProgressionContext";
import type {
  ExerciseProgressionContext,
  ExerciseProgressionObservation,
} from "../../domain/progression/exerciseProgressionContext";
import type { StrengthGoalProgressContext } from "../../domain/goals/strengthGoalProgress";
import type { IntendedWeeklyScheduleContext } from "../../domain/schedule/weeklyTrainingSchedule";
import type { TrainingExposureContext, TrainingExposureWindow } from "../../domain/training/trainingExposureContext";
import type { AerobicBaseContext, AerobicBaseWindow } from "../cardio/aerobicBaseContext";
import type { AerobicBaseGoalProgress } from "../cardio/aerobicBaseGoalProgress";

function renderAerobicBaseGoalProgress(progress?: AerobicBaseGoalProgress) {
  if (!progress) return [];
  const difference = progress.previousCompleteWeek.differenceMinutes;
  return [
    "Aerobic Base Goal Progress",
    `- Weekly target: ${progress.targetMinutes} min`,
    "Current week-to-date â€” partial period",
    `- Documented: ${progress.currentWeek.documentedMinutes} / ${progress.targetMinutes} min`,
    `- Remaining documented amount: ${progress.currentWeek.remainingDocumentedMinutes} min`,
    `- Missing usable zone evidence: ${progress.currentWeek.missingUsableZoneEvidenceSessions} cardio sessions`,
    "Previous complete week â€” complete period",
    `- Documented: ${progress.previousCompleteWeek.documentedMinutes} / ${progress.targetMinutes} min`,
    `- Difference from target: ${difference >= 0 ? "+" : ""}${difference} min`,
    `- Missing usable zone evidence: ${progress.previousCompleteWeek.missingUsableZoneEvidenceSessions} cardio sessions`,
    "",
  ];
}

function formatAerobicBaseWindow(window: AerobicBaseWindow, title: string) {
  return [
    `${title} — ${window.status === "in_progress" ? "partial period" : window.status === "complete" ? "complete period" : "rolling period"}`,
    `- Documented aerobic-base proxy exposure: ${Math.round(window.totalAerobicBaseSeconds / 60)} min`,
    `- Contributing sessions: ${window.contributingSessions}`,
    `- Dedicated cardio sessions: ${window.totalCardioSessions}`,
    `- Cardio sessions missing usable zone evidence: ${window.cardioSessionsWithoutUsableZoneEvidence}`,
    ...(window.limitations.length ? [`- Limitations: ${window.limitations.join(" ")}`] : []),
  ];
}

function renderAerobicBaseContext(context?: AerobicBaseContext) {
  if (!context) return [] as string[];
  return [
    "Aerobic Base Exposure",
    ...formatAerobicBaseWindow(context.currentWeekToDate, "Current week-to-date"),
    "",
    ...formatAerobicBaseWindow(context.previousCompleteWeek, "Previous complete week"),
    "",
    ...formatAerobicBaseWindow(context.rolling14Days, "Rolling 14 days"),
    "",
    "Method",
    "- MapMyWalk/MapMyFitness Zone 3 proxy; this is documented exposure, not a physiological zone classification.",
    "",
  ];
}

function formatLocalDateKey(value: string, options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, options);
}

function formatExposureWindow(window: TrainingExposureWindow, title: string) {
  const period = window.isCompleteCalendarPeriod ? "complete period" : window.kind === "week_to_date" ? "partial period" : "rolling period";
  const lines = [`${title} — ${period}`, `- Completed strength sessions: ${window.completedStrengthSessions}`];
  for (const movement of window.movementPatterns) {
    const facts = [`${movement.qualifyingSets} qualifying sets`];
    if (movement.workingSets) facts.push(`${movement.workingSets} working`);
    if (movement.dropSets) facts.push(`${movement.dropSets} drop`);
    if (movement.failureSets) facts.push(`${movement.failureSets} failure`);
    if (movement.controlExposures) facts.push(`${movement.controlExposures} control exposures`);
    facts.push(`${movement.sessionCount} sessions`, `${movement.distinctCanonicalExerciseCount} exercises`);
    if (movement.latestExposureAt) facts.push(`latest ${new Date(movement.latestExposureAt).toLocaleString()}`);
    lines.push(`- ${movement.movementPattern}: ${facts.join(" | ")}`);
  }
  if (window.unclassifiedSetCount) {
    const exerciseCount = window.unclassifiedExerciseCount ?? 0;
    lines.push(`- Unclassified: ${window.unclassifiedSetCount} relevant sets | ${exerciseCount} exercise${exerciseCount === 1 ? "" : "s"}`);
  }
  const otherLimitations = window.limitations.filter((limitation) =>
    !/^Movement pattern is unavailable for /i.test(limitation)
    && !/qualifying sets? could not be classified to a movement pattern/i.test(limitation)
  );
  if (otherLimitations.length) lines.push(`- Limitations: ${otherLimitations.join(" ")}`);
  return lines;
}

function renderEvidenceCompleteness(report: CoachReport) {
  const programming = report.programmingContext;
  const exposure = report.trainingExposure ?? programming?.trainingExposure;
  const aerobicBase = report.aerobicBase ?? programming?.aerobicBase;
  const cardioProgression = programming?.cardio?.progression;
  const lines: string[] = ["Evidence Completeness"];
  let included = false;
  const add = (line: string) => { lines.push(`- ${line}`); included = true; };

  const goals = programming?.strengthGoalProgress;
  const anchors = programming?.strength.anchors ?? [];
  if (goals?.length) {
    add(`Strength benchmarks: ${goals.filter((goal) => goal.freshness === "fresh").length} of ${goals.length} key goals have fresh comparable evidence`);
  } else if (anchors.length) {
    add(`Strength benchmarks: ${anchors.filter((anchor) => anchor.freshness === "fresh").length} of ${anchors.length} anchors have fresh evidence`);
  }

  const progression = programming?.exerciseProgression;
  if (progression?.length) {
    add(`Exercise progression: ${progression.filter((exercise) => exercise.observationCount >= 2).length} of ${progression.length} tracked exercises have at least 2 comparable recent observations`);
  }

  const currentExposure = exposure?.windows.currentWeekToDate;
  if (currentExposure) {
    const classified = currentExposure.movementPatterns.reduce((sum, row) => sum + row.qualifyingSets, 0);
    const unclassified = currentExposure.unclassifiedSetCount ?? 0;
    const relevant = classified + unclassified;
    if (relevant > 0) add(`Movement classification: ${classified} of ${relevant} relevant sets classified`);

    const roleRows = currentExposure.trainingRoles;
    const roleTotal = roleRows.reduce((sum, row) => sum + row.qualifyingSets, 0);
    const assigned = roleRows.filter((row) => row.trainingRole !== "untagged").reduce((sum, row) => sum + row.qualifyingSets, 0);
    if (assigned > 0) add(`Training roles: ${assigned} of ${roleTotal} relevant sets assigned`);
    else if (roleTotal > 0) add("Training roles: not configured");
  }

  const aerobicWindow = aerobicBase?.currentWeekToDate;
  if (aerobicWindow?.totalCardioSessions) {
    add(`Cardio zone evidence (current week-to-date): ${aerobicWindow.contributingSessions} of ${aerobicWindow.totalCardioSessions} dedicated cardio sessions have usable MapMyWalk zone evidence`);
  }

  if (cardioProgression?.groups.length) {
    const comparableObservations = cardioProgression.groups
      .filter((group) => group.comparability !== "route_unknown")
      .reduce((sum, group) => sum + group.observationCount, 0);
    if (comparableObservations > 0) add(`Cardio comparability: ${comparableObservations} recent observations have known route/type/intent/format context`);
  }

  const overallBodyConfidence = report.body?.confidenceRows.find((row) => row.label.toLowerCase() === "overall confidence");
  if (overallBodyConfidence) add(`Body composition: ${overallBodyConfidence.value}`);

  return included ? [...lines, ""] : [];
}

function compactCardioLimitations(group: CardioProgressionContext["groups"][number]) {
  const limitations = group.limitations;
  const points = group.recentObservations;
  const compact: string[] = [];
  const missingHr = points.filter((point) => point.avgHrBpm == null).length;
  if (limitations.some((item) => /average hr is unavailable/i.test(item)) && missingHr) compact.push(`HR missing in ${missingHr} observation${missingHr === 1 ? "" : "s"}`);
  const missingElevation = points.filter((point) => point.elevationGain == null && !point.elevationText).length;
  if (limitations.some((item) => /structured elevation is unavailable/i.test(item)) && missingElevation) compact.push(`elevation missing in ${missingElevation} observation${missingElevation === 1 ? "" : "s"}`);
  const legacyCount = points.filter((point) => Object.values(point.provenance ?? {}).includes("legacy_notes")).length;
  if (limitations.some((item) => /legacy note-derived/i.test(item))) compact.push(`legacy note-derived data in ${legacyCount} observation${legacyCount === 1 ? "" : "s"}`);
  if (limitations.some((item) => /mixed provenance/i.test(item))) compact.push("mixed provenance");
  if (limitations.some((item) => /elevation differs/i.test(item))) compact.push("elevation differs between latest observations");
  const recognized = /route identity is unavailable|only one comparable observation|average hr is unavailable|structured elevation is unavailable|legacy note-derived|mixed provenance|elevation differs/i;
  for (const item of limitations) if (!recognized.test(item)) compact.push(item);
  return [...new Set(compact)];
}

function renderTrainingExposure(context?: TrainingExposureContext) {
  if (!context) return [] as string[];
  const calendar = context.calendar;
  const schedule = calendar.schedule;
  const lines = [
    "Training Calendar",
    `- Today: ${calendar.dayName}, ${formatLocalDateKey(calendar.localDate, { month: "short", day: "numeric", year: "numeric" })}`,
    `- Current week: ${formatLocalDateKey(calendar.weekStartLocalDate)}–${formatLocalDateKey(calendar.weekEndLocalDate)}`,
    "- Current-week status: in progress",
    `- Calendar days started: ${calendar.calendarDaysStarted} of 7`,
    `- Calendar days remaining: ${calendar.calendarDaysRemaining}`,
    `- Completed strength sessions: ${calendar.completedStrengthSessionsWeekToDate}`,
    `- Completed dedicated cardio sessions: ${calendar.completedDedicatedCardioSessionsWeekToDate}`,
    `- Schedule status: ${schedule.status}`,
  ];
  if (schedule.plannedTrainingDays != null) lines.push(`- Planned training days: ${schedule.plannedTrainingDays}`);
  if (schedule.plannedTrainingDaysStarted != null) lines.push(`- Planned training days started: ${schedule.plannedTrainingDaysStarted}`);
  if (schedule.plannedTrainingDaysRemaining != null) lines.push(`- Planned training days remaining: ${schedule.plannedTrainingDaysRemaining}`);
  if (schedule.todayAssignment) lines.push(`- Today's assignment: ${schedule.todayAssignment}`);
  if (schedule.todaySessionName) lines.push(`- Today's session: ${schedule.todaySessionName}`);
  if (schedule.todayFocus) lines.push(`- Today's focus: ${schedule.todayFocus}`);
  lines.push(
    "",
    "Training Exposure",
    ...formatExposureWindow(context.windows.currentWeekToDate, "Current week-to-date"),
    "",
    ...formatExposureWindow(context.windows.previousCompleteWeek, "Previous complete week"),
    "",
    ...formatExposureWindow(context.windows.rolling14Days, "Rolling 14 days")
  );
  const currentWeekRoles = context.windows.currentWeekToDate.trainingRoles;
  const hasTaggedRoleExposure = currentWeekRoles.some((role) => role.trainingRole !== "untagged");
  if (hasTaggedRoleExposure) {
    lines.push("", "Training Roles — current week-to-date");
    for (const role of currentWeekRoles) {
      const label = role.trainingRole === "untagged" ? "Untagged" : getTrainingRoleLabel(role.trainingRole);
      lines.push(`- ${label}: ${role.qualifyingSets} qualifying sets | ${role.controlExposures} control exposures | ${role.sessionCount} sessions | ${role.distinctCanonicalExerciseCount} exercises${role.latestExposureAt ? ` | latest ${new Date(role.latestExposureAt).toLocaleString()}` : ""}`);
    }
  }
  lines.push("");
  return lines;
}

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

function renderExplanation(explanation: CoachReport["snapshot"]["explanation"], suppressBodyConfidence = false) {
  if (!explanation) return [] as string[];
  // Coach Snapshot already supplies the one concise Why line, plus its win,
  // risk, and today fields. Re-rendering explanation.why repeats those values.
  const lines: string[] = [];
  if (explanation.whatChanged.length) {
    lines.push("", "What Changed", ...explanation.whatChanged.map((item) => `- ${item}`));
  }
  const evidence = explanation.evidence.filter((item) =>
    item.label.trim().toLowerCase() !== "goal trajectory"
    && !(suppressBodyConfidence && item.label.trim().toLowerCase() === "body composition")
  );
  if (evidence.length) {
    lines.push("", "Evidence Quality");
    for (const item of evidence) {
      const quality = [
        item.freshness ? titleCase(item.freshness) : undefined,
        item.confidence ? `${titleCase(item.confidence)} confidence` : undefined,
      ].filter(Boolean).join(" · ");
      lines.push(`- ${item.label}: ${[item.value, quality].filter(Boolean).join(" · ")}`);
    }
  }
  return [...lines, ""];
}

function renderProgrammingIntelligence(programming: CoachReport["programming"], suppressLegacyCoverage = false) {
  if (!programming) return [] as string[];
  const priorities = suppressLegacyCoverage
    ? programming.priorities.filter((item) => item.category !== "movement" && item.category !== "volume")
    : programming.priorities;
  if (!priorities.length && suppressLegacyCoverage) return [] as string[];

  const lines: string[] = [
    "Programming Intelligence",
  ];
  priorities.forEach((priority, index) => {
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
  for (const anchor of context.strength.anchors) {
    lines.push(`- ${anchor.exerciseName ?? anchor.pattern}: ${anchor.benchmark ?? "Benchmark unavailable"} | ${anchor.freshness}${anchor.ageDays != null ? ` | ${anchor.ageDays}d old` : ""}`);
  }

  lines.push(...formatRecentExerciseProgressionForCoach(context.exerciseProgression));
  lines.push(...formatStrengthGoalProgressForCoach(context.strengthGoalProgress));
  lines.push(...formatIntendedWeeklyScheduleForCoach(context.intendedWeeklySchedule));

  if (!context.trainingExposure && context.coverage.movementPatterns.length) {
    lines.push("", `Movement Coverage (${context.coverage.windowDays}d)`);
    for (const pattern of context.coverage.movementPatterns) {
      lines.push(`- ${pattern.label}: ${pattern.status} | ${pattern.effectiveSets} effective sets | ${pattern.controlExposures} control exposures | ${pattern.sessions} sessions`);
      const breakdown = Object.entries(pattern.roleBreakdown)
        .filter(([, count]) => typeof count === "number" && count > 0)
        .map(([role, count]) => `${role === "untagged" ? "Untagged" : getTrainingRoleLabel(role as TrainingRole)} ${count}`);
      if (breakdown.length) lines.push(`  - Role breakdown: ${breakdown.join(" | ")}`);
    }
  }

  if (context.trainingRoles.length) {
    lines.push("", "Training Priorities / Roles");
    for (const group of context.trainingRoles) {
      const hidden = group.totalExercises - group.exercises.length;
      lines.push(`- ${getTrainingRoleLabel(group.role)}: ${group.exercises.join(", ")}${hidden > 0 ? ` (+${hidden} more)` : ""}`);
    }
  }

  const consistency = context.strengthConsistency;
  if (consistency) {
    const completed = (value: number) => `${value} completed session${value === 1 ? "" : "s"}`;
    lines.push("", "Strength Session Context");
    lines.push(`- Current week-to-date — partial period: ${completed(consistency.currentWeekToDateSessions)}`);
    lines.push(`- Previous complete week — complete period: ${completed(consistency.previousCompleteWeekSessions)}`);
    lines.push(`- Rolling 14 days — rolling period: ${completed(consistency.rolling14DaySessions)}`);
    if (consistency.latestCompletedStrengthSessionAt != null) {
      lines.push(`- Latest completed strength session: ${new Date(consistency.latestCompletedStrengthSessionAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`);
    }
    if (consistency.daysSinceLastCompletedStrengthSession != null) {
      lines.push(`- Local calendar days since latest session: ${consistency.daysSinceLastCompletedStrengthSession}`);
    }
  }

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
    const progressionGroups = cardio.progression.groups;
    if (progressionGroups.length) {
      lines.push("", "Recent Cardio Progression");
      for (const group of progressionGroups) {
        lines.push(`- ${group.label} / ${getCardioActivityTypeLabel(group.activityType)}${group.intent ? ` / ${getCardioIntentLabel(group.intent)}` : ""} / ${getCardioFormatLabel(group.cardioFormat)}`);
        lines.push(`  - Observations: ${group.observationCount}`);
        lines.push(`  - Comparability: ${group.comparability.replace(/_/g, " ")}`);
        lines.push(`  - Latest: ${formatCardioProgressionPoint(group.recent)}`);
        lines.push(`  - Direction: ${group.direction} (pace seconds per mile)`);
        if (group.paceDifferenceSecondsPerMile != null) lines.push(`  - Pace difference: ${Math.abs(Math.round(group.paceDifferenceSecondsPerMile))} sec/mi ${group.paceDifferenceSecondsPerMile < 0 ? "lower" : group.paceDifferenceSecondsPerMile > 0 ? "higher" : "unchanged"}`);
        if (group.averageHrDifferenceBpm != null) lines.push(`  - Average HR difference: ${Math.abs(group.averageHrDifferenceBpm)} bpm ${group.averageHrDifferenceBpm < 0 ? "lower" : group.averageHrDifferenceBpm > 0 ? "higher" : "unchanged"}`);
        const compactLimitations = compactCardioLimitations(group);
        if (compactLimitations.length) lines.push(`  - Data limitations: ${compactLimitations.join("; ")}`);
        lines.push("  - Recent observations:");
        for (const point of group.recentObservations) lines.push(`    - ${formatCardioProgressionPoint(point)}`);
      }
    }
    const proximity = cardio.strengthProximity?.observations?.slice(0, 5) ?? [];
    if (proximity.length) {
      lines.push("", "Cardio / Strength Proximity");
      for (const observation of proximity) {
        const cardioFields = [
          observation.cardio.activityType,
          observation.cardio.intent,
          observation.cardio.cardioFormat,
          observation.cardio.durationMinutes != null ? `${Math.round(observation.cardio.durationMinutes)} min` : undefined,
          observation.cardio.distanceMiles != null ? `${observation.cardio.distanceMiles.toFixed(1)} mi` : undefined,
          observation.cardio.avgHr != null ? `Avg HR ${Math.round(observation.cardio.avgHr)}` : undefined,
        ].filter(Boolean);
        lines.push(`- ${observation.cardio.dateTime.slice(0, 10)} cardio: ${cardioFields.join(" | ")}`);
        lines.push(`  - ${observation.strength.classification} strength ${Number(observation.gapHours.toFixed(1))}h later`);
        const comparisonLabel = observation.comparison.exerciseName ? `${observation.comparison.exerciseName}: ` : "";
        lines.push(`  - ${comparisonLabel}${observation.strength.performanceSignal ?? "Insufficient comparable strength history"}`);
      }
    }
  }
  lines.push("");
  return lines;
}

export function formatIntendedWeeklyScheduleForCoach(
  schedule?: IntendedWeeklyScheduleContext
) {
  if (!schedule) return [] as string[];
  const lines = ["", schedule.status === "inactive" ? "Intended Weekly Schedule (Inactive)" : "Intended Weekly Schedule"];
  if (schedule.status === "unconfigured") {
    lines.push("- Not configured.");
    return lines;
  }
  for (const entry of schedule.entries) {
    if (entry.dayType === "recovery") lines.push(`- ${entry.dayName}: Recovery`);
    else {
      const focus = entry.focus ? ` — ${entry.focus}` : "";
      const reference = entry.templateStatus === "missing"
        ? ` [linked template unavailable: ${entry.templateId}]`
        : entry.templateStatus === "archived"
          ? ` [linked template archived: ${entry.templateName ?? entry.templateId}]`
          : "";
      lines.push(`- ${entry.dayName}: ${entry.sessionName}${focus}${reference}`);
    }
  }
  return lines;
}

function compactNumber(value: number) {
  return Number(value.toFixed(1)).toString();
}

function formatProgressionObservation(
  observation: ExerciseProgressionObservation,
  context: ExerciseProgressionContext
) {
  const fields = [new Date(observation.observedAt).toISOString().slice(0, 10)];
  if (context.metricMode === "time") {
    if (typeof observation.time === "number") fields.push(`${compactNumber(observation.time)} sec`);
  } else if (context.metricMode === "distance") {
    if (typeof observation.distance === "number") {
      fields.push(`${compactNumber(observation.distance)} ${observation.distanceUnit ?? "m"}`);
    }
  } else {
    const set = observation.bestWorkingSet;
    const load = set?.load ?? observation.load;
    const reps = set?.reps ?? observation.reps;
    if (typeof reps === "number" && set?.isBodyweight && (load == null || load === 0)) fields.push(`BWx${compactNumber(reps)}`);
    else if (typeof load === "number" && typeof reps === "number") fields.push(`${compactNumber(load)}x${compactNumber(reps)}`);
    else if (typeof reps === "number") fields.push(`${compactNumber(reps)} reps`);
    else if (typeof observation.maxReps === "number") fields.push(`max reps ${compactNumber(observation.maxReps)}`);
    if (typeof (set?.rir ?? observation.rir) === "number") fields.push(`RIR ${compactNumber((set?.rir ?? observation.rir) as number)}`);
    if (typeof observation.e1RM === "number") fields.push(`scored e1RM ${compactNumber(observation.e1RM)}`);
    if (typeof observation.volume === "number") fields.push(`volume ${compactNumber(observation.volume)}`);
    if (typeof observation.maxReps === "number" && observation.maxReps !== reps) fields.push(`max reps ${compactNumber(observation.maxReps)}`);
  }
  return fields.join(" | ");
}

export function formatRecentExerciseProgressionForCoach(contexts?: ExerciseProgressionContext[]) {
  if (!contexts?.length) return [] as string[];
  const lines = ["", "Recent Exercise Progression"];
  const limitationOwners = new Map<string, string[]>();
  for (const context of contexts) for (const limitation of context.limitations) {
    limitationOwners.set(limitation, [...(limitationOwners.get(limitation) ?? []), context.exerciseName]);
  }
  const repeatedLimitations = new Set(Array.from(limitationOwners.entries())
    .filter(([, owners]) => owners.length > 1)
    .map(([limitation]) => limitation));
  for (const context of contexts) {
    lines.push(
      `- ${context.exerciseName} [${context.exerciseId}] | ${context.metricMode} | direction ${context.direction} | ${context.observationCount} observation${context.observationCount === 1 ? "" : "s"}${context.latestObservationAt ? ` | latest ${new Date(context.latestObservationAt).toISOString()}` : ""}`
    );
    if (context.bestRecentObservation) {
      lines.push(`  - Best recent: ${formatProgressionObservation(context.bestRecentObservation, context)}`);
    }
    for (const observation of context.recentObservations) {
      lines.push(`  - Observation: ${formatProgressionObservation(observation, context)}`);
    }
    for (const limitation of context.limitations) if (!repeatedLimitations.has(limitation)) lines.push(`  - Limitation: ${limitation}`);
  }
  for (const [limitation, owners] of limitationOwners) {
    if (owners.length > 1) lines.push(`- Shared limitation (${owners.join(", ")}): ${limitation}`);
  }
  return lines;
}

function formatGoalObservation(context: StrengthGoalProgressContext) {
  const observation = context.currentComparableObservation;
  if (!observation) return undefined;
  const fields: string[] = [];
  if (typeof observation.load === "number" && typeof observation.reps === "number") {
    fields.push(`${compactNumber(observation.load)}x${compactNumber(observation.reps)}`);
  } else if (typeof observation.reps === "number") {
    fields.push(`${compactNumber(observation.reps)} reps`);
  }
  if (typeof observation.rir === "number") fields.push(`RIR ${compactNumber(observation.rir)}`);
  if (typeof observation.e1RM === "number") fields.push(`scored e1RM ${compactNumber(observation.e1RM)}`);
  return fields.length ? fields.join(" | ") : undefined;
}

export function formatStrengthGoalProgressForCoach(contexts?: StrengthGoalProgressContext[]) {
  if (!contexts?.length) return [] as string[];
  const lines = ["", "Strength Goal Progress"];
  for (const context of contexts) {
    const unit = context.targetMetric === "load" ? "lb" : "reps";
    lines.push(`- ${context.label ?? context.exerciseName} [${context.exerciseId}]`);
    lines.push(`  - Goal: ${compactNumber(context.targetValue)} ${unit} ${context.targetMetric === "load" ? "performed load" : "reps"}`);
    const current = formatGoalObservation(context);
    if (current) lines.push(`  - Current comparable: ${current}`);
    if (typeof context.currentValue === "number") lines.push(`  - Current ${context.targetMetric === "load" ? "performed load" : "reps"}: ${compactNumber(context.currentValue)} ${unit}`);
    if (typeof context.bestValue === "number") lines.push(`  - Best known ${context.targetMetric === "load" ? "performed load" : "reps"}: ${compactNumber(context.bestValue)} ${unit}`);
    if (typeof context.supportingScoredE1RM === "number") lines.push(`  - Supporting scored e1RM: ${compactNumber(context.supportingScoredE1RM)} lb`);
    if (typeof context.absoluteDistance === "number") lines.push(`  - Distance to goal: ${compactNumber(context.absoluteDistance)} ${unit}`);
    if (typeof context.percentOfGoal === "number") lines.push(`  - Percent of goal: ${compactNumber(context.percentOfGoal)}%`);
    lines.push(`  - Direction: ${context.direction}`);
    lines.push(`  - Observations: ${context.observationCount}`);
    lines.push(`  - Freshness: ${context.freshness}`);
    lines.push(`  - Comparability: ${context.comparability}`);
    for (const limitation of context.limitations) lines.push(`  - Limitation: ${limitation}`);
  }
  return lines;
}

function formatCardioProgressionPoint(point: CardioProgressionObservation) {
  const fields = [point.date];
  if (typeof point.paceSecondsPerMile === "number") {
    const pace = Math.round(point.paceSecondsPerMile);
    fields.push(`${Math.floor(pace / 60)}:${String(pace % 60).padStart(2, "0")}/mi`);
  }
  if (typeof point.avgHrBpm === "number") fields.push(`avg HR ${Math.round(point.avgHrBpm)} bpm`);
  if (typeof point.maxHrBpm === "number") fields.push(`max HR ${Math.round(point.maxHrBpm)} bpm`);
  if (typeof point.durationSeconds === "number") fields.push(`${Math.round(point.durationSeconds / 60)} min`);
  if (typeof point.distance === "number" && point.distanceUnit) fields.push(`${point.distance} ${point.distanceUnit}`);
  else if (typeof point.distanceMeters === "number") fields.push(`${(point.distanceMeters / 1609.344).toFixed(1)} mi`);
  if (typeof point.elevationGain === "number" && point.elevationUnit) fields.push(`elevation ${point.elevationGain} ${point.elevationUnit}`);
  if (point.source) fields.push(`source ${point.source}`);
  return fields.join(" | ");
}

export function formatCoachReportText(
  report: CoachReport,
  options: {
    bodyHeadingOverride?: string;
  } = {}
) {
  const body = report.body;
  const waistToHeight = report.waistToHeight;
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
  const hasFactualTrainingExposure = Boolean(report.trainingExposure ?? report.programmingContext?.trainingExposure);
  const evidenceCompleteness = renderEvidenceCompleteness(report);
  const bodyConfidenceSummarized = evidenceCompleteness.some((line) => line.startsWith("- Body composition:"));
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
    ...renderExplanation(report.snapshot.explanation, bodyConfidenceSummarized),
    ...evidenceCompleteness,
    ...(body
      ? [
          bodyHeading,
          ...(body.values.length ? body.values.map((line) => line.text) : ["- No body trend values available."]),
          ...(body.note ? ["", `- ${body.note}`] : []),
          ...(body.confidenceRows.length ? ["", "Body Confidence", ...body.confidenceRows.filter((line) => !(bodyConfidenceSummarized && line.label.toLowerCase() === "overall confidence")).map((line) => line.text)] : []),
          "",
        ]
      : []),
    ...(waistToHeight ? [...renderSection(waistToHeight)] : []),
    ...(hydration ? [...renderSection(hydration)] : []),
    ...(performance
      ? [
          "Performance",
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
          "",
        ]
      : []),
    ...(!hasFactualTrainingExposure && weeklyVolume ? [...renderWeeklyVolume(weeklyVolume)] : []),
    ...(trainingSignals ? [...renderSection(trainingSignals)] : []),
    ...(readinessNotes ? [...renderSection(readinessNotes)] : []),
    ...(dataGaps ? [...renderSection(dataGaps)] : []),
    ...(goals?.targets.length
      ? [
          "Goal Targets",
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
            ...cardio.rows.map((line) => line.text),
            ...(cardio.note ? [`- Cardio Note: ${cardio.note}`] : []),
            "",
          ]
      : []),
    ...renderTrainingExposure(report.trainingExposure ?? report.programmingContext?.trainingExposure),
    ...renderAerobicBaseContext(report.aerobicBase ?? report.programmingContext?.aerobicBase),
    ...renderAerobicBaseGoalProgress(report.aerobicBaseGoalProgress ?? report.programmingContext?.aerobicBaseGoalProgress),
    ...renderProgrammingContext(report.programmingContext),
    ...renderProgrammingIntelligence(report.programming, hasFactualTrainingExposure),
    ...(exportOnly
      ? [
          ...renderSection(exportOnly.leanPreservation),
          ...renderSection(exportOnly.visceralFat),
          ...renderSection(exportOnly.phaseQuality),
          ...renderSection(exportOnly.strengthSignalDetails),
          ...(!hasFactualTrainingExposure ? renderMovementIntelligence(exportOnly.movementIntelligence) : []),
          ...(!hasFactualTrainingExposure && !exportOnly.movementIntelligence?.entries?.length ? renderMovementCoverage(exportOnly.movementCoverage) : []),
          ...(!hasFactualTrainingExposure && !exportOnly.movementIntelligence?.entries?.length ? renderSection(exportOnly.currentMovementFocus) : []),
          ...renderSection(exportOnly.nextWorkoutFocus),
          ...renderSection(exportOnly.recentPatterns),
        ]
      : []),
  ];

  return lines.join("\n");
}
