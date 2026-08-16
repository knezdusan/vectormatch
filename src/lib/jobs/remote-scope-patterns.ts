// Remote-Scope Pattern Dictionary — v2 Corpus Expansion Task A2
// src/lib/jobs/remote-scope-patterns.ts
//
// Comprehensive, structured pattern table for Step 1 deterministic remote-scope
// resolution. Extracted from remote-scope-extractor.ts to enable independent
// tuning, testing, and corpus validation.
//
// Goal: push deterministic resolution from ~60% (MVP inline regex) to 75-80%,
// directly reducing OpenAI gpt-4o-mini costs on the ~4,000 jobs/day that
// currently fall through to Step 2 LLM.
//
// Structure: each pattern declares its scope, confidence level, and (for
// country_fenced) the allowed countries. The matcher in remote-scope-extractor.ts
// iterates high-confidence patterns first, then medium-confidence (with negative
// signal cross-check), and returns the first match at or above the acceptance
// threshold.
//
// Pattern categories (per governing doc "Open Tuning Items" + Task A2 spec):
//   HIGH-CONFIDENCE GLOBAL       — exact phrase hits, zero ambiguity
//   HIGH-CONFIDENCE COUNTRY_FENCED — explicit country restriction phrases
//   HIGH-CONFIDENCE REGION_FENCED — explicit broad-region restriction phrases
//   MEDIUM-CONFIDENCE            — ATS labels, timezone hints, "must be based in X"
//   NEGATIVE SIGNALS             — confidence boosters that negate global candidates
//
// Maintenance: add new patterns as production data reveals missed classifications.
// Validate against the corpus query in the governing doc's Task A2 spec.

// =============================================================================
// TYPES
// =============================================================================

/** A single remote-scope classification signal. */
export type ScopeSignal = {
  /** Regex pattern to match against cleaned JD text. */
  pattern: RegExp;
  /** The scope this signal indicates. */
  scope: "global" | "country_fenced" | "region_fenced";
  /** High = accept immediately (confidence 1.0). Medium = accept if no
   *  negative signals contradict (confidence 0.7). */
  confidence: "high" | "medium";
  /** For country_fenced: the ISO 3166-1 alpha-2 codes this pattern fences to.
   *  If omitted, the matcher extracts countries from the text via
   *  `extractCountryCodesFromText`. */
  allowedCountries?: string[];
};

/** Negative signals that negate or reduce confidence of positive matches. */
export type NegativeSignal = {
  pattern: RegExp;
  /** What this signal negates. */
  negates: "global" | "all_remote";
  /** Human-readable reason for observability. */
  reason: string;
};

// =============================================================================
// COUNTRY NAME → ISO CODE MAP
// =============================================================================

/** Country/region name → ISO 3166-1 alpha-2 code. Used for medium-confidence
 *  patterns that extract the country from the match (e.g., "must be based in
 *  Germany" → DE). Also used by the extractor's `extractCountryCodes` fallback. */
export const COUNTRY_CODE_MAP: Record<string, string> = {
  us: "US",
  usa: "US",
  "u.s.": "US",
  "u.s": "US",
  "united states": "US",
  america: "US",
  uk: "GB",
  "u.k.": "GB",
  "united kingdom": "GB",
  england: "GB",
  britain: "GB",
  scotland: "GB",
  wales: "GB",
  ireland: "IE",
  "republic of ireland": "IE",
  germany: "DE",
  france: "FR",
  spain: "ES",
  italy: "IT",
  netherlands: "NL",
  "the netherlands": "NL",
  holland: "NL",
  poland: "PL",
  portugal: "PT",
  belgium: "BE",
  switzerland: "CH",
  austria: "AT",
  sweden: "SE",
  norway: "NO",
  denmark: "DK",
  finland: "FI",
  iceland: "IS",
  czechia: "CZ",
  "czech republic": "CZ",
  greece: "GR",
  romania: "RO",
  bulgaria: "BG",
  hungary: "HU",
  slovakia: "SK",
  slovenia: "SI",
  croatia: "HR",
  serbia: "RS",
  estonia: "EE",
  latvia: "LV",
  lithuania: "LT",
  luxembourg: "LU",
  malta: "MT",
  cyprus: "CY",
  canada: "CA",
  australia: "AU",
  "new zealand": "NZ",
  india: "IN",
  brazil: "BR",
  mexico: "MX",
  argentina: "AR",
  colombia: "CO",
  chile: "CL",
  peru: "PE",
  uruguay: "UY",
  ecuador: "EC",
  "costa rica": "CR",
  panama: "PA",
  guatemala: "GT",
  singapore: "SG",
  japan: "JP",
  "south korea": "KR",
  korea: "KR",
  china: "CN",
  philippines: "PH",
  malaysia: "MY",
  indonesia: "ID",
  vietnam: "VN",
  thailand: "TH",
  taiwan: "TW",
  hong: "HK",
  "hong kong": "HK",
  israel: "IL",
  turkey: "TR",
  "south africa": "ZA",
  nigeria: "NG",
  kenya: "KE",
  egypt: "EG",
  morocco: "MA",
  saudi: "SA",
  "saudi arabia": "SA",
  "united arab emirates": "AE",
  uae: "AE",
  dubai: "AE",
};

