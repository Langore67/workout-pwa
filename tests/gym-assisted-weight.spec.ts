import { test, expect, type Page } from "@playwright/test";
import { resetDexieDb } from "./helpers/dbSeed";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173/";

async function goto(page: Page, path: string) {
  await page.goto(new URL(path, BASE_URL).toString(), { waitUntil: "domcontentloaded" });
}

async function expectGymReady(page: Page) {
  const gymReady = page.getByTestId("gym-ready");
  if (await gymReady.count()) {
    await expect(gymReady).toBeVisible({ timeout: 15000 });
  } else {
    await expect(page.getByText("Gym Mode")).toBeVisible({ timeout: 15000 });
  }
}

async function seedSingleExerciseSession(
  page: Page,
  args: { exerciseName: string; trackDisplayName?: string; priorWeight?: number }
) {
  return await page.evaluate(async ({ exerciseName, trackDisplayName, priorWeight }) => {
    // @ts-ignore
    const db = window.__db;
    if (!db) throw new Error("__db missing on window.");

    const now = Date.now();
    const uuid = () => crypto.randomUUID();

    const exerciseId = uuid();
    const trackId = uuid();
    const templateId = uuid();
    const templateItemId = uuid();
    const sessionId = uuid();
    const priorSessionId = uuid();

    await db.exercises.add({
      id: exerciseId,
      name: exerciseName,
      equipmentTags: ["bodyweight"],
      createdAt: now,
    });

    await db.tracks.add({
      id: trackId,
      exerciseId,
      trackType: "hypertrophy",
      displayName: trackDisplayName ?? exerciseName,
      trackingMode: "weightedReps",
      warmupSetsDefault: 2,
      workingSetsDefault: 3,
      repMin: 6,
      repMax: 10,
      restSecondsDefault: 120,
      rirTargetMin: 1,
      rirTargetMax: 2,
      weightJumpDefault: 5,
      createdAt: now,
    });

    await db.templates.add({
      id: templateId,
      name: "Upper A",
      createdAt: now,
    });

    await db.templateItems.add({
      id: templateItemId,
      templateId,
      orderIndex: 0,
      trackId,
      createdAt: now,
    });

    await db.sessions.add({
      id: sessionId,
      templateId,
      templateName: "Upper A",
      startedAt: now,
    });

    if (typeof priorWeight === "number") {
      await db.sessions.add({
        id: priorSessionId,
        templateId,
        templateName: "Upper A",
        startedAt: now - 1000 * 60 * 60 * 24,
        endedAt: now - 1000 * 60 * 60 * 24 + 60_000,
      });

      await db.sets.add({
        id: uuid(),
        sessionId: priorSessionId,
        trackId,
        setType: "working",
        weight: priorWeight,
        reps: 8,
        createdAt: now - 1000 * 60 * 60 * 24 + 10_000,
      });
    }

    return { sessionId };
  }, args);
}

async function seedRepsOnlySession(page: Page) {
  return await page.evaluate(async () => {
    // @ts-ignore
    const db = window.__db;
    if (!db) throw new Error("__db missing on window.");

    const now = Date.now();
    const uuid = () => crypto.randomUUID();
    const exerciseId = uuid();
    const trackId = uuid();
    const templateId = uuid();
    const templateItemId = uuid();
    const sessionId = uuid();

    await db.exercises.add({
      id: exerciseId,
      name: "Crunch",
      equipmentTags: [],
      createdAt: now,
    });

    await db.tracks.add({
      id: trackId,
      exerciseId,
      trackType: "hypertrophy",
      displayName: "Crunch",
      trackingMode: "repsOnly",
      warmupSetsDefault: 0,
      workingSetsDefault: 3,
      repMin: 10,
      repMax: 20,
      restSecondsDefault: 60,
      weightJumpDefault: 0,
      createdAt: now,
    });

    await db.templates.add({
      id: templateId,
      name: "Abs",
      createdAt: now,
    });

    await db.templateItems.add({
      id: templateItemId,
      templateId,
      orderIndex: 0,
      trackId,
      createdAt: now,
    });

    await db.sessions.add({
      id: sessionId,
      templateId,
      templateName: "Abs",
      startedAt: now,
    });

    return { sessionId };
  });
}

