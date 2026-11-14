import { expect, test, type Page } from "@playwright/test";
import { resetDexieDb } from "./helpers/dbSeed";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173/";

async function gotoProgress(page: Page) {
  await resetDexieDb(page);
  await page.goto(new URL("/progress", BASE_URL).toString(), { waitUntil: "domcontentloaded" });
}

test("Progress attempts usable Clipboard API even when secure-context prediction is false", async ({ page }) => {
  await page.addInitScript(() => {
    const copied: string[] = [];
    Object.defineProperty(window, "isSecureContext", { value: false, configurable: true });
    Object.defineProperty(window, "__clipboardWrites", { value: copied, configurable: true });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (text: string) => { copied.push(text); } },
    });
  });

  await gotoProgress(page);
  await page.getByRole("button", { name: "Copy Coach Export" }).click();
  await expect(page.getByText("Coach export copied.")).toBeVisible();

  await page.getByRole("button", { name: "Copy Cardio Export" }).click();
  await expect(page.getByText("Cardio export copied.")).toBeVisible();

  const writes = await page.evaluate(() => (window as any).__clipboardWrites as string[]);
  expect(writes).toHaveLength(2);
  expect(writes[0]).toContain("IronForge Coach Export");
  expect(writes[1]).toContain("IronForge Cardio Export");
  await expect(page.getByText("Manual Copy", { exact: true })).toHaveCount(0);
});

test("Progress uses the existing copy fallback when Clipboard API is absent", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: (command: string) => command === "copy",
    });
  });

  await gotoProgress(page);
  await page.getByRole("button", { name: "Copy Coach Export" }).click();

  await expect(page.getByText("Coach export copied.")).toBeVisible();
  await expect(page.getByText("Manual Copy", { exact: true })).toHaveCount(0);
});

test("Progress exposes exact Cardio Export text when all copy attempts fail", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async () => { throw new Error("denied"); } },
    });
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: () => false,
    });
  });

  await gotoProgress(page);
  await page.getByRole("button", { name: "Copy Cardio Export" }).click();

  await expect(page.getByText("Manual Copy", { exact: true })).toBeVisible();
  const manualText = await page.locator("textarea[readonly]").inputValue();
  expect(manualText).toContain("IronForge Cardio Export");
});
