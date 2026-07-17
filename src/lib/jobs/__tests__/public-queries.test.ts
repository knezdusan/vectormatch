/**
 * Regression tests for SQL injection vulnerability in public-queries.ts.
 *
 * The skills filter previously used `sql.raw(filters.skills.join(","))` to
 * interpolate user-supplied skill values directly into the SQL string. This
 * was exploitable via the public (unauthenticated) /jobs?skills= endpoint.
 *
 * The fix replaces `sql.raw()` with `sql.join(skills.map(s => sql`${s}`), ...)`
 * which binds each skill as a parameterized value ($N placeholder).
 *
 * These tests verify that user-supplied skill strings — including malicious
 * SQL injection payloads — appear as bound parameters (Param chunks in
 * Drizzle's SQL AST), NOT as raw SQL text (StringChunk chunks).
 */

import { vi } from "vitest";

// =============================================================================
// MOCKS
// =============================================================================

vi.mock("server-only", () => ({}));

// Capture the SQL expression passed to .where() so we can inspect its chunks.
const capturedWhereArgs: unknown[] = [];
const capturedOrderByArgs: unknown[][] = [];

// .where() must return an object that is both thenable (for getPublicJobsCount
// which calls .then()) and has .orderBy() (for getPublicJobs which chains
// .orderBy().limit().offset()). Object.assign onto a Promise achieves both.
const mockWhereReturn = Object.assign(Promise.resolve([] as unknown[]), {
  orderBy: vi.fn((...args: unknown[]) => {
    capturedOrderByArgs.push(args);
    return {
      limit: vi.fn(() => ({
        offset: vi.fn(() => Promise.resolve([] as unknown[])),
      })),
    };
  }),
  limit: vi.fn(() => Promise.resolve([] as unknown[])),
});

function captureWhere(this: unknown, arg: unknown): typeof mockWhereReturn {
  capturedWhereArgs.push(arg);
  return mockWhereReturn;
}

const mockLeftJoinReturn = { where: vi.fn(captureWhere) };
const mockFromReturn = {
  leftJoin: vi.fn(() => mockLeftJoinReturn),
  where: vi.fn(captureWhere),
};

vi.mock("@/db/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => mockFromReturn),
    })),
  },
}));

// =============================================================================
// IMPORTS (after mocks)
// =============================================================================

import { getPublicJobs, getPublicJobsCount } from "@/lib/jobs/public-queries";

// =============================================================================
// DRIZZLE SQL AST INSPECTOR
// =============================================================================

/**
 * Drizzle's entityKind symbol, used to identify chunk types in the SQL AST.
 * - StringChunk: raw SQL text fragments (inlined into the query string)
 * - Param: bound parameter values (become $N placeholders)
 * - SQL: container with queryChunks (recurse into them)
 */
const ENTITY_KIND: symbol = Symbol.for("drizzle:entityKind");

interface ExtractedSql {
  /** All raw SQL text from StringChunk nodes (this is what gets inlined). */
  rawSql: string;
  /** All bound parameter values from Param nodes (these become $N placeholders). */
  params: unknown[];
}

/**
 * Recursively walk a Drizzle SQL expression tree and separate raw SQL text
 * (StringChunk values) from bound parameters (Param values or plain primitives
 * in queryChunks).
 *
 * Drizzle represents parameterized values in two ways:
 *   1. `Param` instances — created by `eq()`, `bindIfParam()`, etc.
 *   2. Plain strings/numbers in `queryChunks` — created by `sql`${s}``
 *      (the tagged template pushes raw primitives, not Param objects)
 *
 * Both become $N placeholders at query-compile time. StringChunk values, by
 * contrast, are inlined directly into the SQL string — that's the SQLi vector.
 *
 * If a user-supplied string appears in `rawSql`, it is SQL-injectable.
 * If it appears only in `params`, it is safely parameterized.
 */
