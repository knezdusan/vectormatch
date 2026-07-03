/**
 * Unit tests for Module C — Gate 1+2 SQL Router (Step 5 of the 3-Gate Funnel).
 *
 * Test coverage (MODULE_C_DECISIONS.md §14, Feature C2):
 *   - SQL shape validation: assert `unnest` is used, NOT the invalid `&` operator
 *   - Result parsing: rows from db.execute are correctly mapped to candidates
 *   - Edge cases: empty tags, no matches, empty embedding (defensive fallback)
 *   - Vector serialization: number[] → pgvector text format
 *
 * The DB is mocked via vi.mock — no real database connection needed. The mock
 * captures the SQL query so we can assert its shape (the `&` operator bug from
 * TDD §5.2 would have been caught by this test).
 */

import { vi } from "vitest";

// vi.hoisted ensures the mock helpers are available when vi.mock factories
// run (Vitest hoists vi.mock calls above all other code).
const { lastQueryTextRef, extractSqlText } = vi.hoisted(() => {
  // Capture the last SQL query passed to db.execute so tests can assert shape.
  const lastQueryTextRef = { value: "" };

  // Recursively extract SQL text from a Drizzle SQL object's queryChunks.
  // Drizzle chunk types:
  //   - StringChunk: { value: string[] } — raw SQL text fragments
  //   - SQL: { queryChunks: unknown[] } — nested SQL (from sql`...`)
  //   - RawSQL: { value: string | string[] } — from sql.raw(...)
  //   - string/number/boolean: parameter values
  function extractSqlText(obj: unknown): string {
    if (typeof obj === "string") return obj;
    if (typeof obj === "number" || typeof obj === "boolean") return String(obj);
    if (obj === null || obj === undefined) return "";
    if (Array.isArray(obj)) return obj.map(extractSqlText).join("");
    if (typeof obj === "object") {
      const o = obj as Record<string, unknown>;
      if (o.queryChunks && Array.isArray(o.queryChunks)) {
        return o.queryChunks.map(extractSqlText).join("");
      }
      if (typeof o.value === "string") return o.value;
      if (Array.isArray(o.value)) return o.value.map(extractSqlText).join("");
    }
    return "";
  }

  return { lastQueryTextRef, extractSqlText };
});

// Mock the db module — db.execute captures the SQL for inspection.
vi.mock("@/db/db", () => ({
  db: {
    execute: vi.fn(async (query: unknown) => {
      lastQueryTextRef.value = extractSqlText(query);
      return { rows: [] };
    }),
  },
}));

// Mock server-only (stubbed in vitest config, but explicit here for clarity)
vi.mock("server-only", () => ({}));

import { db } from "@/db/db";
import { explainGateRouter, runGateSQLRouter } from "@/lib/jobs/gate-1-2";

// Helper to set up the mock to return specific rows.
// IMPORTANT: must preserve SQL capture — use mockImplementation, not
// mockResolvedValue (which replaces the implementation entirely).
function mockExecuteReturns(rows: Record<string, unknown>[]) {
  (db.execute as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    async (query: unknown) => {
      lastQueryTextRef.value = extractSqlText(query);
      return { rows };
    },
  );
}

// Helper to get the SQL text from the last db.execute call
function getLastQuerySQL(): string {
  return lastQueryTextRef.value;
}

// =============================================================================
// SQL SHAPE VALIDATION — assert the bug fix from TDD §5.2
// =============================================================================

