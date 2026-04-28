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
};

const MAX_BULLETS_PER_CATEGORY = 4;

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

function canonicalizeSignal(value: string) {
  const text = value.toLowerCase();
  if (/medial delt|lateral delt/.test(text)) return "shoulder-delt-isolation";
  if (/behind-the-neck|overhead pressing range|shoulder twinge|vertical pressing/.test(text)) {
    return "shoulder-overhead-safety";
  }
  if (/trap compensation|trap involvement/.test(text)) return "carry-trap-compensation";
  if (/lat-driven pulling|lat stimulus|lat dominance/.test(text)) return "pull-lat-pattern";
  if (/terminal reps|terminal-rep quality/.test(text)) return "terminal-rep-fatigue";
  if (/joint feedback|elbow pain|elbow|knee pain|shoulder sensitive|shoulder pain/.test(text)) {
    return "joint-feedback";
  }
  if (/form breakdown|adding load|too heavy|too light/.test(text)) return "load-and-form-control";
  if (/stopped due to/.test(text)) return "stopped-movement";
  if (/improved stretch and contraction/.test(text)) return "improved-stretch-contraction";
  if (/breakthrough/.test(text)) return "breakthrough-pattern";
  if (/reduced capacity|cut short|fatigue showed up/.test(text)) return "reduced-capacity";
  return text.replace(/[^a-z0-9]+/g, " ").trim();
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
      text: "Pull stimulus consistently strong",
      score: 8,
    });
  }

  if (/medial delt|lateral delt/.test(text)) {
    candidates.push({
      category: "movementQuality",
      key: "delt-isolation-inconsistent",
      text: "Lateral delt isolation remains inconsistent",
      score: 8,
    });
    candidates.push({
      category: "stimulus",
      key: "shoulder-isolation-inconsistent",
      text: "Shoulder isolation inconsistent across sessions",
      score: 7,
    });
    candidates.push({
      category: "progression",
      key: "isolation-not-stable",
      text: "Isolation movements are not yet stable",
      score: 7,
    });
  }

  if (/terminal reps|terminal-rep quality/.test(text)) {
    candidates.push({
      category: "fatigue",
      key: "terminal-rep-fatigue",
      text: "Fatigue consistently appears at terminal reps",
      score: 8,
    });
  }

  if (/reduced capacity|cut short|fatigue showed up/.test(text)) {
    candidates.push({
      category: "fatigue",
      key: "reduced-capacity-later-sets",
      text: "Reduced capacity observed in later sets",
      score: 7,
    });
  }

  if (/behind-the-neck|overhead pressing range|shoulder twinge|vertical pressing/.test(text)) {
    candidates.push({
      category: "movementQuality",
      key: "shoulder-overhead-sensitivity",
      text: "Shoulder sensitivity appears in overhead positions",
      score: 9,
    });
    candidates.push({
      category: "constraints",
      key: "shoulder-overhead-constraint",
      text: "Shoulder sensitivity linked to behind-head or overhead positions",
      score: 10,
    });
  }

  if (/stopped due to/.test(text)) {
    candidates.push({
      category: "constraints",
      key: "stopped-movements-recurring",
      text: "Pain or twinge has interrupted at least one recent movement",
      score: 10,
    });
  }

  if (/elbow pain|joint feedback/.test(text)) {
    candidates.push({
      category: "constraints",
      key: "joint-feedback-under-fatigue",
      text: "Joint feedback appears under higher-fatigue conditions",
      score: 9,
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
      text: "Trap compensation remains a recurring carry constraint",
      score: 7,
    });
  }

  if (/push: chest-dominant pressing with stable mechanics/.test(text)) {
    candidates.push({
      category: "stimulus",
      key: "pressing-stimulus-stable",
      text: "Press stimulus is generally stable across recent sessions",
      score: 6,
    });
  }

  if (/load looked too heavy|pressing progression controlled|form breakdown|adding load/.test(text)) {
    candidates.push({
      category: "progression",
      key: "pressing-progression-constrained",
      text: "Pressing progression is still constrained by setup and fatigue quality",
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
    .slice(0, 4);
}

export function buildPatternSummary(ctx: {
  sessions: CompletedSession[];
  trainingSignals: CoachExportTrainingSignals;
}): PatternSummary {
  const recentSessions = sortRecentSessions(ctx.sessions);
  const seedSignals = uniqueCompact([
    ...ctx.trainingSignals.movementQuality,
    ...ctx.trainingSignals.stimulusCoverage,
    ...ctx.trainingSignals.fatigueReadiness,
    ...ctx.trainingSignals.nextWorkoutFocus,
    ...ctx.trainingSignals.discussWithGaz,
  ], 40);

  const byCategory: Record<PatternCategory, string[]> = {
    movementQuality: [],
    stimulus: [],
    fatigue: [],
    constraints: [],
    progression: [],
  };

  if (recentSessions.length < 2 || seedSignals.length === 0) {
    return byCategory;
  }

  const aggregate = new Map<
    string,
    {
      category: PatternCategory;
      text: string;
      score: number;
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
          seenSessions: new Set<number>(),
        };
        const recencyWeight = Math.max(1, 4 - sessionIndex);
        current.score += candidate.score + recencyWeight;
        current.seenSessions.add(sessionIndex);
        aggregate.set(key, current);
      });
    });
  });

  const grouped = Array.from(aggregate.values())
    .filter((entry) => entry.seenSessions.size >= 2)
    .sort((a, b) => {
      if (b.seenSessions.size !== a.seenSessions.size) {
        return b.seenSessions.size - a.seenSessions.size;
      }
      return b.score - a.score;
    });

  grouped.forEach((entry) => {
    const bucket = byCategory[entry.category];
    if (bucket.length >= MAX_BULLETS_PER_CATEGORY) return;
    bucket.push(entry.text);
  });

  return {
    movementQuality: uniqueCompact(byCategory.movementQuality, MAX_BULLETS_PER_CATEGORY),
    stimulus: uniqueCompact(byCategory.stimulus, MAX_BULLETS_PER_CATEGORY),
    fatigue: uniqueCompact(byCategory.fatigue, MAX_BULLETS_PER_CATEGORY),
    constraints: uniqueCompact(byCategory.constraints, MAX_BULLETS_PER_CATEGORY),
    progression: uniqueCompact(byCategory.progression, MAX_BULLETS_PER_CATEGORY),
  };
}
