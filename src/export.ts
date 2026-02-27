import JSZip from 'jszip';
import { db } from './db';

function q(s: unknown): string {
  const v = (s ?? '').toString();
  const esc = v.replaceAll('"','""');
  return `"${esc}"`;
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

export async function exportCSVsZip(): Promise<Blob> {
  const [exercises, tracks, templates, templateItems, sessions, sets, walks] = await Promise.all([
    db.exercises.toArray(),
    db.tracks.toArray(),
    db.templates.toArray(),
    db.templateItems.toArray(),
    db.sessions.toArray(),
    db.sets.toArray(),
    db.walks.toArray()
  ]);

  const zip = new JSZip();
  zip.file('exercises.csv', exercisesCSV(exercises));
  zip.file('tracks.csv', tracksCSV(tracks));
  zip.file('templates.csv', templatesCSV(templates));
  zip.file('template_items.csv', templateItemsCSV(templateItems));
  zip.file('sessions.csv', sessionsCSV(sessions));
  zip.file('sets.csv', setsCSV(sets));
  zip.file('walks.csv', walksCSV(walks));
  return zip.generateAsync({ type: 'blob' });
}

function exercisesCSV(rows: any[]): string {
  let out = 'exerciseId,name,equipmentTags,notes,createdAt\n';
  for (const e of rows.sort((a,b)=>a.name.localeCompare(b.name))) {
    out += `${e.id},${q(e.name)},${q((e.equipmentTags||[]).join('|'))},${q(e.notes)},${iso(e.createdAt)}\n`;
  }
  return out;
}

function tracksCSV(rows: any[]): string {
  let out = 'trackId,exerciseId,trackType,displayName,trackingMode,warmupSetsDefault,workingSetsDefault,repMin,repMax,restSecondsDefault,rirTargetMin,rirTargetMax,weightJumpDefault,createdAt\n';
  for (const t of rows.sort((a,b)=>a.displayName.localeCompare(b.displayName))) {
    out += `${t.id},${t.exerciseId},${q(t.trackType)},${q(t.displayName)},${q(t.trackingMode)},${t.warmupSetsDefault},${t.workingSetsDefault},${t.repMin},${t.repMax},${t.restSecondsDefault},${t.rirTargetMin ?? ''},${t.rirTargetMax ?? ''},${t.weightJumpDefault},${iso(t.createdAt)}\n`;
  }
  return out;
}

function templatesCSV(rows: any[]): string {
  let out = 'templateId,name,createdAt\n';
  for (const t of rows.sort((a,b)=>a.name.localeCompare(b.name))) {
    out += `${t.id},${q(t.name)},${iso(t.createdAt)}\n`;
  }
  return out;
}

function templateItemsCSV(rows: any[]): string {
  let out = 'templateItemId,templateId,orderIndex,trackId,notes,warmupSetsOverride,workingSetsOverride,repMinOverride,repMaxOverride,createdAt\n';
  for (const it of rows.sort((a,b)=>a.templateId.localeCompare(b.templateId) || a.orderIndex-b.orderIndex)) {
    out += `${it.id},${it.templateId},${it.orderIndex},${it.trackId},${q(it.notes)},${it.warmupSetsOverride ?? ''},${it.workingSetsOverride ?? ''},${it.repMinOverride ?? ''},${it.repMaxOverride ?? ''},${iso(it.createdAt)}\n`;
  }
  return out;
}

function sessionsCSV(rows: any[]): string {
  let out = 'sessionId,templateId,templateName,startedAt,endedAt,notes\n';
  for (const s of rows.sort((a,b)=>a.startedAt-b.startedAt)) {
    out += `${s.id},${s.templateId ?? ''},${q(s.templateName)},${iso(s.startedAt)},${s.endedAt ? iso(s.endedAt) : ''},${q(s.notes)}\n`;
  }
  return out;
}

function setsCSV(rows: any[]): string {
  let out = 'setId,sessionId,trackId,createdAt,setType,weight,reps,seconds,rir,notes\n';
  for (const se of rows.sort((a,b)=>a.createdAt-b.createdAt)) {
    out += `${se.id},${se.sessionId},${se.trackId},${iso(se.createdAt)},${q(se.setType)},${se.weight ?? ''},${se.reps ?? ''},${se.seconds ?? ''},${se.rir ?? ''},${q(se.notes)}\n`;
  }
  return out;
}

function walksCSV(rows: any[]): string {
  let out = 'walkId,date,durationSeconds,distanceMiles,steps,notes\n';
  for (const w of rows.sort((a,b)=>a.date-b.date)) {
    out += `${w.id},${iso(w.date)},${w.durationSeconds},${w.distanceMiles ?? ''},${w.steps ?? ''},${q(w.notes)}\n`;
  }
  return out;
}
