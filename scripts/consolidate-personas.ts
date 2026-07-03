#!/usr/bin/env tsx
// Consolidate Personas: 3 refined personas with AI-extended tags (2025-2026)
// scripts/consolidate-personas.ts
//
// Refined based on:
//   - CV analysis (Next.js since 2017, AI Listing Extractor project with
//     Vercel AI SDK + prompt engineering, PHP/Laravel + Node.js history)
//   - Research Report: Next.js Job Listing Volumes (2026) — 350-450 Next.js
//     listings per weekday globally; "React factor" (Next.js keyword captures
//     only 60-70% of roles — many listed as "React Developer")
//   - Extended CANONICAL_TAGS with AI/LLM tags (prompt-engineering, rag,
//     vercel-ai-sdk, anthropic, etc.)
//
// Solution: 3 refined personas with AI-extended matching:
//   1. "Next.js / AI Full-Stack Engineer" — Next.js + AI integration
//      Tags: typescript, nextjs, react, nodejs, prompt-engineering
//      Covers: Next.js full-stack, AI-integrated apps, RAG, streaming UI
//      NEW: nextjs (replaces postgresql) + prompt-engineering (replaces docker)
//
//   2. "Senior React / GraphQL Frontend Engineer" — frontend-focused
//      Tags: typescript, react, nextjs, graphql, tailwindcss
//      Covers: frontend, Next.js, SSR/SSG, GraphQL, Core Web Vitals
//      Refined embedding summary (broader semantic space)
//
//   3. "PHP/Laravel Full-Stack Developer" — pure PHP stack
//      Tags: php, laravel, mysql, wordpress, javascript
//      Covers: PHP, Laravel, WordPress, MySQL, traditional web dev roles
//      Reverted: javascript (not nodejs) — keeps the PHP stack pure
//
// This script:
//   1. Deletes all match_queue rows for the applicant's current personas
//   2. Deletes the 3 current personas
//   3. Generates embeddings for the 3 new personas
//   4. Inserts the 3 new personas
//   5. Reports the result
//
// After this script, run rerun-gates.ts to rebuild match_queue with the new
// personas.
//
// Usage:
//   node --conditions react-server --import tsx scripts/consolidate-personas.ts
//   node --conditions react-server --import tsx scripts/consolidate-personas.ts --dry-run
//
// Note: --conditions react-server is required because the script imports
// modules that use `import "server-only"` (a Next.js marker).

import { config } from "dotenv";

config();

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
  process.exit(1);
});
process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection:", err);
  process.exit(1);
});

const APPLICANT_ID = "zgJMmPrwyjk0UH1Yf5GhMqOWSfZ9vecK";

const NEW_PERSONAS = [
  {
    personaId: "nextjs_ai_fullstack",
    personaLabel: "Next.js / AI Full-Stack Engineer",
    embeddingSummary:
      "Full-stack TypeScript engineer with 15+ years of web development experience and early Next.js adoption since 2017. Builds end-to-end features from database schema through Node.js API layer to React frontend with Next.js App Router, RSC, and streaming UI. Integrates LLM capabilities using Vercel AI SDK, with expertise in prompt engineering, structured output (Zod schemas), and RAG patterns for AI-powered applications. Experienced with Docker deployments and scalable type-safe SaaS architectures.",
    mustHaveTags: [
      "typescript",
      "nextjs",
      "react",
      "nodejs",
      "prompt-engineering",
    ],
    blocklistTags: [] as string[],
  },
  {
    personaId: "senior_react_graphql_frontend",
    personaLabel: "Senior React / GraphQL Frontend Engineer",
    embeddingSummary:
      "Senior React engineer with 7+ years building production web applications and enterprise-grade frontend platforms. Expert in TypeScript, Next.js App Router, SSR/SSG/ISR optimization, Core Web Vitals, and Tailwind CSS. Strong in GraphQL data fetching (Apollo/URQL) and state management (Redux, Context API) for data-intensive applications. Experienced in architecting complex React component hierarchies, design systems, and high-performance rendering strategies for high-traffic SaaS platforms.",
    mustHaveTags: ["typescript", "react", "nextjs", "graphql", "tailwindcss"],
    blocklistTags: [] as string[],
  },
  {
    personaId: "php_laravel_fullstack",
    personaLabel: "PHP/Laravel Full-Stack Developer",
    embeddingSummary:
      "PHP/Laravel full-stack developer with extensive experience building custom web applications, e-commerce platforms, and content-managed sites. Expert in Laravel framework architecture, MySQL database design, and WordPress plugin/theme development. Strong JavaScript skills for interactive frontend features, AJAX, and API integrations. Experienced in building scalable, secure LAMP-stack server-side architectures for publishing, real estate, and enterprise applications.",
    mustHaveTags: ["php", "laravel", "mysql", "wordpress", "javascript"],
    blocklistTags: [] as string[],
  },
];

