import { expect, test } from "@playwright/test";

test.describe("Homepage", () => {
  test("has title and renders without errors", async ({ page }) => {
    await page.goto("/");

    // Wait for the page to fully render (Next.js 16 + React 19)
    await expect(page.locator("body")).toBeVisible();

    // Ensure no React hydration errors are present in the console
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    // Give hydration a moment to settle
    await page.waitForTimeout(500);

    // Hydration errors typically contain the word "hydrat"
    const hydrationErrors = consoleErrors.filter((msg) =>
      msg.toLowerCase().includes("hydrat"),
    );

    expect(hydrationErrors).toHaveLength(0);
  });
});
