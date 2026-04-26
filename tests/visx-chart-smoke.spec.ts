import { expect, test, type Page } from "@playwright/test";

import { resetDexieDb } from "./helpers/dbSeed";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173/";

async function goto(page: Page, path: string) {
  await page.goto(new URL(path, BASE_URL).toString(), { waitUntil: "domcontentloaded" });
}

async function setSliderValue(page: Page, testIdBase: string, nextValue: number) {
  await page.evaluate(
    ({ testIdBase, nextValue }) => {
      const slider = document.querySelector<HTMLInputElement>(
        `[data-testid="${testIdBase}:slider-input"]`
      );
      if (!slider) throw new Error(`Slider not found: ${testIdBase}`);
      slider.value = String(nextValue);
      slider.dispatchEvent(new Event("input", { bubbles: true }));
      slider.dispatchEvent(new Event("change", { bubbles: true }));
    },
    { testIdBase, nextValue }
  );
}

async function seedSharedStrengthTrendData(page: Page) {
  return await page.evaluate(async () => {
    // @ts-ignore
    const db = window.__db;
    if (!db) throw new Error("__db missing on window.");

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const uuid = () => crypto.randomUUID();

    const exercises = [
      { name: "Back Squat", equipment: "Barbell", category: "Barbell", baseWeight: 225 },
      { name: "Romanian Deadlift", equipment: "Barbell", category: "Barbell", baseWeight: 245 },
      { name: "Bench Press", equipment: "Barbell", category: "Barbell", baseWeight: 185 },
      { name: "Pull Up", equipment: "Bodyweight", category: "Bodyweight", baseWeight: 0 },
    ];

    const tracks = await Promise.all(
      exercises.map(async (exercise, index) => {
        const exerciseId = uuid();
        const trackId = uuid();

        await db.exercises.add({
          id: exerciseId,
          name: exercise.name,
          equipment: exercise.equipment,
          category: exercise.category,
          equipmentTags: [exercise.category.toLowerCase()],
          createdAt: now - (90 + index) * dayMs,
        });

        await db.tracks.add({
          id: trackId,
          exerciseId,
          trackType: "strength",
          displayName: exercise.name,
          trackingMode: "weightedReps",
          warmupSetsDefault: 0,
          workingSetsDefault: 1,
          repMin: 4,
          repMax: 8,
          restSecondsDefault: 150,
          weightJumpDefault: 5,
          createdAt: now - (90 + index) * dayMs,
        });

        return { ...exercise, trackId };
      })
    );

    await db.bodyMetrics.bulkAdd(
      Array.from({ length: 14 }, (_, index) => ({
        id: uuid(),
        weightLb: 194 - index * 0.6,
        measuredAt: now - (index * 7 + 1) * dayMs,
        takenAt: now - (index * 7 + 1) * dayMs,
        createdAt: now - (index * 7 + 1) * dayMs,
      }))
    );

    for (let week = 0; week < 12; week += 1) {
      const sessionId = uuid();
      const sessionAt = now - (week * 7 + 2) * dayMs;

      await db.sessions.add({
        id: sessionId,
        startedAt: sessionAt,
        endedAt: sessionAt + 45 * 60 * 1000,
      });

      for (const exercise of tracks) {
        const load =
          exercise.name === "Pull Up" ? 0 : exercise.baseWeight + (11 - week) * 5;

        await db.sets.add({
          id: uuid(),
          sessionId,
          trackId: exercise.trackId,
          setType: "working",
          weight: load,
          reps: exercise.name === "Pull Up" ? 6 : 5,
          rpe: 8,
          completedAt: sessionAt + 5 * 60 * 1000,
          createdAt: sessionAt + 5 * 60 * 1000,
        });
      }
    }
  });
}

