// /src/pages/HistoryPage.tsx
/* ============================================================================
   HistoryPage.tsx — Session History (Strong-ish, compact rows)
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-03-01-HIST-06

   Version history
   - 2026-02-23  HIST-03  ✅ Strong-like “…” menu pattern (both sections)
                         ✅ View details opens /session/:sessionId
                         ✅ One menu open at a time + outside click/ESC close
   - 2026-02-23  HIST-04  ✅ Tight compact row layout (mobile-first)
                         ✅ Title + Date on one line
                         ✅ Metrics line with icons (duration / total / PRs)
                         ✅ Move Done + “…” hard-right
                         ✅ Batch compute totals + PRs (no N+1 queries)
   - 2026-02-23  HIST-05  ✅ Standard “…” dropdown styling (dark menu, hover, danger)
                         ✅ FIX: clicking Done / menu no longer opens session details
   - 2026-03-01  HIST-06  ✅ Imported sessions w/o endedAt are NOT "In progress" forever
                         ✅ In-progress = endedAt missing AND last activity is recent
                         ✅ Optional duration estimate from set timestamps (when endedAt missing)
   ============================================================================ */

import React, { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate } from "react-router-dom";
import { db, SetEntry, type Exercise, type Track, type BodyMetricEntry } from "../db";
import { ActionMenu as SharedActionMenu, MenuIcons, MenuItem } from "../components/ActionMenu";
import { safeParsePrsCount } from "../lib/safeParsePrsCount";
import { computeSessionTotalLifted } from "../lib/sessionTotalLifted";
import type { PRHit } from "../prs";

/* =============================================================================
   Breadcrumb 0 — Types + helpers
   ============================================================================= */

type SessionRow = {
  id: string;
  templateName?: string;
  startedAt: number;
  endedAt?: number;
  prsJson?: string;
};

type HistorySessionKind = "workout" | "class" | "walk";
type HistoryFilterKey = "all" | "workouts" | "classes" | "walks";

type SessionActivityContext = {
  name: string;
  trackTypes: Set<Track["trackType"]>;
  trackNames: string[];
};

const HISTORY_FILTER_OPTIONS: ReadonlyArray<{ key: HistoryFilterKey; label: string }> = [
  { key: "all", label: "All" },
  { key: "workouts", label: "Workouts" },
  { key: "classes", label: "Classes" },
  { key: "walks", label: "Walks" },
];

const HISTORY_COMPLETED_BATCH_SIZE = 15;

const HISTORY_CLASS_NAME_PATTERNS = [
  "body balance",
  "body core",
  "bodycombat",
  "body combat",
  "bodypump",
  "body pump",
  "pilates",
  "yoga",
  "zumba",
  "spin class",
  "boxing class",
] as const;

const HISTORY_WALK_NAME_PATTERNS = [
  "walk",
  "walking",
  "treadmill walk",
  "incline walk",
] as const;

const HISTORY_WORKOUT_NAME_PATTERNS = [
  "upper",
  "lower",
  "push",
  "pull",
  "legs",
  "hinge",
  "squat",
  "glutes",
  "chest",
  "back",
  "shoulders",
  "arms",
  "full body",
  "workout",
] as const;

