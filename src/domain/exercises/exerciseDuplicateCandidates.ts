import type { Exercise } from "../../db";
import { normalizeName } from "../../db";

export type ExerciseDuplicateRecommendation = "safe merge" | "review" | "keep separate";

export type ExerciseDuplicateEvidenceRow = {
  exerciseId: string;
  name: string;
  normalizedName: string;
  aliases: string[];
  aliasKeys: string[];
  bodyPart?: string;
  category?: string;
  equipment?: string;
  trackCount: number;
  templateItemCount: number;
  sessionItemCount: number;
  setCount: number;
  archived: boolean;
  merged: boolean;
};

export type ExerciseDuplicateCandidate = {
  exerciseId: string;
  name: string;
  confidence: "high" | "medium";
  recommendation: ExerciseDuplicateRecommendation;
  reason: string;
  evidence: {
    aliases: string[];
    equipment?: string;
    category?: string;
    bodyPart?: string;
    trackCount: number;
    templateItemCount: number;
    sessionItemCount: number;
    setCount: number;
  };
};

function cleanStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    const text = String(entry || "").trim();
    if (!text) continue;
    const key = normalizeName(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

export function exerciseDuplicateAuditKey(raw: string): string {
  return normalizeName(String(raw || ""))
    .replace(/\bdb\b/g, "dumbbell")
    .replace(/\bbb\b/g, "barbell")
    .replace(/\bkb\b/g, "kettlebell")
    .replace(/\bbw\b/g, "bodyweight")
    .replace(/\bpullups\b/g, "pull up")
    .replace(/\bpullup\b/g, "pull up")
    .replace(/\bpull-ups\b/g, "pull up")
    .replace(/\bchinups\b/g, "chin up")
    .replace(/\bchinup\b/g, "chin up")
    .replace(/\bchin-ups\b/g, "chin up")
    .replace(/\bpulldowns\b/g, "pulldown")
    .replace(/\bpull down\b/g, "pulldown")
    .replace(/\bpull downs\b/g, "pull down")
    .replace(/[()/.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function classifyExerciseDuplicateRows(rows: ExerciseDuplicateEvidenceRow[]): {
  recommendation: ExerciseDuplicateRecommendation;
  reason: string;
} {
  const names = rows.map((r) => r.name);
  const nameKeys = rows.map((r) => exerciseDuplicateAuditKey(r.name));

  const distinctNameKeys = Array.from(new Set(nameKeys));
  const distinctEquipment = Array.from(
    new Set(rows.map((r) => String(r.equipment || "").trim()).filter(Boolean))
  );
  const distinctCategories = Array.from(
    new Set(rows.map((r) => String(r.category || "").trim()).filter(Boolean))
  );

  const machineSignals = names.filter((n) => /machine|mts|selectorized|plate loaded/i.test(n)).length;

  const aliasToOtherNameOverlap = rows.some((row, i) =>
    row.aliasKeys.some((aliasKey) =>
      rows.some((other, j) => i !== j && aliasKey === exerciseDuplicateAuditKey(other.name))
    )
  );

  const aliasToOtherAliasOverlap = rows.some((row, i) =>
    row.aliasKeys.some((aliasKey) =>
      rows.some((other, j) => i !== j && other.aliasKeys.includes(aliasKey))
    )
  );

  const exactNameMatch = distinctNameKeys.length === 1;
  const sameMeta = distinctEquipment.length <= 1 && distinctCategories.length <= 1;

  if (aliasToOtherNameOverlap && sameMeta) {
    return {
      recommendation: "safe merge",
      reason:
        "One exercise name is already present as an alias on another exercise, which strongly suggests a duplicate.",
    };
  }

  if (exactNameMatch && sameMeta && machineSignals === 0) {
    return {
      recommendation: "safe merge",
      reason: "Same normalized name, same equipment/category, no machine-specific split detected.",
    };
  }

  if (exactNameMatch && sameMeta && machineSignals > 0) {
    return {
      recommendation: "review",
      reason: "Looks closely related, but one or more names suggest a machine-specific variant.",
    };
  }

  if ((aliasToOtherAliasOverlap || aliasToOtherNameOverlap) && sameMeta) {
    return {
      recommendation: "review",
      reason: "Alias overlap suggests a likely duplicate, but naming still deserves a quick review.",
    };
  }

  return {
    recommendation: "keep separate",
    reason: "Names are related, but equipment/category or naming pattern suggests these may be distinct exercises.",
  };
}

export function buildExerciseDuplicateEvidenceRows(args: {
  exercises: Exercise[];
  tracks: any[];
  templateItems: any[];
  sessionItems: any[];
  sets: any[];
}): ExerciseDuplicateEvidenceRow[] {
  const { exercises, tracks, templateItems, sessionItems, sets } = args;

  const trackCountByExerciseId = new Map<string, number>();
  const templateItemCountByExerciseId = new Map<string, number>();
  const sessionItemCountByExerciseId = new Map<string, number>();
  const setCountByExerciseId = new Map<string, number>();

  const trackById = new Map<string, any>();
  for (const t of tracks) {
    if (!t?.id) continue;
    trackById.set(String(t.id), t);

    const exId = String(t.exerciseId ?? "");
    if (!exId) continue;
    trackCountByExerciseId.set(exId, (trackCountByExerciseId.get(exId) ?? 0) + 1);
  }

  for (const item of templateItems) {
    const track = trackById.get(String(item?.trackId ?? ""));
    const exId = String(track?.exerciseId ?? "");
    if (!exId) continue;
    templateItemCountByExerciseId.set(exId, (templateItemCountByExerciseId.get(exId) ?? 0) + 1);
  }

  for (const item of sessionItems) {
    const track = trackById.get(String(item?.trackId ?? ""));
    const exId = String(track?.exerciseId ?? "");
    if (!exId) continue;
    sessionItemCountByExerciseId.set(exId, (sessionItemCountByExerciseId.get(exId) ?? 0) + 1);
  }

  for (const se of sets) {
    const track = trackById.get(String(se?.trackId ?? ""));
    const exId = String(track?.exerciseId ?? "");
    if (!exId) continue;
    setCountByExerciseId.set(exId, (setCountByExerciseId.get(exId) ?? 0) + 1);
  }

  return exercises.map((exercise) => {
    const aliases = cleanStringArray((exercise as any).aliases);
    const aliasKeys = aliases.map((alias) => exerciseDuplicateAuditKey(alias)).filter(Boolean);

    return {
      exerciseId: exercise.id,
      name: exercise.name,
      normalizedName: exercise.normalizedName,
      aliases,
      aliasKeys,
      bodyPart: exercise.bodyPart,
      category: (exercise as any).category,
      equipment: (exercise as any).equipment,
      trackCount: trackCountByExerciseId.get(exercise.id) ?? 0,
      templateItemCount: templateItemCountByExerciseId.get(exercise.id) ?? 0,
      sessionItemCount: sessionItemCountByExerciseId.get(exercise.id) ?? 0,
      setCount: setCountByExerciseId.get(exercise.id) ?? 0,
      archived: !!exercise.archivedAt,
      merged: !!(exercise as any).mergedIntoExerciseId,
    };
  });
}

export function buildExerciseDuplicateCandidates(args: {
  rawName: string;
  exercises: Exercise[];
  tracks: any[];
  templateItems: any[];
  sessionItems: any[];
  sets: any[];
  maxCandidates?: number;
}): ExerciseDuplicateCandidate[] {
  const inputName = String(args.rawName || "").trim();
  const inputKey = exerciseDuplicateAuditKey(inputName);
  if (!inputKey) return [];

  const rows = buildExerciseDuplicateEvidenceRows(args);
  const incomingRow: ExerciseDuplicateEvidenceRow = {
    exerciseId: "__incoming__",
    name: inputName,
    normalizedName: normalizeName(inputName),
    aliases: [],
    aliasKeys: [],
    trackCount: 0,
    templateItemCount: 0,
    sessionItemCount: 0,
    setCount: 0,
    archived: false,
    merged: false,
  };

  const candidates = rows
    .filter((row) => !row.archived && !row.merged)
    .map((row) => {
      const inputMatchesName = exerciseDuplicateAuditKey(row.name) === inputKey;
      const inputMatchesAlias = row.aliasKeys.includes(inputKey);
      if (!inputMatchesName && !inputMatchesAlias) return null;

      const classification = classifyExerciseDuplicateRows([incomingRow, row]);
      if (classification.recommendation === "keep separate") return null;

      return {
        exerciseId: row.exerciseId,
        name: row.name,
        confidence: classification.recommendation === "safe merge" ? "high" : "medium",
        recommendation: classification.recommendation,
        reason: classification.reason,
        evidence: {
          aliases: row.aliases,
          equipment: row.equipment,
          category: row.category,
          bodyPart: row.bodyPart,
          trackCount: row.trackCount,
          templateItemCount: row.templateItemCount,
          sessionItemCount: row.sessionItemCount,
          setCount: row.setCount,
        },
      } satisfies ExerciseDuplicateCandidate;
    })
    .filter((row): row is ExerciseDuplicateCandidate => !!row)
    .sort((a, b) => {
      const score = (row: ExerciseDuplicateCandidate) =>
        (row.confidence === "high" ? 1000 : 0) +
        row.evidence.setCount * 10 +
        row.evidence.sessionItemCount * 5 +
        row.evidence.templateItemCount * 3 +
        row.evidence.trackCount;
      const delta = score(b) - score(a);
      if (delta !== 0) return delta;
      return a.name.localeCompare(b.name);
    });

  return candidates.slice(0, Math.max(1, args.maxCandidates ?? 3));
}