/** Region name → representative ISO codes. Used for region_fenced patterns. */
export const REGION_CODE_MAP: Record<string, string[]> = {
  eu: [
    "DE",
    "FR",
    "ES",
    "IT",
    "NL",
    "PL",
    "PT",
    "BE",
    "AT",
    "SE",
    "NO",
    "DK",
    "FI",
    "IE",
    "CZ",
    "GR",
    "RO",
    "BG",
    "HU",
    "SK",
    "SI",
    "HR",
    "EE",
    "LV",
    "LT",
  ],
  europe: [
    "DE",
    "FR",
    "ES",
    "IT",
    "NL",
    "PL",
    "PT",
    "BE",
    "AT",
    "SE",
    "NO",
    "DK",
    "FI",
    "IE",
    "CZ",
    "GR",
    "RO",
    "BG",
    "HU",
    "SK",
    "SI",
    "HR",
    "EE",
    "LV",
    "LT",
    "GB",
    "CH",
  ],
  "european union": [
    "DE",
    "FR",
    "ES",
    "IT",
    "NL",
    "PL",
    "PT",
    "BE",
    "AT",
    "SE",
    "NO",
    "DK",
    "FI",
    "IE",
    "CZ",
    "GR",
    "RO",
    "BG",
    "HU",
    "SK",
    "SI",
    "HR",
    "EE",
    "LV",
    "LT",
  ],
  emea: [
    "DE",
    "FR",
    "ES",
    "IT",
    "NL",
    "PL",
    "PT",
    "GB",
    "IE",
    "CH",
    "AT",
    "SE",
    "NO",
    "DK",
    "FI",
    "CZ",
    "GR",
    "RO",
    "BG",
    "HU",
    "SK",
    "SI",
    "HR",
    "EE",
    "LV",
    "LT",
    "ZA",
    "NG",
    "KE",
    "EG",
    "MA",
    "SA",
    "AE",
    "IL",
    "TR",
  ],
  apac: [
    "AU",
    "NZ",
    "IN",
    "SG",
    "JP",
    "KR",
    "CN",
    "PH",
    "MY",
    "ID",
    "VN",
    "TH",
    "TW",
    "HK",
  ],
  "asia pacific": [
    "AU",
    "NZ",
    "IN",
    "SG",
    "JP",
    "KR",
    "CN",
    "PH",
    "MY",
    "ID",
    "VN",
    "TH",
    "TW",
    "HK",
  ],
  latam: ["BR", "MX", "AR", "CO", "CL", "PE"],
  "latin america": ["BR", "MX", "AR", "CO", "CL", "PE"],
  "north america": ["US", "CA", "MX"],
  balkans: ["RS", "HR", "SI", "BG", "RO", "HU", "GR", "AL", "MK", "BA", "ME"],
  "eastern europe": [
    "PL",
    "CZ",
    "SK",
    "HU",
    "RO",
    "BG",
    "HR",
    "SI",
    "RS",
    "EE",
    "LV",
    "LT",
    "UA",
    "BY",
  ],
};

// =============================================================================
// HIGH-CONFIDENCE GLOBAL SIGNALS
// =============================================================================