function normalizeHistoryLabel(value?: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesAnyPattern(value: string, patterns: readonly string[]) {
  return patterns.some((pattern) => value.includes(pattern));
}

function classifyHistorySession(context: SessionActivityContext): HistorySessionKind {
  const sessionName = normalizeHistoryLabel(context.name);
  const activityNames = normalizeHistoryLabel(context.trackNames.join(" "));

  if (sessionName && includesAnyPattern(sessionName, HISTORY_WALK_NAME_PATTERNS)) {
    return "walk";
  }

  if (sessionName && includesAnyPattern(sessionName, HISTORY_CLASS_NAME_PATTERNS)) {
    return "class";
  }

  if (
    context.trackTypes.size > 0 &&
    Array.from(context.trackTypes).every((trackType) => trackType === "conditioning") &&
    activityNames &&
    includesAnyPattern(activityNames, HISTORY_WALK_NAME_PATTERNS)
  ) {
    return "walk";
  }

  if (
    context.trackTypes.has("strength") ||
    context.trackTypes.has("hypertrophy") ||
    context.trackTypes.has("technique")
  ) {
    return "workout";
  }

  if (sessionName && includesAnyPattern(sessionName, HISTORY_WORKOUT_NAME_PATTERNS)) {
    return "workout";
  }

  return "workout";
}

function sessionMatchesHistoryFilter(kind: HistorySessionKind, filter: HistoryFilterKey) {
  if (filter === "all") return true;
  if (filter === "workouts") return kind === "workout";
  if (filter === "classes") return kind === "class";
  return kind === "walk";
}

function parseSessionPrHits(prsJson?: string): PRHit[] {
  if (!prsJson) return [];
  try {
    const parsed = JSON.parse(prsJson);
    return Array.isArray(parsed) ? (parsed as PRHit[]) : [];
  } catch {
    return [];
  }
}

function formatPrBestSet(hit: PRHit): string {
  const preferred =
    hit.weight ??
    hit.volume ??
    hit.e1rm;

  if (!preferred) return "";
  return `${Math.round(preferred.weight)} x ${Math.round(preferred.reps)}`;
}

function MetaSeparator() {
  return (
    <span aria-hidden="true" style={{ whiteSpace: "nowrap", padding: "0 4px" }}>
      {"\u00b7"}
    </span>
  );
}

function fmtDayShort(ms: number) {
  try {
    const d = new Date(ms);
    return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }); // "Mon, Feb 23"
  } catch {
    return "—";
  }
}

