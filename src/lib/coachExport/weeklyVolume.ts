import type { Exercise, Session, SetEntry, Track } from "../../db";
import type {
  CoachExportOverallStatus,
  CoachExportWeeklyVolume,
  CoachExportWeeklyVolumeBalance,
  CoachExportWeeklyVolumeGroup,
  CoachExportWeeklyVolumeRollup,
  ExerciseVolumeContribution,
  VolumeBucket,
} from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_WINDOW_DAYS = 7;

const ALL_BUCKETS: VolumeBucket[] = [
  "chest_pressing",
  "upper_chest",
  "chest_isolation",
  "lats",
  "mid_back_rows",
  "rear_delts",
  "upper_traps",
  "lower_traps_scapular_control",
  "spinal_erectors",
  "serratus_scapular_control",
  "anterior_delts",
  "lateral_delts",
  "rotator_cuff_external_rotation",
  "biceps_pull_support",
  "biceps_curl_supinated",
  "biceps_hammer_brachialis",
  "triceps_press_support",
  "triceps_isolation",
  "triceps_overhead_long_head",
  "quads",
  "hamstrings",
  "glute_max",
  "glute_med_min",
  "adductors",
  "hip_flexors",
  "calves",
  "tibialis_anterior",
  "anterior_core",
  "lateral_core",
  "anti_rotation_core",
  "carry_grip",
];

const BUCKET_LABELS: Record<VolumeBucket, string> = {
  chest_pressing: "Chest Pressing",
  upper_chest: "Upper Chest",
  chest_isolation: "Chest Isolation",
  lats: "Lats",
  mid_back_rows: "Mid-Back Rows",
  rear_delts: "Rear Delts",
  upper_traps: "Upper Traps",
  lower_traps_scapular_control: "Lower Traps / Scapular Control",
  spinal_erectors: "Spinal Erectors",
  serratus_scapular_control: "Serratus / Scapular Control",
  anterior_delts: "Anterior Delts",
  lateral_delts: "Lateral Delts",
  rotator_cuff_external_rotation: "Rotator Cuff / External Rotation",
  biceps_pull_support: "Biceps Pull Support",
  biceps_curl_supinated: "Biceps Curl / Supinated",
  biceps_hammer_brachialis: "Biceps Hammer / Brachialis",
  triceps_press_support: "Triceps Press Support",
  triceps_isolation: "Triceps Isolation",
  triceps_overhead_long_head: "Triceps Overhead / Long Head",
  quads: "Quads",
  hamstrings: "Hamstrings",
  glute_max: "Glute Max",
  glute_med_min: "Glute Med/Min",
  adductors: "Adductors",
  hip_flexors: "Hip Flexors",
  calves: "Calves",
  tibialis_anterior: "Tibialis Anterior",
  anterior_core: "Anterior Core",
  lateral_core: "Lateral Core",
  anti_rotation_core: "Anti-Rotation Core",
  carry_grip: "Carry / Grip",
};

type BucketAccumulator = {
  primeCredit: number;
  supportCredit: number;
  exposureCount: number;
  examples: Set<string>;
};

type BalanceConfig = {
  id: CoachExportWeeklyVolumeBalance["id"];
  label: string;
  leftLabel: string;
  rightLabel: string;
  leftBuckets: VolumeBucket[];
  rightBuckets: VolumeBucket[];
};

type RollupConfig = {
  id: string;
  label: string;
  buckets: VolumeBucket[];
};

const ROLLUP_CONFIGS: RollupConfig[] = [
  { id: "chest_push", label: "Chest / Push", buckets: ["chest_pressing", "upper_chest", "chest_isolation"] },
  { id: "back_pull", label: "Back / Pull", buckets: ["lats", "mid_back_rows", "rear_delts", "biceps_pull_support"] },
  {
    id: "shoulders_scapula",
    label: "Shoulders / Scapula",
    buckets: [
      "anterior_delts",
      "lateral_delts",
      "rear_delts",
      "rotator_cuff_external_rotation",
      "serratus_scapular_control",
      "lower_traps_scapular_control",
      "upper_traps",
    ],
  },
  {
    id: "arms",
    label: "Arms",
    buckets: [
      "biceps_pull_support",
      "biceps_curl_supinated",
      "biceps_hammer_brachialis",
      "triceps_press_support",
      "triceps_isolation",
      "triceps_overhead_long_head",
    ],
  },
  {
    id: "lower_glutes",
    label: "Lower / Glutes",
    buckets: ["quads", "hamstrings", "glute_max", "glute_med_min", "adductors", "hip_flexors", "calves"],
  },
  {
    id: "core_carry",
    label: "Core / Carry",
    buckets: ["anterior_core", "lateral_core", "anti_rotation_core", "carry_grip"],
  },
];

