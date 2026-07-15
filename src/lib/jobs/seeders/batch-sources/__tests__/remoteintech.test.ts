// Tests for the remoteintech/remote-jobs S1 parser
// src/lib/jobs/seeders/batch-sources/__tests__/remoteintech.test.ts

import { describe, expect, it } from "vitest";
import {
  parseFrontmatter,
  passesPreFilter,
  type RemoteInTechCompany,
  toRemoteInTechCompany,
} from "@/lib/jobs/seeders/batch-sources/remoteintech";

describe("remoteintech S1 parser", () => {
  // ── parseFrontmatter ───────────────────────────────────────────────────────

  describe("parseFrontmatter", () => {
    it("parses standard frontmatter with all fields", () => {
      const markdown = `---
title: "10up"
slug: 10up
website: https://10up.com/
careers_url: https://10up.com/careers/
region: worldwide
remote_policy: fully-remote
company_size: medium
technologies:
  - javascript
  - php
addedAt: 2015-10-14
updatedAt: 2018-04-16
---

## Company blurb
We make websites.`;

      const result = parseFrontmatter(markdown);
      expect(result).not.toBeNull();
      expect(result?.title).toBe("10up");
      expect(result?.slug).toBe("10up");
      expect(result?.website).toBe("https://10up.com/");
      expect(result?.region).toBe("worldwide");
      expect(result?.technologies).toEqual(["javascript", "php"]);
    });

    it("parses frontmatter without technologies array", () => {
      const markdown = `---
title: "Acme"
slug: acme
website: https://acme.com
region: americas
remote_policy: remote-friendly
---

Content`;

      const result = parseFrontmatter(markdown);
      expect(result?.title).toBe("Acme");
      expect(result?.region).toBe("americas");
    });

    it("returns null for markdown without frontmatter", () => {
      expect(parseFrontmatter("Just content, no frontmatter")).toBeNull();
    });

    it("handles quoted values", () => {
      const markdown = `---
title: "Stripe, Inc."
slug: stripe
website: https://stripe.com
region: worldwide
---

Content`;

      const result = parseFrontmatter(markdown);
      expect(result?.title).toBe("Stripe, Inc.");
    });
  });

  // ── toRemoteInTechCompany ──────────────────────────────────────────────────

  describe("toRemoteInTechCompany", () => {
    it("converts frontmatter to company object", () => {
      const fm = {
        title: "Test Co",
        slug: "test-co",
        website: "https://test.com",
        careers_url: "https://test.com/jobs",
        region: "worldwide",
        remote_policy: "fully-remote",
        company_size: "small",
        technologies: ["javascript", "react"],
        addedAt: "2024-01-01",
        updatedAt: "2024-06-01",
      };

      const company = toRemoteInTechCompany(fm);
      expect(company.name).toBe("Test Co");
      expect(company.careersUrl).toBe("https://test.com/jobs");
      expect(company.technologies).toEqual(["javascript", "react"]);
    });

    it("handles missing optional fields", () => {
      const fm = {
        title: "Minimal",
        slug: "minimal",
        website: "https://minimal.com",
        region: "europe",
      };

      const company = toRemoteInTechCompany(fm);
      expect(company.careersUrl).toBeNull();
      expect(company.technologies).toEqual([]);
      expect(company.remotePolicy).toBe("unknown");
    });
  });

  // ── passesPreFilter ────────────────────────────────────────────────────────

  describe("passesPreFilter", () => {
    const makeCompany = (
      overrides: Partial<RemoteInTechCompany> = {},
    ): RemoteInTechCompany => ({
      name: "Test",
      slug: "test",
      website: "https://test.com",
      careersUrl: "https://test.com/jobs",
      region: "worldwide",
      remotePolicy: "fully-remote",
      companySize: "small",
      technologies: ["javascript"],
      addedAt: null,
      updatedAt: null,
      ...overrides,
    });

    it("passes for worldwide + javascript + careers_url", () => {
      const result = passesPreFilter(makeCompany());
      expect(result.passed).toBe(true);
      expect(result.reason).toBeNull();
    });

    it("passes for americas-europe + php", () => {
      const result = passesPreFilter(
        makeCompany({ region: "americas-europe", technologies: ["php"] }),
      );
      expect(result.passed).toBe(true);
    });

    // Region filter was REMOVED (Directive 04 Fix 3) — 65% false-negative rate.
    // The downstream per-job genuine-global classifier is the correct gate.
    it("passes for europe region (region filter removed)", () => {
      const result = passesPreFilter(makeCompany({ region: "europe" }));
      expect(result.passed).toBe(true);
    });

    it("passes for americas region (region filter removed)", () => {
      const result = passesPreFilter(makeCompany({ region: "americas" }));
      expect(result.passed).toBe(true);
    });

    it("passes for worldwide but no web-dev tech (tech filter removed)", () => {
      // Directive 05 Catch 4: tech pre-filter dropped. Fingerprint v3 reads
      // the real job feed and strictly dominates frontmatter tags.
      const result = passesPreFilter(
        makeCompany({ technologies: ["python", "go"] }),
      );
      expect(result.passed).toBe(true);
    });

    it("fails for no careers_url and no website", () => {
      const result = passesPreFilter(
        makeCompany({ careersUrl: null, website: "" }),
      );
      expect(result.passed).toBe(false);
      expect(result.reason).toBe("no_url");
    });

    it("passes with no careers_url but has website (fallback)", () => {
      const result = passesPreFilter(
        makeCompany({ careersUrl: null, website: "https://test.com" }),
      );
      expect(result.passed).toBe(true);
    });
  });
});
