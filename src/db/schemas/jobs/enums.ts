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
