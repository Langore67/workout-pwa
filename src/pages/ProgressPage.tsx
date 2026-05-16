// src/pages/ProgressPage.tsx
/* ============================================================================
   ProgressPage.tsx — Analytics home for Progress
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-03-14-PROGRESS-03
   FILE: src/pages/ProgressPage.tsx

   Purpose
   - Serve as the analytics home inside Progress
   - Feature Performance as the primary overview destination
   - Organize Strength / Body / Walks / Muscle Preservation as drill-down views
   - Keep implementation read-only / navigation-only

   Navigation targets
   - /performance
   - /strength
   - /body
   - /walks
   - /mps

   Changes (PROGRESS-03)
   ✅ Promote Performance to the featured overview destination
   ✅ Add stronger page hierarchy: Header → Overview → Detailed Views
   ✅ Rename featured tile from "Performance Dashboard" to "Performance"
   ✅ Keep Progress as the analytics hub
   ✅ Keep implementation simple and navigation-only
   ============================================================================ */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate } from "react-router-dom";
import InfoStubButton from "../components/information/InfoStubButton";
import { db } from "../db";
import type { FitnessTestResult } from "../db";
import { buildCardioExportText } from "../lib/cardio/buildCardioExportText";
import { buildCardioWalkSummary } from "../lib/cardio/buildCardioWalkSummary";
import {
  formatCardioDuration,
  formatCardioPace,
  formatCardioWalkDateTime,
  formatDistanceMiKm,
  pluralizeWalk,
} from "../lib/cardio/formatCardioWalk";
import type { CardioWalkEvent, CardioWalkSummary } from "../lib/cardio/cardioTypes";
import { buildCoachExportMetrics } from "../lib/coachExport/buildCoachExportMetrics";
import { formatCoachExportText } from "../lib/coachExport/formatCoachExportText";
import { formatCapabilityDate, labelForCapabilityCategory } from "../lib/capabilityTests";
import { buildCapabilityTestsSummary } from "../lib/capabilityTestsSummary";
import { deriveCarryCapabilityResultsFromHistory } from "../lib/deriveCapabilityTestsFromHistory";

/* ============================================================================
   Breadcrumb 1 — Tile component
   ============================================================================ */

function ProgressTile({
  title,
  subtitle,
  eyebrow,
  onClick,
}: {
  title: string;
  subtitle: string;
  eyebrow: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="card clickable"
      onClick={onClick}
      style={{
        cursor: "pointer",
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        textAlign: "left",
        border: "none",
        background: "var(--card, white)",
        transition: "transform 120ms ease, box-shadow 120ms ease, opacity 120ms ease",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--muted)",
        }}
      >
        {eyebrow}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div
          style={{
            fontWeight: 900,
            fontSize: 18,
            lineHeight: 1.15,
            color: "var(--text, #111827)",
          }}
        >
          {title}
        </div>

        <div
          aria-hidden="true"
          style={{
            fontSize: 18,
            fontWeight: 800,
            color: "var(--muted)",
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          →
        </div>
      </div>

      <div
        className="muted"
        style={{
          lineHeight: 1.35,
          fontSize: 14,
        }}
      >
        {subtitle}
      </div>
    </button>
  );
}

/* ============================================================================
   Breadcrumb 2 — Small section label helper
   ============================================================================ */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10, fontWeight: 800, fontSize: 14 }}>{children}</div>
  );
}

function WalkMetric({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId?: string;
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <div
        className="muted"
        style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em" }}
      >
        {label}
      </div>
      <div
        data-testid={testId}
        style={{ marginTop: 2, fontSize: 15, fontWeight: 900, color: "var(--text, #111827)" }}
      >
        {value}
      </div>
    </div>
  );
}

