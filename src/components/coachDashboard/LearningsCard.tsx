import React from "react";
import type { CoachDashboardLearnings } from "../../lib/coachDashboard/coachDashboardTypes";
import { CoachCardHeader } from "./shared/CoachCardHeader";

export function LearningsCard({ learnings }: { learnings: CoachDashboardLearnings }) {
  return (
    <div className="card" data-testid="coach-dashboard-learnings">
      <CoachCardHeader title="Learnings" />
      <div style={{ display: "grid", gap: 10, fontSize: 13 }}>
        <div>
          <div className="muted" style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            What&apos;s Working
          </div>
          <div style={{ marginTop: 6, display: "grid", gap: 4 }}>
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
          <div style={{ marginTop: 6, display: "grid", gap: 4 }}>
            {learnings.watchNow.length ? (
              learnings.watchNow.map((item) => <div key={item}>- {item}</div>)
            ) : (
              <div className="muted">{learnings.watchNowEmptyText}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
