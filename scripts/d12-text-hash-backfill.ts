// Directive 12 — Step 1.1: text_hash backfill
// scripts/d12-text-hash-backfill.ts
//
// Backfills text_hash for all existing jobs that have NULL text_hash.
// Computes SHA-256 of (company_name + normalized_title + location_name).

import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function computeContentHash(
  companyName: string | null,
  title: string | null,
  locationName: string | null,
): string {
  const company = normalize(companyName ?? "");
  const ttl = normalize(title ?? "");
  const loc = normalize(locationName ?? "");
  return createHash("sha256").update(`${company}|${ttl}|${loc}`).digest("hex");
}

async function main() {
  console.log("=== DIRECTIVE 12 — text_hash BACKFILL ===\n");

  // Count jobs needing backfill
  const needsBackfill = await sql`
    SELECT count(*) as cnt, ats_slug
    FROM job
    WHERE text_hash IS NULL
    GROUP BY ats_slug
    ORDER BY cnt DESC
    LIMIT 10
  `;
  const totalNeeds =
    await sql`SELECT count(*) as cnt FROM job WHERE text_hash IS NULL`;
  console.log(`Jobs needing backfill: ${totalNeeds[0].cnt}`);
  console.log(`Top slugs needing backfill:`);
  for (const r of needsBackfill) console.log(`  ${r.ats_slug}: ${r.cnt}`);
  console.log();

  // Fetch all jobs needing backfill with their metadata
  const jobs = await sql`
    SELECT j.id, j.title, j.location_name,
      c.company_name as company_name
    FROM job j
    LEFT JOIN company c ON j.ats_slug = c.ats_slug
    WHERE j.text_hash IS NULL
  `;
  console.log(`Fetched ${jobs.length} jobs for backfill`);

  let updated = 0;
  let errors = 0;
  const BATCH_SIZE = 100;

  for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
    const batch = jobs.slice(i, i + BATCH_SIZE);
    const updates = batch.map((j) => ({
      id: j.id,
      hash: computeContentHash(j.company_name, j.title, j.location_name),
    }));

    try {
      // Update one by one (Neon serverless doesn't support multi-row UPDATE easily)
      for (const u of updates) {
        await sql`UPDATE job SET text_hash = ${u.hash} WHERE id = ${u.id}::uuid`;
        updated++;
      }
      if (updated % 500 === 0 || updated === jobs.length) {
        console.log(`  Progress: ${updated}/${jobs.length}`);
      }
    } catch (e) {
      errors++;
      console.error(`  Error at batch ${i}:`, e);
    }
  }

  console.log(`\nBackfill complete: ${updated} updated, ${errors} errors`);

  // Verify
  const after = await sql`
    SELECT
      count(*) FILTER (WHERE text_hash IS NOT NULL) as with_hash,
      count(*) FILTER (WHERE text_hash IS NULL) as without_hash,
      count(*) as total
    FROM job
  `;
  console.log(`\nVerification:`);
  console.log(`  With text_hash: ${after[0].with_hash}`);
  console.log(`  Without text_hash: ${after[0].without_hash}`);
  console.log(`  Total: ${after[0].total}`);

  // Check for duplicates
  const dupes = await sql`
    SELECT text_hash, count(*) as cnt,
      array_agg(ats_slug) as slugs,
      array_agg(title) as titles,
      array_agg(id) as ids
    FROM job
    WHERE text_hash IS NOT NULL
    GROUP BY text_hash
    HAVING count(*) > 1
    ORDER BY cnt DESC
  `;
  console.log(`\nDuplicate groups (same text_hash): ${dupes.length}`);
  for (const d of dupes) {
    console.log(`  hash=${d.text_hash.slice(0, 16)}... count=${d.cnt}`);
    console.log(`    slugs: ${JSON.stringify(d.slugs)}`);
    console.log(
      `    titles: ${JSON.stringify(d.titles?.map((t: string) => t?.slice(0, 60)))}`,
    );
    console.log(
      `    ids: ${JSON.stringify(d.ids?.map((id: string) => id?.slice(0, 8)))}`,
    );
  }

  console.log("\n=== DONE ===");
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
