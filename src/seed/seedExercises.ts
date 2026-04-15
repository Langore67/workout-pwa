// src/seed/seedExercises.ts
/* ============================================================================
   seedExercises.ts — Exercise Catalog Seeder (Dexie)
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-02-22-SEED-01
   Version history
   - 2026-02-22  SEED-01  Option B split cues support (cuesSetup/cuesExecution),
                          idempotent add + safe backfill, legacy cues fallback.
   ============================================================================

   PURPOSE
   -------
   This file contains the *database seeding logic* only.
   It does NOT contain any UI / JSX / button handlers.

   It seeds db.exercises from exercises.seed.with_cues.json.

   IMPORTANT BEHAVIOR
   ------------------
   - Idempotent adds: existing exercises (by normalizedName) are not duplicated.
   - Safe backfill: if an exercise already exists, we fill *missing* coaching
     fields from seed WITHOUT overwriting existing non-empty values.
   - Option B cues: supports cuesSetup + cuesExecution (preferred).
   - Legacy support: if seed has cues[] and split cues are missing, we backfill
     cuesExecution from cues[].
*/

import { db, normalizeName } from "../db";
import type { Exercise, BodyPart, ExerciseCategory, Equipment } from "../db";
import { uuid } from "../utils";
import exercisesSeed from "./exercises.seed.with_cues.json";

type SeedExercise = {
  name: string;
  bodyPart?: BodyPart | string;
  category?: ExerciseCategory | string;
  equipment?: Equipment | string;
  aliases?: string[];

  // Classification / scoring metadata (optional)
  movementPattern?: string;
  strengthSignalRole?: string;

  // Coaching / media (optional)
  summary?: string;
  directions?: string;

  // ✅ Option B: split cues
  cuesSetup?: string[];
  cuesExecution?: string[];

  // (Optional legacy)
  cues?: string[];

  commonMistakes?: string[];

  videoUrl?: string;
  imageUrl?: string;
  animationKey?: string;

  // Optional tags for future; not stored unless you decide to
  equipmentTags?: string[];
};

// Runtime guards (must match union types in ../db)
const BODY_PARTS: BodyPart[] = ["Chest", "Back", "Legs", "Shoulders", "Arms", "Core", "Full Body", "Cardio", "Other"];
const CATEGORIES: ExerciseCategory[] = ["Strength", "Machine", "Bodyweight", "Cardio", "Mobility", "Warmup", "Other"];
const EQUIPMENT: Equipment[] = ["Barbell", "Dumbbell", "Cable", "Machine", "Bodyweight", "Kettlebell", "Band", "Other"];

function asBodyPart(v: any): BodyPart | undefined {
  return BODY_PARTS.includes(v) ? (v as BodyPart) : undefined;
}
function asCategory(v: any): ExerciseCategory | undefined {
  return CATEGORIES.includes(v) ? (v as ExerciseCategory) : undefined;
}
function asEquipment(v: any): Equipment | undefined {
  return EQUIPMENT.includes(v) ? (v as Equipment) : undefined;
}

function cleanText(v: any): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s ? s : undefined;
}

function cleanStringArray(v: any): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean);

  // return [] only if caller explicitly wants "empty but defined"
  return out.length ? out : [];
}

function isNonEmptyStringArray(v: any): v is string[] {
  return Array.isArray(v) && v.some((x) => typeof x === "string" && x.trim().length > 0);
}

export type SeedExercisesResult = {
  added: number;
  skippedExisting: number;
  skippedDuplicateInSeed: number;
  skippedInvalid: number;

  // number of existing exercises that got backfilled fields
  updated: number;

  existingBefore: number;
  seedCount: number;
};

