// src/pages/StartPage.tsx
/* ============================================================================
   StartPage.tsx — Start hub + template launcher + template hierarchy
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-03-08-STARTPAGE-08

   Purpose
   - Make Start the operational control center
   - Keep template list as the workout launcher surface
   - Keep TemplatesPage as the management home
   - Preserve mesocycles (folders) and grouped template hierarchy

   Changes (STARTPAGE-08)
   ✅ Repair full file structure after iterative edits
   ✅ Fix Ungrouped kebab by using explicit open-state logic
   ✅ Default Ungrouped to open on first load
   ✅ Keep Continue Session compact ribbon subtitle
   ✅ Compress Start hub action spacing for mobile
   ✅ Keep Strong-like child template cards
   ✅ Preserve existing modal/template launch behavior

   Revision history
   - 2026-02-11  UI-01  Initial Strong-ish Start + folder grouping + tile ...
   - 2026-02-18  SP-02  Folder actions menu on Start: Rename/Delete folder
                       (Delete moves templates to Ungrouped)
                       Dedicated outside-click close for folder menu
   - 2026-02-19  SP-03  Swap tile "..." menu to ActionMenu (Strong-like)
                       Removes old tileMenuTemplateId positioning issues
   - 2026-02-20  SP-04  Option B: compact Strong-like rows (not tiles)
                       Remove redundant Show/Hide label (chevron only)
                       Use ActionMenu pattern for folder kebab too
   - 2026-02-20  SP-05  True hierarchy: folder-group header + nested children
                       Ungrouped behaves like a folder (collapsible)
                       Uses CSS: folder-group / head / body / rail
   - 2026-03-08  SP-06  Add Start hub action cards above Templates section
   - 2026-03-08  SP-07  Bundle Start page polish + active session cleanup
   - 2026-03-08  SP-08  Fix Ungrouped kebab/state + compress Start action spacing
   ============================================================================ */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate } from "react-router-dom";
import { db, Template, TemplateItem, Track, Folder, Session } from "../db";
import { uuid } from "../utils";
import { Page, Section } from "../components/Page.tsx";
import { ActionMenu, MenuIcons, MenuItem } from "../components/ActionMenu";
import {
  formatCardioDuration,
  formatCardioPace,
  formatCardioWalkDateTime,
  formatDistanceMiKm,
  pluralizeWalk,
} from "../lib/cardio/formatCardioWalk";
import { buildCoachExportMetrics } from "../lib/coachExport/buildCoachExportMetrics";
import type { CoachExportMetrics } from "../lib/coachExport/types";
import { buildCoachStateFromExportMetrics } from "../lib/coachState/buildCoachState";
import type { CoachState } from "../lib/coachState/coachStateTypes";
import { buildCoachReport } from "../lib/coachReport/buildCoachReport";
import type { CoachReport } from "../lib/coachReport/coachReportTypes";
import {
  COACH_DASHBOARD_REFRESH_EVENT,
  dispatchCoachDashboardRefresh,
} from "../lib/coachDashboardEvents";

/* ============================================================================
   Breadcrumb 1 — Helpers
   ============================================================================ */

function fmtAgo(ms?: number) {
  if (!ms) return "—";
  const diff = Date.now() - ms;
  const days = Math.floor(diff / 86400000);
  if (days < 1) return "Today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function isPausedSession(ms?: number) {
  if (!ms) return false;
  const diff = Date.now() - ms;
  return diff > 2 * 60 * 60 * 1000; // > 2 hours
}

function fmtDurationSince(ms?: number) {
  if (!ms) return "";
  const diff = Math.max(0, Date.now() - ms);

  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "<1 min";
  if (mins < 60) return `${mins} min`;

  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;

  if (rem === 0) return `${hrs} hr`;
  return `${hrs} hr ${rem} min`;
}

function fmtCoachStatus(value?: string) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "—";
  if (normalized === "not_enough_data") return "Not Enough Data";
  return normalized
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function fmtCoachConfidence(value?: string) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "high") return "High";
  if (normalized === "moderate" || normalized === "medium") return "Moderate";
  if (normalized === "low") return "Low";
  return "—";
}

function fmtConfidencePhrase(value?: string) {
  const label = fmtCoachConfidence(value);
  return label === "—" ? "—" : `${label} confidence`;
}

function fmtNumber(value?: number | null, decimals = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const fixed = value.toFixed(decimals);
  return fixed.replace(/\.0+$/, "");
}

function fmtSignedNumber(value?: number | null, decimals = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const fixed = value.toFixed(decimals).replace(/\.0+$/, "");
  return value > 0 ? `+${fixed}` : fixed;
}

function fmtCoachBodyTrendDisplay(
  metric:
    | {
        rawLatest: number | null;
        rolling5: number | null;
        sampleCount: number;
      }
    | null
    | undefined,
  unit: string,
  options: {
    order?: "latest-first" | "average-first";
    decimals?: number;
  } = {}
) {
  if (!metric) return "—";

  const decimals = options.decimals ?? 1;
  const hasLatest = metric.rawLatest != null && Number.isFinite(metric.rawLatest);
  const hasAverage = metric.rolling5 != null && Number.isFinite(metric.rolling5);
  const distinctAverage =
    hasLatest &&
    hasAverage &&
    metric.sampleCount > 1 &&
    Math.abs((metric.rolling5 as number) - (metric.rawLatest as number)) > 0.0001;

  const fmt = (value: number | null | undefined) =>
    typeof value === "number" && Number.isFinite(value) ? `${fmtNumber(value, decimals)}${unit}` : "—";

  if (distinctAverage) {
    const latest = `latest ${fmt(metric.rawLatest)}`;
    const average = `${fmt(metric.rolling5)} coach avg`;
    return options.order === "average-first" ? `${average} · ${latest}` : `${latest} · ${average}`;
  }

  if (hasLatest) {
    if (hasAverage && metric.sampleCount > 1) {
      return `${fmt(metric.rawLatest)} latest / ${fmt(metric.rolling5)} coach avg`;
    }
    return `${fmt(metric.rawLatest)} latest/manual`;
  }

  if (hasAverage) {
    return `${fmt(metric.rolling5)} coach avg`;
  }

  return "—";
}

function fmtCardioWindowSummary(
  count?: number,
  durationSeconds?: number,
  distanceMeters?: number
) {
  const parts = [count != null ? pluralizeWalk(count) : null];
  if (typeof durationSeconds === "number" && Number.isFinite(durationSeconds) && durationSeconds > 0) {
    parts.push(formatCardioDuration(durationSeconds) || null);
  }
  if (typeof distanceMeters === "number" && Number.isFinite(distanceMeters) && distanceMeters > 0) {
    parts.push(formatDistanceMiKm(distanceMeters));
  }
  return parts.filter(Boolean).join(" | ") || "—";
}

