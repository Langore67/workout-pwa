// src/pages/StartPage.tsx
/* ============================================================================
   StartPage.tsx — Start hub + template launcher + template hierarchy
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-03-08-STARTPAGE-08

   Purpose
   - Make Start the operational control center
   - Keep template list as the workout launcher surface
   - Keep TemplatesPage as the management home
   - Preserve mesocycles (folders) and grouped template hierarchy

   Changes (STARTPAGE-08)
   ✅ Repair full file structure after iterative edits
   ✅ Fix Ungrouped kebab by using explicit open-state logic
   ✅ Default Ungrouped to open on first load
   ✅ Keep Continue Session compact ribbon subtitle
   ✅ Compress Start hub action spacing for mobile
   ✅ Keep Strong-like child template cards
   ✅ Preserve existing modal/template launch behavior

   Revision history
   - 2026-02-11  UI-01  Initial Strong-ish Start + folder grouping + tile ...
   - 2026-02-18  SP-02  Folder actions menu on Start: Rename/Delete folder
                       (Delete moves templates to Ungrouped)
                       Dedicated outside-click close for folder menu
   - 2026-02-19  SP-03  Swap tile "..." menu to ActionMenu (Strong-like)
                       Removes old tileMenuTemplateId positioning issues
   - 2026-02-20  SP-04  Option B: compact Strong-like rows (not tiles)
                       Remove redundant Show/Hide label (chevron only)
                       Use ActionMenu pattern for folder kebab too
   - 2026-02-20  SP-05  True hierarchy: folder-group header + nested children
                       Ungrouped behaves like a folder (collapsible)
                       Uses CSS: folder-group / head / body / rail
   - 2026-03-08  SP-06  Add Start hub action cards above Templates section
   - 2026-03-08  SP-07  Bundle Start page polish + active session cleanup
   - 2026-03-08  SP-08  Fix Ungrouped kebab/state + compress Start action spacing
   ============================================================================ */

import React, { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate } from "react-router-dom";
import { db, Template, TemplateItem, Track, Folder, Session } from "../db";
import { uuid } from "../utils";
import { Page, Section } from "../components/Page.tsx";
import { ActionMenu, MenuIcons, MenuItem } from "../components/ActionMenu";

/* ============================================================================
   Breadcrumb 1 — Helpers
   ============================================================================ */

function fmtAgo(ms?: number) {
  if (!ms) return "—";
  const diff = Date.now() - ms;
  const days = Math.floor(diff / 86400000);
  if (days < 1) return "Today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function isPausedSession(ms?: number) {
  if (!ms) return false;
  const diff = Date.now() - ms;
  return diff > 2 * 60 * 60 * 1000; // > 2 hours
}

function fmtDurationSince(ms?: number) {
  if (!ms) return "";
  const diff = Math.max(0, Date.now() - ms);

  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "<1 min";
  if (mins < 60) return `${mins} min`;

  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;

  if (rem === 0) return `${hrs} hr`;
  return `${hrs} hr ${rem} min`;
}

type TemplatePreviewRow = {
  template: Template;
  itemCount: number;
  lastPerformedAt?: number;
  exerciseNamesPreview: string[];
};

const OPEN_FOLDERS_KEY = "STARTPAGE_OPEN_FOLDERS_V1";
const UNGROUPED_KEY = "__UNGROUPED__";

function lruCompare(a: TemplatePreviewRow, b: TemplatePreviewRow) {
  const aNever = a.lastPerformedAt == null;
  const bNever = b.lastPerformedAt == null;
  if (aNever && !bNever) return -1;
  if (!aNever && bNever) return 1;

  const aTime = a.lastPerformedAt ?? Number.NEGATIVE_INFINITY;
  const bTime = b.lastPerformedAt ?? Number.NEGATIVE_INFINITY;
  if (aTime !== bTime) return aTime - bTime; // oldest first

  const ao = (a.template as any).orderIndex as number | undefined;
  const bo = (b.template as any).orderIndex as number | undefined;
  const aHas = ao != null;
  const bHas = bo != null;
  if (aHas && bHas && ao !== bo) return ao! - bo!;
  if (aHas && !bHas) return -1;
  if (!aHas && bHas) return 1;

  return a.template.name.localeCompare(b.template.name);
}

