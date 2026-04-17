// src/pages/AboutPage.tsx
/* ============================================================================
   AboutPage.tsx — About IronForge
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-03-20-ABOUT-01
   FILE: src/pages/AboutPage.tsx

   Purpose
   - Provide a premium-style About page under More
   - Show app identity, version/build metadata, system info, and methodology
   - Keep build details available without cluttering every screen

   Notes
   - Uses HubPageHeader so About follows the same hub-child navigation pattern
   - Reads version/build details from BUILD_INFO
   - Keeps wording product-facing, not dev-panel heavy
   ============================================================================ */

import React, { useState } from "react";
import { Page, Section } from "../components/Page.tsx";
import HubPageHeader from "../components/layout/HubPageHeader";
import { buildInfo } from "../build/buildInfo";
import {
  ACTIVE_RDL_EXERCISE_ID,
  ORPHAN_RDL_EXERCISE_ID,
  repairRomanianDeadliftHistory,
  type RdlRepairResult,
} from "../maintenance/repairRdlHistory";

/* ============================================================================
   Breadcrumb 1 — Small helpers
   ============================================================================ */

function AboutRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="kv">
      <span>{label}</span>
      <span style={{ color: "var(--text)", fontWeight: 700, textAlign: "right" }}>
        {value}
      </span>
    </div>
  );
}

function CardTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <h3 style={{ margin: 0 }}>{title}</h3>
      {subtitle ? (
        <div className="muted" style={{ fontSize: 13, marginTop: 4, lineHeight: 1.45 }}>
          {subtitle}
        </div>
      ) : null}
    </div>
  );
}

function formatBuildTimestamp(value: string) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  });
}

/* ============================================================================
   Breadcrumb 2 — Page
   ============================================================================ */

export default function AboutPage() {
  const builtAtDisplay = formatBuildTimestamp(buildInfo.builtAt);
  const [rdlRepairResult, setRdlRepairResult] = useState<RdlRepairResult | null>(null);

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

  return (
    <Page>
      {/* ======================================================================
          Breadcrumb 2A — Hub header
         ==================================================================== */}
      <Section>
        <HubPageHeader
          hubLabel="More"
          hubRoute="/more"
          pageTitle="About"
          subtitle="App version, build details, and product information."
          eyebrow="More / About"
          showDetailCard={true}
        />
      </Section>

      {/* ======================================================================
          Breadcrumb 2B — App identity
         ==================================================================== */}
      <Section>
        <div className="card">
          <div
            className="muted"
            style={{
              fontSize: 12,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: 0.5,
              marginBottom: 8,
            }}
          >
            App
          </div>

          <h2 style={{ marginTop: 0, marginBottom: 8 }}>IronForge</h2>

          <div className="muted" style={{ fontSize: 14, lineHeight: 1.5, marginBottom: 14 }}>
            Strength. Structure. Signal.
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <AboutRow
              label="Version"
              value={<span style={{ fontFamily: "monospace" }}>{buildInfo.version}</span>}
            />
            <AboutRow
              label="Build"
              value={<span style={{ fontFamily: "monospace" }}>{buildInfo.commit}</span>}
            />
            <AboutRow
              label="Built"
              value={<span style={{ fontFamily: "monospace" }}>{builtAtDisplay}</span>}
            />
          </div>
        </div>
      </Section>

      {/* ======================================================================
          Breadcrumb 2B.1 — Temporary maintenance
         ==================================================================== */}
      <Section>
        <div className="card">
          <CardTitle
            title="Temporary Maintenance"
            subtitle="Manual one-time history repair."
          />

          <div className="muted" style={{ fontSize: 14, lineHeight: 1.5, marginBottom: 12 }}>
            Repairs orphaned Romanian Deadlift history by moving exact old-ID references to
            the active Romanian Deadlift exercise.
          </div>

          <button
            className="btn small"
            onClick={onRepairRdlHistory}
            title="Repoint orphan Romanian Deadlift history to the active Romanian Deadlift exercise"
          >
            Repair RDL History
          </button>

          {rdlRepairResult && (
            <div
              className="muted"
              style={{
                marginTop: 10,
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
        </div>
      </Section>

      {/* ======================================================================
          Breadcrumb 2C — System info + data model
         ==================================================================== */}
      <Section>
        <div className="grid two" style={{ alignItems: "start" }}>
          <div className="card">
            <CardTitle
              title="System Info"
              subtitle="Basic app environment details."
            />

            <div style={{ display: "grid", gap: 8 }}>
              <AboutRow label="Environment" value="Production / Preview / Local" />
              <AboutRow label="Platform" value="Web App (PWA)" />
              <AboutRow label="Storage" value="Local-first" />
            </div>

            <div className="muted" style={{ fontSize: 13, lineHeight: 1.5, marginTop: 12 }}>
              IronForge is designed to keep your workout and body-metric workflow fast,
              local, and under your control.
            </div>
          </div>

          <div className="card">
            <CardTitle
              title="Data & Control"
              subtitle="How your data is handled inside the app."
            />

            <div style={{ display: "grid", gap: 10 }}>
              <div>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Data Storage</div>
                <div className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>
                  Workouts, body metrics, templates, and app settings are stored locally on
                  your device.
                </div>
              </div>

              <div>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Export</div>
                <div className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>
                  You can export your data as a backup so you always have a portable copy.
                </div>
              </div>

              <div>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Import</div>
                <div className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>
                  IronForge supports restore and merge workflows so your training history can
                  be preserved over time.
                </div>
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* ======================================================================
          Breadcrumb 2D — Methodology
         ==================================================================== */}
      <Section>
        <div className="card">
          <CardTitle
            title="Methodology"
            subtitle="A quick look at how IronForge interprets training and body data."
          />

          <div className="grid two" style={{ alignItems: "start" }}>
            <div className="card">
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Strength Signal</div>
              <div className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>
                Strength Signal is IronForge&apos;s primary strength trend metric. It blends
                Epley-based e1RM estimates from completed working sets across squat, hinge,
                push, and pull patterns, excludes scored sets above 12 reps, applies
                allometric normalization with BW^0.67, and trends weekly snapshots from
                overlapping 28-day windows. It is a blended training-performance indicator,
                not a direct lab measure of force or muscle mass.
              </div>
            </div>

            <div className="card">
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Muscle Preservation</div>
              <div className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>
                MPS combines normalized strength with body-weight and waist trends to judge
                whether fat loss appears productive while strength is being preserved.
              </div>
            </div>

            <div className="card">
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Body Metrics</div>
              <div className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>
                Weight, waist, and body-composition trends provide context for how training
                outcomes are changing over time.
              </div>
            </div>

            <div className="card">
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Coaching Layer</div>
              <div className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>
                Progress pages are designed to translate raw numbers into practical coaching
                signals, confidence, and next-step interpretation.
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* ======================================================================
          Breadcrumb 2E — Navigation / next steps
         ==================================================================== */}
      <Section>
        <div className="card">
          <CardTitle
            title="Explore"
            subtitle="Related areas inside IronForge."
          />

          <div className="grid two" style={{ alignItems: "start" }}>
            <div className="card">
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Help</div>
              <div className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>
                View explanations for metrics, signals, and app concepts as that system grows.
              </div>
            </div>

            <div className="card">
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Dev</div>
              <div className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>
                Use the Dev area for more technical inspection, diagnostics, and future debug
                workflows.
              </div>
            </div>
          </div>
        </div>
      </Section>
    </Page>
  );
}

/* ============================================================================
   End of file: src/pages/AboutPage.tsx
   ============================================================================ */