function fmtCardioRecentSummary(recent?: NonNullable<CoachState["cardio"]["recent"]> | null) {
  if (!recent) return "—";
  const parts = [
    formatCardioWalkDateTime(recent.startedAt),
    recent.name,
    formatCardioDuration(recent.durationSeconds) || null,
    formatDistanceMiKm(recent.distanceMeters) || null,
    formatCardioPace(recent.paceSecondsPerMile) || null,
  ].filter(Boolean);
  return parts.join(" | ") || "—";
}

type CoachStateAnchor = NonNullable<CoachState["strength"]["anchors"]>[number];

const COACH_DASHBOARD_LOAD_TIMEOUT_MS = 4500;
const COACH_DASHBOARD_LOAD_TIMEOUT_OVERRIDE_KEY = "IRONFORGE_COACH_DASHBOARD_TIMEOUT_MS";
const COACH_DASHBOARD_DEBUG_KEY = "IRONFORGE_DEBUG_COACH_DASHBOARD";

function isCoachDashboardDebugEnabled() {
  try {
    return localStorage.getItem(COACH_DASHBOARD_DEBUG_KEY) === "1";
  } catch {
    return false;
  }
}

function coachDashboardLog(...args: unknown[]) {
  if (!isCoachDashboardDebugEnabled()) return;
  console.info("[coach-dashboard]", ...args);
}

function getCoachDashboardLoadTimeoutMs() {
  try {
    const raw = localStorage.getItem(COACH_DASHBOARD_LOAD_TIMEOUT_OVERRIDE_KEY);
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  } catch {}
  return COACH_DASHBOARD_LOAD_TIMEOUT_MS;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutId: number | undefined;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId != null) {
      window.clearTimeout(timeoutId);
    }
  }
}

function fmtAnchorSummary(anchor?: CoachStateAnchor | null) {
  if (!anchor) return "—";
  const parts = [
    anchor.pattern
      ? `${String(anchor.pattern).charAt(0).toUpperCase()}${String(anchor.pattern).slice(1)}`
      : "",
    anchor.exerciseName ?? anchor.trackDisplayName ?? "",
  ].filter(Boolean);
  const load = [
    anchor.effectiveWeightLb != null ? `${fmtNumber(anchor.effectiveWeightLb)} lb` : null,
    anchor.reps != null ? `${fmtNumber(anchor.reps, 0)} reps` : null,
  ]
    .filter(Boolean)
    .join(" x ");
  const e1rm = anchor.e1rm != null ? `e1RM ${fmtNumber(anchor.e1rm)} lb` : "";
  const age =
    typeof anchor.ageDays === "number" && Number.isFinite(anchor.ageDays)
      ? `${Math.max(0, Math.floor(anchor.ageDays))}d old`
      : null;
  const recency =
    anchor.recency === "stale"
      ? "stale anchor"
      : anchor.recency === "historical"
        ? "historical anchor"
        : anchor.recency === "recent"
          ? "recent anchor"
          : null;
  return [parts.join(": "), load, e1rm, age, recency].filter(Boolean).join(" | ");
}

function fmtSnapshotWhy(state: CoachState) {
  return state.snapshot.narrative ?? state.snapshot.biggestRisk ?? state.snapshot.biggestWin ?? "—";
}

function fmtPerformanceRead(state: CoachState) {
  const trend = String(state.strength.performanceTrend ?? "").trim();
  const movement = String(state.strength.movementQuality ?? "").trim();
  const anchor = state.strength.anchors?.[0];
  const hasHistoricalAnchor =
    anchor?.recency === "historical" || anchor?.recency === "stale" || anchor?.isStale;

  if (trend === "Regressing" || trend === "Mixed" || movement === "Watch" || movement === "Mixed") {
    return hasHistoricalAnchor
      ? "Historical anchors remain useful, but recent strength signal is pressured."
      : "Recent strength signal is pressured.";
  }

  if (trend === "Improving") {
    return "Recent strength trend is improving, with cleaner movement noted in recent sessions.";
  }

  if (trend === "Stable") {
    return "Strength is holding steady, with no major movement-quality limiter in recent sessions.";
  }

  return hasHistoricalAnchor
    ? "Historical anchors are still useful context."
    : "Recent performance evidence is still building.";
}

function fmtGoalRead(state: CoachState) {
  const rows = state.goals.targets ?? [];
  if (!rows.length) return "—";

  const findRow = (pattern: RegExp) => rows.find((row) => pattern.test(row.label));
  const weight = findRow(/^Weight$/i);
  const waist = findRow(/waist/i);
  const bodyFat = findRow(/body fat/i);
  const status = String(state.goals.trajectoryStatus ?? "").trim().toLowerCase();

  const weightClose =
    weight != null &&
    typeof weight.remaining === "number" &&
    Number.isFinite(weight.remaining) &&
    weight.remaining <= Math.max(5, Math.abs(weight.target) * 0.08);
  const bodyCompNeedsConfirmation =
    [waist, bodyFat].filter(
      (row) => row != null && typeof row.remaining === "number" && Number.isFinite(row.remaining) && row.remaining > 0
    ).length > 0;

  if (status === "watch") {
    if (weightClose && bodyCompNeedsConfirmation) {
      return "Weight goal is close, but waist/body-fat goals need cleaner confirmation.";
    }
    return "Trajectory is watchable; keep the cut conservative and confirm the body-composition trend.";
  }

  if (status === "intervene") {
    return "Body-composition trend is not yet close enough to relax progression.";
  }

  if (status === "solid") {
    return "Goal trajectory is moving in the right direction.";
  }

  return "Goal trajectory still needs more data before it can be called clearly.";
}

type TemplatePreviewRow = {
  template: Template;
  itemCount: number;
  lastPerformedAt?: number;
  exerciseNamesPreview: string[];
};

const OPEN_FOLDERS_KEY = "STARTPAGE_OPEN_FOLDERS_V1";
const UNGROUPED_KEY = "__UNGROUPED__";

