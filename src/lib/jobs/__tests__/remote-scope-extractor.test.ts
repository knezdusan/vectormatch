// Remote-Scope Extractor — Unit + Integration Tests
// src/lib/jobs/__tests__/remote-scope-extractor.test.ts
//
// Tests the v2 two-step remote-scope extraction ladder (Criterion 2):
//   Step 1a: ATS-native workplaceType trust path
//   Step 1b: cheerio main-content extraction
//   Step 1c: Regex hard-signal matching with confidence scoring
//   Step 1d: HQ stripping
//   Step 2: LLM extraction (sync path, mocked)
//   Hard-fail: undetermined + retryable
//
// Per AGENTS.md: Vitest for unit/integration tests. LLM calls are mocked
// (no real OpenAI API calls in tests).

import { describe, expect, it, vi } from "vitest";
import {
  extractMainContent,
  extractRemoteScope,
  isHardFailRetryable,
  type LlmScopeExtractor,
  type RemoteScope,
  step1AtsNativeTrust,
  step1RegexHardSignals,
  stripCompanyHq,
} from "@/lib/jobs/remote-scope-extractor";

// =============================================================================
// HELPERS
// =============================================================================

/** Mock LLM extractor that returns a fixed result. */
function makeMockLlm(result: {
  remoteScope: RemoteScope;
  allowedCountries: string[] | null;
  confidence: number;
}): LlmScopeExtractor {
  return vi.fn(async () => result);
}

/** Mock LLM extractor that throws (simulates OpenAI API failure). */
function makeFailingLlm(): LlmScopeExtractor {
  return vi.fn(async () => {
    throw new Error("OpenAI API error");
  });
}

// =============================================================================
// STEP 1a — ATS-NATIVE WORKPLACE TYPE TRUST PATH
// =============================================================================

describe("Step 1a — ATS-native workplaceType trust", () => {
  it("returns 'onsite' for on-site jobs from Lever", () => {
    const result = step1AtsNativeTrust("on-site", "lever");
    expect(result).toEqual({
      remoteScope: "onsite",
      allowedCountries: null,
      resolvedBy: "step1_ats_native",
      confidence: 1.0,
    });
  });

  it("returns 'onsite' for hybrid jobs from Ashby", () => {
    const result = step1AtsNativeTrust("hybrid", "ashby");
    expect(result).toEqual({
      remoteScope: "onsite",
      allowedCountries: null,
      resolvedBy: "step1_ats_native",
      confidence: 1.0,
    });
  });

  it("returns null for remote jobs (needs scope classification)", () => {
    expect(step1AtsNativeTrust("remote", "lever")).toBeNull();
  });

  it("returns null for null workplaceType (needs full extraction)", () => {
    expect(step1AtsNativeTrust(null, "lever")).toBeNull();
  });

  it("returns null for Greenhouse (no structured workplaceType — ~85% miss rate)", () => {
    // Greenhouse has no structured workplaceType field — skip the trust path
    // entirely even if workplaceType was heuristically detected.
    expect(step1AtsNativeTrust("on-site", "greenhouse")).toBeNull();
    expect(step1AtsNativeTrust("remote", "greenhouse")).toBeNull();
  });
});

// =============================================================================
// STEP 1b — CHEERIO MAIN-CONTENT EXTRACTION
// =============================================================================