/**
 * Always-global override patterns — the STRONGEST global signals that override
 * a specific location conflict. When these fire, the job is global regardless
 * of what the location field says — the JD text explicitly says "anywhere" or
 * "no location restrictions", which cannot be contradicted by a location field
 * that lists a city out of ATS habit.
 *
 * Used by extractRemoteScope to short-circuit the location-vs-JD conflict
 * resolution (Step 1c) — instead of routing to LLM adjudication (which can
 * incorrectly fence these), return global directly.
 *
 * A1 recall check (2026-07-10): 4 justjoin jobs with "work from anywhere in
 * the world" in the JD but location "Warszawa, PL" were false-negatively
 * fenced to Poland by the LLM. These patterns prevent that.
 */
export const ALWAYS_GLOBAL_OVERRIDE: readonly RegExp[] = [
  /\bwork\s+from\s+anywhere\b/i,
  /\banywhere\s+in\s+the\s+world\b/i,
  /\bwork\s+from\s+any\s+location\b/i,
  /\bany\s+country\b/i,
  /\bno\s+location\s+restrictions?\b/i,
];

export const GLOBAL_HIGH: readonly ScopeSignal[] = [
  // Explicit "anywhere" / "worldwide" phrasing
  {
    pattern: /\banywhere\s+in\s+the\s+world\b/i,
    scope: "global",
    confidence: "high",
  },
  { pattern: /\bworldwide\b/i, scope: "global", confidence: "high" },
  {
    pattern: /\bwork\s+from\s+anywhere\b/i,
    scope: "global",
    confidence: "high",
  },
  {
    pattern: /\bwork\s+from\s+any\s+location\b/i,
    scope: "global",
    confidence: "high",
  },
  { pattern: /\bany\s+country\b/i, scope: "global", confidence: "high" },
  { pattern: /\bany\s+location\b/i, scope: "global", confidence: "high" },

  // Remote-first / distributed
  { pattern: /\bremote[- ]first\b/i, scope: "global", confidence: "high" },
  {
    pattern: /\bdistributed\s+(?:team|company|workforce|organization)\b/i,
    scope: "global",
    confidence: "high",
  },

  // Explicit "global remote" phrasing
  { pattern: /\bglobal\s+remote\b/i, scope: "global", confidence: "high" },
  {
    pattern: /\bremote\s*[-–]\s*(?:global|worldwide|anywhere)\b/i,
    scope: "global",
    confidence: "high",
  },
  {
    pattern: /\bfully\s+remote\s+worldwide\b/i,
    scope: "global",
    confidence: "high",
  },
  {
    pattern: /\b(?:global[,\s]+remote|remote[,\s]+global)\b/i,
    scope: "global",
    confidence: "high",
  },

  // No location restrictions
  {
    pattern: /\bno\s+location\s+restrictions?\b/i,
    scope: "global",
    confidence: "high",
  },
  {
    pattern: /\blocation\s+independent\b/i,
    scope: "global",
    confidence: "high",
  },
  { pattern: /\bborderless\b/i, scope: "global", confidence: "high" },

  // Multi-country signals (strong global indicator)
  {
    pattern: /\bteam\s+members\s+across\s+\d+\s+countries\b/i,
    scope: "global",
    confidence: "high",
  },
  {
    pattern: /\boperates?\s+in\s+\d+\s+countries\b/i,
    scope: "global",
    confidence: "high",
  },
];

// =============================================================================
// HIGH-CONFIDENCE COUNTRY-FENCED SIGNALS
// =============================================================================

/** Helper: generates the "X only" + "must be based in X" + "right to work in X"
 *  pattern family for a single country. */
function countryFencedPatterns(names: string[], code: string): ScopeSignal[] {
  const alternation = names.join("|");
  return [
    // "US only" / "UK only" / "Germany only"
    {
      pattern: new RegExp(`\\b(?:${alternation})\\s+only\\b`, "i"),
      scope: "country_fenced",
      confidence: "high",
      allowedCountries: [code],
    },
    // "must be based in the US" / "must reside in Germany"
    {
      pattern: new RegExp(
        `\\bmust\\s+(?:be\\s+)?(?:based|located|reside|live)\\s+in\\s+(?:the\\s+)?(?:${alternation})\\b`,
        "i",
      ),
      scope: "country_fenced",
      confidence: "high",
      allowedCountries: [code],
    },
    // "right to work in the US" / "right to work for Germany"
    {
      pattern: new RegExp(
        `\\bright\\s+to\\s+work\\s+(?:in|for)\\s+(?:the\\s+)?(?:${alternation})\\b`,
        "i",
      ),
      scope: "country_fenced",
      confidence: "high",
      allowedCountries: [code],
    },
    // "authorized to work in the US"
    {
      pattern: new RegExp(
        `\\bauthorized\\s+to\\s+work\\s+in\\s+(?:the\\s+)?(?:${alternation})\\b`,
        "i",
      ),
      scope: "country_fenced",
      confidence: "high",
      allowedCountries: [code],
    },
  ];
}

