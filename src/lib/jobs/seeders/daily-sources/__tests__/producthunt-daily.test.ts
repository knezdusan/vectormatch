/**
 * Unit tests for D8 — Product Hunt Daily Launches (TDD §2.8)
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the db module
vi.mock("@/db/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
  },
}));

// Mock the slugger module
vi.mock("@/lib/jobs/seeders/slugger", () => ({
  resolveSlugger: vi.fn(),
}));

import {
  deduplicateNames,
  extractProductNamesFromRss,
  runProductHuntDailySeeder,
} from "@/lib/jobs/seeders/daily-sources/producthunt-daily";
import type { SluggerResult } from "@/lib/jobs/seeders/slugger";
import { resolveSlugger } from "@/lib/jobs/seeders/slugger";
import type { FetchFn } from "@/lib/jobs/types";

// ── extractProductNamesFromRss ───────────────────────────────────────────────

describe("extractProductNamesFromRss", () => {
  it("extracts product names from a valid RSS feed", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0">
        <channel>
          <title>Product Hunt</title>
          <item>
            <title>Acme Corp</title>
            <link>https://www.producthunt.com/posts/acme-corp</link>
          </item>
          <item>
            <title>FooBar</title>
            <link>https://www.producthunt.com/posts/foobar</link>
          </item>
          <item>
            <title>Qux.io</title>
            <link>https://www.producthunt.com/posts/qux-io</link>
          </item>
        </channel>
      </rss>`;

    const names = extractProductNamesFromRss(xml);

    expect(names).toHaveLength(3);
    expect(names).toEqual(["Acme Corp", "FooBar", "Qux.io"]);
  });

  it("returns empty array for empty RSS feed", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0">
        <channel>
          <title>Product Hunt</title>
        </channel>
      </rss>`;

    const names = extractProductNamesFromRss(xml);

    expect(names).toHaveLength(0);
  });

  it("returns empty array for empty string input", () => {
    expect(extractProductNamesFromRss("")).toHaveLength(0);
  });

  it("returns empty array for whitespace-only input", () => {
    expect(extractProductNamesFromRss("   \n\t  ")).toHaveLength(0);
  });

  it("returns empty array for invalid XML", () => {
    const xml = "this is not valid xml <<<<>>>>";

    const names = extractProductNamesFromRss(xml);

    expect(names).toHaveLength(0);
  });

  it("skips items with empty titles", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0">
        <channel>
          <item>
            <title>Valid Product</title>
          </item>
          <item>
            <title></title>
          </item>
          <item>
            <title>   </title>
          </item>
          <item>
            <title>Another Valid</title>
          </item>
        </channel>
      </rss>`;

    const names = extractProductNamesFromRss(xml);

    expect(names).toHaveLength(2);
    expect(names).toEqual(["Valid Product", "Another Valid"]);
  });

  it("handles items with whitespace in titles by trimming", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0">
        <channel>
          <item>
            <title>  Spaced Product  </title>
          </item>
        </channel>
      </rss>`;

    const names = extractProductNamesFromRss(xml);

    expect(names).toEqual(["Spaced Product"]);
  });
});

// ── deduplicateNames ─────────────────────────────────────────────────────────

describe("deduplicateNames", () => {
  it("removes exact duplicates", () => {
    const names = ["Acme", "FooBar", "Acme", "Qux", "FooBar"];

    const result = deduplicateNames(names);

    expect(result).toEqual(["Acme", "FooBar", "Qux"]);
  });

  it("is case-insensitive, preserving first occurrence casing", () => {
    const names = ["Acme", "acme", "ACME", "FooBar"];

    const result = deduplicateNames(names);

    expect(result).toEqual(["Acme", "FooBar"]);
  });

  it("filters out empty strings", () => {
    const names = ["Acme", "", "  ", "FooBar", ""];

    const result = deduplicateNames(names);

    expect(result).toEqual(["Acme", "FooBar"]);
  });

  it("handles empty input array", () => {
    expect(deduplicateNames([])).toHaveLength(0);
  });

  it("handles all-duplicate input", () => {
    const names = ["Acme", "Acme", "Acme"];

    const result = deduplicateNames(names);

    expect(result).toEqual(["Acme"]);
  });

  it("preserves original order of first occurrences", () => {
    const names = ["Zeta", "Alpha", "Zeta", "Beta", "Alpha", "Gamma"];

    const result = deduplicateNames(names);

    expect(result).toEqual(["Zeta", "Alpha", "Beta", "Gamma"]);
  });

  it("trims whitespace before comparing", () => {
    const names = ["Acme", "  Acme  ", "Acme"];

    const result = deduplicateNames(names);

    expect(result).toEqual(["Acme"]);
  });
});

// ── runProductHuntDailySeeder ────────────────────────────────────────────────

describe("runProductHuntDailySeeder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockRssResponse(names: string[]): Response {
    const items = names
      .map(
        (n) =>
          `<item><title>${n}</title><link>https://producthunt.com/${n}</link></item>`,
      )
      .join("");
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0">
        <channel>
          <title>Product Hunt</title>
          ${items}
        </channel>
      </rss>`;
    return new Response(xml, { status: 200 });
  }

  function mockSluggerSuccess(): SluggerResult {
    return {
      success: true,
      atsSource: "greenhouse",
      atsSlug: "acme",
      resolvedBy: "slug_probe",
      canonicalName: "acme",
    };
  }

  function mockSluggerFailure(): SluggerResult {
    return {
      success: false,
      canonicalName: "unknown",
    };
  }

  it("fetches RSS, extracts names, resolves via Slugger", async () => {
    const fetchFn = vi.fn(async () =>
      mockRssResponse(["Acme", "FooBar", "Qux"]),
    ) as unknown as FetchFn;

    vi.mocked(resolveSlugger).mockResolvedValue(mockSluggerSuccess());

    const result = await runProductHuntDailySeeder(fetchFn);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(result.totalProducts).toBe(3);
    expect(result.uniqueCompanies).toBe(3);
    expect(result.resolved).toBe(3);
    expect(result.unresolved).toBe(0);
    expect(result.error).toBeUndefined();
  });

  it("calls resolveSlugger with correct SluggerInput", async () => {
    const fetchFn = vi.fn(async () =>
      mockRssResponse(["Acme Corp"]),
    ) as unknown as FetchFn;

    vi.mocked(resolveSlugger).mockResolvedValue(mockSluggerSuccess());

    await runProductHuntDailySeeder(fetchFn);

    expect(resolveSlugger).toHaveBeenCalledTimes(1);
    expect(resolveSlugger).toHaveBeenCalledWith(
      {
        companyName: "Acme Corp",
        discoverySource: "hn_algolia",
        discoveryContext: "producthunt:Acme Corp",
      },
      expect.objectContaining({
        insertCompany: true,
      }),
    );
  });

  it("passes fetchFn to resolveSlugger", async () => {
    const fetchFn = vi.fn(async () =>
      mockRssResponse(["Acme"]),
    ) as unknown as FetchFn;

    vi.mocked(resolveSlugger).mockResolvedValue(mockSluggerSuccess());

    await runProductHuntDailySeeder(fetchFn);

    expect(resolveSlugger).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        fetchFn,
        insertCompany: true,
      }),
    );
  });

  it("counts resolved and unresolved correctly", async () => {
    const fetchFn = vi.fn(async () =>
      mockRssResponse(["Acme", "FooBar", "Qux"]),
    ) as unknown as FetchFn;

    vi.mocked(resolveSlugger)
      .mockResolvedValueOnce(mockSluggerSuccess())
      .mockResolvedValueOnce(mockSluggerFailure())
      .mockResolvedValueOnce(mockSluggerSuccess());

    const result = await runProductHuntDailySeeder(fetchFn);

    expect(result.resolved).toBe(2);
    expect(result.unresolved).toBe(1);
  });

  it("deduplicates before resolving", async () => {
    const fetchFn = vi.fn(async () =>
      mockRssResponse(["Acme", "acme", "ACME", "FooBar"]),
    ) as unknown as FetchFn;

    vi.mocked(resolveSlugger).mockResolvedValue(mockSluggerSuccess());

    const result = await runProductHuntDailySeeder(fetchFn);

    expect(result.totalProducts).toBe(4);
    expect(result.uniqueCompanies).toBe(2);
    expect(resolveSlugger).toHaveBeenCalledTimes(2);
  });

  it("handles fetch failure gracefully", async () => {
    const fetchFn = vi.fn(
      async () => new Response("Server Error", { status: 500 }),
    ) as unknown as FetchFn;

    const result = await runProductHuntDailySeeder(fetchFn);

    expect(result.totalProducts).toBe(0);
    expect(result.uniqueCompanies).toBe(0);
    expect(result.resolved).toBe(0);
    expect(result.unresolved).toBe(0);
    expect(result.error).toBeDefined();
    expect(result.error).toContain("500");
  });

  it("handles network error gracefully", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("Network error");
    }) as unknown as FetchFn;

    const result = await runProductHuntDailySeeder(fetchFn);

    expect(result.totalProducts).toBe(0);
    expect(result.error).toBe("Network error");
  });

  it("handles empty RSS feed (no items)", async () => {
    const fetchFn = vi.fn(async () =>
      mockRssResponse([]),
    ) as unknown as FetchFn;

    const result = await runProductHuntDailySeeder(fetchFn);

    expect(result.totalProducts).toBe(0);
    expect(result.uniqueCompanies).toBe(0);
    expect(result.resolved).toBe(0);
    expect(result.unresolved).toBe(0);
    expect(result.error).toBeUndefined();
    expect(resolveSlugger).not.toHaveBeenCalled();
  });

  it("handles individual Slugger resolution error gracefully", async () => {
    const fetchFn = vi.fn(async () =>
      mockRssResponse(["Acme", "FooBar"]),
    ) as unknown as FetchFn;

    vi.mocked(resolveSlugger)
      .mockRejectedValueOnce(new Error("Slugger internal error"))
      .mockResolvedValueOnce(mockSluggerSuccess());

    const result = await runProductHuntDailySeeder(fetchFn);

    expect(result.resolved).toBe(1);
    expect(result.unresolved).toBe(1);
    expect(result.error).toBeUndefined();
  });

  it("handles all Slugger resolutions failing", async () => {
    const fetchFn = vi.fn(async () =>
      mockRssResponse(["Acme", "FooBar"]),
    ) as unknown as FetchFn;

    vi.mocked(resolveSlugger).mockResolvedValue(mockSluggerFailure());

    const result = await runProductHuntDailySeeder(fetchFn);

    expect(result.resolved).toBe(0);
    expect(result.unresolved).toBe(2);
    expect(result.error).toBeUndefined();
  });
});