describe("Step 1b — cheerio main-content extraction", () => {
  it("extracts text from <main> semantic container", () => {
    const html = `
      <nav>Home About Contact</nav>
      <main>
        <h1>Senior Backend Engineer</h1>
        <p>We are looking for a Senior Backend Engineer to join our distributed team.
        You will work on scalable systems using Go and Kubernetes. This is a remote
        position with a global team spanning multiple time zones.</p>
      </main>
      <footer>Copyright 2026</footer>
    `;
    const text = extractMainContent(html);
    expect(text).toContain("Senior Backend Engineer");
    expect(text).toContain("distributed team");
    expect(text).not.toContain("Home About Contact");
    expect(text).not.toContain("Copyright");
  });

  it("extracts text from [role='main'] container", () => {
    const html = `<div role="main"><p>Remote - Global. Work from anywhere. We use React and TypeScript.</p></div>`;
    const text = extractMainContent(html);
    expect(text).toContain("Work from anywhere");
  });

  it("extracts text from .job-listing class container", () => {
    const html = `<div class="job-listing"><p>Remote worldwide. Senior Engineer. Must have 5+ years experience.</p></div>`;
    const text = extractMainContent(html);
    expect(text).toContain("Remote worldwide");
  });

  it("strips script and style tags entirely", () => {
    const html = `
      <script>console.log("tracking");</script>
      <style>.nav { color: red; }</style>
      <main><p>Remote - Global. Work from anywhere.</p></main>
    `;
    const text = extractMainContent(html);
    expect(text).not.toContain("tracking");
    expect(text).not.toContain("color: red");
    expect(text).toContain("Work from anywhere");
  });

  it("returns plain text as-is for non-HTML input", () => {
    const plain =
      "Remote - Global. Work from anywhere. We use React and TypeScript.";
    const text = extractMainContent(plain);
    expect(text).toBe(plain);
  });

  it("returns empty string for null input", () => {
    expect(extractMainContent(null)).toBe("");
    expect(extractMainContent("")).toBe("");
  });

  it("falls back to text-density scoring when no semantic container matches", () => {
    const html = `
      <div class="layout-wrapper">
        <div class="sidebar">Menu Item 1 Menu Item 2 Menu Item 3</div>
        <div class="content">
          <p>Remote - Global. We are a distributed team looking for a Senior Engineer.
          You will work on scalable systems using Go and Kubernetes. This is a remote
          position with a global team spanning multiple time zones. We offer competitive
          salary and equity. Apply now to join our team of engineers working across
          twelve countries.</p>
        </div>
      </div>
    `;
    const text = extractMainContent(html);
    // The content div should have higher text density than the sidebar.
    expect(text).toContain("distributed team");
    expect(text).toContain("Remote - Global");
  });
});

// =============================================================================
// STEP 1c — REGEX HARD-SIGNALS
// =============================================================================

