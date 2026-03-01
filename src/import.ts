// src/import.ts
/* ============================================================================
   import.ts — CSV Import into Dexie (DEV/staging safe)
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-02-27-IMPORT-01

   Goals
   ✅ Import the app's exported CSVs back into IndexedDB (Dexie)
   ✅ Skip our CSV footer comment lines ("# ...")
   ✅ Robust CSV parsing (quotes, commas, newlines)
   ✅ Transactional import + validation
   ✅ Use bulkPut (upsert) so re-imports don’t explode if IDs already exist

   Supported files (from export.ts)
   - exercises.csv
   - tracks.csv
   - templates.csv
   - template_items.csv
   - sessions.csv
   - sets.csv
   - walks.csv
   ============================================================================ */

import { db } from "./db";

export type ImportResult = {
  kind:
    | "exercises"
    | "tracks"
    | "templates"
    | "template_items"
    | "sessions"
    | "sets"
    | "walks";
  rowsRead: number;
  rowsImported: number;
};

export type ImportOptions = {
  /** If true, parse + validate only, no DB writes */
  dryRun?: boolean;
};

type RowObj = Record<string, string>;

const BUILD_ID = "2026-02-27-IMPORT-01";

/** ---------------------------------------------------------------------------
 *  Breadcrumb 1 — Public entrypoints
 *  ------------------------------------------------------------------------ */

/**
 * Import a CSV file by filename and text contents.
 * Filename can be "exercises.csv" or ".../exercises.csv" (zip folder paths ok).
 */
export async function importCsvText(
  filename: string,
  csvText: string,
  opts: ImportOptions = {}
): Promise<ImportResult> {
  const kind = inferKindFromFilename(filename) ?? inferKindFromHeader(csvText);

  if (!kind) {
    throw new Error(
      `Could not determine CSV kind from filename/header. filename="${filename}". buildId=${BUILD_ID}`
    );
  }

  switch (kind) {
    case "exercises":
      return importExercises(csvText, opts);
    case "tracks":
      return importTracks(csvText, opts);
    case "templates":
      return importTemplates(csvText, opts);
    case "template_items":
      return importTemplateItems(csvText, opts);
    case "sessions":
      return importSessions(csvText, opts);
    case "sets":
      return importSets(csvText, opts);
    case "walks":
      return importWalks(csvText, opts);
    default:
      // exhaustive
      throw new Error(`Unsupported kind: ${(kind as any) ?? "unknown"}`);
  }
}

/** Import helpers by explicit kind if you prefer calling directly. */
export async function importExercises(csvText: string, opts: ImportOptions = {}) {
  const { headers, rows } = parseCsvAsObjects(csvText, REQUIRED.exercises);
  const items = rows.map((r) => ({
    id: req(r, "exerciseId"),
    name: req(r, "name"),
    equipmentTags: splitPipe(opt(r, "equipmentTags")),
    notes: emptyToUndef(opt(r, "notes")),
    createdAt: parseIsoToMs(req(r, "createdAt")),
  }));

  if (opts.dryRun) {
    return { kind: "exercises", rowsRead: rows.length, rowsImported: 0 };
  }

  await db.transaction("rw", db.exercises, async () => {
    // bulkPut = upsert; safe even if user forgot to wipe
    await (db.exercises as any).bulkPut(items);
  });

  return { kind: "exercises", rowsRead: rows.length, rowsImported: items.length };
}

export async function importTracks(csvText: string, opts: ImportOptions = {}) {
  const { rows } = parseCsvAsObjects(csvText, REQUIRED.tracks);
  const items = rows.map((r) => ({
    id: req(r, "trackId"),
    exerciseId: req(r, "exerciseId"),
    trackType: req(r, "trackType"),
    displayName: req(r, "displayName"),
    trackingMode: req(r, "trackingMode"),
    warmupSetsDefault: parseIntReq(r, "warmupSetsDefault"),
    workingSetsDefault: parseIntReq(r, "workingSetsDefault"),
    repMin: parseIntReq(r, "repMin"),
    repMax: parseIntReq(r, "repMax"),
    restSecondsDefault: parseIntReq(r, "restSecondsDefault"),
    rirTargetMin: parseFloatOpt(r, "rirTargetMin"),
    rirTargetMax: parseFloatOpt(r, "rirTargetMax"),
    weightJumpDefault: parseFloatReq(r, "weightJumpDefault"),
    createdAt: parseIsoToMs(req(r, "createdAt")),
  }));

  if (opts.dryRun) return { kind: "tracks", rowsRead: rows.length, rowsImported: 0 };

  await db.transaction("rw", db.tracks, async () => {
    await (db.tracks as any).bulkPut(items);
  });

  return { kind: "tracks", rowsRead: rows.length, rowsImported: items.length };
}