export const COUNTRY_FENCED_HIGH: readonly ScopeSignal[] = [
  // US — includes W-2 only (US-specific tax classification)
  {
    pattern: /\b(?:us|usa|u\.s\.?)\s+only\b/i,
    scope: "country_fenced",
    confidence: "high",
    allowedCountries: ["US"],
  },
  {
    pattern: /\bw-?2\s+only\b/i,
    scope: "country_fenced",
    confidence: "high",
    allowedCountries: ["US"],
  },
  // D19: E-Verify + federal work-eligibility language → country_fenced(US).
  // Removed from NATSEC bare keywords in D12 (39% over-fence) because e-verify
  // appears in nearly every US company's compliance text. But it was never
  // added to the FENCE classifier where it belongs — e-verify is a US-specific
  // work-authorization requirement, not a security-clearance signal.
  {
    pattern: /\be-?verify\b/i,
    scope: "country_fenced",
    confidence: "high",
    allowedCountries: ["US"],
  },
  {
    pattern:
      /\beligibility\s+to\s+work\s+in\s+(?:the\s+)?(?:u\.?s\.?a?\.?|united\s+states)\b/i,
    scope: "country_fenced",
    confidence: "high",
    allowedCountries: ["US"],
  },
  {
    pattern:
      /\bauthorized\s+to\s+work\s+in\s+(?:the\s+)?(?:u\.?s\.?a?\.?|united\s+states)\b/i,
    scope: "country_fenced",
    confidence: "high",
    allowedCountries: ["US"],
  },
  ...countryFencedPatterns(["us", "usa", "u\\.s\\.?", "united states"], "US"),
  ...countryFencedPatterns(
    ["uk", "u\\.k\\.?", "united kingdom", "england", "britain"],
    "GB",
  ),
  ...countryFencedPatterns(["canada"], "CA"),
  ...countryFencedPatterns(["germany"], "DE"),
  ...countryFencedPatterns(["france"], "FR"),
  ...countryFencedPatterns(["netherlands", "holland"], "NL"),
  ...countryFencedPatterns(["spain"], "ES"),
  ...countryFencedPatterns(["italy"], "IT"),
  ...countryFencedPatterns(["australia"], "AU"),
  ...countryFencedPatterns(["india"], "IN"),
  ...countryFencedPatterns(["brazil"], "BR"),
  ...countryFencedPatterns(["singapore"], "SG"),
  ...countryFencedPatterns(["ireland"], "IE"),
  ...countryFencedPatterns(["switzerland"], "CH"),
  ...countryFencedPatterns(["sweden"], "SE"),
  ...countryFencedPatterns(["poland"], "PL"),
  ...countryFencedPatterns(["portugal"], "PT"),
  ...countryFencedPatterns(["japan"], "JP"),
  ...countryFencedPatterns(["south korea", "korea"], "KR"),
  // Directive 30 Ruling 2.3: added Costa Rica and other Latin American countries
  ...countryFencedPatterns(["costa rica"], "CR"),
  ...countryFencedPatterns(["chile"], "CL"),
  ...countryFencedPatterns(["argentina"], "AR"),
  ...countryFencedPatterns(["mexico"], "MX"),
  ...countryFencedPatterns(["colombia"], "CO"),

  // Generic "remote within/in/restricted" (country extracted from context)
  {
    pattern: /\bremote\s+(?:within|in|restricted)\b/i,
    scope: "country_fenced",
    confidence: "high",
  },
  // "must be located/reside in" (generic — country extracted from context)
  {
    pattern: /\bmust\s+(?:be\s+)?(?:located|reside)\s+in\b/i,
    scope: "country_fenced",
    confidence: "high",
  },
];

// =============================================================================
// HIGH-CONFIDENCE REGION-FENCED SIGNALS
// =============================================================================