async function seedPerformanceRangeData(page: Page) {
  return await page.evaluate(async () => {
    // @ts-ignore
    const db = window.__db;
    if (!db) throw new Error("__db missing on window.");

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const uuid = () => crypto.randomUUID();

    const exerciseId = uuid();
    const trackId = uuid();

    await db.exercises.add({
      id: exerciseId,
      name: "Back Squat",
      equipment: "Barbell",
      category: "Barbell",
      equipmentTags: ["barbell"],
      createdAt: now - 420 * dayMs,
    });

    await db.tracks.add({
      id: trackId,
      exerciseId,
      trackType: "strength",
      displayName: "Back Squat",
      trackingMode: "weightedReps",
      warmupSetsDefault: 0,
      workingSetsDefault: 2,
      repMin: 3,
      repMax: 8,
      restSecondsDefault: 150,
      weightJumpDefault: 5,
      createdAt: now - 420 * dayMs,
    });

    const bodyMetrics = Array.from({ length: 48 }, (_, index) => {
      const measuredAt = now - (47 - index) * 7 * dayMs;
      return {
        id: uuid(),
        weightLb: 208 - index * 0.45,
        waistIn: 37.5 - index * 0.04,
        measuredAt,
        takenAt: measuredAt,
        createdAt: measuredAt,
      };
    });

    await db.bodyMetrics.bulkAdd(bodyMetrics);

    for (let week = 0; week < 48; week += 1) {
      const sessionAt = now - (47 - week) * 7 * dayMs;
      const sessionId = uuid();
      await db.sessions.add({
        id: sessionId,
        startedAt: sessionAt,
        endedAt: sessionAt + 45 * 60 * 1000,
      });

      await db.sets.bulkAdd([
        {
          id: uuid(),
          sessionId,
          trackId,
          setType: "working",
          weight: 185 + week * 3,
          reps: 5,
          rpe: 8,
          completedAt: sessionAt + 5 * 60 * 1000,
          createdAt: sessionAt + 5 * 60 * 1000,
        },
        {
          id: uuid(),
          sessionId,
          trackId,
          setType: "working",
          weight: 205 + week * 3,
          reps: 4,
          rpe: 8.5,
          completedAt: sessionAt + 12 * 60 * 1000,
          createdAt: sessionAt + 12 * 60 * 1000,
        },
      ]);
    }
  });
}

async function seedUnevenPerformanceBodyweightData(page: Page) {
  return await page.evaluate(async () => {
    // @ts-ignore
    const db = window.__db;
    if (!db) throw new Error("__db missing on window.");

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const uuid = () => crypto.randomUUID();
    const gapDays = [0, 7, 14, 42, 49];

    await db.bodyMetrics.bulkAdd(
      gapDays.map((daysFromStart, index) => {
        const measuredAt = now - (49 - daysFromStart) * dayMs;
        return {
          id: uuid(),
          weightLb: 210 - index * 1.25,
          measuredAt,
          takenAt: measuredAt,
          createdAt: measuredAt,
        };
      })
    );
  });
}

async function seedDailyBodyweightHistory(page: Page) {
  return await page.evaluate(async () => {
    // @ts-ignore
    const db = window.__db;
    if (!db) throw new Error("__db missing on window.");

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const uuid = () => crypto.randomUUID();
    const totalDays = 40;

    const entries = Array.from({ length: totalDays }, (_, index) => {
      const daysAgo = totalDays - 1 - index;
      const measuredAt = now - daysAgo * dayMs;
      const month = String(new Date(measuredAt).getMonth() + 1).padStart(2, "0");
      const day = String(new Date(measuredAt).getDate()).padStart(2, "0");
      return {
        id: uuid(),
        weightLb: 210 - index * 0.2,
        measuredAt,
        takenAt: measuredAt,
        createdAt: measuredAt,
        label: `${month}/${day}`,
      };
    });

    await db.bodyMetrics.bulkAdd(
      entries.map(({ label, ...entry }) => entry)
    );

    return {
      oldestLabel: entries[0].label,
      newestLabel: entries[entries.length - 1].label,
    };
  });
}

async function expectRenderedVisxTrendChart(page: Page, testIdBase: string) {
  const card = page.getByTestId(`${testIdBase}:card`).first();
  await expect(card).toBeVisible({ timeout: 15000 });

  const host = card.getByTestId(`${testIdBase}:host`);
  await expect(host).toBeVisible({ timeout: 15000 });

  const chart = card.getByTestId(`${testIdBase}:svg`);
  await expect(chart).toBeVisible({ timeout: 15000 });

  const markers = chart.locator("circle");
  const paths = chart.locator("path");

  expect(await markers.count()).toBeGreaterThan(1);
  expect(await paths.count()).toBeGreaterThan(0);
}

