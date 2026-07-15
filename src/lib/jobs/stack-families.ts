// Stack Family Classification (Directive 11, Fix 3)
// src/lib/jobs/stack-families.ts
//
// The founder audit revealed jobs requiring Ruby on Rails, Java, .NET, or QA
// matching JS/PHP personas because tag overlap counts process-noise tags
// (agile, scrum, CI/CD, docker) as "stack overlap". This module defines:
//
// 1. Stack families — groups of tags that belong to the same technology ecosystem
// 2. Process-noise tags — tags that should NOT count toward stack overlap
// 3. Core-stack disjoint check — if persona core stack and job stack are disjoint,
//    reject regardless of embedding distance
//
// Used in Gate 1+2 (SQL router) and Gate 3 (LLM prompt context).

// ── Stack Families ───────────────────────────────────────────────────────────
//
// Each family is a set of canonical tag slugs that belong to the same technology
// ecosystem. A job or persona "belongs" to a family if it has ≥1 tag from that
// family. A persona's "core family" is the family with the most tag matches.

export const STACK_FAMILIES = {
  // JavaScript / TypeScript ecosystem
  js: new Set([
    "typescript", "javascript", "react", "nextjs", "nodejs", "vue", "nuxt",
    "express", "graphql", "tailwindcss", "svelte", "sveltekit", "remix",
    "gatsby", "astro", "solidjs", "preact", "angular", "ember", "backbone",
    "jquery", "vite", "webpack", "babel", "esbuild", "rollup", "parcel",
    "redux", "mobx", "zustand", "recoil", "tanstack", "react-query",
    "prisma", "drizzle", "trpc", "hono", "elysia", "fastify", "koa",
    "nestjs", "typeorm", "sequelize", "mongoose", "mongodb",
  ]),

  // PHP ecosystem
  php: new Set([
    "php", "laravel", "symfony", "wordpress", "drupal", "magento",
    "composer", "artisan", "blade", "eloquent", "livewire", "inertia",
    "codeigniter", "yii", "cakephp", "fuelphp", "slim",
  ]),

  // Ruby ecosystem
  ruby: new Set([
    "ruby", "rails", "sinatra", "hanami", "padrino", "roda",
    "rspec", "minitest", "capybara", "sidekiq", "resque",
  ]),

  // Java / JVM ecosystem
  java: new Set([
    "java", "spring", "spring-boot", "kotlin", "gradle", "maven",
    "hibernate", "jpa", "jakarta", "tomcat", "jetty", "quarkus",
    "micronaut", "vertx", "play", "akka", "scala", "clojure", "groovy",
  ]),

  // .NET ecosystem
  dotnet: new Set([
    "csharp", "dotnet", "aspnet", "fsharp", "vbnet", "razor",
    "blazor", "xamarin", "maui", "ef", "entity-framework", "linq",
    "signalr", "wcf", "wpf", "winforms",
  ]),

  // Python ecosystem
  python: new Set([
    "python", "django", "flask", "fastapi", "tornado", "aiohttp",
    "asyncio", "celery", "pytest", "unittest", "pandas", "numpy",
    "scipy", "scikit-learn", "tensorflow", "pytorch", "keras",
    "jupyter", "streamlit", "gradio", "langchain", "llamaindex",
  ]),

  // Go ecosystem
  go: new Set([
    "go", "golang", "gin", "echo", "fiber", "gorm", "chi",
    "cobra", "viper", "buf", "grpc-go",
  ]),

  // Rust ecosystem
  rust: new Set([
    "rust", "cargo", "tokio", "actix", "axum", "rocket",
    "serde", "warp", "tide", "diesel", "sqlx",
  ]),

  // C/C++ ecosystem
  cpp: new Set([
    "cpp", "cplusplus", "c", "qt", "boost", "stl", "cmake",
    "opencv", "cuda", "opencl", "mpi", "protobuf-c",
  ]),

  // QA / Testing (as a role, not a stack)
  qa: new Set([
    "selenium", "cypress", "playwright", "appium", "detox",
    "qa", "testing", "test-automation", "sdet", "qa-automation",
    "postman", "insomnia", "jmeter", "gatling", "k6",
  ]),
} as const;

export type StackFamily = keyof typeof STACK_FAMILIES;

// ── Process-Noise Tags ───────────────────────────────────────────────────────
//
// These tags are infrastructure/tooling/process tags that appear across ALL
// stack families. They should NOT count toward stack overlap because they
// inflate the match score for jobs that don't actually use the persona's core
// stack. Examples: a Java job that uses Docker + CI/CD + AWS should not match
// a JS persona on those tags alone.

export const PROCESS_NOISE_TAGS = new Set([
  // Infrastructure / DevOps
  "docker", "kubernetes", "k8s", "helm", "terraform", "ansible",
  "puppet", "chef", "vagrant", "docker-compose", "containerd",
  // CI/CD
  "ci-cd", "github-actions", "gitlab-ci", "jenkins", "circleci",
  "travis-ci", "teamcity", "bamboo", "argo", "drone",
  // Cloud (platform-agnostic — both JS and Java jobs use AWS)
  "aws", "azure", "gcp", "google-cloud", "cloudflare", "vercel",
  "netlify", "heroku", "digitalocean", "linode", "render",
  // Process / Methodology
  "agile", "scrum", "kanban", "tdd", "bdd", "code-review",
  "pair-programming", "saas", "b2b", "b2c",
  // Version control
  "git", "svn", "mercurial",
  // Generic web concepts (not stack-specific)
  "html", "css", "sass", "less", "sql", "postgresql", "mysql",
  "redis", "elasticsearch", "rabbitmq", "kafka", "nats",
  "rest", "graphql-schema", "json", "xml", "yaml", "toml",
  // Monitoring / Observability
  "grafana", "prometheus", "datadog", "sentry", "newrelic",
  "splunk", "elk", "jaeger", "zipkin",
  // Testing frameworks (cross-stack — Jest is JS but Playwright/Cypress are cross-stack)
  "jest", "vitest", "mocha", "chai", "testing-library",
  // Other generic
  "linux", "unix", "bash", "shell", "make",
]);

