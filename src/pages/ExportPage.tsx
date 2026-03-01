// src/pages/ExportPage.tsx
/* ============================================================================
   ExportPage.tsx — Export + Backup/Restore + Wipe + Import (Master Log) + Fix
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-02-28-EXPORTPAGE-08
   FILE: src/pages/ExportPage.tsx

   What this page is for (high level)
   - Gym-safe utilities you run occasionally:
     1) BACKUP DB (JSON)       → snapshot Dexie DB so you can roll back
     2) RESTORE DB (JSON)      → destructive restore from a backup snapshot
     3) WIPE WORKOUT HISTORY   → delete sessions/sets (keep exercises/templates/folders)
     4) WIPE DB (ALL)          → full reset (everything)
     5) IMPORT MASTER LOG      → convert MASTER_Execution_Log CSV into sessions/sets
     6) FIX IMPORTED SESSIONS  → one-time repair for imports:
                                - set endedAt so history isn't "In progress"
                                - link templateId when templateName matches template

   Why the “Import” sometimes looks broken
   - History/Session Detail screens usually render sets by walking:
       Session -> Template -> TemplateItems (TrackIds) -> Sets(trackId)
   - If imported sets get attached to a NON-template trackId, the UI can show:
       - "No exercises found for this session"
       - "In progress" sessions (if endedAt missing)
   - To help debug, the importer can return extra stats like:
       setsAttachedToTemplateTracks, setsAttachedToFallbackTracks, setsUnmatchedToTemplate

   Version history
   - 2026-02-27  EXPORTPAGE-05  Add Master Log Import UI + wiring
   - 2026-02-27  EXPORTPAGE-06  Add "Wipe Workout History Only"
   - 2026-02-27  EXPORTPAGE-07  Add "Fix Imported Sessions" button + more docs
   - 2026-02-28  EXPORTPAGE-08  Import status now prints template-attachment stats (if provided)
                               + more breadcrumbs and doc strings

   Notes / Safety
   - "Wipe DB (ALL)" clears every table. Use only when you truly want a full reset.
   - "Wipe Workout History Only" is the safe option for:
       "Keep my catalog/templates, but remove junk/test sessions/sets"
   - Import creates Sessions + Sets.
     After import, if sessions show "In progress" or detail shows "No exercises",
     click "Fix Imported Sessions".
   ============================================================================ */

import React, { useMemo, useRef, useState } from "react";
import { exportCSVsZip } from "../export";
import { backupDbToDownload, restoreDbFromJsonText } from "../dbBackup";
import { wipeAllTables } from "../dbWipe";
import { importMasterExecutionLogCsvText } from "../importMasterExecutionLog";
import { wipeWorkoutHistoryOnly } from "../wipeHistoryOnly";
import { fixImportedSessions } from "../fixImportedSessions";

/** ---------------------------------------------------------------------------
 *  Breadcrumb 1 — Build / Version
 *  ------------------------------------------------------------------------ */
const PAGE_VERSION = "8";
const BUILD_ID = "2026-02-28-EXPORTPAGE-08";
const FILE_FOOTER = "src/pages/ExportPage.tsx";

/** ---------------------------------------------------------------------------
 *  Breadcrumb 2 — Helpers
 *  ------------------------------------------------------------------------ */
function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Format helper: include a metric if it exists (number) */
function addMetric(parts: string[], label: string, value: any) {
  if (typeof value === "number" && Number.isFinite(value)) parts.push(`${label}=${value}`);
}

