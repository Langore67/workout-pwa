// db.ts
/* ============================================================================
   WorkoutDB (Dexie) — versioned schema + domain models
   ----------------------------------------------------------------------------
   Version history
   - v1  Initial schema: exercises, tracks, templates, templateItems, sessions, sets, walks
   - v2  Add trackPrs table
   - v3  Add folders + template.folderId
   - v4  Add archive + manual order + templates.lastPerformedAt; upgrade null->undefined
   - v5  Add exercises.&normalizedName unique index + ExerciseVariants table + variantId on tracks;
         safe auto-merge duplicates; normalize nulls; backfill normalizedName, updatedAt, equipment guess
   - v6  (Schema truth + future-safe fields)
         * Widen SetType to include "drop" + "failure" (matches GymPage)
         * Add SetEntry.completedAt (official field; used already by GymPage)
         * Reserve TemplateItem grouping fields for supersets (optional, no UI yet)
         * Add indexes for sets.completedAt + templateItems.groupId (optional convenience)
   - v7  Split coaching cues into cuesSetup + cuesExecution on Exercises + ExerciseVariants;
         migrate legacy cues[] -> cuesExecution[] when split cues are missing
   - v8  Add sessionItems table (per-session ordering/notes; used by SessionDetailPage)
   - v9  Add bodyMetrics table (Hume Body Pod snapshots; sparse/optional fields)
   - v10 Add Exercise.metricMode ("reps" | "distance" | "time") + SetEntry distance fields
   ============================================================================

   NOTE (v8):
   SessionDetailPage references db.sessionItems. Prior schemas (<=v7) did not
   include this table, causing runtime crashes ("Cannot read ... where").
   This file adds the SessionItem model + Dexie table + a v8 schema.
*/

/* ============================================================
   00) Imports + shared types
   ============================================================ */
import Dexie, { Table } from "dexie";

export type UUID = string;

export type TrackType = "strength" | "hypertrophy" | "corrective";

/**
 * NOTE:
 * v6 widens SetType to match GymPage behavior.
 * Keep it small; additional patterns (backoff/amrap/etc.) can be modeled later
 * either as new values or via tags/metadata.
 */
export type SetType = "warmup" | "working" | "drop" | "failure";

export type TrackingMode = "weightedReps" | "repsOnly" | "timeSeconds" | "checkbox" | "breaths";

/**
 * v10: Exercise-level primary metric.
 * - reps: typical strength/hypertrophy
 * - distance: carries/sled/treadmill, etc.
 * - time: planks/cardio intervals/holds, etc.
 */
export type MetricMode = "reps" | "distance" | "time";

// Strong-like metadata (optional taxonomy)
export type BodyPart =
  | "Chest"
  | "Back"
  | "Legs"
  | "Shoulders"
  | "Arms"
  | "Core"
  | "Full Body"
  | "Cardio"
  | "Other";

export type ExerciseCategory =
  | "Strength"
  | "Machine"
  | "Bodyweight"
  | "Cardio"
  | "Mobility"
  | "Warmup"
  | "Other";

export type Equipment =
  | "Barbell"
  | "Dumbbell"
  | "Cable"
  | "Machine"
  | "Bodyweight"
  | "Kettlebell"
  | "Band"
  | "Other";

/* ============================================================
   00b) Helpers
   ============================================================ */
export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function shortId(id: string): string {
  // cheap + deterministic (good enough for uniqueness suffix)
  return (id || "").replace(/[^a-z0-9]/gi, "").slice(-6).toLowerCase() || "id";
}

function guessEquipmentFromTags(tags: string[]): Equipment | undefined {
  const t = (tags || []).map((x) => normalizeName(x));
  if (t.some((x) => x.includes("barbell") || x === "bb")) return "Barbell";
  if (t.some((x) => x.includes("dumbbell") || x === "db")) return "Dumbbell";
  if (t.some((x) => x.includes("cable"))) return "Cable";
  if (t.some((x) => x.includes("machine"))) return "Machine";
  if (t.some((x) => x.includes("kettlebell") || x === "kb")) return "Kettlebell";
  if (t.some((x) => x.includes("band"))) return "Band";
  if (t.some((x) => x.includes("bodyweight") || x.includes("bw"))) return "Bodyweight";
  return undefined;
}

/* ============================================================
   01) Core domain models
   ============================================================ */
export interface Exercise {
  id: UUID;

  /** Canonical display name */
  name: string;

