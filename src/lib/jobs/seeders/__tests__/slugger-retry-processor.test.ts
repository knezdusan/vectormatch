/**
 * Unit tests for the Slugger Retry Queue Processor (Sprint 3 Task 6)
 *
 * Mocks the DB layer (`@/db/db`) and the Slugger (`@/lib/jobs/seeders/slugger`)
 * so no real database is touched, per AGENTS.md "Database Mutation in Tests".
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the db module. select().from().where().orderBy().limit() chains return
// a Promise of an array. delete() and execute() return a Promise of a result.
const selectChain = {
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue([]),
};
vi.mock("@/db/db", () => ({
  db: {
    select: vi.fn(() => selectChain),
    delete: vi.fn().mockResolvedValue({ rowCount: 1 }),
    execute: vi.fn().mockResolvedValue({ rowCount: 1 }),
  },
}));

// Mock the Slugger so retry processing doesn't hit the DB or network.
vi.mock("@/lib/jobs/seeders/slugger", () => ({
  resolveSlugger: vi.fn(),
}));

import { db } from "@/db/db";
import { resolveSlugger } from "@/lib/jobs/seeders/slugger";
import {
  deleteRetryEntry,
  incrementRetryCount,
  processRetryQueue,
  selectRetryableEntries,
} from "@/lib/jobs/seeders/slugger-retry-processor";

/** Helper: make the select chain resolve to a specific array of rows. */
function setRetryEntries(rows: Record<string, unknown>[]) {
  selectChain.limit.mockResolvedValueOnce(rows);
}