function extractRawSqlAndParams(obj: unknown): ExtractedSql {
  const rawSqlParts: string[] = [];
  const params: unknown[] = [];

  function walk(node: unknown): void {
    if (node === null || node === undefined) return;

    // Plain primitives in queryChunks are parameterized values (Drizzle
    // compiles them to $N placeholders, not raw SQL text).
    if (
      typeof node === "string" ||
      typeof node === "number" ||
      typeof node === "boolean"
    ) {
      params.push(node);
      return;
    }

    if (typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }

    const o = node as Record<string, unknown>;
    const ctor = o.constructor as unknown as
      | Record<symbol, unknown>
      | undefined;
    const kind = ctor?.[ENTITY_KIND] as string | undefined;

    if (kind === "StringChunk") {
      // Raw SQL text fragment — inlined into the query string at compile time
      const value = o.value;
      if (typeof value === "string") {
        rawSqlParts.push(value);
      } else if (Array.isArray(value)) {
        rawSqlParts.push(value.map(String).join(""));
      }
    } else if (kind === "Param") {
      // Explicit Param instance — becomes $N placeholder
      params.push(o.value);
    } else if (
      typeof o.name === "string" &&
      o.table &&
      typeof (o.table as { name?: string }).name === "string"
    ) {
      // Column reference chunk (e.g., "published_at")
      rawSqlParts.push(o.name);
    } else if (o.queryChunks && Array.isArray(o.queryChunks)) {
      // SQL container — recurse into its chunks
      o.queryChunks.forEach(walk);
    } else if (
      typeof o.name === "string" &&
      o.table &&
      typeof o.table === "object"
    ) {
      // Column reference chunk (e.g., "published_at")
      rawSqlParts.push(o.name);
    } else if (typeof (o as { getSQL?: () => unknown }).getSQL === "function") {
      // SQL wrapper (Column, Table, etc.) — expand its generated SQL
      walk((o as { getSQL: () => unknown }).getSQL());
    }
  }

  walk(obj);
  return { rawSql: rawSqlParts.join(""), params };
}

// =============================================================================
// TESTS — getPublicJobs skills filter SQLi regression
// =============================================================================

describe("getPublicJobs — skills filter SQL injection regression", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedWhereArgs.length = 0;
  });

  it("binds malicious skill values as parameters, not raw SQL", async () => {
    const maliciousPayload = "react');DROP TABLE job;--";
    await getPublicJobs({ skills: [maliciousPayload] });

    expect(capturedWhereArgs.length).toBeGreaterThan(0);
    const whereExpr = capturedWhereArgs[0];
    const { rawSql, params } = extractRawSqlAndParams(whereExpr);

    // The malicious string must NOT appear in raw SQL text (that would be SQLi)
    expect(rawSql).not.toContain(maliciousPayload);
    expect(rawSql).not.toContain("DROP TABLE");
    expect(rawSql).not.toContain(";");
    expect(rawSql).not.toContain("--");

    // The malicious string MUST appear as a bound parameter (parameterized)
    expect(params).toContain(maliciousPayload);
  });

  it("binds multiple skills as separate parameters", async () => {
    await getPublicJobs({ skills: ["react", "python", "nodejs"] });

    const whereExpr = capturedWhereArgs[0];
    const { params } = extractRawSqlAndParams(whereExpr);

    // Each skill should be a separate bound parameter
    expect(params).toContain("react");
    expect(params).toContain("python");
    expect(params).toContain("nodejs");
  });

  it("does not use sql.raw() for skills (no raw interpolation)", async () => {
    // A skill with SQL syntax characters should never leak into raw SQL text
    const tricky = "'); DELETE FROM job WHERE 1=1; --";
    await getPublicJobs({ skills: [tricky] });

    const whereExpr = capturedWhereArgs[0];
    const { rawSql } = extractRawSqlAndParams(whereExpr);

    expect(rawSql).not.toContain("DELETE FROM");
    expect(rawSql).not.toContain("WHERE 1=1");
    expect(rawSql).not.toContain("');");
  });

  it("preserves the && (overlap) operator in the SQL structure", async () => {
    await getPublicJobs({ skills: ["react"] });

    const whereExpr = capturedWhereArgs[0];
    const { rawSql } = extractRawSqlAndParams(whereExpr);

    // The overlap operator should still be present in the raw SQL text
    expect(rawSql).toContain("&&");
    expect(rawSql).toContain("ARRAY[");
    expect(rawSql).toContain("::text[]");
  });
});

// =============================================================================
// TESTS — getPublicJobsCount skills filter SQLi regression
// =============================================================================

