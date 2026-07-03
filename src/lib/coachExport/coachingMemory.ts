import type {
  CoachingMemory,
  CoachingMemoryItem,
  CoachExportTrainingSignals,
  PatternSummary,
} from "./types";
import type { CompletedSession } from "./buildPatternSummary";

type BuildCoachingMemoryInput = {
  completedSessions?: CompletedSession[];
  trainingSignals: CoachExportTrainingSignals;
  patternSummary?: PatternSummary;
};

type MemoryCandidate = {
  text: string;
  sourceType: CoachingMemoryItem["sourceType"];
  sourceSessionId?: string;
  lastSeenAt?: number;
};

export function normalizeCoachingMemoryText(value: string) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .replace(/[.]+$/g, "")
    .trim()
    .toLowerCase();
}

export function isValidatedLearningSignal(value: string) {
  const text = normalizeCoachingMemoryText(value);
  if (!text) return false;
  if (
    /\b(?:not counted|form breakdown|form breaking|terminal[-\s]?rep|terminal reps|joint feedback|pain|twinge|fatigue|too heavy|equipment|rejected|stopped due to|sensitive|compensation|trap involvement)\b/i.test(text)
  ) {
    return false;
  }

  return (
    /\breinforced gaz'?s cues\b/i.test(text) ||
    /\bfelt (?:super )?grounded\b/i.test(text) ||
    /\bgrounded hinge\b/i.test(text) ||
    /\bfelt stable\b/i.test(text) ||
    /\bbreakthrough\b/i.test(text) ||
    /\bvalidated\b/i.test(text) ||
    /\bclicked\b/i.test(text) ||
    /\bsmoother\b/i.test(text) ||
    /\bcleaner\b/i.test(text) ||
    /\bbetter control\b/i.test(text) ||
    /\btarget[-\s]?muscle\b/i.test(text) ||
    /\bstimulus (?:was )?strong\b/i.test(text) ||
    /\bstrong .+ stimulus\b/i.test(text) ||
    /\bsuccessful substitution\b/i.test(text) ||
    /\breplacement worked\b/i.test(text) ||
    /\bimproved (?:stretch|contraction|execution|control)\b/i.test(text) ||
    /\blat dominance achieved\b/i.test(text) ||
    /\bno biceps\/trap takeover\b/i.test(text)
  );
}

export function isGenericStaleDiscussPrompt(value: string) {
  const text = normalizeCoachingMemoryText(value);
  if (!text) return true;
  return (
    /\bconfirm\b.*\bsubstitution\b.*\b(?:stays|stay|remains|remain|next session)\b/i.test(text) ||
    /^confirm whether the substitution stays in next session$/i.test(text)
  );
}

function isActiveWatchSignal(value: string) {
  const text = normalizeCoachingMemoryText(value);
  if (!text || isGenericStaleDiscussPrompt(text)) return false;
  return (
    /\b(?:not counted|form breakdown|form breaking|terminal[-\s]?rep|terminal reps|joint feedback|pain|twinge|fatigue|too heavy|equipment|rejected|stopped due to|sensitive|range of motion|rom|load looked too heavy|review form breakdown)\b/i.test(text) ||
    /\b(?:constraint|constrained|monitor|watch|caution|limited|dropped|quality dropped)\b/i.test(text)
  );
}

function isResolvedSignal(value: string) {
  const text = normalizeCoachingMemoryText(value);
  return /\b(?:resolved|quiet|pain[-\s]?free|replacement established|substitution worked)\b/i.test(text);
}

function labelFor(text: string) {
  const colonIndex = text.indexOf(":");
  if (colonIndex > 0) return text.slice(0, colonIndex).trim();
  return text;
}

function exerciseNameFor(text: string) {
  const colonIndex = text.indexOf(":");
  if (colonIndex <= 0) return undefined;
  const name = text.slice(0, colonIndex).trim();
  return name && !/^(pull|push|shoulders|legs|lower|upper)$/i.test(name) ? name : undefined;
}

function confidenceFor(evidenceCount: number): CoachingMemoryItem["confidence"] {
  if (evidenceCount >= 3) return "high";
  if (evidenceCount >= 2) return "moderate";
  return "low";
}

function severityFor(text: string): "low" | "moderate" | "high" {
  const normalized = normalizeCoachingMemoryText(text);
  if (/\b(?:pain|twinge|joint feedback|stopped due to|severe|sharp)\b/i.test(normalized)) return "high";
  if (/\b(?:form breakdown|terminal[-\s]?rep|fatigue|equipment|rejected|too heavy|constraint|watch|caution)\b/i.test(normalized)) {
    return "moderate";
  }
  return "low";
}

