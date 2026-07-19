// Directive 13 — B3.1: Live-defect check on the && array-overlap operator
// scripts/d13-ampersand-defect-check.ts

import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

// JS family tags as a JS array (matching the production constant)
const JS_FAMILY = [
  "javascript",
  "typescript",
  "react",
  "nextjs",
  "vue",
  "nuxt",
  "svelte",
  "sveltekit",
  "angular",
  "ember",
  "jquery",
  "nodejs",
  "express",
  "nestjs",
  "fastify",
  "remix",
  "gatsby",
  "astro",
  "solidjs",
  "qwik",
  "lit",
  "preact",
  "react-native",
  "expo",
  "trpc",
  "tailwindcss",
  "shadcn",
  "radix",
  "webpack",
  "vite",
  "esbuild",
  "rollup",
  "babel",
  "swc",
  "turbopack",
  "jest",
  "vitest",
  "playwright",
  "cypress",
  "storybook",
  "testing-library",
  "react-query",
  "tanstack-query",
  "react-hook-form",
  "formik",
  "zod",
  "yup",
  "redux",
  "mobx",
  "recoil",
  "jotai",
  "zustand",
  "xstate",
  "graphql",
  "apollo",
  "urql",
  "relay",
  "prisma",
  "drizzle",
  "kysely",
  "sequelize",
  "typeorm",
  "mongoose",
  "typegoose",
  "socket.io",
  "ws",
  "graphql-ws",
  "stripe",
  "twilio",
  "sendgrid",
  "postmark",
  "resend",
  "aws-sdk",
];

const PHP_FAMILY = [
  "php",
  "laravel",
  "symfony",
  "wordpress",
  "drupal",
  "magento",
  "composer",
  "psr",
  "doctrine",
  "twig",
  "blade",
  "artisan",
  "eloquent",
  "livewire",
  "inertia",
  "pest",
  "phpunit",
];
const RUBY_FAMILY = [
  "ruby",
  "rails",
  "sinatra",
  "hanami",
  "rack",
  "rspec",
  "capybara",
  "sidekiq",
  "puma",
  "bundler",
  "activerecord",
  "activesupport",
];
const JAVA_FAMILY = [
  "java",
  "spring",
  "spring-boot",
  "spring-boot-starter",
  "hibernate",
  "maven",
  "gradle",
  "kotlin",
  "scala",
  "groovy",
  "clojure",
  "jvm",
  "jpa",
  "jakarta",
  "tomcat",
  "jetty",
  "netty",
];
const DOTNET_FAMILY = [
  "csharp",
  "dotnet",
  "aspnet",
  "aspnet-core",
  "entity-framework",
  "ef-core",
  "linq",
  "xunit",
  "nunit",
  "moq",
  "signalr",
  "blazor",
  "razor",
  "fsharp",
  "vbnet",
];
const PYTHON_FAMILY = [
  "python",
  "django",
  "flask",
  "fastapi",
  "tornado",
  "aiohttp",
  "asyncio",
  "celery",
  "pytest",
  "unittest",
  "pandas",
  "numpy",
  "scipy",
  "scikit-learn",
  "tensorflow",
  "pytorch",
  "keras",
  "jupyter",
  "streamlit",
  "gradio",
  "langchain",
  "llamaindex",
];
const GO_FAMILY = [
  "go",
  "golang",
  "gin",
  "echo",
  "fiber",
  "gorm",
  "chi",
  "cobra",
  "viper",
  "buf",
  "grpc-go",
];
const RUST_FAMILY = [
  "rust",
  "cargo",
  "tokio",
  "actix",
  "axum",
  "rocket",
  "serde",
  "warp",
  "tide",
  "diesel",
  "sqlx",
];
const CPP_FAMILY = [
  "cpp",
  "cplusplus",
  "c",
  "qt",
  "boost",
  "stl",
  "cmake",
  "opencv",
  "cuda",
  "opencl",
  "mpi",
  "protobuf-c",
];

