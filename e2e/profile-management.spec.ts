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

async function getSql() {
  loadEnv();
  const { neon } = await import("@neondatabase/serverless");
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }
  return neon(databaseUrl);
}

async function getUserIdByEmail(email: string) {
  const sql = await getSql();
  const [row] = await sql`SELECT id FROM "user" WHERE email = ${email}`;
  return row?.id as string | undefined;
}

async function verifyUserEmail(email: string) {
  const sql = await getSql();
  await sql`UPDATE "user" SET email_verified = true WHERE email = ${email}`;
}

async function seedOnboardingData(userId: string) {
  const sql = await getSql();

  const applicantId = userId;
  const cvUploadId = crypto.randomUUID();
  const workHistoryId = crypto.randomUUID();
  const personaId = crypto.randomUUID();
  const allTags = ["react", "typescript", "nodejs", "postgresql"];

  await sql`DELETE FROM tags_experience WHERE applicant_id = ${applicantId}`;
  await sql`DELETE FROM working_history WHERE applicant_id = ${applicantId}`;
  await sql`DELETE FROM persona WHERE applicant_id = ${applicantId}`;
  await sql`DELETE FROM cv_upload WHERE applicant_id = ${applicantId}`;
  await sql`DELETE FROM applicant WHERE user_id = ${applicantId}`;

  await sql`
    INSERT INTO applicant (
      user_id, country, can_work_us_hours, assignment_types, modalities,
      preferred_compliance, all_tags, is_onboarded
    ) VALUES (
      ${applicantId}, 'US', true,
      ARRAY['remote']::assignment_type[],
      ARRAY['full-time']::modality[],
      ARRAY['w2']::compliance[],
      ${allTags}::text[],
      true
    )
  `;

  await sql`
    INSERT INTO cv_upload (
      id, applicant_id, label, original_file_name, raw_text,
      extracted_json, status
    ) VALUES (
      ${cvUploadId},
      ${applicantId},
      'Test CV',
      'cv.txt',
      'Software engineer with React, TypeScript, Node.js, PostgreSQL experience.',
      ${JSON.stringify({
        roles: [
          {
            company: "Acme Inc",
            title: "Senior Software Engineer",
            start_date: "2020-01",
            end_date: "2024-06",
            is_current: false,
            summary: "Built customer-facing applications.",
            canonical_skills_detected: [
              "react",
              "typescript",
              "nodejs",
              "postgresql",
            ],
            raw_skills_detected: [
              "React",
              "TypeScript",
              "Node.js",
              "PostgreSQL",
            ],
          },
        ],
        proposed_stacks: [
          {
            persona_id: "fullstack",
            persona_label: "Full-Stack Engineer",
            embedding_summary:
              "Experienced full-stack engineer building scalable web applications with React, TypeScript, Node.js, and PostgreSQL.",
            must_have_tags: [
              "react",
              "typescript",
              "nodejs",
              "postgresql",
              "javascript",
            ],
            blocklist_tags: [],
          },
        ],
      })},
      'valid'
    )
  `;

  await sql`
    INSERT INTO working_history (
      id, applicant_id, cv_upload_id, company, role, start_date, end_date,
      is_current, summary, canonical_skills_detected, raw_skills_detected
    ) VALUES (
      ${workHistoryId},
      ${applicantId},
      ${cvUploadId},
      'Acme Inc',
      'Senior Software Engineer',
      '2020-01-01',
      '2024-06-01',
      false,
      'Built customer-facing applications.',
      ${allTags}::text[],
      ${["React", "TypeScript", "Node.js", "PostgreSQL"]}::text[]
    )
  `;

  for (const [tag, years] of [
    ["react", "4.5"],
    ["typescript", "4.5"],
    ["nodejs", "4.5"],
    ["postgresql", "4.5"],
  ] as [string, string][]) {
    await sql`
      INSERT INTO tags_experience (
        applicant_id, canonical_tag, years_of_experience, active
      ) VALUES (
        ${applicantId}, ${tag}, ${years}, true
      )
    `;
  }

  await sql`
    INSERT INTO persona (
      id, applicant_id, persona_id, persona_label, embedding_summary,
      must_have_tags, blocklist_tags, persona_embedding, created_at, updated_at
    ) VALUES (
      ${personaId},
      ${applicantId},
      'fullstack',
      'Full-Stack Engineer',
      'Experienced full-stack engineer building scalable web applications with React, TypeScript, Node.js, and PostgreSQL.',
      ${["react", "typescript", "nodejs", "postgresql", "javascript"]}::text[],
      ${[]}::text[],
      ${JSON.stringify(Array(1536).fill(0.01))},
      NOW(),
      NOW()
    )
  `;

  return { applicantId, cvUploadId };
}

async function cleanupUserAndData(email: string) {
  const sql = await getSql();
  const userId = await getUserIdByEmail(email);
  if (!userId) return;
  await sql`DELETE FROM tags_experience WHERE applicant_id = ${userId}`;
  await sql`DELETE FROM working_history WHERE applicant_id = ${userId}`;
  await sql`DELETE FROM persona WHERE applicant_id = ${userId}`;
  await sql`DELETE FROM cv_upload WHERE applicant_id = ${userId}`;
  await sql`DELETE FROM applicant WHERE user_id = ${userId}`;
  await sql`DELETE FROM "account" WHERE "user_id" = ${userId}`;
  await sql`DELETE FROM "session" WHERE "user_id" = ${userId}`;
  await sql`DELETE FROM "user" WHERE id = ${userId}`;
}

