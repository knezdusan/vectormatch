/**
 * Unit tests for the BigQuery HTTPArchive Zod schemas (TDD §4.1.1, §4.2.3).
 *
 * Updated June 2026: Tests reflect the optimized query schema that uses
 * `technologies` column (Wappalyzer) instead of `payload` regex extraction.
 * Rows now have `ats_source` instead of individual slug columns.
 */

import {
  bigQueryRowSchema,
  bigQueryRowsSchema,
} from "@/lib/jobs/seeders/bq-schemas";

describe("bigQueryRowSchema", () => {
  const validRow = {
    root_page: "acme.com",
    page: "https://acme.com/",
    ats_source: "greenhouse",
  };

  it("parses a valid row with all fields", () => {
    const result = bigQueryRowSchema.safeParse(validRow);
    expect(result.success).toBe(true);
  });

  it("parses a row with lever ats_source", () => {
    const result = bigQueryRowSchema.safeParse({
      root_page: "foobar.com",
      page: "https://foobar.com/",
      ats_source: "lever",
    });
    expect(result.success).toBe(true);
  });

  it("parses a row with workable ats_source", () => {
    const result = bigQueryRowSchema.safeParse({
      root_page: "allucent.com",
      page: "https://allucent.com/",
      ats_source: "workable",
    });
    expect(result.success).toBe(true);
  });

  it("parses a row with missing page field", () => {
    const result = bigQueryRowSchema.safeParse({
      root_page: "acme.com",
      ats_source: "greenhouse",
    });
    expect(result.success).toBe(true);
  });

  it("allows extra fields (passthrough)", () => {
    const result = bigQueryRowSchema.safeParse({
      ...validRow,
      extra_field: "ignored",
      technologies: ["Next.js", "React"],
    });
    expect(result.success).toBe(true);
  });

  it("fails when root_page is missing", () => {
    const result = bigQueryRowSchema.safeParse({
      page: "https://acme.com/",
      ats_source: "greenhouse",
    });
    expect(result.success).toBe(false);
  });

  it("fails when root_page is empty string", () => {
    const result = bigQueryRowSchema.safeParse({
      root_page: "",
      page: "https://acme.com/",
      ats_source: "greenhouse",
    });
    expect(result.success).toBe(false);
  });

  it("fails when ats_source is missing", () => {
    const result = bigQueryRowSchema.safeParse({
      root_page: "acme.com",
      page: "https://acme.com/",
    });
    expect(result.success).toBe(false);
  });

  it("fails when ats_source is not greenhouse, lever, or workable", () => {
    const result = bigQueryRowSchema.safeParse({
      root_page: "acme.com",
      ats_source: "ashby",
    });
    expect(result.success).toBe(false);
  });

  it("does not throw on malformed input (safeParse contract)", () => {
    expect(() => bigQueryRowSchema.safeParse(null)).not.toThrow();
    expect(() => bigQueryRowSchema.safeParse("string")).not.toThrow();
    expect(() => bigQueryRowSchema.safeParse(42)).not.toThrow();
  });
});

describe("bigQueryRowsSchema", () => {
  it("parses an array of valid rows", () => {
    const result = bigQueryRowsSchema.safeParse([
      { root_page: "acme.com", ats_source: "greenhouse" },
      { root_page: "foobar.com", ats_source: "lever" },
    ]);
    expect(result.success).toBe(true);
  });

  it("parses an empty array", () => {
    const result = bigQueryRowsSchema.safeParse([]);
    expect(result.success).toBe(true);
  });

  it("fails when an element is invalid", () => {
    const result = bigQueryRowsSchema.safeParse([
      { root_page: "acme.com", ats_source: "greenhouse" },
      { wrong: "shape" },
    ]);
    expect(result.success).toBe(false);
  });
});
