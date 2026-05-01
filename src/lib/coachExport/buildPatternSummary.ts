import type {
  CoachExportTrainingSignals,
  PatternSummary,
} from "./types";

export type CompletedSession = {
  id: string;
  endedAt: number | null | undefined;
  trainingSignals: CoachExportTrainingSignals;
};

type PatternCategory =
  | "movementQuality"
  | "stimulus"
  | "fatigue"
  | "constraints"
  | "progression";

type PatternCandidate = {
  category: PatternCategory;
  key: string;
  text: string;
  score: number;
  allowEmerging?: boolean;
};

const MAX_BULLETS_PER_CATEGORY = 4;
const LOOKBACK_SESSIONS = 4;

function uniqueCompact(values: Array<string | null | undefined>, limit = 4): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const value = String(raw ?? "").replace(/\s+/g, " ").trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= limit) break;
  }
  return out;
}

function withFrequency(text: string, seenCount: number, totalCount: number) {
  return `${text} (${seenCount}/${totalCount})`;
}

function buildPatternCandidates(signal: string): PatternCandidate[] {
  const text = signal.toLowerCase();
  const candidates: PatternCandidate[] = [];

  if (/lat dominance|lat stimulus|improved stretch and contraction|breakthrough/.test(text)) {
    candidates.push({
      category: "movementQuality",
      key: "lat-engagement-improving",
      text: "Lat engagement improving across recent pull work",
      score: 8,
    });
    candidates.push({
      category: "progression",
      key: "pulling-consistency-improving",
      text: "Pulling movements show improving consistency",
      score: 9,
    });
  }

  if (/pull: strong lat stimulus/.test(text)) {
    candidates.push({
      category: "stimulus",
      key: "pull-stimulus-strong",
      text: "Pull stimulus remains repeatable across recent sessions",
      score: 8,
    });
  }

  if (/medial delt|lateral delt/.test(text)) {
    candidates.push({
      category: "movementQuality",
      key: "delt-isolation-inconsistent",
      text: "Lateral delt isolation remains inconsistent across shoulder work",
      score: 8,
    });
    candidates.push({
      category: "stimulus",
      key: "shoulder-isolation-inconsistent",
      text: "Shoulder isolation stimulus remains inconsistent across sessions",
      score: 7,
    });
    candidates.push({
      category: "progression",
      key: "isolation-not-stable",
      text: "Isolation movements are not yet repeatable enough to progress confidently",
      score: 7,
    });
  }

  if (/glutes engaged better|good engagement in glutes|glute engagement/.test(text)) {
    candidates.push({
      category: "movementQuality",
      key: "glute-engagement-noted",
      text: "Glute engagement was noted across lower-body work",
      score: 7,
    });
    candidates.push({
      category: "stimulus",
      key: "glute-stimulus-noted",
      text: "Glute stimulus was noted across recent lower-body sessions",
      score: 6,
    });
  }

  if (/hamstrings took over|hamstring dominance|poor engagement in hamstrings/.test(text)) {
    candidates.push({
      category: "movementQuality",
      key: "hamstring-takeover-repeated",
      text: "Hamstring takeover appeared in recent lower-body notes",
      score: 7,
    });
    candidates.push({
      category: "constraints",
      key: "hamstring-dominance-constraint",
      text: "Hamstring dominance appeared in repeated lower-body notes",
      score: 7,
    });
  }

  if (/quad burn showed up late|good engagement in quads|poor engagement in quads|stimulus reached quads|stimulus missed quads/.test(text)) {
    candidates.push({
      category: "stimulus",
      key: "quad-stimulus-repeated",
      text: "Quad stimulus was noted across recent lower-body sessions",
      score: 6,
    });
  }

  if (/lost brace|core tension improved|ribs flared|brace on final reps|core bracing/.test(text)) {
    candidates.push({
      category: "movementQuality",
      key: "core-bracing-inconsistency",
      text: "Core bracing themes appeared across compound-lift notes",
      score: 8,
    });
    candidates.push({
      category: "fatigue",
      key: "bracing-degrades-under-fatigue",
      text: "Bracing quality changed under fatigue in recent notes",
      score: 7,
    });
  }

  if (/balance limited|less stable|unstable|instability|unilateral control/.test(text)) {
    candidates.push({
      category: "movementQuality",
      key: "balance-stability-limits",
      text: "Balance or stability limits appeared in recent unilateral work",
      score: 7,
    });
    candidates.push({
      category: "constraints",
      key: "unilateral-stability-constraint",
      text: "Unilateral stability differences appeared in recent notes",
      score: 7,
    });
  }

  if (/left side less stable|right side less stable|left side|right side/.test(text)) {
    candidates.push({
      category: "constraints",
      key: "side-to-side-asymmetry",
      text: "Side-to-side stability differences appeared in repeated notes",
      score: 6,
    });
  }

  if (/controlled descent|tempo|eccentric/.test(text)) {
    candidates.push({
      category: "movementQuality",
      key: "tempo-control-repeated",
      text: "Tempo or descent control was noted across recent sessions",
      score: 6,
    });
  }

  if (/range shortened under fatigue|shortened range|range of motion|reduced range|rom/.test(text)) {
    candidates.push({
      category: "fatigue",
      key: "range-degrades-under-fatigue",
      text: "Range of motion changed under fatigue in recent notes",
      score: 7,
    });
  }

  if (/terminal reps|terminal-rep quality/.test(text)) {
    candidates.push({
      category: "fatigue",
      key: "terminal-rep-fatigue",
      text: "Fatigue shows up at terminal reps across recent working sets",
      score: 8,
    });
  }

  if (/reduced capacity|cut short|fatigue showed up/.test(text)) {
    candidates.push({
      category: "fatigue",
      key: "reduced-capacity-later-sets",
      text: "Reduced capacity shows up in later sets across recent sessions",
      score: 7,
    });
  }

  if (/behind-the-neck|overhead pressing range|shoulder twinge|vertical pressing/.test(text)) {
    candidates.push({
      category: "movementQuality",
      key: "shoulder-overhead-sensitivity",
      text: "Shoulder sensitivity appears in overhead or vertical pressing positions",
      score: 9,
      allowEmerging: true,
    });
    candidates.push({
      category: "constraints",
      key: "shoulder-overhead-constraint",
      text: "Shoulder sensitivity is linked to behind-head or overhead positions",
      score: 10,
      allowEmerging: true,
    });
  }

  if (/stopped due to/.test(text)) {
    candidates.push({
      category: "constraints",
      key: "stopped-movements-recurring",
      text: "Pain or twinge has interrupted recent movement quality",
      score: 10,
      allowEmerging: true,
    });
  }

  if (/elbow pain|joint feedback/.test(text)) {
    candidates.push({
      category: "constraints",
      key: "joint-feedback-under-fatigue",
      text: "Joint feedback appears under higher-fatigue conditions",
      score: 9,
      allowEmerging: true,
    });
  }

  if (/trap compensation|trap involvement/.test(text)) {
    candidates.push({
      category: "movementQuality",
      key: "trap-compensation-carries",
      text: "Trap compensation still appears during carry work",
      score: 7,
    });
    candidates.push({
      category: "constraints",
      key: "trap-compensation-constraint",
      text: "Trap compensation remains a carry constraint",
      score: 7,
    });
  }

  // Intentionally do not emit a generic "pressing stimulus stable" pattern.
  // Stable press mechanics already appear in Training Signals and only become
  // useful here when paired with a specific repeated constraint.

  if (/load looked too heavy|pressing progression controlled|form breakdown|adding load/.test(text)) {
    candidates.push({
      category: "progression",
      key: "pressing-progression-constrained",
      text: "Pressing progression is constrained by setup or fatigue quality",
      score: 6,
    });
  }

  return candidates;
}