export const REGION_FENCED_HIGH: readonly ScopeSignal[] = [
  // "EU only" / "European Union only"
  {
    pattern: /\b(?:eu|european\s+union)\s+only\b/i,
    scope: "region_fenced",
    confidence: "high",
    allowedCountries: REGION_CODE_MAP.eu,
  },
  {
    pattern: /\bmust\s+(?:be\s+)?(?:based|located)\s+in\s+(?:the\s+)?eu\b/i,
    scope: "region_fenced",
    confidence: "high",
    allowedCountries: REGION_CODE_MAP.eu,
  },

  // Broad region "only" phrases
  {
    pattern: /\bemea\s+only\b/i,
    scope: "region_fenced",
    confidence: "high",
    allowedCountries: REGION_CODE_MAP.emea,
  },
  {
    pattern: /\bapac\s+only\b/i,
    scope: "region_fenced",
    confidence: "high",
    allowedCountries: REGION_CODE_MAP.apac,
  },
  {
    pattern: /\blatam\s+only\b/i,
    scope: "region_fenced",
    confidence: "high",
    allowedCountries: REGION_CODE_MAP.latam,
  },
  {
    pattern: /\bnorth\s+america\s+only\b/i,
    scope: "region_fenced",
    confidence: "high",
    allowedCountries: REGION_CODE_MAP["north america"],
  },

  // "Remote - LATAM/APAC/EMEA" (ATS label style)
  {
    pattern: /\bremote\s*[-–]\s*(?:latam|latin\s+america)\b/i,
    scope: "region_fenced",
    confidence: "high",
    allowedCountries: REGION_CODE_MAP.latam,
  },
  {
    pattern: /\bremote\s*[-–]\s*(?:apac|asia[- ]?pacific)\b/i,
    scope: "region_fenced",
    confidence: "high",
    allowedCountries: REGION_CODE_MAP.apac,
  },
  {
    pattern:
      /\bremote\s*[-–]\s*(?:emea|europe[- ]?middle[- ]?east[- ]?africa)\b/i,
    scope: "region_fenced",
    confidence: "high",
    allowedCountries: REGION_CODE_MAP.emea,
  },
  {
    pattern: /\bremote\s*[-–]\s*(?:balkans|eastern\s+europe)\b/i,
    scope: "region_fenced",
    confidence: "high",
    allowedCountries: REGION_CODE_MAP.balkans,
  },
  {
    pattern: /\bremote\s*[-–]\s*(?:eu|europe|european\s+union)\b/i,
    scope: "region_fenced",
    confidence: "high",
    allowedCountries: REGION_CODE_MAP.eu,
  },
];

// =============================================================================
// MEDIUM-CONFIDENCE SIGNALS (require country/region extraction)
// =============================================================================

export const MEDIUM_CONFIDENCE: readonly ScopeSignal[] = [
  // ATS labels: "Remote - US", "Remote: UK", "Remote - EU"
  {
    pattern: /\bremote\s*[-:]\s*(?:us|usa|u\.s\.?)\b/i,
    scope: "country_fenced",
    confidence: "medium",
    allowedCountries: ["US"],
  },
  {
    pattern: /\bremote\s*[-:]\s*(?:uk|u\.k\.?)\b/i,
    scope: "country_fenced",
    confidence: "medium",
    allowedCountries: ["GB"],
  },
  {
    pattern: /\bremote\s*[-:]\s*ca\b/i,
    scope: "country_fenced",
    confidence: "medium",
    allowedCountries: ["CA"],
  },
  {
    pattern: /\bremote\s*[-:]\s*de\b/i,
    scope: "country_fenced",
    confidence: "medium",
    allowedCountries: ["DE"],
  },
  {
    pattern: /\bremote\s*[-:]\s*fr\b/i,
    scope: "country_fenced",
    confidence: "medium",
    allowedCountries: ["FR"],
  },
  {
    pattern: /\bremote\s*[-:]\s*nl\b/i,
    scope: "country_fenced",
    confidence: "medium",
    allowedCountries: ["NL"],
  },
  {
    pattern: /\bremote\s*[-:]\s*(?:eu|emea|apac|latam)\b/i,
    scope: "region_fenced",
    confidence: "medium",
  },

  // "must be based in [Country]" / "must live in [Country]" / "must reside in [Country]"
  // Medium confidence — country extracted from capture group
  {
    pattern:
      /\bmust\s+(?:live|reside|be\s+based)\s+in\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/,
    scope: "country_fenced",
    confidence: "medium",
  },
  // "right to work in [Country]" / "right to work for [Country]"
  {
    pattern:
      /\bright\s+to\s+work\s+(?:in|for)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/,
    scope: "country_fenced",
    confidence: "medium",
  },
  // "based in [Country]" (weaker than "must be based in")
  {
    pattern:
      /\bbased\s+in\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:only|required)\b/i,
    scope: "country_fenced",
    confidence: "medium",
  },

  // "fully remote" / "100% remote" without country qualifier → global
  // (per governing doc: "Remote with no geographic qualifier → global,
  //  most inclusive interpretation"). Medium confidence because the JD
  // might mention a country elsewhere in the text — the negative signal
  // cross-check will catch "relocation required" contradictions.
  {
    pattern: /\bfully\s+remote\b/i,
    scope: "global",
    confidence: "medium",
  },
  {
    pattern: /\b100\s?%\s+remote\b/i,
    scope: "global",
    confidence: "medium",
  },
  {
    pattern: /\bremote\s+work\s+(?:available|option|opportunity)\b/i,
    scope: "global",
    confidence: "medium",
  },
];

