// NoFluffJobs Direct Ingestion Adapter
// src/lib/jobs/direct-ingestion/nofluffjobs.ts
//
// Fetches jobs from the NoFluffJobs API (https://nofluffjobs.com/api/posting) and
// transforms them into DirectIngestionJob objects. NoFluffJobs is a Polish/CEE
// remote-friendly job board with structured tech tags, salary, and seniority.
//
// API: GET https://nofluffjobs.com/api/posting
// Response: { postings: [...], totalCount, pageUniqueCount, totalUniqueCount }
//
// The API returns ALL ~11K jobs in a single response (no pagination). The payload
// is large (~80 MB), so we use a generous timeout and filter aggressively:
//   1. Keep only jobs where location.fullyRemote === true (the top-level
//      `fullyRemote` field is stale and always false — do NOT use it).
//   2. Apply the persona tech-stack filter to only ingest frontend/PHP/Laravel
//      jobs, avoiding thousands of backend/infra roles.
//
// Salary note: NoFluffJobs salaries are MONTHLY. We multiply by 12 to store
// annual figures, matching the job table's compensation convention (annual).
// Currency is preserved as-is (mostly PLN, some USD/EUR).

import { extractLocationCountry } from "@/lib/jobs/location-utils";
import type { DirectFetchResult, DirectIngestionJob } from "./types";

/** NoFluffJobs API top-level response shape (partial — only fields we use). */
interface NoFluffJobsResponse {
  postings?: NoFluffJobPosting[];
  totalCount?: number;
}

interface NoFluffJobPosting {
  id?: string;
  name?: string; // Company name
  title?: string;
  technology?: string; // Primary tech (React, PHP, JavaScript, etc.)
  category?: string; // frontend, backend, fullstack, devops, etc.
  seniority?: string[]; // Junior, Mid, Senior, Expert
  fullyRemote?: boolean; // Top-level — UNRELIABLE (always false). Do NOT use.
  location?: {
    fullyRemote?: boolean; // THIS is the correct remote indicator
    places?: Array<{
      country?: { code?: string; name?: string };
      city?: string;
    }>;
  };
  salary?: {
    from?: number;
    to?: number;
    type?: string; // b2b, permanent, zlecenie, uod
    currency?: string; // PLN, USD, EUR
  };
  url?: string;
  posted?: number; // Epoch milliseconds
  tiles?: {
    values?: Array<{ value: string; type: string }>; // type: "category" | "requirement"
  };
}

/** Months per year — used to convert NoFluffJobs monthly salaries to annual. */
const MONTHS_PER_YEAR = 12;

/**
 * Fetch and normalize jobs from the NoFluffJobs API.
 *
 * @param maxJobs        Maximum jobs to return after filtering
 * @param techFilter     Function to filter jobs by tech-stack overlap
 * @param fetchFn        Injectable fetch (defaults to global fetch)
 * @returns              DirectFetchResult with filtered DirectIngestionJob[]
 */
