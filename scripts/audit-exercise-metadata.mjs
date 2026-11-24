#!/usr/bin/env node

/**
 * Read-only audit of an IronForge Dexie JSON backup (the format downloaded by
 * the app's Backup action). It never opens or writes to the live database.
 *
 * Usage:
 *   node scripts/audit-exercise-metadata.mjs --input path/to/backup.json
 *   node scripts/audit-exercise-metadata.mjs --input backup.json --format json
 *   node scripts/audit-exercise-metadata.mjs --input backup.json --format csv
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const PATTERNS = new Set(["push", "pull", "hinge", "squat", "carry", "lunge"]);
const SIGNAL_ROLES = new Set(["included", "secondary", "excluded"]);
const ANCHOR_ELIGIBILITY = new Set(["none", "conditional", "primary"]);
const TRAINING_ROLES = new Set(["primary", "accessory", "corrective", "deprioritized"]);
const CATEGORIES = new Set(["Strength", "Machine", "Bodyweight", "Cardio", "Mobility", "Warmup", "Other"]);
const EQUIPMENT = new Set(["Barbell", "Dumbbell", "Cable", "Machine", "Bodyweight", "Kettlebell", "Band", "Other"]);
const BODY_PARTS = new Set(["Chest", "Back", "Legs", "Shoulders", "Arms", "Core", "Full Body", "Cardio", "Other"]);
const EXTERNAL_CLASSIFICATION_CATEGORIES = new Set(["Cardio", "Mobility", "Warmup"]);
const STRENGTH_CATEGORIES = new Set(["Strength", "Machine", "Bodyweight"]);

function normalizeName(value) {
  return String(value ?? "").toLowerCase().replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();
}

function present(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function validOptional(value, allowed) {
  return !present(value) || allowed.has(value);
}

function classifyExercise(exercise) {
  const reasons = [];
  const active = !exercise.archivedAt && !exercise.mergedIntoExerciseId;
  const name = String(exercise.name ?? "").trim();
  const normalizedName = String(exercise.normalizedName ?? "").trim();
  const category = exercise.category;
  const trainingRole = exercise.trainingRole;
  const signalRole = exercise.strengthSignalRole;
  const pattern = exercise.movementPattern;
  const anchor = exercise.anchorEligibility;
  const invalid = [];

  if (!present(exercise.id)) reasons.push("required id is missing");
  if (!name) reasons.push("required name is missing");
  if (!normalizedName) reasons.push("required normalizedName is missing");
  else if (name && !exercise.mergedIntoExerciseId && normalizedName !== normalizeName(name)) invalid.push("normalizedName does not match canonical name normalization");
  if (!Array.isArray(exercise.equipmentTags)) reasons.push("required equipmentTags array is missing");
  if (typeof exercise.createdAt !== "number" || !Number.isFinite(exercise.createdAt)) reasons.push("required createdAt is missing or invalid");

  if (!validOptional(category, CATEGORIES)) invalid.push(`invalid category: ${category}`);
  if (!validOptional(exercise.bodyPart, BODY_PARTS)) invalid.push(`invalid bodyPart: ${exercise.bodyPart}`);
  if (!validOptional(exercise.equipment, EQUIPMENT)) invalid.push(`invalid equipment: ${exercise.equipment}`);
  if (!validOptional(pattern, PATTERNS)) invalid.push(`invalid movementPattern: ${pattern}`);
  if (!validOptional(signalRole, SIGNAL_ROLES)) invalid.push(`invalid strengthSignalRole: ${signalRole}`);
  if (!validOptional(trainingRole, TRAINING_ROLES)) invalid.push(`invalid trainingRole: ${trainingRole}`);
  if (!validOptional(anchor, ANCHOR_ELIGIBILITY)) invalid.push(`invalid anchorEligibility: ${anchor}`);

  if (exercise.aliases !== undefined && !Array.isArray(exercise.aliases)) invalid.push("aliases is not an array");
  if (exercise.anchorSubtypes !== undefined && !Array.isArray(exercise.anchorSubtypes)) invalid.push("anchorSubtypes is not an array");
  if (EXTERNAL_CLASSIFICATION_CATEGORIES.has(category) && (signalRole === "included" || signalRole === "secondary" || anchor === "primary" || anchor === "conditional")) {
    invalid.push(`category ${category} conflicts with strength/anchor inclusion metadata`);
  }

  if (invalid.length) return { status: "INCONSISTENT", reasons: [...reasons, ...invalid] };
  if (reasons.length) return { status: "MISSING_METADATA", reasons };

  const identity = active ? "active" : exercise.mergedIntoExerciseId ? "merged record" : "archived record";
  if (!active) return { status: "COMPLETE", reasons: [`${identity}; active-use classification not required`] };

  const intentionallyOutsideMovementTaxonomy =
    EXTERNAL_CLASSIFICATION_CATEGORIES.has(category) ||
    trainingRole === "corrective" ||
    trainingRole === "accessory" ||
    signalRole === "excluded";

  if ((anchor === "primary" || anchor === "conditional") && (!Array.isArray(exercise.anchorSubtypes) || !exercise.anchorSubtypes.some(present))) {
    return { status: "MISSING_METADATA", reasons: ["anchor-eligible exercise has no non-empty anchorSubtypes"] };
  }

  if ((signalRole === "included" || signalRole === "secondary" || trainingRole === "primary" || anchor === "primary" || anchor === "conditional") && !PATTERNS.has(pattern)) {
    return { status: "MISSING_METADATA", reasons: ["strength/anchor metadata indicates movement classification is expected, but movementPattern is absent or invalid"] };
  }

  if (intentionallyOutsideMovementTaxonomy && !pattern) {
    return { status: "INTENTIONALLY_UNCLASSIFIED", reasons: [
      category && EXTERNAL_CLASSIFICATION_CATEGORIES.has(category) ? `structured category is ${category}` :
      trainingRole ? `structured trainingRole is ${trainingRole}` :
      "strengthSignalRole is explicitly excluded",
    ] };
  }

  if (STRENGTH_CATEGORIES.has(category) && !present(signalRole)) {
    return { status: "MISSING_METADATA", reasons: [`category ${category} suggests strength work but strengthSignalRole is absent`] };
  }

  if (present(pattern) && !present(signalRole)) {
    return { status: "MISSING_METADATA", reasons: ["movementPattern exists but strengthSignalRole is absent"] };
  }

  if (present(signalRole) || present(pattern) || trainingRole === "primary" || trainingRole === "accessory" || trainingRole === "corrective" || EXTERNAL_CLASSIFICATION_CATEGORIES.has(category)) {
    return { status: "COMPLETE", reasons: ["required schema fields and applicable structured classification are present"] };
  }

  return { status: "AMBIGUOUS", reasons: ["no structured classification establishes whether movement/strength metadata is expected"] };
}

function statusForSet(set, track) {
  if (!track || set.deletedAt || set.setType === "warmup") return false;
  if (!(Number(set.reps) > 0 || Number(set.seconds) > 0 || Number(set.distance) > 0)) return false;
  const type = String(track.trackType ?? "").toLowerCase();
  if (!["strength", "hypertrophy"].includes(type)) return false;
  if (["drop", "failure"].includes(set.setType)) return true;
  if (set.setType && set.setType !== "working") return false;
  const exactIntent = new Set(["technique", "set_type=technique", "mobility", "set_type=mobility", "corrective", "set_type=corrective", "diagnostic", "set_type=diagnostic", "rehab", "set_type=rehab", "conditioning", "set_type=conditioning", "test", "set_type=test"]);
  const fragments = String(set.notes ?? "").split(/\s*\|\s*/).map((part) => part.trim().toLowerCase());
  if (fragments.some((part) => exactIntent.has(part))) return false;
  return true;
}

