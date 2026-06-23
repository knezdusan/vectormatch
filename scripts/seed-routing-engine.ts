#!/usr/bin/env tsx

// Module C — Seed Routing Engine
// scripts/seed-routing-engine.ts
//
// Generates synthetic data for stress-testing the 3-Gate routing engine:
//   - 5 archetypes (Senior React, Python Backend, DevOps, Mobile iOS, Junior FE)
//   - N personas (default 1,000) with archetype-aligned embeddings + tag variance
//   - M jobs (default 5,000) with archetype-aligned embeddings + tag variance
//   - $0 AI cost: 5 embedding API calls total (one per archetype summary)
//
// Tags and vectors are INDEPENDENT variance axes (MODULE_C_DECISIONS.md §10.2):
//   - Tags: archetype seed ± 1–2 swaps with adjacent canonical tags (Gate 1 variance)
//   - Vectors: archetype vector + Gaussian noise (σ=0.01 personas, σ=0.015 jobs)
//     (Gate 2 variance — preserves cluster structure, creates realistic spread)
//
// Jobs are pre-normalized (status='active', normalizedAt=NOW()) so the funnel
// can be tested directly without running the normalizer.
//
// Usage:
//   node --env-file=.env.local --env-file=.env --import tsx scripts/seed-routing-engine.ts
//   node --env-file=.env.local --env-file=.env --import tsx scripts/seed-routing-engine.ts --scale 100
//
// --scale flag:
//   - Default: 1000 personas, 5000 jobs (full seed)
//   - --scale 100: 100 personas, 500 jobs (quick local test)
//   - --scale N: N personas, N*5 jobs
//
// NOT run in production. Used in Feature C6 (calibration) and for stress-testing
// the Gate 3 concurrency 15 cap. (MODULE_C_DECISIONS.md §10.3)

import { sql } from "drizzle-orm";
import { db } from "@/db/db";
import { user } from "@/db/schemas/auth/user";
import { applicant } from "@/db/schemas/jobs/applicant";
import { job } from "@/db/schemas/jobs/job";
import { persona } from "@/db/schemas/jobs/persona";
import { generateEmbeddings } from "@/lib/ai/embeddings";

// =============================================================================
// ARCHETYPE DEFINITIONS (§10.1)
// =============================================================================

type Archetype = {
  label: string;
  personaId: string;
  seedTags: string[];
  embeddingSummary: string;
  /** Tags that can substitute for a seed tag (creates Gate 1 variance).
   *  Key = seed tag, value = possible replacements (canonical tags). */
  swapPool: Record<string, string[]>;
  /** Weight for random archetype selection (must sum to 1.0). */
  weight: number;
};

const ARCHETYPES: Archetype[] = [
  {
    label: "Senior React Developer",
    personaId: "senior_react",
    seedTags: ["react", "nextjs", "typescript", "javascript", "css"],
    embeddingSummary:
      "Senior frontend engineer with 6 years building React applications. Deep expertise in Next.js App Router, TypeScript, and modern CSS. Strong product sense.",
    swapPool: {
      react: ["solidjs", "svelte", "vue"],
      nextjs: ["remix", "angular"],
      css: ["tailwindcss", "sass"],
    },
    weight: 0.3,
  },
  {
    label: "Senior Python Backend Engineer",
    personaId: "senior_python",
    seedTags: ["python", "django", "postgresql", "docker", "redis"],
    embeddingSummary:
      "Backend engineer with 7 years building Python services. Django, PostgreSQL, Redis caching. Distributed systems and API design.",
    swapPool: {
      django: ["fastapi", "flask"],
      postgresql: ["mysql", "mongodb"],
    },
    weight: 0.25,
  },
  {
    label: "DevOps / Platform Engineer",
    personaId: "devops_platform",
    seedTags: ["kubernetes", "aws", "terraform", "docker", "linux"],
    embeddingSummary:
      "Platform engineer specializing in Kubernetes, AWS, and infrastructure as code. CI/CD pipelines, observability, and cost optimization.",
    swapPool: {
      aws: ["gcp", "azure"],
      linux: ["bash"],
    },
    weight: 0.2,
  },
  {
    label: "Senior iOS Engineer",
    personaId: "senior_ios",
    seedTags: ["swift", "swiftui", "ios", "xcode", "combine"],
    embeddingSummary:
      "iOS engineer with 5 years shipping Swift/SwiftUI apps. Deep knowledge of the Apple ecosystem, Combine, and performance tuning.",
    swapPool: {},
    weight: 0.15,
  },
  {
    label: "Junior Frontend Developer",
    personaId: "junior_frontend",
    seedTags: ["javascript", "html", "css", "react", "git"],
    embeddingSummary:
      "Junior frontend developer with 1.5 years experience. JavaScript, React, and responsive design. Eager to grow into a senior role.",
    swapPool: {
      javascript: ["typescript"],
      css: ["tailwindcss", "sass"],
      react: ["vue", "angular", "solidjs", "svelte"],
    },
    weight: 0.1,
  },
];