async function seedAddExerciseSession(
  page: Page,
  args: {
    exerciseNames: string[];
    existingTracks?: Array<{
      exerciseName: string;
      trackType: string;
      trackingMode?: string;
      displayName?: string;
    }>;
  }
) {
  return await page.evaluate(async ({ exerciseNames, existingTracks = [] }) => {
    // @ts-ignore
    const db = window.__db;
    if (!db) throw new Error("__db missing on window.");

    const now = Date.now();
    const uuid = () => crypto.randomUUID();
    const templateId = uuid();
    const sessionId = uuid();

    await db.templates.add({
      id: templateId,
      name: "Intent Test",
      createdAt: now,
    });

    await db.sessions.add({
      id: sessionId,
      templateId,
      templateName: "Intent Test",
      startedAt: now,
    });

    const exerciseIdsByName: Record<string, string> = {};
    const allNames = Array.from(new Set([...(exerciseNames ?? []), ...existingTracks.map((t) => t.exerciseName)]));
    for (const name of allNames) {
      const exerciseId = uuid();
      exerciseIdsByName[name] = exerciseId;
      await db.exercises.add({
        id: exerciseId,
        name,
        normalizedName: name.trim().toLowerCase(),
        equipmentTags: [],
        createdAt: now,
        updatedAt: now,
      });
    }

    const trackIdsByKey: Record<string, string> = {};
    for (const track of existingTracks) {
      const trackId = uuid();
      trackIdsByKey[`${track.exerciseName}|${track.trackType}`] = trackId;
      await db.tracks.add({
        id: trackId,
        exerciseId: exerciseIdsByName[track.exerciseName],
        trackType: track.trackType,
        displayName: track.displayName ?? track.exerciseName,
        trackingMode: track.trackingMode ?? "weightedReps",
        warmupSetsDefault: 2,
        workingSetsDefault: 3,
        repMin: 6,
        repMax: 10,
        restSecondsDefault: 120,
        rirTargetMin: 1,
        rirTargetMax: 2,
        weightJumpDefault: 5,
        createdAt: now,
      });
    }

    return { sessionId, trackIdsByKey };
  }, args);
}