export async function seedExercises(): Promise<SeedExercisesResult> {
  const now = Date.now();

  const seedArray = exercisesSeed as unknown;
  if (!Array.isArray(seedArray)) {
    throw new Error("exercises.seed.with_cues.json did not import as an array. Check your JSON + Vite/TS config.");
  }

  // basic normalize: ensure name is present + trimmed
  const raw = (seedArray as SeedExercise[])
    .map((x) => ({
      ...x,
      name: (x?.name ?? "").trim(),
    }))
    .filter((x) => x.name.length > 0);

  // existing lookup by normalizedName
  const existingArr = await db.exercises.toArray();
  const existingByNorm = new Map<string, Exercise>();
  for (const e of existingArr) {
    const norm = (e.normalizedName ?? normalizeName(e.name ?? "")).trim();
    if (norm) existingByNorm.set(norm, e);
  }

  const seenInSeed = new Set<string>();
  const toAdd: Exercise[] = [];

  let skippedExisting = 0;
  let skippedDuplicateInSeed = 0;
  let skippedInvalid = 0;
  let updated = 0;

  for (const x of raw) {
    const norm = normalizeName(x.name);
    if (!norm) {
      skippedInvalid++;
      continue;
    }

    if (seenInSeed.has(norm)) {
      skippedDuplicateInSeed++;
      continue;
    }
    seenInSeed.add(norm);

        // Normalize seed classification / coaching / media
        const movementPattern = cleanText(x.movementPattern);
        const strengthSignalRole = cleanText(x.strengthSignalRole);
    
        const summary = cleanText(x.summary);
        const directions = cleanText(x.directions);
    
        const cuesSetup = cleanStringArray(x.cuesSetup);
    const cuesExecution = cleanStringArray(x.cuesExecution);

    // Optional legacy (if you still have old data)
    const cuesLegacy = cleanStringArray(x.cues);

    const commonMistakes = cleanStringArray(x.commonMistakes);

    const videoUrl = cleanText(x.videoUrl);
    const imageUrl = cleanText(x.imageUrl);
    const animationKey = cleanText(x.animationKey);

    // If already exists, optionally backfill missing fields
    const existing = existingByNorm.get(norm);
    if (existing) {
      skippedExisting++;

      const patch: any = {};

            // Only fill if missing/empty
            if (!cleanText((existing as any).movementPattern) && movementPattern) {
              patch.movementPattern = movementPattern;
            }
            if (!cleanText((existing as any).strengthSignalRole) && strengthSignalRole) {
              patch.strengthSignalRole = strengthSignalRole;
            }
      
            if (!cleanText((existing as any).summary) && summary) patch.summary = summary;
      if (!cleanText((existing as any).directions) && directions) patch.directions = directions;

      // Prefer split cues if present in seed
      const exSetup = (existing as any).cuesSetup;
      const exExec = (existing as any).cuesExecution;

      const hasSetup = isNonEmptyStringArray(exSetup);
      const hasExec = isNonEmptyStringArray(exExec);

      if (!hasSetup && cuesSetup && cuesSetup.length) patch.cuesSetup = cuesSetup;
      if (!hasExec && cuesExecution && cuesExecution.length) patch.cuesExecution = cuesExecution;

      // If no split cues provided but legacy exists, backfill legacy into execution
      const willHaveSplitAfterPatch =
        (Array.isArray(patch.cuesSetup) && patch.cuesSetup.length > 0) ||
        (Array.isArray(patch.cuesExecution) && patch.cuesExecution.length > 0);

      const stillNoSplit = !willHaveSplitAfterPatch && !hasSetup && !hasExec;

      if (stillNoSplit && cuesLegacy && cuesLegacy.length) {
        patch.cuesSetup = patch.cuesSetup ?? [];
        patch.cuesExecution = patch.cuesExecution ?? cuesLegacy;
      }

      if (!isNonEmptyStringArray((existing as any).commonMistakes) && commonMistakes && commonMistakes.length) {
        patch.commonMistakes = commonMistakes;
      }

      if (!cleanText((existing as any).videoUrl) && videoUrl) patch.videoUrl = videoUrl;
      if (!cleanText((existing as any).imageUrl) && imageUrl) patch.imageUrl = imageUrl;
      if (!cleanText((existing as any).animationKey) && animationKey) patch.animationKey = animationKey;

      // NOTE: We intentionally do NOT overwrite equipment/bodyPart/category/etc.
      // Those can be edited by you in the Exercises UI.

      if (Object.keys(patch).length) {
        patch.updatedAt = now;
        await db.exercises.update(existing.id, patch);
        updated++;
      }

      continue;
    }

    // Otherwise create new row
    toAdd.push({
      id: uuid(),
      name: x.name,
      normalizedName: norm,

            equipmentTags: Array.isArray(x.equipmentTags) ? x.equipmentTags : [],
            bodyPart: asBodyPart(x.bodyPart),
            category: asCategory(x.category),
            equipment: asEquipment(x.equipment),
            aliases: Array.isArray(x.aliases) ? x.aliases : [],
      
            movementPattern,
            strengthSignalRole,
      
            summary,
      directions,

      // ✅ Option B (split cues)
      cuesSetup: cuesSetup ?? [],
      cuesExecution: cuesExecution ?? (cuesLegacy ?? []),

      // ✅ Legacy cues: do NOT store on new rows (avoids schema mismatch if Exercise.cues was removed)
      // cues: cuesLegacy ?? undefined,

      commonMistakes: commonMistakes ?? undefined,

      videoUrl,
      imageUrl,
      animationKey,

      createdAt: now,
      updatedAt: now,
    } as any);
  }

  if (toAdd.length) {
    await db.exercises.bulkAdd(toAdd);
  }

  return {
    added: toAdd.length,
    skippedExisting,
    skippedDuplicateInSeed,
    skippedInvalid,
    updated,
    existingBefore: existingArr.length,
    seedCount: raw.length,
  };
}

export async function seedExercisesIfEmpty(): Promise<SeedExercisesResult> {
  const existingBefore = await db.exercises.count();
  if (existingBefore > 0) {
    return {
      added: 0,
      skippedExisting: 0,
      skippedDuplicateInSeed: 0,
      skippedInvalid: 0,
      updated: 0,
      existingBefore,
      seedCount: Array.isArray(exercisesSeed) ? (exercisesSeed as any[]).length : 0,
    };
  }
  return seedExercises();
}