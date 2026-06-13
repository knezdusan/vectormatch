import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

function loadEnv() {
  try {
    const content = readFileSync(resolve(process.cwd(), ".env"), "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      let value = trimmed.slice(idx + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // .env not found or unreadable
  }
}

async function updateUserRoleToAdmin(email: string) {
  loadEnv();
  const { neon } = await import("@neondatabase/serverless");
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }
  const sql = neon(databaseUrl);
  await sql`UPDATE "user" SET role = 'admin', email_verified = true WHERE email = ${email}`;
}

async function deleteUsersByEmail(emails: string[]) {
  loadEnv();
  const { neon } = await import("@neondatabase/serverless");
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return;
  }
  const sql = neon(databaseUrl);
  for (const email of emails) {
    await sql`DELETE FROM "account" WHERE "user_id" IN (SELECT id FROM "user" WHERE email = ${email})`;
    await sql`DELETE FROM "session" WHERE "user_id" IN (SELECT id FROM "user" WHERE email = ${email})`;
    await sql`DELETE FROM "user" WHERE email = ${email}`;
  }
}

test.describe("Admin page", () => {
  const timestamp = Date.now();
  const adminEmail = `test-admin-${timestamp}@example.com`;
  const adminPassword = "AdminPass123!";
  const adminName = `Admin ${timestamp}`;

  const userEmail = `test-user-${timestamp}@example.com`;
  const userPassword = "UserPass123!";
  const userName = `User ${timestamp}`;

  let adminCookie = "";

  test.beforeAll(async ({ request }) => {
    // Clean up any previous failed runs with similar emails
    await deleteUsersByEmail([adminEmail, userEmail]);

    // Create admin user
    await request.post("/api/auth/sign-up/email", {
      data: {
        email: adminEmail,
        password: adminPassword,
        name: adminName,
        callbackURL: "/dashboard",
      },
      headers: { Origin: "http://localhost:3000" },
    });

    // Promote to admin via direct DB update
    await updateUserRoleToAdmin(adminEmail);

    // Create regular user
    await request.post("/api/auth/sign-up/email", {
      data: {
        email: userEmail,
        password: userPassword,
        name: userName,
        callbackURL: "/dashboard",
      },
      headers: { Origin: "http://localhost:3000" },
    });

    // Sign in as admin to capture session cookie
    const signInRes = await request.post("/api/auth/sign-in/email", {
      data: {
        email: adminEmail,
        password: adminPassword,
        callbackURL: "/dashboard",
      },
      headers: { Origin: "http://localhost:3000" },
    });

    const cookies = signInRes.headers()["set-cookie"];
    if (cookies) {
      adminCookie = cookies;
    }
  });

  test.beforeEach(async ({ page }) => {
    if (adminCookie) {
      await page.context().addCookies(
        adminCookie.split(",").map((c) => {
          const [nameValue] = c.split(";");
          const eqIdx = nameValue.indexOf("=");
          const name = nameValue.slice(0, eqIdx).trim();
          const value = nameValue.slice(eqIdx + 1).trim();
          return {
            name,
            value,
            domain: "localhost",
            path: "/",
          };
        }),
      );
    }
    await page.goto("/dashboard/admin", { waitUntil: "load" });
    await page.waitForSelector("text=Users", { state: "visible" });
  });

  test.describe.configure({ mode: "serial" });

  test("shows admin page with users table", async ({ page }) => {
    await expect(page.getByText("Users")).toBeVisible();
    await expect(
      page.getByText("Manage user accounts, roles, and permissions"),
    ).toBeVisible();
    // Use table row locators to avoid matching sidebar text
    await expect(page.locator("tr", { hasText: adminName })).toBeVisible();
    await expect(page.locator("tr", { hasText: userName })).toBeVisible();
  });

  test("can ban and unban a user", async ({ page }) => {
    const userRow = page.locator("tr", { hasText: userName });
    await expect(userRow).toBeVisible();

    const menuButton = userRow.locator('button[aria-label="Open menu"]');
    await menuButton.waitFor({ state: "visible" });
    await menuButton.click();
    await page.getByRole("menuitem", { name: "Ban User" }).click();

    // Wait for reload after ban
    await page.waitForSelector("text=Users", {
      state: "visible",
      timeout: 15000,
    });
    await expect(userRow.getByText("Banned")).toBeVisible();

    await userRow.locator('button[aria-label="Open menu"]').click();
    await page.getByRole("menuitem", { name: "Unban User" }).click();

    // Wait for reload after unban
    await page.waitForSelector("text=Users", {
      state: "visible",
      timeout: 15000,
    });
    await expect(userRow.getByText("Banned")).not.toBeVisible();
  });

  test("impersonation flow works end to end", async ({ page }) => {
    const userRow = page.locator("tr", { hasText: userName });
    await expect(userRow).toBeVisible();

    const menuButton = userRow.locator('button[aria-label="Open menu"]');
    await menuButton.waitFor({ state: "visible" });
    await menuButton.click();
    await page.getByRole("menuitem", { name: "Impersonate" }).click();

    const indicator = page.locator(
      'button[aria-label="Stop impersonating and return to admin account"]',
    );
    await indicator.waitFor({ state: "visible", timeout: 10000 });

    await indicator.click();

    await expect(indicator).not.toBeVisible({ timeout: 15000 });
  });

  test("delete user shows confirmation dialog and removes user", async ({
    page,
  }) => {
    const userRow = page.locator("tr", { hasText: userName });
    await expect(userRow).toBeVisible();

    const menuButton = userRow.locator('button[aria-label="Open menu"]');
    await menuButton.waitFor({ state: "visible" });
    await menuButton.click();
    await page.getByRole("menuitem", { name: "Delete User" }).click();

    await expect(page.getByText("Are you absolutely sure?")).toBeVisible();
    await page.getByRole("button", { name: "Delete User" }).click();

    await expect(userRow).not.toBeVisible();
  });

  test.afterAll(async () => {
    await deleteUsersByEmail([adminEmail, userEmail]);
  });
});
