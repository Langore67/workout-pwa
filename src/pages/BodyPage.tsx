// src/pages/BodyPage.tsx
/* ========================================================================== */
/*  BodyPage.tsx                                                              */
/*  BUILD_ID: 2026-03-08-BODY-06                                              */
/*  FILE: src/pages/BodyPage.tsx                                              */
/* -------------------------------------------------------------------------- */
/*  Body Metrics + Profile Metrics (Hume-friendly)                            */
/*                                                                            */
/*  Goals                                                                     */
/*  - Fast entry: all body fields optional                                    */
/*  - Keep height separate from body snapshots                                */
/*  - Add waist as a high-value body snapshot field                           */
/*  - No bottlenecks: missing metrics allowed                                 */
/*  - Simple list + delete                                                    */
/*  - Future-proof old rows: tolerate takenAt/date/createdAt, backfill        */
/*    measuredAt, and keep new writes dual-written                            */
/*                                                                            */
/*  Changes (BODY-06)                                                         */
/*  ✅ Add Height (in) stored in app_meta                                     */
/*  ✅ Add Waist (in) stored per body entry                                   */
/*  ✅ Keep metric order clean and aligned for MPS work                       */
/*  ✅ Update recent-entry display to include waist                           */
/*                                                                            */
/*  Revision history                                                          */
/*  - 2026-02-24  BODY-01  Initial: add + list + delete (sparse-safe)         */
/*  - 2026-03-01  BODY-02  Prefer measuredAt index; tolerate old rows         */
/*  - 2026-03-05  BODY-03  Harden mixed-row reads; write both timestamps      */
/*  - 2026-03-08  BODY-04  Reorder fields + add Lean Mass                     */
/*  - 2026-03-08  BODY-05  Add Height profile metric via app_meta             */
/*  - 2026-03-08  BODY-06  Add Waist to body snapshots                        */
/* ========================================================================== */