export function buildExerciseMetadataAudit(payload) {
  const tables = payload?.tables ?? payload;
  if (!tables || !Array.isArray(tables.exercises)) throw new Error("Input must be an IronForge JSON backup with tables.exercises.");
  const exercises = tables.exercises;
  const tracks = Array.isArray(tables.tracks) ? tables.tracks : [];
  const sessions = Array.isArray(tables.sessions) ? tables.sessions : [];
  const sets = Array.isArray(tables.sets) ? tables.sets : [];
  const exerciseById = new Map(exercises.map((row) => [row.id, row]));
  const trackById = new Map(tracks.map((row) => [row.id, row]));
  const statusRows = exercises.map((exercise) => ({ exercise, ...classifyExercise(exercise) }));
  const tracksByExerciseId = new Map();
  for (const track of tracks) {
    if (!track.exerciseId) continue;
    tracksByExerciseId.set(track.exerciseId, (tracksByExerciseId.get(track.exerciseId) ?? 0) + 1);
  }
  const completedSessionIds = new Set(sessions.filter((session) => !session.deletedAt && Number.isFinite(Number(session.endedAt))).map((session) => session.id));
  const candidateSetCountByExercise = new Map();
  for (const set of sets) {
    if (!completedSessionIds.has(set.sessionId)) continue;
    const track = trackById.get(set.trackId);
    if (!statusForSet(set, track)) continue;
    const exercise = exerciseById.get(track.exerciseId);
    if (!exercise) continue;
    candidateSetCountByExercise.set(exercise.id, (candidateSetCountByExercise.get(exercise.id) ?? 0) + 1);
  }

  const counts = Object.fromEntries(["COMPLETE", "MISSING_METADATA", "INTENTIONALLY_UNCLASSIFIED", "AMBIGUOUS", "INCONSISTENT"].map((key) => [key, statusRows.filter((row) => row.status === key).length]));
  const incomplete = statusRows.filter((row) => row.status !== "COMPLETE").map(({ exercise, status, reasons }) => ({
    name: exercise.name ?? "(missing name)",
    id: exercise.id ?? "(missing id)",
    status,
    currentMetadata: [
      `category=${exercise.category ?? "-"}`,
      `pattern=${exercise.movementPattern ?? "-"}`,
      `strengthRole=${exercise.strengthSignalRole ?? "-"}`,
      `trainingRole=${exercise.trainingRole ?? "-"}`,
      `anchor=${exercise.anchorEligibility ?? "-"}`,
      `equipment=${exercise.equipment ?? "-"}`,
      `bodyPart=${exercise.bodyPart ?? "-"}`,
      `tracks=${tracksByExerciseId.get(exercise.id) ?? 0}`,
    ].join("; "),
    source: "unknown (no creation provenance field)",
    reasons,
    suggestedAction: status === "MISSING_METADATA" ? "manual review" : status === "INCONSISTENT" ? "manual review" : status === "AMBIGUOUS" ? "taxonomy decision needed" : "leave unchanged",
  }));

  const exposureCandidates = statusRows.filter((row) => candidateSetCountByExercise.has(row.exercise.id)).map((row) => ({
    name: row.exercise.name,
    id: row.exercise.id,
    status: row.status,
    qualifyingResistanceSetsObserved: candidateSetCountByExercise.get(row.exercise.id),
    movementPattern: row.exercise.movementPattern ?? null,
    trainingRole: row.exercise.trainingRole ?? null,
  }));

  return {
    generatedAt: new Date().toISOString(),
    source: payload.meta ? { kind: "IronForge backup", exportedAt: payload.meta.exportedAt ?? null, dbName: payload.meta.dbName ?? null } : { kind: "provided catalog JSON; backup metadata unavailable" },
    counts: { total: exercises.length, ...counts },
    provenance: { available: false, detail: "Exercise records have no createdBy/source/provenance field; Paste Workout origin cannot be inferred from stored data." },
    pasteWorkoutMetrics: null,
    exposureReconciliation: {
      candidateExerciseCount: exposureCandidates.length,
      candidateSetCount: [...candidateSetCountByExercise.values()].reduce((sum, count) => sum + count, 0),
      candidates: exposureCandidates,
      note: "These are completed-session resistance-set candidates after warmup/deleted/empty and exact performed-intent exclusions. The production Training Exposure builder additionally resolves aliases/merged exercises and applies mobility exclusions, canonical movement-family name fallback, and accessory exemptions; records requiring those rules are not conclusively classified by this standalone report.",
    },
    incomplete,
  };
}