// =============================================================================
// NEGATIVE SIGNALS (confidence boosters / negation)
// =============================================================================

export const NEGATIVE_SIGNALS: readonly NegativeSignal[] = [
  // Relocation required/offered → NOT global remote
  {
    pattern: /\brelocation\s+(?:required|offered|provided|assistance)\b/i,
    negates: "global",
    reason: "relocation_required",
  },
  // Hybrid / on-site / in-office → not fully remote
  {
    pattern: /\b(?:hybrid|on[- ]site|in[- ]office)\b/i,
    negates: "all_remote",
    reason: "hybrid_onsite",
  },
  // Local candidates only/preferred → location-fenced
  {
    pattern: /\blocal\s+candidates?\s+(?:only|preferred)\b/i,
    negates: "global",
    reason: "local_candidates_only",
  },
  // "must be in [City]" (city-level restriction, not country) → not global
  {
    pattern:
      /\bmust\s+(?:be\s+)?(?:in|based\s+in)\s+[A-Z][a-z]+,\s+[A-Z][a-z]+\b/,
    negates: "global",
    reason: "city_level_restriction",
  },
];

// =============================================================================
// UTC TIMEZONE RANGE MATCHER
// =============================================================================

/**
 * Parse UTC offset range from JD text. Narrow range (≤6 hours) suggests
 * region_fenced; wide range (>6 hours) suggests global.
 *
 * Examples:
 *   "UTC-5 to UTC+2" → range 7 → region_fenced (medium)
 *   "UTC-8 to UTC+8" → range 16 → global (medium)
 *   "UTC+1" → single offset, no range → null (insufficient signal)
 *
 * @returns ScopeSignal-like result if a UTC range is detected, null otherwise.
 */
export function matchUtcRange(text: string): {
  scope: "global" | "region_fenced";
  confidence: "medium";
  allowedCountries?: string[];
} | null {
  const rangeMatch = text.match(
    /UTC\s*([+-])\s*(\d{1,2})\s*(?:to|[-–])\s*UTC\s*([+-])\s*(\d{1,2})/i,
  );
  if (!rangeMatch) return null;

  const startSign = rangeMatch[1] === "-" ? -1 : 1;
  const startOffset = startSign * Number.parseInt(rangeMatch[2], 10);
  const endSign = rangeMatch[3] === "-" ? -1 : 1;
  const endOffset = endSign * Number.parseInt(rangeMatch[4], 10);

  const range = Math.abs(endOffset - startOffset);
  // Narrow range (≤8 hours) → region_fenced (e.g., UTC-5 to UTC+2 = Americas+Europe)
  // Wide range (>8 hours) → global (e.g., UTC-8 to UTC+8 = global coverage)
  if (range <= 8) {
    return { scope: "region_fenced", confidence: "medium" };
  }
  return { scope: "global", confidence: "medium" };
}

// =============================================================================
// COUNTRY EXTRACTION FROM TEXT
// =============================================================================

