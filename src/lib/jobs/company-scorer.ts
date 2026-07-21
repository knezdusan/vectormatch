// Company Scorer — Job Scoring Matrix (Criterion 3)
// src/lib/jobs/company-scorer.ts
//
// Computes the `company_size_score` for the Job Scoring Matrix and persists
// it to `company_quality_score.company_size_score`. The score is a clamped
// [-0.30, +0.30] value that feeds into the existing `companyQuality`
// component (0.17 weight in dashboard-queries.ts) as an offset within that
// weight bucket — NOT as a separate weight bucket.
//
// ── Scoring Signals (from governing doc Criterion 3) ────────────────────────
//
// | Signal                  | Condition                          | Score      |
// |-------------------------|------------------------------------|------------|
// | Employee count          | >5000                              | −25        |
// | Employee count          | 1000–5000                          | −15        |
// | Employee count          | 250–1000                           | −5         |
// | Employee count          | 50–250                             | 0          |
// | Employee count          | <50                                | +15        |
// | Employee count          | <20                                | +25        |
// | Agency/aggregator flag  | company.isAgency = true            | −40 + dead |
// | Public/listed company   | company.isPublic or ticker         | −20        |
// | Source origin           | YC/VC portfolio                    | +15        |
// | Source origin           | Product Hunt                       | +10        |
// | Source origin           | HN Algolia                         | +5         |
// | Source origin           | Known aggregator                   | −30        |
// | Company maturity        | Seed/Series A, <3 years old        | +10        |
// | Company maturity        | >10 years old                      | −10        |
//
// Final score is divided by 100 and clamped to [-0.30, +0.30].
// Example: employee_count <20 (+25) + YC (+15) + maturity +10 = +50 → 0.50 → clamped to +0.30.
// Example: employee_count >5000 (−25) + public (−20) + maturity −10 = −55 → −0.55 → clamped to −0.30.
//
// ── Polling Tier Assignment ─────────────────────────────────────────────────
//   - score > 15  → active_hot
//   - score < −20 → dormant
//   - agency flag → dead (overrides tier assignment)
//
// See docs/governing/company-corpus-expansion-new.md Criterion 3.

import { sql } from "drizzle-orm";

import { db } from "@/db/db";
import { company } from "@/db/schemas/jobs/company";
import { companyQualityScore } from "@/db/schemas/jobs/companyQualityScore";
import { lookupBigTech } from "@/lib/jobs/company-enrichment";
import { isAggregator } from "@/lib/jobs/seeders/aggregator-blacklist";
import { canonicalizeCompanyName } from "@/lib/jobs/seeders/slugger";

// ── Types ────────────────────────────────────────────────────────────────────

/** The discovery_source enum values that map to source-origin scoring signals. */
type DiscoverySource =
  | "httparchive"
  | "hn_algolia"
  | "crt_sh"
  | "certstream"
  | "hn_custom_url"
  | "manual"
  | "workable_meta_search"
  | "google_cse"
  | "yc_directory"
  | "vc_portfolio"
  | "newsletter_archive"
  | "wayback_cdx"
  | "rapid7_fdns"
  | "cross_pollination"
  | "sitemap_probe"
  | "github_probe"
  | "funding_signal"
  | "frontend_job_scanner";

/** Input for the scoring matrix (used by computeCompanySizeScore and for persisting the score). */
export interface CompanyScoringInput {
  companyId: string;
  /** Canonical name (from company.canonicalName) — used for big-tech registry lookup. */
  canonicalName: string | null;
  /** ATS slug — used for aggregator check. */
  atsSlug: string;
  /** Company name — used for aggregator check. */
  companyName: string | null;
  /** Employee count (from company.employeeCount or big-tech registry fallback). */
  employeeCount: number | null;
  /** Whether the company is an agency/aggregator. */
  isAgency: boolean;
  /** Whether the company is publicly listed. */
  isPublic: boolean;
  /** Discovery source (from company.discoverySource). */
  discoverySource: DiscoverySource;
  /** When the company was discovered (from company.discoveredAt). */
  discoveredAt: Date;
}

