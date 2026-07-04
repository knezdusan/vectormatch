/**
 * Unit tests for Alerting System (Sprint 4 Task 8)
 *
 * Tests:
 *   - createAlert: inserts a new alert
 *   - hasActiveAlert: checks for existing active alerts
 *   - resolveAlert / resolveAlertsByType: resolves alerts
 *   - getActiveAlerts / getRecentAlerts: queries alerts
 *   - checkStorageAlerts: creates/resolves storage alerts based on storage size
 *   - checkSchemaValidationAlerts: creates/resolves schema validation alerts
 *   - createCircuitBreakerAlert: creates circuit breaker trip alerts
 *
 * The DB layer is mocked — no real database connection.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the storage-check module
vi.mock("@/lib/jobs/storage-check", () => ({
  getDatabaseSizeMb: vi.fn().mockResolvedValue(200),
  getIngestionBacklog: vi.fn().mockResolvedValue(0),
  STORAGE_LIMIT_MB: 512,
  STORAGE_WARNING_THRESHOLD: 0.88,
  STORAGE_CRITICAL_THRESHOLD: 0.94,
  STORAGE_INGESTION_HALT_THRESHOLD: 0.88,
  STORAGE_EARLY_WARNING_THRESHOLD: 0.8,
  MAX_UNNORMALIZED_BACKLOG: 3000,
  UNNORMALIZED_BACKLOG_ALERT_THRESHOLD: 2500,
}));

// Mock the storage-alert emailer so tests never hit Resend
vi.mock("@/lib/jobs/storage-alert", () => ({
  sendStorageAlertEmail: vi.fn().mockResolvedValue(true),
}));

// Mock the db module
vi.mock("@/db/db", () => ({
  db: {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
    execute: vi.fn(),
  },
}));

import { db } from "@/db/db";
import {
  checkSchemaValidationAlerts,
  checkStorageAlerts,
  createAlert,
  createCircuitBreakerAlert,
  getActiveAlerts,
  hasActiveAlert,
  resolveAlert,
  resolveAlertsByType,
  resolveAllAlerts,
} from "@/lib/jobs/alerting";
import { sendStorageAlertEmail } from "@/lib/jobs/storage-alert";
import {
  getDatabaseSizeMb,
  getIngestionBacklog,
} from "@/lib/jobs/storage-check";

// ── Mock helpers ─────────────────────────────────────────────────────────────

function mockInsertReturning(rows: unknown[]): void {
  vi.mocked(db.insert).mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue(rows),
    }),
  } as never);
}

function mockSelectChain(rows: unknown[]): void {
  const chain = Object.assign(Promise.resolve(rows), {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
  });
  vi.mocked(db.select).mockReturnValue(chain as never);
}

function mockUpdateChain(rows: unknown[] = []): void {
  vi.mocked(db.update).mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(rows),
      }),
    }),
  } as never);
}

function mockExecuteReturn(rows: unknown[]): void {
  vi.mocked(db.execute).mockResolvedValue({
    rows,
    rowCount: rows.length,
  } as never);
}

// ── createAlert ──────────────────────────────────────────────────────────────

describe("createAlert", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates an alert with the given parameters", async () => {
    const alertRow = {
      id: "uuid-1",
      type: "storage_near_limit",
      severity: "warning",
      message: "Storage at 90%",
      details: null,
      sourceName: null,
      status: "active",
      createdAt: new Date(),
      resolvedAt: null,
      resolvedBy: null,
    };
    mockInsertReturning([alertRow]);
    const result = await createAlert({
      type: "storage_near_limit",
      severity: "warning",
      message: "Storage at 90%",
    });
    expect(result.id).toBe("uuid-1");
    expect(result.status).toBe("active");
  });
});

// ── hasActiveAlert ───────────────────────────────────────────────────────────

describe("hasActiveAlert", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns true when an active alert exists", async () => {
    mockSelectChain([{ id: "uuid-1" }]);
    const result = await hasActiveAlert("storage_near_limit");
    expect(result).toBe(true);
  });

  it("returns false when no active alert exists", async () => {
    mockSelectChain([]);
    const result = await hasActiveAlert("storage_near_limit");
    expect(result).toBe(false);
  });
});

// ── resolveAlert ─────────────────────────────────────────────────────────────

describe("resolveAlert", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates the alert status to resolved", async () => {
    mockUpdateChain();
    await resolveAlert("uuid-1", "admin-user-id");
    expect(db.update).toHaveBeenCalled();
  });
});

// ── resolveAlertsByType ──────────────────────────────────────────────────────

describe("resolveAlertsByType", () => {
  beforeEach(() => vi.clearAllMocks());

  it("resolves all active alerts of the given type and returns count", async () => {
    mockUpdateChain([{ id: "uuid-1" }, { id: "uuid-2" }]);
    const count = await resolveAlertsByType("storage_near_limit");
    expect(count).toBe(2);
  });
});

// ── resolveAllAlerts ─────────────────────────────────────────────────────────

describe("resolveAllAlerts", () => {
  beforeEach(() => vi.clearAllMocks());

  it("resolves every active alert regardless of type and returns count", async () => {
    mockUpdateChain([{ id: "uuid-1" }, { id: "uuid-2" }, { id: "uuid-3" }]);
    const count = await resolveAllAlerts("admin:test@example.com");
    expect(count).toBe(3);
  });
});

// ── getActiveAlerts ──────────────────────────────────────────────────────────

describe("getActiveAlerts", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns active alerts ordered by severity", async () => {
    const rows = [
      {
        id: "uuid-1",
        type: "storage_critical",
        severity: "critical",
        message: "Storage critical",
        status: "active",
      },
    ];
    mockSelectChain(rows);
    const result = await getActiveAlerts();
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe("critical");
  });
});

// ── checkStorageAlerts ───────────────────────────────────────────────────────

describe("checkStorageAlerts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getIngestionBacklog).mockResolvedValue(0);
  });

  it("creates a critical alert when storage exceeds ingestion halt threshold", async () => {
    vi.mocked(getDatabaseSizeMb).mockResolvedValue(460); // 460/512 = 89.8%
    // hasActiveAlert returns false (no existing alert)
    mockSelectChain([]);
    mockInsertReturning([{ id: "uuid-1", status: "active" }]);

    await checkStorageAlerts();

    expect(db.insert).toHaveBeenCalled();
    expect(sendStorageAlertEmail).toHaveBeenCalled();
  });

  it("creates a warning alert when storage exceeds early warning threshold", async () => {
    vi.mocked(getDatabaseSizeMb).mockResolvedValue(410); // 410/512 = 80.1%
    mockSelectChain([]);
    mockInsertReturning([{ id: "uuid-2", status: "active" }]);

    await checkStorageAlerts();

    expect(db.insert).toHaveBeenCalled();
    expect(sendStorageAlertEmail).toHaveBeenCalled();
  });

  it("creates a critical alert when the unnormalized backlog exceeds the limit", async () => {
    vi.mocked(getDatabaseSizeMb).mockResolvedValue(200);
    vi.mocked(getIngestionBacklog).mockResolvedValue(3001);
    mockSelectChain([]);
    mockInsertReturning([{ id: "uuid-3", status: "active" }]);

    await checkStorageAlerts();

    expect(db.insert).toHaveBeenCalled();
    expect(sendStorageAlertEmail).toHaveBeenCalled();
  });

  it("creates a warning alert when the unnormalized backlog is near the limit", async () => {
    vi.mocked(getDatabaseSizeMb).mockResolvedValue(200);
    vi.mocked(getIngestionBacklog).mockResolvedValue(2500);
    mockSelectChain([]);
    mockInsertReturning([{ id: "uuid-4", status: "active" }]);

    await checkStorageAlerts();

    expect(db.insert).toHaveBeenCalled();
    expect(sendStorageAlertEmail).toHaveBeenCalled();
  });

  it("resolves storage alerts when storage and backlog are healthy", async () => {
    vi.mocked(getDatabaseSizeMb).mockResolvedValue(200); // 200/512 = 39%
    mockUpdateChain([{ id: "uuid-1" }]);

    await checkStorageAlerts();

    expect(db.update).toHaveBeenCalled();
    // Should NOT insert any new alerts
    expect(db.insert).not.toHaveBeenCalled();
    expect(sendStorageAlertEmail).not.toHaveBeenCalled();
  });

  it("does not create duplicate alerts when one already exists", async () => {
    vi.mocked(getDatabaseSizeMb).mockResolvedValue(460); // critical
    // hasActiveAlert returns true (existing alert)
    mockSelectChain([{ id: "existing-alert" }]);

    await checkStorageAlerts();

    expect(db.insert).not.toHaveBeenCalled();
    // Email should still not be sent for deduplicated alerts
    expect(sendStorageAlertEmail).not.toHaveBeenCalled();
  });
});

// ── checkSchemaValidationAlerts ──────────────────────────────────────────────

describe("checkSchemaValidationAlerts", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates an alert when validation failure rate exceeds threshold", async () => {
    // 10 total, 3 failures = 30% > 20% threshold
    mockExecuteReturn([{ total: 10, validation_failures: 3 }]);
    // hasActiveAlert returns false
    mockSelectChain([]);
    mockInsertReturning([{ id: "uuid-1", status: "active" }]);

    await checkSchemaValidationAlerts(0.2, 60);

    expect(db.insert).toHaveBeenCalled();
  });

  it("does not create alert when failure rate is below threshold", async () => {
    // 10 total, 1 failure = 10% < 20% threshold
    mockExecuteReturn([{ total: 10, validation_failures: 1 }]);
    mockUpdateChain([]);

    await checkSchemaValidationAlerts(0.2, 60);

    expect(db.insert).not.toHaveBeenCalled();
  });

  it("does not create alert when total polls < 5 (small sample)", async () => {
    mockExecuteReturn([{ total: 3, validation_failures: 3 }]);

    await checkSchemaValidationAlerts(0.2, 60);

    expect(db.insert).not.toHaveBeenCalled();
  });

  it("resolves existing alert when failure rate returns to normal", async () => {
    mockExecuteReturn([{ total: 10, validation_failures: 0 }]);
    mockUpdateChain([{ id: "uuid-1" }]);

    await checkSchemaValidationAlerts(0.2, 60);

    expect(db.update).toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });
});

// ── createCircuitBreakerAlert ────────────────────────────────────────────────

describe("createCircuitBreakerAlert", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a critical alert for the source", async () => {
    mockSelectChain([]); // no existing alert
    mockInsertReturning([{ id: "uuid-1", status: "active" }]);

    await createCircuitBreakerAlert("batch-source-crt-sh", 5, "timeout");

    expect(db.insert).toHaveBeenCalled();
  });

  it("does not create duplicate alert for the same source", async () => {
    mockSelectChain([{ id: "existing-alert" }]); // existing alert

    await createCircuitBreakerAlert("batch-source-crt-sh", 5, "timeout");

    expect(db.insert).not.toHaveBeenCalled();
  });
});
