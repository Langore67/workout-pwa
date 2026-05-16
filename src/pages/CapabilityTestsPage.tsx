import React, { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate } from "react-router-dom";
import { Page, Section } from "../components/Page.tsx";
import { db, type FitnessTestCategory, type FitnessTestResult, type FitnessTestResultUnit } from "../db";
import {
  CAPABILITY_CATEGORIES,
  CAPABILITY_PAINS,
  CAPABILITY_SIDES,
  CAPABILITY_STATUSES,
  CAPABILITY_TESTS,
  CAPABILITY_UNITS,
  defaultCapabilityCategoryForTest,
  defaultCapabilitySideForTest,
  formatCapabilityDate,
  formatCapabilityResultValue,
  labelForCapabilityCategory,
  parseCapabilityDateKey,
} from "../lib/capabilityTests";
import { buildCapabilityTestsSummary } from "../lib/capabilityTestsSummary";
import { uuid } from "../utils";

type FormState = {
  id?: string;
  testName: string;
  category: FitnessTestCategory;
  dateKey: string;
  resultValue: string;
  resultUnit: "" | FitnessTestResultUnit;
  side: FitnessTestResult["side"];
  status: "" | NonNullable<FitnessTestResult["status"]>;
  pain: "" | NonNullable<FitnessTestResult["pain"]>;
  notes: string;
};

const defaultForm = (): FormState => ({
  testName: "Floor Get-Up",
  category: "ground",
  dateKey: formatCapabilityDate(Date.now()),
  resultValue: "",
  resultUnit: "",
  side: "none",
  status: "",
  pain: "",
  notes: "",
});

function titleCase(value: string | undefined) {
  if (!value) return "";
  return value.slice(0, 1).toUpperCase() + value.slice(1).replace(/_/g, " ");
}

function rowText(row: FitnessTestResult) {
  const parts = [
    formatCapabilityDate(row.date),
    row.testName,
    labelForCapabilityCategory(row.category),
    formatCapabilityResultValue(row),
    row.side && row.side !== "none" ? `side ${row.side}` : "",
    row.status ? `status ${row.status}` : "",
    row.pain ? `pain ${row.pain}` : "",
    row.notes ? row.notes : "",
  ].filter(Boolean);
  return parts.join(" | ");
}

function summaryCategoryText(row: FitnessTestResult | undefined) {
  if (!row) return "Not tested";
  const parts = [
    row.testName,
    row.status ?? "status not set",
    row.pain ? `pain ${row.pain}` : "pain not set",
    formatCapabilityDate(row.date),
  ];
  return parts.join(" | ");
}

