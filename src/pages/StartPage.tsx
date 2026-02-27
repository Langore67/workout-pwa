// src/pages/StartPage.tsx
/* ========================================================================== */
/*  StartPage.tsx                                                             */
/*  BUILD_ID: 2026-02-20-SP-05                                                 */
/* -------------------------------------------------------------------------- */
/*  Strong-ish Start                                                          */
/*                                                                            */
/*  Revision history                                                          */
/*  - 2026-02-11  UI-01  Initial Strong-ish Start + folder grouping + tile ... */
/*  - 2026-02-18  SP-02  Folder actions menu on Start: Rename/Delete folder    */
/*                       (Delete moves templates to Ungrouped)                */
/*                       Dedicated outside-click close for folder menu         */
/*  - 2026-02-19  SP-03  Swap tile "..." menu to ActionMenu (Strong-like)      */
/*                       Removes old tileMenuTemplateId positioning issues     */
/*  - 2026-02-20  SP-04  Option B: compact Strong-like rows (not tiles)        */
/*                       Remove redundant Show/Hide label (chevron only)      */
/*                       Use ActionMenu pattern for folder kebab too           */
/*  - 2026-02-20  SP-05  True hierarchy: folder-group header + nested children */
/*                       Ungrouped behaves like a folder (collapsible)         */
/*                       Uses your new CSS: folder-group/head/body/rail         */
/* ========================================================================== */

import React, { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate } from "react-router-dom";
import { db, Template, TemplateItem, Track, Folder } from "../db";
import { uuid } from "../utils";
import { Page, Section } from "../components/Page";
import { ActionMenu, MenuIcons, MenuItem } from "../components/ActionMenu";

// --- Breadcrumb 1 (0-110) ---------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtAgo(ms?: number) {
  if (!ms) return "—";
  const diff = Date.now() - ms;
  const days = Math.floor(diff / 86400000);
  if (days < 1) return "Today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
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

