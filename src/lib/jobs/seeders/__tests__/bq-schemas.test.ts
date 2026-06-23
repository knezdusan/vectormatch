/**
 * Unit tests for the BigQuery HTTPArchive Zod schemas (TDD §4.1.1, §4.2.3).
 */

import {
  bigQueryRowSchema,
  bigQueryRowsSchema,
} from "@/lib/jobs/seeders/bq-schemas";

describe("bigQueryRowSchema", () => {
  const validRow = {
    root_page: "acme.com",
    page: "https://acme.com/",
    greenhouse_slug: "acme",
    lever_slug: null,
    ashby_slug: null,
  };

  it("parses a valid row with all fields", () => {
    const result = bigQueryRowSchema.safeParse(validRow);
    expect(result.success).toBe(true);
  });

  it("parses a row with null slugs", () => {
    const result = bigQueryRowSchema.safeParse({
      root_page: "acme.com",
      page: "https://acme.com/",
      greenhouse_slug: null,
      lever_slug: null,
      ashby_slug: null,
    });
    expect(result.success).toBe(true);
  });

  it("parses a row with missing optional slug fields", () => {
    const result = bigQueryRowSchema.safeParse({
      root_page: "acme.com",
      page: "https://acme.com/",
    });
    expect(result.success).toBe(true);
  });

  it("parses a row with missing page field", () => {
    const result = bigQueryRowSchema.safeParse({
      root_page: "acme.com",
      greenhouse_slug: "acme",
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
      greenhouse_slug: "acme",
    });
    expect(result.success).toBe(false);
  });

  it("fails when root_page is empty string", () => {
    const result = bigQueryRowSchema.safeParse({
      root_page: "",
      page: "https://acme.com/",
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
      { root_page: "acme.com", greenhouse_slug: "acme" },
      { root_page: "foobar.com", lever_slug: "foobar" },
    ]);
    expect(result.success).toBe(true);
  });

  it("parses an empty array", () => {
    const result = bigQueryRowsSchema.safeParse([]);
    expect(result.success).toBe(true);
  });

  it("fails when an element is invalid", () => {
    const result = bigQueryRowsSchema.safeParse([
      { root_page: "acme.com" },
      { wrong: "shape" },
    ]);
    expect(result.success).toBe(false);
  });
});
