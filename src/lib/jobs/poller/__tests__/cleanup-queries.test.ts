/**
 * Unit tests for G8 — Aggressive Job Cleanup + Retention Policies
 * (CORPUS_EXPANSION_HANDOFF.md Sprint 3 Task 1)
 *
 * Each cleanup function executes a raw DELETE via drizzle's `sql` template tag.
 * We mock `db.execute` and inspect the SQL object's `queryChunks` to verify
 * each query targets the correct table, status, and retention window — without
 * touching a real database (per AGENTS.md "Database Mutation in Tests" rules).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the db module — only `execute` is used by cleanup-queries.ts
vi.mock("@/db/db", () => ({
  db: {
    execute: vi.fn(),
  },
}));

import {
  deleteExhaustedSluggerRetries,
  deleteGoneJobs,
  deleteNormalizationFailedJobs,
  deleteOldIngestionLogs,
  deleteOldTerminalMatches,
  deleteRejectedJobs,
  vacuumAnalyze,
} from "@/lib/jobs/poller/cleanup-queries";

/**
 * Extract the full SQL text from a drizzle `sql` template tag result.
 * Drizzle stores the template literal chunks in `queryChunks`, where each
 * chunk is a `StringChunk` with a `.value` array of strings.
 */
function getSqlText(sqlObj: unknown): string {
  if (sqlObj === null || typeof sqlObj !== "object") return String(sqlObj);
  const obj = sqlObj as Record<string, unknown>;
  const chunks = obj.queryChunks;
  if (Array.isArray(chunks)) {
    return chunks
      .map((chunk) => {
        if (chunk && typeof chunk === "object" && "value" in chunk) {
          const val = (chunk as { value: unknown }).value;
          return Array.isArray(val) ? val.join("") : String(val);
        }
        return String(chunk);
      })
      .join("");
  }
  return String(sqlObj);
}

