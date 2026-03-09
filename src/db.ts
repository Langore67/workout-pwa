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
   - v6  Add SetEntry.completedAt; widen SetType; reserve TemplateItem grouping fields
   - v7  Split coaching cues into cuesSetup + cuesExecution
   - v8  Add sessionItems table
   - v9  Add bodyMetrics table
   - v10 Add Exercise.metricMode + SetEntry distance fields
   - v11 Add bodyMetrics.takenAt index + backfill takenAt <-> measuredAt
   - v12 Add updatedAt + deletedAt to sessions/sets/walks and app_meta table
   - v13 Repair bad hypertrophy tracks saved as repsOnly -> weightedReps 
   - v14 Normalize corrective track trackingMode by exercise name heuristics
   - v15 Add appLogs table for import/export/restore/wipe/system events
   - v16 Add bodyMetrics.leanMassLb
   ============================================================================ */

import Dexie, { Table } from "dexie";

export type UUID = string;

export type TrackType = "strength" | "hypertrophy" | "corrective";
export type SetType = "warmup" | "working" | "drop" | "failure";
export type TrackingMode =
  | "weightedReps"
  | "repsOnly"
  | "timeSeconds"
  | "checkbox"
  | "breaths";

export type MetricMode = "reps" | "distance" | "time";

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
   Helpers
   ============================================================ */

export function normalizeName(name: string): string {
  return String(name || "")
    .toLowerCase()
    .replace(/[-_]/g, " ")   // treat hyphen/underscore as spaces
    .replace(/\s+/g, " ")    // collapse multiple spaces
    .trim();
}

function shortId(id: string): string {
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
   Core domain models
   ============================================================ */
export interface Exercise {
  id: UUID;
  name: string;
  normalizedName: string;

  bodyPart?: BodyPart;
  category?: ExerciseCategory;
  equipment?: Equipment;
  metricMode?: MetricMode;

  equipmentTags: string[];

  summary?: string;
  directions?: string;

  cuesSetup?: string[];
  cuesExecution?: string[];

  /** legacy */
  cues?: string[];

  commonMistakes?: string[];

  videoUrl?: string;
  animationKey?: string;
  imageUrl?: string;

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

  directions?: string;

  cuesSetup?: string[];
  cuesExecution?: string[];

  /** legacy */
  cues?: string[];

  videoUrl?: string;
  animationKey?: string;

  aliases?: string[];
  mergedIntoVariantId?: UUID;
  mergeNote?: string;

  archivedAt?: number;

  createdAt: number;
  updatedAt?: number;
}

export interface Track {
  id: UUID;
  exerciseId: UUID;
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

  schemeJson?: string;
  cuesOverride?: string[];

  createdAt: number;
}

export interface Folder {
  id: UUID;
  name: string;
  orderIndex: number;
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

  groupId?: UUID;
  groupType?: "superset";
  groupOrder?: number;
  inGroupOrder?: number;

  schemeOverrideJson?: string;

  createdAt: number;
}

export interface Session {
  id: UUID;
  templateId?: UUID;
  templateName?: string;
  startedAt: number;
  endedAt?: number;
  notes?: string;
  prsJson?: string;

  /** v12 */
  updatedAt?: number;
  deletedAt?: number;
}

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
  seconds?: number;

  distance?: number;
  distanceUnit?: "m" | "steps";

  rir?: number;
  notes?: string;
  completedAt?: number;

  /** v12 */
  updatedAt?: number;
  deletedAt?: number;
}

export interface BodyMetricEntry {
  id: UUID;

  /** canonical timestamp */
  measuredAt?: number;

  /** compatibility alias used by some pages */
  takenAt?: number;

  weightLb?: number;
  waistIn?: number;
  bodyFatPct?: number;
  leanMassLb?: number;
  skeletalMuscleMassLb?: number;
  visceralFatIndex?: number;
  bodyWaterPct?: number;
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

  /** v12 */
  updatedAt?: number;
  deletedAt?: number;
}

export interface TrackPRs {
  trackId: UUID;
  updatedAt: number;

  bestVolumeValue?: number;
  bestVolumeWeight?: number;
  bestVolumeReps?: number;
  bestVolumeAt?: number;
  bestVolumeSessionId?: UUID;

  bestWeightValue?: number;
  bestWeightReps?: number;
  bestWeightAt?: number;
  bestWeightSessionId?: UUID;

  bestE1RMValue?: number;
  bestE1RMWeight?: number;
  bestE1RMReps?: number;
  bestE1RMAt?: number;
  bestE1RMSessionId?: UUID;
}

