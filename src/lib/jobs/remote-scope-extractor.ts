// Remote-Scope Extractor — v2 Corpus Expansion Criterion 2
// src/lib/jobs/remote-scope-extractor.ts
//
// Implements the two-step remote-scope extraction ladder from the governing
// document (company-corpus-expansion-new.md Criterion 2):
//
//   Step 1 — Deterministic pre-pass (zero LLM cost):
//     1a. ATS-native workplaceType trust path (Lever/Ashby only).
//     1b. cheerio-based main-content extraction for HTML/markdown sources.
//     1c. Regex hard-signals with confidence-scoring.
//     1d. Strip company HQ from scope inference.
//     → High-confidence → accept. Inconclusive → route to Step 2.
//
//   Step 2 — LLM extraction (gpt-4o-mini, sync path):
//     Structured Zod output: { remoteScope, allowedCountries, workAuthRequired,
//     confidence }. workAuthRequired is extracted for LLM reasoning quality
//     but NOT persisted (no consumer in the current strategy — Gate 3
//     evaluates work auth from JD text directly).
//     → Persist remoteScope + allowedCountries to job row.
//
//   Hard-fail path: undetermined + normalization_failed (retryable).
//   Never default to restrictive interpretation (onsite/country_fenced) —
//   this is the anti-pattern that caused the original zero-match bug.
//
// Sync/Batch split: The sync path (this module) serves SLA-critical
// first-time normalization inside the 4hr provisional window. The batch
// path (batch-llm-client.ts, wired in Phase 3) serves SLA-indifferent
// paths (content-drift re-normalization, dormant-tier, backlog catch-up).

import "server-only";

import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import * as cheerio from "cheerio";
import { z } from "zod";

import {
  extractLocationCountry,
  isSpecificLocation,
  REMOTE_LOCATION_INDICATORS,
} from "@/lib/jobs/location-utils";
import {
  extractCountryCodesFromText,
  extractCountryFromCapture,
  HIGH_CONFIDENCE_SIGNALS,
  MEDIUM_CONFIDENCE,
  matchUtcRange,
  NEGATIVE_SIGNALS,
  type ScopeSignal,
} from "@/lib/jobs/remote-scope-patterns";

// =============================================================================
// TYPES
// =============================================================================

/** The remote scope values matching the pgEnum (minus legacy 'unknown'). */
export type RemoteScope =
  | "global"
  | "country_fenced"
  | "region_fenced"
  | "onsite"
  | "undetermined";

/** The full result of the remote-scope extraction ladder. */
export interface RemoteScopeResult {
  remoteScope: RemoteScope;
  /** ISO 3166-1 alpha-2 country codes the job is fenced to. Null for global /
   *  onsite / undetermined. Populated for country_fenced and region_fenced
   *  when the LLM or regex can identify specific countries. */
  allowedCountries: string[] | null;
  /** Which step produced this result — for observability and cost tracking. */
  resolvedBy: "step1_ats_native" | "step1_regex" | "step2_llm" | "hard_fail";
  /** Confidence 0.0–1.0. Step 1 high-confidence = 1.0; Step 2 = LLM-reported. */
  confidence: number;
}

/** Injectable LLM scope extractor — tests pass a mock. */
export type LlmScopeExtractor = (cleanedText: string) => Promise<{
  remoteScope: RemoteScope;
  allowedCountries: string[] | null;
  confidence: number;
}>;

// =============================================================================
// STEP 1a — ATS-NATIVE WORKPLACE TYPE TRUST PATH
// =============================================================================

/**
 * ATS-native workplaceType trust path. Lever and Ashby provide structured
 * workplaceType fields that are reliable. Greenhouse has no structured field
 * (~85% miss rate) and must go through the content-based path.
 *
 * Per governing doc: "ATS-native workplaceType (Lever/Ashby only) → trust
 * directly, zero LLM cost." This means:
 *   - workplaceType = "remote" → still need scope (global vs fenced), so
 *     proceed to regex/LLM for scope classification.
 *   - workplaceType = "on-site" → remoteScope = "onsite", no further work.
 *   - workplaceType = "hybrid" → remoteScope = "onsite" (hybrid requires
 *     physical presence, not global remote).
 *   - workplaceType = null → skip to regex/LLM (Greenhouse case).
 *
 * @returns RemoteScopeResult if the ATS-native path resolved the scope,
 *          null if it couldn't (workplaceType is null or "remote" — needs
 *          further classification).
 */
