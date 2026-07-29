import type { CoachReport } from "../coachReport/coachReportTypes";
import type { CoachDashboardLine, CoachDashboardModel } from "./coachDashboardTypes";

const DASH = "—";

function readonlyLines(lines?: readonly CoachDashboardLine[] | null): readonly CoachDashboardLine[] {
  return Object.freeze((lines ?? []).map((line) => Object.freeze({ label: line.label, value: line.value })));
}

function readonlyStrings(values?: readonly string[] | null): readonly string[] {
  return Object.freeze([...(values ?? [])]);
}

function firstThree<T>(values?: readonly T[] | null): readonly T[] {
  return Object.freeze([...(values ?? [])].slice(0, 3));
}

/**
 * Coach Dashboard data flow:
 * buildCoachExportMetrics() gathers persisted workout/body/cardio/goal data.
 * buildCoachStateFromExportMetrics() turns those metrics into the domain-level CoachState.
 * buildCoachReport() applies coach-report formatting and coaching reads.
 * buildCoachDashboardModel() is the final read-only UI model consumed by StartPage's
 * existing Coach Dashboard cards. It performs presentation mapping and fallbacks only.
 */
export function buildCoachDashboardModel(report?: CoachReport | null): CoachDashboardModel {
  const bodyValues = readonlyLines((report?.body?.values ?? []).filter((line) => line.label !== "Fat Mass"));
  const performanceAnchor = report?.performance?.anchor;
  const cardio = report?.cardio;
  const primaryFocus = report?.coachingActions?.actions[0]
    ? Object.freeze({
        objective: report.coachingActions.actions[0].objective,
        reason: report.coachingActions.actions[0].reason,
      })
    : undefined;

  return Object.freeze({
    snapshot: Object.freeze({
      status: report?.snapshot?.status ?? DASH,
      confidence: report?.snapshot?.confidence ?? DASH,
      why: report?.snapshot?.why ?? DASH,
      today: report?.snapshot?.today ?? DASH,
      programmingPriorities: firstThree(report?.programming?.priorities),
    }),
    body: Object.freeze({
      heading: report?.body?.heading ?? "Body Values",
      values: bodyValues,
      note: report?.body?.note,
      confidenceRows: readonlyLines(report?.body?.confidenceRows),
      confidenceNote: "Confidence reflects how much recent data is available, not whether the number is high or low.",
    }),
    performance: Object.freeze({
      trend: report?.performance?.trend ?? DASH,
      anchorFamilyLabel: performanceAnchor?.familyLabel,
      anchorMovementStatusLabel: performanceAnchor?.movementStatusLabel,
      benchmarkStatusLabel: performanceAnchor?.benchmarkStatusLabel,
      anchorText: performanceAnchor ? performanceAnchor.performanceBenchmarkText ?? performanceAnchor.text : undefined,
      latestSameExerciseText: performanceAnchor?.latestSameExerciseText,
      latestFamilyMovementText: performanceAnchor?.latestFamilyMovementText,
      relationshipText: performanceAnchor?.relationshipText,
      strengthSignal: report?.performance?.strengthSignal,
      movementQuality: report?.performance?.movementQuality ?? DASH,
      read: report?.performance?.read,
    }),
    weeklyVolume: Object.freeze({
      note: report?.weeklyVolume?.note,
      rows: readonlyLines(report?.weeklyVolume?.rows),
      balanceRows: Object.freeze([...(report?.weeklyVolume?.balanceRows ?? [])]),
    }),
    goals: Object.freeze({
      trajectory: report?.goals?.trajectory ?? DASH,
      read: report?.goals?.read,
      targets: readonlyLines(firstThree(report?.goals?.targets)),
    }),
    learnings: Object.freeze({
      whatsWorking: readonlyStrings(report?.learnings?.whatsWorking),
      whatsWorkingEmptyText: "No validated learnings yet.",
      watchNow: readonlyStrings(report?.learnings?.watchNow),
      watchNowEmptyText: "No active watch items.",
    }),
    cardio: Object.freeze({
      isEmpty: Boolean(cardio?.isEmpty),
      emptyText: cardio?.note ?? "Cardio summary not available yet.",
      status: cardio?.status,
      rows: readonlyLines(cardio?.rows),
      note: cardio?.note,
    }),
    actions: primaryFocus ? Object.freeze({ primaryFocus }) : undefined,
  });
}
