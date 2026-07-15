// Gate 0 — Pre-Database-Insertion Title Filter
// src/lib/jobs/gate-zero.ts
//
// Before the Phalanx Poller saves a job to the database, a fast synchronous
// regex test on the job title filters out non-engineering roles. If the title
// doesn't match, the job is thrown away immediately — it never touches the
// database. This prevents thousands of "Account Executive", "HR Manager", and
// "Janitor" roles from slowing down the Postgres HNSW index and eating disk.
//
// ── Design principle: optimize for RECALL, not precision ─────────────────────
// The 3-Gate funnel (Module C) handles precision. The cost of a false positive
// (one extra row filtered out by Gate 1/2/3) is low. The cost of a false
// negative (a missed job opportunity) is high. So the regex is intentionally
// broad — it catches anything that looks like an engineering role.
//
// ── Implementation notes ─────────────────────────────────────────────────────
// A single compiled regex with \b word boundaries and alternation. Phrase
// matching ("data engineer", "ml engineer") catches specialized roles without
// catching unrelated "data" or "ml" mentions. Word boundaries prevent
// "Data Entry Clerk" from matching "data".
//
// Plurals: optional "s" suffix (s?) on key terms so "Software Engineers" and
// "Frontend Developers" match. This is in the spirit of recall optimization.
//
// See TDD §4.3 for the full specification.

// ── Term categories (TDD §4.3) ───────────────────────────────────────────────
//
// The terms are grouped by category for readability, but they all feed into a
// single alternation regex. Order within the alternation doesn't matter for
// correctness — the regex tests for *any* match, not a specific one.

const TERMS: readonly string[] = [
  // Core engineering
  "engineer",
  "engineering",
  "developer",
  "programmer",
  "software",
  "frontend",
  "front-end",
  "backend",
  "back-end",
  "fullstack",
  "full-stack",

  // Specialized
  "devops",
  "sre",
  "site reliability",
  "platform engineer",
  "architect",
  "data engineer",
  "data scientist",
  "ml engineer",
  "machine learning engineer",
  "security engineer",
  "infrastructure",
  "reliability",

  // Mobile
  "ios developer",
  "android developer",
  "mobile developer",
  "react native",

  // Leadership
  "tech lead",
  "engineering manager",
  "engineering director",
  "cto",
  "vp of engineering",
  "head of engineering",

  // QA
  "qa engineer",
  "test engineer",
  "automation engineer",
  "quality engineer",

  // Design-adjacent
  "ui engineer",
  "ux engineer",
];

// ── Regex construction ───────────────────────────────────────────────────────
//
// Each term is wrapped in \b word boundaries. For single-word terms, we add an
// optional "s" suffix (s?) to catch plurals ("developers", "engineers"). For
// multi-word phrases (e.g. "data engineer"), the plural "s" goes on the last
// word. Hyphenated terms (e.g. "front-end") are left as-is — the hyphen is a
// non-word char so \b works naturally around it.
//
// The regex is compiled once at module load. The "i" flag makes it
// case-insensitive. The "g" flag is NOT used — we only need a boolean test.

function buildGateZeroRegex(): RegExp {
  const escaped = TERMS.map((term) => {
    // For multi-word phrases, add optional "s" to the last word only.
    // For single words, add optional "s" to the word.
    const parts = term.split(" ");
    const lastIdx = parts.length - 1;
    const processed = parts.map((part, idx) => {
      const escapedPart = part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // Add optional "s" to the last word (but not to hyphenated suffixes
      // like "-end" — only to alphabetic word endings).
      if (idx === lastIdx && /^[a-z]+$/.test(part)) {
        return `${escapedPart}s?`;
      }
      return escapedPart;
    });
    return `\\b${processed.join(" ")}\\b`;
  });
  const pattern = escaped.join("|");
  return new RegExp(pattern, "i");
}

/**
 * The compiled Gate 0 regex. Exported for testing and introspection.
 * Tests if a job title contains any engineering-relevant term.
 */
export const GATE_ZERO_REGEX = buildGateZeroRegex();

