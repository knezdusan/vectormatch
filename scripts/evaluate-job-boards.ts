#!/usr/bin/env npx tsx
/**
 * Job Board Evaluation Script (WI3 Step 1)
 *
 * Calls each of the 6 Phase 1 job board APIs, counts total jobs, counts
 * frontend/PHP/Laravel jobs, and reports the actual numbers. Run this before
 * implementing ingestion to verify the APIs are live and the estimates hold.
 *
 * Usage:
 *   npx tsx scripts/evaluate-job-boards.ts
 *
 * Boards evaluated:
 *   1. Himalayas       — GET https://himalayas.app/jobs/api?limit=20&offset=0
 *   2. RemoteOK        — GET https://remoteok.com/api
 *   3. NoFluffJobs     — GET https://nofluffjobs.com/api/posting
 *   4. Arbeitnow       — GET https://www.arbeitnow.com/api/job-board-api?page=1
 *   5. Remotive        — GET https://remotive.com/api/remote-jobs?limit=100
 *   6. WeWorkRemotely  — GET https://weworkremotely.com/remote-jobs.rss
 *
 * The tech-stack overlap filter matches: React, Next.js, NextJS, TypeScript,
 * TS, JavaScript, JS, Vue, PHP, Laravel, Node.js, NodeJS, CSS, HTML, frontend,
 * front-end, front end.
 */

// Tech stack keywords for the applicant's personas (React/Next/TS/JS/Vue/PHP/Laravel)
const FRONTEND_TECH_KEYWORDS = [
  "react",
  "next.js",
  "nextjs",
  "next js",
  "typescript",
  " ts",
  "javascript",
  " js",
  "vue",
  "php",
  "laravel",
  "node.js",
  "nodejs",
  "node js",
  "css",
  "html",
  "frontend",
  "front-end",
  "front end",
];

function hasFrontendTech(
  tags: string[],
  title: string,
  description: string,
): boolean {
  const haystack = [...tags, title, description].join(" ").toLowerCase();
  return FRONTEND_TECH_KEYWORDS.some((kw) => haystack.includes(kw));
}

interface BoardResult {
  board: string;
  status: "ok" | "error";
  httpStatus: number;
  totalJobs: number;
  frontendJobs: number;
  remoteFrontendJobs: number;
  sampleTitle: string | null;
  error: string | null;
  responseTimeMs: number;
}

async function evaluateHimalayas(): Promise<BoardResult> {
  const start = Date.now();
  try {
    // Himalayas paginated API — fetch first page to get totalCount
    const response = await fetch(
      "https://himalayas.app/jobs/api?limit=20&offset=0",
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(30000),
      },
    );

    if (!response.ok) {
      return {
        board: "Himalayas",
        status: "error",
        httpStatus: response.status,
        totalJobs: 0,
        frontendJobs: 0,
        remoteFrontendJobs: 0,
        sampleTitle: null,
        error: `HTTP ${response.status} ${response.statusText}`,
        responseTimeMs: Date.now() - start,
      };
    }

    const data = (await response.json()) as {
      totalCount?: number;
      jobs?: Array<{
        title?: string;
        companyName?: string;
        excerpt?: string;
        tags?: string[];
      }>;
    };

    const totalJobs = data.totalCount ?? 0;
    const jobs = data.jobs ?? [];
    const frontendJobs = jobs.filter((j) =>
      hasFrontendTech(j.tags ?? [], j.title ?? "", j.excerpt ?? ""),
    ).length;
    const sampleTitle = jobs[0]?.title ?? null;

    return {
      board: "Himalayas",
      status: "ok",
      httpStatus: 200,
      totalJobs,
      frontendJobs,
      // Himalayas is remote-first, so all frontend jobs are remote frontend.
      remoteFrontendJobs: frontendJobs,
      sampleTitle,
      error: null,
      responseTimeMs: Date.now() - start,
    };
  } catch (e) {
    return {
      board: "Himalayas",
      status: "error",
      httpStatus: 0,
      totalJobs: 0,
      frontendJobs: 0,
      remoteFrontendJobs: 0,
      sampleTitle: null,
      error: e instanceof Error ? e.message : String(e),
      responseTimeMs: Date.now() - start,
    };
  }
}

