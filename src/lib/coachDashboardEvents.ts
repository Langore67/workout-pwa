export const COACH_DASHBOARD_REFRESH_EVENT = "ironforge:coach-dashboard-refresh";

export type CoachDashboardRefreshReason =
  | "body:add"
  | "body:update"
  | "body:delete"
  | "body:height"
  | "session:add"
  | "session:update"
  | "session:delete"
  | "workout:add"
  | "workout:update"
  | "workout:delete";

export function dispatchCoachDashboardRefresh(reason?: CoachDashboardRefreshReason | string) {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent(COACH_DASHBOARD_REFRESH_EVENT, {
      detail: reason ? { reason } : undefined,
    })
  );
}