/* ============================================================================
   Breadcrumb 2 — Component
   ============================================================================ */

export default function StartPage() {
  const navigate = useNavigate();

  /* --------------------------------------------------------------------------
     Breadcrumb 3 — DB reads
     ----------------------------------------------------------------------- */
  const folders = useLiveQuery(() => db.folders?.orderBy("orderIndex").toArray(), []);
  const templates = useLiveQuery(() => db.templates.orderBy("name").toArray(), []);
  const templateItems = useLiveQuery(() => db.templateItems.toArray(), []);
  const tracks = useLiveQuery(() => db.tracks.toArray(), []);
  const sessions = useLiveQuery(() => db.sessions.toArray(), []);

  /* --------------------------------------------------------------------------
     Breadcrumb 4 — UI state
     ----------------------------------------------------------------------- */
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

  const [openFolderIds, setOpenFolderIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(OPEN_FOLDERS_KEY);
      if (!raw) return new Set([UNGROUPED_KEY]);

      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        return new Set(arr.filter((x) => typeof x === "string"));
      }
    } catch {}

    return new Set([UNGROUPED_KEY]);
  });

  useEffect(() => {
    try {
      localStorage.setItem(OPEN_FOLDERS_KEY, JSON.stringify(Array.from(openFolderIds)));
    } catch {}
  }, [openFolderIds]);

  /* --------------------------------------------------------------------------
     Breadcrumb 5 — Derived maps
     ----------------------------------------------------------------------- */
  const itemsByTemplate = useMemo(() => {
    const map = new Map<string, TemplateItem[]>();
    for (const it of templateItems ?? []) {
      const arr = map.get(it.templateId) ?? [];
      arr.push(it);
      map.set(it.templateId, arr);
    }
    for (const [, arr] of map) arr.sort((a, b) => a.orderIndex - b.orderIndex);
    return map;
  }, [templateItems]);

  const trackMap = useMemo(() => new Map((tracks ?? []).map((t) => [t.id, t] as const)), [tracks]);

  const lastPerformedFromSessions = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of sessions ?? []) {
      if (!s.templateId) continue;
      const ended = s.endedAt ?? s.startedAt;
      const prev = map.get(s.templateId);
      if (!prev || ended > prev) map.set(s.templateId, ended);
    }
    return map;
  }, [sessions]);

  /* --------------------------------------------------------------------------
     Breadcrumb 6 — Visibility rules
     ----------------------------------------------------------------------- */
  const visibleFolders = useMemo(() => {
    const all = (folders ?? []) as Folder[];
    return all.filter((f: any) => !(f as any).archivedAt);
  }, [folders]);

  const folderIdSet = useMemo(() => new Set(visibleFolders.map((f) => f.id)), [visibleFolders]);

  const visibleTemplates = useMemo(() => {
    const all = (templates ?? []) as Template[];
    return all.filter((t: any) => !(t as any).archivedAt);
  }, [templates]);

  /* --------------------------------------------------------------------------
     Breadcrumb 7 — Continue session detection
     Active session rules:
     - must not be ended
     - must not be deleted
     - must be recent (prevents old imported sessions from appearing as active)
     ----------------------------------------------------------------------- */
  const activeSession = useMemo(() => {
    const all = (sessions ?? []) as Session[];
    const now = Date.now();
    const RECENT_WINDOW_MS = 12 * 60 * 60 * 1000; // 12 hours

    const open = all.filter((s: any) => {
      if ((s as any).deletedAt) return false;
      if (s.endedAt != null) return false;
      if (!s.startedAt || !Number.isFinite(s.startedAt)) return false;
      return now - s.startedAt <= RECENT_WINDOW_MS;
    });

    if (!open.length) return null;
    return open.sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))[0] ?? null;
  }, [sessions]);

  /* --------------------------------------------------------------------------
     Breadcrumb 8 — Build template previews + group into folders
     ----------------------------------------------------------------------- */
  const previews: TemplatePreviewRow[] = useMemo(() => {
    const arr: TemplatePreviewRow[] = [];

    for (const t of visibleTemplates) {
      const items = itemsByTemplate.get(t.id) ?? [];
      const lp =
        (t as any).lastPerformedAt != null
          ? (t as any).lastPerformedAt
          : lastPerformedFromSessions.get(t.id);

      const names: string[] = [];
      for (const it of items) {
        const tr = trackMap.get(it.trackId);
        if (!tr) continue;
        const label = String((tr as any).displayName ?? "").trim();
        if (label) names.push(label);
      }

      arr.push({
        template: t,
        itemCount: items.length,
        lastPerformedAt: lp,
        exerciseNamesPreview: names,
      });
    }

    return arr;
  }, [visibleTemplates, itemsByTemplate, lastPerformedFromSessions, trackMap]);

  const grouped = useMemo(() => {
    const folderMap = new Map<string, TemplatePreviewRow[]>();
    const ungrouped: TemplatePreviewRow[] = [];

    for (const row of previews) {
      const fid = (row.template as any).folderId as string | undefined;
      if (!fid || !folderIdSet.has(fid)) {
        ungrouped.push(row);
      } else {
        const arr = folderMap.get(fid) ?? [];
        arr.push(row);
        folderMap.set(fid, arr);
      }
    }

    for (const [, arr] of folderMap) arr.sort(lruCompare);
    ungrouped.sort(lruCompare);

    return { folderMap, ungrouped };
  }, [previews, folderIdSet]);

  const selectedTemplate = useMemo(() => {
    if (!selectedTemplateId) return null;
    return (templates ?? []).find((t) => t.id === selectedTemplateId) ?? null;
  }, [templates, selectedTemplateId]);

  const selectedItems = useMemo(() => {
    if (!selectedTemplate) return [];
    return itemsByTemplate.get(selectedTemplate.id) ?? [];
  }, [selectedTemplate, itemsByTemplate]);

  const selectedTracksOrdered: Track[] = useMemo(() => {
    const out: Track[] = [];
    for (const it of selectedItems) {
      const tr = trackMap.get(it.trackId);
      if (tr) out.push(tr);
    }
    return out;
  }, [selectedItems, trackMap]);

  /* --------------------------------------------------------------------------
     Breadcrumb 9 — Template actions
     ----------------------------------------------------------------------- */
  async function renameTemplate(t: Template) {
    const next = window.prompt("Rename template:", t.name);
    if (!next) return;
    const name = next.trim();
    if (!name) return;
    await db.templates.update(t.id, { name } as any);
  }

  async function archiveTemplate(t: Template) {
    await db.templates.update(t.id, { archivedAt: Date.now() } as any);
    if (selectedTemplateId === t.id) closeModal();
  }

  async function deleteTemplate(t: Template) {
    const ok = window.confirm(`Delete template "${t.name}"?\n\nThis cannot be undone.`);
    if (!ok) return;

    await db.transaction("rw", db.templates, db.templateItems, async () => {
      const its = await db.templateItems.where("templateId").equals(t.id).toArray();
      await db.templateItems.bulkDelete(its.map((i) => i.id));
      await db.templates.delete(t.id);
    });

    if (selectedTemplateId === t.id) closeModal();
  }

  /* --------------------------------------------------------------------------
     Breadcrumb 10 — Folder actions
     ----------------------------------------------------------------------- */
  async function renameFolder(f: Folder) {
    const next = window.prompt("Rename folder:", f.name);
    if (!next) return;
    const name = next.trim();
    if (!name) return;

    const active = (folders ?? []).filter((x: any) => !x.archivedAt && x.id !== f.id) as any[];
    const existing = new Set(active.map((x) => String(x.name ?? "").trim()));
    let safe = name;
    if (existing.has(safe)) {
      let n = 2;
      while (existing.has(`${safe} (${n})`)) n += 1;
      safe = `${safe} (${n})`;
    }

    await db.folders.update(f.id, { name: safe } as any);
  }

  async function deleteFolder(f: Folder) {
    const ok = window.confirm(`Delete folder "${f.name}"?\n\nTemplates in this folder will be moved to Ungrouped.`);
    if (!ok) return;

    await db.transaction("rw", db.folders, db.templates, async () => {
      await db.templates.where("folderId").equals(f.id).modify({ folderId: undefined } as any);
      await db.folders.delete(f.id);
    });

    setOpenFolderIds((prev) => {
      const next = new Set(prev);
      next.delete(f.id);
      return next;
    });
  }

  /* --------------------------------------------------------------------------
     Breadcrumb 11 — Session starts
     ----------------------------------------------------------------------- */
  async function startEmptyWorkout() {
    const sessionId = uuid();
    const now = Date.now();

    await db.sessions.add({
      id: sessionId,
      templateName: "Ad-hoc",
      startedAt: now,
    } as any);

    navigate(`/gym/${sessionId}`);
  }

  async function startFromTemplate(t: Template) {
    const sessionId = uuid();
    const now = Date.now();

    await db.transaction("rw", db.sessions, db.templates, db.templateItems, db.tracks, db.sets, async () => {
      await db.sessions.add({
        id: sessionId,
        templateId: t.id,
        templateName: t.name,
        startedAt: now,
      } as any);

      const items = await db.templateItems.where("templateId").equals(t.id).sortBy("orderIndex");
      if (!items.length) return;

      const trackIds = items.map((i) => i.trackId);
      const trs = await db.tracks.where("id").anyOf(trackIds).toArray();
      const tmap = new Map(trs.map((x) => [x.id, x] as const));

      let tick = 0;
      const setRows: any[] = [];

      for (const it of items) {
        const tr = tmap.get(it.trackId);
        if (!tr) continue;

        const warmups =
          typeof (it as any).warmupSetsOverride === "number"
            ? (it as any).warmupSetsOverride
            : (tr as any).warmupSetsDefault ?? 0;

        const workings =
          typeof (it as any).workingSetsOverride === "number"
            ? (it as any).workingSetsOverride
            : (tr as any).workingSetsDefault ?? 0;

        for (let i = 0; i < Math.max(0, warmups); i++) {
          setRows.push({
            id: uuid(),
            sessionId,
            trackId: tr.id,
            setType: "warmup",
            createdAt: now + tick++,
          });
        }

        for (let i = 0; i < Math.max(0, workings); i++) {
          setRows.push({
            id: uuid(),
            sessionId,
            trackId: tr.id,
            setType: "working",
            createdAt: now + tick++,
          });
        }
      }

      if (setRows.length) await db.sets.bulkAdd(setRows as any);
    });

    closeModal();
    navigate(`/gym/${sessionId}`);
  }

  /* --------------------------------------------------------------------------
     Breadcrumb 12 — Modal open/close + folder toggle
     ----------------------------------------------------------------------- */
  function openTemplate(id: string) {
    setSelectedTemplateId(id);
  }

  function closeModal() {
    setSelectedTemplateId("");
  }

  function toggleFolder(fid: string) {
    setOpenFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(fid)) next.delete(fid);
      else next.add(fid);
      return next;
    });
  }

  const ungroupedIsOpen = openFolderIds.has(UNGROUPED_KEY);

  const ungroupedMenuItems: MenuItem[] = [
    {
      label: ungroupedIsOpen ? "Collapse" : "Expand",
      icon: MenuIcons.rename, // placeholder icon; behavior is correct
      onClick: () => toggleFolder(UNGROUPED_KEY),
    },
  ];

  /* --------------------------------------------------------------------------
     Breadcrumb 13 — Render
     ----------------------------------------------------------------------- */
  return (
    <Page title="Start Workout">
      {/* Start Hub */}
      <Section>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 22 }}>Start</div>
            <div className="muted" style={{ marginTop: 4 }}>
              Resume a workout, start an ad-hoc session, or manage templates.
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 14,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 4,
          }}
        >
          {activeSession ? (
            <StartActionCard
              title="Continue Session"
              subtitle={`${activeSession.templateName ?? "Ad-hoc"} • ${
                isPausedSession(activeSession.startedAt) ? "Paused" : fmtDurationSince(activeSession.startedAt)
              }`}
              onClick={() => navigate(`/gym/${activeSession.id}`)}
            />
          ) : null}

          <StartActionCard
            title="Start Empty Workout"
            subtitle="Build a workout on the fly"
            onClick={startEmptyWorkout}
          />

          <StartActionCard
            title="Manage Templates"
            subtitle="Create, edit, archive, and organize"
            onClick={() => navigate("/templates")}
          />
        </div>
      </Section>

      {/* Templates Launcher */}
      <Section>
        <div
          id="start-templates-section"
          className="row"
          style={{ justifyContent: "space-between", alignItems: "center", gap: 12 }}
        >
          <div style={{ fontWeight: 900, fontSize: 18 }}>Templates</div>

          <button className="btn small" onClick={() => navigate("/templates")}>
            Manage
          </button>
        </div>

        <div style={{ marginTop: 10, display: "grid", gap: 12 }}>
          {visibleFolders.map((f) => {
            const rows = grouped.folderMap.get(f.id) ?? [];
            if (!rows.length) return null;

            const isOpen = openFolderIds.has(f.id);

            const folderMenuItems: MenuItem[] = [
              { label: "Rename", icon: MenuIcons.rename, onClick: () => renameFolder(f) },
              { type: "sep" },
              { label: "Delete", icon: MenuIcons.trash, danger: true, onClick: () => deleteFolder(f) },
            ];

            return (
              <FolderGroup
                key={f.id}
                groupId={f.id}
                title={f.name}
                count={rows.length}
                isOpen={isOpen}
                onToggle={() => toggleFolder(f.id)}
                menuItems={folderMenuItems}
              >
                {rows.map((row) => (
                  <TemplateRow
                    key={row.template.id}
                    row={row}
                    isChild
                    onOpen={() => openTemplate(row.template.id)}
                    onRename={() => renameTemplate(row.template)}
                    onArchive={() => archiveTemplate(row.template)}
                    onDelete={() => deleteTemplate(row.template)}
                  />
                ))}
              </FolderGroup>
            );
          })}

          {grouped.ungrouped.length ? (
            <FolderGroup
              groupId={UNGROUPED_KEY}
              title="Ungrouped"
              count={grouped.ungrouped.length}
              isOpen={ungroupedIsOpen}
              onToggle={() => toggleFolder(UNGROUPED_KEY)}
              menuItems={ungroupedMenuItems}
            >
              {grouped.ungrouped.map((row) => (
                <TemplateRow
                  key={row.template.id}
                  row={row}
                  isChild
                  onOpen={() => openTemplate(row.template.id)}
                  onRename={() => renameTemplate(row.template)}
                  onArchive={() => archiveTemplate(row.template)}
                  onDelete={() => deleteTemplate(row.template)}
                />
              ))}
            </FolderGroup>
          ) : null}
        </div>
      </Section>

      {/* Template modal */}
      {selectedTemplate && (
        <div className="modal-overlay" role="dialog" aria-modal="true" onMouseDown={closeModal}>
          <div
            className="card modal-card"
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              maxWidth: 620,
              width: "min(620px, calc(100vw - 24px))",
              maxHeight: "calc(100vh - 24px)",
              overflow: "visible",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <button className="btn small" onClick={closeModal} aria-label="Close">
                ✕
              </button>

              <div style={{ textAlign: "center", flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {selectedTemplate.name}
                </div>
                <div className="muted" style={{ marginTop: 4 }}>
                  Last performed:{" "}
                  {fmtAgo((selectedTemplate as any).lastPerformedAt ?? lastPerformedFromSessions.get(selectedTemplate.id))}
                </div>
              </div>

              <div style={{ width: 44 }} />
            </div>

            <hr />

            <div style={{ paddingRight: 2, overflowY: "auto", maxHeight: "min(520px, calc(100vh - 260px))" }}>
              {selectedTracksOrdered.length ? (
                <div style={{ display: "grid", gap: 10 }}>
                  {selectedTracksOrdered.map((tr, idx) => (
                    <div
                      key={`${tr.id}-${idx}`}
                      className="row"
                      style={{ justifyContent: "space-between", alignItems: "center" }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 800, wordBreak: "break-word" }}>{(tr as any).displayName}</div>
                        <div className="muted" style={{ marginTop: 3 }}>
                          {(tr as any).trackType} • {(tr as any).trackingMode}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">No exercises in this template yet.</p>
              )}
            </div>

            <div style={{ marginTop: 12 }}>
              <button
                className="btn primary"
                style={{ width: "100%", padding: "14px 14px" }}
                onClick={() => startFromTemplate(selectedTemplate)}
                disabled={!selectedTracksOrdered.length}
              >
                Start Workout
              </button>
            </div>
          </div>
        </div>
      )}
    </Page>
  );
}

/* ============================================================================
   Breadcrumb 14 — StartActionCard
   Small operational card used by the Start hub.
   Compressed for mobile while preserving strong subtitle rendering.
   ============================================================================ */

function StartActionCard({
  title,
  subtitle,
  onClick,
  disabled,
}: {
  title: string;
  subtitle: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="card clickable"
      onClick={onClick}
      disabled={disabled}
      style={{
        textAlign: "left",
        padding: "8px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 2,
        opacity: disabled ? 0.55 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        border: "none",
        background: "var(--card, white)",
      }}
    >
      <div style={{ fontWeight: 900, fontSize: 17 }}>{title}</div>

      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12,
          fontWeight: 600,
          color: "var(--text, #111827)",
          lineHeight: 1.15,
          flexWrap: "wrap",
        }}
      >
        {renderStrongSubtitle(subtitle)}
      </div>
    </button>
  );
}

