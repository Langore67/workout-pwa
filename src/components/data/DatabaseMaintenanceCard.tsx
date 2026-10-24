import React, { useEffect, useRef, useState } from "react";
import { db } from "../../db";
import { BUILD_INFO } from "../../buildInfo";
import { dryRunMaintenanceScript, type ReadonlyMaintenanceDatabase } from "../../domain/maintenance/dryRunMaintenanceScript";
import { MAINTENANCE_LIMITS, SUPPORTED_MAINTENANCE_TABLES, type MaintenanceDryRunResult, type MaintenanceIssue, type MaintenanceScriptV1 } from "../../domain/maintenance/maintenanceTypes";
import { parseMaintenanceScript } from "../../domain/maintenance/parseMaintenanceScript";
import { validateMaintenanceScript } from "../../domain/maintenance/validateMaintenanceScript";

type Identity = { name: string; schemaVersion: number; counts: Record<string, number> };
const readonlyDb: ReadonlyMaintenanceDatabase = {
  name: db.name,
  verno: db.verno,
  table: (name) => ({ get: (key) => db.table(name).get(key), count: () => db.table(name).count() }),
};
function issueText(errors: MaintenanceIssue[]) { return errors.map((entry) => `${entry.path}: ${entry.message}`); }
function displayValue(value: unknown) {
  if (value && typeof value === "object" && (value as any).missing === true) return "(missing)";
  return JSON.stringify(value);
}
async function sha256(text: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function copyText(text: string) {
  if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return; }
  const area = document.createElement("textarea"); area.value = text; area.style.position = "fixed"; area.style.left = "-9999px";
  document.body.appendChild(area); area.select(); const ok = document.execCommand("copy"); area.remove();
  if (!ok) throw new Error("Clipboard copy was unavailable.");
}
function downloadJson(name: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
}

