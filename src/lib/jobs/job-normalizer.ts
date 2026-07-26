// Module C — Job Normalizer (Step 1 of the 3-Gate Funnel)
// src/lib/jobs/job-normalizer.ts
//
// When a job/ingested event fires, the jobIngestedHandler runs normalization
// before Gates 1+2. Normalization has three phases:
//
//   1. ATS-source-aware content extraction — pull title + description from
//      rawJson using the correct field per ATS platform (Greenhouse/Lever/Ashby
//      all store the description under different field names).
//   2. Tag extraction:
//      Phase 1 — Regex dictionary scan (zero cost, medium recall). Scans the
//      cleaned fullText for canonical tag labels using word-boundary regex.
//      Phase 2 — LLM fallback (one gpt-4o-mini call, high recall). Triggered
//      only if Phase 1 yields < GATE_NORMALIZATION_MIN_PERSONA_TAGS
//      persona_defining tags.
//   3. Rejection decision — if still < 1 persona_defining tag after Phase 2,
//      the job is 'rejected' (tombstone). If Phase 2 LLM call fails, the job
//      is 'normalization_failed' (retryable — distinguished from 'rejected'
//      so a future sweep can re-process without re-running garbage).
//
// All decisions: MODULE_C_DECISIONS.md §4 (Normalization Rules).
//
// Server-only: touches the OpenAI API via the LLM fallback. Imported lazily
// inside the Inngest handler (AGENTS.md rule 2 — lazy imports).

import "server-only";

import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import { passesGateZero } from "@/lib/jobs/gate-zero";
import {
  extractLocationCountry,
  isSpecificLocation,
} from "@/lib/jobs/location-utils";
import { GATE_NORMALIZATION_MIN_PERSONA_TAGS } from "@/lib/jobs/matching-config";
import {
  plainTextToDescriptionHtml,
  sanitizeJobDescription,
} from "@/lib/jobs/sanitize-html";
import {
  CANONICAL_TAG_MAP,
  CANONICAL_TAGS,
  PERSONA_DEFINING_TAGS,
} from "@/lib/jobs/tech-tags";

// =============================================================================
// TYPES
// =============================================================================

/** The outcome of normalization — drives what the handler writes to the DB. */
export type NormalizationResult = {
  /** 'normalized' = tags + fullText ready for embedding + Gate 1+2.
   *  'rejected' = garbage job, tombstone (status='rejected', normalizedAt=NOW()).
   *  'normalization_failed' = LLM fallback failed, retryable
   *  (status='normalization_failed', NO normalizedAt). */
  status: "normalized" | "rejected" | "normalization_failed";
  /** Extracted canonical tag slugs (whatever was found, even for rejected jobs
   *  — useful for debugging why a job was rejected). */
  tags: string[];
  /** title + " " + cleanedDescription — the input to the embedder. */
  fullText: string;
  /** Sanitized, candidate-facing HTML for the job detail pages. */
  htmlDescription: string | null;
  /** AI-generated 1–2 sentence candidate-facing summary of the job. Set for
   *  normalized jobs; may be set on rejected jobs if the LLM produced one before
   *  the rejection decision. */
  summary?: string;
  /** Public job posting URL extracted from rawJson (the original listing page,
   *  not the application form). Persisted before G7 nullifies rawJson. */
  jobUrl?: string | null;
  /** Only set on normalization_failed — the error message for logging. */
  error?: string;
  /** Why the job was rejected — set when status='rejected' to distinguish
   *  title-only degradation ('title_only') from insufficient tags ('no_tags').
   *  Used for observability and metrics. */
  rejectionReason?: "title_only" | "no_tags";
};

/**
 * Minimum fullText length (chars) for a job to be considered normalizable.
 * Jobs with shorter text (title-only or near-title-only) produce poor
 * embeddings and waste LLM calls in Gate 3. They are rejected at normalization
 * time with rejectionReason='title_only'.
 *
 * This threshold matches MIN_FULLTEXT_LENGTH in smartrecruiters-detail.ts —
 * the detail fetch tries to enrich jobs below this threshold before they
 * reach normalization. If the detail fetch fails (or the ATS has no detail
 * endpoint), the job is rejected here.
 */
const MIN_NORMALIZABLE_FULLTEXT_LENGTH = 100;

/** Injectable LLM tag extractor — defaults to extractTagsLLM. Tests pass a
 *  mock to avoid hitting the OpenAI API. */
export type LlmTagExtractor = (fullText: string) => Promise<string[]>;

/** Injectable LLM summary extractor — defaults to summarizeJobLLM. Tests pass a
 *  mock to avoid hitting the OpenAI API. */
export type LlmSummaryExtractor = (
  fullText: string,
  title: string,
) => Promise<string | null>;

// =============================================================================
// ATS-SOURCE-AWARE CONTENT EXTRACTION (§4.1)
// =============================================================================

/**
 * Extract title + description from rawJson based on the ATS source.
 *
 * Each ATS platform stores the description under a different field name and
 * format:
 *   - Greenhouse: `content` (HTML)
 *   - Lever: `descriptionPlain` (plain text, preferred) / `description` (HTML)
 *   - Ashby: `descriptionPlain` (plain text, preferred) / `descriptionHtml` (HTML)
 *
 * HTML is stripped via a lightweight regex (no dependency added — checked
 * package.json, html-to-text is not installed). Common HTML entities are
 * decoded so the regex tag scan can find tags in entity-encoded text.
 *
 * Defensive handling: if atsSource is unknown or the expected field is
 * missing, returns { title: fallbackTitle, description: "", fullText:
 * fallbackTitle }. The normalizer proceeds with title-only text — the regex
 * scan may still find tags in the title, and the LLM fallback gets the title
 * as context. (MODULE_C_DECISIONS.md §4.1)
 *
 * G7 fast path (CORPUS_EXPANSION_TDD §1.1): if `normalizedText` is provided
 * (non-null, non-empty), it is returned directly as both `description` and
 * `fullText` — no rawJson parsing or HTML stripping needed. This is the
 * post-normalization read path used by gate3Evaluator and the dashboard. The
 * `rawJson` parameter accepts null to accommodate the G7 schema change
 * (rawJson is NULLed after normalization).
 */
