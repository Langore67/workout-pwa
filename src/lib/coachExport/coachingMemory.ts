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
  sessionIndex?: number;
};

type CompactedMemoryCandidate = MemoryCandidate & {
  key: string;
  evidenceCount: number;
  sessionIndexes: number[];
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

export function isActiveWatchSignal(value: string) {
  const text = normalizeCoachingMemoryText(value);
  if (!text || isGenericStaleDiscussPrompt(text)) return false;
  return (
    /\b(?:not counted|form breakdown|form breaking|terminal[-\s]?rep|terminal reps|joint feedback|pain|twinge|fatigue|too heavy|equipment|setup issue|machine unavailable|cable unavailable|bench setup|rejected|probe failed|too awkward|not a keeper|variation did not work|stopped due to|sensitive|range of motion|rom|load looked too heavy|review form breakdown)\b/i.test(text) ||
    /\b(?:constraint|constrained|monitor|watch|caution|limited|dropped|quality dropped)\b/i.test(text)
  );
}

function isResolvedSignal(value: string) {
  const text = normalizeCoachingMemoryText(value);
  return /\b(?:resolved|quiet|pain[-\s]?free|no pain|no (?:shoulder|elbow|knee|hip|wrist|ankle|back|low back) feedback|replacement established|substitution worked|validated replacement|successful replacement)\b/i.test(text);
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

function compactCandidates(candidates: MemoryCandidate[]): CompactedMemoryCandidate[] {
  const byKey = new Map<string, CompactedMemoryCandidate>();
  for (const candidate of candidates) {
    const text = String(candidate.text ?? "").replace(/\s+/g, " ").trim();
    const key = normalizeCoachingMemoryText(text);
    if (!key) continue;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        ...candidate,
        key,
        text,
        evidenceCount: 1,
        sessionIndexes: candidate.sessionIndex != null ? [candidate.sessionIndex] : [],
      });
      continue;
    }
    existing.evidenceCount += 1;
    if (candidate.sessionIndex != null) existing.sessionIndexes.push(candidate.sessionIndex);
    if ((candidate.lastSeenAt ?? -Infinity) > (existing.lastSeenAt ?? -Infinity)) {
      existing.text = text;
      existing.sourceSessionId = candidate.sourceSessionId;
      existing.lastSeenAt = candidate.lastSeenAt;
      existing.sourceType = candidate.sourceType;
      existing.sessionIndex = candidate.sessionIndex;
    }
  }

  return Array.from(byKey.values());
}

function severityFor(text: string): CoachingMemoryItem["severity"] {
  const normalized = normalizeCoachingMemoryText(text);
  if (/\b(?:sharp pain|severe pain|stopped due to|could not continue)\b/i.test(normalized)) return "high";
  if (/\b(?:pain|joint feedback|form breakdown|terminal[-\s]?rep|quality dropped|rejected|too heavy)\b/i.test(normalized)) {
    return "moderate";
  }
  return "low";
}

function watchCategory(text: string): "equipment" | "rejected" | "form" | "pain" | "load" | "fatigue" | "generic" {
  const normalized = normalizeCoachingMemoryText(text);
  if (/\b(?:equipment|setup issue|machine unavailable|cable unavailable|bench setup)\b/i.test(normalized)) return "equipment";
  if (/\b(?:rejected|probe failed|too awkward|not a keeper|variation did not work)\b/i.test(normalized)) return "rejected";
  if (/\b(?:not counted|form breakdown|form breaking|range of motion|rom|quality dropped)\b/i.test(normalized)) return "form";
  if (/\b(?:sharp pain|severe pain|pain|joint feedback|twinge|sensitive|shoulder feedback|elbow feedback|knee feedback)\b/i.test(normalized)) return "pain";
  if (/\b(?:load looked too heavy|too heavy)\b/i.test(normalized)) return "load";
  if (/\b(?:fatigue|terminal[-\s]?rep|terminal reps|reduced capacity|gassed|tired)\b/i.test(normalized)) return "fatigue";
  return "generic";
}

function broadIssueKey(text: string) {
  const exercise = normalizeCoachingMemoryText(exerciseNameFor(text) ?? "");
  if (exercise) return exercise;
  return movementFamilyKey(text);
}

function movementFamilyKey(text: string) {
  const normalized = normalizeCoachingMemoryText(text);
  if (/\b(?:shoulder|overhead|press|bench)\b/i.test(normalized)) return "shoulder-pressing";
  if (/\b(?:elbow)\b/i.test(normalized)) return "elbow";
  if (/\b(?:knee)\b/i.test(normalized)) return "knee";
  if (/\b(?:row|pull|lat)\b/i.test(normalized)) return "pull";
  return "";
}

function hasLaterResolution(item: CompactedMemoryCandidate, resolved: CompactedMemoryCandidate[]) {
  const itemKey = broadIssueKey(item.text);
  if (!itemKey) return false;
  const itemLatest = Math.min(...item.sessionIndexes);
  return resolved.some((resolution) => {
    if (broadIssueKey(resolution.text) !== itemKey) return false;
    const resolutionLatest = Math.min(...resolution.sessionIndexes);
    return Number.isFinite(resolutionLatest) && resolutionLatest < itemLatest;
  });
}

