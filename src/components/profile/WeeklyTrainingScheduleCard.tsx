import React, { useEffect, useMemo, useState } from "react";
import type { Template } from "../../db";
import { WEEKDAYS, resolveIntendedWeeklySchedule, validateWeeklyTrainingSchedule, type ScheduleEntry, type Weekday, type WeeklyTrainingSchedule } from "../../domain/schedule/weeklyTrainingSchedule";

type Props = { isEditing: boolean; loading: boolean; schedule: WeeklyTrainingSchedule | null; templates: readonly Template[]; persistSchedule: (schedule: WeeklyTrainingSchedule) => Promise<void> };
type DraftRow = { dayType: "" | "training" | "recovery"; sessionName: string; focus: string; templateId: string };
type DraftAssignments = Record<Weekday, DraftRow>;

function blankAssignments(): DraftAssignments {
  return Object.fromEntries(WEEKDAYS.map(({ dayOfWeek }) => [dayOfWeek, { dayType: "", sessionName: "", focus: "", templateId: "" }])) as DraftAssignments;
}

function assignmentsFromSchedule(schedule: WeeklyTrainingSchedule): DraftAssignments {
  const assignments = blankAssignments();
  for (const entry of schedule.entries) assignments[entry.dayOfWeek] = entry.dayType === "recovery"
    ? { dayType: "recovery", sessionName: "", focus: "", templateId: "" }
    : { dayType: "training", sessionName: entry.sessionName, focus: entry.focus ?? "", templateId: entry.templateId ?? "" };
  return assignments;
}

