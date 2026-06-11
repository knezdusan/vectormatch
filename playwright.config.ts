import { defineConfig, devices } from "@playwright/test";

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: "./e2e",

  /* Run tests in files in parallel */
  fullyParallel: true,

  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* Opt out of parallel tests on CI */
  workers: process.env.CI ? 1 : undefined,

  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [["html", { outputFolder: "./e2e/playwright-report" }]],

  /* Directory for test artifacts (screenshots, videos, traces) */
  outputDir: "./e2e/test-results",

  /* Shared settings for all projects */
  use: {
    /* Base URL for all page.goto('/') calls */
    baseURL: "http://localhost:3000",

    /* Collect trace when retrying a failed test */
    trace: "on-first-retry",

    /* Capture screenshots on failure */
    screenshot: "only-on-failure",

    /* Record video on failure (keeps CI artifacts useful) */
    video: "on-first-retry",

    /* Ensure tests run in a clean browser context */
    actionTimeout: 10000,
    navigationTimeout: 15000,
  },

  /* Configure projects for major browsers + mobile */
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
    {
      name: "Mobile Chrome",
      use: { ...devices["Pixel 5"] },
    },
    {
      name: "Mobile Safari",
      use: { ...devices["iPhone 12"] },
    },
  ],

  /* Run local dev server before starting the tests */
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