function hasLaterSuccessfulReplacement(item: CompactedMemoryCandidate, learnings: CompactedMemoryCandidate[], resolved: CompactedMemoryCandidate[]) {
  const itemKey = broadIssueKey(item.text);
  const itemFamilyKey = movementFamilyKey(item.text);
  if (!itemKey) return false;
  const itemLatest = Math.min(...item.sessionIndexes);
  return [...learnings, ...resolved].some((candidate) => {
    const text = normalizeCoachingMemoryText(candidate.text);
    if (!/(replacement|substitution|substitute|worked|validated|successful|grounded|reinforced|breakthrough)/i.test(text)) {
      return false;
    }
    if (broadIssueKey(candidate.text) !== itemKey && movementFamilyKey(candidate.text) !== itemFamilyKey) return false;
    const candidateLatest = Math.min(...candidate.sessionIndexes);
    return Number.isFinite(candidateLatest) && candidateLatest < itemLatest;
  });
}

function shouldKeepActiveWatch(
  item: CompactedMemoryCandidate,
  context: {
    hasSessionWindow: boolean;
    learningCandidates: CompactedMemoryCandidate[];
    resolvedCandidates: CompactedMemoryCandidate[];
  }
) {
  if (!context.hasSessionWindow || !item.sessionIndexes.length) return true;
  const latestSessionIndex = Math.min(...item.sessionIndexes);
  const category = watchCategory(item.text);
  const severity = severityFor(item.text);
  const repeated = item.evidenceCount >= 2;

  if (category === "pain" && hasLaterResolution(item, context.resolvedCandidates)) return false;
  if (category === "rejected" && hasLaterSuccessfulReplacement(item, context.learningCandidates, context.resolvedCandidates)) return false;
  if (severity === "high" && category === "pain") return true;

  if (category === "equipment") return latestSessionIndex === 0 || repeated;
  if (category === "rejected") return latestSessionIndex <= 1;
  if (category === "form" || category === "pain") return latestSessionIndex <= 1 || repeated;
  if (category === "load" || category === "fatigue") return latestSessionIndex === 0 || repeated;
  return latestSessionIndex <= 1 || repeated;
}

function compactMemoryItems(
  kind: CoachingMemoryItem["kind"],
  candidates: CompactedMemoryCandidate[],
  limit = 4
): CoachingMemoryItem[] {
  return candidates
    .sort((a, b) => (b.lastSeenAt ?? 0) - (a.lastSeenAt ?? 0) || b.evidenceCount - a.evidenceCount)
    .slice(0, limit)
    .map((item) => ({
      id: `${kind}:${item.key.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
      kind,
      label: labelFor(item.text),
      sourceType: item.sourceType,
      sourceSessionId: item.sourceSessionId,
      exerciseName: exerciseNameFor(item.text),
      confidence: confidenceFor(item.evidenceCount),
      evidenceCount: item.evidenceCount,
      lastSeenAt: item.lastSeenAt,
      severity: kind === "active_watch" ? severityFor(item.text) : undefined,
      status: "active",
      text: item.text,
    }));
}

function sessionCandidates(
  sessions: CompletedSession[] | undefined,
  selector: (signals: CoachExportTrainingSignals) => string[]
): MemoryCandidate[] {
  return (sessions ?? []).flatMap((session, sessionIndex) =>
    selector(session.trainingSignals).map((text) => ({
      text,
      sourceType: "session_signal" as const,
      sourceSessionId: session.id,
      lastSeenAt: session.endedAt ?? undefined,
      sessionIndex,
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
  const compactedLearningCandidates = compactCandidates(
    [...sessionLearningCandidates, ...fallbackLearningCandidates].filter((candidate) =>
      isValidatedLearningSignal(candidate.text)
    )
  );
  const compactedResolvedCandidates = compactCandidates(
    resolvedCandidates.filter((candidate) => isResolvedSignal(candidate.text))
  );
  const compactedWatchCandidates = compactCandidates(
    watchCandidates.filter((candidate) => isActiveWatchSignal(candidate.text))
  ).filter((candidate) =>
    shouldKeepActiveWatch(candidate, {
      hasSessionWindow: !!input.completedSessions?.length,
      learningCandidates: compactedLearningCandidates,
      resolvedCandidates: compactedResolvedCandidates,
    })
  );

  return {
    validatedLearnings: compactMemoryItems(
      "validated_learning",
      compactedLearningCandidates
    ),
    activeWatchItems: compactMemoryItems(
      "active_watch",
      compactedWatchCandidates
    ),
    resolvedItems: compactMemoryItems(
      "resolved",
      compactedResolvedCandidates
    ),
    sourceWindow: sourceWindow(input.completedSessions),
  };
}
