// Direct Ingestion Types
// src/lib/jobs/direct-ingestion/types.ts
//
// Shared types for the direct job board ingestion pipeline (WI3).
// Direct boards (Himalayas, RemoteOK, NoFluffJobs, JustJoin) provide structured
// fields (tags, remoteType, salary, seniority) that map directly to the job
// table — no LLM normalization needed.
//
// Unlike the ATS poller's NormalizedJob, DirectIngestionJob includes
// extractedTags and normalizedText directly from the board's structured data,
// because we skip LLM normalization entirely (WI3 Step 4).
//
// ── Architecture Decision: Per-Adapter Scope Logic (C3, July 2026) ──────────
//
// Direct-ingestion adapters do NOT route through extractRemoteScope (the
// central classifier used by ATS poller jobs). Instead, each adapter has its
// own audited, tested scope inference logic. This is an intentional design
// choice, not an oversight:
//
//   1. Structured data is more reliable than regex on JD text. Each board
//      exposes country data in a different format:
//        - NoFluffJobs: places[] with country.code + country.name
//        - JustJoin:    single countryCode (ISO alpha-2)
//        - Remotive:    candidate_required_location (free-text string)
//        - WWR:         <region> XML field (free-text string)
//        - Himalayas:   no country data at all (truly global board)
//        - RemoteOK:    no country data at all (truly global board)
//        - Arbeitnow:   no country data at all (truly global board)
//      Routing these through extractRemoteScope (designed for unstructured
//      JD text) would discard the structured signal and rely on regex matching
//      against a synthesized text blob — less accurate, not more.
//
//   2. Each adapter's scope logic is tested in direct-ingestion.test.ts.
//      The tests cover: single-country fencing, multi-country region fencing,
//      "Anywhere"/"World" global detection, alpha-3→alpha-2 normalization,
//      and the no-country-data fallback.
//
//   3. The "no country data" fallback is adapter-specific:
//        - NoFluffJobs: defaults to country_fenced/PL (Polish board)
//        - JustJoin:    defaults to global (remote-first, no primary country)
//        - Himalayas:   hardcoded global (truly global board)
//        - RemoteOK:    hardcoded global (truly global board)
//        - Arbeitnow:   hardcoded global (truly global board)
//        - Remotive:    infers from candidate_required_location string
//        - WWR:         infers from <region> field
//
//   4. Recall checks must state which paths they cover. The A1 amendment
//      recall check covers BOTH paths:
//        - ATS poller path: extractRemoteScope (greenhouse, ashby, lever,
//          smartrecruiters) — multi-probe + LLM fallback
//        - Direct-ingestion path: per-adapter scope logic (nofluffjobs,
//          justjoin, himalayas, remotive, remoteok, arbeitnow, wwr)
//      Any future recall check must explicitly state which paths it covers.
//
//   5. The stale-classification sweep (C4) targets BOTH paths — it re-checks
//      global jobs with specific locations regardless of source.

/** A job normalized from a direct job board API response. */
export interface DirectIngestionJob {
  /** The board's internal job ID (used for dedup via externalJobId). */
  externalJobId: string;
  /** Job title. */
  title: string;
  /** Company name (free-text — no company table record is created). */
  companyName: string | null;
  /** Cleaned job description text (HTML-stripped, for normalizedText column). */
  normalizedText: string;
  /** Structured tags from the board (React, TypeScript, etc.) — mapped directly
   *  to the job.extractedTags column. No LLM extraction needed. */
  extractedTags: string[];
  /** Direct application URL (mapped to job.applyUrl). */
  applyUrl: string | null;
  /**
   * Public job posting / listing page URL (mapped to job.jobUrl).
   * Optional — when omitted, the upsert falls back to applyUrl.
   */
  jobUrl?: string | null;
  /** Raw location string from the board. */
  locationName: string | null;
  /** Workplace type from the board's structured field. */
  workplaceType: "remote" | "hybrid" | "on-site" | null;
  /** Employment type (full-time, part-time, contract). */
  employmentType: string | null;
  /** Remote scope — direct boards are remote-first, so default "global"
   *  unless the board specifies country fencing. Boards with structured
   *  country data (NoFluffJobs places[], JustJoin countryCode) should set
   *  "country_fenced" or "region_fenced" based on the actual country spread,
   *  not blindly default to "global". */
  remoteScope: "global" | "country_fenced" | "region_fenced" | "unknown";
  /** ISO 3166-1 alpha-2 country codes the job is fenced to, when the board
   *  provides structured country data (e.g. NoFluffJobs places[].country.code,
   *  JustJoin detail.countryCode). Null for global / unknown scope. Mapped
   *  directly to job.locationCountries — enables Gate 0.5 Check 2's structured
   *  country-list path instead of relying on the locationName string-parsing
   *  fallback in Check 2b. */
  locationCountries?: string[] | null;
  /** Compensation range from the board's structured fields (annual USD). */
  compensationMin: number | null;
  compensationMax: number | null;
  compensationCurrency: string | null;
  /** Experience range from the board's seniority/experienceLevel field. */
  experienceMinYears: number | null;
  experienceMaxYears: number | null;
  /** When the job was published (from the board's structured field). */
  publishedAt: Date | null;
}

/** Result of fetching jobs from a direct job board API. */
export type DirectFetchResult =
  | { success: true; jobs: DirectIngestionJob[]; totalAvailable: number }
  | { success: false; error: string; totalAvailable: 0 };

/** The direct job board sources (WI3 Phase 1). */
export type DirectBoardSource =
  | "himalayas_direct"
  | "remoteok_direct"
  | "nofluffjobs"
  | "arbeitnow"
  | "remotive"
  | "weworkremotely"
  | "justjoin";

/** Configuration for each direct board. */
export interface DirectBoardConfig {
  /** The board identifier (used as ats_source in the job table). */
  source: DirectBoardSource;
  /** Human-readable name (for logs and dashboard). */
  name: string;
  /** Whether the board's API is currently reachable. */
  enabled: boolean;
  /** Maximum jobs to fetch per ingestion run. */
  maxJobs: number;
}
