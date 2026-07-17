// Directive 12 — Step 4.2: slugger_retry cleanup
// scripts/d12-slugger-cleanup.ts

import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  console.log("=== SLUGGER_RETRY CLEANUP (Directive 12, Step 4.2) ===\n");

  // 1. Count garbage rows
  const garbage = await sql`
    SELECT count(*) as cnt FROM slugger_retry
    WHERE company_name !~ '^[A-Za-z0-9 .,&''-]{3,}$'
       OR company_name ~ '(http|www\.|\.com/|async|await|=>)'
  `;
  console.log(`Garbage rows to purge: ${garbage[0].cnt}`);

  // 2. Sample what would be deleted
  const sample = await sql`
    SELECT company_name, discovery_source FROM slugger_retry
    WHERE company_name !~ '^[A-Za-z0-9 .,&''-]{3,}$'
       OR company_name ~ '(http|www\.|\.com/|async|await|=>)'
    LIMIT 20
  `;
  console.log("Sample garbage:");
  for (const r of sample)
    console.log(`  "${r.company_name?.slice(0, 50)}" (${r.discovery_source})`);

  // 3. Count what would remain
  const remaining = await sql`
    SELECT count(*) as cnt FROM slugger_retry
    WHERE company_name ~ '^[A-Za-z0-9 .,&''-]{3,}$'
      AND company_name !~ '(http|www\.|\.com/|async|await|=>)'
  `;
  console.log(`\nRows remaining after purge: ${remaining[0].cnt}`);

  // 4. Count duplicates among remaining (by company_name + discovery_source)
  const dups = await sql`
    SELECT company_name, discovery_source, count(*) as cnt
    FROM slugger_retry
    WHERE company_name ~ '^[A-Za-z0-9 .,&''-]{3,}$'
      AND company_name !~ '(http|www\.|\.com/|async|await|=>)'
    GROUP BY company_name, discovery_source
    HAVING count(*) > 1
    ORDER BY cnt DESC
    LIMIT 10
  `;
  console.log(`\nDuplicate groups (same name + source): ${dups.length}`);
  for (const d of dups.slice(0, 5))
    console.log(
      `  "${d.company_name?.slice(0, 40)}" (${d.discovery_source}): ${d.cnt} copies`,
    );

  // 5. PURGE garbage rows
  console.log("\n── Purging garbage rows ──");
  const purged = await sql`
    DELETE FROM slugger_retry
    WHERE company_name !~ '^[A-Za-z0-9 .,&''-]{3,}$'
       OR company_name ~ '(http|www\.|\.com/|async|await|=>)'
    RETURNING id
  `;
  console.log(`Purged ${purged.length} garbage rows`);

  // 6. Deduplicate remaining rows (keep oldest)
  console.log("\n── Deduplicating remaining rows ──");
  const deduped = await sql`
    DELETE FROM slugger_retry sr
    USING slugger_retry sr2
    WHERE sr.company_name = sr2.company_name
      AND sr.discovery_source = sr2.discovery_source
      AND sr.created_at > sr2.created_at
    RETURNING sr.id
  `;
  console.log(`Deduplicated ${deduped.length} duplicate rows`);

  // 7. Verify final state
  const final = await sql`
    SELECT count(*) as total,
           count(DISTINCT company_name) as unique_names,
           count(DISTINCT discovery_source) as sources
    FROM slugger_retry
  `;
  console.log(
    `\nFinal state: ${final[0].total} rows, ${final[0].unique_names} unique companies, ${final[0].sources} sources`,
  );

  const bySource = await sql`
    SELECT discovery_source, count(*) as cnt
    FROM slugger_retry
    GROUP BY discovery_source
    ORDER BY cnt DESC
  `;
  console.log("By source:");
  for (const r of bySource) console.log(`  ${r.discovery_source}: ${r.cnt}`);

  console.log("\n=== DONE ===");
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
