/**
 * Unit tests for B8 — Rapid7 FDNS v2 CNAME Reversal Seeder (TDD §2.1)
 *
 * Tests:
 *   - parseFdnsLine: JSON line parsing
 *   - matchAtsCname: ATS domain matching from CNAME value
 *   - extractCompanyDomain: CNAME record → company domain extraction
 *   - inferCompanyNameFromDomain: domain root label extraction
 *   - runRapid7CnameSeeder: full seeder with temp gzipped file + mocked Slugger
 *   - Error handling: file not found, invalid JSON
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  extractCompanyDomain,
  type FdnsRecord,
  inferCompanyNameFromDomain,
  matchAtsCname,
  parseFdnsLine,
  runRapid7CnameSeeder,
} from "@/lib/jobs/seeders/batch-sources/rapid7-cname";
import { resolveSlugger } from "@/lib/jobs/seeders/slugger";

// ── Test fixtures ────────────────────────────────────────────────────────────

const greenhouseCname: FdnsRecord = {
  timestamp: "1492468299",
  name: "careers.acme.com",
  type: "cname",
  value: "boards.greenhouse.io",
};

const leverCname: FdnsRecord = {
  timestamp: "1492468300",
  name: "jobs.foobar.com",
  type: "cname",
  value: "jobs.lever.co",
};

const nonAtsCname: FdnsRecord = {
  timestamp: "1492468301",
  name: "cdn.example.com",
  type: "cname",
  value: "cloudfront.net",
};

const aRecord: FdnsRecord = {
  timestamp: "1492468302",
  name: "acme.com",
  type: "a",
  value: "1.2.3.4",
};

// ── parseFdnsLine ────────────────────────────────────────────────────────────

describe("parseFdnsLine", () => {
  it("parses a valid FDNS JSON line", () => {
    const line = JSON.stringify(greenhouseCname);
    const result = parseFdnsLine(line);
    expect(result).not.toBeNull();
    expect(result?.name).toBe("careers.acme.com");
    expect(result?.type).toBe("cname");
    expect(result?.value).toBe("boards.greenhouse.io");
  });

  it("returns null for invalid JSON", () => {
    expect(parseFdnsLine("not json")).toBeNull();
  });

  it("returns null for missing required fields", () => {
    expect(parseFdnsLine('{"timestamp":"123"}')).toBeNull();
    expect(parseFdnsLine('{"name":"test","type":"cname"}')).toBeNull();
  });

  it("handles empty line", () => {
    expect(parseFdnsLine("")).toBeNull();
  });
});

// ── matchAtsCname ────────────────────────────────────────────────────────────

describe("matchAtsCname", () => {
  it("matches Greenhouse CNAME", () => {
    const result = matchAtsCname("boards.greenhouse.io");
    expect(result).not.toBeNull();
    expect(result?.source).toBe("greenhouse");
  });

  it("matches Lever CNAME", () => {
    const result = matchAtsCname("jobs.lever.co");
    expect(result?.source).toBe("lever");
  });

  it("matches Ashby CNAME", () => {
    const result = matchAtsCname("jobs.ashbyhq.com");
    expect(result?.source).toBe("ashby");
  });

  it("matches SmartRecruiters CNAME", () => {
    const result = matchAtsCname("jobs.smartrecruiters.com");
    expect(result?.source).toBe("smartrecruiters");
  });

  it("matches Workable CNAME", () => {
    const result = matchAtsCname("apply.workable.com");
    expect(result?.source).toBe("workable");
  });

  it("matches Recruitee CNAME", () => {
    const result = matchAtsCname("recruitee.com");
    expect(result?.source).toBe("recruitee");
  });

  it("matches subdomain of ATS domain", () => {
    const result = matchAtsCname("acme.boards.greenhouse.io");
    expect(result?.source).toBe("greenhouse");
  });

  it("returns null for non-ATS CNAME", () => {
    expect(matchAtsCname("cloudfront.net")).toBeNull();
    expect(matchAtsCname("example.com")).toBeNull();
  });

  it("is case-insensitive", () => {
    const result = matchAtsCname("BOARDS.GREENHOUSE.IO");
    expect(result?.source).toBe("greenhouse");
  });
});

// ── extractCompanyDomain ─────────────────────────────────────────────────────

describe("extractCompanyDomain", () => {
  it("extracts company domain from Greenhouse CNAME", () => {
    const result = extractCompanyDomain(greenhouseCname);
    expect(result).not.toBeNull();
    expect(result?.domain).toBe("careers.acme.com");
    expect(result?.atsSource).toBe("greenhouse");
    expect(result?.cnameTarget).toBe("boards.greenhouse.io");
  });

  it("extracts company domain from Lever CNAME", () => {
    const result = extractCompanyDomain(leverCname);
    expect(result?.domain).toBe("jobs.foobar.com");
    expect(result?.atsSource).toBe("lever");
  });

  it("returns null for non-CNAME records", () => {
    expect(extractCompanyDomain(aRecord)).toBeNull();
  });

  it("returns null for non-ATS CNAME", () => {
    expect(extractCompanyDomain(nonAtsCname)).toBeNull();
  });
});

// ── inferCompanyNameFromDomain ───────────────────────────────────────────────

describe("inferCompanyNameFromDomain", () => {
  it("extracts root label from subdomain", () => {
    expect(inferCompanyNameFromDomain("careers.acme.com")).toBe("acme");
  });

  it("extracts root label from root domain", () => {
    expect(inferCompanyNameFromDomain("acme.com")).toBe("acme");
  });

  it("extracts root label from .io domain", () => {
    expect(inferCompanyNameFromDomain("jobs.foobar.io")).toBe("foobar");
  });

  it("returns full domain for single label", () => {
    expect(inferCompanyNameFromDomain("localhost")).toBe("localhost");
  });
});

// ── runRapid7CnameSeeder ─────────────────────────────────────────────────────

const TEMP_DIR = join(tmpdir(), `rapid7-test-${Date.now()}`);

describe("runRapid7CnameSeeder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveSlugger).mockResolvedValue({
      success: true,
      atsSource: "greenhouse",
      atsSlug: "acme",
      resolvedBy: "cname",
      canonicalName: "acme",
    });
    mkdirSync(TEMP_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEMP_DIR, { recursive: true, force: true });
  });

  function createGzippedFile(lines: string[]): string {
    const content = lines.join("\n");
    const gzipped = gzipSync(content);
    const filePath = join(TEMP_DIR, "fdns_cname.json.gz");
    writeFileSync(filePath, gzipped);
    return filePath;
  }

  it("stream-parses gzipped file, filters ATS CNAMEs, runs Slugger", async () => {
    const filePath = createGzippedFile([
      JSON.stringify(greenhouseCname),
      JSON.stringify(leverCname),
      JSON.stringify(nonAtsCname),
      JSON.stringify(aRecord),
    ]);

    const result = await runRapid7CnameSeeder(filePath);

    expect(result.totalRecords).toBe(4);
    expect(result.atsCnameMatches).toBe(2);
    expect(result.uniqueCompanyDomains).toBe(2);
    expect(result.resolved).toBe(2);
    expect(result.unresolved).toBe(0);
    expect(result.error).toBeUndefined();
  });

  it("deduplicates by domain", async () => {
    const filePath = createGzippedFile([
      JSON.stringify(greenhouseCname),
      JSON.stringify(greenhouseCname), // Same domain
    ]);

    const result = await runRapid7CnameSeeder(filePath);

    expect(result.atsCnameMatches).toBe(2);
    expect(result.uniqueCompanyDomains).toBe(1); // Deduplicated
    expect(result.resolved).toBe(1);
  });

  it("counts resolved and unresolved", async () => {
    vi.mocked(resolveSlugger)
      .mockResolvedValueOnce({
        success: true,
        atsSource: "greenhouse",
        atsSlug: "acme",
        resolvedBy: "cname",
        canonicalName: "acme",
      })
      .mockResolvedValueOnce({
        success: false,
        canonicalName: "foobar",
      });

    const filePath = createGzippedFile([
      JSON.stringify(greenhouseCname),
      JSON.stringify(leverCname),
    ]);

    const result = await runRapid7CnameSeeder(filePath);

    expect(result.resolved).toBe(1);
    expect(result.unresolved).toBe(1);
  });

  it("passes correct SluggerInput with discoverySource=rapid7_fdns", async () => {
    const filePath = createGzippedFile([JSON.stringify(greenhouseCname)]);

    await runRapid7CnameSeeder(filePath);

    expect(resolveSlugger).toHaveBeenCalledWith(
      expect.objectContaining({
        companyName: "acme",
        website: "https://careers.acme.com",
        atsHint: "greenhouse",
        discoverySource: "rapid7_fdns",
      }),
      expect.objectContaining({
        insertCompany: true,
      }),
    );
  });

  it("handles file not found error gracefully", async () => {
    const result = await runRapid7CnameSeeder(
      "/nonexistent/path/to/file.json.gz",
    );

    expect(result.error).toBeDefined();
    expect(result.totalRecords).toBe(0);
  });

  it("handles empty file", async () => {
    const filePath = createGzippedFile([]);

    const result = await runRapid7CnameSeeder(filePath);

    expect(result.totalRecords).toBe(0);
    expect(result.atsCnameMatches).toBe(0);
    expect(result.uniqueCompanyDomains).toBe(0);
  });

  it("handles file with only invalid JSON lines", async () => {
    const filePath = createGzippedFile([
      "not json",
      '{"incomplete": true}',
      "",
    ]);

    const result = await runRapid7CnameSeeder(filePath);

    expect(result.totalRecords).toBe(0);
    expect(result.atsCnameMatches).toBe(0);
  });

  it("handles file with only non-ATS CNAME records", async () => {
    const filePath = createGzippedFile([
      JSON.stringify(nonAtsCname),
      JSON.stringify(aRecord),
    ]);

    const result = await runRapid7CnameSeeder(filePath);

    expect(result.totalRecords).toBe(2);
    expect(result.atsCnameMatches).toBe(0);
    expect(result.uniqueCompanyDomains).toBe(0);
  });
});
