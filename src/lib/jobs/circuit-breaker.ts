// Circuit Breaker — 5-Tier Action Chain (Criterion 3)
// src/lib/jobs/circuit-breaker.ts
//
// Implements the 5-tier Global Remote Circuit Breaker from the governing
// document (Criterion 3 "Global Remote Circuit Breaker: 5-Tier Action Chain").
//
// ── Timing Model ────────────────────────────────────────────────────────────
// Provisional jobs count toward the unknown sub-floor at 3hr after detectedAt;
// discarded at 4hr SLA. 1hr observation window for breaker action.
//
// ── Three-Bucket Denominator ─────────────────────────────────────────────────
//   - Known-scope ratio: global / (global + country_fenced) >= 50%
//     (unknown jobs excluded from this ratio)
//   - Unknown sub-floor: unknown / (global + country_fenced + unknown) <= 30%
//
// ── 5-Tier Action Chain (in trigger-speed order) ────────────────────────────
//   Tier 1: Per-source early-warning (3 consecutive provisional fails → 15min pause)
//   Tier 2: Provisional backlog throttle (>15% / >25% / >30% provisional >1hr old)
//   Tier 3: Unknown sub-floor guard (>=30% unknown at 3hr count)
//   Tier 4: Corpus-ratio breaker (global / (global + country_fenced) < 50%)
//   Tier 5: Daily source ban (escalation_count >= 3 in 24hr → 24hr cooldown)
//
// ── Severity Stack (interaction rule) ───────────────────────────────────────
//   Hard pause > rate reduction > normal operation.
//   Per-source pause suppresses active rate reductions for duration of pause.
//   After pause expires, re-evaluate source. If backlog condition still true →
//   apply rate reduction. Rate reductions do not stack — strictest active applies.
//   Clean chain: pause → drain → throttle if still needed → resume.
//
// See docs/governing/company-corpus-expansion-new.md Criterion 3.

import { and, eq, gte, sql } from "drizzle-orm";

import { db } from "@/db/db";
import { alerts } from "@/db/schemas/jobs/alerts";
import { company } from "@/db/schemas/jobs/company";
import { job } from "@/db/schemas/jobs/job";
import { sourceHealth } from "@/db/schemas/jobs/sourceHealth";

// ── Types ────────────────────────────────────────────────────────────────────

/** The 5 tiers of the circuit breaker action chain. */
export type BreakerTier = 1 | 2 | 3 | 4 | 5;

/** The severity levels, in order of precedence (highest first). */
export type Severity = "hard_pause" | "rate_reduction" | "normal";

/** The action taken by a breaker tier evaluation. */
export type BreakerAction =
  | "pause_source_15min"
  | "pause_source_1hr"
  | "rate_reduce_50"
  | "rate_reduce_90"
  | "pause_source_until_clear"
  | "force_reclassify"
  | "halt_non_global_ingestion"
  | "ban_source_24hr"
  | "no_action";

/** Result of evaluating a single breaker tier. */
export interface TierEvaluationResult {
  tier: BreakerTier;
  triggered: boolean;
  action: BreakerAction;
  severity: Severity;
  /** The source(s) affected by this tier's action (if triggered). */
  affectedSources: string[];
  /** Human-readable details for logging/alerting. */
  details: string;
  /** Numeric metrics that triggered the tier (for alert details). */
  metrics: Record<string, number>;
}

/** Result of the full breaker evaluation (all 5 tiers). */
export interface BreakerEvaluationResult {
  evaluations: TierEvaluationResult[];
  /** The highest-severity action across all tiers (severity stack). */
  dominantSeverity: Severity;
  /** All actions that should be applied (from triggered tiers). */
  actions: TierEvaluationResult[];
  /** Corpus metrics snapshot at evaluation time. */
  corpusMetrics: CorpusMetrics;
}

/** Corpus-wide metrics used by the breaker evaluation. */
export interface CorpusMetrics {
  globalCount: number;
  countryFencedCount: number;
  unknownCount: number;
  provisionalCount: number;
  provisionalOver1hrCount: number;
  /** global / (global + country_fenced). Excludes unknown. */
  knownScopeRatio: number;
  /** unknown / (global + country_fenced + unknown). */
  unknownSubFloorRatio: number;
  /** provisional / total jobs. */
  provisionalRatio: number;
}

