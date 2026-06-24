// CANONICAL_TAGS — VectorMatch Technology Tag Taxonomy
// src/lib/jobs/tech-tags.ts
//
// The single source of truth for technology tags used across the application.
// Seeded from the Stack Overflow Developer Survey 2025 technology taxonomy,
// with classifications locked per MODULE_A_DECISIONS.md.
//
// Classification rules (MODULE_A_DECISIONS.md §1):
// - persona_defining: A tag that can be the primary professional identity of a
//   developer. Test: "Is there a common job title that has this tag as its
//   primary noun?" (e.g., "React Developer" → react is persona_defining)
// - supporting: Technologies/methodologies that enhance a persona but don't
//   define one. (e.g., "CSS Developer" is not a real job title → css is
//   supporting)
//
// This is a global, static property of the tag itself. It is NOT a per-stack
// property — that distinction is handled by which 5 tags end up in
// persona.mustHaveTags.
//
// Initial draft: ~130 entries. Target ~300 after real-CV testing reveals gaps.
// Add new entries at the bottom of their category section, not alphabetically,
// so the git diff shows additions clearly.

export type TagClassification = "persona_defining" | "supporting";

export type TagCategory =
  | "language"
  | "frontend"
  | "backend"
  | "database"
  | "devops"
  | "library"
  | "mobile"
  | "methodology";

export type CanonicalTag = {
  /** Normalized slug used in DB, GIN indexes, and LLM prompts. Lowercase, no spaces. */
  tag: string;
  /** Display name for UI (dropdowns, persona labels). Proper case. */
  label: string;
  /** Whether this tag can anchor a persona identity. */
  classification: TagClassification;
  /** Coarse grouping for LLM stack-clustering reasoning and UI sections. */
  category: TagCategory;
};

