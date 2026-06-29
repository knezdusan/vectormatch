import { pgEnum } from "drizzle-orm/pg-core";

export const assignmentTypeEnum = pgEnum("assignment_type", [
  "remote",
  "hybrid",
  "on-site",
  "remote_local",
]);
export const modalityEnum = pgEnum("modality", [
  "full-time",
  "part-time",
  "contract",
  "freelance",
  "internship",
]);

// Workplace type for job postings — extracted from ATS rawJson and normalized
// to a common enum. Separate from assignmentTypeEnum (which is an applicant
// availability concept) because:
//   - "remote_local" doesn't apply to job postings
//   - Jobs may have NULL workplace_type when the ATS doesn't provide it
//     (notably Greenhouse, which has no structured workplace field)
// Values match the subset of assignmentTypeEnum that applies to jobs.
export const workplaceTypeEnum = pgEnum("workplace_type", [
  "remote",
  "hybrid",
  "on-site",
]);
export const complianceEnum = pgEnum("compliance", [
  // --- Employee / Payroll Options ---
  "w2", // US Corporate Employment
  "local_employment", // Standard domestic employment (direct hire in dev's country)
  "eor", // Employer of Record (Global full-time via Deel/Remote/etc.)

  // --- Business-to-Business (Corporate) ---
  "b2b", // Company-to-Company (Serbian Sole Proprietorship, UK Outside IR35, LLCs)

  // --- Independent Contractor / Freelance (Individual) ---
  "1099", // US Resident Solo Contractor (Requires W-9 & IRS 1099-NEC filing)
  "w8ben", // Foreign Solo Contractor for US Client (0% US tax withholding, exempt from IRS reporting)
  "ic_global", // International Solo Contractor for non-US Client (filing taxes locally)
]);

// Seniority levels for applicant job matching preferences.
// The applicant can select multiple levels — jobs whose inferred seniority
// matches ANY of the selected levels will pass Gate 3. The LLM infers the
// applicant's primary seniority from the CV during onboarding (stored in
// cvUpload.extractedJson.inferred_seniority), and the user can adjust
// the preselected level(s) or add more during onboarding and in profile
// management.
export const seniorityLevelEnum = pgEnum("seniority_level", [
  "junior",
  "mid",
  "senior",
  "lead",
  "staff",
  "principal",
]);

// CV upload lifecycle status — drives the onboarding state machine
// (see Module A §2d: State 1 → State 2 transition logic)
export const cvUploadStatusEnum = pgEnum("cv_upload_status", [
  "processing", // PDF worker is extracting text / LLM parse in flight
  "valid", // LLM extraction succeeded, CV passed validity checks, ready for onboarding review
  "invalid", // LLM extraction failed or CV failed validity checks (rejected, ask user for better CV)
  "abandoned", // User uploaded a CV but never completed onboarding (orphan, eligible for cleanup)
]);

// ============================================================================
// MODULE B ENUMS — Seeding & Ingestion Pipeline (see TDD §4)
// ============================================================================

// ATS platform a company's jobs board is hosted on. MVP covers the three
// native JSON APIs; F2 (CORPUS_EXPANSION_TDD §1.5) adds three more.
export const atsSourceEnum = pgEnum("ats_source", [
  "greenhouse",
  "lever",
  "ashby",
  "smartrecruiters", // F2
  "recruitee", // F2
  "workable", // F2
]);

// Polling cadence tier — orthogonal to health. Drives the decay polling
// algorithm. Recalculated daily from `company.lastJobPostedAt` (and, with G1,
// from approved match history).
// G1 (CORPUS_EXPANSION_TDD §3.1): active_hot tier for companies with approved
// matches in the last 30 days → polled every 3h. The batchPollTier function
// (G5) uses this tier via its 3h cron trigger.
export const companyTierEnum = pgEnum("company_tier", [
  "active_hot", // Tier A-Hot: approved matches in last 30d → poll every 3h (G1)
  "active", // Tier A: posted a job in last 14 days → poll every 12h
  "dormant", // Tier B: no jobs in >14 days → poll weekly
  "dead", // Tier C: endpoint returns 404 or 3+ consecutive failures → stop
]);

// Result of the last poll attempt — orthogonal to tier. Used by the health
// dashboard and to decide proxy/retry strategy.
export const companyHealthEnum = pgEnum("company_health", [
  "healthy", // Last poll succeeded
  "degraded", // Last poll had partial failures (some jobs failed Zod validation)
  "rate_limited", // Got 429 — backed off, will retry next cycle
  "blocked", // Got 403 — needs proxy or investigation
  "error", // Unexpected error (500, timeout, malformed JSON)
  "dead", // Endpoint returns 404 — company left the ATS
]);

// How a (ats_source, ats_slug) tuple was discovered. Recorded for provenance
// and cross-seeder dedup. `manual` is for admin-added slugs via the dashboard.
export const discoverySourceEnum = pgEnum("discovery_source", [
  "httparchive", // BigQuery volume seeder
  "hn_algolia", // Hacker News delta seeder
  "crt_sh", // Certificate Transparency stealth seeder (Phase 2)
  "hn_custom_url", // HN comment with non-ATS URL → CNAME/probe resolved
  "manual", // Admin-added via dashboard
  "workable_meta_search", // B1: Workable meta-search API
  "google_cse", // B2/D1: Google CSE batch + daily
  "yc_directory", // B3: YC directory (Algolia API, isHiring filter)
  "vc_portfolio", // B4: VC portfolio mining
  "newsletter_archive", // B5: Developer newsletter archives
  "wayback_cdx", // B7: Wayback Machine CDX
  "rapid7_fdns", // B8: Rapid7 FDNS v2 CNAME reversal
  "cross_pollination", // B9: Cross-pollination from job descriptions
  "sitemap_probe", // B10: Sitemap.xml probing
]);

// Type of ingestion log entry — distinguishes seeder runs, poller runs, and
// the two daily maintenance jobs (tier recalculation, stale cleanup).
export const ingestionLogTypeEnum = pgEnum("ingestion_log_type", [
  "seed", // Seeder ran (HN, BigQuery, crt.sh)
  "poll", // Poller polled a company
  "tier_recalc", // Tier recalculation ran
  "stale_cleanup", // Stale job cleanup ran
]);

// Outcome of an ingestion log run. `partial` means some items failed but the
// run completed (e.g. some jobs failed Zod validation); `failed` means the
// entire run failed (e.g. ATS API down).
export const ingestionLogStatusEnum = pgEnum("ingestion_log_status", [
  "success",
  "partial", // Some items failed but the run completed
  "failed", // The entire run failed
]);