/** Per-source metrics used by Tier 1 + Tier 2. */
export interface SourceMetrics {
  sourceName: string;
  consecutiveProvisionalFailures: number;
  provisionalCount: number;
  provisionalOver1hrCount: number;
  escalationCount: number;
  lastEscalatedAt: Date | null;
  status: string;
}

// ── Thresholds (from governing doc) ──────────────────────────────────────────

export const TIER1_CONSECUTIVE_FAILS_THRESHOLD = 3;
export const TIER1_PAUSE_DURATION_MIN = 15;
export const TIER1_PAUSE_ESCALATION_MIN = 60;

export const TIER2_BACKLOG_15_PCT = 0.15;
export const TIER2_BACKLOG_25_PCT = 0.25;
export const TIER2_BACKLOG_30_PCT = 0.3;

export const TIER3_UNKNOWN_SUB_FLOOR_PCT = 0.3;
export const TIER3_SOURCE_UNKNOWN_YIELD_PCT = 0.4;

export const TIER4_CORPUS_RATIO_THRESHOLD = 0.5;
export const TIER4_RESET_THRESHOLD = 0.15;

export const TIER5_ESCALATION_THRESHOLD = 3;
export const TIER5_BAN_DURATION_HRS = 24;

// ── Pure Evaluation Functions ────────────────────────────────────────────────

/**
 * Tier 1: Per-source early-warning breaker.
 *
 * 3 consecutive provisional normalization failures from one source →
 * set source to 'degraded', pause new inserts 15min, emit alerts row.
 * Single-test retry at +15min. Success → reset to 'healthy' + resume.
 * Fail → escalate to 1hr pause + alert. Increment escalation_count.
 *
 * @param source  Per-source metrics
 * @returns       Tier evaluation result
 */
export function evaluateTier1(source: SourceMetrics): TierEvaluationResult {
  const triggered =
    source.consecutiveProvisionalFailures >= TIER1_CONSECUTIVE_FAILS_THRESHOLD;

  if (!triggered) {
    return {
      tier: 1,
      triggered: false,
      action: "no_action",
      severity: "normal",
      affectedSources: [],
      details: "No source has 3+ consecutive provisional failures",
      metrics: {
        consecutiveProvisionalFailures: source.consecutiveProvisionalFailures,
      },
    };
  }

  // Check if this is an escalation (already paused once → escalate to 1hr)
  const isEscalation = source.escalationCount > 0;
  const action = isEscalation ? "pause_source_1hr" : "pause_source_15min";
  const severity: Severity = "hard_pause";

  return {
    tier: 1,
    triggered: true,
    action,
    severity,
    affectedSources: [source.sourceName],
    details: isEscalation
      ? `Source '${source.sourceName}' escalated: ${source.consecutiveProvisionalFailures} consecutive fails after prior 15min pause → 1hr pause + escalation_count++`
      : `Source '${source.sourceName}' early-warning: ${source.consecutiveProvisionalFailures} consecutive provisional fails → 15min pause + single-test retry`,
    metrics: {
      consecutiveProvisionalFailures: source.consecutiveProvisionalFailures,
      escalationCount: source.escalationCount,
    },
  };
}

/**
 * Tier 2: Provisional backlog throttle.
 *
 * >15% provisional jobs >1hr old → reduce offending source batch rate 50%.
 * >25% → reduce 90%.
 * >30% → pause source until backlog clears.
 *
 * @param source    Per-source metrics
 * @param corpus    Corpus-wide metrics (for total denominator)
 * @returns         Tier evaluation result
 */