export const CANONICAL_TAGS: CanonicalTag[] = [
  // ===========================================================================
  // LANGUAGES
  // ===========================================================================
  {
    tag: "javascript",
    label: "JavaScript",
    classification: "persona_defining",
    category: "language",
  },
  {
    tag: "typescript",
    label: "TypeScript",
    classification: "persona_defining",
    category: "language",
  },
  {
    tag: "python",
    label: "Python",
    classification: "persona_defining",
    category: "language",
  },
  {
    tag: "java",
    label: "Java",
    classification: "persona_defining",
    category: "language",
  },
  {
    tag: "csharp",
    label: "C#",
    classification: "persona_defining",
    category: "language",
  },
  {
    tag: "go",
    label: "Go",
    classification: "persona_defining",
    category: "language",
  },
  {
    tag: "rust",
    label: "Rust",
    classification: "persona_defining",
    category: "language",
  },
  {
    tag: "php",
    label: "PHP",
    classification: "persona_defining",
    category: "language",
  },
  {
    tag: "ruby",
    label: "Ruby",
    classification: "persona_defining",
    category: "language",
  },
  {
    tag: "swift",
    label: "Swift",
    classification: "persona_defining",
    category: "language",
  },
  {
    tag: "kotlin",
    label: "Kotlin",
    classification: "persona_defining",
    category: "language",
  },
  {
    tag: "c",
    label: "C",
    classification: "persona_defining",
    category: "language",
  },
  {
    tag: "cpp",
    label: "C++",
    classification: "persona_defining",
    category: "language",
  },
  {
    tag: "scala",
    label: "Scala",
    classification: "persona_defining",
    category: "language",
  },
  {
    tag: "elixir",
    label: "Elixir",
    classification: "persona_defining",
    category: "language",
  },
  {
    tag: "clojure",
    label: "Clojure",
    classification: "persona_defining",
    category: "language",
  },
  {
    tag: "haskell",
    label: "Haskell",
    classification: "persona_defining",
    category: "language",
  },
  {
    tag: "dart",
    label: "Dart",
    classification: "persona_defining",
    category: "language",
  },
  {
    tag: "lua",
    label: "Lua",
    classification: "persona_defining",
    category: "language",
  },
  {
    tag: "r",
    label: "R",
    classification: "persona_defining",
    category: "language",
  },
  {
    tag: "julia",
    label: "Julia",
    classification: "persona_defining",
    category: "language",
  },
  {
    tag: "sql",
    label: "SQL",
    classification: "supporting",
    category: "language",
  },
  {
    tag: "html",
    label: "HTML",
    classification: "supporting",
    category: "language",
  },
  {
    tag: "css",
    label: "CSS",
    classification: "supporting",
    category: "language",
  },
  {
    tag: "bash",
    label: "Bash/Shell",
    classification: "supporting",
    category: "language",
  },
  {
    tag: "powershell",
    label: "PowerShell",
    classification: "supporting",
    category: "language",
  },

  // ===========================================================================
  // FRONTEND FRAMEWORKS
  // ===========================================================================
  {
    tag: "react",
    label: "React",
    classification: "persona_defining",
    category: "frontend",
  },
  {
    tag: "nextjs",
    label: "Next.js",
    classification: "persona_defining",
    category: "frontend",
  },
  {
    tag: "vue",
    label: "Vue",
    classification: "persona_defining",
    category: "frontend",
  },
  {
    tag: "angular",
    label: "Angular",
    classification: "persona_defining",
    category: "frontend",
  },
  {
    tag: "svelte",
    label: "Svelte",
    classification: "persona_defining",
    category: "frontend",
  },
  {
    tag: "solidjs",
    label: "SolidJS",
    classification: "persona_defining",
    category: "frontend",
  },
  {
    tag: "gatsby",
    label: "Gatsby",
    classification: "persona_defining",
    category: "frontend",
  },
  // Meta-frameworks — supporting per Q4 decision (except nextjs)
  {
    tag: "nuxt",
    label: "Nuxt",
    classification: "supporting",
    category: "frontend",
  },
  {
    tag: "sveltekit",
    label: "SvelteKit",
    classification: "supporting",
    category: "frontend",
  },
  {
    tag: "remix",
    label: "Remix",
    classification: "supporting",
    category: "frontend",
  },
  {
    tag: "astro",
    label: "Astro",
    classification: "supporting",
    category: "frontend",
  },
  // Frontend libraries — supporting
  {
    tag: "jquery",
    label: "jQuery",
    classification: "supporting",
    category: "frontend",
  },
  {
    tag: "htmx",
    label: "HTMX",
    classification: "supporting",
    category: "frontend",
  },
  {
    tag: "alpinejs",
    label: "Alpine.js",
    classification: "supporting",
    category: "frontend",
  },
  {
    tag: "tailwindcss",
    label: "Tailwind CSS",
    classification: "supporting",
    category: "frontend",
  },
  {
    tag: "bootstrap",
    label: "Bootstrap",
    classification: "supporting",
    category: "frontend",
  },
  {
    tag: "sass",
    label: "Sass/SCSS",
    classification: "supporting",
    category: "frontend",
  },
  {
    tag: "styled-components",
    label: "Styled Components",
    classification: "supporting",
    category: "frontend",
  },
  {
    tag: "redux",
    label: "Redux",
    classification: "supporting",
    category: "frontend",
  },
  {
    tag: "zustand",
    label: "Zustand",
    classification: "supporting",
    category: "frontend",
  },
  {
    tag: "react-query",
    label: "React Query",
    classification: "supporting",
    category: "frontend",
  },
  {
    tag: "tanstack-query",
    label: "TanStack Query",
    classification: "supporting",
    category: "frontend",
  },

  // ===========================================================================
  // BACKEND FRAMEWORKS & RUNTIMES
  // ===========================================================================
  {
    tag: "nodejs",
    label: "Node.js",
    classification: "persona_defining",
    category: "backend",
  },
  {
    tag: "express",
    label: "Express",
    classification: "persona_defining",
    category: "backend",
  },
  {
    tag: "fastify",
    label: "Fastify",
    classification: "persona_defining",
    category: "backend",
  },
  {
    tag: "nestjs",
    label: "NestJS",
    classification: "persona_defining",
    category: "backend",
  },
  {
    tag: "deno",
    label: "Deno",
    classification: "persona_defining",
    category: "backend",
  },
  {
    tag: "bun",
    label: "Bun",
    classification: "persona_defining",
    category: "backend",
  },
  {
    tag: "django",
    label: "Django",
    classification: "persona_defining",
    category: "backend",
  },
  {
    tag: "flask",
    label: "Flask",
    classification: "persona_defining",
    category: "backend",
  },
  {
    tag: "fastapi",
    label: "FastAPI",
    classification: "persona_defining",
    category: "backend",
  },
  {
    tag: "rails",
    label: "Ruby on Rails",
    classification: "persona_defining",
    category: "backend",
  },
  {
    tag: "spring",
    label: "Spring",
    classification: "persona_defining",
    category: "backend",
  },
  {
    tag: "spring-boot",
    label: "Spring Boot",
    classification: "persona_defining",
    category: "backend",
  },
  {
    tag: "laravel",
    label: "Laravel",
    classification: "persona_defining",
    category: "backend",
  },
  {
    tag: "aspnet",
    label: "ASP.NET",
    classification: "persona_defining",
    category: "backend",
  },
  {
    tag: "gin",
    label: "Gin",
    classification: "persona_defining",
    category: "backend",
  },
  {
    tag: "phoenix",
    label: "Phoenix",
    classification: "persona_defining",
    category: "backend",
  },
  {
    tag: "actix",
    label: "Actix",
    classification: "persona_defining",
    category: "backend",
  },
  // Backend libraries — supporting
  {
    tag: "graphql",
    label: "GraphQL",
    classification: "supporting",
    category: "backend",
  },
  {
    tag: "apollo",
    label: "Apollo",
    classification: "supporting",
    category: "backend",
  },
  {
    tag: "trpc",
    label: "tRPC",
    classification: "supporting",
    category: "backend",
  },
  {
    tag: "prisma",
    label: "Prisma",
    classification: "supporting",
    category: "backend",
  },
  {
    tag: "drizzle",
    label: "Drizzle ORM",
    classification: "supporting",
    category: "backend",
  },
  {
    tag: "typeorm",
    label: "TypeORM",
    classification: "supporting",
    category: "backend",
  },
  {
    tag: "sequelize",
    label: "Sequelize",
    classification: "supporting",
    category: "backend",
  },
  {
    tag: "sqlalchemy",
    label: "SQLAlchemy",
    classification: "supporting",
    category: "backend",
  },
  {
    tag: "mongoose",
    label: "Mongoose",
    classification: "supporting",
    category: "backend",
  },
  {
    tag: "websocket",
    label: "WebSocket",
    classification: "supporting",
    category: "backend",
  },
  {
    tag: "grpc",
    label: "gRPC",
    classification: "supporting",
    category: "backend",
  },
  {
    tag: "rest",
    label: "REST API",
    classification: "supporting",
    category: "backend",
  },

  // ===========================================================================
  // DATABASES (all supporting — no "PostgreSQL Developer" job title)
  // ===========================================================================
  {
    tag: "postgresql",
    label: "PostgreSQL",
    classification: "supporting",
    category: "database",
  },
  {
    tag: "mysql",
    label: "MySQL",
    classification: "supporting",
    category: "database",
  },
  {
    tag: "mongodb",
    label: "MongoDB",
    classification: "supporting",
    category: "database",
  },
  {
    tag: "sqlite",
    label: "SQLite",
    classification: "supporting",
    category: "database",
  },
  {
    tag: "mariadb",
    label: "MariaDB",
    classification: "supporting",
    category: "database",
  },
  {
    tag: "mssql",
    label: "Microsoft SQL Server",
    classification: "supporting",
    category: "database",
  },
  {
    tag: "oracle",
    label: "Oracle DB",
    classification: "supporting",
    category: "database",
  },
  {
    tag: "dynamodb",
    label: "DynamoDB",
    classification: "supporting",
    category: "database",
  },
  {
    tag: "cassandra",
    label: "Cassandra",
    classification: "supporting",
    category: "database",
  },
  {
    tag: "elasticsearch",
    label: "Elasticsearch",
    classification: "supporting",
    category: "database",
  },
  {
    tag: "supabase",
    label: "Supabase",
    classification: "supporting",
    category: "database",
  },
  {
    tag: "firebase",
    label: "Firebase",
    classification: "supporting",
    category: "database",
  },
  {
    tag: "planetscale",
    label: "PlanetScale",
    classification: "supporting",
    category: "database",
  },
  {
    tag: "neo4j",
    label: "Neo4j",
    classification: "supporting",
    category: "database",
  },
  {
    tag: "influxdb",
    label: "InfluxDB",
    classification: "supporting",
    category: "database",
  },
  {
    tag: "redis",
    label: "Redis",
    classification: "supporting",
    category: "database",
  },

  // ===========================================================================
  // DEVOPS, CLOUD & INFRASTRUCTURE
  // ===========================================================================
  // Cloud platforms — persona_defining per Q1 decision
  {
    tag: "aws",
    label: "AWS",
    classification: "persona_defining",
    category: "devops",
  },
  {
    tag: "azure",
    label: "Azure",
    classification: "persona_defining",
    category: "devops",
  },
  {
    tag: "gcp",
    label: "Google Cloud",
    classification: "persona_defining",
    category: "devops",
  },
  // K8s — persona_defining per Q2 decision (CKA certification, dedicated admins)
  {
    tag: "kubernetes",
    label: "Kubernetes",
    classification: "persona_defining",
    category: "devops",
  },
  // Terraform — supporting per Q2 decision (tool, not identity)
  {
    tag: "terraform",
    label: "Terraform",
    classification: "supporting",
    category: "devops",
  },
  // Other DevOps tools — supporting
  {
    tag: "ansible",
    label: "Ansible",
    classification: "supporting",
    category: "devops",
  },
  {
    tag: "helm",
    label: "Helm",
    classification: "supporting",
    category: "devops",
  },
  {
    tag: "ci-cd",
    label: "CI/CD",
    classification: "supporting",
    category: "devops",
  },
  {
    tag: "github-actions",
    label: "GitHub Actions",
    classification: "supporting",
    category: "devops",
  },
  {
    tag: "gitlab-ci",
    label: "GitLab CI",
    classification: "supporting",
    category: "devops",
  },
  {
    tag: "jenkins",
    label: "Jenkins",
    classification: "supporting",
    category: "devops",
  },
  {
    tag: "nginx",
    label: "Nginx",
    classification: "supporting",
    category: "devops",
  },
  {
    tag: "apache",
    label: "Apache",
    classification: "supporting",
    category: "devops",
  },
  {
    tag: "traefik",
    label: "Traefik",
    classification: "supporting",
    category: "devops",
  },
  {
    tag: "vercel",
    label: "Vercel",
    classification: "supporting",
    category: "devops",
  },
  {
    tag: "netlify",
    label: "Netlify",
    classification: "supporting",
    category: "devops",
  },
  {
    tag: "cloudflare",
    label: "Cloudflare",
    classification: "supporting",
    category: "devops",
  },
  {
    tag: "linux",
    label: "Linux",
    classification: "supporting",
    category: "devops",
  },
  {
    tag: "prometheus",
    label: "Prometheus",
    classification: "supporting",
    category: "devops",
  },
  {
    tag: "grafana",
    label: "Grafana",
    classification: "supporting",
    category: "devops",
  },

  // ===========================================================================
  // MOBILE
  // ===========================================================================
  {
    tag: "react-native",
    label: "React Native",
    classification: "persona_defining",
    category: "mobile",
  },
  {
    tag: "flutter",
    label: "Flutter",
    classification: "persona_defining",
    category: "mobile",
  },
  {
    tag: "xamarin",
    label: "Xamarin",
    classification: "persona_defining",
    category: "mobile",
  },
  {
    tag: "ionic",
    label: "Ionic",
    classification: "persona_defining",
    category: "mobile",
  },
  {
    tag: "android",
    label: "Android",
    classification: "persona_defining",
    category: "mobile",
  },
  {
    tag: "ios",
    label: "iOS",
    classification: "persona_defining",
    category: "mobile",
  },

  // ===========================================================================
  // DATA & AI/ML LIBRARIES
  // ===========================================================================
  // persona_defining per Q3 decision (anchor identities for ML/Data personas)
  {
    tag: "tensorflow",
    label: "TensorFlow",
    classification: "persona_defining",
    category: "library",
  },
  {
    tag: "pytorch",
    label: "PyTorch",
    classification: "persona_defining",
    category: "library",
  },
  {
    tag: "spark",
    label: "Apache Spark",
    classification: "persona_defining",
    category: "library",
  },
  // supporting per Q3 decision (tools used by AI Engineer, not the anchor)
  {
    tag: "scikit-learn",
    label: "scikit-learn",
    classification: "supporting",
    category: "library",
  },
  {
    tag: "openai",
    label: "OpenAI API",
    classification: "supporting",
    category: "library",
  },
  {
    tag: "langchain",
    label: "LangChain",
    classification: "supporting",
    category: "library",
  },
  {
    tag: "huggingface",
    label: "Hugging Face",
    classification: "supporting",
    category: "library",
  },
  // Other data libraries — supporting
  {
    tag: "pandas",
    label: "Pandas",
    classification: "supporting",
    category: "library",
  },
  {
    tag: "numpy",
    label: "NumPy",
    classification: "supporting",
    category: "library",
  },
  {
    tag: "kafka",
    label: "Apache Kafka",
    classification: "supporting",
    category: "library",
  },
  {
    tag: "rabbitmq",
    label: "RabbitMQ",
    classification: "supporting",
    category: "library",
  },

  // ===========================================================================
  // METHODOLOGIES & PRACTICES (all supporting)
  // ===========================================================================
  {
    tag: "agile",
    label: "Agile",
    classification: "supporting",
    category: "methodology",
  },
  {
    tag: "scrum",
    label: "Scrum",
    classification: "supporting",
    category: "methodology",
  },
  {
    tag: "kanban",
    label: "Kanban",
    classification: "supporting",
    category: "methodology",
  },
  {
    tag: "tdd",
    label: "TDD",
    classification: "supporting",
    category: "methodology",
  },
  {
    tag: "bdd",
    label: "BDD",
    classification: "supporting",
    category: "methodology",
  },
  {
    tag: "git",
    label: "Git",
    classification: "supporting",
    category: "methodology",
  },
  {
    tag: "code-review",
    label: "Code Review",
    classification: "supporting",
    category: "methodology",
  },
  {
    tag: "pair-programming",
    label: "Pair Programming",
    classification: "supporting",
    category: "methodology",
  },

  // ===========================================================================
  // TESTING LIBRARIES (all supporting)
  // ===========================================================================
  {
    tag: "jest",
    label: "Jest",
    classification: "supporting",
    category: "library",
  },
  {
    tag: "vitest",
    label: "Vitest",
    classification: "supporting",
    category: "library",
  },
  {
    tag: "playwright",
    label: "Playwright",
    classification: "supporting",
    category: "library",
  },
  {
    tag: "cypress",
    label: "Cypress",
    classification: "supporting",
    category: "library",
  },
  {
    tag: "selenium",
    label: "Selenium",
    classification: "supporting",
    category: "library",
  },
  {
    tag: "testing-library",
    label: "Testing Library",
    classification: "supporting",
    category: "library",
  },
  {
    tag: "junit",
    label: "JUnit",
    classification: "supporting",
    category: "library",
  },
  {
    tag: "pytest",
    label: "pytest",
    classification: "supporting",
    category: "library",
  },
];

