import React, { useState } from 'react';
import { exportCSVsZip } from '../export';

export default function ExportPage() {
  const [status, setStatus] = useState<string>('');

  async function doExport() {
    setStatus('Preparing…');
    try {
      const blob = await exportCSVsZip();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `workout-export-${new Date().toISOString().slice(0,10)}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatus('Done. (Downloaded a zip of CSV files.)');
    } catch (e: any) {
      setStatus(`Export failed: ${e?.message ?? e}`);
    }
  }

  return (
    <div className="card">
      <h2>Export</h2>
      <p className="muted">Exports exercises, tracks, templates, sessions, sets, walks as CSV files in a single zip.</p>
      <hr />
      <button className="btn primary" onClick={doExport}>Export CSVs (zip)</button>
      {status && <p className="muted" style={{marginTop:10}}>{status}</p>}
      <hr />
      <p className="muted">
        Warm-up sets are included with <b>setType=warmup</b>. Progression uses only <b>setType=working</b>.
      </p>
    </div>
  );
}