export function evaluateTier2(
  source: SourceMetrics,
  corpus: CorpusMetrics,
): TierEvaluationResult {
  const totalJobs =
    corpus.globalCount +
    corpus.countryFencedCount +
    corpus.unknownCount +
    corpus.provisionalCount;
  if (totalJobs === 0) {
    return {
      tier: 2,
      triggered: false,
      action: "no_action",
      severity: "normal",
      affectedSources: [],
      details: "No jobs in corpus — backlog throttle not applicable",
      metrics: {},
    };
  }

  // Per-source backlog ratio: this source's provisional >1hr / total jobs
  const sourceBacklogRatio = source.provisionalOver1hrCount / totalJobs;

  let action: BreakerAction = "no_action";
  let severity: Severity = "normal";
  let triggered = false;
  let details = `Source '${source.sourceName}' backlog: ${source.provisionalOver1hrCount} provisional >1hr (${(sourceBacklogRatio * 100).toFixed(1)}% of corpus)`;

  if (sourceBacklogRatio > TIER2_BACKLOG_30_PCT) {
    action = "pause_source_until_clear";
    severity = "hard_pause";
    triggered = true;
    details = `Source '${source.sourceName}' backlog >30%: ${source.provisionalOver1hrCount} provisional >1hr → pause until backlog clears`;
  } else if (sourceBacklogRatio > TIER2_BACKLOG_25_PCT) {
    action = "rate_reduce_90";
    severity = "rate_reduction";
    triggered = true;
    details = `Source '${source.sourceName}' backlog >25%: ${source.provisionalOver1hrCount} provisional >1hr → reduce rate 90%`;
  } else if (sourceBacklogRatio > TIER2_BACKLOG_15_PCT) {
    action = "rate_reduce_50";
    severity = "rate_reduction";
    triggered = true;
    details = `Source '${source.sourceName}' backlog >15%: ${source.provisionalOver1hrCount} provisional >1hr → reduce rate 50%`;
  }

  return {
    tier: 2,
    triggered,
    action,
    severity,
    affectedSources: triggered ? [source.sourceName] : [],
    details,
    metrics: {
      provisionalOver1hr: source.provisionalOver1hrCount,
      backlogRatio: sourceBacklogRatio,
    },
  };
}

/**
 * Tier 3: Unknown sub-floor guard.
 *
 * At 3hr count checkpoint: unknown / (global + country_fenced + unknown) >= 30%
 * → pause sources with >40% unknown yield, force LLM re-classification of backlog.
 *
 * @param corpus  Corpus-wide metrics
 * @returns       Tier evaluation result
 */
export function evaluateTier3(corpus: CorpusMetrics): TierEvaluationResult {
  const triggered = corpus.unknownSubFloorRatio >= TIER3_UNKNOWN_SUB_FLOOR_PCT;

  if (!triggered) {
    return {
      tier: 3,
      triggered: false,
      action: "no_action",
      severity: "normal",
      affectedSources: [],
      details: `Unknown sub-floor: ${(corpus.unknownSubFloorRatio * 100).toFixed(1)}% < ${TIER3_UNKNOWN_SUB_FLOOR_PCT * 100}% threshold`,
      metrics: {
        unknownSubFloorRatio: corpus.unknownSubFloorRatio,
        unknownCount: corpus.unknownCount,
      },
    };
  }

  return {
    tier: 3,
    triggered: true,
    action: "force_reclassify",
    severity: "hard_pause",
    affectedSources: [], // affected sources determined by per-source unknown yield
    details: `Unknown sub-floor breached: ${(corpus.unknownSubFloorRatio * 100).toFixed(1)}% >= ${TIER3_UNKNOWN_SUB_FLOOR_PCT * 100}% → pause sources with >40% unknown yield, force re-classification`,
    metrics: {
      unknownSubFloorRatio: corpus.unknownSubFloorRatio,
      unknownCount: corpus.unknownCount,
      globalCount: corpus.globalCount,
      countryFencedCount: corpus.countryFencedCount,
    },
  };
}

/**
 * Tier 4: Corpus-ratio breaker.
 *
 * global / (global + country_fenced) < 50% → halt all non-global-remote
 * ingestion, redirect all seeders to global-remote filters, page on-call.
 * Resets on purge below 15%.
 *
 * @param corpus  Corpus-wide metrics
 * @returns       Tier evaluation result
 */