describe("Slugger Retry Queue Processor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── selectRetryableEntries ────────────────────────────────────────────────
  describe("selectRetryableEntries", () => {
    it("queries retryable entries with the correct WHERE + ORDER + LIMIT", async () => {
      setRetryEntries([]);
      await selectRetryableEntries();
      expect(db.select).toHaveBeenCalledTimes(1);
      // Verify the chain was called
      expect(selectChain.from).toHaveBeenCalled();
      expect(selectChain.where).toHaveBeenCalled();
      expect(selectChain.orderBy).toHaveBeenCalled();
      expect(selectChain.limit).toHaveBeenCalledWith(100);
    });

    it("returns the rows from the query", async () => {
      const rows = [
        {
          id: "r1",
          companyName: "Acme",
          website: "https://acme.com",
          discoverySource: "hn_algolia",
          discoveryContext: null,
          retryCount: 0,
          nextRetryAt: new Date("2026-06-01"),
          createdAt: new Date("2026-05-01"),
        },
      ];
      setRetryEntries(rows);
      const result = await selectRetryableEntries();
      expect(result).toHaveLength(1);
      expect(result[0].companyName).toBe("Acme");
    });
  });

  // ── deleteRetryEntry ──────────────────────────────────────────────────────
  describe("deleteRetryEntry", () => {
    it("issues a DELETE for the given id", async () => {
      await deleteRetryEntry("r1");
      expect(db.execute).toHaveBeenCalledTimes(1);
      // db.execute is called with a sql template — verify it was called
      const executeMock = db.execute as unknown as ReturnType<typeof vi.fn>;
      expect(executeMock.mock.calls[0][0]).toBeDefined();
    });
  });

  // ── incrementRetryCount ───────────────────────────────────────────────────
  describe("incrementRetryCount", () => {
    it("issues an UPDATE with exponential backoff", async () => {
      await incrementRetryCount("r1");
      expect(db.execute).toHaveBeenCalledTimes(1);
      // Verify the SQL contains the backoff expression
      const executeMock = db.execute as unknown as ReturnType<typeof vi.fn>;
      const sqlObj = executeMock.mock.calls[0][0];
      // Extract SQL text from the drizzle sql template object
      const chunks = (sqlObj as { queryChunks?: { value: unknown }[] })
        .queryChunks;
      const sqlText = Array.isArray(chunks)
        ? chunks
            .map((c) =>
              c && typeof c === "object" && "value" in c
                ? Array.isArray(c.value)
                  ? c.value.join("")
                  : String(c.value)
                : String(c),
            )
            .join("")
        : String(sqlObj);
      expect(sqlText).toContain("UPDATE slugger_retry");
      expect(sqlText).toContain("retry_count");
      expect(sqlText).toContain("7 days");
      expect(sqlText).toContain("POWER(2");
    });
  });

  // ── processRetryQueue ─────────────────────────────────────────────────────
  describe("processRetryQueue", () => {
    it("processes successful retries — deletes the entry", async () => {
      setRetryEntries([
        {
          id: "r1",
          companyName: "Acme",
          website: "https://acme.com",
          discoverySource: "hn_algolia",
          discoveryContext: null,
          retryCount: 0,
          nextRetryAt: new Date("2026-06-01"),
          createdAt: new Date("2026-05-01"),
        },
      ]);
      vi.mocked(resolveSlugger).mockResolvedValueOnce({
        success: true,
        atsSource: "greenhouse",
        atsSlug: "acme",
        resolvedBy: "slug_probe",
        canonicalName: "Acme",
      });

      const result = await processRetryQueue();

      expect(result.processed).toBe(1);
      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(0);
      // deleteRetryEntry uses db.execute (DELETE ... WHERE id = ...)
      const executeMock = db.execute as unknown as ReturnType<typeof vi.fn>;
      // At least one execute call for the DELETE (no increment on success)
      expect(executeMock).toHaveBeenCalled();
    });

    it("processes failed retries — increments retry count", async () => {
      setRetryEntries([
        {
          id: "r2",
          companyName: "Unknown",
          website: null,
          discoverySource: "hn_algolia",
          discoveryContext: null,
          retryCount: 1,
          nextRetryAt: new Date("2026-06-01"),
          createdAt: new Date("2026-05-01"),
        },
      ]);
      vi.mocked(resolveSlugger).mockResolvedValueOnce({
        success: false,
        canonicalName: "Unknown",
      });

      const result = await processRetryQueue();

      expect(result.processed).toBe(1);
      expect(result.succeeded).toBe(0);
      expect(result.failed).toBe(1);
      expect(db.execute).toHaveBeenCalledTimes(1); // increment on failure
      // Verify the execute call is an UPDATE (increment), not a DELETE
      const executeMock = db.execute as unknown as ReturnType<typeof vi.fn>;
      const sqlObj = executeMock.mock.calls[0][0];
      const chunks = (sqlObj as { queryChunks?: { value: unknown }[] })
        .queryChunks;
      const sqlText = Array.isArray(chunks)
        ? chunks
            .map((c) =>
              c && typeof c === "object" && "value" in c
                ? Array.isArray(c.value)
                  ? c.value.join("")
                  : String(c.value)
                : String(c),
            )
            .join("")
        : String(sqlObj);
      expect(sqlText).toContain("UPDATE slugger_retry");
    });

    it("handles Slugger throwing — counts as failure, continues batch", async () => {
      setRetryEntries([
        {
          id: "r3",
          companyName: "Crash",
          website: null,
          discoverySource: "hn_algolia",
          discoveryContext: null,
          retryCount: 0,
          nextRetryAt: new Date("2026-06-01"),
          createdAt: new Date("2026-05-01"),
        },
        {
          id: "r4",
          companyName: "Next",
          website: null,
          discoverySource: "hn_algolia",
          discoveryContext: null,
          retryCount: 0,
          nextRetryAt: new Date("2026-06-01"),
          createdAt: new Date("2026-05-01"),
        },
      ]);
      vi.mocked(resolveSlugger)
        .mockRejectedValueOnce(new Error("slugger crashed"))
        .mockResolvedValueOnce({
          success: true,
          atsSource: "lever",
          atsSlug: "next",
          resolvedBy: "slug_probe",
          canonicalName: "Next",
        });

      const result = await processRetryQueue();

      expect(result.processed).toBe(2);
      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("Crash");
      expect(result.errors[0]).toContain("slugger crashed");
    });

    it("returns zero counts when the queue is empty", async () => {
      setRetryEntries([]);
      const result = await processRetryQueue();
      expect(result.processed).toBe(0);
      expect(result.succeeded).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it("passes the correct input to resolveSlugger", async () => {
      setRetryEntries([
        {
          id: "r5",
          companyName: "Test Co",
          website: "https://testco.com",
          discoverySource: "wayback_cdx",
          discoveryContext: "http://web.archive.org/...",
          retryCount: 0,
          nextRetryAt: new Date("2026-06-01"),
          createdAt: new Date("2026-05-01"),
        },
      ]);
      vi.mocked(resolveSlugger).mockResolvedValueOnce({
        success: true,
        atsSource: "ashby",
        atsSlug: "test-co",
        resolvedBy: "cname",
        canonicalName: "Test Co",
      });

      await processRetryQueue();

      expect(resolveSlugger).toHaveBeenCalledTimes(1);
      const [inputArg, optsArg] = vi.mocked(resolveSlugger).mock.calls[0];
      expect(inputArg.companyName).toBe("Test Co");
      expect(inputArg.website).toBe("https://testco.com");
      expect(inputArg.discoverySource).toBe("wayback_cdx");
      expect(inputArg.discoveryContext).toBe("http://web.archive.org/...");
      expect(optsArg?.insertCompany).toBe(true);
      expect(optsArg?.addToRetryOnFailure).toBe(false);
    });
  });
});