async function hoverVisxChart(page: Page, testIdBase: string, ratioX: number) {
  const overlay = page.getByTestId(`${testIdBase}:overlay`);
  await expect(overlay).toBeVisible({ timeout: 15000 });
  const box = await overlay.boundingBox();
  if (!box) throw new Error(`Overlay bounding box missing: ${testIdBase}`);
  await overlay.hover({
    position: {
      x: Math.max(1, Math.min(box.width - 1, box.width * ratioX)),
      y: Math.max(1, Math.min(box.height - 1, box.height * 0.4)),
    },
  });
}

async function readVisiblePointState(page: Page, testIdBase: string) {
  const points = page.locator(`[data-testid="${testIdBase}:point"]`);
  await expect(points.first()).toBeVisible({ timeout: 15000 });

  return await points.evaluateAll((nodes) =>
    nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return {
        index: Number(node.getAttribute("data-point-index") ?? "-1"),
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        centerX: rect.left + rect.width / 2,
        centerY: rect.top + rect.height / 2,
        width: rect.width,
        height: rect.height,
      };
    })
  );
}

async function hoverVisxChartAtPoint(page: Page, testIdBase: string, centerX: number) {
  const overlay = page.getByTestId(`${testIdBase}:overlay`);
  await expect(overlay).toBeVisible({ timeout: 15000 });
  const box = await overlay.boundingBox();
  if (!box) throw new Error(`Overlay bounding box missing: ${testIdBase}`);

  await overlay.hover({
    position: {
      x: Math.max(1, Math.min(box.width - 1, centerX - box.x)),
      y: Math.max(1, Math.min(box.height - 1, box.height * 0.45)),
    },
  });
}

async function dragVisxChart(page: Page, testIdBase: string, deltaX: number) {
  const overlay = page.getByTestId(`${testIdBase}:overlay`);
  await expect(overlay).toBeVisible({ timeout: 15000 });
  const box = await overlay.boundingBox();
  if (!box) throw new Error(`Overlay bounding box missing: ${testIdBase}`);

  const startX = box.x + box.width * 0.5;
  const y = box.y + box.height * 0.45;

  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.mouse.move(startX + deltaX, y, { steps: 8 });
  await page.mouse.up();
}

async function readXAxisTickState(page: Page, testIdBase: string) {
  const ticks = page.locator(`[data-testid="${testIdBase}:x-tick"]`);
  await expect(ticks.first()).toBeVisible({ timeout: 15000 });

  return await ticks.evaluateAll((nodes) =>
    nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return {
        text: (node.textContent ?? "").trim(),
        left: rect.left,
        right: rect.right,
        width: rect.width,
      };
    })
  );
}

function expectReasonableMobileTickLayout(
  ticks: Array<{ text: string; left: number; right: number; width: number }>
) {
  expect(ticks.length).toBeGreaterThanOrEqual(2);
  expect(ticks.length).toBeLessThanOrEqual(4);

  const labelPattern = /^[A-Z][a-z]{2}\s\d{1,2}$/;
  for (const tick of ticks) {
    expect(tick.text).not.toBe("");
    expect(tick.text).toMatch(labelPattern);
  }

  for (let index = 1; index < ticks.length; index += 1) {
    expect(ticks[index].left).toBeGreaterThanOrEqual(ticks[index - 1].left);
    expect(ticks[index - 1].right).toBeLessThanOrEqual(ticks[index].left + 1);
  }
}

function expectSparseMobileTickLayout(
  ticks: Array<{ text: string; left: number; right: number; width: number }>
) {
  expect(ticks.length).toBeGreaterThanOrEqual(2);
  expect(ticks.length).toBeLessThanOrEqual(3);

  const labelPattern = /^[A-Z][a-z]{2}\s\d{1,2}$/;
  for (const tick of ticks) {
    expect(tick.text).not.toBe("");
    expect(tick.text).toMatch(labelPattern);
  }

  for (let index = 1; index < ticks.length; index += 1) {
    expect(ticks[index].left).toBeGreaterThan(ticks[index - 1].left);
    expect(ticks[index - 1].right + 6).toBeLessThanOrEqual(ticks[index].left);
  }
}