function WalkRow({ walk, suspiciousPace }: { walk: CardioWalkEvent; suspiciousPace?: boolean }) {
  const meta = [
    formatCardioDuration(walk.durationSeconds),
    formatDistanceMiKm(walk.distanceMeters),
    formatCardioPace(walk.paceSecondsPerMile),
    suspiciousPace ? "Suspicious pace" : undefined,
    walk.route,
  ].filter(Boolean);

  return (
    <div
      data-testid={`progress-walk-row:${walk.sessionId}`}
      style={{
        borderTop: "1px solid rgba(148,163,184,0.28)",
        paddingTop: 9,
        minWidth: 0,
      }}
    >
      <div className="muted" style={{ fontSize: 12, marginBottom: 2 }}>
        {formatCardioWalkDateTime(walk.startedAt)}
      </div>
      <div style={{ fontWeight: 850, color: "var(--text, #111827)", lineHeight: 1.2 }}>{walk.name}</div>
      {meta.length ? (
        <div
          data-testid={`progress-walk-row-meta:${walk.sessionId}`}
          className="muted"
          style={{ marginTop: 3, fontSize: 13, lineHeight: 1.35 }}
        >
          {meta.join(" · ")}
        </div>
      ) : null}
    </div>
  );
}

function WalksSummaryTile({
  summary,
  loading,
  onClick,
}: {
  summary?: CardioWalkSummary;
  loading: boolean;
  onClick: () => void;
}) {
  const hasWalks = !!summary && summary.normalizedWalks.length > 0;
  const dataQualityNotes: string[] = [];
  if (summary?.dataQuality.missingDistanceCount) {
    dataQualityNotes.push(
      `${summary.dataQuality.missingDistanceCount} ${summary.dataQuality.missingDistanceCount === 1 ? "walk is" : "walks are"} missing distance.`
    );
  }
  if (summary?.dataQuality.missingDurationCount) {
    dataQualityNotes.push(
      `${summary.dataQuality.missingDurationCount} ${summary.dataQuality.missingDurationCount === 1 ? "walk is" : "walks are"} missing duration.`
    );
  }
  if (summary?.dataQuality.suspiciousPaceCount) {
    dataQualityNotes.push(
      `${summary.dataQuality.suspiciousPaceCount} ${summary.dataQuality.suspiciousPaceCount === 1 ? "walk has" : "walks have"} pace outside expected walking range.`
    );
  }
  const suspiciousPaceSessionIds = new Set(summary?.dataQuality.suspiciousPaceSessionIds ?? []);

  return (
    <button
      type="button"
      className="card clickable"
      data-testid="progress-walks-tile"
      onClick={onClick}
      style={{
        cursor: "pointer",
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        textAlign: "left",
        border: "none",
        background: "var(--card, white)",
        transition: "transform 120ms ease, box-shadow 120ms ease, opacity 120ms ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--muted)",
              marginBottom: 8,
            }}
          >
            Conditioning
          </div>
          <div style={{ fontWeight: 900, fontSize: 18, lineHeight: 1.15, color: "var(--text, #111827)" }}>
            Walks
          </div>
          <div className="muted" style={{ marginTop: 5, lineHeight: 1.35, fontSize: 14 }}>
            History-based walking summary
          </div>
        </div>
        <div aria-hidden="true" style={{ fontSize: 18, fontWeight: 800, color: "var(--muted)", lineHeight: 1 }}>
          →
        </div>
      </div>

      {loading ? (
        <div className="muted" style={{ fontSize: 13 }}>
          Loading walks...
        </div>
      ) : !hasWalks ? (
        <div style={{ display: "grid", gap: 6 }}>
          <div data-testid="progress-walks-empty" style={{ fontWeight: 800, color: "var(--text, #111827)" }}>
            No imported walk sessions found yet.
          </div>
          <div className="muted" style={{ fontSize: 13, lineHeight: 1.35 }}>
            Paste MapMyWalk screenshot summaries into Paste Workout to add walks to History.
          </div>
        </div>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(112px, 1fr))",
              gap: 10,
              paddingTop: 2,
            }}
          >
            <WalkMetric label="Last 7d" value={pluralizeWalk(summary.last7d.count)} testId="progress-walks-last7-count" />
            <WalkMetric
              label="7d Duration"
              value={formatCardioDuration(summary.last7d.totalDurationSeconds) || "Unavailable"}
              testId="progress-walks-last7-duration"
            />
            {summary.last7d.totalDistanceMeters > 0 ? (
              <WalkMetric
                label="7d Distance"
                value={formatDistanceMiKm(summary.last7d.totalDistanceMeters)}
                testId="progress-walks-last7-distance"
              />
            ) : null}
            <WalkMetric label="Last 28d" value={pluralizeWalk(summary.last28d.count)} testId="progress-walks-last28-count" />
            <WalkMetric
              label="28d Duration"
              value={formatCardioDuration(summary.last28d.totalDurationSeconds) || "Unavailable"}
              testId="progress-walks-last28-duration"
            />
            {summary.last28d.totalDistanceMeters > 0 ? (
              <WalkMetric
                label="28d Distance"
                value={formatDistanceMiKm(summary.last28d.totalDistanceMeters)}
                testId="progress-walks-last28-distance"
              />
            ) : null}
            {summary.last7d.averageDurationSeconds != null ? (
              <WalkMetric
                label="Avg Duration"
                value={formatCardioDuration(summary.last7d.averageDurationSeconds)}
                testId="progress-walks-average-duration"
              />
            ) : null}
            {summary.last7d.averagePaceSecondsPerMile != null ? (
              <WalkMetric
                label="Avg Pace"
                value={formatCardioPace(summary.last7d.averagePaceSecondsPerMile)}
                testId="progress-walks-average-pace"
              />
            ) : null}
          </div>

          <div style={{ display: "grid", gap: 9 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: "var(--text, #111827)" }}>Recent walks</div>
            {summary.recentWalks.map((walk) => (
              <WalkRow
                key={walk.sessionId}
                walk={walk}
                suspiciousPace={suspiciousPaceSessionIds.has(walk.sessionId)}
              />
            ))}
          </div>

          <div data-testid="progress-walks-data-quality" className="muted" style={{ fontSize: 12, lineHeight: 1.35 }}>
            {dataQualityNotes.length ? `${dataQualityNotes.join(" ")} ` : ""}
            Pace shown only when both distance and duration are available. Suspicious rows are shown in Recent Walks
            but excluded from summary totals and averages. Route, HR, elevation, and zone trends are not tracked yet.
          </div>
        </>
      )}
    </button>
  );
}

