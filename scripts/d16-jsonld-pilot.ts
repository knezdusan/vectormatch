/**
 * Directive 16 — Part D: JSON-LD Structured Scope Pilot
 *
 * Schema.org JobPosting JSON-LD is REQUIRED by Google for Jobs eligibility.
 * Fully-remote listings must declare `jobLocationType: TELECOMMUTE` plus
 * `applicantLocationRequirements` (where applicants may work from). ATS job
 * pages carry this JSON-LD, making the genuine-global vs country-fenced
 * distinction DECLARED and machine-readable at the source.
 *
 * This pilot:
 *   1. Queries Neon for 100 active jobs with a job_url/apply_url (preferring
 *      50 `global` + 50 `country_fenced`).
 *   2. Fetches each job page HTML (10s timeout, 2s polite delay).
 *   3. Extracts <script type="application/ld+json"> blocks.
 *   4. Classifies the DECLARED scope from JSON-LD.
 *   5. Compares declared scope vs our classifier's `remote_scope` label.
 *   6. Reports coverage / agreement / false-fence recoveries / false-global
 *      catches / missing counts.
 *   7. Writes results to docs/reports/d16-jsonld-pilot.json.
 *
 * Usage: npx tsx --env-file=.env scripts/d16-jsonld-pilot.ts
 */
import { neon } from "@neondatabase/serverless";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const sql = neon(process.env.DATABASE_URL!);

type RemoteScope =
  | "global"
  | "country_fenced"
  | "region_fenced"
  | "onsite"
  | "undetermined"
  | "unknown";

type DeclaredScope =
  | "DECLARED_GLOBAL"
  | "DECLARED_COUNTRY_FENCED"
  | "DECLARED_ONSITE"
  | "NO_COVERAGE";

type Comparison =
  | "AGREEMENT"
  | "FALSE_FENCE_RECOVERY"
  | "FALSE_GLOBAL_CATCH"
  | "MISSING";

interface JobRow {
  id: string;
  title: string | null;
  ats_slug: string | null;
  ats_source: string | null;
  job_url: string | null;
  apply_url: string | null;
  remote_scope: RemoteScope | null;
}

interface JobResult {
  id: string;
  title: string | null;
  ats_slug: string | null;
  ats_source: string | null;
  url: string;
  classifierScope: RemoteScope | null;
  declaredScope: DeclaredScope;
  comparison: Comparison;
  hasJobPosting: boolean;
  jobLocationType: string | null;
  applicantLocationRequirements: string[];
  jobLocation: string | null;
  httpStatus: number | null;
  error: string | null;
}

const TARGET_PER_SCOPE = 50;
const FETCH_TIMEOUT_MS = 10_000;
const POLITE_DELAY_MS = 2_000;
const REPORT_PATH = join(
  process.cwd(),
  "docs",
  "reports",
  "d16-jsonld-pilot.json",
);

async function fetchJobRows(): Promise<JobRow[]> {
  // Pull 50 global + 50 country_fenced first (to test false-global catches
  // and false-fence recoveries), then backfill with any other active jobs
  // that have a url until we reach 100.
  const globalRows = await sql`
    SELECT id, title, ats_slug, ats_source, job_url, apply_url, remote_scope
    FROM job
    WHERE status = 'active'
      AND (job_url IS NOT NULL OR apply_url IS NOT NULL)
      AND remote_scope = 'global'
    ORDER BY detected_at DESC NULLS LAST
    LIMIT ${TARGET_PER_SCOPE}
  `;
  const fencedRows = await sql`
    SELECT id, title, ats_slug, ats_source, job_url, apply_url, remote_scope
    FROM job
    WHERE status = 'active'
      AND (job_url IS NOT NULL OR apply_url IS NOT NULL)
      AND remote_scope = 'country_fenced'
    ORDER BY detected_at DESC NULLS LAST
    LIMIT ${TARGET_PER_SCOPE}
  `;

  const collected = [...globalRows, ...fencedRows];
  const seen = new Set(collected.map((r: JobRow) => r.id));

  if (collected.length < 100) {
    const remaining = 100 - collected.length;
    const extraIds = Array.from(seen);
    const extraRows = await sql`
      SELECT id, title, ats_slug, ats_source, job_url, apply_url, remote_scope
      FROM job
      WHERE status = 'active'
        AND (job_url IS NOT NULL OR apply_url IS NOT NULL)
        AND (${extraIds.length === 0} OR id NOT IN (
          SELECT unnest(${extraIds}::uuid[])
        ))
    ORDER BY detected_at DESC NULLS LAST
      LIMIT ${remaining}
    `;
    collected.push(...extraRows);
  }

  return collected.slice(0, 100) as JobRow[];
}

