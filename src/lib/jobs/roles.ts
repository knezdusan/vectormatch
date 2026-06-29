// CANONICAL_ROLES — VectorMatch Standardized Role Titles
// src/lib/jobs/roles.ts
//
// The dropdown source for the `workingHistory.role` field in the onboarding
// and profile management UI. The DB column is free-text (not an enum) so users
// can enter custom titles via "Other", but this list covers the ~90% case.
//
// Seeded from O*NET SOC 15-0000 (Computer and Mathematical Occupations) and
// cross-referenced with Stack Overflow Developer Survey 2025 developer-type
// self-identification categories. See RESEARCH_NOTE_schemas.md §6.
//
// Seniority is inline in the role title per Q6 decision (no separate DB column).
// True seniority is derived dynamically via tagsExperience.yearsOfExperience.
//
// Product Manager is included per Q7 decision (for work history accuracy) but
// is excluded from CANONICAL_TAGS — the LLM must never anchor a matching
// persona on it.
//
// Initial draft: ~90 entries. Target ~300 after real-CV testing reveals gaps.
// Add new entries at the bottom of their section, not alphabetically, so the
// git diff shows additions clearly.

export type CanonicalRole = {
  /** Display label shown in the UI dropdown. */
  label: string;
  /** O*NET SOC code for traceability (null if not in O*NET). */
  onetSoc: string | null;
};