function CapabilityTestsTile({
  rows,
  loading,
  onOpen,
}: {
  rows?: FitnessTestResult[];
  loading: boolean;
  onOpen: () => void;
}) {
  const summary = useMemo(() => buildCapabilityTestsSummary(rows ?? []), [rows]);
  const latest = Object.values(summary.latestByCategory)
    .filter((row): row is FitnessTestResult => !!row)
    .sort((a, b) => b.date - a.date)[0];
  const staleOrMissing = summary.staleCategories[90]
    .map((category) => labelForCapabilityCategory(category))
    .join(", ");
  const painFlagCount =
    summary.recentPainCounts.mild + summary.recentPainCounts.moderate + summary.recentPainCounts.severe;

  return (
    <div
      className="card"
      data-testid="progress-capability-tests-card"
      style={{
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        background: "var(--card, white)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--muted)",
              marginBottom: 8,
            }}
          >
            Capable / Athletic
          </div>
          <div style={{ fontWeight: 900, fontSize: 18, lineHeight: 1.15, color: "var(--text, #111827)" }}>
            Capability Tests
          </div>
          <div className="muted" style={{ marginTop: 5, lineHeight: 1.35, fontSize: 14 }}>
            Track simple real-world movement tests that show whether strength, conditioning, and mobility are carrying
            over.
          </div>
        </div>
      </div>

      {loading ? (
        <div className="muted" style={{ fontSize: 13 }}>
          Loading capability tests...
        </div>
      ) : !summary.liveResultCount ? (
        <div data-testid="progress-capability-empty" style={{ display: "grid", gap: 6 }}>
          <div data-testid="progress-capability-overall" style={{ fontWeight: 850 }}>
            Overall: {summary.overallLabel}
          </div>
          <div data-testid="progress-capability-explanation" className="muted" style={{ fontSize: 13 }}>
            {summary.overallExplanation}
          </div>
          <div className="muted" style={{ fontSize: 13, lineHeight: 1.35 }}>
            Start with:
          </div>
          <ul data-testid="progress-capability-suggested-starts" className="muted" style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
            <li>Floor Get-Up</li>
            <li>Single-Leg Balance</li>
            <li>Suitcase Carry</li>
          </ul>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          <div data-testid="progress-capability-count" style={{ fontWeight: 850 }}>
            {summary.liveResultCount} logged {summary.liveResultCount === 1 ? "test" : "tests"}
          </div>
          <div data-testid="progress-capability-overall" className="muted" style={{ fontSize: 13 }}>
            Overall: {summary.overallLabel}
          </div>
          <div data-testid="progress-capability-explanation" className="muted" style={{ fontSize: 13 }}>
            {summary.overallExplanation}
          </div>
          <div data-testid="progress-capability-latest" className="muted" style={{ fontSize: 13 }}>
            Latest: {latest ? formatCapabilityDate(latest.date) : "not available"}
          </div>
          <div data-testid="progress-capability-status-mix" className="muted" style={{ fontSize: 13 }}>
            green {summary.statusCounts.green} | yellow {summary.statusCounts.yellow} | red {summary.statusCounts.red} | not tested{" "}
            {summary.statusCounts.notTested}
          </div>
          <div data-testid="progress-capability-pain-flags" className="muted" style={{ fontSize: 13 }}>
            pain flags {painFlagCount}
          </div>
          {staleOrMissing ? (
            <div data-testid="progress-capability-stale" className="muted" style={{ fontSize: 13 }}>
              stale or not tested: {staleOrMissing}
            </div>
          ) : null}
        </div>
      )}

      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <button className="btn primary small" type="button" onClick={onOpen}>
          Log Capability Test
        </button>
        <button className="btn small" type="button" onClick={onOpen}>
          View Capability Tests
        </button>
      </div>
    </div>
  );
}