function hasCoachDashboardSourceData(metrics?: CoachExportMetrics | null) {
  if (!metrics) return false;
  return Boolean(
    metrics.bodyComp.weight.latest != null ||
      metrics.bodyComp.waist.latest != null ||
      metrics.bodyComp.bodyFatPct.latest != null ||
      metrics.bodyComp.leanMass.latest != null ||
      metrics.bodyComp.visceralFat?.latest != null ||
      metrics.bodyComp.waistToHeight?.latest != null ||
      (metrics.cardioSummary?.normalizedWalks?.length ?? 0) > 0 ||
      (typeof metrics.strengthSignal.current === "number" && metrics.strengthSignal.current !== 0) ||
      (typeof metrics.strengthSignal.delta14d === "number" && metrics.strengthSignal.delta14d !== 0) ||
      (typeof metrics.strengthSignal.vs90dBestPct === "number" && metrics.strengthSignal.vs90dBestPct !== 0) ||
      (metrics.anchorLifts ?? []).some(
        (anchor) =>
          anchor.exerciseName != null ||
          anchor.trackDisplayName != null ||
          anchor.effectiveWeightLb != null ||
          anchor.reps != null ||
          anchor.e1rm != null ||
          anchor.performedAt != null
      ) ||
      (metrics.goalProgress?.rows?.length ?? 0) > 0 ||
      (metrics.coachingMemory?.validatedLearnings?.length ?? 0) > 0 ||
      (metrics.coachingMemory?.activeWatchItems?.length ?? 0) > 0 ||
      (metrics.coachingMemory?.resolvedItems?.length ?? 0) > 0 ||
      (metrics.currentMovementFocus?.some((group) => (group.exercises?.length ?? 0) > 0) ?? false)
  );
}

function lruCompare(a: TemplatePreviewRow, b: TemplatePreviewRow) {
  const aNever = a.lastPerformedAt == null;
  const bNever = b.lastPerformedAt == null;
  if (aNever && !bNever) return -1;
  if (!aNever && bNever) return 1;

  const aTime = a.lastPerformedAt ?? Number.NEGATIVE_INFINITY;
  const bTime = b.lastPerformedAt ?? Number.NEGATIVE_INFINITY;
  if (aTime !== bTime) return aTime - bTime; // oldest first

  const ao = (a.template as any).orderIndex as number | undefined;
  const bo = (b.template as any).orderIndex as number | undefined;
  const aHas = ao != null;
  const bHas = bo != null;
  if (aHas && bHas && ao !== bo) return ao! - bo!;
  if (aHas && !bHas) return -1;
  if (!aHas && bHas) return 1;

  return a.template.name.localeCompare(b.template.name);
}

/* ============================================================================
   Breadcrumb 2 — Component
   ============================================================================ */

