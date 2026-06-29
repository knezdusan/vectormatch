/**
 * Unit tests for D6 — CertStream processor (TDD §2.2 D6)
 *
 * Tests:
 *   - extractDomainsFromMessage: domain extraction from CertStream messages
 *   - filterCareerPageDomains: career-page pattern matching
 *   - deduplicateDomains: domain deduplication
 *   - runCertStreamProcessor: full seeder with mocked collectFn + CNAME + Slugger
 *   - Error handling: WebSocket failure, DNS failure, Slugger failure
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the db module (used by Slugger)
vi.mock("@/db/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
  },
}));

// Mock the Slugger
vi.mock("@/lib/jobs/seeders/slugger", () => ({
  resolveSlugger: vi.fn(),
}));

import {
  type CertStreamMessage,
  deduplicateDomains,
  extractDomainsFromMessage,
  filterCareerPageDomains,
  runCertStreamProcessor,
} from "@/lib/jobs/seeders/daily-sources/certstream-processor";
import { resolveSlugger } from "@/lib/jobs/seeders/slugger";
import type { FetchFn } from "@/lib/jobs/types";

// ── Test fixtures ────────────────────────────────────────────────────────────

function makeCertMessage(domains: string[]): CertStreamMessage {
  return {
    message_type: "certificate_update",
    data: {
      leaf_cert: {
        all_domains: domains,
      },
    },
  };
}

function makeSuccessResult(companyName: string) {
  return {
    success: true as const,
    atsSource: "greenhouse" as const,
    atsSlug: companyName.toLowerCase(),
    resolvedBy: "slug_probe" as const,
    canonicalName: companyName,
  };
}

const mockFetchFn = vi.fn() as unknown as FetchFn;

// ── extractDomainsFromMessage ────────────────────────────────────────────────

describe("extractDomainsFromMessage", () => {
  it("extracts domains from a certificate_update message", () => {
    const msg = makeCertMessage(["careers.acme.com", "www.acme.com"]);
    expect(extractDomainsFromMessage(msg)).toEqual([
      "careers.acme.com",
      "www.acme.com",
    ]);
  });

  it("lowercases and trims domains", () => {
    const msg = makeCertMessage(["  Careers.Acme.COM  ", "WWW.ACM E.COM"]);
    expect(extractDomainsFromMessage(msg)).toEqual([
      "careers.acme.com",
      "www.acm e.com",
    ]);
  });

  it("deduplicates domains within a single message", () => {
    const msg = makeCertMessage([
      "careers.acme.com",
      "careers.acme.com",
      "www.acme.com",
    ]);
    expect(extractDomainsFromMessage(msg)).toEqual([
      "careers.acme.com",
      "www.acme.com",
    ]);
  });

  it("returns empty array for non-certificate_update messages", () => {
    const msg: CertStreamMessage = {
      message_type: "heartbeat",
      data: { leaf_cert: { all_domains: ["careers.acme.com"] } },
    };
    expect(extractDomainsFromMessage(msg)).toEqual([]);
  });

  it("returns empty array when all_domains is missing", () => {
    const msg: CertStreamMessage = {
      message_type: "certificate_update",
      data: { leaf_cert: {} },
    };
    expect(extractDomainsFromMessage(msg)).toEqual([]);
  });

  it("returns empty array when all_domains is not an array", () => {
    const msg = {
      message_type: "certificate_update",
      data: { leaf_cert: { all_domains: "not-an-array" } },
    } as unknown as CertStreamMessage;
    expect(extractDomainsFromMessage(msg)).toEqual([]);
  });

  it("skips empty domain strings", () => {
    const msg = makeCertMessage(["", "  ", "careers.acme.com"]);
    expect(extractDomainsFromMessage(msg)).toEqual(["careers.acme.com"]);
  });
});

// ── filterCareerPageDomains ──────────────────────────────────────────────────

describe("filterCareerPageDomains", () => {
  it("filters for career-page-like subdomains", () => {
    const domains = [
      "careers.acme.com",
      "www.acme.com",
      "jobs.stripe.com",
      "api.stripe.com",
      "boards.acme.io",
      "apply.foo.dev",
    ];
    expect(filterCareerPageDomains(domains)).toEqual([
      "careers.acme.com",
      "jobs.stripe.com",
      "boards.acme.io",
      "apply.foo.dev",
    ]);
  });

  it("includes hiring, openings, career, job, recruiting, talent labels", () => {
    const domains = [
      "hiring.acme.com",
      "openings.acme.com",
      "career.acme.com",
      "job.acme.com",
      "recruiting.acme.com",
      "talent.acme.com",
    ];
    expect(filterCareerPageDomains(domains)).toEqual(domains);
  });

  it("excludes bare domains (less than 3 labels)", () => {
    const domains = ["acme.com", "careers.com", "jobs.io"];
    expect(filterCareerPageDomains(domains)).toEqual([]);
  });

  it("excludes non-career subdomains", () => {
    const domains = ["www.acme.com", "api.acme.com", "blog.acme.com"];
    expect(filterCareerPageDomains(domains)).toEqual([]);
  });

  it("returns empty array for empty input", () => {
    expect(filterCareerPageDomains([])).toEqual([]);
  });
});

// ── deduplicateDomains ───────────────────────────────────────────────────────

describe("deduplicateDomains", () => {
  it("removes exact duplicates", () => {
    expect(
      deduplicateDomains([
        "careers.acme.com",
        "careers.acme.com",
        "jobs.stripe.com",
      ]),
    ).toEqual(["careers.acme.com", "jobs.stripe.com"]);
  });

  it("preserves first-occurrence order", () => {
    expect(
      deduplicateDomains([
        "jobs.stripe.com",
        "careers.acme.com",
        "jobs.stripe.com",
      ]),
    ).toEqual(["jobs.stripe.com", "careers.acme.com"]);
  });

  it("skips empty strings", () => {
    expect(deduplicateDomains(["", "  ", "careers.acme.com", ""])).toEqual([
      "careers.acme.com",
    ]);
  });

  it("returns empty array for empty input", () => {
    expect(deduplicateDomains([])).toEqual([]);
  });
});

// ── runCertStreamProcessor ───────────────────────────────────────────────────

describe("runCertStreamProcessor", () => {
  beforeEach(() => {
    vi.mocked(resolveSlugger).mockReset();
    vi.mocked(resolveSlugger).mockResolvedValue(makeSuccessResult("acme"));
  });

  it("collects, filters, CNAME-checks, and resolves companies", async () => {
    const messages = [
      makeCertMessage(["careers.acme.com", "www.acme.com"]),
      makeCertMessage(["jobs.stripe.com", "api.stripe.com"]),
      makeCertMessage(["blog.foo.com"]), // not a career page
    ];

    const mockCollect = vi.fn(async () => messages);
    const mockResolveCname = vi.fn(async (hostname: string) => {
      if (hostname === "careers.acme.com") return ["boards.greenhouse.io"];
      if (hostname === "jobs.stripe.com") return ["jobs.lever.co"];
      return [];
    });

    const result = await runCertStreamProcessor(mockFetchFn, {
      durationMs: 1000,
      collectFn: mockCollect,
      resolveCname: mockResolveCname,
    });

    expect(result.totalCertificates).toBe(3);
    expect(result.careerPageDomains).toBe(2); // careers.acme.com, jobs.stripe.com
    expect(result.uniqueCareerDomains).toBe(2);
    expect(result.atsCnameMatches).toBe(2);
    expect(result.resolved).toBe(2);
    expect(result.unresolved).toBe(0);
    expect(result.error).toBeUndefined();
  });

  it("deduplicates domains across messages", async () => {
    const messages = [
      makeCertMessage(["careers.acme.com"]),
      makeCertMessage(["careers.acme.com", "jobs.stripe.com"]),
    ];

    const mockCollect = vi.fn(async () => messages);
    const mockResolveCname = vi.fn(async (hostname: string) => {
      if (hostname === "careers.acme.com") return ["boards.greenhouse.io"];
      if (hostname === "jobs.stripe.com") return ["jobs.lever.co"];
      return [];
    });

    const result = await runCertStreamProcessor(mockFetchFn, {
      durationMs: 1000,
      collectFn: mockCollect,
      resolveCname: mockResolveCname,
    });

    expect(result.uniqueCareerDomains).toBe(2);
    expect(result.atsCnameMatches).toBe(2);
    expect(mockResolveCname).toHaveBeenCalledTimes(2);
  });

  it("skips domains where CNAME does not point to ATS", async () => {
    const messages = [
      makeCertMessage(["careers.acme.com"]),
      makeCertMessage(["jobs.nonats.com"]),
    ];

    const mockCollect = vi.fn(async () => messages);
    const mockResolveCname = vi.fn(async (hostname: string) => {
      if (hostname === "careers.acme.com") return ["boards.greenhouse.io"];
      if (hostname === "jobs.nonats.com") return ["cdn.cloudflare.net"];
      return [];
    });

    const result = await runCertStreamProcessor(mockFetchFn, {
      durationMs: 1000,
      collectFn: mockCollect,
      resolveCname: mockResolveCname,
    });

    expect(result.atsCnameMatches).toBe(1);
    expect(result.resolved).toBe(1);
  });

  it("skips domains where CNAME resolution fails", async () => {
    const messages = [
      makeCertMessage(["careers.acme.com"]),
      makeCertMessage(["jobs.baddns.com"]),
    ];

    const mockCollect = vi.fn(async () => messages);
    const mockResolveCname = vi.fn(async (hostname: string) => {
      if (hostname === "careers.acme.com") return ["boards.greenhouse.io"];
      if (hostname === "jobs.baddns.com") throw new Error("ENOTFOUND");
      return [];
    });

    const result = await runCertStreamProcessor(mockFetchFn, {
      durationMs: 1000,
      collectFn: mockCollect,
      resolveCname: mockResolveCname,
    });

    expect(result.atsCnameMatches).toBe(1);
    expect(result.resolved).toBe(1);
  });

  it("counts unresolved when Slugger returns failure", async () => {
    const messages = [makeCertMessage(["careers.acme.com"])];
    const mockCollect = vi.fn(async () => messages);
    const mockResolveCname = vi.fn(async () => ["boards.greenhouse.io"]);

    vi.mocked(resolveSlugger).mockResolvedValueOnce({
      success: false,
      canonicalName: "acme",
    });

    const result = await runCertStreamProcessor(mockFetchFn, {
      durationMs: 1000,
      collectFn: mockCollect,
      resolveCname: mockResolveCname,
    });

    expect(result.atsCnameMatches).toBe(1);
    expect(result.resolved).toBe(0);
    expect(result.unresolved).toBe(1);
  });

  it("counts unresolved when Slugger throws", async () => {
    const messages = [makeCertMessage(["careers.acme.com"])];
    const mockCollect = vi.fn(async () => messages);
    const mockResolveCname = vi.fn(async () => ["boards.greenhouse.io"]);

    vi.mocked(resolveSlugger).mockRejectedValueOnce(new Error("slugger error"));

    const result = await runCertStreamProcessor(mockFetchFn, {
      durationMs: 1000,
      collectFn: mockCollect,
      resolveCname: mockResolveCname,
    });

    expect(result.atsCnameMatches).toBe(1);
    expect(result.resolved).toBe(0);
    expect(result.unresolved).toBe(1);
  });

  it("passes correct Slugger input with website and atsHint", async () => {
    const messages = [makeCertMessage(["careers.acme.com"])];
    const mockCollect = vi.fn(async () => messages);
    const mockResolveCname = vi.fn(async () => ["boards.greenhouse.io"]);

    await runCertStreamProcessor(mockFetchFn, {
      durationMs: 1000,
      collectFn: mockCollect,
      resolveCname: mockResolveCname,
    });

    expect(resolveSlugger).toHaveBeenCalledTimes(1);
    const [input, opts] = vi.mocked(resolveSlugger).mock.calls[0];
    expect(input.companyName).toBe("acme");
    expect(input.website).toBe("https://careers.acme.com");
    expect(input.atsHint).toBe("greenhouse");
    expect(input.discoveryContext).toContain("certstream:careers.acme.com");
    expect(input.discoveryContext).toContain("boards.greenhouse.io");
    expect(opts?.insertCompany).toBe(true);
  });

  it("returns error result when collectFn throws", async () => {
    const mockCollect = vi.fn(async () => {
      throw new Error("WebSocket connection failed");
    });
    const mockResolveCname = vi.fn(async () => []);

    const result = await runCertStreamProcessor(mockFetchFn, {
      durationMs: 1000,
      collectFn: mockCollect,
      resolveCname: mockResolveCname,
    });

    expect(result.error).toBe("WebSocket connection failed");
    expect(result.totalCertificates).toBe(0);
    expect(result.resolved).toBe(0);
  });

  it("handles empty message collection", async () => {
    const mockCollect = vi.fn(async () => []);
    const mockResolveCname = vi.fn(async () => []);

    const result = await runCertStreamProcessor(mockFetchFn, {
      durationMs: 1000,
      collectFn: mockCollect,
      resolveCname: mockResolveCname,
    });

    expect(result.totalCertificates).toBe(0);
    expect(result.careerPageDomains).toBe(0);
    expect(result.uniqueCareerDomains).toBe(0);
    expect(result.atsCnameMatches).toBe(0);
    expect(result.resolved).toBe(0);
    expect(result.unresolved).toBe(0);
    expect(result.error).toBeUndefined();
  });

  it("handles messages with no career-page domains", async () => {
    const messages = [
      makeCertMessage(["www.acme.com", "api.acme.com"]),
      makeCertMessage(["blog.foo.com"]),
    ];
    const mockCollect = vi.fn(async () => messages);
    const mockResolveCname = vi.fn(async () => []);

    const result = await runCertStreamProcessor(mockFetchFn, {
      durationMs: 1000,
      collectFn: mockCollect,
      resolveCname: mockResolveCname,
    });

    expect(result.totalCertificates).toBe(2);
    expect(result.careerPageDomains).toBe(0);
    expect(result.atsCnameMatches).toBe(0);
  });

  it("uses default durationMs of 60000 when not specified", async () => {
    const mockCollect = vi.fn(async (_durationMs: number) => []);
    const mockResolveCname = vi.fn(async () => []);

    await runCertStreamProcessor(mockFetchFn, {
      collectFn: mockCollect,
      resolveCname: mockResolveCname,
    });

    expect(mockCollect).toHaveBeenCalledWith(60_000);
  });

  it("detects all ATS CNAME targets", async () => {
    const messages = [
      makeCertMessage(["careers.g.co"]),
      makeCertMessage(["jobs.l.co"]),
      makeCertMessage(["boards.a.co"]),
      makeCertMessage(["apply.s.co"]),
      makeCertMessage(["jobs.w.co"]),
      makeCertMessage(["careers.r.co"]),
    ];
    const mockCollect = vi.fn(async () => messages);
    const mockResolveCname = vi.fn(async (hostname: string) => {
      const map: Record<string, string> = {
        "careers.g.co": "boards.greenhouse.io",
        "jobs.l.co": "jobs.lever.co",
        "boards.a.co": "jobs.ashbyhq.com",
        "apply.s.co": "jobs.smartrecruiters.com",
        "jobs.w.co": "apply.workable.com",
        "careers.r.co": "recruitee.com",
      };
      return map[hostname] ? [map[hostname]] : [];
    });

    vi.mocked(resolveSlugger).mockReset();
    for (let i = 0; i < 6; i++) {
      vi.mocked(resolveSlugger).mockResolvedValueOnce(makeSuccessResult("co"));
    }

    const result = await runCertStreamProcessor(mockFetchFn, {
      durationMs: 1000,
      collectFn: mockCollect,
      resolveCname: mockResolveCname,
    });

    expect(result.atsCnameMatches).toBe(6);
    expect(result.resolved).toBe(6);
  });
});