/**
 * Extract ISO 3166-1 alpha-2 country codes from free text using the
 * COUNTRY_CODE_MAP. Used when a country_fenced pattern matches but doesn't
 * declare explicit allowedCountries (e.g., generic "must reside in" pattern).
 *
 * Also checks REGION_CODE_MAP for region names.
 */
export function extractCountryCodesFromText(text: string): string[] | null {
  const codes = new Set<string>();
  const lower = text.toLowerCase();

  // Check country names
  for (const [name, code] of Object.entries(COUNTRY_CODE_MAP)) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(^|[^a-z])${escaped}(?=$|[^a-z])`).test(lower)) {
      codes.add(code);
    }
  }

  // Check region names (add all region members)
  for (const [name, regionCodes] of Object.entries(REGION_CODE_MAP)) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(^|[^a-z])${escaped}(?=$|[^a-z])`).test(lower)) {
      for (const c of regionCodes) codes.add(c);
    }
  }

  return codes.size > 0 ? [...codes] : null;
}

/**
 * Extract a country code from a capture group match (e.g., "must be based in
 * Germany" → capture group 1 = "Germany" → "DE").
 *
 * @param match The regex match result with a capture group containing the
 *              country name.
 * @returns ISO code or null if the country name isn't in the map.
 */
export function extractCountryFromCapture(
  capture: string | undefined,
): string | null {
  if (!capture) return null;
  const lower = capture.toLowerCase().trim();
  if (COUNTRY_CODE_MAP[lower]) return COUNTRY_CODE_MAP[lower];
  // Try matching partial (e.g., "United States" → "united states")
  for (const [name, code] of Object.entries(COUNTRY_CODE_MAP)) {
    if (lower === name) return code;
  }
  return null;
}

// =============================================================================
// AGGREGATE EXPORTS (for the matcher)
// =============================================================================

/** All high-confidence signals in evaluation order: global → country → region. */
export const HIGH_CONFIDENCE_SIGNALS: readonly ScopeSignal[] = [
  ...GLOBAL_HIGH,
  ...COUNTRY_FENCED_HIGH,
  ...REGION_FENCED_HIGH,
];

/** All signals (high + medium) in evaluation order. */
export const ALL_SIGNALS: readonly ScopeSignal[] = [
  ...HIGH_CONFIDENCE_SIGNALS,
  ...MEDIUM_CONFIDENCE,
];

// =============================================================================
// DETERMINISTIC MULTI-PROBE (region-fencing-behind-"Remote" detector)
// =============================================================================
// Resolves "global vs region-fenced" conflicts with regex signals — NO LLM.
// Catches the contamination that the location fix cannot see: jobs with
// location="Remote" but JD text containing region-specific signals (timezone
// requirements, salary currency, "candidates from", work authorization).
//
// A job is region_fenced if ≥1 high-severity probe fires, or ≥2 medium-severity.
// A job is global if NO probes fire (clean worldwide signal).

export type ProbeSeverity = "high" | "medium";

export interface MultiProbeResult {
  /** "global" if no probes fire, "region_fenced" if enough fire. */
  scope: "global" | "region_fenced";
  /** Which probes fired. */
  firedProbes: { signal: string; severity: ProbeSeverity }[];
  /** Confidence 0.0–1.0. 1.0 if high-severity probe fires, 0.7 if 2+ medium. */
  confidence: number;
}