describe("getPublicJobsCount — skills filter SQL injection regression", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedWhereArgs.length = 0;
  });

  it("binds malicious skill values as parameters, not raw SQL", async () => {
    const maliciousPayload = "react');DROP TABLE job;--";
    await getPublicJobsCount({ skills: [maliciousPayload] });

    expect(capturedWhereArgs.length).toBeGreaterThan(0);
    const whereExpr = capturedWhereArgs[0];
    const { rawSql, params } = extractRawSqlAndParams(whereExpr);

    expect(rawSql).not.toContain(maliciousPayload);
    expect(rawSql).not.toContain("DROP TABLE");
    expect(rawSql).not.toContain(";");
    expect(rawSql).not.toContain("--");

    expect(params).toContain(maliciousPayload);
  });

  it("does not use sql.raw() for skills (no raw interpolation)", async () => {
    const tricky = "'); DELETE FROM job WHERE 1=1; --";
    await getPublicJobsCount({ skills: [tricky] });

    const whereExpr = capturedWhereArgs[0];
    const { rawSql } = extractRawSqlAndParams(whereExpr);

    expect(rawSql).not.toContain("DELETE FROM");
    expect(rawSql).not.toContain("WHERE 1=1");
    expect(rawSql).not.toContain("');");
  });
});

// =============================================================================
// TESTS — unified workplace filter
// =============================================================================

import {
  mapWorkplaceFilter,
  WORKPLACE_FILTER_OPTIONS,
} from "@/lib/jobs/public-queries";

describe("mapWorkplaceFilter", () => {
  it("returns both fields for global remote", () => {
    expect(mapWorkplaceFilter("global_remote")).toEqual({
      remoteScope: "global",
      workplaceType: "remote",
    });
  });

  it("returns both fields for country-fenced remote", () => {
    expect(mapWorkplaceFilter("country_fenced_remote")).toEqual({
      remoteScope: "country_fenced",
      workplaceType: "remote",
    });
  });

  it("returns both fields for region-fenced remote", () => {
    expect(mapWorkplaceFilter("region_fenced_remote")).toEqual({
      remoteScope: "region_fenced",
      workplaceType: "remote",
    });
  });

  it("returns only workplaceType for hybrid", () => {
    expect(mapWorkplaceFilter("hybrid")).toEqual({
      workplaceType: "hybrid",
    });
  });

  it("returns only workplaceType for on-site", () => {
    expect(mapWorkplaceFilter("on_site")).toEqual({
      workplaceType: "on-site",
    });
  });

  it("returns empty mapping for all / undefined", () => {
    expect(mapWorkplaceFilter("all")).toEqual({});
    expect(mapWorkplaceFilter(undefined)).toEqual({});
  });
});

describe("WORKPLACE_FILTER_OPTIONS", () => {
  it("contains the expected options with labels", () => {
    const values = WORKPLACE_FILTER_OPTIONS.map((o) => o.value);
    expect(values).toEqual([
      "all",
      "global_remote",
      "country_fenced_remote",
      "region_fenced_remote",
      "hybrid",
      "on_site",
    ]);
  });
});

describe("getPublicJobs — unified workplace filter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedWhereArgs.length = 0;
  });

  it("applies both remoteScope and workplaceType for global_remote", async () => {
    await getPublicJobs({ workplace: "global_remote" });

    const whereExpr = capturedWhereArgs[0];
    const { params } = extractRawSqlAndParams(whereExpr);
    expect(params).toContain("global");
    expect(params).toContain("remote");
  });

  it("applies only workplaceType for hybrid", async () => {
    await getPublicJobs({ workplace: "hybrid" });

    const whereExpr = capturedWhereArgs[0];
    const { params } = extractRawSqlAndParams(whereExpr);
    expect(params).toContain("hybrid");
    expect(params).not.toContain("global");
    expect(params).not.toContain("country_fenced");
    expect(params).not.toContain("region_fenced");
  });

  it("takes unified filter over legacy filters when both are present", async () => {
    await getPublicJobs({
      workplace: "global_remote",
      remoteScope: "region_fenced",
      workplaceType: "hybrid",
    });

    const whereExpr = capturedWhereArgs[0];
    const { params } = extractRawSqlAndParams(whereExpr);
    expect(params).toContain("global");
    expect(params).toContain("remote");
    expect(params).not.toContain("region_fenced");
    expect(params).not.toContain("hybrid");
  });
});

describe("getPublicJobsCount — unified workplace filter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedWhereArgs.length = 0;
  });

  it("applies both remoteScope and workplaceType for country_fenced_remote", async () => {
    await getPublicJobsCount({ workplace: "country_fenced_remote" });

    const whereExpr = capturedWhereArgs[0];
    const { params } = extractRawSqlAndParams(whereExpr);
    expect(params).toContain("country_fenced");
    expect(params).toContain("remote");
  });
});

