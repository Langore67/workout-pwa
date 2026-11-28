import {
  getMovementTaxonomyFamily,
  resolveMovementTaxonomyClassification,
  type MovementTaxonomyDisposition,
  type MovementTaxonomyFamily,
  type MovementTaxonomyLaterality,
  type MovementTaxonomyPattern,
  type MovementTaxonomyResolution,
  type MovementTaxonomyEvidenceSource,
} from "./movementTaxonomyContract";
import { buildTrainingCalendarBoundaries, localDateKey } from "./trainingCalendarContext";
import type { TrainingExposureEvent } from "./trainingExposureContext";

export type CandidateMovementTaxonomyMapping = Readonly<{
  canonicalExerciseId: string;
  disposition?: MovementTaxonomyDisposition;
  family?: MovementTaxonomyFamily;
  pattern?: MovementTaxonomyPattern;
  exerciseLaterality?: MovementTaxonomyLaterality;
  provenance: MovementTaxonomyEvidenceSource;
  reviewStatus: "candidate" | "manual_review";
}>;

export type ProposedExposureAccountingState =
  | "pattern"
  | "accessory"
  | "broad_only"
  | "unsupported"
  | "missing"
  | "unmapped"
  | "invalid"
  | "conflicting"
  | "unresolved_identity";

export type DualClassificationPeriodKind =
  | "current_week_to_date"
  | "previous_complete_week"
  | "rolling_14_days"
  | "last_28_days"
  | "last_90_days"
  | "all_history";

export type DualClassificationPeriod = Readonly<{
  kind: DualClassificationPeriodKind;
  startAt?: number;
  endAt: number;
  startLocalDate?: string;
  endLocalDate: string;
  qualifyingSetCount: number;
  controlExposureCount: number;
  legacyQualifyingBuckets: Readonly<Record<string, number>>;
  legacyControlBuckets: Readonly<Record<string, number>>;
  specificPatternQualifying: Readonly<Partial<Record<MovementTaxonomyPattern, number>>>;
  specificPatternControls: Readonly<Partial<Record<MovementTaxonomyPattern, number>>>;
  compoundFamilyRollups: Readonly<Partial<Record<MovementTaxonomyFamily, number>>>;
  accounting: Readonly<Record<ProposedExposureAccountingState, number>>;
  controlAccounting: Readonly<Record<ProposedExposureAccountingState, number>>;
  mappedCanonicalExerciseCount: number;
  observedCanonicalExerciseCount: number;
  mappedQualifyingSetCount: number;
  unresolvedSetCount: number;
  legacyAccounting: Readonly<Record<'classified' | 'accessory_residual' | 'unclassified' | 'unresolved_identity', number>>;
  legacyResidualSets: readonly { setId: string; canonicalExerciseId?: string; category: string }[];
  accessoryComparison: Readonly<{ total: number; inLegacyCompoundBuckets: number; outsideLegacyCompoundBuckets: number }>;
}>;

export type DualMovementClassificationDiagnostic = Readonly<{
  asOf: number;
  periods: readonly DualClassificationPeriod[];
}>;

const ACCOUNTING_STATES: readonly ProposedExposureAccountingState[] = [
  "pattern", "accessory", "broad_only", "unsupported", "missing", "unmapped",
  "invalid", "conflicting", "unresolved_identity",
];

function startOfLocalDay(asOf: number, daysBack: number) {
  const result = new Date(asOf);
  result.setHours(0, 0, 0, 0);
  result.setDate(result.getDate() - daysBack);
  return result.getTime();
}

function increment(target: Record<string, number>, key?: string) {
  if (key) target[key] = (target[key] ?? 0) + 1;
}

function emptyAccounting(): Record<ProposedExposureAccountingState, number> {
  return Object.fromEntries(ACCOUNTING_STATES.map((state) => [state, 0])) as Record<ProposedExposureAccountingState, number>;
}

function accountingState(event: TrainingExposureEvent, resolution?: MovementTaxonomyResolution): ProposedExposureAccountingState {
  if (!event.canonicalExerciseId) return "unresolved_identity";
  if (!resolution) return "unmapped";
  if (resolution.state === "classified") return "pattern";
  return resolution.state;
}

/**
 * Isolated diagnostic only: it consumes already-qualified production exposure
 * events and never participates in Training Exposure or coaching consumers.
 */