/** Result of the scoring matrix computation. */
export interface CompanyScoreResult {
  /** The raw score (sum of all signals, before clamping). Range: ~[-95, +50]. */
  rawScore: number;
  /** The clamped score divided by 100. Range: [-0.30, +0.30]. This is what gets persisted. */
  companySizeScore: number;
  /** Whether the company should be assigned tier='dead' (agency flag). */
  shouldBeDead: boolean;
  /** The recommended polling tier based on the score. */
  recommendedTier: "active_hot" | "active" | "dormant" | "dead";
  /** Individual signal breakdown for debugging/dashboarding. */
  signals: {
    employeeCount: number;
    agency: number;
    publicListing: number;
    sourceOrigin: number;
    maturity: number;
  };
}

// ── Score Clamp ──────────────────────────────────────────────────────────────

export const SCORE_CLAMP_MIN = -0.3;
export const SCORE_CLAMP_MAX = 0.3;

// ── Tier Thresholds ──────────────────────────────────────────────────────────

export const TIER_ACTIVE_HOT_THRESHOLD = 15;
export const TIER_DORMANT_THRESHOLD = -20;

// ── Pure Scoring Functions ───────────────────────────────────────────────────

/**
 * Score the employee-count signal.
 *
 * @param employeeCount  Employee count (from company row or big-tech registry)
 * @returns              Score: -25, -15, -5, 0, +15, or +25
 */
export function scoreEmployeeCount(employeeCount: number | null): number {
  if (employeeCount === null) return 0; // graceful degradation — skip signal
  if (employeeCount > 5000) return -25;
  if (employeeCount >= 1000) return -15;
  if (employeeCount >= 250) return -5;
  if (employeeCount >= 50) return 0;
  if (employeeCount >= 20) return 15;
  return 25; // <20
}

/**
 * Score the agency/aggregator signal.
 * Agency flag → -40 + tier=dead.
 *
 * @param isAgency  Whether the company is flagged as an agency/aggregator
 * @returns         -40 if agency, 0 otherwise
 */
export function scoreAgency(isAgency: boolean): number {
  return isAgency ? -40 : 0;
}

/**
 * Score the public/listed company signal.
 * Public/listed → -20.
 *
 * @param isPublic  Whether the company is publicly listed
 * @returns         -20 if public, 0 otherwise
 */
export function scorePublicListing(isPublic: boolean): number {
  return isPublic ? -20 : 0;
}

/**
 * Score the source-origin signal based on the discovery_source enum.
 *
 * @param source  The discovery source enum value
 * @returns       +15 (YC/VC), +10 (Product Hunt), +5 (HN), -30 (aggregator), 0 (other)
 */
export function scoreSourceOrigin(source: DiscoverySource): number {
  switch (source) {
    // YC/VC portfolio → +15
    case "yc_directory":
    case "vc_portfolio":
    case "github_probe":
    case "funding_signal":
    case "frontend_job_scanner":
      return 15;
    // Product Hunt → +10
    // (Note: product_hunt is not currently in the enum as a dedicated value,
    // but workable_meta_search and google_cse are discovery mechanisms that
    // hunt for companies via search. If a dedicated product_hunt discovery
    // source is added later, map it here.)
    case "workable_meta_search":
      return 10;
    // HN Algolia → +5
    case "hn_algolia":
    case "hn_custom_url":
      return 5;
    // Known aggregator discovery sources → -30
    // (Aggregator domains are blacklisted at seeder level via aggregator-blacklist.ts,
    // but if a company somehow enters via an aggregator-typed source, penalize.)
    // No dedicated aggregator discovery source exists in the enum — the aggregator
    // penalty is handled by the agency flag signal. This case is a no-op.
    default:
      return 0;
  }
}

/**
 * Score the company maturity signal.
 *
 * DISABLED (returns 0): The original implementation used `discoveredAt` (when
 * the company was added to OUR registry) as a proxy for company age. This is
 * fundamentally wrong — a company discovered last week could be 20 years old.
 * Since the entire corpus was discovered recently (the project is new), ~100%
 * of companies received +10, which cancelled out demotion signals and prevented
 * big-tech/defense companies from reaching the dormant threshold.
 *
 * The signal structure is retained for re-enablement when a proper
 * `founded_date` column is added (e.g., from Crunchbase/Clearbit enrichment,
 * which the v2 strategy lists as a future upgrade path).
 *
 * @param discoveredAt  When the company was discovered (UNUSED — see note above)
 * @param now           Current timestamp (injectable for testing, UNUSED)
 * @returns             Always 0 (signal disabled)
 */
