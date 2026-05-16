import { expect, test } from "@playwright/test";
import type { FitnessTestCategory, FitnessTestResult } from "../src/db";
import { buildCapabilityTestsSummary } from "../src/lib/capabilityTestsSummary";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 4, 16, 12, 0, 0, 0).getTime();

function daysAgo(days: number) {
  return NOW - days * DAY_MS;
}

function result(args: {
  id: string;
  category: FitnessTestCategory;
  testName?: string;
  daysAgo: number;
  status?: FitnessTestResult["status"];
  pain?: FitnessTestResult["pain"];
  deleted?: boolean;
}): FitnessTestResult {
  return {
    id: args.id,
    testName: args.testName ?? args.id,
    category: args.category,
    date: daysAgo(args.daysAgo),
    status: args.status,
    pain: args.pain,
    updatedAt: daysAgo(args.daysAgo),
    deletedAt: args.deleted ? daysAgo(0) : undefined,
  };
}

function completeGreenRows(): FitnessTestResult[] {
  return [
    result({ id: "ground", category: "ground", daysAgo: 1, status: "green", pain: "none" }),
    result({ id: "carry", category: "carry", daysAgo: 2, status: "green", pain: "none" }),
    result({ id: "terrain", category: "terrain", daysAgo: 3, status: "green", pain: "none" }),
    result({ id: "single-leg", category: "single_leg", daysAgo: 4, status: "green", pain: "none" }),
    result({ id: "agility", category: "agility", daysAgo: 5, status: "yellow", pain: "mild" }),
  ];
}

test("no results returns Not Tested", () => {
  const summary = buildCapabilityTestsSummary([], { now: NOW });

  expect(summary.overallLabel).toBe("Not Tested");
  expect(summary.liveResultCount).toBe(0);
  expect(summary.statusCounts).toEqual({ green: 0, yellow: 0, red: 0, notTested: 5 });
});

test("latest result per category is selected", () => {
  const summary = buildCapabilityTestsSummary(
    [
      result({ id: "old-ground", category: "ground", daysAgo: 20, status: "red" }),
      result({ id: "new-ground", category: "ground", daysAgo: 1, status: "green" }),
      result({ id: "carry", category: "carry", daysAgo: 2, status: "yellow" }),
    ],
    { now: NOW }
  );

  expect(summary.latestByCategory.ground?.id).toBe("new-ground");
  expect(summary.latestByCategory.carry?.id).toBe("carry");
  expect(summary.latestByCategory.terrain).toBeUndefined();
});

test("deleted results are ignored", () => {
  const summary = buildCapabilityTestsSummary(
    [
      result({ id: "deleted-red", category: "ground", daysAgo: 1, status: "red", deleted: true }),
      result({ id: "live-green", category: "ground", daysAgo: 2, status: "green" }),
    ],
    { now: NOW }
  );

  expect(summary.latestByCategory.ground?.id).toBe("live-green");
  expect(summary.statusCounts.red).toBe(0);
  expect(summary.liveResultCount).toBe(1);
});

test("red status returns Watch", () => {
  const rows = completeGreenRows();
  rows[2] = result({ id: "terrain-red", category: "terrain", daysAgo: 1, status: "red", pain: "none" });

  const summary = buildCapabilityTestsSummary(rows, { now: NOW });

  expect(summary.overallLabel).toBe("Watch");
  expect(summary.statusCounts.red).toBe(1);
});

test("moderate or severe pain returns Watch", () => {
  const moderate = buildCapabilityTestsSummary(
    completeGreenRows().map((row) => (row.category === "carry" ? { ...row, pain: "moderate" as const } : row)),
    { now: NOW }
  );
  const severe = buildCapabilityTestsSummary(
    completeGreenRows().map((row) => (row.category === "carry" ? { ...row, pain: "severe" as const } : row)),
    { now: NOW }
  );

  expect(moderate.overallLabel).toBe("Watch");
  expect(severe.overallLabel).toBe("Watch");
});

test("incomplete categories returns Developing", () => {
  const summary = buildCapabilityTestsSummary(
    [
      result({ id: "ground", category: "ground", daysAgo: 1, status: "green" }),
      result({ id: "carry", category: "carry", daysAgo: 2, status: "green" }),
    ],
    { now: NOW }
  );

  expect(summary.overallLabel).toBe("Developing");
  expect(summary.statusCounts.notTested).toBe(3);
});

test("mostly green recent results returns Solid", () => {
  const summary = buildCapabilityTestsSummary(completeGreenRows(), { now: NOW });

  expect(summary.overallLabel).toBe("Solid");
  expect(summary.statusCounts.green).toBe(4);
  expect(summary.statusCounts.yellow).toBe(1);
});

test("stale categories are identified", () => {
  const summary = buildCapabilityTestsSummary(
    [
      result({ id: "ground", category: "ground", daysAgo: 31, status: "green" }),
      result({ id: "carry", category: "carry", daysAgo: 61, status: "green" }),
      result({ id: "terrain", category: "terrain", daysAgo: 91, status: "green" }),
      result({ id: "single-leg", category: "single_leg", daysAgo: 1, status: "green" }),
      result({ id: "agility", category: "agility", daysAgo: 1, status: "green" }),
    ],
    { now: NOW }
  );

  expect(summary.staleCategories[30]).toEqual(["ground", "carry", "terrain"]);
  expect(summary.staleCategories[60]).toEqual(["carry", "terrain"]);
  expect(summary.staleCategories[90]).toEqual(["terrain"]);
  expect(summary.overallLabel).toBe("Developing");
});

test("status counts are correct for latest category rows", () => {
  const summary = buildCapabilityTestsSummary(
    [
      result({ id: "old-ground-red", category: "ground", daysAgo: 10, status: "red" }),
      result({ id: "ground-green", category: "ground", daysAgo: 1, status: "green" }),
      result({ id: "carry-yellow", category: "carry", daysAgo: 2, status: "yellow" }),
      result({ id: "terrain-red", category: "terrain", daysAgo: 3, status: "red" }),
    ],
    { now: NOW }
  );

  expect(summary.statusCounts).toEqual({ green: 1, yellow: 1, red: 1, notTested: 2 });
});

test("summary remains read-only", () => {
  const rows = [result({ id: "ground", category: "ground", daysAgo: 1, status: "green" })];
  const before = JSON.stringify(rows);

  buildCapabilityTestsSummary(rows, { now: NOW });

  expect(JSON.stringify(rows)).toBe(before);
});
