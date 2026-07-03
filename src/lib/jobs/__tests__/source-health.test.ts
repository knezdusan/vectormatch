/**
 * Unit tests for Source Health Tracking + Circuit Breakers
 * (CORPUS_EXPANSION_HANDOFF.md Sprint 3 Task 4)
 *
 * Mocks the DB layer (`@/db/db`) so no real database is touched, per
 * AGENTS.md "Database Mutation in Tests" rules.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the db module. `select().from().where()` chains return a Promise of an
// array; `update().set().where()` returns a Promise of a result object;
// `insert().values().onConflictDoUpdate()` returns a Promise of a result object.
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
const insertChain = {
  values: vi.fn().mockReturnThis(),
  onConflictDoUpdate: vi.fn().mockResolvedValue({ rowCount: 1 }),
};

vi.mock("@/db/db", () => ({
  db: {
    select: vi.fn(() => selectChain),
    update: vi.fn(() => updateChain),
    insert: vi.fn(() => insertChain),
  },
}));

import { db } from "@/db/db";
import {
  disableSource,
  enableSource,
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

/** Helper: get the values() args from the most recent db.insert() call. */
function lastInsertValuesArgs(): Record<string, unknown> {
  return insertChain.values.mock.calls[0]?.[0] ?? {};
}

/** Helper: get the onConflictDoUpdate() args from the most recent db.insert() call. */
function lastUpsertArgs(): { target: unknown; set: Record<string, unknown> } {
  return (
    insertChain.onConflictDoUpdate.mock.calls[0]?.[0] ?? {
      target: null,
      set: {},
    }
  );
}

describe("Source Health — Circuit Breakers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    it("uses UPSERT (insert + onConflictDoUpdate) to handle first run", async () => {
      await recordSourceSuccess("daily-source-hn-algolia");
      expect(db.insert).toHaveBeenCalledTimes(1);
      expect(insertChain.onConflictDoUpdate).toHaveBeenCalledTimes(1);
    });

    it("inserts correct initial values for first run", async () => {
      await recordSourceSuccess("new-source");
      const valuesArg = lastInsertValuesArgs();
      expect(valuesArg.sourceName).toBe("new-source");
      expect(valuesArg.status).toBe("active");
      expect(valuesArg.consecutiveFailures).toBe(0);
      expect(valuesArg.lastSuccessAt).toBeInstanceOf(Date);
      expect(valuesArg.totalRuns).toBe(1);
    });

    it("onConflict set resets consecutiveFailures and sets lastSuccessAt", async () => {
      await recordSourceSuccess("s");
      const { set } = lastUpsertArgs();
      expect(set.consecutiveFailures).toBe(0);
      expect(set.lastSuccessAt).toBeInstanceOf(Date);
      // totalRuns is a SQL expression — just verify it's present
      expect(set.totalRuns).toBeDefined();
    });

    it("uses a CASE expression for status in onConflict (manual disable is sticky)", async () => {
      await recordSourceSuccess("s");
      const { set } = lastUpsertArgs();
      // status is a SQL CASE expression — not a plain string
      expect(typeof set.status).not.toBe("string");
      expect(set.status).toBeDefined();
    });
  });

  // ── recordSourceFailure ───────────────────────────────────────────────────
  describe("recordSourceFailure", () => {
    it("uses UPSERT (insert + onConflictDoUpdate) to handle first run", async () => {
      await recordSourceFailure("new-source", "ECONNREFUSED");
      expect(db.insert).toHaveBeenCalledTimes(1);
      expect(insertChain.onConflictDoUpdate).toHaveBeenCalledTimes(1);
    });

    it("inserts correct initial values for first run failure", async () => {
      await recordSourceFailure("new-source", "ECONNREFUSED");
      const valuesArg = lastInsertValuesArgs();
      expect(valuesArg.sourceName).toBe("new-source");
      expect(valuesArg.status).toBe("degraded");
      expect(valuesArg.consecutiveFailures).toBe(1);
      expect(valuesArg.totalFailures).toBe(1);
      expect(valuesArg.totalRuns).toBe(1);
      expect(valuesArg.lastError).toBe("ECONNREFUSED");
      expect(valuesArg.lastFailureAt).toBeInstanceOf(Date);
    });

    it("onConflict set increments counters and records the error", async () => {
      await recordSourceFailure("s", "ECONNREFUSED");
      const { set } = lastUpsertArgs();
      expect(set.lastError).toBe("ECONNREFUSED");
      expect(set.lastFailureAt).toBeInstanceOf(Date);
      // consecutiveFailures, totalFailures, totalRuns are SQL expressions
      expect(set.consecutiveFailures).toBeDefined();
      expect(set.totalFailures).toBeDefined();
      expect(set.totalRuns).toBeDefined();
    });

    it("uses a CASE expression for status in onConflict (flips to degraded at threshold)", async () => {
      await recordSourceFailure("s", "err");
      const { set } = lastUpsertArgs();
      expect(typeof set.status).not.toBe("string");
      expect(set.status).toBeDefined();
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