function pickUrl(row: JobRow): string | null {
  return row.job_url || row.apply_url || null;
}

/**
 * Extract all <script type="application/ld+json"> blocks from raw HTML.
 * Uses a regex that tolerates nested braces by scanning for the closing
 * </script> tag rather than balancing JSON braces.
 */
function extractJsonLdBlocks(html: string): string[] {
  const blocks: string[] = [];
  const re =
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    blocks.push(m[1].trim());
  }
  return blocks;
}

/**
 * Normalize a JSON-LD node that may be a single object, an array, or a
 * @graph into a flat list of plain objects.
 */
function flattenJsonLd(node: unknown): Record<string, unknown>[] {
  if (node === null || typeof node !== "object") return [];
  if (Array.isArray(node)) {
    return node.flatMap((n) => flattenJsonLd(n));
  }
  const obj = node as Record<string, unknown>;
  if (Array.isArray(obj["@graph"])) {
    return obj["@graph"].flatMap((n) => flattenJsonLd(n));
  }
  return [obj];
}

function typeMatches(value: unknown, target: string): boolean {
  if (typeof value === "string") {
    return value === target;
  }
  if (Array.isArray(value)) {
    return value.some((v) => typeMatches(v, target));
  }
  return false;
}

function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function extractCountryName(req: unknown): string | null {
  if (req === null || typeof req !== "object") return null;
  const obj = req as Record<string, unknown>;
  // Common shapes:
  //  { "@type": "Country", "name": "United States" }
  //  { "@type": "State", "name": "California" }
  //  { "@type": "AdministrativeArea", "name": "..." }
  //  { "@type": "Place", "address": { "addressCountry": "US" } }
  if (typeof obj.name === "string") return obj.name;
  const addr = obj.address as Record<string, unknown> | undefined;
  if (addr && typeof addr.addressCountry === "string") {
    return addr.addressCountry;
  }
  if (addr && typeof addr.name === "string") return addr.name;
  return null;
}

interface ParsedJobPosting {
  found: boolean;
  jobLocationType: string | null;
  applicantLocationRequirements: string[];
  jobLocation: string | null;
}

function parseJobPosting(nodes: Record<string, unknown>[]): ParsedJobPosting {
  for (const node of nodes) {
    if (!typeMatches(node["@type"], "JobPosting")) continue;

    const jobLocationTypeRaw = node.jobLocationType;
    const jobLocationType =
      typeof jobLocationTypeRaw === "string" ? jobLocationTypeRaw : null;

    const reqs = asArray(node.applicantLocationRequirements)
      .map(extractCountryName)
      .filter((s): s is string => s !== null);

    let jobLocation: string | null = null;
    const locRaw = node.jobLocation;
    if (locRaw !== undefined && locRaw !== null) {
      const locs = asArray(locRaw);
      for (const loc of locs) {
        if (loc === null || typeof loc !== "object") continue;
        const locObj = loc as Record<string, unknown>;
        const addr = locObj.address as Record<string, unknown> | undefined;
        if (addr) {
          const parts = [
            addr.streetAddress,
            addr.addressLocality,
            addr.addressRegion,
            addr.addressCountry,
            addr.postalCode,
          ].filter((p): p is string => typeof p === "string" && p.length > 0);
          if (parts.length > 0) {
            jobLocation = parts.join(", ");
            break;
          }
        }
        if (typeof locObj.name === "string") {
          jobLocation = locObj.name;
          break;
        }
      }
    }

    return {
      found: true,
      jobLocationType,
      applicantLocationRequirements: reqs,
      jobLocation,
    };
  }
  return {
    found: false,
    jobLocationType: null,
    applicantLocationRequirements: [],
    jobLocation: null,
  };
}

