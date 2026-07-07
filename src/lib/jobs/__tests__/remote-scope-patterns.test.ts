/**
 * Unit tests for the expanded Remote-Scope Pattern Dictionary (Task A2).
 * src/lib/jobs/remote-scope-patterns.ts
 *
 * Tests cover:
 *   - Each pattern category (global high, country_fenced high, region_fenced high, medium)
 *   - Confidence levels (high = 1.0, medium = 0.7)
 *   - Country extraction (explicit allowedCountries, capture groups, full-text)
 *   - UTC range parsing (narrow = region_fenced, wide = global)
 *   - Negative signal cross-checking
 *   - Integration with step1RegexHardSignals (expanded patterns resolve cases MVP missed)
 *   - Regression: all MVP patterns still match (no pattern lost in the extraction)
 */

import { describe, expect, it } from "vitest";
import { step1RegexHardSignals } from "@/lib/jobs/remote-scope-extractor";
import {
  COUNTRY_CODE_MAP,
  COUNTRY_FENCED_HIGH,
  extractCountryCodesFromText,
  extractCountryFromCapture,
  GLOBAL_HIGH,
  HIGH_CONFIDENCE_SIGNALS,
  MEDIUM_CONFIDENCE,
  matchUtcRange,
  NEGATIVE_SIGNALS,
  REGION_FENCED_HIGH,
} from "@/lib/jobs/remote-scope-patterns";

// =============================================================================
// PATTERN TABLE STRUCTURE TESTS
// =============================================================================

describe("Pattern table structure", () => {
  it("GLOBAL_HIGH has patterns", () => {
    expect(GLOBAL_HIGH.length).toBeGreaterThan(10);
  });

  it("COUNTRY_FENCED_HIGH has patterns for major countries", () => {
    expect(COUNTRY_FENCED_HIGH.length).toBeGreaterThan(20);
    // Verify US, UK, Canada, Germany patterns exist
    const usPatterns = COUNTRY_FENCED_HIGH.filter((s) =>
      s.allowedCountries?.includes("US"),
    );
    expect(usPatterns.length).toBeGreaterThan(3);
  });

  it("REGION_FENCED_HIGH has patterns for major regions", () => {
    expect(REGION_FENCED_HIGH.length).toBeGreaterThan(5);
  });

  it("MEDIUM_CONFIDENCE has patterns", () => {
    expect(MEDIUM_CONFIDENCE.length).toBeGreaterThan(5);
  });

  it("NEGATIVE_SIGNALS has patterns", () => {
    expect(NEGATIVE_SIGNALS.length).toBeGreaterThan(2);
  });

  it("HIGH_CONFIDENCE_SIGNALS is the union of global + country + region", () => {
    expect(HIGH_CONFIDENCE_SIGNALS.length).toBe(
      GLOBAL_HIGH.length +
        COUNTRY_FENCED_HIGH.length +
        REGION_FENCED_HIGH.length,
    );
  });

  it("all high-confidence signals have confidence 'high'", () => {
    for (const s of HIGH_CONFIDENCE_SIGNALS) {
      expect(s.confidence).toBe("high");
    }
  });

  it("all medium-confidence signals have confidence 'medium'", () => {
    for (const s of MEDIUM_CONFIDENCE) {
      expect(s.confidence).toBe("medium");
    }
  });

  it("all signals have valid scope values", () => {
    for (const s of [...HIGH_CONFIDENCE_SIGNALS, ...MEDIUM_CONFIDENCE]) {
      expect(["global", "country_fenced", "region_fenced"]).toContain(s.scope);
    }
  });
});

// =============================================================================
// HIGH-CONFIDENCE GLOBAL SIGNALS
// =============================================================================