export default function ExportPage() {
  /** -------------------------------------------------------------------------
   *  Breadcrumb 3 — UI state
   *  ---------------------------------------------------------------------- */
  const [status, setStatus] = useState<string>("");

  // busy gate prevents double-click / overlapping operations
  const [busy, setBusy] = useState<
    | "none"
    | "export"
    | "backup"
    | "restore"
    | "wipeAll"
    | "wipeHistory"
    | "importMaster"
    | "fixImported"
  >("none");

  // Master Log file state (we load CSV into memory before importing)
  const [masterFileName, setMasterFileName] = useState<string>("");
  const [masterText, setMasterText] = useState<string>("");
  const masterInputRef = useRef<HTMLInputElement | null>(null);

  const disabled = busy !== "none";

  /** -------------------------------------------------------------------------
   *  Breadcrumb 4 — Footer (filename-as-footer pattern)
   *  ---------------------------------------------------------------------- */
  const footer = useMemo(() => `${FILE_FOOTER} • v${PAGE_VERSION} • ${BUILD_ID}`, []);

  /** -----------------------------------------------------------------------
   *  Breadcrumb 5 — Export ZIP (CSV bundle)
   *  -------------------------------------------------------------------- */
  async function doExport() {
    setStatus("Preparing…");
    setBusy("export");
    try {
      const blob = await exportCSVsZip();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `workout-export-${todayISODate()}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatus("Done. (Downloaded a zip of CSV files.)");
    } catch (e: any) {
      setStatus(`Export failed: ${e?.message ?? e}`);
    } finally {
      setBusy("none");
    }
  }

  /** -----------------------------------------------------------------------
   *  Breadcrumb 6 — Backup DB (JSON)
   *  -------------------------------------------------------------------- */
  async function doBackupDb() {
    setStatus("Creating backup…");
    setBusy("backup");
    try {
      const name = await backupDbToDownload();
      setStatus(`Backup created: ${name}`);
    } catch (e: any) {
      setStatus(`Backup failed: ${e?.message ?? e}`);
    } finally {
      setBusy("none");
    }
  }

  /** -----------------------------------------------------------------------
   *  Breadcrumb 7 — Restore DB (JSON)
   *  -------------------------------------------------------------------- */
  async function onRestoreFilePicked(file?: File) {
    if (!file) return;

    const ok = confirm(
      "Restore will ERASE your current database and replace it with the selected backup JSON.\n\nContinue?"
    );
    if (!ok) return;

    setStatus("Restoring from backup…");
    setBusy("restore");

    try {
      const text = await file.text();
      await restoreDbFromJsonText(text);
      setStatus("Restore complete. Reloading…");
      window.location.reload();
    } catch (e: any) {
      setStatus(`Restore failed: ${e?.message ?? e}`);
      setBusy("none");
    }
  }

  /** -----------------------------------------------------------------------
   *  Breadcrumb 8 — Wipe DB (ALL)
   *  -------------------------------------------------------------------- */
  async function doWipeDbAll() {
    const ok = confirm(
      "This will CLEAR the current database (ALL tables).\n\nThis is a FULL RESET.\n\nContinue?"
    );
    if (!ok) return;

    setStatus("Wiping database (ALL)…");
    setBusy("wipeAll");

    try {
      await wipeAllTables();
      setStatus("DB wiped (ALL). Reloading…");
      window.location.reload();
    } catch (e: any) {
      setStatus(`Wipe failed: ${e?.message ?? e}`);
      setBusy("none");
    }
  }

  /** -----------------------------------------------------------------------
   *  Breadcrumb 9 — Wipe Workout History Only
   *  -------------------------------------------------------------------- */
  async function doWipeHistoryOnly() {
    const ok = confirm(
      "This will DELETE ALL workout history:\n- Sessions\n- Sets\n(and derived tables like PRs, plus walks if present)\n\nIt will KEEP:\n- Exercises\n- Tracks\n- Templates\n- Folders\n\nContinue?"
    );
    if (!ok) return;

    setStatus("Wiping workout history only…");
    setBusy("wipeHistory");

    try {
      await wipeWorkoutHistoryOnly();
      setStatus("Workout history wiped (catalog/templates kept). Reloading…");
      window.location.reload();
    } catch (e: any) {
      setStatus(`History wipe failed: ${e?.message ?? e}`);
      setBusy("none");
    }
  }

  /** -----------------------------------------------------------------------
   *  Breadcrumb 10 — Fix Imported Sessions (one-time repair tool)
   *  -------------------------------------------------------------------- */
  async function doFixImportedSessions() {
    const ok = confirm(
      "Fix Imported Sessions will:\n- Mark sessions complete (endedAt)\n- Link sessions to templates when names match\n\nUse this after Master Log import if History shows many 'In progress' sessions or Session Detail shows no exercises.\n\nContinue?"
    );
    if (!ok) return;

    setStatus("Fixing imported sessions (template links + completion)…");
    setBusy("fixImported");

    try {
      const r: any = await fixImportedSessions();
      setStatus(`Fix complete: updated=${r.updated}, linked=${r.linked}, completed=${r.completed}. Reloading…`);
      window.location.reload();
    } catch (e: any) {
      setStatus(`Fix failed: ${e?.message ?? e}`);
      setBusy("none");
    }
  }

  /** -----------------------------------------------------------------------
   *  Breadcrumb 11 — Master Execution Log Import
   *  -------------------------------------------------------------------- */
  async function onMasterPicked(file?: File) {
    if (!file) return;
    const text = await file.text();
    setMasterFileName(file.name);
    setMasterText(text);
    setStatus(`Loaded ${file.name} (${text.length.toLocaleString()} chars). Ready to import.`);
  }

  async function doImportMaster() {
    if (!masterText) {
      setStatus("Pick your MASTER_Execution_Log CSV first.");
      return;
    }

    const ok = confirm(
      "Import Master Log will create Sessions + Sets in your database.\n\nRecommended workflow:\n1) Backup DB\n2) (Optional) Wipe Workout History Only\n3) Import Master Log\n4) If needed, run Fix Imported Sessions\n\nContinue?"
    );
    if (!ok) return;

    setBusy("importMaster");
    setStatus("Importing Master Execution Log…");

    try {
      // NOTE: this function lives INSIDE src/importMasterExecutionLog.ts
      // The file name and function name do not need to match.
      const res: any = await importMasterExecutionLogCsvText(masterText);

      // Build a status line that works with both:
      // - older importer (only basic fields)
      // - newer importer (adds template attachment stats)
      const main: string[] = [];
      addMetric(main, "sessions", res.sessionsCreated);
      addMetric(main, "setsInserted", res.setsInserted);

      const details: string[] = [];
      addMetric(details, "rowsRead", res.rowsRead);
      addMetric(details, "rowsUsedAsSets", res.rowsUsedAsSets);
      addMetric(details, "badDateRowsSkipped", res.badDateRowsSkipped);
      addMetric(details, "sessionsLinkedToTemplates", res.sessionsLinkedToTemplates);

      // NEW (only appears if your importer returns these)
      addMetric(details, "setsAttachedToTemplateTracks", res.setsAttachedToTemplateTracks);
      addMetric(details, "setsAttachedToFallbackTracks", res.setsAttachedToFallbackTracks);
      addMetric(details, "setsUnmatchedToTemplate", res.setsUnmatchedToTemplate);

      // Keep your original counts too (useful when you normalize exercises)
      addMetric(details, "exercisesUpserted", res.exercisesUpserted);
      addMetric(details, "tracksUpserted", res.tracksUpserted);

      const msg =
        `Imported Master Log: ${main.join(", ")}` +
        (details.length ? ` (${details.join(", ")}).` : ".");

      setStatus(msg);

      // Reset file state so user can re-pick the same file if needed
      setMasterText("");
      setMasterFileName("");
      if (masterInputRef.current) masterInputRef.current.value = "";
    } catch (e: any) {
      setStatus(`Master Log import failed: ${e?.message ?? e}`);
    } finally {
      setBusy("none");
    }
  }

  return (
    <div className="card">
      <h2>Export</h2>
      <p className="muted">
        Exports exercises, tracks, templates, sessions, sets, walks as CSV files in a single zip.
      </p>

      <hr />

      {/* Breadcrumb 12 — Safety controls */}
      <h3 style={{ marginTop: 0 }}>Backup / Restore / Wipe (DB)</h3>
      <p className="muted" style={{ marginTop: 6 }}>
        Gym-safe workflow: <b>Backup</b> → (optional) <b>Wipe History</b> → <b>Import</b>.
      </p>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <button className="btn" onClick={doBackupDb} disabled={disabled}>
          {busy === "backup" ? "Backing up…" : "Backup DB (JSON)"}
        </button>

        <label
          className="btn"
          style={{
            display: "inline-flex",
            gap: 8,
            alignItems: "center",
            cursor: disabled ? "not-allowed" : "pointer",
          }}
          aria-disabled={disabled}
        >
          {busy === "restore" ? "Restoring…" : "Restore DB"}
          <input
            type="file"
            accept="application/json"
            style={{ display: "none" }}
            disabled={disabled}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              await onRestoreFilePicked(f);
            }}
          />
        </label>

        <button className="btn" onClick={doWipeHistoryOnly} disabled={disabled}>
          {busy === "wipeHistory" ? "Wiping…" : "Wipe Workout History Only"}
        </button>

        <button className="btn" onClick={doWipeDbAll} disabled={disabled}>
          {busy === "wipeAll" ? "Wiping…" : "Wipe DB (ALL)"}
        </button>
      </div>

      <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>
        <b>Wipe Workout History Only</b> keeps exercises/templates/folders but removes sessions/sets.
        Use <b>Wipe DB (ALL)</b> only for a full reset.
      </p>

      <hr />

      {/* Breadcrumb 13 — Import + Fix */}
      <h3 style={{ marginTop: 0 }}>Import Master Execution Log</h3>
      <p className="muted" style={{ marginTop: 6 }}>
        Imports <b>MASTER_Execution_Log_*.csv</b> by creating Sessions + Sets + Exercises.
        <br />
        After import, if sessions show as <b>In progress</b> or Session Detail shows <b>No exercises</b>, click{" "}
        <b>Fix Imported Sessions</b>.
        <br />
        Import debug tip: the status line will show whether sets attached to template tracks (ideal) or fallback tracks.
      </p>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <label
          className="btn"
          style={{
            display: "inline-flex",
            gap: 8,
            alignItems: "center",
            cursor: disabled ? "not-allowed" : "pointer",
          }}
          aria-disabled={disabled}
        >
          Choose master log CSV…
          <input
            ref={masterInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: "none" }}
            disabled={disabled}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              await onMasterPicked(f);
            }}
          />
        </label>

        {masterFileName && (
          <span className="muted" style={{ fontSize: 12 }}>
            Selected: <b>{masterFileName}</b>
          </span>
        )}

        <button className="btn primary" disabled={disabled || !masterText} onClick={doImportMaster}>
          {busy === "importMaster" ? "Importing…" : "Import Master Log"}
        </button>

        <button className="btn" disabled={disabled} onClick={doFixImportedSessions}>
          {busy === "fixImported" ? "Fixing…" : "Fix Imported Sessions"}
        </button>
      </div>

      <hr />

      {/* Breadcrumb 14 — Export */}
      <h3 style={{ marginTop: 0 }}>CSV Export</h3>
      <button className="btn primary" onClick={doExport} disabled={disabled}>
        {busy === "export" ? "Exporting…" : "Export CSVs (zip)"}
      </button>

      {status && (
        <p className="muted" style={{ marginTop: 10 }}>
          {status}
        </p>
      )}

      <hr />

      <p className="muted">
        Warm-up sets are included with <b>setType=warmup</b>. Progression uses only <b>setType=working</b>.
      </p>

      {/* Breadcrumb 15 — Footer */}
      <div style={{ marginTop: 10, fontSize: 12, color: "var(--muted)" }}>{footer}</div>
    </div>
  );
}