export function step1AtsNativeTrust(
  workplaceType: "remote" | "hybrid" | "on-site" | null,
  atsSource: string,
): RemoteScopeResult | null {
  // Greenhouse has no structured workplaceType — skip the trust path entirely.
  // The ~85% miss rate means we can't trust the location heuristic either.
  if (atsSource === "greenhouse") {
    return null;
  }

  if (workplaceType === "on-site" || workplaceType === "hybrid") {
    return {
      remoteScope: "onsite",
      allowedCountries: null,
      resolvedBy: "step1_ats_native",
      confidence: 1.0,
    };
  }

  // workplaceType = "remote" → need to determine global vs fenced.
  // workplaceType = null → need full extraction.
  return null;
}

// =============================================================================
// STEP 1b — CHEERIO-BASED MAIN-CONTENT EXTRACTION
// =============================================================================

/**
 * Tags to strip entirely (content + element) — navigation, boilerplate, and
 * non-job-content sections that pollute scope inference.
 */
const STRIP_TAGS = new Set([
  "nav",
  "footer",
  "header",
  "aside",
  "script",
  "style",
  "noscript",
  "iframe",
  "svg",
  "form",
  "button",
]);

/**
 * Semantic containers that likely hold the job description body. Checked in
 * priority order — the first match wins.
 */
const SEMANTIC_CONTAINERS = [
  "main",
  '[role="main"]',
  "article",
  ".jobs",
  ".careers",
  ".job-listing",
  ".job-description",
  '[class*="job-description"]',
  '[class*="jd-content"]',
  '[id*="job-description"]',
];

/**
 * Extract the main job-description text from an HTML string using cheerio.
 *
 * Strategy (per governing doc "HTML Cleaning"):
 *   1. Strip nav/footer/header/aside/script/style entirely.
 *   2. Target semantic containers (main, [role="main"], article, .jobs,
 *      .careers, .job-listing).
 *   3. Fall back to text-density scoring on top-level divs.
 *
 * For plain text or markdown input (non-HTML), returns the input as-is after
 * trimming — no HTML parsing needed.
 *
 * @param html The raw HTML or plain text from the ATS / probe pipeline.
 * @returns Cleaned plain text suitable for regex + LLM processing.
 */
export function extractMainContent(html: string | null): string {
  if (!html || typeof html !== "string") {
    return "";
  }

  // Detect HTML — if there are no HTML tags, treat as plain text.
  if (!/<[a-z][\s\S]*>/i.test(html)) {
    return html.replace(/\s+/g, " ").trim();
  }

  const $ = cheerio.load(html, undefined, false);

  // Step 1: Strip boilerplate tags entirely.
  for (const tag of STRIP_TAGS) {
    $(tag).remove();
  }

  // Step 2: Try semantic containers in priority order.
  for (const selector of SEMANTIC_CONTAINERS) {
    const el = $(selector).first();
    if (el.length > 0) {
      const text = el.text();
      if (text.length > 200) {
        return cleanText(text);
      }
    }
  }

  // Step 3: Fall back to text-density scoring on top-level divs.
  // Score each top-level div by text length / element count ratio — the div
  // with the highest text density is likely the job description body.
  let bestText = "";
  let bestScore = 0;

  $("body > div, div").each((_, el) => {
    const $el = $(el);
    const text = $el.text();
    if (text.length < 200) return;

    // Text density = text length / number of child elements.
    // Higher density = more text per element = likely content, not layout.
    const childCount = $el.children().length;
    const density = childCount > 0 ? text.length / childCount : text.length;

    if (density > bestScore) {
      bestScore = density;
      bestText = text;
    }
  });

  if (bestText.length > 200) {
    return cleanText(bestText);
  }

  // Last resort: return the full body text.
  const fullText = $("body").text() || $.root().text();
  return cleanText(fullText);
}

