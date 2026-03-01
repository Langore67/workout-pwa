// src/export.ts
/* ============================================================================
   export.ts — CSV + ZIP Export (+ optional DB backup JSON helpers)
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-02-27-EXPORT-01

   Goals (this iteration)
   ✅ Keep existing CSV+ZIP export behavior
   ✅ Add export/version info + breadcrumbs
   ✅ Add filename as CSV footer (comment line) + build/version metadata
   ✅ Prepare for “backup DB then import CSV” workflow (safe, gym-ready)

   Notes
   - CSV footer lines start with "# " so most tools ignore them gracefully.
   - We do NOT change your existing column order/headers.
   - If you want *pure* CSV with no footer, we can gate footers behind an option.
   ============================================================================ */

import JSZip from "jszip";
import { db } from "./db";

/** ---------------------------------------------------------------------------
 *  Breadcrumb 1 — Version / Stamp Helpers
 *  ------------------------------------------------------------------------ */
const EXPORT_VERSION = "1";
const BUILD_ID = "2026-02-27-EXPORT-01";

function isoNow(): string {
  return new Date().toISOString();
}

function stamp(): string {
  // YYYY-MM-DD_HHMMSS (local time) — good for filenames
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    d.getFullYear() +
    "-" +
    pad(d.getMonth() + 1) +
    "-" +
    pad(d.getDate()) +
    "_" +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

function q(s: unknown): string {
  const v = (s ?? "").toString();
  const esc = v.replaceAll('"', '""');
  return `"${esc}"`;
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

/** ---------------------------------------------------------------------------
 *  Breadcrumb 2 — CSV Footer
 *  Adds: exportedAt, buildId, exportVersion, filename
 *  ------------------------------------------------------------------------ */
function withFooter(csv: string, filename: string): string {
  const exportedAt = isoNow();
  // Ensure trailing newline before footer
  const base = csv.endsWith("\n") ? csv : csv + "\n";
  return (
    base +
    `# filename=${filename}\n` +
    `# exportedAt=${exportedAt}\n` +
    `# exportVersion=${EXPORT_VERSION}\n` +
    `# buildId=${BUILD_ID}\n`
  );
}

/** ---------------------------------------------------------------------------
 *  Breadcrumb 3 — Main ZIP Export
 *  ------------------------------------------------------------------------ */
export async function exportCSVsZip(): Promise<Blob> {
  const [exercises, tracks, templates, templateItems, sessions, sets, walks] =
    await Promise.all([
      db.exercises.toArray(),
      db.tracks.toArray(),
      db.templates.toArray(),
      db.templateItems.toArray(),
      db.sessions.toArray(),
      db.sets.toArray(),
      db.walks.toArray(),
    ]);

  const zip = new JSZip();

  // Use a stamped prefix so each export is unique but still readable
  const prefix = `workout_export_${stamp()}`;

  // Breadcrumb 3a — Individual CSVs (with footer metadata)
  const exercisesName = `${prefix}/exercises.csv`;
  zip.file(exercisesName, withFooter(exercisesCSV(exercises), exercisesName));

  const tracksName = `${prefix}/tracks.csv`;
  zip.file(tracksName, withFooter(tracksCSV(tracks), tracksName));

  const templatesName = `${prefix}/templates.csv`;
  zip.file(templatesName, withFooter(templatesCSV(templates), templatesName));

  const templateItemsName = `${prefix}/template_items.csv`;
  zip.file(templateItemsName, withFooter(templateItemsCSV(templateItems), templateItemsName));

  const sessionsName = `${prefix}/sessions.csv`;
  zip.file(sessionsName, withFooter(sessionsCSV(sessions), sessionsName));

  const setsName = `${prefix}/sets.csv`;
  zip.file(setsName, withFooter(setsCSV(sets), setsName));

  const walksName = `${prefix}/walks.csv`;
  zip.file(walksName, withFooter(walksCSV(walks), walksName));

  // Breadcrumb 3b — A small manifest for humans (handy when importing later)
  const manifestName = `${prefix}/_manifest.txt`;
  zip.file(
    manifestName,
    [
      `WorkOut App Export Manifest`,
      `exportVersion=${EXPORT_VERSION}`,
      `buildId=${BUILD_ID}`,
      `exportedAt=${isoNow()}`,
      ``,
      `Files:`,
      `- ${exercisesName}`,
      `- ${tracksName}`,
      `- ${templatesName}`,
      `- ${templateItemsName}`,
      `- ${sessionsName}`,
      `- ${setsName}`,
      `- ${walksName}`,
      ``,
    ].join("\n")
  );

  return zip.generateAsync({ type: "blob" });
}

/** ---------------------------------------------------------------------------
 *  Breadcrumb 4 — CSV Writers (unchanged headers/columns)
 *  ------------------------------------------------------------------------ */
function exercisesCSV(rows: any[]): string {
  let out = "exerciseId,name,equipmentTags,notes,createdAt\n";
  for (const e of rows.sort((a, b) => (a.name || "").localeCompare(b.name || ""))) {
    out += `${e.id},${q(e.name)},${q((e.equipmentTags || []).join("|"))},${q(e.notes)},${iso(e.createdAt)}\n`;
  }
  return out;
}

function tracksCSV(rows: any[]): string {
  let out =
    "trackId,exerciseId,trackType,displayName,trackingMode,warmupSetsDefault,workingSetsDefault,repMin,repMax,restSecondsDefault,rirTargetMin,rirTargetMax,weightJumpDefault,createdAt\n";
  for (const t of rows.sort((a, b) => (a.displayName || "").localeCompare(b.displayName || ""))) {
    out +=
      `${t.id},${t.exerciseId},${q(t.trackType)},${q(t.displayName)},${q(t.trackingMode)},` +
      `${t.warmupSetsDefault},${t.workingSetsDefault},${t.repMin},${t.repMax},${t.restSecondsDefault},` +
      `${t.rirTargetMin ?? ""},${t.rirTargetMax ?? ""},${t.weightJumpDefault},${iso(t.createdAt)}\n`;
  }
  return out;
}

function templatesCSV(rows: any[]): string {
  let out = "templateId,name,createdAt\n";
  for (const t of rows.sort((a, b) => (a.name || "").localeCompare(b.name || ""))) {
    out += `${t.id},${q(t.name)},${iso(t.createdAt)}\n`;
  }
  return out;
}

function templateItemsCSV(rows: any[]): string {
  let out =
    "templateItemId,templateId,orderIndex,trackId,notes,warmupSetsOverride,workingSetsOverride,repMinOverride,repMaxOverride,createdAt\n";
  for (const it of rows.sort(
    (a, b) => (a.templateId || "").localeCompare(b.templateId || "") || (a.orderIndex ?? 0) - (b.orderIndex ?? 0)
  )) {
    out +=
      `${it.id},${it.templateId},${it.orderIndex},${it.trackId},${q(it.notes)},` +
      `${it.warmupSetsOverride ?? ""},${it.workingSetsOverride ?? ""},${it.repMinOverride ?? ""},${it.repMaxOverride ?? ""},${iso(it.createdAt)}\n`;
  }
  return out;
}

function sessionsCSV(rows: any[]): string {
  let out = "sessionId,templateId,templateName,startedAt,endedAt,notes\n";
  for (const s of rows.sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0))) {
    out += `${s.id},${s.templateId ?? ""},${q(s.templateName)},${iso(s.startedAt)},${s.endedAt ? iso(s.endedAt) : ""},${q(s.notes)}\n`;
  }
  return out;
}

function setsCSV(rows: any[]): string {
  let out = "setId,sessionId,trackId,createdAt,setType,weight,reps,seconds,rir,notes\n";
  for (const se of rows.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))) {
    out += `${se.id},${se.sessionId},${se.trackId},${iso(se.createdAt)},${q(se.setType)},${se.weight ?? ""},${se.reps ?? ""},${se.seconds ?? ""},${se.rir ?? ""},${q(se.notes)}\n`;
  }
  return out;
}

function walksCSV(rows: any[]): string {
  let out = "walkId,date,durationSeconds,distanceMiles,steps,notes\n";
  for (const w of rows.sort((a, b) => (a.date ?? 0) - (b.date ?? 0))) {
    out += `${w.id},${iso(w.date)},${w.durationSeconds},${w.distanceMiles ?? ""},${w.steps ?? ""},${q(w.notes)}\n`;
  }
  return out;
}