export function buildDualMovementClassificationDiagnostic(args: {
  events: readonly TrainingExposureEvent[];
  candidateMappings: readonly CandidateMovementTaxonomyMapping[];
  asOf: number;
}): DualMovementClassificationDiagnostic {
  const asOf = Number.isFinite(args.asOf) ? args.asOf : Date.now();
  const boundaries = buildTrainingCalendarBoundaries(asOf);
  const firstAt = args.events.length ? Math.min(...args.events.map((event) => event.at)) : undefined;
  const definitions: Array<{ kind: DualClassificationPeriodKind; startAt?: number; endAt: number; endExclusive?: boolean }> = [
    { kind: "current_week_to_date", startAt: boundaries.currentWeekStartAt, endAt: asOf },
    { kind: "previous_complete_week", startAt: boundaries.previousWeekStartAt, endAt: boundaries.currentWeekStartAt, endExclusive: true },
    { kind: "rolling_14_days", startAt: boundaries.rolling14DaysStartAt, endAt: asOf },
    { kind: "last_28_days", startAt: startOfLocalDay(asOf, 27), endAt: asOf },
    { kind: "last_90_days", startAt: startOfLocalDay(asOf, 89), endAt: asOf },
    { kind: "all_history", startAt: firstAt, endAt: asOf },
  ];
  const mappingById = new Map(args.candidateMappings.map((mapping) => [mapping.canonicalExerciseId, mapping]));

  const periods = definitions.map<DualClassificationPeriod>((definition) => {
    const rows = args.events.filter((event) =>
      (definition.startAt === undefined || event.at >= definition.startAt)
      && (definition.endExclusive ? event.at < definition.endAt : event.at <= definition.endAt));
    const qualifying = rows.filter((event) => event.kind !== "control");
    const controls = rows.filter((event) => event.kind === "control");
    const legacyQualifyingBuckets: Record<string, number> = {};
    const legacyControlBuckets: Record<string, number> = {};
    const specificPatternQualifying: Record<string, number> = {};
    const specificPatternControls: Record<string, number> = {};
    const compoundFamilyRollups: Record<string, number> = {};
    const accounting = emptyAccounting();
    const controlAccounting = emptyAccounting();
    const observedIds = new Set(rows.map((event) => event.canonicalExerciseId).filter((id): id is string => !!id));
    const mappedIds = new Set<string>();
    let mappedQualifyingSetCount = 0;
    let unresolvedSetCount = 0;
    const legacyAccounting = { classified: 0, accessory_residual: 0, unclassified: 0, unresolved_identity: 0 };
    const legacyResidualSets: Array<{ setId: string; canonicalExerciseId?: string; category: string }> = [];
    const accessoryComparison = { total: 0, inLegacyCompoundBuckets: 0, outsideLegacyCompoundBuckets: 0 };
    const compoundBuckets = new Set(['push', 'pull', 'hinge', 'squat', 'lunge', 'carry', 'horizontal_push', 'vertical_push', 'horizontal_pull', 'vertical_pull', 'single_leg']);

    for (const event of rows) {
      increment(event.kind === "control" ? legacyControlBuckets : legacyQualifyingBuckets, event.movementPattern);
      const mapping = event.canonicalExerciseId ? mappingById.get(event.canonicalExerciseId) : undefined;
      if (mapping) mappedIds.add(mapping.canonicalExerciseId);
      const resolution = mapping ? resolveMovementTaxonomyClassification({
        family: mapping.family,
        pattern: mapping.pattern,
        disposition: mapping.disposition,
        evidenceSource: mapping.provenance,
        exerciseLaterality: mapping.exerciseLaterality,
        performedSetLaterality: event.unilateralSide ? "unilateral" : "unknown",
      }) : undefined;
      const state = accountingState(event, resolution);
      if (event.kind !== 'control') {
        const category = !event.canonicalExerciseId ? 'unresolved_identity' : event.movementPattern ? 'classified' : event.movementPatternExempt ? 'accessory_residual' : 'unclassified';
        legacyAccounting[category] += 1;
        if (category !== 'classified') legacyResidualSets.push({ setId: event.setId, canonicalExerciseId: event.canonicalExerciseId, category });
        if (state === 'accessory') {
          accessoryComparison.total += 1;
          if (compoundBuckets.has(event.movementPattern ?? '')) accessoryComparison.inLegacyCompoundBuckets += 1;
          else accessoryComparison.outsideLegacyCompoundBuckets += 1;
        }
      }
      const targetAccounting = event.kind === "control" ? controlAccounting : accounting;
      targetAccounting[state] += 1;
      if (state === "unresolved_identity") unresolvedSetCount += 1;
      if (event.kind !== "control" && mapping) mappedQualifyingSetCount += 1;
      if (resolution?.state === "classified" && resolution.pattern) {
        increment(event.kind === "control" ? specificPatternControls : specificPatternQualifying, resolution.pattern);
        const family = getMovementTaxonomyFamily(resolution.pattern);
        if (event.kind !== "control" && family) increment(compoundFamilyRollups, family);
      }
    }

    return Object.freeze({
      kind: definition.kind,
      ...(definition.startAt !== undefined ? { startAt: definition.startAt, startLocalDate: localDateKey(new Date(definition.startAt)) } : {}),
      endAt: definition.endAt,
      endLocalDate: localDateKey(new Date(definition.endExclusive ? definition.endAt - 1 : definition.endAt)),
      qualifyingSetCount: qualifying.length,
      controlExposureCount: controls.length,
      legacyQualifyingBuckets: Object.freeze(legacyQualifyingBuckets),
      legacyControlBuckets: Object.freeze(legacyControlBuckets),
      specificPatternQualifying: Object.freeze(specificPatternQualifying),
      specificPatternControls: Object.freeze(specificPatternControls),
      compoundFamilyRollups: Object.freeze(compoundFamilyRollups),
      accounting: Object.freeze(accounting),
      controlAccounting: Object.freeze(controlAccounting),
      mappedCanonicalExerciseCount: mappedIds.size,
      observedCanonicalExerciseCount: observedIds.size,
      mappedQualifyingSetCount,
      unresolvedSetCount,
      legacyAccounting: Object.freeze(legacyAccounting),
      legacyResidualSets: Object.freeze(legacyResidualSets),
      accessoryComparison: Object.freeze(accessoryComparison),
    });
  });
  return Object.freeze({ asOf, periods: Object.freeze(periods) });
}