async function readChartBounds(page: Page, testIdBase: string) {
  const svg = page.getByTestId(`${testIdBase}:svg`);
  await expect(svg).toBeVisible({ timeout: 15000 });
  return await svg.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
  });
}

function expectLandmarkLabelsPresent(
  ticks: Array<{ text: string; left: number; right: number; width: number }>,
  pattern: RegExp = /^[A-Z][a-z]{2}\s\d{1,2}$/
) {
  expect(ticks[0]?.text).toMatch(pattern);
  expect(ticks[ticks.length - 1]?.text).toMatch(pattern);
}

function expectTicksInsideChartBounds(
  ticks: Array<{ text: string; left: number; right: number; width: number }>,
  bounds: { left: number; right: number }
) {
  for (const tick of ticks) {
    expect(tick.left).toBeGreaterThanOrEqual(bounds.left - 1);
    expect(tick.right).toBeLessThanOrEqual(bounds.right + 1);
  }
}

async function readVisibleMarkerState(page: Page, testIdBase: string) {
  const svg = page.getByTestId(`${testIdBase}:svg`);
  await expect(svg).toBeVisible({ timeout: 15000 });
  return await svg.locator("circle").evaluateAll((nodes) =>
    nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return {
        width: rect.width,
        height: rect.height,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        opacity: style.opacity,
        visibility: style.visibility,
        display: style.display,
      };
    })
  );
}

async function readActivePointState(page: Page, testIdBase: string) {
  const point = page.getByTestId(`${testIdBase}:active-point`);
  await expect(point).toBeVisible({ timeout: 15000 });
  return await point.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      centerX: rect.left + rect.width / 2,
      centerY: rect.top + rect.height / 2,
      width: rect.width,
      height: rect.height,
    };
  });
}

