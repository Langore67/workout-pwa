// /src/pages/DevDiagnosticsPage.tsx
/* ============================================================================
   DevDiagnosticsPage.tsx — DEV-only diagnostics + build/version info
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-03-07-DEV-DIAG-03
   FILE: src/pages/DevDiagnosticsPage.tsx

   - Route: /dev
   - Optional: /dev?sid=<sessionId>
   - Dev-only: guarded by import.meta.env.DEV (redirects in prod)

   Changes (DEV-DIAG-03)
   ✅ Add alias sync button + status
   ✅ Keep session diagnostics
   ✅ Keep build / SW diagnostics
   ============================================================================ */

import React, { useEffect, useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db, normalizeName } from "../db";
import type { Track, SetEntry } from "../db";
import { BUILD_INFO } from "../buildInfo";
import seedCatalog from "../seed/exercises.seed.with_cues.json";

const aliasRows = seedCatalog.flatMap((ex: any) =>
  (ex.aliases ?? []).map((alias: string) => ({
    alias,
    exerciseName: ex.name,
  }))
);
import { syncExerciseAliasesFromRows } from "../syncExerciseAliases";
import {
  ACTIVE_RDL_EXERCISE_ID,
  ORPHAN_RDL_EXERCISE_ID,
  repairRomanianDeadliftHistory,
  type RdlRepairResult,
} from "../maintenance/repairRdlHistory";

type SetKind = "warmup" | "working" | "drop" | "failure";
type SetEntryX = SetEntry & { setType?: SetKind | string; completedAt?: number };

type AnchorMetadataValidationResult = {
  ok: boolean;
  summary: string;
  text: string;
};

const ANCHOR_METADATA_KEY_EXERCISES: Array<{ label: string; names: string[] }> = [
  { label: "Barbell Bench Press", names: ["Barbell Bench Press"] },
  { label: "Dumbbell Bench Press", names: ["Dumbbell Bench Press"] },
  { label: "Incline Barbell Bench Press", names: ["Incline Barbell Bench Press"] },
  { label: "Incline Dumbbell Bench Press", names: ["Incline Dumbbell Bench Press"] },
  { label: "Barbell Overhead Press", names: ["Barbell Overhead Press"] },
  { label: "Dumbbell Shoulder Press", names: ["Dumbbell Shoulder Press"] },
  { label: "Machine Shoulder Press", names: ["Machine Shoulder Press"] },
  { label: "Smith Machine Bench Press", names: ["Smith Machine Bench Press"] },
  { label: "Machine Chest Press", names: ["Machine Chest Press"] },
  { label: "Cable Chest Press", names: ["Cable Chest Press"] },
  { label: "Landmine Press", names: ["Landmine Press"] },
  { label: "Pull Up", names: ["Pull Up"] },
  { label: "Chin Up", names: ["Chin Up"] },
  { label: "Lat Pulldown", names: ["Lat Pulldown"] },
  { label: "Lat Pulldown (Neutral Grip)", names: ["Lat Pulldown (Neutral Grip)"] },
  { label: "Assisted Pull-Up / Assisted Pull Up", names: ["Assisted Pull-Up", "Assisted Pull Up"] },
  { label: "Barbell Row", names: ["Barbell Row"] },
  { label: "Chest Supported Row", names: ["Chest Supported Row"] },
  { label: "Chest Supported Dumbbell Row", names: ["Chest Supported Dumbbell Row"] },
  { label: "Seated Cable Row", names: ["Seated Cable Row"] },
  { label: "T-Bar Row", names: ["T-Bar Row"] },
  { label: "One Arm Dumbbell Row", names: ["One Arm Dumbbell Row"] },
  { label: "3-Point Dumbbell Row", names: ["3-Point Dumbbell Row"] },
  { label: "Romanian Deadlift", names: ["Romanian Deadlift"] },
  { label: "Deadlift", names: ["Deadlift"] },
  { label: "Trap Bar Deadlift", names: ["Trap Bar Deadlift"] },
  { label: "DB RDL", names: ["DB RDL", "Dumbbell Romanian Deadlift", "Dumbbell RDL"] },
  { label: "Smith Machine RDL", names: ["Smith Machine RDL", "Smith Machine Romanian Deadlift"] },
  { label: "Glute Machine / Hip Thrust", names: ["Glute Machine", "Hip Thrust"] },
  { label: "Good Morning", names: ["Good Morning"] },
  { label: "Single Leg Romanian Deadlift", names: ["Single Leg Romanian Deadlift"] },
  { label: "Barbell Back Squat", names: ["Barbell Back Squat"] },
  { label: "Front Squat", names: ["Front Squat"] },
  { label: "Hack Squat", names: ["Hack Squat"] },
  { label: "Leg Press", names: ["Leg Press"] },
  { label: "Smith Machine Squat", names: ["Smith Machine Squat"] },
  { label: "Bulgarian Split Squat", names: ["Bulgarian Split Squat"] },
  { label: "Reverse Lunge", names: ["Reverse Lunge"] },
  { label: "Walking Lunge", names: ["Walking Lunge"] },
  { label: "Step Up", names: ["Step Up"] },
  { label: "Farmer Carry", names: ["Farmer Carry"] },
  { label: "Suitcase Carry", names: ["Suitcase Carry"] },
  { label: "Sled Push", names: ["Sled Push"] },
  { label: "Sled Pull", names: ["Sled Pull"] },
];

