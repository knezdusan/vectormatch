/**
 * Unit tests for P1-2: YC_VC_FUNDED_ORGS list expansion
 *
 * Validates the curated org list:
 *   - Has 100+ orgs (mission requirement for frontend-ecosystem coverage)
 *   - No duplicates
 *   - All entries are lowercase (GitHub org names are case-insensitive but
 *     the API URL is case-sensitive — lowercase is the convention)
 *   - Contains key frontend-ecosystem orgs (vercel, supabase, etc.)
 *
 * Per AGENTS.md: Vitest for unit tests. No DB mutations, no network calls.
 */

import { describe, expect, it } from "vitest";
import { YC_VC_FUNDED_ORGS } from "@/lib/jobs/seeders/daily-sources/github-events-probe";

describe("YC_VC_FUNDED_ORGS — P1-2 expansion", () => {
  it("has at least 100 orgs", () => {
    expect(YC_VC_FUNDED_ORGS.length).toBeGreaterThanOrEqual(100);
  });

  it("has no duplicates", () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const org of YC_VC_FUNDED_ORGS) {
      if (seen.has(org)) dupes.push(org);
      seen.add(org);
    }
    expect(dupes).toEqual([]);
  });

  it("all entries are lowercase", () => {
    const upper = YC_VC_FUNDED_ORGS.filter((o) => o !== o.toLowerCase());
    expect(upper).toEqual([]);
  });

  it("all entries are non-empty strings", () => {
    const empty = YC_VC_FUNDED_ORGS.filter((o) => !o || o.trim().length === 0);
    expect(empty).toEqual([]);
  });

  it("contains the original 10 YC sample orgs", () => {
    const required = ["vercel", "supabase", "renderinc", "calcom", "dubinc"];
    for (const org of required) {
      expect(YC_VC_FUNDED_ORGS).toContain(org);
    }
  });

  it("contains frontend framework orgs", () => {
    const frontendOrgs = [
      "facebook",
      "vuejs",
      "angular",
      "sveltejs",
      "astro-build",
    ];
    for (const org of frontendOrgs) {
      expect(YC_VC_FUNDED_ORGS).toContain(org);
    }
  });

  it("contains dev tooling orgs", () => {
    const toolingOrgs = ["storybookjs", "tailwindlabs", "vitejs", "biomejs"];
    for (const org of toolingOrgs) {
      expect(YC_VC_FUNDED_ORGS).toContain(org);
    }
  });

  it("contains YC/VC-funded startup orgs", () => {
    const startups = [
      "resend",
      "triggerdotdev",
      "inngest",
      "clerkinc",
      "posthog",
    ];
    for (const org of startups) {
      expect(YC_VC_FUNDED_ORGS).toContain(org);
    }
  });

  it("contains design/frontend SaaS orgs", () => {
    const saas = ["figma", "linear", "notionhq"];
    for (const org of saas) {
      expect(YC_VC_FUNDED_ORGS).toContain(org);
    }
  });
});
