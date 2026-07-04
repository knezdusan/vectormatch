/**
 * Unit tests for B8 — crt.sh Certificate Transparency Seeder (Sprint 4 Task 2)
 *
 * Tests:
 *   - extractSlugFromCertDomain: slug extraction from certificate domains
 *   - extractCompaniesFromCrtResponse: JSON parsing, dedup, multi-domain name_value
 *   - runCrtShBatch: full seeder with mocked fetch + DB insert
 *   - Error handling: API failures, network errors
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the company-repository module
vi.mock("@/lib/jobs/seeders/company-repository", () => ({
  insertDiscoveredCompanies: vi.fn().mockResolvedValue({
    inserted: 0,
    skipped: 0,
    rejected: [],
    insertedCompanyIds: [],
    insertedCompanies: [],
  }),
}));

import {
  extractCompaniesFromCrtResponse,
  extractSlugFromCertDomain,
  runCrtShBatch,
} from "@/lib/jobs/seeders/batch-sources/crt-sh";
import { insertDiscoveredCompanies } from "@/lib/jobs/seeders/company-repository";
import type { FetchFn } from "@/lib/jobs/types";

// ── Mock fetch helper ────────────────────────────────────────────────────────

function mockCrtFetch(responses: { body: unknown }[]): FetchFn {
  let callIndex = 0;
  const mock = vi.fn(async () => {
    const resp = responses[Math.min(callIndex, responses.length - 1)];
    callIndex++;
    return new Response(JSON.stringify(resp.body), { status: 200 });
  });
  return mock as unknown as FetchFn;
}

// ── extractSlugFromCertDomain ────────────────────────────────────────────────

describe("extractSlugFromCertDomain", () => {
  it("extracts slug from a Greenhouse subdomain", () => {
    expect(
      extractSlugFromCertDomain(
        "acme.boards.greenhouse.io",
        "boards.greenhouse.io",
        "greenhouse",
      ),
    ).toEqual({ slug: "acme", source: "greenhouse" });
  });

  it("extracts slug from a Lever subdomain", () => {
    expect(
      extractSlugFromCertDomain("acme.jobs.lever.co", "jobs.lever.co", "lever"),
    ).toEqual({ slug: "acme", source: "lever" });
  });

  it("extracts slug from a Recruitee subdomain", () => {
    expect(
      extractSlugFromCertDomain(
        "acme.recruitee.com",
        "recruitee.com",
        "recruitee",
      ),
    ).toEqual({ slug: "acme", source: "recruitee" });
  });

  it("rejects wildcard certs (*.domain)", () => {
    expect(
      extractSlugFromCertDomain(
        "*.boards.greenhouse.io",
        "boards.greenhouse.io",
        "greenhouse",
      ),
    ).toBeNull();
  });

  it("rejects bare ATS domain (no subdomain)", () => {
    expect(
      extractSlugFromCertDomain(
        "boards.greenhouse.io",
        "boards.greenhouse.io",
        "greenhouse",
      ),
    ).toBeNull();
  });

  it("rejects www subdomain", () => {
    expect(
      extractSlugFromCertDomain(
        "www.boards.greenhouse.io",
        "boards.greenhouse.io",
        "greenhouse",
      ),
    ).toBeNull();
  });

  it("rejects mail/api/blog subdomains", () => {
    for (const label of ["mail", "api", "blog", "cdn", "static"]) {
      expect(
        extractSlugFromCertDomain(
          `${label}.boards.greenhouse.io`,
          "boards.greenhouse.io",
          "greenhouse",
        ),
      ).toBeNull();
    }
  });

  it("rejects domains that are not subdomains of the ATS domain", () => {
    expect(
      extractSlugFromCertDomain(
        "acme.example.com",
        "boards.greenhouse.io",
        "greenhouse",
      ),
    ).toBeNull();
  });

  it("handles uppercase hostnames (lowercases the slug)", () => {
    expect(
      extractSlugFromCertDomain(
        "ACME.boards.greenhouse.io",
        "boards.greenhouse.io",
        "greenhouse",
      ),
    ).toEqual({ slug: "acme", source: "greenhouse" });
  });

  it("handles whitespace around the domain", () => {
    expect(
      extractSlugFromCertDomain(
        "  acme.boards.greenhouse.io  ",
        "boards.greenhouse.io",
        "greenhouse",
      ),
    ).toEqual({ slug: "acme", source: "greenhouse" });
  });
});

// ── extractCompaniesFromCrtResponse ──────────────────────────────────────────

describe("extractCompaniesFromCrtResponse", () => {
  it("extracts unique company inputs from crt.sh JSON", () => {
    const json = [
      { name_value: "acme.boards.greenhouse.io", min_cert_id: 1 },
      { name_value: "foobar.boards.greenhouse.io", min_cert_id: 2 },
    ];

    const inputs = extractCompaniesFromCrtResponse(
      json,
      "boards.greenhouse.io",
      "greenhouse",
    );

    expect(inputs).toHaveLength(2);
    expect(inputs[0].atsSlug).toBe("acme");
    expect(inputs[0].atsSource).toBe("greenhouse");
    expect(inputs[0].discoverySource).toBe("crt_sh");
  });

  it("splits multi-domain name_value (separated by \\n)", () => {
    const json = [
      {
        name_value: "acme.boards.greenhouse.io\nfoobar.boards.greenhouse.io",
        min_cert_id: 1,
      },
    ];

    const inputs = extractCompaniesFromCrtResponse(
      json,
      "boards.greenhouse.io",
      "greenhouse",
    );

    expect(inputs).toHaveLength(2);
    expect(inputs[0].atsSlug).toBe("acme");
    expect(inputs[1].atsSlug).toBe("foobar");
  });

  it("deduplicates by (atsSource, atsSlug)", () => {
    const json = [
      { name_value: "acme.boards.greenhouse.io", min_cert_id: 1 },
      { name_value: "acme.boards.greenhouse.io", min_cert_id: 2 },
      {
        name_value: "acme.boards.greenhouse.io\nacme.boards.greenhouse.io",
        min_cert_id: 3,
      },
    ];

    const inputs = extractCompaniesFromCrtResponse(
      json,
      "boards.greenhouse.io",
      "greenhouse",
    );

    expect(inputs).toHaveLength(1);
  });

  it("skips entries where slug can't be extracted", () => {
    const json = [
      { name_value: "boards.greenhouse.io", min_cert_id: 1 }, // bare domain
      { name_value: "*.boards.greenhouse.io", min_cert_id: 2 }, // wildcard
      { name_value: "www.boards.greenhouse.io", min_cert_id: 3 }, // www
      { name_value: "acme.boards.greenhouse.io", min_cert_id: 4 }, // valid
    ];

    const inputs = extractCompaniesFromCrtResponse(
      json,
      "boards.greenhouse.io",
      "greenhouse",
    );

    expect(inputs).toHaveLength(1);
    expect(inputs[0].atsSlug).toBe("acme");
  });

  it("skips entries with missing or non-string name_value", () => {
    const json = [
      { min_cert_id: 1 }, // no name_value
      { name_value: 123, min_cert_id: 2 }, // non-string
      { name_value: null, min_cert_id: 3 },
      { name_value: "acme.boards.greenhouse.io", min_cert_id: 4 },
    ];

    const inputs = extractCompaniesFromCrtResponse(
      json,
      "boards.greenhouse.io",
      "greenhouse",
    );

    expect(inputs).toHaveLength(1);
  });

  it("handles empty JSON array", () => {
    const inputs = extractCompaniesFromCrtResponse(
      [],
      "boards.greenhouse.io",
      "greenhouse",
    );
    expect(inputs).toHaveLength(0);
  });

  it("handles non-array input gracefully", () => {
    expect(
      extractCompaniesFromCrtResponse(
        { not: "an array" },
        "boards.greenhouse.io",
        "greenhouse",
      ),
    ).toHaveLength(0);
    expect(
      extractCompaniesFromCrtResponse(
        null,
        "boards.greenhouse.io",
        "greenhouse",
      ),
    ).toHaveLength(0);
  });

  it("skips non-object array entries", () => {
    const json = [
      "not-an-object",
      42,
      null,
      { name_value: "acme.boards.greenhouse.io" },
    ];

    const inputs = extractCompaniesFromCrtResponse(
      json,
      "boards.greenhouse.io",
      "greenhouse",
    );

    expect(inputs).toHaveLength(1);
    expect(inputs[0].atsSlug).toBe("acme");
  });

  it("includes discoveryContext with the certificate domain", () => {
    const json = [{ name_value: "acme.boards.greenhouse.io", min_cert_id: 1 }];

    const inputs = extractCompaniesFromCrtResponse(
      json,
      "boards.greenhouse.io",
      "greenhouse",
    );

    expect(inputs[0].discoveryContext).toContain("crt_sh:");
    expect(inputs[0].discoveryContext).toContain("acme.boards.greenhouse.io");
  });
});

// ── runCrtShBatch ────────────────────────────────────────────────────────────

describe("runCrtShBatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(insertDiscoveredCompanies).mockResolvedValue({
      inserted: 2,
      skipped: 0,
      rejected: [],
      insertedCompanyIds: ["id-1", "id-2"],
      insertedCompanies: [],
      aggregatorFiltered: 0,
    });
  });

  it("queries all 6 ATS domains and inserts companies", async () => {
    const fetchFn = mockCrtFetch([
      { body: [{ name_value: "acme.boards.greenhouse.io" }] },
      { body: [{ name_value: "foobar.jobs.lever.co" }] },
      { body: [] }, // Ashby: no results
      { body: [] }, // SmartRecruiters: no results
      { body: [] }, // Workable: no results
      { body: [] }, // Recruitee: no results
    ]);

    const result = await runCrtShBatch(fetchFn);

    expect(fetchFn).toHaveBeenCalledTimes(6);
    expect(result.totalRows).toBe(2);
    expect(result.uniqueCompanySlugs).toBe(2);
    expect(result.insertResult.inserted).toBe(2);
    expect(result.error).toBeUndefined();
  });

  it("deduplicates across ATS domains", async () => {
    // Same slug "acme" appears for both Greenhouse and Lever — both are kept
    // because the dedup key is (atsSource, atsSlug).
    const fetchFn = mockCrtFetch([
      { body: [{ name_value: "acme.boards.greenhouse.io" }] },
      { body: [{ name_value: "acme.jobs.lever.co" }] },
      { body: [] },
      { body: [] },
      { body: [] },
      { body: [] },
    ]);

    const result = await runCrtShBatch(fetchFn);

    expect(result.uniqueCompanySlugs).toBe(2);
  });

  it("continues on individual domain fetch failure", async () => {
    const failingFetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([{ name_value: "acme.boards.greenhouse.io" }]),
          { status: 200 },
        ),
      )
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValue(
        new Response(JSON.stringify([{ name_value: "baz.jobs.ashbyhq.com" }]), {
          status: 200,
        }),
      );

    const result = await runCrtShBatch(failingFetch as unknown as FetchFn);

    expect(result.uniqueCompanySlugs).toBe(2); // acme (greenhouse) + baz (ashby)
    expect(result.error).toBeUndefined();
  });

  it("returns error result when insertDiscoveredCompanies throws", async () => {
    vi.mocked(insertDiscoveredCompanies).mockRejectedValueOnce(
      new Error("DB connection failed"),
    );

    const fetchFn = mockCrtFetch([
      { body: [{ name_value: "acme.boards.greenhouse.io" }] },
      { body: [] },
      { body: [] },
      { body: [] },
      { body: [] },
      { body: [] },
    ]);

    const result = await runCrtShBatch(fetchFn);

    expect(result.error).toBe("DB connection failed");
    expect(result.insertResult.inserted).toBe(0);
  });

  it("handles empty crt.sh responses for all domains", async () => {
    const fetchFn = mockCrtFetch([{ body: [] }]);

    const result = await runCrtShBatch(fetchFn);

    expect(result.totalRows).toBe(0);
    expect(result.uniqueCompanySlugs).toBe(0);
    expect(result.insertResult.inserted).toBe(2); // mock returns 2 regardless
  });

  it("handles HTTP error responses from crt.sh", async () => {
    const errorFetch = vi.fn(
      async () => new Response("Server Error", { status: 500 }),
    );

    const result = await runCrtShBatch(errorFetch as unknown as FetchFn);

    // All 6 domains fail → no companies extracted, no error at top level
    expect(result.totalRows).toBe(0);
    expect(result.uniqueCompanySlugs).toBe(0);
    expect(result.error).toBeUndefined();
  });
});