// =============================================================================
// DERIVED LOOKUPS — computed once at module load, used everywhere
// =============================================================================

/** O(1) lookup by tag slug. Used in the LLM normalization step. */
export const CANONICAL_TAG_MAP = new Map<string, CanonicalTag>(
  CANONICAL_TAGS.map((t) => [t.tag, t]),
);

/** O(1) lookup for the "at least 1 persona_defining tag per persona" validation rule. */
export const PERSONA_DEFINING_TAGS = new Set<string>(
  CANONICAL_TAGS.filter((t) => t.classification === "persona_defining").map(
    (t) => t.tag,
  ),
);

/** All valid tag slugs as a Set — used for Zod enum validation. */
export const CANONICAL_TAG_SLUGS = new Set<string>(
  CANONICAL_TAGS.map((t) => t.tag),
);

/** Tags grouped by category — used for UI section rendering. */
export const TAGS_BY_CATEGORY = CANONICAL_TAGS.reduce(
  (acc, tag) => {
    if (!acc[tag.category]) acc[tag.category] = [];
    acc[tag.category].push(tag);
    return acc;
  },
  {} as Record<TagCategory, CanonicalTag[]>,
);

/**
 * Normalize a raw skill string to a canonical tag slug.
 * Returns null if no match found (the caller should log unmapped tags
 * for future CANONICAL_TAGS expansion, not silently drop them).
 *
 * This is a simple exact-match lookup. The LLM is instructed to normalize
 * during extraction, so by the time this runs, the input should already
 * be a canonical slug. This function is a safety net.
 */
export function normalizeToCanonicalTag(rawSkill: string): string | null {
  const normalized = rawSkill.toLowerCase().trim();
  return CANONICAL_TAG_MAP.has(normalized) ? normalized : null;
}

/**
 * Check if a tag is persona_defining. O(1) lookup.
 * Used in persona validation (mustHaveTags must contain ≥1 persona_defining tag).
 */
export function isPersonaDefining(tag: string): boolean {
  return PERSONA_DEFINING_TAGS.has(tag);
}
