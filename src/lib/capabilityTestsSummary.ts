import type { FitnessTestCategory, FitnessTestPain, FitnessTestResult, FitnessTestStatus } from "../db";
import { CAPABILITY_CATEGORIES } from "./capabilityTests";

export type CapabilityOverallLabel = "Not Tested" | "Developing" | "Solid" | "Watch";
export type CapabilityStaleWindow = 30 | 60 | 90;

export type CapabilityTestsSummary = {
  latestByCategory: Record<FitnessTestCategory, FitnessTestResult | undefined>;
  statusCounts: {
    green: number;
    yellow: number;
    red: number;
    notTested: number;
  };
  recentPainCounts: {
    mild: number;
    moderate: number;
    severe: number;
  };
  staleCategories: Record<CapabilityStaleWindow, FitnessTestCategory[]>;
  overallLabel: CapabilityOverallLabel;
  liveResultCount: number;
};

export type BuildCapabilityTestsSummaryOptions = {
  now?: number;
  recentPainDays?: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const CATEGORY_VALUES = CAPABILITY_CATEGORIES.map((category) => category.value);

function emptyLatestByCategory(): Record<FitnessTestCategory, FitnessTestResult | undefined> {
  return {
    ground: undefined,
    carry: undefined,
    terrain: undefined,
    single_leg: undefined,
    agility: undefined,
  };
}

function hasModerateOrSeverePain(pain?: FitnessTestPain) {
  return pain === "moderate" || pain === "severe";
}

function countStatus(rows: Array<FitnessTestResult | undefined>, status: FitnessTestStatus) {
  return rows.filter((row) => row?.status === status).length;
}

function mostlyYellow(latestRows: FitnessTestResult[]) {
  const yellow = latestRows.filter((row) => row.status === "yellow").length;
  const green = latestRows.filter((row) => row.status === "green").length;
  return yellow > 0 && yellow >= green;
}

export function buildCapabilityTestsSummary(
  rows: FitnessTestResult[],
  options: BuildCapabilityTestsSummaryOptions = {}
): CapabilityTestsSummary {
  const now = options.now ?? Date.now();
  const recentPainDays = options.recentPainDays ?? 90;
  const recentPainStart = now - recentPainDays * DAY_MS;
  const liveRows = (rows ?? []).filter((row) => !row.deletedAt);
  const latestByCategory = emptyLatestByCategory();

  for (const category of CATEGORY_VALUES) {
    latestByCategory[category] = liveRows
      .filter((row) => row.category === category)
      .sort((a, b) => b.date - a.date || b.updatedAt - a.updatedAt)[0];
  }

  const latestRows = CATEGORY_VALUES.map((category) => latestByCategory[category]).filter(
    (row): row is FitnessTestResult => !!row
  );
  const notTestedCategories = CATEGORY_VALUES.filter((category) => !latestByCategory[category]);
  const staleCategories = {
    30: CATEGORY_VALUES.filter((category) => {
      const latest = latestByCategory[category];
      return !latest || latest.date < now - 30 * DAY_MS;
    }),
    60: CATEGORY_VALUES.filter((category) => {
      const latest = latestByCategory[category];
      return !latest || latest.date < now - 60 * DAY_MS;
    }),
    90: CATEGORY_VALUES.filter((category) => {
      const latest = latestByCategory[category];
      return !latest || latest.date < now - 90 * DAY_MS;
    }),
  };

  const recentPainRows = liveRows.filter((row) => row.date >= recentPainStart && row.date <= now);
  const recentPainCounts = {
    mild: recentPainRows.filter((row) => row.pain === "mild").length,
    moderate: recentPainRows.filter((row) => row.pain === "moderate").length,
    severe: recentPainRows.filter((row) => row.pain === "severe").length,
  };
  const statusCounts = {
    green: countStatus(latestRows, "green"),
    yellow: countStatus(latestRows, "yellow"),
    red: countStatus(latestRows, "red"),
    notTested: notTestedCategories.length,
  };

  let overallLabel: CapabilityOverallLabel = "Not Tested";
  if (liveRows.length > 0) {
    const hasRecentRed = latestRows.some((row) => row.status === "red" && row.date >= recentPainStart);
    const hasRecentModerateSeverePain = recentPainRows.some((row) => hasModerateOrSeverePain(row.pain));
    const incompleteCategories = notTestedCategories.length > 0;
    const hasStaleCategory = staleCategories[90].length > 0;
    const mostlyGreen =
      statusCounts.green >= 4 && statusCounts.yellow <= 1 && statusCounts.red === 0 && statusCounts.notTested === 0;

    if (hasRecentRed || hasRecentModerateSeverePain) {
      overallLabel = "Watch";
    } else if (incompleteCategories || mostlyYellow(latestRows) || hasStaleCategory) {
      overallLabel = "Developing";
    } else if (mostlyGreen) {
      overallLabel = "Solid";
    } else {
      overallLabel = "Developing";
    }
  }

  return {
    latestByCategory,
    statusCounts,
    recentPainCounts,
    staleCategories,
    overallLabel,
    liveResultCount: liveRows.length,
  };
}
