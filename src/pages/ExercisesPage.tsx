// src/pages/ExercisesPage.tsx
/* ========================================================================== */
/*  ExercisesPage.tsx                                                         */
/*  BUILD_ID: 2026-02-25-EX-07                                                */
/* -------------------------------------------------------------------------- */
/*  Strong-like Exercise Catalog + Coaching + Performance Tabs                */
/*                                                                            */
/*  Revision history                                                          */
/*  - 2026-02-xx  EX-01  Catalog: search + body part filter + create + edit   */
/*                       FocusArea (optional) + aliases + safe dedupe         */
/*  - 2026-02-22  EX-02  Coaching editor: summary/directions/setup+exec cues  */
/*                       common mistakes + video URL + copy-to-clipboard      */
/*                       Row indicators for cues presence                     */
/*  - 2026-02-22  EX-03  ✅ Tap exercise name opens DETAILS (read-only) modal  */
/*                       Edit remains an explicit action button               */
/*                       Details modal includes Copy cues + Edit              */
/*  - 2026-02-24  EX-04  ✅ Details modal shows Performance chart (monthly)    */
/*                       Best Set (est. 1RM) across all logged tracks/sets    */
/*  - 2026-02-24  EX-05  ✅ Strong-ish DETAILS tabs: Details / History / Charts*/
/*                       / Records with derived performance hook              */
/*  - 2026-02-24  EX-06  ✅ Added in-file breadcrumbs + expanded dev notes     */
/*                       Kept behavior stable; clarified tab-default logic    */
/*  - 2026-02-25  EX-07  ✅ Add Exercise.metricMode editor (reps/distance/time)*/
/*                       Saved to DB; defaults to "reps" if missing/invalid   */
/* ========================================================================== */

import React, { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate } from "react-router-dom";
import { db, normalizeName } from "../db";
import type { Exercise, BodyPart, MetricMode, Track } from "../db";
import { uuid } from "../utils";
import { Page, Section } from "../components/Page.tsx";
import { seedExercises } from "../seed/seedExercises";
import seedCatalog from "../seed/exercises.seed.with_cues.json";
import { CoachingPanel } from "../components/CoachingPanel";
import {
  bodyweightFromRowsAt,
  calcEffectiveStrengthWeightLb,
  computeE1RM,
  isBodyweightEffectiveLoadExerciseName,
  isExplicitlyAssistedBodyweightExerciseName,
} from "../strength/Strength";
import {
  buildExerciseDuplicateEvidenceRows,
  classifyExerciseDuplicateRows,
  exerciseDuplicateAuditKey,
} from "../domain/exercises/exerciseDuplicateCandidates";
import {
  buildExerciseHistoryExportText,
  formatExerciseHistorySetLabel,
} from "../domain/coaching/exerciseHistorySnapshot";

/* ========================================================================== */
/*  Breadcrumb 1 — Schema tolerance + design intent                           */
/* -------------------------------------------------------------------------- */
/*  Why this file reads defensively:                                          */
/*  - Some iterations used db.setEntries; others used db.sets.                */
/*  - Completion timestamps varied: completedAt / doneAt / finishedAt.        */
/*  - We only count "history" when: (session endedAt) AND (set completedAt).  */
/*                                                                           */
/*  UI intent:                                                                */
/*  - Tap exercise name => DETAILS modal (read-only)                         */
/*  - Edit is explicit action                                                 */
/*  - DETAILS default tab (Option B):                                         */
/*      If the exercise has history => open on History                        */
/*      Else => open on Details                                               */
/* ========================================================================== */

type FocusArea =
  | "Delts"
  | "Front Delts"
  | "Side Delts"
  | "Rear Delts"
  | "Lats"
  | "Upper Back"
  | "Mid Back"
  | "Lower Back"
  | "Traps"
  | "Biceps"
  | "Triceps"
  | "Forearms"
  | "Chest"
  | "Upper Chest"
  | "Glutes"
  | "Quads"
  | "Hamstrings"
  | "Calves"
  | "Core";

const FOCUS_AREAS: FocusArea[] = [
  "Delts",
  "Front Delts",
  "Side Delts",
  "Rear Delts",
  "Lats",
  "Upper Back",
  "Mid Back",
  "Lower Back",
  "Traps",
  "Biceps",
  "Triceps",
  "Forearms",
  "Chest",
  "Upper Chest",
  "Glutes",
  "Quads",
  "Hamstrings",
  "Calves",
  "Core",
];

const BODY_PARTS: BodyPart[] = [
  "Chest",
  "Back",
  "Legs",
  "Shoulders",
  "Arms",
  "Core",
  "Full Body",
  "Cardio",
  "Other",
];

/* ========================================================================== */
/*  Breadcrumb 2 — Small helpers (string/arrays)                              */
/* ========================================================================== */

function getFocusArea(e: Exercise): string | undefined {
  const fa = (e as any).focusArea as string | undefined;
  return fa && fa.trim() ? fa : undefined;
}

function normalizeAliases(raw: string): string[] {
  const parts = raw
    .split(/[\n,]/g)
    .map((s) => s.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const k = normalizeName(p);
    if (!k) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

function normalizeLines(raw: string): string[] {
  const parts = raw
    .split(/\n/g)
    .map((s) => s.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const k = normalizeName(p);
    if (!k) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

function textOrUndef(v: string): string | undefined {
  const s = (v ?? "").trim();
  return s ? s : undefined;
}

function safeLen(a: any): number {
  return Array.isArray(a)
    ? a.filter((x) => typeof x === "string" && x.trim().length > 0).length
    : 0;
}

function cleanStringArray(v: any): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean);
}

function normalizeMetricMode(v: any): MetricMode {
  return v === "distance" || v === "time" ? v : "reps";
}

function prettyMetricLabel(m: MetricMode): string {
  return m === "distance" ? "Distance" : m === "time" ? "Time" : "Reps";
}

function findSeedExerciseByName(name: string) {
  const target = normalizeName(name);
  if (!target) return null;

  for (const item of seedCatalog as any[]) {
    const itemName = normalizeName(String(item?.name ?? ""));
    if (itemName && itemName === target) return item;

    const aliases = Array.isArray(item?.aliases) ? item.aliases : [];
    for (const alias of aliases) {
      const aliasName = normalizeName(String(alias ?? ""));
      if (aliasName && aliasName === target) return item;
    }
  }

  return null;
}

function getSeedExerciseSuggestions(name: string, limit = 3) {
  const target = normalizeName(name);
  if (!target) return [];

  const scored = (seedCatalog as any[])
    .map((item) => {
      const canonicalName = String(item?.name ?? "").trim();
      const canonicalNorm = normalizeName(canonicalName);
      const aliases = Array.isArray(item?.aliases) ? item.aliases.map((a: any) => String(a ?? "").trim()) : [];

      let score = 0;

      if (canonicalNorm === target) score = 100;
      else if (canonicalNorm.includes(target) || target.includes(canonicalNorm)) score = 80;
      else {
        for (const alias of aliases) {
          const aliasNorm = normalizeName(alias);
          if (!aliasNorm) continue;
          if (aliasNorm === target) {
            score = Math.max(score, 95);
          } else if (aliasNorm.includes(target) || target.includes(aliasNorm)) {
            score = Math.max(score, 75);
          }
        }
      }

      const targetTokens = new Set(target.split(" ").filter(Boolean));
      const canonicalTokens = new Set(canonicalNorm.split(" ").filter(Boolean));
      let overlap = 0;
      for (const token of targetTokens) {
        if (canonicalTokens.has(token)) overlap += 1;
      }
      score += overlap * 5;

      return {
        item,
        canonicalName,
        score,
      };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.canonicalName.localeCompare(b.canonicalName);
    });

  const unique = new Map<string, any>();
  for (const row of scored) {
    if (!unique.has(row.canonicalName)) {
      unique.set(row.canonicalName, row.item);
    }
    if (unique.size >= limit) break;
  }

  return Array.from(unique.values());
}




async function copyTextToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    window.alert("Copied to clipboard.");
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "true");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      ta.style.top = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      window.alert("Copied to clipboard.");
    } catch {
      window.alert("Copy failed. Your browser may block clipboard access.");
    }
  }
}