export function extractJobContent(
  atsSource: string,
  rawJson: string | null,
  fallbackTitle: string,
  normalizedText?: string | null,
): {
  title: string;
  description: string;
  fullText: string;
  htmlDescription: string | null;
} {
  // G7 fast path: if normalizedText is already available (post-normalization),
  // return it directly. It's already HTML-stripped and cleaned — no parsing
  // or stripping needed. This is the read path used by gate3Evaluator and the
  // dashboard match detail page after the G7 migration.
  // htmlDescription is not recoverable from plain text here; callers should
  // read it from the persisted job.descriptionHtml column.
  if (typeof normalizedText === "string" && normalizedText.length > 0) {
    return {
      title: fallbackTitle,
      description: normalizedText,
      fullText: normalizedText,
      htmlDescription: null,
    };
  }

  // Legacy / pre-normalization path: parse rawJson.
  if (rawJson === null) {
    return {
      title: fallbackTitle,
      description: "",
      fullText: fallbackTitle,
      htmlDescription: null,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    // rawJson is not valid JSON — degrade to title-only.
    return {
      title: fallbackTitle,
      description: "",
      fullText: fallbackTitle,
      htmlDescription: null,
    };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return {
      title: fallbackTitle,
      description: "",
      fullText: fallbackTitle,
      htmlDescription: null,
    };
  }

  const obj = parsed as Record<string, unknown>;

  switch (atsSource) {
    case "greenhouse": {
      const title = typeof obj.title === "string" ? obj.title : fallbackTitle;
      const rawDesc = typeof obj.content === "string" ? obj.content : "";
      const description = stripHtml(rawDesc);
      const htmlDescription = toDescriptionHtml(rawDesc, true);
      return {
        title,
        description,
        fullText: `${title} ${description}`.trim(),
        htmlDescription,
      };
    }
    case "lever": {
      const title = typeof obj.text === "string" ? obj.text : fallbackTitle;
      // Prefer descriptionPlain (plain text, no stripping needed).
      // Fall back to description (HTML, needs stripping).
      // NOTE: Lever sometimes returns descriptionPlain as an empty string ("")
      // even when description (HTML) has content. Must check for non-empty
      // string, not just string type, to trigger the fallback.
      const plainDesc =
        typeof obj.descriptionPlain === "string" &&
        obj.descriptionPlain.length > 0
          ? obj.descriptionPlain
          : null;
      const rawDesc =
        plainDesc ??
        (typeof obj.description === "string" && obj.description.length > 0
          ? obj.description
          : "");
      const description = plainDesc ? plainDesc : stripHtml(rawDesc);

      // For display, prefer the HTML description when it exists; otherwise
      // convert the plain-text description to minimal HTML.
      const htmlDescRaw =
        typeof obj.description === "string" && obj.description.length > 0
          ? obj.description
          : null;
      const htmlDescription = htmlDescRaw
        ? toDescriptionHtml(htmlDescRaw, true)
        : plainDesc
          ? toDescriptionHtml(plainDesc, false)
          : null;

      // Lever jobs often store the actual tech requirements in a `lists`
      // array (sections like "Requirements", "Tech Stack", etc.) rather than
      // in the description fields. Extract and append list content so the
      // regex tag scan and LLM fallback can find tech keywords.
      const listsText = extractLeverLists(obj);

      return {
        title,
        description: listsText
          ? `${description} ${listsText}`.trim()
          : description,
        fullText: `${title} ${description} ${listsText}`.trim(),
        htmlDescription,
      };
    }
    case "ashby": {
      const title = typeof obj.title === "string" ? obj.title : fallbackTitle;
      // Prefer descriptionPlain (plain text, no stripping needed).
      // Fall back to descriptionHtml (HTML, needs stripping).
      // NOTE: The decisions doc §4.1 says Ashby uses `description`, but the
      // real Ashby API (validated via live smoke test 2026-06-23, see
      // ats-schemas.ts) has `descriptionHtml` and `descriptionPlain` — no
      // `description` field exists. Using the real field names per user
      // confirmation.
      // Same empty-string guard as Lever: some Ashby jobs return
      // descriptionPlain as "" even when descriptionHtml has content.
      const plainDesc =
        typeof obj.descriptionPlain === "string" &&
        obj.descriptionPlain.length > 0
          ? obj.descriptionPlain
          : null;
      const rawDesc =
        plainDesc ??
        (typeof obj.descriptionHtml === "string" &&
        obj.descriptionHtml.length > 0
          ? obj.descriptionHtml
          : "");
      const description = plainDesc ? plainDesc : stripHtml(rawDesc);
      const htmlDescRaw =
        typeof obj.descriptionHtml === "string" &&
        obj.descriptionHtml.length > 0
          ? obj.descriptionHtml
          : null;
      const htmlDescription = htmlDescRaw
        ? toDescriptionHtml(htmlDescRaw, true)
        : plainDesc
          ? toDescriptionHtml(plainDesc, false)
          : null;
      return {
        title,
        description,
        fullText: `${title} ${description}`.trim(),
        htmlDescription,
      };
    }
    case "smartrecruiters": {
      // SmartRecruiters calls the title "name". The list endpoint does NOT
      // include the job description — only the detail endpoint does.
      // Tier 1 enrichment (Sprint 4 Task 1): synthesize a pseudo-description
      // from the metadata fields the list endpoint DOES provide, to give the
      // embedding more semantic surface area without any extra API calls.
      // Tier 2 enrichment (Sprint 4 Task 7): if the detail endpoint was fetched
      // (jobAd.sections present in rawJson), extract the full description from
      // the jobAd sections instead of the synthesized pseudo-description.
      const title = typeof obj.name === "string" ? obj.name : fallbackTitle;

      // Tier 2: Check if jobAd.sections are present (detail endpoint was fetched)
      const jobAdObj = obj.jobAd;
      const jobAd =
        typeof jobAdObj === "object" && jobAdObj !== null
          ? (jobAdObj as Record<string, unknown>)
          : null;
      const sectionsObj = jobAd?.sections;
      const sections =
        typeof sectionsObj === "object" && sectionsObj !== null
          ? (sectionsObj as Record<string, Record<string, unknown>>)
          : null;

      if (sections) {
        // Extract text from jobAd sections (jobDescription, qualifications,
        // companyDescription, additionalInformation)
        const sectionTexts: string[] = [];
        const sectionHtmlParts: string[] = [];
        for (const key of [
          "jobDescription",
          "qualifications",
          "companyDescription",
          "additionalInformation",
        ]) {
          const section = sections[key];
          if (section) {
            const text = section.text;
            if (typeof text === "string" && text.length > 0) {
              sectionTexts.push(stripHtml(text));
              const sanitized = toDescriptionHtml(text, true);
              if (sanitized) {
                sectionHtmlParts.push(sanitized);
              }
            }
          }
        }
        if (sectionTexts.length > 0) {
          const description = sectionTexts.join("\n\n");
          const htmlDescription =
            sectionHtmlParts.length > 0 ? sectionHtmlParts.join("") : null;
          return {
            title,
            description,
            fullText: `${title} ${description}`.trim(),
            htmlDescription,
          };
        }
      }

      // Tier 1: synthesize a pseudo-description from metadata fields
      const parts: string[] = [title];

      // Department — department.label (e.g., "Engineering", "Data")
      const deptObj = obj.department;
      const dept =
        typeof deptObj === "object" && deptObj !== null
          ? (deptObj as Record<string, unknown>).label
          : null;
      if (typeof dept === "string" && dept.length > 0) {
        parts.push(`${dept} department`);
      }

      // Employment type — typeOfEmployment.label (e.g., "Full-time")
      const toeObj = obj.typeOfEmployment;
      const toe =
        typeof toeObj === "object" && toeObj !== null
          ? (toeObj as Record<string, unknown>).label
          : null;
      if (typeof toe === "string" && toe.length > 0) {
        parts.push(toe);
      }

      // Location — location.city, location.country, location.remote
      const locObj = obj.location;
      const loc =
        typeof locObj === "object" && locObj !== null
          ? (locObj as Record<string, unknown>)
          : {};
      const city = typeof loc.city === "string" ? loc.city : null;
      const country = typeof loc.country === "string" ? loc.country : null;
      const isRemote = loc.remote === true;
      if (isRemote) {
        parts.push("Remote");
      } else if (city && country) {
        parts.push(`${city}, ${country}`);
      } else if (city) {
        parts.push(city);
      }

      // Company name — company.name (if available in the list response)
      const companyObj = obj.company;
      const companyName =
        typeof companyObj === "object" && companyObj !== null
          ? (companyObj as Record<string, unknown>).name
          : null;
      if (typeof companyName === "string" && companyName.length > 0) {
        parts.push(`at ${companyName}`);
      }

      const fullText = parts.join(", ");
      // description stays empty — the list endpoint has no real description.
      // fullText is the synthesized pseudo-description used for embedding.
      return { title, description: "", fullText, htmlDescription: null };
    }
    case "workable": {
      const title = typeof obj.title === "string" ? obj.title : fallbackTitle;
      // Workable widget API with ?details=true includes `description` (HTML).
      const rawDesc =
        typeof obj.description === "string" && obj.description.length > 0
          ? obj.description
          : "";
      const description = stripHtml(rawDesc);
      const htmlDescription = toDescriptionHtml(rawDesc, true);
      return {
        title,
        description,
        fullText: `${title} ${description}`.trim(),
        htmlDescription,
      };
    }
    case "recruitee": {
      const title = typeof obj.title === "string" ? obj.title : fallbackTitle;
      // Recruitee provides `description` and `requirements` as plain text.
      const desc =
        typeof obj.description === "string" && obj.description.length > 0
          ? obj.description
          : "";
      const req =
        typeof obj.requirements === "string" && obj.requirements.length > 0
          ? obj.requirements
          : "";
      const description = `${desc} ${req}`.trim();
      const htmlDescription = toDescriptionHtml(
        [desc, req].filter(Boolean).join("\n\n"),
        false,
      );
      return {
        title,
        description,
        fullText: `${title} ${description}`.trim(),
        htmlDescription,
      };
    }
    default: {
      // Unknown ATS source — degrade to title-only.
      return {
        title: fallbackTitle,
        description: "",
        fullText: fallbackTitle,
        htmlDescription: null,
      };
    }
  }
}

// =============================================================================
// ATS-SOURCE-AWARE JOB URL EXTRACTION
// =============================================================================

/**
 * Extract the hosted job-posting URL from rawJson based on the ATS source.
 *
 * Each ATS platform stores the per-job URL under a different field name:
 *   - Greenhouse: `absolute_url` (required by the schema)
 *   - Lever:      `hostedUrl`    (required by the schema)
 *   - Ashby:      `jobUrl` (optional — some boards omit it)
 *
 * Returns null when the URL is absent or rawJson is unparseable. Callers
 * should fall back to the company-wide hosted board URL
 * (`ATS_ENDPOINTS[source].hostedBoard(slug)`) in that case.
 *
 * Used by the match detail page to link users directly to the specific job
 * posting rather than the company's full job board (which may list hundreds
 * of openings, making the matched job hard to find).
 */
export function extractJobUrl(
  atsSource: string,
  rawJson: string | null,
): string | null {
  if (rawJson === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;

  const obj = parsed as Record<string, unknown>;
  const field =
    atsSource === "greenhouse"
      ? "absolute_url"
      : atsSource === "lever"
        ? "hostedUrl"
        : atsSource === "ashby"
          ? "jobUrl"
          : atsSource === "smartrecruiters"
            ? "postingUrl"
            : atsSource === "workable"
              ? "url"
              : atsSource === "recruitee"
                ? "careers_url"
                : null;

  if (!field) return null;
  const value = obj[field];
  return typeof value === "string" && value.length > 0 ? value : null;
}

// =============================================================================
// ATS-SOURCE-AWARE METADATA EXTRACTION
// =============================================================================

/** The standardized metadata extracted from rawJson, independent of ATS source. */
export type JobMetadata = {
  /** Normalized to "remote" | "hybrid" | "on-site" | null.
   *  NULL only when the ATS provides no workplace designation AND no location
   *  name (truly unknown). When a location name exists but no remote/hybrid
   *  keywords are found, defaults to "on-site" (Gate 0.5 Pattern 3 fix). */
  workplaceType: "remote" | "hybrid" | "on-site" | null;
  /** Normalized to "full-time" | "part-time" | "contract" | "internship" | null.
   *  NULL when the ATS doesn't provide it. */
  employmentType: string | null;
  /** Raw location string as provided by the ATS (no normalization). */
  locationName: string | null;
  /** Department string (Greenhouse departments[0].name, Lever categories.department, Ashby department). */
  department: string | null;
  /** Team string (Lever categories.team, Ashby team). */
  team: string | null;
  /** Direct application URL (Lever applyUrl, Ashby applyUrl). */
  applyUrl: string | null;
  /** When the job was published (Greenhouse first_published, Lever createdAt ms, Ashby publishedAt). */
  publishedAt: Date | null;
  /** Whether the source considers this job currently active/open. */
  isActive: boolean;
  /** Company name (Greenhouse only — Lever/Ashby don't include it in the job object). */
  companyName: string | null;
  // ── Gate 0.5 hard-blocker fields (added July 2026) ──────────────────────
  /** Region tag parsed from the job title (e.g., "- Latam", "- APAC"). NULL
   *  when the title has no region suffix. Drives Gate 0.5 Pattern 1. */
  titleRegionTag: string | null;
  /** Structured country list from ATS APIs (Ashby). NULL when not available —
   *  Gate 0.5 falls back to locationName parsing. Drives Pattern 2. */
  locationCountries: string[] | null;
  /** Experience range parsed from the job description. NULL when no explicit
   *  years requirement is found. Drives Gate 0.5 Check 5. */
  experienceMinYears: number | null;
  experienceMaxYears: number | null;
  /** Compensation range from ATS APIs (Ashby compensation, Lever salaryRange).
   *  NULL when the ATS doesn't provide it. Drives Gate 0.5 Check 4. */
  compensationMin: number | null;
  compensationMax: number | null;
  compensationCurrency: string | null;
  // ── Remote scope (added July 2026 — zero-match fix, extended v2) ──────────
  /** Distinguishes global remote from country-fenced remote. v2 adds
   *  region_fenced, onsite, and undetermined (see remoteScopeEnum).
   *  - "global": JD/location indicates worldwide remote (no country restriction)
   *  - "country_fenced": JD/location restricts to specific countries
   *  - "region_fenced": JD/location restricts to a broad region (Latam, APAC)
   *  - "onsite": JD or ATS metadata indicates on-site/hybrid, no remote option
   *  - "unknown": couldn't be determined (legacy — Gate 3 LLM evaluates)
   *  - "undetermined": v2 terminal — Step 1 + Step 2 ladder exhausted retries
   * Only meaningful when workplaceType is "remote" or null. */
  remoteScope:
    | "global"
    | "country_fenced"
    | "region_fenced"
    | "onsite"
    | "unknown"
    | "undetermined";
};

/**
 * Extract standardized metadata from rawJson based on the ATS source.
 *
 * This function normalizes fields that are stored under different names and
 * formats across the three ATS platforms:
 *
 *   workplaceType:
 *     - Lever:  "onsite" → "on-site", "hybrid" → "hybrid", "remote" → "remote",
 *               "unspecified" → null
 *     - Ashby:  "OnSite" → "on-site", "Remote" → "remote", "Hybrid" → "hybrid",
 *               null → null
 *     - Greenhouse: No structured field. Heuristic: location.name contains
 *               "remote" (case-insensitive) → "remote", else null.
 *
 *   employmentType:
 *     - Lever:  categories.commitment ("Full-time" → "full-time", etc.)
 *     - Ashby:  employmentType ("FullTime" → "full-time", "PartTime" → "part-time",
 *               "Contract" → "contract", "Intern" → "internship",
 *               "Temporary" → "contract")
 *     - Greenhouse: null (not reliably available)
 *
 * Defensive: returns all-null metadata if rawJson is unparseable or the ATS
 * source is unknown.
 */
export function extractJobMetadata(
  atsSource: string,
  rawJson: string | null,
): JobMetadata {
  const empty: JobMetadata = {
    workplaceType: null,
    employmentType: null,
    locationName: null,
    department: null,
    team: null,
    applyUrl: null,
    publishedAt: null,
    isActive: true,
    companyName: null,
    titleRegionTag: null,
    locationCountries: null,
    experienceMinYears: null,
    experienceMaxYears: null,
    compensationMin: null,
    compensationMax: null,
    compensationCurrency: null,
    remoteScope: "unknown",
  };

  if (rawJson === null) return empty;

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return empty;
  }
  if (typeof parsed !== "object" || parsed === null) return empty;

  const obj = parsed as Record<string, unknown>;

  switch (atsSource) {
    case "greenhouse":
      return extractGreenhouseMetadata(obj);
    case "lever":
      return extractLeverMetadata(obj);
    case "ashby":
      return extractAshbyMetadata(obj);
    case "smartrecruiters":
      return extractSmartRecruitersMetadata(obj);
    case "workable":
      return extractWorkableMetadata(obj);
    case "recruitee":
      return extractRecruiteeMetadata(obj);
    default:
      return empty;
  }
}

/**
 * Extract country codes from a location string for the locationCountries field.
 *
 * F1 fix (July 2026): ATS APIs (Greenhouse, Lever, Ashby) don't provide
 * structured country lists — they provide free-text location_name like
 * "Remote - USA" or "United States". The remote scope extractor classifies
 * these as country_fenced but nobody populated location_countries, leaving
 * 780 jobs with country_fenced + NULL location_countries. This helper
 * extracts the ISO code from the location string so the metadata is complete.
 *
 * @returns Array of ISO 3166-1 alpha-2 codes, or null if no country found.
 */
function extractCountriesFromLocation(
  locationName: string | null,
): string[] | null {
  if (!locationName) return null;
  const country = extractLocationCountry(locationName);
  return country ? [country] : null;
}

function extractGreenhouseMetadata(obj: Record<string, unknown>): JobMetadata {
  // Location — nested object { name: string }
  const locationObj = obj.location;
  const locationName =
    typeof locationObj === "object" && locationObj !== null
      ? (((locationObj as Record<string, unknown>).name as string) ?? null)
      : null;

  // Workplace type — Greenhouse has no structured field. Use location heuristic.
  // Check for "remote", "hybrid", and "on-site"/"in-office" keywords in the
  // location name. Order matters: check "hybrid" before "remote" because some
  // locations say "Hybrid - Remote" and should be classified as hybrid.
  let workplaceType: JobMetadata["workplaceType"] = null;
  if (locationName) {
    if (/hybrid/i.test(locationName)) {
      workplaceType = "hybrid";
    } else if (/remote/i.test(locationName)) {
      workplaceType = "remote";
    } else if (/on-?site|in-?office/i.test(locationName)) {
      workplaceType = "on-site";
    }
  }

  // Gate 0.5 Pattern 3 fix: when a Greenhouse job has a location name but no
  // remote/hybrid keywords were found, default to "on-site" rather than null.
  // This catches jobs like "Bengaluru, Karnataka, India" that are on-site but
  // don't explicitly say so. The content fallback below may still override
  // this if it finds explicit remote/hybrid language in the description.

  // Fallback: scan the job description content for workplace-type phrases.
  // Greenhouse has no structured workplace field, so 84.9% of jobs had NULL
  // workplace_type with the location heuristic alone (location names like
  // "San Francisco, CA" don't contain remote/hybrid keywords). The content
  // field (HTML description, available with ?content=true) often contains
  // explicit workplace-type statements. This fallback only runs when the
  // location heuristic returned null, so it never overrides the more
  // reliable location-based detection.
  if (workplaceType === null) {
    const content =
      typeof obj.content === "string" && obj.content.length > 0
        ? obj.content
        : null;
    if (content) {
      // Check hybrid first — some hybrid descriptions mention "remote" too.
      // Use phrase-level matching to reduce false positives (e.g., "remote
      // access" or "remote monitoring" should not trigger "remote").
      if (
        /\bhybrid\b/i.test(content) ||
        /\b(?:mix|combination)\s+of\s+(?:remote|in[- ]office|on[- ]site)/i.test(
          content,
        ) ||
        /\b\d\s*[-–]?\s*\d\s*days?\s+(?:in\s+office|on[- ]site)/i.test(content)
      ) {
        workplaceType = "hybrid";
      } else if (
        /\b(?:fully|100%|all[- ])\s*remote\b/i.test(content) ||
        /\bremote[- ]first\b/i.test(content) ||
        /\bwork\s+from\s+home\b/i.test(content) ||
        /\bwork\s+remotely\b/i.test(content) ||
        /\bremote\s+(?:work|position|opportunity|role|job|eligible|arrangement)\b/i.test(
          content,
        ) ||
        // ── Expanded patterns (July 2026 zero-match fix) ──────────────────
        // These match the global-remote indicators that Gate 3's LLM looks
        // for. Adding them at normalization time reduces the number of jobs
        // with null workplaceType that need LLM evaluation, improving
        // metadata quality and reducing Gate 3 cost.
        /\b(?:global[,\s]+remote|remote[,\s]+global)\b/i.test(content) ||
        /\bremote[- ]first\s+(?:organization|company|team|startup)\b/i.test(
          content,
        ) ||
        /\bwork\s+from\s+anywhere\b/i.test(content) ||
        /\bwork\s+from\s+any\s+location\b/i.test(content) ||
        /\bany\s+country\b/i.test(content) ||
        /\bany\s+location\b/i.test(content) ||
        /\bworldwide\b/i.test(content) ||
        /\bdistributed\s+(?:team|workforce|company|organization)\b/i.test(
          content,
        ) ||
        /\bteam\s+members\s+across\s+\d+\s+countries\b/i.test(content) ||
        /\boperates?\s+in\s+\d+\s+countries\b/i.test(content) ||
        /\bremote\s*[-–]\s*(?:global|worldwide|anywhere)\b/i.test(content)
      ) {
        workplaceType = "remote";
      } else if (
        /\bon[- ]site\b/i.test(content) ||
        /\bin[- ]office\b/i.test(content) ||
        /\bmust\s+(?:work|be)\s+(?:from|in|on[- ]site)\b/i.test(content) ||
        /\bin[- ]person\b/i.test(content)
      ) {
        workplaceType = "on-site";
      }
    }
  }

  // ── Revision July 2026 (zero-match root cause fix) ──────────────────────
  // Previously, if workplaceType was still null after both heuristics, we
  // defaulted to "on-site" when a location name existed. This caused ~85% of
  // Greenhouse jobs to be classified as on-site and then hard-rejected by
  // Gate 0.5 Check 3 for remote-only applicants — producing zero matches.
  //
  // Now we KEEP null when undetermined. Gate 0.5 Check 3 only hard-rejects
  // EXPLICIT on-site jobs. Jobs with null workplaceType are passed to Gate 3
  // (LLM), which reads the full JD text to determine remote/on-site status.
  // This trades a small increase in Gate 3 LLM cost for a large increase in
  // recall — critical for the core "10+ daily matches" promise.
  //
  // See docs/reports/EXTERNAL_AUDIT_TECHNICAL_OVERVIEW.md §7.1 for root cause.

  // Company name — undocumented but present in 100% of Greenhouse responses
  const companyName =
    typeof obj.company_name === "string" && obj.company_name.length > 0
      ? obj.company_name
      : null;

  // Published date — undocumented but present (first_published, ISO 8601)
  const publishedAt = parseDate(obj.first_published);

  // Department — only available with ?content=true (departments array)
  const departments = obj.departments;
  let department: string | null = null;
  if (Array.isArray(departments) && departments.length > 0) {
    const first = departments[0] as Record<string, unknown>;
    if (typeof first?.name === "string") department = first.name;
  }

  // Gate 0.5: Extract title region tag and experience range
  const titleStr = typeof obj.title === "string" ? obj.title : "";
  const titleRegionTag = parseTitleRegionTag(titleStr);
  const contentForExp =
    typeof obj.content === "string" && obj.content.length > 0
      ? obj.content
      : "";
  const experienceRange = parseExperienceRange(
    `${titleStr} ${stripHtml(contentForExp)}`,
  );

  return {
    workplaceType,
    employmentType: null, // Not reliably available for Greenhouse
    locationName,
    department,
    team: null, // Greenhouse doesn't have a separate team field
    applyUrl: null, // Not in the list endpoint
    publishedAt,
    isActive: true,
    companyName,
    titleRegionTag,
    locationCountries: extractCountriesFromLocation(locationName), // F1: extract from location string
    experienceMinYears: experienceRange?.min ?? null,
    experienceMaxYears: experienceRange?.max ?? null,
    compensationMin: null, // Greenhouse public API doesn't provide compensation
    compensationMax: null,
    compensationCurrency: null,
    remoteScope: inferRemoteScope(
      locationName,
      typeof obj.content === "string" ? obj.content : null,
      workplaceType,
    ),
  };
}

function extractLeverMetadata(obj: Record<string, unknown>): JobMetadata {
  const categories =
    typeof obj.categories === "object" && obj.categories !== null
      ? (obj.categories as Record<string, unknown>)
      : {};

  const locationName =
    typeof categories.location === "string" ? categories.location : null;

  // Workplace type — Lever uses lowercase: "onsite", "hybrid", "remote", "unspecified"
  const rawWorkplace = obj.workplaceType;
  let workplaceType: JobMetadata["workplaceType"] = null;
  if (typeof rawWorkplace === "string") {
    switch (rawWorkplace.toLowerCase()) {
      case "remote":
        workplaceType = "remote";
        break;
      case "hybrid":
        workplaceType = "hybrid";
        break;
      case "on-site":
      case "onsite":
        workplaceType = "on-site";
        break;
      // "unspecified" or anything else → null
    }
  }

  // Employment type — from categories.commitment ("Full-time", "Part-time", etc.)
  const employmentType = normalizeLeverCommitment(categories.commitment);

  // Department and team
  const department =
    typeof categories.department === "string" ? categories.department : null;
  const team = typeof categories.team === "string" ? categories.team : null;

  // Apply URL
  const applyUrl =
    typeof obj.applyUrl === "string" && obj.applyUrl.length > 0
      ? obj.applyUrl
      : null;

  // Published date — createdAt is epoch milliseconds (confirmed via GitHub #35)
  const publishedAt = parseEpochMs(obj.createdAt);

  // Gate 0.5: Extract title region tag, experience range, and compensation
  const titleStr = typeof obj.text === "string" ? obj.text : "";
  const titleRegionTag = parseTitleRegionTag(titleStr);
  const descPlain =
    typeof obj.descriptionPlain === "string" ? obj.descriptionPlain : "";
  const descHtml = typeof obj.description === "string" ? obj.description : "";
  const experienceRange = parseExperienceRange(
    `${titleStr} ${descPlain || stripHtml(descHtml)}`,
  );
  const compensation = extractLeverCompensation(obj);

  return {
    workplaceType,
    employmentType,
    locationName,
    department,
    team,
    applyUrl,
    publishedAt,
    isActive: true,
    companyName: null, // Lever v0 doesn't include company name in the job object
    titleRegionTag,
    locationCountries: extractCountriesFromLocation(locationName), // F1: extract from location string
    experienceMinYears: experienceRange?.min ?? null,
    experienceMaxYears: experienceRange?.max ?? null,
    compensationMin: compensation.min,
    compensationMax: compensation.max,
    compensationCurrency: compensation.currency,
    remoteScope: inferRemoteScope(
      locationName,
      descPlain || descHtml,
      workplaceType,
    ),
  };
}

function extractAshbyMetadata(obj: Record<string, unknown>): JobMetadata {
  const locationName = typeof obj.location === "string" ? obj.location : null;

  // Workplace type — Ashby uses PascalCase: "OnSite", "Remote", "Hybrid", null
  const rawWorkplace = obj.workplaceType;
  let workplaceType: JobMetadata["workplaceType"] = null;
  if (typeof rawWorkplace === "string") {
    switch (rawWorkplace) {
      case "Remote":
        workplaceType = "remote";
        break;
      case "Hybrid":
        workplaceType = "hybrid";
        break;
      case "OnSite":
        workplaceType = "on-site";
        break;
    }
  }

  // Fallback: isRemote field (string "true"/"false" or boolean, or null)
  if (workplaceType === null) {
    const isRemote = obj.isRemote;
    if (isRemote === true || isRemote === "true") {
      workplaceType = "remote";
    }
  }

  // Employment type — Ashby uses PascalCase: "FullTime", "PartTime", etc.
  const employmentType = normalizeAshbyEmploymentType(obj.employmentType);

  // Department and team
  const department = typeof obj.department === "string" ? obj.department : null;
  const team = typeof obj.team === "string" ? obj.team : null;

  // Apply URL
  const applyUrl =
    typeof obj.applyUrl === "string" && obj.applyUrl.length > 0
      ? obj.applyUrl
      : null;

  // Published date — publishedAt is ISO 8601
  const publishedAt = parseDate(obj.publishedAt);

  // Gate 0.5: Extract title region tag, experience range, and compensation
  const titleStr = typeof obj.title === "string" ? obj.title : "";
  const titleRegionTag = parseTitleRegionTag(titleStr);
  const descPlain =
    typeof obj.descriptionPlain === "string" ? obj.descriptionPlain : "";
  const descHtml =
    typeof obj.descriptionHtml === "string" ? obj.descriptionHtml : "";
  const experienceRange = parseExperienceRange(
    `${titleStr} ${descPlain || stripHtml(descHtml)}`,
  );
  const compensation = extractAshbyCompensation(obj);

  return {
    workplaceType,
    employmentType,
    locationName,
    department,
    team,
    applyUrl,
    publishedAt,
    isActive: true,
    companyName: null, // Ashby Public API doesn't include company name
    titleRegionTag,
    locationCountries: extractCountriesFromLocation(locationName), // F1: extract from location string
    experienceMinYears: experienceRange?.min ?? null,
    experienceMaxYears: experienceRange?.max ?? null,
    compensationMin: compensation.min,
    compensationMax: compensation.max,
    compensationCurrency: compensation.currency,
    remoteScope: inferRemoteScope(
      locationName,
      descPlain || descHtml,
      workplaceType,
    ),
  };
}

// ── SmartRecruiters metadata extraction (F2) ─────────────────────────────────

function extractSmartRecruitersMetadata(
  obj: Record<string, unknown>,
): JobMetadata {
  // Location — nested object { city, region, country, remote }
  const locationObj = obj.location;
  const loc =
    typeof locationObj === "object" && locationObj !== null
      ? (locationObj as Record<string, unknown>)
      : {};
  const city = typeof loc.city === "string" ? loc.city : null;
  const region = typeof loc.region === "string" ? loc.region : null;
  const country = typeof loc.country === "string" ? loc.country : null;
  const locationName =
    [city, region, country].filter(Boolean).join(", ") || null;

  // Workplace type — SmartRecruiters uses location.remote and location.hybrid
  // (booleans). Check hybrid first so "Remote + Hybrid" jobs classify as hybrid.
  let workplaceType: JobMetadata["workplaceType"] = null;
  if (loc.hybrid === true) {
    workplaceType = "hybrid";
  } else if (loc.remote === true) {
    workplaceType = "remote";
  }

  // Employment type — typeOfEmployment.label ("Full-time", "Permanent", etc.)
  const toeObj = obj.typeOfEmployment;
  const toe =
    typeof toeObj === "object" && toeObj !== null
      ? (toeObj as Record<string, unknown>)
      : {};
  const employmentType = normalizeEmploymentTypeLabel(toe.label);

  // Department — department.label
  const deptObj = obj.department;
  const dept =
    typeof deptObj === "object" && deptObj !== null
      ? (deptObj as Record<string, unknown>)
      : {};
  const department = typeof dept.label === "string" ? dept.label : null;

  // Company name — company.name
  const companyObj = obj.company;
  const company =
    typeof companyObj === "object" && companyObj !== null
      ? (companyObj as Record<string, unknown>)
      : {};
  const companyName =
    typeof company.name === "string" && company.name.length > 0
      ? company.name
      : null;

  // Published date — releasedDate (ISO 8601)
  const publishedAt = parseDate(obj.releasedDate);

  // Gate 0.5: Extract title region tag and experience range
  const titleStr = typeof obj.name === "string" ? obj.name : "";
  const titleRegionTag = parseTitleRegionTag(titleStr);
  const experienceRange = parseExperienceRange(titleStr);

  return {
    workplaceType,
    employmentType,
    locationName,
    department,
    team: null,
    applyUrl: null,
    publishedAt,
    isActive: parseIsActiveStatus("smartrecruiters", obj),
    companyName,
    titleRegionTag,
    locationCountries: extractCountriesFromLocation(locationName), // F1: extract from location string
    experienceMinYears: experienceRange?.min ?? null,
    experienceMaxYears: experienceRange?.max ?? null,
    compensationMin: null,
    compensationMax: null,
    compensationCurrency: null,
    remoteScope: inferRemoteScope(locationName, titleStr, workplaceType),
  };
}

// ── Workable metadata extraction (F2) ────────────────────────────────────────

function extractWorkableMetadata(obj: Record<string, unknown>): JobMetadata {
  // Location — nested object { city, region, country }
  const locationObj = obj.location;
  const loc =
    typeof locationObj === "object" && locationObj !== null
      ? (locationObj as Record<string, unknown>)
      : {};
  const city = typeof loc.city === "string" ? loc.city : null;
  const region = typeof loc.region === "string" ? loc.region : null;
  const country = typeof loc.country === "string" ? loc.country : null;
  const locationName =
    [city, region, country].filter(Boolean).join(", ") || null;

  // Workplace type — Workable uses lowercase: "remote", "hybrid", "on_site"
  const rawWorkplace = obj.workplace;
  let workplaceType: JobMetadata["workplaceType"] = null;
  if (typeof rawWorkplace === "string") {
    switch (rawWorkplace.toLowerCase()) {
      case "remote":
        workplaceType = "remote";
        break;
      case "hybrid":
        workplaceType = "hybrid";
        break;
      case "on_site":
      case "onsite":
        workplaceType = "on-site";
        break;
    }
  }

  // Employment type — "Full-time", "Part-time", "Contract", etc.
  const employmentType = normalizeEmploymentTypeLabel(obj.employmentType);

  // Department
  const department = typeof obj.department === "string" ? obj.department : null;

  // Company name
  const companyName =
    typeof obj.companyName === "string" && obj.companyName.length > 0
      ? obj.companyName
      : null;

  // Apply URL
  const applyUrl =
    typeof obj.applyUrl === "string" && obj.applyUrl.length > 0
      ? obj.applyUrl
      : null;

  // Published date — publishedAt (ISO date or YYYY-MM-DD)
  const publishedAt = parseDate(obj.publishedAt);

  // Gate 0.5: Extract title region tag and experience range
  const titleStr = typeof obj.title === "string" ? obj.title : "";
  const titleRegionTag = parseTitleRegionTag(titleStr);
  const descStr = typeof obj.description === "string" ? obj.description : "";
  const experienceRange = parseExperienceRange(`${titleStr} ${descStr}`);

  return {
    workplaceType,
    employmentType,
    locationName,
    department,
    team: null,
    applyUrl,
    publishedAt,
    isActive: true,
    companyName,
    titleRegionTag,
    locationCountries: extractCountriesFromLocation(locationName), // F1: extract from location string
    experienceMinYears: experienceRange?.min ?? null,
    experienceMaxYears: experienceRange?.max ?? null,
    compensationMin: null,
    compensationMax: null,
    compensationCurrency: null,
    remoteScope: inferRemoteScope(locationName, descStr, workplaceType),
  };
}

// ── Recruitee metadata extraction (F2) ───────────────────────────────────────

function extractRecruiteeMetadata(obj: Record<string, unknown>): JobMetadata {
  // Location — first entry in locations array
  const locations = obj.locations;
  let locationName: string | null = null;
  if (Array.isArray(locations) && locations.length > 0) {
    const first = locations[0] as Record<string, unknown>;
    const city = typeof first?.city === "string" ? first.city : null;
    const country = typeof first?.country === "string" ? first.country : null;
    locationName = [city, country].filter(Boolean).join(", ") || null;
  }

  // Workplace type — Recruitee uses separate boolean flags
  let workplaceType: JobMetadata["workplaceType"] = null;
  if (obj.remote === true) {
    workplaceType = "remote";
  } else if (obj.hybrid === true) {
    workplaceType = "hybrid";
  } else if (obj.on_site === true) {
    workplaceType = "on-site";
  }

  // Employment type — employment_type_code: "fulltime_permanent", "contract", etc.
  const employmentType = normalizeRecruiteeEmploymentType(
    obj.employment_type_code,
  );

  // Department
  const department = typeof obj.department === "string" ? obj.department : null;

  // Company name
  const companyName =
    typeof obj.company_name === "string" && obj.company_name.length > 0
      ? obj.company_name
      : null;

  // Apply URL
  const applyUrl =
    typeof obj.careers_apply_url === "string" &&
    obj.careers_apply_url.length > 0
      ? obj.careers_apply_url
      : null;

  // Published date — published_at (e.g. "20**-09-26 10:46:21 UTC")
  const publishedAt = parseDate(obj.published_at);

  // Gate 0.5: Extract title region tag and experience range
  const titleStr = typeof obj.title === "string" ? obj.title : "";
  const titleRegionTag = parseTitleRegionTag(titleStr);
  const descStr = typeof obj.description === "string" ? obj.description : "";
  const reqStr = typeof obj.requirements === "string" ? obj.requirements : "";
  const experienceRange = parseExperienceRange(
    `${titleStr} ${descStr} ${reqStr}`,
  );

  return {
    workplaceType,
    employmentType,
    locationName,
    department,
    team: null,
    applyUrl,
    publishedAt,
    isActive: parseIsActiveStatus("recruitee", obj),
    companyName,
    titleRegionTag,
    locationCountries: extractCountriesFromLocation(locationName), // F1: extract from location string
    experienceMinYears: experienceRange?.min ?? null,
    experienceMaxYears: experienceRange?.max ?? null,
    compensationMin: null,
    compensationMax: null,
    compensationCurrency: null,
    remoteScope: inferRemoteScope(
      locationName,
      `${descStr} ${reqStr}`,
      workplaceType,
    ),
  };
}

// =============================================================================
// GATE 0.5 METADATA EXTRACTION HELPERS (added July 2026)
// =============================================================================
// These helpers extract the new Gate 0.5 fields from job titles, descriptions,
// and ATS-specific raw JSON structures. They are called from the per-ATS
// extraction functions above. See docs/reports/GATE_0_5_GEO_FENCING_HANDOFF.md.

/**
 * Region tag patterns found in job titles. Companies use these as suffixes
 * to geo-fence roles (e.g., "Software Engineer - Latam"). Only suffix patterns
 * (after a dash) are matched to avoid false positives like "India Engineer".
 */
const TITLE_REGION_PATTERNS: readonly { pattern: RegExp; region: string }[] = [
  // Latin America
  { pattern: /-?\s*(Latam|LatAm|Latin\s*America)\b/i, region: "Latam" },
  // Asia-Pacific
  { pattern: /-?\s*(APAC|Asia[- ]?Pacific)\b/i, region: "APAC" },
  // Europe/Middle East/Africa
  {
    pattern: /-?\s*(EMEA|Europe[- ]?Middle[- ]?East[- ]?Africa)\b/i,
    region: "EMEA",
  },
  // Sub-regions
  { pattern: /-?\s*(Balkans|Eastern\s*Europe)\b/i, region: "Eastern Europe" },
  // Single-country suffixes (common in geo-fenced postings)
  { pattern: /-?\s*India\b/i, region: "India" },
  {
    pattern: /-?\s*(US[- ]?Only|United\s*States[- ]?Only)\b/i,
    region: "US Only",
  },
  { pattern: /-?\s*(Canada[- ]?Only)\b/i, region: "Canada Only" },
];

// =============================================================================
// REMOTE SCOPE INFERENCE (July 2026 — zero-match fix, extended v2)
// =============================================================================
// v2 (company-corpus-expansion-new.md Criterion 2): The full extraction ladder
// (Step 1 deterministic → Step 2 LLM → hard-fail) lives in
// remote-scope-extractor.ts. This function is the synchronous Step 1-only
// path used during metadata extraction — it returns a best-effort scope
// without calling the LLM. The full ladder (with Step 2 LLM fallback) is
// invoked asynchronously from the normalizer's main flow.
//
// The v2 enum adds region_fenced, onsite, and undetermined. This function
// returns the Step 1 subset; the full ladder may produce any value.

/**
 * Global remote indicator patterns. If the location name or job content
 * matches any of these, the job is classified as `remote_scope = "global"`.
 * These match the same indicators that Gate 3's LLM looks for in JD text.
 */
const GLOBAL_REMOTE_PATTERNS: RegExp[] = [
  /\bremote\s*[-–]\s*(?:global|worldwide|anywhere)\b/i,
  /\b(?:global[,\s]+remote|remote[,\s]+global)\b/i,
  /\bremote[- ]first\s+(?:organization|company|team|startup)\b/i,
  /\bwork\s+from\s+anywhere\b/i,
  /\bwork\s+from\s+any\s+location\b/i,
  /\bany\s+country\b/i,
  /\bany\s+location\b/i,
  /\bworldwide\b/i,
  /\bdistributed\s+(?:team|workforce|company|organization)\b/i,
  /\bteam\s+members\s+across\s+\d+\s+countries\b/i,
  /\boperates?\s+in\s+\d+\s+countries\b/i,
  // D26: "anywhere in the world" / "anywhere in the World" — must be checked
  // BEFORE country extraction, otherwise "in" matches the India country code.
  // This is the negative-case fixture for the HONK/silver regression suite.
  /\banywhere\s+in\s+the\s+world\b/i,
  /\banywhere\s+in\s+the\s+globe\b/i,
];

/**
 * Country-fenced remote indicator patterns. If the location name matches any
 * of these, the job is classified as `remote_scope = "country_fenced"`.
 * These detect remote jobs that restrict applications to specific countries
 * or regions (e.g., "Remote - US Only", "Remote within EU").
 */
const COUNTRY_FENCED_REMOTE_PATTERNS: RegExp[] = [
  /\bremote\s*[-–]\s*(?:us|usa|united\s+states|u\.s\.)\b/i,
  /\bremote\s*[-–]\s*(?:uk|united\s+kingdom|england)\b/i,
  /\bremote\s*[-–]\s*(?:eu|europe|european\s+union)\b/i,
  /\bremote\s*[-–]\s*(?:germany|france|spain|italy|netherlands|poland|portugal)\b/i,
  /\bremote\s*[-–]\s*(?:canada|australia|india|brazil|mexico|argentina|colombia)\b/i,
  /\bremote\s*[-–]\s*(?:latam|apac|emea|balkans|eastern\s+europe)\b/i,
  /\bremote\s+(?:within|in|only|restricted)\b/i,
  /\bmust\s+(?:be\s+)?(?:located|reside)\s+in\b/i,
  /\b(?:us|uk|eu)\s+only\b/i,
  /\bnorth\s+america\s+only\b/i,
  // Directive 09 Part A.3 — false-global classifier audit patterns:
  /\bauthorized\s+to\s+work\s+in\s+(?:the\s+)?(?:united\s+states|us|u\.s\.|india|canada|philippines|uk|australia|germany|france)\b/i,
  /\bmust\s+be\s+based\s+in\s+(?:the\s+)?(?:united\s+states|us|u\.s\.|india|canada|uk|australia)\b/i,
  /\beligible\s+to\s+work\s+in\s+(?:the\s+)?(?:united\s+states|us|canada|uk|australia|germany|france)\b/i,
  /\bmust\s+be\s+a\s+(?:united\s+states|us|u\.s\.)\s+citizen\b/i,
  /\bremote\s+within\s+(?:the\s+)?(?:united\s+states|colombia|india|canada|uk|australia)\b/i,
  // D26: HONK exhibit — "thrive from anywhere in the US" / "anywhere in the US"
  // was classified as global because "anywhere" matched a global pattern but
  // "in the US" wasn't caught by the country-fenced patterns. This pattern
  // explicitly fences "anywhere in the US/United States" variants.
  /\banywhere\s+in\s+(?:the\s+)?(?:us|u\.s\.|usa|united\s+states|uk|u\.k\.|united\s+kingdom|canada|australia|germany|france|spain|italy|netherlands|poland|portugal|india|brazil|mexico|argentina|colombia)\b/i,
  /\bthrive\s+from\s+anywhere\s+in\s+(?:the\s+)?(?:us|u\.s\.|usa|united\s+states)\b/i,
];

/**
 * Infer the remote scope (global vs country-fenced vs region_fenced vs onsite
 * vs unknown) from the job's location name and content text.
 *
 * This is the synchronous Step 1-only path (deterministic regex, zero LLM
 * cost). The full Step 1 → Step 2 ladder (with LLM fallback) lives in
 * remote-scope-extractor.ts and is invoked asynchronously from the
 * normalizer's main flow for jobs where Step 1 is inconclusive.
 *
 * When the heuristic is uncertain, it returns "unknown" (legacy default) —
 * the full ladder may later upgrade this to "undetermined" (v2 terminal) if
 * Step 2 also fails. Gate 0.5 treats both as pass-through to Gate 3.
 *
 * @param locationName The raw location string from the ATS
 * @param content The job description content (HTML or plain text), nullable
 * @param workplaceType The detected workplace type (remote/hybrid/on-site/null)
 * @returns "global" | "country_fenced" | "region_fenced" | "onsite" | "unknown"
 */
export function inferRemoteScope(
  locationName: string | null,
  content: string | null,
  workplaceType: "remote" | "hybrid" | "on-site" | null,
): "global" | "country_fenced" | "region_fenced" | "onsite" | "unknown" {
  // v2: Explicit on-site jobs now return "onsite" instead of "unknown".
  // This is the ATS-native trust path for workplaceType (Step 1a in the
  // full ladder). The full ladder in remote-scope-extractor.ts handles this
  // for Lever/Ashby; this synchronous path handles it for all sources.
  if (workplaceType === "on-site" || workplaceType === "hybrid") {
    return "onsite";
  }

  const locationText = locationName ?? "";
  const contentText = content ?? "";
  const combined = `${locationText} ${contentText}`;

  // Check for global remote indicators first (higher priority — if the JD
  // explicitly says "global remote", it's global even if the location field
  // mentions a specific country, because many ATS systems set the location
  // to a company HQ city even for global remote roles).
  for (const pattern of GLOBAL_REMOTE_PATTERNS) {
    if (pattern.test(combined)) {
      return "global";
    }
  }

  // Check for country-fenced remote indicators.
  for (const pattern of COUNTRY_FENCED_REMOTE_PATTERNS) {
    if (pattern.test(combined)) {
      return "country_fenced";
    }
  }

  // v2: Check for region-fenced indicators (Latam, APAC, EMEA, Balkans).
  // These are fenced to a broad region, not specific countries — Gate 0.5
  // cannot hard-block on a single country match for region_fenced.
  if (
    /\bremote\s*[-–]\s*(?:latam|latin\s+america)\b/i.test(combined) ||
    /\bremote\s*[-–]\s*(?:apac|asia[- ]?pacific)\b/i.test(combined) ||
    /\bremote\s*[-–]\s*(?:emea|europe[- ]?middle[- ]?east[- ]?africa)\b/i.test(
      combined,
    ) ||
    /\bremote\s*[-–]\s*(?:balkans|eastern\s+europe)\b/i.test(combined)
  ) {
    return "region_fenced";
  }

  // If the job is remote but location is just "Remote" (no country/region
  // qualifier), treat it as global — a bare "Remote" location with no
  // geographic restriction is the most inclusive interpretation.
  if (workplaceType === "remote" && /^\s*remote\s*$/i.test(locationText)) {
    return "global";
  }

  // Fix 3 (mismatch investigation July 2026): A remote job whose location_name
  // contains a specific country name (e.g., "Poland / Remote / Poland /
  // Poland") is remote-within-that-country, not global remote. This handles the
  // NoFluffJobs format where the location string contains both a country name
  // AND "Remote" — the presence of a country name alongside "Remote" indicates
  // geographic fencing. Without this check, such locations fall through to
  // "unknown" because isSpecificLocation() returns false (the string contains
  // "remote"), and the LLM extractor then classifies them as "global".
  //
  // This check runs BEFORE the Fix 1 isSpecificLocation check because it's more
  // specific — it detects a country name even when "Remote" is also present.
  // A genuinely global remote job whose JD says "work from anywhere" is already
  // caught by GLOBAL_REMOTE_PATTERNS above.
  //
  // Directive 09 Part A.3: Removed the `workplaceType === "remote"` guard —
  // when workplaceType is null (Greenhouse, many ATSs), the location-country
  // check was skipped entirely, causing jobs with specific country locations
  // to fall through to "unknown" → LLM Step 2 → "global" (false-global). This
  // was the primary classifier failure pattern (248 false-globals found).
  if (locationText) {
    const locationCountry = extractLocationCountry(locationText);
    if (locationCountry !== null) {
      return "country_fenced";
    }
  }

  // Fix 1 (mismatch investigation July 2026): A remote job whose location_name
  // is a specific city/country (e.g., "Pakistan", "Pune, MH, in", "San
  // Francisco, CA") is almost certainly remote-within-that-country, not global
  // remote. ATS systems set the location to the country the role is based in.
  // Without this check, such jobs fall through to "unknown", the full
  // extraction ladder's LLM (Step 2) often classifies them as "global" (because
  // the JD text rarely explicitly restricts to the country), and Gate 3
  // approves them for applicants in other countries — producing false positives.
  // 87% of user-marked mismatches were this pattern.
  //
  // This check only fires when no explicit pattern matched above (i.e., the
  // location doesn't contain "Remote - Global", "Remote - US Only", etc.). A
  // genuinely global remote job whose JD says "work from anywhere" is already
  // caught by GLOBAL_REMOTE_PATTERNS above.
  //
  // Directive 09 Part A.3: Removed the `workplaceType === "remote"` guard —
  // same rationale as Fix 3 above. When workplaceType is null, specific city
  // locations (e.g., "Redmond, WA", "Bastrop, TX" for SpaceX) were not caught,
  // producing 60+ false-globals for SpaceX alone.
  if (locationText && isSpecificLocation(locationText)) {
    return "country_fenced";
  }

  return "unknown";
}

/**
 * Parse a job title for a region tag suffix. Returns the matched tag string
 * (e.g., "Latam", "APAC") or null if no region suffix is found.
 *
 * Only matches suffixes after a dash or at the end of the title to avoid
 * false positives (e.g., "India Engineer" as a prefix is not a region tag,
 * but "Software Engineer - India" is).
 */
export function parseTitleRegionTag(title: string): string | null {
  // Require a dash separator before the region tag to reduce false positives.
  // This matches patterns like "Software Engineer - Latam" or "SDE - India"
  // but not "Latam Software Engineer" or "India-based Engineer".
  const dashMatch = title.match(/\s[-–—]\s+(.+)$/);
  if (!dashMatch) return null;
  const suffix = dashMatch[1];
  for (const { pattern, region } of TITLE_REGION_PATTERNS) {
    if (pattern.test(suffix)) return region;
  }
  return null;
}

/**
 * Parse experience year requirements from job description text.
 * Matches common patterns:
 *   - "3+ years of experience" → { min: 3, max: null }
 *   - "2-6 years" → { min: 2, max: 6 }
 *   - "minimum 5 years" → { min: 5, max: null }
 *   - "at least 3 years" → { min: 3, max: null }
 *
 * Returns null when no explicit year requirement is found. Does NOT infer
 * experience from seniority words — that's Gate 3's job.
 */
export function parseExperienceRange(
  text: string,
): { min: number; max: number | null } | null {
  // Range pattern: "2-6 years", "3–5 years" (en-dash), "2 to 6 years"
  const rangeMatch = text.match(/(\d+)\s*[-–—]|to\s*(\d+)\s*years?/i);
  if (rangeMatch) {
    const min = parseInt(rangeMatch[1], 10);
    const max = parseInt(rangeMatch[2], 10);
    if (!Number.isNaN(min) && !Number.isNaN(max) && max >= min) {
      return { min, max };
    }
  }

  // Minimum-only patterns: "3+ years", "minimum 5 years", "at least 3 years"
  const minMatch = text.match(
    /(?:minimum|at\s+least)?\s*(\d+)\+?\s*years?\s*(?:of\s*experience)?/i,
  );
  if (minMatch) {
    const min = parseInt(minMatch[1], 10);
    if (!Number.isNaN(min)) {
      return { min, max: null };
    }
  }

  return null;
}

/**
 * Extract compensation data from an Ashby job object. The Ashby Public API
 * returns a `compensation` object with `min`, `max`, `currency` fields when
 * `includeCompensation=true` is passed (which it is — see ats-endpoints.ts).
 */
function extractAshbyCompensation(obj: Record<string, unknown>): {
  min: number | null;
  max: number | null;
  currency: string | null;
} {
  const comp = obj.compensation;
  if (typeof comp !== "object" || comp === null) {
    return { min: null, max: null, currency: null };
  }
  const compObj = comp as Record<string, unknown>;
  return {
    min: typeof compObj.min === "number" ? compObj.min : null,
    max: typeof compObj.max === "number" ? compObj.max : null,
    currency: typeof compObj.currency === "string" ? compObj.currency : null,
  };
}

/**
 * Extract compensation data from a Lever job object. Lever provides a
 * `salaryRange` object with `min`, `max`, `currency`, and `interval` fields.
 * The interval may be "per-year-salary", "per-month-salary", etc.
 */
function extractLeverCompensation(obj: Record<string, unknown>): {
  min: number | null;
  max: number | null;
  currency: string | null;
} {
  const range = obj.salaryRange;
  if (typeof range !== "object" || range === null) {
    return { min: null, max: null, currency: null };
  }
  const rangeObj = range as Record<string, unknown>;
  return {
    min: typeof rangeObj.min === "number" ? rangeObj.min : null,
    max: typeof rangeObj.max === "number" ? rangeObj.max : null,
    currency: typeof rangeObj.currency === "string" ? rangeObj.currency : null,
  };
}

/**
 * Normalize a generic employment type label to a standard string.
 * Used by SmartRecruiters and Workable which both use labels like
 * "Full-time", "Part-time", "Contract", "Permanent", etc.
 */
function normalizeEmploymentTypeLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const lower = value.toLowerCase();
  if (lower.includes("full")) return "full-time";
  if (lower.includes("part")) return "part-time";
  if (lower.includes("contract")) return "contract";
  if (lower.includes("intern")) return "internship";
  if (lower.includes("permanent")) return "full-time";
  if (lower.includes("temporary")) return "contract";
  return null;
}

