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
//
// ── E3 Policy: Structured Country-Code vs ALWAYS_GLOBAL_OVERRIDE (July 2026) ─
//
// The ATS/text path (extractRemoteScope) and the direct-ingestion path
// (per-adapter scope logic) have contradictory rules for identical JD text:
//
//   - ATS path: ALWAYS_GLOBAL_OVERRIDE patterns ("work from anywhere", etc.)
//     in JD text → global, EVEN when location is specific. Rationale: these
//     are the strongest possible global intent signals and cannot be
//     contradicted by a location field that lists a city out of ATS habit.
//
//   - Direct-ingestion path (JustJoin, NoFluffJobs): structured countryCode
//     from the board's API → country_fenced, EVEN when JD text contains
//     "work from anywhere". Rationale: platform boards that supply structured
//     country codes (JustJoin countryCode, NoFluffJobs places[].country.code)
//     are authoritative — the board has already determined the hiring region.
//     JD text like "work from anywhere" is marketing boilerplate, not a
//     hiring policy. This is consistent with the established "NoFluffJobs =
//     Poland-locked" screening heuristic.
//
// POLICY (single source of truth, referenced by both paths):
//
//   1. On platform boards that supply a structured country-code from their
//      own API (JustJoin, NoFluffJobs), the structured code BEATS JD
//      global-language boilerplate. The job is country_fenced.
//
//   2. On the ATS/text path (Greenhouse, Ashby, Lever, SmartRecruiters) where
//      no structured country-code exists, ALWAYS_GLOBAL_OVERRIDE continues
//      to apply — JD text is the only signal, and "work from anywhere" is
//      the strongest available global intent.
//
//   3. On direct-ingestion boards WITHOUT structured country data (Himalayas,
//      RemoteOK, Remotive, WWR, Arbeitnow), the adapter's own scope inference
//      logic applies. These boards don't supply country codes, so they use
//      location strings, title signals, and text signals instead.
//
//   4. The divergence is INTENTIONAL and DOCUMENTED. It reflects the
//      reliability hierarchy: structured API data > JD text regex > location
//      string heuristics.
//
// Status: Recommended default, pending Dux confirmation. Implemented as
// described above — JustJoin's inferScopeFromCountryCode fences on
// countryCode regardless of JD text; extractRemoteScope's
// ALWAYS_GLOBAL_OVERRIDE applies only on the ATS path.
//
// ── C2 Policy: Adapter vs Company-Discovery Routing (July 2026, durable) ────
//
// ARCHITECTURAL RULE: Not every job board gets a bespoke direct-ingestion
// adapter. The routing decision is:
//
//   DIRECT-INGESTION ADAPTER (this file's path):
//   Justified ONLY for high-volume, genuinely-global, reliable native boards
//   that self-certify worldwide remote work (WeWorkRemotely-class). The board
//   must produce enough addressable jobs to justify the permanent maintenance
//   liability of a hand-rolled adapter (RSS drift, scope logic, tag mapping,
//   salary parsing — the exact class the D1 audit hunted).
//
//   COMPANY-DISCOVERY → ATS-RESOLUTION → PROBATION-POLL path:
//   ALL other boards — niche/stack-specific (GoRails, LaraJobs, Symfony Jobs),
//   VC/aggregator portfolios (Getro-class), and any source whose value is the
//   companies it surfaces rather than the jobs it hosts. These sources feed
//   company names into the existing ATS slug resolver, which probes
//   Greenhouse/Ashby/Lever/SmartRecruiters. Net-new companies enroll to
//   probation and are polled by the hardened ATS poller — no new adapter code.
//
// RATIONLE: The highest aggregate supply on this project lives in the
// ATS-company layer (our reference set is Ashby/Greenhouse/Lever companies,
// not native boards). The census's job is to find aggregators that unlock
// hundreds of genuinely-global companies whose ATSs we already poll well.
// Building a bespoke adapter for every 5-job niche board is adapter
// proliferation — the problem that caused the entire D1 audit.
//
// EXAMPLES:
//   - WeWorkRemotely → direct-ingestion adapter (high volume, genuinely global)
//   - Himalayas, RemoteOK, Arbeitnow, Remotive → direct-ingestion adapters
//   - LaraJobs (10 jobs, 1 addressable) → company-discovery (NOT an adapter)
//   - GoRails (5 jobs, 4 addressable) → company-discovery (NOT an adapter)
//   - Getro networks → company-discovery (aggregator → ATS resolution)
//   - 4 Day Week → REJECTED (1.3% global yield, not worth either path)

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