export const CANONICAL_ROLES: CanonicalRole[] = [
  // ===========================================================================
  // SOFTWARE DEVELOPMENT (CORE)
  // ===========================================================================
  { label: "Software Developer", onetSoc: "15-1252" },
  { label: "Software Engineer", onetSoc: "15-1252" },
  { label: "Junior Software Engineer", onetSoc: "15-1252" },
  { label: "Mid-level Software Engineer", onetSoc: "15-1252" },
  { label: "Senior Software Engineer", onetSoc: "15-1252" },
  { label: "Staff Software Engineer", onetSoc: "15-1252" },
  { label: "Principal Software Engineer", onetSoc: "15-1252" },
  { label: "Lead Software Engineer", onetSoc: "15-1252" },
  { label: "Full Stack Developer", onetSoc: "15-1252/1254" },
  { label: "Junior Full Stack Developer", onetSoc: "15-1252/1254" },
  { label: "Senior Full Stack Engineer", onetSoc: "15-1252/1254" },
  { label: "Frontend Developer", onetSoc: "15-1254" },
  { label: "Junior Frontend Developer", onetSoc: "15-1254" },
  { label: "Senior Frontend Developer", onetSoc: "15-1254" },
  { label: "Frontend Engineer", onetSoc: "15-1254" },
  { label: "Backend Developer", onetSoc: "15-1252" },
  { label: "Junior Backend Developer", onetSoc: "15-1252" },
  { label: "Senior Backend Developer", onetSoc: "15-1252" },
  { label: "Backend Engineer", onetSoc: "15-1252" },
  { label: "Web Developer", onetSoc: "15-1254" },
  { label: "Junior Web Developer", onetSoc: "15-1254" },
  { label: "Senior Web Developer", onetSoc: "15-1254" },
  { label: "Computer Programmer", onetSoc: "15-1251" },

  // ===========================================================================
  // ARCHITECTURE & SYSTEMS
  // ===========================================================================
  { label: "Software Architect", onetSoc: "15-1299.08" },
  { label: "Solutions Architect", onetSoc: "15-1299.08" },
  { label: "Systems Architect", onetSoc: "15-1299.08" },
  { label: "Cloud Architect", onetSoc: "15-1241" },
  { label: "Data Architect", onetSoc: "15-1243" },
  { label: "Enterprise Architect", onetSoc: "15-1299.08" },
  { label: "Technical Architect", onetSoc: "15-1299.08" },
  { label: "Platform Engineer", onetSoc: "15-1299.08" },
  { label: "Infrastructure Engineer", onetSoc: "15-1299.08" },
  { label: "Systems Engineer", onetSoc: "15-1299.08" },

  // ===========================================================================
  // DEVOPS & SRE
  // ===========================================================================
  { label: "DevOps Engineer", onetSoc: "15-1299.08" },
  { label: "Senior DevOps Engineer", onetSoc: "15-1299.08" },
  { label: "Site Reliability Engineer", onetSoc: "15-1299.08" },
  { label: "SRE", onetSoc: "15-1299.08" },
  { label: "Cloud Infrastructure Engineer", onetSoc: "15-1299.08" },
  { label: "Release Engineer", onetSoc: "15-1299.08" },
  { label: "Build Engineer", onetSoc: "15-1299.08" },
  { label: "Automation Engineer", onetSoc: "15-1299.08" },

  // ===========================================================================
  // DATA & AI/ML
  // ===========================================================================
  { label: "Data Scientist", onetSoc: "15-2051" },
  { label: "Senior Data Scientist", onetSoc: "15-2051" },
  { label: "Data Engineer", onetSoc: "15-1252" },
  { label: "Senior Data Engineer", onetSoc: "15-1252" },
  { label: "Data Analyst", onetSoc: "15-2031" },
  { label: "Business Intelligence Analyst", onetSoc: "15-2031" },
  { label: "BI Developer", onetSoc: "15-2031" },
  { label: "Statistician", onetSoc: "15-2041" },

  // ── AI Engineering (LLM application development) ──────────────────────────
  { label: "AI Engineer", onetSoc: "15-1252" },
  { label: "Senior AI Engineer", onetSoc: "15-1252" },
  { label: "LLM Engineer", onetSoc: null },
  { label: "Applied AI Engineer", onetSoc: "15-1252" },
  { label: "Generative AI Engineer", onetSoc: null },
  { label: "AI Research Engineer", onetSoc: "15-1252" },
  { label: "AI Application Developer", onetSoc: "15-1252" },
  { label: "AI Integration Engineer", onetSoc: "15-1252" },
  { label: "AI Solutions Engineer", onetSoc: "15-1252" },
  { label: "AI Product Engineer", onetSoc: "15-1252" },
  { label: "AI Full-Stack Developer", onetSoc: "15-1252" },
  { label: "AI Software Engineer", onetSoc: "15-1252" },

  // ── Machine Learning Engineering (model training & deployment) ────────────
  { label: "Machine Learning Engineer", onetSoc: "15-1252" },
  { label: "ML Engineer", onetSoc: "15-1252" },
  { label: "Senior Machine Learning Engineer", onetSoc: "15-1252" },
  { label: "NLP Engineer", onetSoc: "15-1252" },
  { label: "Computer Vision Engineer", onetSoc: "15-1252" },

  // ── RAG & LLM Infrastructure ─────────────────────────────────────────────
  { label: "RAG Engineer", onetSoc: null },
  { label: "Prompt Engineer", onetSoc: null },
  { label: "MLOps Engineer", onetSoc: "15-1252" },
  { label: "ML Platform Engineer", onetSoc: "15-1252" },
  { label: "AI Platform Engineer", onetSoc: "15-1252" },
  { label: "AI Infrastructure Engineer", onetSoc: "15-1252" },

  // ── AI Agents & Automation ────────────────────────────────────────────────
  { label: "AI Agent Developer", onetSoc: "15-1252" },
  { label: "AI Automation Engineer", onetSoc: "15-1252" },
  { label: "Conversational AI Engineer", onetSoc: "15-1252" },

  // ── AI Research ───────────────────────────────────────────────────────────
  { label: "Research Scientist", onetSoc: "15-2051" },
  { label: "Applied Research Scientist", onetSoc: "15-2051" },
  { label: "ML Researcher", onetSoc: "15-2051" },
  { label: "AI Researcher", onetSoc: "15-2051" },

  // ── AI Safety & Governance ────────────────────────────────────────────────
  { label: "AI Safety Engineer", onetSoc: null },
  { label: "Responsible AI Engineer", onetSoc: "15-1252" },

  // ===========================================================================
  // MOBILE & SPECIALIZED DEVELOPMENT
  // ===========================================================================
  { label: "Mobile Developer", onetSoc: "15-1252" },
  { label: "iOS Developer", onetSoc: "15-1252" },
  { label: "Android Developer", onetSoc: "15-1252" },
  { label: "React Native Developer", onetSoc: "15-1252" },
  { label: "Flutter Developer", onetSoc: "15-1252" },
  { label: "Game Developer", onetSoc: "15-1255.01" },
  { label: "Graphics Programmer", onetSoc: "15-1255.01" },
  { label: "Embedded Systems Engineer", onetSoc: "15-1252" },
  { label: "Firmware Engineer", onetSoc: "15-1252" },
  { label: "IoT Developer", onetSoc: "15-1252" },

  // ===========================================================================
  // QUALITY ASSURANCE & TESTING
  // ===========================================================================
  { label: "QA Engineer", onetSoc: "15-1253" },
  { label: "QA Analyst", onetSoc: "15-1253" },
  { label: "Test Engineer", onetSoc: "15-1253" },
  { label: "Automation Test Engineer", onetSoc: "15-1253" },
  { label: "SDET", onetSoc: "15-1253" },

  // ===========================================================================
  // SECURITY
  // ===========================================================================
  { label: "Security Engineer", onetSoc: "15-1299.05" },
  { label: "Cybersecurity Engineer", onetSoc: "15-1212" },
  { label: "Information Security Analyst", onetSoc: "15-1212" },
  { label: "Penetration Tester", onetSoc: "15-1299.04" },
  { label: "Security Architect", onetSoc: "15-1299.05" },

  // ===========================================================================
  // DATABASE & ADMINISTRATION
  // ===========================================================================
  { label: "Database Administrator", onetSoc: "15-1242" },
  { label: "DBA", onetSoc: "15-1242" },
  { label: "Database Engineer", onetSoc: "15-1243" },
  { label: "Data Warehousing Specialist", onetSoc: "15-1243.01" },
  { label: "System Administrator", onetSoc: "15-1244" },
  { label: "Network Administrator", onetSoc: "15-1244" },
  { label: "Network Engineer", onetSoc: "15-1241" },
  { label: "Computer Network Architect", onetSoc: "15-1241" },

  // ===========================================================================
  // MANAGEMENT & LEADERSHIP
  // ===========================================================================
  { label: "Engineering Manager", onetSoc: "11-3021" },
  { label: "Tech Lead", onetSoc: "15-1252" },
  { label: "Technical Lead", onetSoc: "15-1252" },
  { label: "Team Lead", onetSoc: "15-1252" },
  { label: "CTO", onetSoc: "11-3021" },
  { label: "VP of Engineering", onetSoc: "11-3021" },
  { label: "Head of Engineering", onetSoc: "11-3021" },
  { label: "Director of Engineering", onetSoc: "11-3021" },
  // AI leadership — emerging C-suite and director-level roles
  { label: "Head of AI", onetSoc: "11-3021" },
  { label: "Director of AI", onetSoc: "11-3021" },
  { label: "VP of AI", onetSoc: "11-3021" },
  { label: "Chief AI Officer", onetSoc: "11-3021" },
  { label: "AI Product Manager", onetSoc: null },
  { label: "IT Manager", onetSoc: "11-3021" },
  { label: "Project Manager", onetSoc: "15-1299.09" },
  { label: "Technical Project Manager", onetSoc: "15-1299.09" },
  // Product Manager — included per Q7 decision (work history accuracy)
  // but excluded from CANONICAL_TAGS (LLLM must never anchor a persona on it)
  { label: "Product Manager", onetSoc: null },
  { label: "Technical Product Manager", onetSoc: null },

  // ===========================================================================
  // DESIGN & FRONTEND-ADJACENT
  // ===========================================================================
  { label: "UX Designer", onetSoc: "15-1255" },
  { label: "UI Designer", onetSoc: "15-1255" },
  { label: "UX/UI Designer", onetSoc: "15-1255" },
  { label: "Product Designer", onetSoc: "15-1255" },
  { label: "Web Designer", onetSoc: "15-1255" },
  { label: "UX Researcher", onetSoc: "15-1255" },

  // ===========================================================================
  // EMERGING & SPECIALIZED
  // ===========================================================================
  { label: "Blockchain Engineer", onetSoc: "15-1299.07" },
  { label: "Developer Advocate", onetSoc: null },
  { label: "DevRel Engineer", onetSoc: null },
  { label: "Platform Developer", onetSoc: "15-1252" },
  { label: "API Developer", onetSoc: "15-1252" },
  { label: "Backend API Developer", onetSoc: "15-1252" },
];

// =============================================================================
// DERIVED LOOKUPS
// =============================================================================

/** All role labels as a sorted array — used to populate the UI dropdown. */
export const CANONICAL_ROLE_LABELS: string[] = CANONICAL_ROLES.map(
  (r) => r.label,
).sort();

/** O(1) lookup by label. Used for validation that a role is in the canonical list. */
export const CANONICAL_ROLE_SET = new Set<string>(CANONICAL_ROLE_LABELS);

/**
 * Check if a role string is in the canonical list.
 * The DB column is free-text, so this is used for UI hinting (show "Other"
 * field if not in set), not for hard rejection.
 */
export function isCanonicalRole(role: string): boolean {
  return CANONICAL_ROLE_SET.has(role);
}