export function scoreMaturity(
  discoveredAt: Date,
  now: Date = new Date(),
): number {
  // Signal disabled — discoveredAt is not a valid company-age proxy.
  // See function docstring for rationale and re-enablement path.
  void discoveredAt;
  void now;
  return 0;
}

/**
 * Resolve the employee count: use company.employeeCount if available,
 * otherwise fall back to the big-tech registry.
 *
 * @param canonicalName     The company's canonical name (pre-canonicalized)
 * @param companyEmployeeCount  The employee count from the company row (nullable)
 * @returns                 The resolved employee count, or null if unknown
 */
export function resolveEmployeeCount(
  canonicalName: string | null,
  companyEmployeeCount: number | null,
): number | null {
  if (companyEmployeeCount !== null) return companyEmployeeCount;
  if (!canonicalName) return null;
  // The canonicalName in the company row is already canonicalized by the slugger.
  // Lookup in the registry uses the same canonicalized form.
  const registryEntry = lookupBigTech(canonicalName);
  return registryEntry?.employeeCount ?? null;
}

/**
 * Resolve the isPublic flag: use company.isPublic if explicitly set,
 * otherwise check the big-tech registry.
 *
 * @param canonicalName  The company's canonical name
 * @param companyIsPublic  The isPublic flag from the company row
 * @returns              True if the company is publicly listed
 */
export function resolveIsPublic(
  canonicalName: string | null,
  companyIsPublic: boolean,
): boolean {
  if (companyIsPublic) return true;
  if (!canonicalName) return false;
  return lookupBigTech(canonicalName)?.isPublic ?? false;
}

// ── Main Scoring Function ────────────────────────────────────────────────────

/**
 * Compute the company size score from the 5 signals in the Job Scoring Matrix.
 *
 * This is a PURE function — it does not touch the database. The caller is
 * responsible for persisting the result via `persistCompanySizeScore()`.
 *
 * @param input  The company scoring input
 * @param now    Current timestamp (injectable for testing)
 * @returns      The score result with clamped companySizeScore + tier recommendation
 */
export function computeCompanySizeScore(
  input: CompanyScoringInput,
  now: Date = new Date(),
): CompanyScoreResult {
  // Resolve employee count (company row → big-tech registry → null/skip)
  const employeeCount = resolveEmployeeCount(
    input.canonicalName,
    input.employeeCount,
  );

  // Resolve isPublic (company row → big-tech registry → false)
  const isPublic = resolveIsPublic(input.canonicalName, input.isPublic);

  // Compute individual signals
  const employeeCountScore = scoreEmployeeCount(employeeCount);
  const agencyScore = scoreAgency(input.isAgency);
  const publicScore = scorePublicListing(isPublic);
  const sourceOriginScore = scoreSourceOrigin(input.discoverySource);
  const maturityScore = scoreMaturity(input.discoveredAt, now);

  const rawScore =
    employeeCountScore +
    agencyScore +
    publicScore +
    sourceOriginScore +
    maturityScore;

  // Convert to [-0.30, +0.30] range and clamp
  const unclamped = rawScore / 100;
  const companySizeScore = Math.max(
    SCORE_CLAMP_MIN,
    Math.min(SCORE_CLAMP_MAX, unclamped),
  );

  // Determine tier
  const shouldBeDead = input.isAgency;
  let recommendedTier: CompanyScoreResult["recommendedTier"];
  if (shouldBeDead) {
    recommendedTier = "dead";
  } else if (rawScore > TIER_ACTIVE_HOT_THRESHOLD) {
    recommendedTier = "active_hot";
  } else if (rawScore < TIER_DORMANT_THRESHOLD) {
    recommendedTier = "dormant";
  } else {
    recommendedTier = "active";
  }

  return {
    rawScore,
    companySizeScore,
    shouldBeDead,
    recommendedTier,
    signals: {
      employeeCount: employeeCountScore,
      agency: agencyScore,
      publicListing: publicScore,
      sourceOrigin: sourceOriginScore,
      maturity: maturityScore,
    },
  };
}

// ── DB Persistence ───────────────────────────────────────────────────────────