/**
 * Normalize Recruitee's employment_type_code to a standard employment type.
 * Recruitee values: "fulltime_permanent", "parttime_permanent", "contract", etc.
 */
function normalizeRecruiteeEmploymentType(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value.includes("fulltime")) return "full-time";
  if (value.includes("parttime")) return "part-time";
  if (value.includes("contract")) return "contract";
  if (value.includes("intern")) return "internship";
  if (value.includes("temporary")) return "contract";
  return null;
}

/**
 * Normalize Lever's categories.commitment to a standard employment type string.
 * Lever values: "Full-time", "Part-time", "Contract", "Intern" (case may vary).
 */
function normalizeLeverCommitment(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const lower = value.toLowerCase();
  if (lower.includes("full")) return "full-time";
  if (lower.includes("part")) return "part-time";
  if (lower.includes("contract")) return "contract";
  if (lower.includes("intern")) return "internship";
  return null;
}

/**
 * Normalize Ashby's employmentType to a standard employment type string.
 * Ashby values: "FullTime", "PartTime", "Contract", "Intern", "Temporary".
 */
function normalizeAshbyEmploymentType(value: unknown): string | null {
  if (typeof value !== "string") return null;
  switch (value) {
    case "FullTime":
      return "full-time";
    case "PartTime":
      return "part-time";
    case "Contract":
      return "contract";
    case "Intern":
      return "internship";
    case "Temporary":
      return "contract"; // Map Temporary to contract (closest match)
    default:
      return null;
  }
}

