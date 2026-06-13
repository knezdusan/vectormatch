import { expect, test } from "@playwright/test";

async function signUpAndGetCookies(
  request: Parameters<Parameters<typeof test>[1]>[0]["request"],
  email: string,
  password: string,
  name: string,
) {
  await request.post("/api/auth/sign-up/email", {
    data: { email, password, name, callbackURL: "/dashboard" },
    headers: { Origin: "http://localhost:3000" },
  });
}

async function signInAndSetCookies(
  page: Parameters<Parameters<typeof test>[1]>[0]["page"],
  request: Parameters<Parameters<typeof test>[1]>[0]["request"],
  email: string,
  password: string,
) {
  const response = await request.post("/api/auth/sign-in/email", {
    data: { email, password, callbackURL: "/dashboard" },
    headers: { Origin: "http://localhost:3000" },
  });
  const cookies = response.headers()["set-cookie"];
  if (cookies) {
    await page.context().addCookies(
      cookies.split(",").map((c) => {
        const [nameValue] = c.split(";");
        const eqIdx = nameValue.indexOf("=");
        const name = nameValue.slice(0, eqIdx).trim();
        const value = nameValue.slice(eqIdx + 1).trim();
        return { name, value, domain: "localhost", path: "/" };
      }),
    );
    // Let the browser settle before navigating (avoids WebKit/Mobile Safari race)
    await page.waitForTimeout(1000);
  }
}

test.describe("Account page — profile and security", () => {
  const email = `test-account-${Date.now()}@example.com`;
  const password = "TestPass123!";
  const name = "Test User";

  test.beforeAll(async ({ request }) => {
    await signUpAndGetCookies(request, email, password, name);
  });

  test.beforeEach(async ({ page, request }) => {
    await signInAndSetCookies(page, request, email, password);
    await page.goto("/dashboard/account");
    await page.waitForSelector("h1", { state: "visible" });
  });

  test.describe.configure({ mode: "serial" });

  test("shows profile and delete sections, renders security for email user", async ({
    page,
  }) => {
    await expect(
      page.locator('[data-slot="card-title"]').filter({ hasText: "Profile" }),
    ).toBeVisible();
    await expect(
      page.locator('[data-slot="card-title"]').filter({ hasText: "Security" }),
    ).toBeVisible();
    await expect(
      page
        .locator('[data-slot="card-title"]')
        .filter({ hasText: "Delete Account" }),
    ).toBeVisible();
  });

  test("can update profile name", async ({ page }) => {
    const input = page.getByLabel("Name");
    await input.fill("Updated Name");
    await page.getByRole("button", { name: "Save Changes" }).click();
    await expect(
      page
        .locator("[data-sonner-toast]")
        .filter({ hasText: "Profile updated successfully" }),
    ).toBeVisible({ timeout: 15000 });
  });

  test("delete account shows confirmation dialog", async ({ page }) => {
    await page.getByRole("button", { name: "Delete Account" }).click();
    await expect(page.getByText("This action cannot be undone")).toBeVisible({
      timeout: 10000,
    });
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(
      page.getByText("This action cannot be undone"),
    ).not.toBeVisible();
  });

  test.afterAll(async ({ request }) => {
    await request.post("/api/auth/sign-in/email", {
      data: { email, password, callbackURL: "/dashboard" },
      headers: { Origin: "http://localhost:3000" },
    });
    const response = await request.post("/api/auth/delete-user", {
      data: { callbackURL: "/" },
      headers: { Origin: "http://localhost:3000" },
    });
    if (!response.ok()) {
      console.warn(
        "Test user cleanup failed:",
        response.status(),
        await response.text(),
      );
    }
  });
});

test.describe("Account page — change password", () => {
  const email = `test-pw-${Date.now()}@example.com`;
  const password = "OldPass123!";
  const name = "PW Test User";

  test.beforeAll(async ({ request }) => {
    await signUpAndGetCookies(request, email, password, name);
  });

  test.beforeEach(async ({ page, request }) => {
    await signInAndSetCookies(page, request, email, password);
    await page.goto("/dashboard/account");
    await page.waitForSelector("h1", { state: "visible" });
  });

  test.describe.configure({ mode: "serial" });

  test("can change password", async ({ page }) => {
    await page.getByLabel("Current Password", { exact: true }).fill(password);
    await page.getByLabel("New Password", { exact: true }).fill("NewPass456!");
    await page
      .getByLabel("Confirm New Password", { exact: true })
      .fill("NewPass456!");
    await page.getByRole("button", { name: "Update Password" }).click();
    await expect(
      page
        .locator("[data-sonner-toast]")
        .filter({ hasText: "Password changed successfully" }),
    ).toBeVisible({ timeout: 15000 });
  });

  test.afterAll(async ({ request }) => {
    await request.post("/api/auth/sign-in/email", {
      data: { email, password: "NewPass456!", callbackURL: "/dashboard" },
      headers: { Origin: "http://localhost:3000" },
    });
    const response = await request.post("/api/auth/delete-user", {
      data: { callbackURL: "/" },
      headers: { Origin: "http://localhost:3000" },
    });
    if (!response.ok()) {
      console.warn(
        "Test user cleanup failed:",
        response.status(),
        await response.text(),
      );
    }
  });
});