describe("GLOBAL_HIGH patterns", () => {
  const globalCases: Array<[string, string]> = [
    ["Work from anywhere in the world", "anywhere in the world"],
    ["This is a worldwide remote position", "worldwide"],
    ["Work from anywhere — we hire globally", "work from anywhere"],
    ["Remote-first company with distributed team", "remote-first"],
    ["Distributed team across 15 countries", "distributed team"],
    ["Global remote position", "global remote"],
    ["Remote - Global, work from any location", "remote - global"],
    ["Fully remote worldwide role", "fully remote worldwide"],
    ["No location restrictions for this role", "no location restrictions"],
    ["Location independent — work from home", "location independent"],
    ["Borderless hiring — we hire from any country", "borderless"],
    [
      "Our team members across 30 countries",
      "team members across 30 countries",
    ],
    ["We operates in 50 countries", "operates in 50 countries"],
  ];

  for (const [text, description] of globalCases) {
    it(`matches: "${description}"`, () => {
      const matched = GLOBAL_HIGH.some((s) => s.pattern.test(text));
      expect(matched).toBe(true);
    });
  }

  it("does NOT match 'remote within US' as global", () => {
    const matched = GLOBAL_HIGH.some((s) =>
      s.pattern.test("Remote within US only"),
    );
    expect(matched).toBe(false);
  });
});

// =============================================================================
// HIGH-CONFIDENCE COUNTRY-FENCED SIGNALS
// =============================================================================

describe("COUNTRY_FENCED_HIGH patterns", () => {
  it("matches 'US only'", () => {
    const matched = COUNTRY_FENCED_HIGH.some((s) =>
      s.pattern.test("This is US only"),
    );
    expect(matched).toBe(true);
  });

  it("matches 'W-2 only' (US-specific tax)", () => {
    const matched = COUNTRY_FENCED_HIGH.some((s) =>
      s.pattern.test("W-2 only, no C2C"),
    );
    expect(matched).toBe(true);
  });

  it("matches 'must be based in the US'", () => {
    const matched = COUNTRY_FENCED_HIGH.some((s) =>
      s.pattern.test("Must be based in the US"),
    );
    expect(matched).toBe(true);
  });

  it("matches 'authorized to work in the US'", () => {
    const matched = COUNTRY_FENCED_HIGH.some((s) =>
      s.pattern.test("Authorized to work in the US"),
    );
    expect(matched).toBe(true);
  });

  it("matches 'UK only'", () => {
    const matched = COUNTRY_FENCED_HIGH.some((s) =>
      s.pattern.test("UK only position"),
    );
    expect(matched).toBe(true);
  });

  it("matches 'right to work in the UK'", () => {
    const matched = COUNTRY_FENCED_HIGH.some((s) =>
      s.pattern.test("Must have right to work in the UK"),
    );
    expect(matched).toBe(true);
  });

  it("matches 'must reside in Germany'", () => {
    const matched = COUNTRY_FENCED_HIGH.some((s) =>
      s.pattern.test("Must reside in Germany"),
    );
    expect(matched).toBe(true);
  });

  it("matches 'Canada only'", () => {
    const matched = COUNTRY_FENCED_HIGH.some((s) =>
      s.pattern.test("Canada only — remote from anywhere in Canada"),
    );
    expect(matched).toBe(true);
  });

  it("matches 'must be based in Singapore'", () => {
    const matched = COUNTRY_FENCED_HIGH.some((s) =>
      s.pattern.test("Must be based in Singapore"),
    );
    expect(matched).toBe(true);
  });

  it("matches generic 'must reside in' (country extracted from context)", () => {
    const matched = COUNTRY_FENCED_HIGH.some((s) =>
      s.pattern.test("Must reside in Japan for this role"),
    );
    expect(matched).toBe(true);
  });

  it("US patterns declare allowedCountries=['US']", () => {
    const usPattern = COUNTRY_FENCED_HIGH.find((s) =>
      s.allowedCountries?.includes("US"),
    );
    expect(usPattern).toBeDefined();
    expect(usPattern?.allowedCountries).toEqual(["US"]);
  });
});

// =============================================================================
// HIGH-CONFIDENCE REGION-FENCED SIGNALS
// =============================================================================

