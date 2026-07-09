/**
 * Unit tests for G1 — Adaptive Polling Cadence (CORPUS_EXPANSION_TDD §3.1)
 *
 * Tests recalculateTiers() — the daily tier recalculation that promotes
 * companies to active_hot when they have approved matches in the last 30 days.
 *
 * The function executes raw SQL via drizzle's sql template tag. We mock
 * db.execute and inspect the SQL object's .strings array to verify the
 * query contains the expected G1 clauses.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the db module
vi.mock("@/db/db", () => ({
  db: {
    execute: vi.fn(),
  },
}));

import { recalculateTiers } from "@/lib/jobs/poller/tier-queries";

/**
 * Extract the full SQL text from a drizzle sql template tag result.
 * Drizzle's SQL object stores the template literal chunks in `queryChunks`,
 * where each chunk is a `StringChunk` with a `.value` array of strings.
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

describe("recalculateTiers — G1 Adaptive Polling Cadence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("includes active_hot tier check in the SQL (EXISTS subquery against match_queue)", async () => {
    const { db } = await import("@/db/db");
    const executeMock = db.execute as unknown as ReturnType<typeof vi.fn>;
    executeMock.mockResolvedValueOnce({ rowCount: 100 });

    await recalculateTiers();

    expect(executeMock).toHaveBeenCalledTimes(1);
    const sqlObj = executeMock.mock.calls[0][0];
    const fullSql = getSqlText(sqlObj);

    // G1: active_hot tier check via EXISTS subquery
    expect(fullSql).toContain("active_hot");
    expect(fullSql).toContain("EXISTS");
    expect(fullSql).toContain("match_queue");
    expect(fullSql).toContain("approved");
    expect(fullSql).toContain("30 days");
  });

  it("evaluates tiers in correct order: dead → active_hot → active → dormant", async () => {
    const { db } = await import("@/db/db");
    const executeMock = db.execute as unknown as ReturnType<typeof vi.fn>;
    executeMock.mockResolvedValueOnce({ rowCount: 0 });

    await recalculateTiers();

    const sqlObj = executeMock.mock.calls[0][0];
    const fullSql = getSqlText(sqlObj);

    // dead check must come before active_hot (first match wins in CASE)
    const deadIdx = fullSql.indexOf("'dead'::company_tier");
    const hotIdx = fullSql.indexOf("'active_hot'::company_tier");
    const activeIdx = fullSql.indexOf("'active'::company_tier");
    const dormantIdx = fullSql.indexOf("'dormant'::company_tier");

    expect(deadIdx).toBeGreaterThan(-1);
    expect(hotIdx).toBeGreaterThan(-1);
    expect(activeIdx).toBeGreaterThan(-1);
    expect(dormantIdx).toBeGreaterThan(-1);
    expect(deadIdx).toBeLessThan(hotIdx);
    expect(hotIdx).toBeLessThan(activeIdx);
    expect(activeIdx).toBeLessThan(dormantIdx);
  });

  it("returns the rowCount from the UPDATE result", async () => {
    const { db } = await import("@/db/db");
    const executeMock = db.execute as unknown as ReturnType<typeof vi.fn>;
    executeMock.mockResolvedValueOnce({ rowCount: 5290 });

    const result = await recalculateTiers();
    expect(result).toBe(5290);
  });

  it("returns 0 when rowCount is null (Drizzle edge case)", async () => {
    const { db } = await import("@/db/db");
    const executeMock = db.execute as unknown as ReturnType<typeof vi.fn>;
    executeMock.mockResolvedValueOnce({ rowCount: null });

    const result = await recalculateTiers();
    expect(result).toBe(0);
  });

  it("returns 0 when rowCount is undefined", async () => {
    const { db } = await import("@/db/db");
    const executeMock = db.execute as unknown as ReturnType<typeof vi.fn>;
    executeMock.mockResolvedValueOnce({});

    const result = await recalculateTiers();
    expect(result).toBe(0);
  });

  it("only updates companies where polling_enabled = true", async () => {
    const { db } = await import("@/db/db");
    const executeMock = db.execute as unknown as ReturnType<typeof vi.fn>;
    executeMock.mockResolvedValueOnce({ rowCount: 0 });

    await recalculateTiers();

    const sqlObj = executeMock.mock.calls[0][0];
    const fullSql = getSqlText(sqlObj);

    expect(fullSql).toContain("polling_enabled = true");
  });

  it("joins match_queue to job on (ats_source, ats_slug) for the active_hot check", async () => {
    const { db } = await import("@/db/db");
    const executeMock = db.execute as unknown as ReturnType<typeof vi.fn>;
    executeMock.mockResolvedValueOnce({ rowCount: 0 });

    await recalculateTiers();

    const sqlObj = executeMock.mock.calls[0][0];
    const fullSql = getSqlText(sqlObj);

    // The EXISTS subquery must join match_queue → job and correlate to company
    expect(fullSql).toContain("JOIN job");
    expect(fullSql).toContain("j.id = mq.job_id");
    expect(fullSql).toContain("j.ats_source = company.ats_source");
    expect(fullSql).toContain("j.ats_slug = company.ats_slug");
  });

  it("Q4: preserves active_hot for companies discovered within 48h", async () => {
    const { db } = await import("@/db/db");
    const executeMock = db.execute as unknown as ReturnType<typeof vi.fn>;
    executeMock.mockResolvedValueOnce({ rowCount: 0 });

    await recalculateTiers();

    const sqlObj = executeMock.mock.calls[0][0];
    const fullSql = getSqlText(sqlObj);

    // Q4 bootstrap: discovered_at > NOW() - INTERVAL '48 hours' → active_hot
    expect(fullSql).toContain("discovered_at");
    expect(fullSql).toContain("48 hours");
    expect(fullSql).toContain("'active_hot'::company_tier");
  });

  it("Q4: bootstrap check comes after approved-match check but before active check", async () => {
    const { db } = await import("@/db/db");
    const executeMock = db.execute as unknown as ReturnType<typeof vi.fn>;
    executeMock.mockResolvedValueOnce({ rowCount: 0 });

    await recalculateTiers();

    const sqlObj = executeMock.mock.calls[0][0];
    const fullSql = getSqlText(sqlObj);

    // The Q4 bootstrap check (discovered_at > NOW() - INTERVAL '48 hours')
    // should come after the EXISTS check (approved matches) but before the
    // last_job_posted_at check (active).
    // Note: the dead check also contains discovered_at (v4 lock §1-B.5 guard),
    // so we search for the 48-hour bootstrap specifically.
    const existsIdx = fullSql.indexOf("EXISTS");
    const bootstrapIdx = fullSql.indexOf("48 hours");
    const activeIdx = fullSql.indexOf("last_job_posted_at");

    expect(existsIdx).toBeGreaterThan(-1);
    expect(bootstrapIdx).toBeGreaterThan(-1);
    expect(activeIdx).toBeGreaterThan(-1);
    expect(existsIdx).toBeLessThan(bootstrapIdx);
    expect(bootstrapIdx).toBeLessThan(activeIdx);
  });

  // v4 lock §1-B.5: Probation tier tests
  it("v4: includes probation tier check in the SQL", async () => {
    const { db } = await import("@/db/db");
    const executeMock = db.execute as unknown as ReturnType<typeof vi.fn>;
    executeMock.mockResolvedValueOnce({ rowCount: 0 });

    await recalculateTiers();

    const sqlObj = executeMock.mock.calls[0][0];
    const fullSql = getSqlText(sqlObj);

    expect(fullSql).toContain("'probation'::company_tier");
    // C3 fix: demotion threshold is 3, not 7
    expect(fullSql).toContain("zero_yield_poll_count < 3");
  });

  it("v4: probation check comes after active check but before dormant", async () => {
    const { db } = await import("@/db/db");
    const executeMock = db.execute as unknown as ReturnType<typeof vi.fn>;
    executeMock.mockResolvedValueOnce({ rowCount: 0 });

    await recalculateTiers();

    const sqlObj = executeMock.mock.calls[0][0];
    const fullSql = getSqlText(sqlObj);

    const activeIdx = fullSql.indexOf("'active'::company_tier");
    const probationIdx = fullSql.indexOf("'probation'::company_tier");
    const dormantIdx = fullSql.indexOf("'dormant'::company_tier");

    expect(activeIdx).toBeGreaterThan(-1);
    expect(probationIdx).toBeGreaterThan(-1);
    expect(dormantIdx).toBeGreaterThan(-1);
    expect(activeIdx).toBeLessThan(probationIdx);
    expect(probationIdx).toBeLessThan(dormantIdx);
  });

  it("C3: dead check guards on poll-state (last_polled_at IS NOT NULL), not age", async () => {
    const { db } = await import("@/db/db");
    const executeMock = db.execute as unknown as ReturnType<typeof vi.fn>;
    executeMock.mockResolvedValueOnce({ rowCount: 0 });

    await recalculateTiers();

    const sqlObj = executeMock.mock.calls[0][0];
    const fullSql = getSqlText(sqlObj);

    // C3 fix: the dead check must guard on last_polled_at IS NOT NULL,
    // not on discovered_at age. Never-polled companies are protected from
    // dead decay regardless of age — they get at least one poll before decay.
    expect(fullSql).toContain("last_polled_at");
    expect(fullSql).toContain("IS NOT NULL");
    // The old age-based guard must NOT be present
    expect(fullSql).not.toContain("discovered_at < NOW() - INTERVAL '7 days'");
  });

  it("C3: never-polled companies go to probation (not dormant/dead)", async () => {
    const { db } = await import("@/db/db");
    const executeMock = db.execute as unknown as ReturnType<typeof vi.fn>;
    executeMock.mockResolvedValueOnce({ rowCount: 0 });

    await recalculateTiers();

    const sqlObj = executeMock.mock.calls[0][0];
    const fullSql = getSqlText(sqlObj);

    // A never-polled company (last_polled_at IS NULL) should be routed to
    // probation, not dormant — it hasn't had a chance to yield yet.
    // The probation branch for never-polled must come before the dormant fallthrough.
    const neverPolledProbationIdx = fullSql.indexOf(
      "last_polled_at IS NULL THEN 'probation'",
    );
    expect(neverPolledProbationIdx).toBeGreaterThan(-1);
  });
});