export async function fetchNoFluffJobs(
  maxJobs: number,
  techFilter: (job: {
    tags: string[];
    title: string;
    description: string;
  }) => boolean,
  fetchFn: typeof fetch = fetch,
): Promise<DirectFetchResult> {
  try {
    // The API returns all ~11K jobs in one response (~80 MB). Use a generous
    // timeout to accommodate the large payload on slower connections.
    const response = await fetchFn("https://nofluffjobs.com/api/posting", {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(90000),
    });

    if (!response.ok) {
      return {
        success: false,
        error: `NoFluffJobs API HTTP ${response.status} ${response.statusText}`,
        totalAvailable: 0,
      };
    }

    const data = (await response.json()) as NoFluffJobsResponse;
    const rawPostings = data.postings ?? [];
    const totalAvailable = rawPostings.length;
    const filteredJobs: DirectIngestionJob[] = [];

    for (const p of rawPostings) {
      // CRITICAL: Use location.fullyRemote, NOT the top-level fullyRemote field
      // (which is stale and always false). Only ingest fully-remote jobs — the
      // applicant is remote-only.
      if (!p.location?.fullyRemote) {
        continue;
      }

      const tags = extractTags(p);
      const title = p.title ?? "";
      const normalizedText = buildNormalizedText(p);

      // Apply persona tech filter
      if (!techFilter({ tags, title, description: normalizedText })) {
        continue;
      }

      const { minYears, maxYears } = seniorityToYears(p.seniority);
      const { remoteScope, locationCountries } = inferScopeFromPlaces(
        p.location?.places,
      );

      const job: DirectIngestionJob = {
        externalJobId: p.id ?? "",
        title,
        companyName: p.name ?? null,
        normalizedText,
        extractedTags: tags,
        applyUrl: p.url ? `https://nofluffjobs.com/job/${p.url}` : null,
        jobUrl: p.url ? `https://nofluffjobs.com/job/${p.url}` : null,
        locationName: formatLocation(p),
        workplaceType: "remote",
        employmentType: normalizeEmploymentType(p.salary?.type),
        remoteScope,
        locationCountries,
        compensationMin: toAnnualSalary(p.salary?.from),
        compensationMax: toAnnualSalary(p.salary?.to),
        compensationCurrency: p.salary?.currency?.toUpperCase() ?? null,
        experienceMinYears: minYears,
        experienceMaxYears: maxYears,
        publishedAt: p.posted ? safeParseEpochMs(p.posted) : null,
      };

      filteredJobs.push(job);

      if (filteredJobs.length >= maxJobs) {
        break;
      }
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
 * Build the extractedTags array from the posting's `technology` field plus the
 * `tiles.values` entries where type === "requirement". Tags are lowercased and
 * deduped.
 */
function extractTags(p: NoFluffJobPosting): string[] {
  const tags = new Set<string>();
  if (p.technology) {
    tags.add(p.technology.toLowerCase());
  }
  for (const v of p.tiles?.values ?? []) {
    if (v.type === "requirement" && v.value) {
      tags.add(v.value.toLowerCase());
    }
  }
  return [...tags];
}

/**
 * Build a normalized text blob from the structured fields. The list endpoint
 * does not return a full description, so we synthesize one from the available
 * structured fields — sufficient for embedding and Gate matching.
 */
function buildNormalizedText(p: NoFluffJobPosting): string {
  const seniority = (p.seniority ?? []).join(", ");
  const requirements = (p.tiles?.values ?? [])
    .filter((v) => v.type === "requirement")
    .map((v) => v.value)
    .join(", ");
  const parts = [
    `${p.title ?? ""} at ${p.name ?? ""}`.trim(),
    p.technology ? `Technology: ${p.technology}` : null,
    p.category ? `Category: ${p.category}` : null,
    seniority ? `Seniority: ${seniority}` : null,
    requirements ? `Required skills: ${requirements}` : null,
  ].filter((part): part is string => part !== null && part.length > 0);
  return parts.join(". ");
}

/**
 * Format the location string from the posting's places array.
 * e.g. "Warszawa, Poland / Madryt, Spain"
 */
function formatLocation(p: NoFluffJobPosting): string | null {
  const places = p.location?.places ?? [];
  if (places.length === 0) return null;
  const formatted = places
    .map((place) => {
      const city = place.city ?? "";
      const country = place.country?.name ?? "";
      return [city, country].filter(Boolean).join(", ");
    })
    .filter(Boolean);
  return formatted.length > 0 ? formatted.join(" / ") : null;
}

/**
 * Infer remoteScope and locationCountries from the posting's structured
 * places array.
 *
 * NoFluffJobs provides explicit country codes in each place entry. A
 * fullyRemote job whose places are all in one country is
 * remote-within-that-country (country_fenced), not global. Places spanning
 * 2+ countries indicate a multi-country region (region_fenced). No country
 * data or "Anywhere"/"World" → global.
 *
 * This replaces the previous hardcoded `remoteScope: "global"` which caused
 * Gate 0.5 Check 2b to misfire — it would see a country name in locationName
 * alongside remoteScope="global" and hard-block even multi-country CEE listings
 * that should reach Gate 3.
 *
 * @returns { remoteScope, locationCountries } — locationCountries is null for
 *          global/unknown scope, populated with ISO 3166-1 alpha-2 codes for
 *          country_fenced and region_fenced.
 */
function inferScopeFromPlaces(
  places:
    | Array<{
        country?: { code?: string; name?: string } | null;
        city?: string;
      }>
    | undefined,
): {
  remoteScope: "global" | "country_fenced" | "region_fenced";
  locationCountries: string[] | null;
} {
  if (!places || places.length === 0) {
    return { remoteScope: "global", locationCountries: null };
  }

  const countryCodes = new Set<string>();
  for (const place of places) {
    const name = place.country?.name?.toLowerCase() ?? "";
    // "Anywhere", "World", "Global" in the country name → truly worldwide
    if (
      name.includes("anywhere") ||
      name.includes("world") ||
      name.includes("global")
    ) {
      return { remoteScope: "global", locationCountries: null };
    }
    // Normalize to ISO 3166-1 alpha-2. NoFluffJobs may return alpha-3 codes
    // (e.g. "POL", "ESP") or alpha-2 ("PL", "ES"). Gate 0.5's COUNTRY_NAMES
    // mapping and locationCountries column use alpha-2, so we normalize via
    // the country name when the code isn't already 2 chars.
    const rawCode = place.country?.code?.toUpperCase();
    if (rawCode && rawCode.length === 2) {
      countryCodes.add(rawCode);
    } else if (place.country?.name) {
      const alpha2 = extractLocationCountry(place.country.name);
      if (alpha2) {
        countryCodes.add(alpha2);
      }
    }
  }

  if (countryCodes.size === 0) {
    // Places exist but no country codes could be extracted. NoFluffJobs is a
    // Polish/CEE board — jobs without explicit country data are almost
    // certainly Poland-only remote. Default to country_fenced with PL rather
    // than global, which was the previous (incorrect) default that caused 137
    // Poland jobs to be misclassified as global. If a job is truly worldwide,
    // the country name would contain "Anywhere"/"World"/"Global" (checked
    // above) and would have already returned global.
    return { remoteScope: "country_fenced", locationCountries: ["PL"] };
  }

  const codes = [...countryCodes];
  if (codes.length === 1) {
    return { remoteScope: "country_fenced", locationCountries: codes };
  }
  return { remoteScope: "region_fenced", locationCountries: codes };
}

/**
 * Map NoFluffJobs salary `type` to a normalized employment type.
 *
 * Actual observed values (July 2026): b2b, permanent, zlecenie, uod.
 *   - b2b       → contract (business-to-business)
 *   - permanent → full-time (permanent employment)
 *   - zlecenie  → contract (mandate contract)
 *   - uod       → contract (umowa o dzieło — contract for specific work)
 */
function normalizeEmploymentType(raw: string | undefined): string | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower === "b2b") return "contract";
  if (lower.includes("permanent") || lower === "uop") return "full-time";
  if (lower.includes("zlecenie") || lower.includes("mandate"))
    return "contract";
  if (lower === "uod") return "contract";
  if (lower.includes("full")) return "full-time";
  if (lower.includes("part")) return "part-time";
  if (lower.includes("contract") || lower.includes("freelance"))
    return "contract";
  if (lower.includes("intern")) return "internship";
  return lower;
}

/**
 * Convert a monthly NoFluffJobs salary to an annual figure.
 * Returns null for missing/invalid values.
 */
function toAnnualSalary(monthly: number | undefined): number | null {
  if (monthly === undefined || monthly === null || monthly <= 0) {
    return null;
  }
  return monthly * MONTHS_PER_YEAR;
}

/**
 * Map the posting's seniority array to experience year ranges.
 * If multiple seniorities are listed, use the most junior one's range.
 *
 *   Junior → 0–2 years
 *   Mid    → 3–5 years
 *   Senior → 5–8 years
 *   Expert → 8–15 years
 */
function seniorityToYears(seniority: string[] | undefined): {
  minYears: number | null;
  maxYears: number | null;
} {
  if (!seniority || seniority.length === 0) {
    return { minYears: null, maxYears: null };
  }
  const order: Array<{
    key: string;
    minYears: number;
    maxYears: number;
  }> = [
    { key: "junior", minYears: 0, maxYears: 2 },
    { key: "trainee", minYears: 0, maxYears: 1 },
    { key: "mid", minYears: 3, maxYears: 5 },
    { key: "senior", minYears: 5, maxYears: 8 },
    { key: "expert", minYears: 8, maxYears: 15 },
  ];
  // Pick the most junior matching seniority (first in `order` that appears).
  for (const tier of order) {
    if (seniority.some((s) => s.toLowerCase().includes(tier.key))) {
      return { minYears: tier.minYears, maxYears: tier.maxYears };
    }
  }
  return { minYears: null, maxYears: null };
}

/** Parse epoch milliseconds into a Date, returning null on invalid input. */
function safeParseEpochMs(ms: number): Date | null {
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d;
}
