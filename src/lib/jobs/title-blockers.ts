// Deterministic Title Blockers — Directive 30, Rulings 2.1 + 2.2
// Directive 31, Job 1: Stack-family disjointness replaces hardcoded exceptions
// src/lib/jobs/title-blockers.ts
//
// Pre-LLM, persona-relative deterministic blockers that reject job-persona
// pairs based on the job TITLE before Gate 3 (the LLM) is invoked.
//
// Two blocker families:
//
//   1. Platform-name blocker (Ruling 2.1, refined by D31 Job 1):
//      If the job title names a platform/CMS/e-commerce system whose stack
//      family is DISJOINT from the persona's primary stack family, reject.
//      This replaces the original hardcoded tag-exemption list with
//      stack-family disjointness — self-maintaining as personas change.
//
//      Example: Shopify (Hydrogen = React) shares the JS family with a JS
//      persona → ALLOWED. Magento (PHP) shares the PHP family with a PHP
//      persona → ALLOWED. SharePoint (.NET) is disjoint from both → BLOCKED.
//
//   2. Role-family blocker (Ruling 2.2, refined by D31 Job 1):
//      Reject unsuitable role families for web-development personas when the
//      persona does not explicitly support them. Examples: Architect, Solutions
//      Architect, DevOps, SRE, Platform Engineer, Data Engineer, ML Engineer,
//      Mobile/iOS/Android/React Native, QA/SDET, Engineering Manager.
//
//      D31 Job 1 fixes:
//      - staff/principal no longer exempt the Engineering-Manager blocker
//        (they are IC tracks, not management tracks)
//      - ML exemption tightened: prompt-engineering exempts AI-application
//        roles only (e.g., "AI Engineer"), not ML-research roles (e.g.,
//        "ML Engineer", "Machine Learning Engineer"). Requires a JS/TS
//        signal in the persona's must-have tags for the exemption to fire.
//
// These blockers run AFTER Gate 1+2 (which already inserted candidates into
// match_queue) but BEFORE Gate 3 fan-out. Rejected candidates are marked
// 'rejected' in match_queue with a deterministic blocker reason, preserving
// re-evaluability and audit trail.

import {
  classifyStackFamily,
  type StackFamily,
} from "@/lib/jobs/stack-families";

// =============================================================================
// PLATFORM-NAME PATTERNS (Ruling 2.1 — D31: stack-family disjointness)
// =============================================================================

/**
 * Platform/CMS/e-commerce systems mapped to their underlying stack family.
 *
 * D31 Job 1: The blocker now uses stack-family disjointness instead of
 * hardcoded tag exceptions. A platform is blocked when its stack family
 * shares NOTHING with the persona's primary stack family.
 *
 * | Platform | Stack family | Blocks JS? | Blocks PHP? |
 * |---|---|---|---|
 * | SharePoint, .NET/C#, Sitecore, Episerver | dotnet | yes | yes |
 * | SAP, Oracle, ServiceNow, Salesforce, Dynamics 365 | enterprise | yes | yes |
 * | AEM | java | yes | yes |
 * | Magento, Drupal, WooCommerce, WordPress | php | yes | NO |
 * | Shopify, Contentful, Storyblok, BigCommerce | js | NO | yes |
 * | Webflow | js | NO | yes |
 *
 * "enterprise" is a sentinel that blocks ALL personas (no persona has
 * enterprise as their primary stack family).
 */