describe("Step 1c — regex hard-signals with confidence scoring", () => {
  it("classifies 'Remote - Global' as global with confidence 1.0", () => {
    const result = step1RegexHardSignals(
      "This is a Remote - Global position.",
      null,
    );
    expect(result).toEqual({
      remoteScope: "global",
      allowedCountries: null,
      resolvedBy: "step1_regex",
      confidence: 1.0,
    });
  });

  it("classifies 'work from anywhere' as global", () => {
    const result = step1RegexHardSignals(
      "Work from anywhere in the world.",
      null,
    );
    expect(result?.remoteScope).toBe("global");
  });

  it("classifies 'distributed team' as global", () => {
    const result = step1RegexHardSignals(
      "Join our distributed team across 12 countries.",
      null,
    );
    expect(result?.remoteScope).toBe("global");
  });

  it("classifies 'Remote - US Only' as country_fenced", () => {
    const result = step1RegexHardSignals(
      "This is a Remote - US Only position.",
      null,
    );
    expect(result?.remoteScope).toBe("country_fenced");
    expect(result?.allowedCountries).toContain("US");
  });

  it("classifies 'must reside in Germany' as country_fenced", () => {
    const result = step1RegexHardSignals(
      "Candidate must reside in Germany.",
      null,
    );
    expect(result?.remoteScope).toBe("country_fenced");
    expect(result?.allowedCountries).toContain("DE");
  });

  it("classifies 'authorized to work in US' as country_fenced", () => {
    const result = step1RegexHardSignals(
      "Must be authorized to work in the US.",
      null,
    );
    expect(result?.remoteScope).toBe("country_fenced");
  });

  it("classifies 'Remote - Latam' as region_fenced", () => {
    const result = step1RegexHardSignals(
      "Remote - Latam. Senior Engineer.",
      null,
    );
    expect(result?.remoteScope).toBe("region_fenced");
  });

  it("classifies 'Remote - APAC' as region_fenced", () => {
    const result = step1RegexHardSignals(
      "Remote - APAC position available.",
      null,
    );
    expect(result?.remoteScope).toBe("region_fenced");
  });

  it("classifies 'Remote - EMEA' as region_fenced", () => {
    const result = step1RegexHardSignals("This is a Remote - EMEA role.", null);
    expect(result?.remoteScope).toBe("region_fenced");
  });

  it("classifies on-site hard signals when workplaceType is null", () => {
    const result = step1RegexHardSignals(
      "This is an on-site position in our office.",
      null,
    );
    expect(result?.remoteScope).toBe("onsite");
  });

  it("does not classify on-site signals when workplaceType is remote", () => {
    // If workplaceType is already 'remote', on-site regex should not fire.
    const result = step1RegexHardSignals(
      "This is an on-site position.",
      "remote",
    );
    expect(result).toBeNull();
  });

  it("returns null for inconclusive text (routes to Step 2)", () => {
    const result = step1RegexHardSignals(
      "We are hiring a software engineer.",
      null,
    );
    expect(result).toBeNull();
  });

  it("global signals take priority over country-fenced", () => {
    // If the JD says both "global" and "US", global wins (per governing doc).
    const text = "Remote - Global. Must be authorized to work in US.";
    const result = step1RegexHardSignals(text, "remote");
    expect(result?.remoteScope).toBe("global");
  });
});

// =============================================================================
// STEP 1d — HQ STRIPPING
// =============================================================================

describe("Step 1d — HQ stripping", () => {
  it("removes company HQ location from text", () => {
    const text =
      "Remote position. Office located in San Francisco, CA. Work from anywhere.";
    const result = stripCompanyHq(text, "San Francisco, CA");
    expect(result).not.toContain("San Francisco, CA");
    expect(result).toContain("Work from anywhere");
  });

  it("returns text unchanged when no HQ provided", () => {
    const text = "Remote - Global. Work from anywhere.";
    expect(stripCompanyHq(text, null)).toBe(text);
  });

  it("is case-insensitive", () => {
    const text = "Our office is in BERLIN, Germany. Remote - Global.";
    const result = stripCompanyHq(text, "Berlin, Germany");
    expect(result).not.toContain("BERLIN, Germany");
  });
});

// =============================================================================
// STEP 2 — LLM EXTRACTION (MOCKED)
// =============================================================================

describe("Step 2 — LLM extraction (sync path, mocked)", () => {
  it("returns LLM result when Step 1 is inconclusive", async () => {
    const mockLlm = makeMockLlm({
      remoteScope: "global",
      allowedCountries: null,
      confidence: 0.9,
    });
    const result = await extractRemoteScope(
      "We are hiring a software engineer. The role involves building scalable systems.",
      "remote",
      "lever",
      null,
      mockLlm,
    );
    expect(result.remoteScope).toBe("global");
    expect(result.resolvedBy).toBe("step2_llm");
    expect(result.confidence).toBe(0.9);
  });

  it("returns LLM result for country_fenced with allowedCountries", async () => {
    const mockLlm = makeMockLlm({
      remoteScope: "country_fenced",
      allowedCountries: ["US", "CA"],
      confidence: 0.85,
    });
    const result = await extractRemoteScope(
      "We are hiring a senior software engineer. This is a remote position with some geographic restrictions that may apply to candidates.",
      "remote",
      "lever",
      null,
      mockLlm,
    );
    expect(result.remoteScope).toBe("country_fenced");
    expect(result.allowedCountries).toEqual(["US", "CA"]);
  });
});

