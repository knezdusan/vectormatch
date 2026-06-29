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
import { GATE_NORMALIZATION_MIN_PERSONA_TAGS } from "@/lib/jobs/matching-config";
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
  /** Only set on normalization_failed — the error message for logging. */
  error?: string;
};

/** Injectable LLM tag extractor — defaults to extractTagsLLM. Tests pass a
 *  mock to avoid hitting the OpenAI API. */
export type LlmTagExtractor = (fullText: string) => Promise<string[]>;

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
): { title: string; description: string; fullText: string } {
  // G7 fast path: if normalizedText is already available (post-normalization),
  // return it directly. It's already HTML-stripped and cleaned — no parsing
  // or stripping needed. This is the read path used by gate3Evaluator and the
  // dashboard match detail page after the G7 migration.
  if (typeof normalizedText === "string" && normalizedText.length > 0) {
    return {
      title: fallbackTitle,
      description: normalizedText,
      fullText: normalizedText,
    };
  }

  // Legacy / pre-normalization path: parse rawJson.
  if (rawJson === null) {
    return {
      title: fallbackTitle,
      description: "",
      fullText: fallbackTitle,
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
    };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return {
      title: fallbackTitle,
      description: "",
      fullText: fallbackTitle,
    };
  }

  const obj = parsed as Record<string, unknown>;

  switch (atsSource) {
    case "greenhouse": {
      const title = typeof obj.title === "string" ? obj.title : fallbackTitle;
      const rawDesc = typeof obj.content === "string" ? obj.content : "";
      const description = stripHtml(rawDesc);
      return { title, description, fullText: `${title} ${description}`.trim() };
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
      return { title, description, fullText: `${title} ${description}`.trim() };
    }
    case "smartrecruiters": {
      // SmartRecruiters calls the title "name". The list endpoint does NOT
      // include the job description — only the detail endpoint does. For the
      // MVP, we degrade to title-only (same as Greenhouse without ?content=true).
      // The detail endpoint can be added later if needed.
      const title = typeof obj.name === "string" ? obj.name : fallbackTitle;
      return { title, description: "", fullText: title };
    }
    case "workable": {
      const title = typeof obj.title === "string" ? obj.title : fallbackTitle;
      // Workable widget API with ?details=true includes `description` (HTML).
      const rawDesc =
        typeof obj.description === "string" && obj.description.length > 0
          ? obj.description
          : "";
      const description = stripHtml(rawDesc);
      return { title, description, fullText: `${title} ${description}`.trim() };
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
      return { title, description, fullText: `${title} ${description}`.trim() };
    }
    default: {
      // Unknown ATS source — degrade to title-only.
      return {
        title: fallbackTitle,
        description: "",
        fullText: fallbackTitle,
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
   *  NULL when the ATS doesn't provide it (notably Greenhouse) or it can't be
   *  determined. The matching pipeline lets NULL through to Gate 3 LLM. */
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
  /** Company name (Greenhouse only — Lever/Ashby don't include it in the job object). */
  companyName: string | null;
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
    companyName: null,
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

  return {
    workplaceType,
    employmentType: null, // Not reliably available for Greenhouse
    locationName,
    department,
    team: null, // Greenhouse doesn't have a separate team field
    applyUrl: null, // Not in the list endpoint
    publishedAt,
    companyName,
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

  return {
    workplaceType,
    employmentType,
    locationName,
    department,
    team,
    applyUrl,
    publishedAt,
    companyName: null, // Lever v0 doesn't include company name in the job object
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

  return {
    workplaceType,
    employmentType,
    locationName,
    department,
    team,
    applyUrl,
    publishedAt,
    companyName: null, // Ashby Public API doesn't include company name
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

  // Workplace type — SmartRecruiters uses location.remote (boolean)
  let workplaceType: JobMetadata["workplaceType"] = null;
  if (loc.remote === true) {
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

  return {
    workplaceType,
    employmentType,
    locationName,
    department,
    team: null,
    applyUrl: null,
    publishedAt,
    companyName,
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

  return {
    workplaceType,
    employmentType,
    locationName,
    department,
    team: null,
    applyUrl,
    publishedAt,
    companyName,
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

  return {
    workplaceType,
    employmentType,
    locationName,
    department,
    team: null,
    applyUrl,
    publishedAt,
    companyName,
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

// =============================================================================
// HTML STRIPPING (lightweight, no dependency)
// =============================================================================

/**
 * Strip HTML tags and decode common entities. Lightweight regex approach —
 * no html-to-text dependency (checked package.json, not installed per
 * MODULE_C_DECISIONS.md §4.1).
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ") // strip tags → space (prevents word merging)
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ") // collapse whitespace
    .trim();
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
  const { object } = await generateObject({
    model: openai("gpt-4o-mini"),
    schema: llmTagExtractionSchema,
    system: LLM_TAG_SYSTEM_PROMPT,
    prompt: fullText,
  });

  // Filter to only valid canonical slugs (defensive — the LLM should obey the
  // system prompt, but verify).
  return object.canonicalTags.filter((slug) => CANONICAL_TAG_MAP.has(slug));
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
 *
 * @param atsSource     The ATS platform ("greenhouse" | "lever" | "ashby")
 * @param rawJson       The raw ATS JSON string (job.rawJson)
 * @param fallbackTitle The job title from the DB row (used if extraction fails
 *                       or as the title source)
 * @param llmExtractor  Injectable LLM extractor (defaults to extractTagsLLM).
 *                      Tests pass a mock to avoid hitting the OpenAI API.
 */
export async function normalizeJob(
  atsSource: string,
  rawJson: string | null,
  fallbackTitle: string,
  llmExtractor: LlmTagExtractor = extractTagsLLM,
): Promise<NormalizationResult> {
  // Step 1: ATS-source-aware content extraction.
  const { fullText } = extractJobContent(atsSource, rawJson, fallbackTitle);

  // Step 2: Phase 1 regex scan.
  let tags = scanTagsRegex(fullText);

  // Step 3: Count persona_defining tags.
  let definingCount = countPersonaDefining(tags);

  // Step 4: If enough persona_defining tags → normalized.
  if (definingCount >= GATE_NORMALIZATION_MIN_PERSONA_TAGS) {
    return { status: "normalized", tags, fullText };
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
      return { status: "normalized", tags, fullText };
    }

    // Still not enough persona_defining tags → rejected (tombstone).
    return { status: "rejected", tags, fullText };
  } catch (error) {
    // Step 7: LLM call failed → normalization_failed (retryable).
    // Do NOT set normalizedAt — the job must remain retryable.
    return {
      status: "normalization_failed",
      tags,
      fullText,
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
  tags: string[];
} {
  // Strip HTML from description
  const cleanedDescription = stripHtml(job.description);
  // Combine: title + company + location + cleaned description
  const locationLine = job.location ? `${job.location}\n` : "";
  const combinedText = `${job.title} at ${job.company}\n${locationLine}${cleanedDescription}`;
  // Run regex tag extraction (same as ATS jobs)
  const tags = scanTagsRegex(combinedText);
  // Gate 0 check on title — reject non-engineering roles
  if (!passesGateZero(job.title)) {
    return { status: "rejected", fullText: combinedText, tags };
  }
  return { status: "normalized", fullText: combinedText, tags };
}
