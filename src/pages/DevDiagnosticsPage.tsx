// /src/pages/DevDiagnosticsPage.tsx
/* ============================================================================
   DevDiagnosticsPage.tsx — DEV-only diagnostics + build/version info
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-03-04-DEV-DIAG-02

   - Route: /dev
   - Optional: /dev?sid=<sessionId>
   - Dev-only: guarded by import.meta.env.DEV (redirects in prod)

   Versioning strategy (client-visible):
   - Reads optional Vite env vars (must be prefixed with VITE_ to reach client)
     VITE_APP_VERSION   (e.g., 0.1.0)
     VITE_BUILD_ID      (e.g., 2026-03-04-CF-01)
     VITE_GIT_SHA       (e.g., a08b0c4)
     VITE_BUILD_TIME    (ISO string)
     VITE_DEPLOY_URL    (optional)
   - Also displays mode/base/dev flags.

   NOTE: This file intentionally avoids importing *.tsx extensions.
   ============================================================================ */

import React, { useEffect, useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import type { Track, SetEntry } from "../db";
import { BUILD_INFO } from "../buildInfo";

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

function shortSha(s?: string) {
  if (!s) return "";
  const t = String(s).trim();
  if (!t) return "";
  return t.length > 10 ? t.slice(0, 10) : t;
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

  // ---------------------------------------------------------------------------
  // Build / version info (client-visible env vars only)
  // ---------------------------------------------------------------------------
  const buildInfo = useMemo(() => {
    const e = import.meta.env as any;

    const appVersion = String(e.VITE_APP_VERSION ?? "").trim();
    const buildId = String(e.VITE_BUILD_ID ?? "").trim();
    const gitSha = String(e.VITE_GIT_SHA ?? e.VITE_CF_PAGES_COMMIT_SHA ?? "").trim();
    const buildTime = String(e.VITE_BUILD_TIME ?? "").trim();
    const deployUrl = String(e.VITE_DEPLOY_URL ?? e.VITE_CF_PAGES_URL ?? "").trim();

    return {
      mode: import.meta.env.MODE,
      dev: String(import.meta.env.DEV),
      prod: String(import.meta.env.PROD),
      baseUrl: import.meta.env.BASE_URL,

      appVersion,
      buildId,
      gitSha,
      buildTime,
      deployUrl,
    };
  }, []);

  // Best-effort SW status (PWA sanity check)
  const [swStatus, setSwStatus] = useState<string>("unknown");
  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        if (!("serviceWorker" in navigator)) {
          if (!cancelled) setSwStatus("not supported");
          return;
        }
        const reg = await navigator.serviceWorker.getRegistration();
        if (!reg) {
          if (!cancelled) setSwStatus("no registration");
          return;
        }
        const active = reg.active ? "active" : "";
        const waiting = reg.waiting ? "waiting" : "";
        const installing = reg.installing ? "installing" : "";
        const bits = [active, waiting, installing].filter(Boolean).join(", ");
        if (!cancelled) setSwStatus(bits || "registered");
      } catch {
        if (!cancelled) setSwStatus("error");
      }
    }

    check();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Session selection
  // ---------------------------------------------------------------------------
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
  const trackIdsKey = useMemo(() => (sets ?? []).map((s) => s.trackId).filter(Boolean).join("|"), [sets]);

  const tracks = useLiveQuery(async () => {
    const ids = Array.from(new Set((sets ?? []).map((s) => s.trackId).filter(Boolean)));
    if (!ids.length) return [] as Track[];
    const arr = await db.tracks.bulkGet(ids);
    return (arr.filter(Boolean) as Track[]) ?? [];
  }, [trackIdsKey]);

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
    const doneButMissingNumbers = rows.filter(
      (r) =>
        r.done &&
        r.kind === "working" &&
        r.weight == null &&
        r.reps == null &&
        r.seconds == null &&
        r.distance == null
    );
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

  function setUrlSid(nextSid: string) {
    const next = new URLSearchParams(loc.search);
    if (nextSid) next.set("sid", nextSid);
    else next.delete("sid");
    nav({ pathname: "/dev", search: next.toString() }, { replace: true });
  }

  async function onCopyDebug() {
    const lines: string[] = [];

    // Build info block first (so screenshots/copies immediately identify a deploy)
    lines.push("Workout PWA — DEV DIAGNOSTICS");
    lines.push("");
    lines.push("BUILD");
    lines.push(`mode: ${buildInfo.mode}`);
    lines.push(`dev: ${buildInfo.dev}`);
    lines.push(`baseUrl: ${buildInfo.baseUrl}`);
    if (buildInfo.appVersion) lines.push(`appVersion: ${buildInfo.appVersion}`);
    if (buildInfo.buildId) lines.push(`buildId: ${buildInfo.buildId}`);
    if (buildInfo.gitSha) lines.push(`gitSha: ${shortSha(buildInfo.gitSha)}`);
    if (buildInfo.buildTime) lines.push(`buildTime: ${buildInfo.buildTime}`);
    if (buildInfo.deployUrl) lines.push(`deployUrl: ${buildInfo.deployUrl}`);
    lines.push(`serviceWorker: ${swStatus}`);
    lines.push("");

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

  return (
    <div className="container">
      {/* ------------------------------------------------------------------ */}
      {/* Header */}
      {/* ------------------------------------------------------------------ */}
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
          <h2 style={{ margin: 0 }}>DEV Diagnostics</h2>
          <button className="btn" onClick={() => nav("/history")}>
            Back
          </button>
        </div>

        <div className="muted" style={{ marginTop: 6 }}>
          Dev-only page. Guarded by <code>import.meta.env.DEV</code>.
        </div>

	<div className="muted" style={{ marginTop: 8 }}>
  	  Version: <b>{BUILD_INFO.version}</b> · Build: <b>{BUILD_INFO.commit}</b> · Built: <b>{BUILD_INFO.builtAt}</b>
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

          <button className="btn small" onClick={onCopyDebug} title="Copy build + recent sets + issues to clipboard">
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

      {/* ------------------------------------------------------------------ */}
      {/* Build / Version */}
      {/* ------------------------------------------------------------------ */}
      <div className="card">
        <h3 style={{ marginBottom: 6 }}>Build</h3>

        <div className="kv">
          <span>Mode</span>
          <span style={{ fontFamily: "monospace" }}>{buildInfo.mode}</span>
        </div>

        <div className="kv">
          <span>Base URL</span>
          <span style={{ fontFamily: "monospace" }}>{buildInfo.baseUrl}</span>
        </div>

        {buildInfo.appVersion ? (
          <div className="kv">
            <span>App Version</span>
            <span style={{ fontFamily: "monospace" }}>{buildInfo.appVersion}</span>
          </div>
        ) : null}

        {buildInfo.buildId ? (
          <div className="kv">
            <span>Build ID</span>
            <span style={{ fontFamily: "monospace" }}>{buildInfo.buildId}</span>
          </div>
        ) : null}

        {buildInfo.gitSha ? (
          <div className="kv">
            <span>Git SHA</span>
            <span style={{ fontFamily: "monospace" }}>{shortSha(buildInfo.gitSha)}</span>
          </div>
        ) : null}

        {buildInfo.buildTime ? (
          <div className="kv">
            <span>Build Time</span>
            <span style={{ fontFamily: "monospace" }}>{buildInfo.buildTime}</span>
          </div>
        ) : null}

        {buildInfo.deployUrl ? (
          <div className="kv">
            <span>Deploy URL</span>
            <span style={{ fontFamily: "monospace" }}>{buildInfo.deployUrl}</span>
          </div>
        ) : null}

        <div className="kv">
          <span>Service Worker</span>
          <span style={{ fontFamily: "monospace" }}>{swStatus}</span>
        </div>

        <div className="muted" style={{ marginTop: 8 }}>
          Tip: if you want these fields populated on Cloudflare, set them as build env vars prefixed with{" "}
          <code>VITE_</code> (e.g., <code>VITE_GIT_SHA</code>).
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Issues */}
      {/* ------------------------------------------------------------------ */}
      <div className="card">
        <h3 style={{ marginBottom: 6 }}>Issues</h3>
        {issues.total === 0 ? (
          <div className="muted">No obvious issues detected.</div>
        ) : (
          <div className="muted">
            {issues.badRir.length > 0 && <div>• Bad RIR values: {issues.badRir.length}</div>}
            {issues.doneButMissingNumbers.length > 0 && (
              <div>• Completed working sets with no numbers: {issues.doneButMissingNumbers.length}</div>
            )}
            {issues.negativeVals.length > 0 && <div>• Negative values: {issues.negativeVals.length}</div>}
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Live Sets */}
      {/* ------------------------------------------------------------------ */}
      <div className="card">
        <h3 style={{ marginBottom: 6 }}>Live Sets</h3>

        <div style={{ overflowX: "auto" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.3fr 54px 56px 56px 64px 80px 50px",
              gap: 8,
              fontSize: 12,
              opacity: 0.75,
              paddingBottom: 8,
            }}
          >
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
                  {r.done ? "✓ " : ""}
                  {r.track}
                </div>
                <div>{r.kind}</div>
                <div>{typeof r.weight === "number" ? r.weight : ""}</div>
                <div>{typeof r.reps === "number" ? r.reps : ""}</div>
                <div>{typeof r.seconds === "number" ? r.seconds : ""}</div>
                <div>{dist}</div>
                <div style={{ opacity: 1, fontWeight: rirOk ? 700 : 900 }}>
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