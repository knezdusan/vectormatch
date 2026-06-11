import { test } from "@playwright/test";

/**
 * Environment seed file for Playwright AI agents.
 * Runs before dependent test groups to ensure the app is reachable
 * and basic navigation works.
 */
test.describe("Environment seed", () => {
  test("app is running and homepage renders", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("body", { state: "visible" });
  });
});
