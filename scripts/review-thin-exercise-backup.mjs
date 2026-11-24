#!/usr/bin/env node

/** Read-only reproduction/report for active thin exercises with qualifying use. */
import { readFile } from "node:fs/promises";
import path from "node:path";

function normalize(value) {
  return String(value ?? "").toLowerCase().replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();
}

function qualifies(set, track) {
  if (!track || set.deletedAt || set.setType === "warmup") return false;
  if (!(Number(set.reps) > 0 || Number(set.seconds) > 0 || Number(set.distance) > 0)) return false;
  if (!["strength", "hypertrophy"].includes(String(track.trackType ?? "").toLowerCase())) return false;
  if (set.setType === "drop" || set.setType === "failure") return true;
  if (set.setType && set.setType !== "working") return false;
  const machineKinds = new Set(["technique", "mobility", "corrective", "diagnostic", "rehab", "conditioning", "test"]);
  const fragments = String(set.notes ?? "").split(/\s*\|\s*/).map((part) => part.trim().toLowerCase());
  return !fragments.some((part) => machineKinds.has(part) || /^set_type=(technique|mobility|corrective|diagnostic|rehab|conditioning|test)$/.test(part));
}

function usefulTokens(name) {
  return new Set(normalize(name).split(" ").filter((word) => word.length > 2 && !["the", "and", "for", "left", "right", "with"].includes(word)));
}

