import { expect, test } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173";
test("Export Advanced provides read-only maintenance upload, preview, copy, and download", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(new URL("/export", BASE_URL).toString(), { waitUntil: "domcontentloaded" });
  await page.evaluate(async () => {
    const db = (window as any).__db; await db.exercises.clear();
    await db.exercises.put({ id: "exercise-1", name: "Row", normalizedName: "row", movementPattern: null, equipmentTags: [], createdAt: Date.now() });
  });
  await page.locator("summary", { hasText: "Advanced" }).click();
  const card = page.getByTestId("database-maintenance-card");
  await expect(card).toContainText("Database Maintenance"); await expect(card).toContainText("workout_mvp_db"); await expect(card).toContainText("Dexie schema: 19");
  const source = JSON.stringify({ format: "ironforge-db-maintenance", version: 1, id: "ui-script-001", name: "Normalize Row", createdAt: "2026-10-24T14:00:00.000Z", operationCount: 1, preconditions: { dbName: "workout_mvp_db", dexieSchemaVersion: 19, supportedBackupVersion: 2 }, sourceBackup: { exportedAt: "2026-10-24T12:00:00.000Z", recordCounts: { exercises: 1 } }, operations: [{ type: "updateRecord", table: "exercises", key: "exercise-1", expect: { movementPattern: null }, set: { movementPattern: "pull" } }] });
  await page.getByLabel("Maintenance JSON file").setInputFiles({ name: "maintenance.json", mimeType: "application/json", buffer: Buffer.from(source) });
  await expect(page.getByTestId("maintenance-script-summary")).toContainText("ui-script-001"); await expect(card).toContainText("Normalize Row");
  await card.getByRole("button", { name: "Run Dry Check" }).click();
  const result = page.getByTestId("maintenance-dry-run-result"); await expect(result).toContainText("Would change: 1"); await expect(result).toContainText("NO DATA MODIFIED");
  await page.getByTestId("maintenance-change-preview").locator("summary").first().click(); await expect(result).toContainText("movementPattern"); await expect(result).toContainText("WOULD_CHANGE");
  const databaseRow = await page.evaluate(() => (window as any).__db.exercises.get("exercise-1")); expect(databaseRow.movementPattern).toBeNull();
  await result.getByRole("button", { name: "Copy Report" }).click(); await expect(card).toContainText("Dry-run report copied.");
  const downloadPromise = page.waitForEvent("download"); await result.getByRole("button", { name: "Download Report" }).click(); expect((await downloadPromise).suggestedFilename()).toContain("ui-script-001");
  await expect(card.getByRole("button", { name: /execute/i })).toHaveCount(0);
});
