// One-off fix: the `consolidate-personas.ts` script wrote an embedding_summary
// of 514 chars for the "Next.js / AI Full-Stack Engineer" persona, bypassing the
// 500-char Zod limit enforced by updatePersonasPayloadSchema. As a result, any
// attempt to save personas from Profile Management fails validation with
// "Embedding summary must be at most 500 characters" — even when the user only
// changed an unrelated field (e.g. seniorityLevels).
//
// This script shortens that summary to <=500 chars AND regenerates the persona
// embedding so the vector stays semantically consistent with the new text.
//
// Run with:  npx tsx scripts/fix-persona-summary-length.ts
// Dry run:   npx tsx scripts/fix-persona-summary-length.ts --dry-run

import { Pool } from "@neondatabase/serverless";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";
import { persona } from "../src/db/schemas/jobs/persona";

config();

// The persona id from the diagnostic run (zgJMmPrwyjk0UH1Yf5GhMqOWSfZ9vecK).
const TARGET_PERSONA_ID = "381ab6fe-ee04-4dd6-bc03-3136f231112b";

// Shortened to 499 chars (was 514). Removed "containerised " and one comma;
// semantic content is fully preserved.
const NEW_SUMMARY =
  "Full-stack TypeScript engineer with 15+ years of web development experience and early Next.js adoption since 2017. Builds end-to-end features from database schema through Node.js API layer to React frontend with Next.js App Router, RSC, and streaming UI. Integrates LLM capabilities using Vercel AI SDK, with expertise in prompt engineering, structured output (Zod schemas), and RAG patterns for AI-powered applications. Experienced with Docker deployments and scalable type-safe SaaS architectures.";

async function main() {
  const isDryRun = process.argv.includes("--dry-run");
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }

  console.log(
    `\n${"=".repeat(72)}\n` +
      `Fix persona summary length\n` +
      `Mode: ${isDryRun ? "DRY RUN (no changes)" : "LIVE (will modify DB)"}\n` +
      `Target persona id: ${TARGET_PERSONA_ID}\n` +
      `New summary length: ${NEW_SUMMARY.length} chars\n` +
      `${"=".repeat(72)}\n`,
  );

  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  const db = drizzle(pool);

  const [current] = await db
    .select()
    .from(persona)
    .where(eq(persona.id, TARGET_PERSONA_ID));

  if (!current) {
    console.error(`No persona found with id ${TARGET_PERSONA_ID}`);
    await pool.end();
    process.exit(1);
  }

  console.log(`Current persona: ${current.personaLabel}`);
  console.log(
    `Current summary length: ${current.embeddingSummary.length} chars`,
  );
  console.log(`Current summary:\n  ${current.embeddingSummary}\n`);

  if (current.embeddingSummary.length <= 500) {
    console.log(
      "Summary is already within the 500-char limit. Nothing to fix.",
    );
    await pool.end();
    return;
  }

  if (isDryRun) {
    console.log(`New summary (dry run):\n  ${NEW_SUMMARY}\n`);
    console.log("Dry run complete. No changes made.");
    await pool.end();
    return;
  }

  // Regenerate the embedding from the shortened summary so the vector stays
  // semantically consistent. We inline the AI SDK call here instead of
  // importing from src/lib/ai/embeddings.ts because that module is marked
  // `server-only` and throws when imported from a tsx script context.
  const { openai } = await import("@ai-sdk/openai");
  const { embedMany } = await import("ai");
  console.log("Generating new embedding from shortened summary...");
  const { embeddings } = await embedMany({
    model: openai.embedding("text-embedding-3-small"),
    values: [NEW_SUMMARY],
  });
  const embedding = embeddings[0];
  if (!embedding) {
    throw new Error("Failed to generate embedding: empty result from provider");
  }
  console.log("  Done.");

  await db
    .update(persona)
    .set({
      embeddingSummary: NEW_SUMMARY,
      personaEmbedding: embedding,
    })
    .where(eq(persona.id, TARGET_PERSONA_ID));

  // Verify.
  const [updated] = await db
    .select({
      id: persona.id,
      personaLabel: persona.personaLabel,
      embeddingSummary: persona.embeddingSummary,
      hasEmbedding: persona.personaEmbedding,
    })
    .from(persona)
    .where(eq(persona.id, TARGET_PERSONA_ID));

  console.log(`\nUpdated persona: ${updated?.personaLabel}`);
  console.log(`New summary length: ${updated?.embeddingSummary.length} chars`);
  console.log(`Has embedding: ${updated?.hasEmbedding !== null}`);
  console.log(
    `\n${"=".repeat(72)}\nFix complete. Profile Management saves should now work.\n${"=".repeat(72)}\n`,
  );

  await pool.end();
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