// Blocklist tags for 20% of personas (Gate 1 negative testing)
const BLOCKLIST_POOL = ["java", "php", "ruby"];

// =============================================================================
// UTILITIES
// =============================================================================

/** Box-Muller transform for Gaussian random numbers. */
function gaussianRandom(mean = 0, stdDev = 1): number {
  const u1 = Math.max(Math.random(), 1e-10); // avoid log(0)
  const u2 = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return z * stdDev + mean;
}

/** Add Gaussian noise to a vector (per-dimension). Returns a new array. */
function addNoise(vector: number[], sigma: number): number[] {
  return vector.map((v) => v + gaussianRandom(0, sigma));
}

/** Pick a weighted random archetype index. */
function pickArchetypeIndex(): number {
  const r = Math.random();
  let cumulative = 0;
  for (let i = 0; i < ARCHETYPES.length; i++) {
    cumulative += ARCHETYPES[i].weight;
    if (r < cumulative) return i;
  }
  return ARCHETYPES.length - 1; // fallback (rounding)
}

/** Apply 1–2 random tag swaps from the archetype's swap pool.
 *  Returns a new array (does not mutate the seed). */
function applyTagSwaps(
  seedTags: string[],
  swapPool: Record<string, string[]>,
): string[] {
  const tags = [...seedTags];
  const swappable = Object.keys(swapPool).filter((t) => tags.includes(t));
  if (swappable.length === 0) return tags;

  // Decide how many swaps: 1 or 2 (but not more than swappable tags)
  const numSwaps = Math.min(
    swappable.length,
    1 + (Math.random() < 0.5 ? 1 : 0),
  );

  // Shuffle swappable tags and pick the first numSwaps
  const shuffled = [...swappable].sort(() => Math.random() - 0.5);
  for (let i = 0; i < numSwaps; i++) {
    const tagToSwap = shuffled[i];
    const replacements = swapPool[tagToSwap];
    if (replacements && replacements.length > 0) {
      const replacement =
        replacements[Math.floor(Math.random() * replacements.length)];
      const idx = tags.indexOf(tagToSwap);
      if (idx >= 0) {
        tags[idx] = replacement;
      }
    }
  }
  return tags;
}

/** Pick a random blocklist tag (or null with 80% probability). */
function maybeBlocklistTag(): string[] {
  if (Math.random() < 0.2) {
    return [BLOCKLIST_POOL[Math.floor(Math.random() * BLOCKLIST_POOL.length)]];
  }
  return [];
}

/** Build synthetic rawJson for a job (Greenhouse-style shape). */
function buildRawJson(
  title: string,
  tags: string[],
  archetypeLabel: string,
): string {
  const tagMentions = tags.map((t) => t).join(", ");
  const description = `<p>We are looking for a ${archetypeLabel.toLowerCase()}.</p><p>Required skills: ${tagMentions}.</p><p>You will work on exciting projects with modern technologies.</p>`;
  return JSON.stringify({
    title,
    content: description,
    absolute_url: `https://boards-api.greenhouse.io/v1/boards/seed-company/jobs/${Math.random().toString(36).slice(2)}`,
  });
}

