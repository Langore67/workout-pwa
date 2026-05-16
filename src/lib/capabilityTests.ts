import type {
  FitnessTestCategory,
  FitnessTestPain,
  FitnessTestResult,
  FitnessTestResultUnit,
  FitnessTestSide,
  FitnessTestStatus,
} from "../db";

export const CAPABILITY_CATEGORIES: Array<{ value: FitnessTestCategory; label: string }> = [
  { value: "ground", label: "Ground" },
  { value: "carry", label: "Carry" },
  { value: "terrain", label: "Terrain" },
  { value: "single_leg", label: "Single-Leg" },
  { value: "agility", label: "Agility" },
];

export const CAPABILITY_TESTS: Array<{ name: string; category: FitnessTestCategory; side: FitnessTestSide }> = [
  { name: "Floor Get-Up", category: "ground", side: "none" },
  { name: "Farmer Carry", category: "carry", side: "both" },
  { name: "Suitcase Carry - Left", category: "carry", side: "left" },
  { name: "Suitcase Carry - Right", category: "carry", side: "right" },
  { name: "3-Mile Walk / Hike", category: "terrain", side: "none" },
  { name: "Incline Walk", category: "terrain", side: "none" },
  { name: "Single-Leg Balance - Left", category: "single_leg", side: "left" },
  { name: "Single-Leg Balance - Right", category: "single_leg", side: "right" },
  { name: "Step-Down Control - Left", category: "single_leg", side: "left" },
  { name: "Step-Down Control - Right", category: "single_leg", side: "right" },
  { name: "Lateral Line Step-Over", category: "agility", side: "both" },
  { name: "Lateral Shuffle", category: "agility", side: "both" },
  { name: "Modified 5-10-5", category: "agility", side: "both" },
];

export const CAPABILITY_UNITS: FitnessTestResultUnit[] = [
  "seconds",
  "reps",
  "feet",
  "yards",
  "meters",
  "minutes",
  "lb",
];

export const CAPABILITY_SIDES: FitnessTestSide[] = ["none", "left", "right", "both"];
export const CAPABILITY_STATUSES: FitnessTestStatus[] = ["green", "yellow", "red"];
export const CAPABILITY_PAINS: FitnessTestPain[] = ["none", "mild", "moderate", "severe"];

export function labelForCapabilityCategory(category: FitnessTestCategory | string | undefined) {
  return CAPABILITY_CATEGORIES.find((item) => item.value === category)?.label ?? String(category ?? "");
}

export function defaultCapabilityCategoryForTest(testName: string): FitnessTestCategory {
  return CAPABILITY_TESTS.find((test) => test.name === testName)?.category ?? "ground";
}

export function defaultCapabilitySideForTest(testName: string): FitnessTestSide {
  return CAPABILITY_TESTS.find((test) => test.name === testName)?.side ?? "none";
}

export function formatCapabilityDate(ms: number) {
  const d = new Date(ms);
  if (!Number.isFinite(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseCapabilityDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map((part) => Number(part));
  const date = new Date(year, (month || 1) - 1, day || 1, 12, 0, 0, 0);
  return Number.isFinite(date.getTime()) ? date.getTime() : Date.now();
}

export function formatCapabilityResultValue(row: Pick<FitnessTestResult, "resultValue" | "resultUnit">) {
  if (row.resultValue == null || !Number.isFinite(row.resultValue) || !row.resultUnit) return "";
  const value = Number.isInteger(row.resultValue) ? String(Math.round(row.resultValue)) : String(row.resultValue);
  if (row.resultUnit === "seconds") return `${value} sec`;
  const unit = row.resultUnit === "lb" ? "lb" : row.resultUnit;
  return `${value} ${unit}`;
}

export function summarizeCapabilityResults(rows: FitnessTestResult[]) {
  const liveRows = rows.filter((row) => !row.deletedAt);
  const latest = liveRows.slice().sort((a, b) => b.date - a.date)[0];
  const testedNames = new Set(liveRows.map((row) => row.testName));
  return {
    count: liveRows.length,
    latest,
    green: liveRows.filter((row) => row.status === "green").length,
    yellow: liveRows.filter((row) => row.status === "yellow").length,
    red: liveRows.filter((row) => row.status === "red").length,
    notTested: Math.max(0, CAPABILITY_TESTS.length - testedNames.size),
  };
}