async function evaluateRemoteOK(): Promise<BoardResult> {
  const start = Date.now();
  try {
    const response = await fetch("https://remoteok.com/api", {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      return {
        board: "RemoteOK",
        status: "error",
        httpStatus: response.status,
        totalJobs: 0,
        frontendJobs: 0,
        remoteFrontendJobs: 0,
        sampleTitle: null,
        error: `HTTP ${response.status} ${response.statusText}`,
        responseTimeMs: Date.now() - start,
      };
    }

    const data = (await response.json()) as Array<{
      legal?: string; // First element is a legal notice, not a job
      position?: string;
      company?: string;
      tags?: string[];
      description?: string;
    }>;

    // First element is a legal notice (has `legal` field, no `position`)
    const jobs = data.filter((item) => item.position !== undefined);
    const totalJobs = jobs.length;
    const frontendJobs = jobs.filter((j) =>
      hasFrontendTech(j.tags ?? [], j.position ?? "", j.description ?? ""),
    ).length;
    const sampleTitle = jobs[0]?.position ?? null;

    return {
      board: "RemoteOK",
      status: "ok",
      httpStatus: 200,
      totalJobs,
      frontendJobs,
      // RemoteOK is remote-first, so all frontend jobs are remote frontend.
      remoteFrontendJobs: frontendJobs,
      sampleTitle,
      error: null,
      responseTimeMs: Date.now() - start,
    };
  } catch (e) {
    return {
      board: "RemoteOK",
      status: "error",
      httpStatus: 0,
      totalJobs: 0,
      frontendJobs: 0,
      remoteFrontendJobs: 0,
      sampleTitle: null,
      error: e instanceof Error ? e.message : String(e),
      responseTimeMs: Date.now() - start,
    };
  }
}

async function evaluateNoFluffJobs(): Promise<BoardResult> {
  const start = Date.now();
  try {
    // NoFluffJobs returns ALL jobs in a single GET response (~11K, ~80 MB).
    // Use a generous timeout for the large payload.
    const response = await fetch("https://nofluffjobs.com/api/posting", {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(90000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return {
        board: "NoFluffJobs",
        status: "error",
        httpStatus: response.status,
        totalJobs: 0,
        frontendJobs: 0,
        remoteFrontendJobs: 0,
        sampleTitle: null,
        error: `HTTP ${response.status}: ${body.slice(0, 200)}`,
        responseTimeMs: Date.now() - start,
      };
    }

    const data = (await response.json()) as {
      totalCount?: number;
      postings?: Array<{
        title?: string;
        technology?: string;
        category?: string;
        fullyRemote?: boolean; // Top-level — UNRELIABLE (always false)
        location?: { fullyRemote?: boolean };
        tiles?: { values?: Array<{ value: string; type: string }> };
      }>;
    };

    const postings = data.postings ?? [];
    const totalJobs = data.totalCount ?? postings.length;
    // Tech tags = technology + requirement-type tiles, lowercased
    const frontendJobs = postings.filter((p) => {
      const tags = [
        p.technology?.toLowerCase() ?? "",
        ...(p.tiles?.values ?? [])
          .filter((v) => v.type === "requirement")
          .map((v) => v.value.toLowerCase()),
      ];
      return hasFrontendTech(tags, p.title ?? "", p.category ?? "");
    }).length;
    // Remote frontend = fullyRemote (via location.fullyRemote) AND frontend
    const remoteFrontendJobs = postings.filter((p) => {
      if (!p.location?.fullyRemote) return false;
      const tags = [
        p.technology?.toLowerCase() ?? "",
        ...(p.tiles?.values ?? [])
          .filter((v) => v.type === "requirement")
          .map((v) => v.value.toLowerCase()),
      ];
      return hasFrontendTech(tags, p.title ?? "", p.category ?? "");
    }).length;
    const sampleTitle = postings[0]?.title ?? null;

    return {
      board: "NoFluffJobs",
      status: "ok",
      httpStatus: 200,
      totalJobs,
      frontendJobs,
      remoteFrontendJobs,
      sampleTitle,
      error: null,
      responseTimeMs: Date.now() - start,
    };
  } catch (e) {
    return {
      board: "NoFluffJobs",
      status: "error",
      httpStatus: 0,
      totalJobs: 0,
      frontendJobs: 0,
      remoteFrontendJobs: 0,
      sampleTitle: null,
      error: e instanceof Error ? e.message : String(e),
      responseTimeMs: Date.now() - start,
    };
  }
}

async function evaluateArbeitnow(): Promise<BoardResult> {
  const start = Date.now();
  try {
    const response = await fetch(
      "https://www.arbeitnow.com/api/job-board-api?page=1",
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(30000),
      },
    );

    if (!response.ok) {
      return {
        board: "Arbeitnow",
        status: "error",
        httpStatus: response.status,
        totalJobs: 0,
        frontendJobs: 0,
        remoteFrontendJobs: 0,
        sampleTitle: null,
        error: `HTTP ${response.status} ${response.statusText}`,
        responseTimeMs: Date.now() - start,
      };
    }

    const data = (await response.json()) as {
      data?: Array<{
        title?: string;
        tags?: string[];
        remote?: boolean;
        description?: string;
      }>;
    };

    const jobs = data.data ?? [];
    const totalJobs = jobs.length; // First page only (100 jobs)
    const frontendJobs = jobs.filter((j) =>
      hasFrontendTech(j.tags ?? [], j.title ?? "", j.description ?? ""),
    ).length;
    const remoteFrontendJobs = jobs.filter(
      (j) =>
        j.remote &&
        hasFrontendTech(j.tags ?? [], j.title ?? "", j.description ?? ""),
    ).length;
    const sampleTitle = jobs[0]?.title ?? null;

    return {
      board: "Arbeitnow",
      status: "ok",
      httpStatus: 200,
      totalJobs,
      frontendJobs,
      remoteFrontendJobs,
      sampleTitle,
      error: null,
      responseTimeMs: Date.now() - start,
    };
  } catch (e) {
    return {
      board: "Arbeitnow",
      status: "error",
      httpStatus: 0,
      totalJobs: 0,
      frontendJobs: 0,
      remoteFrontendJobs: 0,
      sampleTitle: null,
      error: e instanceof Error ? e.message : String(e),
      responseTimeMs: Date.now() - start,
    };
  }
}

async function evaluateRemotive(): Promise<BoardResult> {
  const start = Date.now();
  try {
    const response = await fetch(
      "https://remotive.com/api/remote-jobs?limit=100",
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(30000),
      },
    );

    if (!response.ok) {
      return {
        board: "Remotive",
        status: "error",
        httpStatus: response.status,
        totalJobs: 0,
        frontendJobs: 0,
        remoteFrontendJobs: 0,
        sampleTitle: null,
        error: `HTTP ${response.status} ${response.statusText}`,
        responseTimeMs: Date.now() - start,
      };
    }

    const data = (await response.json()) as {
      "job-count"?: number;
      jobs?: Array<{
        title?: string;
        tags?: string[];
        category?: string;
        description?: string;
      }>;
    };

    const jobs = data.jobs ?? [];
    const totalJobs = data["job-count"] ?? jobs.length;
    const frontendJobs = jobs.filter((j) =>
      hasFrontendTech(j.tags ?? [], j.title ?? "", j.description ?? ""),
    ).length;
    const sampleTitle = jobs[0]?.title ?? null;

    return {
      board: "Remotive",
      status: "ok",
      httpStatus: 200,
      totalJobs,
      frontendJobs,
      // Remotive is remote-first, so all frontend jobs are remote frontend.
      remoteFrontendJobs: frontendJobs,
      sampleTitle,
      error: null,
      responseTimeMs: Date.now() - start,
    };
  } catch (e) {
    return {
      board: "Remotive",
      status: "error",
      httpStatus: 0,
      totalJobs: 0,
      frontendJobs: 0,
      remoteFrontendJobs: 0,
      sampleTitle: null,
      error: e instanceof Error ? e.message : String(e),
      responseTimeMs: Date.now() - start,
    };
  }
}

async function evaluateWeWorkRemotely(): Promise<BoardResult> {
  const start = Date.now();
  try {
    const response = await fetch("https://weworkremotely.com/remote-jobs.rss", {
      headers: { Accept: "application/rss+xml, application/xml, text/xml" },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      return {
        board: "WeWorkRemotely",
        status: "error",
        httpStatus: response.status,
        totalJobs: 0,
        frontendJobs: 0,
        remoteFrontendJobs: 0,
        sampleTitle: null,
        error: `HTTP ${response.status} ${response.statusText}`,
        responseTimeMs: Date.now() - start,
      };
    }

    const xml = await response.text();
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    const items: Array<{
      title: string;
      category: string;
      description: string;
    }> = [];
    let match: RegExpExecArray | null = itemRegex.exec(xml);
    while (match !== null) {
      const block = match[1];
      const titleField =
        block.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? "";
      const category =
        block.match(/<category>([\s\S]*?)<\/category>/i)?.[1]?.trim() ?? "";
      const rawDesc =
        block.match(/<description>([\s\S]*?)<\/description>/i)?.[1]?.trim() ??
        "";
      // Unescape XML entities, then strip HTML for keyword detection
      const description = rawDesc
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/<[^>]+>/g, " ");
      // Title is "Company: Role" — use the role part for tech detection
      const title = titleField.includes(":")
        ? titleField.slice(titleField.indexOf(":") + 1).trim()
        : titleField;
      items.push({ title, category, description });
      match = itemRegex.exec(xml);
    }

    const totalJobs = items.length;
    const frontendJobs = items.filter((it) =>
      hasFrontendTech([it.category], it.title, it.description),
    ).length;
    const sampleTitle = items[0]?.title ?? null;

    return {
      board: "WeWorkRemotely",
      status: "ok",
      httpStatus: 200,
      totalJobs,
      frontendJobs,
      // WWR is remote-first, so all frontend jobs are remote frontend.
      remoteFrontendJobs: frontendJobs,
      sampleTitle,
      error: null,
      responseTimeMs: Date.now() - start,
    };
  } catch (e) {
    return {
      board: "WeWorkRemotely",
      status: "error",
      httpStatus: 0,
      totalJobs: 0,
      frontendJobs: 0,
      remoteFrontendJobs: 0,
      sampleTitle: null,
      error: e instanceof Error ? e.message : String(e),
      responseTimeMs: Date.now() - start,
    };
  }
}

async function main() {
  console.log("=== Job Board API Evaluation (WI3 Step 1) ===\n");
  console.log(
    "Testing 6 job board APIs for availability and frontend/PHP/Laravel job counts...\n",
  );

  const results = await Promise.all([
    evaluateHimalayas(),
    evaluateRemoteOK(),
    evaluateNoFluffJobs(),
    evaluateArbeitnow(),
    evaluateRemotive(),
    evaluateWeWorkRemotely(),
  ]);

  console.log("─".repeat(80));
  for (const r of results) {
    const statusIcon = r.status === "ok" ? "OK" : "FAIL";
    console.log(
      `\n[${statusIcon}] ${r.board} (HTTP ${r.httpStatus}, ${r.responseTimeMs}ms)`,
    );
    if (r.status === "ok") {
      console.log(`  Total jobs:          ${r.totalJobs.toLocaleString()}`);
      console.log(
        `  Frontend/PHP (sample): ${r.frontendJobs.toLocaleString()}`,
      );
      console.log(
        `  Remote frontend/PHP:   ${r.remoteFrontendJobs.toLocaleString()}`,
      );
      console.log(`  Sample title:        ${r.sampleTitle ?? "N/A"}`);
    } else {
      console.log(`  Error:               ${r.error}`);
    }
  }

  console.log(`\n${"─".repeat(80)}`);
  const working = results.filter((r) => r.status === "ok");
  const failed = results.filter((r) => r.status === "error");
  console.log(
    `\nSummary: ${working.length}/${results.length} boards reachable`,
  );
  if (working.length > 0) {
    console.log(`  Working: ${working.map((r) => r.board).join(", ")}`);
  }
  if (failed.length > 0) {
    console.log(`  Failed:  ${failed.map((r) => r.board).join(", ")}`);
    console.log("\n  Failed boards will be skipped in the ingestion function.");
    console.log("  Revisit when the APIs are fixed/endpoints are found.");
  }

  // Exit with non-zero if any board failed (for CI awareness)
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