type FallbackCopyResult =
  | { ok: true; method: "execCommand" }
  | { ok: false; method: "execCommand"; detail: string };

type CopyResult =
  | { ok: true; method: "clipboard" | "execCommand" }
  | { ok: false; method: "clipboard" | "execCommand"; detail: string };

async function fallbackCopyTextToClipboard(text: string): Promise<FallbackCopyResult> {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "true");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "0";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    if (!ok) {
      return { ok: false, method: "execCommand", detail: "execCommand returned false" };
    }
    return { ok: true, method: "execCommand" };
  } catch (err: any) {
    return {
      ok: false,
      method: "execCommand",
      detail: err?.message || "textarea fallback threw",
    };
  }
}

async function copyTextToClipboard(text: string): Promise<CopyResult> {
  try {
    if (!navigator?.clipboard?.writeText) {
      return { ok: false, method: "clipboard", detail: "clipboard unavailable" };
    }
    await navigator.clipboard.writeText(text);
    return { ok: true, method: "clipboard" };
  } catch (err: any) {
    const fallback = await fallbackCopyTextToClipboard(text);
    if (fallback.ok) return fallback;
    return {
      ok: false,
      method: fallback.method,
      detail: err?.message || fallback.detail || "copy failed",
    };
  }
}

/* ============================================================================
   Breadcrumb 3 — Page
   ============================================================================ */