describe("Gate 1+2 SQL shape validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastQueryTextRef.value = "";
  });

  it("uses unnest + = ANY for overlap count (NOT the invalid & operator)", async () => {
    mockExecuteReturns([]);
    await runGateSQLRouter("job-1", ["react", "python"], [0.1, 0.2, 0.3]);

    const sqlText = getLastQuerySQL().toLowerCase();
    expect(sqlText).toContain("unnest");
    expect(sqlText).toContain("= any");
    // The invalid `&` operator for text[] would appear as `must_have_tags &`
    // or `& $` in the overlap count. It should NOT appear in the LATERAL
    // subquery (the overlap count). The `&&` (overlap boolean) in the WHERE
    // clause is fine — that's a different operator.
    // We check that there's no `& ` (single ampersand, not `&&`) used for
    // array intersection in the SELECT/LATERAL.
    expect(sqlText).not.toMatch(/cardinality\(.*&.*\)/);
  });

  it("uses && (overlap boolean) in the WHERE clause for Gate 1", async () => {
    mockExecuteReturns([]);
    await runGateSQLRouter("job-1", ["react", "python"], [0.1, 0.2, 0.3]);

    const sqlText = getLastQuerySQL().toLowerCase();
    // && is the polymorphic array overlap operator — valid for text[]
    expect(sqlText).toContain("&&");
  });

  it("uses <=> (cosine distance) operator for Gate 2", async () => {
    mockExecuteReturns([]);
    await runGateSQLRouter("job-1", ["react"], [0.1, 0.2, 0.3]);

    const sqlText = getLastQuerySQL();
    expect(sqlText).toContain("<=>");
  });

  it("uses LATERAL JOIN for overlap computation", async () => {
    mockExecuteReturns([]);
    await runGateSQLRouter("job-1", ["react"], [0.1, 0.2, 0.3]);

    const sqlText = getLastQuerySQL().toLowerCase();
    expect(sqlText).toContain("lateral");
  });

  it("uses composite ORDER BY with both weights", async () => {
    mockExecuteReturns([]);
    await runGateSQLRouter("job-1", ["react"], [0.1, 0.2, 0.3]);

    const sqlText = getLastQuerySQL().toLowerCase();
    expect(sqlText).toContain("order by");
    // The composite score blends overlap_score and (1 - distance)
    expect(sqlText).toContain("overlap_score");
    expect(sqlText).toContain("1 -");
  });

  it("uses ON CONFLICT (job_id, persona_id) DO UPDATE to reset rejected entries", async () => {
    mockExecuteReturns([]);
    await runGateSQLRouter("job-1", ["react"], [0.1, 0.2, 0.3]);

    const sqlText = getLastQuerySQL().toLowerCase();
    expect(sqlText).toContain("on conflict");
    expect(sqlText).toContain("job_id");
    expect(sqlText).toContain("persona_id");
    expect(sqlText).toContain("do update set");
    expect(sqlText).toContain("status = 'pending'");
    expect(sqlText).toContain("llm_verdict = null");
    expect(sqlText).toContain("prompt_variant = null");
    expect(sqlText).not.toContain("excluded.match_score");
    expect(sqlText).not.toContain("excluded.prompt_variant");
  });

  it("uses LIMIT from GATE_ROUTER_LIMIT config", async () => {
    mockExecuteReturns([]);
    await runGateSQLRouter("job-1", ["react"], [0.1, 0.2, 0.3]);

    const sqlText = getLastQuerySQL().toLowerCase();
    expect(sqlText).toContain("limit");
  });

  it("filters blocklist tags (NOT blocklist_tags && jobTags)", async () => {
    mockExecuteReturns([]);
    await runGateSQLRouter("job-1", ["react"], [0.1, 0.2, 0.3]);

    const sqlText = getLastQuerySQL().toLowerCase();
    expect(sqlText).toContain("blocklist_tags");
    expect(sqlText).toContain("not");
  });

  it("filters persona_embedding IS NOT NULL", async () => {
    mockExecuteReturns([]);
    await runGateSQLRouter("job-1", ["react"], [0.1, 0.2, 0.3]);

    const sqlText = getLastQuerySQL().toLowerCase();
    expect(sqlText).toContain("persona_embedding is not null");
  });

  // ── Sprint 8: dedup relaxation + workplace filter removal ─────────────────

  it("cross-posting dedup only blocks approved matches (Sprint 8)", async () => {
    mockExecuteReturns([]);
    await runGateSQLRouter("job-1", ["react"], [0.1, 0.2, 0.3]);

    const sqlText = getLastQuerySQL().toLowerCase();
    // The NOT EXISTS dedup clause must include "status = 'approved'"
    expect(sqlText).toContain("not exists");
    expect(sqlText).toContain("match_queue");
    expect(sqlText).toContain("approved");
  });

  it("does NOT include workplace_type pre-filter (Sprint 8 removal)", async () => {
    mockExecuteReturns([]);
    await runGateSQLRouter("job-1", ["react"], [0.1, 0.2, 0.3]);

    const sqlText = getLastQuerySQL().toLowerCase();
    // The workplace_type pre-filter was removed — the query should NOT
    // contain the applicant assignment_types check
    expect(sqlText).not.toContain("workplace_type = 'remote'");
    expect(sqlText).not.toContain("workplace_type = 'hybrid'");
    expect(sqlText).not.toContain("workplace_type = 'on-site'");
    expect(sqlText).not.toContain("assignment_types");
  });

  it("job_meta CTE does not fetch workplace_type (Sprint 8 cleanup)", async () => {
    mockExecuteReturns([]);
    await runGateSQLRouter("job-1", ["react"], [0.1, 0.2, 0.3]);

    const sqlText = getLastQuerySQL().toLowerCase();
    // job_meta should only fetch ats_slug and title (not workplace_type)
    expect(sqlText).toContain("job_meta");
    expect(sqlText).toContain("ats_slug");
    expect(sqlText).toContain("title");
    // workplace_type should not appear in the CTE select
    const cteMatch = sqlText.match(/job_meta as\s*\(([^)]+)\)/);
    if (cteMatch) {
      expect(cteMatch[1]).not.toContain("workplace_type");
    }
  });
});