async function main() {
  const inputIndex = process.argv.indexOf("--input");
  if (inputIndex < 0 || !process.argv[inputIndex + 1]) throw new Error("Usage: node scripts/review-thin-exercise-backup.mjs --input <backup.json>");
  const backupPath = path.resolve(process.argv[inputIndex + 1]);
  const payload = JSON.parse(await readFile(backupPath, "utf8"));
  const tables = payload.tables ?? payload;
  const exercises = tables.exercises ?? [];
  const tracks = tables.tracks ?? [];
  const sessions = tables.sessions ?? [];
  const sets = tables.sets ?? [];
  const exerciseById = new Map(exercises.map((row) => [row.id, row]));
  const trackById = new Map(tracks.map((row) => [row.id, row]));
  const sessionById = new Map(sessions.map((row) => [row.id, row]));
  const active = exercises.filter((row) => !row.archivedAt && !row.mergedIntoExerciseId);
  const completed = new Set(sessions.filter((row) => !row.deletedAt && Number.isFinite(Number(row.endedAt))).map((row) => row.id));
  const useByExercise = new Map();
  const rawPayloadUseByExercise = new Map();
  for (const set of sets) {
    const track = trackById.get(set.trackId);
    const session = sessionById.get(set.sessionId);
    if (!track || !session || session.deletedAt || set.deletedAt) continue;
    const exercise = exerciseById.get(track.exerciseId);
    if (!exercise) continue;
    const strengthTrack = ["strength", "hypertrophy"].includes(String(track.trackType ?? "").toLowerCase());
    const hasPayload = Number(set.reps) > 0 || Number(set.seconds) > 0 || Number(set.distance) > 0 || Number(set.weight) > 0 || Number(set.completedAt) > 0;
    if (strengthTrack && hasPayload) rawPayloadUseByExercise.set(exercise.id, (rawPayloadUseByExercise.get(exercise.id) ?? 0) + 1);
    if (completed.has(set.sessionId) && qualifies(set, track)) useByExercise.set(exercise.id, (useByExercise.get(exercise.id) ?? 0) + 1);
  }
  const candidates = active
    .filter((exercise) => !exercise.movementPattern && !exercise.strengthSignalRole && rawPayloadUseByExercise.has(exercise.id))
    .map((exercise) => {
      const tokens = usefulTokens(exercise.name);
      const related = active.filter((other) => other.id !== exercise.id
        && [...usefulTokens(other.name)].filter((token) => tokens.has(token)).length >= 2
        && (other.movementPattern || other.strengthSignalRole || other.category || other.bodyPart || other.equipment || other.trainingRole || other.anchorEligibility));
      return {
        id: exercise.id,
        name: exercise.name,
        qualifyingSetCount: useByExercise.get(exercise.id) ?? 0,
        rawPerformedPayloadSetCount: rawPayloadUseByExercise.get(exercise.id),
        metadata: {
          normalizedName: exercise.normalizedName ?? null,
          aliases: exercise.aliases ?? [],
          movementPattern: exercise.movementPattern ?? null,
          strengthSignalRole: exercise.strengthSignalRole ?? null,
          category: exercise.category ?? null,
          bodyPart: exercise.bodyPart ?? null,
          equipment: exercise.equipment ?? null,
          metricMode: exercise.metricMode ?? null,
          trainingRole: exercise.trainingRole ?? null,
          anchorEligibility: exercise.anchorEligibility ?? null,
          anchorSubtypes: exercise.anchorSubtypes ?? null,
        },
        tracks: tracks.filter((track) => track.exerciseId === exercise.id).map((track) => ({ id: track.id, displayName: track.displayName, trackType: track.trackType, trackingMode: track.trackingMode })),
        relatedActiveCandidates: related.map((other) => ({ id: other.id, name: other.name, normalizedName: other.normalizedName ?? null, aliases: other.aliases ?? [], category: other.category ?? null, bodyPart: other.bodyPart ?? null, equipment: other.equipment ?? null, metricMode: other.metricMode ?? null, movementPattern: other.movementPattern ?? null, strengthSignalRole: other.strengthSignalRole ?? null, trainingRole: other.trainingRole ?? null, anchorEligibility: other.anchorEligibility ?? null, anchorSubtypes: other.anchorSubtypes ?? null })),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const report = {
    report: "Read-only active thin-exercise review; related-name candidates are suggestions only.",
    source: { file: path.basename(backupPath), backupVersion: payload.meta?.backupVersion ?? null, exportedAt: payload.meta?.exportedAt ?? null, dbName: payload.meta?.dbName ?? null },
    counts: { totalExercises: exercises.length, activeExercises: active.length, activeThinUsed: candidates.length, performedPayloadSets: candidates.reduce((sum, row) => sum + row.rawPerformedPayloadSetCount, 0), qualifyingCompletedSessionSets: candidates.reduce((sum, row) => sum + row.qualifyingSetCount, 0) },
    candidates,
  };
  if (process.argv.includes("--catalog")) {
    for (const exercise of active) {
      const ownTracks = tracks.filter((track) => track.exerciseId === exercise.id);
      console.log(`${exercise.name} | ${exercise.id} | alias=${(exercise.aliases ?? []).join("; ") || "-"} | pattern=${exercise.movementPattern ?? "-"} | signal=${exercise.strengthSignalRole ?? "-"} | bodyPart=${exercise.bodyPart ?? "-"} | category=${exercise.category ?? "-"} | equipment=${exercise.equipment ?? "-"} | metric=${exercise.metricMode ?? "-"} | tracks=${ownTracks.map((track) => `${track.trackType}/${track.trackingMode}`).join(",") || "-"}`);
    }
    return;
  }
  if (process.argv.includes("--review")) {
    for (const row of candidates) {
      const meta = row.metadata;
      console.log(`${row.name} | ${row.id} | ${row.rawPerformedPayloadSetCount} sets | ${row.tracks.map((track) => `${track.trackType}/${track.trackingMode}`).join(", ")} | current: aliases=${meta.aliases.join("; ") || "-"}; pattern=${meta.movementPattern ?? "-"}; signal=${meta.strengthSignalRole ?? "-"}; category=${meta.category ?? "-"}; bodyPart=${meta.bodyPart ?? "-"}; equipment=${meta.equipment ?? "-"}; metric=${meta.metricMode ?? "-"}; trainingRole=${meta.trainingRole ?? "-"}; anchors=${meta.anchorEligibility ?? "-"}`);
      for (const related of row.relatedActiveCandidates) {
        console.log(`  related-only: ${related.name} [${related.id}] | aliases=${(related.aliases ?? []).join("; ") || "-"}; category=${related.category ?? "-"}; bodyPart=${related.bodyPart ?? "-"}; equipment=${related.equipment ?? "-"}; metric=${related.metricMode ?? "-"}; pattern=${related.movementPattern ?? "-"}; signal=${related.strengthSignalRole ?? "-"}; trainingRole=${related.trainingRole ?? "-"}; anchors=${related.anchorEligibility ?? "-"}`);
      }
    }
    console.log(`TOTAL ${candidates.length} active thin exercises / ${report.counts.performedPayloadSets} performed-payload sets (suggestion-only related-name candidates shown).`);
    return;
  }
  if (process.argv.includes("--summary")) {
    console.log(JSON.stringify({ ...report, candidates: candidates.map(({ name, id, qualifyingSetCount, rawPerformedPayloadSetCount, tracks }) => ({ name, id, rawPerformedPayloadSetCount, qualifyingCompletedSessionSets: qualifyingSetCount, trackTypes: [...new Set(tracks.map((track) => track.trackType))] })) }, null, 2));
    return;
  }
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
