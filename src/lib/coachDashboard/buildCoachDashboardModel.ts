import type { CoachReport } from "../coachReport/coachReportTypes";
import type {
  CoachDashboardLine,
  CoachDashboardModel,
  CoachDashboardProgrammingPriority,
} from "./coachDashboardTypes";

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

function cleanText(value?: string | null) {
  const text = String(value ?? "").trim();
  return text || undefined;
}

function priorityLabel(value: string) {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : "";
}

function categoryLabel(value: string) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "";
  return normalized
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function slug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "priority";
}

function buildProgrammingPriorities(report?: CoachReport | null): readonly CoachDashboardProgrammingPriority[] {
  return Object.freeze(
    (report?.programming?.priorities ?? []).map((priority, index) =>
      Object.freeze({
        id: `${index + 1}-${priority.category}-${priority.priority}-${slug(priority.title)}`,
        title: priority.title,
        category: priority.category,
        categoryLabel: categoryLabel(priority.category),
        priority: priority.priority,
        priorityLabel: priorityLabel(priority.priority),
        rationale: cleanText(priority.reason),
        direction: cleanText(priority.coachAction),
        evidence: readonlyStrings((priority.evidence ?? []).map((item) => cleanText(item)).filter((item): item is string => Boolean(item))),
        ...(priority.recentAction
          ? {
              recentAction: Object.freeze({
                status: priority.recentAction.status,
                statusLabel:
                  priority.recentAction.status === "completed_latest_session"
                    ? "Addressed in latest session"
                    : "Not completed",
                completedAt: priority.recentAction.completedAt,
                evidence: readonlyStrings(
                  (priority.recentAction.evidence ?? []).map((item) => cleanText(item)).filter((item): item is string => Boolean(item))
                ),
              }),
            }
          : {}),
      })
    )
  );
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
  const programmingDetailPriorities = buildProgrammingPriorities(report);
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
    programming: Object.freeze({
      status: cleanText(report?.programming?.overallStatus) ?? null,
      summary: cleanText(report?.programming?.summary) ?? "",
      priorities: firstThree(programmingDetailPriorities),
      detailPriorities: programmingDetailPriorities,
      emptyState: "No programming changes are currently recommended.",
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