/** Collapse whitespace, trim. Used after cheerio text extraction. */
function cleanText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

// =============================================================================
// STEP 1c — REGEX HARD-SIGNALS WITH CONFIDENCE SCORING (pattern-table-driven)
// =============================================================================

/**
 * On-site hard indicators. If workplaceType is null but these match, the job
 * is likely on-site (not remote). Kept inline (not in remote-scope-patterns.ts)
 * because `onsite` is not part of the ScopeSignal type (it's handled as a
 * separate path — only relevant when workplaceType is null).
 */
const ONSITE_HARD_SIGNALS: readonly RegExp[] = [
  /\bon[- ]site\s+(?:position|role|job|work)\b/i,
  /\bin[- ]office\s+(?:position|role|required)\b/i,
  /\bmust\s+(?:work|be)\s+(?:on[- ]site|in[- ]office)\b/i,
];

/** Confidence threshold for accepting Step 1 regex results. */
const STEP1_CONFIDENCE_THRESHOLD = 0.8;

/** Confidence assigned to medium-confidence pattern matches (below threshold
 *  for direct accept, but accepted if no negative signals contradict). */
const MEDIUM_CONFIDENCE_VALUE = 0.7;

/**
 * Check if any negative signal matches the text and negates the given scope.
 *
 * @param text The cleaned JD text.
 * @param candidateScope The scope we're considering accepting.
 * @returns The matching NegativeSignal if the candidate should be rejected,
 *          null otherwise.
 */
function checkNegativeSignals(
  text: string,
  candidateScope: "global" | "country_fenced" | "region_fenced",
): (typeof NEGATIVE_SIGNALS)[number] | null {
  for (const signal of NEGATIVE_SIGNALS) {
    if (signal.pattern.test(text)) {
      // "all_remote" negates everything (hybrid/onsite/in-office)
      if (signal.negates === "all_remote") return signal;
      // "global" negates only global candidates
      if (signal.negates === "global" && candidateScope === "global") {
        return signal;
      }
    }
  }
  return null;
}

/**
 * Resolve allowedCountries for a ScopeSignal match. If the signal declares
 * explicit allowedCountries, use those. Otherwise, extract from the text.
 *
 * For medium-confidence patterns with capture groups (e.g., "must be based in
 * Germany"), extract the country from the capture group.
 */
function resolveAllowedCountries(
  signal: ScopeSignal,
  text: string,
): string[] | null {
  if (signal.allowedCountries) {
    return signal.allowedCountries;
  }

  // Try capture group extraction (for "must be based in [Country]" patterns)
  const match = text.match(signal.pattern);
  if (match?.[1]) {
    const code = extractCountryFromCapture(match[1]);
    if (code) return [code];
  }

  // Fall back to full-text country extraction
  return extractCountryCodesFromText(text);
}

/**
 * Step 1c — Regex hard-signal matching with confidence scoring.
 *
 * Uses the expanded pattern dictionary from `remote-scope-patterns.ts`:
 *   1. Check HIGH-CONFIDENCE signals (global → country_fenced → region_fenced).
 *      If any match → return immediately with confidence 1.0.
 *   2. Check on-site signals (only when workplaceType is null).
 *   3. Check NEGATIVE_SIGNALS. If "all_remote" negates → return null (onsite/hybrid).
 *   4. Check MEDIUM-CONFIDENCE signals. If any match AND no negative signal
 *      contradicts → return with confidence 0.7 (above threshold).
 *   5. Check UTC timezone range matcher.
 *   6. If nothing matched → return null (route to Step 2 LLM).
 *
 * @param cleanedText The main-content text from extractMainContent().
 * @param workplaceType The ATS-native workplace type (for context).
 * @returns RemoteScopeResult if at/above confidence threshold, null if inconclusive.
 */