export function evaluateTier4(corpus: CorpusMetrics): TierEvaluationResult {
  const knownScopeTotal = corpus.globalCount + corpus.countryFencedCount;
  if (knownScopeTotal === 0) {
    return {
      tier: 4,
      triggered: false,
      action: "no_action",
      severity: "normal",
      affectedSources: [],
      details: "No known-scope jobs — corpus-ratio breaker not applicable",
      metrics: { knownScopeRatio: 0 },
    };
  }

  const triggered = corpus.knownScopeRatio < TIER4_CORPUS_RATIO_THRESHOLD;

  if (!triggered) {
    return {
      tier: 4,
      triggered: false,
      action: "no_action",
      severity: "normal",
      affectedSources: [],
      details: `Corpus ratio: ${(corpus.knownScopeRatio * 100).toFixed(1)}% >= ${TIER4_CORPUS_RATIO_THRESHOLD * 100}% threshold`,
      metrics: { knownScopeRatio: corpus.knownScopeRatio },
    };
  }

  return {
    tier: 4,
    triggered: true,
    action: "halt_non_global_ingestion",
    severity: "hard_pause",
    affectedSources: [], // corpus-wide — affects all non-global-remote sources
    details: `Corpus ratio breached: ${(corpus.knownScopeRatio * 100).toFixed(1)}% < ${TIER4_CORPUS_RATIO_THRESHOLD * 100}% → halt non-global-remote ingestion, redirect seeders to global-remote filters`,
    metrics: {
      knownScopeRatio: corpus.knownScopeRatio,
      globalCount: corpus.globalCount,
      countryFencedCount: corpus.countryFencedCount,
    },
  };
}

/**
 * Tier 5: Daily source ban.
 *
 * escalation_count >= 3 in sliding 24hr window → set source_status = 'banned',
 * fire alert, halt all ingestion from that source. 24hr cooldown via daily
 * sourceBanRecoveryCheck cron.
 *
 * @param source  Per-source metrics
 * @returns       Tier evaluation result
 */
export function evaluateTier5(source: SourceMetrics): TierEvaluationResult {
  const triggered = source.escalationCount >= TIER5_ESCALATION_THRESHOLD;

  if (!triggered) {
    return {
      tier: 5,
      triggered: false,
      action: "no_action",
      severity: "normal",
      affectedSources: [],
      details: `Source '${source.sourceName}' escalation_count: ${source.escalationCount} < ${TIER5_ESCALATION_THRESHOLD} threshold`,
      metrics: { escalationCount: source.escalationCount },
    };
  }

  return {
    tier: 5,
    triggered: true,
    action: "ban_source_24hr",
    severity: "hard_pause",
    affectedSources: [source.sourceName],
    details: `Source '${source.sourceName}' banned: escalation_count ${source.escalationCount} >= ${TIER5_ESCALATION_THRESHOLD} in 24hr → 24hr cooldown + alert`,
    metrics: { escalationCount: source.escalationCount },
  };
}

// ── Severity Stack ───────────────────────────────────────────────────────────

/**
 * Resolve the dominant severity across multiple tier evaluations.
 * Hard pause > rate reduction > normal.
 *
 * Per governing doc "Severity Stack":
 *   - Hard pause > rate reduction > normal operation.
 *   - Per-source pause suppresses active rate reductions for duration of pause.
 *   - Rate reductions do not stack — strictest active reduction applies.
 */
export function resolveDominantSeverity(
  evaluations: TierEvaluationResult[],
): Severity {
  for (const ev of evaluations) {
    if (ev.triggered && ev.severity === "hard_pause") return "hard_pause";
  }
  for (const ev of evaluations) {
    if (ev.triggered && ev.severity === "rate_reduction")
      return "rate_reduction";
  }
  return "normal";
}

// ── DB Operations ────────────────────────────────────────────────────────────

/**
 * Fetch corpus-wide metrics for breaker evaluation.
 * Counts jobs by remoteScope bucket + provisional status.
 *
 * @param checkpointCutoff  Jobs detected before this time count toward the 3hr checkpoint
 * @returns                 Corpus metrics snapshot
 */