const VALID_MOVEMENT_PATTERNS = new Set(["push", "pull", "hinge", "squat", "carry", "lunge"]);
const VALID_ANCHOR_ELIGIBILITY = new Set(["none", "conditional", "primary"]);

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

function formatMetadata(row: any) {
  const subtypes = Array.isArray(row?.anchorSubtypes) ? row.anchorSubtypes.join(",") : "";
  return `${String(row?.movementPattern ?? "") || "-"} / ${String(row?.anchorEligibility ?? "") || "-"} / [${subtypes}]`;
}

function sameStringArray(a: unknown, b: unknown) {
  const aa = Array.isArray(a) ? a.map((x) => String(x ?? "")).filter(Boolean) : [];
  const bb = Array.isArray(b) ? b.map((x) => String(x ?? "")).filter(Boolean) : [];
  if (aa.length !== bb.length) return false;
  return aa.every((value, index) => value === bb[index]);
}

function metadataDiff(live: any, seed: any) {
  const diffs: string[] = [];
  if (!seed) return diffs;
  if (String(live?.movementPattern ?? "") !== String(seed?.movementPattern ?? "")) diffs.push("movementPattern");
  if (String(live?.anchorEligibility ?? "") !== String(seed?.anchorEligibility ?? "")) diffs.push("anchorEligibility");
  if (!sameStringArray(live?.anchorSubtypes, seed?.anchorSubtypes)) diffs.push("anchorSubtypes");
  return diffs;
}