// =============================================================================
// HARD-FAIL PATH
// =============================================================================

describe("Hard-fail path", () => {
  it("returns undetermined when LLM fails (never defaults to restrictive)", async () => {
    const result = await extractRemoteScope(
      "We are hiring a software engineer to join our growing team. You will work on building scalable backend systems and collaborating with product teams.",
      "remote",
      "lever",
      null,
      makeFailingLlm(),
    );
    expect(result.remoteScope).toBe("undetermined");
    expect(result.resolvedBy).toBe("hard_fail");
    expect(result.confidence).toBe(0);
  });

  it("returns undetermined for empty/too-short cleaned text (no LLM call)", async () => {
    const mockLlm = makeMockLlm({
      remoteScope: "global",
      allowedCountries: null,
      confidence: 1.0,
    });
    const result = await extractRemoteScope(
      "Short",
      null,
      "greenhouse",
      null,
      mockLlm,
    );
    expect(result.remoteScope).toBe("undetermined");
    expect(result.resolvedBy).toBe("hard_fail");
    // LLM should not have been called for short text.
    expect(mockLlm).not.toHaveBeenCalled();
  });

  it("returns undetermined for null content", async () => {
    const result = await extractRemoteScope(null, null, "greenhouse", null);
    expect(result.remoteScope).toBe("undetermined");
    expect(result.resolvedBy).toBe("hard_fail");
  });

  it("isHardFailRetryable returns true for empty/garbage hard-fail", () => {
    const result = {
      remoteScope: "undetermined" as const,
      allowedCountries: null,
      resolvedBy: "hard_fail" as const,
      confidence: 0,
    };
    expect(isHardFailRetryable(result)).toBe(true);
  });

  it("isHardFailRetryable returns false for LLM-error hard-fail with confidence > 0", () => {
    // If the LLM returned a result with some confidence but still failed,
    // it's not a retryable hard-fail (the LLM was available but uncertain).
    const result = {
      remoteScope: "undetermined" as const,
      allowedCountries: null,
      resolvedBy: "hard_fail" as const,
      confidence: 0.3,
    };
    expect(isHardFailRetryable(result)).toBe(false);
  });
});

// =============================================================================
// FULL LADDER INTEGRATION (Step 1 → Step 2 fallback)
// =============================================================================