describe("REGION_FENCED_HIGH patterns", () => {
  it("matches 'EU only'", () => {
    const matched = REGION_FENCED_HIGH.some((s) =>
      s.pattern.test("EU only position"),
    );
    expect(matched).toBe(true);
  });

  it("matches 'European Union only'", () => {
    const matched = REGION_FENCED_HIGH.some((s) =>
      s.pattern.test("European Union only — must be based in EU"),
    );
    expect(matched).toBe(true);
  });

  it("matches 'EMEA only'", () => {
    const matched = REGION_FENCED_HIGH.some((s) =>
      s.pattern.test("EMEA only remote role"),
    );
    expect(matched).toBe(true);
  });

  it("matches 'APAC only'", () => {
    const matched = REGION_FENCED_HIGH.some((s) =>
      s.pattern.test("APAC only — remote from Asia Pacific"),
    );
    expect(matched).toBe(true);
  });

  it("matches 'LATAM only'", () => {
    const matched = REGION_FENCED_HIGH.some((s) =>
      s.pattern.test("LATAM only position"),
    );
    expect(matched).toBe(true);
  });

  it("matches 'North America only'", () => {
    const matched = REGION_FENCED_HIGH.some((s) =>
      s.pattern.test("North America only — US and Canada"),
    );
    expect(matched).toBe(true);
  });

  it("matches 'Remote - LATAM' (ATS label)", () => {
    const matched = REGION_FENCED_HIGH.some((s) =>
      s.pattern.test("Remote - LATAM"),
    );
    expect(matched).toBe(true);
  });

  it("matches 'Remote – EMEA' (en-dash variant)", () => {
    const matched = REGION_FENCED_HIGH.some((s) =>
      s.pattern.test("Remote – EMEA"),
    );
    expect(matched).toBe(true);
  });

  it("EU patterns declare EU country codes as allowedCountries", () => {
    const euPattern = REGION_FENCED_HIGH.find((s) =>
      s.allowedCountries?.includes("DE"),
    );
    expect(euPattern).toBeDefined();
    expect(euPattern?.allowedCountries).toContain("FR");
  });
});

// =============================================================================
// MEDIUM-CONFIDENCE SIGNALS
// =============================================================================

describe("MEDIUM_CONFIDENCE patterns", () => {
  it("matches 'Remote - US' (ATS label, medium)", () => {
    const matched = MEDIUM_CONFIDENCE.some((s) =>
      s.pattern.test("Remote - US"),
    );
    expect(matched).toBe(true);
  });

  it("matches 'Remote: UK' (colon variant)", () => {
    const matched = MEDIUM_CONFIDENCE.some((s) => s.pattern.test("Remote: UK"));
    expect(matched).toBe(true);
  });

  it("matches 'must be based in Germany' (capture group)", () => {
    const matched = MEDIUM_CONFIDENCE.some((s) =>
      s.pattern.test("You must be based in Germany for this role"),
    );
    expect(matched).toBe(true);
  });

  it("matches 'right to work in France' (capture group)", () => {
    const matched = MEDIUM_CONFIDENCE.some((s) =>
      s.pattern.test("Must have right to work in France"),
    );
    expect(matched).toBe(true);
  });

  it("matches 'based in Canada only'", () => {
    const matched = MEDIUM_CONFIDENCE.some((s) =>
      s.pattern.test("Based in Canada only — remote within Canada"),
    );
    expect(matched).toBe(true);
  });
});

// =============================================================================
// NEGATIVE SIGNALS
// =============================================================================

describe("NEGATIVE_SIGNALS patterns", () => {
  it("matches 'relocation required'", () => {
    const matched = NEGATIVE_SIGNALS.some((s) =>
      s.pattern.test("Relocation required to San Francisco"),
    );
    expect(matched).toBe(true);
  });

  it("matches 'relocation offered'", () => {
    const matched = NEGATIVE_SIGNALS.some((s) =>
      s.pattern.test("Relocation offered to our NYC office"),
    );
    expect(matched).toBe(true);
  });

  it("matches 'hybrid'", () => {
    const matched = NEGATIVE_SIGNALS.some((s) =>
      s.pattern.test("Hybrid work model — 2 days in office"),
    );
    expect(matched).toBe(true);
  });

  it("matches 'on-site'", () => {
    const matched = NEGATIVE_SIGNALS.some((s) =>
      s.pattern.test("On-site position in Berlin"),
    );
    expect(matched).toBe(true);
  });

  it("matches 'local candidates only'", () => {
    const matched = NEGATIVE_SIGNALS.some((s) =>
      s.pattern.test("Local candidates only — must be in commuting distance"),
    );
    expect(matched).toBe(true);
  });
});

