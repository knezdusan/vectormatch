/**
 * Unit tests for Source Health Tracking + Circuit Breakers
 * (CORPUS_EXPANSION_HANDOFF.md Sprint 3 Task 4)
 *
 * Mocks the DB layer (`@/db/db`) so no real database is touched, per
 * AGENTS.md "Database Mutation in Tests" rules.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the db module. `select().from().where()` chains return a Promise of an
// array; `update().set().where()` returns a Promise of a result object.
// We share a single chain instance per operation type so that nested calls
// (e.g. isSourceEnabled → getSourceHealth → db.select()) use the same chain.
const selectChain = {
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockResolvedValue([]),
};
const updateChain = {
  set: vi.fn().mockReturnThis(),
  where: vi.fn().mockResolvedValue({ rowCount: 1 }),
};

vi.mock("@/db/db", () => ({
  db: {
    select: vi.fn(() => selectChain),
    update: vi.fn(() => updateChain),
  },
}));

import { db } from "@/db/db";
import {
  disableSource,
  enableSource,
  getSourceHealth,
  isSourceEnabled,
  recordSourceFailure,
  recordSourceSuccess,
} from "@/lib/jobs/source-health";

/** Helper: make the next select().where() resolve to a single row (or empty). */
function setHealthRow(row: Record<string, unknown> | null) {
  selectChain.where.mockResolvedValueOnce(row ? [row] : []);
}

/** Helper: get the set() args from the most recent db.update() call. */
function lastUpdateSetArgs(): Record<string, unknown> {
  return updateChain.set.mock.calls[0]?.[0] ?? {};
}

describe("Source Health — Circuit Breakers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── getSourceHealth ───────────────────────────────────────────────────────
  describe("getSourceHealth", () => {
    it("returns the health row when it exists", async () => {
      setHealthRow({
        sourceName: "daily-source-hn-algolia",
        status: "active",
        consecutiveFailures: 0,
        lastSuccessAt: new Date("2026-06-30"),
        lastFailureAt: null,
        lastError: null,
        totalRuns: 10,
        totalFailures: 0,
        disabledAt: null,
        disabledReason: null,
      });

      const health = await getSourceHealth("daily-source-hn-algolia");
      expect(health).not.toBeNull();
      expect(health?.sourceName).toBe("daily-source-hn-algolia");
      expect(health?.status).toBe("active");
    });

    it("returns null when the source has never been tracked", async () => {
      setHealthRow(null);
      const health = await getSourceHealth("unknown-source");
      expect(health).toBeNull();
    });
  });

  // ── isSourceEnabled ───────────────────────────────────────────────────────
  describe("isSourceEnabled", () => {
    async function checkWith(
      row: Record<string, unknown> | null,
    ): Promise<boolean> {
      setHealthRow(row);
      return isSourceEnabled("s");
    }

    it("returns true for a missing row (first run)", async () => {
      expect(await checkWith(null)).toBe(true);
    });

    it("returns true for an active source", async () => {
      expect(
        await checkWith({ status: "active", consecutiveFailures: 0 }),
      ).toBe(true);
    });

    it("returns true for a degraded source (soft signal, still runs)", async () => {
      expect(
        await checkWith({ status: "degraded", consecutiveFailures: 3 }),
      ).toBe(true);
    });

    it("returns false for a manually disabled source", async () => {
      expect(
        await checkWith({ status: "disabled", consecutiveFailures: 0 }),
      ).toBe(false);
    });

    it("returns false when consecutiveFailures >= 5 (hard circuit breaker)", async () => {
      expect(
        await checkWith({ status: "degraded", consecutiveFailures: 5 }),
      ).toBe(false);
    });

    it("returns false when consecutiveFailures is well above the threshold", async () => {
      expect(
        await checkWith({ status: "degraded", consecutiveFailures: 99 }),
      ).toBe(false);
    });

    it("returns true at exactly 4 failures (one below the hard breaker)", async () => {
      expect(
        await checkWith({ status: "degraded", consecutiveFailures: 4 }),
      ).toBe(true);
    });
  });

  // ── recordSourceSuccess ───────────────────────────────────────────────────
  describe("recordSourceSuccess", () => {
    it("issues an UPDATE that resets consecutiveFailures and sets lastSuccessAt", async () => {
      await recordSourceSuccess("daily-source-hn-algolia");
      expect(db.update).toHaveBeenCalledTimes(1);
      const setArg = lastUpdateSetArgs();
      expect(setArg.consecutiveFailures).toBe(0);
      expect(setArg.lastSuccessAt).toBeInstanceOf(Date);
      // totalRuns is a SQL expression — just verify it's present
      expect(setArg.totalRuns).toBeDefined();
    });

    it("uses a CASE expression for status (manual disable is sticky)", async () => {
      await recordSourceSuccess("s");
      const setArg = lastUpdateSetArgs();
      // status is a SQL CASE expression — not a plain string
      expect(typeof setArg.status).not.toBe("string");
      expect(setArg.status).toBeDefined();
    });
  });

  // ── recordSourceFailure ───────────────────────────────────────────────────
  describe("recordSourceFailure", () => {
    it("issues an UPDATE that increments counters and records the error", async () => {
      await recordSourceFailure("s", "ECONNREFUSED");
      expect(db.update).toHaveBeenCalledTimes(1);
      const setArg = lastUpdateSetArgs();
      expect(setArg.lastError).toBe("ECONNREFUSED");
      expect(setArg.lastFailureAt).toBeInstanceOf(Date);
      // consecutiveFailures, totalFailures, totalRuns are SQL expressions
      expect(setArg.consecutiveFailures).toBeDefined();
      expect(setArg.totalFailures).toBeDefined();
      expect(setArg.totalRuns).toBeDefined();
    });

    it("uses a CASE expression for status (flips to degraded at threshold)", async () => {
      await recordSourceFailure("s", "err");
      const setArg = lastUpdateSetArgs();
      expect(typeof setArg.status).not.toBe("string");
      expect(setArg.status).toBeDefined();
    });
  });

  // ── disableSource ─────────────────────────────────────────────────────────
  describe("disableSource", () => {
    it("sets status to 'disabled' with reason and timestamp", async () => {
      await disableSource("s", "manual kill — schema drift");
      const setArg = lastUpdateSetArgs();
      expect(setArg.status).toBe("disabled");
      expect(setArg.disabledReason).toBe("manual kill — schema drift");
      expect(setArg.disabledAt).toBeInstanceOf(Date);
    });
  });

  // ── enableSource ──────────────────────────────────────────────────────────
  describe("enableSource", () => {
    it("resets to 'active', clears consecutiveFailures and disable metadata", async () => {
      await enableSource("s");
      const setArg = lastUpdateSetArgs();
      expect(setArg.status).toBe("active");
      expect(setArg.consecutiveFailures).toBe(0);
      expect(setArg.disabledAt).toBeNull();
      expect(setArg.disabledReason).toBeNull();
    });
  });
});
