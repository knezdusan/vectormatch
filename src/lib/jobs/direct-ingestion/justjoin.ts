// JustJoin Direct Ingestion Adapter
// src/lib/jobs/direct-ingestion/justjoin.ts
//
// Fetches jobs from the JustJoin.it API and transforms them into
// DirectIngestionJob objects. JustJoin is a Polish/CEE tech job board with
// structured skills, salary, seniority, and workplace type.
//
// The legacy https://justjoin.it/api/offers endpoint returns 404 as of July
// 2026 — the API moved to a NestJS gateway at https://api.justjoin.it. Two
// endpoints are used:
//
//   List:   GET https://api.justjoin.it/v2/user-panel/offers/by-cursor
//                   ?from=N&itemsCount=M&remote=true
//           → { data: [...], meta: { totalItems, next: { cursor, itemsCount } } }
//           Cursor-based pagination (cursor === next `from` offset). The list
//           item carries title, company, skills, salary, seniority, workplace
//           type — but NO description body and NO applyUrl.
//
//   Detail: GET https://api.justjoin.it/v1/offers/{slug}
//           → full offer with `body` (HTML description), `applyUrl`,
//             `requiredSkills` (string[]), `countryCode`, etc.
//
// Because the list lacks a description, we use a two-step fetch:
//   1. Paginate the list (remote=true — the applicant is remote-only, matching
//      the NoFluffJobs adapter's fullyRemote filter), pre-filtering on title +
//      skills with an empty description.
//   2. For pre-filtered jobs, fetch the detail to obtain the body + applyUrl,
//      then apply the full persona tech filter on the real description.
//
// This bounds the (more expensive) detail calls to only jobs that already match
// the persona's tech stack by title/skills.
//
// Salary note: JustJoin salaries are MONTHLY in the offer's currency (mostly
// PLN, some USD/EUR/GBP). We multiply by 12 to store annual figures, matching
// the job table's compensation convention (annual) — same approach as the
// NoFluffJobs adapter. The API also exposes pre-converted fromUsd/toUsd fields,
// but we preserve the original currency for cross-adapter consistency.
//
// Each list item: { guid, slug, title, requiredSkills (string[]|null),
//   workplaceType ("remote"|"hybrid"|"office"), workingTime, experienceLevel
//   ("junior"|"mid"|"senior"), employmentTypes [{from,to,currency,type,unit,
//   fromUsd,toUsd,...}], multilocation [{city,...}], city, remoteInterview,
//   companyName, publishedAt }
//
// Each detail item adds: { body (HTML), applyUrl, countryCode, requiredSkills
//   (string[]), niceToHaveSkills (string[]), workplaceType {label,value},
//   experienceLevel {label,value}, workingTime {label,value} }

import type { DirectFetchResult, DirectIngestionJob } from "./types";

/** Base URL for the JustJoin API gateway. */
const API_BASE = "https://api.justjoin.it";

/** Canonical public offer page URL prefix. */
const OFFER_URL_PREFIX = "https://justjoin.it/job-offer/";

/** Page size for the list endpoint. */
const PAGE_SIZE = 100;

/** Maximum pages to fetch per ingestion run (safety cap). */
const MAX_PAGES = 30;

/** Months per year — used to convert monthly salaries to annual. */
const MONTHS_PER_YEAR = 12;

/** JustJoin API list response shape (partial — only fields we use). */
interface JustJoinListResponse {
  data?: JustJoinListOffer[];
  meta?: {
    totalItems?: number;
    next?: { cursor?: number; itemsCount?: number } | null;
  };
}

/** A single offer from the by-cursor list endpoint. */
interface JustJoinListOffer {
  guid?: string;
  slug?: string;
  title?: string;
  requiredSkills?: string[] | null;
  workplaceType?: string; // "remote" | "hybrid" | "office"
  workingTime?: string; // "full_time" | "part_time"
  experienceLevel?: string; // "junior" | "mid" | "senior"
  employmentTypes?: JustJoinEmploymentType[];
  multilocation?: Array<{ city?: string }>;
  city?: string;
  remoteInterview?: boolean;
  companyName?: string;
  publishedAt?: string; // ISO date
}

/** A single offer from the v1 detail endpoint. */
interface JustJoinDetailOffer {
  slug?: string;
  title?: string;
  companyName?: string;
  body?: string; // HTML description
  applyUrl?: string;
  countryCode?: string;
  requiredSkills?: string[] | null;
  niceToHaveSkills?: string[] | null;
  // Detail wraps these as { label, value } objects (list uses plain strings).
  workplaceType?: string | { label?: string; value?: string };
  experienceLevel?: string | { label?: string; value?: string };
  workingTime?: string | { label?: string; value?: string };
  employmentTypes?: JustJoinEmploymentType[];
  multilocation?: Array<{ city?: string }>;
  city?: string;
  remoteInterview?: boolean;
  publishedAt?: string; // ISO date
}