// =============================================================================
// UTC RANGE MATCHER
// =============================================================================

describe("matchUtcRange", () => {
  it("narrow range (UTC-5 to UTC+2) → region_fenced", () => {
    const result = matchUtcRange("Working hours UTC-5 to UTC+2");
    expect(result).not.toBeNull();
    expect(result?.scope).toBe("region_fenced");
    expect(result?.confidence).toBe("medium");
  });

  it("wide range (UTC-8 to UTC+8) → global", () => {
    const result = matchUtcRange("Flexible hours UTC-8 to UTC+8");
    expect(result).not.toBeNull();
    expect(result?.scope).toBe("global");
    expect(result?.confidence).toBe("medium");
  });

  it("en-dash variant (UTC-1 – UTC+5) → region_fenced", () => {
    const result = matchUtcRange("Working hours UTC-1 – UTC+5");
    expect(result).not.toBeNull();
    expect(result?.scope).toBe("region_fenced");
  });

  it("single offset (no range) → null", () => {
    const result = matchUtcRange("Working hours UTC+1");
    expect(result).toBeNull();
  });

  it("no UTC mention → null", () => {
    const result = matchUtcRange("No timezone restrictions");
    expect(result).toBeNull();
  });
});

// =============================================================================
// COUNTRY EXTRACTION
// =============================================================================

describe("extractCountryCodesFromText", () => {
  it("extracts US from text", () => {
    const codes = extractCountryCodesFromText("Remote position in the US");
    expect(codes).toContain("US");
  });

  it("extracts multiple countries", () => {
    const codes = extractCountryCodesFromText("Hiring in US, UK, and Canada");
    expect(codes).toContain("US");
    expect(codes).toContain("GB");
    expect(codes).toContain("CA");
  });

  it("extracts region codes (EU)", () => {
    const codes = extractCountryCodesFromText("Remote within the EU");
    expect(codes).toContain("DE");
    expect(codes).toContain("FR");
  });

  it("returns null for no country mentions", () => {
    const codes = extractCountryCodesFromText(
      "Remote position, no location specified",
    );
    expect(codes).toBeNull();
  });

  it("COUNTRY_CODE_MAP has all major countries", () => {
    expect(COUNTRY_CODE_MAP["united states"]).toBe("US");
    expect(COUNTRY_CODE_MAP["united kingdom"]).toBe("GB");
    expect(COUNTRY_CODE_MAP.germany).toBe("DE");
    expect(COUNTRY_CODE_MAP.canada).toBe("CA");
    expect(COUNTRY_CODE_MAP.singapore).toBe("SG");
    expect(COUNTRY_CODE_MAP.serbia).toBe("RS");
  });
});

describe("extractCountryFromCapture", () => {
  it("extracts US from 'United States'", () => {
    expect(extractCountryFromCapture("United States")).toBe("US");
  });

  it("extracts DE from 'Germany'", () => {
    expect(extractCountryFromCapture("Germany")).toBe("DE");
  });

  it("extracts GB from 'UK'", () => {
    expect(extractCountryFromCapture("UK")).toBe("GB");
  });

  it("returns null for unknown country", () => {
    expect(extractCountryFromCapture("Atlantis")).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(extractCountryFromCapture(undefined)).toBeNull();
  });
});

// =============================================================================
// INTEGRATION: step1RegexHardSignals with expanded patterns
// =============================================================================

