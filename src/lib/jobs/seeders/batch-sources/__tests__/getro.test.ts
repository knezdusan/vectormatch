// Tests for the Getro Network Company-Discovery Seeder
// src/lib/jobs/seeders/batch-sources/__tests__/getro.test.ts
//
// Tests the pure functions and API client logic. Slugger resolution is mocked
// — we test discovery and parsing, not the full resolution pipeline (which has
// its own test suite in slugger.test.ts).

import { describe, expect, it } from "vitest";
import {
  extractDomain,
  filterCompaniesWithWebsite,
  type GetroCompany,
} from "@/lib/jobs/seeders/batch-sources/getro";

describe("getro adapter", () => {
  // ── filterCompaniesWithWebsite ─────────────────────────────────────────────

  describe("filterCompaniesWithWebsite", () => {
    it("filters out companies with null or empty websites", () => {
      const companies: GetroCompany[] = [
        {
          id: 1,
          name: "Acme",
          website: "https://acme.com",
          jobCount: 5,
          networkId: "test",
        },
        { id: 2, name: "NoWeb", website: null, jobCount: 3, networkId: "test" },
        {
          id: 3,
          name: "EmptyWeb",
          website: "",
          jobCount: 0,
          networkId: "test",
        },
        {
          id: 4,
          name: "Beta",
          website: "https://beta.io",
          jobCount: 10,
          networkId: "test",
        },
      ];

      const result = filterCompaniesWithWebsite(companies);
      expect(result).toHaveLength(2);
      expect(result.map((c) => c.name)).toEqual(["Acme", "Beta"]);
    });

    it("returns empty array for empty input", () => {
      expect(filterCompaniesWithWebsite([])).toEqual([]);
    });
  });

  // ── extractDomain ──────────────────────────────────────────────────────────

  describe("extractDomain", () => {
    it("extracts domain from https URL", () => {
      expect(extractDomain("https://example.com")).toBe("example.com");
    });

    it("extracts domain from http URL", () => {
      expect(extractDomain("http://www.example.com")).toBe("example.com");
    });

    it("extracts domain from URL with path", () => {
      expect(extractDomain("https://example.com/careers")).toBe("example.com");
    });

    it("extracts domain from bare domain", () => {
      expect(extractDomain("example.com")).toBe("example.com");
    });

    it("handles www prefix", () => {
      expect(extractDomain("https://www.example.com/")).toBe("example.com");
    });

    it("handles invalid URL gracefully", () => {
      expect(extractDomain("not a url")).toBe("not a url");
    });

    it("handles URL with port", () => {
      expect(extractDomain("https://example.com:8080")).toBe("example.com");
    });
  });
});