/** Salary/employment entry shared by list and detail payloads. */
interface JustJoinEmploymentType {
  from?: number;
  to?: number;
  currency?: string; // "pln" | "usd" | "eur" | "gbp" | "chf"
  type?: string; // "b2b" | "permanent" | "zlecenie" | "mandate_contract"
  unit?: string; // "month"
  fromUsd?: number;
  toUsd?: number;
}

/**
 * Fetch and normalize jobs from the JustJoin.it API.
 *
 * @param maxJobs        Maximum jobs to return after filtering
 * @param techFilter     Function to filter jobs by tech-stack overlap
 * @param fetchFn        Injectable fetch (defaults to global fetch)
 * @returns              DirectFetchResult with filtered DirectIngestionJob[]
 */
export async function fetchJustJoinJobs(
  maxJobs: number,
  techFilter: (job: {
    tags: string[];
    title: string;
    description: string;
  }) => boolean,
  fetchFn: typeof fetch = fetch,
): Promise<DirectFetchResult> {
  try {
    const filteredJobs: DirectIngestionJob[] = [];
    let totalAvailable = 0;
    let from = 0;

    for (let page = 0; page < MAX_PAGES; page++) {
      const url = `${API_BASE}/v2/user-panel/offers/by-cursor?from=${from}&itemsCount=${PAGE_SIZE}&remote=true`;
      const response = await fetchFn(url, {
        headers: {
          Accept: "application/json",
          Origin: "https://justjoin.it",
          Referer: "https://justjoin.it/",
        },
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        return {
          success: false,
          error: `JustJoin API HTTP ${response.status} ${response.statusText}`,
          totalAvailable: 0,
        };
      }

      const data = (await response.json()) as JustJoinListResponse;
      const pageOffers = data.data ?? [];

      // Empty page → end of data.
      if (pageOffers.length === 0) {
        break;
      }

      // totalItems is reported on every page; capture it once.
      if (totalAvailable === 0) {
        totalAvailable = data.meta?.totalItems ?? pageOffers.length;
      }

      for (const lo of pageOffers) {
        const slug = lo.slug ?? "";
        const title = lo.title ?? "";
        const listSkills = normalizeSkills(lo.requiredSkills);

        // Pre-filter on title + skills (no description available from list).
        // This avoids a detail call for jobs that clearly don't match.
        if (!techFilter({ tags: listSkills, title, description: "" })) {
          continue;
        }

        // Fetch detail for the description body + applyUrl.
        const detail = await fetchDetail(slug, fetchFn);
        if (!detail) {
          // Skip jobs whose detail can't be fetched rather than failing the run.
          continue;
        }

        const description = stripHtml(detail.body ?? "");
        const tags = mergeSkills(
          normalizeSkills(detail.requiredSkills),
          listSkills,
          normalizeSkills(detail.niceToHaveSkills),
        );

        // Apply the full persona tech filter with the real description.
        if (!techFilter({ tags, title, description })) {
          continue;
        }

        const employmentTypes = detail.employmentTypes ?? lo.employmentTypes;
        const { minYears, maxYears } = experienceLevelToYears(
          extractValue(detail.experienceLevel) ??
            extractValue(lo.experienceLevel),
        );
        const { min, max, currency } = extractCompensation(employmentTypes);

        const job: DirectIngestionJob = {
          externalJobId: lo.guid ?? slug,
          title,
          companyName: detail.companyName ?? lo.companyName ?? null,
          normalizedText: description,
          extractedTags: tags,
          applyUrl: detail.applyUrl ?? null,
          jobUrl: slug ? `${OFFER_URL_PREFIX}${slug}` : null,
          locationName: formatLocation(detail, lo),
          workplaceType: normalizeWorkplaceType(
            extractValue(detail.workplaceType) ?? lo.workplaceType,
          ),
          employmentType: normalizeEmploymentType(employmentTypes?.[0]?.type),
          // JustJoin is a Polish/EU board; remote jobs default to global since
          // the API exposes no per-offer "required location" fencing field.
          remoteScope: "global",
          compensationMin: min,
          compensationMax: max,
          compensationCurrency: currency,
          experienceMinYears: minYears,
          experienceMaxYears: maxYears,
          publishedAt: lo.publishedAt ? safeParseDate(lo.publishedAt) : null,
        };

        filteredJobs.push(job);

        if (filteredJobs.length >= maxJobs) {
          return { success: true, jobs: filteredJobs, totalAvailable };
        }
      }

      // Advance the cursor. Stop if there is no next page.
      const nextCursor = data.meta?.next?.cursor;
      if (nextCursor === undefined || nextCursor === null) {
        break;
      }
      from = nextCursor;
    }

    return { success: true, jobs: filteredJobs, totalAvailable };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
      totalAvailable: 0,
    };
  }
}

/**
 * Fetch a single offer's detail by slug. Returns null on any error so the
 * ingestion run can continue with the remaining offers.
 */
