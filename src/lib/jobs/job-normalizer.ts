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
 */
export function extractJobContent(
  atsSource: string,
  rawJson: string,
  fallbackTitle: string,
): { title: string; description: string; fullText: string } {
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
      const rawDesc =
        typeof obj.descriptionPlain === "string"
          ? obj.descriptionPlain
          : typeof obj.description === "string"
            ? obj.description
            : "";
      const description =
        typeof obj.descriptionPlain === "string" ? rawDesc : stripHtml(rawDesc);
      return { title, description, fullText: `${title} ${description}`.trim() };
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
      const rawDesc =
        typeof obj.descriptionPlain === "string"
          ? obj.descriptionPlain
          : typeof obj.descriptionHtml === "string"
            ? obj.descriptionHtml
            : "";
      const description =
        typeof obj.descriptionPlain === "string" ? rawDesc : stripHtml(rawDesc);
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
  rawJson: string,
): string | null {
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
  rawJson: string,
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
  rawJson: string,
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