/** Parse --scale flag from process.argv. Returns persona count (job count = 5x). */
function parseScale(): number {
  const args = process.argv.slice(2);
  const scaleIdx = args.indexOf("--scale");
  if (scaleIdx >= 0 && args[scaleIdx + 1]) {
    const n = Number.parseInt(args[scaleIdx + 1], 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 1000; // default
}

/** Chunk an array into batches for bulk insert. */
function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// =============================================================================
// MAIN
// =============================================================================

async function main(): Promise<void> {
  const personaCount = parseScale();
  const jobCount = personaCount * 5;

  console.log("=".repeat(70));
  console.log("Module C — Seed Routing Engine");
  console.log("=".repeat(70));
  console.log(
    `  Personas: ${personaCount} | Jobs: ${jobCount} | Archetypes: ${ARCHETYPES.length}`,
  );
  console.log();

  // ── Step 1: Generate 5 archetype embeddings (5 API calls, ~$0.0001) ──────
  console.log("Step 1: Generating archetype embeddings (5 API calls)...");
  const startedAt = Date.now();

  const summaries = ARCHETYPES.map((a) => a.embeddingSummary);
  const archetypeVectors = await generateEmbeddings(summaries);

  if (archetypeVectors.length !== ARCHETYPES.length) {
    throw new Error(
      `Expected ${ARCHETYPES.length} embeddings, got ${archetypeVectors.length}`,
    );
  }

  console.log(
    `  ✓ ${archetypeVectors.length} embeddings generated (${archetypeVectors[0].length}-d)`,
  );
  console.log();

  // ── Step 2: Generate users + applicants + personas ───────────────────────
  console.log(`Step 2: Generating ${personaCount} personas...`);

  const users: (typeof user.$inferInsert)[] = [];
  const applicants: (typeof applicant.$inferInsert)[] = [];
  const personas: (typeof persona.$inferInsert)[] = [];

  for (let i = 0; i < personaCount; i++) {
    const archetypeIdx = pickArchetypeIndex();
    const archetype = ARCHETYPES[archetypeIdx];
    const archetypeVector = archetypeVectors[archetypeIdx];

    const userId = `seed-user-${String(i + 1).padStart(5, "0")}`;
    const personaUuid = crypto.randomUUID();

    // User
    users.push({
      id: userId,
      name: `Seed User ${i + 1}`,
      email: `seed-user-${i + 1}@vectormatch.dev`,
      emailVerified: true,
      role: "user",
    });

    // Applicant
    const tags = applyTagSwaps(archetype.seedTags, archetype.swapPool);
    applicants.push({
      userId,
      isOnboarded: true,
      country: "RS", // Serbia (B2B compliance context)
      canWorkUsHours: true,
      assignmentTypes: ["remote"],
      modalities: ["full-time", "contract"],
      preferredCompliance: ["b2b", "w8ben"],
      allTags: tags,
    });

    // Persona — embedding = archetype vector + Gaussian noise (σ=0.01)
    const noisyEmbedding = addNoise(archetypeVector, 0.01);
    personas.push({
      id: personaUuid,
      applicantId: userId,
      personaId: archetype.personaId,
      personaLabel: archetype.label,
      embeddingSummary: archetype.embeddingSummary,
      personaEmbedding: noisyEmbedding,
      mustHaveTags: tags,
      blocklistTags: maybeBlocklistTag(),
    });
  }

  // Bulk insert users, applicants, personas in chunks
  const BATCH_SIZE = 100;
  console.log(
    `  Inserting users (${Math.ceil(users.length / BATCH_SIZE)} batches)...`,
  );
  for (const batch of chunk(users, BATCH_SIZE)) {
    await db.insert(user).values(batch).onConflictDoNothing();
  }

  console.log(
    `  Inserting applicants (${Math.ceil(applicants.length / BATCH_SIZE)} batches)...`,
  );
  for (const batch of chunk(applicants, BATCH_SIZE)) {
    await db.insert(applicant).values(batch).onConflictDoNothing();
  }

  console.log(
    `  Inserting personas (${Math.ceil(personas.length / BATCH_SIZE)} batches)...`,
  );
  for (const batch of chunk(personas, BATCH_SIZE)) {
    await db.insert(persona).values(batch);
  }

  console.log(`  ✓ ${personaCount} personas inserted`);
  console.log();

  // ── Step 3: Generate jobs ────────────────────────────────────────────────
  console.log(`Step 3: Generating ${jobCount} jobs...`);

  const jobs: (typeof job.$inferInsert)[] = [];
  const now = new Date();

  for (let i = 0; i < jobCount; i++) {
    // Assign each job to an archetype (evenly: jobCount / 5 per archetype)
    const archetypeIdx = i % ARCHETYPES.length;
    const archetype = ARCHETYPES[archetypeIdx];
    const archetypeVector = archetypeVectors[archetypeIdx];

    const tags = applyTagSwaps(archetype.seedTags, archetype.swapPool);
    const title = `${archetype.label} (Job ${i + 1})`;

    // Embedding = archetype vector + Gaussian noise (σ=0.015 — slightly more
    // than personas, since jobs are noisier than self-described personas)
    const noisyEmbedding = addNoise(archetypeVector, 0.015);

    jobs.push({
      atsSource: "greenhouse",
      atsSlug: "seed-company",
      title,
      rawJson: buildRawJson(title, tags, archetype.label),
      extractedTags: tags,
      jobEmbedding: noisyEmbedding,
      externalJobId: `seed-job-${i + 1}`,
      lastSeenAt: now,
      status: "active",
      normalizedAt: now, // pre-normalized so funnel can be tested directly
    });
  }

  console.log(
    `  Inserting jobs (${Math.ceil(jobs.length / BATCH_SIZE)} batches)...`,
  );
  for (const batch of chunk(jobs, BATCH_SIZE)) {
    await db.insert(job).values(batch).onConflictDoNothing();
  }

  console.log(`  ✓ ${jobCount} jobs inserted`);
  console.log();

  // ── Step 4: Verify ───────────────────────────────────────────────────────
  console.log("=".repeat(70));
  console.log("Verification");
  console.log("=".repeat(70));

  const personaRows = await db.execute(
    sql`SELECT count(*)::int AS cnt FROM persona`,
  );
  const jobRows = await db.execute(sql`SELECT count(*)::int AS cnt FROM job`);
  const userRows = await db.execute(
    sql`SELECT count(*)::int AS cnt FROM "user" WHERE id LIKE 'seed-user-%'`,
  );

  const personaTotal = personaRows.rows[0]?.cnt ?? 0;
  const jobTotal = jobRows.rows[0]?.cnt ?? 0;
  const userTotal = userRows.rows[0]?.cnt ?? 0;

  console.log(`  Seed users in DB:     ${userTotal}`);
  console.log(`  Total personas in DB: ${personaTotal}`);
  console.log(`  Total jobs in DB:     ${jobTotal}`);
  console.log();

  // Verify embeddings are non-null
  const personaWithEmbedding = await db.execute(sql`
    SELECT count(*)::int AS cnt FROM persona WHERE persona_embedding IS NOT NULL
  `);
  const jobsWithEmbedding = await db.execute(sql`
    SELECT count(*)::int AS cnt FROM job WHERE job_embedding IS NOT NULL
  `);

  console.log(
    `  Personas with embedding: ${personaWithEmbedding.rows[0]?.cnt ?? 0}`,
  );
  console.log(
    `  Jobs with embedding:     ${jobsWithEmbedding.rows[0]?.cnt ?? 0}`,
  );
  console.log();

  // Verify pre-normalized jobs
  const normalizedJobs = await db.execute(sql`
    SELECT count(*)::int AS cnt FROM job WHERE normalized_at IS NOT NULL AND status = 'active'
  `);
  console.log(
    `  Pre-normalized active jobs: ${normalizedJobs.rows[0]?.cnt ?? 0}`,
  );
  console.log();

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log("=".repeat(70));
  console.log(
    `Done in ${elapsed}s — ${personaCount} personas + ${jobCount} jobs inserted.`,
  );
  console.log("=".repeat(70));

  process.exit(0);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
