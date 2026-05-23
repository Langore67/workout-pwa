import { expect, test } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173/";

test("sets CSV export includes distance, distanceUnit, and seconds without undefined/null text", async ({ page }) => {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });

  const csv = await page.evaluate(async () => {
    const { setsCSV } = await import("/src/export.ts");
    const at = new Date("2026-05-23T12:00:00").getTime();
    return setsCSV([
      {
        id: "strength-set",
        sessionId: "strength-session",
        trackId: "strength-track",
        createdAt: at,
        setType: "working",
        weight: 135,
        reps: 8,
        notes: "strength row",
      },
      {
        id: "distance-set",
        sessionId: "walk-session",
        trackId: "walk-track",
        createdAt: at + 1,
        setType: "working",
        distance: 5021.15328,
        distanceUnit: "m",
        notes: "cardio distance row",
      },
      {
        id: "duration-set",
        sessionId: "walk-session",
        trackId: "walk-track",
        createdAt: at + 2,
        setType: "working",
        seconds: 2520,
        notes: "cardio duration row",
      },
    ]);
  });

  const lines = csv.trim().split("\n");

  expect(lines[0]).toBe(
    "setId,sessionId,trackId,createdAt,setType,weight,reps,seconds,rir,notes,distance,distanceUnit"
  );
  expect(lines[1]).toContain("strength-set,strength-session,strength-track,");
  expect(lines[1]).toMatch(/"strength row",,$/);
  expect(lines[2]).toMatch(/"cardio distance row",5021\.15328,m$/);
  expect(lines[3]).toMatch(/,2520,,"cardio duration row",,$/);
  expect(csv).not.toContain("undefined");
  expect(csv).not.toContain("null");
});