/** Parse an ISO 8601 date string to a Date, or null if invalid/missing. */
function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Parse epoch milliseconds to a Date, or null if invalid/missing. */
function parseEpochMs(value: unknown): Date | null {
  if (typeof value !== "number") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Determine whether an explicit source status indicates the job is currently
 * active/open. Sources whose public APIs only return live jobs (Greenhouse,
 * Lever, Ashby, Workable) do not need this check. Recruitee and SmartRecruiters
 * may expose a status field, so closed/archived jobs are rejected here.
 */
function parseIsActiveStatus(
  atsSource: string,
  obj: Record<string, unknown>,
): boolean {
  if (
    atsSource === "greenhouse" ||
    atsSource === "lever" ||
    atsSource === "ashby" ||
    atsSource === "workable"
  ) {
    return true;
  }

  const status = obj.status;
  if (status === undefined || status === null) return true;
  if (typeof status !== "string") return true;

  const normalized = status.toLowerCase().trim();
  const activeStatuses = new Set([
    "active",
    "open",
    "published",
    "posted",
    "live",
    "online",
  ]);
  const closedStatuses = new Set([
    "closed",
    "archived",
    "inactive",
    "filled",
    "unpublished",
    "draft",
    "expired",
    "on_hold",
    "on-hold",
    "paused",
  ]);

  if (closedStatuses.has(normalized)) return false;
  if (activeStatuses.has(normalized)) return true;

  // Unknown status value: keep the job and let observability surface it.
  return true;
}

// =============================================================================
// HTML STRIPPING (lightweight, no dependency)
// =============================================================================

/**
 * Strip HTML tags and decode common entities. Lightweight regex approach —
 * no html-to-text dependency (checked package.json, not installed per
 * MODULE_C_DECISIONS.md §4.1).
 *
 * Block-level tags (p, div, h1-6, li, ul, ol, br) are converted to newlines
 * so the cleaned text preserves paragraph and list structure. This cleaned
 * text is used both for embeddings/tag scanning and as the fallback source
 * for candidate-facing HTML when descriptionHtml is not available.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<\/?(?:p|div|h[1-6]|li|ul|ol|br)\b[^>]*>/gi, "\n")
    .replace(/<[^>]*>/g, " ") // remaining tags → space (prevents word merging)
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ") // collapse spaces/tabs, keep newlines
    .replace(/\n{3,}/g, "\n\n") // collapse 3+ newlines to paragraph breaks
    .trim();
}

/**
 * Normalize a raw ATS description into candidate-facing HTML.
 *
 * - HTML input is sanitized, leaving safe formatting tags intact.
 * - Plain-text input is converted into paragraphs, line breaks, and lists.
 * - Returns null when the input is empty or yields no usable content.
 */
function toDescriptionHtml(raw: string, isHtml: boolean): string | null {
  if (!raw || typeof raw !== "string" || raw.trim().length === 0) {
    return null;
  }
  const html = isHtml
    ? sanitizeJobDescription(raw)
    : plainTextToDescriptionHtml(raw);
  const textOnly = html.replace(/<[^>]*>/g, "").replace(/\s+/g, "");
  return textOnly.length > 0 ? html : null;
}

/**
 * Extract text content from a Lever job's `lists` array.
 *
 * Lever jobs store structured content (requirements, tech stack, responsibilities)
 * in a `lists` array where each entry has a `text` (section title) and `content`
 * (HTML). This content often contains the actual tech keywords (Docker, Kubernetes,
 * Java, etc.) that are absent from the description fields.
 *
 * Returns the concatenated plain text of all list sections, or "" if no lists.
 */
function extractLeverLists(obj: Record<string, unknown>): string {
  if (!Array.isArray(obj.lists)) return "";
  const parts: string[] = [];
  for (const item of obj.lists) {
    if (typeof item !== "object" || item === null) continue;
    const listObj = item as Record<string, unknown>;
    // Include the section title (e.g. "Required Experience", "Tech Stack")
    if (typeof listObj.text === "string" && listObj.text.length > 0) {
      parts.push(listObj.text);
    }
    // Strip HTML from the section content
    if (typeof listObj.content === "string" && listObj.content.length > 0) {
      parts.push(stripHtml(listObj.content));
    }
  }
  return parts.join(" ").trim();
}

// =============================================================================
// PHASE 1 — REGEX TAG SCAN (§4.2)
// =============================================================================

/**
 * Build a case-insensitive regex that scans for canonical tag labels using
 * word-boundary matching. Labels are sorted by length (descending) so longer
 * labels match before their substrings (e.g., "C++" before "C", "Next.js"
 * before "Next").
 *
 * Pattern per label: `\b{escapedLabel}(?![\w])`
 * - `\b` at the start ensures we don't match mid-word.
 * - `(?![\w])` (negative lookahead for word chars) ensures we don't match
 *   a label that's a prefix of a longer word (e.g., "React" in "Reactive").
 *
 * (MODULE_C_DECISIONS.md §4.2 — "same \b{label}(?![\w]) pattern as Module A
 * Layer 1")
 */
function buildTagRegex(): RegExp {
  // Sort by label length descending so longer labels match first in the
  // alternation (prevents "C" matching inside "C++").
  const sorted = [...CANONICAL_TAGS].sort(
    (a, b) => b.label.length - a.label.length,
  );

  const alternatives = sorted.map((tag) => {
    const escaped = tag.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return `\\b${escaped}(?![\\w])`;
  });

  return new RegExp(alternatives.join("|"), "gi");
}

const TAG_REGEX = buildTagRegex();

/** Lowercase label → slug lookup. Built once at module load. */
const LABEL_TO_SLUG = new Map<string, string>(
  CANONICAL_TAGS.map((t) => [t.label.toLowerCase(), t.tag]),
);

/**
 * Phase 1 — scan fullText for canonical tag labels via word-boundary regex.
 * Returns an array of canonical tag slugs (deduplicated).
 *
 * Zero cost, medium recall. The LLM fallback (Phase 2) handles high recall
 * for tags the regex misses (e.g., tags mentioned in unusual formats).
 */
export function scanTagsRegex(fullText: string): string[] {
  const matches = fullText.matchAll(TAG_REGEX);
  const slugs = new Set<string>();

  for (const match of matches) {
    const matchedText = match[0].toLowerCase();
    const slug = LABEL_TO_SLUG.get(matchedText);
    if (slug) {
      slugs.add(slug);
    }
  }

  return [...slugs];
}

// =============================================================================
// TAG NORMALIZATION FOR EXTERNAL SOURCES (D24)
// =============================================================================

/**
 * Common tag variant → canonical slug mapping for tags that the regex
 * scanner cannot match (e.g., "golang" → "go", "node.js" → "nodejs").
 * Built once at module load.
 */
const TAG_VARIANT_MAP: Record<string, string> = {
  // Languages
  golang: "go",
  "node.js": "nodejs",
  "node js": "nodejs",
  nodejs: "nodejs",
  "react.js": "react",
  reactjs: "react",
  "react js": "react",
  "next.js": "nextjs",
  nextjs: "nextjs",
  "next js": "nextjs",
  "vue.js": "vue",
  vuejs: "vue",
  "vue js": "vue",
  "nuxt.js": "nuxt",
  nuxtjs: "nuxt",
  "angular.js": "angular",
  angularjs: "angular",
  "svelte.js": "svelte",
  sveltejs: "svelte",
  "express.js": "express",
  expressjs: "express",
  "tailwind.css": "tailwindcss",
  tailwind: "tailwindcss",
  css3: "css",
  html5: "html",
  "c++": "cpp",
  "c#": "csharp",
  csharp: "csharp",
  dotnet: "dotnet",
  ".net": "dotnet",
  "asp.net": "aspnet",
  aspnet: "aspnet",
  "ruby on rails": "rails",
  "ruby-on-rails": "rails",
  "react-native": "react-native",
  reactnative: "react-native",
  "react native": "react-native",
  // Tools/Platforms
  aws: "aws",
  gcp: "gcp",
  azure: "azure",
  docker: "docker",
  kubernetes: "kubernetes",
  k8s: "kubernetes",
  postgres: "postgresql",
  postgresql: "postgresql",
  mysql: "mysql",
  mongodb: "mongodb",
  redis: "redis",
  graphql: "graphql",
  "rest api": "rest-api",
  restapi: "rest-api",
  "rest-api": "rest-api",
};

/**
 * Normalize a list of arbitrary tag strings (e.g., from RemoteOK's API) to
 * canonical tag slugs. Each tag is:
 * 1. Lowercased and trimmed
 * 2. Checked against the LABEL_TO_SLUG map (exact label match)
 * 3. Checked against the TAG_VARIANT_MAP (common variants)
 * 4. Scanned with TAG_REGEX (word-boundary match within the tag string)
 *
 * Tags that don't match any canonical slug are dropped (not stored).
 * Returns a deduplicated array of canonical slugs.
 */
export function normalizeTagList(tags: string[]): string[] {
  const slugs = new Set<string>();

  for (const rawTag of tags) {
    const tag = rawTag.toLowerCase().trim();
    if (!tag) continue;

    // 1. Exact label match (e.g., "react" → "react", "php" → "php")
    const exactSlug = LABEL_TO_SLUG.get(tag);
    if (exactSlug) {
      slugs.add(exactSlug);
      continue;
    }

    // 2. Variant map (e.g., "golang" → "go", "react.js" → "react")
    const variantSlug = TAG_VARIANT_MAP[tag];
    if (variantSlug) {
      slugs.add(variantSlug);
      continue;
    }

    // 3. Regex scan within the tag string (e.g., "react.js" matches "react")
    const regexMatches = scanTagsRegex(tag);
    for (const slug of regexMatches) {
      slugs.add(slug);
    }
  }

  return [...slugs];
}

// =============================================================================
// PHASE 2 — LLM FALLBACK (§4.2)
// =============================================================================

/** Zod schema for the LLM fallback output. */
const llmTagExtractionSchema = z.object({
  canonicalTags: z
    .array(z.string())
    .describe("Canonical tag slugs found in the job description"),
});

const CANONICAL_TAG_LIST = CANONICAL_TAGS.map((t) => t.tag).join(", ");

const LLM_TAG_SYSTEM_PROMPT = `You are a job description tag extractor. Extract technology tags from the job description text.

You MUST map all technologies to the CANONICAL_TAGS list below. Never invent tags that are not in this list. If a technology does not have an exact match, choose the closest canonical tag.

CANONICAL_TAGS (use only these slugs): ${CANONICAL_TAG_LIST}

Return only the canonical tag slugs that are clearly mentioned or required in the job description. Do not include tags that are merely tangentially related.`;

/**
 * Phase 2 — LLM fallback for tag extraction. Uses gpt-4o-mini (one call, high
 * recall). Triggered only when Phase 1 regex yields < threshold persona_defining
 * tags.
 *
 * The system prompt includes the full CANONICAL_TAGS list so the LLM maps
 * free-text to canonical slugs rather than inventing new ones (same pattern as
 * Module A's CV extraction).
 */
export async function extractTagsLLM(fullText: string): Promise<string[]> {
  // Truncate to stay within gpt-4o-mini's 8192 token input limit.
  // The system prompt (with CANONICAL_TAGS list) is ~2000 tokens, leaving
  // ~6000 tokens for the job description ≈ 24000 chars.
  const truncatedText =
    fullText.length > 24000
      ? `${fullText.slice(0, 24000)}\n[... truncated for length ...]`
      : fullText;

  const { object } = await generateObject({
    model: openai("gpt-4o-mini"),
    schema: llmTagExtractionSchema,
    system: LLM_TAG_SYSTEM_PROMPT,
    prompt: truncatedText,
    abortSignal: AbortSignal.timeout(30000),
  });

  // Filter to only valid canonical slugs (defensive — the LLM should obey the
  // system prompt, but verify).
  return object.canonicalTags.filter((slug) => CANONICAL_TAG_MAP.has(slug));
}

// =============================================================================
// AI SUMMARY GENERATION (added July 2026)
// =============================================================================

/** Zod schema for the LLM summary output. */
const llmSummarySchema = z.object({
  shortDescription: z
    .string()
    .min(20)
    .max(240)
    .describe(
      "A concise, candidate-facing summary of the job in 1-2 sentences. " +
        "Focus on the role, responsibilities, and key technologies. " +
        "Exclude company history, benefits, equal-opportunity statements, and application instructions.",
    ),
});

const LLM_SUMMARY_SYSTEM_PROMPT = `You are a technical job-description summarizer. Read the job posting below and write a concise, candidate-facing summary in 1-2 sentences (max 240 characters).

Focus ONLY on:
- The role and seniority (e.g., "Senior Frontend Engineer")
- Core responsibilities
- Key technologies, frameworks, and domains

EXCLUDE:
- Company mission, history, or values
- Benefits, perks, or compensation
- Equal-opportunity / diversity statements
- Application instructions or generic fluff

Keep the summary factual and dense. Do not use marketing language.`;

/**
 * Generate a concise candidate-facing summary of the job using gpt-4o-mini.
 *
 * The summary is limited to 1-2 sentences and focuses on the role,
 * responsibilities, and key technologies. It intentionally excludes company
 * boilerplate, benefits, and application instructions.
 */
export async function summarizeJobLLM(
  fullText: string,
  title: string,
): Promise<string | null> {
  // Truncate to stay within gpt-4o-mini's 8192 token input limit.
  // The system prompt is ~500 tokens, leaving ~7600 tokens for the
  // title + job description ≈ 30000 chars.
  const truncatedText =
    fullText.length > 30000
      ? `${fullText.slice(0, 30000)}\n[... truncated for length ...]`
      : fullText;

  const { object } = await generateObject({
    model: openai("gpt-4o-mini"),
    schema: llmSummarySchema,
    system: LLM_SUMMARY_SYSTEM_PROMPT,
    prompt: `Job title: ${title}\n\n${truncatedText}`,
    abortSignal: AbortSignal.timeout(30000),
  });

  return object.shortDescription ?? null;
}

// =============================================================================
// NORMALIZATION ORCHESTRATION (§4.3)
// =============================================================================

/**
 * Count how many of the given tags are persona_defining.
 * Uses the PERSONA_DEFINING_TAGS Set for O(1) lookup per tag.
 */
function countPersonaDefining(tags: string[]): number {
  return tags.filter((tag) => PERSONA_DEFINING_TAGS.has(tag)).length;
}

/**
 * Normalize a job — the main entry point for Step 1 of the 3-Gate funnel.
 *
 * Flow (MODULE_C_DECISIONS.md §4.3):
 *   1. Extract content from rawJson (ATS-source-aware).
 *   2. Phase 1 regex scan → extractedTags.
 *   3. Count persona_defining tags in extractedTags.
 *   4. If count ≥ GATE_NORMALIZATION_MIN_PERSONA_TAGS → 'normalized'.
 *   5. If count < threshold → Phase 2 LLM fallback.
 *   6. After Phase 2, recount. If still < threshold → 'rejected' (tombstone).
 *   7. If Phase 2 LLM call fails → 'normalization_failed' (retryable).
 *   8. Generate AI summary for normalized jobs (added July 2026).
 *
 * @param atsSource          The ATS platform ("greenhouse" | "lever" | "ashby")
 * @param rawJson            The raw ATS JSON string (job.rawJson)
 * @param fallbackTitle      The job title from the DB row (used if extraction fails
 *                            or as the title source)
 * @param llmExtractor       Injectable LLM tag extractor (defaults to extractTagsLLM).
 * @param summaryExtractor   Injectable LLM summary extractor (defaults to summarizeJobLLM).
 *                            Tests pass mocks to avoid hitting the OpenAI API.
 */
export async function normalizeJob(
  atsSource: string,
  rawJson: string | null,
  fallbackTitle: string,
  llmExtractor: LlmTagExtractor = extractTagsLLM,
  summaryExtractor: LlmSummaryExtractor = summarizeJobLLM,
): Promise<NormalizationResult> {
  // Step 1: ATS-source-aware content extraction + job URL extraction.
  const { fullText, title, htmlDescription } = extractJobContent(
    atsSource,
    rawJson,
    fallbackTitle,
  );
  const jobUrl = extractJobUrl(atsSource, rawJson);

  // Step 1b: Title-only rejection guard.
  // Jobs with very short fullText (< MIN_NORMALIZABLE_FULLTEXT_LENGTH chars)
  // produce poor embeddings and waste LLM calls in Gate 3. The SmartRecruiters
  // detail fetch (and future Greenhouse detail fetch) try to enrich these jobs
  // before they reach normalization. If enrichment failed or wasn't available,
  // reject the job here with rejectionReason='title_only' for observability.
  if (fullText.length < MIN_NORMALIZABLE_FULLTEXT_LENGTH) {
    return {
      status: "rejected",
      tags: [],
      fullText,
      htmlDescription,
      jobUrl,
      rejectionReason: "title_only" as const,
    };
  }

  // Helper: generate summary without letting a summary failure break
  // normalization. The summary is a display nicety, not a matching gate.
  async function safeSummarize(): Promise<string | undefined> {
    try {
      return (await summaryExtractor(fullText, title)) ?? undefined;
    } catch (error) {
      console.warn(
        "[normalizeJob] Summary generation failed; continuing without summary.",
        error instanceof Error ? error.message : error,
      );
      return undefined;
    }
  }

  // Step 2: Phase 1 regex scan.
  let tags = scanTagsRegex(fullText);

  // Step 3: Count persona_defining tags.
  let definingCount = countPersonaDefining(tags);

  // Step 4: If enough persona_defining tags → normalized + summary.
  if (definingCount >= GATE_NORMALIZATION_MIN_PERSONA_TAGS) {
    const summary = await safeSummarize();
    return {
      status: "normalized",
      tags,
      fullText,
      htmlDescription,
      summary,
      jobUrl,
    };
  }

  // Step 5: Phase 2 LLM fallback.
  try {
    const llmTags = await llmExtractor(fullText);

    // Merge LLM tags with regex tags (union, deduplicated).
    const merged = new Set([...tags, ...llmTags]);
    tags = [...merged];
    definingCount = countPersonaDefining(tags);

    // Step 6: Recount after Phase 2.
    if (definingCount >= GATE_NORMALIZATION_MIN_PERSONA_TAGS) {
      const summary = await safeSummarize();
      return {
        status: "normalized",
        tags,
        fullText,
        htmlDescription,
        summary,
        jobUrl,
      };
    }

    // Still not enough persona_defining tags → rejected (tombstone).
    return {
      status: "rejected",
      tags,
      fullText,
      htmlDescription,
      jobUrl,
      rejectionReason: "no_tags" as const,
    };
  } catch (error) {
    // Step 7: LLM call failed → normalization_failed (retryable).
    // Do NOT set normalizedAt — the job must remain retryable.
    return {
      status: "normalization_failed",
      tags,
      fullText,
      htmlDescription,
      jobUrl,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// =============================================================================
// IDEMPOTENCY DECISION TREE (§4.6)
// =============================================================================

/** The fields from the job row needed for the idempotency decision. */
export type JobStatusInfo = {
  status: string;
  normalizedAt: Date | null;
};

/** The decision returned by the idempotency check. */
export type IdempotencyDecision = {
  action: "skip" | "normalize";
  reason?: string;
};

/**
 * Idempotency decision tree — determines whether to normalize, skip (already
 * processed), or retry (normalization_failed).
 *
 * Pure function — no DB access, no side effects. Tested independently of
 * the Inngest handler.
 *
 * Flow (MODULE_C_DECISIONS.md §4.6):
 *   IF normalizedAt IS NOT NULL → skip (already processed, safe for re-delivery)
 *   IF status = 'rejected'       → skip (garbage tombstone)
 *   IF status = 'normalization_failed' → normalize (retry — this is why we
 *                                          distinguish it from 'rejected')
 *   IF status IN ('stale', 'gone') → skip (aged out before normalization)
 *   ELSE (status = 'active', normalizedAt IS NULL) → normalize
 */
export function decideNormalizationAction(
  jobInfo: JobStatusInfo,
): IdempotencyDecision {
  if (jobInfo.normalizedAt !== null) {
    return {
      action: "skip",
      reason: `Already processed (normalizedAt set, status=${jobInfo.status})`,
    };
  }
  if (jobInfo.status === "rejected") {
    return { action: "skip", reason: "Rejected tombstone" };
  }
  if (jobInfo.status === "normalization_failed") {
    return {
      action: "normalize",
      reason: "Retrying after normalization_failed",
    };
  }
  if (jobInfo.status === "stale" || jobInfo.status === "gone") {
    return {
      action: "skip",
      reason: `Job aged out (status=${jobInfo.status})`,
    };
  }
  // status = 'active', normalizedAt IS NULL → run normalization
  return { action: "normalize" };
}

// =============================================================================
// G3: AGGREGATOR JOB NORMALIZATION (CORPUS_EXPANSION_TDD §1.7)
// =============================================================================

/**
 * An aggregator-sourced job (Remote OK, Remotive, Himalayas, WWR, Jobicy,
 * HN comments, Reddit, newsletters). These jobs come from non-ATS sources
 * and bypass the ATS poller — they're ingested directly via the
 * `aggregatorJobHandler` Inngest function.
 */
export interface AggregatorJob {
  source:
    | "remoteok"
    | "remotive"
    | "himalayas"
    | "wwr"
    | "jobicy"
    | "hn_comment"
    | "reddit"
    | "newsletter";
  externalJobId: string; // e.g. "remoteok-12345"
  company: string;
  title: string;
  description: string; // HTML or plain text
  location?: string;
  tags?: string[];
  applyUrl?: string;
  publishedAt?: Date;
}

/**
 * Normalize an aggregator-sourced job. This is the G3 entry point for
 * non-ATS jobs (Remote OK, Remotive, HN comments, Reddit, newsletters).
 *
 * Unlike `normalizeJob()` (which reads from rawJson), this function receives
 * the job fields directly — aggregator sources provide structured data, not
 * ATS JSON. The normalization is simpler:
 *   1. Strip HTML from description
 *   2. Combine title + company + location + cleaned description → fullText
 *   3. Run regex tag extraction (Phase 1 only — no LLM fallback for MVP)
 *   4. Gate 0 check on title (reject non-engineering roles)
 *
 * @returns  { status, fullText, tags } — status is 'normalized' or 'rejected'
 */
export function normalizeAggregatorJob(job: AggregatorJob): {
  status: "normalized" | "rejected";
  fullText: string;
  htmlDescription: string | null;
  tags: string[];
  jobUrl: string | null;
} {
  // Strip HTML from description
  const cleanedDescription = stripHtml(job.description);
  // Combine: title + company + location + cleaned description
  const locationLine = job.location ? `${job.location}\n` : "";
  const combinedText = `${job.title} at ${job.company}\n${locationLine}${cleanedDescription}`;
  // Run regex tag extraction (same as ATS jobs)
  const tags = scanTagsRegex(combinedText);
  const jobUrl = job.applyUrl?.trim() || null;
  // Heuristic: treat the raw description as HTML if it contains tags.
  const looksLikeHtml = /<[^>]+>/.test(job.description);
  const htmlDescription = toDescriptionHtml(job.description, looksLikeHtml);
  // Gate 0 check on title — reject non-engineering roles
  if (!passesGateZero(job.title)) {
    return {
      status: "rejected",
      fullText: combinedText,
      htmlDescription,
      tags,
      jobUrl,
    };
  }
  return {
    status: "normalized",
    fullText: combinedText,
    htmlDescription,
    tags,
    jobUrl,
  };
}