const BALANCE_CONFIGS: BalanceConfig[] = [
  {
    id: "push_pull",
    label: "Push / Pull",
    leftLabel: "Push",
    rightLabel: "Pull",
    leftBuckets: [
      "chest_pressing",
      "upper_chest",
      "chest_isolation",
      "anterior_delts",
      "lateral_delts",
      "triceps_press_support",
      "triceps_isolation",
      "triceps_overhead_long_head",
    ],
    rightBuckets: ["lats", "mid_back_rows", "rear_delts", "biceps_pull_support", "biceps_curl_supinated", "biceps_hammer_brachialis"],
  },
  {
    id: "pressing_scapular",
    label: "Pressing / Scapular",
    leftLabel: "Pressing",
    rightLabel: "Scapular Support",
    leftBuckets: ["chest_pressing", "upper_chest", "anterior_delts", "triceps_press_support"],
    rightBuckets: ["mid_back_rows", "rear_delts", "lower_traps_scapular_control", "rotator_cuff_external_rotation", "serratus_scapular_control"],
  },
  {
    id: "quad_posterior_chain",
    label: "Quads / Posterior Chain",
    leftLabel: "Quads",
    rightLabel: "Posterior Chain",
    leftBuckets: ["quads"],
    rightBuckets: ["hamstrings", "glute_max", "spinal_erectors"],
  },
  {
    id: "glute_max_med_min",
    label: "Glute Max / Med-Min",
    leftLabel: "Glute Max",
    rightLabel: "Glute Med/Min",
    leftBuckets: ["glute_max"],
    rightBuckets: ["glute_med_min"],
  },
  {
    id: "arms",
    label: "Arms",
    leftLabel: "Biceps",
    rightLabel: "Triceps",
    leftBuckets: ["biceps_pull_support", "biceps_curl_supinated", "biceps_hammer_brachialis"],
    rightBuckets: ["triceps_press_support", "triceps_isolation", "triceps_overhead_long_head"],
  },
  {
    id: "core_carry",
    label: "Core / Carry",
    leftLabel: "Core",
    rightLabel: "Carry",
    leftBuckets: ["anterior_core", "lateral_core", "anti_rotation_core"],
    rightBuckets: ["carry_grip"],
  },
];

