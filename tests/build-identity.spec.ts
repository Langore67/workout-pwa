import { expect, test } from "@playwright/test";

test("shows the generated build identity on every page and links to About", async ({ page }) => {
  await page.goto("/");
  const expected = await page.evaluate(async () => {
    const { buildInfo } = await import("/src/build/buildInfo.ts");
    return buildInfo;
  });

  const footer = page.getByTestId("build-identity-footer");
  await expect(footer).toBeVisible();
  await expect(footer).toContainText(expected.version);
  await expect(footer).toContainText(expected.displayCommit);
  await expect(footer).toContainText(expected.branch);

  await footer.getByRole("link", { name: "Open build details" }).click();
  await expect(page).toHaveURL(/\/about$/);
  await expect(page.getByTestId("about-build-id")).toHaveText(expected.displayCommit);
  await expect(page.getByTestId("about-build-branch")).toHaveText(expected.branch);
  await expect(page.getByTestId("about-build-source")).toHaveText(expected.dirty ? "Local changes present" : "Clean checkout");
});

test("keeps the build marker visible on a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/history");
  const footer = page.getByTestId("build-identity-footer");
  await expect(footer).toBeVisible();
  const box = await footer.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
});
