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

// Mock storage-check to avoid circular import and provide test constants
vi.mock("@/lib/jobs/storage-check", () => ({
  STORAGE_LIMIT_MB: 460,
}));

import { db } from "@/db/db";
import {
  deleteExhaustedSluggerRetries,
  deleteGoneJobs,
  deleteNormalizationFailedJobs,
  deleteOldIngestionLogs,
  deleteOldTerminalMatches,
  deleteRejectedJobs,
  purgeActiveFifo,
  purgeGone,
  purgeNormalizationFailed,
  purgeRejected,
  purgeStale,
  runEmergencyPurge,
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
    it("issues a DELETE against normalization_failed jobs older than 7 days using detected_at (bugfix)", async () => {
      const { db } = await import("@/db/db");
      const executeMock = db.execute as unknown as ReturnType<typeof vi.fn>;
      executeMock.mockResolvedValueOnce({ rowCount: 3 });

      const result = await deleteNormalizationFailedJobs();

      expect(executeMock).toHaveBeenCalledTimes(1);
      const sqlText = getSqlText(executeMock.mock.calls[0][0]);
      expect(sqlText).toContain("DELETE FROM job");
      expect(sqlText).toContain("'normalization_failed'");
      // Sprint 8 bugfix: uses detected_at, NOT normalized_at (which is never
      // set on normalization_failed jobs per the schema contract).
      expect(sqlText).toContain("detected_at");
      expect(sqlText).not.toContain("normalized_at");
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

  // ── Sprint 8: Emergency Storage Purge ─────────────────────────────────────
  describe("Emergency Storage Purge — Tiered Functions", () => {
    beforeEach(() => {
      // Use mockReset (not clearAllMocks) to clear the mockResolvedValueOnce
      // queue left over from the first runEmergencyPurge test. clearAllMocks
      // only clears call history, not the one-time return value queue.
      (db.execute as unknown as ReturnType<typeof vi.fn>).mockReset();
    });

    describe("purgeNormalizationFailed", () => {
      it("deletes normalization_failed jobs ordered by detected_at with LIMIT", async () => {
        const { db } = await import("@/db/db");
        const executeMock = db.execute as unknown as ReturnType<typeof vi.fn>;
        executeMock.mockResolvedValueOnce({ rowCount: 500 });

        const result = await purgeNormalizationFailed(1000);

        const sqlText = getSqlText(executeMock.mock.calls[0][0]);
        expect(sqlText).toContain("DELETE FROM job");
        expect(sqlText).toContain("'normalization_failed'");
        expect(sqlText).toContain("ORDER BY detected_at ASC");
        expect(sqlText).toContain("LIMIT");
        expect(result.deletedCount).toBe(500);
        expect(result.hadRows).toBe(true);
        expect(result.tier).toBe("normalization_failed");
      });

      it("reports hadRows=false when no rows match", async () => {
        const { db } = await import("@/db/db");
        const executeMock = db.execute as unknown as ReturnType<typeof vi.fn>;
        executeMock.mockResolvedValueOnce({ rowCount: 0 });

        const result = await purgeNormalizationFailed();
        expect(result.hadRows).toBe(false);
        expect(result.deletedCount).toBe(0);
      });
    });

    describe("purgeRejected", () => {
      it("deletes rejected jobs ordered by normalized_at with LIMIT", async () => {
        const { db } = await import("@/db/db");
        const executeMock = db.execute as unknown as ReturnType<typeof vi.fn>;
        executeMock.mockResolvedValueOnce({ rowCount: 200 });

        const result = await purgeRejected(500);

        const sqlText = getSqlText(executeMock.mock.calls[0][0]);
        expect(sqlText).toContain("'rejected'");
        expect(sqlText).toContain("ORDER BY normalized_at ASC NULLS LAST");
        expect(sqlText).toContain("LIMIT");
        expect(result.deletedCount).toBe(200);
        expect(result.tier).toBe("rejected");
      });
    });

    describe("purgeGone", () => {
      it("deletes gone jobs ordered by last_seen_at with LIMIT", async () => {
        const { db } = await import("@/db/db");
        const executeMock = db.execute as unknown as ReturnType<typeof vi.fn>;
        executeMock.mockResolvedValueOnce({ rowCount: 300 });

        const result = await purgeGone();

        const sqlText = getSqlText(executeMock.mock.calls[0][0]);
        expect(sqlText).toContain("'gone'");
        expect(sqlText).toContain("ORDER BY last_seen_at ASC");
        expect(result.deletedCount).toBe(300);
        expect(result.tier).toBe("gone");
      });
    });

    describe("purgeStale", () => {
      it("deletes stale jobs ordered by last_seen_at with LIMIT", async () => {
        const { db } = await import("@/db/db");
        const executeMock = db.execute as unknown as ReturnType<typeof vi.fn>;
        executeMock.mockResolvedValueOnce({ rowCount: 150 });

        const result = await purgeStale();

        const sqlText = getSqlText(executeMock.mock.calls[0][0]);
        expect(sqlText).toContain("'stale'");
        expect(sqlText).toContain("ORDER BY last_seen_at ASC");
        expect(result.deletedCount).toBe(150);
        expect(result.tier).toBe("stale");
      });
    });

    describe("purgeActiveFifo", () => {
      it("deletes active jobs by FIFO excluding approved matches", async () => {
        const { db } = await import("@/db/db");
        const executeMock = db.execute as unknown as ReturnType<typeof vi.fn>;
        executeMock.mockResolvedValueOnce({ rowCount: 50 });

        const result = await purgeActiveFifo(100);

        const sqlText = getSqlText(executeMock.mock.calls[0][0]);
        expect(sqlText).toContain("'active'");
        expect(sqlText).toContain("ORDER BY j.detected_at ASC");
        // Must exclude jobs with approved matches
        expect(sqlText).toContain("match_queue");
        expect(sqlText).toContain("'approved'");
        expect(sqlText).toContain("LIMIT");
        expect(result.deletedCount).toBe(50);
        expect(result.tier).toBe("active_fifo");
      });
    });

    describe("runEmergencyPurge", () => {
      it("runs tiers in order and stops when storage recovers (per-batch VACUUM)", async () => {
        const { db } = await import("@/db/db");
        const executeMock = db.execute as unknown as ReturnType<typeof vi.fn>;

        // STORAGE_LIMIT_MB is 460. Recovery threshold is 75% = 345MB.
        // Storage starts at 420MB (91%), drops to 340MB (74%) after batch 1 + VACUUM.
        // With per-batch VACUUM, the recovery check fires at the TOP of the next
        // iteration — no need to wait for the tier to end.
        let storageCalls = 0;
        const storageCheckMb = async () => {
          storageCalls++;
          // Call 1 (initial): 420MB
          // Call 2 (first loop check, before batch 1): 420MB
          // Call 3 (second loop check, after batch 1 + VACUUM): 340MB (recovered)
          if (storageCalls <= 2) return 420;
          return 340;
        };

        // Tier 1 batch 1: deletes 1000, then VACUUM runs (per-batch),
        // then recovery check at top of next iteration fires (340MB < 345MB).
        executeMock
          .mockResolvedValueOnce({ rowCount: 1000 }) // purgeNormalizationFailed batch 1
          .mockResolvedValueOnce({}); // VACUUM ANALYZE job (per-batch)

        const result = await runEmergencyPurge(storageCheckMb);

        expect(result.totalDeleted).toBe(1000);
        expect(result.recovered).toBe(true);
        expect(result.tiers[0].tier).toBe("normalization_failed");
        expect(result.tiers[0].deletedCount).toBe(1000);
        // Should not have reached tier 2 (rejected)
        expect(result.tiers.length).toBe(1);
        expect(result.stopReason).toContain("recovered");
        expect(result.walInflationDetected).toBe(false);
        // 4 storage checks: initial + first loop check + post-VACUUM check + final
        expect(storageCalls).toBe(4);
      });

      it("recovers within a tier thanks to per-batch VACUUM (the active_fifo bug)", async () => {
        const { db } = await import("@/db/db");
        const executeMock = db.execute as unknown as ReturnType<typeof vi.fn>;

        // Simulates the production bug: active_fifo tier deletes 3000 jobs in
        // 6 batches of 500. Without per-batch VACUUM, pg_database_size() doesn't
        // reflect the reclaimed space and the recovery check never fires.
        // With per-batch VACUUM, recovery is detected after batch 3.
        let storageCalls = 0;
        const storageCheckMb = async () => {
          storageCalls++;
          // Calls 1-6: 420MB (initial + 4 empty tiers' checks + active_fifo first check)
          // Call 7: 380MB (after active_fifo batch 1 + VACUUM)
          // Call 8: 340MB (after active_fifo batch 2 + VACUUM, recovered)
          if (storageCalls <= 6) return 420;
          if (storageCalls === 7) return 380;
          return 340;
        };

        // Tiers 1-4 are empty (no rows to delete), tier 5 (active_fifo) has rows.
        // Use mockImplementation to handle VACUUM + purge calls generically.
        let activeFifoCalls = 0;
        executeMock.mockImplementation(async (sqlObj: unknown) => {
          const sqlText = getSqlText(sqlObj);
          if (sqlText.includes("VACUUM")) return {};
          if (sqlText.includes("'normalization_failed'"))
            return { rowCount: 0 };
          if (sqlText.includes("'rejected'")) return { rowCount: 0 };
          if (sqlText.includes("'gone'")) return { rowCount: 0 };
          if (sqlText.includes("'stale'")) return { rowCount: 0 };
          if (sqlText.includes("'active'")) {
            activeFifoCalls++;
            // First 2 batches delete 500 each, 3rd check fires recovery
            return { rowCount: activeFifoCalls <= 2 ? 500 : 0 };
          }
          return { rowCount: 0 };
        });

        const result = await runEmergencyPurge(storageCheckMb);

        expect(result.recovered).toBe(true);
        expect(result.totalDeleted).toBe(1000); // 2 batches × 500
        expect(result.tiers[4].tier).toBe("active_fifo");
        expect(result.tiers[4].deletedCount).toBe(1000);
        expect(result.stopReason).toContain("recovered");
        expect(result.walInflationDetected).toBe(false);
      });

      it("exhausts all tiers when storage does not recover", async () => {
        const { db } = await import("@/db/db");
        const executeMock = db.execute as unknown as ReturnType<typeof vi.fn>;

        // Storage stays at 420MB (91%) — never recovers
        const storageCheckMb = async () => 420;

        // Use mockImplementation with SQL inspection to distinguish purge
        // calls from VACUUM calls. This avoids mock queue ordering issues.
        const purgeResults: Record<string, number[]> = {
          normalization_failed: [100, 0],
          rejected: [50, 0],
          gone: [200, 0],
          stale: [300, 0],
          active_fifo: [500, 0],
        };
        const tierCallCounts: Record<string, number> = {};

        executeMock.mockImplementation(async (sqlObj: unknown) => {
          const sqlText = getSqlText(sqlObj);
          if (sqlText.includes("VACUUM")) {
            return {};
          }
          // Match tier by status string in the SQL
          if (sqlText.includes("'normalization_failed'")) {
            const i = tierCallCounts.normalization_failed ?? 0;
            tierCallCounts.normalization_failed = i + 1;
            return { rowCount: purgeResults.normalization_failed[i] ?? 0 };
          }
          if (sqlText.includes("'rejected'")) {
            const i = tierCallCounts.rejected ?? 0;
            tierCallCounts.rejected = i + 1;
            return { rowCount: purgeResults.rejected[i] ?? 0 };
          }
          if (sqlText.includes("'gone'")) {
            const i = tierCallCounts.gone ?? 0;
            tierCallCounts.gone = i + 1;
            return { rowCount: purgeResults.gone[i] ?? 0 };
          }
          if (sqlText.includes("'stale'")) {
            const i = tierCallCounts.stale ?? 0;
            tierCallCounts.stale = i + 1;
            return { rowCount: purgeResults.stale[i] ?? 0 };
          }
          if (sqlText.includes("'active'")) {
            const i = tierCallCounts.active_fifo ?? 0;
            tierCallCounts.active_fifo = i + 1;
            return { rowCount: purgeResults.active_fifo[i] ?? 0 };
          }
          return { rowCount: 0 };
        });

        const result = await runEmergencyPurge(storageCheckMb);

        expect(result.totalDeleted).toBe(100 + 50 + 200 + 300 + 500);
        expect(result.recovered).toBe(false);
        expect(result.tiers.length).toBe(5);
        expect(result.stopReason).toBe("all tiers exhausted");
      });

      it("aborts when WAL inflation is detected (storage increasing)", async () => {
        const { db } = await import("@/db/db");
        const executeMock = db.execute as unknown as ReturnType<typeof vi.fn>;

        // Simulate WAL inflation: storage starts at 420MB but INCREASES
        // after each batch (DELETE generates more WAL than it reclaims).
        // PURGE_MAX_WAL_INFLATION_BATCHES = 2, so after 2 consecutive
        // increases the purge should abort.
        let storageCalls = 0;
        const storageCheckMb = async () => {
          storageCalls++;
          // 420 → 425 → 430 → 435 (3 increases → abort on 2nd)
          return 420 + (storageCalls - 1) * 5;
        };

        // Every batch deletes rows (but storage keeps increasing)
        executeMock.mockImplementation(async () => ({ rowCount: 100 }));

        const result = await runEmergencyPurge(storageCheckMb);

        expect(result.recovered).toBe(false);
        expect(result.walInflationDetected).toBe(true);
        expect(result.stopReason).toContain("WAL inflation detected");
        expect(result.stopReason).toContain("425MB → 430MB");
        // Should have deleted some rows before aborting
        expect(result.totalDeleted).toBeGreaterThan(0);
      });
    });
  });
});
