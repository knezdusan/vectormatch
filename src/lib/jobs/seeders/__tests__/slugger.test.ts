/**
 * Unit tests for the Slugger (F1 + F3 — TDD §1.4).
 *
 * Tests the three-stage company name → ATS slug resolution pipeline:
 *   Stage 0: DB cache — check if we already have this company by canonicalName
 *   Stage 1: CNAME check — if a website URL is provided, DNS CNAME lookup
 *   Stage 2: Slug probe — try each name variant against each ATS API
 *   Failure — all stages fail → retry queue
 *
 * Also tests the pure functions:
 *   - canonicalizeCompanyName() — suffix stripping, punctuation, case
 *   - generateSlugVariants() — canonical, first word, acronym
 */

import type { ResolveCnameFn } from "@/lib/jobs/seeders/resolve-custom-url";
import {
  canonicalizeCompanyName,
  generateSlugVariants,
  resolveSlugger,
} from "@/lib/jobs/seeders/slugger";
import type { FetchFn } from "@/lib/jobs/types";

// ── Mock helpers ─────────────────────────────────────────────────────────────

/** A mock CNAME resolver that returns a fixed mapping. */
function makeMockCnameResolver(
  mappings: Record<string, string[]>,
): ResolveCnameFn {
  return vi.fn(async (hostname: string) => {
    const result = mappings[hostname.toLowerCase()];
    if (!result) throw new Error(`ENOTFOUND ${hostname}`);
    return result;
  });
}

/** A mock fetch that returns fixed responses by URL pattern. */
function makeMockFetch(
  responses: { urlPattern: string; status: number; body: string }[],
): FetchFn {
  const mock = vi.fn(async (url: string) => {
    for (const { urlPattern, status, body } of responses) {
      if (url.includes(urlPattern)) {
        return new Response(body, { status });
      }
    }
    return new Response("Not Found", { status: 404 });
  });
  return mock as unknown as FetchFn;
}

/** A mock DB cache check that returns a fixed result for a canonical name. */
function makeMockDbCache(
  mappings: Record<
    string,
    {
      atsSource: import("@/lib/jobs/ats-endpoints").AtsSource;
      atsSlug: string;
    } | null
  >,
) {
  return vi.fn(async (canonicalName: string) => {
    return (mappings[canonicalName] ?? null) as never;
  });
}

// ── canonicalizeCompanyName ──────────────────────────────────────────────────

describe("canonicalizeCompanyName", () => {
  it("strips common corporate suffixes", () => {
    expect(canonicalizeCompanyName("Stripe Inc")).toBe("stripe");
    expect(canonicalizeCompanyName("Stripe Inc.")).toBe("stripe");
    expect(canonicalizeCompanyName("Klarna Bank AB")).toBe("klarnabank");
    expect(canonicalizeCompanyName("Docker Inc.")).toBe("docker");
    expect(canonicalizeCompanyName("Acme Ltd")).toBe("acme");
    expect(canonicalizeCompanyName("Acme Ltd.")).toBe("acme");
    expect(canonicalizeCompanyName("Acme Corp")).toBe("acme");
    expect(canonicalizeCompanyName("Acme Corporation")).toBe("acme");
    expect(canonicalizeCompanyName("Acme LLC")).toBe("acme");
    expect(canonicalizeCompanyName("Acme GmbH")).toBe("acme");
    expect(canonicalizeCompanyName("Acme plc")).toBe("acme");
  });

  it("strips descriptive suffixes", () => {
    expect(canonicalizeCompanyName("Acme Technologies")).toBe("acme");
    expect(canonicalizeCompanyName("Acme Technology")).toBe("acme");
    expect(canonicalizeCompanyName("Acme Labs")).toBe("acme");
    expect(canonicalizeCompanyName("Acme Holdings")).toBe("acme");
    expect(canonicalizeCompanyName("Acme Group")).toBe("acme");
    expect(canonicalizeCompanyName("Acme Ventures")).toBe("acme");
    expect(canonicalizeCompanyName("Acme Systems")).toBe("acme");
    expect(canonicalizeCompanyName("Acme Solutions")).toBe("acme");
    expect(canonicalizeCompanyName("Acme Software")).toBe("acme");
    expect(canonicalizeCompanyName("Acme Platforms")).toBe("acme");
  });

  it("handles case insensitivity", () => {
    expect(canonicalizeCompanyName("STRIPE")).toBe("stripe");
    expect(canonicalizeCompanyName("Stripe")).toBe("stripe");
    expect(canonicalizeCompanyName("StRiPe Inc")).toBe("stripe");
  });

  it("removes punctuation and spaces", () => {
    expect(canonicalizeCompanyName("23andMe")).toBe("23andme");
    expect(canonicalizeCompanyName("Hello, World")).toBe("helloworld");
    expect(canonicalizeCompanyName("Acme, Inc.")).toBe("acme");
  });

  it("handles names without suffixes", () => {
    expect(canonicalizeCompanyName("Notion")).toBe("notion");
    expect(canonicalizeCompanyName("Vercel")).toBe("vercel");
  });

  it("handles empty and whitespace input", () => {
    expect(canonicalizeCompanyName("")).toBe("");
    expect(canonicalizeCompanyName("  ")).toBe("");
  });

  it("handles multi-word names without suffixes", () => {
    expect(canonicalizeCompanyName("Buffalo Wild Wings")).toBe(
      "buffalowildwings",
    );
  });
});

