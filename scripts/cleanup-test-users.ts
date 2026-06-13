import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

async function cleanup() {
  loadEnv();

  const { db } = await import("../src/db/db");
  const schemas = await import("../src/db/schemas");
  const { eq, like } = await import("drizzle-orm");

  const testUsers = await db
    .select({ id: schemas.user.id })
    .from(schemas.user)
    .where(like(schemas.user.email, "test-account-%@example.com"));

  for (const u of testUsers) {
    await db.delete(schemas.session).where(eq(schemas.session.userId, u.id));
    await db.delete(schemas.account).where(eq(schemas.account.userId, u.id));
    await db.delete(schemas.user).where(eq(schemas.user.id, u.id));
  }

  console.log(`Deleted ${testUsers.length} test users`);
}

cleanup()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