  /** Case-insensitive uniqueness + search/sort key */
  normalizedName: string;

  bodyPart?: BodyPart;
  category?: ExerciseCategory;
  equipment?: Equipment;

  /**
   * v10: Primary metric for this exercise.
   * Default behavior if missing/invalid: "reps"
   */
  metricMode?: "reps" | "distance" | "time";

  /** Keep tags (multi-equipment or user tagging) */
  equipmentTags: string[];

  /** Coaching */
  summary?: string; // 1–2 lines: what/why
  directions?: string; // step-by-step

  /**
   * v7+ (preferred): split cues
   * - cuesSetup: how to set up (stance/grip/brace)
   * - cuesExecution: how to perform (path/tempo/ROM)
   */
  cuesSetup?: string[];
  cuesExecution?: string[];

  /**
   * Legacy (pre-v7): short bullets (deprecated).
   * Kept for safe migrations + backward compatibility.
   */
  cues?: string[];

  commonMistakes?: string[];

  /** Media placeholders */
  videoUrl?: string;
  animationKey?: string;
  imageUrl?: string;

  /** Dedupe/merge support */
  aliases?: string[];
  mergedIntoExerciseId?: UUID;
  mergeNote?: string;

  archivedAt?: number;

  createdAt: number;
  updatedAt?: number;
}

export interface ExerciseVariant {
  id: UUID;
  exerciseId: UUID;

  name: string;
  normalizedName: string;

  /** Variant-specific coaching */
  directions?: string;

  /** v7+ (preferred): split cues */
  cuesSetup?: string[];
  cuesExecution?: string[];

  /** Legacy (pre-v7): short bullets (deprecated) */
  cues?: string[];

  /** Media placeholders */
  videoUrl?: string;
  animationKey?: string;

  /** Dedupe/merge support */
  aliases?: string[];
  mergedIntoVariantId?: UUID;
  mergeNote?: string;

  archivedAt?: number;

  createdAt: number;
  updatedAt?: number;
}

export interface Track {
  id: UUID;

  /** Keep for easy querying */
  exerciseId: UUID;

  /** Optional variant under the exercise (wide/narrow/paused/etc.) */
  variantId?: UUID;

  trackType: TrackType;
  displayName: string;
  trackingMode: TrackingMode;

  warmupSetsDefault: number;
  workingSetsDefault: number;
  repMin: number;
  repMax: number;
  restSecondsDefault: number;
  rirTargetMin?: number;
  rirTargetMax?: number;
  weightJumpDefault: number;

  /**
   * (Reserved for future)
   * Track-level scheme/pattern configuration (straight/pyramid/rest-pause/etc.)
   * Not indexed; safe to add later in UI.
   */
  schemeJson?: string;

  /**
   * (Reserved for future)
   * Track-level user cues override (variant/personal cues).
   */
  cuesOverride?: string[];

  createdAt: number;
}

/* ============================================================
   02) Templates + folders (Strong-style grouping + admin bay)
   ============================================================ */
export interface Folder {
  id: UUID;
  name: string;

  /** Manual ordering */
  orderIndex: number;

  /** Soft-archive folders */
  archivedAt?: number;

  createdAt: number;
}

export interface Template {
  id: UUID;
  name: string;
  createdAt: number;

  folderId?: UUID;

  archivedAt?: number;
  orderIndex?: number;

  /** LRU sort support */
  lastPerformedAt?: number;
}

export interface TemplateItem {
  id: UUID;
  templateId: UUID;
  orderIndex: number;
  trackId: UUID;
  notes?: string;

  warmupSetsOverride?: number;
  workingSetsOverride?: number;
  repMinOverride?: number;
  repMaxOverride?: number;

  /**
   * v6 (Reserved): grouping to support supersets/circuits later.
   * - groupId: items with same groupId are grouped
   * - groupType: "superset" for now (later expand)
   * - groupOrder: A/B/C ordering (1..n)
   * - inGroupOrder: ordering within the group (1..m)
   */
  groupId?: UUID;
  groupType?: "superset";
  groupOrder?: number;
  inGroupOrder?: number;

  /**
   * (Reserved for future): per-template scheme override.
   */
  schemeOverrideJson?: string;

  createdAt: number;
}

/* ============================================================
   03) Session logging + sets + walks + PR store
   ============================================================ */
export interface Session {
  id: UUID;
  templateId?: UUID;
  templateName?: string;
  startedAt: number;
  endedAt?: number;
  notes?: string;