function csvCell(value) {
  const text = Array.isArray(value) ? value.join(" | ") : String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function printTable(audit) {
  console.log("Exercise metadata audit (read-only)");
  console.log(`Source: ${audit.source.kind}${audit.source.exportedAt ? ` (exported ${audit.source.exportedAt})` : ""}`);
  console.log(`Total exercises: ${audit.counts.total}`);
  for (const key of ["COMPLETE", "MISSING_METADATA", "INTENTIONALLY_UNCLASSIFIED", "AMBIGUOUS", "INCONSISTENT"]) console.log(`${key}: ${audit.counts[key]}`);
  console.log("Creation provenance: unavailable; no Paste Workout rates can be calculated.");
  console.log(`Observed potential Training Exposure candidates: ${audit.exposureReconciliation.candidateExerciseCount} exercises / ${audit.exposureReconciliation.candidateSetCount} qualifying resistance sets`);
  console.log("\nNon-COMPLETE exercises:");
  if (!audit.incomplete.length) console.log("(none)");
  for (const row of audit.incomplete) console.log(`- ${row.name} [${row.id}] | ${row.status} | ${row.currentMetadata} | ${row.reasons.join("; ")} | suggested: ${row.suggestedAction}`);
  if (audit.exposureReconciliation.candidates.length) {
    console.log("\nPotentially unclassified exposure candidates (metadata view; see reconciliation note):");
    for (const row of audit.exposureReconciliation.candidates.filter((candidate) => !candidate.movementPattern)) console.log(`- ${row.name} [${row.id}] | ${row.qualifyingResistanceSetsObserved} set(s) | ${row.status} | trainingRole=${row.trainingRole ?? "-"}`);
  }
}

async function main(argv) {
  const inputIndex = argv.indexOf("--input");
  if (inputIndex < 0 || !argv[inputIndex + 1]) throw new Error("Usage: node scripts/audit-exercise-metadata.mjs --input <IronForge-backup.json> [--format table|json|csv]");
  const inputPath = path.resolve(argv[inputIndex + 1]);
  const formatIndex = argv.indexOf("--format");
  const format = formatIndex >= 0 ? argv[formatIndex + 1] : "table";
  const payload = JSON.parse(await readFile(inputPath, "utf8"));
  const audit = buildExerciseMetadataAudit(payload);
  if (format === "json") console.log(JSON.stringify(audit, null, 2));
  else if (format === "csv") {
    const columns = ["name", "id", "source", "currentMetadata", "status", "reasons", "suggestedAction"];
    console.log(columns.join(","));
    for (const row of audit.incomplete) console.log(columns.map((column) => csvCell(row[column])).join(","));
  } else if (format === "table") printTable(audit);
  else throw new Error(`Unknown format "${format}"; use table, json, or csv.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`Exercise metadata audit failed: ${error.message}`);
    process.exitCode = 1;
  });
}