/** Region-fencing probes — signals that indicate the job is NOT worldwide. */
const REGION_FENCING_PROBES: {
  pattern: RegExp;
  signal: string;
  severity: ProbeSeverity;
}[] = [
  // Timezone restrictions — narrow range = region-fenced
  {
    pattern: /\bUTC[-+]\d+\s+to\s+UTC[-+]?\d+\b/i,
    signal: "utc_range",
    severity: "high",
  },
  {
    pattern: /\bGMT[-+]\d+\s+to\s+GMT[-+]?\d+\b/i,
    signal: "gmt_range",
    severity: "high",
  },
  // Named timezone requirements
  {
    pattern:
      /\b(?:working\s+hours|timezone|time\s+zone).*?(?:UTC|GMT|EST|PST|CET|EET|IST|JST|AEST|PST|EST)\b/i,
    signal: "timezone_named",
    severity: "high",
  },
  // Region-named hours/timezone
  {
    pattern:
      /\b(?:EMEA|APAC|Latam|Americas|Europe|Asia|Africa)\s+(?:hours|timezone|time)\b/i,
    signal: "region_hours",
    severity: "high",
  },
  // "Must be based in [region]"
  {
    pattern:
      /\bmust\s+(?:be\s+)?(?:based|located|reside|live)\s+in\s+(?:Europe|Asia|Africa|South\s+America|North\s+America|EMEA|APAC|Latam|the\s+EU|the\s+UK|the\s+US)\b/i,
    signal: "must_be_in_region",
    severity: "high",
  },
  // "Candidates from [region/country]"
  {
    pattern:
      /\bcandidates\s+(?:from|in|based\s+in)\s+(?:Europe|Asia|Africa|South\s+America|North\s+America|EMEA|APAC|Latam)\b/i,
    signal: "candidates_from_region",
    severity: "high",
  },
  // Work authorization for specific country
  {
    pattern:
      /\b(?:eligible|authorized)\s+to\s+work\s+(?:in|for)\s+(?:the\s+)?(?:US|USA|UK|EU|Germany|France|India|Poland|Brazil|Canada|Australia|Singapore|Netherlands|Ireland)\b/i,
    signal: "work_auth_country",
    severity: "high",
  },
  // "Must have visa/permit for [country]"
  {
    pattern:
      /\bmust\s+(?:have|possess|hold)\s+(?:a\s+)?(?:work\s+)?(?:visa|permit)\s+(?:for|in)\s+/i,
    signal: "visa_required",
    severity: "high",
  },
  // "Only accepting candidates from"
  {
    pattern:
      /\bonly\s+(?:accepting|considering|hiring)\s+(?:candidates\s+)?(?:from|in)\s+/i,
    signal: "only_from",
    severity: "high",
  },
  // Salary currency (medium — doesn't always mean fenced, but strong hint)
  {
    pattern:
      /\b(?:salary|compensation|pay).*?(?:EUR|GBP|PLN|INR|BRL|CAD|AUD|SGD|ZAR|AED|SEK|NOK|DKK|CHF)\b/i,
    signal: "salary_currency_non_usd",
    severity: "medium",
  },
  // Core hours overlap requirement
  {
    pattern: /\b(?:core|business)\s+hours\s+(?:overlap|with)\s+/i,
    signal: "core_hours_overlap",
    severity: "medium",
  },
  // "During our business hours"
  {
    pattern: /\bduring\s+(?:our|the)\s+(?:business|core|working)\s+hours\b/i,
    signal: "during_business_hours",
    severity: "medium",
  },
  // Timezone overlap of N hours
  {
    pattern: /\boverlap\s+(?:with|of)\s+\d+\s+hours?\b/i,
    signal: "overlap_hours",
    severity: "medium",
  },
];

/**
 * Run deterministic multi-probe on JD text to detect region-fencing-behind-"Remote".
 *
 * Returns "region_fenced" if ≥1 high-severity probe fires, or ≥2 medium-severity.
 * Returns "global" if no probes fire (the job appears genuinely worldwide).
 *
 * This is a COST tool as much as accuracy: it resolves conflicts without LLM.
 * Used after the regex finds "global" + location is "Remote" (the conflict case
 * that previously routed to LLM). If multi-probe fires, the job is region_fenced
 * — no LLM needed. If multi-probe is clean, the job is genuinely global — no
 * LLM needed. LLM is only for the residual ambiguous cases.
 */
export function deterministicMultiProbe(text: string): MultiProbeResult {
  const firedProbes: { signal: string; severity: ProbeSeverity }[] = [];

  for (const probe of REGION_FENCING_PROBES) {
    if (probe.pattern.test(text)) {
      firedProbes.push({ signal: probe.signal, severity: probe.severity });
    }
  }

  const highCount = firedProbes.filter((p) => p.severity === "high").length;
  const mediumCount = firedProbes.filter((p) => p.severity === "medium").length;

  if (highCount >= 1) {
    return {
      scope: "region_fenced",
      firedProbes,
      confidence: 1.0,
    };
  }

  if (mediumCount >= 2) {
    return {
      scope: "region_fenced",
      firedProbes,
      confidence: 0.7,
    };
  }

  return {
    scope: "global",
    firedProbes,
    confidence: 0.7,
  };
}