async function fetchDetail(
  slug: string,
  fetchFn: typeof fetch,
): Promise<JustJoinDetailOffer | null> {
  if (!slug) return null;
  try {
    const response = await fetchFn(`${API_BASE}/v1/offers/${slug}`, {
      headers: {
        Accept: "application/json",
        Origin: "https://justjoin.it",
        Referer: "https://justjoin.it/",
      },
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) return null;
    return (await response.json()) as JustJoinDetailOffer;
  } catch {
    return null;
  }
}

// ── Field normalization helpers ──────────────────────────────────────────────

/**
 * Extract a string value from a field that may be a plain string or a
 * { label, value } object (the detail endpoint wraps some fields).
 */
function extractValue(
  field: string | { label?: string; value?: string } | undefined,
): string | undefined {
  if (!field) return undefined;
  if (typeof field === "string") return field;
  return field.value ?? field.label ?? undefined;
}

/** Normalize a skills array: lowercased, trimmed, deduped. Null-safe. */
function normalizeSkills(skills: string[] | null | undefined): string[] {
  if (!skills || !Array.isArray(skills)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of skills) {
    if (typeof s !== "string") continue;
    const v = s.trim().toLowerCase();
    if (v && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

/** Merge multiple skill arrays, deduping while preserving order. */
function mergeSkills(...arrays: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const arr of arrays) {
    for (const s of arr) {
      if (!seen.has(s)) {
        seen.add(s);
        out.push(s);
      }
    }
  }
  return out;
}

/**
 * Map JustJoin workplaceType to our enum.
 *   "remote"  → "remote"
 *   "hybrid"  → "hybrid"
 *   "office"  → "on-site"
 */
function normalizeWorkplaceType(
  raw: string | undefined,
): "remote" | "hybrid" | "on-site" | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower === "remote") return "remote";
  if (lower === "hybrid") return "hybrid";
  if (lower === "office") return "on-site";
  return null;
}

/**
 * Map JustJoin employment type (from the salary entry's `type`) to our enum.
 *
 * Observed values: b2b, permanent, zlecenie, mandate_contract.
 *   - b2b              → contract
 *   - permanent        → full-time
 *   - zlecenie         → contract
 *   - mandate_contract → contract
 */
function normalizeEmploymentType(raw: string | undefined): string | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower === "b2b") return "contract";
  if (lower.includes("permanent") || lower === "uop") return "full-time";
  if (lower.includes("zlecenie") || lower.includes("mandate"))
    return "contract";
  if (lower.includes("full")) return "full-time";
  if (lower.includes("part")) return "part-time";
  if (lower.includes("contract") || lower.includes("freelance"))
    return "contract";
  if (lower.includes("intern")) return "internship";
  return lower;
}

/**
 * Extract the annual compensation range from the first employment-type entry.
 * JustJoin salaries are monthly → multiply by 12. Currency is uppercased.
 * Returns { min: null, max: null, currency: null } when no salary is present.
 */
function extractCompensation(types: JustJoinEmploymentType[] | undefined): {
  min: number | null;
  max: number | null;
  currency: string | null;
} {
  if (!types || types.length === 0) {
    return { min: null, max: null, currency: null };
  }
  const entry = types[0];
  const min = toAnnualSalary(entry.from);
  const max = toAnnualSalary(entry.to);
  const currency = entry.currency?.toUpperCase() ?? null;
  return { min, max, currency };
}

/** Convert a monthly salary to an annual figure. Null for missing/invalid. */
function toAnnualSalary(monthly: number | undefined | null): number | null {
  if (monthly === undefined || monthly === null || monthly <= 0) {
    return null;
  }
  return monthly * MONTHS_PER_YEAR;
}

/**
 * Map JustJoin experienceLevel to experience year ranges.
 *   junior → 0–2 years
 *   mid    → 3–5 years
 *   senior → 5–8 years
 */
function experienceLevelToYears(level: string | undefined): {
  minYears: number | null;
  maxYears: number | null;
} {
  if (!level) return { minYears: null, maxYears: null };
  const lower = level.toLowerCase();
  if (lower.includes("junior") || lower.includes("trainee")) {
    return { minYears: 0, maxYears: 2 };
  }
  if (lower.includes("mid")) return { minYears: 3, maxYears: 5 };
  if (lower.includes("senior")) return { minYears: 5, maxYears: 8 };
  if (lower.includes("expert") || lower.includes("lead")) {
    return { minYears: 8, maxYears: 15 };
  }
  return { minYears: null, maxYears: null };
}

/**
 * Format a location string from the detail/list offer.
 * Prefers the detail's city + countryCode; falls back to the list's city.
 */
function formatLocation(
  detail: JustJoinDetailOffer,
  list: JustJoinListOffer,
): string | null {
  const city = detail.city ?? list.city ?? null;
  const country = detail.countryCode ?? null;
  if (city && country) return `${city}, ${country}`;
  if (city) return city;
  if (country) return country;
  return null;
}

/**
 * Strip HTML tags from a string, preserving text content.
 * JustJoin description bodies contain HTML (p, strong, ul, li, br).
 */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Parse an ISO date string into a Date, returning null on invalid input. */
function safeParseDate(s: string): Date | null {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}
