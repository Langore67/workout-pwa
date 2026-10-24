import type { JsonValue, SupportedMaintenanceTable } from "./maintenanceTypes";

type FieldValidator = (value: JsonValue) => boolean;
const optional = (validator: FieldValidator): FieldValidator => (value) => value === null || validator(value);
const stringValue: FieldValidator = (value) => typeof value === "string";
const numberValue: FieldValidator = (value) => typeof value === "number" && Number.isFinite(value);
const booleanValue: FieldValidator = (value) => typeof value === "boolean";
const stringArray: FieldValidator = (value) => Array.isArray(value) && value.every((item) => typeof item === "string");
const objectValue: FieldValidator = (value) => !!value && typeof value === "object" && !Array.isArray(value);
const oneOf = (...values: string[]): FieldValidator => optional((value) => typeof value === "string" && values.includes(value));
const anyJson: FieldValidator = () => true;

const fields = <T extends Record<string, FieldValidator>>(value: T) => Object.freeze(value);
export type MaintenanceTableDefinition = { primaryKey: "id" | "key"; fields: Readonly<Record<string, FieldValidator>> };

export const MAINTENANCE_TABLE_REGISTRY: Readonly<Record<SupportedMaintenanceTable, MaintenanceTableDefinition>> = Object.freeze({
  exercises: { primaryKey: "id", fields: fields({
    bodyPart: oneOf("Chest", "Back", "Legs", "Shoulders", "Arms", "Core", "Full Body", "Cardio", "Other"),
    category: oneOf("Strength", "Machine", "Bodyweight", "Cardio", "Mobility", "Warmup", "Other"),
    equipment: oneOf("Barbell", "Dumbbell", "Cable", "Machine", "Bodyweight", "Kettlebell", "Band", "Other"),
    metricMode: oneOf("reps", "distance", "time"), movementPattern: oneOf("push", "pull", "hinge", "squat", "carry", "lunge"),
    strengthSignalRole: oneOf("included", "secondary", "excluded"), trainingRole: oneOf("primary", "accessory", "corrective", "deprioritized"),
    anchorEligibility: oneOf("none", "conditional", "primary"), anchorSubtypes: optional(stringArray), equipmentTags: stringArray,
    summary: optional(stringValue), directions: optional(stringValue), cuesSetup: optional(stringArray), cuesExecution: optional(stringArray),
    cues: optional(stringArray), commonMistakes: optional(stringArray), videoUrl: optional(stringValue), animationKey: optional(stringValue),
    imageUrl: optional(stringValue), aliases: optional(stringArray), mergeNote: optional(stringValue), archivedAt: optional(numberValue), updatedAt: optional(numberValue),
  }) },
  sessions: { primaryKey: "id", fields: fields({
    templateName: optional(stringValue), activityType: oneOf("walk", "hike", "run", "bike", "row", "other"),
    conditioningIntent: oneOf("fitness", "recovery", "adventure"), cardioFormat: oneOf("continuous", "intervals"),
    cardioMetrics: optional(objectValue), startedAt: numberValue, endedAt: optional(numberValue), notes: optional(stringValue),
    prsJson: optional(stringValue), updatedAt: optional(numberValue), deletedAt: optional(numberValue),
  }) },
  tracks: { primaryKey: "id", fields: fields({
    trackType: oneOf("strength", "hypertrophy", "technique", "mobility", "corrective", "conditioning"), displayName: stringValue,
    trackingMode: oneOf("weightedReps", "repsOnly", "timeSeconds", "checkbox", "breaths"), warmupSetsDefault: numberValue,
    workingSetsDefault: numberValue, repMin: numberValue, repMax: numberValue, restSecondsDefault: numberValue,
    rirTargetMin: optional(numberValue), rirTargetMax: optional(numberValue), weightJumpDefault: numberValue,
    schemeJson: optional(stringValue), cuesOverride: optional(stringArray),
  }) },
  sets: { primaryKey: "id", fields: fields({
    createdAt: numberValue, setType: oneOf("warmup", "working", "drop", "failure"), weight: optional(numberValue), reps: optional(numberValue),
    seconds: optional(numberValue), distance: optional(numberValue), distanceUnit: oneOf("m", "steps"), rir: optional(numberValue), notes: optional(stringValue),
    completedAt: optional(numberValue), updatedAt: optional(numberValue), deletedAt: optional(numberValue),
  }) },
  bodyMetrics: { primaryKey: "id", fields: fields({
    measuredAt: optional(numberValue), takenAt: optional(numberValue), weightLb: optional(numberValue), waistIn: optional(numberValue),
    bodyFatPct: optional(numberValue), bodyFatMassLb: optional(numberValue), leanMassLb: optional(numberValue), skeletalMuscleMassLb: optional(numberValue),
    visceralFatEstimate: optional(numberValue), visceralFatIndex: optional(numberValue), bodyWaterPct: optional(numberValue), icwLb: optional(numberValue),
    ecwLb: optional(numberValue), mineralMassLb: optional(numberValue), notes: optional(stringValue), createdAt: numberValue,
  }) },
  bodyMeasurements: { primaryKey: "id", fields: fields({
    measurementKey: oneOf("height", "neck", "shoulders", "chest", "rightBiceps", "rightForearm", "leftBiceps", "leftForearm", "hips", "rightQuad", "leftQuad", "rightCalf", "leftCalf"),
    valueIn: numberValue, measuredAt: numberValue, source: optional(stringValue), note: optional(stringValue), createdAt: numberValue, updatedAt: optional(numberValue),
  }) },
  app_meta: { primaryKey: "key", fields: fields({ valueJson: optional(stringValue), updatedAt: numberValue }) },
});

export const PROTOTYPE_SENSITIVE_FIELDS = new Set(["__proto__", "constructor", "prototype"]);
export const UNSUPPORTED_REFERENCE_FIELDS = new Set(["exerciseId", "sessionId", "trackId", "templateId", "variantId", "mergedIntoExerciseId"]);
export function isSupportedMaintenanceTable(value: unknown): value is SupportedMaintenanceTable {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(MAINTENANCE_TABLE_REGISTRY, value);
}
export function validateMaintenanceField(table: SupportedMaintenanceTable, field: string, value: JsonValue) {
  const definition = MAINTENANCE_TABLE_REGISTRY[table];
  if (PROTOTYPE_SENSITIVE_FIELDS.has(field)) return "Prototype-sensitive fields are not allowed.";
  if (field === definition.primaryKey) return `Primary key ${field} cannot be changed.`;
  if (UNSUPPORTED_REFERENCE_FIELDS.has(field)) return `Reference field ${field} is not supported in maintenance version 1.`;
  const validator = definition.fields[field];
  if (!validator) return `Field ${field} is not allowlisted for ${table}.`;
  if (!validator(value)) return `Value for ${field} is invalid.`;
  return undefined;
}