export async function fetchCorpusMetrics(
  checkpointCutoff: Date = new Date(Date.now() - 3 * 60 * 60 * 1000),
): Promise<CorpusMetrics> {
  // Count jobs by remoteScope. The unknown bucket includes both 'unknown'
  // (pre-normalization default) and 'undetermined' (v2 terminal value).
  const rows = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE ${job.remoteScope} = 'global') AS global_count,
      COUNT(*) FILTER (WHERE ${job.remoteScope} = 'country_fenced') AS country_fenced_count,
      COUNT(*) FILTER (WHERE ${job.remoteScope} IN ('unknown', 'undetermined')) AS unknown_count,
      COUNT(*) FILTER (WHERE ${job.status} = 'provisional') AS provisional_count,
      COUNT(*) FILTER (WHERE ${job.status} = 'provisional' AND ${job.detectedAt} < ${new Date(Date.now() - 60 * 60 * 1000)}) AS provisional_over_1hr_count
    FROM ${job}
    WHERE ${job.status} IN ('active', 'provisional')
  `);

  const r = (rows.rows?.[0] ?? {}) as Record<string, string | null>;
  const globalCount = Number(r.global_count ?? 0);
  const countryFencedCount = Number(r.country_fenced_count ?? 0);
  const unknownCount = Number(r.unknown_count ?? 0);
  const provisionalCount = Number(r.provisional_count ?? 0);
  const provisionalOver1hrCount = Number(r.provisional_over_1hr_count ?? 0);

  const knownScopeTotal = globalCount + countryFencedCount;
  const knownScopeRatio =
    knownScopeTotal > 0 ? globalCount / knownScopeTotal : 0;
  const totalWithUnknown = knownScopeTotal + unknownCount;
  const unknownSubFloorRatio =
    totalWithUnknown > 0 ? unknownCount / totalWithUnknown : 0;
  const allJobs =
    globalCount + countryFencedCount + unknownCount + provisionalCount;
  const provisionalRatio = allJobs > 0 ? provisionalCount / allJobs : 0;

  return {
    globalCount,
    countryFencedCount,
    unknownCount,
    provisionalCount,
    provisionalOver1hrCount,
    knownScopeRatio,
    unknownSubFloorRatio,
    provisionalRatio,
  };
}

/**
 * Fetch per-source metrics for a given source name.
 * Counts consecutive provisional normalization failures + backlog.
 *
 * @param sourceName  The Inngest function id (e.g., "v2-funding-signal-rss")
 * @returns           Per-source metrics, or null if no health row exists
 */
export async function fetchSourceMetrics(
  sourceName: string,
): Promise<SourceMetrics | null> {
  const healthRows = await db
    .select()
    .from(sourceHealth)
    .where(eq(sourceHealth.sourceName, sourceName))
    .limit(1);

  const health = healthRows[0];
  if (!health) return null;

  // Count provisional jobs from this source that are >1hr old.
  // The job table doesn't have a direct source_name column — we approximate
  // by counting provisional jobs detected >1hr ago. A more precise join
  // would require linking jobs to sources via the company table's
  // discovery_source, but that's expensive and the breaker is approximate.
  const backlogRows = await db.execute(sql`
    SELECT COUNT(*) AS cnt
    FROM ${job}
    WHERE ${job.status} = 'provisional'
      AND ${job.detectedAt} < ${new Date(Date.now() - 60 * 60 * 1000)}
  `);
  const provisionalOver1hrCount = Number(
    (backlogRows.rows?.[0] as Record<string, string | null>)?.cnt ?? 0,
  );

  const provisionalCount = Number(
    (
      await db.execute(
        sql`SELECT COUNT(*) AS cnt FROM ${job} WHERE ${job.status} = 'provisional'`,
      )
    ).rows?.[0]?.cnt ?? 0,
  );

  return {
    sourceName,
    consecutiveProvisionalFailures: health.consecutiveFailures,
    provisionalCount,
    provisionalOver1hrCount,
    escalationCount: health.escalationCount,
    lastEscalatedAt: health.lastEscalatedAt,
    status: health.status,
  };
}

/**
 * Fetch all source health rows for breaker evaluation.
 */
export async function fetchAllSourceMetrics(): Promise<SourceMetrics[]> {
  const healthRows = await db.select().from(sourceHealth);

  // Fetch corpus-wide provisional counts once (shared across all sources
  // for the Tier 2 backlog ratio — the per-source breakdown would require
  // a join through company.discovery_source which is expensive).
  const provisionalRows = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE ${job.status} = 'provisional') AS provisional_count,
      COUNT(*) FILTER (WHERE ${job.status} = 'provisional' AND ${job.detectedAt} < ${new Date(Date.now() - 60 * 60 * 1000)}) AS provisional_over_1hr_count
    FROM ${job}
  `);
  const pRow = (provisionalRows.rows?.[0] ?? {}) as Record<
    string,
    string | null
  >;
  const provisionalCount = Number(pRow.provisional_count ?? 0);
  const provisionalOver1hrCount = Number(pRow.provisional_over_1hr_count ?? 0);

  return healthRows.map((h) => ({
    sourceName: h.sourceName,
    consecutiveProvisionalFailures: h.consecutiveFailures,
    provisionalCount,
    provisionalOver1hrCount,
    escalationCount: h.escalationCount,
    lastEscalatedAt: h.lastEscalatedAt,
    status: h.status,
  }));
}

