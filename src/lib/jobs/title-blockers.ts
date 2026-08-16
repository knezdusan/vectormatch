// Deterministic Title Blockers — Directive 30, Rulings 2.1 + 2.2
// src/lib/jobs/title-blockers.ts
//
// Pre-LLM, persona-relative deterministic blockers that reject job-persona
// pairs based on the job TITLE before Gate 3 (the LLM) is invoked.
//
// Two blocker families:
//
//   1. Platform-name blocker (Ruling 2.1):
//      If the job title names a platform/CMS/e-commerce system that is NOT
//      in the persona's must-have tags, reject. Examples: SharePoint, Magento,
//      Shopify, Drupal, Salesforce, ServiceNow, Sitecore, AEM, Webflow, .NET/C#.
//      Exceptions are persona-relative: Shopify is legitimate for a PHP/
//      WordPress persona (Liquid is PHP-adjacent), WordPress is legitimate
//      for the PHP persona, etc.
//
//   2. Role-family blocker (Ruling 2.2):
//      Reject unsuitable role families for web-development personas when the
//      persona does not explicitly support them. Examples: Architect, Solutions
//      Architect, DevOps, SRE, Platform Engineer, Data Engineer, ML Engineer,
//      Mobile/iOS/Android/React Native, QA/SDET, Engineering Manager.
//
// These blockers run AFTER Gate 1+2 (which already inserted candidates into
// match_queue) but BEFORE Gate 3 fan-out. Rejected candidates are marked
// 'rejected' in match_queue with a deterministic blocker reason, preserving
// re-evaluability and audit trail.

// =============================================================================
// PLATFORM-NAME PATTERNS (Ruling 2.1)
// =============================================================================

/**
 * Platform/CMS/e-commerce systems that, when named in the title, indicate a
 * role centered on that platform. If the platform is NOT in the persona's
 * must-have tags, the job is rejected.
 *
 * Each entry maps a display name (for the blocker reason) to a regex that
 * matches the platform name in a job title with word boundaries.
 *
 * Persona-relative exceptions:
 *   - "wordpress" and "shopify" are legitimate for the PHP/Laravel persona
 *     (must_have_tags include "wordpress").
 *   - "drupal" is PHP-based but rarely appears in a Laravel persona's targets;
 *     it's included here as a blocker unless the persona explicitly has
 *     "drupal" in must_have_tags.
 *   - ".NET/C#" is a full stack family — blocked for JS/PHP personas unless
 *     the persona explicitly includes csharp/dotnet.
 */
