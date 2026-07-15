import type { Exercise, Session, SetEntry, Track } from "../../db";
import { classifyAnchorMovementFamily, formatAnchorMovementFamilyLabel } from "./anchorIntelligence";
import { selectRecentStrengthBuildingSessions } from "./strengthBuildingSessions";
import type {
  CoachExportAnchorLift,
  CoachExportWeeklyVolume,
  MovementCoverageEntry,
  MovementCoverageFamily,
  MovementCoverageRelationship,
  MovementCoverageStatus,
  MovementCoverageSummary,
} from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;
const VOLUME_WINDOW_DAYS = 7 as const;
const RECENCY_WINDOW_DAYS = 28;

const FAMILIES: MovementCoverageFamily[] = [
  "horizontal_push",
  "vertical_push",
  "horizontal_pull",
  "vertical_pull",
  "squat",
  "hinge",
  "single_leg",
  "glute_extension",
  "hip_stability",
  "carry",
  "core",
];

type ExerciseContribution = {
  exerciseName: string;
  effectiveSets: number;
  supportEffectiveSets: number;
  controlExposures: number;
  lastPerformedAt: number;
};

type Accumulator = {
  currentMovement?: { exerciseName: string; performedAt: number; ageDays: number };
  sessionIds7d: Set<string>;
  exercises: Map<string, ExerciseContribution>;
  directEffectiveSets7d: number;
  supportEffectiveSets7d: number;
  controlExposures7d: number;
  directControlExposures7d: number;
};

type Evidence = {
  family: MovementCoverageFamily | null;
  directSets: number;
  supportSets: number;
  controlExposures: number;
  hipSupportSets: number;
};