// --- Breadcrumb 2 (110-140) -------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function StartPage() {
  const navigate = useNavigate();

  // --- Breadcrumb 3 (140-220) -----------------------------------------------
  // DB reads
  // -------------------------------------------------------------------------
  const folders = useLiveQuery(() => db.folders?.orderBy("orderIndex").toArray(), []);
  const templates = useLiveQuery(() => db.templates.orderBy("name").toArray(), []);
  const templateItems = useLiveQuery(() => db.templateItems.toArray(), []);
  const tracks = useLiveQuery(() => db.tracks.toArray(), []);
  const sessions = useLiveQuery(() => db.sessions.toArray(), []);

  // --- Breadcrumb 4 (220-330) -----------------------------------------------
  // UI state
  // -------------------------------------------------------------------------
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

  // Folder open/closed persisted (Option B: multiple folders can be open)
  const [openFolderIds, setOpenFolderIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(OPEN_FOLDERS_KEY);
      if (!raw) return new Set();
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return new Set(arr.filter((x) => typeof x === "string"));
    } catch {}
    return new Set();
  });

  useEffect(() => {
    try {
      localStorage.setItem(OPEN_FOLDERS_KEY, JSON.stringify(Array.from(openFolderIds)));
    } catch {}
  }, [openFolderIds]);

  // --- Breadcrumb 5 (330-520) -----------------------------------------------
  // Derived maps
  // -------------------------------------------------------------------------
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

  // --- Breadcrumb 6 (520-610) -----------------------------------------------
  // Visibility rules for Start (Operational)
  // -------------------------------------------------------------------------
  const visibleFolders = useMemo(() => {
    const all = (folders ?? []) as Folder[];
    return all.filter((f: any) => !(f as any).archivedAt);
  }, [folders]);

  const folderIdSet = useMemo(() => new Set(visibleFolders.map((f) => f.id)), [visibleFolders]);

  const visibleTemplates = useMemo(() => {
    const all = (templates ?? []) as Template[];
    return all.filter((t: any) => !(t as any).archivedAt);
  }, [templates]);

  // --- Breadcrumb 7 (610-820) -----------------------------------------------
  // Build template previews + group into folders
  // -------------------------------------------------------------------------
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
      if (!fid || !folderIdSet.has(fid)) ungrouped.push(row);
      else {
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

  // --- Breadcrumb 8 (820-990) -----------------------------------------------
  // Template actions (Start = Operational, keep minimal)
  // -------------------------------------------------------------------------
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

  // --- Breadcrumb 9 (990-1120) ----------------------------------------------
  // Folder actions (Start = lightweight only)
  // -------------------------------------------------------------------------
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

  // --- Breadcrumb 10 (1120-1280) --------------------------------------------
  // Start session from template
  // -------------------------------------------------------------------------
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
          setRows.push({ id: uuid(), sessionId, trackId: tr.id, setType: "warmup", createdAt: now + tick++ });
        }
        for (let i = 0; i < Math.max(0, workings); i++) {
          setRows.push({ id: uuid(), sessionId, trackId: tr.id, setType: "working", createdAt: now + tick++ });
        }
      }

      if (setRows.length) await db.sets.bulkAdd(setRows as any);
    });

    closeModal();
    navigate(`/gym/${sessionId}`);
  }

  // --- Breadcrumb 11 (1280-1410) --------------------------------------------
  // Modal open/close + folder toggle
  // -------------------------------------------------------------------------
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

  // --- Breadcrumb 12 (1410-1760) --------------------------------------------
  // Render (hierarchical groups)
  // -------------------------------------------------------------------------
  return (
    <Page title="Start Workout">
      <Section>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>Templates</div>

          <button className="btn small" onClick={() => navigate("/templates")}>
            Manage
          </button>
        </div>

        <div style={{ marginTop: 10, display: "grid", gap: 12 }}>
          {/* Folders */}
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

          {/* Ungrouped (behaves like a folder) */}
          {grouped.ungrouped.length ? (
            <FolderGroup
              groupId={UNGROUPED_KEY}
              title="Ungrouped"
              count={grouped.ungrouped.length}
              isOpen={openFolderIds.has(UNGROUPED_KEY) || openFolderIds.size === 0 /* first run feel */}
              onToggle={() => toggleFolder(UNGROUPED_KEY)}
              menuItems={undefined}
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

      {/* --- Breadcrumb 13 (Template modal) --------------------------------- */}
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

              {/* Start modal: keep clean (no management here) */}
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

// --- Breadcrumb 14 (FolderGroup) --------------------------------------------
// Folder container with true hierarchy: header + nested rail children.
// Kebab moved to RIGHT.
// ---------------------------------------------------------------------------

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
        <div className="folder-title" style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 10 }}>
          {/* Chevron (left) */}
          <span aria-hidden="true" style={{ width: 18, display: "inline-block", color: "var(--muted)" }}>
            {isOpen ? "▾" : "▸"}
          </span>

          {/* Title + count */}
          <div style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {title} <span className="folder-count">({count})</span>
          </div>

          {/* Kebab (RIGHT) */}
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

// --- Breadcrumb 15 (TemplateRow) --------------------------------------------
// Compact Strong-like row (whole row clickable; kebab moved to RIGHT).
// ---------------------------------------------------------------------------

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
  const last = row.lastPerformedAt ? fmtAgo(row.lastPerformedAt) : "—";

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
        padding: "10px 12px",
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      {/* Main (left) */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 900, wordBreak: "break-word" }}>{row.template.name}</div>
        <div className="muted" style={{ marginTop: 4, fontSize: 13, minWidth: 0 }}>
          {top2.length ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, minWidth: 0 }}>
              {top2.map((x, i) => (
                <span key={`${row.template.id}-p-${i}`} style={{ whiteSpace: "nowrap" }}>
                  {x}
                </span>
              ))}
              {remaining > 0 ? <span style={{ opacity: 0.85 }}>{`+${remaining}`}</span> : null}
            </div>
          ) : (
            <span>{row.itemCount ? `${row.itemCount} exercise(s)` : "No exercises"}</span>
          )}
        </div>
      </div>

      {/* Last performed (right, before kebab) */}
      <div className="muted" style={{ fontSize: 13, flex: "0 0 auto" }}>
        {last}
      </div>

      {/* Kebab (RIGHTMOST) */}
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
  );
}
