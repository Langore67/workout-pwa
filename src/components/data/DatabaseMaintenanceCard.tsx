import React, { useEffect, useRef, useState } from "react";
import { db } from "../../db";
import { BUILD_INFO } from "../../buildInfo";
import { dryRunMaintenanceScript, type ReadonlyMaintenanceDatabase } from "../../domain/maintenance/dryRunMaintenanceScript";
import { createDexieMaintenanceExecutionDatabase, executeMaintenanceScript, sha256MaintenanceText } from "../../domain/maintenance/executeMaintenanceScript";
import { MAINTENANCE_LIMITS, SUPPORTED_MAINTENANCE_TABLES, type MaintenanceDryRunResult, type MaintenanceExecutionResult, type MaintenanceIssue, type MaintenanceScriptV1 } from "../../domain/maintenance/maintenanceTypes";
import { parseMaintenanceScript } from "../../domain/maintenance/parseMaintenanceScript";
import { validateMaintenanceScript } from "../../domain/maintenance/validateMaintenanceScript";

type Identity = { name: string; schemaVersion: number; counts: Record<string, number> };
const readonlyDb: ReadonlyMaintenanceDatabase = {
  name: db.name,
  verno: db.verno,
  table: (name) => ({ get: (key) => db.table(name).get(key), count: () => db.table(name).count() }),
};
const executionDb = createDexieMaintenanceExecutionDatabase(db);
function issueText(errors: MaintenanceIssue[]) { return errors.map((entry) => `${entry.path}: ${entry.message}`); }
function displayValue(value: unknown) {
  if (value && typeof value === "object" && (value as any).missing === true) return "(missing)";
  return JSON.stringify(value);
}
const shortHash = (hash: string) => `${hash.slice(0, 12)}…${hash.slice(-12)}`;
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
  const executionInFlightRef = useRef(false);
  const [identity, setIdentity] = useState<Identity>();
  const [script, setScript] = useState<MaintenanceScriptV1>();
  const [scriptText, setScriptText] = useState("");
  const [scriptHash, setScriptHash] = useState<string>();
  const [fileName, setFileName] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [result, setResult] = useState<MaintenanceDryRunResult>();
  const [dryRunHash, setDryRunHash] = useState<string>();
  const [backupConfirmed, setBackupConfirmed] = useState(false);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<MaintenanceExecutionResult>();
  const [status, setStatus] = useState("");
  useEffect(() => { void (async () => {
    const counts: Record<string, number> = {};
    for (const table of SUPPORTED_MAINTENANCE_TABLES) counts[table] = await readonlyDb.table(table).count();
    setIdentity({ name: db.name, schemaVersion: db.verno, counts });
  })(); }, []);

  async function loadFile(file?: File) {
    setScript(undefined); setResult(undefined); setDryRunHash(undefined); setExecutionResult(undefined); setBackupConfirmed(false); setReviewConfirmed(false); setErrors([]); setStatus(""); setFileName(file?.name ?? ""); setScriptText(""); setScriptHash(undefined);
    if (!file) return;
    if (file.size > MAINTENANCE_LIMITS.maxFileBytes) { setErrors([`File exceeds ${MAINTENANCE_LIMITS.maxFileBytes.toLocaleString()} bytes.`]); return; }
    const text = await file.text();
    const parsed = parseMaintenanceScript(text);
    if (!parsed.ok) { setErrors(issueText(parsed.errors)); return; }
    const validation = validateMaintenanceScript(parsed.script);
    if (!validation.valid) { setErrors(issueText(validation.errors)); return; }
    setScript(parsed.script); setScriptText(text); setScriptHash(await sha256MaintenanceText(text)); setStatus("Script parsed and validated. No database reads or writes have been performed yet.");
  }
  async function runDryCheck() {
    if (!script || !scriptHash) return;
    setBackupConfirmed(false); setReviewConfirmed(false); setDryRunHash(undefined); setExecutionResult(undefined);
    setStatus("Running read-only dry check…");
    try {
      const dryRun = await dryRunMaintenanceScript(readonlyDb, script, { scriptSha256: scriptHash, origin: window.location.origin, buildId: BUILD_INFO.buildId });
      setResult(dryRun); setDryRunHash(scriptHash); setStatus("Dry check complete. No data modified.");
    } catch (error: any) { setErrors([error?.message ?? String(error)]); setStatus("Dry check failed. No data modified."); }
  }
  const dryRunEligible = !!result && !!scriptHash && dryRunHash === scriptHash && result.scriptSha256 === scriptHash &&
    result.preconditionErrors.length === 0 && result.conflictCount === 0 && result.notFoundCount === 0 && result.invalidCount === 0 &&
    result.operationCount === script?.operations.length && result.operations.every((operation) => operation.status === "WOULD_CHANGE" || operation.status === "ALREADY_SATISFIED");
  const executionEligible = dryRunEligible && backupConfirmed && reviewConfirmed && !executing;
  async function execute() {
    if (executionInFlightRef.current || !script || !scriptHash || !dryRunHash || !executionEligible) return;
    const freshHash = await sha256MaintenanceText(scriptText);
    if (freshHash !== dryRunHash) {
      setResult(undefined); setDryRunHash(undefined); setBackupConfirmed(false); setReviewConfirmed(false); setStatus("Execution refused: script text changed after the dry run. Run a new dry check."); return;
    }
    const approved = window.confirm([
      "Execute Database Maintenance", `Script: ${script.name}`, `ID: ${script.id}`, `SHA-256: ${shortHash(freshHash)}`,
      `Records that would change: ${result.wouldChangeCount}`, `Already satisfied: ${result.alreadySatisfiedCount}`,
      `Database: ${db.name}`, `Schema version: ${db.verno}`, "All changes will occur in one transaction.",
    ].join("\n"));
    if (!approved) return;
    executionInFlightRef.current = true;
    setExecuting(true); setErrors([]); setStatus("Running final checks before the transaction…");
    try {
      const report = await executeMaintenanceScript(executionDb, scriptText, { dryRunSha256: dryRunHash, origin: window.location.origin, buildId: BUILD_INFO.buildId });
      setExecutionResult(report);
      if (report.committed && report.verified) {
        setStatus("Transaction committed and post-commit verification passed.");
        try {
          const refreshed = await dryRunMaintenanceScript(readonlyDb, script, { scriptSha256: scriptHash, origin: window.location.origin, buildId: BUILD_INFO.buildId });
          setResult(refreshed); setDryRunHash(scriptHash);
          const counts: Record<string, number> = {};
          for (const table of SUPPORTED_MAINTENANCE_TABLES) counts[table] = await readonlyDb.table(table).count();
          setIdentity({ name: db.name, schemaVersion: db.verno, counts });
        } catch (error: any) {
          setResult(undefined); setDryRunHash(undefined); setStatus(`Transaction committed and verification passed, but the follow-up dry check failed: ${error?.message ?? String(error)}`);
        }
      } else if (report.committed) setStatus("Transaction committed, but post-commit verification failed.");
      else if (report.transactionStarted) { setResult(undefined); setDryRunHash(undefined); setStatus("Transaction rolled back. No maintenance changes were committed. Run a new dry check."); }
      else { setResult(undefined); setDryRunHash(undefined); setStatus("Execution was refused before a transaction began. Run a new dry check."); }
    } catch (error: any) {
      setResult(undefined); setDryRunHash(undefined); setStatus(`Execution failed: ${error?.message ?? String(error)}`);
    } finally {
      setBackupConfirmed(false); setReviewConfirmed(false); setExecuting(false);
      executionInFlightRef.current = false;
    }
  }
  const reportName = `ironforge-maintenance-dry-run-${script?.id ?? "report"}.json`;
  const executionReportName = `ironforge-maintenance-execution-${script?.id ?? "report"}.json`;
  return (
    <section aria-labelledby="database-maintenance-title" data-testid="database-maintenance-card" style={{ marginTop: 14 }}>
      <h4 id="database-maintenance-title" style={{ margin: "0 0 6px" }}>Database Maintenance</h4>
      <p className="muted" style={{ marginTop: 0 }}>Upload declarative JSON, review a read-only dry run, and execute only validated field updates in one transaction.</p>
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
        {dryRunEligible ? <div data-testid="maintenance-execution-confirmations" style={{ marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
          <p className="muted">Source-backup warnings are provenance only and do not block execution. Runtime database/schema checks and each operation's exact expectations are enforced again immediately before writing.</p>
          <label style={{ display: "block", marginTop: 8 }}><input type="checkbox" checked={backupConfirmed} onChange={(event) => setBackupConfirmed(event.target.checked)} /> I created and retained a current IronForge database backup.</label>
          <label style={{ display: "block", marginTop: 8 }}><input type="checkbox" checked={reviewConfirmed} onChange={(event) => setReviewConfirmed(event.target.checked)} /> I reviewed every proposed maintenance change.</label>
          <button className="btn primary" style={{ marginTop: 10 }} disabled={!executionEligible} onClick={() => void execute()}>{executing ? "Executing…" : "Execute Maintenance Script"}</button>
        </div> : null}
      </div> : null}
      {executionResult ? <div data-testid="maintenance-execution-result" style={{ marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
        <h4>Execution Result</h4>
        <div><b>{executionResult.committed ? "Transaction committed" : executionResult.transactionStarted ? "Transaction rolled back" : "Execution refused"}</b></div>
        <div>Post-commit verification: {executionResult.verified ? "passed" : executionResult.committed ? "failed" : "not performed"}</div>
        <div>Changed: {executionResult.changedCount}</div><div>Already satisfied: {executionResult.alreadySatisfiedCount}</div>
        <div>Script ID: {executionResult.scriptId}</div><div style={{ overflowWrap: "anywhere" }}>Script SHA-256: {executionResult.scriptSha256}</div><div>Completed: {executionResult.completedAt}</div>
        {executionResult.errors.length ? <div role="alert"><b>Errors</b><ul>{executionResult.errors.map((error, index) => <li key={`${index}-${error.message}`}>{error.operationIndex === undefined ? "" : `Operation ${error.operationIndex + 1}: `}{error.message}</li>)}</ul></div> : null}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
          <button className="btn" onClick={async () => { try { await copyText(JSON.stringify(executionResult, null, 2)); setStatus("Execution report copied."); } catch (error: any) { setStatus(`Copy failed: ${error?.message ?? error}`); } }}>Copy Execution Report</button>
          <button className="btn" onClick={() => downloadJson(executionReportName, executionResult)}>Download Execution Report</button>
        </div>
      </div> : null}
      {status ? <p className="muted" aria-live="polite">{status}</p> : null}
      <p className="muted" style={{ fontSize: 12 }}>IronForge cannot prove whether this database is production or test, or whether a downloaded backup is recoverable.</p>
      <span style={{ display: "none" }}>{scriptText.length}</span>
    </section>
  );
}