function monthKeyFromMs(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function prettyDateLabel(ms: number) {
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/* ========================================================================== */
/*  Breadcrumb 3A — Exercise audit helpers (read-only scaffold)              */
/* ========================================================================== */

type ExerciseAuditRow = {
  exerciseId: string;
  name: string;
  normalizedName: string;
  aliases: string[];
  aliasKeys: string[];
  bodyPart?: string;
  category?: string;
  equipment?: string;
  trackCount: number;
  templateItemCount: number;
  sessionItemCount: number;
  setCount: number;
  archived: boolean;
  merged: boolean;
};

type ExerciseAuditCluster = {
  key: string;
  rows: ExerciseAuditRow[];
  totalTracks: number;
  totalTemplateItems: number;
  totalSessionItems: number;
  totalSets: number;
  recommendation: "safe merge" | "review" | "keep separate";
  reason: string;
};

type ExerciseAuditSummary = {
  totalExercises: number;
  activeExercises: number;
  archivedExercises: number;
  mergedExercises: number;
  duplicateClusters: ExerciseAuditCluster[];
  topUsageRows: ExerciseAuditRow[];
};

function classifyAuditCluster(rows: ExerciseAuditRow[]): {
  recommendation: "safe merge" | "review" | "keep separate";
  reason: string;
} {
  return classifyExerciseDuplicateRows(rows);
}

function buildExerciseAuditSummary(args: {
  exercises: Exercise[];
  tracks: any[];
  templateItems: any[];
  sessionItems: any[];
  sets: any[];
}): ExerciseAuditSummary {
  const { exercises, tracks, templateItems, sessionItems, sets } = args;

  const rows: ExerciseAuditRow[] = buildExerciseDuplicateEvidenceRows({
    exercises,
    tracks,
    templateItems,
    sessionItems,
    sets,
  });

  const clusterMap = new Map<string, ExerciseAuditRow[]>();

  for (const row of rows) {
    if (row.archived || row.merged) continue;

    const keys = Array.from(
      new Set([exerciseDuplicateAuditKey(row.name), ...row.aliasKeys].filter(Boolean))
    );

    for (const key of keys) {
      const arr = clusterMap.get(key) ?? [];
      arr.push(row);
      clusterMap.set(key, arr);
    }
  }

  const duplicateClusters: ExerciseAuditCluster[] = Array.from(clusterMap.entries())
    .map(([key, rawRows]) => {
      const deduped = Array.from(
        new Map(rawRows.map((r) => [r.exerciseId, r])).values()
      ).sort((a, b) => a.name.localeCompare(b.name));

      const classification = classifyAuditCluster(deduped);

      return {
        key,
        rows: deduped,
        totalTracks: deduped.reduce((sum, r) => sum + r.trackCount, 0),
        totalTemplateItems: deduped.reduce((sum, r) => sum + r.templateItemCount, 0),
        totalSessionItems: deduped.reduce((sum, r) => sum + r.sessionItemCount, 0),
        totalSets: deduped.reduce((sum, r) => sum + r.setCount, 0),
        recommendation: classification.recommendation,
        reason: classification.reason,
      };
    })
    .filter((c) => c.rows.length > 1)
    .sort((a, b) => {
      const rank = (value: ExerciseAuditCluster["recommendation"]) =>
        value === "safe merge" ? 0 : value === "review" ? 1 : 2;

      const rankA = rank(a.recommendation);
      const rankB = rank(b.recommendation);
      if (rankA !== rankB) return rankA - rankB;

      const usageA = a.totalSets + a.totalSessionItems + a.totalTemplateItems + a.totalTracks;
      const usageB = b.totalSets + b.totalSessionItems + b.totalTemplateItems + b.totalTracks;
      if (usageB !== usageA) return usageB - usageA;

      return a.key.localeCompare(b.key);
    });

  const topUsageRows = rows
    .slice()
    .sort((a, b) => {
      const usageA = a.setCount + a.sessionItemCount + a.templateItemCount + a.trackCount;
      const usageB = b.setCount + b.sessionItemCount + b.templateItemCount + b.trackCount;
      if (usageB !== usageA) return usageB - usageA;
      return a.name.localeCompare(b.name);
    })
    .slice(0, 20);

  return {
    totalExercises: rows.length,
    activeExercises: rows.filter((r) => !r.archived && !r.merged).length,
    archivedExercises: rows.filter((r) => r.archived).length,
    mergedExercises: rows.filter((r) => r.merged).length,
    duplicateClusters,
    topUsageRows,
  };
}

/* ========================================================================== */
/*  Breadcrumb 3 — Small chart/record UI parts                                */
/* ========================================================================== */

function MiniLineChart({
  points,
  height,
}: {
  points: { x: string; y: number }[];
  height: number;
}) {
  const w = 520;
  const h = Math.max(60, height);

  if (!points?.length) {
    return (
      <div className="muted" style={{ fontSize: 13 }}>
        No data yet.
      </div>
    );
  }

  const ys = points.map((p) => p.y).filter((v) => Number.isFinite(v));
  if (!ys.length) {
    return (
      <div className="muted" style={{ fontSize: 13 }}>
        No data yet.
      </div>
    );
  }

  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const span = Math.max(1e-6, maxY - minY);

  const padX = 6;
  const padY = 6;

  const toX = (i: number) => {
    if (points.length === 1) return w / 2;
    return padX + (i * (w - padX * 2)) / (points.length - 1);
  };

  const toY = (y: number) => {
    const t = (y - minY) / span;
    return padY + (1 - t) * (h - padY * 2);
  };

  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(2)} ${toY(p.y).toFixed(2)}`)
    .join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} role="img" aria-label="Chart">
      <path
        d={`M ${padX} ${h - padY} L ${w - padX} ${h - padY}`}
        stroke="currentColor"
        strokeOpacity="0.15"
        fill="none"
      />
      <path d={d} stroke="currentColor" strokeWidth="2" fill="none" />
    </svg>
  );
}

function RecordRow({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="card" style={{ padding: 10 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
        <div style={{ fontWeight: 900 }}>{label}</div>
        <div style={{ fontWeight: 900 }}>{value}</div>
      </div>
      {sub ? (
        <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
          {sub}
        </div>
      ) : null}
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  points,
}: {
  title: string;
  subtitle: string;
  points: { x: string; y: number }[];
}) {
  const last = points.length ? points[points.length - 1].y : undefined;

  return (
    <div className="card" style={{ padding: 10 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={{ fontWeight: 900 }}>{title}</div>
        <div className="muted" style={{ fontSize: 12 }}>
          {last != null && Number.isFinite(last) ? `Now: ${Math.round(last)}` : "—"}
        </div>
      </div>
      <div className="muted" style={{ marginTop: 4, fontSize: 12 }}>
        {subtitle}
      </div>
      <div style={{ marginTop: 10 }}>
        <MiniLineChart points={points} height={90} />
      </div>
      <div
        className="muted"
        style={{ marginTop: 8, fontSize: 12, display: "flex", justifyContent: "space-between" }}
      >
        <span>{points[0]?.x ?? ""}</span>
        <span>{points[points.length - 1]?.x ?? ""}</span>
      </div>
    </div>
  );
}

/* ========================================================================== */
/*  Breadcrumb 4 — useExercisePerformance                                     */
/* ========================================================================== */

function useExercisePerformance(exerciseId?: string) {
  const data = useLiveQuery(async () => {
    if (!exerciseId) return { sessionCount: 0, rows: [] as any[] };

    const tracksTable = (db as any).tracks;
    const sessionsTable = (db as any).sessions;
    const setsTable = (db as any).setEntries ?? (db as any).sets;

    if (!tracksTable || !sessionsTable || !setsTable) {
      return { sessionCount: 0, rows: [] as any[] };
    }

    const tracks: any[] = (await tracksTable.where("exerciseId").equals(exerciseId).toArray()) ?? [];
    const trackIds = tracks.map((t) => t.id).filter(Boolean);
    if (!trackIds.length) return { sessionCount: 0, rows: [] as any[] };

    const trackById = new Map(tracks.map((t) => [t.id, t]));
    const exercise = await db.exercises.get(exerciseId);
    const bodyMetrics = (await (db as any).bodyMetrics?.toArray?.()) ?? [];

    let sets: any[] = [];
    try {
      sets = (await setsTable.where("trackId").anyOf(trackIds).toArray()) ?? [];
    } catch {
      const all = (await setsTable.toArray()) ?? [];
      sets = all.filter((s: any) => trackIds.includes(s.trackId));
    }

    const sessionIds = Array.from(new Set(sets.map((s: any) => s.sessionId).filter(Boolean)));
    const sessions: any[] = (await sessionsTable.bulkGet(sessionIds)).filter(Boolean) as any[];

    const endedSessions = sessions.filter(
      (s) => typeof s?.endedAt === "number" && Number.isFinite(s.endedAt) && s.endedAt > 0
    );
    const endedIdSet = new Set<string>(endedSessions.map((s) => s.id));

    const isSetCompleted = (se: any) => {
      const c = se?.completedAt ?? se?.doneAt ?? se?.finishedAt;
      return typeof c === "number" && Number.isFinite(c) && c > 0;
    };

    const doneSets = sets.filter((se: any) => {
      if (!se?.sessionId) return false;
      if (!endedIdSet.has(se.sessionId)) return false;
      if (!isSetCompleted(se)) return false;
      return true;
    });

    const setsBySession = new Map<string, any[]>();
    for (const se of doneSets) {
      const arr = setsBySession.get(se.sessionId) ?? [];
      arr.push(se);
      setsBySession.set(se.sessionId, arr);
    }

    const rows = endedSessions
      .slice()
      .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))
      .map((s) => {
        const arr = (setsBySession.get(s.id) ?? []).slice();

        const isWarmup = (x: any) => String(x?.setType ?? x?.kind ?? "working") === "warmup";
        const nonWarmup = arr.filter((x) => !isWarmup(x));

        let totalVolume = 0;
        let bestWeight: number | undefined;
        let bestReps: number | undefined;
        let bestE1rm: number | undefined;
        let bestSetLabel: string | undefined;
        let usedBodyweightEffective = false;
        let usedAssisted = false;
        const completedSetLabels: string[] = [];

        const sessionAt =
          (typeof s.endedAt === "number" && Number.isFinite(s.endedAt) ? s.endedAt : undefined) ??
          (typeof s.startedAt === "number" && Number.isFinite(s.startedAt) ? s.startedAt : undefined);

        const sessionBodyweight = bodyweightFromRowsAt(bodyMetrics, Number(sessionAt));

        for (const se of nonWarmup) {
          const track = trackById.get(se.trackId);
          const weightEntryContextName = [exercise?.name, track?.displayName].filter(Boolean).join(" ").trim();
          const isBodyweightEffective = isBodyweightEffectiveLoadExerciseName(weightEntryContextName);

          if (isBodyweightEffective) usedBodyweightEffective = true;
          if (isExplicitlyAssistedBodyweightExerciseName(weightEntryContextName)) usedAssisted = true;

          const setLabel = formatExerciseHistorySetLabel({
            set: se,
            metricMode: normalizeMetricMode((exercise as any)?.metricMode),
            isBodyweightEffective,
          });
          if (setLabel) completedSetLabels.push(setLabel);

          const w = calcEffectiveStrengthWeightLb(
            Number(se.weight),
            weightEntryContextName,
            sessionBodyweight as number
          );
          const r = Number(se.reps);

          if (!Number.isFinite(w) || !Number.isFinite(r) || w <= 0 || r <= 0) continue;

          totalVolume += w * r;

          if (bestWeight == null || w > bestWeight) bestWeight = w;
          if (bestReps == null || r > bestReps) bestReps = r;

          const e1 = computeE1RM(w, r);
          if (Number.isFinite(e1) && (bestE1rm == null || e1 > bestE1rm)) {
            bestE1rm = e1;
            bestSetLabel = `${w} x ${r}`;
          }
        }

        const endedAt = typeof s.endedAt === "number" ? s.endedAt : (s.startedAt as number);
        const dateLabel = prettyDateLabel(endedAt);

        return {
          sessionId: s.id,
          templateName: s.templateName,
          endedAt,
          dateLabel,
          totalVolume,
          bestWeight,
          maxReps: bestReps,
          bestE1rm,
          bestSetLabel,
          usedBodyweightEffective,
          usedAssisted,
          completedSetLabels: completedSetLabels.slice(0, 4),
        };
      });

    return { sessionCount: endedSessions.length, rows };
  }, [exerciseId]);

  const rows = data?.rows ?? [];

  const toMonthly = (pairs: Array<{ ms: number; value: number }>, mode: "sum" | "max") => {
    const m = new Map<string, number>();
    for (const p of pairs) {
      const k = monthKeyFromMs(p.ms);
      const prev = m.get(k);
      if (prev == null) m.set(k, p.value);
      else m.set(k, mode === "sum" ? prev + p.value : Math.max(prev, p.value));
    }
    const keys = Array.from(m.keys()).sort((a, b) => a.localeCompare(b));
    return keys.map((k) => ({ x: k, y: m.get(k)! }));
  };

  const monthlyVolume = toMonthly(
    rows.map((r: any) => ({ ms: r.endedAt, value: Number(r.totalVolume ?? 0) })),
    "sum"
  );

  const monthlyE1rm = toMonthly(
    rows
      .filter((r: any) => Number.isFinite(r.bestE1rm))
      .map((r: any) => ({ ms: r.endedAt, value: r.bestE1rm })),
    "max"
  );

  const monthlyMaxWeight = toMonthly(
    rows
      .filter((r: any) => Number.isFinite(r.bestWeight))
      .map((r: any) => ({ ms: r.endedAt, value: r.bestWeight })),
    "max"
  );

  const monthlyMaxReps = toMonthly(
    rows
      .filter((r: any) => Number.isFinite(r.maxReps))
      .map((r: any) => ({ ms: r.endedAt, value: r.maxReps })),
    "max"
  );

  let bestE1rmVal: number | undefined;
  let bestE1rmLabel: string | undefined;
  let bestWeightVal: number | undefined;
  let bestWeightLabel: string | undefined;
  let bestSessionVolumeVal: number | undefined;
  let bestSessionVolumeLabel: string | undefined;
  let bestRepsVal: number | undefined;
  let bestRepsLabel: string | undefined;

  for (const r of rows) {
    if (Number.isFinite(r.bestE1rm) && (bestE1rmVal == null || r.bestE1rm > bestE1rmVal)) {
      bestE1rmVal = r.bestE1rm;
      bestE1rmLabel = `${r.bestSetLabel ?? "—"} (${r.dateLabel})`;
    }
    if (Number.isFinite(r.bestWeight) && (bestWeightVal == null || r.bestWeight > bestWeightVal)) {
      bestWeightVal = r.bestWeight;
      bestWeightLabel = `${r.bestWeight} (${r.dateLabel})`;
    }
    if (Number.isFinite(r.totalVolume) && (bestSessionVolumeVal == null || r.totalVolume > bestSessionVolumeVal)) {
      bestSessionVolumeVal = r.totalVolume;
      bestSessionVolumeLabel = `${Math.round(r.totalVolume)} (${r.dateLabel})`;
    }
    if (Number.isFinite(r.maxReps) && (bestRepsVal == null || r.maxReps > bestRepsVal)) {
      bestRepsVal = r.maxReps;
      bestRepsLabel = `${r.maxReps} (${r.dateLabel})`;
    }
  }

  return {
    sessionCount: data?.sessionCount ?? 0,
    historyRows: rows.slice(0, 30),
    monthlyVolume,
    monthlyE1rm,
    monthlyMaxWeight,
    monthlyMaxReps,
    records: {
      bestE1rm: bestE1rmVal,
      bestE1rmLabel,
      bestWeight: bestWeightVal,
      bestWeightLabel,
      bestSessionVolume: bestSessionVolumeVal,
      bestSessionVolumeLabel,
      bestReps: bestRepsVal,
      bestRepsLabel,
    },
  };
}

/* ========================================================================== */
/*  Breadcrumb 5 — ExerciseDetailsModal                                       */
/* ========================================================================== */

function ExerciseDetailsModal({
  exercise,
  allExercises,
  tab,
  setTab,
  onClose,
  onEdit,
}: {
  exercise: any;
  allExercises: Exercise[];
  tab: "details" | "history" | "charts" | "records";
  setTab: (t: "details" | "history" | "charts" | "records") => void;
  onClose: () => void;
  onEdit: () => void;
}) {
  const perf = useExercisePerformance(exercise?.id);

  const summary = textOrUndef(String((exercise as any).summary ?? ""));
  const directions = textOrUndef(String((exercise as any).directions ?? ""));
  const cs = cleanStringArray((exercise as any).cuesSetup);
  const ce = cleanStringArray((exercise as any).cuesExecution);
  const cm = cleanStringArray((exercise as any).commonMistakes);
  const videoUrl = textOrUndef(String((exercise as any).videoUrl ?? ""));
  const hasCoaching = !!summary || !!directions || cs.length || ce.length || cm.length || !!videoUrl;

  const TabBtn = ({
    id,
    label,
    badge,
  }: {
    id: "details" | "history" | "charts" | "records";
    label: string;
    badge?: string;
  }) => {
    const active = tab === id;
    return (
      <button
        type="button"
        className="btn small"
        onClick={() => setTab(id)}
        style={{
          fontWeight: 900,
          opacity: active ? 1 : 0.65,
          borderRadius: 999,
          padding: "8px 12px",
        }}
        aria-current={active ? "page" : undefined}
      >
        {label}
        {badge ? (
          <span className="badge" style={{ marginLeft: 8 }}>
            {badge}
          </span>
        ) : null}
      </button>
    );
  };

  const metric = prettyMetricLabel(normalizeMetricMode((exercise as any).metricMode));

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Exercise details" onMouseDown={onClose}>
      <div
        className="card modal-card"
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          maxWidth: 900,
          width: "min(900px, calc(100vw - 24px))",
          maxHeight: "calc(100vh - 24px)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ position: "sticky", top: 0, zIndex: 2, background: "var(--card)" }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <button className="btn small" onClick={onClose} aria-label="Close">
              ✕
            </button>

            <div style={{ textAlign: "center", flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {exercise.name}
              </div>
              <div className="muted" style={{ marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {[exercise.bodyPart ?? "—", getFocusArea(exercise), `Metric: ${metric}`].filter(Boolean).join(" • ") || "—"}
              </div>
            </div>

            <button className="btn small" onClick={onEdit} title="Edit this exercise">
              Edit
            </button>
          </div>

          <div className="row" style={{ gap: 8, padding: "10px 4px 10px 4px", flexWrap: "wrap" }}>
            <TabBtn id="details" label="Details" badge={!hasCoaching ? "empty" : undefined} />
            <TabBtn id="history" label="History" badge={perf.sessionCount ? String(perf.sessionCount) : undefined} />
            <TabBtn id="charts" label="Charts" />
            <TabBtn id="records" label="Records" />
          </div>

          <hr style={{ margin: 0 }} />
        </div>

        <div style={{ paddingRight: 2, overflowY: "auto", maxHeight: "min(740px, calc(100vh - 240px))" }}>
          {tab === "details" ? <CoachingPanel exercise={exercise} perf={perf} /> : null}

          {tab === "history" ? (
            <div className="card" style={{ padding: 12 }}>
              <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
                <div style={{ fontWeight: 900 }}>Recent sessions</div>
                <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {perf.sessionCount ? `${perf.sessionCount} total` : "—"}
                  </div>
                  <button
                    type="button"
                    className="btn small"
                    onClick={() =>
                      copyTextToClipboard(
                        buildExerciseHistoryExportText({
                          exercise,
                          historyRows: perf.historyRows,
                          allExercises: allExercises ?? [],
                        })
                      )
                    }
                    title="Copy recent exercise history for coach handoff"
                  >
                    Copy Export
                  </button>
                </div>
              </div>

              <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
                Completed sessions only (endedAt + completed sets).
              </div>

              <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                {perf.historyRows.length ? (
                  perf.historyRows.map((r) => (
                    <div key={r.sessionId} className="card" style={{ padding: 10 }}>
                      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                        <div style={{ fontWeight: 900 }}>{r.dateLabel}</div>
                        <span className="badge">{r.templateName ?? "Session"}</span>
                      </div>

                      <div className="muted" style={{ marginTop: 6, fontSize: 13, lineHeight: 1.5 }}>
                        Best set: <b>{r.bestSetLabel ?? "—"}</b>
                        {"  •  "}
                        e1RM: <b>{r.bestE1rm ? Math.round(r.bestE1rm) : "—"}</b>
                        {"  •  "}
                        Volume: <b>{r.totalVolume ? Math.round(r.totalVolume) : "—"}</b>
                        {"  •  "}
                        Max reps: <b>{r.maxReps ?? "—"}</b>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="muted">No completed history yet for this exercise.</div>
                )}
              </div>
            </div>
          ) : null}

          {tab === "charts" ? (
            <div className="card" style={{ padding: 12 }}>
              <div style={{ fontWeight: 900 }}>Charts (monthly)</div>
              <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
                Total Volume, PR progression (e1RM), Best Set (max weight), Max Reps.
              </div>

              <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
                <ChartCard
                  title="Total Volume"
                  subtitle="Sum(weight × reps) of completed non-warmup sets"
                  points={perf.monthlyVolume}
                />
                <ChartCard
                  title="PR Progression (e1RM)"
                  subtitle="Monthly max of e1RM (Epley)"
                  points={perf.monthlyE1rm}
                />
                <ChartCard
                  title="Best Set (Max Weight)"
                  subtitle="Monthly max weight across completed sets"
                  points={perf.monthlyMaxWeight}
                />
                <ChartCard
                  title="Max Reps"
                  subtitle="Monthly max reps across completed sets"
                  points={perf.monthlyMaxReps}
                />
              </div>
            </div>
          ) : null}

          {tab === "records" ? (
            <div className="card" style={{ padding: 12 }}>
              <div style={{ fontWeight: 900 }}>Records</div>
              <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
                Derived from completed sessions only.
              </div>

              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                <RecordRow
                  label="Best e1RM"
                  value={perf.records.bestE1rm ? `${Math.round(perf.records.bestE1rm)}` : "—"}
                  sub={perf.records.bestE1rmLabel}
                />
                <RecordRow
                  label="Best set (max weight)"
                  value={perf.records.bestWeight != null ? `${perf.records.bestWeight}` : "—"}
                  sub={perf.records.bestWeightLabel}
                />
                <RecordRow
                  label="Best session volume"
                  value={perf.records.bestSessionVolume != null ? `${Math.round(perf.records.bestSessionVolume)}` : "—"}
                  sub={perf.records.bestSessionVolumeLabel}
                />
                <RecordRow
                  label="Max reps in a set"
                  value={perf.records.bestReps != null ? `${perf.records.bestReps}` : "—"}
                  sub={perf.records.bestRepsLabel}
                />
              </div>
            </div>
          ) : null}
        </div>

        <div style={{ marginTop: 12 }}>
          <button className="btn" style={{ width: "100%", padding: "12px 14px" }} onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

/* ========================================================================== */
/*  Breadcrumb 6 — Clipboard block builder                                    */
/* ========================================================================== */

function buildClipboardText(e: Exercise, patchPreview?: any) {
  const name = patchPreview?.name ?? e.name ?? "";
  const body = patchPreview?.bodyPart ?? e.bodyPart ?? "—";
  const metricMode: MetricMode = normalizeMetricMode(patchPreview?.metricMode ?? (e as any).metricMode);

  const summary = (patchPreview?.summary ?? (e as any).summary ?? "").toString().trim();
  const directions = (patchPreview?.directions ?? (e as any).directions ?? "").toString().trim();

  const cuesSetup: string[] =
    patchPreview?.cuesSetup ?? (Array.isArray((e as any).cuesSetup) ? (e as any).cuesSetup : []) ?? [];
  const cuesExecution: string[] =
    patchPreview?.cuesExecution ?? (Array.isArray((e as any).cuesExecution) ? (e as any).cuesExecution : []) ?? [];
  const commonMistakes: string[] =
    patchPreview?.commonMistakes ?? (Array.isArray((e as any).commonMistakes) ? (e as any).commonMistakes : []) ?? [];

  const videoUrl = (patchPreview?.videoUrl ?? (e as any).videoUrl ?? "").toString().trim();

  const lines: string[] = [];
  lines.push(`${name}`);
  lines.push(`Body Part: ${body}`);
  lines.push(`Metric: ${prettyMetricLabel(metricMode)}`);
  lines.push("");

  if (summary) {
    lines.push("Summary:");
    lines.push(summary);
    lines.push("");
  }

  if (directions) {
    lines.push("Directions:");
    lines.push(directions);
    lines.push("");
  }

  if (cuesSetup.length) {
    lines.push("Cues — Setup:");
    for (const c of cuesSetup) lines.push(`- ${String(c).trim()}`);
    lines.push("");
  }

  if (cuesExecution.length) {
    lines.push("Cues — Execution:");
    for (const c of cuesExecution) lines.push(`- ${String(c).trim()}`);
    lines.push("");
  }

  if (commonMistakes.length) {
    lines.push("Common Mistakes:");
    for (const c of commonMistakes) lines.push(`- ${String(c).trim()}`);
    lines.push("");
  }

  if (videoUrl) {
    lines.push("Video:");
    lines.push(videoUrl);
    lines.push("");
  }

  return lines.join("\n").trim() + "\n";
}

/* ========================================================================== */
/*  Breadcrumb 7 — Main page component                                        */
/* ========================================================================== */

type ExerciseMergeRollbackSnapshot = {
  keepExerciseId: string;
  mergeSourceIds: string[];
  keepBefore: Exercise;
  sourcesBefore: Exercise[];
  tracksBefore: Track[];
  createdAt: number;
};

export default function ExercisesPage() {
  const nav = useNavigate();

  const [q, setQ] = useState("");
  const [bodyPart, setBodyPart] = useState<BodyPart | "">("");
  const [sortAsc, setSortAsc] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftBodyPart, setDraftBodyPart] = useState<BodyPart | "">("");
  const [draftFocusArea, setDraftFocusArea] = useState<FocusArea | "">("");

  const [viewingId, setViewingId] = useState<string>("");
  const [detailsTab, setDetailsTab] = useState<"details" | "history" | "charts" | "records">("details");

  const [editingId, setEditingId] = useState<string>("");
  const [editName, setEditName] = useState("");
  const [editBodyPart, setEditBodyPart] = useState<BodyPart | "">("");
  const [editFocusArea, setEditFocusArea] = useState<FocusArea | "">("");
  const [editAliasesText, setEditAliasesText] = useState("");
  const [editError, setEditError] = useState<string>("");
  const [editMetricMode, setEditMetricMode] = useState<MetricMode>("reps");
  const [editMovementPattern, setEditMovementPattern] = useState<string>("");
  const [editStrengthSignalRole, setEditStrengthSignalRole] = useState<string>("");

  const [editSummary, setEditSummary] = useState("");
  const [editDirections, setEditDirections] = useState("");
  const [editCuesSetupText, setEditCuesSetupText] = useState("");
  const [editCuesExecutionText, setEditCuesExecutionText] = useState("");
  const [editCommonMistakesText, setEditCommonMistakesText] = useState("");
  const [editVideoUrl, setEditVideoUrl] = useState("");

  const [showAudit, setShowAudit] = useState(false);
  const [showMergeMode, setShowMergeMode] = useState(false);
  const [selectedManualMergeIds, setSelectedManualMergeIds] = useState<string[]>([]);
  const [selectedManualKeepExerciseId, setSelectedManualKeepExerciseId] = useState<string | null>(null);
  const [showArchivedMerged, setShowArchivedMerged] = useState(false);
  const [auditFilter, setAuditFilter] = useState<"all" | "safe merge" | "review" | "keep separate">("all");
  const [selectedAuditClusterKey, setSelectedAuditClusterKey] = useState<string | null>(null);
  const [selectedKeepExerciseId, setSelectedKeepExerciseId] = useState<string | null>(null);
  const [selectedMergeSourceIds, setSelectedMergeSourceIds] = useState<string[]>([]);
  const [lastMergeSnapshot, setLastMergeSnapshot] = useState<ExerciseMergeRollbackSnapshot | null>(null);

  const auditSummary = useLiveQuery(async () => {
    const [exerciseRows, tracks, templateItems, sessionItems, sets] = await Promise.all([
      db.exercises.toArray(),
      db.tracks.toArray(),
      db.templateItems.toArray(),
      db.sessionItems.toArray(),
      db.sets.toArray(),
    ]);

    return buildExerciseAuditSummary({
      exercises: exerciseRows,
      tracks,
      templateItems,
      sessionItems,
      sets,
    });
  }, []);

  const exercises = useLiveQuery(async () => {
    const arr = await db.exercises.toArray();
    return arr.filter((e) => {
      if (showArchivedMerged) return true;
      return !e.archivedAt && !(e as any).mergedIntoExerciseId;
    });
  }, [showArchivedMerged]);

  const allExercises = useLiveQuery(async () => {
    return db.exercises.toArray();
  }, []);

  const mergeUsageByExerciseId = useLiveQuery(async () => {
    const [tracks, sets] = await Promise.all([db.tracks.toArray(), db.sets.toArray()]);

    const trackCounts: Record<string, number> = {};
    const setCounts: Record<string, number> = {};
    const trackToExerciseId = new Map<string, string>();

    for (const track of tracks) {
      const exerciseId = String((track as any).exerciseId ?? "");
      if (!exerciseId) continue;
      trackToExerciseId.set(String(track.id), exerciseId);
      trackCounts[exerciseId] = (trackCounts[exerciseId] ?? 0) + 1;
    }

    for (const set of sets) {
      const exerciseId = trackToExerciseId.get(String((set as any).trackId ?? ""));
      if (!exerciseId) continue;
      setCounts[exerciseId] = (setCounts[exerciseId] ?? 0) + 1;
    }

    const result: Record<string, { trackCount: number; setCount: number }> = {};
    const exerciseIds = new Set([...Object.keys(trackCounts), ...Object.keys(setCounts)]);
    for (const exerciseId of exerciseIds) {
      result[exerciseId] = {
        trackCount: trackCounts[exerciseId] ?? 0,
        setCount: setCounts[exerciseId] ?? 0,
      };
    }

    return result;
  }, []);

  const exerciseNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const ex of allExercises ?? []) map.set(ex.id, ex.name);
    return map;
  }, [allExercises]);

  const viewingExercise = useMemo(() => {
    if (!viewingId) return null;
    return (exercises ?? []).find((e) => e.id === viewingId) ?? null;
  }, [viewingId, exercises]);

  const editingExercise = useMemo(() => {
    if (!editingId) return null;
    return (exercises ?? []).find((e) => e.id === editingId) ?? null;
  }, [editingId, exercises]);

  const filtered = useMemo(() => {
    const nq = normalizeName(q || "");
    let arr = (exercises ?? []).slice();

    if (bodyPart) arr = arr.filter((e) => e.bodyPart === bodyPart);

    if (nq) {
      arr = arr.filter((e) => {
        const aliasHay = (e.aliases ?? []).map((a) => normalizeName(a)).join(" ");
        const focusHay = normalizeName(getFocusArea(e) ?? "");

        const sumHay = normalizeName(String((e as any).summary ?? ""));
        const dirHay = normalizeName(String((e as any).directions ?? ""));
        const csHay = Array.isArray((e as any).cuesSetup)
          ? (e as any).cuesSetup.map((x: any) => normalizeName(String(x))).join(" ")
          : "";
        const ceHay = Array.isArray((e as any).cuesExecution)
          ? (e as any).cuesExecution.map((x: any) => normalizeName(String(x))).join(" ")
          : "";

        const hay = `${e.normalizedName} ${normalizeName(e.name)} ${aliasHay} ${focusHay} ${sumHay} ${dirHay} ${csHay} ${ceHay}`;
        return hay.includes(nq);
      });
    }

    arr.sort((a, b) => (a.normalizedName || "").localeCompare(b.normalizedName || ""));
    if (!sortAsc) arr.reverse();
    return arr;
  }, [exercises, q, bodyPart, sortAsc]);
  
  
    const grouped = useMemo(() => {
      const m = new Map<string, Exercise[]>();
      for (const e of filtered) {
        const ch = (e.name?.trim()?.[0] ?? "#").toUpperCase();
        const key = /[A-Z]/.test(ch) ? ch : "#";
        const arr = m.get(key) ?? [];
        arr.push(e);
        m.set(key, arr);
      }
      const keys = Array.from(m.keys()).sort((a, b) => {
        if (a === "#") return 1;
        if (b === "#") return -1;
        return a.localeCompare(b);
      });
      return keys.map((k) => ({ key: k, items: m.get(k)! }));
  }, [filtered]);

    const cueCoverageSummary = useMemo(() => {
      const source = (exercises ?? []).filter(
        (e) => !e.archivedAt && !(e as any).mergedIntoExerciseId
      );
  
      const rows = source.map((e) => {
        const setupCount = cleanStringArray((e as any).cuesSetup).length;
        const executionCount = cleanStringArray((e as any).cuesExecution).length;
  
        return {
          id: e.id,
          name: e.name,
          setupCount,
          executionCount,
          hasSetup: setupCount > 0,
          hasExecution: executionCount > 0,
        };
      });
  
      const missingAny = rows.filter((r) => !r.hasSetup || !r.hasExecution);
      const missingSetup = rows.filter((r) => !r.hasSetup);
      const missingExecution = rows.filter((r) => !r.hasExecution);
      const complete = rows.filter((r) => r.hasSetup && r.hasExecution);
  
      return {
        total: rows.length,
        complete: complete.length,
        missingSetup: missingSetup.length,
        missingExecution: missingExecution.length,
        missingAnyCount: missingAny.length,
        missingAnyRows: missingAny
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name)),
      };
  }, [exercises]);

  function openCreate(prefill?: string) {
    setDraftName((prefill ?? q).trim());
    setDraftBodyPart(bodyPart || "");
    setDraftFocusArea("");
    setShowCreate(true);
  }

  async function createExercise() {
    const name = (draftName || "").trim();
    if (!name) return;

    const norm = normalizeName(name);
    const existing = await db.exercises.where("normalizedName").equals(norm).first();
    if (existing && !existing.archivedAt && !(existing as any).mergedIntoExerciseId) {
      setShowCreate(false);
      return;
    }

    const now = Date.now();
    const ex: Exercise = {
      id: uuid(),
      name,
      normalizedName: norm,
      equipmentTags: [],
      bodyPart: draftBodyPart || undefined,
      createdAt: now,
      updatedAt: now,
    };

    if (draftFocusArea) (ex as any).focusArea = draftFocusArea;

    await db.exercises.add(ex);
    setShowCreate(false);
    setDraftName("");
  }

  async function runSeed() {
    const res = await seedExercises();

    window.alert(
      `Seed complete.\n\n` +
        `Seed rows: ${res.seedCount}\n` +
        `Existing before: ${res.existingBefore}\n\n` +
        `Added: ${res.added}\n` +
        `Updated (backfilled): ${res.updated}\n` +
        `Skipped (already existed): ${res.skippedExisting}\n` +
        `Skipped (dup in seed): ${res.skippedDuplicateInSeed}\n` +
        `Skipped (invalid): ${res.skippedInvalid}`
    );
  }

  async function applySeedCuesToExercise(exerciseId: string) {
    const exercise = await db.exercises.get(exerciseId);
    if (!exercise) {
      window.alert("Exercise not found.");
      return;
    }

    const existingSetup = cleanStringArray((exercise as any).cuesSetup);
    const existingExecution = cleanStringArray((exercise as any).cuesExecution);

    if (existingSetup.length > 0 || existingExecution.length > 0) {
      window.alert("This exercise already has cues. Nothing was changed.");
      return;
    }

            const seedMatch = findSeedExerciseByName(exercise.name);
	    if (!seedMatch) {
	      const suggestions = getSeedExerciseSuggestions(exercise.name, 3);
	
	      if (!suggestions.length) {
	        window.alert(`No seed match found for "${exercise.name}".`);
	        return;
	      }
	
	      const options = suggestions
	        .map((item: any, index: number) => `${index + 1}. ${String(item?.name ?? "").trim()}`)
	        .join("\n");
	
	      const choice = window.prompt(
	        `No seed match found for "${exercise.name}".\n\n` +
	          `Closest seed matches:\n${options}\n\n` +
	          `Enter 1-${suggestions.length} to apply cues from one of these, or press Cancel to do nothing.`
	      );
	
	      if (choice == null) return;
	
	      const selectedIndex = Number(choice.trim()) - 1;
	      if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= suggestions.length) {
	        window.alert("No changes made. Invalid selection.");
	        return;
	      }
	
	      const selectedSeedName = String((suggestions[selectedIndex] as any)?.name ?? "").trim();
	      if (!selectedSeedName) {
	        window.alert("No changes made. Suggested seed exercise was invalid.");
	        return;
	      }
	
	      await applySeedCuesFromSelectedSeedExercise(exercise.id, selectedSeedName);
	      return;
    }

    const seedSetup = cleanStringArray((seedMatch as any).cuesSetup);
    const seedExecution = cleanStringArray((seedMatch as any).cuesExecution);

    if (!seedSetup.length && !seedExecution.length) {
      window.alert(`Seed match found for "${exercise.name}", but no cues were available to apply.`);
      return;
    }

    await db.exercises.update(exercise.id, {
      cuesSetup: seedSetup.length ? seedSetup : undefined,
      cuesExecution: seedExecution.length ? seedExecution : undefined,
      updatedAt: Date.now(),
    });

    window.alert(`Applied seed cues to "${exercise.name}".`);
  }

  async function applySeedCuesFromSelectedSeedExercise(
    exerciseId: string,
    seedExerciseName: string
  ) {
    const exercise = await db.exercises.get(exerciseId);
    if (!exercise) {
      window.alert("Exercise not found.");
      return;
    }

    const existingSetup = cleanStringArray((exercise as any).cuesSetup);
    const existingExecution = cleanStringArray((exercise as any).cuesExecution);

    if (existingSetup.length > 0 || existingExecution.length > 0) {
      window.alert("This exercise already has cues. Nothing was changed.");
      return;
    }

    const seedMatch = findSeedExerciseByName(seedExerciseName);
    if (!seedMatch) {
      window.alert(`Seed exercise "${seedExerciseName}" was not found.`);
      return;
    }

    const seedSetup = cleanStringArray((seedMatch as any).cuesSetup);
    const seedExecution = cleanStringArray((seedMatch as any).cuesExecution);

    if (!seedSetup.length && !seedExecution.length) {
      window.alert(`Seed exercise "${seedExerciseName}" does not have cues to apply.`);
      return;
    }

    const ok = window.confirm(
      `Apply cues from "${seedExerciseName}" to "${exercise.name}"?\n\n` +
        `This only fills missing cues and will not overwrite existing cues.`
    );
    if (!ok) return;

    await db.exercises.update(exercise.id, {
      cuesSetup: seedSetup.length ? seedSetup : undefined,
      cuesExecution: seedExecution.length ? seedExecution : undefined,
      updatedAt: Date.now(),
    });

    window.alert(`Applied seed cues from "${seedExerciseName}" to "${exercise.name}".`);
  }


  function clearAll() {
    setQ("");
    setBodyPart("");
    setSortAsc(true);
  }

  function toggleManualMergeSelection(exerciseId: string) {
    setSelectedManualMergeIds((current) => {
      const next = current.includes(exerciseId)
        ? current.filter((id) => id !== exerciseId)
        : [...current, exerciseId];

      setSelectedManualKeepExerciseId((keepId) => (keepId && next.includes(keepId) ? keepId : null));
      return next;
    });
  }

  async function createExerciseMergeRollbackSnapshot(params: {
    keepExerciseId: string;
    mergeSourceIds: string[];
  }): Promise<ExerciseMergeRollbackSnapshot> {
    const { keepExerciseId, mergeSourceIds } = params;

    const sourceIds = Array.from(
      new Set(
        mergeSourceIds
          .map((id) => String(id || "").trim())
          .filter((id) => id && id !== keepExerciseId)
      )
    );

    const keepBefore = await db.exercises.get(keepExerciseId);
    if (!keepBefore) throw new Error("Keep exercise not found for rollback snapshot.");

    const sourcesBefore = (await Promise.all(sourceIds.map((id) => db.exercises.get(id)))).filter(
      Boolean
    ) as Exercise[];

    if (!sourcesBefore.length) throw new Error("No source exercises found for rollback snapshot.");

    const tracksBefore = await db.tracks.where("exerciseId").anyOf(sourceIds).toArray();

    return {
      keepExerciseId,
      mergeSourceIds: sourceIds,
      keepBefore,
      sourcesBefore,
      tracksBefore,
      createdAt: Date.now(),
    };
  }

  async function undoExerciseMerge(snapshot: ExerciseMergeRollbackSnapshot) {
    await db.transaction("rw", db.exercises, db.tracks, async () => {
      await db.exercises.put(snapshot.keepBefore);

      for (const source of snapshot.sourcesBefore) {
        await db.exercises.put(source);
      }

      for (const track of snapshot.tracksBefore) {
        await db.tracks.put(track);
      }
    });
  }

  async function applyExerciseMerge(params: {
    keepExerciseId: string;
    mergeSourceIds: string[];
  }) {
    const { keepExerciseId, mergeSourceIds } = params;

    const sourceIds = Array.from(
      new Set(
        mergeSourceIds
          .map((id) => String(id || "").trim())
          .filter((id) => id && id !== keepExerciseId)
      )
    );

    if (!keepExerciseId || !sourceIds.length) return;

    await db.transaction("rw", db.exercises, db.tracks, async () => {
      const keep = await db.exercises.get(keepExerciseId);
      if (!keep) throw new Error("Keep exercise not found.");

      const sourceExercises = (await Promise.all(sourceIds.map((id) => db.exercises.get(id)))).filter(
        Boolean
      ) as Exercise[];

      if (!sourceExercises.length) throw new Error("No source exercises found.");

      const now = Date.now();

      const mergedAliasPool = Array.from(
        new Set(
          [
            ...(Array.isArray(keep.aliases) ? keep.aliases : []),
            ...sourceExercises.flatMap((ex) => [ex.name, ...(Array.isArray(ex.aliases) ? ex.aliases : [])]),
          ]
            .map((s) => String(s || "").trim())
            .filter(Boolean)
            .filter((s) => normalizeName(s) !== normalizeName(keep.name))
        )
      ).sort((a, b) => a.localeCompare(b));

      await db.exercises.update(keepExerciseId, {
        aliases: mergedAliasPool,
        updatedAt: now,
      });

      const tracksToMove = await db.tracks.where("exerciseId").anyOf(sourceIds).toArray();
      for (const track of tracksToMove) {
        await db.tracks.update(track.id, {
          exerciseId: keepExerciseId,
        });
      }

      for (const source of sourceExercises) {
        await db.exercises.update(source.id, {
          mergedIntoExerciseId: keepExerciseId,
          mergeNote: `Merged into ${keep.name} on ${new Date(now).toISOString()}`,
          archivedAt: source.archivedAt ?? now,
          updatedAt: now,
        });
      }
    });
  }

  async function openDetails(e: Exercise) {
    const tracksTable = (db as any).tracks;
    const sessionsTable = (db as any).sessions;
    const setsTable = (db as any).setEntries ?? (db as any).sets;

    let hasHistory = false;

    try {
      if (tracksTable && sessionsTable && setsTable) {
        const tracks: any[] = (await tracksTable.where("exerciseId").equals(e.id).toArray()) ?? [];
        const trackIds = tracks.map((t) => t.id).filter(Boolean);

        if (trackIds.length) {
          let sets: any[] = [];
          try {
            sets = (await setsTable.where("trackId").anyOf(trackIds).toArray()) ?? [];
          } catch {
            const all = (await setsTable.toArray()) ?? [];
            sets = all.filter((s: any) => trackIds.includes(s.trackId));
          }

          const sessionIds = Array.from(new Set(sets.map((s: any) => s.sessionId).filter(Boolean)));
          if (sessionIds.length) {
            const sessions: any[] = (await sessionsTable.bulkGet(sessionIds)).filter(Boolean) as any[];
            const endedSessionIds = new Set(
              sessions
                .filter((s: any) => typeof s?.endedAt === "number" && Number.isFinite(s.endedAt) && s.endedAt > 0)
                .map((s: any) => s.id)
            );

            if (endedSessionIds.size) {
              const isSetCompleted = (se: any) => {
                const c = se?.completedAt ?? se?.doneAt ?? se?.finishedAt;
                return typeof c === "number" && Number.isFinite(c) && c > 0;
              };

              hasHistory = sets.some((se: any) => endedSessionIds.has(se.sessionId) && isSetCompleted(se));
            }
          }
        }
      }
    } catch {
      hasHistory = false;
    }

    setDetailsTab(hasHistory ? "history" : "details");
    setViewingId(e.id);
  }

  function closeDetails() {
    setViewingId("");
  }

  function openEdit(e: Exercise) {
    setEditingId(e.id);
    setEditError("");

    setEditName(e.name ?? "");
    setEditBodyPart((e.bodyPart as any) ?? "");
    setEditFocusArea(((e as any).focusArea as any) ?? "");
    setEditAliasesText((e.aliases ?? []).join("\n"));

    setEditMetricMode(normalizeMetricMode((e as any).metricMode));
    setEditMovementPattern(String((e as any).movementPattern ?? ""));
    {
      const rawStrengthSignalRole = String((e as any).strengthSignalRole ?? "")
        .trim()
        .toLowerCase();

      setEditStrengthSignalRole(
        rawStrengthSignalRole === "included" ? "" : rawStrengthSignalRole
      );
    }

    setEditSummary(String((e as any).summary ?? ""));
    setEditDirections(String((e as any).directions ?? ""));

    const cs = Array.isArray((e as any).cuesSetup) ? (e as any).cuesSetup : [];
    const ce = Array.isArray((e as any).cuesExecution) ? (e as any).cuesExecution : [];
    const cm = Array.isArray((e as any).commonMistakes) ? (e as any).commonMistakes : [];

    setEditCuesSetupText((cs ?? []).join("\n"));
    setEditCuesExecutionText((ce ?? []).join("\n"));
    setEditCommonMistakesText((cm ?? []).join("\n"));
    setEditVideoUrl(String((e as any).videoUrl ?? ""));
  }

  function closeEdit() {
    setEditingId("");
    setEditError("");
  }

  async function saveEdit() {
    if (!editingExercise) return;

    const nextName = editName.trim();
    if (!nextName) {
      setEditError("Name is required.");
      return;
    }

    const nextNorm = normalizeName(nextName);
    if (!nextNorm) {
      setEditError("Name is invalid.");
      return;
    }

    if (nextNorm !== editingExercise.normalizedName) {
      const clash = await db.exercises.where("normalizedName").equals(nextNorm).first();
      if (clash && clash.id !== editingExercise.id && !clash.archivedAt && !(clash as any).mergedIntoExerciseId) {
        setEditError(`That name already exists: "${clash.name}".`);
        return;
      }
    }

    const now = Date.now();
    const aliases = normalizeAliases(editAliasesText);

    const summary = textOrUndef(editSummary);
    const directions = textOrUndef(editDirections);
    const cuesSetup = normalizeLines(editCuesSetupText);
    const cuesExecution = normalizeLines(editCuesExecutionText);
    const commonMistakes = normalizeLines(editCommonMistakesText);
    const videoUrl = textOrUndef(editVideoUrl);

    const patch: any = {
      name: nextName,
      normalizedName: nextNorm,
      bodyPart: editBodyPart || undefined,
      updatedAt: now,
      aliases,
      summary,
      directions,
      cuesSetup,
      cuesExecution,
      commonMistakes: commonMistakes.length ? commonMistakes : undefined,
      videoUrl,
      metricMode: normalizeMetricMode(editMetricMode),
      movementPattern: editMovementPattern || undefined,
      strengthSignalRole: editStrengthSignalRole || undefined,
    };

    if (editFocusArea) patch.focusArea = editFocusArea;
    else patch.focusArea = undefined;

    try {
      await db.exercises.update(editingExercise.id, patch);
      closeEdit();
    } catch (err: any) {
      const msg =
        err?.name === "ConstraintError"
          ? "That name conflicts with an existing exercise (case-insensitive)."
          : err?.message || "Failed to save.";
      setEditError(msg);
    }
  }

  return (
    <Page title="Exercises">
      <Section>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>Exercise Catalog</div>

          <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button className="btn small" onClick={() => nav("/templates")}>
              Templates
            </button>

            <button className="btn small" onClick={runSeed} title="Seed catalog (adds missing)">
              Seed
            </button>

            <button
              className="btn small"
              onClick={() => {
                setShowMergeMode((v) => {
                  const next = !v;
                  if (!next) {
                    setSelectedManualMergeIds([]);
                    setSelectedManualKeepExerciseId(null);
                  }
                  return next;
                });
              }}
              title="Manually select exercises from the catalog to merge"
              style={{
                borderColor: showMergeMode ? "var(--accent)" : undefined,
                fontWeight: showMergeMode ? 800 : undefined,
              }}
            >
              {showMergeMode ? "Exit Merge Mode" : "Merge Mode"}
            </button>

            <button
              className="btn small"
              onClick={() => setShowAudit((v) => !v)}
              title="Show read-only exercise hygiene audit and duplicate discovery"
            >
              {showAudit ? "Hide Audit" : "Audit Review"}
            </button>

            <button
              className="btn small"
              onClick={() => setShowArchivedMerged((v) => !v)}
              title="Show archived and merged exercises in the catalog list"
            >
              {showArchivedMerged ? "Hide Archived/Merged" : "Show Archived/Merged"}
            </button>

            <button className="btn small primary" onClick={() => openCreate("")}>
              + New
            </button>
          </div>
        </div>

        {showAudit ? (
          <div
            className="card"
            style={{
              marginTop: 12,
              marginBottom: 12,
              padding: 12,
              border: "1px solid var(--border)",
              borderRadius: 12,
              background: "var(--card)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
                marginBottom: 8,
                flexWrap: "wrap",
              }}
            >
              <div>
                <div style={{ fontWeight: 800 }}>Exercise Audit</div>
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  Review-only duplicate discovery. Use Manual Merge Mode for actual merges and track relinking.
                </div>
              </div>

              {lastMergeSnapshot ? (
                <button
                  type="button"
                  className="btn small"
                  onClick={async () => {
                    const ok = window.confirm("Undo the last exercise merge?");
                    if (!ok) return;

                    try {
                      await undoExerciseMerge(lastMergeSnapshot);
                      setLastMergeSnapshot(null);
                      setSelectedAuditClusterKey(null);
                      setSelectedKeepExerciseId(null);
                      setSelectedMergeSourceIds([]);
                      alert("Last merge undone.");
                    } catch (err) {
                      console.error("Undo exercise merge failed", err);
                      alert(err instanceof Error ? err.message : "Undo exercise merge failed.");
                    }
                  }}
                >
                  Undo Last Merge
                </button>
              ) : null}
            </div>

            {!auditSummary ? (
              <div className="muted">Loading audit...</div>
            ) : (
              <div style={{ fontSize: 14, lineHeight: 1.5 }}>
                <div>Total exercises: {auditSummary.totalExercises}</div>
                <div>Active exercises: {auditSummary.activeExercises}</div>
                <div>Archived exercises: {auditSummary.archivedExercises}</div>
                <div>Merged exercises: {auditSummary.mergedExercises}</div>
                <div>Likely duplicate clusters: {auditSummary.duplicateClusters.length}</div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                    gap: 8,
                    marginTop: 12,
                    marginBottom: 12,
                  }}
                >
                  <div
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                      padding: 10,
                      background: "var(--card)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: 0.3,
                        color: "#15803d",
                        marginBottom: 4,
                      }}
                    >
                      Safe Merge
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 800 }}>
                      {auditSummary.duplicateClusters.filter((c) => c.recommendation === "safe merge").length}
                    </div>
                  </div>

                  <div
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                      padding: 10,
                      background: "var(--card)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: 0.3,
                        color: "#b45309",
                        marginBottom: 4,
                      }}
                    >
                      Review
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 800 }}>
                      {auditSummary.duplicateClusters.filter((c) => c.recommendation === "review").length}
                    </div>
                  </div>

                                    <div
		                      style={{
		                        border: "1px solid var(--border)",
		                        borderRadius: 10,
		                        padding: 10,
		                        background: "var(--card)",
		                      }}
		                    >
		                      <div
		                        style={{
		                          fontSize: 12,
		                          fontWeight: 700,
		                          textTransform: "uppercase",
		                          letterSpacing: 0.3,
		                          color: "#6b7280",
		                          marginBottom: 4,
		                        }}
		                      >
		                        Keep Separate
		                      </div>
		                      <div style={{ fontSize: 22, fontWeight: 800 }}>
		                        {auditSummary.duplicateClusters.filter((c) => c.recommendation === "keep separate").length}
		                      </div>
		                    </div>
		                  </div>
		  
		                  <div
		                    style={{
		                      border: "1px solid var(--border)",
		                      borderRadius: 10,
		                      padding: 10,
		                      background: "var(--card)",
		                      marginTop: 4,
		                      marginBottom: 12,
		                    }}
		                  >
		                    <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>
		                      Cue Coverage Audit
		                    </div>
		  
		                    <div className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
		                      <div>Total active exercises: {cueCoverageSummary.total}</div>
		                      <div>Complete cues (setup + execution): {cueCoverageSummary.complete}</div>
		                      <div>Missing setup cues: {cueCoverageSummary.missingSetup}</div>
		                      <div>Missing execution cues: {cueCoverageSummary.missingExecution}</div>
		                      <div>Missing any cues: {cueCoverageSummary.missingAnyCount}</div>
		                    </div>
		  
		                    <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
		                                          {cueCoverageSummary.missingAnyRows.slice(0, 20).map((row) => (
				                            <div
				                              key={`cue-gap-${row.id}`}
				                              style={{
				                                border: "1px solid var(--border)",
				                                borderRadius: 8,
				                                padding: 8,
				                                background: "var(--card)",
				                              }}
				                            >
				                              <div
				                                className="row"
				                                style={{
				                                  justifyContent: "space-between",
				                                  alignItems: "center",
				                                  gap: 8,
				                                  flexWrap: "wrap",
				                                }}
				                              >
				                                <div style={{ fontWeight: 700 }}>{row.name}</div>
				      
				                                <button
				                                  type="button"
				                                  className="btn small"
				                                  onClick={async () => {
				                                    try {
				                                      await applySeedCuesToExercise(row.id);
				                                    } catch (err) {
				                                      console.error("Apply seed cues failed", err);
				                                      window.alert(
				                                        err instanceof Error ? err.message : "Apply seed cues failed."
				                                      );
				                                    }
				                                  }}
				                                >
				                                  Apply Seed Cues
				                                </button>
				                              </div>
				      
				                              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
				                                Setup cues: {row.hasSetup ? row.setupCount : 0} • Execution cues:{" "}
				                                {row.hasExecution ? row.executionCount : 0}
				                              </div>
				                              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
				                                {!row.hasSetup && !row.hasExecution
				                                  ? "Missing both"
				                                  : !row.hasSetup
				                                  ? "Missing setup cues"
				                                  : "Missing execution cues"}
				                              </div>
				                            </div>
                    ))}
		  
		                      {cueCoverageSummary.missingAnyCount > 20 ? (
		                        <div className="muted" style={{ fontSize: 12 }}>
		                          Showing first 20 exercises missing cues.
		                        </div>
		                      ) : null}
		                    </div>
		                  </div>
		  
                {(() => {
  const filteredClusters =
                    auditFilter === "all"
                      ? auditSummary.duplicateClusters
                      : auditSummary.duplicateClusters.filter((c) => c.recommendation === auditFilter);

                  const selectedCluster =
                    selectedAuditClusterKey != null
                      ? filteredClusters.find((c) => c.key === selectedAuditClusterKey) ?? null
                      : null;

                  return (
                    <>
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 8,
                          marginTop: 4,
                          marginBottom: 12,
                        }}
                      >
                        {(["all", "safe merge", "review", "keep separate"] as const).map((value) => {
                          const active = auditFilter === value;
                          return (
                            <button
                              key={value}
                              type="button"
                              className="btn small"
                              onClick={() => setAuditFilter(value)}
                              style={{
                                borderColor: active ? "var(--accent)" : undefined,
                                fontWeight: active ? 800 : 600,
                              }}
                            >
                              {value === "all"
                                ? "All"
                                : value === "safe merge"
                                ? "Safe Merge"
                                : value === "review"
                                ? "Review"
                                : "Keep Separate"}
                            </button>
                          );
                        })}
                      </div>

                      {selectedCluster ? (
                        <div
                          style={{
                            border: "1px solid var(--border)",
                            borderRadius: 12,
                            padding: 12,
                            background: "var(--card)",
                            marginBottom: 12,
                          }}
                        >
                          <div style={{ fontWeight: 800, marginBottom: 6 }}>Selected cluster</div>
                          <div style={{ fontWeight: 700, marginBottom: 4 }}>Key: {selectedCluster.key}</div>
                          <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                            {selectedCluster.reason}
                          </div>
                          <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
                            Recommendation: {selectedCluster.recommendation}
                          </div>

                          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
                            {selectedKeepExerciseId
                              ? `Canonical: ${
                                  selectedCluster.rows.find((row) => row.exerciseId === selectedKeepExerciseId)?.name ??
                                  "Unknown"
                                }`
                              : "Choose the canonical exercise."}
                          </div>

                          <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
                            {selectedMergeSourceIds.length
                              ? `Selected ${selectedMergeSourceIds.length} possible duplicate exercise(s) for review.`
                              : "No duplicate exercises selected yet."}
                          </div>

                          {selectedKeepExerciseId && selectedMergeSourceIds.length ? (
                            <div
                              style={{
                                border: "1px solid var(--border)",
                                borderRadius: 10,
                                padding: 10,
                                background: "var(--card)",
                                marginBottom: 12,
                              }}
                            >
                              <div style={{ fontWeight: 800, marginBottom: 6 }}>Audit preview</div>

                              <div style={{ fontSize: 13, marginBottom: 6 }}>
                                <strong>Suggested canonical:</strong>{" "}
                                {selectedCluster.rows.find((row) => row.exerciseId === selectedKeepExerciseId)?.name ??
                                  "Unknown"}
                              </div>

                              <div style={{ fontSize: 13, marginBottom: 8 }}>
                                <strong>Possible duplicates:</strong>{" "}
                                {selectedCluster.rows
                                  .filter((row) => selectedMergeSourceIds.includes(row.exerciseId))
                                  .map((row) => row.name)
                                  .join(", ")}
                              </div>

                              {(() => {
                                const mergeRows = selectedCluster.rows.filter((row) =>
                                  selectedMergeSourceIds.includes(row.exerciseId)
                                );

                                const totals = mergeRows.reduce(
                                  (acc, row) => {
                                    acc.tracks += row.trackCount;
                                    acc.templateItems += row.templateItemCount;
                                    acc.sessionItems += row.sessionItemCount;
                                    acc.sets += row.setCount;
                                    return acc;
                                  },
                                  { tracks: 0, templateItems: 0, sessionItems: 0, sets: 0 }
                                );

                                return (
                                  <>
                                    <div className="muted" style={{ fontSize: 12, lineHeight: 1.5, marginBottom: 10 }}>
                                      <div>This audit preview does not perform a full merge.</div>
                                      <div>Tracks, session history, and template usage are not changed here.</div>
                                      <div>Use Manual Merge Mode below for actual merges and track relinking.</div>
                                      <div>
                                        Usage represented by selected duplicates: {totals.sets} sets across{" "}
                                        {totals.tracks} tracks.
                                      </div>
                                    </div>

                                    <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                      <button
                                        type="button"
                                        className="btn small"
                                        onClick={() => {
                                          setShowMergeMode(true);
                                        }}
                                      >
                                        Open Manual Merge Mode
                                      </button>

                                      <button
                                        type="button"
                                        className="btn small"
                                        onClick={() => {
                                          setSelectedKeepExerciseId(null);
                                          setSelectedMergeSourceIds([]);
                                        }}
                                      >
                                        Clear Selection
                                      </button>
                                    </div>
                                  </>
                                );
                              })()}
                            </div>
                          ) : null}

                          <div style={{ marginTop: 12 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
                              Choose the canonical exercise.
                            </div>

                            <div style={{ display: "grid", gap: 6 }}>
                              {selectedCluster.rows.map((row) => {
                                const isKeep = selectedKeepExerciseId === row.exerciseId;
                                const resolvedExercise = (allExercises ?? []).find(
                                  (exercise) => exercise.id === row.exerciseId
                                );
                                const redirectTargetId = String((resolvedExercise as any)?.mergedIntoExerciseId ?? "").trim();
                                const redirectTargetName = redirectTargetId
                                  ? exerciseNameById.get(redirectTargetId) ?? redirectTargetId
                                  : "";

                                return (
                                  <div
                                    key={row.exerciseId}
                                    onClick={() => {
                                      setSelectedKeepExerciseId(row.exerciseId);
                                      setSelectedMergeSourceIds((current) =>
                                        current.filter((id) => id !== row.exerciseId)
                                      );
                                    }}
                                    style={{
                                      border: isKeep ? "2px solid var(--accent)" : "1px solid var(--border)",
                                      borderRadius: 10,
                                      padding: 8,
                                      background: "var(--card)",
                                      cursor: "pointer",
                                    }}
                                  >
                                    <div
                                      style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        gap: 12,
                                        alignItems: "flex-start",
                                      }}
                                    >
                                      <div style={{ fontWeight: 700 }}>{row.name}</div>
                                      <div
                                        style={{
                                          fontSize: 12,
                                          fontWeight: 800,
                                          color: isKeep ? "var(--accent)" : "var(--muted)",
                                          whiteSpace: "nowrap",
                                        }}
                                      >
                                        {isKeep ? "CANONICAL" : "Tap to mark canonical"}
                                      </div>
                                    </div>

                                    {row.aliases.length ? (
                                      <div className="muted" style={{ fontSize: 12 }}>
                                        Aliases: {row.aliases.join(", ")}
                                      </div>
                                    ) : null}

                                    {redirectTargetName ? (
                                      <div
                                        style={{
                                          marginTop: 4,
                                          fontSize: 12,
                                          fontWeight: 700,
                                          color: "#0f766e",
                                        }}
                                      >
                                        Redirects to: {redirectTargetName}
                                      </div>
                                    ) : null}

                                    <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                                      Tracks {row.trackCount} • Template Items {row.templateItemCount} • Session Items{" "}
                                      {row.sessionItemCount} • Sets {row.setCount}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          <div style={{ marginTop: 12 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
                              {selectedKeepExerciseId
                                ? "Choose duplicate exercise(s) to review for merge."
                                : "Choose the canonical exercise before selecting duplicates."}
                            </div>

                            <div style={{ display: "grid", gap: 6 }}>
                              {selectedCluster.rows
                                .filter((row) => row.exerciseId !== selectedKeepExerciseId)
                                .map((row) => {
                                  const isSelected = selectedMergeSourceIds.includes(row.exerciseId);
                                  const disabled = !selectedKeepExerciseId;
                                  const resolvedExercise = (allExercises ?? []).find(
                                    (exercise) => exercise.id === row.exerciseId
                                  );
                                  const redirectTargetId = String((resolvedExercise as any)?.mergedIntoExerciseId ?? "").trim();
                                  const redirectTargetName = redirectTargetId
                                    ? exerciseNameById.get(redirectTargetId) ?? redirectTargetId
                                    : "";

                                  return (
                                    <div
                                      key={`merge-${row.exerciseId}`}
                                      onClick={() => {
                                        if (disabled) return;
                                        setSelectedMergeSourceIds((current) =>
                                          current.includes(row.exerciseId)
                                            ? current.filter((id) => id !== row.exerciseId)
                                            : [...current, row.exerciseId]
                                        );
                                      }}
                                      style={{
                                        border: isSelected ? "2px solid #b45309" : "1px solid var(--border)",
                                        borderRadius: 10,
                                        padding: 8,
                                        background: "var(--card)",
                                        cursor: disabled ? "not-allowed" : "pointer",
                                        opacity: disabled ? 0.65 : 1,
                                      }}
                                    >
                                      <div
                                        style={{
                                          display: "flex",
                                          justifyContent: "space-between",
                                          gap: 12,
                                          alignItems: "flex-start",
                                        }}
                                      >
                                        <div style={{ fontWeight: 700 }}>{row.name}</div>
                                        <div
                                          style={{
                                            fontSize: 12,
                                            fontWeight: 800,
                                            color: isSelected ? "#b45309" : "var(--muted)",
                                            whiteSpace: "nowrap",
                                          }}
                                        >
                                          {isSelected ? "SELECTED" : disabled ? "Pick keep first" : "Tap to review"}
                                        </div>
                                      </div>

                                      {row.aliases.length ? (
                                        <div className="muted" style={{ fontSize: 12 }}>
                                          Aliases: {row.aliases.join(", ")}
                                        </div>
                                      ) : null}

                                      {redirectTargetName ? (
                                        <div
                                          style={{
                                            marginTop: 4,
                                            fontSize: 12,
                                            fontWeight: 700,
                                            color: "#0f766e",
                                          }}
                                        >
                                          Redirects to: {redirectTargetName}
                                        </div>
                                      ) : null}

                                      <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                                        Tracks {row.trackCount} • Template Items {row.templateItemCount} • Session Items{" "}
                                        {row.sessionItemCount} • Sets {row.setCount}
                                      </div>
                                    </div>
                                  );
                                })}
                            </div>
                          </div>
                        </div>
                      ) : null}

                      {filteredClusters.length ? (
                        <div style={{ marginTop: 12 }}>
                          <div style={{ fontWeight: 800, marginBottom: 8 }}>
                            {auditFilter === "all"
                              ? "Likely duplicate clusters"
                              : auditFilter === "safe merge"
                              ? "Safe merge candidates"
                              : auditFilter === "review"
                              ? "Review candidates"
                              : "Keep separate clusters"}
                          </div>

                          <div style={{ display: "grid", gap: 10 }}>
                            {filteredClusters.slice(0, 20).map((cluster) => (
                              <div
                                key={cluster.key}
                                onClick={() => {
                                  setSelectedAuditClusterKey((current) => {
                                    const next = current === cluster.key ? null : cluster.key;
                                    setSelectedKeepExerciseId(null);
                                    setSelectedMergeSourceIds([]);
                                    return next;
                                  });
                                }}
                                style={{
                                  border:
                                    selectedAuditClusterKey === cluster.key
                                      ? "2px solid var(--accent)"
                                      : "1px solid var(--border)",
                                  borderRadius: 10,
                                  padding: 10,
                                  background: "var(--card)",
                                  cursor: "pointer",
                                }}
                              >
                                <div
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    gap: 12,
                                    alignItems: "flex-start",
                                    marginBottom: 4,
                                  }}
                                >
                                  <div style={{ fontWeight: 700 }}>Key: {cluster.key}</div>

                                  <div
                                    style={{
                                      fontSize: 12,
                                      fontWeight: 700,
                                      textTransform: "uppercase",
                                      letterSpacing: 0.3,
                                      whiteSpace: "nowrap",
                                      color:
                                        cluster.recommendation === "safe merge"
                                          ? "#15803d"
                                          : cluster.recommendation === "review"
                                          ? "#b45309"
                                          : "#6b7280",
                                    }}
                                  >
                                    {cluster.recommendation}
                                  </div>
                                </div>

                                <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                                  {cluster.reason}
                                </div>

                                <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
                                  Tracks {cluster.totalTracks} • Template Items {cluster.totalTemplateItems} • Session Items{" "}
                                  {cluster.totalSessionItems} • Sets {cluster.totalSets}
                                </div>

                                <div style={{ display: "grid", gap: 4 }}>
                                  {cluster.rows.map((row) => {
                                    const resolvedExercise = (allExercises ?? []).find(
                                      (exercise) => exercise.id === row.exerciseId
                                    );
                                    const redirectTargetId = String((resolvedExercise as any)?.mergedIntoExerciseId ?? "").trim();
                                    const redirectTargetName = redirectTargetId
                                      ? exerciseNameById.get(redirectTargetId) ?? redirectTargetId
                                      : "";

                                    return (
                                      <div
                                        key={row.exerciseId}
                                        style={{
                                          display: "flex",
                                          justifyContent: "space-between",
                                          gap: 12,
                                          alignItems: "baseline",
                                        }}
                                      >
                                        <div>
                                          <div style={{ fontWeight: 600 }}>{row.name}</div>
                                          {row.aliases.length ? (
                                            <div className="muted" style={{ fontSize: 12 }}>
                                              Aliases: {row.aliases.join(", ")}
                                            </div>
                                          ) : null}
                                          {redirectTargetName ? (
                                            <div
                                              style={{
                                                marginTop: 2,
                                                fontSize: 12,
                                                fontWeight: 700,
                                                color: "#0f766e",
                                              }}
                                            >
                                              Redirects to: {redirectTargetName}
                                            </div>
                                          ) : null}
                                        </div>

                                        <div className="muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                                          Sets {row.setCount}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="muted" style={{ marginTop: 8 }}>
                          No clusters match this filter.
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        ) : null}

        {showMergeMode ? (
          <div
            style={{
              marginTop: 12,
              marginBottom: 12,
              padding: 10,
              border: "1px solid var(--border)",
              borderRadius: 10,
              background: "var(--card)",
            }}
          >
            <div style={{ fontWeight: 800, marginBottom: 4 }}>Manual Merge Mode</div>
            <div className="muted" style={{ fontSize: 13 }}>
              {selectedManualMergeIds.length
                ? `${selectedManualMergeIds.length} exercise(s) selected.`
                : "Tap exercises below to select them for manual merge."}
            </div>

            {selectedManualMergeIds.length >= 2 ? (
              <div
                style={{
                  marginTop: 12,
                  paddingTop: 12,
                  borderTop: "1px solid var(--border)",
                }}
              >
                <div style={{ fontWeight: 800, marginBottom: 8 }}>Manual Merge Preview</div>

                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
                  {selectedManualKeepExerciseId
                    ? `Keeping: ${
                        (exercises ?? []).find((e) => e.id === selectedManualKeepExerciseId)?.name ?? "Unknown"
                      }`
                    : "Choose the exercise to keep."}
                </div>

                <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
                  {selectedManualKeepExerciseId
                    ? `Ready to merge ${
                        selectedManualMergeIds.filter((id) => id !== selectedManualKeepExerciseId).length
                      } exercise(s) into the kept one.`
                    : "Tap one of the selected exercises below to mark it as KEEP."}
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  {(exercises ?? [])
                    .filter((e) => selectedManualMergeIds.includes(e.id))
                    .map((e) => {
                      const isKeep = selectedManualKeepExerciseId === e.id;
                      return (
                        <div
                          key={`manual-merge-${e.id}`}
                          onClick={() => setSelectedManualKeepExerciseId(e.id)}
                          style={{
                            border: isKeep ? "2px solid var(--accent)" : "1px solid var(--border)",
                            borderRadius: 10,
                            padding: 8,
                            background: "var(--card)",
                            cursor: "pointer",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 12,
                              alignItems: "flex-start",
                            }}
                          >
                            <div style={{ fontWeight: 700 }}>{e.name}</div>
                            <div
                              style={{
                                fontSize: 12,
                                fontWeight: 800,
                                color: isKeep ? "var(--accent)" : "var(--muted)",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {isKeep ? "KEEP" : "Tap to keep"}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>

                {(() => {
                  const mergeSourceIds = selectedManualMergeIds.filter(
                    (id) => id !== selectedManualKeepExerciseId
                  );

                  const totalTracks = mergeSourceIds.reduce(
                    (sum, exerciseId) => sum + (mergeUsageByExerciseId?.[exerciseId]?.trackCount ?? 0),
                    0
                  );

                  const totalSets = mergeSourceIds.reduce(
                    (sum, exerciseId) => sum + (mergeUsageByExerciseId?.[exerciseId]?.setCount ?? 0),
                    0
                  );

                  return (
                    <>
                      {selectedManualKeepExerciseId && mergeSourceIds.length ? (
                        <div
                          style={{
                            border: "1px solid var(--border)",
                            borderRadius: 10,
                            padding: 10,
                            background: "var(--card)",
                            marginTop: 12,
                            marginBottom: 10,
                          }}
                        >
                          <div style={{ fontWeight: 800, marginBottom: 6 }}>Merge Impact</div>

                          <div className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
                            <div>
                              Exercises merged: <b>{mergeSourceIds.length}</b>
                            </div>
                            <div>
                              Tracks affected: <b>{totalTracks}</b>
                            </div>
                            <div>
                              Sets affected: <b>{totalSets}</b>
                            </div>
                          </div>
                        </div>
                      ) : null}

                      <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
                        <button
                          type="button"
                          className="btn small primary"
                          disabled={
                            !selectedManualKeepExerciseId ||
                            selectedManualMergeIds.filter((id) => id !== selectedManualKeepExerciseId).length < 1
                          }
                          onClick={async () => {
                            if (!selectedManualKeepExerciseId) return;

                            const mergeSourceIds = selectedManualMergeIds.filter(
                              (id) => id !== selectedManualKeepExerciseId
                            );
                            if (!mergeSourceIds.length) return;

                            const keepName =
                              (exercises ?? []).find((e) => e.id === selectedManualKeepExerciseId)?.name ?? "Unknown";

                            const mergeNames = (exercises ?? [])
                              .filter((e) => mergeSourceIds.includes(e.id))
                              .map((e) => e.name);

                            const ok = window.confirm(
                              `Merge ${mergeNames.join(", ")} into ${keepName}?\n\n` +
                                `This will relink tracks to the kept exercise, add aliases, and archive the merged exercises.`
                            );
                            if (!ok) return;

                            try {
                              const snapshot = await createExerciseMergeRollbackSnapshot({
                                keepExerciseId: selectedManualKeepExerciseId,
                                mergeSourceIds,
                              });

                              await applyExerciseMerge({
                                keepExerciseId: selectedManualKeepExerciseId,
                                mergeSourceIds,
                              });

                              setLastMergeSnapshot(snapshot);
                              setSelectedManualMergeIds([]);
                              setSelectedManualKeepExerciseId(null);

                              alert(`Merged into ${keepName}.`);
                            } catch (err) {
                              console.error("Manual exercise merge failed", err);
                              alert(err instanceof Error ? err.message : "Manual exercise merge failed.");
                            }
                          }}
                        >
                          Apply Manual Merge
                        </button>

                        <button
                          type="button"
                          className="btn small"
                          onClick={() => {
                            setSelectedManualMergeIds([]);
                            setSelectedManualKeepExerciseId(null);
                          }}
                        >
                          Clear Manual Selection
                        </button>
                      </div>
                    </>
                  );
                })()}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="muted" style={{ marginTop: 8 }}>
          Names are case-insensitive. Focus Area is optional (no filter). Coaching fields are editable per exercise.
          <span className="muted" style={{ marginLeft: 10 }}>
            • Tap an exercise name to view Details / History / Charts / Records.
          </span>
        </div>

        <hr />

        <div style={{ position: "relative" }}>
          <input
            className="input"
            placeholder="Search exercises…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ paddingRight: 44 }}
          />

          {q.trim() ? (
            <button
              type="button"
              className="btn small"
              aria-label="Clear search"
              title="Clear search"
              onClick={() => setQ("")}
              style={{
                position: "absolute",
                right: 6,
                top: "50%",
                transform: "translateY(-50%)",
                width: 34,
                height: 34,
                padding: 0,
                borderRadius: 999,
                justifyContent: "center",
              }}
            >
              ✕
            </button>
          ) : null}
        </div>

        <div
          className="row"
          style={{ marginTop: 10, gap: 10, alignItems: "end", flexWrap: "wrap", justifyContent: "space-between" }}
        >
          <div style={{ minWidth: 220, flex: 1 }}>
            <select className="input" value={bodyPart} onChange={(e) => setBodyPart(e.target.value as any)}>
              <option value="">Any Body Part</option>
              {BODY_PARTS.map((bp) => (
                <option key={bp} value={bp}>
                  {bp}
                </option>
              ))}
            </select>
          </div>

          <div className="row" style={{ gap: 8, alignItems: "end" }}>
            <button
              className="btn small"
              onClick={() => setSortAsc((v) => !v)}
              aria-label="Toggle sort"
              title={sortAsc ? "A→Z (tap for Z→A)" : "Z→A (tap for A→Z)"}
              style={{ minWidth: 44, justifyContent: "center" }}
            >
              ↑↓
            </button>

            {(q.trim() || bodyPart) && (
              <button className="btn small" onClick={clearAll} title="Clear all">
                Reset
              </button>
            )}
          </div>
        </div>

        <hr />

        {filtered.length === 0 ? (
          <div>
            <div className="muted">No matches.</div>
            <div className="row" style={{ marginTop: 10, gap: 8 }}>
              <button className="btn primary" onClick={() => openCreate(q)}>
                Create exercise
              </button>
              {(q.trim() || bodyPart) && (
                <button className="btn" onClick={clearAll}>
                  Reset
                </button>
              )}
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {grouped.flatMap((g) =>
              g.items.map((e) => {
                const focus = getFocusArea(e);
                const meta = [e.bodyPart ?? "—", focus].filter(Boolean).join(" • ");

                const cs = safeLen((e as any).cuesSetup);
                const ce = safeLen((e as any).cuesExecution);
                const hasCues = cs + ce > 0;

                const metric = prettyMetricLabel(normalizeMetricMode((e as any).metricMode));

                return (
                  <div key={e.id} className="card" style={{ padding: 12 }}>
                    <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
                      <div
                        role="button"
                        tabIndex={0}
                        className="clickable"
                        onClick={() => void openDetails(e)}
                        onKeyDown={(ev) => {
                          if (ev.key === "Enter" || ev.key === " ") {
                            ev.preventDefault();
                            void openDetails(e);
                          }
                        }}
                        title="View details"
                        style={{ minWidth: 0, flex: 1, cursor: "pointer", borderRadius: 12, padding: 2 }}
                      >
                        <div style={{ fontWeight: 900, wordBreak: "break-word" }}>{e.name}</div>

                        {(e.archivedAt || (e as any).mergedIntoExerciseId) ? (
                          <div className="muted" style={{ marginTop: 4, fontSize: 12, wordBreak: "break-word" }}>
                            {(e as any).mergedIntoExerciseId
                              ? `Merged into ${
                                  exerciseNameById.get((e as any).mergedIntoExerciseId) ??
                                  (e as any).mergedIntoExerciseId
                                }`
                              : "Archived"}
                          </div>
                        ) : null}

                        <div
			  className="muted"
			  style={{
			    marginTop: 6,
			    fontSize: 13,
			    display: "flex",
			    flexWrap: "wrap",
			    gap: 8,
			    alignItems: "center",
			  }}
			>
			  <span>{meta || "—"}</span>
			
			  <span>• Metric {metric}</span>
			
			  {(e as any).movementPattern ? (
			    <span
			      className="badge"
			      style={{
			        fontSize: 11,
			        fontWeight: 700,
			        padding: "2px 8px",
			      }}
			    >
			      Pattern: {String((e as any).movementPattern).replace(/^./, (c) => c.toUpperCase())}
			    </span>
			  ) : null}
			
			  			  {(() => {
			  			    const raw = String((e as any).strengthSignalRole ?? "").trim().toLowerCase();
			  
			  			    let label = "Primary";
			  			    if (raw === "secondary") label = "Secondary";
			  			    else if (raw === "excluded") label = "Excluded";
			  			    else if (raw === "included") label = "Primary";
			  
			  			    return (
			  			      <span
			  			        className="badge"
			  			        style={{
			  			          fontSize: 11,
			  			          fontWeight: 700,
			  			          padding: "2px 8px",
			  			        }}
			  			      >
			  			        Signal: {label}
			  			      </span>
			  			    );
                          })()}
			
			  <span>• Cues {hasCues ? `S${cs} • E${ce}` : "—"}</span>
                       </div>
                        {textOrUndef(String((e as any).summary ?? "")) ? (
                          <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
                            {String((e as any).summary ?? "")}
                          </div>
                        ) : null}
                      </div>

                      <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        {showMergeMode ? (
                          <button
                            type="button"
                            className="btn small"
                            onClick={(evt) => {
                              evt.stopPropagation();
                              toggleManualMergeSelection(e.id);
                            }}
                            style={{
                              borderColor: selectedManualMergeIds.includes(e.id) ? "var(--accent)" : undefined,
                              fontWeight: selectedManualMergeIds.includes(e.id) ? 800 : undefined,
                            }}
                          >
                            {selectedManualMergeIds.includes(e.id) ? "Selected" : "Select"}
                          </button>
                        ) : null}

                        <button
                          className="btn small"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            openEdit(e);
                          }}
                          title="Edit exercise"
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {showCreate ? (
          <div className="card" style={{ padding: 12, marginTop: 14 }}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <div style={{ fontWeight: 900 }}>New Exercise</div>
              <button className="btn small" onClick={() => setShowCreate(false)} aria-label="Close">
                ✕
              </button>
            </div>

            <div className="muted" style={{ marginTop: 6 }}>
              If the name already exists (case-insensitive), we’ll reuse it.
            </div>

            <hr />

            <label>Name</label>
            <input
              className="input"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder="e.g., Barbell Bench Press"
              autoFocus
            />

            <div className="row" style={{ marginTop: 10, gap: 10, flexWrap: "wrap" }}>
              <div style={{ minWidth: 180, flex: 1 }}>
                <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Body Part</div>
                <select className="input" value={draftBodyPart} onChange={(e) => setDraftBodyPart(e.target.value as any)}>
                  <option value="">—</option>
                  {BODY_PARTS.map((bp) => (
                    <option key={bp} value={bp}>
                      {bp}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ minWidth: 180, flex: 1 }}>
                <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Focus Area (optional)</div>
                <select className="input" value={draftFocusArea} onChange={(e) => setDraftFocusArea(e.target.value as any)}>
                  <option value="">—</option>
                  {FOCUS_AREAS.map((fa) => (
                    <option key={fa} value={fa}>
                      {fa}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="row" style={{ marginTop: 12, gap: 8 }}>
              <button className="btn primary" onClick={createExercise} disabled={!draftName.trim()}>
                Save
              </button>
              <button className="btn" onClick={() => setShowCreate(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </Section>

      {viewingExercise ? (
        <ExerciseDetailsModal
          exercise={viewingExercise}
          allExercises={allExercises ?? []}
          tab={detailsTab}
          setTab={setDetailsTab}
          onClose={closeDetails}
          onEdit={() => {
            closeDetails();
            openEdit(viewingExercise);
          }}
        />
      ) : null}

      {editingExercise ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" onMouseDown={closeEdit}>
          <div
            className="card modal-card"
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              maxWidth: 820,
              width: "min(820px, calc(100vw - 24px))",
              maxHeight: "calc(100vh - 24px)",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <button className="btn small" onClick={closeEdit} aria-label="Close">
                ✕
              </button>

              <div style={{ textAlign: "center", flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 900,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  Edit Exercise
                </div>
                <div
                  className="muted"
                  style={{
                    marginTop: 4,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {editingExercise.name}
                </div>
              </div>

              <button className="btn small" onClick={() => nav("/templates")}>
                Templates
              </button>
            </div>

            <hr />

            <div style={{ paddingRight: 2, overflowY: "auto", maxHeight: "min(680px, calc(100vh - 250px))" }}>
              <div className="card" style={{ padding: 12 }}>
                {editError ? (
                  <div className="card" style={{ padding: 10, marginBottom: 10 }}>
                    <div style={{ fontWeight: 900 }}>Can’t save</div>
                    <div className="muted" style={{ marginTop: 6 }}>
                      {editError}
                    </div>
                  </div>
                ) : null}

                <label>Name</label>
                <input className="input" value={editName} onChange={(e) => setEditName(e.target.value)} />

                <div className="row" style={{ marginTop: 10, gap: 10, flexWrap: "wrap" }}>
                  <div style={{ minWidth: 180, flex: 1 }}>
                    <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Body Part</div>
                    <select className="input" value={editBodyPart} onChange={(e) => setEditBodyPart(e.target.value as any)}>
                      <option value="">—</option>
                      {BODY_PARTS.map((bp) => (
                        <option key={bp} value={bp}>
                          {bp}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ minWidth: 180, flex: 1 }}>
                    <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Focus Area (optional)</div>
                    <select className="input" value={editFocusArea} onChange={(e) => setEditFocusArea(e.target.value as any)}>
                      <option value="">—</option>
                      {FOCUS_AREAS.map((fa) => (
                        <option key={fa} value={fa}>
                          {fa}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

               <div style={{ marginTop: 10 }}>
	         <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Primary Metric</div>
	         <select
	           className="input"
	           value={editMetricMode}
	           onChange={(e) => setEditMetricMode(normalizeMetricMode(e.target.value))}
	           title="Controls how GymPage logs this exercise (reps vs distance vs time)"
	         >
	           <option value="reps">Reps (default)</option>
	           <option value="distance">Distance</option>
	           <option value="time">Time</option>
	         </select>
	         <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
	           Reps = weight + reps (+ RIR). Distance = weight + distance. Time = mm:ss.
	         </div>
	       </div>
	       
	       <div className="row" style={{ marginTop: 10, gap: 10, flexWrap: "wrap" }}>
	         <div style={{ minWidth: 180, flex: 1 }}>
	           <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Movement Pattern</div>
	           <select
	             className="input"
	             value={editMovementPattern}
	             onChange={(e) => setEditMovementPattern(e.target.value)}
	             title="Primary movement pattern used for movement breakdown and future classification cleanup"
	           >
	             <option value="">—</option>
	             <option value="push">Push</option>
	             <option value="pull">Pull</option>
	             <option value="hinge">Hinge</option>
	             <option value="squat">Squat</option>
	             <option value="carry">Carry</option>
	             <option value="lunge">Lunge</option>
	           </select>
	         </div>
	       
		   <div style={{ minWidth: 180, flex: 1 }}>
		     <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Strength Signal Role</div>
		     <select
		       className="input"
		       value={editStrengthSignalRole}
		       onChange={(e) => setEditStrengthSignalRole(e.target.value)}
		       title="Controls how strongly this exercise contributes to Strength Signal"
		     >
		       <option value="">Primary / Default</option>
		       <option value="secondary">Secondary (downweighted)</option>
		       <option value="excluded">Excluded</option>
		     </select>
         </div>
	       </div>
	       
	       <div className="muted" style={{ marginTop: 6, fontSize: 12, lineHeight: 1.4 }}>
	         <div>
	           <strong>Movement Pattern</strong>: Used for movement breakdown and balance (push, pull, squat, hinge, etc).
	         </div>
	         	         <div style={{ marginTop: 4 }}>
		 	           <strong>Strength Signal Role</strong>: Controls how strongly this exercise contributes to Strength Signal.
		 	           Leave blank for <b>primary/default</b> lifts, use <b>Secondary</b> for accessories you still want counted
		 	           at reduced weight, and use <b>Excluded</b> for movements that should not affect the signal.
	         </div>
                </div>

                <div style={{ marginTop: 10 }}>
                  <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Aliases (optional)</div>
                  <textarea
                    className="input"
                    value={editAliasesText}
                    onChange={(e) => setEditAliasesText(e.target.value)}
                    placeholder={"e.g.\nBB Bench\nBench Press"}
                    style={{ minHeight: 92, resize: "vertical" as any }}
                  />
                  <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                    One per line (or comma-separated). Used for search only.
                  </div>
                </div>

                <hr />

                <div style={{ fontWeight: 900, marginBottom: 6 }}>Coaching</div>

                <div style={{ marginTop: 10 }}>
                  <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Summary (optional)</div>
                  <textarea
                    className="input"
                    value={editSummary}
                    onChange={(e) => setEditSummary(e.target.value)}
                    placeholder={"1–2 lines: what/why\n(e.g., 'Heavy hinge pattern for posterior chain strength.')."}
                    style={{ minHeight: 72, resize: "vertical" as any }}
                  />
                </div>

                <div style={{ marginTop: 10 }}>
                  <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Directions (optional)</div>
                  <textarea
                    className="input"
                    value={editDirections}
                    onChange={(e) => setEditDirections(e.target.value)}
                    placeholder={"Step-by-step instructions (short is fine)."}
                    style={{ minHeight: 110, resize: "vertical" as any }}
                  />
                </div>

                <div className="row" style={{ marginTop: 10, gap: 10, flexWrap: "wrap" }}>
                  <div style={{ minWidth: 260, flex: 1 }}>
                    <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Cues — Setup (one per line)</div>
                    <textarea
                      className="input"
                      value={editCuesSetupText}
                      onChange={(e) => setEditCuesSetupText(e.target.value)}
                      placeholder={"Feet set\nBrace\nUpper back tight"}
                      style={{ minHeight: 140, resize: "vertical" as any }}
                    />
                  </div>

                  <div style={{ minWidth: 260, flex: 1 }}>
                    <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Cues — Execution (one per line)</div>
                    <textarea
                      className="input"
                      value={editCuesExecutionText}
                      onChange={(e) => setEditCuesExecutionText(e.target.value)}
                      placeholder={"Control down\nKnees track\nDrive through mid-foot"}
                      style={{ minHeight: 140, resize: "vertical" as any }}
                    />
                  </div>
                </div>

                <div style={{ marginTop: 10 }}>
                  <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                    Common mistakes (optional; one per line)
                  </div>
                  <textarea
                    className="input"
                    value={editCommonMistakesText}
                    onChange={(e) => setEditCommonMistakesText(e.target.value)}
                    placeholder={"Losing brace\nKnees cave\nRushing the eccentric"}
                    style={{ minHeight: 110, resize: "vertical" as any }}
                  />
                </div>

                <div style={{ marginTop: 10 }}>
                  <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Video URL (optional)</div>
                  <input
                    className="input"
                    value={editVideoUrl}
                    onChange={(e) => setEditVideoUrl(e.target.value)}
                    placeholder={"https://…"}
                  />
                  <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                    You can store a demo link here.
                  </div>
                </div>

                <hr />

                <div
                  className="row"
                  style={{ justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}
                >
                  <div className="muted" style={{ fontSize: 12 }}>
                    Copy a portable coaching block for GymPage / notes.
                  </div>

                  <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                    <button
                      className="btn small"
                      type="button"
                      onClick={() => {
                        if (!editingExercise) return;
                        const previewPatch: any = {
                          name: editName.trim() || editingExercise.name,
                          bodyPart: editBodyPart || editingExercise.bodyPart,
                          metricMode: editMetricMode,
                          summary: textOrUndef(editSummary),
                          directions: textOrUndef(editDirections),
                          cuesSetup: normalizeLines(editCuesSetupText),
                          cuesExecution: normalizeLines(editCuesExecutionText),
                          commonMistakes: normalizeLines(editCommonMistakesText),
                          videoUrl: textOrUndef(editVideoUrl),
                        };
                        const txt = buildClipboardText(editingExercise, previewPatch);
                        copyTextToClipboard(txt);
                      }}
                      title="Copy using current form values (even before saving)"
                    >
                      Copy cues
                    </button>

                    <button
                      className="btn small"
                      type="button"
                      onClick={() => {
                        if (!editingExercise) return;
                        const txt = buildClipboardText(editingExercise);
                        copyTextToClipboard(txt);
                      }}
                      title="Copy from saved DB values"
                    >
                      Copy saved
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <button className="btn primary" style={{ width: "100%", padding: "12px 14px" }} onClick={saveEdit}>
                Save
              </button>
              <button className="btn" style={{ width: "100%", padding: "12px 14px", marginTop: 8 }} onClick={closeEdit}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </Page>
  );
}

/* ========================================================================== */
/*  TAIL (end of file)                                                        */
/*  - Default export = ExercisesPage                                          */
/*  - BUILD_ID: 2026-02-25-EX-07                                              */
/* ========================================================================== */