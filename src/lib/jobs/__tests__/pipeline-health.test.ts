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
});