// ── Core-Stack Disjoint Check ────────────────────────────────────────────────

/**
 * Determine which stack family a set of tags belongs to.
 * Returns the family with the most tag matches, or null if no family matches.
 */
export function classifyStackFamily(tags: string[]): StackFamily | null {
  let bestFamily: StackFamily | null = null;
  let bestCount = 0;

  for (const [family, familyTags] of Object.entries(STACK_FAMILIES)) {
    if (family === "qa") continue; // QA is a role, not a stack
    let count = 0;
    for (const tag of tags) {
      if ((familyTags as Set<string>).has(tag)) count++;
    }
    if (count > bestCount) {
      bestCount = count;
      bestFamily = family as StackFamily;
    }
  }

  return bestCount > 0 ? bestFamily : null;
}

/**
 * Determine the stack families present in a set of tags.
 * Returns all families that have ≥1 tag match.
 */
export function getStackFamilies(tags: string[]): StackFamily[] {
  const families: StackFamily[] = [];
  for (const [family, familyTags] of Object.entries(STACK_FAMILIES)) {
    if (family === "qa") continue;
    for (const tag of tags) {
      if ((familyTags as Set<string>).has(tag)) {
        families.push(family as StackFamily);
        break;
      }
    }
  }
  return families;
}

/**
 * Check if persona core stack and job stack are disjoint.
 *
 * "Disjoint" means: the job has NO tags from the persona's core stack family.
 * If the persona is JS-family and the job has zero JS-family tags, they are
 * disjoint → reject.
 *
 * Note: a job can have tags from multiple families (e.g., .NET/React has both
 * csharp and react). In that case, the families are NOT disjoint — the job
 * does use the persona's core stack, even if it also requires other stacks.
 *
 * @param personaTags  The persona's must_have_tags
 * @param jobTags      The job's extracted_tags
 * @returns            true if stacks are disjoint (should reject)
 */
export function isStackDisjoint(
  personaTags: string[],
  jobTags: string[],
): boolean {
  const personaFamily = classifyStackFamily(personaTags);
  if (!personaFamily) return false; // Can't determine — don't reject

  const personaFamilyTags = STACK_FAMILIES[personaFamily] as Set<string>;

  // Check if the job has ANY tag from the persona's core family
  for (const tag of jobTags) {
    if (personaFamilyTags.has(tag)) return false; // Not disjoint
  }

  // No overlap — stacks are disjoint
  return true;
}

/**
 * Check if a job is a QA/SDET role (not a developer role).
 * Used to reject QA roles matching developer personas.
 *
 * @param title    The job title
 * @param jobTags  The job's extracted_tags
 * @returns        true if this is a QA/testing role
 */
export function isQARole(title: string, jobTags: string[]): boolean {
  const titleLower = (title ?? "").toLowerCase();

  // Title-based detection (strong signal)
  const qaTitlePatterns = [
    /\bqa\b/i, /\bquality assurance\b/i, /\bsdet\b/i,
    /\btest automation\b/i, /\bqa automation\b/i,
    /\bsoftware tester\b/i, /\btest engineer\b/i,
    /\bautomation engineer\b/i, /\btesting engineer\b/i,
  ];
  if (qaTitlePatterns.some((p) => p.test(titleLower))) return true;

  // Tag-based detection: if the job has ≥3 QA-family tags and no strong
  // developer-family signal in the title
  const qaFamilyTags = STACK_FAMILIES.qa as Set<string>;
  let qaTagCount = 0;
  for (const tag of jobTags) {
    if (qaFamilyTags.has(tag)) qaTagCount++;
  }
  if (qaTagCount >= 3) {
    // Check if the title mentions a developer role
    const devTitlePatterns = [
      /\bdeveloper\b/i, /\bengineer\b/i, /\bprogrammer\b/i,
    ];
    const devInTitle = devTitlePatterns.some((p) => p.test(titleLower));
    const qaInTitle = qaTitlePatterns.some((p) => p.test(titleLower));
    // If title says "QA" but also "Engineer", it's still a QA role
    if (qaInTitle) return true;
    // If title doesn't mention developer role, and has 3+ QA tags → likely QA
    if (!devInTitle) return true;
  }

  return false;
}

/**
 * Filter out process-noise tags from a tag list.
 * Used to compute "stack-only overlap" for Gate 1 scoring.
 */
export function stripProcessNoise(tags: string[]): string[] {
  return tags.filter((tag) => !PROCESS_NOISE_TAGS.has(tag));
}

/**
 * Compute the stack-only overlap between persona tags and job tags.
 * Excludes process-noise tags from the count.
 */
export function stackOverlapScore(
  personaTags: string[],
  jobTags: string[],
): number {
  const personaStack = new Set(stripProcessNoise(personaTags));
  const jobStack = new Set(stripProcessNoise(jobTags));
  let count = 0;
  for (const tag of personaStack) {
    if (jobStack.has(tag)) count++;
  }
  return count;
}