const PLATFORM_PATTERNS: ReadonlyArray<{
  /** Human-readable platform name for the blocker reason. */
  name: string;
  /** Regex to match the platform name in the title. */
  pattern: RegExp;
  /** The stack family this platform belongs to. */
  stackFamily: StackFamily | "enterprise";
}> = [
  // .NET family — blocks JS and PHP personas
  { name: "SharePoint", pattern: /\bsharepoint\b/i, stackFamily: "dotnet" },
  {
    name: "Sitecore",
    pattern: /\bsitecore\b/i,
    stackFamily: "dotnet",
  },
  {
    name: "Episerver/Optimizely",
    pattern: /\bepiserver\b|\boptimizely\b/i,
    stackFamily: "dotnet",
  },
  {
    name: ".NET/C#",
    pattern:
      /(?:^|[\s/|(])\.net\b|(?:^|[\s/|(])c#|(?:^|[\s/|(])csharp\b|(?:^|[\s/|(])asp\.net\b|(?:^|[\s/|(])aspnet\b|(?:^|[\s/|(])blazor\b/i,
    stackFamily: "dotnet",
  },
  // Enterprise/proprietary — blocks ALL personas
  { name: "SAP", pattern: /\bsap\b|\babap\b/i, stackFamily: "enterprise" },
  {
    name: "Oracle",
    pattern: /\boracle\s+(?:developer|engineer|dba)\b|\bplsql\b|\bpl\/sql\b/i,
    stackFamily: "enterprise",
  },
  {
    name: "ServiceNow",
    pattern: /\bservicenow\b/i,
    stackFamily: "enterprise",
  },
  {
    name: "Salesforce",
    pattern: /\bsalesforce\b|\bapex\s+developer\b|\bvisualforce\b/i,
    stackFamily: "enterprise",
  },
  {
    name: "Dynamics 365",
    pattern: /\bdynamics\s*365\b|\bdynamics\s+(?:ax|nav|crm|gp)\b/i,
    stackFamily: "enterprise",
  },
  // Java family — blocks JS and PHP personas
  {
    name: "AEM (Adobe Experience Manager)",
    pattern: /\baem\b|\badobe\s+experience\s+manager\b/i,
    stackFamily: "java",
  },
  // PHP family — blocks JS personas, ALLOWS PHP persona
  { name: "Magento", pattern: /\bmagento\b/i, stackFamily: "php" },
  { name: "Drupal", pattern: /\bdrupal\b/i, stackFamily: "php" },
  {
    name: "WooCommerce",
    pattern: /\bwoocommerce\b/i,
    stackFamily: "php",
  },
  {
    name: "WordPress",
    pattern: /\bwordpress\b|\bwp\s+developer\b/i,
    stackFamily: "php",
  },
  // JS/React family — ALLOWS JS personas, blocks PHP persona
  {
    name: "Shopify",
    pattern: /\bshopify\b|\bliquid\s+developer\b/i,
    stackFamily: "js",
  },
  {
    name: "Contentful",
    pattern: /\bcontentful\b/i,
    stackFamily: "js",
  },
  { name: "Storyblok", pattern: /\bstoryblok\b/i, stackFamily: "js" },
  {
    name: "BigCommerce",
    pattern: /\bbigcommerce\b/i,
    stackFamily: "js",
  },
  { name: "Webflow", pattern: /\bwebflow\b/i, stackFamily: "js" },
];

// =============================================================================
// ROLE-FAMILY PATTERNS (Ruling 2.2 — D31 Job 1: tightened exemptions)
// =============================================================================

/**
 * Role families that are unsuitable for web-development personas (which are
 * IC software developer roles: frontend, backend, fullstack, AI engineer).
 *
 * D31 Job 1 changes:
 *   - staff/principal no longer exempt the Engineering-Manager blocker
 *     (they are IC tracks, not management tracks). Only manager/lead/director
 *     exempt management roles.
 *   - ML split into AI-application (exempt via prompt-engineering + JS/TS
 *     signal) and ML-research (exempt via python/ml/pytorch/tensorflow only).
 */

/** JS/TS signal tags — used for the AI-application ML exemption. */
const JS_TS_SIGNAL_TAGS = new Set([
  "typescript",
  "javascript",
  "react",
  "nextjs",
  "nodejs",
  "vue",
  "nuxt",
  "svelte",
  "sveltekit",
]);

const ROLE_FAMILY_PATTERNS: ReadonlyArray<{
  /** Human-readable role family for the blocker reason. */
  family: string;
  /** Regex to match the role in the title. */
  pattern: RegExp;
  /** Tags that, if present in persona must_have_tags, exempt this family. */
  exemptTags?: ReadonlyArray<string>;
  /** If true, check persona seniorityLevels for exemption instead of tags. */
  exemptBySeniority?: boolean;
  /**
   * D31: If set, this role family uses a custom exemption check instead of
   * the standard exemptTags lookup.
   */
  customExemption?: "ai_application" | "ml_research";
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
  // D31 Job 1: AI-application roles (e.g., "AI Engineer")
  // Exempt if persona has prompt-engineering AND a JS/TS signal.
  // This is the "AI fullstack" persona — building AI apps with LLMs, not
  // training models.
  {
    family: "AI Engineer (application)",
    pattern: /\bai\s+engineer\b/i,
    customExemption: "ai_application",
  },
  // D31 Job 1: ML-research roles (e.g., "ML Engineer", "Machine Learning
  // Engineer", "Deep Learning", "NLP Engineer", "Computer Vision")
  // Exempt ONLY via python/ml/pytorch/tensorflow/langchain tags.
  // prompt-engineering alone does NOT exempt — a JS persona building AI
  // apps is not an ML researcher.
  {
    family: "ML Engineer (research)",
    pattern:
      /\b(?:ml\s+engineer|machine\s+learning\s+engineer|deep\s+learning|nlp\s+engineer|computer\s+vision|research\s+engineer)\b/i,
    customExemption: "ml_research",
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
  // D31 Job 1: staff/principal removed from exemption — they are IC tracks.
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
 * D31 Job 1: Platform blocking now uses stack-family disjointness instead of
 * hardcoded tag exceptions. A platform is blocked when its stack family is
 * disjoint from the persona's primary stack family (determined by
 * classifyStackFamily).
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

  // Determine the persona's primary stack family for platform disjointness.
  const personaFamily = classifyStackFamily(mustHaveTags);

  // ── Ruling 2.1: Platform-name blocker (D31: stack-family disjointness) ─
  for (const platform of PLATFORM_PATTERNS) {
    if (platform.pattern.test(titleStr)) {
      // "enterprise" platforms block ALL personas (no persona has enterprise
      // as their primary stack family).
      if (platform.stackFamily === "enterprise") {
        return {
          passes: false,
          blocker: `platform_blocker: title names "${platform.name}" (enterprise/proprietary platform, disjoint from all persona stack families)`,
          blockerType: "platform",
        };
      }

      // If we can't determine the persona's family, don't block (conservative).
      if (!personaFamily) continue;

      // Block if the platform's stack family is different from the persona's
      // primary stack family.
      if (platform.stackFamily !== personaFamily) {
        return {
          passes: false,
          blocker: `platform_blocker: title names "${platform.name}" (stack family: ${platform.stackFamily}) which is disjoint from persona's primary stack family (${personaFamily})`,
          blockerType: "platform",
        };
      }
    }
  }

  // ── Ruling 2.2: Role-family blocker ────────────────────────────────────
  for (const role of ROLE_FAMILY_PATTERNS) {
    if (role.pattern.test(titleStr)) {
      // D31: Custom exemption checks for AI-application and ML-research roles
      if (role.customExemption === "ai_application") {
        // AI-application roles (e.g., "AI Engineer") are exempted if the
        // persona has prompt-engineering AND a JS/TS signal.
        const hasPromptEng = personaTags.has("prompt-engineering");
        const hasJSTSSignal = [...personaTags].some((t) =>
          JS_TS_SIGNAL_TAGS.has(t),
        );
        if (hasPromptEng && hasJSTSSignal) continue;
        // Fall through to reject if no exemption
      }

      if (role.customExemption === "ml_research") {
        // ML-research roles are exempted ONLY via python/ml/pytorch/
        // tensorflow/langchain tags. prompt-engineering alone does NOT
        // exempt — a JS persona building AI apps is not an ML researcher.
        const mlExemptTags = [
          "python",
          "ml",
          "langchain",
          "pytorch",
          "tensorflow",
        ];
        if (mlExemptTags.some((t) => personaTags.has(t))) continue;
        // Fall through to reject if no exemption
      }

      // Check exemption by seniority (for management roles)
      // D31 Job 1: staff/principal removed — they are IC tracks.
      if (role.exemptBySeniority) {
        const managementSeniority = new Set(["manager", "lead", "director"]);
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