describe("G8 — Aggressive Job Cleanup + Retention Policies", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Step 1a — Rejected jobs ───────────────────────────────────────────────
  describe("deleteRejectedJobs", () => {
    it("issues a DELETE against rejected jobs older than 1 day", async () => {
      const { db } = await import("@/db/db");
      const executeMock = db.execute as unknown as ReturnType<typeof vi.fn>;
      executeMock.mockResolvedValueOnce({ rowCount: 42 });

      const result = await deleteRejectedJobs();

      expect(executeMock).toHaveBeenCalledTimes(1);
      const sqlText = getSqlText(executeMock.mock.calls[0][0]);
      expect(sqlText).toContain("DELETE FROM job");
      expect(sqlText).toContain("'rejected'");
      expect(sqlText).toContain("normalized_at");
      expect(sqlText).toContain("1 day");
      expect(result).toEqual({ deletedCount: 42 });
    });

    it("returns 0 when no rows are deleted", async () => {
      const { db } = await import("@/db/db");
      const executeMock = db.execute as unknown as ReturnType<typeof vi.fn>;
      executeMock.mockResolvedValueOnce({ rowCount: 0 });

      const result = await deleteRejectedJobs();
      expect(result).toEqual({ deletedCount: 0 });
    });

    it("returns 0 when rowCount is null/undefined (driver edge case)", async () => {
      const { db } = await import("@/db/db");
      const executeMock = db.execute as unknown as ReturnType<typeof vi.fn>;
      executeMock.mockResolvedValueOnce({ rowCount: null });

      expect((await deleteRejectedJobs()).deletedCount).toBe(0);

      executeMock.mockResolvedValueOnce({});
      expect((await deleteRejectedJobs()).deletedCount).toBe(0);
    });
  });

  // ── Step 1b — Gone jobs ───────────────────────────────────────────────────
  describe("deleteGoneJobs", () => {
    it("issues a DELETE against gone jobs older than 7 days using last_seen_at", async () => {
      const { db } = await import("@/db/db");
      const executeMock = db.execute as unknown as ReturnType<typeof vi.fn>;
      executeMock.mockResolvedValueOnce({ rowCount: 17 });

      const result = await deleteGoneJobs();

      expect(executeMock).toHaveBeenCalledTimes(1);
      const sqlText = getSqlText(executeMock.mock.calls[0][0]);
      expect(sqlText).toContain("DELETE FROM job");
      expect(sqlText).toContain("'gone'");
      expect(sqlText).toContain("last_seen_at");
      expect(sqlText).toContain("7 days");
      expect(result).toEqual({ deletedCount: 17 });
    });

    it("returns 0 when nothing is deleted", async () => {
      const { db } = await import("@/db/db");
      const executeMock = db.execute as unknown as ReturnType<typeof vi.fn>;
      executeMock.mockResolvedValueOnce({ rowCount: 0 });
      expect((await deleteGoneJobs()).deletedCount).toBe(0);
    });
  });

  // ── Step 1c — Normalization-failed jobs ───────────────────────────────────
  describe("deleteNormalizationFailedJobs", () => {
    it("issues a DELETE against normalization_failed jobs older than 7 days using normalized_at", async () => {
      const { db } = await import("@/db/db");
      const executeMock = db.execute as unknown as ReturnType<typeof vi.fn>;
      executeMock.mockResolvedValueOnce({ rowCount: 3 });

      const result = await deleteNormalizationFailedJobs();

      expect(executeMock).toHaveBeenCalledTimes(1);
      const sqlText = getSqlText(executeMock.mock.calls[0][0]);
      expect(sqlText).toContain("DELETE FROM job");
      expect(sqlText).toContain("'normalization_failed'");
      expect(sqlText).toContain("normalized_at");
      expect(sqlText).toContain("7 days");
      expect(result).toEqual({ deletedCount: 3 });
    });
  });

  // ── Step 2 — Old terminal matches ─────────────────────────────────────────
  describe("deleteOldTerminalMatches", () => {
    it("issues a DELETE against approved/rejected matches older than 90 days", async () => {
      const { db } = await import("@/db/db");
      const executeMock = db.execute as unknown as ReturnType<typeof vi.fn>;
      executeMock.mockResolvedValueOnce({ rowCount: 250 });

      const result = await deleteOldTerminalMatches();

      expect(executeMock).toHaveBeenCalledTimes(1);
      const sqlText = getSqlText(executeMock.mock.calls[0][0]);
      expect(sqlText).toContain("DELETE FROM match_queue");
      expect(sqlText).toContain("'approved'");
      expect(sqlText).toContain("'rejected'");
      expect(sqlText).toContain("created_at");
      expect(sqlText).toContain("90 days");
      expect(result).toEqual({ deletedCount: 250 });
    });

    it("handles a large batch delete", async () => {
      const { db } = await import("@/db/db");
      const executeMock = db.execute as unknown as ReturnType<typeof vi.fn>;
      executeMock.mockResolvedValueOnce({ rowCount: 100000 });
      expect((await deleteOldTerminalMatches()).deletedCount).toBe(100000);
    });
  });

  // ── Step 3 — Old ingestion logs ───────────────────────────────────────────
  describe("deleteOldIngestionLogs", () => {
    it("issues a DELETE against ingestion_log entries older than 30 days", async () => {
      const { db } = await import("@/db/db");
      const executeMock = db.execute as unknown as ReturnType<typeof vi.fn>;
      executeMock.mockResolvedValueOnce({ rowCount: 1200 });

      const result = await deleteOldIngestionLogs();

      expect(executeMock).toHaveBeenCalledTimes(1);
      const sqlText = getSqlText(executeMock.mock.calls[0][0]);
      expect(sqlText).toContain("DELETE FROM ingestion_log");
      expect(sqlText).toContain("created_at");
      expect(sqlText).toContain("30 days");
      expect(result).toEqual({ deletedCount: 1200 });
    });
  });

  // ── Step 4 — Exhausted slugger retries ────────────────────────────────────
  describe("deleteExhaustedSluggerRetries", () => {
    it("issues a DELETE against slugger_retry rows past retry + 30 days with retry_count >= 3", async () => {
      const { db } = await import("@/db/db");
      const executeMock = db.execute as unknown as ReturnType<typeof vi.fn>;
      executeMock.mockResolvedValueOnce({ rowCount: 8 });

      const result = await deleteExhaustedSluggerRetries();

      expect(executeMock).toHaveBeenCalledTimes(1);
      const sqlText = getSqlText(executeMock.mock.calls[0][0]);
      expect(sqlText).toContain("DELETE FROM slugger_retry");
      expect(sqlText).toContain("next_retry_at");
      expect(sqlText).toContain("30 days");
      expect(sqlText).toContain("retry_count");
      expect(sqlText).toContain("3");
      expect(result).toEqual({ deletedCount: 8 });
    });
  });

  // ── Weekly VACUUM ANALYZE ─────────────────────────────────────────────────
  describe("vacuumAnalyze", () => {
    it("issues VACUUM ANALYZE (no exclusive lock) and returns deletedCount 0", async () => {
      const { db } = await import("@/db/db");
      const executeMock = db.execute as unknown as ReturnType<typeof vi.fn>;
      executeMock.mockResolvedValueOnce({});

      const result = await vacuumAnalyze();

      expect(executeMock).toHaveBeenCalledTimes(1);
      const sqlText = getSqlText(executeMock.mock.calls[0][0]);
      expect(sqlText).toContain("VACUUM ANALYZE");
      // Must NOT use VACUUM FULL (exclusive lock) in the weekly job
      expect(sqlText).not.toContain("VACUUM FULL");
      expect(result).toEqual({ deletedCount: 0 });
    });
  });
});
