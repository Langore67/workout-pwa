// src/pages/BodyPage.tsx
/* ========================================================================== */
/*  BodyPage.tsx                                                              */
/*  BUILD_ID: 2026-03-05-BODY-03                                              */
/* -------------------------------------------------------------------------- */
/*  Minimal Body Metrics Entry (Hume-friendly)                                */
/*                                                                            */
/*  Goals                                                                     */
/*  - Fast entry: all fields optional                                         */
/*  - No bottlenecks: missing metrics allowed                                 */
/*  - Simple list + delete                                                    */
/*  - Future-proof old rows: tolerate takenAt/date/createdAt, backfill        */
/*    measuredAt, and keep new writes dual-written                            */
/*                                                                            */
/*  Revision history                                                          */
/*  - 2026-02-24  BODY-01  Initial: add + list + delete (sparse-safe)         */
/*  - 2026-03-01  BODY-02  Prefer measuredAt index; tolerate old rows         */
/*  - 2026-03-05  BODY-03  Harden mixed-row reads; write both timestamps;     */
/*                          use typed db.bodyMetrics                          */
/* ========================================================================== */

import React, { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { uuid } from "../utils";
import { Page, Section } from "../components/Page.tsx";

type BodyMetricRow = {
  id: string;

  // compatibility + canonical
  takenAt?: number; // legacy/BodyPage
  measuredAt?: number; // canonical/db.ts v9+

  // extra legacy tolerance
  date?: number;

  weightLb?: number;
  // tolerate old naming too
  weight?: number;

  bodyFatPct?: number;
  skeletalMuscleMassLb?: number;
  visceralFatIndex?: number;
  bodyWaterPct?: number;

  createdAt?: number;
};

function pickTime(r: BodyMetricRow): number {
  const t = Number(r?.measuredAt ?? r?.takenAt ?? r?.date ?? r?.createdAt);
  return Number.isFinite(t) ? t : 0;
}

function pickWeightLb(r: BodyMetricRow): number | undefined {
  const bw = (r as any)?.weightLb ?? (r as any)?.weight;
  return typeof bw === "number" && Number.isFinite(bw) && bw > 0 ? bw : undefined;
}

function fmtDate(ms: number) {
  const d = new Date(ms);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function toNumOrUndef(s: string): number | undefined {
  const t = (s ?? "").trim();
  if (!t) return undefined;
  const n = Number(t);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

function show(v: number | undefined, digits = 1) {
  if (v == null || !Number.isFinite(v)) return "—";
  const f = digits === 0 ? Math.round(v).toString() : v.toFixed(digits);
  if (digits > 0 && f.endsWith(".0")) return String(Math.round(v));
  return f;
}

export default function BodyPage() {
  const table = db.bodyMetrics;

  // --- Form state -----------------------------------------------------------
  const [weightLb, setWeightLb] = useState("");
  const [bodyFatPct, setBodyFatPct] = useState("");
  const [skeletalMuscleMassLb, setSkeletalMuscleMassLb] = useState("");
  const [visceralFatIndex, setVisceralFatIndex] = useState("");
  const [bodyWaterPct, setBodyWaterPct] = useState("");

  const hasAnyInput = useMemo(() => {
    return (
      !!weightLb.trim() ||
      !!bodyFatPct.trim() ||
      !!skeletalMuscleMassLb.trim() ||
      !!visceralFatIndex.trim() ||
      !!bodyWaterPct.trim()
    );
  }, [weightLb, bodyFatPct, skeletalMuscleMassLb, visceralFatIndex, bodyWaterPct]);

  // --- Read recent ----------------------------------------------------------
  const rows = useLiveQuery(async () => {
    try {
      // Fast path: use canonical indexed field when rows are clean.
      try {
        const indexed = ((await table.orderBy("measuredAt").reverse().limit(30).toArray()) ??
          []) as BodyMetricRow[];

        const indexedLooksClean =
          indexed.length > 0 &&
          indexed.every((r) => typeof r.measuredAt === "number" && Number.isFinite(r.measuredAt));

        if (indexedLooksClean) {
          return indexed;
        }
      } catch {
        // ignore and fall through
      }

      // Safe fallback: scan, normalize, optionally persist backfill, then sort.
      const arr = ((await table.toArray()) ?? []) as BodyMetricRow[];

      const patch: BodyMetricRow[] = [];
      for (const r of arr) {
        const legacyTime = Number((r as any)?.takenAt ?? (r as any)?.date ?? (r as any)?.createdAt);

        if ((r as any)?.measuredAt == null && Number.isFinite(legacyTime) && legacyTime > 0) {
          (r as any).measuredAt = legacyTime;
          patch.push(r);
        }

        // Keep takenAt mirrored too if an old row only had measuredAt.
        const measured = Number((r as any)?.measuredAt);
        if ((r as any)?.takenAt == null && Number.isFinite(measured) && measured > 0) {
          (r as any).takenAt = measured;
          if (!patch.includes(r)) patch.push(r);
        }
      }

      if (patch.length) {
        try {
          await table.bulkPut(patch as any[]);
        } catch {
          // ignore persistence errors; UI still works
        }
      }

      return arr
        .slice()
        .sort((a, b) => pickTime(b) - pickTime(a))
        .slice(0, 30);
    } catch {
      return [] as BodyMetricRow[];
    }
  }, []);

  async function addEntry() {
    const w = toNumOrUndef(weightLb);
    const bf = toNumOrUndef(bodyFatPct);
    const smm = toNumOrUndef(skeletalMuscleMassLb);
    const vfi = toNumOrUndef(visceralFatIndex);
    const water = toNumOrUndef(bodyWaterPct);

    const typedButInvalid =
      (weightLb.trim() && w == null) ||
      (bodyFatPct.trim() && bf == null) ||
      (skeletalMuscleMassLb.trim() && smm == null) ||
      (visceralFatIndex.trim() && vfi == null) ||
      (bodyWaterPct.trim() && water == null);

    if (typedButInvalid) {
      window.alert("One or more fields are not valid numbers. Please correct and try again.");
      return;
    }

    const hasAnyValid = w != null || bf != null || smm != null || vfi != null || water != null;
    if (!hasAnyValid) return;

    const now = Date.now();

    // Write both fields:
    // - measuredAt is canonical and indexed
    // - takenAt preserved for compatibility
    const row: BodyMetricRow = {
      id: uuid(),
      measuredAt: now,
      takenAt: now,
      createdAt: now,
      weightLb: w,
      bodyFatPct: bf,
      skeletalMuscleMassLb: smm,
      visceralFatIndex: vfi,
      bodyWaterPct: water,
    };

    await table.add(row as any);

    setWeightLb("");
    setBodyFatPct("");
    setSkeletalMuscleMassLb("");
    setVisceralFatIndex("");
    setBodyWaterPct("");
  }

  async function deleteEntry(id: string) {
    const ok = window.confirm("Delete this entry?");
    if (!ok) return;
    await table.delete(id);
  }

  return (
    <Page title="Body">
      <Section>
        <div style={{ fontWeight: 900, fontSize: 18 }}>Body metrics</div>
        <div className="muted" style={{ marginTop: 6 }}>
          Quick entry. All fields optional. Hume handles detailed trends — we store snapshots for
          coaching context.
        </div>

        <div className="card" style={{ padding: 12, marginTop: 12 }}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Add entry</div>

          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <div style={{ minWidth: 160, flex: 1 }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                Weight (lb)
              </div>
              <input
                className="input"
                value={weightLb}
                onChange={(e) => setWeightLb(e.target.value)}
                placeholder="200"
                inputMode="decimal"
              />
            </div>

            <div style={{ minWidth: 160, flex: 1 }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                Body Fat %
              </div>
              <input
                className="input"
                value={bodyFatPct}
                onChange={(e) => setBodyFatPct(e.target.value)}
                placeholder="23.0"
                inputMode="decimal"
              />
            </div>

            <div style={{ minWidth: 160, flex: 1 }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                SMM (lb)
              </div>
              <input
                className="input"
                value={skeletalMuscleMassLb}
                onChange={(e) => setSkeletalMuscleMassLb(e.target.value)}
                placeholder="—"
                inputMode="decimal"
              />
            </div>

            <div style={{ minWidth: 160, flex: 1 }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                Visceral Fat Index
              </div>
              <input
                className="input"
                value={visceralFatIndex}
                onChange={(e) => setVisceralFatIndex(e.target.value)}
                placeholder="—"
                inputMode="decimal"
              />
            </div>

            <div style={{ minWidth: 160, flex: 1 }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                Body Water %
              </div>
              <input
                className="input"
                value={bodyWaterPct}
                onChange={(e) => setBodyWaterPct(e.target.value)}
                placeholder="—"
                inputMode="decimal"
              />
            </div>
          </div>

          <div className="row" style={{ marginTop: 12, gap: 8, flexWrap: "wrap" }}>
            <button className="btn primary" onClick={addEntry} disabled={!hasAnyInput}>
              Save
            </button>
            <button
              className="btn"
              onClick={() => {
                setWeightLb("");
                setBodyFatPct("");
                setSkeletalMuscleMassLb("");
                setVisceralFatIndex("");
                setBodyWaterPct("");
              }}
              disabled={!hasAnyInput}
            >
              Clear
            </button>
          </div>

          <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
            Tip: 5 entries/week is plenty. Missing fields are fine.
          </div>
        </div>

        <div className="card" style={{ padding: 12, marginTop: 12 }}>
          <div
            className="row"
            style={{ justifyContent: "space-between", alignItems: "baseline", gap: 10 }}
          >
            <div style={{ fontWeight: 900 }}>Recent entries</div>
            <div className="muted" style={{ fontSize: 12 }}>
              {rows?.length ? `${rows.length} shown` : "—"}
            </div>
          </div>

          <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
            {rows?.length ? (
              rows.map((r) => (
                <div key={r.id} className="card" style={{ padding: 10 }}>
                  <div
                    className="row"
                    style={{ justifyContent: "space-between", alignItems: "center", gap: 10 }}
                  >
                    <div style={{ fontWeight: 900 }}>{fmtDate(pickTime(r))}</div>
                    <button className="btn small" onClick={() => deleteEntry(r.id)} title="Delete entry">
                      Delete
                    </button>
                  </div>

                  <div className="muted" style={{ marginTop: 8, fontSize: 13, lineHeight: 1.6 }}>
                    Weight: <b>{show(pickWeightLb(r), 1)}</b>
                    {"  •  "}
                    BF%: <b>{show(r.bodyFatPct, 2)}</b>
                    {"  •  "}
                    SMM: <b>{show(r.skeletalMuscleMassLb, 1)}</b>
                    <br />
                    VFI: <b>{show(r.visceralFatIndex, 2)}</b>
                    {"  •  "}
                    Water%: <b>{show(r.bodyWaterPct, 2)}</b>
                  </div>
                </div>
              ))
            ) : (
              <div className="muted" style={{ fontSize: 13 }}>No entries yet.</div>
            )}
          </div>
        </div>
      </Section>
    </Page>
  );
}

/* ========================================================================== */
/*  End of file: src/pages/BodyPage.tsx                                       */
/* ========================================================================== */