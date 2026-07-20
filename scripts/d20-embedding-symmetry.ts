// D20 JOB 6.2: Embedding symmetry fix
//
// 1. Embeds 18 active, unfenced jobs that are missing embeddings (invisible to Gate 2)
// 2. Nulls embeddings on 520 fenced jobs (wasted storage — fenced jobs can never match)
//
// This restores embedding symmetry: all unfenced active jobs have embeddings,
// no fenced jobs have embeddings.

import "dotenv/config";
import { Client } from "pg";

const DB_URL = process.env.DATABASE_URL;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!DB_URL) throw new Error("DATABASE_URL not set");
if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set");

async function embed(text: string): Promise<number[]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text.slice(0, 8000), // OpenAI token limit safety
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI API error: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.data[0].embedding;
}

async function main() {
  const client = new Client({ connectionString: DB_URL, connectionTimeoutMillis: 10000 });
  await client.connect();

  // ── Step 1: Embed 18 active unfenced jobs without embeddings ───────────
  console.log("Step 1: Embedding active unfenced jobs without embeddings...");
  const { rows: unembedded } = await client.query(`
    SELECT id, title, normalized_text
    FROM job
    WHERE job_embedding IS NULL
      AND COALESCE(is_fenced, false) = false
      AND status = 'active'
      AND normalized_text IS NOT NULL
    ORDER BY detected_at DESC
  `);

  console.log(`Found ${unembedded.length} jobs to embed`);

  let embedded = 0;
  let failed = 0;
  for (const job of unembedded) {
    const fullText = `${job.title} ${job.normalized_text}`.slice(0, 8000);
    try {
      const embedding = await embed(fullText);
      const vectorStr = `[${embedding.join(",")}]`;
      await client.query(
        `UPDATE job SET job_embedding = $1::vector WHERE id = $2 AND job_embedding IS NULL`,
        [vectorStr, job.id],
      );
      embedded++;
      console.log(`  ✓ ${job.id} | ${job.title.substring(0, 50)}`);
    } catch (e) {
      failed++;
      console.error(`  ✗ ${job.id} | ${job.title.substring(0, 50)} | ${e.message}`);
    }
    // Rate limit: ~5 req/s
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log(`\nEmbedded: ${embedded}, Failed: ${failed}`);

  // ── Step 2: Null embeddings on fenced jobs (wasted storage) ────────────
  console.log("\nStep 2: Nulling embeddings on fenced jobs (wasted storage)...");
  const { rowCount: nulled } = await client.query(`
    UPDATE job SET job_embedding = NULL
    WHERE job_embedding IS NOT NULL
      AND COALESCE(is_fenced, false) = true
  `);
  console.log(`Nulled ${nulled} fenced jobs' embeddings`);

  // ── Step 3: Verify symmetry ────────────────────────────────────────────
  console.log("\nStep 3: Verifying embedding symmetry...");
  const { rows: summary } = await client.query(`
    SELECT
      count(*) as total,
      count(*) FILTER (WHERE job_embedding IS NOT NULL) as with_emb,
      count(*) FILTER (WHERE job_embedding IS NULL) as no_emb,
      count(*) FILTER (WHERE COALESCE(is_fenced, false) = true) as fenced,
      count(*) FILTER (WHERE COALESCE(is_fenced, false) = true AND job_embedding IS NOT NULL) as fenced_with_emb,
      count(*) FILTER (WHERE COALESCE(is_fenced, false) = false AND status = 'active' AND job_embedding IS NULL) as active_unfenced_no_emb
    FROM job
  `);
  const s = summary[0];
  console.log(`Total jobs: ${s.total}`);
  console.log(`With embedding: ${s.with_emb}`);
  console.log(`Without embedding: ${s.no_emb}`);
  console.log(`Fenced with embedding (should be 0): ${s.fenced_with_emb}`);
  console.log(`Active unfenced without embedding (should be 0): ${s.active_unfenced_no_emb}`);

  await client.end();
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
