import { config } from "dotenv";

config({ path: ".env" });

import { sql } from "drizzle-orm";
import { db } from "@/db/db";
import { account } from "@/db/schemas/auth/account";
import { applicant } from "@/db/schemas/jobs/applicant";
import { company } from "@/db/schemas/jobs/company";

async function main() {
  console.log("\n=== Gate 4 Step 0 premise audit ===\n");

  // 1. Schema columns for company and applicant
  const columns = await db.execute(sql`
    SELECT table_name, column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name IN ('company', 'applicant')
      AND table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `);
  console.log("--- company / applicant columns ---");
  console.table((columns as unknown as { rows: unknown[] }).rows);

  // 2. S2: company.github_org coverage (whole table)
  const [overall] = await db
    .select({
      total: sql<number>`count(*)`.mapWith(Number),
      withOrg:
        sql<number>`count(*) FILTER (WHERE ${company.githubOrg} IS NOT NULL)`.mapWith(
          Number,
        ),
    })
    .from(company);

  const overallPct = overall.total
    ? ((overall.withOrg / overall.total) * 100).toFixed(1)
    : "0.0";
  console.log(
    `\n--- S2: company.github_org coverage (all companies) ---\n` +
      `total: ${overall.total}\n` +
      `with_org: ${overall.withOrg}\n` +
      `pct: ${overallPct}%`,
  );

  // 3. S2: by active tiers
  const tierRows = await db
    .select({
      tier: company.tier,
      total: sql<number>`count(*)`.mapWith(Number),
      withOrg:
        sql<number>`count(*) FILTER (WHERE ${company.githubOrg} IS NOT NULL)`.mapWith(
          Number,
        ),
    })
    .from(company)
    .where(sql`${company.tier} IN ('active_hot', 'active')`)
    .groupBy(company.tier);

  console.log("\n--- S2: by tier (active_hot, active) ---");
  for (const row of tierRows) {
    const pct = row.total
      ? ((row.withOrg / row.total) * 100).toFixed(1)
      : "0.0";
    console.log(`  ${row.tier}: ${row.withOrg}/${row.total} = ${pct}%`);
  }

  // 4. S4: team-page starting URL proxy
  const [domainRow] = await db
    .select({
      withRootDomain:
        sql<number>`count(*) FILTER (WHERE ${company.rootDomain} IS NOT NULL)`.mapWith(
          Number,
        ),
      withCompanyName:
        sql<number>`count(*) FILTER (WHERE ${company.companyName} IS NOT NULL)`.mapWith(
          Number,
        ),
      withCanonicalName:
        sql<number>`count(*) FILTER (WHERE ${company.canonicalName} IS NOT NULL)`.mapWith(
          Number,
        ),
    })
    .from(company);

  console.log("\n--- S4: team-page source proxies (company table) ---");
  console.log(`  root_domain populated: ${domainRow.withRootDomain}`);
  console.log(`  company_name populated: ${domainRow.withCompanyName}`);
  console.log(`  canonical_name populated: ${domainRow.withCanonicalName}`);

  // 5. Better Auth GitHub wiring
  const providerRows = await db
    .select({
      providerId: account.providerId,
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(account)
    .groupBy(account.providerId);

  console.log("\n--- Better Auth account providers ---");
  for (const row of providerRows) {
    console.log(`  ${row.providerId}: ${row.count}`);
  }

  const [ghApplicantRow] = await db
    .select({
      linked:
        sql<number>`count(*) FILTER (WHERE ${applicant.githubHandle} IS NOT NULL)`.mapWith(
          Number,
        ),
      total: sql<number>`count(*)`.mapWith(Number),
    })
    .from(applicant);

  console.log("\n--- applicant.github_handle ---");
  console.log(`  linked: ${ghApplicantRow.linked} / ${ghApplicantRow.total}`);

  // 6. Heuristic candidate estimate (no API calls; upper bound on resolvability)
  const [heuristic] = await db
    .select({
      total: sql<number>`count(*)`.mapWith(Number),
      slugCandidate:
        sql<number>`count(*) FILTER (WHERE ats_slug ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$')`.mapWith(
          Number,
        ),
      apexCandidate:
        sql<number>`count(*) FILTER (WHERE split_part(regexp_replace(root_domain, '^www\\.', ''), '.', 1) ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$')`.mapWith(
          Number,
        ),
      nameCandidate:
        sql<number>`count(*) FILTER (WHERE canonical_name IS NOT NULL OR company_name IS NOT NULL)`.mapWith(
          Number,
        ),
    })
    .from(company);

  console.log("\n--- Heuristic GitHub-org candidate sources (upper bound) ---");
  console.log(`  total companies: ${heuristic.total}`);
  console.log(`  ats_slug pattern match: ${heuristic.slugCandidate}`);
  console.log(`  root_domain apex pattern match: ${heuristic.apexCandidate}`);
  console.log(
    `  has canonical_name or company_name: ${heuristic.nameCandidate}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