  /** JSON string of PR hits for this session (computed on finish). */
  prsJson?: string;
}

/**
 * v8 (NEW):
 * SessionItem = per-session ordering/notes for tracks.
 * This is used by SessionDetailPage for imported sessions and for future features
 * like reordering within a session independent of a template.
 */
export interface SessionItem {
  id: UUID;
  sessionId: UUID;
  orderIndex: number;
  trackId: UUID;
  notes?: string;
  createdAt: number;
}

export interface SetEntry {
  id: UUID;
  sessionId: UUID;
  trackId: UUID;
  createdAt: number;
  setType: SetType;

  weight?: number;
  reps?: number;

  /**
   * TIME metric (already used in the app).
   * Keep as canonical "time" field (seconds).
   */
  seconds?: number;

  /**
   * v10: DISTANCE metric (carries/sled/treadmill, etc.)
   * - distance: numeric distance value
   * - distanceUnit: "m" or "steps" (UI can convert as needed)
   */
  distance?: number;
  distanceUnit?: "m" | "steps";

  rir?: number;
  notes?: string;

  /**
   * v6: official completion field (GymPage already uses it).
   * If undefined: not completed.
   */
  completedAt?: number;
}

/**
 * v9 (NEW):
 * BodyMetricEntry = sparse snapshots from Hume Body Pod (or manual entry).
 * All metrics are optional to avoid bottlenecks.
 */
export interface BodyMetricEntry {
  id: UUID;

  /** Timestamp of measurement (ms since epoch) */
  measuredAt: number;

  /** All fields optional (sparse) */
  weightLb?: number;
  bodyFatPct?: number;
  skeletalMuscleMassLb?: number;
  visceralFatIndex?: number;
  bodyWaterPct?: number;

  /** Optional note: fasted / post-workout / evening, etc. */
  notes?: string;

  createdAt: number;
}

export interface WalkEntry {
  id: UUID;
  date: number;
  durationSeconds: number;
  distanceMiles?: number;
  steps?: number;
  notes?: string;
}

export interface TrackPRs {
  /** primary key = trackId */
  trackId: UUID;
  updatedAt: number;

  // Best single-set volume: weight * reps
  bestVolumeValue?: number;
  bestVolumeWeight?: number;
  bestVolumeReps?: number;
  bestVolumeAt?: number;
  bestVolumeSessionId?: UUID;

  // Best weight: highest working-set weight (tie-breaker by reps)
  bestWeightValue?: number;
  bestWeightReps?: number;
  bestWeightAt?: number;
  bestWeightSessionId?: UUID;

  // Best e1RM (Epley), eligible only when reps <= 12
  bestE1RMValue?: number;
  bestE1RMWeight?: number;
  bestE1RMReps?: number;
  bestE1RMAt?: number;
  bestE1RMSessionId?: UUID;
}

/* ============================================================
   04) Dexie DB class + versioned schema
   ============================================================ */
export class WorkoutDB extends Dexie {
  exercises!: Table<Exercise, UUID>;
  exerciseVariants!: Table<ExerciseVariant, UUID>;
  tracks!: Table<Track, UUID>;
  folders!: Table<Folder, UUID>;
  templates!: Table<Template, UUID>;
  templateItems!: Table<TemplateItem, UUID>;
  sessions!: Table<Session, UUID>;

  // ✅ v8 (NEW)
  sessionItems!: Table<SessionItem, UUID>;

  sets!: Table<SetEntry, UUID>;
  walks!: Table<WalkEntry, UUID>;
  trackPrs!: Table<TrackPRs, UUID>;

  // ✅ v9 (NEW)
  bodyMetrics!: Table<BodyMetricEntry, UUID>;