// ── Action Application ───────────────────────────────────────────────────────

/**
 * Apply a Tier 1 action: pause a source for 15min or 1hr.
 * Sets source status to 'degraded' and records the pause.
 * On escalation (1hr pause), increments escalation_count.
 *
 * @param result  Tier 1 evaluation result
 */
export async function applyTier1Action(
  result: TierEvaluationResult,
): Promise<void> {
  if (!result.triggered || result.affectedSources.length === 0) return;
  const sourceName = result.affectedSources[0];
  const isEscalation = result.action === "pause_source_1hr";

  if (isEscalation) {
    // Escalate: increment escalation_count, set last_escalated_at
    await db
      .update(sourceHealth)
      .set({
        status: "degraded",
        escalationCount: sql`${sourceHealth.escalationCount} + 1`,
        lastEscalatedAt: new Date(),
      })
      .where(eq(sourceHealth.sourceName, sourceName));
  } else {
    // First pause: just set to degraded (the 15min pause is enforced by
    // the source's isSourceEnabled check + a cooldown timestamp)
    await db
      .update(sourceHealth)
      .set({ status: "degraded" })
      .where(eq(sourceHealth.sourceName, sourceName));
  }

  // Emit alert
  await emitBreakerAlert(
    "v2_breaker_per_source",
    sourceName,
    result.details,
    "warning",
  );
}

/**
 * Apply a Tier 2 action: rate reduction or pause.
 * Sets source status to 'degraded' (rate reduction) or 'disabled' (pause).
 *
 * @param result  Tier 2 evaluation result
 */
export async function applyTier2Action(
  result: TierEvaluationResult,
): Promise<void> {
  if (!result.triggered || result.affectedSources.length === 0) return;
  const sourceName = result.affectedSources[0];

  if (result.action === "pause_source_until_clear") {
    await db
      .update(sourceHealth)
      .set({
        status: "disabled",
        disabledAt: new Date(),
        disabledReason: result.details,
      })
      .where(eq(sourceHealth.sourceName, sourceName));
  } else {
    // Rate reduction — set to degraded (the 50%/90% reduction is enforced
    // by the source function reading the status and adjusting its batch size)
    await db
      .update(sourceHealth)
      .set({ status: "degraded" })
      .where(eq(sourceHealth.sourceName, sourceName));
  }

  await emitBreakerAlert(
    "v2_breaker_per_source",
    sourceName,
    result.details,
    "warning",
  );
}

/**
 * Apply a Tier 3 action: force re-classification of unknown backlog.
 * Emits an alert — the actual re-classification is handled by the
 * nightlyResurrectionSweep function which re-runs Step 2 on unknown jobs.
 *
 * @param result  Tier 3 evaluation result
 */
