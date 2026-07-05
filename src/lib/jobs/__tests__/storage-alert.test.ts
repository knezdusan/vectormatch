/**
 * Unit tests for Storage Alert Emailer
 *
 * Tests the emergency purge email template. sendEmailViaResend is mocked so no
 * actual emails are sent.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/mail", () => ({
  sendEmailViaResend: vi.fn().mockResolvedValue({
    success: true,
    id: "test-email-id",
    from: "noreply@vectormatch.dev",
  }),
}));

import { sendStorageAlertEmail } from "@/lib/jobs/storage-alert";
import { sendEmailViaResend } from "@/lib/mail";

describe("sendStorageAlertEmail", () => {
  it("returns false when ADMIN_ALERT_EMAIL is not set", async () => {
    vi.stubEnv("ADMIN_ALERT_EMAIL", "");

    const result = await sendStorageAlertEmail({
      severity: "warning",
      currentMb: 186,
      limitMb: 460,
      percentage: 186 / 460,
      reason: "Emergency purge completed — 0 jobs deleted.",
      ingestionHalted: false,
    });

    expect(result).toBe(false);
  });

  it("sends email with storage-only summary and no backlog row", async () => {
    vi.stubEnv("ADMIN_ALERT_EMAIL", "admin@example.com");
    const mockSend = vi.mocked(sendEmailViaResend);
    mockSend.mockClear();

    const result = await sendStorageAlertEmail({
      severity: "warning",
      currentMb: 186,
      limitMb: 460,
      percentage: 186 / 460,
      reason: "Emergency purge completed — 0 jobs deleted.",
      ingestionHalted: false,
    });

    expect(result).toBe(true);
    expect(mockSend).toHaveBeenCalledTimes(1);

    const callArg = mockSend.mock.calls[0]?.[0];
    expect(callArg?.to).toBe("admin@example.com");
    expect(callArg?.subject).toContain("Storage WARNING");
    expect(callArg?.html).toContain("186 MB / 460 MB");
    expect(callArg?.html).toContain("40.4%");
    expect(callArg?.html).toContain("Emergency purge completed");
    expect(callArg?.html).not.toContain("Unnormalized backlog");
    expect(callArg?.html).not.toContain("3074 / 3000");
  });

  it("sends critical email when ingestion is halted", async () => {
    vi.stubEnv("ADMIN_ALERT_EMAIL", "admin@example.com");
    const mockSend = vi.mocked(sendEmailViaResend);
    mockSend.mockClear();

    await sendStorageAlertEmail({
      severity: "critical",
      currentMb: 450,
      limitMb: 460,
      percentage: 450 / 460,
      reason:
        "Emergency purge completed but storage still above recovery threshold.",
      ingestionHalted: true,
    });

    const callArg = mockSend.mock.calls[0]?.[0];
    expect(callArg?.subject).toContain("Storage CRITICAL");
    expect(callArg?.html).toContain("CRITICAL");
    expect(callArg?.html).toContain("New job ingestion is paused");
  });

  it("sends to multiple recipients when comma-separated", async () => {
    vi.stubEnv("ADMIN_ALERT_EMAIL", "admin1@example.com, admin2@example.com");
    const mockSend = vi.mocked(sendEmailViaResend);
    mockSend.mockClear();

    await sendStorageAlertEmail({
      severity: "warning",
      currentMb: 186,
      limitMb: 460,
      percentage: 186 / 460,
      reason: "Emergency purge completed.",
      ingestionHalted: false,
    });

    const callArg = mockSend.mock.calls[0]?.[0];
    expect(callArg?.to).toBe("admin1@example.com, admin2@example.com");
  });
});