function compactMemoryItems(
  kind: CoachingMemoryItem["kind"],
  candidates: MemoryCandidate[],
  limit = 4
): CoachingMemoryItem[] {
  const byKey = new Map<string, MemoryCandidate & { evidenceCount: number }>();
  for (const candidate of candidates) {
    const text = String(candidate.text ?? "").replace(/\s+/g, " ").trim();
    const key = normalizeCoachingMemoryText(text);
    if (!key) continue;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...candidate, text, evidenceCount: 1 });
      continue;
    }
    existing.evidenceCount += 1;
    if ((candidate.lastSeenAt ?? -Infinity) > (existing.lastSeenAt ?? -Infinity)) {
      existing.text = text;
      existing.sourceSessionId = candidate.sourceSessionId;
      existing.lastSeenAt = candidate.lastSeenAt;
      existing.sourceType = candidate.sourceType;
    }
  }

  return Array.from(byKey.entries())
    .sort(([, a], [, b]) => (b.lastSeenAt ?? 0) - (a.lastSeenAt ?? 0) || b.evidenceCount - a.evidenceCount)
    .slice(0, limit)
    .map(([key, item]) => ({
      id: `${kind}:${key.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
      kind,
      label: labelFor(item.text),
      sourceType: item.sourceType,
      sourceSessionId: item.sourceSessionId,
      exerciseName: exerciseNameFor(item.text),
      confidence: confidenceFor(item.evidenceCount),
      evidenceCount: item.evidenceCount,
      lastSeenAt: item.lastSeenAt,
      severity: kind === "active_watch" ? severityFor(item.text) : undefined,
      status: kind === "resolved" ? "resolved" : "active",
      text: item.text,
    }));
}

function sessionCandidates(
  sessions: CompletedSession[] | undefined,
  selector: (signals: CoachExportTrainingSignals) => string[]
): MemoryCandidate[] {
  return (sessions ?? []).flatMap((session) =>
    selector(session.trainingSignals).map((text) => ({
      text,
      sourceType: "session_signal" as const,
      sourceSessionId: session.id,
      lastSeenAt: session.endedAt ?? undefined,
    }))
  );
}

function fallbackCandidates(values: string[], sourceType: CoachingMemoryItem["sourceType"]): MemoryCandidate[] {
  return values.map((text) => ({ text, sourceType }));
}

function sourceWindow(sessions: CompletedSession[] | undefined): CoachingMemory["sourceWindow"] {
  const dated = (sessions ?? [])
    .map((session) => session.endedAt)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    .sort((a, b) => a - b);
  return {
    sessionCount: sessions?.length ?? 0,
    fromDate: dated[0] != null ? new Date(dated[0]).toISOString() : undefined,
    toDate: dated[dated.length - 1] != null ? new Date(dated[dated.length - 1]).toISOString() : undefined,
  };
}

export function buildCoachingMemory(input: BuildCoachingMemoryInput): CoachingMemory {
  const sessionLearningCandidates = sessionCandidates(input.completedSessions, (signals) => [
    ...signals.movementQuality,
    ...signals.stimulusCoverage,
  ]);
  const fallbackLearningCandidates = fallbackCandidates(
    [
      ...input.trainingSignals.movementQuality,
      ...input.trainingSignals.stimulusCoverage,
    ],
    "session_signal"
  );
  const watchCandidates = [
    ...sessionCandidates(input.completedSessions, (signals) => [
      ...signals.movementQuality,
      ...signals.fatigueReadiness,
      ...signals.discussWithGaz,
    ]),
    ...fallbackCandidates(
      [
        ...input.trainingSignals.movementQuality,
        ...input.trainingSignals.fatigueReadiness,
        ...input.trainingSignals.discussWithGaz,
      ],
      "session_signal"
    ),
    ...fallbackCandidates(
      [
        ...(input.patternSummary?.movementQuality ?? []),
        ...(input.patternSummary?.fatigue ?? []),
        ...(input.patternSummary?.constraints ?? []),
      ],
      "pattern"
    ),
  ];
  const resolvedCandidates = [
    ...sessionCandidates(input.completedSessions, (signals) => [
      ...signals.movementQuality,
      ...signals.fatigueReadiness,
      ...signals.nextWorkoutFocus,
    ]),
    ...fallbackCandidates(
      [
        ...input.trainingSignals.movementQuality,
        ...input.trainingSignals.fatigueReadiness,
        ...input.trainingSignals.nextWorkoutFocus,
      ],
      "session_signal"
    ),
  ];

  return {
    validatedLearnings: compactMemoryItems(
      "validated_learning",
      [...sessionLearningCandidates, ...fallbackLearningCandidates].filter((candidate) =>
        isValidatedLearningSignal(candidate.text)
      )
    ),
    activeWatchItems: compactMemoryItems(
      "active_watch",
      watchCandidates.filter((candidate) => isActiveWatchSignal(candidate.text))
    ),
    resolvedItems: compactMemoryItems(
      "resolved",
      resolvedCandidates.filter((candidate) => isResolvedSignal(candidate.text))
    ),
    sourceWindow: sourceWindow(input.completedSessions),
  };
}
