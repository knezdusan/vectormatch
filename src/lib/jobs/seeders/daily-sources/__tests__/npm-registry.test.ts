/**
 * Unit tests for D12 — NPM Registry New Packages Seeder (TDD §2.12)
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db/db", () => ({ db: { select: vi.fn(), insert: vi.fn() } }));
vi.mock("@/lib/jobs/seeders/slugger", () => ({ resolveSlugger: vi.fn() }));

import {
  extractOrgNamesFromPackages,
  runNpmRegistrySeeder,
} from "@/lib/jobs/seeders/daily-sources/npm-registry";
import { deduplicateOrgNames } from "@/lib/jobs/seeders/seeder-utils";
import { resolveSlugger } from "@/lib/jobs/seeders/slugger";
import type { FetchFn } from "@/lib/jobs/types";

// ── extractOrgNamesFromPackages ──────────────────────────────────────────────

describe("extractOrgNamesFromPackages", () => {
  it("extracts org names from org-scoped packages", () => {
    const packages = [
      { package: { name: "@acme/ui-kit", version: "1.0.0" } },
      { package: { name: "@stripe/payments", version: "2.1.0" } },
      { package: { name: "@vercel/nextjs" } },
    ];

    const result = extractOrgNamesFromPackages(packages);

    expect(result).toEqual(["acme", "stripe"]);
  });

  it("filters out excluded scopes", () => {
    const packages = [
      { package: { name: "@types/react", version: "18.0.0" } },
      { package: { name: "@babel/core", version: "7.0.0" } },
      { package: { name: "@eslint/eslint-plugin", version: "1.0.0" } },
      { package: { name: "@mui/material", version: "5.0.0" } },
      { package: { name: "@acme/ui-kit", version: "1.0.0" } },
    ];

    const result = extractOrgNamesFromPackages(packages);

    expect(result).toEqual(["acme"]);
  });

  it("filters out excluded scopes case-insensitively", () => {
    const packages = [
      { package: { name: "@Types/react", version: "18.0.0" } },
      { package: { name: "@BABEL/core", version: "7.0.0" } },
      { package: { name: "@Acme/ui-kit", version: "1.0.0" } },
    ];

    const result = extractOrgNamesFromPackages(packages);

    expect(result).toEqual(["Acme"]);
  });

  it("skips non-scoped packages", () => {
    const packages = [
      { package: { name: "react", version: "18.0.0" } },
      { package: { name: "lodash", version: "4.17.0" } },
      { package: { name: "express", version: "4.18.0" } },
    ];

    const result = extractOrgNamesFromPackages(packages);

    expect(result).toEqual([]);
  });

  it("handles empty list", () => {
    expect(extractOrgNamesFromPackages([])).toEqual([]);
  });

  it("handles packages with missing or malformed names", () => {
    const packages = [
      { package: {} },
      { package: { name: "" } },
      { package: { name: "@", version: "1.0.0" } },
      { package: { name: "@nodash", version: "1.0.0" } },
      { package: { name: "@acme/ui-kit", version: "1.0.0" } },
    ] as unknown[];

    const result = extractOrgNamesFromPackages(
      packages as Parameters<typeof extractOrgNamesFromPackages>[0],
    );

    expect(result).toEqual(["acme"]);
  });
});

// ── deduplicateOrgNames ──────────────────────────────────────────────────────

describe("deduplicateOrgNames", () => {
  it("removes exact duplicates", () => {
    const result = deduplicateOrgNames(["acme", "acme", "stripe", "acme"]);
    expect(result).toEqual(["acme", "stripe"]);
  });

  it("is case-insensitive, preserving first-seen casing", () => {
    const result = deduplicateOrgNames(["Acme", "acme", "ACME", "stripe"]);
    expect(result).toEqual(["Acme", "stripe"]);
  });

  it("handles empty list", () => {
    expect(deduplicateOrgNames([])).toEqual([]);
  });

  it("preserves order of first occurrence", () => {
    const result = deduplicateOrgNames(["stripe", "acme", "stripe", "vercel"]);
    expect(result).toEqual(["stripe", "acme", "vercel"]);
  });
});

// ── runNpmRegistrySeeder ─────────────────────────────────────────────────────

describe("runNpmRegistrySeeder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockNpmResponse(
    objects: Array<{ name: string; version?: string }>,
  ): FetchFn {
    return vi.fn(async () => {
      return new Response(
        JSON.stringify({
          objects: objects.map((pkg) => ({ package: pkg })),
          total: objects.length,
        }),
        { status: 200 },
      );
    }) as unknown as FetchFn;
  }

  it("fetches packages, extracts orgs, resolves through Slugger", async () => {
    const fetchFn = mockNpmResponse([
      { name: "@acme/ui-kit", version: "1.0.0" },
      { name: "@stripe/payments", version: "2.0.0" },
      { name: "react", version: "18.0.0" },
      { name: "@types/node", version: "20.0.0" },
    ]);

    vi.mocked(resolveSlugger).mockImplementation(async (input) => {
      if (input.companyName === "acme") {
        return {
          success: true,
          atsSource: "greenhouse",
          atsSlug: "acme",
          resolvedBy: "slug_probe",
          canonicalName: "acme",
        };
      }
      return { success: false, canonicalName: input.companyName };
    });

    const result = await runNpmRegistrySeeder(fetchFn);

    expect(result.totalPackages).toBe(4);
    expect(result.scopedPackages).toBe(2);
    expect(result.uniqueOrgs).toBe(2);
    expect(result.resolved).toBe(1);
    expect(result.unresolved).toBe(1);
    expect(result.error).toBeUndefined();
  });

  it("passes the correct SluggerInput with discoverySource and discoveryContext", async () => {
    const fetchFn = mockNpmResponse([
      { name: "@acme/ui-kit", version: "1.0.0" },
    ]);

    vi.mocked(resolveSlugger).mockResolvedValue({
      success: true,
      atsSource: "greenhouse",
      atsSlug: "acme",
      resolvedBy: "slug_probe",
      canonicalName: "acme",
    });

    await runNpmRegistrySeeder(fetchFn);

    expect(resolveSlugger).toHaveBeenCalledTimes(1);
    const [input, opts] = vi.mocked(resolveSlugger).mock.calls[0];
    expect(input.companyName).toBe("acme");
    expect(input.discoverySource).toBe("hn_algolia");
    expect(input.discoveryContext).toBe("npm-registry:acme");
    expect(opts?.insertCompany).toBe(true);
  });

  it("returns an error result when the API fails", async () => {
    const fetchFn = vi.fn(async () => {
      return new Response("Internal Server Error", { status: 500 });
    }) as unknown as FetchFn;

    const result = await runNpmRegistrySeeder(fetchFn);

    expect(result.totalPackages).toBe(0);
    expect(result.uniqueOrgs).toBe(0);
    expect(result.resolved).toBe(0);
    expect(result.unresolved).toBe(0);
    expect(result.error).toContain("HTTP 500");
    expect(resolveSlugger).not.toHaveBeenCalled();
  });

  it("returns an error result when fetch throws", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("Network error");
    }) as unknown as FetchFn;

    const result = await runNpmRegistrySeeder(fetchFn);

    expect(result.totalPackages).toBe(0);
    expect(result.error).toContain("Network error");
    expect(resolveSlugger).not.toHaveBeenCalled();
  });

  it("handles empty results from the API", async () => {
    const fetchFn = mockNpmResponse([]);

    const result = await runNpmRegistrySeeder(fetchFn);

    expect(result.totalPackages).toBe(0);
    expect(result.scopedPackages).toBe(0);
    expect(result.uniqueOrgs).toBe(0);
    expect(result.resolved).toBe(0);
    expect(result.unresolved).toBe(0);
    expect(result.error).toBeUndefined();
    expect(resolveSlugger).not.toHaveBeenCalled();
  });

  it("handles results with no org-scoped packages", async () => {
    const fetchFn = mockNpmResponse([
      { name: "react", version: "18.0.0" },
      { name: "lodash", version: "4.17.0" },
    ]);

    const result = await runNpmRegistrySeeder(fetchFn);

    expect(result.totalPackages).toBe(2);
    expect(result.scopedPackages).toBe(0);
    expect(result.uniqueOrgs).toBe(0);
    expect(result.resolved).toBe(0);
    expect(result.unresolved).toBe(0);
    expect(result.error).toBeUndefined();
    expect(resolveSlugger).not.toHaveBeenCalled();
  });

  it("counts a single Slugger exception as unresolved without aborting", async () => {
    const fetchFn = mockNpmResponse([
      { name: "@acme/ui-kit", version: "1.0.0" },
      { name: "@stripe/payments", version: "2.0.0" },
    ]);

    vi.mocked(resolveSlugger)
      .mockRejectedValueOnce(new Error("Slugger exploded"))
      .mockResolvedValueOnce({
        success: true,
        atsSource: "lever",
        atsSlug: "stripe",
        resolvedBy: "slug_probe",
        canonicalName: "stripe",
      });

    const result = await runNpmRegistrySeeder(fetchFn);

    expect(result.uniqueOrgs).toBe(2);
    expect(result.resolved).toBe(1);
    expect(result.unresolved).toBe(1);
    expect(result.error).toBeUndefined();
  });
});