/**
 * Gate 0 — fast synchronous title filter.
 *
 * Returns `true` if the title passes Gate 0 (contains an engineering-relevant
 * term and should be inserted into the database). Returns `false` if the title
 * is a non-engineering role and should be discarded before database insertion.
 *
 * @example
 * passesGateZero("Senior Frontend Engineer")  // true
 * passesGateZero("Account Executive")          // false
 * passesGateZero("Data Entry Clerk")           // false (word boundary prevents "data" match)
 */
export function passesGateZero(title: string): boolean {
  return GATE_ZERO_REGEX.test(title);
}

// ── Gate 0 Web-Dev Scope (D7 — Role-Scoped Ingestion) ────────────────────────
//
// The broad Gate 0 passes ANY engineering title — Data Engineer, ML Engineer,
// DevOps, iOS, Android, Security Engineer, etc. These roles will never match
// the web-dev personas (React/Next.js, PHP/Laravel, Vue/JavaScript) and waste
// storage + embedding cost.
//
// Gate 0 Web-Dev narrows the filter to web-dev-specific titles. It's used in
// the poller path to prevent non-web-dev engineering jobs from entering the
// database at all — the cheapest filter is the one that runs before the INSERT.
//
// Design: optimize for RECALL within the web-dev domain. The regex is broad
// within web-dev (catches "frontend", "fullstack", "web developer", "PHP
// developer", "React engineer") but excludes non-web engineering ("data
// engineer", "ml engineer", "ios developer", "devops", "sre").

const WEBDEV_GATE_TERMS: readonly string[] = [
  // Core web-dev roles
  "frontend",
  "front-end",
  "front end",
  "backend",
  "back-end",
  "back end",
  "fullstack",
  "full-stack",
  "full stack",
  "web developer",
  "web engineer",
  "web development",

  // JS/TS ecosystem (title-level signals)
  "javascript",
  "typescript",
  "react",
  "next.js",
  "nextjs",
  "next js",
  "node",
  "node.js",
  "nodejs",
  "vue",
  "vue.js",
  "vuejs",
  "angular",
  "svelte",
  "sveltekit",
  "ember",
  "gatsby",
  "remix",
  "astro",

  // PHP ecosystem
  "php",
  "laravel",
  "symfony",
  "wordpress",
  "wp developer",
  "drupal",
  "joomla",
  "magento",

  // Other web stacks
  "shopify",
  "liquid",
  "webflow",
  "html",
  "css",
  "scss",
  "sass",
  "tailwind",

  // UI/UX engineering (web-dev adjacent)
  "ui engineer",
  "ui developer",
  "ux engineer",
  "ux developer",
];

const WEBDEV_GATE_REGEX = new RegExp(
  WEBDEV_GATE_TERMS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(
    "|",
  ),
  "i",
);

/**
 * Gate 0 Web-Dev — fast synchronous title filter for web-dev roles only.
 *
 * Returns `true` if the title contains a web-dev-specific term. This is a
 * NARROWER filter than `passesGateZero` — it excludes Data Engineer, ML
 * Engineer, DevOps, SRE, iOS/Android, Security Engineer, etc.
 *
 * Used in the poller path (D7 role-scoped ingestion) to prevent non-web-dev
 * engineering jobs from entering the database.
 *
 * @example
 * passesGateZeroWebDev("Senior Frontend Engineer")   // true
 * passesGateZeroWebDev("PHP Developer")               // true
 * passesGateZeroWebDev("Data Engineer")               // false (not web-dev)
 * passesGateZeroWebDev("iOS Developer")               // false (not web-dev)
 * passesGateZeroWebDev("DevOps Engineer")             // false (not web-dev)
 * passesGateZeroWebDev("Account Executive")           // false (not engineering)
 */
export function passesGateZeroWebDev(title: string): boolean {
  return WEBDEV_GATE_REGEX.test(title);
}