export function DatabaseMaintenanceCard() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [identity, setIdentity] = useState<Identity>();
  const [script, setScript] = useState<MaintenanceScriptV1>();
  const [scriptText, setScriptText] = useState("");
  const [scriptHash, setScriptHash] = useState<string>();
  const [fileName, setFileName] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [result, setResult] = useState<MaintenanceDryRunResult>();
  const [status, setStatus] = useState("");
  useEffect(() => { void (async () => {
    const counts: Record<string, number> = {};
    for (const table of SUPPORTED_MAINTENANCE_TABLES) counts[table] = await readonlyDb.table(table).count();
    setIdentity({ name: db.name, schemaVersion: db.verno, counts });
  })(); }, []);

  async function loadFile(file?: File) {
    setScript(undefined); setResult(undefined); setErrors([]); setStatus(""); setFileName(file?.name ?? ""); setScriptText(""); setScriptHash(undefined);
    if (!file) return;
    if (file.size > MAINTENANCE_LIMITS.maxFileBytes) { setErrors([`File exceeds ${MAINTENANCE_LIMITS.maxFileBytes.toLocaleString()} bytes.`]); return; }
    const text = await file.text();
    const parsed = parseMaintenanceScript(text);
    if (!parsed.ok) { setErrors(issueText(parsed.errors)); return; }
    const validation = validateMaintenanceScript(parsed.script);
    if (!validation.valid) { setErrors(issueText(validation.errors)); return; }
    setScript(parsed.script); setScriptText(text); setScriptHash(await sha256(text)); setStatus("Script parsed and validated. No database reads or writes have been performed yet.");
  }
  async function runDryCheck() {
    if (!script) return;
    setStatus("Running read-only dry check…");
    try {
      const dryRun = await dryRunMaintenanceScript(readonlyDb, script, { scriptSha256: scriptHash, origin: window.location.origin, buildId: BUILD_INFO.buildId });
      setResult(dryRun); setStatus("Dry check complete. No data modified.");
    } catch (error: any) { setErrors([error?.message ?? String(error)]); setStatus("Dry check failed. No data modified."); }
  }
  const reportName = `ironforge-maintenance-dry-run-${script?.id ?? "report"}.json`;
  return (
    <section aria-labelledby="database-maintenance-title" data-testid="database-maintenance-card" style={{ marginTop: 14 }}>
      <h4 id="database-maintenance-title" style={{ margin: "0 0 6px" }}>Database Maintenance</h4>
      <p className="muted" style={{ marginTop: 0 }}>Upload declarative JSON and compare it with this database. Slice 1 is read-only and cannot execute changes.</p>
      <div style={{ display: "grid", gap: 4, fontSize: 13 }}>
        <div><b>Origin:</b> {window.location.origin}</div><div><b>Database:</b> {identity?.name ?? "Loading…"}</div>
        <div><b>Dexie schema:</b> {identity?.schemaVersion ?? "Loading…"}</div><div><b>Build:</b> {BUILD_INFO.buildId}</div>
        {identity ? <details><summary>Record counts</summary><ul>{Object.entries(identity.counts).map(([table, count]) => <li key={table}>{table}: {count}</li>)}</ul></details> : null}
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12, alignItems: "center" }}>
        <button className="btn" onClick={() => inputRef.current?.click()}>Upload Maintenance Script</button>
        <input ref={inputRef} aria-label="Maintenance JSON file" type="file" accept=".json,application/json" style={{ display: "none" }} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; void loadFile(file); }} />
        {fileName ? <span className="muted">Selected: <b>{fileName}</b></span> : null}
      </div>
      {errors.length ? <div role="alert" style={{ marginTop: 10, color: "var(--danger, #b42318)" }}><b>Validation errors</b><ul>{errors.map((error, index) => <li key={`${index}-${error}`}>{error}</li>)}</ul></div> : null}
      {script ? <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 10 }} data-testid="maintenance-script-summary">
        <b>Script</b><div>ID: {script.id}</div><div>Name: {script.name}</div><div>Created: {script.createdAt}</div><div>Operations: {script.operationCount}</div>
        <div style={{ overflowWrap: "anywhere" }}>Script SHA-256: {scriptHash ?? "Calculating…"}</div>
        {script.sourceBackup ? <details><summary>Source-backup provenance</summary><pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(script.sourceBackup, null, 2)}</pre></details> : null}
        <button className="btn primary" style={{ marginTop: 10 }} onClick={() => void runDryCheck()}>Run Dry Check</button>
      </div> : null}
      {result ? <div style={{ marginTop: 14 }} data-testid="maintenance-dry-run-result">
        <h4>Dry Run Result</h4>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 6 }}>
          <div>Would change: <b>{result.wouldChangeCount}</b></div><div>Already satisfied: <b>{result.alreadySatisfiedCount}</b></div>
          <div>Conflicts: <b>{result.conflictCount}</b></div><div>Not found: <b>{result.notFoundCount}</b></div><div>Invalid: <b>{result.invalidCount}</b></div>
        </div>
        <p style={{ fontWeight: 800 }}>NO DATA MODIFIED</p>
        {result.preconditionErrors.length ? <ul>{issueText(result.preconditionErrors).map((text) => <li key={text}>{text}</li>)}</ul> : null}
        {result.warnings.length ? <div><b>Provenance warnings</b><ul>{result.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div> : null}
        <details data-testid="maintenance-change-preview"><summary>View Changes</summary>
          <div style={{ display: "grid", gap: 8, marginTop: 8 }}>{result.operations.map((operation) => <details key={operation.index} style={{ borderTop: "1px solid var(--border)", paddingTop: 6 }}>
            <summary>#{operation.index + 1} {operation.table ?? "Unknown"} {operation.key ?? ""} — {operation.status}</summary>
            {operation.changedFields.map((field) => <div key={field} style={{ marginTop: 5 }}><b>{field}</b><div>Expected: {displayValue(operation.expected[field])}</div><div>Actual: {displayValue(operation.before[field])}</div><div>Desired: {displayValue(operation.after[field])}</div></div>)}
            {operation.error ? <div className="muted">{operation.error}</div> : null}
          </details>)}</div>
        </details>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
          <button className="btn" onClick={async () => { try { await copyText(JSON.stringify(result, null, 2)); setStatus("Dry-run report copied."); } catch (error: any) { setStatus(`Copy failed: ${error?.message ?? error}`); } }}>Copy Report</button>
          <button className="btn" onClick={() => downloadJson(reportName, result)}>Download Report</button>
        </div>
      </div> : null}
      {status ? <p className="muted" aria-live="polite">{status}</p> : null}
      <p className="muted" style={{ fontSize: 12 }}>Before any future maintenance execution, create and retain a current IronForge database backup.</p>
      <span style={{ display: "none" }}>{scriptText.length}</span>
    </section>
  );
}