export function step1RegexHardSignals(
  cleanedText: string,
  workplaceType: "remote" | "hybrid" | "on-site" | null,
): RemoteScopeResult | null {
  const text = cleanedText ?? "";

  // Phase 1: Check HIGH-CONFIDENCE signals (evaluation order: global → country → region).
  for (const signal of HIGH_CONFIDENCE_SIGNALS) {
    if (signal.pattern.test(text)) {
      return {
        remoteScope: signal.scope,
        allowedCountries: resolveAllowedCountries(signal, text),
        resolvedBy: "step1_regex",
        confidence: 1.0,
      };
    }
  }

  // Phase 2: Check on-site signals (only when workplaceType is null).
  if (workplaceType === null) {
    for (const pattern of ONSITE_HARD_SIGNALS) {
      if (pattern.test(text)) {
        return {
          remoteScope: "onsite",
          allowedCountries: null,
          resolvedBy: "step1_regex",
          confidence: 1.0,
        };
      }
    }
  }

  // Phase 3: Check negative signals. If "all_remote" negates (hybrid/onsite/
  // in-office), the job requires physical presence and is not remote.
  // When workplaceType is null OR 'hybrid'/'on-site' (ATS provided it but the
  // trust path was skipped, e.g., greenhouse), classify as onsite deterministically
  // — avoids an unnecessary LLM call for the ~26% of jobs that mention
  // hybrid/onsite in their text.
  // When workplaceType is "remote" (ATS explicitly says remote), don't
  // override to onsite — the on-site text may refer to something else (client
  // site, legacy phrase). Instead, block all remote scope matches and route
  // to LLM for disambiguation.
  const allRemoteNegation = checkNegativeSignals(text, "country_fenced");
  if (allRemoteNegation?.negates === "all_remote") {
    if (
      workplaceType === null ||
      workplaceType === "hybrid" ||
      workplaceType === "on-site"
    ) {
      return {
        remoteScope: "onsite",
        allowedCountries: null,
        resolvedBy: "step1_regex",
        confidence: 1.0,
      };
    }
    // workplaceType is "remote" — don't classify as onsite, but block remote
    // scope matches (the hybrid/onsite text contradicts the ATS label).
    return null;
  }

  // Phase 4: Check MEDIUM-CONFIDENCE signals. Accept if no negative signal
  // contradicts the candidate scope.
  for (const signal of MEDIUM_CONFIDENCE) {
    if (signal.pattern.test(text)) {
      const negation = checkNegativeSignals(text, signal.scope);
      if (negation === null) {
        return {
          remoteScope: signal.scope,
          allowedCountries: resolveAllowedCountries(signal, text),
          resolvedBy: "step1_regex",
          confidence: MEDIUM_CONFIDENCE_VALUE,
        };
      }
    }
  }

  // Phase 5: Check UTC timezone range matcher.
  const utcResult = matchUtcRange(text);
  if (utcResult) {
    const negation = checkNegativeSignals(text, utcResult.scope);
    if (negation === null) {
      return {
        remoteScope: utcResult.scope,
        allowedCountries: utcResult.allowedCountries ?? null,
        resolvedBy: "step1_regex",
        confidence: MEDIUM_CONFIDENCE_VALUE,
      };
    }
  }

  // Inconclusive — route to Step 2.
  return null;
}

// =============================================================================
// STEP 1d — HQ STRIPPING
// =============================================================================

/**
 * Strip company HQ / location fields from the text used for scope inference.
 *
 * Per governing doc: "Strip HQ/company location fields entirely from scope
 * inference — never trust registry company.location. Greenhouse (~85% miss
 * rate) and null-workplaceType skip straight to Step 2."
 *
 * Many ATS systems set the location to a company HQ city even for global
 * remote roles. Including the HQ in scope inference causes false
 * country_fenced classifications.
 *
 * @param text The cleaned JD text.
 * @param companyLocation The company's HQ location from the registry (if any).
 * @returns Text with HQ location references removed.
 */
