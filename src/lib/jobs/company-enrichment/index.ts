// Company Enrichment — re-exports for the Job Scoring Matrix (Criterion 3)
// src/lib/jobs/company-enrichment/index.ts
//
// Barrel file for the company-enrichment module. The big-tech registry
// provides the fallback employee-count + isPublic signal for the scoring
// matrix when `company.employeeCount` is null.

export {
  BIG_TECH_BY_NAME,
  BIG_TECH_REGISTRY,
  BIG_TECH_REGISTRY_SIZE,
  type BigTechEntry,
  lookupBigTech,
} from "./big-tech-registry";