function formatDurationShortFromMs(ms: number) {
  const mins = Math.max(0, Math.round(ms / 60000));
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (m <= 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatDurationShort(startedAt: number, endedAt?: number) {
  if (!endedAt || !Number.isFinite(endedAt)) return "—";
  const ms = Math.max(0, endedAt - startedAt);
  return formatDurationShortFromMs(ms);
}

function fmtTotal(n: number) {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 10000) return `${Math.round(n / 1000)}k`;
  return `${Math.round(n)}`;
}

function hasMeaningfulHistorySetData(se: SetEntry) {
  return (
    (typeof se.weight === "number" && Number.isFinite(se.weight)) ||
    (typeof se.reps === "number" && se.reps > 0) ||
    (typeof se.seconds === "number" && se.seconds > 0) ||
    (typeof (se as any).distance === "number" && (se as any).distance > 0) ||
    (typeof se.completedAt === "number" && Number.isFinite(se.completedAt) && se.completedAt > 0)
  );
}

/* =============================================================================
   Breadcrumb 2 — Page component
   ============================================================================= */

export default function HistoryPage() {
  const nav = useNavigate();
  const [activeFilter, setActiveFilter] = useState<HistoryFilterKey>("all");
  const [expandedPrSessionIds, setExpandedPrSessionIds] = useState<string[]>([]);
  const [visibleCompletedCount, setVisibleCompletedCount] = useState(HISTORY_COMPLETED_BATCH_SIZE);

  const sessions = useLiveQuery(async () => {
    const all = (await db.sessions.toArray()) as any[];
    all.sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
    return all as SessionRow[];
  }, []);

  // Batch-load sets once, compute totals per session.
  const setsAll = useLiveQuery(async () => {
    return (await db.sets.toArray()) as SetEntry[];
  }, []);

  const tracks = useLiveQuery(async () => {
    return (await db.tracks.toArray()) as Track[];
  }, []);

  const exercises = useLiveQuery(async () => {
    const ids = Array.from(new Set((tracks ?? []).map((t) => t.exerciseId).filter(Boolean)));
    if (!ids.length) return [] as Exercise[];
    const arr = await db.exercises.bulkGet(ids);
    return arr.filter(Boolean) as Exercise[];
  }, [tracks?.map((t) => t.exerciseId).join("|") ?? ""]);

  const bodyMetrics = useLiveQuery(async () => {
    const table = (db as any).bodyMetrics;
    if (!table || typeof table.toArray !== "function") return [] as BodyMetricEntry[];
    return (await table.toArray()) as BodyMetricEntry[];
  }, []);

  const trackById = useMemo(() => {
    return new Map((tracks ?? []).map((track) => [track.id, track]));
  }, [tracks]);

  const exerciseById = useMemo(() => {
    return new Map((exercises ?? []).map((exercise) => [exercise.id, exercise]));
  }, [exercises]);

  const totalsBySession = useMemo(() => {
    const sessionById = new Map((sessions ?? []).map((s) => [s.id, s]));
    const trackById = new Map((tracks ?? []).map((t) => [t.id, t]));
    const exerciseById = new Map((exercises ?? []).map((e) => [e.id, e]));
    const groupedSets = new Map<string, SetEntry[]>();

    for (const se of setsAll ?? []) {
      if (!se?.sessionId) continue;
      const bucket = groupedSets.get(se.sessionId) ?? [];
      bucket.push(se);
      groupedSets.set(se.sessionId, bucket);
    }

    const map = new Map<string, number>();

    for (const [sessionId, sessionSets] of groupedSets) {
      const session = sessionById.get(sessionId);
      if (!session) continue;
      const sessionAt = Number(session.endedAt ?? session.startedAt);
      map.set(
        sessionId,
        computeSessionTotalLifted({
          sets: sessionSets,
          sessionAt,
          trackById,
          exerciseById,
          bodyMetrics: bodyMetrics ?? [],
        })
      );
    }

    return map;
  }, [setsAll, sessions, tracks, exercises, bodyMetrics]);

  const hasMeaningfulSetDataBySession = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const se of setsAll ?? []) {
      if (!se?.sessionId) continue;
      if (!hasMeaningfulHistorySetData(se)) continue;
      map.set(se.sessionId, true);
    }
    return map;
  }, [setsAll]);

  const historySessionKindById = useMemo(() => {
    const contextBySession = new Map<string, SessionActivityContext>();

    for (const session of sessions ?? []) {
      contextBySession.set(session.id, {
        name: session.templateName ?? "",
        trackTypes: new Set<Track["trackType"]>(),
        trackNames: [],
      });
    }

    for (const se of setsAll ?? []) {
      if (!se?.sessionId || !se.trackId) continue;
      const context = contextBySession.get(se.sessionId);
      const track = trackById.get(se.trackId);
      if (!context || !track) continue;

      context.trackTypes.add(track.trackType);

      const trackName = normalizeHistoryLabel(track.displayName);
      if (trackName && !context.trackNames.includes(trackName)) {
        context.trackNames.push(trackName);
      }

      const exercise = exerciseById.get(track.exerciseId);
      const exerciseName = normalizeHistoryLabel(exercise?.name);
      if (exerciseName && !context.trackNames.includes(exerciseName)) {
        context.trackNames.push(exerciseName);
      }
    }

    const kindById = new Map<string, HistorySessionKind>();
    for (const session of sessions ?? []) {
      const context =
        contextBySession.get(session.id) ??
        ({
          name: session.templateName ?? "",
          trackTypes: new Set<Track["trackType"]>(),
          trackNames: [],
        } satisfies SessionActivityContext);
      kindById.set(session.id, classifyHistorySession(context));
    }

    return kindById;
  }, [sessions, setsAll, trackById, exerciseById]);

  /* =============================================================================
     Breadcrumb 2b — Import-tolerant completion + duration estimate
     - If endedAt exists => completed (normal)
     - If endedAt missing:
         - Consider "in progress" ONLY if last activity is recent (default 18h)
         - Otherwise treat as completed (import-safe)
     - Duration:
         - endedAt present => real duration
         - else if has sets => estimate from first..last set timestamps (createdAt/completedAt)
   ============================================================================= */

  const lastActivityBySession = useMemo(() => {
    const map = new Map<string, { first?: number; last?: number; count: number }>();
    for (const se of setsAll ?? []) {
      const sid = (se as any)?.sessionId;
      if (!sid) continue;

      const t = Number((se as any)?.completedAt ?? (se as any)?.createdAt);
      if (!Number.isFinite(t) || t <= 0) continue;

      const cur = map.get(sid) ?? { first: undefined, last: undefined, count: 0 };
      cur.count += 1;
      cur.first = cur.first == null ? t : Math.min(cur.first, t);
      cur.last = cur.last == null ? t : Math.max(cur.last, t);
      map.set(sid, cur);
    }
    return map;
  }, [setsAll]);

  const IN_PROGRESS_RECENT_MS = 18 * 60 * 60 * 1000; // 18h: safe for gym reality + imports

  function isSessionInProgress(s: SessionRow): boolean {
    // If endedAt is set and valid => not in progress
    const endedAt = Number((s as any)?.endedAt);
    if (Number.isFinite(endedAt) && endedAt > 0) return false;

    // If endedAt missing:
    // If there's no activity at all, treat as in progress (true "shell" session)
    const act = lastActivityBySession.get(s.id);
    if (!act || !act.last || !Number.isFinite(act.last)) return true;

    // Activity exists: in progress only if recent; otherwise it's an imported/old session.
    const age = Date.now() - act.last;
    return age >= 0 && age <= IN_PROGRESS_RECENT_MS;
  }

  function getSessionDurationLabel(s: SessionRow, showInProgress: boolean): string {
    if (showInProgress) return "—";

    // Prefer real endedAt
    const endedAt = Number((s as any)?.endedAt);
    if (Number.isFinite(endedAt) && endedAt > 0) return formatDurationShort(s.startedAt, endedAt);

    // Estimate from set activity
    const act = lastActivityBySession.get(s.id);
    if (!act?.first || !act?.last) return "—";

    const ms = Math.max(0, act.last - act.first);
    // If there's almost no spread, avoid lying
    if (ms < 2 * 60 * 1000) return "—"; // <2 min
    // Clamp to sane bounds
    const clamped = Math.min(ms, 4 * 60 * 60 * 1000); // <=4h
    return formatDurationShortFromMs(clamped);
  }

  const { inProgress, completed } = useMemo(() => {
    const all = (sessions ?? []).filter((s) => {
      const endedAt = Number((s as any)?.endedAt);
      if (Number.isFinite(endedAt) && endedAt > 0) return true;
      if ((s.templateName ?? "").trim() !== "Ad-hoc") return true;
      return !!hasMeaningfulSetDataBySession.get(s.id);
    });
    const filtered = all.filter((session) => {
      const kind = historySessionKindById.get(session.id) ?? "workout";
      return sessionMatchesHistoryFilter(kind, activeFilter);
    });
    const inProgress = filtered.filter((s) => isSessionInProgress(s));
    const completed = filtered.filter((s) => !isSessionInProgress(s));
    return { inProgress, completed };
  }, [sessions, lastActivityBySession, hasMeaningfulSetDataBySession, historySessionKindById, activeFilter]);

  useEffect(() => {
    setVisibleCompletedCount(HISTORY_COMPLETED_BATCH_SIZE);
  }, [activeFilter]);

  const visibleCompleted = useMemo(() => {
    return completed.slice(0, visibleCompletedCount);
  }, [completed, visibleCompletedCount]);

  const remainingCompletedCount = Math.max(0, completed.length - visibleCompleted.length);

  async function deleteSessionCascade(sessionId: string) {
    const ok = window.confirm("Delete this session? This cannot be undone.");
    if (!ok) return;

    const anyDb = db as any;
    const sessionItemsTable = anyDb.sessionItems;
    const prsTable = anyDb.prs;

    const tables: any[] = [db.sessions, db.sets];
    if (sessionItemsTable) tables.push(sessionItemsTable);
    if (prsTable) tables.push(prsTable);

    await db.transaction("rw", ...tables, async () => {
      await db.sets.where("sessionId").equals(sessionId).delete();
      if (sessionItemsTable) await sessionItemsTable.where("sessionId").equals(sessionId).delete();
      if (prsTable) await prsTable.where("sessionId").equals(sessionId).delete();
      await db.sessions.delete(sessionId);
    });
  }

  function openSessionDetails(sessionId: string) {
    nav(`/session/${sessionId}`);
  }

  function resumeSession(sessionId: string) {
    nav(`/gym/${sessionId}`);
  }

  function togglePrDetails(sessionId: string) {
    setExpandedPrSessionIds((current) =>
      current.includes(sessionId) ? current.filter((id) => id !== sessionId) : [...current, sessionId]
    );
  }

  // one menu open at a time

  /* =============================================================================
     Breadcrumb 3 — Compact row layout
     ============================================================================= */

  function RowMeta({ s, showInProgress }: { s: SessionRow; showInProgress: boolean }) {
    const date = fmtDayShort(s.startedAt);
    const dur = getSessionDurationLabel(s, showInProgress);
    const total = totalsBySession.get(s.id) ?? 0;
    const prHits = parseSessionPrHits(s.prsJson);
    const prs = prHits.length || safeParsePrsCount(s.prsJson);
    const hasPrDetails = prHits.length > 0;
    const prsExpanded = expandedPrSessionIds.includes(s.id);
    const metaParts = [
      date,
      !showInProgress && dur !== "—" ? dur : null,
      `${fmtTotal(total)} lb`,
    ].filter((value): value is string => !!value);

    return (
      <div style={{ minWidth: 0, flex: "1 1 auto" }}>
        {/* Line 1: Title */}
        <div style={{ display: "flex", minWidth: 0, maxWidth: "100%" }}>
          <div
            className="card-title"
            data-testid={`history-template:${s.id}`}
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              minWidth: 0,
              flex: "1 1 180px",
            }}
          >
            {s.templateName ?? "Ad-hoc"}
          </div>

        </div>

        {/* Line 2: Metadata */}
        <div
          className="muted"
          style={{
            marginTop: 4,
            display: "flex",
            gap: 0,
            alignItems: "center",
            flexWrap: "wrap",
            fontSize: 13,
            minWidth: 0,
          }}
          data-testid={`history-metrics:${s.id}`}
        >
          {metaParts.map((part, index) => {
            const testId =
              index === 0
                ? `history-date:${s.id}`
                : part === dur
                  ? `history-duration:${s.id}`
                  : part.includes("lb")
                    ? `history-total:${s.id}`
                    : undefined;

            return (
              <span key={`${s.id}-${part}-${index}`} data-testid={testId} style={{ whiteSpace: "nowrap" }}>
                {index > 0 ? <MetaSeparator /> : null}
                {part}
              </span>
            );
          })}
          {metaParts.length > 0 ? <MetaSeparator /> : null}
          {hasPrDetails ? (
            <button
              type="button"
              className="muted"
              data-testid={`history-prs-toggle:${s.id}`}
              aria-expanded={prsExpanded}
              onClick={(e) => {
                e.stopPropagation();
                togglePrDetails(s.id);
              }}
              style={{
                border: "none",
                background: "transparent",
                padding: 0,
                margin: 0,
                cursor: "pointer",
                fontSize: 13,
                color: "inherit",
                textDecoration: "underline",
                textUnderlineOffset: 2,
                whiteSpace: "nowrap",
              }}
            >
              {prs} PR{prs === 1 ? "" : "s"}
            </button>
          ) : (
            <span data-testid={`history-prs:${s.id}`} style={{ whiteSpace: "nowrap" }}>
              {prs} PR{prs === 1 ? "" : "s"}
            </span>
          )}
        </div>
        {hasPrDetails && prsExpanded ? (
          <div
            data-testid={`history-prs-panel:${s.id}`}
            style={{
              marginTop: 7,
              paddingTop: 7,
              borderTop: "1px solid var(--line)",
              minWidth: 0,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="muted"
              style={{ fontSize: 11, letterSpacing: "0.03em", marginBottom: 3 }}
            >
              PRs
            </div>
            <div style={{ display: "grid", gap: 3 }} data-testid={`history-prs-list:${s.id}`}>
              {prHits.map((hit) => (
                <div
                  key={`${s.id}-${hit.trackId}`}
                  style={{
                    minWidth: 0,
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr) auto",
                    alignItems: "baseline",
                    columnGap: 8,
                    lineHeight: 1.3,
                    fontSize: 13,
                  }}
                >
                  <span
                    title={hit.trackName}
                    style={{
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      fontWeight: 500,
                    }}
                  >
                    {hit.trackName}
                  </span>
                  <span className="muted" style={{ whiteSpace: "nowrap" }}>
                    {formatPrBestSet(hit)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="card" data-testid="history-page">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <h2 data-testid="history-title" style={{ margin: 0 }}>
          History
        </h2>
      </div>

      <p className="muted">Review past sessions. Resume anything still in progress.</p>
      <div
        className="row"
        style={{ gap: 8, flexWrap: "wrap", marginTop: 10, marginBottom: 2 }}
        data-testid="history-filters"
      >
        {HISTORY_FILTER_OPTIONS.map((option) => {
          const selected = activeFilter === option.key;
          return (
            <button
              key={option.key}
              type="button"
              className="badge"
              data-testid={`history-filter:${option.key}`}
              aria-pressed={selected}
              onClick={() => setActiveFilter(option.key)}
              style={{
                cursor: "pointer",
                border: "none",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: 28,
                padding: "4px 10px",
                background: selected ? "rgba(15,23,42,0.08)" : "#f3f4f6",
                color: selected ? "#0f172a" : "var(--muted)",
                boxShadow: selected ? "inset 0 0 0 1px rgba(15,23,42,0.12)" : "none",
                opacity: 1,
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <hr />

      {sessions === undefined ? (
        <div className="muted" data-testid="history-loading">
          Loading…
        </div>
      ) : (
        <div data-testid="history-ready">
          {/* In progress */}
          <div className="card" style={{ marginBottom: 14 }} data-testid="history-inprogress">
            <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
              <h3 style={{ margin: 0 }}>In progress</h3>
              <span className="badge" data-testid="history-inprogress-count">
                {inProgress.length}
              </span>
            </div>

            <div className="list" style={{ marginTop: 12 }} data-testid="history-inprogress-list">
              {inProgress.length ? (
                inProgress.map((s) => {
                  const menuItems: MenuItem[] = [
                    { label: "Resume", icon: MenuIcons.edit, onClick: () => resumeSession(s.id) },
                    { label: "View details", icon: MenuIcons.share, onClick: () => openSessionDetails(s.id) },
                    { type: "sep" },
                    { label: "Delete", icon: MenuIcons.trash, danger: true, onClick: () => deleteSessionCascade(s.id) },
                  ];

                  return (
                    <div
                      key={s.id}
                      className="card list-card clickable"
                      role="button"
                      tabIndex={0}
                      data-testid={`history-inprogress-card:${s.id}`}
                      onClick={() => openSessionDetails(s.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") openSessionDetails(s.id);
                      }}
                      style={{ position: "relative", paddingTop: 10, paddingBottom: 10 }}
                    >
                      <div
                        className="card-head"
                        style={{
                          alignItems: "flex-start",
                          justifyContent: "space-between",
                          gap: 12,
                          width: "100%",
                          maxWidth: "100%",
                          minWidth: 0,
                          boxSizing: "border-box",
                        }}
                      >
                        <RowMeta s={s} showInProgress={true} />

                        {/* Breadcrumb 3b — Actions cluster (STOP CLICK BUBBLE HERE) */}
                        <div
                          className="row"
                          style={{ gap: 4, alignItems: "center", flexShrink: 0, marginLeft: 4 }}
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                        >
                          <span className="badge" style={{ paddingInline: 8, minHeight: 24 }}>
                            In progress
                          </span>
                          <SharedActionMenu
                            theme="light"
                            compact
                            ariaLabel="Open session actions"
                            items={menuItems}
                            minWidth={196}
                            offsetX={2}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="muted" style={{ marginTop: 10 }}>
                  No in-progress sessions.
                </p>
              )}
            </div>
          </div>

          {/* Completed */}
          <div className="card" data-testid="history-completed">
            <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
              <h3 style={{ margin: 0 }}>Completed</h3>
              <span className="badge" data-testid="history-completed-count">
                {completed.length}
              </span>
            </div>

            <div className="list" style={{ marginTop: 12 }} data-testid="history-completed-list">
              {completed.length ? (
                visibleCompleted.map((s) => {
                  const menuItems: MenuItem[] = [
                    { label: "View details", icon: MenuIcons.share, onClick: () => openSessionDetails(s.id) },
                    { type: "sep" },
                    { label: "Delete", icon: MenuIcons.trash, danger: true, onClick: () => deleteSessionCascade(s.id) },
                  ];

                  return (
                    <div
                      key={s.id}
                      className="card list-card clickable"
                      role="button"
                      tabIndex={0}
                      data-testid={`history-completed-card:${s.id}`}
                      onClick={() => openSessionDetails(s.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") openSessionDetails(s.id);
                      }}
                      style={{ position: "relative", paddingTop: 10, paddingBottom: 10 }}
                    >
                      <div
                        className="card-head"
                        style={{
                          alignItems: "flex-start",
                          justifyContent: "space-between",
                          gap: 12,
                          width: "100%",
                          maxWidth: "100%",
                          minWidth: 0,
                          boxSizing: "border-box",
                        }}
                      >
                        <RowMeta s={s} showInProgress={false} />

                        {/* Breadcrumb 3c — Actions cluster (STOP CLICK BUBBLE HERE) */}
                        <div
                          className="row"
                          style={{ gap: 4, alignItems: "center", flexShrink: 0, marginLeft: 4 }}
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                        >
                          <span className="badge" style={{ paddingInline: 8, minHeight: 24 }}>
                            Done
                          </span>
                          <SharedActionMenu
                            theme="light"
                            compact
                            ariaLabel="Open session actions"
                            items={menuItems}
                            minWidth={196}
                            offsetX={2}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="muted" style={{ marginTop: 10 }}>
                  No completed sessions yet.
                </p>
              )}
            </div>
            {remainingCompletedCount > 0 ? (
              <div style={{ marginTop: 12, display: "grid", gap: 8, justifyItems: "start" }}>
                <button
                  type="button"
                  className="btn"
                  data-testid="history-load-more"
                  onClick={() => setVisibleCompletedCount((count) => count + HISTORY_COMPLETED_BATCH_SIZE)}
                  style={{ minHeight: 36, paddingInline: 14 }}
                >
                  Load {Math.min(HISTORY_COMPLETED_BATCH_SIZE, remainingCompletedCount)} more
                </button>
                <div className="muted" data-testid="history-load-more-status" style={{ fontSize: 12 }}>
                  Showing {visibleCompleted.length} of {completed.length}
                </div>
              </div>
            ) : completed.length > HISTORY_COMPLETED_BATCH_SIZE ? (
              <div className="muted" data-testid="history-load-more-status" style={{ marginTop: 12, fontSize: 12 }}>
                Showing {visibleCompleted.length} of {completed.length}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