const PLATFORM_PATTERNS: ReadonlyArray<{
  /** Canonical tag slug used to check persona must-have tags. */
  tag: string;
  /** Human-readable platform name for the blocker reason. */
  name: string;
  /** Regex to match the platform name in the title. */
  pattern: RegExp;
}> = [
  // CMS / content platforms
  { tag: "sharepoint", name: "SharePoint", pattern: /\bsharepoint\b/i },
  { tag: "drupal", name: "Drupal", pattern: /\bdrupal\b/i },
  {
    tag: "wordpress",
    name: "WordPress",
    pattern: /\bwordpress\b|\bwp\s+developer\b/i,
  },
  { tag: "webflow", name: "Webflow", pattern: /\bwebflow\b/i },
  { tag: "contentful", name: "Contentful", pattern: /\bcontentful\b/i },
  { tag: "storyblok", name: "Storyblok", pattern: /\bstoryblok\b/i },
  // E-commerce platforms
  {
    tag: "shopify",
    name: "Shopify",
    pattern: /\bshopify\b|\bliquid\s+developer\b/i,
  },
  { tag: "magento", name: "Magento", pattern: /\bmagento\b/i },
  { tag: "bigcommerce", name: "BigCommerce", pattern: /\bbigcommerce\b/i },
  { tag: "woocommerce", name: "WooCommerce", pattern: /\bwoocommerce\b/i },
  // CRM / enterprise platforms
  {
    tag: "salesforce",
    name: "Salesforce",
    pattern: /\bsalesforce\b|\bapex\s+developer\b|\bvisualforce\b/i,
  },
  { tag: "servicenow", name: "ServiceNow", pattern: /\bservicenow\b/i },
  {
    tag: "dynamics",
    name: "Dynamics 365",
    pattern: /\bdynamics\s*365\b|\bdynamics\s+(?:ax|nav|crm|gp)\b/i,
  },
  // Enterprise CMS / DXP
  { tag: "sitecore", name: "Sitecore", pattern: /\bsitecore\b/i },
  {
    tag: "aem",
    name: "AEM (Adobe Experience Manager)",
    pattern: /\baem\b|\badobe\s+experience\s+manager\b/i,
  },
  {
    tag: "episerver",
    name: "Episerver/Optimizely",
    pattern: /\bepiserver\b|\boptimizely\b/i,
  },
  // .NET / C# — treated as a platform for JS/PHP personas.
  // Note: \b doesn't work after "#" or before "." (non-word chars), so we
  // use (?:^|\s|...) boundary patterns for C# and .NET.
  {
    tag: "csharp",
    name: ".NET/C#",
    pattern:
      /(?:^|[\s/|(])\.net\b|(?:^|[\s/|(])c#|(?:^|[\s/|(])csharp\b|(?:^|[\s/|(])asp\.net\b|(?:^|[\s/|(])aspnet\b|(?:^|[\s/|(])blazor\b/i,
  },
  // SAP
  { tag: "sap", name: "SAP", pattern: /\bsap\b|\babap\b/i },
  // Oracle / Java EE
  {
    tag: "oracle",
    name: "Oracle",
    pattern: /\boracle\s+(?:developer|engineer|dba)\b|\bplsql\b|\bpl\/sql\b/i,
  },
];

// =============================================================================
// ROLE-FAMILY PATTERNS (Ruling 2.2)
// =============================================================================

/**
 * Role families that are unsuitable for web-development personas (which are
 * IC software developer roles: frontend, backend, fullstack, AI engineer).
 *
 * Each entry maps a role-family label to a regex. If the title matches and
 * the persona does not explicitly support that family (checked via must-have
 * tags or seniority levels), the job is rejected.
 *
 * The "supported" check is persona-relative:
 *   - DevOps/SRE/Platform: blocked unless persona must_have_tags include
 *     docker, kubernetes, terraform, or aws (indicating a DevOps-adjacent
 *     persona).
 *   - Data/ML: blocked unless persona must_have_tags include python, ml,
 *     prompt-engineering, or langchain (indicating an AI/ML persona).
 *   - Mobile: blocked unless persona must_have_tags include react-native,
 *     swift, kotlin, or flutter.
 *   - Management: blocked unless persona seniorityLevels include "manager",
 *     "lead", "staff", or "principal".
 *   - Architect/Solutions Architect: always blocked for IC personas (no
 *     persona has architect seniority).
 *   - QA/SDET: blocked unless persona must_have_tags include qa, sdet, or
 *     testing (no current persona does).
 */
const ROLE_FAMILY_PATTERNS: ReadonlyArray<{
  /** Human-readable role family for the blocker reason. */
  family: string;
  /** Regex to match the role in the title. */
  pattern: RegExp;
  /** Tags that, if present in persona must_have_tags, exempt this family. */
  exemptTags?: ReadonlyArray<string>;
  /** If true, check persona seniorityLevels for exemption instead of tags. */
  exemptBySeniority?: boolean;
}> = [
  // Architecture (always blocked for IC personas — no persona has architect)
  {
    family: "Architect",
    pattern:
      /\b(?:solutions?\s+architect|software\s+architect|systems?\s+architect|cloud\s+architect|data\s+architect|enterprise\s+architect|technical\s+architect)\b/i,
  },
  // DevOps / SRE / Platform Engineering
  {
    family: "DevOps/SRE/Platform",
    pattern:
      /\b(?:devops|dev\s+ops|sre|site\s+reliability|platform\s+engineer|infrastructure\s+engineer|release\s+engineer|build\s+engineer)\b/i,
    exemptTags: [
      "docker",
      "kubernetes",
      "terraform",
      "ansible",
      "aws",
      "gcp",
      "azure",
    ],
  },
  // Data Engineering
  {
    family: "Data Engineer",
    pattern:
      /\b(?:data\s+engineer|data\s+infrastructure|data\s+platform|etl\s+engineer|data\s+pipeline)\b/i,
    exemptTags: ["python", "sql", "airflow", "dbt", "spark"],
  },
  // ML / AI Engineering (distinct from prompt-engineering / AI full-stack)
  {
    family: "ML Engineer",
    pattern:
      /\b(?:ml\s+engineer|machine\s+learning\s+engineer|ai\s+engineer|deep\s+learning|nlp\s+engineer|computer\s+vision|research\s+engineer)\b/i,
    exemptTags: [
      "python",
      "ml",
      "prompt-engineering",
      "langchain",
      "pytorch",
      "tensorflow",
    ],
  },
  // Mobile / iOS / Android / React Native
  {
    family: "Mobile",
    pattern:
      /\b(?:mobile\s+(?:developer|engineer)|ios\s+(?:developer|engineer)|android\s+(?:developer|engineer)|react\s+native|flutter|swift\s+developer|kotlin\s+(?:developer|engineer))\b/i,
    exemptTags: ["react-native", "swift", "kotlin", "flutter", "mobile"],
  },
  // QA / SDET / Test Automation
  {
    family: "QA/SDET",
    pattern:
      /\b(?:qa\s+(?:engineer|lead|automation)|quality\s+assurance|quality\s+engineer|sdet|software\s+(?:development\s+)?engineer\s+in\s+test|test\s+automation\s+engineer|automation\s+tester|test\s+engineer)\b/i,
    exemptTags: [
      "qa",
      "sdet",
      "testing",
      "test-automation",
      "playwright",
      "cypress",
      "selenium",
    ],
  },
  // Engineering Manager / Director / Head of
  {
    family: "Engineering Manager",
    pattern:
      /\b(?:engineering\s+manager|engineering\s+director|head\s+of\s+engineering|vp\s+of\s+engineering|director\s+of\s+engineering|tech\s+lead|team\s+lead|lead\s+developer)\b/i,
    exemptBySeniority: true,
  },
  // Security Engineer (distinct from natsec — this is appsec/devsecops)
  {
    family: "Security Engineer",
    pattern:
      /\b(?:security\s+engineer|appsec|devsecops|penetration\s+tester|pentester|vulnerability\s+researcher)\b/i,
    exemptTags: ["security", "appsec", "devsecops"],
  },
];

// =============================================================================
// TYPES
// =============================================================================

/** Result of a single title-blocker check. */
export type TitleBlockerResult = {
  /** true if the job-persona pair passes (no blocker triggered). */
  passes: boolean;
  /** The blocker reason if rejected, null if passed. */
  blocker: string | null;
  /** Which blocker family triggered: "platform" or "role_family". */
  blockerType: "platform" | "role_family" | null;
};

// =============================================================================
// BLOCKER LOGIC
// =============================================================================

/**
 * Check a job-persona pair against platform-name and role-family blockers.
 *
 * @param title          The job title.
 * @param mustHaveTags   The persona's must_have_tags (canonical slugs).
 * @param seniorityLevels The persona's seniority levels (e.g., ["senior", "mid"]).
 * @returns              TitleBlockerResult indicating pass/fail and reason.
 */
export function checkTitleBlockers(
  title: string,
  mustHaveTags: string[],
  seniorityLevels: string[] = [],
): TitleBlockerResult {
  const titleStr = title ?? "";
  const personaTags = new Set(mustHaveTags.map((t) => t.toLowerCase()));

  // ── Ruling 2.1: Platform-name blocker ──────────────────────────────────
  for (const platform of PLATFORM_PATTERNS) {
    if (platform.pattern.test(titleStr)) {
      // Persona-relative exception: if the platform's tag is in the persona's
      // must_have_tags, this is a legitimate match (e.g., WordPress for the
      // PHP persona, Shopify for a Shopify-focused persona).
      if (personaTags.has(platform.tag)) continue;

      // Additional exception: .NET/C# is exempted if the persona has any
      // .NET-family tag (dotnet, aspnet, blazor, fsharp, etc.)
      if (platform.tag === "csharp") {
        const dotnetTags = [
          "csharp",
          "dotnet",
          "aspnet",
          "fsharp",
          "blazor",
          "razor",
        ];
        if (dotnetTags.some((t) => personaTags.has(t))) continue;
      }

      return {
        passes: false,
        blocker: `platform_blocker: title names "${platform.name}" which is not in persona must-have tags`,
        blockerType: "platform",
      };
    }
  }

  // ── Ruling 2.2: Role-family blocker ────────────────────────────────────
  for (const role of ROLE_FAMILY_PATTERNS) {
    if (role.pattern.test(titleStr)) {
      // Check exemption by seniority (for management roles)
      if (role.exemptBySeniority) {
        const managementSeniority = new Set([
          "manager",
          "lead",
          "staff",
          "principal",
        ]);
        if (
          seniorityLevels.some((s) => managementSeniority.has(s.toLowerCase()))
        ) {
          continue;
        }
      }

      // Check exemption by tags
      if (role.exemptTags) {
        if (role.exemptTags.some((t) => personaTags.has(t))) continue;
      }

      return {
        passes: false,
        blocker: `role_family_blocker: title indicates "${role.family}" role unsuitable for this persona`,
        blockerType: "role_family",
      };
    }
  }

  return { passes: true, blocker: null, blockerType: null };
}

/**
 * Batch-check multiple persona candidates for the same job title.
 *
 * Used in the pipeline after Gate 1+2 returns candidates — filters out
 * any candidate that fails the deterministic title blockers before
 * fanning out to Gate 3.
 *
 * @param title       The job title.
 * @param candidates  Array of candidates with persona must-have tags and
 *                    seniority levels.
 * @returns           Array of candidates that PASS the blockers.
 */
export function filterCandidatesByTitleBlockers<
  T extends {
    personaId: string;
    mustHaveTags: string[];
    seniorityLevels?: string[];
  },
>(
  title: string,
  candidates: T[],
): {
  passed: T[];
  rejected: Array<{ candidate: T; blocker: string; blockerType: string }>;
} {
  const passed: T[] = [];
  const rejected: Array<{
    candidate: T;
    blocker: string;
    blockerType: string;
  }> = [];

  for (const candidate of candidates) {
    const result = checkTitleBlockers(
      title,
      candidate.mustHaveTags,
      candidate.seniorityLevels ?? [],
    );
    if (result.passes) {
      passed.push(candidate);
    } else {
      rejected.push({
        candidate,
        blocker: result.blocker ?? "unknown",
        blockerType: result.blockerType ?? "unknown",
      });
    }
  }

  return { passed, rejected };
}
