// /src/pages/HistoryPage.tsx
/* ============================================================================
   HistoryPage.tsx — Session History (Strong-ish, compact rows)
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-02-23-HIST-05

   Version history
   - 2026-02-23  HIST-03  ✅ Strong-like “…” menu pattern (both sections)
                         ✅ View details opens /session/:sessionId
                         ✅ One menu open at a time + outside click/ESC close
   - 2026-02-23  HIST-04  ✅ Tight compact row layout (mobile-first)
                         ✅ Title + Date on one line
                         ✅ Metrics line with icons (duration / total / PRs)
                         ✅ Move Done + “…” hard-right
                         ✅ Batch compute totals + PRs (no N+1 queries)
   - 2026-02-23  HIST-05  ✅ Standard “…” dropdown styling (dark menu, hover, danger)
                         ✅ FIX: clicking Done / menu no longer opens session details
   ============================================================================ */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate } from "react-router-dom";
import { db, SetEntry } from "../db";

/* =============================================================================
   Breadcrumb 0 — Types + helpers
   ============================================================================= */

type SessionRow = {
  id: string;
  templateName?: string;
  startedAt: number;
  endedAt?: number;
  prsJson?: string;
};

function isEnded(s: any): boolean {
  return typeof s?.endedAt === "number" && Number.isFinite(s.endedAt) && s.endedAt > 0;
}

function fmtDayShort(ms: number) {
  try {
    const d = new Date(ms);
    return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }); // "Mon, Feb 23"
  } catch {
    return "—";
  }
}

function formatDurationShort(startedAt: number, endedAt?: number) {
  if (!endedAt || !Number.isFinite(endedAt)) return "—";
  const ms = Math.max(0, endedAt - startedAt);
  const mins = Math.max(0, Math.round(ms / 60000));
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (m <= 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function fmtTotal(n: number) {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 10000) return `${Math.round(n / 1000)}k`;
  return `${Math.round(n)}`;
}

function safeParsePrsCount(prsJson?: string): number {
  if (!prsJson) return 0;
  try {
    const v = JSON.parse(prsJson);
    if (Array.isArray(v)) return v.length;
    if (v && typeof v === "object") {
      if (Array.isArray((v as any).hits)) return (v as any).hits.length;
      const arrs = Object.values(v).filter((x) => Array.isArray(x)) as any[];
      if (arrs.length === 1) return arrs[0].length;
    }
    return 0;
  } catch {
    return 0;
  }
}

/* =============================================================================
   Breadcrumb 1 — Strong-like “…” menu (no deps)
   - One open at a time (tracked by openMenuId)
   - Anchored to clicked button (anchorEl)
   - Outside click closes
   - ESC closes
   ============================================================================= */

function useOutsideClose(
  open: boolean,
  onClose: () => void,
  anchorEl: HTMLElement | null,
  menuRef: React.RefObject<HTMLElement>
) {
  useEffect(() => {
    if (!open) return;

    const onDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;

      if (anchorEl && anchorEl.contains(target)) return;
      const menuEl = menuRef.current;
      if (menuEl && menuEl.contains(target)) return;

      onClose();
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, anchorEl, menuRef]);
}

function MenuButton({
  open,
  onToggle,
  ariaLabel,
}: {
  open: boolean;
  onToggle: (anchorEl: HTMLElement) => void;
  ariaLabel: string;
}) {
  return (
    <button
      className="btn small"
      type="button"
      aria-label={ariaLabel}
      aria-haspopup="menu"
      aria-expanded={open}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle(e.currentTarget);
      }}
      style={{
        width: 44,
        height: 34,
        padding: 0,
        borderRadius: 999,
        justifyContent: "center",
      }}
      title="Actions"
    >
      …
    </button>
  );
}

/**
 * Breadcrumb 1b — Standard “…” dropdown styling
 * - dark panel
 * - light text
 * - calm hover
 * - danger red for delete
 */
function ActionMenu({
  open,
  anchorEl,
  onClose,
  items,
}: {
  open: boolean;
  anchorEl: HTMLElement | null;
  onClose: () => void;
  items: Array<{
    label: string;
    danger?: boolean;
    onClick: () => void | Promise<void>;
  }>;
}) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  useOutsideClose(open, onClose, anchorEl, menuRef);

  const pos = useMemo(() => {
    if (!open || !anchorEl) return null;
    const r = anchorEl.getBoundingClientRect();
    const top = r.bottom + 8;
    const right = Math.max(8, window.innerWidth - r.right);
    return { top, right };
  }, [open, anchorEl]);

  if (!open || !pos) return null;

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Session actions"
      onClick={(e) => {
        // prevent click-through to row
        e.preventDefault();
        e.stopPropagation();
      }}
      style={{
        position: "fixed",
        top: pos.top,
        right: pos.right,
        zIndex: 2000,
        width: 240,
        padding: 8,
        borderRadius: 16,
        background: "#1f2937", // slate-800
        color: "#e5e7eb", // gray-200
        boxShadow: "0 18px 45px rgba(0,0,0,0.28)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      {items.map((it, idx) => (
        <button
          key={`${it.label}-${idx}`}
          type="button"
          role="menuitem"
          onClick={async (e) => {
            e.preventDefault();
            e.stopPropagation();
            try {
              await it.onClick();
            } finally {
              onClose();
            }
          }}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-start",
            gap: 10,
            padding: "12px 12px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.06)",
            background: "transparent",
            color: it.danger ? "#fb7185" : "#e5e7eb", // rose-400
            fontWeight: 600,
            cursor: "pointer",
            marginBottom: idx === items.length - 1 ? 0 : 8,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "transparent";
          }}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