export function WeeklyTrainingScheduleCard({ isEditing, loading, schedule, templates, persistSchedule }: Props) {
  const [draft, setDraft] = useState<DraftAssignments | null>(null);
  const [draftActive, setDraftActive] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const activeTemplates = useMemo(() => templates.filter((template) => !template.archivedAt).slice().sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)), [templates]);
  const resolved = useMemo(() => resolveIntendedWeeklySchedule(schedule, templates), [schedule, templates]);

  useEffect(() => { if (!isEditing) { setDraft(null); setError(""); } }, [isEditing]);

  function beginEdit() { setDraft(schedule ? assignmentsFromSchedule(schedule) : blankAssignments()); setDraftActive(schedule?.active ?? true); setError(""); }
  function updateRow(dayOfWeek: Weekday, patch: Partial<DraftRow>) { if (draft) setDraft({ ...draft, [dayOfWeek]: { ...draft[dayOfWeek], ...patch } }); }

  async function save() {
    if (!draft || saving) return;
    const entries: ScheduleEntry[] = WEEKDAYS.flatMap(({ dayOfWeek }) => {
      const row = draft[dayOfWeek];
      if (row.dayType === "recovery") return [{ dayOfWeek, dayType: "recovery" as const }];
      if (row.dayType !== "training") return [];
      return [{ dayOfWeek, dayType: "training" as const, sessionName: row.sessionName, ...(row.focus.trim() ? { focus: row.focus } : {}), ...(row.templateId ? { templateId: row.templateId } : {}) }];
    });
    const now = Date.now();
    const next: WeeklyTrainingSchedule = { id: schedule?.id ?? crypto.randomUUID(), active: draftActive, entries, createdAt: schedule?.createdAt ?? now, updatedAt: now };
    const validated = validateWeeklyTrainingSchedule(next, templates);
    if (!validated.ok) { setError(validated.issues[0]?.message ?? "Weekly schedule is invalid."); return; }
    setSaving(true); setError("");
    try { await persistSchedule(validated.schedule); setDraft(null); }
    catch (cause) { setError(cause instanceof Error && cause.message ? cause.message : "Could not save the weekly schedule."); }
    finally { setSaving(false); }
  }

  return <div className="card" style={{ padding: 14, marginBottom: 12 }} data-testid="weekly-training-schedule-card">
    <div className="muted" style={{ fontSize: 12, fontWeight: 700, marginBottom: 10, letterSpacing: 0.4 }}>WEEKLY TRAINING SCHEDULE</div>
    {loading ? <div className="muted">Loading weekly schedule…</div> : !schedule ? <div className="muted">No weekly training schedule configured.</div> : <>
      <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>{schedule.active ? "Active" : "Inactive"} · {resolved.trainingDays} training day{resolved.trainingDays === 1 ? "" : "s"} per week</div>
      <div style={{ display: "grid", gap: 8 }}>{resolved.entries.map((entry) => <div key={entry.dayOfWeek} style={{ display: "grid", gridTemplateColumns: "minmax(92px, 0.7fr) minmax(0, 1.3fr)", gap: 10 }}>
        <div className="muted" style={{ fontSize: 13 }}>{entry.dayName}</div><div>
          <div style={{ fontWeight: 700 }}>{entry.dayType === "recovery" ? "Recovery" : entry.sessionName}</div>
          {entry.dayType === "training" && entry.focus ? <div className="muted" style={{ fontSize: 12 }}>{entry.focus}</div> : null}
          {entry.dayType === "training" && entry.templateStatus === "available" ? <div className="muted" style={{ fontSize: 12 }}>Linked template: {entry.templateName}</div> : null}
          {entry.dayType === "training" && entry.templateStatus === "missing" ? <div style={{ color: "#92400e", fontSize: 12 }}>Linked template is unavailable ({entry.templateId}).</div> : null}
          {entry.dayType === "training" && entry.templateStatus === "archived" ? <div style={{ color: "#92400e", fontSize: 12 }}>Linked template is archived ({entry.templateName}).</div> : null}
        </div></div>)}</div>
    </>}
    {isEditing && !loading ? <div style={{ marginTop: 12 }}>{!draft ? <button className="btn small" type="button" onClick={beginEdit}>{schedule ? "Edit schedule" : "Configure schedule"}</button> : <div data-testid="weekly-schedule-form" style={{ borderTop: "1px solid var(--border)", paddingTop: 12, display: "grid", gap: 12 }}>
      {WEEKDAYS.map(({ dayOfWeek, name }) => { const row = draft[dayOfWeek]; const referenced = row.templateId ? templates.find((template) => template.id === row.templateId) : undefined; const invalidReference = row.templateId && (!referenced || referenced.archivedAt); return <div key={dayOfWeek} style={{ borderBottom: "1px solid var(--border)", paddingBottom: 10 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>{name}</div><div style={{ display: "grid", gap: 7 }}>
          <select className="input" aria-label={`${name} assignment`} value={row.dayType} onChange={(event) => updateRow(dayOfWeek, { dayType: event.target.value as DraftRow["dayType"] })}><option value="">Choose…</option><option value="training">Training</option><option value="recovery">Recovery</option></select>
          {row.dayType === "training" ? <><input className="input" aria-label={`${name} session name`} placeholder="Session name" value={row.sessionName} onChange={(event) => updateRow(dayOfWeek, { sessionName: event.target.value })} /><input className="input" aria-label={`${name} focus`} placeholder="Focus / description (optional)" value={row.focus} onChange={(event) => updateRow(dayOfWeek, { focus: event.target.value })} /><select className="input" aria-label={`${name} linked template`} value={row.templateId} onChange={(event) => updateRow(dayOfWeek, { templateId: event.target.value })}><option value="">No linked template</option>{invalidReference ? <option value={row.templateId}>{!referenced ? `Unavailable template (${row.templateId})` : `${referenced.name} (archived)`}</option> : null}{activeTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></> : null}
        </div></div>; })}
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}><input type="checkbox" aria-label="Schedule active" checked={draftActive} onChange={(event) => setDraftActive(event.target.checked)} />Schedule active</label>
      <div style={{ display: "flex", gap: 8 }}><button className="btn small primary" type="button" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save schedule"}</button><button className="btn small" type="button" disabled={saving} onClick={() => { setDraft(null); setError(""); }}>Cancel</button></div>
    </div>}{error ? <div role="alert" style={{ color: "#b91c1c", fontWeight: 700, fontSize: 13, marginTop: 8 }}>{error}</div> : null}</div> : null}
  </div>;
}
