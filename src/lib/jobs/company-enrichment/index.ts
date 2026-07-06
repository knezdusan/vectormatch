// Company Enrichment — re-exports for the Job Scoring Matrix (Criterion 3)
// src/lib/jobs/company-enrichment/index.ts
//
// Barrel file for the company-enrichment module. The big-tech registry
// provides the fallback employee-count + isPublic signal for the scoring
// matrix when `company.employeeCount` is null.

export { lookupBigTech } from "./big-tech-registry";