// ── generateSlugVariants ─────────────────────────────────────────────────────

describe("generateSlugVariants", () => {
  it("returns canonical as first variant for single-word names", () => {
    const variants = generateSlugVariants("Stripe");
    expect(variants).toContain("stripe");
    expect(variants).toHaveLength(1); // No first word or acronym for single word
  });

  it("generates first word variant for multi-word names", () => {
    const variants = generateSlugVariants("Buffalo Wild Wings");
    expect(variants).toContain("buffalowildwings"); // canonical
    expect(variants).toContain("buffalo"); // first word
  });

  it("generates acronym variant for multi-word names", () => {
    const variants = generateSlugVariants("Buffalo Wild Wings");
    expect(variants).toContain("bww"); // acronym
  });

  it("returns only canonical for single-word names", () => {
    const variants = generateSlugVariants("23andMe");
    expect(variants).toEqual(["23andme"]);
  });

  it("handles names with suffixes (canonical strips them)", () => {
    const variants = generateSlugVariants("Acme Technologies Inc");
    // canonical: "acme" (suffixes stripped)
    // first word: "acme"
    // acronym: "ati"
    expect(variants).toContain("acme");
    expect(variants).toContain("ati");
  });

  it("deduplicates variants", () => {
    // "Acme Inc" → canonical "acme", first word "acme" — should not duplicate
    const variants = generateSlugVariants("Acme Inc");
    const unique = [...new Set(variants)];
    expect(variants).toHaveLength(unique.length);
  });
});

// ── resolveSlugger — Stage 0: DB cache ───────────────────────────────────────

describe("resolveSlugger — Stage 0: DB cache hit", () => {
  it("returns cached result without probing APIs", async () => {
    const mockDbCache = makeMockDbCache({
      stripe: { atsSource: "greenhouse", atsSlug: "stripe" },
    });
    const mockFetch = makeMockFetch([]);
    const mockCname = makeMockCnameResolver({});

    const result = await resolveSlugger(
      { companyName: "Stripe Inc" },
      {
        fetchFn: mockFetch,
        resolveCname: mockCname,
        checkDbCache: mockDbCache,
        addToRetryOnFailure: false,
      },
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.resolvedBy).toBe("db_cache");
      expect(result.atsSource).toBe("greenhouse");
      expect(result.atsSlug).toBe("stripe");
      expect(result.canonicalName).toBe("stripe");
    }
    // Verify no API calls were made
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockCname).not.toHaveBeenCalled();
  });

  it("canonicalizes the name before DB cache lookup", async () => {
    const mockDbCache = makeMockDbCache({
      docker: { atsSource: "lever", atsSlug: "docker" },
    });

    const result = await resolveSlugger(
      { companyName: "Docker Inc." },
      {
        checkDbCache: mockDbCache,
        addToRetryOnFailure: false,
      },
    );

    expect(result.success).toBe(true);
    expect(mockDbCache).toHaveBeenCalledWith("docker");
  });
});