describe("Full extraction ladder integration", () => {
  it("Step 1a resolves on-site jobs without calling LLM", async () => {
    const mockLlm = makeMockLlm({
      remoteScope: "global",
      allowedCountries: null,
      confidence: 1.0,
    });
    const result = await extractRemoteScope(
      "Some job description text here.",
      "on-site",
      "lever",
      null,
      mockLlm,
    );
    expect(result.remoteScope).toBe("onsite");
    expect(result.resolvedBy).toBe("step1_ats_native");
    expect(mockLlm).not.toHaveBeenCalled();
  });

  it("Step 1c resolves global remote without calling LLM", async () => {
    const mockLlm = makeMockLlm({
      remoteScope: "country_fenced",
      allowedCountries: ["US"],
      confidence: 1.0,
    });
    const result = await extractRemoteScope(
      "Remote - Global. Work from anywhere. We are a distributed team.",
      "remote",
      "lever",
      null,
      mockLlm,
    );
    expect(result.remoteScope).toBe("global");
    expect(result.resolvedBy).toBe("step1_regex");
    expect(mockLlm).not.toHaveBeenCalled();
  });

  it("Step 1c resolves country_fenced without calling LLM", async () => {
    const mockLlm = makeMockLlm({
      remoteScope: "global",
      allowedCountries: null,
      confidence: 1.0,
    });
    const result = await extractRemoteScope(
      "Remote - US Only. Must reside in the United States.",
      "remote",
      "lever",
      null,
      mockLlm,
    );
    expect(result.remoteScope).toBe("country_fenced");
    expect(result.resolvedBy).toBe("step1_regex");
    expect(mockLlm).not.toHaveBeenCalled();
  });

  it("Step 1d HQ stripping prevents false country_fenced from HQ location", async () => {
    // The JD says "Remote - Global" but also mentions the HQ city.
    // Without HQ stripping, the HQ city might trigger country_fenced.
    const mockLlm = makeMockLlm({
      remoteScope: "country_fenced",
      allowedCountries: ["US"],
      confidence: 1.0,
    });
    const result = await extractRemoteScope(
      "Our office is in San Francisco, CA. Remote - Global. Work from anywhere.",
      "remote",
      "lever",
      "San Francisco, CA",
      mockLlm,
    );
    // Step 1c should find "Remote - Global" and classify as global,
    // even though the HQ city is mentioned.
    expect(result.remoteScope).toBe("global");
    expect(result.resolvedBy).toBe("step1_regex");
  });

  it("Greenhouse jobs skip Step 1a and go to Step 1b/1c/2", async () => {
    // Greenhouse has no structured workplaceType — the trust path is skipped.
    const mockLlm = makeMockLlm({
      remoteScope: "global",
      allowedCountries: null,
      confidence: 0.9,
    });
    const result = await extractRemoteScope(
      "We are hiring a software engineer to join our team. You will work on building scalable backend systems and collaborating with product teams.",
      null,
      "greenhouse",
      null,
      mockLlm,
    );
    // Step 1a skipped (greenhouse), Step 1c inconclusive, Step 2 LLM called.
    expect(result.resolvedBy).toBe("step2_llm");
    expect(mockLlm).toHaveBeenCalled();
  });

  it("cheerio cleaning runs before regex on HTML input", async () => {
    const mockLlm = makeMockLlm({
      remoteScope: "global",
      allowedCountries: null,
      confidence: 1.0,
    });
    const html = `
      <nav>Home About</nav>
      <main>
        <p>Remote - Global. Work from anywhere. We are a distributed team.</p>
      </main>
      <footer>Copyright 2026</footer>
    `;
    const result = await extractRemoteScope(
      html,
      null,
      "greenhouse",
      null,
      mockLlm,
    );
    // Step 1b extracts main content, Step 1c finds "Remote - Global".
    expect(result.remoteScope).toBe("global");
    expect(result.resolvedBy).toBe("step1_regex");
    expect(mockLlm).not.toHaveBeenCalled();
  });
});

// =============================================================================
// STEP 1e — LOCATION-BASED FALLBACK (Fix 1b — mismatch investigation)
// =============================================================================

