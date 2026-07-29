import React from "react";
import type { CoachDashboardLearnings } from "../../lib/coachDashboard/coachDashboardTypes";
import { CoachCardHeader } from "./shared/CoachCardHeader";
import { CoachDashboardCard } from "./shared/CoachDashboardCard";

export function LearningsCard({ learnings }: { learnings: CoachDashboardLearnings }) {
  return (
    <CoachDashboardCard testId="coach-dashboard-learnings">
      <CoachCardHeader title="Learnings" />
      <div style={{ display: "grid", gap: 12, fontSize: 13 }}>
        <div>
          <div className="muted" style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            What&apos;s Working
          </div>
          <div style={{ marginTop: 7, display: "grid", gap: 5, lineHeight: 1.35 }}>
            {learnings.whatsWorking.length ? (
              learnings.whatsWorking.map((item) => <div key={item}>- {item}</div>)
            ) : (
              <div className="muted">{learnings.whatsWorkingEmptyText}</div>
            )}
          </div>
        </div>
        <div>
          <div className="muted" style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Watch Now
          </div>
          <div style={{ marginTop: 7, display: "grid", gap: 5, lineHeight: 1.35 }}>
            {learnings.watchNow.length ? (
              learnings.watchNow.map((item) => <div key={item}>- {item}</div>)
            ) : (
              <div className="muted">{learnings.watchNowEmptyText}</div>
            )}
          </div>
        </div>
      </div>
    </CoachDashboardCard>
  );
}