export default function StartPage() {
  const navigate = useNavigate();

  /* --------------------------------------------------------------------------
     Breadcrumb 3 — DB reads
     ----------------------------------------------------------------------- */
  const folders = useLiveQuery(() => db.folders?.orderBy("orderIndex").toArray(), []);
  const templates = useLiveQuery(() => db.templates.orderBy("name").toArray(), []);
  const templateItems = useLiveQuery(() => db.templateItems.toArray(), []);
  const tracks = useLiveQuery(() => db.tracks.toArray(), []);
  const sessions = useLiveQuery(() => db.sessions.toArray(), []);

  /* --------------------------------------------------------------------------
     Breadcrumb 4 — UI state
     ----------------------------------------------------------------------- */
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [coachState, setCoachState] = useState<CoachState | null>(null);
  const [coachMetrics, setCoachMetrics] = useState<CoachExportMetrics | null>(null);
  const [coachReport, setCoachReport] = useState<CoachReport | null>(null);
  const [coachLoading, setCoachLoading] = useState<boolean>(true);
  const [coachStateError, setCoachStateError] = useState<string | null>(null);
  const [hasLoadedCoachDashboard, setHasLoadedCoachDashboard] = useState(false);
  const coachStateRef = useRef<CoachState | null>(null);
  const hasLoadedRef = useRef(false);
  const mountedRef = useRef(false);
  const initialRefreshRequestedRef = useRef(false);
  const refreshRequestIdRef = useRef(0);

  useEffect(() => {
    coachStateRef.current = coachState;
  }, [coachState]);

  useEffect(() => {
    hasLoadedRef.current = hasLoadedCoachDashboard;
  }, [hasLoadedCoachDashboard]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const [openFolderIds, setOpenFolderIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(OPEN_FOLDERS_KEY);
      if (!raw) return new Set([UNGROUPED_KEY]);

      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        return new Set(arr.filter((x) => typeof x === "string"));
      }
    } catch {}

    return new Set([UNGROUPED_KEY]);
  });

  useEffect(() => {
    try {
      localStorage.setItem(OPEN_FOLDERS_KEY, JSON.stringify(Array.from(openFolderIds)));
    } catch {}
  }, [openFolderIds]);

  const refreshCoachDashboard = useCallback(async (reason: "initial" | "background" = "background") => {
    const requestId = ++refreshRequestIdRef.current;
    const preserveExisting = hasLoadedRef.current || coachStateRef.current != null;
    const startedAt = Date.now();
    const shouldShowLoading = reason === "initial" || !preserveExisting;

    if (shouldShowLoading) {
      setCoachLoading(true);
    }

    coachDashboardLog(`[${requestId}] refresh start`, {
      reason,
      preserveExisting,
    });

    try {
      coachDashboardLog(`[${requestId}] buildCoachExportMetrics start`);
      const metricsStartedAt = Date.now();
      const metrics = await withTimeout(
        buildCoachExportMetrics(),
        getCoachDashboardLoadTimeoutMs(),
        "buildCoachExportMetrics"
      );
      coachDashboardLog(`[${requestId}] buildCoachExportMetrics complete`, {
        elapsedMs: Date.now() - metricsStartedAt,
      });
      if (!mountedRef.current || requestId !== refreshRequestIdRef.current) {
        coachDashboardLog(`[${requestId}] refresh stale after metrics`);
        return;
      }

      coachDashboardLog(`[${requestId}] buildCoachStateFromExportMetrics start`);
      const stateStartedAt = Date.now();
      const nextCoachState = buildCoachStateFromExportMetrics(metrics);
      coachDashboardLog(`[${requestId}] buildCoachStateFromExportMetrics complete`, {
        elapsedMs: Date.now() - stateStartedAt,
      });
      if (!mountedRef.current || requestId !== refreshRequestIdRef.current) {
        coachDashboardLog(`[${requestId}] refresh stale after coach state`);
        return;
      }

      setCoachMetrics(metrics);
      setCoachState(nextCoachState);
      setCoachReport(
        buildCoachReport({
          coachState: nextCoachState,
          metrics,
          generatedAt: metrics.generatedAt,
        })
      );
      setCoachStateError(null);
      setHasLoadedCoachDashboard(true);
    } catch (err: any) {
      coachDashboardLog(`[${requestId}] refresh failed`, {
        elapsedMs: Date.now() - startedAt,
        error: err?.message ?? String(err),
      });
      if (!mountedRef.current || requestId !== refreshRequestIdRef.current) return;
      if (!preserveExisting) {
        setCoachMetrics(null);
        setCoachState(null);
        setCoachReport(null);
        setCoachStateError(err?.message || "Coach dashboard unavailable.");
        setHasLoadedCoachDashboard(true);
      }
    } finally {
      if (!mountedRef.current || requestId !== refreshRequestIdRef.current) return;
      if (shouldShowLoading) {
        setCoachLoading(false);
      }
      coachDashboardLog(`[${requestId}] refresh complete`, {
        elapsedMs: Date.now() - startedAt,
      });
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (initialRefreshRequestedRef.current) {
      return () => {
        mountedRef.current = false;
      };
    }

    initialRefreshRequestedRef.current = true;
    void refreshCoachDashboard("initial");

    return () => {
      mountedRef.current = false;
    };
  }, [refreshCoachDashboard]);

  useEffect(() => {
    const onRefreshEvent = () => {
      void refreshCoachDashboard("background");
    };

    window.addEventListener(COACH_DASHBOARD_REFRESH_EVENT, onRefreshEvent);
    window.addEventListener("storage", onRefreshEvent);

    return () => {
      window.removeEventListener(COACH_DASHBOARD_REFRESH_EVENT, onRefreshEvent);
      window.removeEventListener("storage", onRefreshEvent);
    };
  }, [refreshCoachDashboard]);

  /* --------------------------------------------------------------------------
     Breadcrumb 5 — Derived maps
     ----------------------------------------------------------------------- */
  const itemsByTemplate = useMemo(() => {
    const map = new Map<string, TemplateItem[]>();
    for (const it of templateItems ?? []) {
      const arr = map.get(it.templateId) ?? [];
      arr.push(it);
      map.set(it.templateId, arr);
    }
    for (const [, arr] of map) arr.sort((a, b) => a.orderIndex - b.orderIndex);
    return map;
  }, [templateItems]);

  const trackMap = useMemo(() => new Map((tracks ?? []).map((t) => [t.id, t] as const)), [tracks]);

  const lastPerformedFromSessions = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of sessions ?? []) {
      if (!s.templateId) continue;
      const ended = s.endedAt ?? s.startedAt;
      const prev = map.get(s.templateId);
      if (!prev || ended > prev) map.set(s.templateId, ended);
    }
    return map;
  }, [sessions]);

  /* --------------------------------------------------------------------------
     Breadcrumb 6 — Visibility rules
     ----------------------------------------------------------------------- */
  const visibleFolders = useMemo(() => {
    const all = (folders ?? []) as Folder[];
    return all.filter((f: any) => !(f as any).archivedAt);
  }, [folders]);

  const folderIdSet = useMemo(() => new Set(visibleFolders.map((f) => f.id)), [visibleFolders]);

  const visibleTemplates = useMemo(() => {
    const all = (templates ?? []) as Template[];
    return all.filter((t: any) => !(t as any).archivedAt);
  }, [templates]);

  /* --------------------------------------------------------------------------
     Breadcrumb 7 — Continue session detection
     Active session rules:
     - must not be ended
     - must not be deleted
     - must be recent (prevents old imported sessions from appearing as active)
     ----------------------------------------------------------------------- */
  const activeSession = useMemo(() => {
    const all = (sessions ?? []) as Session[];
    const now = Date.now();
    const RECENT_WINDOW_MS = 12 * 60 * 60 * 1000; // 12 hours

    const open = all.filter((s: any) => {
      if ((s as any).deletedAt) return false;
      if (s.endedAt != null) return false;
      if (!s.startedAt || !Number.isFinite(s.startedAt)) return false;
      return now - s.startedAt <= RECENT_WINDOW_MS;
    });

    if (!open.length) return null;
    return open.sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))[0] ?? null;
  }, [sessions]);

  const renderedCoachReport = useMemo(() => {
    if (coachReport) return coachReport;
    if (!coachState || !coachMetrics) return null;
    return buildCoachReport({
      coachState,
      metrics: coachMetrics,
      generatedAt: coachMetrics.generatedAt,
    });
  }, [coachReport, coachMetrics, coachState]);

  const hasCoachDashboardContent = useMemo(() => hasCoachDashboardSourceData(coachMetrics), [coachMetrics]);

  const lastCompletedSession = useMemo(() => {
    const all = (sessions ?? []) as Session[];
    return all
      .filter((s: any) => !(s as any).deletedAt && typeof s.endedAt === "number" && Number.isFinite(s.endedAt))
      .sort((a, b) => (b.endedAt ?? b.startedAt ?? 0) - (a.endedAt ?? a.startedAt ?? 0))[0] ?? null;
  }, [sessions]);

  /* --------------------------------------------------------------------------
     Breadcrumb 8 — Build template previews + group into folders
     ----------------------------------------------------------------------- */
  const previews: TemplatePreviewRow[] = useMemo(() => {
    const arr: TemplatePreviewRow[] = [];

    for (const t of visibleTemplates) {
      const items = itemsByTemplate.get(t.id) ?? [];
      const lp =
        (t as any).lastPerformedAt != null
          ? (t as any).lastPerformedAt
          : lastPerformedFromSessions.get(t.id);

      const names: string[] = [];
      for (const it of items) {
        const tr = trackMap.get(it.trackId);
        if (!tr) continue;
        const label = String((tr as any).displayName ?? "").trim();
        if (label) names.push(label);
      }

      arr.push({
        template: t,
        itemCount: items.length,
        lastPerformedAt: lp,
        exerciseNamesPreview: names,
      });
    }

    return arr;
  }, [visibleTemplates, itemsByTemplate, lastPerformedFromSessions, trackMap]);

  const recentTemplates = useMemo(() => {
    return previews
      .filter((row) => typeof row.lastPerformedAt === "number" && Number.isFinite(row.lastPerformedAt))
      .slice()
      .sort((a, b) => (b.lastPerformedAt ?? 0) - (a.lastPerformedAt ?? 0))
      .slice(0, 5);
  }, [previews]);

  const grouped = useMemo(() => {
    const folderMap = new Map<string, TemplatePreviewRow[]>();
    const ungrouped: TemplatePreviewRow[] = [];

    for (const row of previews) {
      const fid = (row.template as any).folderId as string | undefined;
      if (!fid || !folderIdSet.has(fid)) {
        ungrouped.push(row);
      } else {
        const arr = folderMap.get(fid) ?? [];
        arr.push(row);
        folderMap.set(fid, arr);
      }
    }

    for (const [, arr] of folderMap) arr.sort(lruCompare);
    ungrouped.sort(lruCompare);

    return { folderMap, ungrouped };
  }, [previews, folderIdSet]);

  const selectedTemplate = useMemo(() => {
    if (!selectedTemplateId) return null;
    return (templates ?? []).find((t) => t.id === selectedTemplateId) ?? null;
  }, [templates, selectedTemplateId]);

  const selectedItems = useMemo(() => {
    if (!selectedTemplate) return [];
    return itemsByTemplate.get(selectedTemplate.id) ?? [];
  }, [selectedTemplate, itemsByTemplate]);

  const selectedTracksOrdered: Track[] = useMemo(() => {
    const out: Track[] = [];
    for (const it of selectedItems) {
      const tr = trackMap.get(it.trackId);
      if (tr) out.push(tr);
    }
    return out;
  }, [selectedItems, trackMap]);

  /* --------------------------------------------------------------------------
     Breadcrumb 9 — Template actions
     ----------------------------------------------------------------------- */
  async function renameTemplate(t: Template) {
    const next = window.prompt("Rename template:", t.name);
    if (!next) return;
    const name = next.trim();
    if (!name) return;
    await db.templates.update(t.id, { name } as any);
  }

  async function archiveTemplate(t: Template) {
    await db.templates.update(t.id, { archivedAt: Date.now() } as any);
    if (selectedTemplateId === t.id) closeModal();
  }

  async function deleteTemplate(t: Template) {
    const ok = window.confirm(`Delete template "${t.name}"?\n\nThis cannot be undone.`);
    if (!ok) return;

    await db.transaction("rw", db.templates, db.templateItems, async () => {
      const its = await db.templateItems.where("templateId").equals(t.id).toArray();
      await db.templateItems.bulkDelete(its.map((i) => i.id));
      await db.templates.delete(t.id);
    });

    if (selectedTemplateId === t.id) closeModal();
  }

  /* --------------------------------------------------------------------------
     Breadcrumb 10 — Folder actions
     ----------------------------------------------------------------------- */
  async function renameFolder(f: Folder) {
    const next = window.prompt("Rename folder:", f.name);
    if (!next) return;
    const name = next.trim();
    if (!name) return;

    const active = (folders ?? []).filter((x: any) => !x.archivedAt && x.id !== f.id) as any[];
    const existing = new Set(active.map((x) => String(x.name ?? "").trim()));
    let safe = name;
    if (existing.has(safe)) {
      let n = 2;
      while (existing.has(`${safe} (${n})`)) n += 1;
      safe = `${safe} (${n})`;
    }

    await db.folders.update(f.id, { name: safe } as any);
  }

  async function deleteFolder(f: Folder) {
    const ok = window.confirm(`Delete folder "${f.name}"?\n\nTemplates in this folder will be moved to Ungrouped.`);
    if (!ok) return;

    await db.transaction("rw", db.folders, db.templates, async () => {
      await db.templates.where("folderId").equals(f.id).modify({ folderId: undefined } as any);
      await db.folders.delete(f.id);
    });

    setOpenFolderIds((prev) => {
      const next = new Set(prev);
      next.delete(f.id);
      return next;
    });
  }

  /* --------------------------------------------------------------------------
     Breadcrumb 11 — Session starts
     ----------------------------------------------------------------------- */
  async function startEmptyWorkout() {
    const sessionId = uuid();
    const now = Date.now();

    await db.sessions.add({
      id: sessionId,
      templateName: "Ad-hoc",
      startedAt: now,
    } as any);

    dispatchCoachDashboardRefresh("session:add");
    navigate(`/gym/${sessionId}`);
  }

  async function startFromTemplate(t: Template) {
    const sessionId = uuid();
    const now = Date.now();

    await db.transaction("rw", db.sessions, db.templates, db.templateItems, db.tracks, db.sets, async () => {
      await db.sessions.add({
        id: sessionId,
        templateId: t.id,
        templateName: t.name,
        startedAt: now,
      } as any);

      const items = await db.templateItems.where("templateId").equals(t.id).sortBy("orderIndex");
      if (!items.length) return;

      const trackIds = items.map((i) => i.trackId);
      const trs = await db.tracks.where("id").anyOf(trackIds).toArray();
      const tmap = new Map(trs.map((x) => [x.id, x] as const));

      let tick = 0;
      const setRows: any[] = [];

      for (const it of items) {
        const tr = tmap.get(it.trackId);
        if (!tr) continue;

        const warmups =
          typeof (it as any).warmupSetsOverride === "number"
            ? (it as any).warmupSetsOverride
            : (tr as any).warmupSetsDefault ?? 0;

        const workings =
          typeof (it as any).workingSetsOverride === "number"
            ? (it as any).workingSetsOverride
            : (tr as any).workingSetsDefault ?? 0;

        for (let i = 0; i < Math.max(0, warmups); i++) {
          setRows.push({
            id: uuid(),
            sessionId,
            trackId: tr.id,
            setType: "warmup",
            createdAt: now + tick++,
          });
        }

        for (let i = 0; i < Math.max(0, workings); i++) {
          setRows.push({
            id: uuid(),
            sessionId,
            trackId: tr.id,
            setType: "working",
            createdAt: now + tick++,
          });
        }
      }

      if (setRows.length) await db.sets.bulkAdd(setRows as any);
    });

    dispatchCoachDashboardRefresh("workout:add");
    closeModal();
    navigate(`/gym/${sessionId}`);
  }

  /* --------------------------------------------------------------------------
     Breadcrumb 12 — Modal open/close + folder toggle
     ----------------------------------------------------------------------- */
  function openTemplate(id: string) {
    setSelectedTemplateId(id);
  }

  function closeModal() {
    setSelectedTemplateId("");
  }

  function toggleFolder(fid: string) {
    setOpenFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(fid)) next.delete(fid);
      else next.add(fid);
      return next;
    });
  }

  const ungroupedIsOpen = openFolderIds.has(UNGROUPED_KEY);

  const ungroupedMenuItems: MenuItem[] = [
    {
      label: ungroupedIsOpen ? "Collapse" : "Expand",
      icon: MenuIcons.rename, // placeholder icon; behavior is correct
      onClick: () => toggleFolder(UNGROUPED_KEY),
    },
  ];

  /* --------------------------------------------------------------------------
     Breadcrumb 13 — Render
     ----------------------------------------------------------------------- */
  return (
    <Page title="Today" subtitle="Start, continue, import, or review your latest training.">
      <Section>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 18 }}>Coach Dashboard</div>
            <div className="muted" style={{ marginTop: 4 }}>
              Daily coaching snapshot from your latest body, strength, and goal data.
            </div>
          </div>
        </div>

        {coachLoading && !hasLoadedCoachDashboard ? (
          <div className="card" data-testid="coach-dashboard-loading" style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 800 }}>Building coach dashboard...</div>
          </div>
        ) : !coachMetrics && coachStateError ? (
          <div className="card" data-testid="coach-dashboard-error" style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 800 }}>Coach dashboard unavailable.</div>
            {coachStateError ? (
              <div className="muted" style={{ marginTop: 6 }}>
                {coachStateError}
              </div>
            ) : null}
          </div>
        ) : !hasCoachDashboardContent ? (
          <div className="card" data-testid="coach-dashboard-empty" style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 800 }}>Not enough coaching data yet.</div>
            <div className="muted" style={{ marginTop: 6 }}>
              Complete workouts and add body metrics to unlock the dashboard.
            </div>
          </div>
        ) : (
          <div
            data-testid="coach-dashboard"
            style={{
              marginTop: 12,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 10,
            }}
          >
            <div className="card" data-testid="coach-dashboard-snapshot">
              <div style={{ fontWeight: 800, marginBottom: 8 }}>Coach Snapshot</div>
              <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
                <DashboardLine label="Status" value={renderedCoachReport?.snapshot.status ?? "—"} />
                <DashboardLine label="Confidence" value={renderedCoachReport?.snapshot.confidence ?? "—"} />
                <DashboardLine label="Why" value={renderedCoachReport?.snapshot.why ?? "—"} />
                <DashboardLine label="Today" value={renderedCoachReport?.snapshot.today ?? "—"} />
              </div>
            </div>

            <div className="card" data-testid="coach-dashboard-body">
              <div style={{ fontWeight: 800, marginBottom: 8 }}>{renderedCoachReport?.body?.heading ?? "Body Values"}</div>
              <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
                {renderedCoachReport?.body?.values
                  .filter((line) => line.label !== "Fat Mass")
                  .map((line) => (
                    <DashboardLine key={line.label} label={line.label} value={line.value} />
                  ))}
                {renderedCoachReport?.body?.note ? (
                  <div className="muted" style={{ fontSize: 12, lineHeight: 1.35 }}>
                    {renderedCoachReport.body.note}
                  </div>
                ) : null}
              </div>

              <div style={{ fontWeight: 800, marginTop: 12, marginBottom: 8 }}>Body Confidence</div>
              <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
                {renderedCoachReport?.body?.confidenceRows.map((line) => (
                  <DashboardLine key={line.label} label={line.label} value={line.value} />
                ))}
                <div className="muted" style={{ fontSize: 12, lineHeight: 1.35 }}>
                  Confidence reflects how much recent data is available, not whether the number is high or low.
                </div>
              </div>
            </div>

            <div className="card" data-testid="coach-dashboard-performance">
              <div style={{ fontWeight: 800, marginBottom: 8 }}>Performance</div>
              <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
                <DashboardLine label="Performance Trend" value={renderedCoachReport?.performance?.trend ?? "—"} />
                {renderedCoachReport?.performance?.anchor ? (
                  <DashboardLine label={renderedCoachReport.performance.anchor.label} value={renderedCoachReport.performance.anchor.text} />
                ) : null}
                {renderedCoachReport?.performance?.strengthSignal ? (
                  <DashboardLine label="Strength Signal" value={renderedCoachReport.performance.strengthSignal} />
                ) : null}
                <DashboardLine label="Movement Quality" value={renderedCoachReport?.performance?.movementQuality ?? "—"} />
                {renderedCoachReport?.performance?.read ? (
                  <DashboardLine label="Performance Read" value={renderedCoachReport.performance.read} />
                ) : null}
              </div>
            </div>

            <div className="card" data-testid="coach-dashboard-goals">
              <div style={{ fontWeight: 800, marginBottom: 8 }}>Goals</div>
              <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
                <DashboardLine label="Goal Trajectory" value={renderedCoachReport?.goals?.trajectory ?? "—"} />
                {renderedCoachReport?.goals?.read ? <DashboardLine label="Goal Read" value={renderedCoachReport.goals.read} /> : null}
                {(renderedCoachReport?.goals?.targets ?? []).slice(0, 3).map((row) => (
                  <DashboardLine key={row.label} label={row.label} value={row.value} />
                ))}
              </div>
            </div>

            <div className="card" data-testid="coach-dashboard-learnings">
              <div style={{ fontWeight: 800, marginBottom: 8 }}>Learnings</div>
              <div style={{ display: "grid", gap: 10, fontSize: 13 }}>
                <div>
                  <div className="muted" style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    What&apos;s Working
                  </div>
                  <div style={{ marginTop: 6, display: "grid", gap: 4 }}>
                    {renderedCoachReport?.learnings?.whatsWorking.length ? (
                      renderedCoachReport.learnings.whatsWorking.map((item) => <div key={item}>- {item}</div>)
                    ) : (
                      <div className="muted">No validated learnings yet.</div>
                    )}
                  </div>
                </div>
                <div>
                  <div className="muted" style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Watch Now
                  </div>
                  <div style={{ marginTop: 6, display: "grid", gap: 4 }}>
                    {renderedCoachReport?.learnings?.watchNow.length ? (
                      renderedCoachReport.learnings.watchNow.map((item) => <div key={item}>- {item}</div>)
                    ) : (
                      <div className="muted">No active watch items.</div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="card" data-testid="coach-dashboard-cardio">
              <div style={{ fontWeight: 800, marginBottom: 8 }}>Cardio</div>
              <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
                {renderedCoachReport?.cardio?.isEmpty ? (
                  <div className="muted">{renderedCoachReport.cardio.note ?? "Cardio summary not available yet."}</div>
                ) : (
                  <>
                    {renderedCoachReport?.cardio?.status ? <DashboardLine label="Cardio Status" value={renderedCoachReport.cardio.status} /> : null}
                    {renderedCoachReport?.cardio?.rows.map((line) => (
                      <DashboardLine key={line.label} label={line.label} value={line.value} />
                    ))}
                    {renderedCoachReport?.cardio?.note ? <DashboardLine label="Cardio Note" value={renderedCoachReport.cardio.note} /> : null}
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </Section>

      {/* Start Hub */}
      <Section>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 22 }}>Today's Actions</div>
            <div className="muted" style={{ marginTop: 4 }}>
              Choose your next training action.
            </div>
          </div>
        </div>

        <div
          data-testid="start-today-actions"
          style={{
            marginTop: 14,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 4,
          }}
        >
          {activeSession ? (
            <StartActionCard
              title="Continue Session"
              subtitle={`${activeSession.templateName ?? "Ad-hoc"} • ${
                isPausedSession(activeSession.startedAt) ? "Paused" : fmtDurationSince(activeSession.startedAt)
              }`}
              onClick={() => navigate(`/gym/${activeSession.id}`)}
            />
          ) : null}

          <StartActionCard
            title="Start Empty Workout"
            subtitle="Build a workout on the fly and start logging sets"
            onClick={startEmptyWorkout}
          />

          <StartActionCard
            title="Paste Workout"
            subtitle="Convert Coach GPT / IF text into a History session"
            onClick={() => navigate("/paste-workout")}
          />

          <StartActionCard
            title="Last Session"
            subtitle={
              lastCompletedSession
                ? `${lastCompletedSession.templateName ?? "Completed session"} | ${fmtAgo(lastCompletedSession.endedAt ?? lastCompletedSession.startedAt)}`
                : "No completed sessions yet"
            }
            onClick={() => navigate(lastCompletedSession ? `/session/${lastCompletedSession.id}` : "/history")}
          />

          <StartActionCard
            title="Progress"
            subtitle="Review trends and copy Coach Export"
            onClick={() => navigate("/progress#exports")}
          />
        </div>
      </Section>

      {/* Templates Launcher */}
      <Section>
        <div
          id="start-templates-section"
          className="row"
          style={{ justifyContent: "space-between", alignItems: "center", gap: 12 }}
        >
          <div style={{ fontWeight: 900, fontSize: 18 }}>Templates</div>

          <button className="btn small" onClick={() => navigate("/templates")}>
            Manage
          </button>
        </div>

        {recentTemplates.length ? (
          <div data-testid="start-recent-templates" style={{ marginTop: 12, display: "grid", gap: 8 }}>
            <div className="muted" style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Recent Templates
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                gap: 8,
              }}
            >
              {recentTemplates.map((row) => (
                <button
                  key={`recent-${row.template.id}`}
                  type="button"
                  className="card clickable"
                  data-testid={`start-recent-template-${row.template.id}`}
                  onClick={() => openTemplate(row.template.id)}
                  style={{
                    textAlign: "left",
                    padding: "10px 12px",
                    border: "none",
                    background: "var(--card, white)",
                    display: "grid",
                    gap: 4,
                  }}
                >
                  <div style={{ fontWeight: 900, lineHeight: 1.15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {row.template.name}
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {fmtAgo(row.lastPerformedAt)} | {row.itemCount} exercise{row.itemCount === 1 ? "" : "s"}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div style={{ marginTop: 10, display: "grid", gap: 12 }}>
          {visibleFolders.map((f) => {
            const rows = grouped.folderMap.get(f.id) ?? [];
            if (!rows.length) return null;

            const isOpen = openFolderIds.has(f.id);

            const folderMenuItems: MenuItem[] = [
              { label: "Rename", icon: MenuIcons.rename, onClick: () => renameFolder(f) },
              { type: "sep" },
              { label: "Delete", icon: MenuIcons.trash, danger: true, onClick: () => deleteFolder(f) },
            ];

            return (
              <FolderGroup
                key={f.id}
                groupId={f.id}
                title={f.name}
                count={rows.length}
                isOpen={isOpen}
                onToggle={() => toggleFolder(f.id)}
                menuItems={folderMenuItems}
              >
                {rows.map((row) => (
                  <TemplateRow
                    key={row.template.id}
                    row={row}
                    isChild
                    onOpen={() => openTemplate(row.template.id)}
                    onRename={() => renameTemplate(row.template)}
                    onArchive={() => archiveTemplate(row.template)}
                    onDelete={() => deleteTemplate(row.template)}
                  />
                ))}
              </FolderGroup>
            );
          })}

          {grouped.ungrouped.length ? (
            <FolderGroup
              groupId={UNGROUPED_KEY}
              title="Ungrouped"
              count={grouped.ungrouped.length}
              isOpen={ungroupedIsOpen}
              onToggle={() => toggleFolder(UNGROUPED_KEY)}
              menuItems={ungroupedMenuItems}
            >
              {grouped.ungrouped.map((row) => (
                <TemplateRow
                  key={row.template.id}
                  row={row}
                  isChild
                  onOpen={() => openTemplate(row.template.id)}
                  onRename={() => renameTemplate(row.template)}
                  onArchive={() => archiveTemplate(row.template)}
                  onDelete={() => deleteTemplate(row.template)}
                />
              ))}
            </FolderGroup>
          ) : null}
        </div>
      </Section>

      {/* Template modal */}
      {selectedTemplate && (
        <div className="modal-overlay" role="dialog" aria-modal="true" onMouseDown={closeModal}>
          <div
            className="card modal-card"
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              maxWidth: 620,
              width: "min(620px, calc(100vw - 24px))",
              maxHeight: "calc(100vh - 24px)",
              overflow: "visible",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <button className="btn small" onClick={closeModal} aria-label="Close">
                ✕
              </button>

              <div style={{ textAlign: "center", flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {selectedTemplate.name}
                </div>
                <div className="muted" style={{ marginTop: 4 }}>
                  Last performed:{" "}
                  {fmtAgo((selectedTemplate as any).lastPerformedAt ?? lastPerformedFromSessions.get(selectedTemplate.id))}
                </div>
              </div>

              <div style={{ width: 44 }} />
            </div>

            <hr />

            <div style={{ paddingRight: 2, overflowY: "auto", maxHeight: "min(520px, calc(100vh - 260px))" }}>
              {selectedTracksOrdered.length ? (
                <div style={{ display: "grid", gap: 10 }}>
                  {selectedTracksOrdered.map((tr, idx) => (
                    <div
                      key={`${tr.id}-${idx}`}
                      className="row"
                      style={{ justifyContent: "space-between", alignItems: "center" }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 800, wordBreak: "break-word" }}>{(tr as any).displayName}</div>
                        <div className="muted" style={{ marginTop: 3 }}>
                          {(tr as any).trackType} • {(tr as any).trackingMode}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">No exercises in this template yet.</p>
              )}
            </div>

            <div style={{ marginTop: 12 }}>
              <button
                className="btn primary"
                style={{ width: "100%", padding: "14px 14px" }}
                onClick={() => startFromTemplate(selectedTemplate)}
                disabled={!selectedTracksOrdered.length}
              >
                Start Workout
              </button>
            </div>
          </div>
        </div>
      )}
    </Page>
  );
}

function DashboardLine({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "110px minmax(0, 1fr)", gap: 8, alignItems: "start" }}>
      <div className="muted" style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </div>
      <div style={{ minWidth: 0, wordBreak: "break-word" }}>{value}</div>
    </div>
  );
}

/* ============================================================================
   Breadcrumb 14 — StartActionCard
   Small operational card used by the Start hub.
   Compressed for mobile while preserving strong subtitle rendering.
   ============================================================================ */

function StartActionCard({
  title,
  subtitle,
  onClick,
  disabled,
  ariaLabel,
}: {
  title: string;
  subtitle: string;
  onClick: () => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      className="card clickable"
      aria-label={ariaLabel}
      onClick={onClick}
      disabled={disabled}
      style={{
        textAlign: "left",
        padding: "8px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 2,
        opacity: disabled ? 0.55 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        border: "none",
        background: "var(--card, white)",
      }}
    >
      <div style={{ fontWeight: 900, fontSize: 17 }}>{title}</div>

      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12,
          fontWeight: 600,
          color: "var(--text, #111827)",
          lineHeight: 1.15,
          flexWrap: "wrap",
        }}
      >
        {renderStrongSubtitle(subtitle)}
      </div>
    </button>
  );
}

/* ============================================================================
   Breadcrumb 14A — Strong subtitle renderer
   Purpose:
   - If subtitle includes " • ", split it into title/meta pieces
   - Render the center dot with lighter visual weight
   - Preserve plain subtitles for cards that are not session-style
   ============================================================================ */

function renderStrongSubtitle(subtitle: string) {
  const parts = subtitle
    .split(" • ")
    .map((x) => x.trim())
    .filter(Boolean);

  if (parts.length === 2) {
    return (
      <>
        <span>{parts[0]}</span>
        <span style={{ opacity: 0.38 }}>•</span>
        <span style={{ color: "var(--muted, #6b7280)", fontWeight: 600 }}>{parts[1]}</span>
      </>
    );
  }

  return <span className="muted">{subtitle}</span>;
}

/* ============================================================================
   Breadcrumb 15 — FolderGroup
   Folder container with true hierarchy: header + nested rail children.
   Kebab moved to RIGHT.
   ============================================================================ */

function FolderGroup({
  groupId,
  title,
  count,
  isOpen,
  onToggle,
  menuItems,
  children,
}: {
  groupId: string;
  title: string;
  count: number;
  isOpen: boolean;
  onToggle: () => void;
  menuItems?: MenuItem[];
  children: React.ReactNode;
}) {
  return (
    <div className="folder-group" data-testid={`start-folder-group-${groupId}`}>
      <div
        className="folder-head clickable"
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") onToggle();
        }}
        style={{ cursor: "pointer" }}
      >
        <div
          className="folder-title"
          style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 10 }}
        >
          <span aria-hidden="true" style={{ width: 18, display: "inline-block", color: "var(--muted)" }}>
            {isOpen ? "▾" : "▸"}
          </span>

          <div style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {title} <span className="folder-count">({count})</span>
          </div>

          {menuItems?.length ? (
            <div
              style={{ flex: "0 0 auto" }}
              onPointerDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <ActionMenu theme="dark" ariaLabel="Folder actions" items={menuItems} offsetX={6} />
            </div>
          ) : (
            <div style={{ width: 40 }} />
          )}
        </div>
      </div>

      {isOpen ? (
        <div className="folder-body">
          <div className="folder-rail">{children}</div>
        </div>
      ) : null}
    </div>
  );
}

/* ============================================================================
   Breadcrumb 16 — TemplateRow
   Strong-like child card treatment:
   - bolder title
   - lighter preview copy
   - kebab top-right
   - last performed as compact meta
   ============================================================================ */

function TemplateRow({
  row,
  isChild,
  onOpen,
  onRename,
  onArchive,
  onDelete,
}: {
  row: TemplatePreviewRow;
  isChild?: boolean;
  onOpen: () => void;
  onRename: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const preview = row.exerciseNamesPreview ?? [];
  const top2 = preview.slice(0, 2);
  const remaining = Math.max(0, preview.length - top2.length);
  const last = row.lastPerformedAt ? fmtAgo(row.lastPerformedAt) : "Never";

  const menuItems: MenuItem[] = [
    { label: "Rename", icon: MenuIcons.rename, onClick: onRename },
    { type: "sep" },
    { label: "Archive", icon: MenuIcons.archive, onClick: onArchive },
    { type: "sep" },
    { label: "Delete", icon: MenuIcons.trash, danger: true, onClick: onDelete },
  ];

  return (
    <div
      className={`card clickable template-tile ${isChild ? "template-row child" : ""}`}
      data-testid={`start-template-${row.template.id}`}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onOpen();
      }}
      style={{
        padding: "14px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        borderRadius: 18,
      }}
    >
      {/* Top row */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 900,
              fontSize: 18,
              lineHeight: 1.15,
              wordBreak: "break-word",
            }}
          >
            {row.template.name}
          </div>
        </div>

        <div
          style={{ flex: "0 0 auto" }}
          onPointerDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <ActionMenu theme="dark" ariaLabel="Template actions" items={menuItems} offsetX={6} />
        </div>
      </div>

      {/* Exercise preview */}
      <div
        className="muted"
        style={{
          fontSize: 14,
          lineHeight: 1.35,
          minHeight: 40,
        }}
      >
        {top2.length ? (
          <div style={{ display: "grid", gap: 4 }}>
            {top2.map((x, i) => (
              <div
                key={`${row.template.id}-p-${i}`}
                style={{
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                title={x}
              >
                {x}
              </div>
            ))}
            {remaining > 0 ? <div style={{ opacity: 0.8 }}>{`+${remaining}`}</div> : null}
          </div>
        ) : (
          <div>No exercises</div>
        )}
      </div>

      {/* Bottom meta */}
      <div
        className="muted"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          fontSize: 13,
        }}
      >
        <div style={{ whiteSpace: "nowrap" }}>{last}</div>
        <div style={{ opacity: 0.7 }}>
          {row.itemCount} exercise{row.itemCount === 1 ? "" : "s"}
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   End of file: src/pages/StartPage.tsx
   ============================================================================ */
