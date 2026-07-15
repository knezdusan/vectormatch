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
