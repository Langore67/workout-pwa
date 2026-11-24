#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { decisions, expectedReviewSet } from "./thin-exercise-reviewed-decisions.mjs";

const normalizeName = (value) => String(value ?? "").toLowerCase().replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();
const hasPayload = (set) => Number(set.reps) > 0 || Number(set.seconds) > 0 || Number(set.distance) > 0 || Number(set.weight) > 0 || Number(set.completedAt) > 0;
const isStrengthTrack = (track) => ["strength", "hypertrophy"].includes(String(track?.trackType ?? "").toLowerCase());

export function audit(payload) {
  const tables = payload.tables ?? payload;
  const exercises = tables.exercises ?? []; const tracks = tables.tracks ?? [];
  const sessions = tables.sessions ?? []; const sets = tables.sets ?? [];
  const byExercise = new Map(exercises.map((row) => [row.id, row]));
  const byTrack = new Map(tracks.map((row) => [row.id, row]));
  const bySession = new Map(sessions.map((row) => [row.id, row]));
  const useCounts = new Map();
  for (const set of sets) {
    const track = byTrack.get(set.trackId); const session = bySession.get(set.sessionId);
    if (!track || !session || session.deletedAt || set.deletedAt || !isStrengthTrack(track) || !hasPayload(set)) continue;
    const exercise = byExercise.get(track.exerciseId);
    if (exercise && !exercise.archivedAt && !exercise.mergedIntoExerciseId && !exercise.movementPattern && !exercise.strengthSignalRole) useCounts.set(exercise.id, (useCounts.get(exercise.id) ?? 0) + 1);
  }
  const candidates = exercises.filter((row) => !row.archivedAt && !row.mergedIntoExerciseId && !row.movementPattern && !row.strengthSignalRole && useCounts.has(row.id))
    .map((row) => ({ exercise: row, sets: useCounts.get(row.id) })).sort((a, b) => a.exercise.name.localeCompare(b.exercise.name));
  return { tables, exercises, tracks, sessions, sets, candidates, useCounts };
}

function targetAliases(target, source) {
  return [...new Set([...(Array.isArray(target.aliases) ? target.aliases : []), source.name, ...(Array.isArray(source.aliases) ? source.aliases : [])]
    .map((value) => String(value ?? "").trim()).filter(Boolean).filter((value) => normalizeName(value) !== normalizeName(target.name)))].sort((a, b) => a.localeCompare(b));
}

export function createReviewedPlan(payload, sourceHash = "") {
  const audited = audit(payload); const rows = new Map(audited.candidates.map(({ exercise, sets }) => [exercise.id, { exercise, sets }]));
  const decisionsById = new Map(decisions.map((decision) => [decision.id, decision]));
  const missing = [...decisionsById.keys()].filter((id) => !rows.has(id));
  const unlisted = [...rows.keys()].filter((id) => !decisionsById.has(id));
  const observed = { activeExercises: audited.exercises.filter((row) => !row.archivedAt && !row.mergedIntoExerciseId).length, thinUsedExercises: rows.size, performedPayloadSets: [...rows.values()].reduce((sum, row) => sum + row.sets, 0) };
  if (JSON.stringify(observed) !== JSON.stringify(expectedReviewSet) || missing.length || unlisted.length) throw new Error("Reviewed backup mismatch. Expected " + JSON.stringify(expectedReviewSet) + "; observed " + JSON.stringify(observed) + ". Missing IDs: " + missing.join(",") + "; unlisted IDs: " + unlisted.join(",") + ".");
  const actions = decisions.map((decision) => {
    const row = rows.get(decision.id); const exercise = row.exercise;
    if (exercise.name !== decision.name) throw new Error("Identity mismatch for " + decision.id + ": expected " + decision.name + ", found " + exercise.name + ".");
    if (decision.action === "MERGE_TO_CANONICAL") {
      const target = audited.exercises.find((item) => item.id === decision.targetId);
      if (!target || target.archivedAt || target.mergedIntoExerciseId || target.name !== decision.targetName) throw new Error("Canonical target mismatch for " + decision.name + ".");
      const sourceTracks = audited.tracks.filter((track) => track.exerciseId === exercise.id).map((track) => track.id).sort();
      const targetTrackIds = new Set(audited.tracks.filter((track) => track.exerciseId === target.id).map((track) => track.id));
      const sourceSetIds = new Set(audited.sets.filter((set) => sourceTracks.includes(set.trackId)).map((set) => set.sessionId));
      const targetSetIds = new Set(audited.sets.filter((set) => targetTrackIds.has(set.trackId)).map((set) => set.sessionId));
      const overlappingSessionIds = [...sourceSetIds].filter((sessionId) => targetSetIds.has(sessionId)).sort();
      const sourceMetadata = Object.fromEntries(["normalizedName", "aliases", "movementPattern", "strengthSignalRole", "category", "bodyPart", "equipment", "metricMode", "trainingRole", "anchorEligibility"].map((key) => [key, exercise[key] ?? null]));
      return { ...decision, sets: row.sets, overlappingSessionIds, before: { metadata: sourceMetadata, trackIds: sourceTracks }, after: { canonicalTarget: target.name, aliases: targetAliases(target, exercise), movedTrackIds: sourceTracks }, operation: {
        type: "mergeExercise", sourceExerciseId: exercise.id, targetExerciseId: target.id,
        expectSourceName: exercise.name, expectSourceNormalizedName: exercise.normalizedName,
        expectSourceAliases: exercise.aliases ?? [], expectTargetName: target.name,
        expectTargetNormalizedName: target.normalizedName, expectTargetAliases: target.aliases ?? [],
        setTargetAliases: targetAliases(target, exercise), expectedTrackIds: sourceTracks,
      } };
    }
    if (decision.action === "BACKFILL_METADATA") return {
      ...decision, sets: row.sets,
      before: { metadata: Object.fromEntries(Object.keys(decision.metadata).map((key) => [key, exercise[key] ?? null])) },
      after: { metadata: decision.metadata },
      operation: { type: "updateRecord", table: "exercises", key: exercise.id, expect: { createdAt: exercise.createdAt }, expectUnsetFields: Object.keys(decision.metadata), set: decision.metadata },
    };
    return { ...decision, sets: row.sets, before: { metadata: Object.fromEntries(["movementPattern", "strengthSignalRole", "bodyPart", "category", "equipment"].map((key) => [key, exercise[key] ?? null])) }, after: { unchanged: true } };
  });
  return { ...audited, actions, observed };
}

