/**
 * Unit tests for P1-3: Brave Search frontend-targeted queries
 *
 * Validates the frontend keyword query construction:
 *   - FRONTEND_KEYWORDS contains the required technology terms
 *   - Query building produces correct site-scoped + keyword queries
 *   - The query format is valid for the Brave Search API
 *
 * Per AGENTS.md: Vitest for unit tests. No DB mutations, no network calls.
 */

import { describe, expect, it } from "vitest";
import {
  buildFrontendQuery,
  FRONTEND_KEYWORDS,
} from "@/lib/jobs/seeders/daily-sources/frontend-job-scanner";

// Re-export the frontend keywords from brave-search for testing
// (the same constant is used in both brave-search.ts and frontend-job-scanner.ts)
describe("P1-3: Brave Search frontend-targeted queries", () => {
  it("FRONTEND_KEYWORDS contains React", () => {
    expect(FRONTEND_KEYWORDS).toContain("React");
  });

  it("FRONTEND_KEYWORDS contains Next.js", () => {
    expect(FRONTEND_KEYWORDS).toContain("Next.js");
  });

  it("FRONTEND_KEYWORDS contains TypeScript", () => {
    expect(FRONTEND_KEYWORDS).toContain("TypeScript");
  });

  it("FRONTEND_KEYWORDS contains Frontend", () => {
    expect(FRONTEND_KEYWORDS).toContain("Frontend");
  });

  it("FRONTEND_KEYWORDS contains Vue.js", () => {
    expect(FRONTEND_KEYWORDS).toContain("Vue.js");
  });

  it("FRONTEND_KEYWORDS contains Svelte", () => {
    expect(FRONTEND_KEYWORDS).toContain("Svelte");
  });

  it("FRONTEND_KEYWORDS contains GraphQL", () => {
    expect(FRONTEND_KEYWORDS).toContain("GraphQL");
  });

  it("FRONTEND_KEYWORDS is wrapped in parentheses with OR operators", () => {
    expect(FRONTEND_KEYWORDS.startsWith("(")).toBe(true);
    expect(FRONTEND_KEYWORDS.endsWith(")")).toBe(true);
    expect(FRONTEND_KEYWORDS).toContain(" OR ");
  });
});

describe("buildFrontendQuery", () => {
  it("builds a site-scoped query for greenhouse", () => {
    const query = buildFrontendQuery("boards.greenhouse.io");
    expect(query).toContain("site:boards.greenhouse.io");
    expect(query).toContain(FRONTEND_KEYWORDS);
  });

  it("builds a site-scoped query for lever", () => {
    const query = buildFrontendQuery("jobs.lever.co");
    expect(query).toContain("site:jobs.lever.co");
    expect(query).toContain(FRONTEND_KEYWORDS);
  });

  it("builds a site-scoped query for ashby", () => {
    const query = buildFrontendQuery("jobs.ashbyhq.com");
    expect(query).toContain("site:jobs.ashbyhq.com");
    expect(query).toContain(FRONTEND_KEYWORDS);
  });

  it("combines site scope with keywords in the correct order", () => {
    const query = buildFrontendQuery("boards.greenhouse.io");
    // site: should come first, then keywords
    expect(query.indexOf("site:")).toBeLessThan(
      query.indexOf(FRONTEND_KEYWORDS),
    );
  });
});