// ── resolveSlugger — Stage 1: CNAME resolution ───────────────────────────────

describe("resolveSlugger — Stage 1: CNAME resolution", () => {
  it("resolves via CNAME when website is provided", async () => {
    const mockDbCache = makeMockDbCache({});
    const mockCname = makeMockCnameResolver({
      "careers.acme.com": ["boards.greenhouse.io"],
    });
    const mockFetch = makeMockFetch([]);

    const result = await resolveSlugger(
      { companyName: "Acme Corp", website: "https://careers.acme.com" },
      {
        fetchFn: mockFetch,
        resolveCname: mockCname,
        checkDbCache: mockDbCache,
        addToRetryOnFailure: false,
      },
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.resolvedBy).toBe("cname");
      expect(result.atsSource).toBe("greenhouse");
      expect(result.atsSlug).toBe("acme");
    }
  });

  it("skips CNAME check when no website is provided", async () => {
    const mockDbCache = makeMockDbCache({});
    const mockCname = makeMockCnameResolver({});

    const result = await resolveSlugger(
      { companyName: "Acme" },
      {
        resolveCname: mockCname,
        checkDbCache: mockDbCache,
        addToRetryOnFailure: false,
        fetchFn: makeMockFetch([]),
      },
    );

    expect(result.success).toBe(false); // No ATS matched
    expect(mockCname).not.toHaveBeenCalled();
  });
});

// ── resolveSlugger — Stage 2: Slug probe ─────────────────────────────────────

