/**
 * Unit tests for per-stage daily counters (Phase 1 — ACTION PLAN)
 *
 * Tests the evaluateStageAlerts function which checks if any pipeline
 * stage is at 0 for 24h. This is the diagnostic tool that would have
 * caught the July 23 outage immediately.
 */

import { describe, expect, it } from "vitest";

import { evaluateStageAlerts } from "@/lib/jobs/pipeline-health";

describe("evaluateStageAlerts", () => {
  it("returns no alerts when all stages have throughput", () => {
    const counters = {
      ingested: 50,
      normalized: 48,
      embedded: 48,
      gate12: 100,
      gate3: 20,
      approved: 5,
      dashboard: 5,
    };
    const alerts = evaluateStageAlerts(counters);
    expect(alerts).toHaveLength(0);
  });

  it("alerts when ingestion is at 0", () => {
    const counters = {
      ingested: 0,
      normalized: 0,
      embedded: 0,
      gate12: 0,
      gate3: 0,
      approved: 0,
      dashboard: 0,
    };
    const alerts = evaluateStageAlerts(counters);
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts.some((a) => a.includes("Ingestion"))).toBe(true);
    expect(alerts.some((a) => a.includes("Counter breakdown"))).toBe(true);
  });

  it("alerts when only Gate 3 is at 0 (downstream blockage)", () => {
    const counters = {
      ingested: 50,
      normalized: 48,
      embedded: 48,
      gate12: 100,
      gate3: 0,
      approved: 0,
      dashboard: 0,
    };
    const alerts = evaluateStageAlerts(counters);
    expect(alerts.some((a) => a.includes("Gate 3"))).toBe(true);
    expect(alerts.some((a) => a.includes("Match approval"))).toBe(true);
    expect(alerts.some((a) => a.includes("Dashboard visibility"))).toBe(true);
    // Should NOT alert on stages that have throughput
    expect(alerts.some((a) => a.includes("Ingestion"))).toBe(false);
    expect(alerts.some((a) => a.includes("Normalization"))).toBe(false);
  });

  it("alerts when only ingestion is at 0 (upstream blockage)", () => {
    const counters = {
      ingested: 0,
      normalized: 45,
      embedded: 45,
      gate12: 90,
      gate3: 15,
      approved: 3,
      dashboard: 3,
    };
    const alerts = evaluateStageAlerts(counters);
    expect(alerts.some((a) => a.includes("Ingestion"))).toBe(true);
    expect(alerts.some((a) => a.includes("Normalization"))).toBe(false);
    expect(alerts.some((a) => a.includes("Counter breakdown"))).toBe(true);
  });

  it("includes counter breakdown in alert message", () => {
    const counters = {
      ingested: 0,
      normalized: 0,
      embedded: 0,
      gate12: 0,
      gate3: 0,
      approved: 0,
      dashboard: 0,
    };
    const alerts = evaluateStageAlerts(counters);
    const breakdown = alerts.find((a) => a.includes("Counter breakdown"));
    expect(breakdown).toBeDefined();
    expect(breakdown).toContain("ingested=0");
    expect(breakdown).toContain("normalized=0");
    expect(breakdown).toContain("gate12=0");
    expect(breakdown).toContain("approved=0");
  });
});
