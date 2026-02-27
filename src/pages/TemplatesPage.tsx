// src/pages/TemplatesPage.tsx
/* ========================================================================== */
/*  TemplatesPage.tsx                                                         */
/*  BUILD_ID: 2026-02-20-TP-05                                                 */
/* -------------------------------------------------------------------------- */
/*  Revision history                                                          */
/*  - 2026-02-18 TP-02                                                        */
/*    * Inline template rename                                                 */
/*    * Folder label de-dupe                                                   */
/*    * Folder management modal                                                */
/*  - 2026-02-19 TP-03                                                        */
/*    * Replace per-row "..." menu with ActionMenu (iPhone reliable)           */
/*    * Remove mousedown-only outside click logic                              */
/*  - 2026-02-20 TP-04                                                        */
/*    * Restore editor "Add exercises" panel (catalog + quick add)             */
/*    * Use existing createAndAddTrackToTemplate / catalogGroups helpers       */
/*  - 2026-02-20 TP-05                                                        */
/*    * Reuse existing Tracks (exerciseId+trackType+trackingMode) to avoid dup */
/*    * Prefer variantId undefined; pick oldest createdAt if multiple          */
/* ========================================================================== */

import React, { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate } from "react-router-dom";
import { db } from "../db";
import type { Template, TemplateItem, Track, Exercise, Folder, TrackType, TrackingMode } from "../db";
import { uuid } from "../utils";
import { Page, Section } from "../components/Page";
import { ActionMenu, MenuIcons, MenuItem } from "../components/ActionMenu";

// --- Breadcrumb 1 (helpers) -------------------------------------------------
function fmtArchived(ms?: number) {
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString();
}