test.describe("VisX chart smoke", () => {
  test.beforeEach(async ({ page }) => {
    await goto(page, "/");
    await resetDexieDb(page);
  });

  test("Strength and Performance render the current VisX Strength Signal Trend charts with seeded data", async ({
    page,
  }) => {
    await seedSharedStrengthTrendData(page);

    await goto(page, "/strength");
    await expectRenderedVisxTrendChart(page, "strength-signal-trend");

    await goto(page, "/performance");
    await expectRenderedVisxTrendChart(page, "performance-strength-signal-trend");
  });

  test("Strength VisX chart hover/readout and slider window interactions stay wired", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Pointer interaction coverage is chromium-only");

    await seedSharedStrengthTrendData(page);

    await goto(page, "/strength");
    await expectRenderedVisxTrendChart(page, "strength-signal-trend");

    const card = page.getByTestId("strength-signal-trend:card");
    const readoutValue = card.getByTestId("strength-signal-trend:readout-value");
    const readoutLabel = card.getByTestId("strength-signal-trend:readout-label");
    const chart = card.getByTestId("strength-signal-trend:svg");
    const slider = card.getByTestId("strength-signal-trend:slider-input");
    const baselineCircles = await chart.locator("circle").count();

    expect(((await readoutValue.textContent()) ?? "").trim()).not.toBe("");
    expect(((await readoutLabel.textContent()) ?? "").trim()).not.toBe("");
    await expect(slider).toHaveAttribute("aria-valuenow", "7");

    await hoverVisxChart(page, "strength-signal-trend", 0.5);

    await expect.poll(async () => chart.locator("circle").count()).toBeGreaterThan(baselineCircles);

    await setSliderValue(page, "strength-signal-trend", 2);
    await expect(slider).toHaveAttribute("aria-valuenow", "3");

    await setSliderValue(page, "strength-signal-trend", 5);
    await expect(slider).toHaveAttribute("aria-valuenow", "6");
  });

  test("Performance VisX chart hover/readout stays wired", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Pointer interaction coverage is chromium-only");

    await seedSharedStrengthTrendData(page);

    await goto(page, "/performance");
    await expectRenderedVisxTrendChart(page, "performance-strength-signal-trend");

    const card = page.getByTestId("performance-strength-signal-trend:card");
    const readoutValue = card.getByTestId("performance-strength-signal-trend:readout-value");
    const readoutLabel = card.getByTestId("performance-strength-signal-trend:readout-label");
    const chart = card.getByTestId("performance-strength-signal-trend:svg");
    const baselineCircles = await chart.locator("circle").count();

    expect(((await readoutValue.textContent()) ?? "").trim()).not.toBe("");
    expect(((await readoutLabel.textContent()) ?? "").trim()).not.toBe("");

    await hoverVisxChart(page, "performance-strength-signal-trend", 0.5);

    await expect.poll(async () => chart.locator("circle").count()).toBeGreaterThan(baselineCircles);
  });

  test("Performance bodyweight first, middle, and last visible points stay targetable", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Point hit-testing coverage is chromium-only");

    await seedPerformanceRangeData(page);
    await goto(page, "/performance");
    await page.getByRole("button", { name: "ALL", exact: true }).click();
    await expect(page.getByRole("button", { name: "ALL", exact: true })).toHaveClass(/primary/);

    const testIdBase = "performance-bodyweight-trend";
    await expectRenderedVisxTrendChart(page, testIdBase);

    const points = await readVisiblePointState(page, testIdBase);
    expect(points.length).toBe(5);

    const first = points[0];
    const middle = points[Math.floor(points.length / 2)];
    const last = points[points.length - 1];

    expect(first.index).toBeLessThan(middle.index);
    expect(middle.index).toBeLessThan(last.index);
    expect(first.centerX).toBeLessThan(middle.centerX);
    expect(middle.centerX).toBeLessThan(last.centerX);

    await hoverVisxChartAtPoint(page, testIdBase, first.centerX);
    const firstActive = await readActivePointState(page, testIdBase);

    await hoverVisxChartAtPoint(page, testIdBase, middle.centerX);
    const middleActive = await readActivePointState(page, testIdBase);

    await hoverVisxChartAtPoint(page, testIdBase, last.centerX);
    const lastActive = await readActivePointState(page, testIdBase);

    expect(Math.abs(firstActive.centerX - first.centerX)).toBeLessThanOrEqual(6);
    expect(Math.abs(middleActive.centerX - middle.centerX)).toBeLessThanOrEqual(6);
    expect(Math.abs(lastActive.centerX - last.centerX)).toBeLessThanOrEqual(6);
    expect(firstActive.centerX).toBeLessThan(middleActive.centerX);
    expect(middleActive.centerX).toBeLessThan(lastActive.centerX);
  });

  test("Performance bodyweight keeps intentional index-spaced points for uneven date gaps", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Index-spacing coverage is chromium-only");

    await seedUnevenPerformanceBodyweightData(page);
    await goto(page, "/performance");
    await page.getByRole("button", { name: "ALL", exact: true }).click();
    await expect(page.getByRole("button", { name: "ALL", exact: true })).toHaveClass(/primary/);

    const testIdBase = "performance-bodyweight-trend";
    await expectRenderedVisxTrendChart(page, testIdBase);

    const points = await readVisiblePointState(page, testIdBase);
    expect(points.length).toBe(5);

    const first = points[0];
    const middle = points[2];
    const last = points[4];

    const smallGapPx = points[1].centerX - points[0].centerX;
    const largeGapPx = points[3].centerX - points[2].centerX;
    const middleGapPx = points[2].centerX - points[1].centerX;

    expect(first.centerX).toBeLessThan(middle.centerX);
    expect(middle.centerX).toBeLessThan(last.centerX);
    expect(Math.abs(smallGapPx - middleGapPx)).toBeLessThanOrEqual(8);
    expect(Math.abs(largeGapPx - middleGapPx)).toBeLessThanOrEqual(8);

    await hoverVisxChartAtPoint(page, testIdBase, first.centerX);
    const firstActive = await readActivePointState(page, testIdBase);

    await hoverVisxChartAtPoint(page, testIdBase, middle.centerX);
    const middleActive = await readActivePointState(page, testIdBase);

    await hoverVisxChartAtPoint(page, testIdBase, last.centerX);
    const lastActive = await readActivePointState(page, testIdBase);

    expect(Math.abs(firstActive.centerX - first.centerX)).toBeLessThanOrEqual(6);
    expect(Math.abs(middleActive.centerX - middle.centerX)).toBeLessThanOrEqual(6);
    expect(Math.abs(lastActive.centerX - last.centerX)).toBeLessThanOrEqual(6);
  });

  test("Performance bodyweight D mode ignores the top Performance range filter", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Daily D-mode range independence coverage is chromium-only");

    await seedDailyBodyweightHistory(page);
    await goto(page, "/performance");
    await page.getByRole("button", { name: "4W", exact: true }).click();
    await expect(page.getByRole("button", { name: "4W", exact: true })).toHaveClass(/primary/);

    await page.getByRole("button", { name: "D", exact: true }).click();
    await expect(page.getByRole("button", { name: "D", exact: true })).toHaveClass(/primary/);

    const testIdBase = "performance-bodyweight-trend";
    await expectRenderedVisxTrendChart(page, testIdBase);

    const ticksAt4W = await readXAxisTickState(page, testIdBase);

    await page.getByRole("button", { name: "ALL", exact: true }).click();
    await expect(page.getByRole("button", { name: "ALL", exact: true })).toHaveClass(/primary/);

    const ticksAtAll = await readXAxisTickState(page, testIdBase);
    expect(ticksAtAll.map((tick) => tick.text)).toEqual(ticksAt4W.map((tick) => tick.text));
  });

  test("Performance mobile range charts keep x-axis labels readable across 4W/8W/12W/YTD/ALL", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "iphone", "Mobile x-axis coverage only");

    await seedPerformanceRangeData(page);
    await goto(page, "/performance");

    const ranges = ["4W", "8W", "12W", "YTD", "ALL"] as const;
    const charts = [
      "performance-bodyweight-trend",
      "performance-waist-trend",
      "performance-volume-trend",
    ] as const;

    for (const range of ranges) {
      await page.getByRole("button", { name: range, exact: true }).click();
      await expect(page.getByRole("button", { name: range, exact: true })).toHaveClass(/primary/);

      for (const chartId of charts) {
        await expectRenderedVisxTrendChart(page, chartId);
        const ticks = await readXAxisTickState(page, chartId);
        if (chartId === "performance-bodyweight-trend") {
          expect(ticks.length).toBeGreaterThanOrEqual(3);
          expect(ticks.length).toBeLessThanOrEqual(5);
          expectLandmarkLabelsPresent(ticks, /^W\d{1,2}$/);
        } else {
          expectReasonableMobileTickLayout(ticks);
          expectLandmarkLabelsPresent(ticks);
        }
      }
    }
  });

  test("Performance Strength mobile 8W/12W labels stay readable and YTD markers stay visible", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "iphone", "Mobile strength x-axis coverage only");

    await seedPerformanceRangeData(page);
    await goto(page, "/performance");

    for (const range of ["8W", "12W"] as const) {
      await page.getByRole("button", { name: range, exact: true }).click();
      await expect(page.getByRole("button", { name: range, exact: true })).toHaveClass(/primary/);

      await expectRenderedVisxTrendChart(page, "performance-strength-signal-trend");
      const ticks = await readXAxisTickState(page, "performance-strength-signal-trend");
      const bounds = await readChartBounds(page, "performance-strength-signal-trend");

      expectSparseMobileTickLayout(ticks);
      expectLandmarkLabelsPresent(ticks);
      expectTicksInsideChartBounds(ticks, bounds);
    }

    await page.getByRole("button", { name: "YTD", exact: true }).click();
    await expect(page.getByRole("button", { name: "YTD", exact: true })).toHaveClass(/primary/);

    await expectRenderedVisxTrendChart(page, "performance-strength-signal-trend");
    const bounds = await readChartBounds(page, "performance-strength-signal-trend");
    const markers = await readVisibleMarkerState(page, "performance-strength-signal-trend");

    expect(markers.length).toBeGreaterThanOrEqual(8);
    for (const marker of markers) {
      expect(marker.width).toBeGreaterThan(4);
      expect(marker.height).toBeGreaterThan(4);
      expect(marker.display).not.toBe("none");
      expect(marker.visibility).not.toBe("hidden");
      expect(Number(marker.opacity)).toBeGreaterThan(0);
      expect(marker.left).toBeGreaterThanOrEqual(bounds.left - 1);
      expect(marker.right).toBeLessThanOrEqual(bounds.right + 1);
      expect(marker.top).toBeGreaterThanOrEqual(bounds.top - 1);
      expect(marker.bottom).toBeLessThanOrEqual(bounds.bottom + 1);
    }
  });
});
