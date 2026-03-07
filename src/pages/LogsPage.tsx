import React from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, AppLogEntry } from "../db";

function formatWhen(ts: number): string {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

function prettyDetails(detailsJson?: string): string | undefined {
  if (!detailsJson) return undefined;

  try {
    const parsed = JSON.parse(detailsJson);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return detailsJson;
  }
}

export default function LogsPage() {
  const logs = useLiveQuery(
    async () => await db.appLogs.orderBy("createdAt").reverse().toArray(),
    [],
    [] as AppLogEntry[]
  );

  async function clearLogs() {
    const ok = window.confirm("Clear all app logs?");
    if (!ok) return;

    await db.appLogs.clear();
  }

  return (
    <div className="card" style={{ maxWidth: 980 }}>
      <h2>Logs</h2>
      <p className="muted">
        Rolling app log for import, export, restore, wipe, and system events.
      </p>

      <div className="row" style={{ gap: 10, flexWrap: "wrap", marginTop: 10 }}>
        <button className="btn" onClick={clearLogs}>
          Clear Logs
        </button>
        <div className="muted" style={{ alignSelf: "center" }}>
          Showing newest first. Rolling retention is handled automatically.
        </div>
      </div>

      <hr />

      {!logs || logs.length === 0 ? (
        <div className="muted">No logs yet.</div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {logs.map((log) => (
            <div
              key={log.id}
              className="input"
              style={{ whiteSpace: "pre-wrap", lineHeight: 1.45 }}
            >
              <div style={{ fontWeight: 600 }}>
                [{log.level.toUpperCase()}] {log.type} — {log.message}
              </div>

              <div className="muted" style={{ marginTop: 4 }}>
                {formatWhen(log.createdAt)}
              </div>

              {log.detailsJson && (
                <pre
                  style={{
                    marginTop: 10,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    fontFamily: "inherit",
                  }}
                >
                  {prettyDetails(log.detailsJson)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}