export default function CapabilityTestsPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>(() => defaultForm());
  const [error, setError] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"all" | FitnessTestCategory>("all");

  const rows = useLiveQuery(async () => {
    const table = (db as any).fitnessTestResults;
    if (!table?.toArray) return [] as FitnessTestResult[];
    const all = (await table.toArray()) as FitnessTestResult[];
    return all.filter((row) => !row.deletedAt).sort((a, b) => b.date - a.date || b.updatedAt - a.updatedAt);
  }, []);

  const visibleRows = useMemo(() => {
    const liveRows = rows ?? [];
    if (categoryFilter === "all") return liveRows;
    return liveRows.filter((row) => row.category === categoryFilter);
  }, [rows, categoryFilter]);
  const summary = useMemo(() => buildCapabilityTestsSummary(rows ?? []), [rows]);
  const painFlagCount =
    summary.recentPainCounts.mild + summary.recentPainCounts.moderate + summary.recentPainCounts.severe;
  const staleCategories = summary.staleCategories[90].map(labelForCapabilityCategory).join(", ");
  const notTestedCategories = CAPABILITY_CATEGORIES.filter((category) => !summary.latestByCategory[category.value])
    .map((category) => category.label)
    .join(", ");

  function patchForm(patch: Partial<FormState>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function onTestNameChange(testName: string) {
    patchForm({
      testName,
      category: defaultCapabilityCategoryForTest(testName),
      side: defaultCapabilitySideForTest(testName),
    });
  }

  function startEdit(row: FitnessTestResult) {
    setError("");
    setForm({
      id: row.id,
      testName: row.testName,
      category: row.category,
      dateKey: formatCapabilityDate(row.date),
      resultValue: row.resultValue == null ? "" : String(row.resultValue),
      resultUnit: row.resultUnit ?? "",
      side: row.side ?? "none",
      status: row.status ?? "",
      pain: row.pain ?? "",
      notes: row.notes ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveResult(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const testName = form.testName.trim();
    if (!testName) {
      setError("Test name is required.");
      return;
    }
    if (!form.category) {
      setError("Category is required.");
      return;
    }
    if (!form.dateKey) {
      setError("Date is required.");
      return;
    }
    const resultValue = form.resultValue.trim() ? Number(form.resultValue) : undefined;
    if (resultValue != null && (!Number.isFinite(resultValue) || resultValue < 0)) {
      setError("Result value must be a valid number.");
      return;
    }
    if (resultValue != null && !form.resultUnit) {
      setError("Result unit is required when result value is provided.");
      return;
    }

    const now = Date.now();
    const row: FitnessTestResult = {
      id: form.id ?? uuid(),
      testName,
      category: form.category,
      date: parseCapabilityDateKey(form.dateKey),
      resultValue,
      resultUnit: form.resultUnit || undefined,
      side: form.side || "none",
      status: form.status || undefined,
      pain: form.pain || undefined,
      notes: form.notes.trim() || undefined,
      updatedAt: now,
    };

    await db.fitnessTestResults.put(row);
    setForm(defaultForm());
  }

  async function deleteResult(row: FitnessTestResult) {
    await db.fitnessTestResults.update(row.id, { deletedAt: Date.now(), updatedAt: Date.now() });
  }

  return (
    <Page
      title="Capability Tests"
      subtitle="Track simple real-world movement tests that show whether strength, conditioning, and mobility are carrying over."
      right={
        <button className="btn small" type="button" onClick={() => navigate("/progress")}>
          Progress
        </button>
      }
    >
      <Section
        title="Capability Summary"
        subtitle="Tracks whether strength, conditioning, and mobility are carrying over to real-world movement tasks."
      >
        {!rows ? (
          <div className="muted">Loading capability summary...</div>
        ) : (
          <div data-testid="capability-summary-panel" style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
              <div data-testid="capability-summary-overall" style={{ fontWeight: 900 }}>
                Overall: {summary.overallLabel}
              </div>
              <div data-testid="capability-summary-explanation" className="muted">
                {summary.overallExplanation}
              </div>
              <div data-testid="capability-summary-status-mix" className="muted">
                green {summary.statusCounts.green} | yellow {summary.statusCounts.yellow} | red{" "}
                {summary.statusCounts.red} | not tested {summary.statusCounts.notTested}
              </div>
              <div data-testid="capability-summary-pain-flags" className="muted">
                pain flags {painFlagCount}
              </div>
            </div>

            <div data-testid="capability-summary-stale" className="muted">
              stale categories: {staleCategories || "none"}
            </div>
            <div data-testid="capability-summary-not-tested" className="muted">
              not tested categories: {notTestedCategories || "none"}
            </div>

            <div data-testid="capability-summary-latest-categories" style={{ display: "grid", gap: 6 }}>
              {CAPABILITY_CATEGORIES.map((category) => (
                <div key={category.value}>
                  <span style={{ fontWeight: 850 }}>{category.label}:</span>{" "}
                  {summaryCategoryText(summary.latestByCategory[category.value])}
                </div>
              ))}
            </div>
          </div>
        )}
      </Section>

      <Section title={form.id ? "Edit Result" : "Log Capability Test"} subtitle="Foundation only. No scorecard calculation yet.">
        <form onSubmit={saveResult} style={{ display: "grid", gap: 12 }} data-testid="capability-form">
          {error ? (
            <div data-testid="capability-form-error" style={{ color: "#b91c1c", fontWeight: 800 }}>
              {error}
            </div>
          ) : null}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontWeight: 800 }}>Test name</span>
              <select
                className="input"
                value={form.testName}
                onChange={(e) => onTestNameChange(e.currentTarget.value)}
              >
                {CAPABILITY_TESTS.map((test) => (
                  <option key={test.name} value={test.name}>
                    {test.name}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontWeight: 800 }}>Category</span>
              <select
                className="input"
                value={form.category}
                onChange={(e) => patchForm({ category: e.currentTarget.value as FitnessTestCategory })}
              >
                {CAPABILITY_CATEGORIES.map((category) => (
                  <option key={category.value} value={category.value}>
                    {category.label}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontWeight: 800 }}>Date</span>
              <input className="input" type="date" value={form.dateKey} onChange={(e) => patchForm({ dateKey: e.currentTarget.value })} />
            </label>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontWeight: 800 }}>Result value</span>
              <input
                className="input"
                type="number"
                min="0"
                step="0.01"
                value={form.resultValue}
                onChange={(e) => patchForm({ resultValue: e.currentTarget.value })}
              />
            </label>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontWeight: 800 }}>Result unit</span>
              <select
                className="input"
                value={form.resultUnit}
                onChange={(e) => patchForm({ resultUnit: e.currentTarget.value as FormState["resultUnit"] })}
              >
                <option value="">Select unit</option>
                {CAPABILITY_UNITS.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontWeight: 800 }}>Side</span>
              <select
                className="input"
                value={form.side ?? "none"}
                onChange={(e) => patchForm({ side: e.currentTarget.value as FormState["side"] })}
              >
                {CAPABILITY_SIDES.map((side) => (
                  <option key={side} value={side}>
                    {side}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontWeight: 800 }}>Status</span>
              <select
                className="input"
                value={form.status}
                onChange={(e) => patchForm({ status: e.currentTarget.value as FormState["status"] })}
              >
                <option value="">Select status</option>
                {CAPABILITY_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontWeight: 800 }}>Pain</span>
              <select
                className="input"
                value={form.pain}
                onChange={(e) => patchForm({ pain: e.currentTarget.value as FormState["pain"] })}
              >
                <option value="">Select pain</option>
                {CAPABILITY_PAINS.map((pain) => (
                  <option key={pain} value={pain}>
                    {pain}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontWeight: 800 }}>Notes</span>
            <textarea
              className="input"
              rows={3}
              value={form.notes}
              onChange={(e) => patchForm({ notes: e.currentTarget.value })}
            />
          </label>

          <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {form.id ? (
              <button className="btn" type="button" onClick={() => setForm(defaultForm())}>
                Cancel Edit
              </button>
            ) : null}
            <button className="btn primary" type="submit">
              {form.id ? "Save Result" : "Add Result"}
            </button>
          </div>
        </form>
      </Section>

      <Section
        title="Recent Results"
        subtitle="Newest first"
        right={
          <select
            aria-label="Filter category"
            className="input"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.currentTarget.value as typeof categoryFilter)}
          >
            <option value="all">All categories</option>
            {CAPABILITY_CATEGORIES.map((category) => (
              <option key={category.value} value={category.value}>
                {category.label}
              </option>
            ))}
          </select>
        }
      >
        {!rows ? (
          <div className="muted">Loading capability tests...</div>
        ) : !visibleRows.length ? (
          <div data-testid="capability-empty-state" style={{ display: "grid", gap: 8 }}>
            <div style={{ fontWeight: 900 }}>No capability tests logged yet.</div>
            <div className="muted">Start with Floor Get-Up, Single-Leg Balance, or Suitcase Carry.</div>
          </div>
        ) : (
          <div data-testid="capability-results-list" style={{ display: "grid", gap: 10 }}>
            {visibleRows.map((row) => (
              <div
                key={row.id}
                data-testid={`capability-result:${row.id}`}
                className="card"
                style={{ padding: 12, border: "1px solid rgba(148,163,184,0.28)" }}
              >
                <div data-testid={`capability-result-text:${row.id}`} style={{ fontWeight: 850, lineHeight: 1.35 }}>
                  {rowText(row)}
                </div>
                <div className="row" style={{ gap: 8, marginTop: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                  <button className="btn small" type="button" onClick={() => startEdit(row)}>
                    Edit
                  </button>
                  <button className="btn small" type="button" onClick={() => void deleteResult(row)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </Page>
  );
}