// ── Gate 0 Fence Detection (Directive 11, Fix 1) ─────────────────────────────
//
// The founder audit revealed jobs with country/state fences in the TITLE or
// LOCATION string passing through all gates and appearing on the dashboard.
// Examples from the ground-truth mismatch set:
//   - "Senior Software Engineer - Fullstack, US Remote" (title contains "US Remote")
//   - "Remote; Argentina" (location contains country name)
//   - "Remote, md" (location contains US state abbreviation)
//   - "San Francisco, CA, New York, NY, Portland, OR, or Remote within Canada or United States"
//   - "London; Geneva" (specific non-US cities)
//   - "São Paulo" (specific non-US city)
//   - "European Union" (region fence)
//   - "NAMER + EMEA" (region fence)
//
// This function runs at Position 0 (pre-normalization, alongside Gate 0 title
// filter) to reject country-fenced jobs BEFORE they enter the database. It also
// serves as a backstop in Gate 1+2 for jobs that were already ingested.
//
// Returns the detected fence type, or null if no fence detected.

/** US state codes (2-letter postal abbreviations). */
const US_STATE_CODES = new Set([
  "al",
  "ak",
  "az",
  "ar",
  "ca",
  "co",
  "ct",
  "de",
  "fl",
  "ga",
  "hi",
  "id",
  "il",
  "in",
  "ia",
  "ks",
  "ky",
  "la",
  "me",
  "md",
  "ma",
  "mi",
  "mn",
  "ms",
  "mo",
  "mt",
  "ne",
  "nv",
  "nh",
  "nj",
  "nm",
  "ny",
  "nc",
  "nd",
  "oh",
  "ok",
  "or",
  "pa",
  "ri",
  "sc",
  "sd",
  "tn",
  "tx",
  "ut",
  "vt",
  "va",
  "wa",
  "wv",
  "wi",
  "wy",
  "dc",
]);

/** Country names and common variants that indicate a geographic fence. */
const COUNTRY_NAMES = [
  "united states",
  "usa",
  "u.s.",
  "u.s.a.",
  "america",
  "canada",
  "argentina",
  "brazil",
  "colombia",
  "mexico",
  "germany",
  "france",
  "spain",
  "italy",
  "portugal",
  "netherlands",
  "poland",
  "ukraine",
  "romania",
  "ireland",
  "sweden",
  "norway",
  "denmark",
  "finland",
  "belgium",
  "austria",
  "switzerland",
  "czech republic",
  "greece",
  "india",
  "pakistan",
  "philippines",
  "vietnam",
  "indonesia",
  "malaysia",
  "singapore",
  "hong kong",
  "japan",
  "south korea",
  "korea",
  "australia",
  "new zealand",
  "south africa",
  "nigeria",
  "kenya",
  "egypt",
  "morocco",
  "israel",
  "uae",
  "saudi arabia",
  "turkey",
  "united kingdom",
  "uk",
  "england",
  "scotland",
  "wales",
];

/** Region/continent terms that indicate a geographic fence. */
const REGION_TERMS = [
  "european union",
  "eu only",
  "europe only",
  "namer",
  "emea",
  "apac",
  "latam",
  "lac",
  "north america",
  "south america",
  "central america",
  "middle east",
  "africa",
  "asia",
  "europe",
  "balkans",
  "eastern europe",
  "western europe",
  "nordics",
  "scandinavia",
  "caribbean",
  "benelux",
  "dach",
];

/**
 * Compiled regex for detecting country-fence patterns in title+location strings.
 * Matches patterns like:
 *   - "US Remote", "US-Remote", "Remote (US)", "Remote, US"
 *   - "Remote; Argentina", "Remote - Argentina"
 *   - "Remote within Canada or United States"
 *   - "Remote, md", "Remote, MD"
 *   - "Remote within [country/region]"
 *   - Country name alone in location (e.g., "São Paulo", "Toronto")
 */
const FENCE_PATTERNS = [
  // "US Remote" / "US-Remote" / "USA Remote" in title
  /\b(u\.?s\.?a?\.?|united states)\s*[-/]?\s*remote\b/i,
  // "Remote (US)" / "Remote (USA)" / "Remote (United States)"
  /\bremote\s*[[(]\s*(u\.?s\.?a?\.?|united states|usa)\s*[\])]/i,
  // "Remote, US" / "Remote, USA" / "Remote - US"
  /\bremote\s*[,;:-]\s*(u\.?s\.?a?\.?|united states|usa)\b/i,
  // "Remote within [country/region]"
  /\bremote\s+within\s+/i,
  // "Remote; [country]" / "Remote - [country]"
  /\bremote\s*[;,-]\s*(argentina|brazil|colombia|mexico|canada|germany|france|spain|italy|portugal|netherlands|poland|ukraine|india|pakistan|philippines|australia|united kingdom|uk|ireland|sweden|norway|denmark|finland|belgium|switzerland|austria|greece|romania|south africa|nigeria|israel|turkey|japan|south korea|singapore|hong kong|new zealand)\b/i,
  // "Remote, [state code]" (e.g., "Remote, md", "Remote, ca")
  /\bremote\s*,\s*([a-z]{2})\b/i,
  // Region terms in location
  /\b(european union|namer|emea|apac|latam|north america|south america|middle east|balkans|eastern europe|western europe|nordics|scandinavia|dach|benelux)\b/i,
];

