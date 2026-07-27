/**
 * Unit tests for Admin Server Actions (Sprint 4 — admin interactivity)
 *
 * Tests:
 *   - disableSourceAction / enableSourceAction: source toggle
 *   - resolveAlertAction / resolveAllAlertsAction: alert resolution
 *   - Auth check: requireRole("admin") is called on every action
 *   - Input validation: invalid source names, alert IDs, and alert types
 *   - revalidatePath is called on success
 *
 * Mock strategy:
 *   - Mock @/lib/auth to control requireRole (resolves for admin, throws for non-admin)
 *   - Mock @/lib/jobs/source-health to capture disableSource/enableSource calls
 *   - Mock @/lib/jobs/alerting to capture resolveAlert/resolveAllAlerts calls
 *   - Mock next/cache to capture revalidatePath calls
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Hoisted mock refs ---

const {
  mockRequireRole,
  mockDisableSource,
  mockEnableSource,
  mockResolveAlert,
  mockResolveAllAlerts,
  mockRevalidatePath,
  mockSchedulerSend,
  mockSchedulerSendBatch,
} = vi.hoisted(() => ({
  mockRequireRole: vi.fn(),
  mockDisableSource: vi.fn(),
  mockEnableSource: vi.fn(),
  mockResolveAlert: vi.fn(),
  mockResolveAllAlerts: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockSchedulerSend: vi.fn(),
  mockSchedulerSendBatch: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireRole: (role: string, redirectTo?: string) =>
    mockRequireRole(role, redirectTo),
}));

vi.mock("@/lib/jobs/source-health", () => ({
  disableSource: (name: string, reason: string) =>
    mockDisableSource(name, reason),
  enableSource: (name: string) => mockEnableSource(name),
}));

vi.mock("@/lib/jobs/alerting", () => ({
  resolveAlert: (id: string, resolvedBy?: string) =>
    mockResolveAlert(id, resolvedBy),
  resolveAllAlerts: (resolvedBy?: string) => mockResolveAllAlerts(resolvedBy),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => mockRevalidatePath(path),
}));

vi.mock("@/scheduler/scheduler", () => ({
  scheduler: {
    send: (name: string, data: unknown, id?: string) =>
      mockSchedulerSend(name, data, id),
    sendBatch: (events: unknown) => mockSchedulerSendBatch(events),
  },
}));

import {
  disableSourceAction,
  enableSourceAction,
  resolveAlertAction,
  resolveAllAlertsAction,
  triggerEmergencyPurgeAction,
} from "@/actions/admin";

// --- Helpers ---

const ADMIN_SESSION = {
  user: {
    id: "admin-id",
    role: "admin",
    email: "admin@example.com",
    name: "Admin",
  },
  session: { id: "sess-1", userId: "admin-id" },
};

function mockAdminAuth(): void {
  mockRequireRole.mockResolvedValue(ADMIN_SESSION);
}

function mockNonAdminAuth(): void {
  mockRequireRole.mockImplementation(() => {
    throw new Error("NEXT_REDIRECT");
  });
}

// --- Tests ---

describe("admin Server Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdminAuth();
    mockDisableSource.mockResolvedValue(undefined);
    mockEnableSource.mockResolvedValue(undefined);
    mockResolveAlert.mockResolvedValue(undefined);
    mockResolveAllAlerts.mockResolvedValue(3);
    mockSchedulerSend.mockResolvedValue(undefined);
    mockSchedulerSendBatch.mockResolvedValue(undefined);
  });

  // ── disableSourceAction ───────────────────────────────────────────────────

  describe("disableSourceAction", () => {
    it("calls requireRole with admin", async () => {
      await disableSourceAction("batch-source-crt-sh");
      expect(mockRequireRole).toHaveBeenCalledWith("admin", undefined);
    });

    it("disables the source and revalidates the admin path", async () => {
      const result = await disableSourceAction("batch-source-crt-sh");
      expect(mockDisableSource).toHaveBeenCalledWith(
        "batch-source-crt-sh",
        "Manual disable via admin dashboard",
      );
      expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard/admin");
      expect(result).toEqual({ success: true });
    });

    it("returns error for empty source name", async () => {
      const result = await disableSourceAction("");
      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid source name");
      expect(mockDisableSource).not.toHaveBeenCalled();
    });

    it("returns error when disableSource throws", async () => {
      mockDisableSource.mockRejectedValue(new Error("DB connection failed"));
      const result = await disableSourceAction("batch-source-crt-sh");
      expect(result.success).toBe(false);
      expect(result.error).toBe("DB connection failed");
    });

    it("throws when user is not admin (requireRole throws)", async () => {
      mockNonAdminAuth();
      await expect(disableSourceAction("batch-source-crt-sh")).rejects.toThrow(
        "NEXT_REDIRECT",
      );
      expect(mockDisableSource).not.toHaveBeenCalled();
    });
  });

  // ── enableSourceAction ────────────────────────────────────────────────────

  describe("enableSourceAction", () => {
    it("calls requireRole with admin", async () => {
      await enableSourceAction("batch-source-crt-sh");
      expect(mockRequireRole).toHaveBeenCalledWith("admin", undefined);
    });

    it("enables the source and revalidates the admin path", async () => {
      const result = await enableSourceAction("batch-source-crt-sh");
      expect(mockEnableSource).toHaveBeenCalledWith("batch-source-crt-sh");
      expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard/admin");
      expect(result).toEqual({ success: true });
    });

    it("returns error for empty source name", async () => {
      const result = await enableSourceAction("");
      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid source name");
      expect(mockEnableSource).not.toHaveBeenCalled();
    });

    it("returns error when enableSource throws", async () => {
      mockEnableSource.mockRejectedValue(new Error("DB error"));
      const result = await enableSourceAction("batch-source-crt-sh");
      expect(result.success).toBe(false);
      expect(result.error).toBe("DB error");
    });

    it("throws when user is not admin", async () => {
      mockNonAdminAuth();
      await expect(enableSourceAction("batch-source-crt-sh")).rejects.toThrow(
        "NEXT_REDIRECT",
      );
    });
  });

  // ── resolveAlertAction ────────────────────────────────────────────────────

  describe("resolveAlertAction", () => {
    const VALID_ALERT_ID = "550e8400-e29b-41d4-a716-446655440000";

    it("calls requireRole with admin", async () => {
      await resolveAlertAction(VALID_ALERT_ID);
      expect(mockRequireRole).toHaveBeenCalledWith("admin", undefined);
    });

    it("resolves the alert and revalidates the admin path", async () => {
      const result = await resolveAlertAction(VALID_ALERT_ID);
      expect(mockResolveAlert).toHaveBeenCalledWith(
        VALID_ALERT_ID,
        "admin:admin@example.com",
      );
      expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard/admin");
      expect(result).toEqual({ success: true });
    });

    it("returns error for invalid UUID", async () => {
      const result = await resolveAlertAction("not-a-uuid");
      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid alert ID");
      expect(mockResolveAlert).not.toHaveBeenCalled();
    });

    it("returns error when resolveAlert throws", async () => {
      mockResolveAlert.mockRejectedValue(new Error("DB error"));
      const result = await resolveAlertAction(VALID_ALERT_ID);
      expect(result.success).toBe(false);
      expect(result.error).toBe("DB error");
    });

    it("throws when user is not admin", async () => {
      mockNonAdminAuth();
      await expect(resolveAlertAction(VALID_ALERT_ID)).rejects.toThrow(
        "NEXT_REDIRECT",
      );
    });
  });

  // ── resolveAllAlertsAction ──────────────────────────────────────────────────

  describe("resolveAllAlertsAction", () => {
    it("calls requireRole with admin", async () => {
      await resolveAllAlertsAction();
      expect(mockRequireRole).toHaveBeenCalledWith("admin", undefined);
    });

    it("resolves all active alerts and revalidates the admin path", async () => {
      const result = await resolveAllAlertsAction();
      expect(mockResolveAllAlerts).toHaveBeenCalledWith(
        "admin:admin@example.com",
      );
      expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard/admin");
      expect(result).toEqual({ success: true });
    });

    it("returns error when resolveAllAlerts throws", async () => {
      mockResolveAllAlerts.mockRejectedValue(new Error("DB error"));
      const result = await resolveAllAlertsAction();
      expect(result.success).toBe(false);
      expect(result.error).toBe("DB error");
    });

    it("throws when user is not admin", async () => {
      mockNonAdminAuth();
      await expect(resolveAllAlertsAction()).rejects.toThrow("NEXT_REDIRECT");
    });
  });

  // ── triggerEmergencyPurgeAction (Sprint 8) ──────────────────────────────────

  describe("triggerEmergencyPurgeAction", () => {
    it("calls requireRole with admin", async () => {
      await triggerEmergencyPurgeAction();
      expect(mockRequireRole).toHaveBeenCalledWith("admin", undefined);
    });

    it("sends purge/emergency-storage event and revalidates", async () => {
      const result = await triggerEmergencyPurgeAction();
      expect(mockSchedulerSend).toHaveBeenCalledTimes(1);
      const call = mockSchedulerSend.mock.calls[0] as [
        string,
        Record<string, unknown>,
        string?,
      ];
      expect(call[0]).toBe("purge/emergency-storage");
      expect(call[1].triggeredBy).toBe("admin-dashboard");
      expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard/admin");
      expect(result).toEqual({ success: true });
    });

    it("returns error when scheduler.send throws", async () => {
      mockSchedulerSend.mockRejectedValue(new Error("Scheduler unavailable"));
      const result = await triggerEmergencyPurgeAction();
      expect(result.success).toBe(false);
      expect(result.error).toBe("Scheduler unavailable");
    });

    it("returns error when scheduler.send throws", async () => {
      mockSchedulerSend.mockRejectedValue(new Error("Scheduler unavailable"));
      const result = await triggerEmergencyPurgeAction();
      expect(result.success).toBe(false);
      expect(result.error).toBe("Scheduler unavailable");
    });

    it("throws when user is not admin", async () => {
      mockNonAdminAuth();
      await expect(triggerEmergencyPurgeAction()).rejects.toThrow(
        "NEXT_REDIRECT",
      );
    });
  });
});