// =============================================================================
// RESULT PARSING — rows from db.execute mapped to candidates
// =============================================================================

describe("Gate 1+2 result parsing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastQueryTextRef.value = "";
  });

  it("maps db.execute rows to GateRouterCandidate objects", async () => {
    mockExecuteReturns([
      {
        id: "mq-1",
        persona_id: "persona-1",
        applicant_id: "user-1",
        overlap_score: 5,
        cosine_distance: 0.12,
      },
      {
        id: "mq-2",
        persona_id: "persona-2",
        applicant_id: "user-2",
        overlap_score: 3,
        cosine_distance: 0.05,
      },
    ]);

    const candidates = await runGateSQLRouter(
      "job-1",
      ["react"],
      [0.1, 0.2, 0.3],
    );

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toEqual({
      matchQueueId: "mq-1",
      personaId: "persona-1",
      applicantId: "user-1",
      overlapScore: 5,
      cosineDistance: 0.12,
    });
    expect(candidates[1]).toEqual({
      matchQueueId: "mq-2",
      personaId: "persona-2",
      applicantId: "user-2",
      overlapScore: 3,
      cosineDistance: 0.05,
    });
  });

  it("returns empty array when no personas pass both gates", async () => {
    mockExecuteReturns([]);

    const candidates = await runGateSQLRouter(
      "job-1",
      ["react"],
      [0.1, 0.2, 0.3],
    );

    expect(candidates).toEqual([]);
  });

  it("converts numeric fields from DB strings to numbers", async () => {
    // PostgreSQL via Neon may return numeric values as strings
    mockExecuteReturns([
      {
        id: "mq-1",
        persona_id: "p-1",
        applicant_id: "u-1",
        overlap_score: "4",
        cosine_distance: "0.15",
      },
    ]);

    const candidates = await runGateSQLRouter(
      "job-1",
      ["react"],
      [0.1, 0.2, 0.3],
    );

    expect(candidates[0].overlapScore).toBe(4);
    expect(candidates[0].cosineDistance).toBeCloseTo(0.15);
    expect(typeof candidates[0].overlapScore).toBe("number");
    expect(typeof candidates[0].cosineDistance).toBe("number");
  });
});

// =============================================================================
// EDGE CASES (§5.4)
// =============================================================================

describe("Gate 1+2 edge cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastQueryTextRef.value = "";
  });

  it("handles empty jobTags — skips Gate 1 filter, relies on Gate 2", async () => {
    mockExecuteReturns([]);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const candidates = await runGateSQLRouter("job-1", [], [0.1, 0.2, 0.3]);

    expect(candidates).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("empty jobTags"),
    );
    warnSpy.mockRestore();
  });

  it("handles empty embedding — falls back to Gate 1 only", async () => {
    mockExecuteReturns([
      {
        id: "mq-1",
        persona_id: "p-1",
        applicant_id: "u-1",
        overlap_score: 3,
      },
    ]);

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const candidates = await runGateSQLRouter("job-1", ["react"], []);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].overlapScore).toBe(3);
    // cosineDistance is 0 (unknown — Gate 2 was skipped)
    expect(candidates[0].cosineDistance).toBe(0);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("empty embedding"),
    );
    errorSpy.mockRestore();
  });

  it("returns empty array when both tags and embedding are empty", async () => {
    const candidates = await runGateSQLRouter("job-1", [], []);

    expect(candidates).toEqual([]);
  });
});

// =============================================================================
// EXPLAIN ANALYZE
// =============================================================================

describe("explainGateRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastQueryTextRef.value = "";
  });

  it("generates EXPLAIN ANALYZE query (no INSERT)", async () => {
    mockExecuteReturns([{ "QUERY PLAN": "Seq Scan on persona" }]);

    const plan = await explainGateRouter(["react"], [0.1, 0.2, 0.3]);

    const sqlText = getLastQuerySQL().toLowerCase();
    expect(sqlText).toContain("explain analyze");
    expect(sqlText).not.toContain("insert into");
    expect(plan).toEqual(["Seq Scan on persona"]);
  });

  it("uses unnest + = ANY in the EXPLAIN query too", async () => {
    mockExecuteReturns([{ "QUERY PLAN": "..." }]);

    await explainGateRouter(["react", "python"], [0.1, 0.2, 0.3]);

    const sqlText = getLastQuerySQL().toLowerCase();
    expect(sqlText).toContain("unnest");
    expect(sqlText).toContain("= any");
  });
});