export async function importTemplates(csvText: string, opts: ImportOptions = {}) {
  const { rows } = parseCsvAsObjects(csvText, REQUIRED.templates);
  const items = rows.map((r) => ({
    id: req(r, "templateId"),
    name: req(r, "name"),
    createdAt: parseIsoToMs(req(r, "createdAt")),
  }));

  if (opts.dryRun) return { kind: "templates", rowsRead: rows.length, rowsImported: 0 };

  await db.transaction("rw", db.templates, async () => {
    await (db.templates as any).bulkPut(items);
  });

  return { kind: "templates", rowsRead: rows.length, rowsImported: items.length };
}

export async function importTemplateItems(csvText: string, opts: ImportOptions = {}) {
  const { rows } = parseCsvAsObjects(csvText, REQUIRED.template_items);
  const items = rows.map((r) => ({
    id: req(r, "templateItemId"),
    templateId: req(r, "templateId"),
    orderIndex: parseIntReq(r, "orderIndex"),
    trackId: req(r, "trackId"),
    notes: emptyToUndef(opt(r, "notes")),
    warmupSetsOverride: parseIntOpt(r, "warmupSetsOverride"),
    workingSetsOverride: parseIntOpt(r, "workingSetsOverride"),
    repMinOverride: parseIntOpt(r, "repMinOverride"),
    repMaxOverride: parseIntOpt(r, "repMaxOverride"),
    createdAt: parseIsoToMs(req(r, "createdAt")),
  }));

  if (opts.dryRun)
    return { kind: "template_items", rowsRead: rows.length, rowsImported: 0 };

  await db.transaction("rw", db.templateItems, async () => {
    await (db.templateItems as any).bulkPut(items);
  });

  return { kind: "template_items", rowsRead: rows.length, rowsImported: items.length };
}

export async function importSessions(csvText: string, opts: ImportOptions = {}) {
  const { rows } = parseCsvAsObjects(csvText, REQUIRED.sessions);
  const items = rows.map((r) => ({
    id: req(r, "sessionId"),
    templateId: emptyToUndef(opt(r, "templateId")),
    templateName: emptyToUndef(opt(r, "templateName")),
    startedAt: parseIsoToMs(req(r, "startedAt")),
    endedAt: parseIsoToMsOpt(opt(r, "endedAt")),
    notes: emptyToUndef(opt(r, "notes")),
  }));

  if (opts.dryRun) return { kind: "sessions", rowsRead: rows.length, rowsImported: 0 };

  await db.transaction("rw", db.sessions, async () => {
    await (db.sessions as any).bulkPut(items);
  });

  return { kind: "sessions", rowsRead: rows.length, rowsImported: items.length };
}

export async function importSets(csvText: string, opts: ImportOptions = {}) {
  const { rows } = parseCsvAsObjects(csvText, REQUIRED.sets);
  const items = rows.map((r) => ({
    id: req(r, "setId"),
    sessionId: req(r, "sessionId"),
    trackId: req(r, "trackId"),
    createdAt: parseIsoToMs(req(r, "createdAt")),
    setType: req(r, "setType"),
    weight: parseFloatOpt(r, "weight"),
    reps: parseIntOpt(r, "reps"),
    seconds: parseIntOpt(r, "seconds"),
    rir: parseFloatOpt(r, "rir"),
    notes: emptyToUndef(opt(r, "notes")),
  }));

  if (opts.dryRun) return { kind: "sets", rowsRead: rows.length, rowsImported: 0 };

  await db.transaction("rw", db.sets, async () => {
    await (db.sets as any).bulkPut(items);
  });

  return { kind: "sets", rowsRead: rows.length, rowsImported: items.length };
}