/* ============================================================================
   Breadcrumb 14A — Strong subtitle renderer
   Purpose:
   - If subtitle includes " • ", split it into title/meta pieces
   - Render the center dot with lighter visual weight
   - Preserve plain subtitles for cards that are not session-style
   ============================================================================ */

function renderStrongSubtitle(subtitle: string) {
  const parts = subtitle
    .split(" • ")
    .map((x) => x.trim())
    .filter(Boolean);

  if (parts.length === 2) {
    return (
      <>
        <span>{parts[0]}</span>
        <span style={{ opacity: 0.38 }}>•</span>
        <span style={{ color: "var(--muted, #6b7280)", fontWeight: 600 }}>{parts[1]}</span>
      </>
    );
  }

  return <span className="muted">{subtitle}</span>;
}

/* ============================================================================
   Breadcrumb 15 — FolderGroup
   Folder container with true hierarchy: header + nested rail children.
   Kebab moved to RIGHT.
   ============================================================================ */

function FolderGroup({
  groupId,
  title,
  count,
  isOpen,
  onToggle,
  menuItems,
  children,
}: {
  groupId: string;
  title: string;
  count: number;
  isOpen: boolean;
  onToggle: () => void;
  menuItems?: MenuItem[];
  children: React.ReactNode;
}) {
  return (
    <div className="folder-group" data-testid={`start-folder-group-${groupId}`}>
      <div
        className="folder-head clickable"
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") onToggle();
        }}
        style={{ cursor: "pointer" }}
      >
        <div
          className="folder-title"
          style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 10 }}
        >
          <span aria-hidden="true" style={{ width: 18, display: "inline-block", color: "var(--muted)" }}>
            {isOpen ? "▾" : "▸"}
          </span>

          <div style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {title} <span className="folder-count">({count})</span>
          </div>

          {menuItems?.length ? (
            <div
              style={{ flex: "0 0 auto" }}
              onPointerDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <ActionMenu theme="dark" ariaLabel="Folder actions" items={menuItems} offsetX={6} />
            </div>
          ) : (
            <div style={{ width: 40 }} />
          )}
        </div>
      </div>

      {isOpen ? (
        <div className="folder-body">
          <div className="folder-rail">{children}</div>
        </div>
      ) : null}
    </div>
  );
}