async function signInAndCaptureCookies(
  request: import("@playwright/test").APIRequestContext,
  email: string,
  password: string,
): Promise<string | undefined> {
  const response = await request.post("/api/auth/sign-in/email", {
    data: { email, password, callbackURL: "/dashboard" },
    headers: { Origin: "http://localhost:3000" },
  });
  return response.headers()["set-cookie"];
}

async function setCookies(
  page: import("@playwright/test").Page,
  cookieHeader: string | undefined,
) {
  if (!cookieHeader) return;
  const cookieStrings = Array.isArray(cookieHeader)
    ? cookieHeader
    : cookieHeader.split(",");
  await page.context().addCookies(
    cookieStrings.map((c) => {
      const [nameValue] = c.split(";");
      const eqIdx = nameValue.indexOf("=");
      const name = nameValue.slice(0, eqIdx).trim();
      const value = nameValue.slice(eqIdx + 1).trim();
      return { name, value, domain: "localhost", path: "/" };
    }),
  );
  await page.waitForTimeout(500);
}

test.describe("Profile Management — onboarding and editing", () => {
  const password = "ProfilePass123!";

  let email: string;
  let name: string;
  let cookieHeader: string | undefined;

  test.beforeAll(async ({ request }, testInfo) => {
    const timestamp = Date.now();
    const suffix = `${timestamp}-${testInfo.workerIndex}`;
    email = `test-profile-${suffix}@example.com`;
    name = `Profile User ${suffix}`;
    await cleanupUserAndData(email);
    await request.post("/api/auth/sign-up/email", {
      data: { email, password, name, callbackURL: "/dashboard" },
      headers: { Origin: "http://localhost:3000" },
    });
    await verifyUserEmail(email);
    const userId = await getUserIdByEmail(email);
    if (!userId) throw new Error("Failed to create test user");
    await seedOnboardingData(userId);
    cookieHeader = await signInAndCaptureCookies(request, email, password);
  });

  test.beforeEach(async ({ page }) => {
    await setCookies(page, cookieHeader);
    await page.goto("/dashboard/profile-management", {
      waitUntil: "domcontentloaded",
    });
    await page
      .locator("h1", { hasText: "Profile Management" })
      .waitFor({ state: "visible", timeout: 30000 });
  });

  test.describe.configure({ mode: "serial" });
  test.setTimeout(60000);

  test("renders profile sections and seeded data", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "Profile Management" }),
    ).toBeVisible();
    await expect(page.getByTestId("profile-country")).toBeVisible();
    await expect(page.getByTestId("profile-country")).toContainText("US");
    await expect(page.getByText("Acme Inc")).toBeVisible();
    await expect(page.getByText("Senior Software Engineer")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Full-Stack Engineer" }),
    ).toBeVisible();
    await expect(page.getByText("React · 4.5y")).toBeVisible();
  });

  test("edits and saves preferences", async ({ page }) => {
    await page
      .locator("section", { hasText: "Work preferences" })
      .getByRole("button", { name: "Edit" })
      .click({ force: true });
    await expect(page.getByLabel("Country (ISO 3166-1 alpha-2)")).toBeVisible();
    await page.getByLabel("Country (ISO 3166-1 alpha-2)").fill("CA");
    await page
      .getByRole("button", { name: "Save preferences" })
      .click({ force: true });
    await expect(page.getByTestId("profile-country")).toContainText("CA", {
      timeout: 15000,
    });
  });

  test("edits and saves work history", async ({ page }) => {
    await page
      .locator("section", { hasText: "Work history" })
      .getByRole("button", { name: "Edit" })
      .click({ force: true });
    await expect(page.getByLabel("Company")).toBeVisible();
    await page.getByLabel("Company").fill("Updated Company");
    await page
      .getByRole("button", { name: "Save work history" })
      .click({ force: true });
    await expect(page.getByText("Updated Company")).toBeVisible({
      timeout: 15000,
    });
  });

  test("edits and saves personas", async ({ page }) => {
    await page
      .locator("section", { hasText: "Personas" })
      .getByRole("button", { name: "Edit" })
      .click({ force: true });
    await expect(page.getByLabel("Persona label")).toBeVisible();
    await page.getByLabel("Persona label").fill("Updated Persona");
    await page
      .getByRole("button", { name: "Save personas" })
      .click({ force: true });
    await expect(
      page.getByRole("heading", { name: "Updated Persona" }),
    ).toBeVisible({ timeout: 15000 });
  });

  test("cancel reverts preferences changes", async ({ page }) => {
    const currentCountry = await page
      .getByTestId("profile-country")
      .locator("span.text-sm")
      .textContent();
    await page
      .locator("section", { hasText: "Work preferences" })
      .getByRole("button", { name: "Edit" })
      .click({ force: true });
    await page.getByLabel("Country (ISO 3166-1 alpha-2)").fill("GB");
    await page.getByRole("button", { name: "Cancel" }).click({ force: true });
    await expect(page.getByTestId("profile-country")).toContainText(
      currentCountry?.trim() ?? "CA",
    );
    await expect(page.getByTestId("profile-country")).not.toContainText("GB");
  });

  test.afterAll(async () => {
    await cleanupUserAndData(email);
  });
});