export function stripCompanyHq(
  text: string,
  companyLocation: string | null,
): string {
  if (!companyLocation || !text) {
    return text;
  }

  // Remove the HQ location string from the text. Case-insensitive, global
  // replacement. This is conservative — it only removes exact matches of the
  // HQ string, not partial city name fragments.
  const escaped = companyLocation.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(escaped, "gi"), " ");
}

// =============================================================================
// STEP 2 — LLM EXTRACTION (SYNC PATH)
// =============================================================================

/**
 * Zod schema for Step 2 LLM output. Per governing doc:
 * `{ remoteScope, allowedCountries, workAuthRequired, confidence }`
 *
 * workAuthRequired is extracted for LLM reasoning quality (forcing the model
 * to reason about geographic restrictions explicitly improves remoteScope
 * accuracy) but is NOT persisted — no consumer exists in the current strategy.
 */
const llmScopeSchema = z.object({
  remoteScope: z.enum([
    "global",
    "country_fenced",
    "region_fenced",
    "onsite",
    "undetermined",
  ]),
  allowedCountries: z
    .array(z.string())
    .nullable()
    .describe("ISO 3166-1 alpha-2 country codes if country_fenced, else null"),
  workAuthRequired: z
    .boolean()
    .describe(
      "Whether the JD requires specific work authorization (US-only, etc.)",
    ),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("Confidence in the classification, 0.0 to 1.0"),
});

const LLM_SCOPE_SYSTEM_PROMPT = `You are a remote-work scope classifier for job postings. Read the job description text and classify the remote scope.

Classify as one of:
- "global": The job is remote with no geographic restrictions (e.g., "Remote - Global", "work from anywhere", "distributed team").
- "country_fenced": The job is remote but restricted to specific countries (e.g., "Remote - US Only", "must reside in Germany"). Provide the country codes in allowedCountries.
- "region_fenced": The job is remote but restricted to a broad region (e.g., "Remote - Latam", "Remote - APAC", "Remote - EMEA").
- "onsite": The job requires physical presence at a specific location (on-site or hybrid).
- "undetermined": The job description does not provide enough information to classify the remote scope.

CRITICAL RULES:
1. NEVER default to "onsite" or "country_fenced" when the scope is unclear. Use "undetermined" instead. Defaulting to restrictive interpretations is the anti-pattern that caused the original zero-match bug.
2. Ignore company headquarters / location metadata — only use the job description text itself. Many ATS systems set the location to a HQ city even for global remote roles.
3. "Remote" with no geographic qualifier should be classified as "global" (most inclusive interpretation).
4. Work authorization requirements (e.g., "authorized to work in US") indicate country_fenced, not global.
5. Extract allowedCountries as ISO 3166-1 alpha-2 codes (e.g., "US", "GB", "DE") when country_fenced. Null for all other scopes.`;

/**
 * Step 2 — LLM extraction via gpt-4o-mini (sync path).
 *
 * Uses the existing @ai-sdk/openai + generateObject pattern (same as
 * gate-3.ts and the tag extractor). This is the SLA-critical path for
 * first-time normalization inside the 4hr provisional window.
 *
 * The batch path (batch-llm-client.ts) serves SLA-indifferent paths and is
 * wired in Phase 3.
 */
async function extractScopeLLM(cleanedText: string): Promise<{
  remoteScope: RemoteScope;
  allowedCountries: string[] | null;
  confidence: number;
}> {
  // Truncate to stay within gpt-4o-mini's 8192 token input limit.
  // 1 token ≈ 4 chars for English → 20000 chars ≈ 5000 tokens, leaving
  // ample room for the system prompt (~500 tokens) and structured output.
  // Without truncation, long job descriptions cause API rejections that
  // hang the Inngest step (no timeout = indefinite hang → step failure).
  const truncatedText =
    cleanedText.length > 20000
      ? `${cleanedText.slice(0, 20000)}\n[... truncated for length ...]`
      : cleanedText;

  const { object } = await generateObject({
    model: openai("gpt-4o-mini"),
    schema: llmScopeSchema,
    system: LLM_SCOPE_SYSTEM_PROMPT,
    prompt: truncatedText,
    abortSignal: AbortSignal.timeout(30000),
  });

  return {
    remoteScope: object.remoteScope,
    allowedCountries: object.allowedCountries,
    confidence: object.confidence,
  };
}

