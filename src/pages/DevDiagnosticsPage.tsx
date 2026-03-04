// /src/pages/DevDiagnosticsPage.tsx
/* ============================================================================
   DevDiagnosticsPage.tsx — DEV-only diagnostics
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-03-04-DEV-DIAG-01

   - Route: /dev
   - Optional: /dev?sid=<sessionId>
   - Dev-only: guarded by import.meta.env.DEV (redirects in prod)
   ============================================================================ */

import React, { useEffect, useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import type { Track, SetEntry } from "../db";

type SetKind = "warmup" | "working" | "drop" | "failure";
type SetEntryX = SetEntry & { setType?: SetKind | string; completedAt?: number };

function fmtDate(ts?: number) {
  if (!ts || !Number.isFinite(ts)) return "";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "true");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export default function DevDiagnosticsPage() {
  // Hard guard: never show in production builds.
  if (!import.meta.env.DEV) return <Navigate to="/" replace />;

  const nav = useNavigate();
  const loc = useLocation();

  const qs = useMemo(() => new URLSearchParams(loc.search), [loc.search]);
  const sidFromUrl = qs.get("sid") ?? "";

  const [selectedSessionId, setSelectedSessionId] = useState<string>(sidFromUrl);

  useEffect(() => {
    // keep state synced if user edits URL
    if (sidFromUrl && sidFromUrl !== selectedSessionId) setSelectedSessionId(sidFromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sidFromUrl]);

  // Recent sessions for dropdown
  const sessions = useLiveQuery(async () => {
    const arr = await db.sessions.orderBy("startedAt").reverse().limit(25).toArray();
    return arr ?? [];
  }, []);

  // Pick a sensible default if none provided
  useEffect(() => {
    if (selectedSessionId) return;
    const first = sessions?.[0];
    if (first?.id) {
      setSelectedSessionId(first.id);
      const next = new URLSearchParams(loc.search);
      next.set("sid", first.id);
      nav({ pathname: "/dev", search: next.toString() }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions]);

  const session = useLiveQuery(
    async () => (selectedSessionId ? await db.sessions.get(selectedSessionId) : undefined),
    [selectedSessionId]
  );

  const sets = useLiveQuery(async () => {
    if (!selectedSessionId) return [] as SetEntryX[];
    const arr = await db.sets.where("sessionId").equals(selectedSessionId).sortBy("createdAt");
    return (arr ?? []) as SetEntryX[];
  }, [selectedSessionId]);

  // Load tracks used in this session
  const tracks = useLiveQuery(async () => {
    const ids = Array.from(new Set((sets ?? []).map((s) => s.trackId).filter(Boolean)));
    if (!ids.length) return [] as Track[];
    const arr = await db.tracks.bulkGet(ids);
    return (arr.filter(Boolean) as Track[]) ?? [];
  }, [useMemo(() => (sets ?? []).map((s) => s.trackId).join("|"), [sets])]);

  const trackNameById = useMemo(() => new Map((tracks ?? []).map((t) => [t.id, t.displayName] as const)), [tracks]);

  const rows = useMemo(() => {
    const s = (sets ?? []).slice().sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
    return s.map((x) => {
      const kind = ((x.setType as any) ?? "working") as string;
      const done = !!x.completedAt;

      const weight = (x as any).weight;
      const reps = (x as any).reps;
      const seconds = (x as any).seconds;
      const distance = (x as any).distance;
      const unit = ((x as any).distanceUnit as string | undefined) ?? "";
      const rir = (x as any).rir;

      return {
        id: x.id,
        createdAt: x.createdAt ?? 0,
        trackId: x.trackId,
        track: trackNameById.get(x.trackId) ?? x.trackId,
        kind,
        done,
        weight,
        reps,
        seconds,
        distance,
        unit,
        rir,
      };
    });
  }, [sets, trackNameById]);

  const issues = useMemo(() => {
    const badRir = rows.filter((r) => r.rir != null && !(typeof r.rir === "number" && Number.isFinite(r.rir)));
    const doneButMissingNumbers = rows.filter((r) => r.done && r.kind === "working" && r.weight == null && r.reps == null && r.seconds == null && r.distance == null);
    const negativeVals = rows.filter(
      (r) =>
        (typeof r.weight === "number" && r.weight < 0) ||
        (typeof r.reps === "number" && r.reps < 0) ||
        (typeof r.seconds === "number" && r.seconds < 0) ||
        (typeof r.distance === "number" && r.distance < 0)
    );

    return {
      badRir,
      doneButMissingNumbers,
      negativeVals,
      total: badRir.length + doneButMissingNumbers.length + negativeVals.length,
    };
  }, [rows]);

  async function onCopyDebug() {
    const lines: string[] = [];
    lines.push("Workout PWA — DEV DIAGNOSTICS");
    lines.push(`sessionId: ${selectedSessionId}`);
    if (session) {
      lines.push(`template: ${session.templateName ?? "Ad-hoc"}`);
      lines.push(`startedAt: ${fmtDate(session.startedAt)}`);
      lines.push(`endedAt: ${fmtDate((session as any).endedAt)}`);
    }
    lines.push("");
    lines.push(`sets: ${rows.length}`);
    lines.push("");

    // include last 30 rows, compact
    for (const r of rows.slice(-30)) {
      const dist = typeof r.distance === "number" ? `${r.distance}${r.unit ? " " + r.unit : ""}` : "";
      lines.push(
        [
          `${r.done ? "✓" : " "}`,
          r.track,
          `(${r.kind})`,
          r.weight != null ? `wt=${r.weight}` : "",
          r.reps != null ? `reps=${r.reps}` : "",
          r.seconds != null ? `sec=${r.seconds}` : "",
          dist ? `dist=${dist}` : "",
          r.rir != null ? `rir=${String(r.rir)}` : "",
        ]
          .filter(Boolean)
          .join("  ")
      );
    }

    lines.push("");
    lines.push(`issues: ${issues.total}`);
    if (issues.badRir.length) lines.push(`- badRir: ${issues.badRir.length}`);
    if (issues.doneButMissingNumbers.length) lines.push(`- doneButMissingNumbers: ${issues.doneButMissingNumbers.length}`);
    if (issues.negativeVals.length) lines.push(`- negativeVals: ${issues.negativeVals.length}`);

    const ok = await copyTextToClipboard(lines.join("\n"));
    if (!ok) window.alert("Could not copy to clipboard in this browser.");
  }

  function setUrlSid(nextSid: string) {
    const next = new URLSearchParams(loc.search);
    if (nextSid) next.set("sid", nextSid);
    else next.delete("sid");
    nav({ pathname: "/dev", search: next.toString() }, { replace: true });
  }

  return (
    <div className="container">
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
          <h2 style={{ margin: 0 }}>DEV Diagnostics</h2>
          <button className="btn" onClick={() => nav("/history")}>Back</button>
        </div>

        <div className="muted" style={{ marginTop: 6 }}>
          Dev-only page. Guarded by <code>import.meta.env.DEV</code>.
        </div>

        <hr />

        <label>Session</label>
        <div className="row" style={{ alignItems: "center" }}>
          <select
            value={selectedSessionId}
            onChange={(e) => {
              const v = e.target.value;
              setSelectedSessionId(v);
              setUrlSid(v);
            }}
          >
            {(sessions ?? []).map((s: any) => (
              <option key={s.id} value={s.id}>
                {s.templateName ?? "Ad-hoc"} • {fmtDate(s.startedAt)}
              </option>
            ))}
          </select>

          <button className="btn small" onClick={onCopyDebug} title="Copy recent sets + issues to clipboard">
            Copy debug
          </button>
        </div>

        {session ? (
          <div className="kv" style={{ marginTop: 8 }}>
            <span>SessionId</span>
            <span style={{ fontFamily: "monospace" }}>{selectedSessionId}</span>
          </div>
        ) : null}
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 6 }}>Issues</h3>
        {issues.total === 0 ? (
          <div className="muted">No obvious issues detected.</div>
        ) : (
          <div className="muted">
            {issues.badRir.length > 0 && <div>• Bad RIR values: {issues.badRir.length}</div>}
            {issues.doneButMissingNumbers.length > 0 && <div>• Completed working sets with no numbers: {issues.doneButMissingNumbers.length}</div>}
            {issues.negativeVals.length > 0 && <div>• Negative values: {issues.negativeVals.length}</div>}
          </div>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 6 }}>Live Sets</h3>

        <div style={{ overflowX: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.3fr 54px 56px 56px 64px 80px 50px", gap: 8, fontSize: 12, opacity: 0.75, paddingBottom: 8 }}>
            <div>track</div>
            <div>kind</div>
            <div>wt</div>
            <div>reps</div>
            <div>sec</div>
            <div>dist</div>
            <div>RIR</div>
          </div>

          {(rows ?? []).slice(-60).map((r) => {
            const dist = typeof r.distance === "number" ? `${r.distance}${r.unit ? " " + r.unit : ""}` : "";
            const rirOk = r.rir == null || (typeof r.rir === "number" && Number.isFinite(r.rir));
            return (
              <div
                key={r.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.3fr 54px 56px 56px 64px 80px 50px",
                  gap: 8,
                  alignItems: "center",
                  padding: "6px 0",
                  borderTop: "1px solid rgba(0,0,0,0.06)",
                }}
              >
                <div title={r.id} style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {r.done ? "✓ " : ""}{r.track}
                </div>
                <div>{r.kind}</div>
                <div>{typeof r.weight === "number" ? r.weight : ""}</div>
                <div>{typeof r.reps === "number" ? r.reps : ""}</div>
                <div>{typeof r.seconds === "number" ? r.seconds : ""}</div>
                <div>{dist}</div>
                <div style={{ opacity: rirOk ? 1 : 1, fontWeight: rirOk ? 700 : 900 }}>
                  {rirOk ? (typeof r.rir === "number" ? r.rir : "") : "BAD"}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}