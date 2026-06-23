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
// native JSON APIs; future values are commented for forward compatibility.
export const atsSourceEnum = pgEnum("ats_source", [
  "greenhouse",
  "lever",
  "ashby",
  // Future: "smartrecruiters", "recruitee", "workable"
]);

// Polling cadence tier — orthogonal to health. Drives the decay polling
// algorithm (Tier A → 12h, Tier B → weekly, Tier C → stopped). Recalculated
// daily from `company.lastJobPostedAt`.
export const companyTierEnum = pgEnum("company_tier", [
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