/* ============================================================================
   Breadcrumb 16 — TemplateRow
   Strong-like child card treatment:
   - bolder title
   - lighter preview copy
   - kebab top-right
   - last performed as compact meta
   ============================================================================ */

function TemplateRow({
  row,
  isChild,
  onOpen,
  onRename,
  onArchive,
  onDelete,
}: {
  row: TemplatePreviewRow;
  isChild?: boolean;
  onOpen: () => void;
  onRename: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const preview = row.exerciseNamesPreview ?? [];
  const top2 = preview.slice(0, 2);
  const remaining = Math.max(0, preview.length - top2.length);
  const last = row.lastPerformedAt ? fmtAgo(row.lastPerformedAt) : "Never";

  const menuItems: MenuItem[] = [
    { label: "Rename", icon: MenuIcons.rename, onClick: onRename },
    { type: "sep" },
    { label: "Archive", icon: MenuIcons.archive, onClick: onArchive },
    { type: "sep" },
    { label: "Delete", icon: MenuIcons.trash, danger: true, onClick: onDelete },
  ];

  return (
    <div
      className={`card clickable ${isChild ? "template-row child" : ""}`}
      data-testid={`start-template-${row.template.id}`}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onOpen();
      }}
      style={{
        padding: "14px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        borderRadius: 18,
      }}
    >
      {/* Top row */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 900,
              fontSize: 18,
              lineHeight: 1.15,
              wordBreak: "break-word",
            }}
          >
            {row.template.name}
          </div>
        </div>

        <div
          style={{ flex: "0 0 auto" }}
          onPointerDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <ActionMenu theme="dark" ariaLabel="Template actions" items={menuItems} offsetX={6} />
        </div>
      </div>

      {/* Exercise preview */}
      <div
        className="muted"
        style={{
          fontSize: 14,
          lineHeight: 1.35,
          minHeight: 40,
        }}
      >
        {top2.length ? (
          <div style={{ display: "grid", gap: 4 }}>
            {top2.map((x, i) => (
              <div
                key={`${row.template.id}-p-${i}`}
                style={{
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                title={x}
              >
                {x}
              </div>
            ))}
            {remaining > 0 ? <div style={{ opacity: 0.8 }}>{`+${remaining}`}</div> : null}
          </div>
        ) : (
          <div>No exercises</div>
        )}
      </div>

      {/* Bottom meta */}
      <div
        className="muted"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          fontSize: 13,
        }}
      >
        <div style={{ whiteSpace: "nowrap" }}>{last}</div>
        <div style={{ opacity: 0.7 }}>
          {row.itemCount} exercise{row.itemCount === 1 ? "" : "s"}
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   End of file: src/pages/StartPage.tsx
   ============================================================================ */