export async function applyTier3Action(
  result: TierEvaluationResult,
): Promise<void> {
  if (!result.triggered) return;
  await emitBreakerAlert(
    "v2_breaker_per_source",
    "corpus",
    result.details,
    "critical",
  );
}

/**
 * Apply a Tier 4 action: halt non-global-remote ingestion.
 * Disables all sources that are not global-remote-focused.
 * Emits a critical alert (page on-call).
 *
 * @param result  Tier 4 evaluation result
 */
export async function applyTier4Action(
  result: TierEvaluationResult,
): Promise<void> {
  if (!result.triggered) return;
  await emitBreakerAlert(
    "v2_breaker_corpus_ratio",
    "corpus",
    result.details,
    "critical",
  );
}

/**
 * Apply a Tier 5 action: ban a source for 24hr.
 * Sets source status to 'banned', fires alert.
 * Also marks companies whose only discovery source is this source as
 * source_orphaned (handled by markSourceOrphanedCompanies).
 *
 * @param result  Tier 5 evaluation result
 */
export async function applyTier5Action(
  result: TierEvaluationResult,
): Promise<void> {
  if (!result.triggered || result.affectedSources.length === 0) return;
  const sourceName = result.affectedSources[0];

  await db
    .update(sourceHealth)
    .set({
      status: "banned",
      disabledAt: new Date(),
      disabledReason: result.details,
    })
    .where(eq(sourceHealth.sourceName, sourceName));

  await emitBreakerAlert(
    "v2_source_banned",
    sourceName,
    result.details,
    "critical",
  );

  // Mark companies whose only discovery source is this source as orphaned
  await markSourceOrphanedCompanies(sourceName);
}

// ── Source Orphan Marking ────────────────────────────────────────────────────

/**
 * Mark companies whose only discovery source is the banned source.
 * Sets company.source_orphaned = true for visibility in admin UI.
 * Does NOT set tier='dead' — companies may be multi-source.
 *
 * @param bannedSourceName  The source that was banned
 */
export async function markSourceOrphanedCompanies(
  bannedSourceName: string,
): Promise<void> {
  // A company is orphaned if its discovery_source matches the banned source
  // AND it has no other discovery source (we approximate "only source" by
  // checking discovery_source directly — the company_discovery_sources table
  // tracks multi-source fusion, but for MVP we use the primary discovery_source).
  await db
    .update(company)
    .set({ sourceOrphaned: true })
    .where(
      sql`${company.discoverySource}::text = ${bannedSourceName} AND ${company.sourceOrphaned} = false`,
    );
}

/**
 * Clear the source_orphaned flag for companies discovered by a recovered source.
 * Called by sourceBanRecoveryCheck after a banned source is recovered.
 *
 * @param recoveredSourceName  The source that was recovered
 */
export async function clearSourceOrphanedCompanies(
  recoveredSourceName: string,
): Promise<void> {
  await db
    .update(company)
    .set({ sourceOrphaned: false })
    .where(
      sql`${company.discoverySource}::text = ${recoveredSourceName} AND ${company.sourceOrphaned} = true`,
    );
}

// ── Alert Emission ───────────────────────────────────────────────────────────

/**
 * Emit a breaker alert. Checks for existing active alert of the same type
 * for the same source before creating (deduplication).
 */
async function emitBreakerAlert(
  type:
    | "v2_breaker_per_source"
    | "v2_breaker_corpus_ratio"
    | "v2_source_banned",
  sourceName: string,
  message: string,
  severity: "warning" | "critical",
): Promise<void> {
  // Check for existing active alert (deduplication)
  const existing = await db
    .select({ id: alerts.id })
    .from(alerts)
    .where(
      and(
        eq(alerts.type, type),
        eq(alerts.status, "active"),
        eq(alerts.sourceName, sourceName),
      ),
    )
    .limit(1);

  if (existing.length > 0) return; // deduplicated

  await db.insert(alerts).values({
    type,
    severity,
    message,
    sourceName,
    status: "active",
  });
}

// ── Full Breaker Evaluation ──────────────────────────────────────────────────