  constructor() {
    super("workout_mvp_db");

    // --------------------------------------------------------
    // v1
    // --------------------------------------------------------
    this.version(1).stores({
      exercises: "id, name, createdAt",
      tracks: "id, exerciseId, trackType, displayName, createdAt",
      templates: "id, name, createdAt",
      templateItems: "id, templateId, orderIndex, trackId, createdAt",
      sessions: "id, startedAt, endedAt, templateId",
      sets: "id, sessionId, trackId, createdAt, setType",
      walks: "id, date",
    });

    // --------------------------------------------------------
    // v2
    // --------------------------------------------------------
    this.version(2).stores({
      exercises: "id, name, createdAt",
      tracks: "id, exerciseId, trackType, displayName, createdAt",
      templates: "id, name, createdAt",
      templateItems: "id, templateId, orderIndex, trackId, createdAt",
      sessions: "id, startedAt, endedAt, templateId",
      sets: "id, sessionId, trackId, createdAt, setType",
      walks: "id, date",
      trackPrs: "trackId, updatedAt",
    });

    // --------------------------------------------------------
    // v3 (NEW): folders + template.folderId
    // --------------------------------------------------------
    this.version(3).stores({
      exercises: "id, name, createdAt",
      tracks: "id, exerciseId, trackType, displayName, createdAt",

      folders: "id, orderIndex, name, createdAt",
      templates: "id, name, createdAt, folderId",

      templateItems: "id, templateId, orderIndex, trackId, createdAt",
      sessions: "id, startedAt, endedAt, templateId",
      sets: "id, sessionId, trackId, createdAt, setType",
      walks: "id, date",
      trackPrs: "trackId, updatedAt",
    });

    // --------------------------------------------------------
    // v4 (NEW): archive + manual order + (optional) lastPerformedAt
    // --------------------------------------------------------
    this.version(4)
      .stores({
        exercises: "id, name, createdAt",
        tracks: "id, exerciseId, trackType, displayName, createdAt",

        folders: "id, orderIndex, name, archivedAt, createdAt",

        templates: "id, name, createdAt, folderId, archivedAt, orderIndex, lastPerformedAt",

        templateItems: "id, templateId, orderIndex, trackId, createdAt",
        sessions: "id, startedAt, endedAt, templateId",
        sets: "id, sessionId, trackId, createdAt, setType",
        walks: "id, date",
        trackPrs: "trackId, updatedAt",
      })
      .upgrade(async (tx) => {
        // Normalize any legacy/null-ish values to undefined.
        await tx.table("templates").toCollection().modify((t: any) => {
          if (t.folderId === null) t.folderId = undefined;
          if (t.archivedAt === null) t.archivedAt = undefined;
          if (t.orderIndex === null) t.orderIndex = undefined;
          if (t.lastPerformedAt === null) t.lastPerformedAt = undefined;
        });

        await tx.table("folders").toCollection().modify((f: any) => {
          if (f.archivedAt === null) f.archivedAt = undefined;
        });
      });

    // --------------------------------------------------------
    // v5 (NEW):
    // - Exercises gain &normalizedName unique index for case-insensitive uniqueness
    // - ExerciseVariants table added (unique per exercise via [exerciseId+normalizedName])
    // - Tracks index variantId (optional)
    // - Migration safely auto-merges duplicates
    // --------------------------------------------------------
    this.version(5)
      .stores({
        // Include BOTH normalizedName unique + name index to avoid SchemaError if any code does orderBy("name")
        exercises:
          "id, &normalizedName, name, bodyPart, category, equipment, archivedAt, mergedIntoExerciseId, createdAt",

        exerciseVariants:
          "id, exerciseId, [exerciseId+normalizedName], name, archivedAt, mergedIntoVariantId, createdAt",

        tracks: "id, exerciseId, variantId, trackType, displayName, createdAt",

        folders: "id, orderIndex, name, archivedAt, createdAt",
        templates: "id, name, createdAt, folderId, archivedAt, orderIndex, lastPerformedAt",
        templateItems: "id, templateId, orderIndex, trackId, createdAt",
        sessions: "id, startedAt, endedAt, templateId",
        sets: "id, sessionId, trackId, createdAt, setType",
        walks: "id, date",
        trackPrs: "trackId, updatedAt",
      })
      .upgrade(async (tx) => {
        const now = Date.now();
        const exTable = tx.table("exercises");

        const all: any[] = await exTable.toArray();

        function safeNormFor(e: any) {
          const raw = typeof e?.name === "string" ? e.name : "";
          const norm = normalizeName(raw);
          return norm || `__unnamed__${shortId(e?.id)}`;
        }

        // Canonical per normalizedName (oldest createdAt wins)
        const byNorm = new Map<string, { canonicalId: UUID; canonicalCreatedAt: number }>();

        for (const e of all) {
          const norm = safeNormFor(e);
          const createdAt = typeof e.createdAt === "number" ? e.createdAt : now;

          const cur = byNorm.get(norm);
          if (!cur) byNorm.set(norm, { canonicalId: e.id, canonicalCreatedAt: createdAt });
          else if (createdAt < cur.canonicalCreatedAt)
            byNorm.set(norm, { canonicalId: e.id, canonicalCreatedAt: createdAt });
        }

        await exTable.toCollection().modify((e: any) => {
          // Normalize null-ish
          if (e.archivedAt === null) e.archivedAt = undefined;
          if (e.mergedIntoExerciseId === null) e.mergedIntoExerciseId = undefined;
          if (e.aliases === null) e.aliases = undefined;

          if (!Array.isArray(e.equipmentTags)) e.equipmentTags = [];

          const norm = safeNormFor(e);
          const canonical = byNorm.get(norm);

          // Backfills
          e.normalizedName = norm;
          if (e.updatedAt == null) e.updatedAt = e.createdAt ?? now;

          if (e.equipment == null) {
            const guessed = guessEquipmentFromTags(e.equipmentTags);
            if (guessed) e.equipment = guessed;
          }

          // Duplicate (not canonical): mark merged+archived and suffix normalizedName to satisfy &unique
          if (canonical && e.id !== canonical.canonicalId) {
            e.mergedIntoExerciseId = canonical.canonicalId;
            e.archivedAt = e.archivedAt ?? now;
            e.mergeNote = e.mergeNote ?? "Auto-merged duplicate during v5 upgrade";
            e.normalizedName = `${norm}__dup__${shortId(e.id)}`;
          }
        });

        // Tracks: normalize null-ish variantId
        await tx.table("tracks").toCollection().modify((t: any) => {
          if (t.variantId === null) t.variantId = undefined;
        });

        // Templates/Folders: keep v4 guardrails
        await tx.table("templates").toCollection().modify((t: any) => {
          if (t.folderId === null) t.folderId = undefined;
          if (t.archivedAt === null) t.archivedAt = undefined;
          if (t.orderIndex === null) t.orderIndex = undefined;
          if (t.lastPerformedAt === null) t.lastPerformedAt = undefined;
        });

        await tx.table("folders").toCollection().modify((f: any) => {
          if (f.archivedAt === null) f.archivedAt = undefined;
        });
      });

    // --------------------------------------------------------
    // v6 (NEW):
    // - Schema truth for set types + completion
    // - Reserve TemplateItem grouping fields for supersets
    // - Add indexes: sets.completedAt, templateItems.groupId
    // --------------------------------------------------------
    this.version(6)
      .stores({
        exercises:
          "id, &normalizedName, name, bodyPart, category, equipment, archivedAt, mergedIntoExerciseId, createdAt",

        exerciseVariants:
          "id, exerciseId, [exerciseId+normalizedName], name, archivedAt, mergedIntoVariantId, createdAt",

        // (Indexes unchanged; additional fields like schemeJson/cuesOverride are not indexed)
        tracks: "id, exerciseId, variantId, trackType, displayName, createdAt",

        folders: "id, orderIndex, name, archivedAt, createdAt",
        templates: "id, name, createdAt, folderId, archivedAt, orderIndex, lastPerformedAt",

        // Add groupId index (group fields are optional + not required by UI yet)
        templateItems: "id, templateId, orderIndex, trackId, groupId, createdAt",

        sessions: "id, startedAt, endedAt, templateId",

        // Add completedAt index (optional convenience; no behavior change required)
        sets: "id, sessionId, trackId, createdAt, setType, completedAt",

        walks: "id, date",
        trackPrs: "trackId, updatedAt",
      })
      .upgrade(async (tx) => {
        // Normalize null-ish values for new v6 fields, and sanitize any legacy setType.
        await tx.table("sets").toCollection().modify((s: any) => {
          if (s.completedAt === null) s.completedAt = undefined;

          // Some legacy rows may have setType null/undefined.
          if (s.setType === null || s.setType === undefined || s.setType === "") {
            s.setType = "working";
          }

          // If any unexpected values exist, keep them but coerce to "working" to stay safe.
          const st = String(s.setType);
          const ok = st === "warmup" || st === "working" || st === "drop" || st === "failure";
          if (!ok) s.setType = "working";
        });

        await tx.table("templateItems").toCollection().modify((it: any) => {
          if (it.groupId === null) it.groupId = undefined;
          if (it.groupType === null) it.groupType = undefined;
          if (it.groupOrder === null) it.groupOrder = undefined;
          if (it.inGroupOrder === null) it.inGroupOrder = undefined;
          if (it.schemeOverrideJson === null) it.schemeOverrideJson = undefined;
        });

        // Tracks: normalize reserved fields if they were ever written as null
        await tx.table("tracks").toCollection().modify((t: any) => {
          if (t.schemeJson === null) t.schemeJson = undefined;
          if (t.cuesOverride === null) t.cuesOverride = undefined;
        });
      });

    // --------------------------------------------------------
    // v7 (NEW):
    // - Exercise + Variant split cues: cuesSetup / cuesExecution
    // - Backfill + normalize null-ish
    // - Migrate legacy cues[] -> cuesExecution[] when split cues are missing
    // --------------------------------------------------------
    this.version(7)
      .stores({
        exercises:
          "id, &normalizedName, name, bodyPart, category, equipment, archivedAt, mergedIntoExerciseId, createdAt",

        exerciseVariants:
          "id, exerciseId, [exerciseId+normalizedName], name, archivedAt, mergedIntoVariantId, createdAt",

        tracks: "id, exerciseId, variantId, trackType, displayName, createdAt",

        folders: "id, orderIndex, name, archivedAt, createdAt",
        templates: "id, name, createdAt, folderId, archivedAt, orderIndex, lastPerformedAt",
        templateItems: "id, templateId, orderIndex, trackId, groupId, createdAt",
        sessions: "id, startedAt, endedAt, templateId",
        sets: "id, sessionId, trackId, createdAt, setType, completedAt",
        walks: "id, date",
        trackPrs: "trackId, updatedAt",
      })
      .upgrade(async (tx) => {
        // --------------------------
        // Exercises: normalize + migrate
        // --------------------------
        await tx.table("exercises").toCollection().modify((e: any) => {
          // normalize null-ish
          if (e.summary === null) e.summary = undefined;
          if (e.directions === null) e.directions = undefined;
          if (e.videoUrl === null) e.videoUrl = undefined;
          if (e.imageUrl === null) e.imageUrl = undefined;
          if (e.animationKey === null) e.animationKey = undefined;
          if (e.commonMistakes === null) e.commonMistakes = undefined;

          // NEW split cues fields
          if (e.cuesSetup === null) e.cuesSetup = undefined;
          if (e.cuesExecution === null) e.cuesExecution = undefined;

          // legacy cues (if present)
          if (e.cues === null) e.cues = undefined;

          // ensure arrays are arrays if present
          if (e.cuesSetup !== undefined && !Array.isArray(e.cuesSetup)) e.cuesSetup = [];
          if (e.cuesExecution !== undefined && !Array.isArray(e.cuesExecution)) e.cuesExecution = [];
          if (e.cues !== undefined && !Array.isArray(e.cues)) e.cues = [];
          if (e.commonMistakes !== undefined && !Array.isArray(e.commonMistakes)) e.commonMistakes = [];

          // migrate legacy cues -> cuesExecution (only if split cues are missing/empty)
          const hasSplit =
            (Array.isArray(e.cuesSetup) && e.cuesSetup.length > 0) ||
            (Array.isArray(e.cuesExecution) && e.cuesExecution.length > 0);

          if (!hasSplit && Array.isArray(e.cues) && e.cues.length > 0) {
            e.cuesSetup = e.cuesSetup ?? [];
            e.cuesExecution = e.cuesExecution ?? e.cues.slice();
          }
        });

        // --------------------------
        // ExerciseVariants: normalize + migrate
        // --------------------------
        await tx.table("exerciseVariants").toCollection().modify((v: any) => {
          if (v.directions === null) v.directions = undefined;
          if (v.videoUrl === null) v.videoUrl = undefined;
          if (v.animationKey === null) v.animationKey = undefined;

          if (v.cuesSetup === null) v.cuesSetup = undefined;
          if (v.cuesExecution === null) v.cuesExecution = undefined;

          if (v.cues === null) v.cues = undefined;

          if (v.cuesSetup !== undefined && !Array.isArray(v.cuesSetup)) v.cuesSetup = [];
          if (v.cuesExecution !== undefined && !Array.isArray(v.cuesExecution)) v.cuesExecution = [];
          if (v.cues !== undefined && !Array.isArray(v.cues)) v.cues = [];

          const hasSplit =
            (Array.isArray(v.cuesSetup) && v.cuesSetup.length > 0) ||
            (Array.isArray(v.cuesExecution) && v.cuesExecution.length > 0);

          if (!hasSplit && Array.isArray(v.cues) && v.cues.length > 0) {
            v.cuesSetup = v.cuesSetup ?? [];
            v.cuesExecution = v.cuesExecution ?? v.cues.slice();
          }
        });

        // Keep v6 null-normalizations for reserved track fields (safe)
        await tx.table("tracks").toCollection().modify((t: any) => {
          if (t.schemeJson === null) t.schemeJson = undefined;
          if (t.cuesOverride === null) t.cuesOverride = undefined;
        });
      });

    // --------------------------------------------------------
    // v8 (NEW):
    // - Add sessionItems table (per-session ordering/notes; used by SessionDetailPage)
    // --------------------------------------------------------
    this.version(8).stores({
      exercises:
        "id, &normalizedName, name, bodyPart, category, equipment, archivedAt, mergedIntoExerciseId, createdAt",

      exerciseVariants:
        "id, exerciseId, [exerciseId+normalizedName], name, archivedAt, mergedIntoVariantId, createdAt",

      tracks: "id, exerciseId, variantId, trackType, displayName, createdAt",

      folders: "id, orderIndex, name, archivedAt, createdAt",
      templates: "id, name, createdAt, folderId, archivedAt, orderIndex, lastPerformedAt",
      templateItems: "id, templateId, orderIndex, trackId, groupId, createdAt",

      sessions: "id, startedAt, endedAt, templateId",

      // ✅ NEW
      sessionItems: "id, sessionId, orderIndex, trackId, createdAt",

      sets: "id, sessionId, trackId, createdAt, setType, completedAt",
      walks: "id, date",
      trackPrs: "trackId, updatedAt",
    });

    // --------------------------------------------------------
    // v9 (NEW):
    // - Add bodyMetrics table (sparse Hume Body Pod snapshots)
    // --------------------------------------------------------
    this.version(9)
      .stores({
        exercises:
          "id, &normalizedName, name, bodyPart, category, equipment, archivedAt, mergedIntoExerciseId, createdAt",

        exerciseVariants:
          "id, exerciseId, [exerciseId+normalizedName], name, archivedAt, mergedIntoVariantId, createdAt",

        tracks: "id, exerciseId, variantId, trackType, displayName, createdAt",

        folders: "id, orderIndex, name, archivedAt, createdAt",
        templates: "id, name, createdAt, folderId, archivedAt, orderIndex, lastPerformedAt",
        templateItems: "id, templateId, orderIndex, trackId, groupId, createdAt",

        sessions: "id, startedAt, endedAt, templateId",

        sessionItems: "id, sessionId, orderIndex, trackId, createdAt",

        sets: "id, sessionId, trackId, createdAt, setType, completedAt",
        walks: "id, date",
        trackPrs: "trackId, updatedAt",

        // ✅ NEW (indexes favor time-series queries)
        // - measuredAt index for range queries
        // - createdAt for debug/admin, optional
        bodyMetrics:
          "id, measuredAt, createdAt, weightLb, bodyFatPct, skeletalMuscleMassLb, visceralFatIndex, bodyWaterPct",
      })
      .upgrade(async (tx) => {
        // Nothing required, but normalize any null-ish fields to undefined (future-safe).
        await tx.table("bodyMetrics").toCollection().modify((m: any) => {
          if (m.weightLb === null) m.weightLb = undefined;
          if (m.bodyFatPct === null) m.bodyFatPct = undefined;
          if (m.skeletalMuscleMassLb === null) m.skeletalMuscleMassLb = undefined;
          if (m.visceralFatIndex === null) m.visceralFatIndex = undefined;
          if (m.bodyWaterPct === null) m.bodyWaterPct = undefined;
          if (m.notes === null) m.notes = undefined;
          if (m.measuredAt === null) m.measuredAt = undefined;
          if (m.createdAt === null) m.createdAt = undefined;
        });
      });

    // --------------------------------------------------------
    // v10 (NEW):
    // - Exercise.metricMode ("reps" | "distance" | "time")
    // - SetEntry distance + distanceUnit
    // --------------------------------------------------------
    // --------------------------------------------------------
    // v10 (NEW):
    // --------------------------------------------------------
    this.version(10)
      .stores({
        exercises:
          "id, &normalizedName, name, bodyPart, category, equipment, archivedAt, mergedIntoExerciseId, createdAt",
        exerciseVariants:
          "id, exerciseId, [exerciseId+normalizedName], name, archivedAt, mergedIntoVariantId, createdAt",
        tracks: "id, exerciseId, variantId, trackType, displayName, createdAt",
        folders: "id, orderIndex, name, archivedAt, createdAt",
        templates: "id, name, createdAt, folderId, archivedAt, orderIndex, lastPerformedAt",
        templateItems: "id, templateId, orderIndex, trackId, groupId, createdAt",
        sessions: "id, startedAt, endedAt, templateId",
        sessionItems: "id, sessionId, orderIndex, trackId, createdAt",
        sets: "id, sessionId, trackId, createdAt, setType, completedAt",
        walks: "id, date",
        trackPrs: "trackId, updatedAt",
        bodyMetrics:
          "id, measuredAt, createdAt, weightLb, bodyFatPct, skeletalMuscleMassLb, visceralFatIndex, bodyWaterPct",
      })
      .upgrade(async (tx) => {
        await tx.table("exercises").toCollection().modify((e: any) => {
          if (e.metricMode === null) e.metricMode = undefined;
    
          // Only coerce when present and invalid (keeps field sparse)
          if (e.metricMode !== undefined) {
            const mm = e.metricMode;
            const ok = mm === "reps" || mm === "distance" || mm === "time";
            if (!ok) e.metricMode = "reps";
          }
        });
    
        await tx.table("sets").toCollection().modify((s: any) => {
          if (s.distance === null) s.distance = undefined;
          if (s.distanceUnit === null) s.distanceUnit = undefined;
    
          // If unit exists but distance is not a valid number, clear both.
          if (s.distanceUnit) {
            const d = s.distance;
            if (d === undefined || d === null || !Number.isFinite(Number(d))) {
              s.distance = undefined;
              s.distanceUnit = undefined;
            }
          }
    
          if (s.seconds !== undefined && s.seconds !== null && !Number.isFinite(Number(s.seconds))) {
            s.seconds = undefined;
          }
        });
      });
      
  // --------------------------------------------------------
// v11 (NEW):
// - Add bodyMetrics.takenAt index for BodyPage/Strength compatibility
// - Backfill takenAt <-> measuredAt so either can be used safely
// --------------------------------------------------------
this.version(11)
  .stores({
    exercises:
      "id, &normalizedName, name, bodyPart, category, equipment, archivedAt, mergedIntoExerciseId, createdAt",

    exerciseVariants:
      "id, exerciseId, [exerciseId+normalizedName], name, archivedAt, mergedIntoVariantId, createdAt",

    tracks: "id, exerciseId, variantId, trackType, displayName, createdAt",

    folders: "id, orderIndex, name, archivedAt, createdAt",
    templates: "id, name, createdAt, folderId, archivedAt, orderIndex, lastPerformedAt",
    templateItems: "id, templateId, orderIndex, trackId, groupId, createdAt",

    sessions: "id, startedAt, endedAt, templateId",
    sessionItems: "id, sessionId, orderIndex, trackId, createdAt",

    sets: "id, sessionId, trackId, createdAt, setType, completedAt",

    walks: "id, date",
    trackPrs: "trackId, updatedAt",

    // ✅ add takenAt to indexes
    bodyMetrics:
      "id, measuredAt, takenAt, createdAt, weightLb, bodyFatPct, skeletalMuscleMassLb, visceralFatIndex, bodyWaterPct",
  })
  .upgrade(async (tx) => {
    await tx.table("bodyMetrics").toCollection().modify((m: any) => {
      // normalize null-ish
      if (m.measuredAt === null) m.measuredAt = undefined;
      if (m.takenAt === null) m.takenAt = undefined;

      // Backfill both directions
      const measured = typeof m.measuredAt === "number" ? m.measuredAt : undefined;
      const taken = typeof m.takenAt === "number" ? m.takenAt : undefined;

      if (!taken && measured) m.takenAt = measured;
      if (!measured && taken) m.measuredAt = taken;

      // Keep createdAt sane
      if (m.createdAt === null) m.createdAt = undefined;
      if (m.createdAt === undefined) m.createdAt = m.measuredAt ?? m.takenAt ?? Date.now();
    });
  });          
  }
}

export const db = new WorkoutDB();

// ============================================================
// 05) E2E support: Playwright seeding/reset via window.__db
// ============================================================
declare global {
  interface Window {
    __db?: WorkoutDB;
  }
}

if (import.meta.env.DEV) {
  window.__db = db;
}