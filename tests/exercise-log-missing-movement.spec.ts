import { expect, test } from "@playwright/test";
import { resetDexieDb } from "./helpers/dbSeed";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173";

test("missing movement-pattern exercises open the existing exact editor and refresh after save", async ({ page }) => {
  await page.goto(new URL("/", BASE_URL).toString(), { waitUntil: "domcontentloaded" });
  await resetDexieDb(page);

  await page.evaluate(async () => {
    // @ts-ignore
    const db = window.__db;
    if (!db) throw new Error("__db missing on window.");
    const now = Date.now();
    await db.exercises.bulkAdd([
      {
        id: "missing-bench",
        name: "Bench Press",
        normalizedName: "bench press",
        equipmentTags: [],
        strengthSignalRole: "included",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "missing-cable-fly",
        name: "Cable Fly",
        normalizedName: "cable fly",
        equipmentTags: [],
        strengthSignalRole: "secondary",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "complete-row",
        name: "Cable Row",
        normalizedName: "cable row",
        equipmentTags: [],
        strengthSignalRole: "included",
        movementPattern: "pull",
        createdAt: now,
        updatedAt: now,
      },
    ]);
  });

  await page.goto(new URL("/exercises", BASE_URL).toString(), { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Audit Review" }).click();
  await page.getByText("Missing Movement Pattern (2)", { exact: false }).click();

  const benchAction = page.getByRole("button", { name: "Edit movement pattern for Bench Press" });
  const flyAction = page.getByRole("button", { name: "Edit movement pattern for Cable Fly" });
  await expect(benchAction).toBeVisible();
  await expect(flyAction).toBeVisible();
  await expect(benchAction).toHaveAttribute("type", "button");

  await benchAction.click();
  let dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Edit Exercise");
  await expect(dialog).toContainText("Bench Press");
  await dialog.getByRole("button", { name: "Close" }).click();

  await flyAction.focus();
  await page.keyboard.press("Enter");
  dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Cable Fly");
  await dialog.getByRole("button", { name: "Close" }).click();

  await benchAction.click();
  dialog = page.getByRole("dialog");
  await dialog.getByTitle("Primary movement pattern used for movement breakdown and future classification cleanup").selectOption("push");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();

  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/exercises$/);
  await expect(page.getByText("Missing Movement Pattern (1)", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit movement pattern for Bench Press" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit movement pattern for Cable Fly" })).toBeAttached();

  const stored = await page.evaluate(async () => {
    // @ts-ignore
    const db = window.__db;
    const exercise = await db.exercises.get("missing-bench");
    const matchingBenchRows = await db.exercises.where("normalizedName").equals("bench press").count();
    return { movementPattern: exercise?.movementPattern, matchingBenchRows };
  });
  expect(stored).toEqual({ movementPattern: "push", matchingBenchRows: 1 });
});