describe("step1RegexHardSignals — expanded pattern integration", () => {
  it("resolves 'work from anywhere in the world' as global (high confidence)", () => {
    const result = step1RegexHardSignals(
      "Join our team — work from anywhere in the world. We are a remote-first company.",
      "remote",
    );
    expect(result).not.toBeNull();
    expect(result?.remoteScope).toBe("global");
    expect(result?.confidence).toBe(1.0);
    expect(result?.resolvedBy).toBe("step1_regex");
  });

  it("resolves 'no location restrictions' as global (new pattern, MVP missed)", () => {
    const result = step1RegexHardSignals(
      "Remote role with no location restrictions. Apply from anywhere.",
      "remote",
    );
    expect(result).not.toBeNull();
    expect(result?.remoteScope).toBe("global");
    expect(result?.confidence).toBe(1.0);
  });

  it("resolves 'location independent' as global (new pattern, MVP missed)", () => {
    const result = step1RegexHardSignals(
      "This is a location independent role.",
      "remote",
    );
    expect(result?.remoteScope).toBe("global");
    expect(result?.confidence).toBe(1.0);
  });

  it("resolves 'borderless' as global (new pattern, MVP missed)", () => {
    const result = step1RegexHardSignals(
      "Borderless hiring — we hire from any country.",
      "remote",
    );
    expect(result?.remoteScope).toBe("global");
  });

  it("resolves 'W-2 only' as country_fenced US (new pattern, MVP missed)", () => {
    const result = step1RegexHardSignals(
      "This is a W-2 only position. No C2C or 1099.",
      "remote",
    );
    expect(result?.remoteScope).toBe("country_fenced");
    expect(result?.allowedCountries).toContain("US");
  });

  it("resolves 'right to work in the UK' as country_fenced GB (new pattern)", () => {
    const result = step1RegexHardSignals(
      "Must have right to work in the UK.",
      "remote",
    );
    expect(result?.remoteScope).toBe("country_fenced");
    expect(result?.allowedCountries).toContain("GB");
  });

  it("resolves 'must be based in Singapore' as country_fenced (new country)", () => {
    const result = step1RegexHardSignals(
      "Must be based in Singapore for this role.",
      "remote",
    );
    expect(result?.remoteScope).toBe("country_fenced");
    expect(result?.allowedCountries).toContain("SG");
  });

  it("resolves 'EMEA only' as region_fenced (new pattern)", () => {
    const result = step1RegexHardSignals("EMEA only remote role.", "remote");
    expect(result?.remoteScope).toBe("region_fenced");
    expect(result?.confidence).toBe(1.0);
  });

  it("resolves 'European Union only' as region_fenced (new pattern)", () => {
    const result = step1RegexHardSignals(
      "European Union only — must be based in EU.",
      "remote",
    );
    expect(result?.remoteScope).toBe("region_fenced");
  });

  // Medium-confidence + negative signal interaction
  it("medium-confidence 'Remote - US' resolves as country_fenced (0.7)", () => {
    const result = step1RegexHardSignals(
      "Remote - US. We are hiring across the United States.",
      "remote",
    );
    expect(result?.remoteScope).toBe("country_fenced");
    expect(result?.confidence).toBe(0.7);
    expect(result?.allowedCountries).toContain("US");
  });

  it("medium-confidence 'must be based in Malaysia' extracts MY from capture", () => {
    // Malaysia is in COUNTRY_CODE_MAP but NOT in the high-confidence list,
    // so it only matches the medium-confidence capture-group pattern.
    const result = step1RegexHardSignals(
      "You must be based in Malaysia for this role.",
      "remote",
    );
    expect(result?.remoteScope).toBe("country_fenced");
    expect(result?.confidence).toBe(0.7);
    expect(result?.allowedCountries).toContain("MY");
  });

  it("negative signal 'relocation required' blocks global medium-confidence", () => {
    // "work from anywhere" is high-confidence global — should still match
    // despite relocation. But a medium-confidence global from UTC range
    // should be blocked by relocation negative signal.
    const result = step1RegexHardSignals(
      "Relocation required to NYC. Working hours UTC-8 to UTC+8.",
      "remote",
    );
    // UTC wide range would suggest global, but "relocation required" negates global
    // → should NOT return global. Should return null (route to LLM).
    expect(result).toBeNull();
  });

  it("'fully remote' (no country qualifier) resolves as global (medium)", () => {
    const result = step1RegexHardSignals(
      "This is a fully remote role. We are looking for a senior engineer.",
      "remote",
    );
    expect(result?.remoteScope).toBe("global");
    expect(result?.confidence).toBe(0.7);
  });

  it("'100% remote' resolves as global (medium)", () => {
    const result = step1RegexHardSignals(
      "100% remote — we are hiring across the globe.",
      "remote",
    );
    expect(result?.remoteScope).toBe("global");
    expect(result?.confidence).toBe(0.7);
  });

  it("'fully remote' with 'relocation required' is blocked by negative signal", () => {
    const result = step1RegexHardSignals(
      "Fully remote role but relocation required to Berlin after 6 months.",
      "remote",
    );
    // "relocation required" negates global → should not return global
    expect(result).toBeNull();
  });

  it("negative signal 'hybrid' with workplaceType=null classifies as onsite", () => {
    const result = step1RegexHardSignals(
      "Hybrid work model — 2 days in office. Remote - US.",
      null,
    );
    // "hybrid" negates all_remote + workplaceType is null → classify as onsite
    // (avoids unnecessary LLM call for the ~26% of jobs that mention hybrid/onsite)
    expect(result?.remoteScope).toBe("onsite");
    expect(result?.confidence).toBe(1.0);
    expect(result?.resolvedBy).toBe("step1_regex");
  });

  it("negative signal 'hybrid' with workplaceType=remote blocks remote scopes", () => {
    const result = step1RegexHardSignals(
      "Hybrid work model — 2 days in office. Remote - US.",
      "remote",
    );
    // ATS says remote but text says hybrid — don't override to onsite,
    // but block all remote scope matches. Route to LLM for disambiguation.
    expect(result).toBeNull();
  });

  it("negative signal 'hybrid' with workplaceType=hybrid classifies as onsite", () => {
    const result = step1RegexHardSignals(
      "Hybrid work model — 2 days in office. Remote - US.",
      "hybrid",
    );
    // ATS says hybrid + text says hybrid → classify as onsite
    expect(result?.remoteScope).toBe("onsite");
    expect(result?.confidence).toBe(1.0);
  });

  it("negative signal 'on-site' with workplaceType=on-site classifies as onsite", () => {
    const result = step1RegexHardSignals(
      "On-site position in our Berlin office. Some remote work possible.",
      "on-site",
    );
    expect(result?.remoteScope).toBe("onsite");
    expect(result?.confidence).toBe(1.0);
  });

  it("high-confidence global still matches even with 'local candidates only'", () => {
    // "local candidates only" negates "global" but not "all_remote"
    // High-confidence global is checked BEFORE negative signals
    // So "work from anywhere" should still match
    const result = step1RegexHardSignals(
      "Work from anywhere. Local candidates only preferred but not required.",
      "remote",
    );
    expect(result?.remoteScope).toBe("global");
    expect(result?.confidence).toBe(1.0);
  });

  it("UTC narrow range resolves as region_fenced (medium)", () => {
    const result = step1RegexHardSignals(
      "Working hours UTC-1 to UTC+3. Flexible schedule.",
      "remote",
    );
    expect(result?.remoteScope).toBe("region_fenced");
    expect(result?.confidence).toBe(0.7);
  });

  it("UTC wide range resolves as global (medium)", () => {
    const result = step1RegexHardSignals(
      "Working hours UTC-8 to UTC+8. Fully flexible.",
      "remote",
    );
    expect(result?.remoteScope).toBe("global");
    expect(result?.confidence).toBe(0.7);
  });

  // Regression: MVP patterns still work
  it("regression: 'worldwide' still resolves as global", () => {
    const result = step1RegexHardSignals(
      "Worldwide remote position.",
      "remote",
    );
    expect(result?.remoteScope).toBe("global");
  });

  it("regression: 'remote-first' still resolves as global", () => {
    const result = step1RegexHardSignals("Remote-first company.", "remote");
    expect(result?.remoteScope).toBe("global");
  });

  it("regression: 'authorized to work in the US' still resolves as country_fenced", () => {
    const result = step1RegexHardSignals(
      "Must be authorized to work in the US.",
      "remote",
    );
    expect(result?.remoteScope).toBe("country_fenced");
  });

  it("regression: inconclusive text returns null (routes to LLM)", () => {
    const result = step1RegexHardSignals(
      "We are looking for a senior engineer with 5+ years of experience in React.",
      "remote",
    );
    expect(result).toBeNull();
  });

  it("regression: on-site signals work when workplaceType is null", () => {
    const result = step1RegexHardSignals(
      "On-site position in our Berlin office.",
      null,
    );
    expect(result?.remoteScope).toBe("onsite");
    expect(result?.confidence).toBe(1.0);
  });
});