export function simulate(plan) {
  const exercises = plan.exercises.map((row) => ({ ...row, aliases: Array.isArray(row.aliases) ? [...row.aliases] : [] }));
  const tracks = plan.tracks.map((row) => ({ ...row })); const byId = new Map(exercises.map((row) => [row.id, row]));
  for (const action of plan.actions) {
    if (action.action === "BACKFILL_METADATA") Object.assign(byId.get(action.id), action.metadata);
    if (action.action === "MERGE_TO_CANONICAL") {
      const source = byId.get(action.id); const target = byId.get(action.targetId); target.aliases = action.operation.setTargetAliases;
      for (const track of tracks) if (track.exerciseId === source.id) track.exerciseId = target.id;
      source.mergedIntoExerciseId = target.id; source.archivedAt = source.archivedAt ?? 1; source.mergeNote = "Simulated merge into " + target.name;
    }
  }
  return audit({ ...plan.tables, exercises, tracks });
}

export function createMaintenanceArtifact(plan, payload, sourceHash) {
  const tables = payload.tables ?? payload; const operations = plan.actions.flatMap((action) => action.operation ? [action.operation] : []);
  const counts = Object.fromEntries(["exercises", "tracks", "sessions", "sets", "bodyMetrics", "bodyMeasurements", "app_meta"].map((name) => [name, (tables[name] ?? []).length]));
  return {
    format: "ironforge-db-maintenance", version: 1, id: "reconcile-thin-strength-exercises-2026-11-23",
    name: "Reviewed reconciliation of active thin strength/hypertrophy exercises",
    createdAt: "2026-11-24T00:00:00.000Z", operationCount: operations.length,
    preconditions: { dbName: payload.meta?.dbName ?? "workout_mvp_db", dexieSchemaVersion: 19, supportedBackupVersion: 2 },
    sourceBackup: { exportedAt: payload.meta?.exportedAt, sha256: sourceHash, recordCounts: counts }, operations,
  };
}

function print(plan, simulated, outputPath) {
  console.log("Backup: " + (plan.payloadName ?? "provided file"));
  console.log("Reproduced: " + plan.observed.activeExercises + " active exercises; " + plan.observed.thinUsedExercises + " active thin used; " + plan.observed.performedPayloadSets + " performed-payload sets.");
  for (const row of plan.actions) {
    const fields = row.action === "BACKFILL_METADATA" ? JSON.stringify(row.metadata) : row.action === "MERGE_TO_CANONICAL" ? "-> " + row.targetName : "-";
    console.log(row.name + " | " + row.id + " | " + row.sets + " sets | " + row.action + " | " + fields + " | before=" + JSON.stringify(row.before) + " | after=" + JSON.stringify(row.after) + (row.overlappingSessionIds ? " | overlapping sessions with target=" + row.overlappingSessionIds.length : "") + " | " + row.reason);
  }
  const counts = plan.actions.reduce((out, row) => ((out[row.action] = (out[row.action] ?? 0) + 1), out), {});
  console.log("Decisions: " + Object.entries(counts).map(([key, value]) => key + "=" + value).join("; "));
  console.log("Simulated audit: thin records " + plan.candidates.length + " -> " + simulated.candidates.length + "; sets attached to unresolved records " + plan.observed.performedPayloadSets + " -> " + [...simulated.useCounts.values()].reduce((sum, count) => sum + count, 0) + ".");
  console.log("No input backup or application database was modified.");
  if (outputPath) console.log("Maintenance artifact written: " + outputPath + ". Upload it in Database Maintenance, review the dry run, confirm a current backup, then explicitly execute there.");
}

async function main() {
  const inputIndex = process.argv.indexOf("--input"); const input = inputIndex >= 0 ? process.argv[inputIndex + 1] : null;
  if (!input) throw new Error("Usage: node scripts/reconcile-thin-exercise-backup.mjs --input <backup.json> [--apply --backup-confirmed --output <maintenance.json>]");
  const inputPath = path.resolve(input); const raw = await readFile(inputPath); const payload = JSON.parse(raw.toString("utf8"));
  const sourceHash = createHash("sha256").update(raw).digest("hex"); const plan = createReviewedPlan(payload, sourceHash); plan.payloadName = path.basename(inputPath);
  const after = simulate(plan); const applying = process.argv.includes("--apply");
  if (applying && !process.argv.includes("--backup-confirmed")) throw new Error("--apply only emits an app maintenance artifact; confirm the source backup with --backup-confirmed. It does not mutate IndexedDB.");
  let outputPath;
  if (applying) {
    const outputIndex = process.argv.indexOf("--output");
    outputPath = path.resolve(outputIndex >= 0 ? process.argv[outputIndex + 1] : "maintenance/reconcile-thin-exercises-2026-11-23.json");
    await writeFile(outputPath, JSON.stringify(createMaintenanceArtifact(plan, payload, sourceHash), null, 2) + "\n", { flag: "wx" });
  }
  print(plan, after, outputPath);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