describe("Step 1e — Location-based fallback (Fix 1b)", () => {
  it("classifies remote + 'Pakistan' location as country_fenced without calling LLM", async () => {
    const mockLlm = makeMockLlm({
      remoteScope: "global",
      allowedCountries: null,
      confidence: 0.9,
    });
    const result = await extractRemoteScope(
      "We are hiring a senior engineer to build scalable systems.",
      "remote",
      "lever",
      "Pakistan",
      mockLlm,
    );
    expect(result.remoteScope).toBe("country_fenced");
    expect(result.resolvedBy).toBe("step1_regex");
    expect(mockLlm).not.toHaveBeenCalled();
  });

  it("classifies remote + 'Pune, MH, in' location as country_fenced", async () => {
    const mockLlm = makeMockLlm({
      remoteScope: "global",
      allowedCountries: null,
      confidence: 0.9,
    });
    const result = await extractRemoteScope(
      "Full Stack Java Developer with 3+ years of experience.",
      "remote",
      "smartrecruiters",
      "Pune, MH, in",
      mockLlm,
    );
    expect(result.remoteScope).toBe("country_fenced");
    expect(mockLlm).not.toHaveBeenCalled();
  });

  it("classifies remote + 'San Francisco, CA' location as country_fenced", async () => {
    const mockLlm = makeMockLlm({
      remoteScope: "global",
      allowedCountries: null,
      confidence: 0.9,
    });
    const result = await extractRemoteScope(
      "Software Engineer for an applied AI product.",
      "remote",
      "ashby",
      "San Francisco, CA",
      mockLlm,
    );
    expect(result.remoteScope).toBe("country_fenced");
    expect(mockLlm).not.toHaveBeenCalled();
  });

  it("does NOT fire when JD says 'Remote - Global' (Step 1c regex wins)", async () => {
    const mockLlm = makeMockLlm({
      remoteScope: "country_fenced",
      allowedCountries: ["US"],
      confidence: 1.0,
    });
    const result = await extractRemoteScope(
      "Remote - Global. Work from anywhere. We are a distributed team.",
      "remote",
      "lever",
      "San Francisco, CA",
      mockLlm,
    );
    // Step 1c regex finds "Remote - Global" → global (Step 1e never runs)
    expect(result.remoteScope).toBe("global");
    expect(result.resolvedBy).toBe("step1_regex");
  });

  it("does NOT fire for 'Remote - Global' location (not specific)", async () => {
    const mockLlm = makeMockLlm({
      remoteScope: "global",
      allowedCountries: null,
      confidence: 0.9,
    });
    const result = await extractRemoteScope(
      "We are hiring a senior software engineer to join our growing team and build scalable systems.",
      "remote",
      "lever",
      "Remote - Global",
      mockLlm,
    );
    // "Remote - Global" is not a specific location → Step 1e doesn't fire → LLM
    expect(result.resolvedBy).toBe("step2_llm");
    expect(mockLlm).toHaveBeenCalled();
  });

  it("does NOT fire for 'European Union' location (broad region)", async () => {
    const mockLlm = makeMockLlm({
      remoteScope: "global",
      allowedCountries: null,
      confidence: 0.9,
    });
    const result = await extractRemoteScope(
      "We are hiring a senior software engineer to join our growing team and build scalable systems.",
      "remote",
      "lever",
      "European Union",
      mockLlm,
    );
    expect(result.resolvedBy).toBe("step2_llm");
    expect(mockLlm).toHaveBeenCalled();
  });

  it("does NOT fire for on-site jobs (Step 1a handles them)", async () => {
    const mockLlm = makeMockLlm({
      remoteScope: "global",
      allowedCountries: null,
      confidence: 1.0,
    });
    const result = await extractRemoteScope(
      "Some job description text here.",
      "on-site",
      "lever",
      "Pakistan",
      mockLlm,
    );
    expect(result.remoteScope).toBe("onsite");
    expect(result.resolvedBy).toBe("step1_ats_native");
  });

  it("Rule 6: null workplaceType + specific location 'Pakistan' → onsite (no LLM)", async () => {
    const mockLlm = makeMockLlm({
      remoteScope: "global",
      allowedCountries: null,
      confidence: 0.9,
    });
    const result = await extractRemoteScope(
      "We are hiring a senior software engineer to join our growing team and build scalable systems.",
      null,
      "greenhouse",
      "Pakistan",
      mockLlm,
    );
    // Rule 6: null workplace + specific location → onsite (no LLM call)
    expect(result.remoteScope).toBe("onsite");
    expect(result.resolvedBy).toBe("step1_regex");
    expect(mockLlm).not.toHaveBeenCalled();
  });

  it("does NOT fire for null location", async () => {
    const mockLlm = makeMockLlm({
      remoteScope: "global",
      allowedCountries: null,
      confidence: 0.9,
    });
    const result = await extractRemoteScope(
      "We are hiring a senior software engineer to join our growing team and build scalable systems.",
      "remote",
      "lever",
      null,
      mockLlm,
    );
    expect(result.resolvedBy).toBe("step2_llm");
    expect(mockLlm).toHaveBeenCalled();
  });

  // Fix 3: Country name in location alongside "Remote" (NoFluffJobs format)
  it("Fix 3: classifies remote + 'Poland / Remote / Poland' as country_fenced", async () => {
    const mockLlm = makeMockLlm({
      remoteScope: "global",
      allowedCountries: null,
      confidence: 0.9,
    });
    const result = await extractRemoteScope(
      "Fullstack Developer (Java + React) at ITFS Sp. z o.o. Technology: Java. Category: fullstack.",
      "remote",
      "nofluffjobs",
      "Poland / Remote / Poland / Poland / Poland",
      mockLlm,
    );
    expect(result.remoteScope).toBe("country_fenced");
    expect(result.allowedCountries).toEqual(["PL"]);
    expect(result.resolvedBy).toBe("step1_regex");
    expect(mockLlm).not.toHaveBeenCalled();
  });

  it("Fix 3: classifies remote + 'United States / Remote' as country_fenced", async () => {
    const mockLlm = makeMockLlm({
      remoteScope: "global",
      allowedCountries: null,
      confidence: 0.9,
    });
    const result = await extractRemoteScope(
      "We are hiring a senior software engineer to join our growing team.",
      "remote",
      "lever",
      "United States / Remote",
      mockLlm,
    );
    expect(result.remoteScope).toBe("country_fenced");
    expect(result.allowedCountries).toEqual(["US"]);
    expect(mockLlm).not.toHaveBeenCalled();
  });

  it("Fix 3: does NOT fire for 'Remote - Global' (no country name in location)", async () => {
    const mockLlm = makeMockLlm({
      remoteScope: "global",
      allowedCountries: null,
      confidence: 0.9,
    });
    const result = await extractRemoteScope(
      "We are hiring a senior software engineer to join our growing team and build scalable systems.",
      "remote",
      "lever",
      "Remote - Global",
      mockLlm,
    );
    // "Remote - Global" has no country name → Step 1e doesn't fire → LLM
    expect(result.resolvedBy).toBe("step2_llm");
    expect(mockLlm).toHaveBeenCalled();
  });

  // July 2026 mismatch regression: "Remote - U.S." was misclassified as "global"
  // because the JD text contained "global" phrases that the regex matched before
  // the location check ran. Fix 3 moves the location check before the regex for
  // location strings containing remote indicators.
  it("Fix 3: classifies 'Remote - U.S.' as country_fenced even when JD says 'global'", async () => {
    const mockLlm = makeMockLlm({
      remoteScope: "global",
      allowedCountries: null,
      confidence: 0.9,
    });
    const result = await extractRemoteScope(
      "Join our global team. We are a distributed workforce building scalable systems. Work from anywhere in the US.",
      "remote",
      "ashby",
      "Remote - U.S.",
      mockLlm,
    );
    // The location "Remote - U.S." contains "remote" + "U.S." (country name)
    // → Step 1e fires BEFORE the regex, classifying as country_fenced (US).
    // Without Fix 3, the regex would match "global" / "distributed" first
    // and classify as "global" — the root cause of the Ashby mismatch.
    expect(result.remoteScope).toBe("country_fenced");
    expect(result.allowedCountries).toEqual(["US"]);
    expect(result.resolvedBy).toBe("step1_regex");
    expect(mockLlm).not.toHaveBeenCalled();
  });

  it("Fix 3: does NOT fire for 'San Francisco, CA' (no remote indicator)", async () => {
    // Pure city locations (no "remote" in the location string) should NOT
    // trigger the pre-regex location check. This prevents false positives
    // from state abbreviations that conflict with country codes (CA =
    // California vs Canada). The regex evaluates the JD text first.
    const mockLlm = makeMockLlm({
      remoteScope: "global",
      allowedCountries: null,
      confidence: 0.9,
    });
    const result = await extractRemoteScope(
      "Remote - Global. Work from anywhere. We are a distributed team.",
      "remote",
      "lever",
      "San Francisco, CA",
      mockLlm,
    );
    // Step 1c regex finds "Remote - Global" → global (Step 1e pre-regex
    // check doesn't fire because "San Francisco, CA" has no remote indicator)
    expect(result.remoteScope).toBe("global");
    expect(result.resolvedBy).toBe("step1_regex");
  });
});