async function validateAnchorMetadata(): Promise<AnchorMetadataValidationResult> {
  const exercises = await db.exercises.toArray();
  const liveByNorm = new Map<string, any>();
  for (const exercise of exercises as any[]) {
    const keys = [
      exercise?.normalizedName,
      exercise?.name,
      ...(Array.isArray(exercise?.aliases) ? exercise.aliases : []),
    ];
    for (const key of keys) {
      const norm = normalizeName(String(key ?? ""));
      if (norm && !liveByNorm.has(norm)) liveByNorm.set(norm, exercise);
    }
  }

  const seedByNorm = new Map<string, any>();
  for (const seed of seedCatalog as any[]) {
    const norm = normalizeName(String(seed?.name ?? ""));
    if (norm) seedByNorm.set(norm, seed);
  }

  const rowsWithMetadata = (exercises as any[]).filter(
    (exercise) =>
      !!String(exercise?.movementPattern ?? "").trim() ||
      !!String(exercise?.anchorEligibility ?? "").trim() ||
      (Array.isArray(exercise?.anchorSubtypes) && exercise.anchorSubtypes.length > 0)
  );

  const suspiciousRows = rowsWithMetadata.filter((exercise) => {
    const pattern = String(exercise?.movementPattern ?? "").trim();
    const eligibility = String(exercise?.anchorEligibility ?? "").trim();
    const subtypes = exercise?.anchorSubtypes;
    return (
      (pattern && !VALID_MOVEMENT_PATTERNS.has(pattern)) ||
      (eligibility && !VALID_ANCHOR_ELIGIBILITY.has(eligibility)) ||
      (subtypes != null && !Array.isArray(subtypes)) ||
      (eligibility && !pattern)
    );
  });

  const keyRows = ANCHOR_METADATA_KEY_EXERCISES.map((key) => {
    const live = key.names.map((name) => liveByNorm.get(normalizeName(name))).find(Boolean);
    const seed = key.names.map((name) => seedByNorm.get(normalizeName(name))).find(Boolean);
    const missingLive = !live;
    const missingMetadata =
      !!live &&
      !String(live?.movementPattern ?? "").trim() &&
      !String(live?.anchorEligibility ?? "").trim() &&
      !(Array.isArray(live?.anchorSubtypes) && live.anchorSubtypes.length > 0);
    const diffs = live && seed ? metadataDiff(live, seed) : [];
    const status = missingLive
      ? "MISSING LIVE ROW"
      : !seed
        ? "NO SEED EXPECTATION"
        : missingMetadata
          ? "MISSING METADATA"
          : diffs.length
            ? `DIFF: ${diffs.join(", ")}`
            : "OK";

    return {
      key,
      live,
      seed,
      status,
    };
  });

  const missingMetadata = keyRows.filter((row) => row.status === "MISSING METADATA");
  const missingLive = keyRows.filter((row) => row.status === "MISSING LIVE ROW");
  const diffs = keyRows.filter((row) => row.status.startsWith("DIFF:"));

  const lines: string[] = [];
  lines.push("Anchor Metadata Validation");
  lines.push(`Generated: ${new Date().toLocaleString()}`);
  lines.push("");
  lines.push("Summary");
  lines.push(`- Live exercises: ${exercises.length}`);
  lines.push(`- Live exercises with any anchor metadata: ${rowsWithMetadata.length}`);
  lines.push(`- Key exercises checked: ${keyRows.length}`);
  lines.push(`- Key live rows missing: ${missingLive.length}`);
  lines.push(`- Key rows missing metadata: ${missingMetadata.length}`);
  lines.push(`- Key rows differing from seed: ${diffs.length}`);
  lines.push(`- Suspicious live metadata rows: ${suspiciousRows.length}`);
  lines.push("");
  lines.push("Key Exercises");
  for (const row of keyRows) {
    lines.push(
      `- ${row.key.label}: ${row.status} | live=${row.live?.name ?? "-"} | liveMeta=${formatMetadata(row.live)} | seedMeta=${formatMetadata(row.seed)}`
    );
  }

  if (suspiciousRows.length) {
    lines.push("");
    lines.push("Suspicious Live Rows");
    for (const exercise of suspiciousRows.slice(0, 40)) {
      lines.push(`- ${exercise?.name ?? exercise?.id}: ${formatMetadata(exercise)}`);
    }
  }

  return {
    ok: missingMetadata.length === 0 && diffs.length === 0 && suspiciousRows.length === 0,
    summary: `Metadata rows: ${rowsWithMetadata.length}/${exercises.length}; missing key metadata: ${missingMetadata.length}; seed diffs: ${diffs.length}; suspicious: ${suspiciousRows.length}`,
    text: lines.join("\n"),
  };
}

