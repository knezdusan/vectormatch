// One-off diagnostic: list every persona's embedding_summary length so we can
// confirm which rows exceed the 500-char Zod limit enforced by
// updatePersonasPayloadSchema (and therefore block Profile Management saves).
//
// Run with:  npx tsx scripts/diagnose-persona-summaries.ts

import { Pool } from "@neondatabase/serverless";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/neon-serverless";
import { persona } from "../src/db/schemas/jobs/persona";

config();

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  const db = drizzle(pool);

  const personas = await db.select().from(persona);

  console.log(`Found ${personas.length} persona rows\n`);
  console.log(
    "id                                   | applicantId                      | len  | personaLabel",
  );
  console.log("-".repeat(120));
  for (const p of personas) {
    const len = p.embeddingSummary.length;
    const flag = len > 500 ? "  <<< OVER 500" : "";
    console.log(
      `${p.id} | ${p.applicantId} | ${String(len).padStart(4)} | ${p.personaLabel}${flag}`,
    );
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
