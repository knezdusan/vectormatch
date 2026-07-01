/**
 * Unit tests for parseVectorString — Sprint 8 bulk reprocess helper.
 *
 * Parses pgvector text format "[0.1,0.2,...]" into number[].
 * Used by the matchBulkReprocess function to read job embeddings from the DB.
 */

import { describe, expect, it } from "vitest";

import { parseVectorString } from "@/inngest/functions";

describe("parseVectorString", () => {
  it("parses a valid pgvector string", () => {
    const result = parseVectorString("[0.1,0.2,0.3]");
    expect(result).toEqual([0.1, 0.2, 0.3]);
  });

  it("parses a single-element vector", () => {
    const result = parseVectorString("[0.5]");
    expect(result).toEqual([0.5]);
  });

  it("parses negative numbers", () => {
    const result = parseVectorString("[-0.1,0.2,-0.3]");
    expect(result).toEqual([-0.1, 0.2, -0.3]);
  });

  it("parses scientific notation", () => {
    const result = parseVectorString("[1e-5,2e-3]");
    expect(result).toEqual([0.00001, 0.002]);
  });

  it("returns empty array for null input", () => {
    expect(parseVectorString(null)).toEqual([]);
  });

  it("returns empty array for undefined input", () => {
    expect(parseVectorString(undefined)).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(parseVectorString("")).toEqual([]);
  });

  it("returns empty array for malformed string (no brackets)", () => {
    expect(parseVectorString("0.1,0.2,0.3")).toEqual([]);
  });

  it("returns empty array for empty vector '[]'", () => {
    expect(parseVectorString("[]")).toEqual([]);
  });

  it("handles whitespace in the vector string", () => {
    const result = parseVectorString("[ 0.1 , 0.2 , 0.3 ]");
    expect(result).toEqual([0.1, 0.2, 0.3]);
  });
});