export async function importWalks(csvText: string, opts: ImportOptions = {}) {
  const { rows } = parseCsvAsObjects(csvText, REQUIRED.walks);
  const items = rows.map((r) => ({
    id: req(r, "walkId"),
    date: parseIsoToMs(req(r, "date")),
    durationSeconds: parseIntReq(r, "durationSeconds"),
    distanceMiles: parseFloatOpt(r, "distanceMiles"),
    steps: parseIntOpt(r, "steps"),
    notes: emptyToUndef(opt(r, "notes")),
  }));

  if (opts.dryRun) return { kind: "walks", rowsRead: rows.length, rowsImported: 0 };

  await db.transaction("rw", db.walks, async () => {
    await (db.walks as any).bulkPut(items);
  });

  return { kind: "walks", rowsRead: rows.length, rowsImported: items.length };
}

/** ---------------------------------------------------------------------------
 *  Breadcrumb 2 — Required headers
 *  ------------------------------------------------------------------------ */
const REQUIRED = {
  exercises: ["exerciseId", "name", "equipmentTags", "notes", "createdAt"],
  tracks: [
    "trackId",
    "exerciseId",
    "trackType",
    "displayName",
    "trackingMode",
    "warmupSetsDefault",
    "workingSetsDefault",
    "repMin",
    "repMax",
    "restSecondsDefault",
    "rirTargetMin",
    "rirTargetMax",
    "weightJumpDefault",
    "createdAt",
  ],
  templates: ["templateId", "name", "createdAt"],
  template_items: [
    "templateItemId",
    "templateId",
    "orderIndex",
    "trackId",
    "notes",
    "warmupSetsOverride",
    "workingSetsOverride",
    "repMinOverride",
    "repMaxOverride",
    "createdAt",
  ],
  sessions: ["sessionId", "templateId", "templateName", "startedAt", "endedAt", "notes"],
  sets: ["setId", "sessionId", "trackId", "createdAt", "setType", "weight", "reps", "seconds", "rir", "notes"],
  walks: ["walkId", "date", "durationSeconds", "distanceMiles", "steps", "notes"],
} as const;

/** ---------------------------------------------------------------------------
 *  Breadcrumb 3 — Kind inference
 *  ------------------------------------------------------------------------ */
function inferKindFromFilename(filename: string): ImportResult["kind"] | null {
  const base = filename.split("/").pop()?.toLowerCase() ?? filename.toLowerCase();
  if (base === "exercises.csv") return "exercises";
  if (base === "tracks.csv") return "tracks";
  if (base === "templates.csv") return "templates";
  if (base === "template_items.csv") return "template_items";
  if (base === "sessions.csv") return "sessions";
  if (base === "sets.csv") return "sets";
  if (base === "walks.csv") return "walks";
  return null;
}

function inferKindFromHeader(csvText: string): ImportResult["kind"] | null {
  const cleaned = stripCommentFooterLines(csvText);
  const firstLine = cleaned.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "";
  const headers = parseCsv(cleaned).headers;
  const set = new Set(headers);

  // Use distinctive columns to infer
  if (set.has("exerciseId") && set.has("equipmentTags") && set.has("createdAt") && set.has("name")) return "exercises";
  if (set.has("trackId") && set.has("trackingMode") && set.has("weightJumpDefault")) return "tracks";
  if (set.has("templateId") && set.has("name") && set.has("createdAt") && headers.length === 3) return "templates";
  if (set.has("templateItemId") && set.has("orderIndex") && set.has("repMinOverride")) return "template_items";
  if (set.has("sessionId") && set.has("startedAt") && set.has("endedAt")) return "sessions";
  if (set.has("setId") && set.has("setType") && set.has("rir")) return "sets";
  if (set.has("walkId") && set.has("durationSeconds") && set.has("distanceMiles")) return "walks";

  // fallback: look at first line if parse failed
  if (firstLine.includes("exerciseId,name")) return "exercises";
  return null;
}

/** ---------------------------------------------------------------------------
 *  Breadcrumb 4 — CSV parsing
 *  ------------------------------------------------------------------------ */

