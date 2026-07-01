/**
 * Unit tests for Pipeline Health Monitor — Sprint 7 Task 6
 *
 * Tests the evaluateAlerts pure function (threshold evaluation logic).
 * The DB query functions are tested via integration tests (not here) since
 * they require a real database connection.
 */

import { describe, expect, it } from "vitest";

import {
  ALERT_THRESHOLDS,
  evaluateAlerts,
  type PipelineHealthMetrics,
} from "@/lib/jobs/pipeline-health";

/** Helper: create a metrics object with all fields set to healthy defaults. */
function healthyMetrics(): PipelineHealthMetrics {
  return {
    unnormalizedJobs: 0,
    unembeddedJobs: 0,
    companiesPolled4h: 100,
    matches24h: 5,
    sourceHealthRows: 25,
    dbSizeMb: 136,
    pendingMatchesStale: 0,
    normalizationFailed: 0,
    approvedMatches24h: 7,
    gate3ApprovalRate7d: 0.03,
    unmatchedEmbeddedJobs: 50,
    avgGate3Confidence: 0.75,
  };
}

describe("Pipeline Health — evaluateAlerts", () => {
  it("returns no alerts when all metrics are healthy", () => {
    const alerts = evaluateAlerts(healthyMetrics());
    expect(alerts).toHaveLength(0);
  });

  it("alerts when unnormalized jobs exceed threshold", () => {
    const alerts = evaluateAlerts({
      ...healthyMetrics(),
      unnormalizedJobs: ALERT_THRESHOLDS.UNNORMALIZED_JOBS + 1,
    });
    expect(alerts.some((a) => a.startsWith("UNNORMALIZED_JOBS"))).toBe(true);
  });

  it("does not alert when unnormalized jobs are at threshold", () => {
    const alerts = evaluateAlerts({
      ...healthyMetrics(),
      unnormalizedJobs: ALERT_THRESHOLDS.UNNORMALIZED_JOBS,
    });
    expect(alerts.some((a) => a.startsWith("UNNORMALIZED_JOBS"))).toBe(false);
  });

  it("alerts when unembedded jobs exceed threshold", () => {
    const alerts = evaluateAlerts({
      ...healthyMetrics(),
      unembeddedJobs: ALERT_THRESHOLDS.UNEMBEDDED_JOBS + 1,
    });
    expect(alerts.some((a) => a.startsWith("UNEMBEDDED_JOBS"))).toBe(true);
  });

  it("alerts when no companies polled in 4h (stale poller)", () => {
    const alerts = evaluateAlerts({
      ...healthyMetrics(),
      companiesPolled4h: 0,
    });
    expect(alerts.some((a) => a.startsWith("STALE_POLLER"))).toBe(true);
  });

  it("does not alert when companies were polled", () => {
    const alerts = evaluateAlerts({
      ...healthyMetrics(),
      companiesPolled4h: 1,
    });
    expect(alerts.some((a) => a.startsWith("STALE_POLLER"))).toBe(false);
  });

  it("alerts when no matches generated in 24h", () => {
    const alerts = evaluateAlerts({
      ...healthyMetrics(),
      matches24h: 0,
    });
    expect(alerts.some((a) => a.startsWith("NO_MATCHES"))).toBe(true);
  });

  it("alerts when source_health table is empty", () => {
    const alerts = evaluateAlerts({
      ...healthyMetrics(),
      sourceHealthRows: 0,
    });
    expect(alerts.some((a) => a.startsWith("SOURCE_HEALTH_EMPTY"))).toBe(true);
  });

  it("alerts when DB storage exceeds threshold", () => {
    const alerts = evaluateAlerts({
      ...healthyMetrics(),
      dbSizeMb: ALERT_THRESHOLDS.DB_STORAGE_MB + 1,
    });
    expect(alerts.some((a) => a.startsWith("DB_STORAGE_HIGH"))).toBe(true);
  });

  it("alerts when pending matches backlog exceeds threshold", () => {
    const alerts = evaluateAlerts({
      ...healthyMetrics(),
      pendingMatchesStale: ALERT_THRESHOLDS.PENDING_MATCHES_STALE + 1,
    });
    expect(alerts.some((a) => a.startsWith("QUEUE_BACKLOG"))).toBe(true);
  });

  it("returns multiple alerts when multiple metrics breach thresholds", () => {
    const alerts = evaluateAlerts({
      ...healthyMetrics(),
      unnormalizedJobs: 100,
      companiesPolled4h: 0,
      matches24h: 0,
      sourceHealthRows: 0,
    });
    expect(alerts.length).toBeGreaterThanOrEqual(4);
    expect(alerts.some((a) => a.startsWith("UNNORMALIZED_JOBS"))).toBe(true);
    expect(alerts.some((a) => a.startsWith("STALE_POLLER"))).toBe(true);
    expect(alerts.some((a) => a.startsWith("NO_MATCHES"))).toBe(true);
    expect(alerts.some((a) => a.startsWith("SOURCE_HEALTH_EMPTY"))).toBe(true);
  });

  // ── Sprint 8: Match-specific alert tests ──────────────────────────────────

  it("alerts when approved matches in 24h are below threshold", () => {
    const alerts = evaluateAlerts({
      ...healthyMetrics(),
      approvedMatches24h: ALERT_THRESHOLDS.APPROVED_MATCHES_24H - 1,
    });
    expect(alerts.some((a) => a.startsWith("LOW_APPROVAL_RATE"))).toBe(true);
  });

  it("does not alert when approved matches meet threshold", () => {
    const alerts = evaluateAlerts({
      ...healthyMetrics(),
      approvedMatches24h: ALERT_THRESHOLDS.APPROVED_MATCHES_24H,
    });
    expect(alerts.some((a) => a.startsWith("LOW_APPROVAL_RATE"))).toBe(false);
  });

  it("alerts when Gate 3 approval rate over 7d is below threshold", () => {
    const alerts = evaluateAlerts({
      ...healthyMetrics(),
      gate3ApprovalRate7d: 0.005,
    });
    expect(alerts.some((a) => a.startsWith("GATE3_APPROVAL_RATE_LOW"))).toBe(
      true,
    );
  });

  it("does not alert when Gate 3 approval rate is healthy", () => {
    const alerts = evaluateAlerts({
      ...healthyMetrics(),
      gate3ApprovalRate7d: 0.03,
    });
    expect(alerts.some((a) => a.startsWith("GATE3_APPROVAL_RATE_LOW"))).toBe(
      false,
    );
  });

  it("alerts when unmatched embedded jobs exceed threshold", () => {
    const alerts = evaluateAlerts({
      ...healthyMetrics(),
      unmatchedEmbeddedJobs: ALERT_THRESHOLDS.UNMATCHED_EMBEDDED_JOBS + 1,
    });
    expect(alerts.some((a) => a.startsWith("UNMATCHED_EMBEDDED"))).toBe(true);
  });

  it("does not alert when unmatched embedded jobs are at threshold", () => {
    const alerts = evaluateAlerts({
      ...healthyMetrics(),
      unmatchedEmbeddedJobs: ALERT_THRESHOLDS.UNMATCHED_EMBEDDED_JOBS,
    });
    expect(alerts.some((a) => a.startsWith("UNMATCHED_EMBEDDED"))).toBe(false);
  });
});
