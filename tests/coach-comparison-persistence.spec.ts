import { expect, test } from "@playwright/test";
import type { AppMeta } from "../src/db";
import {
  COACH_COMPARISON_META_KEY,
  loadPersistedCoachComparisonSnapshot,
  parsePersistedCoachComparisonSnapshot,
  savePersistedCoachComparisonSnapshot,
  type CoachComparisonMetaStore,
} from "../src/lib/coachState/coachComparisonPersistence";
import {
  buildPersistedCoachComparisonSnapshot,
  withCoachStateComparison,
} from "../src/lib/coachState/coachExplainability";
import type { CoachState } from "../src/lib/coachState/coachStateTypes";

function state(overrides: { signal?: number; freshness?: "recent" | "historical" | "stale"; cardio?: number } = {}): CoachState {
  const freshness = overrides.freshness ?? "recent";
  return {
    generatedAt: "2026-10-08T12:00:00.000Z",
    snapshot: { overallStatus: "watch", confidence: "moderate", narrative: "Existing Coach reason." },
    body: { weightDelta14dLb: -2, latestWaistIn: 35.5 },
    strength: {
      strengthSignalCurrent: overrides.signal ?? 1.9,
      anchors: [{
        pattern: "push",
        trackDisplayName: "Bench Press",
        ageDays: freshness === "recent" ? 7 : freshness === "historical" ? 22 : 35,
        recency: freshness,
        isStale: freshness === "stale",
      }],
    },
    cardio: { available: true, status: "watch", walkCount7d: overrides.cardio ?? 2 },
    goals: { targets: [] },
    learnings: { validated: [], watchItems: [], resolved: [] },
    explanation: { why: ["Existing Coach reason."], whatChanged: [], evidence: [] },
    export: { available: true },
  };
}

function memoryStore(initial?: AppMeta): CoachComparisonMetaStore & { row?: AppMeta; events: string[] } {
  return {
    row: initial,
    events: [],
    async get(key) {
      this.events.push(`get:${key}`);
      return this.row;
    },
    async put(value) {
      this.events.push(`put:${value.key}`);
      this.row = value;
    },
  };
}

test("first save creates and reloads a compact versioned Coach comparison snapshot", async () => {
  const store = memoryStore();
  const snapshot = buildPersistedCoachComparisonSnapshot(state());

  expect(await savePersistedCoachComparisonSnapshot(snapshot, store)).toBe(true);
  expect(JSON.parse(store.row!.valueJson!)).toEqual(snapshot);
  expect(await loadPersistedCoachComparisonSnapshot(store)).toEqual(snapshot);
  expect(snapshot).toEqual(expect.objectContaining({ schemaVersion: 1, savedAt: "2026-10-08T12:00:00.000Z" }));
  expect(JSON.stringify(snapshot)).not.toContain("sourceMetrics");
});

test("malformed and unsupported persisted snapshots fail safely", async () => {
  const malformed = memoryStore({ key: COACH_COMPARISON_META_KEY, valueJson: "{bad", updatedAt: 1 });
  const unsupported = memoryStore({
    key: COACH_COMPARISON_META_KEY,
    valueJson: JSON.stringify({ schemaVersion: 2, savedAt: "2026-10-08T12:00:00.000Z" }),
    updatedAt: 1,
  });

  expect(await loadPersistedCoachComparisonSnapshot(malformed)).toBeUndefined();
  expect(await loadPersistedCoachComparisonSnapshot(unsupported)).toBeUndefined();
  expect(parsePersistedCoachComparisonSnapshot(null)).toBeUndefined();
});

test("durable lifecycle compares before overwrite and the next load sees the new baseline", async () => {
  const store = memoryStore();
  const first = state({ signal: 1.9 });
  const coldPrior = await loadPersistedCoachComparisonSnapshot(store);
  const coldCompared = withCoachStateComparison(first, coldPrior);

  expect(coldCompared.explanation.whatChanged).toEqual([]);
  expect(store.events).toEqual([`get:${COACH_COMPARISON_META_KEY}`]);
  await savePersistedCoachComparisonSnapshot(buildPersistedCoachComparisonSnapshot(first), store);

  const second = state({ signal: 2 });
  const durablePrior = await loadPersistedCoachComparisonSnapshot(store);
  const compared = withCoachStateComparison(second, durablePrior);
  expect(compared.explanation.whatChanged).toContain("Strength Signal improved +0.10.");
  expect(JSON.parse(store.row!.valueJson!).strength.signal).toBe(1.9);

  await savePersistedCoachComparisonSnapshot(buildPersistedCoachComparisonSnapshot(second), store);
  expect((await loadPersistedCoachComparisonSnapshot(store))?.strength?.signal).toBe(2);
});

test("identical and trivial durable snapshots stay quiet while freshness transitions remain material", () => {
  const current = state({ signal: 1.92, freshness: "historical" });
  const identical = buildPersistedCoachComparisonSnapshot(current);
  const trivial = buildPersistedCoachComparisonSnapshot(state({ signal: 1.9, freshness: "historical" }));
  const freshPrior = buildPersistedCoachComparisonSnapshot(state({ signal: 1.92, freshness: "recent" }));

  expect(withCoachStateComparison(current, identical).explanation.whatChanged).toEqual([]);
  expect(withCoachStateComparison(current, trivial).explanation.whatChanged).toEqual([]);
  expect(withCoachStateComparison(current, freshPrior).explanation.whatChanged).toContain(
    "Strength benchmark freshness changed from fresh to aging.",
  );
});