// =============================================================================
// EXTRACTION LADDER ORCHESTRATOR
// =============================================================================

/**
 * Run the full Step 1 → Step 2 remote-scope extraction ladder.
 *
 * Flow (per governing doc Criterion 2):
 *   1. Step 1a: ATS-native workplaceType trust (Lever/Ashby on-site/hybrid → onsite).
 *   2. Step 1b: cheerio main-content extraction.
 *   3. Step 1d: Strip company HQ from the extracted text.
 *   4. Step 1c: Regex hard-signals with confidence scoring.
 *   5. If Step 1 resolved with high confidence → return.
 *   6. Step 2: LLM extraction (sync path via gpt-4o-mini).
 *   7. If Step 2 succeeds → return LLM result.
 *   8. Hard-fail: undetermined (never default to restrictive).
 *
 * @param rawContent The raw HTML or plain text from the ATS / probe pipeline.
 * @param workplaceType The ATS-native workplace type (remote/hybrid/on-site/null).
 * @param atsSource The ATS platform name (for the trust path).
 * @param companyLocation The company's HQ location (for HQ stripping).
 * @param llmExtractor Injectable LLM extractor (defaults to extractScopeLLM).
 *                     Tests pass a mock to avoid hitting the OpenAI API.
 */
export async function extractRemoteScope(
  rawContent: string | null,
  workplaceType: "remote" | "hybrid" | "on-site" | null,
  atsSource: string,
  companyLocation: string | null,
  llmExtractor: LlmScopeExtractor = extractScopeLLM,
): Promise<RemoteScopeResult> {
  // Step 1a: ATS-native trust path.
  const atsNativeResult = step1AtsNativeTrust(workplaceType, atsSource);
  if (atsNativeResult !== null) {
    return atsNativeResult;
  }

  // Step 1b: cheerio main-content extraction.
  const cleanedText = extractMainContent(rawContent);

  // Step 1d: Strip company HQ from scope inference.
  const hqStrippedText = stripCompanyHq(cleanedText, companyLocation);

  // Step 1e: Location-based check (runs BEFORE regex — Fix 3, mismatch July 2026).
  //
  // The location field is structured ATS metadata — more reliable than JD text
  // for determining geographic restrictions. The JD text may contain "global"
  // or "distributed" in a non-restriction context (e.g., "global impact",
  // "distributed team across the US"), causing the regex to misclassify as
  // "global" when the location field clearly says "Remote - U.S." or
  // "Poland / Remote / Poland".
  //
  // IMPORTANT: This check only takes precedence over the regex when the
  // location string contains a REMOTE INDICATOR ("remote", "worldwide", etc.).
  // This distinguishes between:
  //   - "Remote - U.S." → remote job location with fencing → country_fenced
  //   - "Poland / Remote / Poland" → remote job location with fencing → country_fenced
  //   - "San Francisco, CA" → just a city (HQ) → let regex evaluate JD text first
  //
  // Without the remote indicator guard, city names with state abbreviations
  // that conflict with country codes (e.g., "CA" = California vs Canada)
  // would cause false country_fenced classifications for HQ locations.
  //
  // Callers pass the job's locationName as the companyLocation parameter.
  //
  // v4 lock: also fire for null workplaceType — many ATS systems (especially
  // Greenhouse) don't set workplaceType but the location field still contains
  // "Remote - US" or "Poland / Remote / Poland". Without this, null-workplace
  // jobs with remote-indicator locations fall through to Rule 6 (onsite) or
  // the LLM, misclassifying remote jobs as onsite or global.
  if (
    (workplaceType === "remote" || workplaceType === null) &&
    companyLocation
  ) {
    const lowerLoc = companyLocation.toLowerCase();
    const hasRemoteIndicator = REMOTE_LOCATION_INDICATORS.some((ind) =>
      lowerLoc.includes(ind),
    );

    if (hasRemoteIndicator) {
      // Location string contains "remote" + a country name → country_fenced.
      // Handles "Remote - U.S.", "Poland / Remote / Poland", "Remote (US)".
      const locationCountry = extractLocationCountry(companyLocation);
      if (locationCountry !== null) {
        return {
          remoteScope: "country_fenced",
          allowedCountries: [locationCountry],
          resolvedBy: "step1_regex",
          confidence: MEDIUM_CONFIDENCE_VALUE,
        };
      }
    }
  }

  // Step 1f: Null workplaceType + specific city → onsite (Rule 6, v4 lock).
  //
  // When workplaceType is null AND the location is a specific city (not a
  // remote indicator, not a broad region), the job is almost certainly
  // on-site. Without this check, the LLM (Step 2) defaults to "global" or
  // "undetermined" for jobs that lack explicit remote/onsite signals in JD
  // text, causing false positives like the SF "New Grad" cases that reached
  // Gate 3 and were LLM-approved despite being clearly on-site roles.
  //
  // "Remote - US" with null workplaceType still classifies as country_fenced
  // (not onsite) because isSpecificLocation("Remote - US") returns false —
  // the existing Step 1e check handles it.
  if (workplaceType === null && companyLocation) {
    if (isSpecificLocation(companyLocation)) {
      return {
        remoteScope: "onsite",
        allowedCountries: null,
        resolvedBy: "step1_regex",
        confidence: MEDIUM_CONFIDENCE_VALUE,
      };
    }
  }

  // Step 1c: Regex hard-signals (runs after remote-location check so the
  // location field takes precedence for "Remote - Country" formats, but
  // pure city locations fall through to regex evaluation of JD text).
  const regexResult = step1RegexHardSignals(hqStrippedText, workplaceType);
  if (
    regexResult !== null &&
    regexResult.confidence >= STEP1_CONFIDENCE_THRESHOLD
  ) {
    return regexResult;
  }

  // Step 1e fallback: Location-based check for specific city/country locations
  // (no remote indicators). Runs AFTER the regex so that JD text patterns like
  // "Remote - Global" take precedence over HQ city locations.
  if (workplaceType === "remote" && companyLocation) {
    // Check for a specific city/country location (no remote indicators).
    if (isSpecificLocation(companyLocation)) {
      return {
        remoteScope: "country_fenced",
        allowedCountries: null,
        resolvedBy: "step1_regex",
        confidence: MEDIUM_CONFIDENCE_VALUE,
      };
    }
  }

  // If the cleaned text is empty or too short, hard-fail immediately
  // (no point calling the LLM on empty input).
  if (hqStrippedText.length < 50) {
    return {
      remoteScope: "undetermined",
      allowedCountries: null,
      resolvedBy: "hard_fail",
      confidence: 0,
    };
  }

  // Step 2: LLM extraction (sync path).
  try {
    const llmResult = await llmExtractor(hqStrippedText);
    return {
      remoteScope: llmResult.remoteScope,
      allowedCountries: llmResult.allowedCountries,
      resolvedBy: "step2_llm",
      confidence: llmResult.confidence,
    };
  } catch {
    // Hard-fail: undetermined + retryable. Never default to restrictive.
    return {
      remoteScope: "undetermined",
      allowedCountries: null,
      resolvedBy: "hard_fail",
      confidence: 0,
    };
  }
}

/**
 * Determine if a remote-scope result should trigger normalization_failed
 * (retryable) vs. just being stored as undetermined.
 *
 * Per governing doc: "Empty after cleaning / binary garbage → write
 * undetermined + normalization_failed (retryable)."
 *
 * A hard-fail from empty/garbage content → normalization_failed (the
 * normalizer should retry with an alternate parser or headless render).
 * A hard-fail from LLM error → undetermined only (the LLM was available
 * but couldn't classify — retry via nightly resurrection sweep).
 */
export function isHardFailRetryable(result: RemoteScopeResult): boolean {
  return result.resolvedBy === "hard_fail" && result.confidence === 0;
}