function normalizeLoose(s: string) {
  return (s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function makeUniqueName(base: string, existingNames: Set<string>) {
  let name = base;
  if (!existingNames.has(name)) return name;
  let n = 2;
  while (existingNames.has(`${base} (${n})`)) n += 1;
  return `${base} (${n})`;
}

type Row = {
  t: Template;
  itemCount: number;
  folderName: string;
};

type CatalogGroup = {
  key: string;
  title: string;
  exercises: Exercise[];
};

export default function TemplatesPage() {
  const navigate = useNavigate();

  // --- Breadcrumb 2 (DB reads + UI state) -----------------------------------
  const folders = useLiveQuery(() => db.folders.orderBy("orderIndex").toArray(), []);
  const templates = useLiveQuery(async () => {
    const arr = await db.templates.toArray();
    arr.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
    return arr;
  }, []);
  const templateItems = useLiveQuery(() => db.templateItems.toArray(), []);

  const exercises = useLiveQuery(async () => {
    const arr = await db.exercises.toArray();
    const filtered = arr.filter((e: any) => !e.mergedIntoExerciseId && !e.archivedAt);
    filtered.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
    return filtered as Exercise[];
  }, []);

  const tracks = useLiveQuery(async () => {
    const arr = await db.tracks.toArray();
    arr.sort((a, b) => (a.displayName ?? "").localeCompare(b.displayName ?? ""));
    return arr;
  }, []);

  // UI state
  const [showArchived, setShowArchived] = useState(false);

  // Inline rename state
  const [renamingTemplateId, setRenamingTemplateId] = useState<string>("");
  const [renameDraft, setRenameDraft] = useState<string>("");

  // Folder management modal
  const [foldersModalOpen, setFoldersModalOpen] = useState(false);
  const [renamingFolderId, setRenamingFolderId] = useState<string>("");
  const [folderRenameDraft, setFolderRenameDraft] = useState<string>("");

  // Editor modal state
  const [editingTemplateId, setEditingTemplateId] = useState<string>("");

  // Catalog search + quick add
  const [quickAddName, setQuickAddName] = useState<string>("");

  // Variant creator controls
  const [variantType, setVariantType] = useState<TrackType>("hypertrophy");
  const [variantMode, setVariantMode] = useState<TrackingMode>("weightedReps");

  // (Legacy retained; safe)
  const [, setTrackSearch] = useState<string>("");
  const [, setSelectedTrackId] = useState<string>("");

  // --- Breadcrumb 3 (Derived maps) ------------------------------------------
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

  const itemCountByTemplateId = useMemo(() => {
    const map = new Map<string, number>();
    for (const it of templateItems ?? []) {
      map.set(it.templateId, (map.get(it.templateId) ?? 0) + 1);
    }
    return map;
  }, [templateItems]);

  const trackMap = useMemo(() => {
    const map = new Map<string, Track>();
    for (const tr of tracks ?? []) map.set(tr.id, tr);
    return map;
  }, [tracks]);

  // --- Breadcrumb 3A (Folder label de-dupe) ---------------------------------
  const folderLabelById = useMemo(() => {
    const list = (folders ?? []) as Folder[];
    const sorted = list
      .slice()
      .sort(
        (a: any, b: any) =>
          (a.orderIndex ?? 0) - (b.orderIndex ?? 0) || (a.createdAt ?? 0) - (b.createdAt ?? 0)
      );

    const counts = new Map<string, number>();
    const out = new Map<string, string>();

    for (const f of sorted) {
      const base = String((f as any).name ?? "Folder").trim() || "Folder";
      const n = (counts.get(base) ?? 0) + 1;
      counts.set(base, n);
      out.set(f.id, n === 1 ? base : `${base} (${n})`);
    }

    return out;
  }, [folders]);

  const folderNameForTemplate = useMemo(() => {
    return (t: Template) => {
      const fid = (t as any).folderId as string | undefined;
      if (!fid) return "Ungrouped";
      return folderLabelById.get(fid) ?? "Ungrouped";
    };
  }, [folderLabelById]);

  const rows: Row[] = useMemo(() => {
    const all = (templates ?? []) as Template[];
    const filtered = showArchived ? all : all.filter((t: any) => !t.archivedAt);

    return filtered
      .map((t) => ({
        t,
        itemCount: itemCountByTemplateId.get(t.id) ?? 0,
        folderName: folderNameForTemplate(t),
      }))
      .sort((a, b) => a.t.name.localeCompare(b.t.name));
  }, [templates, showArchived, itemCountByTemplateId, folderNameForTemplate]);

  const editingTemplate = useMemo(() => {
    if (!editingTemplateId) return null;
    return (templates ?? []).find((t) => t.id === editingTemplateId) ?? null;
  }, [templates, editingTemplateId]);

  const editingItems = useMemo(() => {
    if (!editingTemplate) return [];
    return itemsByTemplate.get(editingTemplate.id) ?? [];
  }, [editingTemplate, itemsByTemplate]);

  const usedExerciseIdsInEditor = useMemo(() => {
    const set = new Set<string>();
    for (const it of editingItems) {
      const tr = trackMap.get(it.trackId);
      const exId = (tr as any)?.exerciseId as string | undefined;
      if (exId) set.add(exId);
    }
    return set;
  }, [editingItems, trackMap]);

  // --- Breadcrumb 3B (Catalog grouping + search) ----------------------------
  const filteredExercisesForCatalog = useMemo(() => {
    const q = normalizeLoose(quickAddName);
    let arr = (exercises ?? []).slice();

    arr = arr.filter((ex) => !usedExerciseIdsInEditor.has(ex.id));

    if (q) {
      arr = arr.filter((ex) => {
        const name = normalizeLoose(ex.name ?? "");
        const aliases = Array.isArray((ex as any).aliases) ? (ex as any).aliases : [];
        const aliasHay = aliases.map((a: string) => normalizeLoose(a)).join(" ");
        return name.includes(q) || aliasHay.includes(q);
      });
    }

    arr.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
    return arr;
  }, [exercises, quickAddName, usedExerciseIdsInEditor]);

  const catalogGroups: CatalogGroup[] = useMemo(() => {
    const m = new Map<string, Exercise[]>();
    for (const ex of filteredExercisesForCatalog) {
      const ch = (ex.name?.trim()?.[0] ?? "#").toUpperCase();
      const key = /[A-Z]/.test(ch) ? ch : "#";
      const arr = m.get(key) ?? [];
      arr.push(ex);
      m.set(key, arr);
    }

    const keys = Array.from(m.keys()).sort((a, b) => {
      if (a === "#") return 1;
      if (b === "#") return -1;
      return a.localeCompare(b);
    });

    return keys.map((k) => ({ key: k, title: k, exercises: m.get(k)! }));
  }, [filteredExercisesForCatalog]);

  const catalogHasResults = useMemo(() => catalogGroups.some((g) => g.exercises.length > 0), [catalogGroups]);

  const topCatalogExercise = useMemo(() => {
    for (const g of catalogGroups) {
      if (g.exercises.length) return g.exercises[0];
    }
    return undefined as Exercise | undefined;
  }, [catalogGroups]);

  const suggestedTrackName = useMemo(() => {
    const base = quickAddName.trim();
    if (!base) return "";
    const vt = variantType;
    if (base.toLowerCase().includes(vt)) return base;
    return `${base} — ${vt}`;
  }, [quickAddName, variantType]);

  // --- Breadcrumb 4 (Actions: templates) ------------------------------------
  async function renameTemplateDirect(t: Template, nextNameRaw: string) {
    const name = nextNameRaw.trim();
    if (!name) return;

    await db.templates.update(t.id, { name } as any);

    try {
      await db.sessions
        .where("templateId")
        .equals(t.id)
        .and((s: any) => !s.endedAt)
        .modify({ templateName: name } as any);
    } catch {}
  }

  async function renameTemplatePrompt(t: Template) {
    const next = window.prompt("Rename template:", t.name);
    if (!next) return;
    await renameTemplateDirect(t, next);
  }

  async function duplicateTemplate(t: Template) {
    const now = Date.now();
    const newId = uuid();

    const base = `${t.name} (Copy)`;
    const names = new Set((templates ?? []).map((x) => x.name));
    let name = base;
    let n = 2;
    while (names.has(name)) name = `${base} ${n++}`;

    await db.transaction("rw", db.templates, db.templateItems, async () => {
      const originalItems = await db.templateItems.where("templateId").equals(t.id).sortBy("orderIndex");

      await db.templates.add({
        id: newId,
        name,
        createdAt: now,
        folderId: (t as any).folderId,
        orderIndex: (t as any).orderIndex,
        archivedAt: undefined,
        lastPerformedAt: undefined,
      } as any);

      if (originalItems.length) {
        const copied = originalItems.map((it) => ({
          ...it,
          id: uuid(),
          templateId: newId,
          createdAt: now,
        }));
        await db.templateItems.bulkAdd(copied as any);
      }
    });
  }

  async function moveTemplateToFolder(t: Template, folderId?: string) {
    await db.templates.update(t.id, { folderId: folderId ?? undefined } as any);
  }

  async function setArchived(t: Template, archived: boolean) {
    await db.templates.update(t.id, { archivedAt: archived ? Date.now() : undefined } as any);
  }

  async function deleteTemplate(t: Template) {
    const ok = window.confirm(`Delete template "${t.name}"?\n\nThis cannot be undone.`);
    if (!ok) return;

    await db.transaction("rw", db.templates, db.templateItems, async () => {
      const its = await db.templateItems.where("templateId").equals(t.id).toArray();
      await db.templateItems.bulkDelete(its.map((i) => i.id));
      await db.templates.delete(t.id);
    });

    if (editingTemplateId === t.id) closeEditor();
  }

  // --- Breadcrumb 4B (Actions: folders) -------------------------------------
  async function createFolder() {
    const next = window.prompt("New folder name:");
    if (!next) return;
    const raw = next.trim();
    if (!raw) return;

    const existing = new Set(
      ((folders ?? []) as Folder[])
        .filter((f: any) => !f.archivedAt)
        .map((f: any) => String(f.name))
    );
    const name = makeUniqueName(raw, existing);

    const now = Date.now();
    const maxOrder = Math.max(0, ...(((folders ?? []) as any[]).map((f: any) => f.orderIndex ?? 0)));
    await db.folders.add({
      id: uuid(),
      name,
      orderIndex: maxOrder + 1,
      createdAt: now,
      archivedAt: undefined,
    } as any);
  }

  async function renameFolderDirect(folderId: string, nextNameRaw: string) {
    const name = nextNameRaw.trim();
    if (!name) return;

    const active = ((folders ?? []) as Folder[]).filter((f: any) => !f.archivedAt && f.id !== folderId);
    const existing = new Set(active.map((f: any) => String(f.name)));
    const safe = existing.has(name) ? makeUniqueName(name, existing) : name;

    await db.folders.update(folderId, { name: safe } as any);
  }

  async function deleteFolder(folderId: string) {
    const f = ((folders ?? []) as Folder[]).find((x) => x.id === folderId);
    const label = f ? String((f as any).name ?? "this folder") : "this folder";

    const ok = window.confirm(`Delete folder "${label}"?\n\nTemplates in this folder will be moved to Ungrouped.`);
    if (!ok) return;

    await db.transaction("rw", db.folders, db.templates, async () => {
      await db.templates.where("folderId").equals(folderId).modify({ folderId: undefined } as any);
      await db.folders.delete(folderId);
    });
  }

  // --- Breadcrumb 4C (create template) --------------------------------------
  async function createTemplate() {
    const next = window.prompt("New template name:");
    if (!next) return;
    const name = next.trim();
    if (!name) return;

    const now = Date.now();
    const id = uuid();
    await db.templates.add({
      id,
      name,
      createdAt: now,
      folderId: undefined,
      archivedAt: undefined,
      orderIndex: undefined,
      lastPerformedAt: undefined,
    } as any);

    openEditor(id);
  }

  // --- Breadcrumb 5 (Folder selector) ---------------------------------------
  function FolderSelect({ template }: { template: Template }) {
    const currentFolderId = (template as any).folderId as string | undefined;
    const visibleFolders = ((folders ?? []) as Folder[]).filter((f: any) => !f.archivedAt);

    return (
      <div style={{ flex: "0 0 auto", minWidth: 0, position: "relative", zIndex: 1 }}>
        <select
          value={currentFolderId ?? ""}
          onChange={(e) => moveTemplateToFolder(template, e.target.value || undefined)}
          className="input"
          style={{ width: "auto", maxWidth: 220, minWidth: 150, flex: "0 0 auto" }}
        >
          <option value="">Ungrouped</option>
          {visibleFolders.map((f) => (
            <option key={f.id} value={f.id}>
              {folderLabelById.get(f.id) ?? f.name}
            </option>
          ))}
        </select>
      </div>
    );
  }

  // --- Breadcrumb 6 (Editor modal helpers) ----------------------------------
  function openEditor(templateId: string) {
    setEditingTemplateId(templateId);
    setTrackSearch("");
    setSelectedTrackId("");
    setQuickAddName("");
    setVariantType("hypertrophy");
    setVariantMode("weightedReps");
  }

  function closeEditor() {
    setEditingTemplateId("");
    setTrackSearch("");
    setSelectedTrackId("");
    setQuickAddName("");
  }

  async function addExerciseToTemplate(templateId: string, trackId: string) {
    const now = Date.now();

    const already = (templateItems ?? []).some((it) => it.templateId === templateId && it.trackId === trackId);
    if (already) return;

    const existing = itemsByTemplate.get(templateId) ?? [];
    const maxOrder = existing.length ? Math.max(...existing.map((x) => x.orderIndex)) : 0;

    await db.templateItems.add({
      id: uuid(),
      templateId,
      orderIndex: maxOrder + 1,
      trackId,
      createdAt: now,
    } as any);
  }

  async function removeExerciseFromTemplate(itemId: string) {
    await db.templateItems.delete(itemId);
  }

  // --- Breadcrumb 6C (find-or-create Exercise) ------------------------------
  async function findOrCreateExerciseByName(rawName: string): Promise<string> {
    const name = rawName.trim();
    if (!name) throw new Error("Exercise name is required.");

    const norm = (db as any).normalizeName ? (db as any).normalizeName(name) : normalizeLoose(name);

    const hit = await db.exercises.where("normalizedName").equals(norm).first();
    if (hit && !(hit as any).mergedIntoExerciseId) {
      if ((hit as any).archivedAt) {
        await db.exercises.update(hit.id, { archivedAt: undefined, updatedAt: Date.now() } as any);
      }
      return hit.id;
    }

    const all = await db.exercises.toArray();
    const scan = all.find((ex: any) => normalizeLoose(String(ex.name ?? "")) === norm && !ex.mergedIntoExerciseId);
    if (scan) {
      if ((scan as any).archivedAt) {
        await db.exercises.update((scan as any).id, { archivedAt: undefined, updatedAt: Date.now() } as any);
      }
      return (scan as any).id;
    }

    const now = Date.now();
    const exerciseId = uuid();

    await db.exercises.add({
      id: exerciseId,
      name,
      normalizedName: norm,
      equipmentTags: [],
      createdAt: now,
      updatedAt: now,
    } as any);

    return exerciseId;
  }

  // --- Breadcrumb 6D (create Track variant) ---------------------------------
  async function createTrackVariant(args: {
    exerciseId: string;
    displayName: string;
    trackType: TrackType;
    trackingMode: TrackingMode;
  }): Promise<string> {
    const now = Date.now();
    const trackId = uuid();

    const defaults =
      args.trackType === "corrective"
        ? {
            warmupSetsDefault: 0,
            workingSetsDefault: 1,
            repMin: 1,
            repMax: 1,
            restSecondsDefault: 60,
            rirTargetMin: undefined,
            rirTargetMax: undefined,
            weightJumpDefault: 0,
          }
        : {
            warmupSetsDefault: 2,
            workingSetsDefault: 3,
            repMin: args.trackType === "strength" ? 3 : 8,
            repMax: args.trackType === "strength" ? 6 : 12,
            restSecondsDefault: args.trackType === "strength" ? 180 : 120,
            rirTargetMin: 1,
            rirTargetMax: 2,
            weightJumpDefault: 5,
          };

    await db.tracks.add({
      id: trackId,
      exerciseId: args.exerciseId,
      trackType: args.trackType,
      displayName: args.displayName,
      trackingMode: args.trackingMode,
      ...defaults,
      createdAt: now,
    } as any);

    return trackId;
  }

  // --- Breadcrumb 6D2 (REUSE Track by key) ----------------------------------
  async function findOrCreateReusableTrack(args: {
    exerciseId: string;
    desiredDisplayName: string;
    trackType: TrackType;
    trackingMode: TrackingMode;
  }): Promise<string> {
    // We do not have a compound index for (exerciseId+trackType+trackingMode),
    // so we fetch by exerciseId and filter in-memory.
    const allForExercise = await db.tracks.where("exerciseId").equals(args.exerciseId).toArray();

    // Prefer:
    // 1) exact match with variantId undefined
    // 2) any match with variantId undefined
    // 3) any match at all
    const matches = allForExercise.filter(
      (t: any) => t.trackType === args.trackType && t.trackingMode === args.trackingMode
    );

    if (matches.length) {
      const normWanted = normalizeLoose(args.desiredDisplayName);
      const preferNoVariant = matches.filter((t: any) => t.variantId == null);

      const exactNameNoVariant = preferNoVariant.filter(
        (t: any) => normalizeLoose(String(t.displayName ?? "")) === normWanted
      );
      const pool =
        exactNameNoVariant.length
          ? exactNameNoVariant
          : preferNoVariant.length
            ? preferNoVariant
            : matches;

      pool.sort((a: any, b: any) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
      return pool[0].id;
    }

    // none found => create
    return await createTrackVariant({
      exerciseId: args.exerciseId,
      displayName: args.desiredDisplayName,
      trackType: args.trackType,
      trackingMode: args.trackingMode,
    });
  }

  // --- Breadcrumb 6E (create/reuse Track + add) -----------------------------
  async function createAndAddTrackToTemplate(args: {
    templateId: string;
    exerciseName: string;
    trackDisplayName: string;
    trackType: TrackType;
    trackingMode: TrackingMode;
  }): Promise<void> {
    const exerciseName = args.exerciseName.trim();
    const trackDisplayName = args.trackDisplayName.trim();
    if (!exerciseName || !trackDisplayName) return;

    await db.transaction("rw", db.exercises, db.tracks, db.templateItems, async () => {
      const exerciseId = await findOrCreateExerciseByName(exerciseName);

      // ✅ Reuse existing track when possible
      const trackId = await findOrCreateReusableTrack({
        exerciseId,
        desiredDisplayName: trackDisplayName,
        trackType: args.trackType,
        trackingMode: args.trackingMode,
      });

      await addExerciseToTemplate(args.templateId, trackId);
    });
  }

  // --- Breadcrumb 7 (Inline rename helpers) ---------------------------------
  function beginRenameTemplate(t: Template) {
    setRenamingTemplateId(t.id);
    setRenameDraft(t.name ?? "");
  }

  function cancelRenameTemplate() {
    setRenamingTemplateId("");
    setRenameDraft("");
  }

  async function commitRenameTemplate(t: Template) {
    const name = renameDraft.trim();
    if (!name) return;
    await renameTemplateDirect(t, name);
    cancelRenameTemplate();
  }

  // --- Breadcrumb 7B (Folder modal helpers) ---------------------------------
  function openFoldersModal() {
    setFoldersModalOpen(true);
    setRenamingFolderId("");
    setFolderRenameDraft("");
  }

  function closeFoldersModal() {
    setFoldersModalOpen(false);
    setRenamingFolderId("");
    setFolderRenameDraft("");
  }

  function beginRenameFolder(f: Folder) {
    setRenamingFolderId(f.id);
    setFolderRenameDraft(String((f as any).name ?? ""));
  }

  function cancelRenameFolder() {
    setRenamingFolderId("");
    setFolderRenameDraft("");
  }

  async function commitRenameFolder(folderId: string) {
    const name = folderRenameDraft.trim();
    if (!name) return;
    await renameFolderDirect(folderId, name);
    cancelRenameFolder();
  }

  // --- Breadcrumb 8 (Render Templates list) ---------------------------------
  return (
    <Page title="Templates">
      <Section>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>Manage Templates</div>

          <div className="row" style={{ gap: 10, alignItems: "center" }}>
            <button className="btn small" onClick={createTemplate}>
              New Template
            </button>

            <button className="btn small" onClick={createFolder}>
              New Folder
            </button>

            <button className="btn small" onClick={openFoldersModal}>
              Folders
            </button>

            <button className="btn small" onClick={() => navigate("/exercises")}>
              Exercises
            </button>

            <label style={{ display: "flex", alignItems: "center", gap: 8 }} className="muted">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
              Show archived
            </label>

            <button className="btn small" onClick={() => navigate("/")}>
              Back to Start
            </button>
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          {rows.length ? (
            <div style={{ display: "grid", gap: 10 }}>
              {rows.map((r) => {
                const isArchived = !!(r.t as any).archivedAt;
                const isRenaming = renamingTemplateId === r.t.id;

                const menuItems: MenuItem[] = [
                  { label: "Edit", icon: MenuIcons.edit, onClick: () => openEditor(r.t.id) },
                  { label: "Rename", icon: MenuIcons.rename, onClick: () => beginRenameTemplate(r.t) },
                  { label: "Duplicate", icon: MenuIcons.duplicate, onClick: () => duplicateTemplate(r.t) },
                  { type: "sep" },
                  {
                    label: isArchived ? "Unarchive" : "Archive",
                    icon: MenuIcons.archive,
                    onClick: () => setArchived(r.t, !isArchived),
                  },
                  { label: "Rename (prompt)", icon: MenuIcons.rename, onClick: () => renameTemplatePrompt(r.t) },
                  { type: "sep" },
                  { label: "Delete", icon: MenuIcons.trash, danger: true, onClick: () => deleteTemplate(r.t) },
                ];

                return (
                  <div key={r.t.id} className="card" style={{ padding: 12 }}>
                    <div className="row" style={{ alignItems: "center", gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {isRenaming ? (
                          <div className="row" style={{ gap: 8, alignItems: "center" }}>
                            <input
                              className="input"
                              value={renameDraft}
                              onChange={(e) => setRenameDraft(e.target.value)}
                              onKeyDown={async (e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  await commitRenameTemplate(r.t);
                                }
                                if (e.key === "Escape") {
                                  e.preventDefault();
                                  cancelRenameTemplate();
                                }
                              }}
                              autoFocus
                              style={{ flex: 1, minWidth: 180 }}
                            />
                            <button className="btn small primary" onClick={() => commitRenameTemplate(r.t)}>
                              Save
                            </button>
                            <button className="btn small" onClick={cancelRenameTemplate}>
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="row" style={{ gap: 8, alignItems: "center" }}>
                            <div
                              style={{
                                fontWeight: 900,
                                wordBreak: "break-word",
                                opacity: isArchived ? 0.65 : 1,
                                cursor: "pointer",
                                flex: 1,
                                minWidth: 0,
                              }}
                              role="button"
                              tabIndex={0}
                              onClick={() => openEditor(r.t.id)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") openEditor(r.t.id);
                              }}
                              title="Edit template"
                            >
                              {r.t.name}
                            </div>

                            <button
                              className="btn small"
                              title="Rename"
                              aria-label="Rename template"
                              onClick={() => beginRenameTemplate(r.t)}
                            >
                              ✎
                            </button>
                          </div>
                        )}

                        <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
                          {r.itemCount ? `${r.itemCount} exercise(s)` : "No exercises"} • {r.folderName}
                          {isArchived ? ` • Archived: ${fmtArchived((r.t as any).archivedAt)}` : ""}
                        </div>
                      </div>

                      <FolderSelect template={r.t} />

                      {/* --- Breadcrumb 8A (Strong-like ActionMenu) ---------- */}
                      <ActionMenu theme="dark" items={menuItems} offsetX={6} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="muted" style={{ marginTop: 10 }}>
              No templates found.
            </p>
          )}
        </div>
      </Section>

      {/* --- Breadcrumb 8B (Folder Management Modal) ------------------------ */}
      {foldersModalOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" onMouseDown={closeFoldersModal}>
          <div
            className="card modal-card"
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              maxWidth: 720,
              width: "min(720px, calc(100vw - 24px))",
              maxHeight: "calc(100vh - 24px)",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <button className="btn small" onClick={closeFoldersModal} aria-label="Close">
                ✕
              </button>

              <div style={{ textAlign: "center", flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 900 }}>Folders</div>
                <div className="muted" style={{ marginTop: 4 }}>
                  Rename or delete folders. Delete moves templates to Ungrouped.
                </div>
              </div>

              <button className="btn small" onClick={createFolder}>
                New
              </button>
            </div>

            <hr />

            <div style={{ paddingRight: 2, overflowY: "auto", maxHeight: "min(600px, calc(100vh - 260px))" }}>
              <div className="card" style={{ padding: 12 }}>
                {((folders ?? []) as Folder[]).filter((f: any) => !f.archivedAt).length ? (
                  <div style={{ display: "grid", gap: 10 }}>
                    {((folders ?? []) as Folder[])
                      .filter((f: any) => !f.archivedAt)
                      .slice()
                      .sort(
                        (a: any, b: any) =>
                          (a.orderIndex ?? 0) - (b.orderIndex ?? 0) || (a.createdAt ?? 0) - (b.createdAt ?? 0)
                      )
                      .map((f) => {
                        const label = folderLabelById.get(f.id) ?? String((f as any).name ?? "Folder");
                        const isRenaming = renamingFolderId === f.id;
                        const templateCount =
                          (templates ?? []).filter((t: any) => (t as any).folderId === f.id && !(t as any).archivedAt)
                            .length ?? 0;

                        return (
                          <div key={f.id} className="row" style={{ alignItems: "center", gap: 10 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 900, wordBreak: "break-word" }}>{label}</div>
                              <div className="muted" style={{ marginTop: 4, fontSize: 13 }}>
                                {templateCount} template(s)
                              </div>
                            </div>

                            {isRenaming ? (
                              <>
                                <input
                                  className="input"
                                  value={folderRenameDraft}
                                  onChange={(e) => setFolderRenameDraft(e.target.value)}
                                  onKeyDown={async (e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      await commitRenameFolder(f.id);
                                    }
                                    if (e.key === "Escape") {
                                      e.preventDefault();
                                      cancelRenameFolder();
                                    }
                                  }}
                                  autoFocus
                                  style={{ minWidth: 220 }}
                                />
                                <button className="btn small primary" onClick={() => commitRenameFolder(f.id)}>
                                  Save
                                </button>
                                <button className="btn small" onClick={cancelRenameFolder}>
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <>
                                <button className="btn small" onClick={() => beginRenameFolder(f)} title="Rename folder">
                                  Rename
                                </button>
                                <button
                                  className="btn small danger"
                                  onClick={() => deleteFolder(f.id)}
                                  title="Delete folder"
                                >
                                  Delete
                                </button>
                              </>
                            )}
                          </div>
                        );
                      })}
                  </div>
                ) : (
                  <p className="muted">No folders yet.</p>
                )}
              </div>

              <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>
                If you’re seeing folders with the same name, that means there are multiple folder records in IndexedDB.
                This modal will still work — and the UI will show “(2)/(3)” so you can clean them up safely.
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <button className="btn" style={{ width: "100%", padding: "12px 14px" }} onClick={closeFoldersModal}>
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* --- Breadcrumb 9 (Editor Modal) ----------------------------------- */}
      {editingTemplate ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" onMouseDown={closeEditor}>
          <div
            className="card modal-card"
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              maxWidth: 760,
              width: "min(760px, calc(100vw - 24px))",
              maxHeight: "calc(100vh - 24px)",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <button className="btn small" onClick={closeEditor} aria-label="Close">
                ✕
              </button>

              <div style={{ textAlign: "center", flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  Edit: {editingTemplate.name}
                </div>
                <div className="muted" style={{ marginTop: 4 }}>
                  {editingItems.length ? `${editingItems.length} exercise(s)` : "No exercises yet"}
                </div>
              </div>

              <button className="btn small" onClick={() => navigate("/")}>
                Start
              </button>
            </div>

            <hr />

            <div style={{ paddingRight: 2, overflowY: "auto", maxHeight: "min(600px, calc(100vh - 260px))" }}>
              {/* --- Breadcrumb 9A (Add exercises panel) ------------------- */}
              <div className="card" style={{ padding: 12, marginBottom: 10 }}>
                <div style={{ fontWeight: 900, marginBottom: 10 }}>Add exercises</div>

                <div className="row" style={{ gap: 10, alignItems: "center" }}>
                  <input
                    className="input"
                    placeholder="Search exercises…"
                    value={quickAddName}
                    onChange={(e) => setQuickAddName(e.target.value)}
                    style={{ flex: 1, minWidth: 220 }}
                  />

                  <select
                    className="input"
                    value={variantType}
                    onChange={(e) => setVariantType(e.target.value as TrackType)}
                    style={{ width: "auto", minWidth: 160 }}
                    aria-label="Variant type"
                    title="Variant type"
                  >
                    <option value="strength">strength</option>
                    <option value="hypertrophy">hypertrophy</option>
                    <option value="corrective">corrective</option>
                  </select>

                  <select
                    className="input"
                    value={variantMode}
                    onChange={(e) => setVariantMode(e.target.value as TrackingMode)}
                    style={{ width: "auto", minWidth: 170 }}
                    aria-label="Tracking mode"
                    title="Tracking mode"
                  >
                    <option value="weightedReps">weighted reps</option>
                    <option value="repsOnly">reps only</option>
                    <option value="timeSeconds">time</option>
                    <option value="checkbox">checkbox</option>
                    <option value="breaths">breaths</option>
                  </select>
                </div>

                <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>
                  Reuse rule: {`exerciseId + type + mode`} (prefers no variant). Only creates a new Track if none exists.
                </div>

                {/* Quick create/add */}
                <div style={{ marginTop: 12 }}>
                  <div className="row" style={{ alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ fontWeight: 800 }}>Quick add</div>
                    <div className="muted" style={{ fontSize: 13 }}>
                      Track name:{" "}
                      <span style={{ color: "var(--text)", fontWeight: 800 }}>{suggestedTrackName || "—"}</span>
                    </div>
                  </div>

                  <div style={{ marginTop: 10 }} className="row">
                    <button
                      className="btn primary"
                      disabled={!quickAddName.trim()}
                      onClick={async () => {
                        await createAndAddTrackToTemplate({
                          templateId: editingTemplate.id,
                          exerciseName: quickAddName,
                          trackDisplayName: suggestedTrackName || quickAddName.trim(),
                          trackType: variantType,
                          trackingMode: variantMode,
                        });
                      }}
                      title="Reuses an existing track if one exists; otherwise creates one"
                    >
                      Add
                    </button>

                    <button
                      className="btn"
                      disabled={!quickAddName.trim()}
                      onClick={() => {
                        if (topCatalogExercise?.name) setQuickAddName(topCatalogExercise.name);
                      }}
                      title="Use the top catalog match"
                    >
                      Use top match
                    </button>
                  </div>
                </div>

                {/* Catalog */}
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontWeight: 800, marginBottom: 8 }}>Catalog</div>

                  {!catalogHasResults ? (
                    <p className="muted" style={{ margin: 0 }}>
                      No exercises match your search.
                    </p>
                  ) : (
                    <div style={{ display: "grid", gap: 10 }}>
                      {catalogGroups
                        .filter((g) => g.exercises.length)
                        .slice(0, 6)
                        .map((g) => (
                          <div key={g.key}>
                            <div className="muted" style={{ fontWeight: 900, marginBottom: 6 }}>
                              {g.title}
                            </div>

                            <div style={{ display: "grid", gap: 6 }}>
                              {g.exercises.slice(0, 10).map((ex) => (
                                <div
                                  key={ex.id}
                                  className="row"
                                  style={{ justifyContent: "space-between", alignItems: "center", gap: 10 }}
                                >
                                  <div style={{ minWidth: 0 }}>
                                    <div style={{ fontWeight: 800, wordBreak: "break-word" }}>{ex.name}</div>
                                  </div>

                                  <button
                                    className="btn small primary"
                                    onClick={async () => {
                                      const base = (ex.name ?? "").trim();
                                      await createAndAddTrackToTemplate({
                                        templateId: editingTemplate.id,
                                        exerciseName: base,
                                        trackDisplayName: `${base} — ${variantType}`,
                                        trackType: variantType,
                                        trackingMode: variantMode,
                                      });
                                    }}
                                  >
                                    Add
                                  </button>
                                </div>
                              ))}
                              {g.exercises.length > 10 ? (
                                <div className="muted" style={{ fontSize: 13 }}>
                                  + {g.exercises.length - 10} more in {g.title} (refine search to narrow)
                                </div>
                              ) : null}
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>

              {/* --- Breadcrumb 9B (Current exercises in template) ----------- */}
              <div className="card" style={{ padding: 12 }}>
                <div style={{ fontWeight: 900, marginBottom: 8 }}>Exercises in this template</div>

                {editingItems.length ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    {editingItems.map((it) => {
                      const tr = trackMap.get(it.trackId);
                      return (
                        <div
                          key={it.id}
                          className="row"
                          style={{ justifyContent: "space-between", alignItems: "center", gap: 10 }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 800, wordBreak: "break-word" }}>
                              {tr?.displayName ?? "Unknown track"}
                            </div>
                            <div className="muted" style={{ marginTop: 3, fontSize: 13 }}>
                              orderIndex: {it.orderIndex}
                            </div>
                          </div>

                          <button
                            className="btn danger small"
                            onClick={async () => {
                              const ok = window.confirm(`Remove "${tr?.displayName ?? "this exercise"}" from template?`);
                              if (!ok) return;
                              await removeExerciseFromTemplate(it.id);
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="muted">No exercises in this template yet.</p>
                )}
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <button className="btn" style={{ width: "100%", padding: "12px 14px" }} onClick={closeEditor}>
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </Page>
  );
}
