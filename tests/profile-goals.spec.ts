import { expect, test } from "@playwright/test";
import { resetDexieDb } from "./helpers/dbSeed";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173";

async function clearProfileState(page: import("@playwright/test").Page) {
  await page.goto(new URL("/", BASE_URL).toString(), { waitUntil: "domcontentloaded" });
  await resetDexieDb(page);
  await page.evaluate(() => {
    localStorage.removeItem("workout_pwa_profile_v1");
  });
}

test("profile goals helper reads existing localStorage targets and ignores current fields", async ({ page }) => {
  await clearProfileState(page);
  await page.evaluate(() => {
    localStorage.setItem(
      "workout_pwa_profile_v1",
      JSON.stringify({
        currentWeightLb: "999",
        currentBodyFatPct: "99",
        targetWeightLb: "185",
        targetBodyFatPct: "17",
      })
    );
  });

  const goals = await page.evaluate(async () => {
    const { getProfileGoals } = await import("/src/profile/profileGoals.ts");
    return getProfileGoals();
  });

  expect(goals).toEqual({
    targetWeightLb: 185,
    targetBodyFatPct: 17,
  });
});

test("profile goals helper prefers app_meta goals over localStorage fallback", async ({ page }) => {
  await clearProfileState(page);
  await page.evaluate(async () => {
    localStorage.setItem(
      "workout_pwa_profile_v1",
      JSON.stringify({
        targetWeightLb: "185",
        targetBodyFatPct: "17",
      })
    );

    const { db } = await import("/src/db.ts");
    await db.app_meta.put({
      key: "profile.goals.v1",
      valueJson: JSON.stringify({
        targetWeightLb: 181,
        targetBodyFatPct: 16,
        targetWaistIn: 34,
        targetVisceralFatEstimate: 7,
      }),
      updatedAt: Date.now(),
    });
  });

  const goals = await page.evaluate(async () => {
    const { getProfileGoals } = await import("/src/profile/profileGoals.ts");
    return getProfileGoals();
  });

  expect(goals).toEqual({
    targetWeightLb: 181,
    targetBodyFatPct: 16,
    targetWaistIn: 34,
    targetVisceralFatEstimate: 7,
  });
});

test("ProfilePage saves target goals to app_meta", async ({ page }) => {
  await clearProfileState(page);
  await page.goto(new URL("/profile", BASE_URL).toString(), { waitUntil: "domcontentloaded" });

  await page.getByRole("button", { name: "Edit" }).click();
  const bodyTargets = page.locator(".card").filter({ hasText: "BODY TARGETS" });
  await bodyTargets.getByRole("textbox").nth(0).fill("182");
  await bodyTargets.getByRole("textbox").nth(1).fill("16");
  await bodyTargets.getByRole("textbox").nth(2).fill("34");
  await bodyTargets.getByRole("textbox").nth(3).fill("7");
  await page.getByRole("button", { name: "Done" }).click();

  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const { db } = await import("/src/db.ts");
        const row = await db.app_meta.get("profile.goals.v1");
        return row?.valueJson ? JSON.parse(row.valueJson) : null;
      })
    )
    .toMatchObject({
      targetWeightLb: 182,
      targetBodyFatPct: 16,
      targetWaistIn: 34,
      targetVisceralFatEstimate: 7,
    });
});

test("BodyCompositionPage reads targets through profile goals helper", async ({ page }) => {
  await clearProfileState(page);
  await page.evaluate(async () => {
    const { db } = await import("/src/db.ts");
    const now = Date.now();
    await db.app_meta.put({
      key: "profile.goals.v1",
      valueJson: JSON.stringify({
        targetWeightLb: 181,
        targetBodyFatPct: 16,
      }),
      updatedAt: now,
    });
    await db.bodyMetrics.add({
      id: crypto.randomUUID(),
      measuredAt: now,
      takenAt: now,
      createdAt: now,
      weightLb: 198,
      waistIn: 35.5,
      bodyFatPct: 18,
      leanMassLb: 162.4,
    });
  });

  await page.goto(new URL("/body-composition", BASE_URL).toString(), { waitUntil: "domcontentloaded" });

  const goalTargets = page.locator(".card").filter({ hasText: "GOAL TARGETS" }).first();
  await expect(goalTargets).toContainText("181.0 lb");
  await expect(goalTargets).toContainText("16.0%");
});