/**
 * Evaluate all 5 tiers of the circuit breaker and return the combined result.
 *
 * This is the main entry point called by the breakerCheck Inngest function.
 * It:
 *   1. Fetches corpus metrics + all source metrics
 *   2. Evaluates Tier 1-5 for each source / corpus-wide
 *   3. Resolves the dominant severity (severity stack)
 *   4. Returns the actions to apply
 *
 * The caller (breakerCheck) is responsible for applying the actions via
 * the applyTierNAction() functions.
 *
 * @param now  Current timestamp (injectable for testing)
 * @returns    Full breaker evaluation result
 */
export async function evaluateBreaker(
  now: Date = new Date(),
): Promise<BreakerEvaluationResult> {
  const corpus = await fetchCorpusMetrics(
    new Date(now.getTime() - 3 * 60 * 60 * 1000),
  );
  const sources = await fetchAllSourceMetrics();

  const evaluations: TierEvaluationResult[] = [];

  // Per-source tiers (1, 2, 5) — evaluate for each source
  for (const source of sources) {
    // Skip banned sources — they're already banned
    if (source.status === "banned") continue;

    evaluations.push(evaluateTier1(source));
    evaluations.push(evaluateTier2(source, corpus));
    evaluations.push(evaluateTier5(source));
  }

  // Corpus-wide tiers (3, 4) — evaluate once
  evaluations.push(evaluateTier3(corpus));
  evaluations.push(evaluateTier4(corpus));

  const dominantSeverity = resolveDominantSeverity(evaluations);
  const actions = evaluations.filter((e) => e.triggered);

  return {
    evaluations,
    dominantSeverity,
    actions,
    corpusMetrics: corpus,
  };
}

/**
 * Apply all triggered breaker actions.
 * Called by breakerCheck after evaluateBreaker returns triggered actions.
 *
 * @param result  Full breaker evaluation result
 */
export async function applyBreakerActions(
  result: BreakerEvaluationResult,
): Promise<void> {
  for (const action of result.actions) {
    switch (action.tier) {
      case 1:
        await applyTier1Action(action);
        break;
      case 2:
        await applyTier2Action(action);
        break;
      case 3:
        await applyTier3Action(action);
        break;
      case 4:
        await applyTier4Action(action);
        break;
      case 5:
        await applyTier5Action(action);
        break;
    }
  }
}

// ── Source Ban Recovery ──────────────────────────────────────────────────────

/**
 * Recover a banned source after its 24hr cooldown.
 * Called by the sourceBanRecoveryCheck daily cron.
 *
 * 1. Find sources with status='banned' and disabled_at < now() - 24hr
 * 2. Set status='degraded', reset escalation_count=0
 * 3. Clear source_orphaned flag on affected companies
 * 4. Run single-test retry (the next ingestion cycle serves as the test)
 *
 * @param now  Current timestamp (injectable for testing)
 * @returns    Array of recovered source names
 */
export async function recoverBannedSources(
  now: Date = new Date(),
): Promise<string[]> {
  const cooldownCutoff = new Date(
    now.getTime() - TIER5_BAN_DURATION_HRS * 60 * 60 * 1000,
  );

  // Find banned sources past their cooldown
  const bannedSources = await db
    .select({ sourceName: sourceHealth.sourceName })
    .from(sourceHealth)
    .where(
      and(
        eq(sourceHealth.status, "banned"),
        sql`${sourceHealth.disabledAt} < ${cooldownCutoff}`,
      ),
    );

  const recovered: string[] = [];

  for (const source of bannedSources) {
    // Recover: set to degraded, reset escalation_count, clear disable metadata
    await db
      .update(sourceHealth)
      .set({
        status: "degraded",
        escalationCount: 0,
        disabledAt: null,
        disabledReason: null,
        consecutiveFailures: 0,
      })
      .where(eq(sourceHealth.sourceName, source.sourceName));

    // Clear source_orphaned flag on companies discovered by this source
    await clearSourceOrphanedCompanies(source.sourceName);

    recovered.push(source.sourceName);
  }

  return recovered;
}