function classifyDeclaredScope(parsed: ParsedJobPosting): DeclaredScope {
  if (!parsed.found) return "NO_COVERAGE";
  const isTelecommute =
    parsed.jobLocationType?.toUpperCase() === "TELECOMMUTE";
  if (isTelecommute) {
    if (parsed.applicantLocationRequirements.length === 0) {
      return "DECLARED_GLOBAL";
    }
    return "DECLARED_COUNTRY_FENCED";
  }
  if (parsed.jobLocation) {
    return "DECLARED_ONSITE";
  }
  // JobPosting present but neither TELECOMMUTE nor a physical location —
  // treat as no usable scope signal.
  return "NO_COVERAGE";
}

function compareScopes(
  classifier: RemoteScope | null,
  declared: DeclaredScope,
): Comparison {
  if (declared === "NO_COVERAGE") return "MISSING";

  if (declared === "DECLARED_GLOBAL") {
    if (classifier === "global") return "AGREEMENT";
    if (classifier === "country_fenced") return "FALSE_FENCE_RECOVERY";
    return "AGREEMENT"; // onsite/region_fenced/etc — not the focus of this pilot
  }
  if (declared === "DECLARED_COUNTRY_FENCED") {
    if (classifier === "country_fenced") return "AGREEMENT";
    if (classifier === "global") return "FALSE_GLOBAL_CATCH";
    return "AGREEMENT";
  }
  if (declared === "DECLARED_ONSITE") {
    if (classifier === "onsite") return "AGREEMENT";
    return "AGREEMENT";
  }
  return "MISSING";
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchHtml(
  url: string,
): Promise<{ html: string; status: number | null; error: string | null }> {
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent":
          "Mozilla/5.0 (compatible; VectorMatch-D16-Pilot/1.0; +jsonld-scope-audit)",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      return {
        html: "",
        status: response.status,
        error: `HTTP ${response.status}`,
      };
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (
      !contentType.includes("text/html") &&
      !contentType.includes("application/xhtml+xml") &&
      !contentType.includes("text/plain")
    ) {
      // Likely JSON feed or binary — skip; not a job page with JSON-LD.
      return {
        html: "",
        status: response.status,
        error: `non-html content-type: ${contentType}`,
      };
    }

    const html = await response.text();
    return { html, status: response.status, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const isTimeout =
      msg.toLowerCase().includes("timeout") ||
      msg.toLowerCase().includes("aborted");
    return {
      html: "",
      status: null,
      error: isTimeout ? "timeout" : msg,
    };
  }
}

async function processJob(row: JobRow): Promise<JobResult> {
  const url = pickUrl(row) ?? "";
  const base: JobResult = {
    id: row.id,
    title: row.title,
    ats_slug: row.ats_slug,
    ats_source: row.ats_source,
    url,
    classifierScope: row.remote_scope,
    declaredScope: "NO_COVERAGE",
    comparison: "MISSING",
    hasJobPosting: false,
    jobLocationType: null,
    applicantLocationRequirements: [],
    jobLocation: null,
    httpStatus: null,
    error: null,
  };

  if (!url) {
    base.error = "no url";
    return base;
  }

  const { html, status, error } = await fetchHtml(url);
  base.httpStatus = status;
  base.error = error;

  if (error || !html) {
    return base;
  }

  const blocks = extractJsonLdBlocks(html);
  if (blocks.length === 0) {
    return base;
  }

  // Parse each block; collect all nodes; tolerate malformed JSON-LD.
  const allNodes: Record<string, unknown>[] = [];
  for (const block of blocks) {
    try {
      const parsed = JSON.parse(block);
      allNodes.push(...flattenJsonLd(parsed));
    } catch {
      // Malformed JSON-LD — skip this block gracefully.
    }
  }

  const parsed = parseJobPosting(allNodes);
  base.hasJobPosting = parsed.found;
  base.jobLocationType = parsed.jobLocationType;
  base.applicantLocationRequirements = parsed.applicantLocationRequirements;
  base.jobLocation = parsed.jobLocation;
  base.declaredScope = classifyDeclaredScope(parsed);
  base.comparison = compareScopes(row.remote_scope, base.declaredScope);
  return base;
}

async function main() {
  console.log("=== D16 PART D: JSON-LD STRUCTURED SCOPE PILOT ===\n");

  const rows = await fetchJobRows();
  console.log(`Selected ${rows.length} jobs from Neon.`);
  const byScope = rows.reduce<Record<string, number>>((acc, r) => {
    const k = r.remote_scope ?? "null";
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  console.log("By remote_scope:", byScope);
  console.log("");

  const results: JobResult[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const url = pickUrl(row) ?? "(no url)";
    process.stdout.write(
      `[${i + 1}/${rows.length}] ${row.ats_slug ?? "?"} — ${row.title?.slice(0, 50) ?? "?"} | ${url.slice(0, 70)} ... `,
    );
    const res = await processJob(row);
    results.push(res);
    console.log(
      `=> ${res.declaredScope} (${res.comparison}) http=${res.httpStatus ?? "-"} ${res.error ? `err=${res.error}` : ""}`,
    );
    if (i < rows.length - 1) await delay(POLITE_DELAY_MS);
  }

  // Aggregate report.
  const total = results.length;
  const covered = results.filter(
    (r) => r.hasJobPosting && r.declaredScope !== "NO_COVERAGE",
  ).length;
  const missing = results.filter((r) => r.comparison === "MISSING").length;
  const falseFenceRecoveries = results.filter(
    (r) => r.comparison === "FALSE_FENCE_RECOVERY",
  ).length;
  const falseGlobalCatches = results.filter(
    (r) => r.comparison === "FALSE_GLOBAL_CATCH",
  ).length;
  const agreements = results.filter((r) => r.comparison === "AGREEMENT").length;

  const coverageRate = total > 0 ? (covered / total) * 100 : 0;
  const agreementRate = covered > 0 ? (agreements / covered) * 100 : 0;

  const report = {
    timestamp: new Date().toISOString(),
    directive: "D16-PART-D",
    description:
      "JSON-LD JobPosting structured-scope pilot — declared vs classifier scope",
    summary: {
      totalJobs: total,
      covered,
      missing,
      coverageRatePct: Number(coverageRate.toFixed(2)),
      agreementRatePct: Number(agreementRate.toFixed(2)),
      falseFenceRecoveries,
      falseGlobalCatches,
      agreements,
    },
    scopeBreakdown: byScope,
    declaredScopeBreakdown: results.reduce<Record<string, number>>(
      (acc, r) => {
        acc[r.declaredScope] = (acc[r.declaredScope] ?? 0) + 1;
        return acc;
      },
      {},
    ),
    comparisonBreakdown: results.reduce<Record<string, number>>(
      (acc, r) => {
        acc[r.comparison] = (acc[r.comparison] ?? 0) + 1;
        return acc;
      },
      {},
    ),
    results,
  };

  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);

  console.log("\n=== REPORT ===");
  console.log(`Total jobs:           ${total}`);
  console.log(`Covered (JSON-LD):    ${covered} (${coverageRate.toFixed(1)}%)`);
  console.log(`Missing:              ${missing}`);
  console.log(`Agreements:           ${agreements}`);
  console.log(
    `Agreement rate:       ${agreementRate.toFixed(1)}% (of covered)`,
  );
  console.log(`False-fence recoveries: ${falseFenceRecoveries}`);
  console.log(`False-global catches:   ${falseGlobalCatches}`);
  console.log(`\nReport written to ${REPORT_PATH}`);
  console.log("\n=== DONE ===");
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