const FENCE_REGEX = new RegExp(
  FENCE_PATTERNS.map((r) => r.source).join("|"),
  "i",
);

/**
 * Detect country/region fence in a job's title and location strings.
 *
 * This runs at Position 0 (pre-normalization) alongside the Gate 0 title filter.
 * If a fence is detected, the job is rejected before database insertion (poller
 * path) or filtered out at Gate 1+2 (SQL backstop for already-ingested jobs).
 *
 * @param title    The raw job title (e.g., "Senior Software Engineer - Fullstack, US Remote")
 * @param location The raw job location string (e.g., "Remote, md" or "São Paulo")
 * @returns        The fence type detected, or null if no fence found.
 *                 - "title_fence": fence pattern found in title
 *                 - "location_country": country name in location
 *                 - "location_region": region term in location
 *                 - "location_us_state": US state code in location
 *                 - "location_specific_city": specific city pattern (comma-separated)
 */
export function detectCountryFence(
  title: string,
  location: string | null | undefined,
):
  | "title_fence"
  | "location_country"
  | "location_region"
  | "location_us_state"
  | "location_specific_city"
  | null {
  const titleStr = title ?? "";
  const locStr = location ?? "";

  // 1. Check title for explicit fence patterns ("US Remote", "Remote (US)", etc.)
  if (FENCE_REGEX.test(titleStr)) {
    return "title_fence";
  }

  if (!locStr || locStr.trim().length === 0) return null;

  const locLower = locStr.toLowerCase().trim();

  // 2. Check location for fence patterns (regex matches "Remote, XX", "Remote within", etc.)
  if (FENCE_REGEX.test(locStr)) {
    // Distinguish region from country from US state
    if (
      /\b(european union|namer|emea|apac|latam|north america|south america|middle east|balkans|eastern europe|western europe|nordics|scandinavia|dach|benelux)\b/.test(
        locLower,
      )
    ) {
      return "location_region";
    }
    // Check if it's a "Remote, [state code]" pattern
    const remoteStateMatch = locLower.match(/remote\s*,\s*([a-z]{2})\b/);
    if (remoteStateMatch && US_STATE_CODES.has(remoteStateMatch[1])) {
      return "location_us_state";
    }
    return "location_country";
  }

  // 3. Check for region terms first (before country — "EMEA" etc.)
  for (const region of REGION_TERMS) {
    if (locLower.includes(region)) {
      return "location_region";
    }
  }

  // 4. Check for US state codes in location (e.g., "Remote, md", "San Francisco, CA")
  // Look for patterns like ", XX" where XX is a state code
  const stateMatches = locLower.matchAll(/,\s*([a-z]{2})\b/g);
  for (const match of stateMatches) {
    if (US_STATE_CODES.has(match[1])) {
      return "location_us_state";
    }
  }

  // 5. Check for country names in location (including "us" as a standalone word)
  for (const country of COUNTRY_NAMES) {
    if (locLower.includes(country)) {
      return "location_country";
    }
  }
  // Check for standalone "us" (word-boundary, very short location like "US")
  if (/\bus\b/.test(locLower) && locLower.length <= 5) {
    return "location_country";
  }

  // 6. Check for specific city patterns
  // If the location does NOT contain remote/anywhere/worldwide/global/distributed,
  // it's likely a specific city or region — treat as a fence.
  const REMOTE_KEYWORDS = [
    "remote",
    "anywhere",
    "worldwide",
    "global",
    "distributed",
    "any location",
  ];
  const hasRemoteKeyword = REMOTE_KEYWORDS.some((kw) => locLower.includes(kw));
  if (!hasRemoteKeyword) {
    // If location has a semicolon (multiple cities) or comma (city, state/country)
    // or is a single non-empty word that isn't a remote keyword, it's a specific location
    if (locLower.includes(";") || /^[a-z].*,\s*[a-z]/i.test(locStr)) {
      return "location_specific_city";
    }
    // Single-word or multi-word location that isn't a remote keyword
    // e.g., "Toronto", "São Paulo", "London"
    if (locLower.length > 0 && locLower.length < 50) {
      return "location_specific_city";
    }
  }

  return null;
}