/**
 * Remove our "# ..." footer/comment lines (added by export.ts).
 * Safe because they are standalone lines (not quoted fields).
 */
function stripCommentFooterLines(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => {
      const t = line.trim();
      if (!t) return true; // keep empty lines (parser handles)
      return !t.startsWith("#");
    })
    .join("\n");
}

function parseCsvAsObjects(csvText: string, requiredHeaders: readonly string[]) {
  const cleaned = stripCommentFooterLines(csvText);
  const parsed = parseCsv(cleaned);
  const headers = parsed.headers;
  const rows = parsed.rows;

  ensureHeaders(headers, requiredHeaders);

  const objs: RowObj[] = rows.map((cells) => {
    const o: RowObj = {};
    for (let i = 0; i < headers.length; i++) {
      o[headers[i]] = cells[i] ?? "";
    }
    return o;
  });

  return { headers, rows: objs };
}

function ensureHeaders(actual: string[], required: readonly string[]) {
  const a = new Set(actual);
  const missing = required.filter((h) => !a.has(h));
  if (missing.length) {
    throw new Error(`CSV missing required columns: ${missing.join(", ")}`);
  }
}

/**
 * Robust CSV parser:
 * - Commas separate fields
 * - Quotes may wrap fields and escape quotes by ""
 * - Newlines may exist inside quoted fields
 */
function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const s = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];

    if (inQuotes) {
      if (c === '"') {
        const next = s[i + 1];
        if (next === '"') {
          field += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    // not in quotes
    if (c === '"') {
      inQuotes = true;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (c === "\n") {
      row.push(field);
      field = "";

      // Skip completely empty trailing row
      const isAllEmpty = row.every((x) => (x ?? "").length === 0);
      if (!isAllEmpty) rows.push(row);

      row = [];
      continue;
    }

    field += c;
  }

  // flush last field/row
  row.push(field);
  const isAllEmpty = row.every((x) => (x ?? "").length === 0);
  if (!isAllEmpty) rows.push(row);

  if (!rows.length) return { headers: [], rows: [] };

  const headers = rows[0].map((h) => (h ?? "").trim());
  const dataRows = rows.slice(1);

  return { headers, rows: dataRows };
}

/** ---------------------------------------------------------------------------
 *  Breadcrumb 5 — Field helpers
 *  ------------------------------------------------------------------------ */

function req(r: RowObj, k: string): string {
  const v = (r[k] ?? "").toString();
  if (!v) throw new Error(`Missing required value for "${k}"`);
  return v;
}

function opt(r: RowObj, k: string): string {
  return (r[k] ?? "").toString();
}

function emptyToUndef(v: string): string | undefined {
  const t = (v ?? "").toString();
  return t.length ? t : undefined;
}

function splitPipe(v: string): string[] {
  const t = (v ?? "").trim();
  if (!t) return [];
  return t.split("|").map((x) => x.trim()).filter(Boolean);
}

function parseIsoToMs(isoStr: string): number {
  const ms = Date.parse(isoStr);
  if (!Number.isFinite(ms)) throw new Error(`Invalid ISO date: "${isoStr}"`);
  return ms;
}

function parseIsoToMsOpt(isoStr: string): number | undefined {
  const t = (isoStr ?? "").trim();
  if (!t) return undefined;
  return parseIsoToMs(t);
}

function parseIntReq(r: RowObj, k: string): number {
  const v = req(r, k);
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) throw new Error(`Invalid integer for "${k}": "${v}"`);
  return n;
}

function parseIntOpt(r: RowObj, k: string): number | undefined {
  const v = opt(r, k).trim();
  if (!v) return undefined;
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) throw new Error(`Invalid integer for "${k}": "${v}"`);
  return n;
}

function parseFloatReq(r: RowObj, k: string): number {
  const v = req(r, k);
  const n = Number.parseFloat(v);
  if (!Number.isFinite(n)) throw new Error(`Invalid number for "${k}": "${v}"`);
  return n;
}

function parseFloatOpt(r: RowObj, k: string): number | undefined {
  const v = opt(r, k).trim();
  if (!v) return undefined;
  const n = Number.parseFloat(v);
  if (!Number.isFinite(n)) throw new Error(`Invalid number for "${k}": "${v}"`);
  return n;
}