describe("resolveSlugger — Stage 2: Slug probe", () => {
  it("resolves via slug probe against Greenhouse", async () => {
    const mockDbCache = makeMockDbCache({});
    const mockFetch = makeMockFetch([
      {
        urlPattern: "boards-api.greenhouse.io/v1/boards/notion",
        status: 200,
        body: JSON.stringify({ jobs: [{ id: 1, title: "Engineer" }] }),
      },
    ]);

    const result = await resolveSlugger(
      { companyName: "Notion" },
      {
        fetchFn: mockFetch,
        checkDbCache: mockDbCache,
        addToRetryOnFailure: false,
      },
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.resolvedBy).toBe("slug_probe");
      expect(result.atsSlug).toBe("notion");
    }
  });

  it("resolves via slug probe against Lever", async () => {
    const mockDbCache = makeMockDbCache({});
    const mockFetch = makeMockFetch([
      {
        urlPattern: "api.lever.co/v0/postings/",
        status: 200,
        body: JSON.stringify([{ id: "abc", title: "Engineer" }]),
      },
    ]);

    const result = await resolveSlugger(
      { companyName: "Ramp" },
      {
        fetchFn: mockFetch,
        checkDbCache: mockDbCache,
        addToRetryOnFailure: false,
      },
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.resolvedBy).toBe("slug_probe");
      expect(result.atsSource).toBe("lever");
      expect(result.atsSlug).toBe("ramp");
    }
  });

  it("resolves via slug probe against SmartRecruiters", async () => {
    const mockDbCache = makeMockCache({});
    const mockFetch = makeMockFetch([
      {
        urlPattern: "api.smartrecruiters.com/v1/companies/",
        status: 200,
        body: JSON.stringify({ content: [{ id: "1", name: "Engineer" }] }),
      },
    ]);

    const result = await resolveSlugger(
      { companyName: "Visa" },
      {
        fetchFn: mockFetch,
        checkDbCache: mockDbCache,
        addToRetryOnFailure: false,
      },
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.resolvedBy).toBe("slug_probe");
      expect(result.atsSource).toBe("smartrecruiters");
    }
  });

  it("resolves via slug probe against Workable (bare array)", async () => {
    const mockDbCache = makeMockCache({});
    const mockFetch = makeMockFetch([
      {
        urlPattern: "apply.workable.com/api/v1/widget/accounts/",
        status: 200,
        body: JSON.stringify([{ title: "Engineer", shortcode: "ABC" }]),
      },
    ]);

    const result = await resolveSlugger(
      { companyName: "Allucent" },
      {
        fetchFn: mockFetch,
        checkDbCache: mockDbCache,
        addToRetryOnFailure: false,
      },
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.resolvedBy).toBe("slug_probe");
      expect(result.atsSource).toBe("workable");
    }
  });

  it("resolves via slug probe against Recruitee", async () => {
    const mockDbCache = makeMockCache({});
    const mockFetch = makeMockFetch([
      {
        urlPattern: "api.recruitee.com/v1/companies/tellent",
        status: 200,
        body: JSON.stringify({ offers: [{ id: 1, title: "Engineer" }] }),
      },
    ]);

    const result = await resolveSlugger(
      { companyName: "Tellent" },
      {
        fetchFn: mockFetch,
        checkDbCache: mockDbCache,
        addToRetryOnFailure: false,
      },
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.resolvedBy).toBe("slug_probe");
      expect(result.atsSource).toBe("recruitee");
    }
  });

  it("tries first word variant when canonical fails", async () => {
    const mockDbCache = makeMockCache({});
    // All ATS return 404 for "buffalowildwings", but Lever succeeds with
    // first word "buffalo". Use exact URL patterns to avoid substring matches
    // (e.g. "buffalo" matching "buffalowildwings").
    const mockFetch = makeMockFetch([
      {
        urlPattern: "api.lever.co/v0/postings/buffalo?mode=json",
        status: 200,
        body: JSON.stringify([{ id: "abc", title: "Engineer" }]),
      },
    ]);

    const result = await resolveSlugger(
      { companyName: "Buffalo Wild Wings" },
      {
        fetchFn: mockFetch,
        checkDbCache: mockDbCache,
        addToRetryOnFailure: false,
      },
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.atsSlug).toBe("buffalo");
    }
  });

  it("uses atsHint to probe only the hinted ATS", async () => {
    const mockDbCache = makeMockCache({});
    const mockFetch = makeMockFetch([
      {
        urlPattern: "api.lever.co/v0/postings/acme",
        status: 200,
        body: JSON.stringify([{ id: "abc", title: "Engineer" }]),
      },
    ]);

    const result = await resolveSlugger(
      { companyName: "Acme", atsHint: "lever" },
      {
        fetchFn: mockFetch,
        checkDbCache: mockDbCache,
        addToRetryOnFailure: false,
      },
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.atsSource).toBe("lever");
    }
    // Verify only Lever was probed (not Greenhouse, Ashby, etc.)
    const calls = (
      mockFetch as unknown as { mock: { calls: string[][] } }
    ).mock.calls.map((c) => c[0]);
    for (const url of calls) {
      expect(url).toContain("lever.co");
    }
  });
});

// ── resolveSlugger — All stages fail ─────────────────────────────────────────

describe("resolveSlugger — All stages fail", () => {
  it("returns failure when all stages fail", async () => {
    const mockDbCache = makeMockCache({});
    const mockFetch = makeMockFetch([]); // All 404

    const result = await resolveSlugger(
      { companyName: "Nonexistent Company" },
      {
        fetchFn: mockFetch,
        checkDbCache: mockDbCache,
        addToRetryOnFailure: false,
      },
    );

    expect(result.success).toBe(false);
    expect(result.canonicalName).toBe("nonexistentcompany");
  });
});

// ── Helper alias to keep tests readable ──────────────────────────────────────

function makeMockCache(
  mappings: Record<
    string,
    {
      atsSource: import("@/lib/jobs/ats-endpoints").AtsSource;
      atsSlug: string;
    } | null
  >,
) {
  return makeMockDbCache(mappings);
}
