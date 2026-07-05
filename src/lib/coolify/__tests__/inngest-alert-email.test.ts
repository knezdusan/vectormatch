/**
 * Unit tests for Inngest Alert Email — email content generation
 *
 * Tests the email template builder functions. The sendEmailViaResend
 * function is mocked so no actual emails are sent.
 */

import { describe, expect, it, vi } from "vitest";

// Mock the "server-only" module
vi.mock("server-only", () => ({}));

// Mock the Resend send helper
vi.mock("@/lib/mail", () => ({
  sendEmailViaResend: vi.fn().mockResolvedValue({
    success: true,
    id: "test-email-id",
    from: "test@vectormatch.dev",
  }),
}));

// Mock the database module
vi.mock("@/db/db", () => ({
  db: {
    execute: vi.fn().mockResolvedValue({ rows: [{ cnt: 0 }] }),
  },
}));

import type { InngestStatusResult } from "@/lib/coolify/client";
import { sendInngestAlertEmail } from "@/lib/coolify/inngest-alert-email";
import type { InngestHealthReport } from "@/lib/coolify/inngest-health";

// ── Fixtures ─────────────────────────────────────────────────────────────────

function unhealthyReport(): InngestHealthReport {
  return {
    healthCheck: {
      reachable: false,
      statusCode: null,
      responseTimeMs: 5000,
      error: "ECONNREFUSED",
      checkedAt: "2024-01-01T00:00:00Z",
    },
    functionFailures: {
      totalRuns: 30,
      failedRuns: 20,
      failureRate: 0.67,
      thresholdExceeded: true,
      topFailingFunctions: [
        { name: "job-ingested-handler", failures: 15 },
        { name: "normalization-retry-sweep", failures: 5 },
      ],
    },
    pipelineStall: {
      jobsNormalizedInWindow: 0,
      windowHours: 4,
      stalled: true,
    },
    overallHealthy: false,
    alerts: [
      "INNGEST_UNREACHABLE: Health check failed — ECONNREFUSED",
      "INGESTION_FAILURE_SPIKE: 67% ingestion run failure rate (20/30 runs in 1h)",
      "INNGEST_PIPELINE_STALL: No jobs normalized in 4h",
    ],
  };
}

function coolifyStatusDown(): InngestStatusResult {
  return {
    coolifyStatus: "exited",
    isRunning: false,
    isPaused: true,
    label: "Paused",
    checkedAt: "2024-01-01T00:00:00Z",
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Inngest Alert Email — sendInngestAlertEmail", () => {
  it("returns false when ADMIN_ALERT_EMAIL is not set", async () => {
    vi.stubEnv("ADMIN_ALERT_EMAIL", "");

    const result = await sendInngestAlertEmail({
      reason: "server_unreachable",
      healthReport: unhealthyReport(),
      coolifyStatus: coolifyStatusDown(),
      dashboardUrl: "https://vectormatch.dev/dashboard/admin",
    });

    expect(result).toBe(false);
  });

  it("sends email when ADMIN_ALERT_EMAIL is set and server is unreachable", async () => {
    vi.stubEnv("ADMIN_ALERT_EMAIL", "admin@test.com");

    const { sendEmailViaResend } = await import("@/lib/mail");
    const mockSend = vi.mocked(sendEmailViaResend);
    mockSend.mockClear();

    const result = await sendInngestAlertEmail({
      reason: "server_unreachable",
      healthReport: unhealthyReport(),
      coolifyStatus: coolifyStatusDown(),
      dashboardUrl: "https://vectormatch.dev/dashboard/admin",
    });

    expect(result).toBe(true);
    expect(mockSend).toHaveBeenCalledTimes(1);

    const callArg = mockSend.mock.calls[0]?.[0];
    expect(callArg?.to).toBe("admin@test.com");
    expect(callArg?.subject).toContain("Inngest server is unreachable");
    expect(callArg?.html).toContain("CRITICAL");
    expect(callArg?.html).toContain("ECONNREFUSED");
    expect(callArg?.html).toContain("Acceptance criteria");
  });

  it("includes acceptance criteria for server_paused", async () => {
    vi.stubEnv("ADMIN_ALERT_EMAIL", "admin@test.com");

    const { sendEmailViaResend } = await import("@/lib/mail");
    const mockSend = vi.mocked(sendEmailViaResend);
    mockSend.mockClear();

    await sendInngestAlertEmail({
      reason: "server_paused",
      healthReport: unhealthyReport(),
      coolifyStatus: coolifyStatusDown(),
      dashboardUrl: "https://vectormatch.dev/dashboard/admin",
    });

    const html = mockSend.mock.calls[0]?.[0]?.html ?? "";
    expect(html).toContain("Inngest server is paused");
    expect(html).toContain("started via Coolify");
  });

  it("includes ingestion run failure details for function_failure_spike", async () => {
    vi.stubEnv("ADMIN_ALERT_EMAIL", "admin@test.com");

    const { sendEmailViaResend } = await import("@/lib/mail");
    const mockSend = vi.mocked(sendEmailViaResend);
    mockSend.mockClear();

    await sendInngestAlertEmail({
      reason: "function_failure_spike",
      healthReport: unhealthyReport(),
      coolifyStatus: null,
      dashboardUrl: "https://vectormatch.dev/dashboard/admin",
    });

    const html = mockSend.mock.calls[0]?.[0]?.html ?? "";
    expect(html).toContain("Ingestion run failure spike detected");
    expect(html).toContain("job-ingested-handler");
    expect(html).toContain("67%");
  });

  it("includes pipeline stall details for pipeline_stall", async () => {
    vi.stubEnv("ADMIN_ALERT_EMAIL", "admin@test.com");

    const { sendEmailViaResend } = await import("@/lib/mail");
    const mockSend = vi.mocked(sendEmailViaResend);
    mockSend.mockClear();

    await sendInngestAlertEmail({
      reason: "pipeline_stall",
      healthReport: unhealthyReport(),
      coolifyStatus: null,
      dashboardUrl: "https://vectormatch.dev/dashboard/admin",
    });

    const html = mockSend.mock.calls[0]?.[0]?.html ?? "";
    expect(html).toContain("pipeline has stalled");
    expect(html).toContain("No jobs have been normalized");
  });

  it("sends to multiple recipients when comma-separated", async () => {
    vi.stubEnv("ADMIN_ALERT_EMAIL", "admin1@test.com, admin2@test.com");

    const { sendEmailViaResend } = await import("@/lib/mail");
    const mockSend = vi.mocked(sendEmailViaResend);
    mockSend.mockClear();

    await sendInngestAlertEmail({
      reason: "server_unreachable",
      healthReport: unhealthyReport(),
      coolifyStatus: coolifyStatusDown(),
      dashboardUrl: "https://vectormatch.dev/dashboard/admin",
    });

    const callArg = mockSend.mock.calls[0]?.[0];
    expect(callArg?.to).toBe("admin1@test.com, admin2@test.com");
  });
});