/**
 * Convenience wrapper: returns true if the job PASSES the fence gate (no fence detected).
 * Used in the poller path alongside passesGateZero/passesGateZeroWebDev.
 */
export function passesFenceGate(
  title: string,
  location: string | null | undefined,
): boolean {
  return detectCountryFence(title, location) === null;
}

// ── Gate 0 National-Security Filter (Directive 11, Fix 2) ───────────────────
//
// The founder audit revealed 13 jobs from Redhorsecorp (a US government
// contractor) appearing on the dashboard despite the user being a non-US
// remote worker. These jobs require security clearance, US citizenship,
// or are subject to ITAR/EAR export controls — none of which are eligible
// for a non-US remote contractor.
//
// This deterministic gate checks the job title and description text for
// national-security keywords. If detected, the job is rejected at ingestion
// (poller path) and also at Gate 1+2 (SQL backstop for already-ingested jobs).
//
// The gate is intentionally broad (recall over precision) — a false positive
// (rejecting a civilian job that mentions "security") is low-cost, while a
// false negative (showing a clearance-required job to a non-US user) is
// a product-breaking experience.

/**
 * Keywords that indicate a national-security / gov-contractor role.
 * These are hard fences — jobs containing these are rejected for non-US users.
 */
const NATIONAL_SECURITY_KEYWORDS = [
  // Security clearance levels
  "security clearance",
  "top secret",
  "ts/sci",
  "ts/sci clearance",
  "secret clearance",
  "confidential clearance",
  "public trust clearance",
  "clearance required",
  "must have clearance",
  "active clearance",
  "eligible for clearance",
  "clearance eligibility",
  // Citizenship requirements
  "us citizen",
  "u.s. citizen",
  "united states citizen",
  "us citizenship",
  "u.s. citizenship",
  "must be a us citizen",
  "american citizen",
  "national of the united states",
  // Export control regimes
  "itar",
  "ear",
  "export control",
  "export controlled",
  "ear-controlled",
  "itar-controlled",
  "itars",
  // Government/defense agencies
  "dod",
  "department of defense",
  "dod contract",
  "defense contract",
  "government contract",
  "federal contract",
  "federal contractor",
  "national security",
  "homeland security",
  "law enforcement",
  "intelligence community",
  "central intelligence",
  "cia",
  "fbi",
  "nsa",
  "dhs",
  "space force",
  "air force",
  "navy",
  "army",
  "marines",
  "pentagon",
  "fort ",
  "naval ",
  "air force base",
  // E-Verify / government employment terms
  "e-verify",
  "everify",
  "e verify",
  "public trust",
  "position of public trust",
  "background investigation",
  "background check required",
  "polygraph",
  "counterintelligence",
  // Common gov-contractor company indicators in job text
  "security clearance required",
  "must be able to obtain clearance",
  "us person",
  "u.s. person",
  "us person status",
];

const NATIONAL_SECURITY_REGEX = new RegExp(
  NATIONAL_SECURITY_KEYWORDS.map((kw) =>
    kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  ).join("|"),
  "i",
);

/**
 * Detect national-security / gov-contractor indicators in job text.
 *
 * Checks the title and the first ~2000 chars of the job description for
 * national-security keywords. Returns true if detected.
 *
 * @param title       The job title
 * @param description The job description text (or normalized_text)
 * @returns           true if national-security indicators detected
 */
export function isNationalSecurityJob(
  title: string,
  description: string | null | undefined,
): boolean {
  const text = `${title ?? ""} ${(description ?? "").slice(0, 3000)}`;
  return NATIONAL_SECURITY_REGEX.test(text);
}