export default function ProgressPage() {
  const nav = useNavigate();
  const [copyState, setCopyState] = useState<"idle" | "coach-copied" | "cardio-copied" | "error">("idle");
  const [coachExportText, setCoachExportText] = useState<string>("");
  const [coachExportReadyState, setCoachExportReadyState] = useState<"preparing" | "ready" | "error">("preparing");
  const [manualCopyText, setManualCopyText] = useState<string | null>(null);
  const manualCopyRef = useRef<HTMLTextAreaElement | null>(null);
  const cardioRows = useLiveQuery(
    async () => {
      const [sessions, sets, tracks, exercises] = await Promise.all([
        db.sessions.toArray(),
        db.sets.toArray(),
        db.tracks.toArray(),
        db.exercises.toArray(),
      ]);
      return { sessions, sets, tracks, exercises };
    },
    [],
    undefined
  );
  const capabilityRows = useLiveQuery(async () => {
    const table = (db as any).fitnessTestResults;
    const [all, sessions, sets, tracks, exercises] = await Promise.all([
      table?.toArray ? (table.toArray() as Promise<FitnessTestResult[]>) : Promise.resolve([] as FitnessTestResult[]),
      db.sessions.toArray(),
      db.sets.toArray(),
      db.tracks.toArray(),
      db.exercises.toArray(),
    ]);
    const manualRows = all.filter((row) => !row.deletedAt);
    const derivedRows = deriveCarryCapabilityResultsFromHistory({
      sessions,
      sets,
      tracks,
      exercises,
      manualResults: all,
    });
    return [...manualRows, ...derivedRows];
  }, []);
  const cardioWalkSummary = useMemo(() => {
    if (!cardioRows) return undefined;
    return buildCardioWalkSummary({ ...cardioRows, recentLimit: 5 });
  }, [cardioRows]);
  const cardioExportSummary = useMemo(() => {
    if (!cardioRows) return undefined;
    return buildCardioWalkSummary({ ...cardioRows, recentLimit: 25 });
  }, [cardioRows]);

  useEffect(() => {
    if (!manualCopyText) return;
    window.requestAnimationFrame(() => {
      manualCopyRef.current?.focus();
      manualCopyRef.current?.select();
      manualCopyRef.current?.setSelectionRange(0, manualCopyText.length);
    });
  }, [manualCopyText]);

  useEffect(() => {
    let cancelled = false;

    async function prepareCoachExport() {
      setCoachExportReadyState("preparing");
      try {
        const metrics = await buildCoachExportMetrics();
        if (cancelled) return;
        const nextText = formatCoachExportText(metrics);
        if (cancelled) return;
        setCoachExportText(nextText);
        setCoachExportReadyState("ready");
      } catch (err: any) {
        if (cancelled) return;
        setCoachExportText("");
        setCoachExportReadyState("error");
      }
    }

    void prepareCoachExport();

    return () => {
      cancelled = true;
    };
  }, []);

  async function onCopyCoachExport() {
    const text = coachExportText;
    if (!text) {
      setCopyState("error");
      setManualCopyText("Could not generate coach export text.");
      return;
    }

    try {
      setManualCopyText(null);
      const copied = await copyTextToClipboard(text);
      if (!copied.ok) {
        throw new Error(copied.detail);
      }
      setCopyState("coach-copied");
      window.setTimeout(() => {
        setCopyState((current) => (current === "coach-copied" ? "idle" : current));
      }, 2000);
    } catch {
      setCopyState("error");
      setManualCopyText(text || "Could not generate coach export text.");
    }
  }

  async function onCopyCardioExport() {
    if (!cardioExportSummary) {
      setCopyState("error");
      setManualCopyText("Could not generate cardio export text.");
      return;
    }

    const text = buildCardioExportText(cardioExportSummary);

    try {
      setManualCopyText(null);
      const copied = await copyTextToClipboard(text);
      if (!copied.ok) {
        throw new Error(copied.detail);
      }
      setCopyState("cardio-copied");
      window.setTimeout(() => {
        setCopyState((current) => (current === "cardio-copied" ? "idle" : current));
      }, 2000);
    } catch {
      setCopyState("error");
      setManualCopyText(text);
    }
  }

  return (
    <div className="container">
      {/* ======================================================================
          Breadcrumb 3A — Page header
         ==================================================================== */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--muted)",
            marginBottom: 6,
          }}
        >
          Analytics Hub
        </div>

        <h2 style={{ marginTop: 0, marginBottom: 8 }}>Progress</h2>

        <div className="muted" style={{ lineHeight: 1.45 }}>
          Review strength, body, conditioning, and recovery-related trends in one place.
        </div>

        <div className="row" style={{ gap: 10, marginTop: 14, alignItems: "center", flexWrap: "wrap" }}>
          <button
            className="btn primary"
            onClick={() => void onCopyCoachExport()}
            disabled={coachExportReadyState === "preparing"}
          >
            {coachExportReadyState === "preparing" ? "Preparing Export…" : "Copy Coach Export"}
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => void onCopyCardioExport()}
            disabled={!cardioRows}
          >
            Copy Cardio Export
          </button>
          <InfoStubButton pageKey="progress" infoKey="coachExport" />
          <div className="muted" style={{ fontSize: 13, flex: "1 1 220px", minWidth: 0 }}>
            {coachExportReadyState === "preparing"
              ? "Preparing a copy/paste summary for ChatGPT or a coach."
              : copyState === "coach-copied"
              ? "Coach export copied."
              : copyState === "cardio-copied"
                ? "Cardio export copied."
              : copyState === "error"
                ? "Copy not available on this device. Tap and hold to copy manually."
                : "Creates a copy/paste summary for ChatGPT or a coach."}
          </div>
        </div>

        {manualCopyText ? (
          <div
            className="card"
            style={{
              marginTop: 12,
              padding: 12,
              background: "rgba(248,250,252,0.9)",
              border: "1px solid rgba(148,163,184,0.35)",
            }}
          >
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Manual Copy</div>
            <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
              Copy not available on this device. Tap and hold to copy manually.
            </div>
            <textarea
              ref={manualCopyRef}
              className="input"
              readOnly
              value={manualCopyText}
              rows={14}
              style={{
                width: "100%",
                fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
                fontSize: 12,
                lineHeight: 1.45,
                whiteSpace: "pre",
              }}
              onFocus={(e) => e.currentTarget.select()}
            />
            <div className="row" style={{ gap: 8, marginTop: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button className="btn small" type="button" onClick={() => manualCopyRef.current?.select()}>
                Select All
              </button>
              <button className="btn small" type="button" onClick={() => setManualCopyText(null)}>
                Close
              </button>
            </div>
          </div>
        ) : null}

      </div>

      {/* ======================================================================
          Breadcrumb 3B — Featured overview destination
         ==================================================================== */}
      <SectionLabel>Overview</SectionLabel>

      <div style={{ marginBottom: 20 }}>
        <ProgressTile
          eyebrow="Overview"
          title="Performance"
          subtitle="Big-picture coaching view across strength, body composition, and training trends."
          onClick={() => nav("/performance")}
        />
      </div>

      {/* ======================================================================
          Breadcrumb 3C — Detailed drill-down destinations
         ==================================================================== */}
      <SectionLabel>Detailed Views</SectionLabel>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 14,
        }}
      >
        <ProgressTile
          eyebrow="Performance"
          title="Strength"
          subtitle="Track long-term strength trends from completed working sets."
          onClick={() => nav("/strength")}
        />

        <ProgressTile
          eyebrow="Body Metrics"
          title="Body"
          subtitle="Track weight, waist, and body measurements."
          onClick={() => nav("/body")}
        />

        <ProgressTile
          eyebrow="Body Composition"
          title="Body Composition"
          subtitle="Review body fat, lean mass, hydration, and phase-aware trends."
          onClick={() => nav("/body-composition")}
        />

        <WalksSummaryTile
          summary={cardioWalkSummary}
          loading={!cardioRows}
          onClick={() => nav("/walks")}
        />

        <CapabilityTestsTile
          rows={capabilityRows}
          loading={!capabilityRows}
          onOpen={() => nav("/capability-tests")}
        />

        <ProgressTile
          eyebrow="Cut Quality"
          title="Muscle Preservation"
          subtitle="Strength signal during fat loss, using MPS and body trends."
          onClick={() => nav("/mps")}
        />
      </div>
    </div>
  );
}

/* ============================================================================
   End of file: src/pages/ProgressPage.tsx
   ============================================================================ */