/* =============================================================================
   Breadcrumb 2 — Page component
   ============================================================================= */

export default function HistoryPage() {
  const nav = useNavigate();

  const sessions = useLiveQuery(async () => {
    const all = (await db.sessions.toArray()) as any[];
    all.sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
    return all as SessionRow[];
  }, []);

  // Batch-load sets once, compute totals per session (weight * reps), excluding warmups.
  const setsAll = useLiveQuery(async () => {
    return (await db.sets.toArray()) as SetEntry[];
  }, []);

  const totalsBySession = useMemo(() => {
    const map = new Map<string, number>();
    for (const se of setsAll ?? []) {
      if (!se?.sessionId) continue;
      if (se.setType === "warmup") continue;
      if (typeof se.weight === "number" && typeof se.reps === "number") {
        map.set(se.sessionId, (map.get(se.sessionId) ?? 0) + se.weight * se.reps);
      }
    }
    return map;
  }, [setsAll]);

  const { inProgress, completed } = useMemo(() => {
    const all = sessions ?? [];
    const inProgress = all.filter((s) => !isEnded(s));
    const completed = all.filter((s) => isEnded(s));
    return { inProgress, completed };
  }, [sessions]);

  async function deleteSessionCascade(sessionId: string) {
    const ok = window.confirm("Delete this session? This cannot be undone.");
    if (!ok) return;

    const anyDb = db as any;
    const sessionItemsTable = anyDb.sessionItems;
    const prsTable = anyDb.prs;

    const tables: any[] = [db.sessions, db.sets];
    if (sessionItemsTable) tables.push(sessionItemsTable);
    if (prsTable) tables.push(prsTable);

    await db.transaction("rw", ...tables, async () => {
      await db.sets.where("sessionId").equals(sessionId).delete();
      if (sessionItemsTable) await sessionItemsTable.where("sessionId").equals(sessionId).delete();
      if (prsTable) await prsTable.where("sessionId").equals(sessionId).delete();
      await db.sessions.delete(sessionId);
    });
  }

  function openSessionDetails(sessionId: string) {
    nav(`/session/${sessionId}`);
  }

  function resumeSession(sessionId: string) {
    nav(`/gym/${sessionId}`);
  }

  // one menu open at a time
  const [openMenuId, setOpenMenuId] = useState<string>("");
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  function closeMenu() {
    setOpenMenuId("");
    setAnchorEl(null);
  }

  function toggleMenu(sessionId: string, el: HTMLElement) {
    setOpenMenuId((prev) => (prev === sessionId ? "" : sessionId));
    setAnchorEl((prev) => (openMenuId === sessionId ? null : el));
  }

  /* =============================================================================
     Breadcrumb 3 — Compact row layout
     ============================================================================= */

  function RowMeta({ s, showInProgress }: { s: SessionRow; showInProgress: boolean }) {
    const date = fmtDayShort(s.startedAt);
    const dur = showInProgress ? "—" : formatDurationShort(s.startedAt, s.endedAt);
    const total = totalsBySession.get(s.id) ?? 0;
    const prs = safeParsePrsCount(s.prsJson);

    return (
      <div style={{ minWidth: 0 }}>
        {/* Line 1: Title + Date */}
        <div style={{ display: "flex", gap: 10, alignItems: "baseline", minWidth: 0 }}>
          <div
            className="card-title"
            data-testid={`history-template:${s.id}`}
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              minWidth: 0,
              flex: 1,
            }}
          >
            {s.templateName ?? "Ad-hoc"}
          </div>

          <div className="muted" style={{ whiteSpace: "nowrap", flexShrink: 0 }} data-testid={`history-date:${s.id}`}>
            {date}
          </div>
        </div>

        {/* Line 2: Metrics (NO WRAP) */}
        <div
          className="muted"
          style={{
            marginTop: 4,
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "nowrap",
            whiteSpace: "nowrap",
            fontSize: 13,
          }}
          data-testid={`history-metrics:${s.id}`}
        >
          {!showInProgress && <span data-testid={`history-duration:${s.id}`}>⏱ {dur}</span>}
          <span data-testid={`history-total:${s.id}`}>🏋️ {fmtTotal(total)} lb</span>
          <span data-testid={`history-prs:${s.id}`}>🏆 {prs}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="card" data-testid="history-page">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <h2 data-testid="history-title" style={{ margin: 0 }}>
          History
        </h2>
      </div>

      <p className="muted">Review past sessions. Resume anything still in progress.</p>
      <hr />

      {sessions === undefined ? (
        <div className="muted" data-testid="history-loading">
          Loading…
        </div>
      ) : (
        <div data-testid="history-ready">
          {/* In progress */}
          <div className="card" style={{ marginBottom: 14 }} data-testid="history-inprogress">
            <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
              <h3 style={{ margin: 0 }}>In progress</h3>
              <span className="badge" data-testid="history-inprogress-count">
                {inProgress.length}
              </span>
            </div>

            <div className="list" style={{ marginTop: 12 }} data-testid="history-inprogress-list">
              {inProgress.length ? (
                inProgress.map((s) => {
                  const isMenuOpen = openMenuId === s.id;

                  return (
                    <div
                      key={s.id}
                      className="card list-card clickable"
                      role="button"
                      tabIndex={0}
                      data-testid={`history-inprogress-card:${s.id}`}
                      onClick={() => openSessionDetails(s.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") openSessionDetails(s.id);
                      }}
                      style={{ position: "relative", paddingTop: 10, paddingBottom: 10 }}
                    >
                      <div
                        className="card-head"
                        style={{ alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}
                      >
                        <RowMeta s={s} showInProgress={true} />

                        {/* Breadcrumb 3b — Actions cluster (STOP CLICK BUBBLE HERE) */}
                        <div
                          className="row"
                          style={{ gap: 8, alignItems: "center", flexShrink: 0, marginLeft: 8 }}
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                        >
                          <span className="badge">In progress</span>
                          <MenuButton
                            open={isMenuOpen}
                            ariaLabel="Open session actions"
                            onToggle={(el) => toggleMenu(s.id, el)}
                          />
                        </div>
                      </div>

                      <ActionMenu
                        open={isMenuOpen}
                        anchorEl={isMenuOpen ? anchorEl : null}
                        onClose={closeMenu}
                        items={[
                          { label: "Resume", onClick: () => resumeSession(s.id) },
                          { label: "View details", onClick: () => openSessionDetails(s.id) },
                          { label: "Delete", danger: true, onClick: () => deleteSessionCascade(s.id) },
                        ]}
                      />
                    </div>
                  );
                })
              ) : (
                <p className="muted" style={{ marginTop: 10 }}>
                  No in-progress sessions.
                </p>
              )}
            </div>
          </div>

          {/* Completed */}
          <div className="card" data-testid="history-completed">
            <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
              <h3 style={{ margin: 0 }}>Completed</h3>
              <span className="badge" data-testid="history-completed-count">
                {completed.length}
              </span>
            </div>

            <div className="list" style={{ marginTop: 12 }} data-testid="history-completed-list">
              {completed.length ? (
                completed.map((s) => {
                  const isMenuOpen = openMenuId === s.id;

                  return (
                    <div
                      key={s.id}
                      className="card list-card clickable"
                      role="button"
                      tabIndex={0}
                      data-testid={`history-completed-card:${s.id}`}
                      onClick={() => openSessionDetails(s.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") openSessionDetails(s.id);
                      }}
                      style={{ position: "relative", paddingTop: 10, paddingBottom: 10 }}
                    >
                      <div
                        className="card-head"
                        style={{ alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}
                      >
                        <RowMeta s={s} showInProgress={false} />

                        {/* Breadcrumb 3c — Actions cluster (STOP CLICK BUBBLE HERE) */}
                        <div
                          className="row"
                          style={{ gap: 8, alignItems: "center", flexShrink: 0, marginLeft: 8 }}
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                        >
                          <span className="badge">Done</span>
                          <MenuButton
                            open={isMenuOpen}
                            ariaLabel="Open session actions"
                            onToggle={(el) => toggleMenu(s.id, el)}
                          />
                        </div>
                      </div>

                      <ActionMenu
                        open={isMenuOpen}
                        anchorEl={isMenuOpen ? anchorEl : null}
                        onClose={closeMenu}
                        items={[
                          { label: "View details", onClick: () => openSessionDetails(s.id) },
                          { label: "Delete", danger: true, onClick: () => deleteSessionCascade(s.id) },
                        ]}
                      />
                    </div>
                  );
                })
              ) : (
                <p className="muted" style={{ marginTop: 10 }}>
                  No completed sessions yet.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}