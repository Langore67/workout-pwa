import { expect, test, type Page } from "@playwright/test";
import { resetDexieDb } from "./helpers/dbSeed";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173/";

async function goto(page: Page, path: string) {
  await page.goto(new URL(path, BASE_URL).toString(), { waitUntil: "domcontentloaded" });
}

test.describe("recent session note evidence", () => {
  test.beforeEach(async ({ page }) => {
    await goto(page, "/");
    await resetDexieDb(page);
  });

  test("queries the inclusive 21-day window with exact raw text and structural provenance", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { db } = await import("/src/db.ts");
      const { DAY_MS, queryRecentSessionNoteEvidence } = await import(
        "/src/domain/coaching/recentSessionNotes.ts"
      );
      const now = Date.now();
      const exerciseId = "exercise-pull-up";
      const trackId = "track-pull-up";

      await db.exercises.add({
        id: exerciseId,
        name: "Pull Up",
        normalizedName: "pull up",
        equipmentTags: ["bodyweight"],
        createdAt: now - 30 * DAY_MS,
      });
      await db.tracks.add({
        id: trackId,
        exerciseId,
        trackType: "strength",
        displayName: "Pull Up",
        trackingMode: "weightedReps",
        warmupSetsDefault: 0,
        workingSetsDefault: 3,
        repMin: 3,
        repMax: 8,
        restSecondsDefault: 120,
        weightJumpDefault: 5,
        createdAt: now - 30 * DAY_MS,
      });
      await db.templates.add({ id: "template", name: "Upper", createdAt: now - 30 * DAY_MS });
      await db.templateItems.add({
        id: "template-item",
        templateId: "template",
        orderIndex: 0,
        trackId,
        notes: "planned template note",
        createdAt: now - 30 * DAY_MS,
      });

      const sessions = [
        { id: "newer", templateName: "Upper B", startedAt: now - DAY_MS, endedAt: now - DAY_MS, notes: "  exact session text  " },
        { id: "tie-b", templateName: "Tie B", startedAt: now - 2 * DAY_MS, endedAt: now - 2 * DAY_MS, notes: "same text" },
        { id: "tie-a", templateName: "Tie A", startedAt: now - 2 * DAY_MS, endedAt: now - 2 * DAY_MS, notes: "same text" },
        { id: "cutoff", templateName: "Cutoff", startedAt: now - 21 * DAY_MS, endedAt: now - 21 * DAY_MS, notes: "inclusive cutoff" },
        { id: "outside", templateName: "Outside", startedAt: now - 21 * DAY_MS - 1, endedAt: now - 21 * DAY_MS - 1, notes: "too old" },
        { id: "open", templateName: "Open", startedAt: now - DAY_MS, notes: "unfinished" },
        { id: "deleted", templateName: "Deleted", startedAt: now - DAY_MS, endedAt: now - DAY_MS, notes: "deleted", deletedAt: now },
        { id: "empty", templateName: "Empty", startedAt: now - DAY_MS, endedAt: now - DAY_MS, notes: "   " },
      ];
      await db.sessions.bulkAdd(sessions);
      await db.sessionItems.add({
        id: "session-item",
        sessionId: "newer",
        orderIndex: 0,
        trackId,
        notes: "planned session item note",
        createdAt: now - DAY_MS,
      });
      await db.sets.bulkAdd([
        { id: "set-empty", sessionId: "newer", trackId, createdAt: now - DAY_MS + 1, completedAt: now - DAY_MS + 1, setType: "working", reps: 5, notes: "" },
        { id: "set-note", sessionId: "newer", trackId, createdAt: now - DAY_MS + 2, completedAt: now - DAY_MS + 2, setType: "working", weight: 0, reps: 3, rir: 1, notes: "Form broke\ndown." },
        { id: "set-deleted", sessionId: "newer", trackId, createdAt: now - DAY_MS + 3, completedAt: now - DAY_MS + 3, setType: "working", notes: "deleted set", deletedAt: now },
        { id: "orphan", sessionId: "missing", trackId, createdAt: now - DAY_MS, completedAt: now - DAY_MS, setType: "working", notes: "orphan" },
      ]);

      const before = {
        sessions: JSON.stringify(await db.sessions.toArray()),
        sets: JSON.stringify(await db.sets.toArray()),
      };
      const evidence = await queryRecentSessionNoteEvidence({ now });
      const after = {
        sessions: JSON.stringify(await db.sessions.toArray()),
        sets: JSON.stringify(await db.sets.toArray()),
      };
      return { evidence, before, after };
    });

    expect(result.after).toEqual(result.before);
    expect(result.evidence.map((row) => row.evidenceId)).toEqual([
      "session:newer",
      "set:set-note",
      "session:tie-a",
      "session:tie-b",
      "session:cutoff",
    ]);
    expect(result.evidence.map((row) => row.rawText)).not.toContain("too old");
    expect(result.evidence.map((row) => row.rawText)).not.toContain("planned template note");
    expect(result.evidence.map((row) => row.rawText)).not.toContain("planned session item note");
    expect(result.evidence.filter((row) => row.rawText === "same text")).toHaveLength(2);

    const sessionNote = result.evidence.find((row) => row.evidenceId === "session:newer")!;
    expect(sessionNote.rawText).toBe("  exact session text  ");
    expect(sessionNote.exerciseId).toBeUndefined();
    expect(sessionNote.setId).toBeUndefined();

    const setNote = result.evidence.find((row) => row.evidenceId === "set:set-note")!;
    expect(setNote.rawText).toBe("Form broke\ndown.");
    expect(setNote).toMatchObject({
      sessionId: "newer",
      sessionName: "Upper B",
      trackId: "track-pull-up",
      exerciseId: "exercise-pull-up",
      exerciseName: "Pull Up",
      setId: "set-note",
      setContext: { setType: "working", setNumber: 2, weight: 0, reps: 3, rir: 1 },
    });
  });

  test("History renders grouped notes, provenance, deep links, and the fixed window", async ({ page }) => {
    const seeded = await page.evaluate(async () => {
      const db = (window as any).__db;
      const now = Date.now();
      await db.exercises.add({ id: "ex", name: "Pull Up", normalizedName: "pull up", equipmentTags: [], createdAt: now });
      await db.tracks.add({ id: "track", exerciseId: "ex", trackType: "strength", displayName: "Pull Up", trackingMode: "weightedReps", warmupSetsDefault: 0, workingSetsDefault: 1, repMin: 3, repMax: 8, restSecondsDefault: 120, weightJumpDefault: 5, createdAt: now });
      await db.sessions.add({ id: "session", templateName: "Upper B", startedAt: now - 3600000, endedAt: now, notes: "Shoulder felt better." });
      await db.sets.add({ id: "set", sessionId: "session", trackId: "track", createdAt: now - 1800000, completedAt: now - 1800000, setType: "working", weight: 0, reps: 3, rir: 1, notes: "Form broke down." });
      return { sessionId: "session" };
    });

    await goto(page, "/history");
    await expect(page.getByTestId("recent-notes")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("recent-notes-window")).toHaveText("Last 21 days");
    const group = page.getByTestId(`recent-notes-session:${seeded.sessionId}`);
    await expect(group).toContainText("Upper B");
    await expect(group).toContainText("Session note");
    await expect(group).toContainText("Shoulder felt better.");
    await expect(group).toContainText("Pull Up · Work set 1 · BW x 3 @1");
    await expect(group).toContainText("Set note");
    await expect(group).toContainText("Form broke down.");

    await page.getByTestId(`recent-notes-link:${seeded.sessionId}`).click();
    await expect(page).toHaveURL(new RegExp(`/session/${seeded.sessionId}$`));
    await expect(page.getByTestId("session-detail")).toBeVisible({ timeout: 15000 });
  });

  test("History shows the recent-notes empty state without implying history is empty", async ({ page }) => {
    await goto(page, "/history");
    await expect(page.getByTestId("recent-notes-empty")).toHaveText(
      "No session or set notes recorded in the last 21 days."
    );
    await expect(page.getByTestId("history-completed")).toBeVisible();
  });
});
