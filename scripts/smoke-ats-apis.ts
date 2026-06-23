#!/usr/bin/env tsx
// ATS API Smoke Test — Layer 1 of Module B Live Testing
// scripts/smoke-ats-apis.ts
//
// Verifies that the Zod schemas in src/lib/jobs/ats-schemas.ts still match the
// real ATS API responses. APIs change without notice — this script catches
// schema drift before it breaks the poller in production.
//
// No database required. Uses the real global fetch against the public ATS APIs.
//
// Usage:
//   npx tsx scripts/smoke-ats-apis.ts
//
// Exit codes:
//   0 — all slugs passed (404s are OK — they mean the slug is inactive, not
//       that the schema is broken)
//   1 — at least one slug failed Zod validation (schema mismatch = API changed)
//
// See: docs/vectormatch-blueprint.md → "Module B Testing Strategy" → Layer 1

import type { AtsSource } from "@/lib/jobs/ats-endpoints";
import { fetchJobsFromAts } from "@/lib/jobs/poller/ats-adapters";
import { passesGateZero } from "@/lib/jobs/gate-zero";

// ── Test slugs ────────────────────────────────────────────────────────────────
//
// These are known-active ATS slugs. If a slug returns 404, that's fine — the
// company may have closed their job board. We only fail on Zod validation
// errors, which indicate the API response shape changed.

const TEST_SLUGS: Record<AtsSource, string[]> = {
  greenhouse: ["airbnb", "stripe", "coinbase", "notion", "figma"],
  lever: ["notion", "ramp", "merge", "arc", "tonic"],
  ashby: ["mercury", "retool", "vercel", "linear", "exa"],
};

// ── Result tracking ───────────────────────────────────────────────────────────

interface SlugResult {
  source: AtsSource;
  slug: string;
  success: boolean;
  jobCount: number;
  firstTitles: string[];
  gate0PassCount: number;
  error?: string;
  kind?: "validation" | "http" | "network";
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("=".repeat(70));
  console.log("ATS API Smoke Test — VectorMatch Module B (Layer 1)");
  console.log("=".repeat(70));
  console.log();
  console.log("Testing Zod schemas against real ATS API responses.");
  console.log("404s are OK (inactive slug). Validation errors are NOT OK.");
  console.log();

  const results: SlugResult[] = [];
  const sources: AtsSource[] = ["greenhouse", "lever", "ashby"];

  for (const source of sources) {
    console.log(`─ ${source.toUpperCase()} ${"─".repeat(Math.max(0, 60 - source.length))}`);
    for (const slug of TEST_SLUGS[source]) {
      process.stdout.write(`  ${slug.padEnd(20)} ... `);
      const result = await testSlug(source, slug);
      results.push(result);

      if (result.success) {
        console.log(
          `OK (${result.jobCount} jobs, ${result.gate0PassCount} pass Gate 0)`,
        );
        if (result.firstTitles.length > 0) {
          for (const title of result.firstTitles) {
            console.log(`    └ ${title}`);
          }
        }
      } else if (result.kind === "validation") {
        console.log("VALIDATION ERROR");
        console.log(`    └ ${result.error}`);
      } else if (result.kind === "http") {
        console.log(`HTTP error (${result.error})`);
      } else {
        console.log(`network error (${result.error})`);
      }
    }
    console.log();
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log("=".repeat(70));
  console.log("Summary");
  console.log("=".repeat(70));

  const total = results.length;
  const passed = results.filter((r) => r.success).length;
  const httpErrors = results.filter((r) => r.kind === "http").length;
  const networkErrors = results.filter((r) => r.kind === "network").length;
  const validationErrors = results.filter((r) => r.kind === "validation").length;
  const totalJobs = results.reduce((sum, r) => sum + r.jobCount, 0);
  const totalGate0Pass = results.reduce((sum, r) => sum + r.gate0PassCount, 0);

  console.log(`  Slugs tested:          ${total}`);
  console.log(`  Successful fetches:    ${passed}`);
  console.log(`  HTTP errors (404 etc): ${httpErrors}`);
  console.log(`  Network errors:        ${networkErrors}`);
  console.log(`  Validation errors:     ${validationErrors}`);
  console.log(`  Total jobs fetched:    ${totalJobs}`);
  console.log(`  Jobs passing Gate 0:   ${totalGate0Pass}`);
  console.log();

  if (validationErrors > 0) {
    console.log("FAILED — Zod schema mismatch detected. The ATS API changed.");
    console.log();
    console.log("Validation errors:");
    for (const r of results.filter((r) => r.kind === "validation")) {
      console.log(`  [${r.source}/${r.slug}]`);
      console.log(`    ${r.error}`);
    }
    process.exit(1);
  }

  console.log("PASSED — all Zod schemas match current ATS API responses.");
  process.exit(0);
}

async function testSlug(source: AtsSource, slug: string): Promise<SlugResult> {
  try {
    const result = await fetchJobsFromAts(source, slug, fetch);

    if (!result.success) {
      return {
        source,
        slug,
        success: false,
        jobCount: 0,
        firstTitles: [],
        gate0PassCount: 0,
        error: result.error,
        kind: result.kind,
      };
    }

    const firstTitles = result.jobs.slice(0, 3).map((j) => j.title);
    const gate0PassCount = result.jobs.filter((j) =>
      passesGateZero(j.title),
    ).length;

    return {
      source,
      slug,
      success: true,
      jobCount: result.jobs.length,
      firstTitles,
      gate0PassCount,
    };
  } catch (error) {
    return {
      source,
      slug,
      success: false,
      jobCount: 0,
      firstTitles: [],
      gate0PassCount: 0,
      error: error instanceof Error ? error.message : String(error),
      kind: "network",
    };
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