/**
 * Persist the company_size_score to the company_quality_score table.
 * Uses UPSERT — if no quality score row exists for the company, one is created
 * with default values for the other columns (score=50, approved/rejected/total=0).
 * If a row exists, only company_size_score and calculated_at are updated.
 *
 * @param companyId         The company UUID
 * @param companySizeScore  The clamped [-0.30, +0.30] score
 */
export async function persistCompanySizeScore(
  companyId: string,
  companySizeScore: number,
): Promise<void> {
  await db
    .insert(companyQualityScore)
    .values({
      companyId,
      score: 50, // default Bayesian score for new companies
      companySizeScore: companySizeScore.toFixed(6),
      calculatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: companyQualityScore.companyId,
      set: {
        companySizeScore: companySizeScore.toFixed(6),
        calculatedAt: new Date(),
      },
    });
}

/**
 * Apply the recommended polling tier to the company row.
 * Only updates if the current tier differs from the recommended tier.
 * Does NOT override manually-set 'dead' tier (agency flag is the only path to 'dead').
 *
 * @param companyId         The company UUID
 * @param recommendedTier   The recommended tier from the scoring matrix
 * @param shouldBeDead      Whether the agency flag mandates tier='dead'
 */
export async function applyCompanyTier(
  companyId: string,
  recommendedTier: CompanyScoreResult["recommendedTier"],
  shouldBeDead: boolean,
): Promise<void> {
  if (shouldBeDead) {
    // Agency flag → force tier='dead' (overrides any other tier)
    await db
      .update(company)
      .set({ tier: "dead" })
      .where(sql`${company.id} = ${companyId}`);
    return;
  }

  // For non-agency companies, apply the recommended tier (active_hot, active,
  // or dormant). All three are valid tier assignments from the scoring matrix.
  // The quality flywheel can still override via approved match history.
  if (
    recommendedTier === "active_hot" ||
    recommendedTier === "active" ||
    recommendedTier === "dormant"
  ) {
    await db
      .update(company)
      .set({ tier: recommendedTier })
      .where(
        sql`${company.id} = ${companyId} AND ${company.tier} != 'dead'::company_tier`,
      );
  }
}

/**
 * Score a company and persist the result. This is the main entry point
 * called from the normalization pipeline (normalizeProvisionalJob).
 *
 * 1. Computes the score from the 5 signals
 * 2. Persists company_size_score to company_quality_score
 * 3. Applies the recommended tier to the company row
 *
 * @param input  The company scoring input
 * @param now    Current timestamp (injectable for testing)
 * @returns      The score result
 */
export async function scoreAndPersistCompany(
  input: CompanyScoringInput,
  now: Date = new Date(),
): Promise<CompanyScoreResult> {
  const result = computeCompanySizeScore(input, now);

  await persistCompanySizeScore(input.companyId, result.companySizeScore);
  // Apply tier for any non-dead recommendation (active_hot, active, dormant).
  // The quality flywheel can still override via approved match history.
  if (result.recommendedTier !== "dead" || result.shouldBeDead) {
    await applyCompanyTier(
      input.companyId,
      result.recommendedTier,
      result.shouldBeDead,
    );
  }
  return result;
}

/**
 * Build a CompanyScoringInput from a company row (for use in the normalization
 * pipeline where the company row is already loaded).
 *
 * Also checks the aggregator blacklist if the company row doesn't already
 * have isAgency set.
 *
 * @param row  The company row with the fields needed for scoring
 * @returns    A CompanyScoringInput ready for computeCompanySizeScore
 */
export function buildScoringInputFromCompany(row: {
  id: string;
  canonicalName: string | null;
  atsSlug: string;
  companyName: string | null;
  employeeCount: number | null;
  isAgency: boolean;
  isPublic: boolean;
  discoverySource: DiscoverySource;
  discoveredAt: Date;
}): CompanyScoringInput {
  // If isAgency is already true on the row, keep it. Otherwise check the
  // aggregator blacklist (the row may not have been flagged at discovery time).
  const isAgency = row.isAgency || isAggregator(row.atsSlug, row.companyName);

  return {
    companyId: row.id,
    canonicalName:
      row.canonicalName ?? canonicalizeCompanyName(row.companyName ?? ""),
    atsSlug: row.atsSlug,
    companyName: row.companyName,
    employeeCount: row.employeeCount,
    isAgency,
    isPublic: row.isPublic,
    discoverySource: row.discoverySource,
    discoveredAt: row.discoveredAt,
  };
}
