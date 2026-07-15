/**
 * S1 Recall Audit — Check for false negatives in the pre-filter
 *
 * Samples 20 companies from the region-filtered set (436) and 20 from the
 * tech-filtered set (115) to check if genuine-global web-dev shops are being
 * dropped on frontmatter noise.
 *
 * False negatives would mean the pre-filter is too aggressive and we're
 * missing real candidates. If the false-negative rate is material, loosen
 * the parser before the full run.
 *
 * Usage: npx tsx scripts/s1-recall-audit.ts
 */
import {
  parseRemoteInTechRepo,
  type RemoteInTechCompany,
} from "@/lib/jobs/seeders/batch-sources/remoteintech";

// Web-dev tech tags (same as the pre-filter)
const WEBDEV_TECH_TAGS = new Set([
  "javascript",
  "typescript",
  "react",
  "nodejs",
  "php",
]);
const GLOBAL_REGIONS = new Set(["worldwide", "americas-europe"]);

async function main() {
  console.log("═".repeat(80));
  console.log("  S1 RECALL AUDIT — false-negative check on pre-filter");
  console.log("═".repeat(80));
  console.log();
  console.log("Parsing repo (this takes ~45s)...");
  console.log();

  // We need ALL companies, not just pre-filtered ones. Let's parse and
  // manually separate into the filter buckets.
  const parseResult = await parseRemoteInTechRepo();
  if (parseResult.error) {
    console.error("PARSE ERROR:", parseResult.error);
    process.exit(1);
  }

  // The parseRemoteInTechRepo only returns pre-filtered companies.
  // We need to re-parse to get ALL companies including filtered ones.
  // For the audit, let's fetch the file list and parse a sample manually.

  // Actually, let's use a different approach: fetch the raw file list and
  // parse frontmatter for a random sample of ALL files.
  const REPO_TREE_API =
    "https://api.github.com/repos/remoteintech/remote-jobs/contents/src/companies";
  const REPO_RAW_BASE =
    "https://raw.githubusercontent.com/remoteintech/remote-jobs/main/src/companies";

  console.log("Fetching full file list from GitHub...");
  const resp = await fetch(REPO_TREE_API, {
    headers: {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "VectorMatch-Audit/1.0",
    },
  });
  const files = (await resp.json()) as Array<{ name: string; type: string }>;
  const mdFiles = files
    .filter((f) => f.type === "file" && f.name.endsWith(".md"))
    .map((f) => f.name);
  console.log(`Found ${mdFiles.length} company files`);
  console.log();

  // Parse ALL files (we need the full set to find filtered ones)
  // Do it in batches
  const allCompanies: {
    name: string;
    region: string;
    technologies: string[];
    website: string;
    careersUrl: string | null;
    filename: string;
  }[] = [];
  const BATCH_SIZE = 20;
  for (let i = 0; i < mdFiles.length; i += BATCH_SIZE) {
    const batch = mdFiles.slice(i, i + BATCH_SIZE);
    const markdowns = await Promise.all(
      batch.map(async (f) => {
        try {
          const r = await fetch(`${REPO_RAW_BASE}/${f}`, {
            headers: { "User-Agent": "VectorMatch-Audit/1.0" },
          });
          return await r.text();
        } catch {
          return null;
        }
      }),
    );

    for (let j = 0; j < markdowns.length; j++) {
      const md = markdowns[j];
      if (!md) continue;

      // Simple frontmatter parse
      const fmMatch = md.match(/^---\n([\s\S]*?)\n---/);
      if (!fmMatch) continue;

      const yaml = fmMatch[1];
      const getVal = (key: string): string => {
        const m = yaml.match(new RegExp(`^${key}:\\s*(.*)$`, "m"));
        return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
      };
      const getArray = (key: string): string[] => {
        const items: string[] = [];
        const lines = yaml.split("\n");
        let inArray = false;
        for (const line of lines) {
          if (line.match(new RegExp(`^${key}:\\s*$`))) {
            inArray = true;
            continue;
          }
          if (inArray) {
            const m = line.match(/^\s+-\s+(.+)/);
            if (m) items.push(m[1].trim());
            else if (line.match(/^\S/)) inArray = false;
          }
        }
        return items;
      };

      allCompanies.push({
        name: getVal("title"),
        region: getVal("region"),
        technologies: getArray("technologies"),
        website: getVal("website"),
        careersUrl: getVal("careers_url") || null,
        filename: batch[j],
      });
    }

    if (i + BATCH_SIZE < mdFiles.length) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  console.log(`Parsed ${allCompanies.length} companies total`);
  console.log();

  // Separate into buckets
  const regionFiltered = allCompanies.filter(
    (c) =>
      !GLOBAL_REGIONS.has(c.region) &&
      c.technologies.some((t) => WEBDEV_TECH_TAGS.has(t)),
  );
  const techFiltered = allCompanies.filter(
    (c) =>
      GLOBAL_REGIONS.has(c.region) &&
      !c.technologies.some((t) => WEBDEV_TECH_TAGS.has(t)),
  );

  console.log(
    `Region-filtered (have web-dev tech, non-global region): ${regionFiltered.length}`,
  );
  console.log(
    `Tech-filtered (global region, no web-dev tech):          ${techFiltered.length}`,
  );
  console.log();

  // ── Sample 20 from region-filtered ─────────────────────────────────────────
  console.log("─".repeat(80));
  console.log("  SAMPLE: 20 REGION-FILTERED companies");
  console.log(
    "  (Have web-dev tech but non-global region — are any actually global?)",
  );
  console.log("─".repeat(80));
  console.log();

  // Deterministic sample: every Nth element
  const regionSample: (typeof regionFiltered)[] = [];
  const regionStep = Math.max(1, Math.floor(regionFiltered.length / 20));
  for (
    let i = 0;
    i < regionFiltered.length && regionSample.length < 20;
    i += regionStep
  ) {
    regionSample.push(regionFiltered[i]);
  }

  let regionFalseNegatives = 0;
  for (const c of regionSample) {
    // Heuristic: "americas" region with "fully-remote" policy might actually be global
    // Also check if the "Remote status" section mentions worldwide/global
    const looksGlobal = c.region === "americas" || c.region === "europe";
    const flag = looksGlobal ? "⚠ POSSIBLE FN" : "✓ correctly filtered";
    if (looksGlobal) regionFalseNegatives++;

    console.log(
      `  ${c.name.padEnd(30)} region=${c.region.padEnd(18)} tech=[${c.technologies.join(",")}] ${flag}`,
    );
  }
  console.log();
  console.log(
    `  Region false-negative rate (heuristic): ${regionFalseNegatives}/${regionSample.length} (${((regionFalseNegatives / regionSample.length) * 100).toFixed(0)}%)`,
  );
  console.log();

  // ── Sample 20 from tech-filtered ───────────────────────────────────────────
  console.log("─".repeat(80));
  console.log("  SAMPLE: 20 TECH-FILTERED companies");
  console.log(
    "  (Global region but no web-dev tech tags — are any actually web-dev?)",
  );
  console.log("─".repeat(80));
  console.log();

  const techSample: (typeof techFiltered)[] = [];
  const techStep = Math.max(1, Math.floor(techFiltered.length / 20));
  for (
    let i = 0;
    i < techFiltered.length && techSample.length < 20;
    i += techStep
  ) {
    techSample.push(techFiltered[i]);
  }

  let techFalseNegatives = 0;
  for (const c of techSample) {
    // Heuristic: companies with "python", "ruby", "go" might still hire web-dev
    // but without the tag, we can't know without probing. Flag those with
    // general-purpose languages that often co-occur with web-dev.
    const hasGeneralLang = c.technologies.some((t) =>
      ["python", "ruby", "go", "java", "rust"].includes(t),
    );
    const flag = hasGeneralLang
      ? "⚠ MIGHT HIRE WEB-DEV"
      : "✓ correctly filtered";
    if (hasGeneralLang) techFalseNegatives++;

    console.log(
      `  ${c.name.padEnd(30)} region=${c.region.padEnd(18)} tech=[${c.technologies.join(",")}] ${flag}`,
    );
  }
  console.log();
  console.log(
    `  Tech false-negative rate (heuristic): ${techFalseNegatives}/${techSample.length} (${((techFalseNegatives / techSample.length) * 100).toFixed(0)}%)`,
  );
  console.log();

  // ── Verdict ────────────────────────────────────────────────────────────────
  console.log("═".repeat(80));
  console.log("  RECALL AUDIT VERDICT");
  console.log("═".repeat(80));
  console.log();
  console.log(
    `  Region false-negative rate: ${((regionFalseNegatives / regionSample.length) * 100).toFixed(0)}%`,
  );
  console.log(
    `  Tech false-negative rate:   ${((techFalseNegatives / techSample.length) * 100).toFixed(0)}%`,
  );
  console.log();

  if (regionFalseNegatives > 5 || techFalseNegatives > 5) {
    console.log("  ⚠ MATERIAL false-negative rate detected.");
    console.log("    Consider loosening the pre-filter before the full run.");
    if (regionFalseNegatives > 5) {
      console.log(
        "    - Region: consider adding 'americas' or 'europe' to global set",
      );
    }
    if (techFalseNegatives > 5) {
      console.log(
        "    - Tech: consider probing companies with general-purpose languages",
      );
    }
  } else {
    console.log(
      "  ✓ False-negative rate is low. Pre-filter is not dropping material candidates.",
    );
  }
  console.log("═".repeat(80));
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