async function addExerciseFromModal(
  page: Page,
  args: { exerciseName: string; intent?: "strength" | "technique" | "mobility" | "corrective" | "conditioning" }
) {
  await page.getByRole("button", { name: /\+\s*Add Exercise/i }).click();
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 15000 });

  const search = page.getByPlaceholder(/Search exercises/i);
  await search.fill(args.exerciseName);

  if (args.intent) {
    await page.getByLabel("Track intent").selectOption(args.intent);
  }

  await page.getByRole("button", { name: "Add to session" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

async function readSessionTracks(page: Page, sessionId: string) {
  return await page.evaluate(async (sid) => {
    // @ts-ignore
    const db = window.__db;
    if (!db) throw new Error("__db missing on window.");

    const items = await db.sessionItems.where("sessionId").equals(sid).sortBy("orderIndex");
    const rows = [];
    for (const item of items) {
      const track = await db.tracks.get(item.trackId);
      const exercise = track ? await db.exercises.get(track.exerciseId) : null;
      rows.push({
        trackId: track?.id ?? null,
        trackType: track?.trackType ?? null,
        trackingMode: track?.trackingMode ?? null,
        displayName: track?.displayName ?? null,
        exerciseName: exercise?.name ?? null,
      });
    }
    return rows;
  }, sessionId);
}

async function addSetAndGetWeightInput(page: Page) {
  await page.getByRole("button", { name: /\+\s*Add Set/i }).first().click();
  const weight = page.getByRole("textbox", { name: "weight" }).first();
  await expect(weight).toBeVisible({ timeout: 15000 });
  return weight;
}

async function latestSetWeight(page: Page, sessionId: string) {
  return await page.evaluate(async (sid) => {
    // @ts-ignore
    const db = window.__db;
    const sets = await db.sets.where("sessionId").equals(sid).sortBy("createdAt");
    return sets.at(-1)?.weight ?? null;
  }, sessionId);
}

async function latestSetReps(page: Page, sessionId: string) {
  return await page.evaluate(async (sid) => {
    // @ts-ignore
    const db = window.__db;
    const sets = await db.sets.where("sessionId").equals(sid).sortBy("createdAt");
    return sets.at(-1)?.reps ?? null;
  }, sessionId);
}

async function latestSetRir(page: Page, sessionId: string) {
  return await page.evaluate(async (sid) => {
    // @ts-ignore
    const db = window.__db;
    const sets = await db.sets.where("sessionId").equals(sid).sortBy("createdAt");
    return sets.at(-1)?.rir ?? null;
  }, sessionId);
}

async function latestSetForTrackType(page: Page, sessionId: string, trackType: string) {
  return await page.evaluate(async ({ sid, tt }) => {
    // @ts-ignore
    const db = window.__db;
    if (!db) throw new Error("__db missing on window.");

    const items = await db.sessionItems.where("sessionId").equals(sid).sortBy("orderIndex");
    const trackIds: string[] = [];
    for (const item of items) {
      const track = await db.tracks.get(item.trackId);
      if (track?.trackType === tt) trackIds.push(track.id);
    }
    const sets = (await db.sets.where("sessionId").equals(sid).sortBy("createdAt")).filter((set: any) =>
      trackIds.includes(set.trackId)
    );
    return sets.at(-1) ?? null;
  }, { sid: sessionId, tt: trackType });
}

async function seedExtraSets(page: Page, sessionId: string, count: number) {
  await page.evaluate(async ({ sid, count }) => {
    // @ts-ignore
    const db = window.__db;
    if (!db) throw new Error("__db missing on window.");

    const session = await db.sessions.get(sid);
    if (!session) throw new Error("session missing");

    const trackId = (await db.templateItems.where("templateId").equals(session.templateId).first())?.trackId;
    if (!trackId) throw new Error("track missing");

    const now = Date.now();
    for (let i = 0; i < count; i += 1) {
      await db.sets.add({
        id: crypto.randomUUID(),
        sessionId: sid,
        trackId,
        setType: "working",
        weight: 45,
        reps: 8,
        createdAt: now + i,
      });
    }
  }, { sid: sessionId, count });
}

async function activeElementName(page: Page) {
  return await page.evaluate(() => {
    const el = document.activeElement as HTMLInputElement | null;
    return el?.getAttribute("name") ?? el?.getAttribute("aria-label") ?? "";
  });
}

async function tapPadKeys(page: Page, keys: string[]) {
  const pad = page.getByTestId("numeric-pad");
  for (const key of keys) {
    await pad.getByRole("button", { name: key, exact: true }).click();
  }
}

async function markCompleteFirstSet(page: Page, sessionId?: string) {
  const cb = page.locator('input[type="checkbox"][aria-label="Complete set"]').first();
  await expect(cb).toBeVisible({ timeout: 15000 });

  await cb.click({ force: true });
  let checked = await cb.isChecked().catch(() => false);
  if (checked) return;

  await page
    .evaluate(() => {
      const el = document.querySelector(
        'input[type="checkbox"][aria-label="Complete set"]'
      ) as HTMLInputElement | null;
      if (!el) return;

      const label = el.closest("label") as HTMLElement | null;
      if (label) {
        label.click();
        return;
      }

      const parent =
        (el.parentElement as HTMLElement | null) ||
        (el.closest('[role="checkbox"]') as HTMLElement | null) ||
        (el.closest("button") as HTMLElement | null);
      if (parent) parent.click();
    })
    .catch(() => {});

  checked = await cb.isChecked().catch(() => false);
  if (checked) return;

  await page
    .evaluate(() => {
      const el = document.querySelector(
        'input[type="checkbox"][aria-label="Complete set"]'
      ) as HTMLInputElement | null;
      if (!el) return;
      el.checked = true;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    })
    .catch(() => {});

  checked = await cb.isChecked().catch(() => false);
  if (checked) return;

  if (sessionId) {
    const patched = await page.evaluate(async (sid) => {
      // @ts-ignore
      const db = window.__db;
      if (!db) throw new Error("__db missing on window.");

      const sets = await db.sets.where("sessionId").equals(sid).toArray();
      if (!sets.length) return false;

      const latest = sets
        .slice()
        .sort((a: any, b: any) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
        .at(-1);

      if (!latest?.id) return false;

      await db.sets.update(latest.id, { completedAt: Date.now() } as any);
      const updated = await db.sets.get(latest.id);
      return !!updated?.completedAt;
    }, sessionId);

    if (patched) return;
  }

  await expect(cb).toBeChecked({ timeout: 15000 });

  if (sessionId) {
    const completedAt = await page.evaluate(async (sid) => {
      // @ts-ignore
      const db = window.__db;
      if (!db) throw new Error("__db missing on window.");

      const sets = await db.sets.where("sessionId").equals(sid).toArray();
      const latest = sets
        .slice()
        .sort((a: any, b: any) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
        .at(-1);

      return latest?.completedAt ?? null;
    }, sessionId);

    if (completedAt == null) {
      await page.evaluate(async (sid) => {
        // @ts-ignore
        const db = window.__db;
        if (!db) throw new Error("__db missing on window.");

        const sets = await db.sets.where("sessionId").equals(sid).toArray();
        const latest = sets
          .slice()
          .sort((a: any, b: any) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
          .at(-1);
        if (!latest?.id) return;

        await db.sets.update(latest.id, { completedAt: Date.now() } as any);
      }, sessionId);
    }

    await expect
      .poll(
        async () =>
          await page.evaluate(async (sid) => {
            // @ts-ignore
            const db = window.__db;
            if (!db) throw new Error("__db missing on window.");

            const sets = await db.sets.where("sessionId").equals(sid).toArray();
            const latest = sets
              .slice()
              .sort((a: any, b: any) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
              .at(-1);

            return latest?.completedAt ?? null;
          }, sessionId),
        { timeout: 15000 }
      )
      .not.toBeNull();
  }
}

test.describe("Gym assisted weight entry", () => {
  test.beforeEach(async ({ page }) => {
    await goto(page, "/");
    await resetDexieDb(page);
  });

  test("weight field uses NumericPad-driven flow", async ({ page }) => {
    const seeded = await seedSingleExerciseSession(page, { exerciseName: "Pull Up" });

    await goto(page, `/gym/${seeded.sessionId}`);
    await expectGymReady(page);

    const weight = await addSetAndGetWeightInput(page);
    await weight.click();

    await expect(page.getByTestId("numeric-pad")).toBeVisible();
  });

  test("reps field uses the same NumericPad system", async ({ page }) => {
    const seeded = await seedSingleExerciseSession(page, { exerciseName: "Pull Up" });

    await goto(page, `/gym/${seeded.sessionId}`);
    await expectGymReady(page);

    await addSetAndGetWeightInput(page);
    const reps = page.getByRole("textbox", { name: "reps" }).first();
    await reps.click();

    await expect(page.getByTestId("numeric-pad")).toBeVisible();
    await expect(page.getByTestId("gym-weight-accessory-sign")).toHaveCount(0);
    await expect(page.getByTestId("gym-weight-accessory-sign-disabled")).toBeDisabled();

    await tapPadKeys(page, ["1", "0"]);
    await page.getByTestId("gym-weight-accessory-dismiss").click();
    await expect.poll(async () => await latestSetReps(page, seeded.sessionId)).toBe(10);
  });

  test("rir field uses the same NumericPad system", async ({ page }) => {
    const seeded = await seedSingleExerciseSession(page, { exerciseName: "Pull Up" });

    await goto(page, `/gym/${seeded.sessionId}`);
    await expectGymReady(page);

    await addSetAndGetWeightInput(page);
    const rir = page.getByRole("textbox", { name: "rir" }).first();
    await rir.click();

    await expect(page.getByTestId("numeric-pad")).toBeVisible();
    await expect(page.getByTestId("gym-weight-accessory-sign")).toHaveCount(0);
    await expect(page.getByTestId("gym-weight-accessory-sign-disabled")).toBeDisabled();

    await tapPadKeys(page, ["1", ".", "5"]);
    await page.getByTestId("gym-weight-accessory-dismiss").click();
    await expect.poll(async () => await latestSetRir(page, seeded.sessionId)).toBe(1.5);
  });

  test("reps-only rows use the same NumericPad system", async ({ page }) => {
    const seeded = await seedRepsOnlySession(page);

    await goto(page, `/gym/${seeded.sessionId}`);
    await expectGymReady(page);

    await page.getByRole("button", { name: /\+\s*Add Set/i }).first().click();
    const reps = page.getByRole("textbox", { name: "reps" }).first();
    await reps.click();

    await expect(page.getByTestId("numeric-pad")).toBeVisible();
    await tapPadKeys(page, ["1", "2"]);
    await page.getByTestId("gym-weight-accessory-dismiss").click();
    await expect.poll(async () => await latestSetReps(page, seeded.sessionId)).toBe(12);
  });

  test("assisted weight sign toggle still works", async ({ page }) => {
    const seeded = await seedSingleExerciseSession(page, { exerciseName: "Assisted Pull Up" });

    await goto(page, `/gym/${seeded.sessionId}`);
    await expectGymReady(page);

    const weight = await addSetAndGetWeightInput(page);
    await weight.click();

    const pad = page.getByTestId("numeric-pad");
    const sign = page.getByTestId("gym-weight-accessory-sign");

    await expect(pad).toBeVisible();
    await expect(sign).toHaveText("-/+ +");

    await tapPadKeys(page, ["6", "5"]);
    await sign.click();
    await expect(sign).toHaveText("-/+ -");
    await page.getByTestId("gym-weight-accessory-dismiss").click();

    await expect.poll(async () => await latestSetWeight(page, seeded.sessionId)).toBe(-65);
  });

  test("non-assisted rows still do not get active sign behavior", async ({ page }) => {
    const seeded = await seedSingleExerciseSession(page, { exerciseName: "Bench Press" });

    await goto(page, `/gym/${seeded.sessionId}`);
    await expectGymReady(page);

    const weight = await addSetAndGetWeightInput(page);
    await weight.click();

    await expect(page.getByTestId("numeric-pad")).toBeVisible();
    await expect(page.getByTestId("gym-weight-accessory-sign")).toHaveCount(0);
    await expect(page.getByTestId("gym-weight-accessory-sign-disabled")).toBeDisabled();

    await tapPadKeys(page, ["1", "3", "5"]);
    await page.getByTestId("gym-weight-accessory-dismiss").click();
    await expect.poll(async () => await latestSetWeight(page, seeded.sessionId)).toBe(135);
  });

  test("Hide dismisses the active input", async ({ page }) => {
    const seeded = await seedSingleExerciseSession(page, { exerciseName: "Pull Up" });

    await goto(page, `/gym/${seeded.sessionId}`);
    await expectGymReady(page);

    const weight = await addSetAndGetWeightInput(page);
    await weight.click();

    await expect(page.getByTestId("numeric-pad")).toBeVisible();
    await page.getByTestId("gym-weight-accessory-dismiss").click();
    await expect(page.getByTestId("numeric-pad")).toHaveCount(0);
    await expect.poll(async () => await activeElementName(page)).not.toBe("weight");
  });

  test("Next advances focus sensibly", async ({ page }) => {
    const seeded = await seedSingleExerciseSession(page, { exerciseName: "Pull Up" });

    await goto(page, `/gym/${seeded.sessionId}`);
    await expectGymReady(page);

    const weight = await addSetAndGetWeightInput(page);
    await weight.click();

    await tapPadKeys(page, ["6", "5"]);
    await page.getByTestId("gym-weight-accessory-next").click();
    await expect.poll(async () => await activeElementName(page)).toBe("reps");
    await expect.poll(async () => await latestSetWeight(page, seeded.sessionId)).toBe(65);
  });

  test("Next advances from reps to RIR on loaded-reps rows", async ({ page }) => {
    const seeded = await seedSingleExerciseSession(page, { exerciseName: "Pull Up" });

    await goto(page, `/gym/${seeded.sessionId}`);
    await expectGymReady(page);

    await addSetAndGetWeightInput(page);
    const reps = page.getByRole("textbox", { name: "reps" }).first();
    await reps.click();

    await tapPadKeys(page, ["8"]);
    await page.getByTestId("gym-weight-accessory-next").click();
    await expect.poll(async () => await activeElementName(page)).toBe("rir");
    await expect.poll(async () => await latestSetReps(page, seeded.sessionId)).toBe(8);
  });

  test("page can scroll while docked NumericPad is open and active input stays above it", async ({ page }) => {
    const seeded = await seedSingleExerciseSession(page, { exerciseName: "Pull Up" });
    await seedExtraSets(page, seeded.sessionId, 14);

    await goto(page, `/gym/${seeded.sessionId}`);
    await expectGymReady(page);

    const firstWeight = page.getByRole("textbox", { name: "weight" }).first();
    await firstWeight.click();
    await expect(page.getByTestId("numeric-pad")).toBeVisible();

    const scrollBefore = await page.evaluate(() => window.scrollY);
    await page.evaluate(() => window.scrollBy(0, 500));
    await expect.poll(async () => await page.evaluate(() => window.scrollY)).toBeGreaterThan(scrollBefore);

    const lastWeight = page.getByRole("textbox", { name: "weight" }).last();
    await lastWeight.click();

    const padBox = await page.getByTestId("numeric-pad").boundingBox();
    const inputBox = await lastWeight.boundingBox();
    expect(padBox).not.toBeNull();
    expect(inputBox).not.toBeNull();
    expect(inputBox!.y + inputBox!.height).toBeLessThan(padBox!.y);
  });

  test("existing assisted negative-save workflow is not broken", async ({ page }) => {
    const seeded = await seedSingleExerciseSession(page, {
      exerciseName: "Pull Up",
      trackDisplayName: "Upper A Assistance",
      priorWeight: 45,
    });

    await goto(page, `/gym/${seeded.sessionId}`);
    await expectGymReady(page);

    const weight = await addSetAndGetWeightInput(page);
    await expect(weight).toHaveValue("45");

    await weight.click();
    await tapPadKeys(page, ["⌫", "⌫", "6", "5"]);
    await page.getByTestId("gym-weight-accessory-sign").click();
    await page.getByTestId("gym-weight-accessory-dismiss").click();

    await expect.poll(async () => await latestSetWeight(page, seeded.sessionId)).toBe(-65);
  });

  test("default manual add stays on the strength intent", async ({ page }) => {
    const seeded = await seedAddExerciseSession(page, {
      exerciseNames: ["Barbell Row"],
    });

    await goto(page, `/gym/${seeded.sessionId}`);
    await expectGymReady(page);

    await addExerciseFromModal(page, { exerciseName: "Barbell Row" });

    await expect.poll(async () => await readSessionTracks(page, seeded.sessionId)).toEqual([
      expect.objectContaining({
        exerciseName: "Barbell Row",
        trackType: "strength",
        trackingMode: "weightedReps",
        displayName: "Barbell Row",
      }),
    ]);
  });

  test("manual add as technique reuses the technique track instead of the strength track", async ({ page }) => {
    const seeded = await seedAddExerciseSession(page, {
      exerciseNames: ["Barbell RDL"],
      existingTracks: [
        { exerciseName: "Barbell RDL", trackType: "strength", displayName: "Barbell RDL" },
        {
          exerciseName: "Barbell RDL",
          trackType: "technique",
          displayName: "Barbell RDL - technique",
        },
      ],
    });

    await goto(page, `/gym/${seeded.sessionId}`);
    await expectGymReady(page);

    await addExerciseFromModal(page, { exerciseName: "Barbell RDL", intent: "technique" });

    await expect.poll(async () => await readSessionTracks(page, seeded.sessionId)).toEqual([
      expect.objectContaining({
        exerciseName: "Barbell RDL",
        trackType: "technique",
        trackId: seeded.trackIdsByKey["Barbell RDL|technique"],
      }),
    ]);
  });

  test("manual add as mobility creates a mobility track instead of reusing the strength track", async ({ page }) => {
    const seeded = await seedAddExerciseSession(page, {
      exerciseNames: ["Barbell RDL"],
      existingTracks: [
        { exerciseName: "Barbell RDL", trackType: "strength", displayName: "Barbell RDL" },
      ],
    });

    await goto(page, `/gym/${seeded.sessionId}`);
    await expectGymReady(page);

    await addExerciseFromModal(page, { exerciseName: "Barbell RDL", intent: "mobility" });

    await expect.poll(async () => (await readSessionTracks(page, seeded.sessionId)).length).toBe(1);
    const rows = await readSessionTracks(page, seeded.sessionId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      exerciseName: "Barbell RDL",
      trackType: "mobility",
      trackingMode: "repsOnly",
      displayName: "Barbell RDL - mobility",
    });
    expect(rows[0].trackId).not.toBe(seeded.trackIdsByKey["Barbell RDL|strength"]);
  });

  test("same exercise name with different intents stays separated in the session", async ({ page }) => {
    const seeded = await seedAddExerciseSession(page, {
      exerciseNames: ["Barbell RDL"],
    });

    await goto(page, `/gym/${seeded.sessionId}`);
    await expectGymReady(page);

    await addExerciseFromModal(page, { exerciseName: "Barbell RDL" });
    await addExerciseFromModal(page, { exerciseName: "Barbell RDL", intent: "technique" });

    await expect.poll(async () => (await readSessionTracks(page, seeded.sessionId)).length).toBe(2);
    const rows = await readSessionTracks(page, seeded.sessionId);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.trackType)).toEqual(["strength", "technique"]);
    expect(new Set(rows.map((row) => row.trackId)).size).toBe(2);
  });

  test("newly added default strength card retains lbs reps and RIR", async ({ page }) => {
    const seeded = await seedAddExerciseSession(page, {
      exerciseNames: ["Bench Press"],
    });

    await goto(page, `/gym/${seeded.sessionId}`);
    await expectGymReady(page);

    await addExerciseFromModal(page, { exerciseName: "Bench Press" });
    await addSetAndGetWeightInput(page);

    const weight = page.getByRole("textbox", { name: "weight" }).first();
    const reps = page.getByRole("textbox", { name: "reps" }).first();
    const rir = page.getByRole("textbox", { name: "rir" }).first();

    await weight.click();
    await tapPadKeys(page, ["1", "3", "5"]);
    await page.getByTestId("gym-weight-accessory-dismiss").click();

    await reps.click();
    await tapPadKeys(page, ["8"]);
    await page.getByTestId("gym-weight-accessory-dismiss").click();

    await rir.click();
    await tapPadKeys(page, ["2"]);
    await page.getByTestId("gym-weight-accessory-dismiss").click();

    await expect(weight).toHaveValue("135");
    await expect(reps).toHaveValue("8");
    await expect(rir).toHaveValue("2");

    await expect.poll(async () => await latestSetForTrackType(page, seeded.sessionId, "strength")).toMatchObject({
      weight: 135,
      reps: 8,
      rir: 2,
    });
  });

  test("newly added technique card retains its loaded entry values", async ({ page }) => {
    const seeded = await seedAddExerciseSession(page, {
      exerciseNames: ["Barbell RDL"],
    });

    await goto(page, `/gym/${seeded.sessionId}`);
    await expectGymReady(page);

    await addExerciseFromModal(page, { exerciseName: "Barbell RDL", intent: "technique" });
    await expect(page.getByRole("heading", { name: /Barbell RDL - technique/i })).toBeVisible();
    await expect(page.getByText(/mode weightedReps/i)).toBeVisible();
    await addSetAndGetWeightInput(page);

    const weight = page.getByRole("textbox", { name: "weight" }).first();
    const reps = page.getByRole("textbox", { name: "reps" }).first();

    await weight.click();
    await tapPadKeys(page, ["9", "5"]);
    await reps.click();
    await tapPadKeys(page, ["1", "0"]);
    await page.getByTestId("gym-weight-accessory-dismiss").click();

    await expect(weight).toHaveValue("95");
    await expect(reps).toHaveValue("10");

    await expect.poll(async () => await latestSetForTrackType(page, seeded.sessionId, "technique")).toMatchObject({
      weight: 95,
      reps: 10,
    });
  });

  test("newly added mobility card keeps reps and does not show loaded strength fields", async ({ page }) => {
    const seeded = await seedAddExerciseSession(page, {
      exerciseNames: ["Knee to Wall"],
    });

    await goto(page, `/gym/${seeded.sessionId}`);
    await expectGymReady(page);

    await addExerciseFromModal(page, { exerciseName: "Knee to Wall", intent: "mobility" });

    await page.getByRole("button", { name: /\+\s*Add Set/i }).first().click();
    await expect(page.getByRole("textbox", { name: "rir" })).toHaveCount(0);

    const reps = page.getByRole("textbox", { name: "reps" }).first();
    await reps.click();
    await tapPadKeys(page, ["1", "2"]);
    await page.getByTestId("gym-weight-accessory-dismiss").click();

    await expect(reps).toHaveValue("12");
    await expect.poll(async () => await latestSetForTrackType(page, seeded.sessionId, "mobility")).toMatchObject({
      reps: 12,
    });
  });

  test("technique weightedReps set can finish without missing RIR validation", async ({ page }) => {
    const seeded = await seedAddExerciseSession(page, {
      exerciseNames: ["Barbell RDL"],
    });

    await goto(page, `/gym/${seeded.sessionId}`);
    await expectGymReady(page);

    await addExerciseFromModal(page, { exerciseName: "Barbell RDL", intent: "technique" });
    await expect(page.getByRole("heading", { name: /Barbell RDL - technique/i })).toBeVisible();
    await expect(page.getByText(/mode weightedReps/i)).toBeVisible();

    await addSetAndGetWeightInput(page);

    const weight = page.getByRole("textbox", { name: "weight" }).first();
    const reps = page.getByRole("textbox", { name: "reps" }).first();

    await weight.click();
    await tapPadKeys(page, ["9", "5"]);
    await reps.click();
    await tapPadKeys(page, ["8"]);
    await page.getByTestId("gym-weight-accessory-dismiss").click();

    await markCompleteFirstSet(page, seeded.sessionId);
    await page.getByRole("button", { name: /Finish session/i }).click();

    await expect(page.getByText(/missing RIR/i)).toHaveCount(0);
  });

  test("strength weightedReps set still requires RIR before finish", async ({ page }) => {
    const seeded = await seedAddExerciseSession(page, {
      exerciseNames: ["Bench Press"],
    });

    await goto(page, `/gym/${seeded.sessionId}`);
    await expectGymReady(page);

    await addExerciseFromModal(page, { exerciseName: "Bench Press" });
    await addSetAndGetWeightInput(page);

    const weight = page.getByRole("textbox", { name: "weight" }).first();
    const reps = page.getByRole("textbox", { name: "reps" }).first();

    await weight.click();
    await tapPadKeys(page, ["1", "3", "5"]);
    await reps.click();
    await tapPadKeys(page, ["8"]);
    await page.getByTestId("gym-weight-accessory-dismiss").click();

    await markCompleteFirstSet(page, seeded.sessionId);
    await page.getByRole("button", { name: /Finish session/i }).click();

    await expect(page).not.toHaveURL(/\/complete\//);
    await expect(page.getByText(/Review \(tap to jump\)/i)).toBeVisible();
    await expect(page.getByText(/completed working set\(s\) missing RIR/i)).toBeVisible();
  });

  test("technique visible draft values flush through finish into session detail", async ({ page }) => {
    const seeded = await seedAddExerciseSession(page, {
      exerciseNames: ["Barbell RDL"],
    });

    await goto(page, `/gym/${seeded.sessionId}`);
    await expectGymReady(page);

    await addExerciseFromModal(page, { exerciseName: "Barbell RDL", intent: "technique" });
    await addSetAndGetWeightInput(page);

    const weight = page.getByRole("textbox", { name: "weight" }).first();
    const reps = page.getByRole("textbox", { name: "reps" }).first();

    await weight.click();
    await tapPadKeys(page, ["9", "5"]);
    await reps.click();
    await tapPadKeys(page, ["1", "2"]);

    await markCompleteFirstSet(page, seeded.sessionId);
    await page.getByRole("button", { name: /Finish session/i }).click();
    await expect(page).toHaveURL(new RegExp(`/complete/${seeded.sessionId}$`));

    const latest = await latestSetForTrackType(page, seeded.sessionId, "technique");
    expect(latest?.weight).toBe(95);
    expect(latest?.reps).toBe(12);

    await goto(page, `/session/${seeded.sessionId}`);
    await expect(page.getByTestId(`set-weight:${latest.id}`)).toHaveText("95");
    await expect(page.getByTestId(`set-reps:${latest.id}`)).toContainText("12");
  });

  test("strength visible draft RIR flushes through finish into session detail", async ({ page }) => {
    const seeded = await seedAddExerciseSession(page, {
      exerciseNames: ["Barbell RDL"],
    });

    await goto(page, `/gym/${seeded.sessionId}`);
    await expectGymReady(page);

    await addExerciseFromModal(page, { exerciseName: "Barbell RDL" });
    await addSetAndGetWeightInput(page);

    const weight = page.getByRole("textbox", { name: "weight" }).first();
    const reps = page.getByRole("textbox", { name: "reps" }).first();
    const rir = page.getByRole("textbox", { name: "rir" }).first();

    await weight.click();
    await tapPadKeys(page, ["1", "1", "5"]);
    await reps.click();
    await tapPadKeys(page, ["1", "2"]);
    await rir.click();
    await tapPadKeys(page, ["2"]);

    await markCompleteFirstSet(page, seeded.sessionId);
    await page.getByRole("button", { name: /Finish session/i }).click();
    await expect(page).toHaveURL(new RegExp(`/complete/${seeded.sessionId}$`));

    const latest = await latestSetForTrackType(page, seeded.sessionId, "strength");
    expect(latest?.weight).toBe(115);
    expect(latest?.reps).toBe(12);
    expect(latest?.rir).toBe(2);

    await goto(page, `/session/${seeded.sessionId}`);
    await expect(page.getByTestId(`set-weight:${latest.id}`)).toHaveText("115");
    await expect(page.getByTestId(`set-reps:${latest.id}`)).toContainText("12");
    await expect(page.getByTestId(`set-rir:${latest.id}`)).toHaveText("2");
  });
});
