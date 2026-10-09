import { expect, test } from "@playwright/test";
import { parseTrainingRole, TRAINING_ROLES } from "../src/domain/trainingRole";
import { resetDexieDb } from "./helpers/dbSeed";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173";

test("TrainingRole accepts only the compact supported model", () => {
  expect(TRAINING_ROLES).toEqual(["primary", "accessory", "corrective", "deprioritized"]);
  expect(parseTrainingRole("Primary")).toBe("primary");
  expect(parseTrainingRole(" corrective ")).toBe("corrective");
  expect(parseTrainingRole("hypertrophy")).toBeUndefined();
  expect(parseTrainingRole(undefined)).toBeUndefined();
});

test("exercise editor persists and clears Training Role without inference or duplication", async ({ page }) => {
  await page.goto(new URL("/", BASE_URL).toString(), { waitUntil: "domcontentloaded" });
  await resetDexieDb(page);
  await page.evaluate(async () => {
    // @ts-ignore
    const db = window.__db;
    const now = Date.now();
    await db.exercises.bulkAdd([
      { id: "bench", name: "Bench Press", normalizedName: "bench press", equipmentTags: [], createdAt: now },
      { id: "tke", name: "TKE Corrective Rehab", normalizedName: "tke corrective rehab", equipmentTags: [], createdAt: now },
    ]);
  });

  await page.goto(new URL("/exercises", BASE_URL).toString(), { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /^Bench Press\b/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Edit", exact: true }).evaluate((button: HTMLButtonElement) => button.click());
  let dialog = page.getByRole("dialog");
  const role = dialog.getByTitle("Records this exercise's programming significance without changing scoring");
  await expect(role).toHaveValue("");
  await role.selectOption("primary");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();

  let stored = await page.evaluate(async () => {
    // @ts-ignore
    const db = window.__db;
    return {
      bench: (await db.exercises.get("bench"))?.trainingRole,
      tke: (await db.exercises.get("tke"))?.trainingRole,
      benchRows: await db.exercises.where("normalizedName").equals("bench press").count(),
    };
  });
  expect(stored).toEqual({ bench: "primary", tke: undefined, benchRows: 1 });

  await page.getByRole("button", { name: /^Bench Press\b/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Edit", exact: true }).evaluate((button: HTMLButtonElement) => button.click());
  dialog = page.getByRole("dialog");
  await dialog.getByTitle("Records this exercise's programming significance without changing scoring").selectOption("");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  stored = await page.evaluate(async () => {
    // @ts-ignore
    const db = window.__db;
    return {
      bench: (await db.exercises.get("bench"))?.trainingRole,
      tke: (await db.exercises.get("tke"))?.trainingRole,
      benchRows: await db.exercises.where("normalizedName").equals("bench press").count(),
    };
  });
  expect(stored).toEqual({ bench: undefined, tke: undefined, benchRows: 1 });
});
