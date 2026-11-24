import { expect, test } from "@playwright/test";
import { resetDexieDb } from "./helpers/dbSeed";

async function openCreateForm(page: import("@playwright/test").Page) {
  await page.goto("/exercises");
  await page.getByRole("button", { name: "+ New", exact: true }).click();
  await expect(page.getByPlaceholder("e.g., Barbell Bench Press")).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await resetDexieDb(page);
});

test("manual exercise creation stores optional structured metadata through the shared creator", async ({ page }) => {
  await openCreateForm(page);
  await page.getByPlaceholder("e.g., Barbell Bench Press").fill("  Cable Row  ");
  await page.getByLabel("Primary Metric").selectOption("distance");
  await page.getByLabel("Body Part").selectOption("Back");
  await page.getByLabel("Movement Pattern").selectOption("pull");
  await page.getByLabel("Strength Signal Role").selectOption("secondary");
  await page.getByLabel("Category").selectOption("Strength");
  await page.getByLabel("Equipment").selectOption("Cable");
  await page.getByRole("button", { name: "Save", exact: true }).click();

  const rows = await page.evaluate(async () => (window as any).__db.exercises.toArray());
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    name: "Cable Row",
    normalizedName: "cable row",
    aliases: [],
    equipmentTags: [],
    metricMode: "distance",
    bodyPart: "Back",
    movementPattern: "pull",
    strengthSignalRole: "secondary",
    category: "Strength",
    equipment: "Cable",
  });
  expect(rows[0].createdAt).toBe(rows[0].updatedAt);
});

test("minimal Cable Row creation leaves taxonomy and metric mode unset", async ({ page }) => {
  await openCreateForm(page);
  await page.getByPlaceholder("e.g., Barbell Bench Press").fill("Cable Row");
  await page.getByRole("button", { name: "Save", exact: true }).click();

  const rows = await page.evaluate(async () => (window as any).__db.exercises.toArray());
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    name: "Cable Row",
    normalizedName: "cable row",
    aliases: [],
    equipmentTags: [],
  });
  for (const field of ["metricMode", "bodyPart", "movementPattern", "strengthSignalRole", "category", "equipment"]) {
    expect(rows[0][field]).toBeUndefined();
  }
});

test("manual creation still blocks an existing normalized-name duplicate without overwriting metadata", async ({ page }) => {
  await page.evaluate(async () => {
    const db = (window as any).__db;
    const now = Date.now();
    await db.exercises.add({
      id: "existing-cable-row",
      name: "Cable Row",
      normalizedName: "cable row",
      movementPattern: "pull",
      strengthSignalRole: "secondary",
      aliases: ["Seated Cable Row"],
      equipmentTags: ["cable"],
      createdAt: now,
      updatedAt: now,
    });
  });
  await openCreateForm(page);
  await page.getByPlaceholder("e.g., Barbell Bench Press").fill("  Cable-Row ");
  await page.getByRole("button", { name: "Save", exact: true }).click();

  const rows = await page.evaluate(async () => (window as any).__db.exercises.toArray());
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    id: "existing-cable-row",
    movementPattern: "pull",
    strengthSignalRole: "secondary",
    aliases: ["Seated Cable Row"],
  });
});