// =============================================================================
// TESTS — default 60-day freshness gate
// =============================================================================

describe("getPublicJobs — default 60-day freshness gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedWhereArgs.length = 0;
  });

  it("applies a default age filter even when postedWithin is not specified", async () => {
    await getPublicJobs({});

    expect(capturedWhereArgs.length).toBeGreaterThan(0);
    const whereExpr = capturedWhereArgs[0];
    const { params } = extractRawSqlAndParams(whereExpr);

    // The freshness condition adds a Date cutoff parameter
    const dateParams = params.filter((p) => p instanceof Date);
    expect(dateParams.length).toBeGreaterThan(0);
  });

  it("uses postedWithin when provided (narrower than default)", async () => {
    await getPublicJobs({ postedWithin: 7 });

    expect(capturedWhereArgs.length).toBeGreaterThan(0);
    const whereExpr = capturedWhereArgs[0];
    const { params } = extractRawSqlAndParams(whereExpr);

    // The cutoff date should be a Date param — verify a Date object is in params
    const dateParams = params.filter((p) => p instanceof Date);
    expect(dateParams.length).toBeGreaterThan(0);

    // The most recent date param should be ~7 days ago, not ~60 days ago
    const now = Date.now();
    const cutoff = dateParams[0].getTime();
    const ageDays = (now - cutoff) / (1000 * 60 * 60 * 24);
    expect(ageDays).toBeLessThan(10); // ~7 days, not 60
    expect(ageDays).toBeGreaterThan(5);
  });

  it("applies the 60-day default when postedWithin is absent", async () => {
    await getPublicJobs({});

    const whereExpr = capturedWhereArgs[0];
    const { params } = extractRawSqlAndParams(whereExpr);

    const dateParams = params.filter((p) => p instanceof Date);
    expect(dateParams.length).toBeGreaterThan(0);

    const now = Date.now();
    const cutoff = dateParams[0].getTime();
    const ageDays = (now - cutoff) / (1000 * 60 * 60 * 24);
    // Should be ~60 days, not 7 or 365
    expect(ageDays).toBeGreaterThan(55);
    expect(ageDays).toBeLessThan(65);
  });
});

describe("getPublicJobsCount — default 60-day freshness gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedWhereArgs.length = 0;
  });

  it("applies the default age filter to count queries", async () => {
    await getPublicJobsCount({});

    expect(capturedWhereArgs.length).toBeGreaterThan(0);
    const whereExpr = capturedWhereArgs[0];
    const { params } = extractRawSqlAndParams(whereExpr);

    // Verify the cutoff is ~60 days
    const dateParams = params.filter((p) => p instanceof Date);
    expect(dateParams.length).toBeGreaterThan(0);
    const now = Date.now();
    const cutoff = dateParams[0].getTime();
    const ageDays = (now - cutoff) / (1000 * 60 * 60 * 24);
    expect(ageDays).toBeGreaterThan(55);
    expect(ageDays).toBeLessThan(65);
  });
});

// =============================================================================
// TESTS — NULL-safe date ordering regression
// =============================================================================

describe("getPublicJobs — NULL-safe date ordering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedWhereArgs.length = 0;
    capturedOrderByArgs.length = 0;
  });

  it("sorts newest by COALESCE(published_at, detected_at) DESC", async () => {
    await getPublicJobs({}, 20, 0, "newest");

    expect(capturedOrderByArgs.length).toBeGreaterThan(0);
    const orderByRaw = capturedOrderByArgs[0]
      .map((arg) => extractRawSqlAndParams(arg).rawSql)
      .join(" ");

    expect(orderByRaw).toContain("COALESCE");
    expect(orderByRaw).toContain("published_at");
    expect(orderByRaw).toContain("detected_at");
    expect(orderByRaw).toContain("DESC");
  });

  it("sorts salary with NULLS LAST on compensation_max", async () => {
    await getPublicJobs({}, 20, 0, "salary");

    expect(capturedOrderByArgs.length).toBeGreaterThan(0);
    const orderByRaw = capturedOrderByArgs[0]
      .map((arg) => extractRawSqlAndParams(arg).rawSql)
      .join(" ");

    expect(orderByRaw).toContain("compensation_max");
    expect(orderByRaw).toContain("DESC NULLS LAST");
  });
});