function normalizeName(value: string | null | undefined) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeKey(value: string | null | undefined) {
  return normalizeName(value).toLowerCase();
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

function ageDays(asOf: number, performedAt: number) {
  return Math.floor(Math.max(0, asOf - performedAt) / DAY_MS);
}

function setTime(set: SetEntry, session?: Session) {
  return Number(set.completedAt ?? set.createdAt ?? session?.endedAt ?? session?.startedAt ?? 0);
}

function isWorkTrackType(trackType: unknown) {
  const raw = String(trackType ?? "").trim().toLowerCase();
  return raw === "strength" || raw === "hypertrophy" || raw === "technique";
}

function isExposureTrackType(trackType: unknown) {
  const raw = String(trackType ?? "").trim().toLowerCase();
  return raw === "mobility" || raw === "corrective";
}

function isRelevantTrackType(trackType: unknown) {
  return isWorkTrackType(trackType) || isExposureTrackType(trackType);
}

function hasMeaningfulPayload(set: SetEntry) {
  if (set.deletedAt) return false;
  const setType = String((set as any)?.setType ?? "").trim().toLowerCase();
  if (setType === "warmup" || setType === "warm-up" || setType === "warm up") return false;
  if (typeof set.reps === "number" && Number.isFinite(set.reps) && set.reps > 0) return true;
  if (typeof set.seconds === "number" && Number.isFinite(set.seconds) && set.seconds > 0) return true;
  if (typeof set.weight === "number" && Number.isFinite(set.weight) && set.weight > 0) return true;
  if (typeof set.distance === "number" && Number.isFinite(set.distance) && set.distance > 0) return true;
  return Number.isFinite(Number(set.completedAt ?? set.createdAt ?? 0));
}

function labelForFamily(family: MovementCoverageFamily) {
  return family === "hip_stability" ? "Hip Stability" : formatAnchorMovementFamilyLabel(family);
}

function evidenceForExercise(name: string, track: Track): Evidence {
  const text = normalizeKey(name);
  const family = classifyAnchorMovementFamily(name);
  const isWork = isWorkTrackType(track.trackType);
  const isExposure = isExposureTrackType(track.trackType);
  const hipStabilityDirect =
    /\b(?:locked clam|locked clams|clamshell|clam shell|lateral band walk|hip abduction|side[-\s]?lying hip abduction|hip airplane|step[-\s]?down|heel tap)\b/.test(text);
  const hipSupportSets =
    /\b(?:single[-\s]?leg rdl|single[-\s]?leg romanian deadlift|step[-\s]?up|bulgarian split squat|split squat)\b/.test(text) ? 0.3 : 0;

  if (hipStabilityDirect) {
    return { family: "hip_stability", directSets: isExposure ? 0 : 1, supportSets: 0, controlExposures: 1, hipSupportSets: 0 };
  }
  if (family !== "unknown") {
    return { family, directSets: isWork ? 1 : 0, supportSets: 0, controlExposures: isExposure ? 1 : 0, hipSupportSets };
  }
  return { family: null, directSets: 0, supportSets: 0, controlExposures: 0, hipSupportSets: 0 };
}

function diagnosticSupportFamilies(name: string) {
  const text = normalizeKey(name);
  const out: Array<{ family: MovementCoverageFamily; supportSets: number }> = [];
  if (/\b(?:trap bar deadlift|deadlift|rdl|romanian deadlift)\b/.test(text)) {
    out.push({ family: "carry", supportSets: 0.5 });
    out.push({ family: "glute_extension", supportSets: 0.5 });
  } else if (/\b(?:leg press|split squat|bulgarian split squat|step[-\s]?up)\b/.test(text)) {
    out.push({ family: "glute_extension", supportSets: 0.5 });
  }
  return out;
}

function addContribution(acc: Accumulator, exerciseName: string, performedAt: number, directSets: number, supportSets: number, controlExposures: number) {
  if (directSets <= 0 && supportSets <= 0 && controlExposures <= 0) return;
  const key = normalizeKey(exerciseName);
  const existing = acc.exercises.get(key) ?? {
    exerciseName,
    effectiveSets: 0,
    supportEffectiveSets: 0,
    controlExposures: 0,
    lastPerformedAt: performedAt,
  };
  existing.effectiveSets = round(existing.effectiveSets + directSets);
  existing.supportEffectiveSets = round(existing.supportEffectiveSets + supportSets);
  existing.controlExposures += controlExposures;
  if (performedAt > existing.lastPerformedAt) existing.lastPerformedAt = performedAt;
  acc.exercises.set(key, existing);
}

function statusForEntry(args: {
  family: MovementCoverageFamily;
  directSets: number;
  supportSets: number;
  controlExposures: number;
  directControlExposures: number;
  sessionCount: number;
  hasCurrentMovement: boolean;
}): MovementCoverageStatus {
  if (!args.hasCurrentMovement && args.directSets <= 0 && args.supportSets <= 0 && args.controlExposures <= 0) return "missing";
  if (args.family === "hip_stability") {
    if (args.directSets <= 0 && args.directControlExposures <= 0) return args.supportSets > 0 ? "developing" : "missing";
    if (args.directControlExposures >= 5 && args.sessionCount >= 2) return "strong";
    if (args.directControlExposures >= 2 || args.directSets >= 2) return "covered";
    return "developing";
  }
  if ((args.family === "carry" || args.family === "glute_extension") && args.directSets <= 0) {
    return args.hasCurrentMovement ? "developing" : "missing";
  }
  if (args.directSets <= 0) return args.supportSets > 0 || args.hasCurrentMovement ? "developing" : "missing";
  if (args.directSets >= 9 && args.sessionCount >= 2) return "strong";
  if (args.directSets >= 4 || args.sessionCount >= 2) return "covered";
  return "developing";
}

function relationshipFor(currentMovement: MovementCoverageEntry["currentMovement"], anchor?: CoachExportAnchorLift | null): MovementCoverageRelationship {
  if (currentMovement && anchor?.exerciseName) {
    return normalizeKey(currentMovement.exerciseName) === normalizeKey(anchor.exerciseName) ? "same_exercise" : "same_family_different_exercise";
  }
  if (anchor?.exerciseName) return "anchor_only";
  if (currentMovement) return "current_only";
  return "none";
}

function anchorForFamily(anchors: CoachExportAnchorLift[], family: MovementCoverageFamily) {
  if (family === "hip_stability") return null;
  return (
    anchors.find((anchor) => anchor.movementFamily === family && anchor.exerciseName) ??
    anchors.find((anchor) => anchor.exerciseName && classifyAnchorMovementFamily(anchor.exerciseName, anchor.pattern) === family) ??
    null
  );
}

function benchmarkStatusLabel(anchor: CoachExportAnchorLift) {
  if (anchor.benchmarkStatus === "missing_date" || anchor.status === "missing_date") return "Date unavailable";
  if (anchor.benchmarkStatus === "recent") return "Recent benchmark";
  if (anchor.benchmarkStatus === "historical" || anchor.status === "historical_anchor") return "Historical benchmark";
  if (anchor.benchmarkStatus === "stale" || anchor.status === "stale_anchor") return "Stale benchmark";
  return "Performance benchmark";
}

function interpretationFor(entry: MovementCoverageEntry) {
  const label = entry.label.toLowerCase();
  if (entry.label === "Carry" && (entry.directEffectiveSets7d ?? 0) <= 0 && (entry.supportEffectiveSets7d ?? 0) > 0) {
    return "Grip and upper-trap support occurred, but no recent loaded carry was recorded.";
  }
  if (entry.label === "Glute Extension" && (entry.directEffectiveSets7d ?? 0) <= 0 && (entry.supportEffectiveSets7d ?? 0) > 0) {
    return "Glute-max stimulus is present through hinge and leg work, but no direct glute-extension movement was recorded in the last 7 days.";
  }
  if (entry.status === "missing") {
    if (entry.performanceAnchor) return `${entry.label} has a historical performance benchmark, but no recent ${label} movement was found.`;
    return `${entry.label} is currently absent from the recent training window.`;
  }
  if (entry.label === "Hip Stability") {
    if (entry.status === "strong") return "Hip-stability control work is repeated across recent sessions.";
    if (entry.status === "covered") return "Hip-stability work is adequately covered through recent direct and control exposure.";
    return "Hip-stability work is present but remains a developing control pattern.";
  }
  if (entry.relationship === "same_exercise" && entry.performanceAnchor?.status && entry.performanceAnchor.status !== "Current") {
    return `Recent ${label} work uses the same exercise as the historical performance benchmark.`;
  }
  if (entry.relationship === "same_family_different_exercise") {
    return `Recent ${label} work is covered by a current movement in the same family as the historical benchmark.`;
  }
  if (entry.relationship === "current_only") return `Recent ${label} work is present without a calculated performance benchmark.`;
  return `Recent ${label} work is ${entry.status === "strong" ? "strong" : entry.status === "covered" ? "adequately covered" : "present but still developing"}.`;
}

function summaryFor(entry: MovementCoverageEntry) {
  const status = entry.status.charAt(0).toUpperCase() + entry.status.slice(1).replace(/_/g, " ");
  return `${entry.label}: ${status} with ${entry.directEffectiveSets7d ?? entry.effectiveSets7d} direct set${(entry.directEffectiveSets7d ?? entry.effectiveSets7d) === 1 ? "" : "s"} across ${entry.sessionCount7d} session${entry.sessionCount7d === 1 ? "" : "s"}.`;
}

export function buildMovementCoverage(args: {
  sessions: Session[];
  sets: SetEntry[];
  tracks: Track[];
  exercises: Exercise[];
  weeklyVolume?: CoachExportWeeklyVolume;
  anchorIntelligence: CoachExportAnchorLift[];
  constraintSignals?: string[];
  asOf: number;
}): MovementCoverageSummary {
  void args.weeklyVolume;
  const asOf = Number.isFinite(args.asOf) ? args.asOf : Date.now();
  const tracksById = new Map((args.tracks ?? []).map((track) => [track.id, track]));
  const exercisesById = new Map((args.exercises ?? []).map((exercise) => [exercise.id, exercise]));
  const recentStrengthSessions = selectRecentStrengthBuildingSessions({
    sessions: args.sessions ?? [],
    sets: args.sets ?? [],
    tracks: args.tracks ?? [],
    limit: 8,
    asOf,
    maxAgeDays: RECENCY_WINDOW_DAYS,
  });
  const strengthIds = new Set(recentStrengthSessions.map((session) => session.id));
  const recentExposureSessions = (args.sessions ?? []).filter((session) => {
    if (session.deletedAt || strengthIds.has(session.id)) return false;
    const sessionAt = Number(session.endedAt ?? session.startedAt ?? 0);
    if (!Number.isFinite(sessionAt) || Math.floor(Math.max(0, asOf - sessionAt) / DAY_MS) > RECENCY_WINDOW_DAYS) return false;
    return (args.sets ?? []).some((set) => {
      const track = tracksById.get(set.trackId);
      return set.sessionId === session.id && !set.deletedAt && hasMeaningfulPayload(set) && track && isExposureTrackType(track.trackType);
    });
  });
  const recentSessions = [...recentStrengthSessions, ...recentExposureSessions].sort(
    (a, b) => Number(b.endedAt ?? b.startedAt ?? 0) - Number(a.endedAt ?? a.startedAt ?? 0)
  );
  const sevenDayCutoff = asOf - VOLUME_WINDOW_DAYS * DAY_MS;
  const accumulators = new Map<MovementCoverageFamily, Accumulator>(
    FAMILIES.map((family) => [family, { sessionIds7d: new Set(), exercises: new Map(), directEffectiveSets7d: 0, supportEffectiveSets7d: 0, controlExposures7d: 0, directControlExposures7d: 0 }])
  );

  for (const session of recentSessions) {
    const sessionSets = (args.sets ?? [])
      .filter((set) => !set.deletedAt && set.sessionId === session.id)
      .slice()
      .sort((a, b) => setTime(a, session) - setTime(b, session));
    for (const set of sessionSets) {
      if (!hasMeaningfulPayload(set)) continue;
      const track = tracksById.get(set.trackId);
      if (!track || !isRelevantTrackType(track.trackType)) continue;
      const exercise = track.exerciseId ? exercisesById.get(track.exerciseId) : undefined;
      const exerciseName = normalizeName(exercise?.name ?? track.displayName ?? "");
      if (!exerciseName) continue;
      const performedAt = setTime(set, session);
      if (!Number.isFinite(performedAt) || performedAt <= 0) continue;
      const evidence = evidenceForExercise(exerciseName, track);
      if (evidence.family) {
        const acc = accumulators.get(evidence.family)!;
        const current = acc.currentMovement;
        const days = ageDays(asOf, performedAt);
        if (!current || performedAt > current.performedAt) acc.currentMovement = { exerciseName, performedAt, ageDays: days };
        if (performedAt >= sevenDayCutoff) {
          acc.sessionIds7d.add(session.id);
          acc.directEffectiveSets7d = round(acc.directEffectiveSets7d + evidence.directSets);
          acc.supportEffectiveSets7d = round(acc.supportEffectiveSets7d + evidence.supportSets);
          acc.controlExposures7d += evidence.controlExposures;
          if (evidence.family === "hip_stability") acc.directControlExposures7d += evidence.controlExposures;
          addContribution(acc, exerciseName, performedAt, evidence.directSets, evidence.supportSets, evidence.controlExposures);
        }
      }
      if (evidence.hipSupportSets > 0 && performedAt >= sevenDayCutoff) {
        const hip = accumulators.get("hip_stability")!;
        hip.sessionIds7d.add(session.id);
        hip.supportEffectiveSets7d = round(hip.supportEffectiveSets7d + evidence.hipSupportSets);
        addContribution(hip, exerciseName, performedAt, 0, evidence.hipSupportSets, 0);
      }
      if (performedAt >= sevenDayCutoff) {
        for (const support of diagnosticSupportFamilies(exerciseName)) {
          if (support.family === evidence.family) continue;
          const acc = accumulators.get(support.family)!;
          acc.sessionIds7d.add(session.id);
          acc.supportEffectiveSets7d = round(acc.supportEffectiveSets7d + support.supportSets);
          addContribution(acc, exerciseName, performedAt, 0, support.supportSets, 0);
        }
      }
    }
  }

  const entries = FAMILIES.map((family) => {
    const acc = accumulators.get(family)!;
    const anchor = anchorForFamily(args.anchorIntelligence ?? [], family);
    const currentMovement = acc.currentMovement
      ? { exerciseName: acc.currentMovement.exerciseName, performedAt: new Date(acc.currentMovement.performedAt).toISOString(), ageDays: acc.currentMovement.ageDays }
      : undefined;
    const performanceAnchor = anchor?.exerciseName
      ? {
          legacyCategory: anchor.pattern,
          exerciseName: anchor.exerciseName,
          date: anchor.performedAt != null ? new Date(anchor.performedAt).toISOString() : undefined,
          ageDays: anchor.ageDays ?? undefined,
          status: benchmarkStatusLabel(anchor),
          e1rm: anchor.e1rm ?? undefined,
        }
      : undefined;
    const directEffectiveSets7d = round(acc.directEffectiveSets7d);
    const supportEffectiveSets7d = round(acc.supportEffectiveSets7d);
    const effectiveSets7d = round(directEffectiveSets7d + supportEffectiveSets7d);
    const controlExposures7d = acc.controlExposures7d;
    const sessionCount7d = acc.sessionIds7d.size;
    const status = statusForEntry({
      family,
      directSets: directEffectiveSets7d,
      supportSets: supportEffectiveSets7d,
      controlExposures: controlExposures7d,
      directControlExposures: acc.directControlExposures7d,
      sessionCount: sessionCount7d,
      hasCurrentMovement: Boolean(currentMovement),
    });
    const hasVerticalPushContext =
      family === "vertical_push" &&
      status === "missing" &&
      (args.constraintSignals ?? []).some((signal) => /\b(?:shoulder|overhead|vertical press|pressing pain|behind[-\s]?head)\b/i.test(signal));
    const entry: MovementCoverageEntry = {
      family,
      label: labelForFamily(family),
      status,
      lastPerformedDate: acc.currentMovement ? new Date(acc.currentMovement.performedAt).toISOString() : undefined,
      ageDays: acc.currentMovement?.ageDays,
      currentMovement,
      performanceAnchor,
      relationship: relationshipFor(currentMovement, anchor),
      effectiveSets7d,
      directEffectiveSets7d,
      supportEffectiveSets7d,
      controlExposures7d,
      sessionCount7d,
      contributingExercises: Array.from(acc.exercises.values())
        .sort((a, b) => b.lastPerformedAt - a.lastPerformedAt || b.effectiveSets - a.effectiveSets)
        .slice(0, 5)
        .map((item) => ({
          exerciseName: item.exerciseName,
          effectiveSets: round(item.effectiveSets),
          supportEffectiveSets: round(item.supportEffectiveSets),
          controlExposures: item.controlExposures,
          lastPerformedDate: new Date(item.lastPerformedAt).toISOString(),
        })),
      summary: "",
      interpretation: "",
      context: hasVerticalPushContext ? "This may be intentional while overhead shoulder sensitivity remains active." : undefined,
      isContextuallyAcceptable: hasVerticalPushContext || undefined,
    };
    entry.summary = summaryFor(entry);
    entry.interpretation = interpretationFor(entry);
    return entry;
  });

  const missingFamilies = entries.filter((entry) => entry.status === "missing").map((entry) => entry.label);
  const developingFamilies = entries.filter((entry) => entry.status === "developing").map((entry) => entry.label);
  const coveredFamilies = entries.filter((entry) => entry.status === "covered" || entry.status === "strong").map((entry) => entry.label);
  const status = entries.every((entry) => entry.status === "missing" || entry.status === "not_enough_data")
    ? "not_enough_data"
    : missingFamilies.length >= 4
      ? "intervene"
      : missingFamilies.length || developingFamilies.length
        ? "watch"
        : "solid";
  const summary = [
    `${coveredFamilies.length} of ${entries.length} movement families have adequate recent coverage.`,
    developingFamilies.length ? `${developingFamilies.join(", ")} ${developingFamilies.length === 1 ? "is" : "are"} developing.` : null,
    missingFamilies.length ? `${missingFamilies.join(", ")} ${missingFamilies.length === 1 ? "is" : "are"} missing.` : null,
  ].filter(Boolean).join(" ");

  return {
    asOf: new Date(asOf).toISOString(),
    volumeWindowDays: VOLUME_WINDOW_DAYS,
    recencyWindowDays: RECENCY_WINDOW_DAYS,
    status,
    entries,
    missingFamilies,
    developingFamilies,
    coveredFamilies,
    summary,
  };
}
