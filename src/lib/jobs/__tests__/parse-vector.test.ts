/**
 * Unit tests for parseVectorString — Sprint 8 bulk reprocess helper.
 *
 * Parses pgvector text format "[0.1,0.2,...]" into number[].
 * Used by the matchBulkReprocess function to read job embeddings from the DB.
 */

import { describe, expect, it } from "vitest";

import { parseVectorString } from "@/lib/jobs/parse-vector";

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

  it("parses an empty vector string", () => {
    const result = parseVectorString("[]");
    expect(result).toEqual([]);
  });

  it("returns empty array for null input", () => {
    const result = parseVectorString(null);
    expect(result).toEqual([]);
  });

  it("returns empty array for undefined input", () => {
    const result = parseVectorString(undefined);
    expect(result).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    const result = parseVectorString("");
    expect(result).toEqual([]);
  });

  it("returns empty array for malformed string (no brackets)", () => {
    const result = parseVectorString("0.1,0.2,0.3");
    expect(result).toEqual([]);
  });

  it("returns empty array for malformed string (only opening bracket)", () => {
    const result = parseVectorString("[0.1,0.2");
    expect(result).toEqual([]);
  });

  it("handles whitespace in the vector string", () => {
    const result = parseVectorString("[ 0.1 , 0.2 , 0.3 ]");
    expect(result).toEqual([0.1, 0.2, 0.3]);
  });
});
