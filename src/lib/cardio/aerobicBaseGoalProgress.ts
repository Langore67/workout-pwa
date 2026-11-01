import type { AerobicBaseContext, AerobicBaseWindow } from "./aerobicBaseContext";
import type { AerobicBaseGoal } from "./aerobicBaseGoal";

export type AerobicBaseGoalProgressWindow = {
  documentedMinutes: number;
  targetMinutes: number;
  contributingSessions: number;
  missingUsableZoneEvidenceSessions: number;
};

export type AerobicBaseGoalProgress = {
  targetMinutes: number;
  currentWeek: AerobicBaseGoalProgressWindow & {
    remainingDocumentedMinutes: number;
    documentedAboveTargetMinutes?: number;
    status: "in_progress";
  };
  previousCompleteWeek: AerobicBaseGoalProgressWindow & {
    differenceMinutes: number;
    status: "complete";
  };
};

function documentedMinutes(window: AerobicBaseWindow) {
  return Math.round(window.totalAerobicBaseSeconds / 60);
}

export function buildAerobicBaseGoalProgress(
  goal: AerobicBaseGoal | undefined,
  context: AerobicBaseContext
): AerobicBaseGoalProgress | undefined {
  if (!goal) return undefined;
  const targetMinutes = goal.weeklyTargetMinutes;
  const currentMinutes = documentedMinutes(context.currentWeekToDate);
  const previousMinutes = documentedMinutes(context.previousCompleteWeek);
  const common = (window: AerobicBaseWindow, minutes: number): AerobicBaseGoalProgressWindow => ({
    documentedMinutes: minutes,
    targetMinutes,
    contributingSessions: window.contributingSessions,
    missingUsableZoneEvidenceSessions: window.cardioSessionsWithoutUsableZoneEvidence,
  });
  const above = Math.max(currentMinutes - targetMinutes, 0);
  return {
    targetMinutes,
    currentWeek: {
      ...common(context.currentWeekToDate, currentMinutes),
      remainingDocumentedMinutes: Math.max(targetMinutes - currentMinutes, 0),
      ...(above > 0 ? { documentedAboveTargetMinutes: above } : {}),
      status: "in_progress",
    },
    previousCompleteWeek: {
      ...common(context.previousCompleteWeek, previousMinutes),
      differenceMinutes: previousMinutes - targetMinutes,
      status: "complete",
    },
  };
}