export default function DevDiagnosticsPage() {
  // Hard guard: never show in production builds.
  if (!import.meta.env.DEV) return <Navigate to="/" replace />;

  const nav = useNavigate();
  const loc = useLocation();

  const [aliasSyncStatus, setAliasSyncStatus] = useState<string>("");
  const [rdlRepairResult, setRdlRepairResult] = useState<RdlRepairResult | null>(null);
  const [anchorMetadataResult, setAnchorMetadataResult] = useState<AnchorMetadataValidationResult | null>(null);

  /* --------------------------------------------------------------------------
     Build / version info
     ----------------------------------------------------------------------- */
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

  /* --------------------------------------------------------------------------
     Service worker status
     ----------------------------------------------------------------------- */
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

  /* --------------------------------------------------------------------------
     Session selection
     ----------------------------------------------------------------------- */
  const qs = useMemo(() => new URLSearchParams(loc.search), [loc.search]);
  const sidFromUrl = qs.get("sid") ?? "";

  const [selectedSessionId, setSelectedSessionId] = useState<string>(sidFromUrl);

  useEffect(() => {
    if (sidFromUrl && sidFromUrl !== selectedSessionId) {
      setSelectedSessionId(sidFromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sidFromUrl]);

  const sessions = useLiveQuery(async () => {
    const arr = await db.sessions.orderBy("startedAt").reverse().limit(25).toArray();
    return arr ?? [];
  }, []);

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

  const trackIdsKey = useMemo(
    () => (sets ?? []).map((s) => s.trackId).filter(Boolean).join("|"),
    [sets]
  );

  const tracks = useLiveQuery(async () => {
    const ids = Array.from(new Set((sets ?? []).map((s) => s.trackId).filter(Boolean)));
    if (!ids.length) return [] as Track[];
    const arr = await db.tracks.bulkGet(ids);
    return (arr.filter(Boolean) as Track[]) ?? [];
  }, [trackIdsKey]);

  const trackNameById = useMemo(
    () => new Map((tracks ?? []).map((t) => [t.id, t.displayName] as const)),
    [tracks]
  );

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
    const badRir = rows.filter(
      (r) => r.rir != null && !(typeof r.rir === "number" && Number.isFinite(r.rir))
    );

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

  /* --------------------------------------------------------------------------
     Actions
     ----------------------------------------------------------------------- */
  async function onCopyDebug() {
    const lines: string[] = [];

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

    for (const r of rows.slice(-30)) {
      const dist =
        typeof r.distance === "number" ? `${r.distance}${r.unit ? " " + r.unit : ""}` : "";

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
    if (issues.doneButMissingNumbers.length) {
      lines.push(`- doneButMissingNumbers: ${issues.doneButMissingNumbers.length}`);
    }
    if (issues.negativeVals.length) lines.push(`- negativeVals: ${issues.negativeVals.length}`);

    const ok = await copyTextToClipboard(lines.join("\n"));
    if (!ok) window.alert("Could not copy to clipboard in this browser.");
  }

  async function onSyncAliases() {
    try {
      setAliasSyncStatus("Syncing aliases…");
      const result = await syncExerciseAliasesFromRows(aliasRows as any[]);
      setAliasSyncStatus(
        `Alias sync complete: rowsRead=${result.rowsRead}, updatedExercises=${result.updatedExercises}, aliasesAdded=${result.aliasesAdded}, missingCanonicals=${result.missingCanonicals}`
      );
    } catch (e: any) {
      setAliasSyncStatus(`Alias sync failed: ${e?.message ?? e}`);
    }
  }

  async function onRepairRdlHistory() {
    const ok = window.confirm(
      [
        "Repair Romanian Deadlift history?",
        "",
        `This will repoint references from ${ORPHAN_RDL_EXERCISE_ID}`,
        `to ${ACTIVE_RDL_EXERCISE_ID}.`,
        "",
        "This does not create exercises and only touches exact old-ID references.",
      ].join("\n")
    );

    if (!ok) return;

    setRdlRepairResult({
      ok: true,
      message: "Repairing RDL history...",
      tracksMoved: 0,
      sessionItemsMoved: 0,
      setsMoved: 0,
    });

    try {
      const result = await repairRomanianDeadliftHistory();
      setRdlRepairResult(result);
    } catch (e: any) {
      setRdlRepairResult({
        ok: false,
        message: `RDL history repair failed: ${e?.message ?? e}`,
        tracksMoved: 0,
        sessionItemsMoved: 0,
        setsMoved: 0,
      });
    }
  }

  async function onValidateAnchorMetadata() {
    setAnchorMetadataResult({
      ok: true,
      summary: "Validating anchor metadata...",
      text: "Validating anchor metadata...",
    });

    try {
      setAnchorMetadataResult(await validateAnchorMetadata());
    } catch (e: any) {
      setAnchorMetadataResult({
        ok: false,
        summary: `Anchor metadata validation failed: ${e?.message ?? e}`,
        text: `Anchor metadata validation failed:\n${e?.stack ?? e?.message ?? e}`,
      });
    }
  }

  /* --------------------------------------------------------------------------
     Render
     ----------------------------------------------------------------------- */
  return (
    <div className="container">
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
          Version: <b>{BUILD_INFO.version}</b> · Build: <b>{BUILD_INFO.commit}</b> · Built:{" "}
          <b>{BUILD_INFO.builtAt}</b>
        </div>

        <hr />

        <label>Session</label>
        <div className="row" style={{ alignItems: "center", gap: 10, flexWrap: "wrap" }}>
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

          <button
            className="btn small"
            onClick={onCopyDebug}
            title="Copy build + recent sets + issues to clipboard"
          >
            Copy debug
          </button>

          <button
            className="btn small"
            onClick={onSyncAliases}
            title="Merge alias seed entries into existing exercises"
          >
            Sync aliases
          </button>

          <button
            className="btn small"
            onClick={onRepairRdlHistory}
            title="Repoint orphan Romanian Deadlift history to the active Romanian Deadlift exercise"
          >
            Repair RDL History
          </button>

          <button
            className="btn small"
            onClick={onValidateAnchorMetadata}
            title="Read live exercise rows and compare anchor metadata against seed expectations"
          >
            Validate Anchor Metadata
          </button>
        </div>

        {aliasSyncStatus && (
          <div className="muted" style={{ marginTop: 8 }}>
            {aliasSyncStatus}
          </div>
        )}

        {rdlRepairResult && (
          <div
            className="muted"
            style={{
              marginTop: 8,
              color: rdlRepairResult.ok ? "var(--text)" : "var(--danger)",
              lineHeight: 1.45,
            }}
          >
            <div>{rdlRepairResult.message}</div>
            <div>
              Tracks moved: {rdlRepairResult.tracksMoved} · Session items moved:{" "}
              {rdlRepairResult.sessionItemsMoved} · Sets moved: {rdlRepairResult.setsMoved}
            </div>
          </div>
        )}

        {anchorMetadataResult && (
          <div
            className="muted"
            style={{
              marginTop: 10,
              color: anchorMetadataResult.ok ? "var(--text)" : "var(--danger)",
              lineHeight: 1.45,
            }}
          >
            <div style={{ fontWeight: 800 }}>{anchorMetadataResult.summary}</div>
            <div className="row" style={{ gap: 8, marginTop: 8, marginBottom: 8 }}>
              <button
                className="btn small"
                type="button"
                onClick={() => void copyTextToClipboard(anchorMetadataResult.text)}
              >
                Copy anchor metadata report
              </button>
            </div>
            <textarea
              className="input"
              readOnly
              value={anchorMetadataResult.text}
              rows={18}
              style={{
                width: "100%",
                fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
                fontSize: 12,
                lineHeight: 1.45,
                whiteSpace: "pre",
              }}
              onFocus={(e) => e.currentTarget.select()}
            />
          </div>
        )}

        {session ? (
          <div className="kv" style={{ marginTop: 8 }}>
            <span>SessionId</span>
            <span style={{ fontFamily: "monospace" }}>{selectedSessionId}</span>
          </div>
        ) : null}
      </div>

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
            const dist =
              typeof r.distance === "number" ? `${r.distance}${r.unit ? " " + r.unit : ""}` : "";
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
                <div
                  title={r.id}
                  style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                >
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

/* ============================================================================
   End of file: /src/pages/DevDiagnosticsPage.tsx
   ============================================================================ */