function sortRecentSessions(sessions: CompletedSession[]) {
  return (sessions ?? [])
    .filter((session) => Number.isFinite(session.endedAt ?? NaN))
    .slice()
    .sort((a, b) => Number(b.endedAt ?? 0) - Number(a.endedAt ?? 0))
    .slice(0, LOOKBACK_SESSIONS);
}

export function buildPatternSummary(ctx: {
  sessions: CompletedSession[];
  trainingSignals: CoachExportTrainingSignals;
}): PatternSummary {
  const recentSessions = sortRecentSessions(ctx.sessions);

  const byCategory: Record<PatternCategory, string[]> = {
    movementQuality: [],
    stimulus: [],
    fatigue: [],
    constraints: [],
    progression: [],
  };

  if (recentSessions.length < 2) {
    return byCategory;
  }

  const aggregate = new Map<
    string,
    {
      category: PatternCategory;
      text: string;
      score: number;
      allowEmerging: boolean;
      seenSessions: Set<number>;
    }
  >();

  recentSessions.forEach((session, sessionIndex) => {
    const scopedSignals = uniqueCompact([
      ...session.trainingSignals.movementQuality,
      ...session.trainingSignals.stimulusCoverage,
      ...session.trainingSignals.fatigueReadiness,
      ...session.trainingSignals.nextWorkoutFocus,
      ...session.trainingSignals.discussWithGaz,
    ], 24);

    scopedSignals.forEach((signal) => {
      buildPatternCandidates(signal).forEach((candidate) => {
        const key = `${candidate.category}:${candidate.key}`;
        const current = aggregate.get(key) ?? {
          category: candidate.category,
          text: candidate.text,
          score: 0,
          allowEmerging: Boolean(candidate.allowEmerging),
          seenSessions: new Set<number>(),
        };

        const recencyWeight = Math.max(1, LOOKBACK_SESSIONS - sessionIndex);
        current.score += candidate.score + recencyWeight;
        current.allowEmerging = current.allowEmerging || Boolean(candidate.allowEmerging);
        current.seenSessions.add(sessionIndex);
        aggregate.set(key, current);
      });
    });
  });

  const grouped = Array.from(aggregate.values())
    .filter((entry) => entry.seenSessions.size >= 2 || entry.allowEmerging)
    .sort((a, b) => {
      if (b.seenSessions.size !== a.seenSessions.size) {
        return b.seenSessions.size - a.seenSessions.size;
      }
      return b.score - a.score;
    });

  grouped.forEach((entry) => {
    const bucket = byCategory[entry.category];
    if (bucket.length >= MAX_BULLETS_PER_CATEGORY) return;

    const seenCount = entry.seenSessions.size;
    const totalCount = recentSessions.length;
    const prefix = seenCount >= 2 ? "" : "Emerging: ";
    bucket.push(withFrequency(`${prefix}${entry.text}`, seenCount, totalCount));
  });

  return {
    movementQuality: uniqueCompact(byCategory.movementQuality, MAX_BULLETS_PER_CATEGORY),
    stimulus: uniqueCompact(byCategory.stimulus, MAX_BULLETS_PER_CATEGORY),
    fatigue: uniqueCompact(byCategory.fatigue, MAX_BULLETS_PER_CATEGORY),
    constraints: uniqueCompact(byCategory.constraints, MAX_BULLETS_PER_CATEGORY),
    progression: uniqueCompact(byCategory.progression, MAX_BULLETS_PER_CATEGORY),
  };
}
