// Tech-Stack Overlap Filter (WI3 Step 5)
// src/lib/jobs/direct-ingestion/filter.ts
//
// Filters direct job board API responses to only ingest jobs whose tech stack
// overlaps with the applicant's personas. This prevents ingesting thousands of
// backend/infra/data jobs that won't match a frontend developer.
//
// The filter is applied BEFORE upserting to the job table, saving DB storage
// and embedding API calls.
//
// Applicant personas: React/Next.js/TypeScript, Vue/JavaScript, PHP/Laravel.
// Expanded set includes adjacent skills (Node.js, CSS, HTML, frontend) that
// commonly co-occur in frontend job postings.

/** Tech-stack keywords matching the applicant's 3 personas. */
const PERSONA_TECH_KEYWORDS: ReadonlyArray<string> = [
  // React/Next.js/TypeScript persona
  "react",
  "next.js",
  "nextjs",
  "next js",
  "typescript",
  "ts",
  "tsx",
  "jsx",
  // Vue/JavaScript persona
  "vue",
  "vue.js",
  "vuejs",
  "vuex",
  "pinia",
  "nuxt",
  "javascript",
  "js",
  "es6",
  "ecmascript",
  // PHP/Laravel persona
  "php",
  "laravel",
  "symfony",
  "composer",
  "blade",
  // Adjacent frontend skills
  "node.js",
  "nodejs",
  "node js",
  "css",
  "scss",
  "sass",
  "tailwind",
  "html",
  "html5",
  "frontend",
  "front-end",
  "front end",
  "ui",
  "ux",
  "redux",
  "graphql",
  "webpack",
  "vite",
  "jquery",
  "angular",
  "svelte",
  "sveltekit",
  "astro",
  "remix",
  "gatsby",
];

/**
 * Check if a job's tech stack overlaps with the applicant's personas.
 *
 * Performs case-insensitive substring matching against the job's tags, title,
 * and description. A single keyword match is sufficient — we want broad
 * inclusion to avoid missing jobs that use non-standard tag names.
 *
 * @param tags        The board's structured tech tags (e.g. ["React", "AWS"])
 * @param title       The job title (e.g. "Senior Frontend Developer")
 * @param description The job description text (for fallback keyword detection)
 * @returns true if any persona keyword is found in the combined text
 */
export function hasPersonaTechOverlap(
  tags: string[],
  title: string,
  description: string,
): boolean {
  const haystack = [...tags, title, description].join(" ").toLowerCase();

  return PERSONA_TECH_KEYWORDS.some((kw) => {
    // Use word-boundary matching for short keywords (ts, js, ui, ux) to avoid
    // false positives from substrings (e.g. "ts" in "assets", "js" in "json").
    if (kw.length <= 3) {
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`(^|[^a-z])${escaped}(?=$|[^a-z])`).test(haystack);
    }
    return haystack.includes(kw);
  });
}

/**
 * Filter an array of jobs to only those with persona tech overlap.
 * Generic over the job shape — works with any object that has tags/title/description.
 */
export function filterByPersonaTech<
  T extends {
    tags: string[];
    title: string;
    description: string;
  },
>(jobs: T[]): T[] {
  return jobs.filter((j) =>
    hasPersonaTechOverlap(j.tags, j.title, j.description),
  );
}
