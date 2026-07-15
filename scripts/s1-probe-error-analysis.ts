/**
 * S1 Probe Error Analysis — investigate the 236 "no jobs" companies
 *
 * The S1 full discovery showed 236/302 (78%) resolved companies returned
 * no jobs from the Fingerprint v2 probe. This script investigates:
 *   - Is it a SmartRecruiters API issue (228/302 resolved to SR)?
 *   - Are the slugs stale/wrong?
 *   - Are these companies genuinely not hiring?
 *
 * Samples 20 probe-error companies, fetches their ATS feed directly,
 * and reports the HTTP status + response body shape.
 *
 * Usage: npx tsx scripts/s1-probe-error-analysis.ts
 */
import { neon } from "@neondatabase/serverless";
import { getAtsEndpoint } from "@/lib/jobs/ats-endpoints";
import { parseRemoteInTechRepo } from "@/lib/jobs/seeders/batch-sources/remoteintech";
import {
  canonicalizeCompanyName,
  resolveSlugger,
} from "@/lib/jobs/seeders/slugger";

const sql = neon(process.env.DATABASE_URL!);

function extractDomain(website: string): string {
  try {
    const url = new URL(
      website.startsWith("http") ? website : `https://${website}`,
    );
    return url.hostname.replace(/^www\./, "");
  } catch {
    return website
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split("/")[0];
  }
}

async function main() {
  console.log("═".repeat(80));
  console.log(
    "  S1 PROBE ERROR ANALYSIS — investigating 236 'no jobs' companies",
  );
  console.log("═".repeat(80));
  console.log();

  // Re-run parse + dedup + slugger to get the resolved list
  console.log("Parsing repo...");
  const parseResult = await parseRemoteInTechRepo();
  if (parseResult.error) {
    console.error("PARSE ERROR:", parseResult.error);
    process.exit(1);
  }

  const existingCompanies = await sql`
    SELECT canonical_name, root_domain FROM company WHERE tier != 'dead'
  `;
  const existingByName = new Set<string>();
  const existingByDomain = new Set<string>();
  for (const c of existingCompanies) {
    if (c.canonical_name) existingByName.add(c.canonical_name.toLowerCase());
    if (c.root_domain) existingByDomain.add(c.root_domain.toLowerCase());
  }

  const netNew = parseResult.companies.filter((c) => {
    const canonicalName = canonicalizeCompanyName(c.name);
    const domain = extractDomain(c.website).toLowerCase();
    return !existingByName.has(canonicalName) && !existingByDomain.has(domain);
  });

  console.log(`Net-new: ${netNew.length}. Resolving via Slugger...`);
  console.log();

  // Resolve all and collect the SmartRecruiters ones
  interface ResolvedInfo {
    name: string;
    atsSource: string;
    atsSlug: string;
    website: string;
  }
  const resolved: ResolvedInfo[] = [];

  for (let i = 0; i < netNew.length; i++) {
    const company = netNew[i];
    try {
      const result = await resolveSlugger({
        companyName: company.name,
        website: extractDomain(company.website),
        discoverySource: "vc_portfolio",
        discoveryContext: `remoteintech:${company.slug}`,
      });
      if (result.success) {
        resolved.push({
          name: company.name,
          atsSource: result.atsSource,
          atsSlug: result.atsSlug,
          website: company.website,
        });
      }
    } catch {
      // skip
    }
    if ((i + 1) % 50 === 0) {
      console.log(
        `  Slugger progress: ${i + 1}/${netNew.length} (resolved: ${resolved.length})`,
      );
    }
  }

  // Count by ATS
  const byAts: Record<string, number> = {};
  for (const r of resolved) {
    byAts[r.atsSource] = (byAts[r.atsSource] ?? 0) + 1;
  }
  console.log();
  console.log("Resolved by ATS:");
  for (const [ats, count] of Object.entries(byAts).sort(
    (a, b) => b[1] - a[1],
  )) {
    console.log(`  ${ats.padEnd(20)} ${count}`);
  }
  console.log();

  // ── Sample 10 SmartRecruiters companies and probe their feeds directly ─────
  const srCompanies = resolved.filter((r) => r.atsSource === "smartrecruiters");
  console.log(
    `Sampling 10 SmartRecruiters companies out of ${srCompanies.length}...`,
  );
  console.log();

  const srSample = srCompanies.slice(0, 10);
  for (const company of srSample) {
    const endpoint = getAtsEndpoint("smartrecruiters");
    const url = endpoint.jobsList(company.atsSlug);

    console.log(`  ${company.name.padEnd(30)} slug=${company.atsSlug}`);
    console.log(`    URL: ${url}`);

    try {
      const resp = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "VectorMatch-Probe/1.0",
        },
        signal: AbortSignal.timeout(15000),
      });

      console.log(`    HTTP ${resp.status} ${resp.statusText}`);

      if (resp.ok) {
        const text = await resp.text();
        const data = JSON.parse(text);
        const jobCount = data.content?.length ?? data.jobs?.length ?? "unknown";
        console.log(`    Response: ${text.length} bytes, jobs=${jobCount}`);

        // Show first few job titles if available
        const titles =
          data.content?.slice(0, 3).map((j: { name?: string }) => j.name) ?? [];
        if (titles.length > 0) {
          console.log(`    Sample titles: ${titles.join(", ")}`);
        } else {
          console.log(
            `    No 'content' array found. Keys: ${Object.keys(data).join(", ")}`,
          );
        }
      } else {
        const text = await resp.text();
        console.log(`    Error body: ${text.slice(0, 200)}`);
      }
    } catch (err) {
      console.log(
        `    FETCH ERROR: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    console.log();

    await new Promise((r) => setTimeout(r, 500));
  }

  // ── Also sample 5 Greenhouse and 5 Ashby for comparison ────────────────────
  for (const ats of ["greenhouse", "ashby", "lever"] as const) {
    const atsCompanies = resolved.filter((r) => r.atsSource === ats);
    if (atsCompanies.length === 0) continue;

    console.log(`─`.repeat(80));
    console.log(
      `  Sampling 5 ${ats} companies out of ${atsCompanies.length}...`,
    );
    console.log(`─`.repeat(80));
    console.log();

    const sample = atsCompanies.slice(0, 5);
    for (const company of sample) {
      const endpoint = getAtsEndpoint(ats);
      const url = endpoint.jobsList(company.atsSlug);

      console.log(`  ${company.name.padEnd(30)} slug=${company.atsSlug}`);
      console.log(`    URL: ${url}`);

      try {
        const resp = await fetch(url, {
          headers: {
            Accept: "application/json",
            "User-Agent": "VectorMatch-Probe/1.0",
          },
          signal: AbortSignal.timeout(15000),
        });

        console.log(`    HTTP ${resp.status} ${resp.statusText}`);

        if (resp.ok) {
          const text = await resp.text();
          let jobCount = "unknown";
          try {
            const data = JSON.parse(text);
            if (ats === "greenhouse") jobCount = data.jobs?.length ?? "unknown";
            else if (ats === "ashby")
              jobCount = data.postedJobs?.length ?? "unknown";
            else if (ats === "lever")
              jobCount = data.postings?.length ?? "unknown";
          } catch {
            // not JSON
          }
          console.log(`    Response: ${text.length} bytes, jobs=${jobCount}`);
        } else {
          const text = await resp.text();
          console.log(`    Error body: ${text.slice(0, 200)}`);
        }
      } catch (err) {
        console.log(
          `    FETCH ERROR: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      console.log();

      await new Promise((r) => setTimeout(r, 500));
    }
  }

  console.log("═".repeat(80));
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