import React, { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { uuid } from "../utils";
import { Page, Section } from "../components/Page.tsx";

type BodyMetricRow = {
  id: string;

  // compatibility + canonical
  takenAt?: number;
  measuredAt?: number;

  // extra legacy tolerance
  date?: number;

  weightLb?: number;
  weight?: number;

  waistIn?: number;
  waist?: number;

  bodyFatPct?: number;
  leanMassLb?: number;
  skeletalMuscleMassLb?: number;
  visceralFatIndex?: number;
  bodyWaterPct?: number;

  createdAt?: number;
};

const HEIGHT_META_KEY = "profile.heightIn";

/* -------------------------------------------------------------------------- */
/* Breadcrumb 1 — Helpers                                                     */
/* -------------------------------------------------------------------------- */

function pickTime(r: BodyMetricRow): number {
  const t = Number(r?.measuredAt ?? r?.takenAt ?? r?.date ?? r?.createdAt);
  return Number.isFinite(t) ? t : 0;
}

function pickWeightLb(r: BodyMetricRow): number | undefined {
  const bw = (r as any)?.weightLb ?? (r as any)?.weight;
  return typeof bw === "number" && Number.isFinite(bw) && bw > 0 ? bw : undefined;
}

function pickWaistIn(r: BodyMetricRow): number | undefined {
  const w = (r as any)?.waistIn ?? (r as any)?.waist;
  return typeof w === "number" && Number.isFinite(w) && w > 0 ? w : undefined;
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

/* -------------------------------------------------------------------------- */
/* Breadcrumb 2 — Page                                                        */
/* -------------------------------------------------------------------------- */

export default function BodyPage() {
  const table = db.bodyMetrics;

  /* ------------------------------------------------------------------------ */
  /* Breadcrumb 2A — Profile state                                            */
  /* ------------------------------------------------------------------------ */
  const [heightIn, setHeightIn] = useState("");
  const [heightLoaded, setHeightLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadHeight() {
      try {
        const row: any = await db.app_meta.get(HEIGHT_META_KEY);
        const parsed = row?.valueJson ? JSON.parse(row.valueJson) : undefined;
        const value = Number(parsed?.heightIn);
        if (!cancelled && Number.isFinite(value) && value > 0) {
          setHeightIn(String(value));
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setHeightLoaded(true);
      }
    }

    loadHeight();

    return () => {
      cancelled = true;
    };
  }, []);

  /* ------------------------------------------------------------------------ */
  /* Breadcrumb 2B — Body form state                                          */
  /* ------------------------------------------------------------------------ */
  const [weightLb, setWeightLb] = useState("");
  const [waistIn, setWaistIn] = useState("");
  const [bodyFatPct, setBodyFatPct] = useState("");
  const [leanMassLb, setLeanMassLb] = useState("");
  const [visceralFatIndex, setVisceralFatIndex] = useState("");
  const [skeletalMuscleMassLb, setSkeletalMuscleMassLb] = useState("");
  const [bodyWaterPct, setBodyWaterPct] = useState("");

  const hasAnyInput = useMemo(() => {
    return (
      !!weightLb.trim() ||
      !!waistIn.trim() ||
      !!bodyFatPct.trim() ||
      !!leanMassLb.trim() ||
      !!visceralFatIndex.trim() ||
      !!skeletalMuscleMassLb.trim() ||
      !!bodyWaterPct.trim()
    );
  }, [
    weightLb,
    waistIn,
    bodyFatPct,
    leanMassLb,
    visceralFatIndex,
    skeletalMuscleMassLb,
    bodyWaterPct,
  ]);

  const hasHeightInput = !!heightIn.trim();

  /* ------------------------------------------------------------------------ */
  /* Breadcrumb 2C — Read recent body rows                                    */
  /* ------------------------------------------------------------------------ */
  const rows = useLiveQuery(async () => {
    try {
      try {
        const indexed = ((await table.orderBy("measuredAt").reverse().limit(30).toArray()) ??
          []) as BodyMetricRow[];

        const indexedLooksClean =
          indexed.length > 0 &&
          indexed.every((r) => typeof r.measuredAt === "number" && Number.isFinite(r.measuredAt));

        if (indexedLooksClean) return indexed;
      } catch {
        // ignore and fall through
      }

      const arr = ((await table.toArray()) ?? []) as BodyMetricRow[];

      const patch: BodyMetricRow[] = [];
      for (const r of arr) {
        const legacyTime = Number((r as any)?.takenAt ?? (r as any)?.date ?? (r as any)?.createdAt);

        if ((r as any)?.measuredAt == null && Number.isFinite(legacyTime) && legacyTime > 0) {
          (r as any).measuredAt = legacyTime;
          patch.push(r);
        }

        if ((r as any)?.takenAt == null) {
          const measured = Number((r as any)?.measuredAt);
          if (Number.isFinite(measured) && measured > 0) {
            (r as any).takenAt = measured;
            if (!patch.includes(r)) patch.push(r);
          }
        }
      }

      if (patch.length) {
        try {
          await table.bulkPut(patch as any[]);
        } catch {
          // ignore persistence errors
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

  /* ------------------------------------------------------------------------ */
  /* Breadcrumb 3 — Actions                                                   */
  /* ------------------------------------------------------------------------ */

  async function saveHeight() {
    const h = toNumOrUndef(heightIn);

    if (heightIn.trim() && h == null) {
      window.alert("Height must be a valid number.");
      return;
    }

    if (h == null || h <= 0) return;

    await db.app_meta.put({
      key: HEIGHT_META_KEY,
      valueJson: JSON.stringify({ heightIn: h }),
      updatedAt: Date.now(),
    } as any);
  }

  async function clearHeight() {
    const ok = window.confirm("Clear saved height?");
    if (!ok) return;
    await db.app_meta.delete(HEIGHT_META_KEY);
    setHeightIn("");
  }

  async function addEntry() {
    const w = toNumOrUndef(weightLb);
    const waist = toNumOrUndef(waistIn);
    const bf = toNumOrUndef(bodyFatPct);
    const lm = toNumOrUndef(leanMassLb);
    const vfi = toNumOrUndef(visceralFatIndex);
    const smm = toNumOrUndef(skeletalMuscleMassLb);
    const water = toNumOrUndef(bodyWaterPct);

    const typedButInvalid =
      (weightLb.trim() && w == null) ||
      (waistIn.trim() && waist == null) ||
      (bodyFatPct.trim() && bf == null) ||
      (leanMassLb.trim() && lm == null) ||
      (visceralFatIndex.trim() && vfi == null) ||
      (skeletalMuscleMassLb.trim() && smm == null) ||
      (bodyWaterPct.trim() && water == null);

    if (typedButInvalid) {
      window.alert("One or more fields are not valid numbers. Please correct and try again.");
      return;
    }

    const hasAnyValid =
      w != null ||
      waist != null ||
      bf != null ||
      lm != null ||
      vfi != null ||
      smm != null ||
      water != null;

    if (!hasAnyValid) return;

    const now = Date.now();

    const row: BodyMetricRow = {
      id: uuid(),
      measuredAt: now,
      takenAt: now,
      createdAt: now,
      weightLb: w,
      waistIn: waist,
      bodyFatPct: bf,
      leanMassLb: lm,
      visceralFatIndex: vfi,
      skeletalMuscleMassLb: smm,
      bodyWaterPct: water,
    };

    await table.add(row as any);

    setWeightLb("");
    setWaistIn("");
    setBodyFatPct("");
    setLeanMassLb("");
    setVisceralFatIndex("");
    setSkeletalMuscleMassLb("");
    setBodyWaterPct("");
  }

  async function deleteEntry(id: string) {
    const ok = window.confirm("Delete this entry?");
    if (!ok) return;
    await table.delete(id);
  }

  /* ------------------------------------------------------------------------ */
  /* Breadcrumb 4 — Render                                                    */
  /* ------------------------------------------------------------------------ */
  return (
    <Page title="Body">
      <Section>
        <div style={{ fontWeight: 900, fontSize: 18 }}>Body metrics</div>
        <div className="muted" style={{ marginTop: 6 }}>
          Quick entry. All fields optional. Hume handles detailed trends — we store snapshots for
          coaching context.
        </div>

        <div className="card" style={{ padding: 12, marginTop: 12 }}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Profile metrics</div>

          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <div style={{ minWidth: 160, flex: 1 }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                Height (in)
              </div>
              <input
                className="input"
                value={heightIn}
                onChange={(e) => setHeightIn(e.target.value)}
                placeholder="72"
                inputMode="decimal"
                disabled={!heightLoaded}
              />
            </div>
          </div>

          <div className="row" style={{ marginTop: 12, gap: 8, flexWrap: "wrap" }}>
            <button className="btn primary" onClick={saveHeight} disabled={!hasHeightInput}>
              Save Height
            </button>
            <button className="btn" onClick={clearHeight} disabled={!hasHeightInput}>
              Clear
            </button>
          </div>

          <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
            Height is stored once and used later for waist-to-height ratio and other derived metrics.
          </div>
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
                Waist (in)
              </div>
              <input
                className="input"
                value={waistIn}
                onChange={(e) => setWaistIn(e.target.value)}
                placeholder="36.0"
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
                Lean Mass (lb)
              </div>
              <input
                className="input"
                value={leanMassLb}
                onChange={(e) => setLeanMassLb(e.target.value)}
                placeholder="154.0"
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
                setWaistIn("");
                setBodyFatPct("");
                setLeanMassLb("");
                setVisceralFatIndex("");
                setSkeletalMuscleMassLb("");
                setBodyWaterPct("");
              }}
              disabled={!hasAnyInput}
            >
              Clear
            </button>
          </div>

          <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
            Tip: Daily weight is useful. Waist and body comp 2–3x/week is plenty.
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
                    Waist: <b>{show(pickWaistIn(r), 1)}</b>
                    {"  •  "}
                    BF%: <b>{show(r.bodyFatPct, 2)}</b>
                    {"  •  "}
                    Lean Mass: <b>{show((r as any).leanMassLb, 1)}</b>
                    <br />
                    VFI: <b>{show(r.visceralFatIndex, 2)}</b>
                    {"  •  "}
                    SMM: <b>{show(r.skeletalMuscleMassLb, 1)}</b>
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