function normalizeName(value: string) {
  return String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function hasMeaningfulSetPayload(set: SetEntry) {
  if (set.deletedAt) return false;
  if (set.setType === "warmup") return false;
  if (typeof set.reps === "number" && Number.isFinite(set.reps) && set.reps > 0) return true;
  if (typeof set.seconds === "number" && Number.isFinite(set.seconds) && set.seconds > 0) return true;
  if (typeof set.weight === "number" && Number.isFinite(set.weight) && set.weight > 0) return true;
  if (typeof set.distance === "number" && Number.isFinite(set.distance) && set.distance > 0) return true;
  if (set.completedAt && Number.isFinite(set.completedAt)) return true;
  return false;
}

function hasExposureSetPayload(set: SetEntry) {
  if (set.deletedAt) return false;
  if (set.setType === "warmup") return false;
  return hasMeaningfulSetPayload(set) || set.completedAt != null;
}

function isStrengthLikeTrackType(trackType: unknown) {
  const raw = String(trackType ?? "").trim().toLowerCase();
  return raw === "strength" || raw === "hypertrophy" || raw === "technique" || raw === "conditioning";
}

function isExposureTrackType(trackType: unknown) {
  const raw = String(trackType ?? "").trim().toLowerCase();
  return raw === "mobility" || raw === "corrective";
}

function addExample(set: BucketAccumulator, name: string) {
  if (!name) return;
  if (set.examples.size >= 3 && !set.examples.has(name)) return;
  set.examples.add(name);
}

function includeIf(name: string, pattern: RegExp) {
  return pattern.test(name);
}

function buildContribution(name: string, exercise?: Exercise | null, track?: Track | null): ExerciseVolumeContribution | null {
  const text = normalizeName(name);
  if (!text) return null;

  const isExposureOnly =
    isExposureTrackType(track?.trackType) ||
    includeIf(text, /\b(?:band pull[- ]?apart|y[- ]?wall slide|reverse y|scapular car|external rotation|cable er|band er|clamshell|hip flexor stretch|copenhagen plank|adductor machine|lateral band walk|hip abduction|march|breathing)\b/);

  const fromBodyPart = (() => {
    const part = String(exercise?.bodyPart ?? "").toLowerCase();
    if (part === "chest") {
      return { prime: ["chest_pressing" as VolumeBucket], support: ["triceps_press_support", "anterior_delts"] as VolumeBucket[] };
    }
    if (part === "back") {
      return { prime: ["mid_back_rows" as VolumeBucket], support: ["lats", "rear_delts", "biceps_pull_support"] as VolumeBucket[] };
    }
    if (part === "shoulders") {
      return { prime: ["lateral_delts" as VolumeBucket], support: ["anterior_delts", "rear_delts"] as VolumeBucket[] };
    }
    if (part === "arms") {
      return { prime: ["biceps_pull_support" as VolumeBucket], support: ["triceps_press_support"] as VolumeBucket[] };
    }
    if (part === "legs") {
      return { prime: ["quads" as VolumeBucket], support: ["glute_max"] as VolumeBucket[] };
    }
    if (part === "core") {
      return { prime: ["anterior_core" as VolumeBucket], support: ["lateral_core"] as VolumeBucket[] };
    }
    return null;
  })();

  const byName: ExerciseVolumeContribution | null = (() => {
    if (includeIf(text, /\b(?:bench press|db bench press|machine chest press|push[- ]?up|pushup|close[- ]?grip bench press|chest press)\b/)) {
      return { prime: ["chest_pressing"], support: ["triceps_press_support", "anterior_delts"] };
    }
    if (includeIf(text, /\b(?:incline barbell bench press|db incline press|incline press)\b/)) {
      return { prime: ["upper_chest"], support: ["chest_pressing", "triceps_press_support", "anterior_delts"] };
    }
    if (!text.includes("reverse pec deck") && includeIf(text, /\b(?:chest fly|cable fly|pec deck)\b/)) {
      return { prime: ["chest_isolation"], support: ["anterior_delts"] };
    }
    if (includeIf(text, /\b(?:lat pulldown|assisted pull up|pull up|pull-up|chin up|chin-up)\b/)) {
      return { prime: ["lats"], support: ["biceps_pull_support", "mid_back_rows"] };
    }
    if (includeIf(text, /\b(?:straight[- ]arm pullover|straight[- ]arm cable pulldown)\b/)) {
      return { prime: ["lats"], support: ["serratus_scapular_control"] };
    }
    if (includeIf(text, /\b(?:mts row|seated row|cable row|chest[- ]supported row|db row|3[- ]?point row|machine row)\b/)) {
      return { prime: ["mid_back_rows"], support: ["lats", "rear_delts", "biceps_pull_support"] };
    }
    if (text.includes("reverse pec deck") || text.includes("rear delt fly") || text.includes("rear delts")) {
      return { prime: ["rear_delts"], support: ["mid_back_rows", "lower_traps_scapular_control"] };
    }
    if (includeIf(text, /\bface pull\b/)) {
      return { prime: ["rear_delts"], support: ["rotator_cuff_external_rotation", "lower_traps_scapular_control", "mid_back_rows"] };
    }
    if (includeIf(text, /\b(?:db lateral raise|lateral raise|side raise)\b/)) {
      return { prime: ["lateral_delts"] };
    }
    if (includeIf(text, /\b(?:upright row)\b/)) {
      return { prime: ["lateral_delts"], support: ["upper_traps"] };
    }
    if (includeIf(text, /\b(?:y[- ]?wall slide|reverse y|scapular car|scap car)\b/)) {
      return { exposure: ["serratus_scapular_control", "lower_traps_scapular_control", "rotator_cuff_external_rotation"] };
    }
    if (includeIf(text, /\b(?:external rotation|cable er|band er)\b/)) {
      return isExposureOnly ? { exposure: ["rotator_cuff_external_rotation"] } : { prime: ["rotator_cuff_external_rotation"] };
    }
    if (includeIf(text, /\b(?:farmer carry|farmers carry|suitcase carry|carry)\b/)) {
      return { prime: ["carry_grip"], support: ["upper_traps", "lateral_core"] };
    }
    if (includeIf(text, /\bshrug\b/)) {
      return { prime: ["upper_traps"] };
    }
    if (includeIf(text, /\b(?:cable tricep pushdown|tricep pushdown|triceps pushdown)\b/)) {
      return { prime: ["triceps_isolation"] };
    }
    if (includeIf(text, /\b(?:overhead cable tricep extension|db overhead tricep extension|overhead tricep extension)\b/)) {
      return { prime: ["triceps_overhead_long_head"], support: ["triceps_isolation"] };
    }
    if (includeIf(text, /\bskull crusher\b/)) {
      return { prime: ["triceps_isolation"], support: ["triceps_overhead_long_head"] };
    }
    if (includeIf(text, /\b(?:straight[- ]bar curl|ez[- ]bar curl|cable curl|db curl)\b/)) {
      return { prime: ["biceps_curl_supinated"] };
    }
    if (includeIf(text, /\b(?:rope hammer curl|cable hammer curl|db hammer curl|cross[- ]body hammer curl)\b/)) {
      return { prime: ["biceps_hammer_brachialis"] };
    }
    if (includeIf(text, /\breverse curl\b/)) {
      return { prime: ["biceps_hammer_brachialis"], support: ["carry_grip"] };
    }
    if (includeIf(text, /\bleg press\s*[-–—]?\s*glute bias\b/)) {
      return { prime: ["glute_max"], support: ["quads", "hamstrings"] };
    }
    if (includeIf(text, /\bleg press\b/)) {
      return { prime: ["quads"], support: ["glute_max"] };
    }
    if (includeIf(text, /\b(?:bulgarian split squat|step up|step[- ]up)\b/)) {
      return { prime: ["quads", "glute_max"], support: ["glute_med_min", "adductors"] };
    }
    if (includeIf(text, /\btrap bar deadlift\b/)) {
      return { prime: ["glute_max", "hamstrings"], support: ["quads", "spinal_erectors", "upper_traps", "carry_grip"] };
    }
    if (includeIf(text, /\bdb rdl\b|\brdl\b|\bromanian deadlift\b/)) {
      return { prime: ["hamstrings", "glute_max"], support: ["spinal_erectors"] };
    }
    if (includeIf(text, /\bsingle[- ]leg rdl\b/)) {
      return { prime: ["hamstrings", "glute_max"], support: ["spinal_erectors", "glute_med_min"] };
    }
    if (includeIf(text, /\b(?:glute bridge|hip thrust)\b/)) {
      return { prime: ["glute_max"], support: ["hamstrings"] };
    }
    if (includeIf(text, /\b(?:kneeling leg curl|leg curl)\b/)) {
      return { prime: ["hamstrings"] };
    }
    if (includeIf(text, /\bleg extension\b/)) {
      return { prime: ["quads"] };
    }
    if (includeIf(text, /\b(?:locked clams|clamshell|glute med|lateral band walk|hip abduction machine)\b/)) {
      return isExposureOnly ? { exposure: ["glute_med_min"] } : { prime: ["glute_med_min"] };
    }
    if (includeIf(text, /\b(?:adductor machine|copenhagen plank|lateral lunge)\b/)) {
      return isExposureOnly ? { exposure: ["adductors"] } : { prime: ["adductors"] };
    }
    if (includeIf(text, /\bhip flexor stretch\b/)) {
      return { exposure: ["hip_flexors"] };
    }
    if (includeIf(text, /\b(?:cable hip flexion|march)\b/)) {
      return isExposureOnly ? { exposure: ["hip_flexors"] } : { prime: ["hip_flexors"] };
    }
    if (includeIf(text, /\b(?:standing calf raise|seated calf raise)\b/)) {
      return { prime: ["calves"] };
    }
    if (includeIf(text, /\btib\s?raise\b/)) {
      return { prime: ["tibialis_anterior"] };
    }
    if (includeIf(text, /\b(?:roman chair|plank|dead bug|cable crunch)\b/)) {
      return { prime: ["anterior_core"] };
    }
    if (includeIf(text, /\bside plank\b/)) {
      return { prime: ["lateral_core"], support: ["glute_med_min"] };
    }
    if (includeIf(text, /\bpallof press\b/)) {
      return { prime: ["anti_rotation_core"] };
    }
    if (includeIf(text, /\b(?:hanging knee raise|captain'?s chair)\b/)) {
      return { prime: ["anterior_core"], support: ["hip_flexors"] };
    }
    return null;
  })();

  if (byName) return byName;
  if (fromBodyPart) return fromBodyPart;
  return null;
}

function statusFromVolume(totalCredit: number, exposureCount: number): CoachExportOverallStatus {
  if (totalCredit <= 0 && exposureCount <= 0) return "not_enough_data";
  if (exposureCount > 0 && totalCredit < 1) {
    if (exposureCount >= 2) return "solid";
    return "watch";
  }
  if (totalCredit < 1) return "watch";
  if (totalCredit < 4) return "watch";
  if (totalCredit < 6) return "watch";
  return "solid";
}

function balanceStatus(left: number, right: number): CoachExportOverallStatus {
  const total = left + right;
  if (total <= 0) return "not_enough_data";
  if (total < 1) return "watch";
  if (left === 0 || right === 0) return total >= 4 ? "intervene" : "watch";
  const ratio = left / right;
  if (ratio >= 0.67 && ratio <= 1.5) return "solid";
  if (ratio >= 0.5 && ratio < 0.67) return "watch";
  if (ratio > 1.5 && ratio <= 2) return "watch";
  return "intervene";
}

function formatStatusLabel(status: CoachExportOverallStatus) {
  if (status === "not_enough_data") return "Not Enough Data";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function roundCredit(value: number) {
  return Math.round(value * 10) / 10;
}

function buildBucketLabel(bucket: VolumeBucket) {
  return BUCKET_LABELS[bucket] ?? bucket;
}

function addCredits(
  accumulator: BucketAccumulator,
  kind: "prime" | "support" | "exposure",
  count: number,
  name: string
) {
  if (count <= 0) return;
  if (kind === "prime") accumulator.primeCredit += count;
  if (kind === "support") accumulator.supportCredit += count * 0.5;
  if (kind === "exposure") accumulator.exposureCount += count;
  addExample(accumulator, name);
}

function sessionTime(session: Session) {
  return Number(session.endedAt ?? session.startedAt ?? 0);
}

function recentSessionIds(args: { sessions: Session[]; asOf: number; windowDays: number }) {
  const cutoff = args.asOf - args.windowDays * DAY_MS;
  return (args.sessions ?? [])
    .filter((session) => !session.deletedAt && Number.isFinite(sessionTime(session)) && sessionTime(session) >= cutoff)
    .map((session) => session.id);
}

export function buildWeeklyVolume(args: {
  sessions: Session[];
  sets: SetEntry[];
  tracks: Track[];
  exercises: Exercise[];
  asOf?: number;
  windowDays?: number;
}): CoachExportWeeklyVolume | undefined {
  const windowDays = Math.max(1, Math.floor(args.windowDays ?? DEFAULT_WINDOW_DAYS));
  const sortedSessions = (args.sessions ?? [])
    .slice()
    .filter((session) => !session.deletedAt && Number.isFinite(sessionTime(session)))
    .sort((a, b) => sessionTime(b) - sessionTime(a));
  const asOf = Number.isFinite(args.asOf) ? Number(args.asOf) : sortedSessions[0] ? sessionTime(sortedSessions[0]) : Date.now();
  const recentIds = new Set(
    recentSessionIds({
      sessions: sortedSessions,
      asOf,
      windowDays,
    })
  );
  if (!recentIds.size) return undefined;

  const tracksById = new Map((args.tracks ?? []).map((track) => [track.id, track]));
  const exercisesById = new Map((args.exercises ?? []).map((exercise) => [exercise.id, exercise]));

  const accumulators = new Map<VolumeBucket, BucketAccumulator>();
  for (const bucket of ALL_BUCKETS) {
    accumulators.set(bucket, { primeCredit: 0, supportCredit: 0, exposureCount: 0, examples: new Set<string>() });
  }

  const unclassified = new Map<string, number>();
  let hadRelevantActivity = false;

  const setsBySessionId = new Map<string, SetEntry[]>();
  for (const set of args.sets ?? []) {
    if (set.deletedAt || !recentIds.has(set.sessionId)) continue;
    const bucket = setsBySessionId.get(set.sessionId) ?? [];
    bucket.push(set);
    setsBySessionId.set(set.sessionId, bucket);
  }

  const sessionIds = Array.from(recentIds);
  for (const sessionId of sessionIds) {
    const sessionSets = (setsBySessionId.get(sessionId) ?? []).slice().sort((a, b) => {
      const aTime = Number(a.completedAt ?? a.createdAt ?? 0);
      const bTime = Number(b.completedAt ?? b.createdAt ?? 0);
      return aTime - bTime;
    });

    for (const set of sessionSets) {
      const track = tracksById.get(set.trackId);
      if (!track) continue;
      const exercise = track.exerciseId ? exercisesById.get(track.exerciseId) : undefined;
      const name = normalizeName(exercise?.name ?? track.displayName ?? "");
      if (!name) continue;

      const contribution = buildContribution(name, exercise, track);
      const hasSetWork = hasMeaningfulSetPayload(set);
      const hasExposure = hasExposureSetPayload(set);
      if (!contribution && !hasSetWork && !hasExposure) continue;

      const isExposureTrack = isExposureTrackType(track.trackType);
      const isWorkTrack = isStrengthLikeTrackType(track.trackType);

      if (contribution?.prime?.length || contribution?.support?.length) {
        if (isWorkTrack && hasSetWork) {
          for (const bucket of contribution.prime ?? []) {
            addCredits(accumulators.get(bucket)!, "prime", 1, name);
            hadRelevantActivity = true;
          }
          for (const bucket of contribution.support ?? []) {
            addCredits(accumulators.get(bucket)!, "support", 1, name);
            hadRelevantActivity = true;
          }
          continue;
        }
      }

      if (contribution?.exposure?.length && (isExposureTrack || !isWorkTrack || !contribution.prime?.length && !contribution.support?.length)) {
        if (hasExposure) {
          for (const bucket of contribution.exposure) {
            addCredits(accumulators.get(bucket)!, "exposure", 1, name);
            hadRelevantActivity = true;
          }
          continue;
        }
      }

      if (isExposureTrack && hasExposure) {
        const fallbackBucket = contribution?.exposure?.[0];
        if (fallbackBucket) {
          addCredits(accumulators.get(fallbackBucket)!, "exposure", 1, name);
          hadRelevantActivity = true;
          continue;
        }
      }

      if (isWorkTrack && hasSetWork) {
        if (!contribution) {
          unclassified.set(name, (unclassified.get(name) ?? 0) + 1);
          hadRelevantActivity = true;
          continue;
        }
        if (contribution.prime?.length || contribution.support?.length) {
          for (const bucket of contribution.prime ?? []) {
            addCredits(accumulators.get(bucket)!, "prime", 1, name);
            hadRelevantActivity = true;
          }
          for (const bucket of contribution.support ?? []) {
            addCredits(accumulators.get(bucket)!, "support", 1, name);
            hadRelevantActivity = true;
          }
          continue;
        }
      }

      if (hasExposure && contribution?.exposure?.length) {
        for (const bucket of contribution.exposure) {
          addCredits(accumulators.get(bucket)!, "exposure", 1, name);
          hadRelevantActivity = true;
        }
        continue;
      }

      if (hasSetWork) {
        unclassified.set(name, (unclassified.get(name) ?? 0) + 1);
        hadRelevantActivity = true;
      }
    }
  }

  if (!hadRelevantActivity) return undefined;

  const groups: CoachExportWeeklyVolumeGroup[] = ALL_BUCKETS.map((bucket) => {
    const acc = accumulators.get(bucket)!;
    const totalCredit = roundCredit(acc.primeCredit + acc.supportCredit + acc.exposureCount * 0.25);
    return {
      bucket,
      label: buildBucketLabel(bucket),
      primeCredit: roundCredit(acc.primeCredit),
      supportCredit: roundCredit(acc.supportCredit),
      exposureCount: acc.exposureCount,
      totalCredit,
      status: statusFromVolume(totalCredit, acc.exposureCount),
      examples: Array.from(acc.examples).slice(0, 3),
    };
  }).filter((group) => group.totalCredit > 0 || group.exposureCount > 0);

  const activeGroups = groups.slice().sort((a, b) => b.totalCredit - a.totalCredit || b.exposureCount - a.exposureCount);
  const rollupConfigs = ROLLUP_CONFIGS.map((config) => {
    const parts = config.buckets
      .map((bucket) => groups.find((group) => group.bucket === bucket))
      .filter((group): group is CoachExportWeeklyVolumeGroup => Boolean(group));
    const totalCredit = roundCredit(parts.reduce((sum, part) => sum + part.totalCredit, 0));
    const exposureCount = parts.reduce((sum, part) => sum + part.exposureCount, 0);
    const status = statusFromVolume(totalCredit, exposureCount);
    const label = config.label;
    const note =
      status === "solid"
        ? undefined
        : parts.length
          ? `${label} is still developing.`
          : undefined;

    return {
      id: config.id,
      label,
      totalCredit,
      exposureCount,
      status,
      parts: parts.map((part) => ({
        bucket: part.bucket,
        label: part.label,
        credit: part.totalCredit,
        exposureCount: part.exposureCount,
      })),
      note,
    } satisfies CoachExportWeeklyVolumeRollup;
  }).filter((rollup) => rollup.totalCredit > 0 || (rollup.exposureCount ?? 0) > 0);

  const balanceRows = BALANCE_CONFIGS.map((config) => {
    const leftCredit = roundCredit(
      config.leftBuckets.reduce((sum, bucket) => sum + (groups.find((group) => group.bucket === bucket)?.totalCredit ?? 0), 0)
    );
    const rightCredit = roundCredit(
      config.rightBuckets.reduce((sum, bucket) => sum + (groups.find((group) => group.bucket === bucket)?.totalCredit ?? 0), 0)
    );
    const ratio = rightCredit > 0 ? roundCredit(leftCredit / rightCredit) : null;
    const status = balanceStatus(leftCredit, rightCredit);
    const note =
      status === "not_enough_data"
        ? `No meaningful ${config.leftLabel.toLowerCase()} or ${config.rightLabel.toLowerCase()} volume yet.`
        : ratio == null
          ? `${config.leftLabel} is ahead of ${config.rightLabel}.`
          : ratio >= 1
            ? `${config.leftLabel} is ahead of ${config.rightLabel}.`
            : `${config.rightLabel} is ahead of ${config.leftLabel}.`;

    return {
      id: config.id,
      label: config.label,
      leftLabel: config.leftLabel,
      rightLabel: config.rightLabel,
      leftCredit,
      rightCredit,
      ratio,
      status,
      note,
    } satisfies CoachExportWeeklyVolumeBalance;
  }).filter((balance) => balance.leftCredit > 0 || balance.rightCredit > 0);

  const topWatchGroups = activeGroups.filter((group) => group.status !== "solid").slice(0, 2);
  const topWatchBalances = balanceRows.filter((balance) => balance.status !== "solid").slice(0, 2);
  const summaryParts: string[] = [];
  if (topWatchBalances.length) {
    summaryParts.push(...topWatchBalances.map((balance) => balance.note));
  }
  if (topWatchGroups.length && summaryParts.length < 2) {
    summaryParts.push(
      ...topWatchGroups.map((group) => `${group.label} is ${formatStatusLabel(group.status).toLowerCase()}.`)
    );
  }
  if (!summaryParts.length) {
    summaryParts.push("Weekly volume is solid across the main patterns.");
  }

  return {
    windowDays,
    asOf: new Date(asOf).toISOString(),
    groups,
    rollups: rollupConfigs,
    balances: balanceRows,
    unclassified: Array.from(unclassified.entries())
      .map(([exerciseName, setCount]) => ({ exerciseName, setCount }))
      .sort((a, b) => b.setCount - a.setCount || a.exerciseName.localeCompare(b.exerciseName)),
    status: balanceRows.some((row) => row.status === "intervene") || activeGroups.some((group) => group.status === "intervene")
      ? "intervene"
      : balanceRows.some((row) => row.status === "watch") || activeGroups.some((group) => group.status === "watch")
        ? "watch"
        : "solid",
    summary: summaryParts.slice(0, 2).join(" "),
  };
}