export interface AppMeta {
  key: string;
  valueJson?: string;
  updatedAt: number;
}

export interface AppLogEntry {
  id: UUID;
  createdAt: number;
  type: "import" | "export" | "restore" | "wipe" | "system";
  level: "info" | "warn" | "error";
  message: string;
  detailsJson?: string;
}

/* ============================================================
   Dexie DB
   ============================================================ */
export class WorkoutDB extends Dexie {
  exercises!: Table<Exercise, UUID>;
  exerciseVariants!: Table<ExerciseVariant, UUID>;
  tracks!: Table<Track, UUID>;
  folders!: Table<Folder, UUID>;
  templates!: Table<Template, UUID>;
  templateItems!: Table<TemplateItem, UUID>;
  sessions!: Table<Session, UUID>;
  sessionItems!: Table<SessionItem, UUID>;
  sets!: Table<SetEntry, UUID>;
  walks!: Table<WalkEntry, UUID>;
  trackPrs!: Table<TrackPRs, UUID>;
  bodyMetrics!: Table<BodyMetricEntry, UUID>;
  app_meta!: Table<AppMeta, string>;
  appLogs!: Table<AppLogEntry, UUID>;

  constructor() {
    super("workout_mvp_db");

    // v1
    this.version(1).stores({
      exercises: "id, name, createdAt",
      tracks: "id, exerciseId, trackType, displayName, createdAt",
      templates: "id, name, createdAt",
      templateItems: "id, templateId, orderIndex, trackId, createdAt",
      sessions: "id, startedAt, endedAt, templateId",
      sets: "id, sessionId, trackId, createdAt, setType",
      walks: "id, date",
    });
    // ===== END OF v1 =====

    // v2
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
    // ===== END OF v2 =====

    // v3
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
    // ===== END OF v3 =====

    // v4
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
    // ===== END OF v4 =====

    // v5
    this.version(5)
      .stores({
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

        const byNorm = new Map<string, { canonicalId: UUID; canonicalCreatedAt: number }>();

        for (const e of all) {
          const norm = safeNormFor(e);
          const createdAt = typeof e.createdAt === "number" ? e.createdAt : now;
          const cur = byNorm.get(norm);

          if (!cur) {
            byNorm.set(norm, { canonicalId: e.id, canonicalCreatedAt: createdAt });
          } else if (createdAt < cur.canonicalCreatedAt) {
            byNorm.set(norm, { canonicalId: e.id, canonicalCreatedAt: createdAt });
          }
        }

        await exTable.toCollection().modify((e: any) => {
          if (e.archivedAt === null) e.archivedAt = undefined;
          if (e.mergedIntoExerciseId === null) e.mergedIntoExerciseId = undefined;
          if (e.aliases === null) e.aliases = undefined;

          if (!Array.isArray(e.equipmentTags)) e.equipmentTags = [];

          const norm = safeNormFor(e);
          const canonical = byNorm.get(norm);

          e.normalizedName = norm;
          if (e.updatedAt == null) e.updatedAt = e.createdAt ?? now;

          if (e.equipment == null) {
            const guessed = guessEquipmentFromTags(e.equipmentTags);
            if (guessed) e.equipment = guessed;
          }

          if (canonical && e.id !== canonical.canonicalId) {
            e.mergedIntoExerciseId = canonical.canonicalId;
            e.archivedAt = e.archivedAt ?? now;
            e.mergeNote = e.mergeNote ?? "Auto-merged duplicate during v5 upgrade";
            e.normalizedName = `${norm}__dup__${shortId(e.id)}`;
          }
        });

        await tx.table("tracks").toCollection().modify((t: any) => {
          if (t.variantId === null) t.variantId = undefined;
        });

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
    // ===== END OF v5 =====

    // v6
    this.version(6)
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
        await tx.table("sets").toCollection().modify((s: any) => {
          if (s.completedAt === null) s.completedAt = undefined;

          if (s.setType === null || s.setType === undefined || s.setType === "") {
            s.setType = "working";
          }

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

        await tx.table("tracks").toCollection().modify((t: any) => {
          if (t.schemeJson === null) t.schemeJson = undefined;
          if (t.cuesOverride === null) t.cuesOverride = undefined;
        });
      });
    // ===== END OF v6 =====

    // v7
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
        await tx.table("exercises").toCollection().modify((e: any) => {
          if (e.summary === null) e.summary = undefined;
          if (e.directions === null) e.directions = undefined;
          if (e.videoUrl === null) e.videoUrl = undefined;
          if (e.imageUrl === null) e.imageUrl = undefined;
          if (e.animationKey === null) e.animationKey = undefined;
          if (e.commonMistakes === null) e.commonMistakes = undefined;
          if (e.cuesSetup === null) e.cuesSetup = undefined;
          if (e.cuesExecution === null) e.cuesExecution = undefined;
          if (e.cues === null) e.cues = undefined;

          if (e.cuesSetup !== undefined && !Array.isArray(e.cuesSetup)) e.cuesSetup = [];
          if (e.cuesExecution !== undefined && !Array.isArray(e.cuesExecution)) e.cuesExecution = [];
          if (e.cues !== undefined && !Array.isArray(e.cues)) e.cues = [];
          if (e.commonMistakes !== undefined && !Array.isArray(e.commonMistakes)) {
            e.commonMistakes = [];
          }

          const hasSplit =
            (Array.isArray(e.cuesSetup) && e.cuesSetup.length > 0) ||
            (Array.isArray(e.cuesExecution) && e.cuesExecution.length > 0);

          if (!hasSplit && Array.isArray(e.cues) && e.cues.length > 0) {
            e.cuesSetup = e.cuesSetup ?? [];
            e.cuesExecution = e.cuesExecution ?? e.cues.slice();
          }
        });

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

        await tx.table("tracks").toCollection().modify((t: any) => {
          if (t.schemeJson === null) t.schemeJson = undefined;
          if (t.cuesOverride === null) t.cuesOverride = undefined;
        });
      });
    // ===== END OF v7 =====

    // v8
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
      sessionItems: "id, sessionId, orderIndex, trackId, createdAt",
      sets: "id, sessionId, trackId, createdAt, setType, completedAt",
      walks: "id, date",
      trackPrs: "trackId, updatedAt",
    });
    // ===== END OF v8 =====

    // v9
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
        bodyMetrics:
          "id, measuredAt, createdAt, weightLb, bodyFatPct, skeletalMuscleMassLb, visceralFatIndex, bodyWaterPct",
      })
      .upgrade(async (tx) => {
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
    // ===== END OF v9 =====

    // v10
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

          if (e.metricMode !== undefined) {
            const mm = e.metricMode;
            const ok = mm === "reps" || mm === "distance" || mm === "time";
            if (!ok) e.metricMode = "reps";
          }
        });

        await tx.table("sets").toCollection().modify((s: any) => {
          if (s.distance === null) s.distance = undefined;
          if (s.distanceUnit === null) s.distanceUnit = undefined;

          if (s.distanceUnit) {
            const d = s.distance;
            if (d === undefined || d === null || !Number.isFinite(Number(d))) {
              s.distance = undefined;
              s.distanceUnit = undefined;
            }
          }

          if (
            s.seconds !== undefined &&
            s.seconds !== null &&
            !Number.isFinite(Number(s.seconds))
          ) {
            s.seconds = undefined;
          }
        });
      });
    // ===== END OF v10 =====

    // v11
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
        bodyMetrics:
          "id, measuredAt, takenAt, createdAt, weightLb, bodyFatPct, skeletalMuscleMassLb, visceralFatIndex, bodyWaterPct",
      })
      .upgrade(async (tx) => {
        await tx.table("bodyMetrics").toCollection().modify((m: any) => {
          if (m.measuredAt === null) m.measuredAt = undefined;
          if (m.takenAt === null) m.takenAt = undefined;

          const measured = typeof m.measuredAt === "number" ? m.measuredAt : undefined;
          const taken = typeof m.takenAt === "number" ? m.takenAt : undefined;

          if (!taken && measured) m.takenAt = measured;
          if (!measured && taken) m.measuredAt = taken;

          if (m.createdAt === null) m.createdAt = undefined;
          if (m.createdAt === undefined) {
            m.createdAt = m.measuredAt ?? m.takenAt ?? Date.now();
          }
        });
      });
    // ===== END OF v11 =====

    // v12
    this.version(12)
      .stores({
        exercises:
          "id, &normalizedName, name, bodyPart, category, equipment, archivedAt, mergedIntoExerciseId, createdAt",
        exerciseVariants:
          "id, exerciseId, [exerciseId+normalizedName], name, archivedAt, mergedIntoVariantId, createdAt",
        tracks: "id, exerciseId, variantId, trackType, displayName, createdAt",
        folders: "id, orderIndex, name, archivedAt, createdAt",
        templates: "id, name, createdAt, folderId, archivedAt, orderIndex, lastPerformedAt",
        templateItems: "id, templateId, orderIndex, trackId, groupId, createdAt",
        sessions: "id, startedAt, endedAt, templateId, updatedAt, deletedAt",
        sessionItems: "id, sessionId, orderIndex, trackId, createdAt",
        sets: "id, sessionId, trackId, createdAt, setType, completedAt, updatedAt, deletedAt",
        walks: "id, date, updatedAt, deletedAt",
        trackPrs: "trackId, updatedAt",
        bodyMetrics:
          "id, measuredAt, takenAt, createdAt, weightLb, bodyFatPct, skeletalMuscleMassLb, visceralFatIndex, bodyWaterPct",
        app_meta: "key, updatedAt",
      })
      .upgrade(async (tx) => {
        await tx.table("sessions").toCollection().modify((s: any) => {
          if (s.updatedAt === null) s.updatedAt = undefined;
          if (s.deletedAt === null) s.deletedAt = undefined;
        });

        await tx.table("sets").toCollection().modify((s: any) => {
          if (s.updatedAt === null) s.updatedAt = undefined;
          if (s.deletedAt === null) s.deletedAt = undefined;
        });

        await tx.table("walks").toCollection().modify((w: any) => {
          if (w.updatedAt === null) w.updatedAt = undefined;
          if (w.deletedAt === null) w.deletedAt = undefined;
        });
      });
    // ===== END OF v12 =====

    // v13
    this.version(13)
      .stores({
        exercises:
          "id, &normalizedName, name, bodyPart, category, equipment, archivedAt, mergedIntoExerciseId, createdAt",
        exerciseVariants:
          "id, exerciseId, [exerciseId+normalizedName], name, archivedAt, mergedIntoVariantId, createdAt",
        tracks: "id, exerciseId, variantId, trackType, displayName, createdAt",
        folders: "id, orderIndex, name, archivedAt, createdAt",
        templates: "id, name, createdAt, folderId, archivedAt, orderIndex, lastPerformedAt",
        templateItems: "id, templateId, orderIndex, trackId, groupId, createdAt",
        sessions: "id, startedAt, endedAt, templateId, updatedAt, deletedAt",
        sessionItems: "id, sessionId, orderIndex, trackId, createdAt",
        sets: "id, sessionId, trackId, createdAt, setType, completedAt, updatedAt, deletedAt",
        walks: "id, date, updatedAt, deletedAt",
        trackPrs: "trackId, updatedAt",
        bodyMetrics:
          "id, measuredAt, takenAt, createdAt, weightLb, bodyFatPct, skeletalMuscleMassLb, visceralFatIndex, bodyWaterPct",
        app_meta: "key, updatedAt",
      })
      .upgrade(async (tx) => {
        await tx.table("tracks").toCollection().modify((t: any) => {
          if (t.trackType === "hypertrophy" && t.trackingMode === "repsOnly") {
            t.trackingMode = "weightedReps";
          }
        });
      });
    // ===== END OF v13 =====
    
       // v14
    this.version(14)
      .stores({
        exercises:
          "id, &normalizedName, name, bodyPart, category, equipment, archivedAt, mergedIntoExerciseId, createdAt",
        exerciseVariants:
          "id, exerciseId, [exerciseId+normalizedName], name, archivedAt, mergedIntoVariantId, createdAt",
        tracks: "id, exerciseId, variantId, trackType, displayName, createdAt",
        folders: "id, orderIndex, name, archivedAt, createdAt",
        templates: "id, name, createdAt, folderId, archivedAt, orderIndex, lastPerformedAt",
        templateItems: "id, templateId, orderIndex, trackId, groupId, createdAt",
        sessions: "id, startedAt, endedAt, templateId, updatedAt, deletedAt",
        sessionItems: "id, sessionId, orderIndex, trackId, createdAt",
        sets: "id, sessionId, trackId, createdAt, setType, completedAt, updatedAt, deletedAt",
        walks: "id, date, updatedAt, deletedAt",
        trackPrs: "trackId, updatedAt",
        bodyMetrics:
          "id, measuredAt, takenAt, createdAt, weightLb, bodyFatPct, skeletalMuscleMassLb, visceralFatIndex, bodyWaterPct",
        app_meta: "key, updatedAt",
      })
      .upgrade(async (tx) => {
        await tx.table("tracks").toCollection().modify((t: any) => {
          if (t.trackType !== "corrective") return;

          const name = normalizeName(String(t.displayName ?? ""));

          if (name.includes("crocodile breathing")) {
            t.trackingMode = "breaths";
            return;
          }

          if (name.includes("90/90 hip rotations")) {
            t.trackingMode = "repsOnly";
            return;
          }

          if (name.includes("knee-to-wall dorsiflexion")) {
            t.trackingMode = "repsOnly";
            return;
          }

          if (name.includes("banded pull aparts")) {
            t.trackingMode = "repsOnly";
            return;
          }
        });
      });
    // ===== END OF v14 =====   
    
        // v15
        this.version(15)
          .stores({
            exercises:
              "id, &normalizedName, name, bodyPart, category, equipment, archivedAt, mergedIntoExerciseId, createdAt",
            exerciseVariants:
              "id, exerciseId, [exerciseId+normalizedName], name, archivedAt, mergedIntoVariantId, createdAt",
            tracks: "id, exerciseId, variantId, trackType, displayName, createdAt",
            folders: "id, orderIndex, name, archivedAt, createdAt",
            templates: "id, name, createdAt, folderId, archivedAt, orderIndex, lastPerformedAt",
            templateItems: "id, templateId, orderIndex, trackId, groupId, createdAt",
            sessions: "id, startedAt, endedAt, templateId, updatedAt, deletedAt",
            sessionItems: "id, sessionId, orderIndex, trackId, createdAt",
            sets: "id, sessionId, trackId, createdAt, setType, completedAt, updatedAt, deletedAt",
            walks: "id, date, updatedAt, deletedAt",
            trackPrs: "trackId, updatedAt",
            bodyMetrics:
              "id, measuredAt, takenAt, createdAt, weightLb, bodyFatPct, skeletalMuscleMassLb, visceralFatIndex, bodyWaterPct",
            app_meta: "key, updatedAt",
            appLogs: "id, createdAt, type, level",
          })
          .upgrade(async (tx) => {
            await tx.table("appLogs").toCollection().modify((r: any) => {
              if (r.detailsJson === null) r.detailsJson = undefined;
            });
          });
    // ===== END OF v15 =====
        // v16
        this.version(16)
          .stores({
            exercises:
              "id, &normalizedName, name, bodyPart, category, equipment, archivedAt, mergedIntoExerciseId, createdAt",
            exerciseVariants:
              "id, exerciseId, [exerciseId+normalizedName], name, archivedAt, mergedIntoVariantId, createdAt",
            tracks: "id, exerciseId, variantId, trackType, displayName, createdAt",
            folders: "id, orderIndex, name, archivedAt, createdAt",
            templates: "id, name, createdAt, folderId, archivedAt, orderIndex, lastPerformedAt",
            templateItems: "id, templateId, orderIndex, trackId, groupId, createdAt",
            sessions: "id, startedAt, endedAt, templateId, updatedAt, deletedAt",
            sessionItems: "id, sessionId, orderIndex, trackId, createdAt",
            sets: "id, sessionId, trackId, createdAt, setType, completedAt, updatedAt, deletedAt",
            walks: "id, date, updatedAt, deletedAt",
            trackPrs: "trackId, updatedAt",
            bodyMetrics:
  "id, measuredAt, takenAt, createdAt, weightLb, waistIn, bodyFatPct, leanMassLb, skeletalMuscleMassLb, visceralFatIndex, bodyWaterPct",
            app_meta: "key, updatedAt",
            appLogs: "id, createdAt, type, level",
          })
          .upgrade(async (tx) => {
            await tx.table("bodyMetrics").toCollection().modify((m: any) => {
              if (m.leanMassLb === null) m.leanMassLb = undefined;
              if (m.weightLb === null) m.weightLb = undefined;
              if (m.waistIn === null) m.waistIn = undefined;
              if (m.bodyFatPct === null) m.bodyFatPct = undefined;
              if (m.skeletalMuscleMassLb === null) m.skeletalMuscleMassLb = undefined;
              if (m.visceralFatIndex === null) m.visceralFatIndex = undefined;
              if (m.bodyWaterPct === null) m.bodyWaterPct = undefined;
              if (m.notes === null) m.notes = undefined;
              if (m.measuredAt === null) m.measuredAt = undefined;
              if (m.takenAt === null) m.takenAt = undefined;
              if (m.createdAt === null) m.createdAt = undefined;
    
              const measured = typeof m.measuredAt === "number" ? m.measuredAt : undefined;
              const taken = typeof m.takenAt === "number" ? m.takenAt : undefined;
    
              if (!taken && measured) m.takenAt = measured;
              if (!measured && taken) m.measuredAt = taken;
    
              if (m.createdAt === undefined) {
                m.createdAt = m.measuredAt ?? m.takenAt ?? Date.now();
              }
            });
          });
    // ===== END OF v16 =====
  }
}

export const db = new WorkoutDB();

/* ============================================================
   E2E support: Playwright seeding/reset via window.__db
   ============================================================ */
declare global {
  interface Window {
    __db?: WorkoutDB;
  }
}

if (import.meta.env.DEV) {
  window.__db = db;
}