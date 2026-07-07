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
  /** Raw location string from the board. */
  locationName: string | null;
  /** Workplace type from the board's structured field. */
  workplaceType: "remote" | "hybrid" | "on-site" | null;
  /** Employment type (full-time, part-time, contract). */
  employmentType: string | null;
  /** Remote scope — direct boards are remote-first, so default "global"
   *  unless the board specifies country fencing. */
  remoteScope: "global" | "country_fenced" | "region_fenced" | "unknown";
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
