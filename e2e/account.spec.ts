import { expect, test } from "@playwright/test";

test.describe("Account page", () => {
  const testEmail = `test-account-${Date.now()}@example.com`;
  const testPassword = "TestPass123!";
  const testName = "Test User";

  test.beforeAll(async ({ request }) => {
    await request.post("/api/auth/sign-up/email", {
      data: {
        email: testEmail,
        password: testPassword,
        name: testName,
        callbackURL: "/dashboard",
      },
    });
  });

  test.beforeEach(async ({ page, request }) => {
    const response = await request.post("/api/auth/sign-in/email", {
      data: {
        email: testEmail,
        password: testPassword,
        callbackURL: "/dashboard",
      },
    });
    const cookies = response.headers()["set-cookie"];
    if (cookies) {
      await page.context().addCookies(
        cookies.split(",").map((c) => {
          const [nameValue] = c.split(";");
          const [name, value] = nameValue.trim().split("=");
          return {
            name: name.trim(),
            value: value.trim(),
            domain: "localhost",
            path: "/",
          };
        }),
      );
    }
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
    await expect(page.getByText("Profile updated successfully")).toBeVisible();
  });

  test("can change password", async ({ page }) => {
    await page
      .getByLabel("Current Password", { exact: true })
      .fill(testPassword);
    await page.getByLabel("New Password", { exact: true }).fill("NewPass456!");
    await page
      .getByLabel("Confirm New Password", { exact: true })
      .fill("NewPass456!");
    await page.getByRole("button", { name: "Update Password" }).click();
    await expect(page.getByText("Password changed successfully")).toBeVisible();
    await expect(page.getByText("Password changed successfully")).toBeHidden();

    // Restore original password so subsequent sign-ins work
    await page
      .getByLabel("Current Password", { exact: true })
      .fill("NewPass456!");
    await page.getByLabel("New Password", { exact: true }).fill(testPassword);
    await page
      .getByLabel("Confirm New Password", { exact: true })
      .fill(testPassword);
    await page.getByRole("button", { name: "Update Password" }).click();
    await expect(page.getByText("Password changed successfully")).toBeVisible();
  });

  test("delete account shows confirmation dialog", async ({ page }) => {
    await page.getByRole("button", { name: "Delete Account" }).click();
    await expect(page.getByText("This action cannot be undone")).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(
      page.getByText("This action cannot be undone"),
    ).not.toBeVisible();
  });

  test.afterAll(async ({ request }) => {
    await request.post("/api/auth/sign-in/email", {
      data: {
        email: testEmail,
        password: testPassword,
        callbackURL: "/dashboard",
      },
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