const ALL_FAMILIES: Record<string, string[]> = {
  js: JS_FAMILY,
  php: PHP_FAMILY,
  ruby: RUBY_FAMILY,
  java: JAVA_FAMILY,
  dotnet: DOTNET_FAMILY,
  python: PYTHON_FAMILY,
  go: GO_FAMILY,
  rust: RUST_FAMILY,
  cpp: CPP_FAMILY,
};

async function main() {
  console.log("=== B3.1: && ARRAY-OVERLAP LIVE-DEFECT CHECK ===\n");

  // ── TEST 1: Verify && operator works at all on text[] in Neon ──
  console.log("── TEST 1: Basic && operator sanity check ──");
  const sanity = await sql`
    SELECT
      ARRAY['react','typescript']::text[] && ARRAY['react','nodejs']::text[] as js_overlap,
      ARRAY['react','typescript']::text[] && ARRAY['python','django']::text[] as no_overlap,
      ARRAY['react']::text[] && ARRAY['React']::text[] as case_sensitive,
      ARRAY['react']::text[] && ARRAY['REACT']::text[] as case_upper
  `;
  console.log(
    `  react/typescript && react/nodejs = ${sanity[0].js_overlap} (expected true)`,
  );
  console.log(
    `  react/typescript && python/django = ${sanity[0].no_overlap} (expected false)`,
  );
  console.log(
    `  react && React (case test) = ${sanity[0].case_sensitive} (CASE-SENSITIVE!)`,
  );
  console.log(
    `  react && REACT (upper test) = ${sanity[0].case_upper} (CASE-SENSITIVE!)`,
  );

  // ── TEST 2: Check all active global embedded jobs for false disjoint ──
  console.log(
    "\n── TEST 2: Jobs with JS-family tags — does && detect them? ──",
  );

  const jobsWithTags = await sql`
    SELECT id, title, ats_slug, extracted_tags, normalized_text
    FROM job
    WHERE status = 'active'
      AND job_embedding IS NOT NULL
      AND remote_scope = 'global'
      AND array_length(extracted_tags, 1) > 0
    LIMIT 200
  `;
  console.log(
    `  Found ${jobsWithTags.length} active global embedded jobs with tags`,
  );

  let falseDisjointCount = 0;
  let trueNonDisjointCount = 0;
  let noFamilyOverlapCount = 0;
  const falseDisjointJobs: Array<{
    id: string;
    title: string;
    slug: string;
    tags: string[];
  }> = [];

  for (const job of jobsWithTags) {
    const tags = job.extracted_tags as string[];
    if (!tags || tags.length === 0) continue;

    // Check JS family overlap using the Neon driver with JS array params
    const result = await sql`
      SELECT
        ${tags}::text[] && ${JS_FAMILY}::text[] as js,
        ${tags}::text[] && ${PHP_FAMILY}::text[] as php,
        ${tags}::text[] && ${RUBY_FAMILY}::text[] as ruby,
        ${tags}::text[] && ${JAVA_FAMILY}::text[] as java,
        ${tags}::text[] && ${DOTNET_FAMILY}::text[] as dotnet,
        ${tags}::text[] && ${PYTHON_FAMILY}::text[] as python,
        ${tags}::text[] && ${GO_FAMILY}::text[] as go,
        ${tags}::text[] && ${RUST_FAMILY}::text[] as rust,
        ${tags}::text[] && ${CPP_FAMILY}::text[] as cpp
    `;

    const overlappingFamilies = Object.keys(ALL_FAMILIES).filter(
      (f) => result[0][f],
    );

    // Check: does the job title or text mention react/frontend/web?
    const text =
      `${job.title ?? ""} ${(job.normalized_text ?? "").slice(0, 500)}`.toLowerCase();
    const looksLikeJsJob =
      /react|nextjs|next\.js|typescript|javascript|frontend|full.?stack|node\.?js|vue|angular|svelte/.test(
        text,
      );

    // A false disjoint = job looks like a JS job by text, but && says NO JS family overlap
    if (looksLikeJsJob && !result[0].js) {
      falseDisjointCount++;
      falseDisjointJobs.push({
        id: job.id,
        title: job.title?.slice(0, 60) ?? "",
        slug: job.ats_slug,
        tags,
      });
    } else if (overlappingFamilies.length === 0) {
      noFamilyOverlapCount++;
    } else {
      trueNonDisjointCount++;
    }
  }

  console.log(`\n  Results across ${jobsWithTags.length} jobs:`);
  console.log(
    `  True non-disjoint (has family overlap): ${trueNonDisjointCount}`,
  );
  console.log(
    `  No family overlap (no text signal either): ${noFamilyOverlapCount}`,
  );
  console.log(
    `  FALSE DISJOINT (looks like JS job but && says no JS overlap): ${falseDisjointCount}`,
  );

  if (falseDisjointJobs.length > 0) {
    console.log(
      "\n  FALSE DISJOINT JOBS (real matches potentially being destroyed):",
    );
    for (const j of falseDisjointJobs.slice(0, 20)) {
      console.log(`    ${j.slug} — "${j.title}"`);
      console.log(`      tags: [${j.tags.join(", ")}]`);
      const jsTags = j.tags.filter((t) => JS_FAMILY.includes(t));
      if (jsTags.length > 0) {
        console.log(
          `      JS-family tags that SHOULD match: [${jsTags.join(", ")}]`,
        );
        console.log(
          `      *** BUG CONFIRMED: tag(s) present but && returned false ***`,
        );
      } else {
        console.log(
          `      No JS-family tags in extracted_tags — tag extraction may be the issue`,
        );
      }
    }
  }

  // ── TEST 3: Check for case-sensitivity issues in actual job tags ──
  console.log("\n── TEST 3: Case-sensitivity audit on job tags ──");
  const caseIssues = await sql`
    SELECT tag, count(*) as job_count
    FROM (
      SELECT unnest(extracted_tags) as tag
      FROM job
      WHERE status = 'active' AND array_length(extracted_tags, 1) > 0
    ) t
    WHERE tag != lower(tag)
       OR tag ~ '[A-Z]'
    GROUP BY tag
    ORDER BY job_count DESC
    LIMIT 30
  `;
  if (caseIssues.length > 0) {
    console.log("  Tags with uppercase characters (case-sensitivity risk):");
    for (const r of caseIssues) {
      console.log(`    "${r.tag}" — ${r.job_count} jobs`);
    }
  } else {
    console.log("  No uppercase tags found — all tags are lowercase.");
  }

  // ── TEST 4: Check the specific Ubiminds jobs from the D12 audit ──
  console.log("\n── TEST 4: Ubiminds jobs from D12 audit ──");
  const ubiminds = await sql`
    SELECT id, title, extracted_tags, normalized_text
    FROM job
    WHERE ats_slug ILIKE '%ubiminds%'
      AND status = 'active'
    LIMIT 10
  `;
  for (const job of ubiminds) {
    const tags = job.extracted_tags as string[];
    console.log(`  ${job.title?.slice(0, 60)}`);
    console.log(`    tags: [${tags?.join(", ")}]`);
    if (tags && tags.length > 0) {
      const overlap = await sql`
        SELECT
          ${tags}::text[] && ${JS_FAMILY}::text[] as js_overlap,
          ${tags}::text[] && ${PHP_FAMILY}::text[] as php_overlap
      `;
      console.log(
        `    && JS family: ${overlap[0].js_overlap}, && PHP family: ${overlap[0].php_overlap}`,
      );
      const jsTags = tags.filter((t) => JS_FAMILY.includes(t));
      if (jsTags.length > 0) {
        console.log(`    JS-family tags in job: [${jsTags.join(", ")}]`);
        if (!overlap[0].js_overlap) {
          console.log(
            `    *** BUG: JS tags present but && returned false! ***`,
          );
        }
      }
    }
    console.log();
  }

  // ── TEST 5: Run the FULL production gate-1-2 stack-disjoint simulation ──
  console.log("── TEST 5: Full production stack-disjoint simulation ──");
  const sampleJob = await sql`
    SELECT id, title, ats_slug, extracted_tags
    FROM job
    WHERE status = 'active'
      AND job_embedding IS NOT NULL
      AND remote_scope = 'global'
      AND 'react' = ANY(extracted_tags)
    LIMIT 1
  `;
  if (sampleJob.length > 0) {
    const job = sampleJob[0];
    const tags = job.extracted_tags as string[];
    console.log(`  Sample job: ${job.ats_slug} — "${job.title?.slice(0, 50)}"`);
    console.log(`  Tags: [${tags.join(", ")}]`);

    // Simulate a JS persona
    const personaTags = ["react", "typescript", "nextjs"];
    const disjointCheck = await sql`
      SELECT
        ${tags}::text[] && ${JS_FAMILY}::text[] as job_has_js,
        NOT (${tags}::text[] && ${JS_FAMILY}::text[]) as job_missing_js,
        ${personaTags}::text[] && ${JS_FAMILY}::text[] as persona_has_js,
        (${personaTags}::text[] && ${JS_FAMILY}::text[] AND NOT (${tags}::text[] && ${JS_FAMILY}::text[])) as would_be_disjoint
    `;
    console.log(`  Job has JS tags (&&): ${disjointCheck[0].job_has_js}`);
    console.log(
      `  Job missing JS tags (NOT &&): ${disjointCheck[0].job_missing_js}`,
    );
    console.log(
      `  Persona has JS tags (&&): ${disjointCheck[0].persona_has_js}`,
    );
    console.log(
      `  Would be disjoint (rejected): ${disjointCheck[0].would_be_disjoint}`,
    );
    if (disjointCheck[0].would_be_disjoint && disjointCheck[0].job_has_js) {
      console.log(
        `  *** CRITICAL BUG: Job has JS tags but disjoint clause would reject it! ***`,
      );
    } else if (!disjointCheck[0].would_be_disjoint) {
      console.log(
        `  ✓ Correct: job with JS tags would NOT be rejected by stack-disjoint clause`,
      );
    }
  } else {
    console.log("  No active global embedded job with 'react' tag found");
  }

  // ── TEST 6: Check how the PRODUCTION gate-1-2.ts constructs the query ──
  // The production code uses sql.raw() with string interpolation, NOT parameterized queries.
  // Let's verify that the raw SQL approach also works correctly.
  console.log("\n── TEST 6: Production-style raw SQL approach ──");
  const testTags = ["react", "typescript", "tailwindcss"];
  const tagsArraySql = `ARRAY[${testTags.map((t) => `'${t.replace(/'/g, "''")}'`).join(",")}]::text[]`;
  const stackFamilyJs = `ARRAY['javascript','typescript','react','nextjs','vue','nodejs','express','nestjs','trpc','tailwindcss','graphql','prisma','drizzle']::text[]`;

  // This is how the production code does it — via sql.raw()
  const rawResult = await sql.query(
    `SELECT ${tagsArraySql} && ${stackFamilyJs} as raw_overlap`,
  );
  console.log(
    `  Raw SQL approach: ${tagsArraySql} && JS family = ${rawResult[0].raw_overlap}`,
  );

  // And this is the parameterized approach (what we use above)
  const paramResult = await sql`
    SELECT ${testTags}::text[] && ${["javascript", "typescript", "react", "nextjs", "vue", "nodejs", "express", "nestjs", "trpc", "tailwindcss", "graphql", "prisma", "drizzle"]}::text[] as param_overlap
  `;
  console.log(
    `  Parameterized approach: same tags && JS family = ${paramResult[0].param_overlap}`,
  );

  if (rawResult[0].raw_overlap !== paramResult[0].param_overlap) {
    console.log(
      `  *** MISMATCH: raw and parameterized approaches give different results! ***`,
    );
  } else {
    console.log(`  ✓ Both approaches agree`);
  }

  console.log("\n=== DONE ===");
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