// Defensive guard: the Zod schemas in profile-schemas.ts / schemas.ts cap
// embedding_summary at 500 chars. This script writes directly to the DB and
// bypasses Zod, so enforce the same limit here to keep Profile Management
// saves from failing later.
const MAX_SUMMARY_LEN = 500;
for (const p of NEW_PERSONAS) {
  if (p.embeddingSummary.length > MAX_SUMMARY_LEN) {
    console.error(
      `Persona "${p.personaLabel}" embedding_summary is ${p.embeddingSummary.length} chars (max ${MAX_SUMMARY_LEN}). Aborting.`,
    );
    process.exit(1);
  }
}

async function main() {
  const isDryRun = process.argv.includes("--dry-run");

  console.log(
    `\n${"=".repeat(72)}\n` +
      `Persona Consolidation Script\n` +
      `Mode: ${isDryRun ? "DRY RUN (no changes)" : "LIVE (will modify DB)"}\n` +
      `Applicant: ${APPLICANT_ID}\n` +
      `${"=".repeat(72)}\n`,
  );

  // Dynamic imports (server-only modules)
  const { db } = await import("@/db/db");
  const { persona, matchQueue } = await import("@/db/schemas");
  const { eq } = await import("drizzle-orm");
  const { generateEmbeddings } = await import("@/lib/ai/embeddings");

  // 1. Read current personas
  const currentPersonas = await db
    .select()
    .from(persona)
    .where(eq(persona.applicantId, APPLICANT_ID));

  console.log(`Current personas (${currentPersonas.length}):`);
  for (const p of currentPersonas) {
    console.log(
      `  - ${p.personaLabel} (id=${p.id}, tags=[${p.mustHaveTags.join(", ")}])`,
    );
  }

  // 2. Count match_queue rows that will be deleted
  const matchCount = await db
    .select({ count: matchQueue.id })
    .from(matchQueue)
    .where(eq(matchQueue.applicantId, APPLICANT_ID));

  console.log(`\nMatch queue rows for this applicant: ${matchCount.length}\n`);

  if (isDryRun) {
    console.log("New personas that would be created:");
    for (const p of NEW_PERSONAS) {
      console.log(
        `  - ${p.personaLabel} (id=${p.personaId}, tags=[${p.mustHaveTags.join(", ")}])`,
      );
      console.log(`    Summary: ${p.embeddingSummary.substring(0, 80)}...`);
    }
    console.log("\nDry run complete. No changes made.");
    return;
  }

  // 3. Delete match_queue rows for this applicant (cascade will handle this
  //    when personas are deleted, but we do it explicitly for clarity)
  console.log("Deleting match_queue rows...");
  await db.delete(matchQueue).where(eq(matchQueue.applicantId, APPLICANT_ID));
  console.log("  Done.");

  // 4. Delete current personas
  console.log("Deleting current personas...");
  await db.delete(persona).where(eq(persona.applicantId, APPLICANT_ID));
  console.log("  Done.");

  // 5. Generate embeddings for new personas
  console.log("\nGenerating embeddings for new personas...");
  const embeddings = await generateEmbeddings(
    NEW_PERSONAS.map((p) => p.embeddingSummary),
  );
  console.log(`  Generated ${embeddings.length} embeddings.`);

  // 6. Insert new personas
  console.log("Inserting new personas...");
  await db.insert(persona).values(
    NEW_PERSONAS.map((p, i) => ({
      applicantId: APPLICANT_ID,
      personaId: p.personaId,
      personaLabel: p.personaLabel,
      embeddingSummary: p.embeddingSummary,
      personaEmbedding: embeddings[i],
      mustHaveTags: p.mustHaveTags,
      blocklistTags: p.blocklistTags,
    })),
  );
  console.log("  Done.");

  // 7. Verify
  const newPersonas = await db
    .select()
    .from(persona)
    .where(eq(persona.applicantId, APPLICANT_ID));

  console.log(`\nNew personas (${newPersonas.length}):`);
  for (const p of newPersonas) {
    const hasEmbedding = p.personaEmbedding !== null;
    console.log(
      `  - ${p.personaLabel} (id=${p.id}, tags=[${p.mustHaveTags.join(", ")}], embedding=${hasEmbedding})`,
    );
  }

  console.log(
    `\n${"=".repeat(72)}\n` +
      `Consolidation complete!\n` +
      `Next step: Run rerun-gates.ts to rebuild match_queue with the new personas.\n` +
      `${"=".repeat(72)}\n`,
  );
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
