import { expect, test, type Page } from "@playwright/test";
import { resetDexieDb } from "./helpers/dbSeed";

async function seedWindowEvidence(page: Page) {
  return page.evaluate(async () => {
    const { db } = await import("/src/db.ts");
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    await db.sessions.bulkAdd([
      { id: "recent", templateName: "Upper B", startedAt: now - 10 * day, endedAt: now - 10 * day, notes: "Recent shoulder note." },
      { id: "ninety", templateName: "Lower A", startedAt: now - 30 * day, endedAt: now - 30 * day, notes: "Thirty day note." },
      { id: "old", templateName: "Upper A", startedAt: now - 120 * day, endedAt: now - 120 * day, notes: "Old historical note." },
    ]);
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await resetDexieDb(page);
});

test("formats deterministic raw evidence without mutating it", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { buildRecentNotesHandoff } = await import("/src/domain/coaching/recentNotesHandoff.ts");
    const evidence = [
      {
        evidenceId: "set:set-1",
        occurredAt: Date.UTC(2026, 10, 12, 18),
        sessionId: "session-new",
        sessionName: "Upper B",
        sourceKind: "set_note" as const,
        rawText: "Form broke\ndown.",
        exerciseName: "Pull Up",
        setId: "set-1",
        setContext: { setType: "working" as const, setNumber: 3, weight: 0, reps: 3, rir: 1 },
      },
      {
        evidenceId: "session:old",
        occurredAt: Date.UTC(2026, 10, 9, 18),
        sessionId: "session-old",
        sessionName: "Lower A",
        sourceKind: "session_note" as const,
        rawText: "Same text",
      },
      {
        evidenceId: "session:new",
        occurredAt: Date.UTC(2026, 10, 12, 18),
        sessionId: "session-new",
        sessionName: "Upper B",
        sourceKind: "session_note" as const,
        rawText: "Same text",
      },
    ];
    const before = JSON.stringify(evidence);
    const handoff = buildRecentNotesHandoff(evidence, {
      window: "90d",
      generatedAt: Date.UTC(2026, 10, 17, 17, 30),
      timeZone: "UTC",
    });
    return { handoff, before, after: JSON.stringify(evidence) };
  });

  expect(result.after).toBe(result.before);
  expect(result.handoff).toMatchObject({
    filename: "ironforge-recent-notes-90d-2026-11-17.md",
    sessionCount: 2,
    noteCount: 3,
  });
  expect(result.handoff.markdown).toContain("Window: Last 90 days");
  expect(result.handoff.markdown).toContain("Notes have not been summarized, classified, or rewritten.");
  expect(result.handoff.markdown).toContain("### Pull Up — Work set 3");
  expect(result.handoff.markdown).toContain("- Performance: BW × 3");
  expect(result.handoff.markdown).toContain("- RIR: 1");
  expect(result.handoff.markdown).toContain("Form broke\ndown.");
  expect(result.handoff.markdown.match(/Same text/g)).toHaveLength(2);
  expect(result.handoff.markdown.indexOf("Upper B")).toBeLessThan(result.handoff.markdown.indexOf("Lower A"));
});

test("switches handoff windows and copies the canonical Markdown", async ({ page }) => {
  let copied = "";
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => { (window as any).__copiedHandoff = text; },
      },
    });
  });
  await seedWindowEvidence(page);
  await page.goto("/history");

  await expect(page.getByTestId("recent-notes-handoff-window:21d")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("recent-notes-handoff-counts")).toHaveText("1 session · 1 note");
  await page.getByTestId("recent-notes-handoff-window:90d").click();
  await expect(page.getByTestId("recent-notes-handoff-counts")).toHaveText("2 sessions · 2 notes");
  await page.getByTestId("recent-notes-handoff-window:all").click();
  await expect(page.getByTestId("recent-notes-handoff-counts")).toHaveText("3 sessions · 3 notes");

  await page.getByTestId("copy-recent-notes-handoff").click();
  await expect(page.getByTestId("recent-notes-handoff-status")).toHaveText("Copied 3 notes from 3 sessions.");
  copied = await page.evaluate(() => (window as any).__copiedHandoff ?? "");
  expect(copied).toContain("# IronForge Recent Notes Handoff");
  expect(copied).toContain("Window: All history");
  expect(copied).toContain("Recent shoulder note.");
  expect(copied).toContain("Old historical note.");
});

test("downloads the same canonical Markdown with a safe filename", async ({ page }) => {
  await seedWindowEvidence(page);
  await page.goto("/history");
  await page.getByTestId("recent-notes-handoff-window:all").click();
  await expect(page.getByTestId("recent-notes-handoff-counts")).toHaveText("3 sessions · 3 notes");
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("download-recent-notes-handoff").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^ironforge-recent-notes-all-\d{4}-\d{2}-\d{2}\.md$/);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const markdown = Buffer.concat(chunks).toString("utf8");
  expect(markdown).toContain("Window: All history");
  expect(markdown).toContain("Sessions: 3");
  expect(markdown).toContain("Notes: 3");
  expect(markdown).toContain("Old historical note.");
});

test("disables empty handoffs without implying workout history is empty", async ({ page }) => {
  await page.goto("/history");
  await expect(page.getByTestId("recent-notes-handoff-empty")).toBeVisible();
  await expect(page.getByTestId("copy-recent-notes-handoff")).toBeDisabled();
  await expect(page.getByTestId("download-recent-notes-handoff")).toBeDisabled();
  await expect(page.getByTestId("history-completed")).toBeVisible();
});

test("shows actionable feedback when clipboard copy fails", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async () => { throw new Error("denied"); } },
    });
    document.execCommand = () => false;
  });
  await seedWindowEvidence(page);
  await page.goto("/history");
  await page.getByTestId("copy-recent-notes-handoff").click();
  await expect(page.getByTestId("recent-notes-handoff-status")).toHaveText(
    "Could not copy the handoff. Use Download .md instead."
  );
  await expect(page.getByTestId("download-recent-notes-handoff")).toBeEnabled();
});