// =============================================================================
// STEP 1f — RULE 6: null workplaceType + specific city → onsite (v4 lock)
// =============================================================================

describe("Step 1f — Rule 6: null workplaceType + specific city → onsite", () => {
  it("classifies null workplace + 'San Francisco, CA' as onsite (SF New Grad case)", async () => {
    const mockLlm = makeMockLlm({
      remoteScope: "global",
      allowedCountries: null,
      confidence: 0.9,
    });
    const result = await extractRemoteScope(
      "Software Engineer - Product (New Grad). We are an early stage applied AI startup building agents that automate knowledge work with code.",
      null,
      "greenhouse",
      "San Francisco, CA",
      mockLlm,
    );
    // Rule 6: null workplace + specific city → onsite (no LLM call)
    expect(result.remoteScope).toBe("onsite");
    expect(result.resolvedBy).toBe("step1_regex");
    expect(mockLlm).not.toHaveBeenCalled();
  });

  it("classifies null workplace + 'Remote - US' as country_fenced (not onsite)", async () => {
    const mockLlm = makeMockLlm({
      remoteScope: "global",
      allowedCountries: null,
      confidence: 0.9,
    });
    const result = await extractRemoteScope(
      "We are hiring a senior software engineer to join our growing team and build scalable systems with modern web technologies.",
      null,
      "greenhouse",
      "Remote - US",
      mockLlm,
    );
    // "Remote - US" contains "remote" → isSpecificLocation returns false →
    // Rule 6 doesn't fire. Step 1e catches it as country_fenced (US).
    expect(result.remoteScope).toBe("country_fenced");
    expect(result.allowedCountries).toEqual(["US"]);
    expect(mockLlm).not.toHaveBeenCalled();
  });

  it("does NOT fire for remote workplaceType (only applies to null)", async () => {
    const mockLlm = makeMockLlm({
      remoteScope: "global",
      allowedCountries: null,
      confidence: 0.9,
    });
    const result = await extractRemoteScope(
      "Remote - Global. Work from anywhere. We are a distributed team.",
      "remote",
      "lever",
      "San Francisco, CA",
      mockLlm,
    );
    // workplaceType = "remote" → Rule 6 doesn't fire → regex evaluates JD text
    expect(result.remoteScope).toBe("global");
    expect(result.resolvedBy).toBe("step1_regex");
  });

  it("does NOT fire for broad region location 'APAC'", async () => {
    const mockLlm = makeMockLlm({
      remoteScope: "global",
      allowedCountries: null,
      confidence: 0.9,
    });
    const result = await extractRemoteScope(
      "We are hiring a senior software engineer to join our growing team and build scalable systems with modern web technologies.",
      null,
      "greenhouse",
      "APAC",
      mockLlm,
    );
    // "APAC" is a broad region → isSpecificLocation returns false →
    // Rule 6 doesn't fire → LLM evaluates
    expect(result.resolvedBy).toBe("step2_llm");
    expect(mockLlm).toHaveBeenCalled();
  });

  it("does NOT fire for null location", async () => {
    const mockLlm = makeMockLlm({
      remoteScope: "global",
      allowedCountries: null,
      confidence: 0.9,
    });
    const result = await extractRemoteScope(
      "We are hiring a senior software engineer to join our growing team.",
      null,
      "greenhouse",
      null,
      mockLlm,
    );
    // No location → Rule 6 doesn't fire → LLM evaluates
    expect(result.resolvedBy).toBe("step2_llm");
    expect(mockLlm).toHaveBeenCalled();
  });
});
